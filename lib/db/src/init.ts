import { pool } from "./index";

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
    `);

    console.info("[db/init] Schema initialisation complete.");
  } catch (err) {
    console.error("[db/init] Schema initialisation failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
