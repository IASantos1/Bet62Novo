import { useSyncExternalStore } from "react";
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
    set3?: { home: number; away: number };
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
  redCardsHome?: number;
  redCardsAway?: number;
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
    clockStr?: string;
    kickoffSec?: number;
    clockSec?: number;
    clockAtMs?: number;
    clockRunning?: boolean;
    sets?: Array<[number, number]>;
    currentPoints?: [number | string, number | string];
    serving?: [boolean, boolean];
    periods?: Array<[number, number]>;
    quarters?: Array<[number, number]>;
    innings?: Array<[number, number]>;
  };
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HTTP_FALLBACK_INTERVAL_MS = 2_000;
const UPDATE_THROTTLE_MS = 500;

type StoreState = { matches: LiveMatch[]; connected: boolean; lastUpdated: number };

let state: StoreState = { matches: [], connected: false, lastUpdated: 0 };
const listeners = new Set<() => void>();

let started = false;
let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackSince: number | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { matches: LiveMatch[] } | null = null;

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

function mergeMatches(prev: LiveMatch[], next: LiveMatch[]): LiveMatch[] {
  const map = new Map(next.map((m) => [String(m.id), m] as const));
  const out: LiveMatch[] = [];
  for (const p of prev) {
    const id = String(p.id);
    const n = map.get(id);
    if (!n) continue;
    out.push({ ...(p as any), ...(n as any) });
    map.delete(id);
  }
  for (const n of map.values()) out.push(n);
  return out;
}

function applyPending() {
  const data = pending;
  if (!data) return;
  pending = null;
  state = { ...state, matches: mergeMatches(state.matches, data.matches), lastUpdated: Date.now() };
  emit();
}

function scheduleUpdate(data: { matches: LiveMatch[] }) {
  pending = data;
  if (!throttleTimer) {
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      applyPending();
    }, UPDATE_THROTTLE_MS);
  }
}

function clearTimers() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
}

function startFallbackPolling() {
  if (fallbackTimer) return;
  if (fallbackSince == null) fallbackSince = Date.now();
  const run = async () => {
    try {
      const res = await fetch(`${API_BASE}/matches/live`);
      if (!res.ok) return;
      const data = (await res.json()) as { matches: LiveMatch[] };
      if (data.matches) scheduleUpdate(data);
    } catch {}
    const since = fallbackSince ?? Date.now();
    const elapsed = Date.now() - since;
    const nextDelay =
      elapsed < 60_000 ? HTTP_FALLBACK_INTERVAL_MS :
      elapsed < 300_000 ? 5_000 :
      10_000;
    fallbackTimer = setTimeout(run, nextDelay);
  };
  fallbackTimer = setTimeout(run, HTTP_FALLBACK_INTERVAL_MS);
}

function connect() {
  const wsUrl = API_BASE
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    + "/matches/ws";

  try {
    const sock = new WebSocket(wsUrl);
    ws = sock;

    sock.onopen = () => {
      setState({ connected: true });
      reconnectDelay = RECONNECT_DELAY_MS;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      fallbackSince = null;
    };

    sock.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as any;
        if (msg && typeof msg === "object" && msg.type === "snapshot" && Array.isArray(msg.matches)) {
          scheduleUpdate({ matches: msg.matches as LiveMatch[] });
          return;
        }
        if (msg && typeof msg === "object" && msg.type === "update" && typeof msg.matchId === "string" && msg.delta && typeof msg.delta === "object") {
          const matchId = String(msg.matchId);
          const idx = state.matches.findIndex((m) => String(m.id) === matchId);
          if (idx < 0) return;
          const next = [...state.matches];
          next[idx] = { ...(next[idx] as any), ...(msg.delta as any) };
          state = { ...state, matches: next, lastUpdated: Date.now() };
          emit();
          return;
        }
        if (Array.isArray(msg.matches)) scheduleUpdate({ matches: msg.matches as LiveMatch[] });
      } catch {}
    };

    sock.onerror = () => {
      setState({ connected: false });
    };

    sock.onclose = () => {
      setState({ connected: false });
      ws = null;
      startFallbackPolling();
      reconnectTimer = setTimeout(() => {
        clearTimers();
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        connect();
      }, reconnectDelay);
    };
  } catch {
    setState({ connected: false });
    startFallbackPolling();
  }
}

function ensureStarted() {
  if (started) return;
  started = true;
  fetch(`${API_BASE}/matches/live`)
    .then((r) => r.json())
    .then((d: { matches: LiveMatch[] }) => {
      if (d.matches) {
        state = { ...state, matches: d.matches, lastUpdated: Date.now() };
        emit();
      }
    })
    .catch(() => {});
  connect();
}

function cleanup() {
  clearTimers();
  if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
  pending = null;
  ws?.close();
  ws = null;
  started = false;
  reconnectDelay = RECONNECT_DELAY_MS;
  fallbackSince = null;
  setState({ connected: false });
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureStarted();
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) cleanup();
  };
}

function getSnapshot(): StoreState {
  return state;
}

export function useLiveMatches(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
