/**
 * LiveMatchSimulator — mini campo animado por desporto
 *
 * Visual: SVG com figuras humanoides detalhadas (top-down, estilo FIFA/PES)
 *   • Cada jogador tem número de camisola, tom de pele/cabelo variado,
 *     sombra no chão e roda para encarar a bola
 *   • Bola animada com Animated.ValueXY + efeito de escala
 *   • Campo com gradiente, listras e marcações precisas
 *
 * Dados: simulação seeded a partir de match.id + match state.
 *   Para integrar dados reais de posição (ex. SofaScore tracker):
 *     1. Polling/SSE de /api/tracking/:matchId no api-server
 *     2. Substituir getFormationPositions() pelos dados reais normalizados 0-1
 *     3. Ball waypoints substituídos por ball.x/ball.y em tempo real
 */

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE } from "@/context/AuthContext";
import type { MatchInfo } from "./ComprehensiveMarketsSheet";

const { width: SW, height: SH } = Dimensions.get("window");
const FIELD_W = SW;
const FIELD_H = Math.round(SH * 0.46);

// ─── Utilities ───────────────────────────────────────────────────────────────
function seededRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

type SportType = "football" | "basketball" | "tennis" | "hockey" | "baseball" | "volleyball";
function getSport(s: string): SportType {
  if (s === "basketball") return "basketball";
  if (s === "tennis") return "tennis";
  if (s === "hockey") return "hockey";
  if (s === "baseball") return "baseball";
  if (s === "volleyball") return "volleyball";
  return "football";
}

// Jersey numbers by formation position (football 4-3-3)
const FB_NUMS = [1, 2, 5, 3, 6, 4, 8, 10, 7, 11, 9];
const BB_NUMS = [15, 23, 3, 1, 11];
const TN_NUMS = [1];
const HK_NUMS = [31, 2, 5, 11, 10, 44];
const BS_FIELD_NUMS = [21, 14, 23, 3, 8, 1, 45, 17, 99];
const VB_NUMS = [1, 7, 10, 14, 3, 9];

// ─── FIELD COMPONENTS (React.memo — never re-render) ─────────────────────────
const FootballField = React.memo(function FootballField() {
  const W = FIELD_W, H = FIELD_H;
  const n = 9, sw = W / n;
  const pbW = W * 0.163, pbH = H * 0.56, pbY = H * 0.22;
  const gbW = W * 0.068, gbH = H * 0.3, gbY = H * 0.35;
  const cR = H * 0.145;
  const gH = H * 0.21, gY = (H - gH) / 2;
  const aR = H * 0.13;
  const aX1 = 4 + pbW, aX2 = W - 4 - pbW;
  const aY1 = H / 2 - aR, aY2 = H / 2 + aR;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="g1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#155a28" /><Stop offset="0.5" stopColor="#1d7033" /><Stop offset="1" stopColor="#155a28" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#g1)" />
      {Array.from({ length: n }, (_, i) => (
        <Rect key={i} x={i * sw} y={0} width={sw * 0.52} height={H} fill="#185e2c" opacity={0.6} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2.2} opacity={0.92} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.6} opacity={0.92} />
      <Circle cx={W / 2} cy={H / 2} r={cR} fill="none" stroke="white" strokeWidth={1.6} opacity={0.92} />
      <Circle cx={W / 2} cy={H / 2} r={3.5} fill="white" />
      <Rect x={4} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.6} />
      <Rect x={4} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1.2} />
      <Rect x={W - 4 - pbW} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.6} />
      <Rect x={W - 4 - gbW} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1.2} />
      <Circle cx={4 + pbW * 0.73} cy={H / 2} r={3} fill="white" />
      <Circle cx={W - 4 - pbW * 0.73} cy={H / 2} r={3} fill="white" />
      <Path d={`M${aX1},${aY1} A${aR},${aR} 0 0,1 ${aX1},${aY2}`} fill="none" stroke="white" strokeWidth={1.6} />
      <Path d={`M${aX2},${aY1} A${aR},${aR} 0 0,0 ${aX2},${aY2}`} fill="none" stroke="white" strokeWidth={1.6} />
      {/* Goals */}
      <Rect x={0} y={gY} width={5} height={gH} fill="#ffffff1a" stroke="white" strokeWidth={1.6} />
      <Rect x={W - 5} y={gY} width={5} height={gH} fill="#ffffff1a" stroke="white" strokeWidth={1.6} />
      {/* Goal nets */}
      {Array.from({ length: 4 }, (_, i) => (
        <Line key={i} x1={0} y1={gY + (i + 1) * gH / 5} x2={5} y2={gY + (i + 1) * gH / 5} stroke="#ffffff55" strokeWidth={0.6} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <Line key={i + 10} x1={W - 5} y1={gY + (i + 1) * gH / 5} x2={W} y2={gY + (i + 1) * gH / 5} stroke="#ffffff55" strokeWidth={0.6} />
      ))}
      {/* Corner arcs */}
      {([[4, 4, 1], [4, H - 4, 0], [W - 4, 4, 0], [W - 4, H - 4, 1]] as [number, number, number][]).map(([cx, cy, s], i) => (
        <Path key={i} d={`M${cx},${cy} A11,11 0 0,${s} ${cx + (i >= 2 ? -11 : 11)},${cy + (i % 2 === 0 ? 11 : -11)}`}
          fill="none" stroke="white" strokeWidth={1.2} opacity={0.7} />
      ))}
    </Svg>
  );
});

