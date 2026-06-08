import {
  competitionAliasesTable,
  competitionConfigsTable,
  competitionsTable,
  db,
  eventRuntimeStatesTable,
  providerCompetitionsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

type SeenCompetitionInput = {
  sport: string;
  name: string;
  country?: string | null;
  provider?: string;
  providerCompetitionId?: string | null;
  providerCompetitionKey?: string | null;
  priorityHint?: number | null;
};

type SeenLiveEventInput = SeenCompetitionInput & {
  eventId: string;
  providerEventId?: string | null;
  status?: string | null;
  suspensionReason?: string | null;
};

const CATALOG_SYNC_INTERVAL_MS = 30_000;
let lastCatalogSyncAt = 0;
let catalogSyncInFlight: Promise<void> | null = null;

function normalizeCatalogValue(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildProviderCompetitionKey(input: SeenCompetitionInput): string {
  return input.providerCompetitionKey?.trim()
    || input.providerCompetitionId?.trim()
    || `${normalizeCatalogValue(input.country || "unknown")}:${normalizeCatalogValue(input.name)}`;
}

function inferFeedHealth(status: string | null | undefined): string {
  const s = normalizeCatalogValue(status);
  if (!s) return "healthy";
  if (s.includes("instavel") || s.includes("unstable")) return "unstable";
  if (s.includes("ended") || s === "ft" || s === "finished") return "ended";
  if (s.includes("breve") || s.includes("scheduled")) return "scheduled";
  return "healthy";
}

function inferEventState(input: SeenLiveEventInput): string {
  const status = normalizeCatalogValue(input.status);
  if (status.includes("ended") || status === "ft" || status === "finished") return "ENDED";
  if (normalizeCatalogValue(input.suspensionReason)) return "SUSPENDED";
  if (status.includes("instavel") || status.includes("unstable")) return "UNSTABLE_FEED";
  return "ACTIVE";
}

async function ensureCompetition(input: SeenCompetitionInput): Promise<number | null> {
  const sport = normalizeCatalogValue(input.sport);
  const name = String(input.name ?? "").trim();
  if (!sport || !name) return null;

  const country = String(input.country ?? "unknown").trim() || "unknown";
  const normalizedName = normalizeCatalogValue(name);
  const normalizedCountry = normalizeCatalogValue(country) || "unknown";
  const provider = String(input.provider ?? "sportsapi").trim() || "sportsapi";
  const providerCompetitionKey = buildProviderCompetitionKey(input);

  await db.insert(competitionsTable).values({
    sport,
    name,
    country,
    normalizedName,
    normalizedCountry,
    tier: "standard",
    isActive: true,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [
      competitionsTable.sport,
      competitionsTable.normalizedCountry,
      competitionsTable.normalizedName,
    ],
    set: {
      name,
      country,
      updatedAt: new Date(),
    },
  });

  const [competition] = await db
    .select({ id: competitionsTable.id })
    .from(competitionsTable)
    .where(and(
      eq(competitionsTable.sport, sport),
      eq(competitionsTable.normalizedCountry, normalizedCountry),
      eq(competitionsTable.normalizedName, normalizedName),
    ))
    .limit(1);
  if (!competition) return null;

  await db.insert(competitionConfigsTable).values({
    competitionId: competition.id,
    prematchEnabled: true,
    liveEnabled: true,
    homeEnabled: false,
    mobileEnabled: true,
    featured: false,
    priority: input.priorityHint ?? 100,
    displayOrder: input.priorityHint ?? 100,
    maxMarkets: 50,
    cashoutEnabled: true,
    autoSettlementEnabled: true,
    trackingEnabled: true,
    minFeedQualityScore: 40,
    allowUnstableFeedVisibility: true,
    tradingMode: "automatic",
    stakeLimitMultiplier: 100,
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(competitionAliasesTable).values({
    competitionId: competition.id,
    provider,
    alias: name,
    normalizedAlias: normalizedName,
  }).onConflictDoNothing();

  await db.insert(providerCompetitionsTable).values({
    provider,
    providerSport: sport,
    providerCompetitionKey,
    providerCompetitionId: input.providerCompetitionId?.trim() || null,
    providerName: name,
    providerCountry: country,
    competitionId: competition.id,
    mappingConfidence: "high",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [
      providerCompetitionsTable.provider,
      providerCompetitionsTable.providerSport,
      providerCompetitionsTable.providerCompetitionKey,
    ],
    set: {
      providerCompetitionId: input.providerCompetitionId?.trim() || null,
      providerName: name,
      providerCountry: country,
      competitionId: competition.id,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return competition.id;
}

async function ensureRuntimeState(input: SeenLiveEventInput, competitionId: number | null): Promise<void> {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return;

  await db.insert(eventRuntimeStatesTable).values({
    eventId,
    sport: normalizeCatalogValue(input.sport),
    competitionId,
    provider: String(input.provider ?? "sportsapi").trim() || "sportsapi",
    providerEventId: input.providerEventId?.trim() || null,
    state: inferEventState(input),
    visibilityStatus: "VISIBLE",
    feedHealth: inferFeedHealth(input.status),
    tradingStatus: "automatic",
    suspensionReason: input.suspensionReason?.trim() || null,
    lastProviderUpdateAt: new Date(),
    lastInternalUpdateAt: new Date(),
    lastMarketRecalcAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [eventRuntimeStatesTable.eventId],
    set: {
      sport: normalizeCatalogValue(input.sport),
      competitionId,
      provider: String(input.provider ?? "sportsapi").trim() || "sportsapi",
      providerEventId: input.providerEventId?.trim() || null,
      state: inferEventState(input),
      visibilityStatus: "VISIBLE",
      feedHealth: inferFeedHealth(input.status),
      tradingStatus: "automatic",
      suspensionReason: input.suspensionReason?.trim() || null,
      lastProviderUpdateAt: new Date(),
      lastInternalUpdateAt: new Date(),
      lastMarketRecalcAt: new Date(),
      version: sql`${eventRuntimeStatesTable.version} + 1`,
      updatedAt: new Date(),
    },
  });
}

async function syncCatalogInternal(events: SeenLiveEventInput[]): Promise<void> {
  const competitionCache = new Map<string, number | null>();
  for (const event of events) {
    const key = `${normalizeCatalogValue(event.sport)}|${normalizeCatalogValue(event.country)}|${normalizeCatalogValue(event.name)}`;
    let competitionId = competitionCache.get(key);
    if (competitionId === undefined) {
      competitionId = await ensureCompetition(event);
      competitionCache.set(key, competitionId);
    }
    await ensureRuntimeState(event, competitionId);
  }
}

export function syncLiveCompetitionCatalog(events: SeenLiveEventInput[]): void {
  const now = Date.now();
  if (events.length === 0) return;
  if (catalogSyncInFlight) return;
  if (now - lastCatalogSyncAt < CATALOG_SYNC_INTERVAL_MS) return;
  lastCatalogSyncAt = now;
  catalogSyncInFlight = syncCatalogInternal(events)
    .catch(() => {})
    .finally(() => {
      catalogSyncInFlight = null;
    });
}
