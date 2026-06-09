---
name: SportsAPI Pro V2 live endpoint field formats
description: /api/live returns plain strings for tournament/homeTeam/awayTeam, not objects
---

## Rule
The V2 `/api/live` endpoint returns events with:
- `tournament`: plain string (e.g. "Copa Paraguay")
- `homeTeam`: plain string (e.g. "General Díaz")
- `awayTeam`: plain string
- `homeScore`/`awayScore`: plain numbers
- `status`: plain string ("1st half", "2nd half", "Halftime", "HT", etc.)
- `startTimestamp`: Unix seconds (UTC)
- NO `statusCode` field, NO `country` field

`v2TournCountry()` returns "" for all these events (expects object with category.country.name).
All such events go to the `fallback` bucket in buildFootballLiveV2 (never primary).
`v2TeamName()` and `v2CurrentScore()` already handle string/number inputs correctly.

**Why:** The V2 live endpoint uses a simplified schema vs the schedule/upcoming endpoints which have full tournament objects with category/country nesting.
