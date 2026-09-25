export type ThemePreference = "light" | "dark";
export type ResolvedTheme = ThemePreference;

const THEME_STORAGE_KEY = "bet62_theme_preference";
const THEME_EVENT_NAME = "bet62-theme-change";

export function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

export function clearStoredThemePreference() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {}
}

// Always dark now (Santos, 2026-09-25) — the WinHouse Sportsbook iframe has
// its own fixed dark background we can't restyle to follow a light/dark
// toggle, so switching BET62's own chrome to light for part of the day made
// every page around it look broken instead. No auto day/night switch, no
// stored per-user override: the whole site is dark, permanently.
export function getResolvedTheme(_preference: ThemePreference | null = getStoredThemePreference()): ResolvedTheme {
  return "dark";
}

function broadcastThemeChange(preference: ThemePreference | null, resolved: ResolvedTheme) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME, { detail: { preference, resolved } }));
}

export function applyThemePreference(preference: ThemePreference | null = getStoredThemePreference()): ResolvedTheme {
  const resolved = getResolvedTheme(preference);
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("light-mode", resolved === "light");
  }
  broadcastThemeChange(preference, resolved);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {}
  }
  return applyThemePreference(preference);
}

export function toggleThemePreference(): ResolvedTheme {
  return setThemePreference(getResolvedTheme() === "dark" ? "light" : "dark");
}

export function subscribeThemeChange(callback: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ resolved?: ResolvedTheme }>).detail;
    callback(detail?.resolved ?? getResolvedTheme());
  };
  window.addEventListener(THEME_EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(THEME_EVENT_NAME, handler as EventListener);
}
