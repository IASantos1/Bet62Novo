import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

type MatchSettlementJob = {
  matchId: string;
};

const QUEUE_NAME = "bet_settlement";

let _queue: Queue | null = null;
let _worker: Worker | null = null;
let _redis: IORedis | null = null;

function getRedisUrl(): string | null {
  const url = process.env["REDIS_URL"];
  return typeof url === "string" && url.trim() !== "" ? url : null;
}

function getQueue(): Queue | null {
  if (_queue) return _queue;
  const url = getRedisUrl();
  if (!url) return null;

  _redis = new IORedis(url, { maxRetriesPerRequest: null });
  _queue = new Queue(QUEUE_NAME, { connection: _redis });
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
  return `match:${args.matchId}:score:${h}-${a}:ht:${hh}-${ha}`;
}

export async function enqueueMatchSettlement(args: {
  matchId: string;
  jobId: string;
}): Promise<void> {
  const q = getQueue();
  if (!q) return;

  try {
    await q.add(
      "match_settlement",
      { matchId: args.matchId } satisfies MatchSettlementJob,
      {
        jobId: args.jobId,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600, count: 1000 },
      },
    );
  } catch (err) {
    logger.error({ err, matchId: args.matchId }, "Failed to enqueue match settlement");
  }
}

export function startSettlementQueueWorker(handler: (matchId: string) => Promise<void>): void {
  if (_worker) return;
  const url = getRedisUrl();
  if (!url) return;

  const redis = new IORedis(url, { maxRetriesPerRequest: null });
  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as MatchSettlementJob;
      await handler(data.matchId);
    },
    { connection: redis, concurrency: 8 },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Settlement queue job failed");
  });

  logger.info({ queue: QUEUE_NAME }, "Settlement queue worker started");
}
