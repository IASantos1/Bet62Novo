import { useEffect, useRef, useState } from "react";
import EventSource from "react-native-sse";
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
  doubleChance?: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  bothTeamsScore?: { yes: number; no: number };
  halfTime?: { home: number; draw: number; away: number };
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
  leagueId?: string;
  markets?: LiveMatchMarkets;
  marketSuspension?: Record<string, number>;
  suspensionReason?: string;
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
const HTTP_FALLBACK_INTERVAL_MS = 5_000;

export function useLiveMatches(): {
  matches: LiveMatch[];
  connected: boolean;
  lastUpdated: number;
} {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);

  const esRef = useRef<InstanceType<typeof EventSource> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  function clearTimers() {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (fallbackTimerRef.current) { clearInterval(fallbackTimerRef.current); fallbackTimerRef.current = null; }
  }

  function startFallbackPolling() {
    if (fallbackTimerRef.current) return;
    fallbackTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/matches/live`);
        if (!res.ok) return;
        const data = (await res.json()) as { matches: LiveMatch[] };
        if (mountedRef.current && data.matches) {
          setMatches(data.matches);
          setLastUpdated(Date.now());
        }
      } catch { /* ignore */ }
    }, HTTP_FALLBACK_INTERVAL_MS);
  }

  function connect() {
    if (!mountedRef.current) return;
    const streamUrl = `${API_BASE}/matches/live-stream`;
    try {
      const es = new EventSource(streamUrl);
      esRef.current = es;
      es.addEventListener("open", () => {
        if (!mountedRef.current) return;
        setConnected(true);
        reconnectDelayRef.current = RECONNECT_DELAY_MS;
        clearTimers();
      });
      es.addEventListener("message", (event) => {
        if (!mountedRef.current || !event.data) return;
        try {
          const data = JSON.parse(event.data) as { matches: LiveMatch[] };
          if (data.matches) { setMatches(data.matches); setLastUpdated(Date.now()); }
        } catch { /* ignore */ }
      });
      es.addEventListener("error", () => {
        if (!mountedRef.current) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        startFallbackPolling();
        reconnectTimerRef.current = setTimeout(() => {
          clearTimers();
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY_MS);
          connect();
        }, reconnectDelayRef.current);
      });
    } catch {
      setConnected(false);
      startFallbackPolling();
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    fetch(`${API_BASE}/matches/live`)
      .then((r) => r.json())
      .then((d: { matches: LiveMatch[] }) => {
        if (mountedRef.current && d.matches) { setMatches(d.matches); setLastUpdated(Date.now()); }
      })
      .catch(() => {});
    connect();
    return () => {
      mountedRef.current = false;
      clearTimers();
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  return { matches, connected, lastUpdated };
}
