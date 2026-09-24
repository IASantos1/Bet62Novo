import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildWinHouseBalanceChangeSignature,
  normalizeWinHouseBalanceChangePayload,
  serializeWinHouseBalanceChangePayload,
} from "../routes/winhouse.js";

test("WinHouse signature concatenates fields with no separator and preserves the parsed amount value", () => {
  const walletApiKey = "wh_wallet_secret";
  const expected = crypto
    .createHmac("sha256", walletApiKey)
    .update("5512-25bet88213tx_1")
    .digest("hex");

  const signature = buildWinHouseBalanceChangeSignature({
    username: "5512",
    amount: -25,
    action: "bet",
    ticketId: "88213",
    transactionId: "tx_1",
    walletApiKey,
  });

  assert.equal(signature, expected);
});

test("WinHouse payload normalization keeps a stable idempotency representation", () => {
  const payload = normalizeWinHouseBalanceChangePayload({
    username: "5512",
    session: "sess_abc",
    transaction_id: "bet_88213",
    amount: -25,
    action: "BET",
    ticket_id: 88213,
  });

  assert.deepEqual(payload, {
    username: "5512",
    session: "sess_abc",
    transactionId: "bet_88213",
    amountRaw: "-25",
    action: "bet",
    ticketId: "88213",
  });

  assert.equal(
    serializeWinHouseBalanceChangePayload(payload),
    JSON.stringify(["5512", "sess_abc", "bet_88213", "-25", "bet", "88213"]),
  );
});
