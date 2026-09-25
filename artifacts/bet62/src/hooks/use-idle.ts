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

    // Cross-origin iframes (the WinHouse sportsbook embed) are a same-
    // origin-policy black box: every tap/scroll/bet the user places inside
    // one fires only inside that iframe's own document, so none of the
    // listeners above ever see it and the timer would still expire mid-bet
    // (Santos, 2026-09-25 — lock kept firing while actively using the
    // sportsbook). The one thing the parent document CAN observe is focus
    // moving onto an iframe: clicking into one fires `window.blur` and sets
    // `document.activeElement` to that <iframe>. That's not proof of
    // continuous activity, so treat "focus is currently on an iframe" as an
    // ongoing activity signal instead — keep resetting the timer on an
    // interval for as long as that holds, and stop the moment focus comes
    // back to this document.
    let iframeKeepAlive: ReturnType<typeof setInterval> | null = null;
    const isIframeFocused = () => document.activeElement?.tagName === "IFRAME";
    const onWindowBlur = () => {
      if (!isIframeFocused() || iframeKeepAlive) return;
      resetTimer();
      iframeKeepAlive = setInterval(() => {
        if (isIframeFocused()) resetTimer();
      }, 5_000);
    };
    const onWindowFocus = () => {
      if (iframeKeepAlive) {
        clearInterval(iframeKeepAlive);
        iframeKeepAlive = null;
      }
      resetTimer();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);

    resetTimer();
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      window.removeEventListener("scroll", resetTimer, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      if (iframeKeepAlive) clearInterval(iframeKeepAlive);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { isIdle, resetIdle: resetTimer };
}
