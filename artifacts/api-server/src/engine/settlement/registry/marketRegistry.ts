import type { Outcome } from "../types/settlement.types.js";

export type MarketHandler = (input: any) => Outcome;

export class MarketRegistry {
  private handlers = new Map<string, MarketHandler>();

  register(market: string, handler: MarketHandler) {
    this.handlers.set(market.toLowerCase(), handler);
  }

  get(market: string): MarketHandler | undefined {
    return this.handlers.get(market.toLowerCase());
  }

  has(market: string): boolean {
    return this.handlers.has(market.toLowerCase());
  }

  list(): string[] {
    return [...this.handlers.keys()];
  }
}
