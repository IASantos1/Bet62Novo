import assert from "node:assert/strict";
import test from "node:test";

import type { Market } from "@mrdoge/node";

import {
  extractMrDogeSoccerExtendedMarkets,
  extractMrDogeSoccerTotalGoals,
} from "../services/mrdoge/common.js";

function overUnderMarket(
  betType: string,
  displayName: string,
  value: string,
  over: number,
  under: number,
): Market {
  return {
    id: `${betType}-${value}`,
    betType,
    displayName,
    lines: [
      {
        id: `${betType}-${value}-over`,
        code: "O",
        caption: `Mais de ${value}`,
        price: over,
        isAvailable: true,
        updatedAt: "2026-09-21T21:14:33.107Z",
      },
      {
        id: `${betType}-${value}-under`,
        code: "U",
        caption: `Menos de ${value}`,
        price: under,
        isAvailable: true,
        updatedAt: "2026-09-21T21:14:33.107Z",
      },
    ],
    betItems: [],
  } as Market;
}

test("first-half totals use the caption line, not the 1º ordinal in the market name", () => {
  const markets = [
    overUnderMarket(
      "SOCCER_FIRST_HALF_UNDER_OVER",
      "Gols 1º Tempo Mais/Menos",
      "0,5",
      1.48,
      2.4,
    ),
    overUnderMarket(
      "SOCCER_FIRST_HALF_UNDER_OVER",
      "Gols 1º Tempo Mais/Menos",
      "1,5",
      3.2,
      1.29,
    ),
  ];

  const result = extractMrDogeSoccerExtendedMarkets(markets);
  assert.deepEqual(result.firstHalfTotal, {
    line: 1.5,
    over: 3.2,
    under: 1.29,
  });
});

test("full-time totals still parse Portuguese decimal-comma captions", () => {
  const markets = [
    overUnderMarket(
      "SOCCER_UNDER_OVER",
      "Gols Mais/Menos",
      "2,5",
      1.91,
      1.87,
    ),
  ];

  assert.deepEqual(
    Array.from(extractMrDogeSoccerTotalGoals(markets).entries()),
    [[2.5, { over: 1.91, under: 1.87 }]],
  );
});