const BasketballCourt = React.memo(function BasketballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const kW = W * 0.165, kH = H * 0.58, kY = (H - kH) / 2;
  const hR = H * 0.042, t3 = H * 0.43;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="b1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c87038" /><Stop offset="1" stopColor="#b05c26" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#b1)" />
      {Array.from({ length: 11 }, (_, i) => (
        <Line key={i} x1={i * W / 10} y1={0} x2={i * W / 10} y2={H} stroke="#9a5028" strokeWidth={0.8} opacity={0.45} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2.2} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.6} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.1} fill="none" stroke="white" strokeWidth={1.6} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.042} fill="#b87040" stroke="white" strokeWidth={1.5} />
      <Rect x={4} y={kY} width={kW} height={kH} fill="#2050a030" stroke="white" strokeWidth={1.6} />
      <Circle cx={4 + kW} cy={H / 2} r={kH / 5} fill="none" stroke="white" strokeWidth={1.6} />
      <Line x1={4 + kW} y1={kY} x2={4 + kW} y2={H - kY} stroke="white" strokeWidth={1.6} />
      <Rect x={W - 4 - kW} y={kY} width={kW} height={kH} fill="#2050a030" stroke="white" strokeWidth={1.6} />
      <Circle cx={W - 4 - kW} cy={H / 2} r={kH / 5} fill="none" stroke="white" strokeWidth={1.6} />
      <Line x1={W - 4 - kW} y1={kY} x2={W - 4 - kW} y2={H - kY} stroke="white" strokeWidth={1.6} />
      <Path d={`M4,${kY - 2} A${t3},${t3} 0 0,1 4,${H - kY + 2}`} fill="none" stroke="white" strokeWidth={1.6} />
      <Path d={`M${W - 4},${kY - 2} A${t3},${t3} 0 0,0 ${W - 4},${H - kY + 2}`} fill="none" stroke="white" strokeWidth={1.6} />
      <Line x1={4} y1={H / 2 - H * 0.11} x2={4} y2={H / 2 + H * 0.11} stroke="white" strokeWidth={3.5} />
      <Circle cx={4 + hR + 8} cy={H / 2} r={hR} fill="none" stroke="#ff6000" strokeWidth={3} />
      <Line x1={W - 4} y1={H / 2 - H * 0.11} x2={W - 4} y2={H / 2 + H * 0.11} stroke="white" strokeWidth={3.5} />
      <Circle cx={W - 4 - hR - 8} cy={H / 2} r={hR} fill="none" stroke="#ff6000" strokeWidth={3} />
    </Svg>
  );
});

const TennisCourt = React.memo(function TennisCourt() {
  const W = FIELD_W, H = FIELD_H;
  const p = 5, sY = p + (H - p * 2) * 0.215;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="t1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c35028" /><Stop offset="1" stopColor="#aa4018" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#t1)" />
      <Rect x={0} y={0} width={p * 4} height={H} fill="#a84520" opacity={0.55} />
      <Rect x={W - p * 4} y={0} width={p * 4} height={H} fill="#a84520" opacity={0.55} />
      <Rect x={p} y={p} width={W - p * 2} height={H - p * 2} fill="none" stroke="white" strokeWidth={2.2} />
      <Line x1={p * 4} y1={p} x2={p * 4} y2={H - p} stroke="white" strokeWidth={1.8} />
      <Line x1={W - p * 4} y1={p} x2={W - p * 4} y2={H - p} stroke="white" strokeWidth={1.8} />
      <Line x1={p * 4} y1={sY} x2={W - p * 4} y2={sY} stroke="white" strokeWidth={1.8} />
      <Line x1={p * 4} y1={H - sY} x2={W - p * 4} y2={H - sY} stroke="white" strokeWidth={1.8} />
      <Line x1={W / 2} y1={sY} x2={W / 2} y2={H - sY} stroke="white" strokeWidth={1.8} />
      {/* Net */}
      <Line x1={p} y1={H / 2} x2={W - p} y2={H / 2} stroke="white" strokeWidth={4.5} />
      {/* Net shadow */}
      <Line x1={p} y1={H / 2 + 3} x2={W - p} y2={H / 2 + 3} stroke="#00000033" strokeWidth={3} />
      <Line x1={p * 4} y1={H / 2 - 9} x2={p * 4} y2={H / 2 + 9} stroke="white" strokeWidth={4} />
      <Line x1={W - p * 4} y1={H / 2 - 9} x2={W - p * 4} y2={H / 2 + 9} stroke="white" strokeWidth={4} />
      <Line x1={W / 2} y1={p} x2={W / 2} y2={p + 12} stroke="white" strokeWidth={2} />
      <Line x1={W / 2} y1={H - p - 12} x2={W / 2} y2={H - p} stroke="white" strokeWidth={2} />
    </Svg>
  );
});

