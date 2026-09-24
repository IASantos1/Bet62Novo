import { useEffect, useRef, useState, useCallback } from "react";

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown",
  "touchstart", "touchmove", "wheel", "click",
] as const;

export function useIdle(timeoutMs = 60_000) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    // "scroll" doesn't bubble to window from a nested scrollable element
    // (match lists, modals, etc. all use their own overflow-y-auto
    // containers) — only capture-phase listening sees it. Without this,
    // a user who's only scrolling inside one of those containers (not
    // tapping/clicking) never resets the timer and gets force-locked
    // while actively reading the page (Santos, 2026-09-24).
    window.addEventListener("scroll", resetTimer, { passive: true, capture: true });
    resetTimer();
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      window.removeEventListener("scroll", resetTimer, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { isIdle, resetIdle: resetTimer };
}
