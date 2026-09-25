// Thin fetch wrapper for the auth/session/passkey endpoints introduced by
// the cookie-based session migration. Two jobs: (1) attach the CSRF
// double-submit header on state-changing requests (the bet62_session
// cookie itself is HttpOnly and sent automatically by the browser — this
// is the one piece that isn't automatic), and (2) centrally notice a
// 401 { error: "SESSION_LOCKED" } response and broadcast it, so any part
// of the app that hits it can react without each caller re-deriving what
// that specific shape means.
//
// Scope note: this wrapper is used for the new /api/auth/* calls this
// phase touches. The rest of the app's many existing fetch() call sites
// (deposits, withdrawals, bets, profile, admin) aren't routed through it
// yet — CSRF enforcement is deliberately scoped to /api/auth/* only for
// now (see middlewares/csrf.ts), so those calls don't need it yet either.

export const SESSION_LOCKED_EVENT = "bet62:session-locked";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = readCookie("bet62_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(url, { ...options, headers, cache: "no-store" });

  if (res.status === 401) {
    const data = await res
      .clone()
      .json()
      .catch(() => null);
    if (data?.error === "SESSION_LOCKED") {
      window.dispatchEvent(new CustomEvent(SESSION_LOCKED_EVENT));
    }
  }

  return res;
}
