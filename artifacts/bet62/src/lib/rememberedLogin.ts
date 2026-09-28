// Remembers which email last logged in successfully on this device/browser
// — purely a client-side convenience so the login modal knows to offer
// Face ID first instead of the email/password form. Not sensitive (just
// an email address), never used for authentication itself: the server
// still independently verifies the WebAuthn assertion against that email's
// registered passkeys. Persists across logout/idle-logout on purpose, so
// Face ID keeps being offered next time — only browser site-data clearing
// (or logging in as a different account) changes it.
const REMEMBERED_EMAIL_KEY = "bet62_remembered_email";

export function getRememberedEmail(): string | null {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setRememberedEmail(email: string): void {
  try {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
  } catch {}
}
