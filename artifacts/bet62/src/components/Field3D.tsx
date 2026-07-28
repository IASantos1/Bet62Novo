import { useRef, useEffect, useState } from "react";

// Real 3D-projected mini pitch (canvas), replacing the CSS-transform version.
// Camera/stands/boards/markings/goals are exactly the reference script the
// user provided. Statpal gives us no real ball/player position telemetry —
// only discrete signals (score, corners, cards) — so the ball below is a
// dramatization: it patrols midfield when nothing is happening, and eases
// toward a plausible spot (a goal / a corner arc / the conceding team's
// half) whenever one of those signals changes, the same behavior as before,
// just rendered in the 3D world instead of as a 2D CSS overlay.

// World dimensions (metres, scaled)
const FL = 52.5; // half field length
const FW = 34; // half field width
const BOARD_H = 3.8;
const BOARD_D = 2.0;
const GW = 3.66; // half goal width
const GH = 2.44;
const GD = 2.2;
const BO = 3.2; // gap between field edge and board

type Vec2 = { x: number; z: number };

const CENTER: Vec2 = { x: 0, z: 0 };
const IDLE_WAYPOINTS: Vec2[] = [
  { x: 0, z: 0 },
  { x: -9, z: -7 },
  { x: 11, z: 8 },
  { x: 0, z: 10 },
];
// Home attacks toward +x (away goal); away attacks toward -x (home goal).
const HOME_GOAL: Vec2 = { x: -FL + 2, z: 0 };
const AWAY_GOAL: Vec2 = { x: FL - 2, z: 0 };
const CORNER_SPOTS: Vec2[] = [
  { x: -FL + 3, z: -FW + 3 },
  { x: FL - 3, z: -FW + 3 },
  { x: -FL + 3, z: FW - 3 },
  { x: FL - 3, z: FW - 3 },
];

export interface Field3DProps {
  homeScore: number;
  awayScore: number;
  cornersTotal?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  homeTeam: string;
  awayTeam: string;
}

