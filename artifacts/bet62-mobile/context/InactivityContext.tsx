import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";

const LOCK_AFTER_MS = 30_000;

const InactivityResetCtx = createContext<() => void>(() => {});
export const useResetInactivity = () => useContext(InactivityResetCtx);

export function InactivityProvider({ children }: { children: React.ReactNode }) {
  const { isBiometricEnabled, token, lockBiometric } = useAuth();
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgStartRef = useRef<number | null>(null);
  const isActive   = isBiometricEnabled && !!token;

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isActive) {
      timerRef.current = setTimeout(() => lockBiometric(), LOCK_AFTER_MS);
    }
  }, [isActive, lockBiometric]);

  const reset = useCallback(() => {
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [startTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        bgStartRef.current = Date.now();
        if (timerRef.current) clearTimeout(timerRef.current);
      } else if (state === "active") {
        const elapsed = bgStartRef.current !== null ? Date.now() - bgStartRef.current : 0;
        bgStartRef.current = null;
        if (elapsed > LOCK_AFTER_MS && isActive) {
          lockBiometric();
        } else {
          startTimer();
        }
      }
    });
    return () => sub.remove();
  }, [isActive, lockBiometric, startTimer]);

  return (
    <InactivityResetCtx.Provider value={reset}>
      {children}
    </InactivityResetCtx.Provider>
  );
}
