import { MarketRegistry } from "./marketRegistry";
import { footballMarkets } from "../sports/football";

export const footballRegistry = new MarketRegistry();

for (const market of footballMarkets) {
  footballRegistry.register(market.code, market.handler);

  for (const alias of market.aliases ?? []) {
    footballRegistry.register(alias, market.handler);
  }
}
