/**
 * GET /api/tracking/:matchId
 *
 * Serve posições em tempo real (simulação realista baseada em estado de jogo).
 *
 * Query params:
 *   sport        - football | basketball | tennis | hockey | baseball | volleyball
 *   homeScore    - marcador casa
 *   awayScore    - marcador fora
 *   minute       - minuto do jogo
 *
 * Resposta JSON:
 *   { matchId, timestamp, ball: {x,y}, players: [{id,team,x,y,isGK,num}], phase }
 *
 * Coordenadas normalizadas 0-1 (x: 0 = esquerda, 1 = direita; y: 0 = cima, 1 = baixo)
 *
 * INTEGRAÇÃO COM DADOS REAIS (SofaScore ou outro provider):
 *   Substituir a função `updateState()` para escrever diretamente em
 *   state.ball.{x,y} e state.players[i].{x,y} a partir de coordenadas reais.
 *   O cliente mobile não precisa de alterações — já consome este formato.
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrackingPlayer {
  id: number;
  team: "home" | "away";
  x: number;        // posição atual 0-1
  y: number;
  formX: number;    // posição de formação 0-1
  formY: number;
  isGK: boolean;
  num: number;
  roleWeight: number; // quanto o jogador segue a bola (GK≈0.04, ST≈0.55)
}

type PhaseType = "build" | "attack" | "counter" | "defend" | "setpiece";

interface TrackingState {
  matchId: string;
  sport: string;
  ball: { x: number; y: number };
  players: TrackingPlayer[];
  homeScore: number;
  awayScore: number;
  minute: number;
  phaseType: PhaseType;
  phaseTimer: number;
  tick: number;
  seed: number;
  lastAccess: number;
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function sr(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ─── Formation data ───────────────────────────────────────────────────────────
// Coordenadas formação (home ataca para x=1, away ataca para x=0)

type FormDef = Omit<TrackingPlayer, "x" | "y">;

const FORM: Record<string, { home: FormDef[]; away: FormDef[] }> = {
  football: {
    home: [
      { id: 0,  team: "home", formX: 0.06, formY: 0.50, isGK: true,  num: 1,  roleWeight: 0.04 },
      { id: 1,  team: "home", formX: 0.20, formY: 0.18, isGK: false, num: 2,  roleWeight: 0.20 },
      { id: 2,  team: "home", formX: 0.18, formY: 0.38, isGK: false, num: 5,  roleWeight: 0.14 },
      { id: 3,  team: "home", formX: 0.18, formY: 0.62, isGK: false, num: 3,  roleWeight: 0.14 },
      { id: 4,  team: "home", formX: 0.20, formY: 0.82, isGK: false, num: 6,  roleWeight: 0.20 },
      { id: 5,  team: "home", formX: 0.40, formY: 0.50, isGK: false, num: 4,  roleWeight: 0.30 },
      { id: 6,  team: "home", formX: 0.38, formY: 0.28, isGK: false, num: 8,  roleWeight: 0.38 },
      { id: 7,  team: "home", formX: 0.38, formY: 0.72, isGK: false, num: 10, roleWeight: 0.42 },
      { id: 8,  team: "home", formX: 0.63, formY: 0.18, isGK: false, num: 7,  roleWeight: 0.48 },
      { id: 9,  team: "home", formX: 0.63, formY: 0.82, isGK: false, num: 11, roleWeight: 0.48 },
      { id: 10, team: "home", formX: 0.73, formY: 0.50, isGK: false, num: 9,  roleWeight: 0.55 },
    ],
    away: [
      { id: 11, team: "away", formX: 0.94, formY: 0.50, isGK: true,  num: 1,  roleWeight: 0.04 },
      { id: 12, team: "away", formX: 0.80, formY: 0.82, isGK: false, num: 2,  roleWeight: 0.20 },
      { id: 13, team: "away", formX: 0.82, formY: 0.62, isGK: false, num: 5,  roleWeight: 0.14 },
      { id: 14, team: "away", formX: 0.82, formY: 0.38, isGK: false, num: 3,  roleWeight: 0.14 },
      { id: 15, team: "away", formX: 0.80, formY: 0.18, isGK: false, num: 6,  roleWeight: 0.20 },
      { id: 16, team: "away", formX: 0.60, formY: 0.50, isGK: false, num: 4,  roleWeight: 0.30 },
      { id: 17, team: "away", formX: 0.62, formY: 0.72, isGK: false, num: 8,  roleWeight: 0.38 },
      { id: 18, team: "away", formX: 0.62, formY: 0.28, isGK: false, num: 10, roleWeight: 0.42 },
      { id: 19, team: "away", formX: 0.37, formY: 0.82, isGK: false, num: 7,  roleWeight: 0.48 },
      { id: 20, team: "away", formX: 0.37, formY: 0.18, isGK: false, num: 11, roleWeight: 0.48 },
      { id: 21, team: "away", formX: 0.27, formY: 0.50, isGK: false, num: 9,  roleWeight: 0.55 },
    ],
  },
  basketball: {
    home: [
      { id: 0, team: "home", formX: 0.12, formY: 0.50, isGK: false, num: 15, roleWeight: 0.55 },
      { id: 1, team: "home", formX: 0.22, formY: 0.26, isGK: false, num: 23, roleWeight: 0.50 },
      { id: 2, team: "home", formX: 0.22, formY: 0.74, isGK: false, num: 3,  roleWeight: 0.50 },
      { id: 3, team: "home", formX: 0.38, formY: 0.50, isGK: false, num: 1,  roleWeight: 0.60 },
      { id: 4, team: "home", formX: 0.48, formY: 0.20, isGK: false, num: 11, roleWeight: 0.55 },
    ],
    away: [
      { id: 5, team: "away", formX: 0.88, formY: 0.50, isGK: false, num: 15, roleWeight: 0.55 },
      { id: 6, team: "away", formX: 0.78, formY: 0.74, isGK: false, num: 23, roleWeight: 0.50 },
      { id: 7, team: "away", formX: 0.78, formY: 0.26, isGK: false, num: 3,  roleWeight: 0.50 },
      { id: 8, team: "away", formX: 0.62, formY: 0.50, isGK: false, num: 1,  roleWeight: 0.60 },
      { id: 9, team: "away", formX: 0.52, formY: 0.80, isGK: false, num: 11, roleWeight: 0.55 },
    ],
  },
  tennis: {
    home: [{ id: 0, team: "home", formX: 0.25, formY: 0.80, isGK: false, num: 1, roleWeight: 0.75 }],
    away: [{ id: 1, team: "away", formX: 0.75, formY: 0.20, isGK: false, num: 1, roleWeight: 0.75 }],
  },
  hockey: {
    home: [
      { id: 0, team: "home", formX: 0.05, formY: 0.50, isGK: true,  num: 31, roleWeight: 0.04 },
      { id: 1, team: "home", formX: 0.22, formY: 0.26, isGK: false, num: 2,  roleWeight: 0.24 },
      { id: 2, team: "home", formX: 0.22, formY: 0.74, isGK: false, num: 5,  roleWeight: 0.24 },
      { id: 3, team: "home", formX: 0.42, formY: 0.50, isGK: false, num: 11, roleWeight: 0.45 },
      { id: 4, team: "home", formX: 0.50, formY: 0.22, isGK: false, num: 10, roleWeight: 0.52 },
      { id: 5, team: "home", formX: 0.50, formY: 0.78, isGK: false, num: 44, roleWeight: 0.52 },
    ],
    away: [
      { id: 6,  team: "away", formX: 0.95, formY: 0.50, isGK: true,  num: 31, roleWeight: 0.04 },
      { id: 7,  team: "away", formX: 0.78, formY: 0.74, isGK: false, num: 2,  roleWeight: 0.24 },
      { id: 8,  team: "away", formX: 0.78, formY: 0.26, isGK: false, num: 5,  roleWeight: 0.24 },
      { id: 9,  team: "away", formX: 0.58, formY: 0.50, isGK: false, num: 11, roleWeight: 0.45 },
      { id: 10, team: "away", formX: 0.50, formY: 0.78, isGK: false, num: 10, roleWeight: 0.52 },
      { id: 11, team: "away", formX: 0.50, formY: 0.22, isGK: false, num: 44, roleWeight: 0.52 },
    ],
  },
  baseball: {
    home: [
      { id: 0, team: "home", formX: 0.50, formY: 0.78, isGK: true,  num: 24, roleWeight: 0.10 },
    ],
    away: [
      { id: 1, team: "away", formX: 0.50, formY: 0.22, isGK: false, num: 21, roleWeight: 0.75 },
      { id: 2, team: "away", formX: 0.34, formY: 0.47, isGK: false, num: 14, roleWeight: 0.50 },
      { id: 3, team: "away", formX: 0.66, formY: 0.47, isGK: false, num: 23, roleWeight: 0.50 },
      { id: 4, team: "away", formX: 0.42, formY: 0.58, isGK: false, num: 3,  roleWeight: 0.40 },
      { id: 5, team: "away", formX: 0.58, formY: 0.58, isGK: false, num: 8,  roleWeight: 0.40 },
      { id: 6, team: "away", formX: 0.37, formY: 0.51, isGK: false, num: 1,  roleWeight: 0.35 },
      { id: 7, team: "away", formX: 0.63, formY: 0.51, isGK: false, num: 45, roleWeight: 0.35 },
      { id: 8, team: "away", formX: 0.50, formY: 0.63, isGK: false, num: 17, roleWeight: 0.20 },
    ],
  },
  volleyball: {
    home: [
      { id: 0, team: "home", formX: 0.18, formY: 0.71, isGK: false, num: 1,  roleWeight: 0.50 },
      { id: 1, team: "home", formX: 0.50, formY: 0.71, isGK: false, num: 7,  roleWeight: 0.50 },
      { id: 2, team: "home", formX: 0.82, formY: 0.71, isGK: false, num: 10, roleWeight: 0.50 },
      { id: 3, team: "home", formX: 0.18, formY: 0.84, isGK: false, num: 14, roleWeight: 0.50 },
      { id: 4, team: "home", formX: 0.50, formY: 0.84, isGK: false, num: 3,  roleWeight: 0.50 },
      { id: 5, team: "home", formX: 0.82, formY: 0.84, isGK: false, num: 9,  roleWeight: 0.50 },
    ],
    away: [
      { id: 6,  team: "away", formX: 0.82, formY: 0.29, isGK: false, num: 1,  roleWeight: 0.50 },
      { id: 7,  team: "away", formX: 0.50, formY: 0.29, isGK: false, num: 7,  roleWeight: 0.50 },
      { id: 8,  team: "away", formX: 0.18, formY: 0.29, isGK: false, num: 10, roleWeight: 0.50 },
      { id: 9,  team: "away", formX: 0.82, formY: 0.16, isGK: false, num: 14, roleWeight: 0.50 },
      { id: 10, team: "away", formX: 0.50, formY: 0.16, isGK: false, num: 3,  roleWeight: 0.50 },
      { id: 11, team: "away", formX: 0.18, formY: 0.16, isGK: false, num: 9,  roleWeight: 0.50 },
    ],
  },
};

function buildPlayers(sport: string): TrackingPlayer[] {
  const f = FORM[sport] ?? FORM["football"]!;
  return [...f.home, ...f.away].map(p => ({ ...p, x: p.formX, y: p.formY }));
}

// ─── Ball target per phase ────────────────────────────────────────────────────

function ballTarget(state: TrackingState, t: number): [number, number] {
  const { sport, homeScore, awayScore, phaseType, seed, tick } = state;
  const r = (n: number) => sr(seed + n + tick * 3.7);
  const hw = homeScore > awayScore;

  if (sport === "football") {
    if (phaseType === "attack")   return [lerp(0.60, 0.95, r(t)),   lerp(0.12, 0.88, r(t + 1))];
    if (phaseType === "defend")   return [lerp(0.05, 0.42, r(t)),   lerp(0.12, 0.88, r(t + 2))];
    if (phaseType === "counter")  return [lerp(0.52, 0.90, r(t)),   lerp(0.10, 0.90, r(t + 3))];
    if (phaseType === "setpiece") {
      if (r(t + 4) > 0.5) return [r(t + 5) > 0.5 ? 0.985 : 0.015, r(t + 6) > 0.5 ? 0.03 : 0.97];
      return [lerp(0.15, 0.85, r(t + 7)), lerp(0.12, 0.88, r(t + 8))];
    }
    // build-up: bias toward winning half
    const bias = hw ? 0.60 : 0.40;
    return [lerp(0.28, 0.72, r(t) * bias + r(t + 9) * (1 - bias)), lerp(0.12, 0.88, r(t + 10))];
  }

  if (sport === "basketball") {
    if (hw) return [lerp(0.05, 0.44, r(t)), lerp(0.18, 0.82, r(t + 1))];
    return [lerp(0.56, 0.95, r(t)), lerp(0.18, 0.82, r(t + 2))];
  }

  if (sport === "tennis") {
    const side = tick % 4 < 2;
    return side
      ? [lerp(0.10, 0.46, r(t)), lerp(0.14, 0.86, r(t + 1))]
      : [lerp(0.54, 0.90, r(t)), lerp(0.14, 0.86, r(t + 2))];
  }

  if (sport === "hockey") {
    return [lerp(0.06, 0.94, r(t)), lerp(0.07, 0.93, r(t + 1))];
  }

  if (sport === "baseball") {
    const cx = 0.5, cy = 0.63, bl = 0.31;
    const pts: [number, number][] = [
      [cx, cy - bl * 2.3], [cx - bl, cy - bl], [cx + bl, cy - bl],
      [cx - bl * 0.5, cy - bl * 0.5], [cx + bl * 0.5, cy - bl * 0.5],
    ];
    const i = Math.floor(r(t) * pts.length);
    const pt = pts[i]!;
    return [pt[0] + (r(t + 1) - 0.5) * 0.12, pt[1] + (r(t + 2) - 0.5) * 0.10];
  }

  if (sport === "volleyball") {
    const rally = tick % 6;
    if (rally < 2) return [lerp(0.10, 0.47, r(t)), lerp(0.55, 0.92, r(t + 1))];
    if (rally < 4) return [lerp(0.53, 0.90, r(t)), lerp(0.08, 0.45, r(t + 2))];
    return [0.5, lerp(0.42, 0.58, r(t + 3))];
  }

  return [lerp(0.1, 0.9, r(t)), lerp(0.1, 0.9, r(t + 1))];
}

// ─── Simulation engine ────────────────────────────────────────────────────────

const matchStates = new Map<string, TrackingState>();

function initState(matchId: string, sport: string, homeScore: number, awayScore: number, minute: number): TrackingState {
  const seed = matchId.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  return {
    matchId, sport,
    ball: { x: 0.5, y: 0.5 },
    players: buildPlayers(sport),
    homeScore, awayScore, minute,
    phaseType: "build",
    phaseTimer: 0,
    tick: 0, seed,
    lastAccess: Date.now(),
  };
}

function stepState(state: TrackingState): void {
  state.tick++;
  const t = state.tick;
  const r = (n: number) => sr(state.seed + n + t * 5.3);

  // ── Phase transitions ──
  const phaseDuration = (state.sport === "tennis" || state.sport === "volleyball") ? 7 : 16;
  state.phaseTimer++;
  if (state.phaseTimer >= phaseDuration) {
    state.phaseTimer = 0;
    const roll = r(t * 0.71);
    const hw = state.homeScore > state.awayScore;
    const phases: PhaseType[] = ["build", "build", hw ? "attack" : "defend", hw ? "defend" : "attack", "counter", "setpiece"];
    state.phaseType = phases[Math.floor(roll * phases.length)] ?? "build";
  }

  // ── Ball smooth movement ──
  const [tx, ty] = ballTarget(state, t);
  state.ball.x = clamp(lerp(state.ball.x, tx, 0.20) + (r(t * 3.1) - 0.5) * 0.012, 0.01, 0.99);
  state.ball.y = clamp(lerp(state.ball.y, ty, 0.20) + (r(t * 2.7) - 0.5) * 0.012, 0.01, 0.99);

  // ── Player movement (formation + ball attraction) ──
  const scoreDiff = state.homeScore - state.awayScore;

  for (const p of state.players) {
    // Shift formation based on score
    let anchorX = p.formX;
    if (!p.isGK && state.sport !== "tennis" && state.sport !== "volleyball") {
      const push = clamp(scoreDiff * 0.04, -0.12, 0.12);
      anchorX = clamp(anchorX + (p.team === "home" ? push : -push), 0.04, 0.96);
    }
    const anchorY = p.formY;

    // Target = anchor + ball pull
    const tpx = lerp(anchorX, state.ball.x, p.roleWeight * 0.48);
    const tpy = lerp(anchorY, state.ball.y, p.roleWeight * 0.28);

    // Per-player jitter so they don't stack
    const jx = (r(p.id * 13.7 + t * 0.31) - 0.5) * 0.022;
    const jy = (r(p.id * 7.3  + t * 0.47) - 0.5) * 0.022;

    p.x = clamp(lerp(p.x, tpx + jx, 0.11), 0.02, 0.98);
    p.y = clamp(lerp(p.y, tpy + jy, 0.11), 0.02, 0.98);
  }
}

// Tick all active states every 500 ms
setInterval(() => {
  if (matchStates.size === 0) return;
  const now = Date.now();
  for (const [id, state] of matchStates.entries()) {
    if (now - state.lastAccess > 3 * 60_000) { matchStates.delete(id); continue; }
    stepState(state);
  }
}, 500);

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/:matchId", (req, res) => {
  const matchId = String(req.params["matchId"]);
  const sport    = String(req.query["sport"]      ?? "football");
  const homeScore = Number(req.query["homeScore"] ?? 0);
  const awayScore = Number(req.query["awayScore"] ?? 0);
  const minute    = Number(req.query["minute"]    ?? 0);

  if (!matchStates.has(matchId)) {
    matchStates.set(matchId, initState(matchId, sport, homeScore, awayScore, minute));
  }

  const state = matchStates.get(matchId)!;
  state.lastAccess = Date.now();
  state.homeScore  = homeScore;
  state.awayScore  = awayScore;
  state.minute     = minute;

  res.json({
    matchId,
    timestamp: Date.now(),
    ball: { x: state.ball.x, y: state.ball.y },
    players: state.players.map(p => ({
      id: p.id, team: p.team,
      x: p.x, y: p.y,
      isGK: p.isGK, num: p.num,
    })),
    phase: state.phaseType,
  });
});

export default router;