const HockeyRink = React.memo(function HockeyRink() {
  const W = FIELD_W, H = FIELD_H;
  const p = 8, bX1 = W * 0.28, bX2 = W * 0.72, fR = H * 0.16, cr = H * 0.11;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="h1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#d8eaf5" /><Stop offset="1" stopColor="#bdd4e2" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#h1)" />
      <Rect x={p} y={p} width={W - p * 2} height={H - p * 2} rx={34} ry={34} fill="none" stroke="#cc0000" strokeWidth={3} />
      <Line x1={bX1} y1={p} x2={bX1} y2={H - p} stroke="#0044cc" strokeWidth={4} />
      <Line x1={bX2} y1={p} x2={bX2} y2={H - p} stroke="#0044cc" strokeWidth={4} />
      <Line x1={W / 2} y1={p} x2={W / 2} y2={H - p} stroke="#cc0000" strokeWidth={3} />
      <Circle cx={W / 2} cy={H / 2} r={fR} fill="none" stroke="#cc0000" strokeWidth={2} />
      <Circle cx={W / 2} cy={H / 2} r={5} fill="#cc0000" />
      {([
        [W * 0.19, H * 0.28], [W * 0.19, H * 0.72],
        [W * 0.81, H * 0.28], [W * 0.81, H * 0.72],
      ] as [number, number][]).map(([fx, fy], i) => (
        <G key={i}>
          <Circle cx={fx} cy={fy} r={fR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.8} />
          <Circle cx={fx} cy={fy} r={4} fill="#cc0000" />
          <Line x1={fx - fR * 0.7 - 2} y1={fy} x2={fx - fR * 0.7 - 12} y2={fy} stroke="#cc0000" strokeWidth={1.8} />
          <Line x1={fx + fR * 0.7 + 2} y1={fy} x2={fx + fR * 0.7 + 12} y2={fy} stroke="#cc0000" strokeWidth={1.8} />
        </G>
      ))}
      <Ellipse cx={p + 20} cy={H / 2} rx={14} ry={cr} fill="#2255cc15" stroke="#cc0000" strokeWidth={1.8} />
      <Ellipse cx={W - p - 20} cy={H / 2} rx={14} ry={cr} fill="#2255cc15" stroke="#cc0000" strokeWidth={1.8} />
      <Rect x={p - 3} y={H / 2 - cr} width={12} height={cr * 2} fill="#cc000030" stroke="#cc0000" strokeWidth={2.2} />
      <Rect x={W - p - 9} y={H / 2 - cr} width={12} height={cr * 2} fill="#cc000030" stroke="#cc0000" strokeWidth={2.2} />
    </Svg>
  );
});

const BaseballDiamond = React.memo(function BaseballDiamond() {
  const W = FIELD_W, H = FIELD_H;
  const cx = W / 2, cy = H * 0.63, bl = Math.min(W, H) * 0.31;
  const oR = bl * 2.2;
  const hb = { x: cx, y: cy };
  const fb = { x: cx - bl, y: cy - bl };
  const sb = { x: cx, y: cy - bl * 2 };
  const tb = { x: cx + bl, y: cy - bl };
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="o1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#185c18" /><Stop offset="1" stopColor="#134f13" />
        </SvgGradient>
        <SvgGradient id="i1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c87830" /><Stop offset="1" stopColor="#a86020" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#o1)" />
      {Array.from({ length: 9 }, (_, i) => (
        <Path key={i} d={`M${cx - oR * (1 - i * 0.11)},${cy} A${oR * (1 - i * 0.11)},${oR * 0.5} 0 0,1 ${cx + oR * (1 - i * 0.11)},${cy}`}
          fill="none" stroke="#196519" strokeWidth={9} opacity={0.3} />
      ))}
      <Path d={`M${hb.x},${hb.y} L${fb.x},${fb.y} L${sb.x},${sb.y} L${tb.x},${tb.y} Z`} fill="url(#i1)" />
      <Path d={`M${hb.x},${hb.y} L${fb.x},${fb.y} L${sb.x},${sb.y} L${tb.x},${tb.y} Z`} fill="none" stroke="white" strokeWidth={2.2} />
      <Circle cx={(hb.x + sb.x) / 2} cy={(hb.y + sb.y) / 2} r={13} fill="#a86020" stroke="white" strokeWidth={1.5} />
      {[hb, fb, sb, tb].map((b, i) => (
        <Rect key={i} x={b.x - 8} y={b.y - 8} width={16} height={16} fill="white" stroke="#ccc" strokeWidth={1.2} rx={3} />
      ))}
      <Path d={`M${hb.x},${hb.y - 12} L${hb.x - 9},${hb.y - 6} L${hb.x - 9},${hb.y + 5} L${hb.x + 9},${hb.y + 5} L${hb.x + 9},${hb.y - 6} Z`} fill="white" />
      <Path d={`M${cx - oR},${cy} A${oR},${oR * 0.5} 0 0,1 ${cx + oR},${cy}`} fill="none" stroke="#7a4810" strokeWidth={5} />
    </Svg>
  );
});

