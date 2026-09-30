// Captures a promoter's referral code from a ?ref=CODE landing link
// (https://bet62.plus/?ref=JOAO62) into a client-side cookie, so the
// register form's request can carry it days later without the code
// needing to survive in the URL the whole time. Read server-side on
// POST /api/auth/register (routes/auth.ts's resolveAffiliateFromCookie) —
// never trusted for anything financial on its own, just which affiliate
// (if any) to attach to a brand-new account (Santos, 2026-09-30).
const AFFILIATE_COOKIE_NAME = "bet62_affiliate";
const AFFILIATE_COOKIE_DAYS = 30;

export function captureAffiliateReferral(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    const code = ref.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!code) return;
    const maxAge = AFFILIATE_COOKIE_DAYS * 24 * 60 * 60;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${AFFILIATE_COOKIE_NAME}=${code}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookie capture is a non-critical convenience — never block app boot.
  }
}
