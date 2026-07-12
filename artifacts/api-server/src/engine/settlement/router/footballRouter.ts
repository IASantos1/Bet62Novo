import { footballRegistry } from "../registry/footballRegistry.js";

export function footballRouter(input: any) {
  const market = String(
    input.selection.market ??
    input.selection.marketType ??
    input.selection.marketCode ??
    ""
  ).toLowerCase();

  const handler = footballRegistry.get(market);

  if (!handler) {
    return "pending";
  }

  return handler(input);
}
