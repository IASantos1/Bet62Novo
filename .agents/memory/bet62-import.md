---
  name: Bet62 GitHub import
  description: Notes on importing the Bet62 betting platform from an external GitHub repo (web-only, PWA)
  ---

  The Bet62 project originated as an external GitHub repo (IASantos1/Bet62Novo) containing a web app, a native Expo mobile app, and a shared api-server/lib layout nearly identical to this workspace's own scaffold conventions.

  **Decision:** only the web (PWA) artifact + api-server + shared libs were imported. The repo's native mobile artifact was excluded per explicit user choice (user considers the web app a PWA, not a native mobile app).

  **Why:** the workspace's free-tier plan only supports one artifact; user chose web over mobile.

  **How to apply:** if the user later asks to add the mobile app, re-clone the source repo (or ask for it again) and import `artifacts/bet62-mobile` following the same tar-copy approach used for the web import — do not hand-build it from scratch, the original mobile source already exists upstream.

  **Setup quirk:** right after import, `artifacts/*/.replit-artifact/artifact.toml` files existed on disk but `listArtifacts()` returned empty and `WorkflowsRestart` didn't recognize the expected managed workflow names. Registering workflows manually via `configureWorkflow` (using each artifact's dev command + port) triggered the platform to auto-detect and register the artifacts + normalize the workflow names on its own — no need to call `createArtifact` (which fails on an existing slug) or hand-write `.replit`.

**Follow-up quirk (2026-07-12):** after a later `pnpm install` + workflow restart, both artifact services ran correctly (verified via curl/screenshot on the actual dev domain) but `listArtifacts()` still returned empty — the artifact-registration gap can persist independently of whether the services themselves work. Don't treat an empty `listArtifacts()` as proof the app is broken; check the workflow logs and hit the real dev domain instead.

**Required env for api-server to boot:** `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` (hard-throws at startup if unset) plus `SESSION_SECRET`. Stripe and SportsAPI env vars are only read lazily inside route handlers, not at module load, so the server boots fine without them — only specific features (payments, live match data) degrade.

**Bug pattern: fake "live" matches from Statpal (fixed 2026-07-12):** `buildFootballLiveV2` (artifacts/api-server/src/routes/matches.ts) only filtered out matches older than 2.5h; it never checked for matches whose scheduled kickoff was still in the future. Statpal's `/v2/soccer/matches/live` endpoint returns not-yet-started fixtures tagged with a status that our mapper (`mapStatpalFootballStatus`) reads as minute=0 + code=1 ("1st half"), so scheduled games appeared in the live feed as "1P · 00:00" with a 0-0 score. Fix: skip events whose `startTimestamp` is more than `FOOTBALL_CLOCK_SKEW_SEC` in the future. **Why:** any provider feed that reuses "0" for both "just kicked off" and "not started" needs a kickoff-time sanity check, not just staleness filtering — the same class of bug could recur in other sports if their live builders lack an equivalent guard.
  