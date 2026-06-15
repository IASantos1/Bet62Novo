export type WCRawSnapshot = {
  fetchedAt: number;
  matches: Record<string, unknown>[];
};

export const WC2026_CLIENT_CACHE_KEY = "wc2026_page_snapshot_v3";
export const WC2026_CLIENT_CACHE_MAX_AGE_MS = 2 * 60_000;

export function readWCClientSnapshotRaw(): WCRawSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(WC2026_CLIENT_CACHE_KEY) ?? "null") as {
      fetchedAt?: number;
      matches?: unknown[];
    } | null;
    if (!raw || !Array.isArray(raw.matches)) return null;
    if (typeof raw.fetchedAt !== "number") return null;
    if (Date.now() - raw.fetchedAt > WC2026_CLIENT_CACHE_MAX_AGE_MS) return null;
    return {
      fetchedAt: raw.fetchedAt,
      matches: raw.matches as Record<string, unknown>[],
    };
  } catch {
    return null;
  }
}

export function writeWCClientSnapshotRaw(rawMatches: Record<string, unknown>[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WC2026_CLIENT_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), matches: rawMatches }),
    );
  } catch {
    // Ignore storage/private mode failures. The page can still load from the network.
  }
}
