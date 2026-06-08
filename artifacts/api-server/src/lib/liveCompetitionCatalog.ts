import {
  competitionAliasesTable,
  competitionConfigsTable,
  competitionsTable,
  db,
  eventRuntimeStatesTable,
  providerCompetitionsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

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
const CATALOG_SNAPSHOT_TTL_MS = 15_000;
let lastCatalogSyncAt = 0;
let catalogSyncInFlight: Promise<void> | null = null;
let catalogSnapshotLoadedAt = 0;
let catalogSnapshotInFlight: Promise<CompetitionCatalogSnapshot> | null = null;
let catalogSnapshotCache: CompetitionCatalogSnapshot | null = null;

type CompetitionCatalogRule = {
  competitionId: number;
  isActive: boolean;
  liveEnabled: boolean;
  prematchEnabled: boolean;
  homeEnabled: boolean;
  mobileEnabled: boolean;
  featured: boolean;
  priority: number;
  displayOrder: number;
  cashoutEnabled: boolean;
  minFeedQualityScore: number;
  allowUnstableFeedVisibility: boolean;
  tradingMode: string;
  stakeLimitMultiplier: number;
};

type EventRuntimeRule = {
  eventId: string;
  state: string;
  visibilityStatus: string;
  feedHealth: string;
  tradingStatus: string;
  suspensionReason: string | null;
};

type CompetitionCatalogSnapshot = {
  competitionRulesByKey: Map<string, CompetitionCatalogRule>;
  eventRuntimeByEventId: Map<string, EventRuntimeRule>;
};

export type CompetitionCatalogDecision = {
  matched: boolean;
  competitionId: number | null;
  mode: "live" | "prematch";
  visible: boolean;
  featured: boolean;
  priority: number | null;
  reason: string | null;
  feedHealth: string | null;
  state: string | null;
};

type MatchCatalogInput = {
  eventId: string;
  sport: string;
  league: string;
  country?: string | null;
};

export function normalizeCatalogValue(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function competitionRuleKey(sport: string, country: string | null | undefined, league: string): string {
  return `${normalizeCatalogValue(sport)}|${normalizeCatalogValue(country || "unknown")}|${normalizeCatalogValue(league)}`;
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

async function loadCompetitionCatalogSnapshot(): Promise<CompetitionCatalogSnapshot> {
  const competitionRows = await db
    .select({
      competitionId: competitionsTable.id,
      sport: competitionsTable.sport,
      country: competitionsTable.country,
      name: competitionsTable.name,
      normalizedCountry: competitionsTable.normalizedCountry,
      normalizedName: competitionsTable.normalizedName,
      isActive: competitionsTable.isActive,
      liveEnabled: competitionConfigsTable.liveEnabled,
      prematchEnabled: competitionConfigsTable.prematchEnabled,
      homeEnabled: competitionConfigsTable.homeEnabled,
      mobileEnabled: competitionConfigsTable.mobileEnabled,
      featured: competitionConfigsTable.featured,
      priority: competitionConfigsTable.priority,
      displayOrder: competitionConfigsTable.displayOrder,
      cashoutEnabled: competitionConfigsTable.cashoutEnabled,
      minFeedQualityScore: competitionConfigsTable.minFeedQualityScore,
      allowUnstableFeedVisibility: competitionConfigsTable.allowUnstableFeedVisibility,
      tradingMode: competitionConfigsTable.tradingMode,
      stakeLimitMultiplier: competitionConfigsTable.stakeLimitMultiplier,
    })
    .from(competitionsTable)
    .leftJoin(competitionConfigsTable, eq(competitionConfigsTable.competitionId, competitionsTable.id));

  const aliasRows = await db
    .select({
      competitionId: competitionAliasesTable.competitionId,
      normalizedAlias: competitionAliasesTable.normalizedAlias,
    })
    .from(competitionAliasesTable);

  const runtimeRows = await db
    .select({
      eventId: eventRuntimeStatesTable.eventId,
      state: eventRuntimeStatesTable.state,
      visibilityStatus: eventRuntimeStatesTable.visibilityStatus,
      feedHealth: eventRuntimeStatesTable.feedHealth,
      tradingStatus: eventRuntimeStatesTable.tradingStatus,
      suspensionReason: eventRuntimeStatesTable.suspensionReason,
    })
    .from(eventRuntimeStatesTable)
    .orderBy(desc(eventRuntimeStatesTable.updatedAt))
    .limit(5000);

  const ruleByCompetitionId = new Map<number, CompetitionCatalogRule>();
  const competitionRulesByKey = new Map<string, CompetitionCatalogRule>();
  for (const row of competitionRows) {
    const rule: CompetitionCatalogRule = {
      competitionId: row.competitionId,
      isActive: row.isActive ?? true,
      liveEnabled: row.liveEnabled ?? true,
      prematchEnabled: row.prematchEnabled ?? true,
      homeEnabled: row.homeEnabled ?? false,
      mobileEnabled: row.mobileEnabled ?? true,
      featured: row.featured ?? false,
      priority: row.priority ?? 100,
      displayOrder: row.displayOrder ?? 100,
      cashoutEnabled: row.cashoutEnabled ?? true,
      minFeedQualityScore: row.minFeedQualityScore ?? 40,
      allowUnstableFeedVisibility: row.allowUnstableFeedVisibility ?? true,
      tradingMode: row.tradingMode ?? "automatic",
      stakeLimitMultiplier: row.stakeLimitMultiplier ?? 100,
    };
    ruleByCompetitionId.set(row.competitionId, rule);
    competitionRulesByKey.set(
      competitionRuleKey(row.sport, row.normalizedCountry || row.country, row.normalizedName || row.name),
      rule,
    );
  }

  for (const alias of aliasRows) {
    const rule = ruleByCompetitionId.get(alias.competitionId);
    if (!rule) continue;
    const source = competitionRows.find((row) => row.competitionId === alias.competitionId);
    if (!source) continue;
    competitionRulesByKey.set(
      competitionRuleKey(source.sport, source.normalizedCountry || source.country, alias.normalizedAlias),
      rule,
    );
  }

  const eventRuntimeByEventId = new Map<string, EventRuntimeRule>();
  for (const row of runtimeRows) {
    if (eventRuntimeByEventId.has(row.eventId)) continue;
    eventRuntimeByEventId.set(row.eventId, {
      eventId: row.eventId,
      state: row.state,
      visibilityStatus: row.visibilityStatus,
      feedHealth: row.feedHealth,
      tradingStatus: row.tradingStatus,
      suspensionReason: row.suspensionReason ?? null,
    });
  }

  return { competitionRulesByKey, eventRuntimeByEventId };
}

async function getCompetitionCatalogSnapshot(): Promise<CompetitionCatalogSnapshot> {
  const now = Date.now();
  if (catalogSnapshotCache && now - catalogSnapshotLoadedAt < CATALOG_SNAPSHOT_TTL_MS) {
    return catalogSnapshotCache;
  }
  if (catalogSnapshotInFlight) return catalogSnapshotInFlight;
  catalogSnapshotInFlight = loadCompetitionCatalogSnapshot()
    .then((snapshot) => {
      catalogSnapshotCache = snapshot;
      catalogSnapshotLoadedAt = Date.now();
      return snapshot;
    })
    .finally(() => {
      catalogSnapshotInFlight = null;
    });
  return catalogSnapshotInFlight;
}

export async function getCompetitionCatalogDecisions(
  matches: MatchCatalogInput[],
  mode: "live" | "prematch",
): Promise<Map<string, CompetitionCatalogDecision>> {
  const snapshot = await getCompetitionCatalogSnapshot();
  const decisions = new Map<string, CompetitionCatalogDecision>();
  for (const match of matches) {
    const key = competitionRuleKey(match.sport, match.country, match.league);
    const rule = snapshot.competitionRulesByKey.get(key);
    const runtime = snapshot.eventRuntimeByEventId.get(String(match.eventId));
    let visible = true;
    let reason: string | null = null;
    if (rule) {
      visible = rule.isActive && (mode === "live" ? rule.liveEnabled : rule.prematchEnabled);
      if (!rule.isActive) reason = "competition_inactive";
      else if (!visible) reason = mode === "live" ? "competition_live_disabled" : "competition_prematch_disabled";
    }
    if (visible && runtime?.visibilityStatus === "HIDDEN") {
      visible = false;
      reason = "hidden_by_admin";
    }
    if (visible && runtime?.state === "HIDDEN_BY_ADMIN") {
      visible = false;
      reason = "hidden_by_admin";
    }
    if (
      visible &&
      runtime?.state === "UNSTABLE_FEED" &&
      rule &&
      !rule.allowUnstableFeedVisibility
    ) {
      visible = false;
      reason = "unstable_feed_hidden";
    }
    decisions.set(String(match.eventId), {
      matched: !!rule,
      competitionId: rule?.competitionId ?? null,
      mode,
      visible,
      featured: rule?.featured ?? false,
      priority: rule?.priority ?? null,
      reason,
      feedHealth: runtime?.feedHealth ?? null,
      state: runtime?.state ?? null,
    });
  }
  return decisions;
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
