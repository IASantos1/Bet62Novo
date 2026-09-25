import { db } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { bannerTemplatesTable } from "../../../../../lib/db/src/schema/bannerTemplates.js";
import { featuredMatchBannersTable } from "../../../../../lib/db/src/schema/featuredMatchBanners.js";
import { bannerAutomationSettingsTable } from "../../../../../lib/db/src/schema/bannerAutomationSettings.js";
import { getFixturesByDate, getLiveFixtures, isFixtureLive, type ApiFootballFixture } from "./client.js";
import { logger } from "../../lib/logger.js";

// Matches the constant of the same name in routes/admin.ts's manual
// "featured-banners" POST — a banner stays public for 3h after kickoff by
// default. Not imported from there (not exported, and admin.ts's route
// file isn't a module other services should depend on); kept as its own
// copy here on purpose.
const DEFAULT_FEATURED_BANNER_DURATION_MS = 3 * 60 * 60 * 1000;

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => Number.isInteger(v));
}

// Reads banner_automation_settings and, when mode='auto', upserts
// featured_match_banners rows (source='auto') from live api-football.com
// fixtures — see lib/apiFootballCron.ts for the scheduler that calls this.
// Never touches rows with source='manual'. Display metadata only (team
// names/logos, league, kickoff time, live status) — no odds/markets.
export async function syncFeaturedBannersFromApiFootball(): Promise<void> {
  const [settings] = await db
    .select()
    .from(bannerAutomationSettingsTable)
    .where(eq(bannerAutomationSettingsTable.id, 1))
    .limit(1);

  if (!settings || settings.mode !== "auto") {
    logger.debug("[apiFootball] sync skipped — automation mode is not 'auto'");
    return;
  }

  const templates = await db
    .select()
    .from(bannerTemplatesTable)
    .where(and(eq(bannerTemplatesTable.isActive, true), isNotNull(bannerTemplatesTable.apiFootballLeagueId)));

  const allowedIds = asNumberArray(settings.allowedCompetitionIds);
  const excludedIds = asNumberArray(settings.excludedCompetitionIds);

  let eligibleTemplates = templates;
  if (allowedIds.length > 0) {
    eligibleTemplates = eligibleTemplates.filter((t) => allowedIds.includes(t.id));
  }
  if (excludedIds.length > 0) {
    eligibleTemplates = eligibleTemplates.filter((t) => !excludedIds.includes(t.id));
  }

  const leagueIdToTemplate = new Map<number, (typeof eligibleTemplates)[number]>();
  for (const t of eligibleTemplates) {
    if (t.apiFootballLeagueId != null) leagueIdToTemplate.set(t.apiFootballLeagueId, t);
  }

  if (leagueIdToTemplate.size === 0) {
    logger.info("[apiFootball] sync skipped — no banner template has an allowed apiFootballLeagueId");
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let dateFixtures: ApiFootballFixture[] = [];
  try {
    dateFixtures = await getFixturesByDate(todayStr);
  } catch (err) {
    logger.error({ err }, "[apiFootball] getFixturesByDate failed — sync aborted this cycle");
    return;
  }

  let liveFixtures: ApiFootballFixture[] = [];
  if (settings.mostrarAoVivo) {
    try {
      liveFixtures = await getLiveFixtures();
    } catch (err) {
      logger.error({ err }, "[apiFootball] getLiveFixtures failed — continuing with date fixtures only");
    }
  }

  // Dedupe by fixture id — the live-fixtures response, when present, has the
  // freshest status/elapsed for a match also present in the date response.
  const byFixtureId = new Map<number, ApiFootballFixture>();
  for (const f of dateFixtures) byFixtureId.set(f.fixture.id, f);
  for (const f of liveFixtures) byFixtureId.set(f.fixture.id, f);

  const now = Date.now();
  const antecedenciaMs = settings.antecedenciaMinutes * 60 * 1000;

  const candidates = Array.from(byFixtureId.values()).filter((f) => {
    if (!leagueIdToTemplate.has(f.league.id)) return false;
    if (isFixtureLive(f)) return settings.mostrarAoVivo;
    const kickoffMs = new Date(f.fixture.date).getTime();
    // "Próximos jogos"/"Personalizado" (simplified to behave like upcoming
    // for now — see plan's "Fora de escopo"): only games kicking off within
    // the configured lead time, not already finished.
    return kickoffMs >= now && kickoffMs - now <= antecedenciaMs;
  });

  candidates.sort((a, b) => {
    const aLive = isFixtureLive(a);
    const bLive = isFixtureLive(b);
    if (settings.mostrarAoVivo && aLive !== bLive) return aLive ? -1 : 1;
    return new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime();
  });

  const selected = candidates.slice(0, Math.max(0, settings.quantidade));
  const selectedFixtureIds = new Set(selected.map((f) => String(f.fixture.id)));

  for (const fixture of selected) {
    const template = leagueIdToTemplate.get(fixture.league.id);
    if (!template) continue;
    const kickoffAt = new Date(fixture.fixture.date);
    const endsAt = new Date(kickoffAt.getTime() + DEFAULT_FEATURED_BANNER_DURATION_MS);
    const externalFixtureId = String(fixture.fixture.id);
    const values = {
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      competition: template.competitionName,
      bannerTemplateId: template.id,
      homeTeamLogoUrl: fixture.teams.home.logo,
      awayTeamLogoUrl: fixture.teams.away.logo,
      externalFixtureId,
      source: "auto" as const,
      kickoffAt,
      endsAt,
      isActive: true,
    };

    try {
      const [existing] = await db
        .select({ id: featuredMatchBannersTable.id })
        .from(featuredMatchBannersTable)
        .where(eq(featuredMatchBannersTable.externalFixtureId, externalFixtureId))
        .limit(1);

      if (existing) {
        await db
          .update(featuredMatchBannersTable)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(featuredMatchBannersTable.id, existing.id));
      } else {
        await db.insert(featuredMatchBannersTable).values(values);
      }
    } catch (err) {
      logger.error({ err, externalFixtureId }, "[apiFootball] failed to upsert featured banner");
    }
  }

  // "Tempo para substituir: automático" — an auto row not selected this
  // cycle and whose fixture has finished (or dropped out of both responses
  // entirely) is retired, unless the admin asked to keep finished games up.
  if (!settings.manterAposTermino) {
    const autoRows = await db
      .select()
      .from(featuredMatchBannersTable)
      .where(and(eq(featuredMatchBannersTable.source, "auto"), eq(featuredMatchBannersTable.isActive, true)));

    for (const row of autoRows) {
      if (!row.externalFixtureId || selectedFixtureIds.has(row.externalFixtureId)) continue;
      const tracked = byFixtureId.get(Number(row.externalFixtureId));
      const finished = !tracked || (!isFixtureLive(tracked) && new Date(tracked.fixture.date).getTime() < now);
      if (finished) {
        await db
          .update(featuredMatchBannersTable)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(featuredMatchBannersTable.id, row.id));
      }
    }
  }

  logger.info(
    { candidateCount: candidates.length, selectedCount: selected.length },
    "[apiFootball] banner sync cycle completed",
  );
}
