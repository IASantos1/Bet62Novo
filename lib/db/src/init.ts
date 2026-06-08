import { pool } from "./index";

/**
 * Initialises the database schema on first deployment.
 *
 * All statements use CREATE TABLE IF NOT EXISTS so the function is fully
 * idempotent — safe to call on every startup without side-effects when the
 * tables already exist.
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
        status      TEXT NOT NULL DEFAULT 'pending',
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
        old_status TEXT NOT NULL,
        new_status TEXT NOT NULL,
        payout     DECIMAL(12, 2),
        message    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at  TIMESTAMPTZ
      );

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

      ALTER TABLE cashout_states ADD COLUMN IF NOT EXISTS reason            TEXT;
      ALTER TABLE cashout_states ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ;

      ALTER TABLE kyc_documents ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ;
    `);

    console.info("[db/init] Schema initialisation complete.");
  } catch (err) {
    console.error("[db/init] Schema initialisation failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
