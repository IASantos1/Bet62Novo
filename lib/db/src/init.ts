import { pool } from "./index.js";

/**
 * Initialises the database schema on first deployment.
 *
 * All statements use CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 * so the function is fully idempotent — safe to call on every startup
 * without side-effects when the tables/columns already exist.
 *
 * This file is the single source of truth for the LIVE schema (both in
 * development and production — see src/api/index.ts, which calls initDb()
 * on every boot). The Drizzle table definitions under ./schema/*.ts exist
 * purely for type-safe query building; they are not applied to the database
 * directly. Do not add `drizzle-kit push`/`migrate` to any deploy or git
 * hook — a second schema-application path can drift from what's actually
 * live (this file only ever adds columns/tables, never renames or drops),
 * and `drizzle-kit push` can also prompt interactively for ambiguous
 * changes, which hangs indefinitely in a non-interactive hook.
 *
 * When adding a column: add it here first (as an idempotent ALTER TABLE ...
 * ADD COLUMN IF NOT EXISTS), then mirror it in the matching ./schema/*.ts
 * file so queries stay type-safe.
 */
export async function initDb(): Promise<void> {
  if (!pool) {
    console.warn("[db/init] DATABASE_URL is not set — skipping schema initialisation.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  SERIAL PRIMARY KEY,
        name                TEXT NOT NULL,
        email               TEXT NOT NULL UNIQUE,
        password_hash       TEXT NOT NULL,
        balance             DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        withdrawal_hold_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        freebet_balance     DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        nif                 TEXT,
        withdrawal_iban     TEXT,
        withdrawal_name     TEXT,
        self_excluded_until TIMESTAMPTZ,
        kyc_status          TEXT DEFAULT 'not_submitted',
        kyc_document_type   TEXT,
        kyc_document_number TEXT,
        kyc_submitted_at    TIMESTAMPTZ,
        first_deposit_granted TEXT DEFAULT 'none',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bets (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id),
        match_id      TEXT NOT NULL,
        match_title   TEXT NOT NULL,
        selections    JSONB NOT NULL,
        stake         DECIMAL(10, 2) NOT NULL,
        potential_win DECIMAL(10, 2) NOT NULL,
        total_odds    DECIMAL(10, 2) NOT NULL,
        is_freebet    TEXT NOT NULL DEFAULT 'false',
        status        TEXT NOT NULL DEFAULT 'pending',
        cashout_value DECIMAL(10, 2),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id          SERIAL PRIMARY KEY,
        order_id    TEXT NOT NULL UNIQUE,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        amount      DECIMAL(10, 2) NOT NULL,
        method      TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        entity      TEXT,
        reference   TEXT,
        request_id  TEXT,
        payment_url TEXT,
        expires_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        amount      DECIMAL(10, 2) NOT NULL,
        iban        TEXT NOT NULL,
        holder_name TEXT NOT NULL,
        nif         TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending_review',
        notes       TEXT,
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        decision_reason TEXT,
        risk_flags  JSONB,
        provider_reference TEXT,
        processed_at TIMESTAMPTZ,
        reversed_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id          SERIAL PRIMARY KEY,
        action      TEXT NOT NULL,
        admin_user  TEXT NOT NULL,
        target_type TEXT,
        target_id   TEXT,
        details     JSONB,
        ip          TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS platform_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS suspended_matches (
        id          SERIAL PRIMARY KEY,
        match_id    TEXT NOT NULL UNIQUE,
        match_title TEXT NOT NULL,
        sport       TEXT NOT NULL DEFAULT 'football',
        reason      TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settlement_logs (
        id         SERIAL PRIMARY KEY,
        bet_id     INTEGER NOT NULL REFERENCES bets(id),
        user_id    INTEGER NOT NULL,
        settlement_key TEXT,
        old_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        payout     DECIMAL(12, 2),
        message    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS settlement_logs_settlement_key_idx
        ON settlement_logs (settlement_key);

      CREATE TABLE IF NOT EXISTS settlement_idempotency (
        id              SERIAL PRIMARY KEY,
        bet_id          INTEGER NOT NULL REFERENCES bets(id),
        trigger         TEXT NOT NULL,
        old_status      TEXT,
        new_status      TEXT,
        match_id        TEXT,
        job_id          TEXT NOT NULL,
        engine_version  TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS settlement_idempotency_jobid_idx
        ON settlement_idempotency (job_id);

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        amount          DECIMAL(12, 2) NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'EUR',
        kind            TEXT NOT NULL,
        ref_type        TEXT,
        ref_id          TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        metadata        JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS match_results (
        match_id      TEXT PRIMARY KEY,
        sport         TEXT NOT NULL,
        home          INTEGER,
        away          INTEGER,
        ht_home       INTEGER,
        ht_away       INTEGER,
        home_team     TEXT,
        away_team     TEXT,
        corners_total INTEGER,
        cards_total   INTEGER,
        first_goal    TEXT,
        extras        JSONB,
        finished_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cashout_states (
        bet_id            INTEGER PRIMARY KEY REFERENCES bets(id) ON DELETE CASCADE,
        unfavorable_since TIMESTAMPTZ NOT NULL,
        reason            TEXT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS kyc_documents (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind         TEXT NOT NULL,
        file_name    TEXT NOT NULL,
        mime_type    TEXT NOT NULL,
        file_size    INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        file_data    BYTEA,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at  TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS competitions (
        id                 SERIAL PRIMARY KEY,
        sport              TEXT NOT NULL,
        name               TEXT NOT NULL,
        country            TEXT NOT NULL DEFAULT 'unknown',
        normalized_name    TEXT NOT NULL,
        normalized_country TEXT NOT NULL DEFAULT 'unknown',
        tier               TEXT NOT NULL DEFAULT 'standard',
        is_active          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS competitions_canonical_idx
        ON competitions (sport, normalized_country, normalized_name);

      CREATE TABLE IF NOT EXISTS provider_competitions (
        id                       SERIAL PRIMARY KEY,
        provider                 TEXT NOT NULL,
        provider_sport           TEXT NOT NULL,
        provider_competition_key TEXT NOT NULL,
        provider_competition_id  TEXT,
        provider_name            TEXT NOT NULL,
        provider_country         TEXT NOT NULL DEFAULT 'unknown',
        competition_id           INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        mapping_confidence       TEXT NOT NULL DEFAULT 'high',
        first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS provider_competitions_provider_key_idx
        ON provider_competitions (provider, provider_sport, provider_competition_key);

      CREATE TABLE IF NOT EXISTS canonical_matches (
        id                    SERIAL PRIMARY KEY,
        sport                 TEXT NOT NULL,
        home_name             TEXT NOT NULL,
        away_name             TEXT NOT NULL,
        normalized_home_name  TEXT NOT NULL,
        normalized_away_name  TEXT NOT NULL,
        competition_id        INTEGER,
        league_name           TEXT,
        kickoff_utc           TIMESTAMPTZ,
        status                TEXT NOT NULL DEFAULT 'scheduled',
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS match_provider_mapping (
        id                SERIAL PRIMARY KEY,
        provider          TEXT NOT NULL,
        provider_sport    TEXT NOT NULL,
        provider_match_id TEXT NOT NULL,
        match_id          INTEGER NOT NULL REFERENCES canonical_matches(id) ON DELETE CASCADE,
        home_name_raw     TEXT NOT NULL,
        away_name_raw     TEXT NOT NULL,
        confidence        INTEGER NOT NULL DEFAULT 100,
        first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS match_provider_mapping_provider_key_idx
        ON match_provider_mapping (provider, provider_sport, provider_match_id);

      CREATE TABLE IF NOT EXISTS competition_configs (
        id                            SERIAL PRIMARY KEY,
        competition_id                INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        prematch_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
        live_enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
        home_enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
        mobile_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
        featured                      BOOLEAN NOT NULL DEFAULT FALSE,
        priority                      INTEGER NOT NULL DEFAULT 100,
        display_order                 INTEGER NOT NULL DEFAULT 100,
        max_markets                   INTEGER NOT NULL DEFAULT 50,
        cashout_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
        auto_settlement_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
        tracking_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
        min_feed_quality_score        INTEGER NOT NULL DEFAULT 40,
        allow_unstable_feed_visibility BOOLEAN NOT NULL DEFAULT TRUE,
        trading_mode                  TEXT NOT NULL DEFAULT 'automatic',
        stake_limit_multiplier        INTEGER NOT NULL DEFAULT 100,
        created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS competition_configs_competition_idx
        ON competition_configs (competition_id);

      CREATE TABLE IF NOT EXISTS competition_aliases (
        id               SERIAL PRIMARY KEY,
        competition_id   INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        provider         TEXT NOT NULL DEFAULT 'internal',
        alias            TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS competition_aliases_provider_alias_idx
        ON competition_aliases (provider, normalized_alias);

      CREATE TABLE IF NOT EXISTS event_runtime_states (
        id                      SERIAL PRIMARY KEY,
        event_id                TEXT NOT NULL,
        sport                   TEXT NOT NULL,
        competition_id          INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
        provider                TEXT NOT NULL DEFAULT 'internal',
        provider_event_id       TEXT,
        state                   TEXT NOT NULL DEFAULT 'ACTIVE',
        visibility_status       TEXT NOT NULL DEFAULT 'VISIBLE',
        feed_health             TEXT NOT NULL DEFAULT 'healthy',
        trading_status          TEXT NOT NULL DEFAULT 'automatic',
        suspension_reason       TEXT,
        last_provider_update_at TIMESTAMPTZ,
        last_internal_update_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_market_recalc_at   TIMESTAMPTZ,
        version                 INTEGER NOT NULL DEFAULT 1,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS event_runtime_states_event_idx
        ON event_runtime_states (event_id);

      CREATE TABLE IF NOT EXISTS event_admin_overrides (
        id                         SERIAL PRIMARY KEY,
        event_id                   TEXT NOT NULL,
        competition_id             INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
        hidden_by_admin            BOOLEAN NOT NULL DEFAULT FALSE,
        force_suspend              BOOLEAN NOT NULL DEFAULT FALSE,
        force_cashout_disable      BOOLEAN NOT NULL DEFAULT FALSE,
        override_priority          INTEGER,
        override_state             TEXT,
        override_visibility_status TEXT,
        override_trading_status    TEXT,
        override_note              TEXT,
        updated_by                 TEXT,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS event_admin_overrides_event_idx
        ON event_admin_overrides (event_id);

      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS home_team     TEXT;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS away_team     TEXT;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS corners_total INTEGER;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS cards_total   INTEGER;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS first_goal    TEXT;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS extras        JSONB;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS finished_at   TIMESTAMPTZ;
      ALTER TABLE match_results ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ;

      ALTER TABLE bets ADD COLUMN IF NOT EXISTS kickoff_time  TIMESTAMPTZ;
      ALTER TABLE bets ADD COLUMN IF NOT EXISTS cashout_value DECIMAL(10, 2);
      ALTER TABLE bets ADD COLUMN IF NOT EXISTS is_freebet    TEXT NOT NULL DEFAULT 'false';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_hold_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS decision_reason TEXT;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS risk_flags JSONB;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS provider_reference TEXT;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      ALTER TABLE cashout_states ADD COLUMN IF NOT EXISTS reason            TEXT;
      ALTER TABLE cashout_states ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ;

      ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ;
      ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS file_data          BYTEA;

      ALTER TABLE settlement_logs ADD COLUMN IF NOT EXISTS settlement_key   TEXT;

      ALTER TABLE bets ADD COLUMN IF NOT EXISTS version     INTEGER   NOT NULL DEFAULT 1;
      ALTER TABLE bets ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

      ALTER TABLE users ADD COLUMN IF NOT EXISTS freebet_balance       DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_iban       TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_name       TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS self_excluded_until   TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status            TEXT DEFAULT 'not_submitted';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_document_type     TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_document_number   TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at      TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS first_deposit_granted TEXT DEFAULT 'none';

      CREATE TABLE IF NOT EXISTS manual_review_queue (
        id                 SERIAL PRIMARY KEY,
        bet_id             INTEGER NOT NULL,
        match_id           TEXT NOT NULL,
        reason             TEXT NOT NULL,
        priority           TEXT NOT NULL DEFAULT 'normal',
        status             TEXT NOT NULL DEFAULT 'pending',
        settlement_result  JSONB,
        reviewed_by        TEXT,
        reviewed_at        TIMESTAMPTZ,
        notes              TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settlement_replay_log (
        id            SERIAL PRIMARY KEY,
        match_id      TEXT NOT NULL,
        triggered_by  TEXT NOT NULL,
        reason        TEXT NOT NULL,
        bets_affected INTEGER,
        status        TEXT NOT NULL DEFAULT 'pending',
        started_at    TIMESTAMPTZ,
        completed_at  TIMESTAMPTZ,
        error         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS casino_games (
        id           SERIAL PRIMARY KEY,
        provider     TEXT NOT NULL,
        game_uid     TEXT NOT NULL,
        name         TEXT NOT NULL,
        vendor_code  INTEGER,
        category     TEXT NOT NULL DEFAULT 'slots',
        img          TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        popularity   INTEGER NOT NULL DEFAULT 0,
        source       TEXT NOT NULL DEFAULT 'silentapi',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Which aggregator this row launches through (silentapi | palace) -
      -- both re-list the same underlying vendor game_codes (e.g.
      -- Pragmatic Play's "vswaysdogs"), so provider+game_uid alone is not
      -- unique once a second aggregator's catalog is seeded into the same
      -- table; source disambiguates without needing a second table.
      ALTER TABLE casino_games ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'silentapi';

      DROP INDEX IF EXISTS casino_games_provider_game_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS casino_games_provider_game_source_idx
        ON casino_games (provider, game_uid, source);

      CREATE INDEX IF NOT EXISTS casino_games_provider_category_idx
        ON casino_games (provider, category);

      CREATE TABLE IF NOT EXISTS casino_banners (
        id           SERIAL PRIMARY KEY,
        title        TEXT NOT NULL,
        subtitle     TEXT,
        cta_text     TEXT,
        image_url    TEXT NOT NULL,
        link_url     TEXT,
        position     TEXT NOT NULL,
        game_ids     JSONB NOT NULL DEFAULT '[]',
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS casino_banners_position_active_idx
        ON casino_banners (position, is_active, sort_order);

      -- Backing the internal "IA Operações" agent system (schema/aiAgents.ts).
      -- These two were missing from this file when that system first
      -- shipped (2026-08-11) — schema/aiAgents.ts existed but nothing ever
      -- created the tables it describes, since this file (not drizzle-kit
      -- push) is the only thing that actually applies schema in dev/prod.
      -- Added here alongside the Ao Vivo/Pré-Jogo/Liquidação de Bilhetes
      -- agents, which depend on these existing to record their runs.
      CREATE TABLE IF NOT EXISTS ai_agent_runs (
        id                  SERIAL PRIMARY KEY,
        agent_role          TEXT NOT NULL,
        trigger             TEXT NOT NULL DEFAULT 'manual',
        triggered_by        TEXT,
        status              TEXT NOT NULL DEFAULT 'ok',
        summary             TEXT,
        proposals_created   INTEGER NOT NULL DEFAULT 0,
        error_message       TEXT,
        duration_ms         INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_agent_proposals (
        id                SERIAL PRIMARY KEY,
        agent_role        TEXT NOT NULL,
        action_type       TEXT NOT NULL,
        target_type       TEXT NOT NULL,
        target_id         TEXT NOT NULL,
        summary           TEXT NOT NULL,
        reasoning         TEXT NOT NULL,
        payload           JSONB,
        risk_level        TEXT NOT NULL DEFAULT 'normal',
        status            TEXT NOT NULL DEFAULT 'pending',
        reviewed_by       TEXT,
        reviewed_at       TIMESTAMPTZ,
        execution_error   TEXT,
        executed_at       TIMESTAMPTZ,
        run_id            INTEGER,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Audit trail for the "BET62 Brain" natural-language admin console
      -- (lib/aiAgents/console.ts, 2026-08-11) — see that file's header for
      -- the safety design (fixed tool allow-list, no free-form execution).
      CREATE TABLE IF NOT EXISTS ai_console_commands (
        id               SERIAL PRIMARY KEY,
        admin_username   TEXT NOT NULL,
        message          TEXT NOT NULL,
        tool_used        TEXT,
        params           JSONB,
        result_summary   TEXT,
        ok               BOOLEAN NOT NULL DEFAULT TRUE,
        error            TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Was added as a Drizzle schema file (schema/featuredMatchBanners.ts,
      -- PR #525) without ever being mirrored here — since this file (not
      -- drizzle-kit push) is what actually creates tables, that table never
      -- existed in production. Fixed here, alongside the session/passkey
      -- tables below which needed the same file touched anyway.
      CREATE TABLE IF NOT EXISTS featured_match_banners (
        id           SERIAL PRIMARY KEY,
        home_team    TEXT NOT NULL,
        away_team    TEXT NOT NULL,
        competition  TEXT,
        kickoff_at   TIMESTAMPTZ NOT NULL,
        ends_at      TIMESTAMPTZ NOT NULL,
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Admin-curated visual templates ("Modelos de Banner") for the
      -- featured_match_banners above — one per competition, with a logo URL
      -- (same "admin pastes a URL" convention as casino_banners.image_url,
      -- there's no upload-to-storage pipeline anywhere in this repo) and a
      -- 3-color gradient/accent scheme. Created before
      -- featured_match_banners' own banner_template_id column below so the
      -- FK target already exists.
      CREATE TABLE IF NOT EXISTS banner_templates (
        id               SERIAL PRIMARY KEY,
        sport            TEXT NOT NULL DEFAULT 'football',
        competition_name TEXT NOT NULL,
        logo_url         TEXT,
        primary_color    TEXT NOT NULL DEFAULT '#1e3a8a',
        secondary_color  TEXT NOT NULL DEFAULT '#0f172a',
        accent_color     TEXT NOT NULL DEFAULT '#dc2626',
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order       INTEGER NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS banner_templates_sport_competition_idx
        ON banner_templates (sport, competition_name);

      -- Starter gallery so the admin's "Modelos de Banner" tab isn't empty
      -- on day one — logo URLs reused from the same LEAGUE_LOGOS the
      -- frontend already trusts (artifacts/bet62/src/lib/leagueLogos.ts).
      -- Idempotent (ON CONFLICT DO NOTHING) and purely a starting point:
      -- the admin can freely edit/delete these or add any other
      -- competition/sport through the same UI.
      INSERT INTO banner_templates
        (sport, competition_name, logo_url, primary_color, secondary_color, accent_color, sort_order)
      VALUES
        ('football', 'UEFA Champions League', 'https://media.api-sports.io/football/leagues/2.png', '#0a2472', '#041c4a', '#00d2ff', 10),
        ('football', 'UEFA Europa League', 'https://media.api-sports.io/football/leagues/3.png', '#ff6600', '#331300', '#ffffff', 20),
        ('football', 'La Liga', 'https://media.api-sports.io/football/leagues/140.png', '#ee3524', '#7a0f08', '#ffcc00', 30),
        ('football', 'Premier League', 'https://media.api-sports.io/football/leagues/39.png', '#3d195b', '#1a0a28', '#00ff85', 40),
        ('football', 'Bundesliga', 'https://media.api-sports.io/football/leagues/78.png', '#d20515', '#6b0209', '#ffffff', 50),
        ('football', 'Serie A', 'https://media.api-sports.io/football/leagues/135.png', '#024494', '#011d3d', '#ffffff', 60),
        ('football', 'Ligue 1', 'https://media.api-sports.io/football/leagues/61.png', '#10182b', '#050810', '#dae025', 70),
        ('football', 'Primeira Liga', 'https://media.api-sports.io/football/leagues/94.png', '#006600', '#003300', '#ff0000', 80),
        ('football', 'Brasileirão', 'https://media.api-sports.io/football/leagues/71.png', '#009c3b', '#002776', '#ffdf00', 90),
        ('football', 'Copa Libertadores', 'https://media.api-sports.io/football/leagues/13.png', '#f7b500', '#7a3d00', '#003057', 100),
        ('football', 'Copa Sudamericana', 'https://media.api-sports.io/football/leagues/11.png', '#c8102e', '#5c0813', '#ffffff', 110),
        ('football', 'MLS', 'https://media.api-sports.io/football/leagues/253.png', '#041e42', '#020f21', '#ee3524', 120),
        ('football', 'Liga MX', 'https://media.api-sports.io/football/leagues/262.png', '#006847', '#00291d', '#ce1126', 130),
        ('football', 'FIFA World Cup', 'https://media.api-sports.io/football/leagues/1.png', '#a67c00', '#4d3900', '#ffffff', 140),
        ('football', 'Amistoso Internacional', 'https://media.api-sports.io/football/leagues/10.png', '#1e3a8a', '#0f172a', '#64748b', 150),
        ('football', 'Outro / Genérico', NULL, '#18181b', '#09090b', '#dc2626', 999)
      ON CONFLICT (sport, competition_name) DO NOTHING;

      -- Nullable FK: picking a template fills in the banner's logo/colors.
      -- ON DELETE SET NULL — removing a template must never take an
      -- already-scheduled banner down with it.
      ALTER TABLE featured_match_banners ADD COLUMN IF NOT EXISTS banner_template_id
        INTEGER REFERENCES banner_templates(id) ON DELETE SET NULL;

      -- Links each starter template to its real api-football.com league id
      -- (same numeric id already embedded in the logo_url seeded above,
      -- e.g. leagues/2.png = Champions League) — lets the automation sync
      -- (services/apiFootball/bannerSync.ts) match a fixture's league to
      -- the right template with zero guesswork. NULL means "never offered
      -- in automatic mode" (kept manual-only, e.g. "Outro / Genérico").
      ALTER TABLE banner_templates ADD COLUMN IF NOT EXISTS api_football_league_id INTEGER;

      UPDATE banner_templates SET api_football_league_id = CASE competition_name
        WHEN 'UEFA Champions League' THEN 2
        WHEN 'UEFA Europa League' THEN 3
        WHEN 'La Liga' THEN 140
        WHEN 'Premier League' THEN 39
        WHEN 'Bundesliga' THEN 78
        WHEN 'Serie A' THEN 135
        WHEN 'Ligue 1' THEN 61
        WHEN 'Primeira Liga' THEN 94
        WHEN 'Brasileirão' THEN 71
        WHEN 'Copa Libertadores' THEN 13
        WHEN 'Copa Sudamericana' THEN 11
        WHEN 'MLS' THEN 253
        WHEN 'Liga MX' THEN 262
        WHEN 'FIFA World Cup' THEN 1
        WHEN 'Amistoso Internacional' THEN 10
        ELSE api_football_league_id
      END
      WHERE sport = 'football' AND api_football_league_id IS NULL;

      -- Real team crest URLs (from api-football.com fixtures, or pasted by
      -- the admin for a manual banner — same "paste a URL" convention as
      -- every other image field in this repo) plus automation bookkeeping.
      -- external_fixture_id + its partial unique index below let the sync
      -- cron (services/apiFootball/bannerSync.ts) upsert one row per real
      -- fixture instead of duplicating it every cycle; source distinguishes
      -- cron-managed rows ('auto') from admin-entered ones ('manual'), which
      -- the cron must never touch.
      ALTER TABLE featured_match_banners ADD COLUMN IF NOT EXISTS home_team_logo_url TEXT;
      ALTER TABLE featured_match_banners ADD COLUMN IF NOT EXISTS away_team_logo_url TEXT;
      ALTER TABLE featured_match_banners ADD COLUMN IF NOT EXISTS external_fixture_id TEXT;
      ALTER TABLE featured_match_banners ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

      CREATE UNIQUE INDEX IF NOT EXISTS featured_match_banners_external_fixture_id_idx
        ON featured_match_banners (external_fixture_id) WHERE external_fixture_id IS NOT NULL;

      -- Single-row (id fixed at 1) config for the "Automação de Banners"
      -- admin panel — see services/apiFootball/bannerSync.ts. Defaults to
      -- mode='manual' so nothing changes in behavior until an admin
      -- explicitly opts into automatic sync from api-football.com.
      CREATE TABLE IF NOT EXISTS banner_automation_settings (
        id                             INTEGER PRIMARY KEY DEFAULT 1,
        mode                           TEXT NOT NULL DEFAULT 'manual',
        quantidade                     INTEGER NOT NULL DEFAULT 3,
        criterio                       TEXT NOT NULL DEFAULT 'upcoming',
        antecedencia_minutes           INTEGER NOT NULL DEFAULT 120,
        mostrar_ao_vivo                BOOLEAN NOT NULL DEFAULT TRUE,
        manter_apos_termino            BOOLEAN NOT NULL DEFAULT FALSE,
        tempo_para_substituir_minutes  INTEGER,
        allowed_competition_ids        JSONB NOT NULL DEFAULT '[]',
        excluded_competition_ids       JSONB NOT NULL DEFAULT '[]',
        updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT banner_automation_settings_single_row CHECK (id = 1)
      );

      INSERT INTO banner_automation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      -- Session-lock + WebAuthn (passkey) auth — see lib/sessions.ts.
      -- sessions.id is the SHA-256 hex digest of the random opaque token
      -- stored in the bet62_session/bet62_refresh cookies, never the raw
      -- token itself — a DB-only leak (backup, replica, stray log line)
      -- can't be replayed as a working session credential this way, same
      -- principle as never storing a password in plaintext.
      CREATE TABLE IF NOT EXISTS sessions (
        id                  TEXT PRIMARY KEY,
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status              TEXT NOT NULL DEFAULT 'active',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at           TIMESTAMPTZ,
        expires_at          TIMESTAMPTZ NOT NULL,
        refresh_token_hash  TEXT,
        refresh_expires_at  TIMESTAMPTZ,
        ip                  TEXT,
        user_agent          TEXT,
        revoked_at          TIMESTAMPTZ,
        revoked_reason      TEXT
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS sessions_refresh_token_hash_idx ON sessions (refresh_token_hash);

      CREATE TABLE IF NOT EXISTS user_passkeys (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key    TEXT NOT NULL,
        counter       INTEGER NOT NULL DEFAULT 0,
        device_type   TEXT,
        backed_up     BOOLEAN NOT NULL DEFAULT FALSE,
        transports    JSONB,
        name          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at  TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS security_audit_log (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event       TEXT NOT NULL,
        session_id  TEXT,
        ip          TEXT,
        user_agent  TEXT,
        metadata    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS security_audit_log_user_id_idx ON security_audit_log (user_id);
    `);

    console.info("[db/init] Schema initialisation complete.");
  } catch (err) {
    console.error("[db/init] Schema initialisation failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
