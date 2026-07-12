import { MarketRegistry } from "./marketRegistry.js";
import { footballMarkets } from "../sports/football/index.js";

export const footballRegistry = new MarketRegistry();

for (const market of footballMarkets) {
  footballRegistry.register(market.code, market.handler);

  for (const alias of market.aliases ?? []) {
    footballRegistry.register(alias, market.handler);
  }
}
