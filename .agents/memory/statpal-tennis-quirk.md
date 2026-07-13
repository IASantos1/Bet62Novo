---
name: statpal tennis decimal set scores
description: statpal's tennis livescores API sometimes encodes a set's games as a decimal; must truncate before any odds/score math.
---

Statpal's tennis livescores API sometimes encodes a set's games count as a
decimal value (e.g. `6.1` instead of `6`). Any code doing odds/score math on
set games must truncate/round before using the value, or downstream
calculations (live odds, set-winner detection) go wrong.
