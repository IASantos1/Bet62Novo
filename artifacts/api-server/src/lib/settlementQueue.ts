import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { logger } from "./logger.js";

type MatchSettlementJob = {
  matchId: string;
};

const QUEUE_NAME = "bet_settlement";
const JOB_NAME = "match_settlement";

let _queue: Queue | null = null;
let _worker: Worker | null = null;
let _redis: any | null = null;

function getRedisUrl(): string | null {
  const url = process.env["REDIS_URL"];
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

function getQueue(): Queue | null {
  if (_queue) return _queue;
  const url = getRedisUrl();
  if (!url) {
    logger.warn("REDIS_URL not configured. Settlement queue disabled.");
    return null;
  }

  _redis = new (Redis as any)(url, { maxRetriesPerRequest: null });
  _queue = new Queue(QUEUE_NAME, {
    connection: _redis,
    defaultJobOptions: {
      removeOnComplete: { age: 3600, count: 2000 },
      removeOnFail: { age: 172800, count: 2000 },
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  });
  return _queue;
}

export function buildMatchSettlementJobId(args: {
  matchId: string;
  home?: number;
  away?: number;
  htHome?: number | null | undefined;
  htAway?: number | null | undefined;
}): string {
  const h = typeof args.home === "number" ? args.home : "x";
  const a = typeof args.away === "number" ? args.away : "x";
  const hh = typeof args.htHome === "number" ? args.htHome : "x";
  const ha = typeof args.htAway === "number" ? args.htAway : "x";

  return [
    "match",
    args.matchId,
    "score",
    `${h}-${a}`,
    "ht",
    `${hh}-${ha}`,
  ].join("_");
}

export const generateMatchSettlementJobId = buildMatchSettlementJobId;

export async function enqueueMatchSettlement(args: {
  matchId: string;
  jobId: string;
}): Promise<void> {
  const q = getQueue();
  if (!q) return;

  try {
    await q.add(
      JOB_NAME,
      { matchId: args.matchId } satisfies MatchSettlementJob,
      {
        jobId: args.jobId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (err) {
    logger.error({ err, matchId: args.matchId }, "Failed to enqueue match settlement");
  }
}

export function startSettlementQueueWorker(handler: (args: { matchId: string; jobId: string }) => Promise<void>): void {
  if (_worker) return;
  const url = getRedisUrl();
  if (!url) {
    logger.warn("REDIS_URL not configured. Settlement queue worker not started.");
    return;
  }

  const redis = new (Redis as any)(url, { maxRetriesPerRequest: null });
  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as MatchSettlementJob;
      logger.info(
        { jobId: job.id, matchId: data.matchId },
        "Starting settlement queue job",
      );

      await handler({ matchId: data.matchId, jobId: String(job.id ?? "") });

      logger.info(
        { jobId: job.id, matchId: data.matchId },
        "Settlement queue job completed",
      );

      return { ok: true, matchId: data.matchId };
    },
    {
      connection: redis,
      concurrency: 8,
      stalledInterval: 30000,
      maxStalledCount: 2,
    },
  );

  _worker.on("failed", (job, err) => {
    if (!job) return;
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 3;
    
    logger.error(
      {
        err,
        jobId: job.id,
        matchId: job.data?.matchId,
        attemptsMade,
        maxAttempts,
        error: err.message,
      },
      attemptsMade >= maxAttempts 
        ? "Settlement queue job failed permanently" 
        : "Settlement queue job failed, will retry",
    );
  });

  _worker.on("completed", (job) => {
    logger.info(
      {
        jobId: job.id,
        matchId: job.data?.matchId,
      },
      "Settlement queue job completed event",
    );
  });

  logger.info({ queue: QUEUE_NAME, concurrency: 8 }, "Settlement queue worker started");
}
