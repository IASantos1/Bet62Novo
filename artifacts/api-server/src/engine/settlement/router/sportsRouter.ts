import { footballRouter } from "./footballRouter.js";
import { basketballRegistry } from "../registry/basketballRegistry.js";
import { tennisRegistry } from "../registry/tennisRegistry.js";
import { volleyballRegistry } from "../registry/volleyballRegistry.js";
import { hockeyRegistry } from "../registry/hockeyRegistry.js";
import { baseballRegistry } from "../registry/baseballRegistry.js";
import type { MarketRegistry } from "../registry/marketRegistry.js";

function routeViaRegistry(registry: MarketRegistry, input: any): any {
  const market = String(
    input.selection?.market ??
    input.selection?.marketType ??
    input.selection?.marketCode ??
    ""
  ).toLowerCase();

  const handler = registry.get(market);
  if (!handler) return "pending";
  return handler(input);
}

export function routeBySport(input: any): any {
  const sport = String(
    input.match?.sport ??
    input.bet?.sport ??
    input.selection?.sport ??
    ""
  ).toLowerCase();

  switch (sport) {
    case "basketball":
    case "nba":
      return routeViaRegistry(basketballRegistry, input);

    case "tennis":
      return routeViaRegistry(tennisRegistry, input);

    case "volleyball":
      return routeViaRegistry(volleyballRegistry, input);

    case "hockey":
    case "nhl":
      return routeViaRegistry(hockeyRegistry, input);

    case "baseball":
    case "mlb":
      return routeViaRegistry(baseballRegistry, input);

    case "football":
    case "soccer":
      return footballRouter(input);

    default:
      return footballRouter(input);
  }
}
