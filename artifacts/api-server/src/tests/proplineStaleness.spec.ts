import test from "node:test";
import assert from "node:assert/strict";
import { filterFreshBookmakers } from "../services/propline/common.js";

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

test("filterFreshBookmakers: drops an outcome whose own price is older than the max age", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Home", price: 1.7, last_change_at: iso(20 * 60_000) }, // 20 min old — stale
            { name: "Away", price: 16.9, last_change_at: iso(20 * 60_000) },
          ],
        },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.deepEqual(result, []);
});

test("filterFreshBookmakers: keeps a fresh outcome", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Home", price: 1.1, last_change_at: iso(30_000) },
            { name: "Away", price: 12.0, last_change_at: iso(30_000) },
          ],
        },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.markets[0]!.outcomes.length, 2);
});

test("filterFreshBookmakers: an outcome with no timestamp at all is kept, never guessed stale", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        {
          key: "h2h",
          outcomes: [{ name: "Home", price: 1.5 }, { name: "Away", price: 2.5 }],
        },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.markets[0]!.outcomes.length, 2);
});

test("filterFreshBookmakers: prunes only the stale outcome within a market, keeps the fresh one", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        {
          key: "totals",
          outcomes: [
            { name: "Over", price: 1.9, point: 2.5, last_change_at: iso(30_000) },
            { name: "Under", price: 1.9, point: 2.5, last_change_at: iso(20 * 60_000) },
          ],
        },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.equal(result[0]!.markets[0]!.outcomes.length, 1);
  assert.equal(result[0]!.markets[0]!.outcomes[0]!.name, "Over");
});

test("filterFreshBookmakers: falls back through book_updated_at and recorded_at when last_change_at is absent", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        {
          key: "h2h",
          outcomes: [{ name: "Home", price: 1.5, book_updated_at: iso(20 * 60_000) }],
        },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.deepEqual(result, []);
});

test("filterFreshBookmakers: drops a bookmaker entirely once every market is emptied out", () => {
  const bookmakers = [
    {
      key: "bookA",
      title: "Book A",
      markets: [
        { key: "h2h", outcomes: [{ name: "Home", price: 1.5, last_change_at: iso(20 * 60_000) }] },
      ],
    },
    {
      key: "bookB",
      title: "Book B",
      markets: [
        { key: "h2h", outcomes: [{ name: "Home", price: 1.5, last_change_at: iso(10_000) }] },
      ],
    },
  ];
  const result = filterFreshBookmakers(bookmakers as any, 5 * 60_000);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.key, "bookB");
});