const VolleyballCourt = React.memo(function VolleyballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const p = 8, aY1 = p + (H - p * 2) * 0.28, aY2 = H - p - (H - p * 2) * 0.28;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="v1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#cc6018" /><Stop offset="1" stopColor="#b05010" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#v1)" />
      {Array.from({ length: 8 }, (_, i) => (
        <Rect key={i} x={i * W / 7} y={0} width={W / 14} height={H} fill="#b85818" opacity={0.38} />
      ))}
      <Rect x={p} y={p} width={W - p * 2} height={H - p * 2} fill="none" stroke="white" strokeWidth={2.5} />
      <Line x1={p} y1={aY1} x2={W - p} y2={aY1} stroke="white" strokeWidth={2} />
      <Line x1={p} y1={aY2} x2={W - p} y2={aY2} stroke="white" strokeWidth={2} />
      {/* Net with shadow */}
      <Line x1={p} y1={H / 2 + 4} x2={W - p} y2={H / 2 + 4} stroke="#00000044" strokeWidth={5} />
      <Line x1={p} y1={H / 2} x2={W - p} y2={H / 2} stroke="white" strokeWidth={5} />
      <Line x1={p} y1={H / 2 - 9} x2={p} y2={H / 2 + 9} stroke="white" strokeWidth={5} />
      <Line x1={W - p} y1={H / 2 - 9} x2={W - p} y2={H / 2 + 9} stroke="white" strokeWidth={5} />
      <Line x1={W / 2} y1={H / 2 - 5} x2={W / 2} y2={H / 2 + 5} stroke="white" strokeWidth={2} />
    </Svg>
  );
});

// ─── Player positions ─────────────────────────────────────────────────────────
type PlayerDot = { x: number; y: number; color: string; isGK?: boolean; num: number; };

function getFormationPositions(sport: SportType, side: "home" | "away", seed: number): PlayerDot[] {
  const W = FIELD_W, H = FIELD_H;
  const homeColor = "#dc2626", awayColor = "#1d4ed8";
  const color = side === "home" ? homeColor : awayColor;
  const mirror = side === "away";
  const nums = sport === "football" ? FB_NUMS
    : sport === "basketball" ? BB_NUMS
    : sport === "tennis" ? TN_NUMS
    : sport === "hockey" ? HK_NUMS
    : sport === "volleyball" ? VB_NUMS
    : BS_FIELD_NUMS;

  function jitter(v: number, range: number, s: number) {
    return v + (seededRand(s) - 0.5) * range;
  }
  function pos(fx: number, fy: number, s: number, gk = false, idx = 0): PlayerDot {
    const rawX = mirror ? W - fx * W : fx * W;
    return {
      x: jitter(rawX, 7, seed + s * 13.7),
      y: jitter(fy * H, 7, seed + s * 7.3),
      color, isGK: gk,
      num: nums[idx] ?? idx + 1,
    };
  }

  if (sport === "football") return [
    pos(0.07, 0.5,  1, true, 0),
    pos(0.21, 0.19, 2, false, 1), pos(0.20, 0.39, 3, false, 2),
    pos(0.20, 0.61, 4, false, 3), pos(0.21, 0.81, 5, false, 4),
    pos(0.43, 0.28, 6, false, 5), pos(0.42, 0.50, 7, false, 6),
    pos(0.43, 0.72, 8, false, 7),
    pos(0.65, 0.21, 9, false, 8), pos(0.65, 0.79, 10, false, 9),
    pos(0.73, 0.50, 11, false, 10),
  ];

  if (sport === "basketball") return [
    pos(0.13, 0.50, 1, false, 0),
    pos(0.23, 0.27, 2, false, 1), pos(0.23, 0.73, 3, false, 2),
    pos(0.40, 0.50, 4, false, 3),
    pos(0.48, 0.22, 5, false, 4),
  ];

  if (sport === "tennis") {
    const baseY = side === "home" ? H * 0.8 : H * 0.2;
    return [{ x: W / 2 + (seededRand(seed) - 0.5) * 70, y: baseY, color, num: 1 }];
  }

  if (sport === "hockey") return [
    pos(0.07, 0.50, 1, true,  0),
    pos(0.22, 0.27, 2, false, 1), pos(0.22, 0.73, 3, false, 2),
    pos(0.40, 0.50, 4, false, 3),
    pos(0.49, 0.23, 5, false, 4), pos(0.49, 0.77, 6, false, 5),
  ];

  if (sport === "baseball") {
    if (side === "away") {
      const cx = W / 2, cy = H * 0.63, bl = Math.min(W, H) * 0.31;
      const raw: [number, number][] = [
        [cx, cy - bl * 2.3], [cx - bl * 1.3, cy - bl * 1.5], [cx + bl * 1.3, cy - bl * 1.5],
        [cx - bl * 0.6, cy - bl * 0.6], [cx + bl * 0.6, cy - bl * 0.6],
        [cx - bl * 0.95, cy - bl * 1.05], [cx + bl * 0.95, cy - bl * 1.05],
        [cx, cy - bl * 1.05],
      ];
      return raw.map(([x, y], i) => ({
        x: jitter(x, 6, seed + i * 11), y: jitter(y, 6, seed + i * 7),
        color, isGK: i === 7, num: BS_FIELD_NUMS[i] ?? i + 1,
      }));
    } else {
      const cx = W / 2, cy = H * 0.63;
      return [{ x: cx, y: cy + 7, color, num: 24 }];
    }
  }

  if (sport === "volleyball") {
    const yBase = side === "home" ? H * 0.71 : H * 0.29;
    return Array.from({ length: 6 }, (_, i) => ({
      x: jitter(W * 0.18 + (i % 3) * W * 0.32, 6, seed + i * 8),
      y: jitter(yBase + Math.floor(i / 3) * H * 0.14 * (side === "home" ? 1 : -1), 6, seed + i * 6),
      color, num: VB_NUMS[i] ?? i + 1,
    }));
  }
  return [];
}

