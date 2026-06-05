import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/context/AuthContext";

export interface LiveMatchMarkets {
  totalGoals?: {
    over05: number; under05: number;
    over15: number; under15: number;
    over25: number; under25: number;
    over35: number; under35: number;
    over45: number; under45: number;
    over55: number; under55: number;
    over65: number; under65: number;
  };
  _total?: number;
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore?: { yes: number; no: number };
  halfTime?: { home: number; draw: number; away: number };
  secondHalf?: { home: number; draw: number; away: number };
  handicap?: { homeMinusOne: number; awayPlusOne: number; homeMinusOneHalf: number; awayPlusOneHalf: number };
  firstGoal?: { home: number; noGoal: number; away: number };
  exactGoals?: { g0: number; g1: number; g2: number; g3: number; g4: number; g5plus: number };
  htft?: { hh: number; hd: number; ha: number; dh: number; dd: number; da: number; ah: number; ad: number; aa: number };
  corners?: { o85: number; u85: number; o95: number; u95: number; o105: number; u105: number };
  cards?: { o35: number; u35: number; o45: number; u45: number };
  tennisExtra?: {
    firstSet: { home: number; away: number };
    set2: { home: number; away: number };
    totalSets?: { over15: number; under15: number };
    currentSetNum: number;
    setExactScore?: Record<string, number>;
  };
  handicapPoints?: { line: number; home: number; away: number };
  etExtra?: {
    tieWinner: { home: number; away: number };
    totalGoals: { o05: number; u05: number; o15: number; u15: number; o25: number; u25: number };
    etResult: { home: number; draw: number; away: number };
    nextGoal: { home: number; away: number };
  };
  penExtra?: { winner: { home: number; away: number } };
  winToNil?: { home: number; away: number };
  cleanSheet?: { home: number; away: number };
  toWinBothHalves?: { home: number; away: number };
  highestScoringHalf?: { first: number; second: number; equal: number };
  teamGoals?: {
    homeOver05: number; homeUnder05: number;
    homeOver15: number; homeUnder15: number;
    homeOver25: number; homeUnder25: number;
    awayOver05: number; awayUnder05: number;
    awayOver15: number; awayUnder15: number;
    awayOver25: number; awayUnder25: number;
  };
  btts1H?: { yes: number; no: number };
  btts2H?: { yes: number; no: number };
  goalOddEven?: { odd: number; even: number };
}

export interface LiveMatch {
  id: string;
  sport: string;
  status: string;
  minute?: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  odds: { home: number; draw: number; away: number };
  league?: string;
  country?: string;
  leagueId?: string;
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number>;
  suspensionReason?: string;
  _suspensionReason?: string;
  date?: string;
  time?: string;
  hasRealOdds?: boolean;
  startsIn?: number;
  _liveExtra?: {
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    periods?: Array<[number, number]>;
    quarters?: Array<[number, number]>;
    innings?: Array<[number, number]>;
  };
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HTTP_FALLBACK_INTERVAL_MS = 2_000;
const UPDATE_THROTTLE_MS = 1_000;

export function useLiveMatches(): {
  matches: LiveMatch[];
  connected: boolean;
  lastUpdated: number;
} {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackSinceRef = useRef<number | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ matches: LiveMatch[] } | null>(null);
  const mountedRef = useRef(true);

  function clearTimers() {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
  }

  function applyPending() {
    const data = pendingRef.current;
    if (!data || !mountedRef.current) return;
    pendingRef.current = null;
    setMatches(data.matches);
    setLastUpdated(Date.now());
  }

  // Throttle state updates to at most once per UPDATE_THROTTLE_MS (2 s)
  function scheduleUpdate(data: { matches: LiveMatch[] }) {
    pendingRef.current = data;
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        applyPending();
      }, UPDATE_THROTTLE_MS);
    }
  }

  function startFallbackPolling() {
    if (fallbackTimerRef.current) return;
    if (fallbackSinceRef.current == null) fallbackSinceRef.current = Date.now();
    const run = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/matches/live`);
        if (!res.ok) return;
        const data = (await res.json()) as { matches: LiveMatch[] };
        if (mountedRef.current && data.matches) scheduleUpdate(data);
      } catch { /* ignore */ }
      const since = fallbackSinceRef.current ?? Date.now();
      const elapsed = Date.now() - since;
      const nextDelay =
        elapsed < 60_000 ? HTTP_FALLBACK_INTERVAL_MS :
        elapsed < 300_000 ? 5_000 :
        10_000;
      fallbackTimerRef.current = setTimeout(run, nextDelay);
    };
    fallbackTimerRef.current = setTimeout(run, HTTP_FALLBACK_INTERVAL_MS);
  }

  function connect() {
    if (!mountedRef.current) return;
    // Convert https:// → wss://  (or http:// → ws://) for native WebSocket
    const wsUrl = API_BASE
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://")
      + "/matches/ws";

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        reconnectDelayRef.current = RECONNECT_DELAY_MS;
        // Stop fallback polling if WS came up
        if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
        fallbackSinceRef.current = null;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as any;
          if (msg && typeof msg === "object" && msg.type === "snapshot" && Array.isArray(msg.matches)) {
            scheduleUpdate({ matches: msg.matches as LiveMatch[] });
            return;
          }
          if (msg && typeof msg === "object" && msg.type === "update" && typeof msg.matchId === "string" && msg.delta && typeof msg.delta === "object") {
            const matchId = String(msg.matchId);
            setMatches(prev => {
              const idx = prev.findIndex(m => String(m.id) === matchId);
              if (idx < 0) return prev;
              const next = [...prev];
              next[idx] = { ...(next[idx] as any), ...(msg.delta as any) };
              return next;
            });
            setLastUpdated(Date.now());
            return;
          }
          if (Array.isArray(msg.matches)) scheduleUpdate({ matches: msg.matches as LiveMatch[] });
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        startFallbackPolling();
        reconnectTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          clearTimers();
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY_MS);
          connect();
        }, reconnectDelayRef.current);
      };
    } catch {
      setConnected(false);
      startFallbackPolling();
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    // Fetch initial state immediately so the UI isn't blank while WS handshakes
    fetch(`${API_BASE}/matches/live`)
      .then((r) => r.json())
      .then((d: { matches: LiveMatch[] }) => {
        if (mountedRef.current && d.matches) {
          setMatches(d.matches);
          setLastUpdated(Date.now());
        }
      })
      .catch(() => {});

    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (throttleTimerRef.current) { clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { matches, connected, lastUpdated };
}
