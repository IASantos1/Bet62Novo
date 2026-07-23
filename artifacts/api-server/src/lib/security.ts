import crypto from "node:crypto";

// Constant-time string comparison for secrets (admin password, webhook
// signing secrets, etc). A plain `===` leaks timing information about how
// many leading characters matched, which crypto.timingSafeEqual avoids —
// but it throws on mismatched buffer lengths, so that case is handled
// explicitly here (still doing a dummy comparison to avoid a fast-path
// length check being itself a timing signal).
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