// ─── Ball waypoints ───────────────────────────────────────────────────────────
function getBallWaypoints(sport: SportType, event: string, seed: number, homeWinning: boolean): Array<[number, number]> {
  const W = FIELD_W, H = FIELD_H;
  const r = (n: number) => seededRand(seed + n);
  const ev = event.toUpperCase();

  if (sport === "football") {
    if (ev.includes("GOLO") || ev.includes("GOAL")) return [[W - 7, H / 2], [W - 7, H / 2 + 14], [W - 7, H / 2 - 14]];
    if (ev.includes("PENAL")) return [[W * 0.882, H / 2]];
    if (ev.includes("VAR")) return [[W / 2, H / 2]];
    if (ev.includes("CORNER")) return [[W - 6, H * 0.06], [W * 0.76, H * 0.32], [W * 0.87, H / 2]];
    if (ev.includes("CHANCE")) return [[W * 0.85, H / 2 + (r(1) - 0.5) * H * 0.28], [W * 0.92, H / 2]];
    const bias = homeWinning ? 0.63 : 0.37;
    return Array.from({ length: 8 }, (_, i) => [
      r(i * 5.3) < bias ? lerp(W * 0.54, W * 0.92, r(i * 7.1)) : lerp(W * 0.08, W * 0.54, r(i * 3.2)),
      lerp(H * 0.09, H * 0.91, r(i * 2.9)),
    ] as [number, number]);
  }
  if (sport === "basketball") return homeWinning
    ? [[W * 0.11, H / 2], [W * 0.27, H * 0.37], [W * 0.09, H * 0.43]]
    : [[W * 0.89, H / 2], [W * 0.73, H * 0.63], [W * 0.91, H * 0.57]];
  if (sport === "tennis") return [
    [W * 0.26, H * 0.77], [W / 2, H / 2 + 6], [W * 0.74, H * 0.23],
    [W * 0.64, H * 0.27], [W / 2, H / 2 - 6], [W * 0.36, H * 0.73],
  ];
  if (sport === "hockey") return Array.from({ length: 7 }, (_, i) => [
    lerp(W * 0.07, W * 0.93, r(i * 4.1)), lerp(H * 0.09, H * 0.91, r(i * 3.7)),
  ] as [number, number]);
  if (sport === "baseball") {
    const cx = W / 2, cy = H * 0.63, bl = Math.min(W, H) * 0.31;
    return [[cx, cy - bl], [cx + bl * (r(1) - 0.5) * 1.4, cy - bl * (1.1 + r(2))], [cx + (r(3) - 0.5) * W * 0.5, cy - H * 0.27]];
  }
  if (sport === "volleyball") return [
    [W * 0.37, H * 0.74], [W / 2, H / 2 - 14], [W * 0.63, H * 0.26],
    [W * 0.52, H * 0.23], [W / 2, H / 2 + 14], [W * 0.48, H * 0.74],
  ];
  return [[W / 2, H / 2]];
}

