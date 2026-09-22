---
name: Goal API and PropLine provider roles
description: Durable provider ownership and request-budget decisions for Bet62 sports data.
---

Goal API is the primary source for football fixtures, live state, score, events, statistics, lineups, and commentary. PropLine is the primary source for bookmakers, odds, markets, and non-football sports. The browser must only call the Bet62 backend.

**Why:** This separation matches each provider's strengths and prevents conflicting football state. MrDoge is retained only for backward-compatible legacy code and must not be used by active runtime paths.

**How to apply:** Prefer REST/polling with backend caches; WebSocket and webhooks are optional accelerators. Both provider plans allow 1,000,000 requests per day, so do not optimize for an artificially small daily budget, but retain bounded concurrency and retry/backoff for burst limits.