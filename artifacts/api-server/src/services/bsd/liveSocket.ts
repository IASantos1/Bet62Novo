import WebSocket from "ws";
import { CONFIG } from "../../lib/config.js";
import type { BSDEvent } from "./client.js";

type SocketSide = "home" | "away" | null;

type Candidate = {
  eventId: string;
  liveWebsocket: boolean;
  websocketPlus: boolean;
  priority: number;
  hintUntil: number;
};

export type BSDLiveSocketBallPosition = {
  x: number;
  y: number;
  side: SocketSide;
  situation: string;
  updatedAt: number;
};

export type BSDLiveSocketOverlay = {
  eventId: string;
  source: "basic" | "full" | null;
  websocketPlus: boolean;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  second?: number;
  status?: string;
  odds?: Record<string, unknown> | null;
  ballPosition?: BSDLiveSocketBallPosition | null;
  updatedAt: number;
};

const FOOTBALL_WS_URL =
  process.env["BZZOIRO_FOOTBALL_WS_URL"]?.trim() ||
  "wss://sports.bzzoiro.com/live/football/";

const MAX_SUBSCRIPTIONS = 10;
const HINT_TTL_MS = 5 * 60_000;
const RECONNECT_DELAY_MS = 3_000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectScheduled = false;
let disabledUntil = 0;

const candidates = new Map<string, Candidate>();
const desiredIds = new Set<string>();
const subscribedIds = new Set<string>();
const overlays = new Map<string, BSDLiveSocketOverlay>();

function wsEnabled(): boolean {
  return Boolean(CONFIG.BZZOIRO_API_TOKEN && FOOTBALL_WS_URL);
}

function nowMs(): number {
  return Date.now();
}

function clampPct(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function toUiX(rawX: unknown, side: SocketSide): number {
  const x = clampPct(rawX);
  return side === "away" ? 100 - x : x;
}

function toUiY(rawY: unknown): number {
  return clampPct(rawY);
}

function toSide(value: unknown): SocketSide {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "home") return "home";
  if (raw === "away") return "away";
  return null;
}