export default function Field3D({
  homeScore,
  awayScore,
  cornersTotal,
  yellowCardsHome,
  yellowCardsAway,
  redCardsHome,
  redCardsAway,
  homeTeam,
  awayTeam,
}: Field3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [event, setEvent] = useState<{
    label: string;
    team: "home" | "away" | null;
  } | null>(null);

  // Ball state lives in refs (not React state) since it's mutated every
  // animation frame — putting it in useState would re-render on every tick.
  const ballTargetRef = useRef<Vec2>(CENTER);
  const ballCurrentRef = useRef<Vec2>(CENTER);
  const eventColorRef = useRef<string>("#f97316");

  const prevHomeScore = useRef(homeScore);
  const prevAwayScore = useRef(awayScore);
  const prevCorners = useRef(cornersTotal ?? 0);
  const prevYcHome = useRef(yellowCardsHome ?? 0);
  const prevYcAway = useRef(yellowCardsAway ?? 0);
  const prevRcHome = useRef(redCardsHome ?? 0);
  const prevRcAway = useRef(redCardsAway ?? 0);
  const idleStepRef = useRef(0);
  const eventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerEvent = (
    pos: Vec2,
    team: "home" | "away" | null,
    label: string,
    color: string,
  ) => {
    if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
    ballTargetRef.current = pos;
    eventColorRef.current = color;
    setEvent({ label, team });
    eventTimeoutRef.current = setTimeout(() => {
      setEvent(null);
      ballTargetRef.current = CENTER;
      eventTimeoutRef.current = null;
    }, 2800);
  };

  useEffect(() => {
    if (homeScore > prevHomeScore.current) {
      triggerEvent(AWAY_GOAL, "home", "GOLO!", "#22c55e");
    } else if (awayScore > prevAwayScore.current) {
      triggerEvent(HOME_GOAL, "away", "GOLO!", "#22c55e");
    }
    prevHomeScore.current = homeScore;
    prevAwayScore.current = awayScore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScore, awayScore]);

  useEffect(() => {
    const c = cornersTotal ?? 0;
    if (c > prevCorners.current) {
      const spot = CORNER_SPOTS[Math.floor(Math.random() * CORNER_SPOTS.length)]!;
      triggerEvent(spot, null, "ESCANTEIO", "#f97316");
    }
    prevCorners.current = c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cornersTotal]);

  useEffect(() => {
    const yh = yellowCardsHome ?? 0;
    const ya = yellowCardsAway ?? 0;
    const rh = redCardsHome ?? 0;
    const ra = redCardsAway ?? 0;
    if (rh > prevRcHome.current) {
      triggerEvent({ x: -18, z: 0 }, "home", "CARTÃO VERMELHO", "#ef4444");
    } else if (ra > prevRcAway.current) {
      triggerEvent({ x: 18, z: 0 }, "away", "CARTÃO VERMELHO", "#ef4444");
    } else if (yh > prevYcHome.current) {
      triggerEvent({ x: -18, z: 0 }, "home", "CARTÃO AMARELO", "#eab308");
    } else if (ya > prevYcAway.current) {
      triggerEvent({ x: 18, z: 0 }, "away", "CARTÃO AMARELO", "#eab308");
    }
    prevYcHome.current = yh;
    prevYcAway.current = ya;
    prevRcHome.current = rh;
    prevRcAway.current = ra;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yellowCardsHome, yellowCardsAway, redCardsHome, redCardsAway]);

  useEffect(() => {
    if (event) return;
    const id = setInterval(() => {
      idleStepRef.current = (idleStepRef.current + 1) % IDLE_WAYPOINTS.length;
      ballTargetRef.current = IDLE_WAYPOINTS[idleStepRef.current]!;
    }, 3200);
    return () => clearInterval(id);
  }, [event]);

  useEffect(() => {
    return () => {
      if (eventTimeoutRef.current) clearTimeout(eventTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      canvas!.width = Math.round(r.width * devicePixelRatio);
      canvas!.height = Math.round(r.height * devicePixelRatio);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();

    function draw() {
      const ctx0 = canvas!.getContext("2d");
      if (!ctx0) {
        animId = requestAnimationFrame(draw);
        return;
      }
      // Rebind to a freshly-typed const: referencing the narrowed `ctx0`
      // from inside the nested poly/seg/grect/etc. function declarations
      // below doesn't retain the non-null narrowing (TS treats nested
      // function bodies conservatively), but a fresh const whose inferred
      // type is already non-nullable works fine in closures.
      const ctx: CanvasRenderingContext2D = ctx0;

      const W = canvas!.width;
      const H = canvas!.height;
      const dpr = devicePixelRatio || 1;

      const t = (performance.now() - start) / 1000;
      const camRY = Math.sin(t * 0.22) * 0.025;

      // Ease the ball toward its target every frame — independent of React's
      // render cycle, so it stays smooth regardless of prop update cadence.
      const b = ballCurrentRef.current;
      const bt = ballTargetRef.current;
      b.x += (bt.x - b.x) * 0.05;
      b.z += (bt.z - b.z) * 0.05;

      // ── Camera ──────────────────────────────────────────────────
      const CAM_Y = 56;
      const CAM_Z = 74;
      const FOCAL = Math.min(W, H) * 0.84;
      const CX = W / 2;
      // Shift field upward to leave room for near-side stands below
      const CY = H * 0.38;

      const camAngle = Math.atan2(CAM_Y, CAM_Z);
      const cosA = Math.cos(camAngle);
      const sinA = Math.sin(camAngle);

      function proj(wx: number, wy: number, wz: number): [number, number, number] {
        const rx = wx * Math.cos(camRY) + wz * Math.sin(camRY);
        const rz0 = -wx * Math.sin(camRY) + wz * Math.cos(camRY);
        const px = rx;
        const py = wy - CAM_Y;
        const pz = rz0 - CAM_Z;
        const vy = py * cosA - pz * sinA;
        const vz = -(py * sinA + pz * cosA);
        const vx = px;
        if (vz < 0.5) return [CX, CY, 0.5];
        return [CX + (FOCAL * vx) / vz, CY - (FOCAL * vy) / vz, vz];
      }

      function poly(pts: Array<[number, number, number]>, fill: string, alpha = 1) {
        if (pts.length < 3) return;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      function seg(
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
        c: string, w: number,
      ) {
        const p1 = proj(x1, y1, z1);
        const p2 = proj(x2, y2, z2);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }

      // ── 1. Background ───────────────────────────────────────────
      const bg = ctx.createRadialGradient(CX, H * 0.25, 0, CX, H * 0.25, W * 0.9);
      bg.addColorStop(0, "#18243c");
      bg.addColorStop(1, "#060a13");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ── 2. Far stands (drawn first — top of frame) ──────────────
      {
        const SX = FL + 20;
        const NUM = 5;
        const T_D = 5;
        const T_H = 3.2;
        const z0 = -(FW + BO + BOARD_D);
        for (let i = NUM - 1; i >= 0; i--) {
          const z_inner = z0 - i * T_D;
          const z_outer = z_inner - T_D;
          const y_lo = i * T_H;
          const y_hi = y_lo + T_H;
          const lum = 8 + i * 3;
          poly([
            proj(-SX, y_lo, z_inner), proj(SX, y_lo, z_inner),
            proj(SX, y_lo, z_outer), proj(-SX, y_lo, z_outer),
          ], `hsl(225,35%,${lum}%)`);
          poly([
            proj(-SX, y_lo, z_inner), proj(SX, y_lo, z_inner),
            proj(SX, y_hi, z_inner), proj(-SX, y_hi, z_inner),
          ], `hsl(225,35%,${lum - 3}%)`);
        }
      }

      // ── 3. Left stands ──────────────────────────────────────────
      {
        const SZ = FW + BO + BOARD_D + 8;
        const NUM = 4;
        const T_D = 4.5;
        const T_H = 3.2;
        const x0 = -(FL + BO + BOARD_D);
        for (let i = 0; i < NUM; i++) {
          const x_inner = x0 - i * T_D;
          const x_outer = x_inner - T_D;
          const y_lo = i * T_H;
          const y_hi = y_lo + T_H;
          const lum = 8 + i * 2;
          poly([
            proj(x_inner, y_lo, -SZ), proj(x_inner, y_lo, SZ),
            proj(x_outer, y_lo, SZ), proj(x_outer, y_lo, -SZ),
          ], `hsl(225,35%,${lum}%)`);
          poly([
            proj(x_inner, y_lo, -SZ), proj(x_inner, y_lo, SZ),
            proj(x_inner, y_hi, SZ), proj(x_inner, y_hi, -SZ),
          ], `hsl(225,35%,${lum - 3}%)`);
        }
      }

      // ── 4. Right stands ─────────────────────────────────────────
      {
        const SZ = FW + BO + BOARD_D + 8;
        const NUM = 4;
        const T_D = 4.5;
        const T_H = 3.2;
        const x0 = FL + BO + BOARD_D;
        for (let i = 0; i < NUM; i++) {
          const x_inner = x0 + i * T_D;
          const x_outer = x_inner + T_D;
          const y_lo = i * T_H;
          const y_hi = y_lo + T_H;
          const lum = 8 + i * 2;
          poly([
            proj(x_inner, y_lo, -SZ), proj(x_inner, y_lo, SZ),
            proj(x_outer, y_lo, SZ), proj(x_outer, y_lo, -SZ),
          ], `hsl(225,35%,${lum}%)`);
          poly([
            proj(x_inner, y_lo, -SZ), proj(x_inner, y_lo, SZ),
            proj(x_inner, y_hi, SZ), proj(x_inner, y_hi, -SZ),
          ], `hsl(225,35%,${lum - 3}%)`);
        }
      }

      // ── 5. Ground / grass ───────────────────────────────────────
      const MX = 8, MZ = 6;
      const LIGHT = "#1e5e32";
      const DARK = "#175229";

      poly([
        proj(-FL - MX, 0, -FW - MZ), proj(FL + MX, 0, -FW - MZ),
        proj(FL + MX, 0, FW + MZ), proj(-FL - MX, 0, FW + MZ),
      ], DARK);

      const NUM_S = 14;
      const sw = (FL * 2) / NUM_S;
      for (let i = 0; i < NUM_S; i++) {
        const x1 = -FL + i * sw, x2 = x1 + sw;
        poly([
          proj(x1, 0, -FW), proj(x2, 0, -FW),
          proj(x2, 0, FW), proj(x1, 0, FW),
        ], i % 2 === 0 ? LIGHT : DARK);
      }

      // ── 6. Advertising boards ───────────────────────────────────
      function board(
        ax: number, az: number,
        bx: number, bz: number,
        depthX: number, depthZ: number,
      ) {
        const f1 = proj(ax, 0, az);
        const f2 = proj(bx, 0, bz);
        const f3 = proj(bx, BOARD_H, bz);
        const f4 = proj(ax, BOARD_H, az);

        poly([f1, f2, f3, f4], "#08101e");
        poly([f4, f3, proj(bx, BOARD_H * 0.88, bz), proj(ax, BOARD_H * 0.88, az)], "#0e1c30");

        poly([
          proj(ax, BOARD_H, az), proj(bx, BOARD_H, bz),
          proj(bx + depthX, BOARD_H, bz + depthZ), proj(ax + depthX, BOARD_H, az + depthZ),
        ], "#040608");

        const boardLen = Math.hypot(bx - ax, bz - az);
        const numT = Math.max(2, Math.round(boardLen / 26));
        const dir = Math.atan2(f2[1] - f1[1], f2[0] - f1[0]);

        for (let i = 0; i < numT; i++) {
          const tt = (i + 0.5) / numT;
          const wx = ax + tt * (bx - ax);
          const wz = az + tt * (bz - az);
          const [sx, sy, depth] = proj(wx, BOARD_H * 0.5, wz);
          if (depth < 0.5) continue;
          const fs = Math.max(8, Math.min(72, (FOCAL / depth) * 2.9));
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(dir);
          ctx.font = `900 ${fs}px "Rajdhani","Barlow Condensed",system-ui`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          // Two-tone "BET" (red) + "62" (white) — the real brand colors,
          // not the neon green from the reference script.
          const betW = ctx.measureText("BET").width;
          const w62 = ctx.measureText("62").width;
          const startX = -(betW + w62) / 2;
          ctx.shadowBlur = fs * 0.24;
          ctx.shadowColor = "rgba(220,38,38,0.5)";
          ctx.fillStyle = "#dc2626";
          ctx.fillText("BET", startX, 0);
          ctx.shadowColor = "rgba(255,255,255,0.4)";
          ctx.fillStyle = "#ffffff";
          ctx.fillText("62", startX + betW, 0);
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      board(-FL, -(FW + BO), FL, -(FW + BO), 0, -BOARD_D);
      board(-(FL + BO), -FW, -(FL + BO), FW, -BOARD_D, 0);
      board(FL + BO, -FW, FL + BO, FW, BOARD_D, 0);

      // ── 7. Field markings ───────────────────────────────────────
      const LC = "#ffffff";
      const LW = 1.8 * dpr;

      function grect(x1: number, z1: number, x2: number, z2: number) {
        const pts: Array<[number, number, number]> = [
          proj(x1, 0, z1), proj(x2, 0, z1), proj(x2, 0, z2), proj(x1, 0, z2),
        ];
        ctx.strokeStyle = LC;
        ctx.lineWidth = LW;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.stroke();
      }

      function gline(x1: number, z1: number, x2: number, z2: number) {
        seg(x1, 0, z1, x2, 0, z2, LC, LW);
      }

      function gcircle(cx: number, cz: number, r: number) {
        const N = 80;
        ctx.strokeStyle = LC;
        ctx.lineWidth = LW;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const [sx, sy] = proj(cx + r * Math.cos(a), 0, cz + r * Math.sin(a));
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      function garc(cx: number, cz: number, r: number, a1: number, a2: number) {
        const N = 48;
        ctx.strokeStyle = LC;
        ctx.lineWidth = LW;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = a1 + (i / N) * (a2 - a1);
          const [sx, sy] = proj(cx + r * Math.cos(a), 0, cz + r * Math.sin(a));
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      function gdot(x: number, z: number) {
        const [sx, sy] = proj(x, 0.05, z);
        ctx.fillStyle = LC;
        ctx.beginPath();
        ctx.arc(sx, sy, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      grect(-FL, -FW, FL, FW);
      gline(0, -FW, 0, FW);
      gcircle(0, 0, 9.15);
      gdot(0, 0);

      const PBX = 16.5, PBZ = 20.16;
      const GAX = 5.5, GAZ = 9.16;
      const arcA = Math.acos((PBX - 11) / 9.15);

      grect(-FL, -PBZ, -FL + PBX, PBZ);
      grect(-FL, -GAZ, -FL + GAX, GAZ);
      gdot(-FL + 11, 0);
      garc(-FL + 11, 0, 9.15, -arcA, arcA);

      grect(FL - PBX, -PBZ, FL, PBZ);
      grect(FL - GAX, -GAZ, FL, GAZ);
      gdot(FL - 11, 0);
      garc(FL - 11, 0, 9.15, Math.PI - arcA, Math.PI + arcA);

      garc(-FL, -FW, 1, 0, Math.PI / 2);
      garc(FL, -FW, 1, Math.PI / 2, Math.PI);
      garc(FL, FW, 1, Math.PI, Math.PI * 1.5);
      garc(-FL, FW, 1, Math.PI * 1.5, Math.PI * 2);

      // ── 8. Near board (on top of markings) ──────────────────────
      board(-FL, FW + BO, FL, FW + BO, 0, BOARD_D);

      // ── 9. Near stands (closest to camera, below field on screen) ──
      {
        const SX = FL + 18;
        const NUM = 6;
        const T_D = 5;
        const T_H = 3.2;
        const z0 = FW + BO + BOARD_D;
        for (let i = 0; i < NUM; i++) {
          const z_inner = z0 + i * T_D;
          const z_outer = z_inner + T_D;
          const y_lo = i * T_H;
          const y_hi = y_lo + T_H;
          const lum = 10 + i * 2;
          poly([
            proj(-SX, y_lo, z_inner), proj(SX, y_lo, z_inner),
            proj(SX, y_lo, z_outer), proj(-SX, y_lo, z_outer),
          ], `hsl(225,35%,${lum}%)`);
          poly([
            proj(-SX, y_lo, z_outer), proj(SX, y_lo, z_outer),
            proj(SX, y_hi, z_outer), proj(-SX, y_hi, z_outer),
          ], `hsl(225,32%,${lum - 4}%)`);
        }
      }

      // ── 10. Goals ───────────────────────────────────────────────
      function goal(sign: number) {
        const gx = sign * FL;
        const bx = gx + sign * GD;
        const gc = "#f0f0f0";
        const gw = 2.0 * dpr;
        const slim = 1.2 * dpr;

        seg(gx, 0, -GW, gx, GH, -GW, gc, gw);
        seg(gx, 0, GW, gx, GH, GW, gc, gw);
        seg(gx, GH, -GW, gx, GH, GW, gc, gw);

        seg(bx, 0, -GW, bx, GH, -GW, gc, slim);
        seg(bx, 0, GW, bx, GH, GW, gc, slim);
        seg(bx, GH, -GW, bx, GH, GW, gc, slim);

        seg(gx, 0, -GW, bx, 0, -GW, gc, slim);
        seg(gx, 0, GW, bx, 0, GW, gc, slim);
        seg(gx, GH, -GW, bx, GH, -GW, gc, slim);
        seg(gx, GH, GW, bx, GH, GW, gc, slim);

        const nc = "rgba(255,255,255,0.2)";
        const nw = 0.6 * dpr;
        for (let z = -GW; z <= GW; z += 0.85) {
          seg(bx, GH, z, gx, GH, z, nc, nw);
        }
        for (let z = -GW + 0.85; z < GW; z += 0.85) {
          seg(bx, 0, z, bx, GH, z, nc, nw);
        }
        for (let y = 0.85; y < GH; y += 0.85) {
          seg(bx, y, -GW, bx, y, GW, nc, nw);
        }
      }

      goal(-1);
      goal(1);

      // ── 11. Corner flags ────────────────────────────────────────
      function flag(wx: number, wz: number) {
        const PH = 1.8;
        seg(wx, 0, wz, wx, PH, wz, "#e0e0e0", 1.5 * dpr);
        const [fx, fy, fd] = proj(wx, PH, wz);
        if (fd < 0.5) return;
        const s = FOCAL / fd;
        const fw = s * 2.6;
        const fh = s * 1.6;
        ctx.fillStyle = "#dd1111";
        ctx.fillRect(fx, fy - fh * 2, fw, fh);
        ctx.fillStyle = "#e8c200";
        ctx.fillRect(fx, fy - fh, fw, fh);
      }

      flag(-FL, -FW);
      flag(FL, -FW);
      flag(-FL, FW);
      flag(FL, FW);

      // ── 12. Ball (our own data-driven addition — see file header) ──
      {
        const BR = 0.24; // ball radius, metres
        const [shx, shy, shd] = proj(b.x, 0.02, b.z);
        if (shd > 0.5) {
          const shScale = FOCAL / shd;
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.ellipse(shx, shy, shScale * BR * 1.15, shScale * BR * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        const [bx2, by2, bd] = proj(b.x, BR, b.z);
        if (bd > 0.5) {
          const r = Math.max(2 * dpr, (FOCAL / bd) * BR);
          if (event) {
            const glow = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, r * 3.2);
            glow.addColorStop(0, `${eventColorRef.current}80`);
            glow.addColorStop(1, `${eventColorRef.current}00`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(bx2, by2, r * 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
          const ballShade = ctx.createRadialGradient(
            bx2 - r * 0.3, by2 - r * 0.35, r * 0.1,
            bx2, by2, r,
          );
          ballShade.addColorStop(0, "#ffffff");
          ballShade.addColorStop(0.6, "#d4d4d8");
          ballShade.addColorStop(1, "#71717a");
          ctx.fillStyle = ballShade;
          ctx.beginPath();
          ctx.arc(bx2, by2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── 13. Stadium vignette ─────────────────────────────────────
      const vg = ctx.createRadialGradient(CX, CY, H * 0.12, CX, CY, H * 0.9);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.62)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-full max-w-[320px] rounded-xl overflow-hidden border border-zinc-800/70"
        style={{ height: 210 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {/* Small scoreboard, tucked in the corner above the far stand */}
        <div className="absolute top-1.5 left-1.5 pointer-events-none">
          <div
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums"
            style={{
              backgroundColor: "rgba(9,9,11,0.75)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <span className="text-zinc-400 uppercase tracking-wide">
              {homeTeam.slice(0, 3)}
            </span>
            <span>{homeScore}</span>
            <span className="text-zinc-500">-</span>
            <span>{awayScore}</span>
            <span className="text-zinc-400 uppercase tracking-wide">
              {awayTeam.slice(0, 3)}
            </span>
          </div>
        </div>
        {event && (
          <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none">
            <span
              className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
              style={{
                color: eventColorRef.current,
                borderColor: `${eventColorRef.current}80`,
                backgroundColor: "rgba(9,9,11,0.85)",
              }}
            >
              {event.team === "home" ? `${homeTeam} — ` : event.team === "away" ? `${awayTeam} — ` : ""}
              {event.label}
            </span>
          </div>
        )}
      </div>
      <span className="mt-1 text-[9px] text-zinc-600">
        Campo 3D — animação baseada nos eventos reais da partida
      </span>
    </div>
  );
}