// ─── Event overlay ────────────────────────────────────────────────────────────
function EventOverlay({ reason }: { reason: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const r = reason.toUpperCase();
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true, easing: Easing.out(Easing.back(1.8)) }),
      Animated.delay(3000),
      Animated.timing(anim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [reason]);
  let label = "⏱  PAUSA", color = "#9ca3af", bg = "#10101888";
  if (r.includes("GOLO") || r.includes("GOAL")) { label = "⚽  G O L O !"; color = "#22c55e"; bg = "#002a0088"; }
  else if (r.includes("VAR")) { label = "📺  REVISÃO  VAR"; color = "#f59e0b"; bg = "#1a120088"; }
  else if (r.includes("PENAL")) { label = "🎯  PENÁLTI"; color = "#f87171"; bg = "#1a000088"; }
  else if (r.includes("CHANCE")) { label = "⚡  GRANDE CHANCE!"; color = "#fbbf24"; bg = "#1c140088"; }
  return (
    <Animated.View
      style={[styles.eventOverlay, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }] }]}
      pointerEvents="none"
    >
      <View style={[styles.eventBox, { borderColor: color, backgroundColor: bg }]}>
        <Text style={[styles.eventText, { color }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Score header ─────────────────────────────────────────────────────────────
function ScoreHeader({ match, sport }: { match: MatchInfo; sport: SportType }) {
  const icons: Record<SportType, string> = {
    football: "soccer", basketball: "basketball", tennis: "tennis-ball",
    hockey: "hockey-puck", baseball: "baseball", volleyball: "volleyball",
  };
  const p = match._liveExtra?.periods, q = match._liveExtra?.quarters, inn = match._liveExtra?.innings;
  let period = "";
  if (sport === "hockey" && p) period = p.length <= 3 ? `${p.length}º PERÍODO` : "PRORR.";
  else if (sport === "basketball" && q) period = `${q.length}º QUARTO`;
  else if (sport === "baseball" && inn) period = `${inn.length}ª ENTRADA`;
  else if (match.status === "HT") period = "INTERVALO";
  else if (match.minute) period = `${match.minute}'`;
  return (
    <LinearGradient colors={["#07070e", "#0e0e1a"]} style={styles.scoreHeader}>
      <View style={styles.leagueRow}>
        <MaterialCommunityIcons name={icons[sport] as never} size={13} color="#f59e0b" />
        <Text style={styles.leagueText} numberOfLines={1}>{match.league ?? sport.toUpperCase()}</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.teamLeft} numberOfLines={2}>{match.home}</Text>
        <View style={styles.scoreMid}>
          <Text style={styles.scoreNum}>{match.homeScore ?? 0}</Text>
          <View>
            <Text style={styles.scoreDash}>–</Text>
            {period ? <Text style={styles.periodLabel}>{period}</Text> : null}
          </View>
          <Text style={styles.scoreNum}>{match.awayScore ?? 0}</Text>
        </View>
        <Text style={styles.teamRight} numberOfLines={2}>{match.away}</Text>
      </View>
    </LinearGradient>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatBar({ label, hv, av }: { label: string; hv: string; av: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statVal, { color: "#ef4444" }]}>{hv}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, { color: "#3b82f6" }]}>{av}</Text>
    </View>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function LiveMatchSimulator({ visible, match, onClose }: {
  visible: boolean; match: MatchInfo; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sport = getSport(match.sport);
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const homeWinning = homeScore >= awayScore;
  const seed = match.id.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);

  const ballAnim = useRef(new Animated.ValueXY({ x: FIELD_W / 2, y: FIELD_H / 2 })).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waypointRef = useRef(0);

  const [eventReason, setEventReason] = useState("");
  const [eventKey, setEventKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [ballTarget, setBallTarget] = useState<[number, number]>([FIELD_W / 2, FIELD_H / 2]);

  // ── Real-time tracking from /api/tracking/:matchId ──────────────────────────
  type TrackingPlayer = { id: number; team: "home" | "away"; x: number; y: number; isGK: boolean; num: number };
  type TrackingFrame  = { ball: { x: number; y: number }; players: TrackingPlayer[] };
  const [trackingFrame, setTrackingFrame] = useState<TrackingFrame | null>(null);
  // Once API responds, stop local sim (use ref to avoid re-render)
  const hasTracking = useRef(false);

  // ── animateTo ────────────────────────────────────────────────────────────────
  const animateTo = useCallback((target: [number, number], dur: number) => {
    setBallTarget(target);
    Animated.parallel([
      Animated.timing(ballAnim, { toValue: { x: target[0], y: target[1] }, duration: dur, useNativeDriver: false, easing: Easing.inOut(Easing.quad) }),
      Animated.sequence([
        Animated.timing(ballScale, { toValue: 0.7,  duration: dur * 0.25, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1.35, duration: dur * 0.45, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1,    duration: dur * 0.30, useNativeDriver: true }),
      ]),
    ]).start();
  }, [ballAnim, ballScale]);

  // ── Tracking API polling — updates ball + players every 2s ──────────────────
  useEffect(() => {
    if (!visible) {
      setTrackingFrame(null);
      hasTracking.current = false;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const params = new URLSearchParams({
          sport:      match.sport,
          homeScore:  String(match.homeScore ?? 0),
          awayScore:  String(match.awayScore ?? 0),
          minute:     String(match.minute    ?? 0),
        });
        const res = await fetch(
          `${API_BASE}/tracking/${encodeURIComponent(match.id)}?${params.toString()}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as TrackingFrame;
        hasTracking.current = true;
        setTrackingFrame(data);
        // Drive ball animation from server position
        animateTo([data.ball.x * FIELD_W, data.ball.y * FIELD_H], 1850);
      } catch { /* silently fall back to local simulation */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [visible, match.id, match.homeScore, match.awayScore, match.minute]);

  // ── Local fallback simulation (only when API unavailable) ───────────────────
  const waypoints = getBallWaypoints(sport, match._suspensionReason ?? match.suspensionReason ?? "", seed + tick, homeWinning);
  useEffect(() => {
    if (!visible || hasTracking.current) return;
    function go() {
      if (hasTracking.current) return; // stop if API kicked in
      const idx = waypointRef.current % waypoints.length;
      const next = waypoints[idx]!;
      waypointRef.current++;
      const fast = sport === "hockey" || sport === "volleyball" || (sport === "tennis" && idx % 2 === 0);
      const dur = fast ? 480 + seededRand(seed + idx * 3.1) * 380 : 820 + seededRand(seed + idx * 2.7) * 1350;
      animateTo(next, dur);
      tickRef.current = setTimeout(go, dur + 120);
    }
    go();
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [visible, sport, homeWinning, tick]);

  // Local sim player wander tick
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setTick((v) => v + 1), 9000);
    return () => clearInterval(t);
  }, [visible]);

  // ── Match events (goal, VAR, etc.) ──────────────────────────────────────────
  useEffect(() => {
    const suspReason = match._suspensionReason ?? match.suspensionReason ?? "";
    const r = suspReason.toUpperCase();
    if (r && (r.includes("GOLO") || r.includes("GOAL") || r.includes("VAR") || r.includes("PENAL") || r.includes("CHANCE"))) {
      setEventReason(suspReason);
      setEventKey((k) => k + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [match._suspensionReason, match.suspensionReason]);

  useEffect(() => {
    const r = (match._suspensionReason ?? match.suspensionReason ?? "").toUpperCase();
    if (r.includes("GOLO") || r.includes("GOAL")) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.8, duration: 260, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 260, useNativeDriver: true }),
      ]), { iterations: 6 }).start();
    }
  }, [match._suspensionReason, match.suspensionReason]);

  // ── Player list — API data when available, local simulation otherwise ────────
  const homeFallback = getFormationPositions(sport, "home", seed);
  const awayFallback = getFormationPositions(sport, "away", seed + 1000);

  const allPlayers = useMemo((): PlayerDot[] => {
    if (trackingFrame) {
      // Map normalized API coords → pixel coords
      return trackingFrame.players.map((tp) => ({
        x:     tp.x * FIELD_W,
        y:     tp.y * FIELD_H,
        color: tp.team === "home" ? "#dc2626" : "#1d4ed8",
        isGK:  tp.isGK,
        num:   tp.num,
      }));
    }
    // Local fallback with wander
    const wander = (p: PlayerDot, i: number): PlayerDot => {
      const w = sport === "football" ? 14 : sport === "hockey" ? 17 : sport === "basketball" ? 16 : 8;
      return {
        ...p,
        x: p.x + (seededRand(seed + i * 7.3 + tick * 0.17) - 0.5) * w,
        y: p.y + (seededRand(seed + i * 3.1 + tick * 0.23) - 0.5) * w,
      };
    };
    return [
      ...homeFallback.map((p, i) => wander(p, i)),
      ...awayFallback.map((p, i) => wander(p, i + 100)),
    ];
  }, [trackingFrame, tick, sport, seed]);

  const bgColors: [string, string] = sport === "hockey" ? ["#18263a", "#0c1520"]
    : sport === "basketball" ? ["#1a0d08", "#0c0804"]
    : sport === "baseball" ? ["#0c1a0c", "#07100a"]
    : sport === "tennis" ? ["#1a0d08", "#0c0804"]
    : sport === "volleyball" ? ["#1a0e08", "#0c0804"]
    : ["#070e07", "#040904"];

  const sportGlow: Record<SportType, string> = {
    football: "#16a34a", basketball: "#ea580c", tennis: "#b45309",
    hockey: "#2563eb", baseball: "#15803d", volleyball: "#d97706",
  };

  const isVAR = (match._suspensionReason ?? match.suspensionReason ?? "").toUpperCase().includes("VAR");
  const s = seed;

  const ballEl = sport === "hockey"
    ? <View style={[styles.ball, { backgroundColor: "#1c1c1c", width: 16, height: 10, borderRadius: 4 }]} />
    : sport === "baseball" || sport === "tennis"
    ? <View style={[styles.ball, { backgroundColor: "#fef08a", borderColor: "#b45309", borderWidth: 1.5 }]} />
    : sport === "volleyball"
    ? <View style={[styles.ball, { backgroundColor: "#f4c010" }]} />
    : sport === "basketball"
    ? <View style={[styles.ball, { backgroundColor: "#e06000" }]} />
    : <View style={styles.ball} />;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={bgColors} style={styles.container}>

        <ScoreHeader match={match} sport={sport} />

        {/* ── FIELD ── */}
        <View style={styles.fieldOuter}>
          <View style={[styles.fieldPerspective, { shadowColor: sportGlow[sport] }]}>

            {/* Static field markings */}
            {sport === "football" && <FootballField />}
            {sport === "basketball" && <BasketballCourt />}
            {sport === "tennis" && <TennisCourt />}
            {sport === "hockey" && <HockeyRink />}
            {sport === "baseball" && <BaseballDiamond />}
            {sport === "volleyball" && <VolleyballCourt />}

            {/* Players — 2D dots (top-down, Betano-style) */}
            <Svg width={FIELD_W} height={FIELD_H} style={StyleSheet.absoluteFill}>
              {allPlayers.map((p, i) => {
                const r = p.isGK ? 12 : 10;
                const fill = p.isGK ? "#f59e0b" : p.color;
                const stroke = p.isGK ? "#b45309" : "#ffffff";
                return (
                  <G key={i}>
                    <Ellipse cx={p.x} cy={p.y + r + 2} rx={r + 1} ry={3.5} fill="#00000040" />
                    <Circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={stroke} strokeWidth={1.8} />
                    <SvgText
                      x={p.x} y={p.y + 0.5}
                      fontSize={6.5} fontWeight="bold"
                      textAnchor="middle" alignmentBaseline="middle"
                      fill="white"
                    >{p.num}</SvgText>
                  </G>
                );
              })}
            </Svg>

            {/* Animated ball */}
            <Animated.View style={[styles.ballWrapper, {
              left: Animated.subtract(ballAnim.x, new Animated.Value(9)),
              top: Animated.subtract(ballAnim.y, new Animated.Value(9)),
              transform: [{ scale: Animated.multiply(ballScale, pulseAnim) }],
            }]}>
              {ballEl}
            </Animated.View>

          </View>

          {/* Event overlay */}
          {eventReason !== "" && <EventOverlay key={eventKey} reason={eventReason} />}

          {/* VAR banner */}
          {isVAR && (
            <View style={styles.varBanner}>
              <Text style={styles.varText}>📺  V A R  —  REVISÃO EM ANDAMENTO</Text>
            </View>
          )}
        </View>

        {/* ── STATS ── */}
        <View style={[styles.statsBar, { paddingBottom: clamp(insets.bottom, 10, 34) }]}>
          <StatBar label="Posse"
            hv={`${clamp(Math.round(45 + (homeScore - awayScore) * 5 + seededRand(s + tick) * 12), 30, 70)}%`}
            av={`${clamp(Math.round(55 - (homeScore - awayScore) * 5 - seededRand(s + tick) * 12), 30, 70)}%`}
          />
          <StatBar label="Remates"
            hv={String(homeScore * 3 + 2 + Math.round(seededRand(s + 2) * 5))}
            av={String(awayScore * 3 + 2 + Math.round(seededRand(s + 3) * 5))}
          />
          {sport === "football"    && <StatBar label="Cantos"   hv={String(Math.round(seededRand(s + 4) * 6 + homeScore))} av={String(Math.round(seededRand(s + 5) * 6 + awayScore))} />}
          {sport === "basketball"  && <StatBar label="Faltas"   hv={String(Math.round(seededRand(s + 6) * 9 + 5))} av={String(Math.round(seededRand(s + 7) * 9 + 5))} />}
          {sport === "hockey"      && <StatBar label="Remates G" hv={String(Math.round(seededRand(s + 8) * 14 + 7))} av={String(Math.round(seededRand(s + 9) * 14 + 7))} />}
          {sport === "tennis"      && <StatBar label="Aces"     hv={String(Math.round(seededRand(s + 10) * 7 + homeScore))} av={String(Math.round(seededRand(s + 11) * 7 + awayScore))} />}
          {sport === "volleyball"  && <StatBar label="Blocks"   hv={String(Math.round(seededRand(s + 12) * 6 + homeScore))} av={String(Math.round(seededRand(s + 13) * 6 + awayScore))} />}
          {sport === "baseball"    && <StatBar label="Hits"     hv={String(Math.round(seededRand(s + 14) * 8 + homeScore * 2))} av={String(Math.round(seededRand(s + 15) * 8 + awayScore * 2))} />}
        </View>

        {/* Close */}
        <Pressable style={[styles.closeBtn, { top: insets.top + 10 }]} onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={styles.closeBtnInner}>
            <Ionicons name="close" size={20} color="white" />
          </View>
        </Pressable>

      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scoreHeader: { paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 52 : 38, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#1c1c2a" },
  leagueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  leagueText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#9ca3af", flex: 1 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22c55e18", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "#22c55e40" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#22c55e" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamLeft: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#ef4444" },
  teamRight: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#60a5fa", textAlign: "right" },
  scoreMid: { flexDirection: "row", alignItems: "center", gap: 7 },
  scoreNum: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff", minWidth: 28, textAlign: "center" },
  scoreDash: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#4b5563", textAlign: "center" },
  periodLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#f59e0b", textAlign: "center" },
  fieldOuter: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#030508" },
  fieldPerspective: { width: FIELD_W, height: FIELD_H, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 12 },
  ballWrapper: { position: "absolute" },
  ball: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.85, shadowRadius: 6, elevation: 10 },
  eventOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  eventBox: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 18, borderWidth: 2 },
  eventText: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  varBanner: { position: "absolute", bottom: 12, left: 0, right: 0, alignItems: "center" },
  varText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#f59e0b", letterSpacing: 2 },
  statsBar: { flexDirection: "row", backgroundColor: "#07070e", borderTopWidth: 1, borderTopColor: "#1c1c2a", paddingTop: 10, paddingHorizontal: 8 },
  statItem: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: "#6b7280" },
  statVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  closeBtn: { position: "absolute", right: 14 },
  closeBtnInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1f1f2e", borderWidth: 1, borderColor: "#2e2e3c", alignItems: "center", justifyContent: "center" },
});
