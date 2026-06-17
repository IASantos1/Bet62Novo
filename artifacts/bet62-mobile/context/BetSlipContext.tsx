import React, { createContext, useCallback, useContext, useState } from "react";

export interface BetSelection {
  matchId: string;
  matchTitle: string;
  homeTeam?: string;
  awayTeam?: string;
  sport?: string;
  market: string;
  /** Settlement key sent to the API (e.g. "home", "draw", "away", "bts-yes") */
  selection?: string;
  label: string;
  odds: number;
  suspended?: boolean;
  suspendedReason?: string;
  date?: string;
  time?: string;
  kickoffTime?: string;
}

interface BetSlipContextType {
  selections: BetSelection[];
  addSelection: (sel: BetSelection) => void;
  removeSelection: (matchId: string, market: string) => void;
  clearSlip: () => void;
  hasSelection: (matchId: string, market: string) => boolean;
  applyQuote: (
    q: Array<{
      matchId: string;
      market: string;
      odds: number | null;
      suspended: boolean;
      reason?: string;
    }>,
  ) => void;
  totalOdds: number;
  count: number;
}

const BetSlipContext = createContext<BetSlipContextType | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const addSelection = useCallback((sel: BetSelection) => {
    setSelections((prev) => {
      const filtered = prev.filter(
        (s) => !(s.matchId === sel.matchId && s.market === sel.market),
      );
      return [...filtered, sel];
    });
  }, []);

  const removeSelection = useCallback((matchId: string, market: string) => {
    setSelections((prev) =>
      prev.filter((s) => !(s.matchId === matchId && s.market === market)),
    );
  }, []);

  const clearSlip = useCallback(() => setSelections([]), []);

  const hasSelection = useCallback(
    (matchId: string, market: string) =>
      selections.some((s) => s.matchId === matchId && s.market === market),
    [selections],
  );

  const applyQuote = useCallback(
    (
      q: Array<{
        matchId: string;
        market: string;
        odds: number | null;
        suspended: boolean;
        reason?: string;
      }>,
    ) => {
      if (!Array.isArray(q) || q.length === 0) return;
      const map = new Map(
        q.map((x) => [`${x.matchId}::${x.market}`, x] as const),
      );
      setSelections((prev) =>
        prev.map((s) => {
          const hit = map.get(`${s.matchId}::${s.market}`);
          if (!hit) return s;
          const nextOdds =
            hit.odds != null && Number.isFinite(hit.odds)
              ? Math.max(1.01, hit.odds)
              : s.odds;
          const prevRounded = Math.round(s.odds * 100) / 100;
          const nextRounded = Math.round(nextOdds * 100) / 100;
          const oddsChanged =
            Number.isFinite(nextRounded) &&
            Math.abs(nextRounded - prevRounded) >= 0.01;
          return {
            ...s,
            odds: nextOdds,
            suspended: hit.suspended || oddsChanged,
            suspendedReason: hit.suspended
              ? hit.reason
              : oddsChanged
                ? "ODD ATUALIZADA"
                : undefined,
          };
        }),
      );
    },
    [],
  );

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const count = selections.length;

  return (
    <BetSlipContext.Provider
      value={{
        selections,
        addSelection,
        removeSelection,
        clearSlip,
        hasSelection,
        applyQuote,
        totalOdds,
        count,
      }}
    >
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error("useBetSlip must be used within BetSlipProvider");
  return ctx;
}