function parseNum(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

function parseStatus(value: unknown): string | undefined {
  const status = String(value ?? "").trim().toLowerCase();
  return status || undefined;
}

function overlayFor(eventId: string): BSDLiveSocketOverlay {
  const current = overlays.get(eventId);
  if (current) return current;
  const created: BSDLiveSocketOverlay = {
    eventId,
    source: null,
    websocketPlus: false,
    updatedAt: nowMs(),
  };
  overlays.set(eventId, created);
  return created;
}

function updateOverlay(
  eventId: string,
  updater: (current: BSDLiveSocketOverlay) => BSDLiveSocketOverlay,
): void {
  overlays.set(eventId, updater(overlayFor(eventId)));
}

function pruneHints(): void {
  const now = nowMs();
  for (const [eventId, candidate] of candidates.entries()) {
    const liveCandidate = candidate.liveWebsocket;
    if (candidate.hintUntil <= now && !liveCandidate) {
      candidates.delete(eventId);
      desiredIds.delete(eventId);
      subscribedIds.delete(eventId);
      overlays.delete(eventId);
    }
  }
}

function rankedCandidates(): Candidate[] {
  pruneHints();
  const now = nowMs();
  return Array.from(candidates.values())
    .filter((candidate) => candidate.liveWebsocket || candidate.hintUntil > now)
    .sort((a, b) => {
      const hintedA = a.hintUntil > now ? 1 : 0;
      const hintedB = b.hintUntil > now ? 1 : 0;
      if (hintedA !== hintedB) return hintedB - hintedA;
      if (a.websocketPlus !== b.websocketPlus) return Number(b.websocketPlus) - Number(a.websocketPlus);
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.eventId.localeCompare(b.eventId);
    });
}

function computeDesiredIds(): string[] {
  return rankedCandidates()
    .slice(0, MAX_SUBSCRIPTIONS)
    .map((candidate) => candidate.eventId);
}

function socketOpen(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

function sendFrame(frame: Record<string, unknown>): void {
  if (!socketOpen()) return;
  try {
    socket!.send(JSON.stringify(frame));
  } catch (error) {
    console.error("[BSD WS] send failed", error);
  }
}

function subscribe(eventId: string): void {
  sendFrame({ action: "subscribe", event_id: Number(eventId) || eventId });
}

function unsubscribe(eventId: string): void {
  sendFrame({ action: "unsubscribe", event_id: Number(eventId) || eventId });
}

function closeSocket(): void {
  if (!socket) return;
  try {
    socket.close();
  } catch {}
  socket = null;
  subscribedIds.clear();
}

function scheduleReconnect(): void {
  if (reconnectScheduled || reconnectTimer || desiredIds.size === 0) return;
  reconnectScheduled = true;
  reconnectTimer = setTimeout(() => {
    reconnectScheduled = false;
    reconnectTimer = null;
    ensureConnected();
  }, RECONNECT_DELAY_MS);
}

function reconcileSubscriptions(): void {
  const nextDesired = new Set(computeDesiredIds());
  for (const eventId of desiredIds) {
    if (!nextDesired.has(eventId) && subscribedIds.has(eventId)) {
      unsubscribe(eventId);
      subscribedIds.delete(eventId);
    }
  }
  desiredIds.clear();
  for (const eventId of nextDesired) desiredIds.add(eventId);

  if (desiredIds.size === 0) {
    closeSocket();
    return;
  }

  ensureConnected();
  if (!socketOpen()) return;

  for (const eventId of desiredIds) {
    if (!subscribedIds.has(eventId)) subscribe(eventId);
  }
}

function handleEventFrame(eventId: string, frame: Record<string, unknown>): void {
  const time =
    frame["time"] && typeof frame["time"] === "object"
      ? (frame["time"] as Record<string, unknown>)
      : {};
  const score =
    frame["score"] && typeof frame["score"] === "object"
      ? (frame["score"] as Record<string, unknown>)
      : {};

  updateOverlay(eventId, (current) => ({
    ...current,
    source: current.source,
    websocketPlus:
      current.websocketPlus || frame["websocket_plus"] === true || current.source === "full",
    homeScore: parseNum(score["home"]) ?? current.homeScore,
    awayScore: parseNum(score["away"]) ?? current.awayScore,
    minute: parseNum(time["minute"]) ?? current.minute,
    second: parseNum(time["second"]) ?? current.second,
    status: parseStatus(time["status"]) ?? current.status,
    updatedAt: nowMs(),
  }));
}

function handleOddsFrame(eventId: string, frame: Record<string, unknown>): void {
  const odds =
    frame["odds"] && typeof frame["odds"] === "object"
      ? (frame["odds"] as Record<string, unknown>)
      : null;
  updateOverlay(eventId, (current) => ({
    ...current,
    odds,
    updatedAt: nowMs(),
  }));
}

function handleLivedataFrame(eventId: string, frame: Record<string, unknown>): void {
  const side = toSide(frame["side"]);
  const coordinates = Array.isArray(frame["coordinates"])
    ? frame["coordinates"]
    : [];
  const point =
    coordinates.find(
      (item) =>
        item &&
        typeof item === "object" &&
        ("x" in (item as Record<string, unknown>) || "y" in (item as Record<string, unknown>)),
    ) ?? null;
  if (!point || typeof point !== "object") return;
  const raw = point as Record<string, unknown>;
  const uts = parseNum(frame["uts"]);
  updateOverlay(eventId, (current) => ({
    ...current,
    ballPosition: {
      x: toUiX(raw["x"], side),
      y: toUiY(raw["y"]),
      side,
      situation: String(frame["situation"] ?? "").trim(),
      updatedAt: uts != null ? Math.round(uts * 1000) : nowMs(),
    },
    updatedAt: nowMs(),
  }));
}

function handleActionFrame(eventId: string, frame: Record<string, unknown>): void {
  const side = toSide(frame["team"]);
  const ts = parseNum(frame["ts"]);
  updateOverlay(eventId, (current) => ({
    ...current,
    websocketPlus: true,
    minute: parseNum(frame["minute"]) ?? current.minute,
    second: parseNum(frame["second"]) ?? current.second,
    ballPosition: {
      x: toUiX(frame["x"], side),
      y: toUiY(frame["y"]),
      side,
      situation: String(frame["action_type"] ?? "").trim(),
      updatedAt: ts != null ? Math.round(ts) : nowMs(),
    },
    updatedAt: nowMs(),
  }));
}

function handleSubscribedFrame(eventId: string, frame: Record<string, unknown>): void {
  subscribedIds.add(eventId);
  const sourceRaw = String(frame["source"] ?? "").trim().toLowerCase();
  const source = sourceRaw === "full" || sourceRaw === "basic" ? sourceRaw : null;
  updateOverlay(eventId, (current) => ({
    ...current,
    source,
    websocketPlus: current.websocketPlus || source === "full",
    updatedAt: nowMs(),
  }));

  if (frame["event"] && typeof frame["event"] === "object") {
    handleEventFrame(eventId, frame["event"] as Record<string, unknown>);
  }
  if (frame["odds"] && typeof frame["odds"] === "object") {
    handleOddsFrame(eventId, { odds: frame["odds"] });
  }
  if (Array.isArray(frame["livedata"])) {
    const latest = [...frame["livedata"]]
      .reverse()
      .find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
    if (latest) handleLivedataFrame(eventId, latest);
  }
  if (Array.isArray(frame["history"])) {
    const latestAction = [...frame["history"]]
      .reverse()
      .find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
    if (latestAction && latestAction["x"] != null && latestAction["y"] != null) {
      handleActionFrame(eventId, latestAction);
    }
  }
}

function handleErrorFrame(frame: Record<string, unknown>): void {
  const code = String(frame["code"] ?? "").trim().toLowerCase();
  const eventIdRaw = frame["event_id"];
  const eventId =
    eventIdRaw == null || `${eventIdRaw}`.trim() === ""
      ? ""
      : String(eventIdRaw).trim();

  if (eventId) {
    subscribedIds.delete(eventId);
    if (code === "not_tracked") {
      const candidate = candidates.get(eventId);
      if (candidate) {
        candidate.liveWebsocket = false;
        candidates.set(eventId, candidate);
      }
    }
  }

  console.warn("[BSD WS] error frame", {
    code,
    eventId: eventId || undefined,
    message: String(frame["message"] ?? ""),
  });
}

function handleMessage(raw: WebSocket.RawData): void {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = String(frame["type"] ?? "").trim().toLowerCase();
  const eventIdRaw = frame["event_id"];
  const eventId =
    eventIdRaw == null || `${eventIdRaw}`.trim() === ""
      ? ""
      : String(eventIdRaw).trim();

  if (type === "error") {
    handleErrorFrame(frame);
    return;
  }

  if (type === "subscribed" && eventId) {
    handleSubscribedFrame(eventId, frame);
    return;
  }

  if (!eventId) return;

  if (type === "event") {
    handleEventFrame(eventId, frame);
    return;
  }

  if (type === "odds" || type === "odds_book") {
    handleOddsFrame(eventId, frame);
    return;
  }

  if (type === "livedata") {
    handleLivedataFrame(eventId, frame);
    return;
  }

  if (type === "action") {
    handleActionFrame(eventId, frame);
  }
}

function ensureConnected(): void {
  if (!wsEnabled()) return;
  if (desiredIds.size === 0) return;
  if (disabledUntil > nowMs()) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(FOOTBALL_WS_URL, ["token", CONFIG.BZZOIRO_API_TOKEN]);

  socket.on("open", () => {
    subscribedIds.clear();
    for (const eventId of desiredIds) subscribe(eventId);
  });

  socket.on("message", (raw) => {
    handleMessage(raw);
  });

  socket.on("error", (error) => {
    console.error("[BSD WS] socket error", error);
  });

  socket.on("close", (code, reason) => {
    const message = reason.toString();
    console.warn("[BSD WS] socket closed", { code, reason: message || undefined });
    socket = null;
    subscribedIds.clear();

    if (code === 4401) disabledUntil = nowMs() + 60 * 60_000;
    else if (code === 4402) disabledUntil = nowMs() + 15 * 60_000;
    else if (code === 4404) disabledUntil = nowMs() + 15 * 60_000;

    scheduleReconnect();
  });
}

export function syncBsdFootballLiveSocketCandidates(
  events: Array<Pick<BSDEvent, "id" | "live_websocket" | "websocket_plus">>,
): void {
  if (!wsEnabled()) return;

  const liveIds = new Set<string>();
  events.forEach((event, index) => {
    const eventId = String(event.id ?? "").trim();
    if (!eventId) return;
    liveIds.add(eventId);
    const current = candidates.get(eventId);
    candidates.set(eventId, {
      eventId,
      liveWebsocket: event.live_websocket === true,
      websocketPlus: event.websocket_plus === true,
      priority: Math.min(current?.priority ?? index, index),
      hintUntil: current?.hintUntil ?? 0,
    });
  });

  for (const [eventId, candidate] of candidates.entries()) {
    if (!liveIds.has(eventId) && candidate.hintUntil <= nowMs()) {
      candidates.delete(eventId);
      desiredIds.delete(eventId);
      subscribedIds.delete(eventId);
      overlays.delete(eventId);
    }
  }

  reconcileSubscriptions();
}

export function hintBsdFootballLiveSocketEvent(
  event:
    | string
    | number
    | Pick<BSDEvent, "id" | "live_websocket" | "websocket_plus">,
): void {
  if (!wsEnabled()) return;
  const eventId =
    typeof event === "string" || typeof event === "number"
      ? String(event).trim()
      : String(event.id ?? "").trim();
  if (!eventId) return;
  const current = candidates.get(eventId);
  candidates.set(eventId, {
    eventId,
    liveWebsocket:
      typeof event === "object"
        ? event.live_websocket !== false
        : current?.liveWebsocket ?? true,
    websocketPlus:
      typeof event === "object"
        ? event.websocket_plus === true
        : current?.websocketPlus ?? false,
    priority: -10_000,
    hintUntil: nowMs() + HINT_TTL_MS,
  });
  reconcileSubscriptions();
}

export function getBsdFootballLiveSocketOverlay(
  eventId: string | number,
): BSDLiveSocketOverlay | null {
  const key = String(eventId).trim();
  if (!key) return null;
  return overlays.get(key) ?? null;
}
