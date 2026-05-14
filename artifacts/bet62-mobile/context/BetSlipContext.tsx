import React, { createContext, useCallback, useContext, useState } from "react";

export interface BetSelection {
  matchId: string;
  matchTitle: string;
  market: string;
  label: string;
  odds: number;
}

interface BetSlipContextType {
  selections: BetSelection[];
  addSelection: (sel: BetSelection) => void;
  removeSelection: (matchId: string, market: string) => void;
  clearSlip: () => void;
  hasSelection: (matchId: string, market: string) => boolean;
  totalOdds: number;
  count: number;
}

const BetSlipContext = createContext<BetSlipContextType | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);

  const addSelection = useCallback((sel: BetSelection) => {
    setSelections((prev) => {
      const filtered = prev.filter(
        (s) => !(s.matchId === sel.matchId && s.market === sel.market)
      );
      return [...filtered, sel];
    });
  }, []);

  const removeSelection = useCallback((matchId: string, market: string) => {
    setSelections((prev) =>
      prev.filter((s) => !(s.matchId === matchId && s.market === market))
    );
  }, []);

  const clearSlip = useCallback(() => setSelections([]), []);

  const hasSelection = useCallback(
    (matchId: string, market: string) =>
      selections.some((s) => s.matchId === matchId && s.market === market),
    [selections]
  );

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  const count = selections.length;

  return (
    <BetSlipContext.Provider
      value={{ selections, addSelection, removeSelection, clearSlip, hasSelection, totalOdds, count }}
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
