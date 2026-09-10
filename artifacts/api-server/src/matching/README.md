Reserved for the real cross-provider matching engine (confidence-scored
levels 1-5: provider id, team id, normalized team name, kickoff proximity,
league match) — intentionally empty until PulseScore is wired in, since
there's nothing to match GOAL API fixtures against yet. Today's
single-provider bookkeeping (GOAL API only, confidence fixed at 100) lives
in `artifacts/api-server/src/lib/canonicalMatchCatalog.ts` and moves here
once a second provider needs real disambiguation.
