// Mr. Doge (api.mrdoge.co) — real sports-data provider (2026-09-20+), via
// the official @mrdoge/node SDK. The SDK's own constructor does not open a
// connection (lazy, on first call/subscribe), so this singleton is cheap to
// construct even when CONFIG.MRDOGE_API_KEY is unset — callers must still
// gate on the key themselves before calling any method, same convention as
// every other provider client in this codebase (api-tennis, GOAL API, ...).
import { MrDoge } from "@mrdoge/node";
import { CONFIG } from "../../lib/config.js";

let _client: MrDoge | null = null;

export function getMrDogeClient(): MrDoge {
  if (!_client) {
    _client = new MrDoge({ apiKey: CONFIG.MRDOGE_API_KEY });
  }
  return _client;
}
