import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Line,
  LinearGradient as SvgGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MatchInfo } from "./ComprehensiveMarketsSheet";

const { width: SW, height: SH } = Dimensions.get("window");

function seededRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type SportType = "football" | "basketball" | "tennis" | "hockey" | "baseball" | "volleyball";

function getSport(sport: string): SportType {
  if (!sport || sport === "football") return "football";
  if (sport === "basketball") return "basketball";
  if (sport === "tennis") return "tennis";
  if (sport === "hockey") return "hockey";
  if (sport === "baseball") return "baseball";
  if (sport === "volleyball") return "volleyball";
  return "football";
}

const FIELD_W = SW - 0;
const FIELD_H = Math.round(SH * 0.44);

// ─────────── FOOTBALL FIELD ───────────
function FootballField() {
  const W = FIELD_W, H = FIELD_H;
  const stripeW = W / 9;
  const pbW = W * 0.16, pbH = H * 0.56, pbY = H * 0.22;
  const gbW = W * 0.07, gbH = H * 0.3, gbY = H * 0.35;
  const circR = H * 0.145;
  const goalH = H * 0.2, goalY = (H - goalH) / 2;
  const arcR = H * 0.13;
  const arcX1 = 5 + pbW;
  const arcX2 = W - 5 - pbW;
  const arcY1 = H / 2 - arcR * 1.0;
  const arcY2 = H / 2 + arcR * 1.0;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1a4d1a" />
          <Stop offset="0.5" stopColor="#1e5c1e" />
          <Stop offset="1" stopColor="#1a4d1a" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#grass)" />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={i * stripeW} y={0} width={stripeW / 2} height={H} fill="#1b5a1b" opacity={0.6} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2} opacity={0.9} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Circle cx={W / 2} cy={H / 2} r={circR} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Circle cx={W / 2} cy={H / 2} r={3} fill="white" opacity={0.9} />
      <Rect x={4} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Rect x={4} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1} opacity={0.9} />
      <Rect x={W - 4 - pbW} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Rect x={W - 4 - gbW} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1} opacity={0.9} />
      <Circle cx={4 + pbW * 0.73} cy={H / 2} r={2.5} fill="white" opacity={0.9} />
      <Circle cx={W - 4 - pbW * 0.73} cy={H / 2} r={2.5} fill="white" opacity={0.9} />
      <Path d={`M${arcX1},${arcY1} A${arcR},${arcR} 0 0,1 ${arcX1},${arcY2}`} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Path d={`M${arcX2},${arcY1} A${arcR},${arcR} 0 0,0 ${arcX2},${arcY2}`} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      {/* Goals */}
      <Rect x={0} y={goalY} width={5} height={goalH} fill="#ffffff22" stroke="white" strokeWidth={1.5} />
      <Rect x={W - 5} y={goalY} width={5} height={goalH} fill="#ffffff22" stroke="white" strokeWidth={1.5} />
      {/* Corner arcs */}
      <Path d={`M4,4 A10,10 0 0,1 14,14`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M4,${H - 4} A10,10 0 0,0 14,${H - 14}`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M${W - 4},4 A10,10 0 0,0 ${W - 14},14`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M${W - 4},${H - 4} A10,10 0 0,1 ${W - 14},${H - 14}`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
    </Svg>
  );
}

// ─────────── BASKETBALL COURT ───────────
function BasketballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const keyW = W * 0.16, keyH = H * 0.58, keyY = (H - keyH) / 2;
  const hoopR = H * 0.04;
  const threeR = H * 0.42;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="court" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c8783a" />
          <Stop offset="1" stopColor="#b5612a" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#court)" />
      {/* Court lines */}
      {Array.from({ length: 12 }, (_, i) => (
        <Line key={i} x1={i * (W / 11)} y1={0} x2={i * (W / 11)} y2={H} stroke="#9a5228" strokeWidth={0.8} opacity={0.5} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.1} fill="none" stroke="white" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.04} fill="#c8783a" stroke="white" strokeWidth={1.5} />
      {/* Left key */}
      <Rect x={4} y={keyY} width={keyW} height={keyH} fill="#2b5fa0" fillOpacity={0.4} stroke="white" strokeWidth={1.5} />
      <Circle cx={4 + keyW} cy={H / 2} r={keyH / 5} fill="none" stroke="white" strokeWidth={1.5} />
      {/* Right key */}
      <Rect x={W - 4 - keyW} y={keyY} width={keyW} height={keyH} fill="#2b5fa0" fillOpacity={0.4} stroke="white" strokeWidth={1.5} />
      <Circle cx={W - 4 - keyW} cy={H / 2} r={keyH / 5} fill="none" stroke="white" strokeWidth={1.5} />
      {/* Three-point lines */}
      <Path d={`M4,${keyY - 2} A${threeR},${threeR} 0 0,1 4,${H - keyY + 2}`} fill="none" stroke="white" strokeWidth={1.5} />
      <Path d={`M${W - 4},${keyY - 2} A${threeR},${threeR} 0 0,0 ${W - 4},${H - keyY + 2}`} fill="none" stroke="white" strokeWidth={1.5} />
      {/* Backboards and hoops */}
      <Line x1={4} y1={H / 2 - H * 0.1} x2={4} y2={H / 2 + H * 0.1} stroke="white" strokeWidth={3} />
      <Circle cx={4 + hoopR + 8} cy={H / 2} r={hoopR} fill="none" stroke="#ff6600" strokeWidth={2.5} />
      <Line x1={W - 4} y1={H / 2 - H * 0.1} x2={W - 4} y2={H / 2 + H * 0.1} stroke="white" strokeWidth={3} />
      <Circle cx={W - 4 - hoopR - 8} cy={H / 2} r={hoopR} fill="none" stroke="#ff6600" strokeWidth={2.5} />
      {/* Free throw line */}
      <Line x1={4 + keyW} y1={keyY} x2={4 + keyW} y2={H - keyY} stroke="white" strokeWidth={1.5} />
      <Line x1={W - 4 - keyW} y1={keyY} x2={W - 4 - keyW} y2={H - keyY} stroke="white" strokeWidth={1.5} />
    </Svg>
  );
}

// ─────────── TENNIS COURT ───────────
function TennisCourt() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 5;
  const svcW = (W - pad * 2) * 0.44;
  const svcH = (H - pad * 2) * 0.58;
  const svcY = pad + (H - pad * 2) * 0.21;
  const svcMid = pad + svcW;
  const svcMidR = W - pad - svcW;
  const halfW = W / 2;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="clay" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c8562a" />
          <Stop offset="1" stopColor="#b84d20" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#clay)" />
      {/* Doubles alleys highlight */}
      <Rect x={0} y={0} width={pad * 4} height={H} fill="#b54e26" opacity={0.5} />
      <Rect x={W - pad * 4} y={0} width={pad * 4} height={H} fill="#b54e26" opacity={0.5} />
      {/* Outer boundary */}
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} fill="none" stroke="white" strokeWidth={2} />
      {/* Singles sidelines */}
      <Line x1={pad * 4} y1={pad} x2={pad * 4} y2={H - pad} stroke="white" strokeWidth={1.5} />
      <Line x1={W - pad * 4} y1={pad} x2={W - pad * 4} y2={H - pad} stroke="white" strokeWidth={1.5} />
      {/* Service boxes */}
      <Line x1={pad * 4} y1={svcY} x2={W - pad * 4} y2={svcY} stroke="white" strokeWidth={1.5} />
      <Line x1={pad * 4} y1={H - svcY} x2={W - pad * 4} y2={H - svcY} stroke="white" strokeWidth={1.5} />
      <Line x1={halfW} y1={svcY} x2={halfW} y2={H - svcY} stroke="white" strokeWidth={1.5} />
      {/* Net */}
      <Line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="white" strokeWidth={3} />
      {/* Net posts */}
      <Line x1={pad * 4} y1={H / 2 - 6} x2={pad * 4} y2={H / 2 + 6} stroke="white" strokeWidth={3} />
      <Line x1={W - pad * 4} y1={H / 2 - 6} x2={W - pad * 4} y2={H / 2 + 6} stroke="white" strokeWidth={3} />
      {/* Center mark */}
      <Line x1={halfW} y1={pad} x2={halfW} y2={pad + 8} stroke="white" strokeWidth={2} />
      <Line x1={halfW} y1={H - pad - 8} x2={halfW} y2={H - pad} stroke="white" strokeWidth={2} />
    </Svg>
  );
}

// ─────────── HOCKEY RINK ───────────
function HockeyRink() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 8;
  const blueX1 = W * 0.28;
  const blueX2 = W * 0.72;
  const faceoffR = H * 0.15;
  const crease = H * 0.1;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="ice" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#dce8f0" />
          <Stop offset="1" stopColor="#c8dce8" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#ice)" />
      {/* Rink border */}
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} rx={30} ry={30} fill="none" stroke="#cc0000" strokeWidth={2.5} />
      {/* Blue lines */}
      <Line x1={blueX1} y1={pad} x2={blueX1} y2={H - pad} stroke="#0044cc" strokeWidth={3} />
      <Line x1={blueX2} y1={pad} x2={blueX2} y2={H - pad} stroke="#0044cc" strokeWidth={3} />
      {/* Center red line */}
      <Line x1={W / 2} y1={pad} x2={W / 2} y2={H - pad} stroke="#cc0000" strokeWidth={2.5} />
      {/* Center circle */}
      <Circle cx={W / 2} cy={H / 2} r={faceoffR} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={4} fill="#cc0000" />
      {/* Face-off circles */}
      <Circle cx={W * 0.2} cy={H * 0.3} r={faceoffR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W * 0.2} cy={H * 0.3} r={3} fill="#cc0000" />
      <Circle cx={W * 0.2} cy={H * 0.7} r={faceoffR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W * 0.2} cy={H * 0.7} r={3} fill="#cc0000" />
      <Circle cx={W * 0.8} cy={H * 0.3} r={faceoffR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W * 0.8} cy={H * 0.3} r={3} fill="#cc0000" />
      <Circle cx={W * 0.8} cy={H * 0.7} r={faceoffR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W * 0.8} cy={H * 0.7} r={3} fill="#cc0000" />
      {/* Goal creases */}
      <Ellipse cx={pad + 20} cy={H / 2} rx={12} ry={crease} fill="#2255cc22" stroke="#cc0000" strokeWidth={1.5} />
      <Ellipse cx={W - pad - 20} cy={H / 2} rx={12} ry={crease} fill="#2255cc22" stroke="#cc0000" strokeWidth={1.5} />
      {/* Goals */}
      <Rect x={pad - 2} y={H / 2 - crease} width={10} height={crease * 2} fill="#cc000033" stroke="#cc0000" strokeWidth={2} />
      <Rect x={W - pad - 8} y={H / 2 - crease} width={10} height={crease * 2} fill="#cc000033" stroke="#cc0000" strokeWidth={2} />
    </Svg>
  );
}

// ─────────── BASEBALL DIAMOND ───────────
function BaseballDiamond() {
  const W = FIELD_W, H = FIELD_H;
  const cx = W / 2, cy = H * 0.62;
  const baseLen = Math.min(W, H) * 0.32;
  const hb = { x: cx, y: cy };
  const fb = { x: cx - baseLen, y: cy - baseLen };
  const sb = { x: cx, y: cy - baseLen * 2 };
  const tb = { x: cx + baseLen, y: cy - baseLen };
  const mound = { x: cx, y: cy - baseLen };
  const outR = baseLen * 2.2;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="outfield" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1e5c1e" />
          <Stop offset="1" stopColor="#1a5219" />
        </SvgGradient>
        <SvgGradient id="infield" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c8823c" />
          <Stop offset="1" stopColor="#b56f2d" />
        </SvgGradient>
      </Defs>
      {/* Outfield grass */}
      <Rect x={0} y={0} width={W} height={H} fill="url(#outfield)" />
      {/* Outfield warning track */}
      <Path d={`M${cx - outR},${cy} A${outR},${outR} 0 0,1 ${cx + outR},${cy} L${cx + outR - 12},${cy} A${outR - 12},${outR - 12} 0 0,0 ${cx - outR + 12},${cy} Z`} fill="#b56f2d" />
      {/* Infield clay diamond */}
      <Polygon points={`${hb.x},${hb.y} ${fb.x},${fb.y} ${sb.x},${sb.y} ${tb.x},${tb.y}`} fill="url(#infield)" />
      {/* Grass stripes */}
      {Array.from({ length: 8 }, (_, i) => (
        <Path key={i} d={`M${cx - outR + i * outR / 4},${cy} A${outR - i * outR / 4 + 5},${outR / 2} 0 0,1 ${cx + outR - i * outR / 4},${cy}`} fill="none" stroke="#1b5a1b" strokeWidth={8} opacity={0.4} />
      ))}
      {/* Base paths */}
      <Polygon points={`${hb.x},${hb.y} ${fb.x},${fb.y} ${sb.x},${sb.y} ${tb.x},${tb.y}`} fill="none" stroke="white" strokeWidth={2} />
      {/* Mound */}
      <Circle cx={mound.x} cy={mound.y} r={12} fill="#a56828" stroke="white" strokeWidth={1} />
      {/* Bases */}
      {[hb, fb, sb, tb].map((b, i) => (
        <Rect key={i} x={b.x - 7} y={b.y - 7} width={14} height={14} fill="white" stroke="#cccccc" strokeWidth={1} rx={2} />
      ))}
      {/* Home plate */}
      <Polygon points={`${hb.x},${hb.y - 10} ${hb.x - 8},${hb.y - 5} ${hb.x - 8},${hb.y + 5} ${hb.x + 8},${hb.y + 5} ${hb.x + 8},${hb.y - 5}`} fill="white" />
      {/* Outfield wall arc */}
      <Path d={`M${cx - outR},${cy} A${outR},${outR} 0 0,1 ${cx + outR},${cy}`} fill="none" stroke="#886644" strokeWidth={4} />
    </Svg>
  );
}

// ─────────── VOLLEYBALL COURT ───────────
function VolleyballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 8;
  const attackY1 = pad + (H - pad * 2) * 0.28;
  const attackY2 = H - pad - (H - pad * 2) * 0.28;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="vcourt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#e07830" />
          <Stop offset="1" stopColor="#cc6820" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#vcourt)" />
      {/* Court markings */}
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} fill="none" stroke="white" strokeWidth={2.5} />
      {/* Attack lines */}
      <Line x1={pad} y1={attackY1} x2={W - pad} y2={attackY1} stroke="white" strokeWidth={1.5} />
      <Line x1={pad} y1={attackY2} x2={W - pad} y2={attackY2} stroke="white" strokeWidth={1.5} />
      {/* Net */}
      <Line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="white" strokeWidth={4} />
      {/* Net poles */}
      <Line x1={pad} y1={H / 2 - 8} x2={pad} y2={H / 2 + 8} stroke="white" strokeWidth={4} />
      <Line x1={W - pad} y1={H / 2 - 8} x2={W - pad} y2={H / 2 + 8} stroke="white" strokeWidth={4} />
      {/* Center line */}
      <Line x1={W / 2} y1={H / 2 - 4} x2={W / 2} y2={H / 2 + 4} stroke="white" strokeWidth={2} />
      {/* Service zones */}
      <Line x1={pad - 8} y1={pad} x2={pad - 8} y2={attackY1} stroke="white" strokeWidth={1.5} />
      <Line x1={pad - 8} y1={attackY2} x2={pad - 8} y2={H - pad} stroke="white" strokeWidth={1.5} />
    </Svg>
  );
}

// ─────────── PLAYER POSITIONS ───────────
type PlayerDot = { x: number; y: number; color: string; num?: string };

function getFormationPositions(sport: SportType, side: "home" | "away", seed: number): PlayerDot[] {
  const W = FIELD_W, H = FIELD_H;
  const homeColor = "#ef4444";
  const awayColor = "#60a5fa";
  const color = side === "home" ? homeColor : awayColor;
  const mirror = side === "away";

  function jitter(v: number, range: number, s: number) {
    return v + (seededRand(s) - 0.5) * range;
  }
  function pos(fx: number, fy: number, s: number): PlayerDot {
    const x = mirror ? W - fx * W : fx * W;
    const y = fy * H;
    return { x: jitter(x, 10, seed + s * 13.7), y: jitter(y, 10, seed + s * 7.3), color };
  }

  if (sport === "football") {
    return [
      pos(0.07, 0.5, 1),   // GK
      pos(0.2, 0.25, 2), pos(0.2, 0.42, 3), pos(0.2, 0.58, 4), pos(0.2, 0.75, 5), // 4 defenders
      pos(0.42, 0.3, 6), pos(0.42, 0.5, 7), pos(0.42, 0.7, 8),  // 3 midfielders
      pos(0.65, 0.25, 9), pos(0.65, 0.75, 10), // 2 wingers
      pos(0.72, 0.5, 11),  // striker
    ];
  }
  if (sport === "basketball") {
    return [
      pos(0.15, 0.5, 1),    // C near paint
      pos(0.22, 0.3, 2), pos(0.22, 0.7, 3), // PF
      pos(0.35, 0.5, 4),    // SF
      pos(0.45, 0.25, 5),   // SG
      pos(0.45, 0.75, 6),   // PG
    ].slice(0, 5);
  }
  if (sport === "tennis") {
    const baselineY = side === "home" ? H * 0.8 : H * 0.2;
    return [{ x: W / 2 + (seededRand(seed + 1) - 0.5) * 80, y: baselineY, color }];
  }
  if (sport === "hockey") {
    return [
      pos(0.08, 0.5, 1),   // G
      pos(0.22, 0.3, 2), pos(0.22, 0.7, 3), // D
      pos(0.38, 0.5, 4),   // C
      pos(0.45, 0.25, 5), pos(0.45, 0.75, 6), // W
    ];
  }
  if (sport === "baseball") {
    if (side === "away") {
      const cx = W / 2, cy = H * 0.62, bl = Math.min(W, H) * 0.32;
      return [
        { x: cx, y: cy - bl * 2.3, color },    // CF
        { x: cx - bl * 1.4, y: cy - bl * 1.4, color }, // LF
        { x: cx + bl * 1.4, y: cy - bl * 1.4, color }, // RF
        { x: cx, y: cy - bl, color },   // SS/2B area
        { x: cx - bl * 0.6, y: cy - bl * 0.6, color }, // 3B
        { x: cx + bl * 0.6, y: cy - bl * 0.6, color }, // 1B
        { x: cx - bl * 0.9, y: cy - bl, color }, // SS
        { x: cx + bl * 0.9, y: cy - bl, color }, // 2B
        { x: cx, y: cy - bl, color },  // P (on mound)
      ];
    } else {
      const cx = W / 2, cy = H * 0.62, bl = Math.min(W, H) * 0.32;
      return [
        { x: cx, y: cy + 5, color },  // Batter
      ];
    }
  }
  if (sport === "volleyball") {
    const yBase = side === "home" ? H * 0.7 : H * 0.3;
    return Array.from({ length: 6 }, (_, i) => ({
      x: W * 0.18 + (i % 3) * W * 0.32,
      y: yBase + Math.floor(i / 3) * H * 0.15 * (side === "home" ? 1 : -1),
      color,
    }));
  }
  return [];
}

// ─────────── BALL WAYPOINTS ───────────
function getBallWaypoints(sport: SportType, event: string, seed: number, homeWinning: boolean): Array<[number, number]> {
  const W = FIELD_W, H = FIELD_H;
  const r = (n: number) => seededRand(seed + n);

  const ev = event.toUpperCase();

  if (sport === "football") {
    if (ev.includes("GOLO") || ev.includes("GOAL")) {
      return [[W - 10, H / 2], [W - 10, H / 2 + 15], [W - 10, H / 2 - 15]];
    }
    if (ev.includes("PENAL")) {
      return [[W * 0.88, H / 2], [W * 0.88, H / 2]];
    }
    if (ev.includes("VAR")) {
      return [[W / 2, H / 2]];
    }
    if (ev.includes("CORNER")) {
      return [[W - 6, H * 0.08], [W * 0.75, H * 0.35], [W * 0.85, H / 2]];
    }
    if (ev.includes("CHANCE")) {
      return [[W * 0.82, H / 2 + (r(1) - 0.5) * H * 0.3], [W * 0.9, H / 2]];
    }
    const attackBias = homeWinning ? 0.6 : 0.4;
    return Array.from({ length: 6 }, (_, i) => {
      const t = r(i * 5.3);
      const inAttack = t < attackBias;
      const x = inAttack ? lerp(W * 0.55, W * 0.9, r(i * 7.1)) : lerp(W * 0.1, W * 0.55, r(i * 3.2));
      const y = lerp(H * 0.12, H * 0.88, r(i * 2.9));
      return [x, y] as [number, number];
    });
  }

  if (sport === "basketball") {
    if (homeWinning) {
      return [[W * 0.12, H / 2], [W * 0.3, H * 0.4], [W * 0.1, H * 0.45]];
    }
    return [[W * 0.88, H / 2], [W * 0.7, H * 0.6], [W * 0.9, H * 0.55]];
  }

  if (sport === "tennis") {
    return [
      [W * 0.3, H * 0.75], [W * 0.5, H / 2 + 5], [W * 0.7, H * 0.25],
      [W * 0.6, H * 0.3], [W * 0.5, H / 2 - 5], [W * 0.4, H * 0.7],
    ];
  }

  if (sport === "hockey") {
    return Array.from({ length: 5 }, (_, i) => [
      lerp(W * 0.08, W * 0.92, r(i * 4.1)),
      lerp(H * 0.1, H * 0.9, r(i * 3.7)),
    ] as [number, number]);
  }

  if (sport === "baseball") {
    const cx = W / 2, cy = H * 0.62, bl = Math.min(W, H) * 0.32;
    return [
      [cx, cy - bl],  // mound
      [cx + bl * (r(1) - 0.5), cy - bl * (0.5 + r(2))], // hit arc
      [cx + (r(3) - 0.5) * W * 0.6, cy - H * 0.3],  // outfield
    ];
  }

  if (sport === "volleyball") {
    return [
      [W * 0.4, H * 0.72], [W / 2, H / 2 - 10], [W * 0.6, H * 0.28],
      [W * 0.5, H * 0.25], [W / 2, H / 2 + 10], [W * 0.5, H * 0.72],
    ];
  }

  return [[W / 2, H / 2]];
}

// ─────────── EVENT OVERLAY ───────────
function EventOverlay({ reason, home, away }: { reason: string; home: string; away: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const r = reason.toUpperCase();

  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.back(2)) }),
      Animated.delay(2500),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [reason]);

  let label = "", icon: string = "alert-circle", color = "#ef4444", bg = "#1a0000";
  if (r.includes("GOLO") || r.includes("GOAL")) {
    label = "⚽  G O L O !"; icon = "football"; color = "#22c55e"; bg = "#001a00";
  } else if (r.includes("VAR")) {
    label = "📺  REVISÃO  VAR"; icon = "videocam"; color = "#f59e0b"; bg = "#1a1000";
  } else if (r.includes("PENAL")) {
    label = "🎯  PENÁLTI"; icon = "radio-button-on"; color = "#f87171"; bg = "#1a0000";
  } else if (r.includes("CHANCE")) {
    label = "⚡  GRANDE  CHANCE!"; icon = "flash"; color = "#f59e0b"; bg = "#1a0e00";
  } else {
    label = "⏱  PAUSA"; color = "#9ca3af"; bg = "#111118";
  }

  return (
    <Animated.View style={[styles.eventOverlay, {
      opacity: anim,
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
    }]}>
      <View style={[styles.eventBox, { borderColor: color, backgroundColor: bg }]}>
        <Text style={[styles.eventText, { color }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// ─────────── SCORE HEADER ───────────
function ScoreHeader({
  match, sport, colors: c,
}: {
  match: MatchInfo;
  sport: SportType;
  colors: { background: string; foreground: string; primary: string; border: string; muted: string; mutedForeground: string; card: string };
}) {
  const sportIcon: Record<SportType, string> = {
    football: "soccer", basketball: "basketball", tennis: "tennis-ball",
    hockey: "hockey-puck", baseball: "baseball", volleyball: "volleyball",
  };
  const periods = match._liveExtra?.periods;
  const quarters = match._liveExtra?.quarters;
  const innings = match._liveExtra?.innings;

  let periodLabel = "";
  if (sport === "hockey" && periods) {
    const idx = periods.length;
    periodLabel = idx <= 3 ? `${idx}º PERÍODO` : "PRORROGAÇÃO";
  } else if (sport === "basketball" && quarters) {
    const idx = quarters.length;
    periodLabel = `${idx}º QUARTO`;
  } else if (sport === "baseball" && innings) {
    periodLabel = `${innings.length}ª ENTRADA`;
  } else if (match.status === "HT") {
    periodLabel = "INTERVALO";
  } else if (match.minute) {
    periodLabel = `${match.minute}'`;
  }

  return (
    <LinearGradient colors={["#0a0a12", "#111118"]} style={styles.scoreHeader}>
      <View style={styles.scoreLeagueRow}>
        <MaterialCommunityIcons name={sportIcon[sport] as any} size={13} color="#f59e0b" />
        <Text style={styles.scoreLeagueText} numberOfLines={1}>{match.league ?? sport.toUpperCase()}</Text>
        <View style={styles.aovivoBadge}>
          <View style={styles.aovivoDot} />
          <Text style={styles.aovivoText}>AO VIVO</Text>
        </View>
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.teamNameLeft} numberOfLines={1}>{match.home}</Text>
        <View style={styles.scoreCenter}>
          <Text style={styles.scoreNum}>{match.homeScore ?? 0}</Text>
          <View style={styles.scoreSep}>
            <Text style={styles.scoreDash}>–</Text>
            {periodLabel ? <Text style={styles.periodLabel}>{periodLabel}</Text> : null}
          </View>
          <Text style={styles.scoreNum}>{match.awayScore ?? 0}</Text>
        </View>
        <Text style={styles.teamNameRight} numberOfLines={1}>{match.away}</Text>
      </View>
    </LinearGradient>
  );
}

// ─────────── MAIN COMPONENT ───────────
export function LiveMatchSimulator({ visible, match, onClose }: {
  visible: boolean;
  match: MatchInfo;
  onClose: () => void;
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

  const waypointIdxRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [eventReason, setEventReason] = useState("");
  const [eventKey, setEventKey] = useState(0);
  const [tick, setTick] = useState(0);

  const waypoints = getBallWaypoints(sport, match.suspensionReason ?? "", seed + tick, homeWinning);

  const animateBallTo = useCallback((target: [number, number], duration: number) => {
    Animated.parallel([
      Animated.timing(ballAnim, { toValue: { x: target[0], y: target[1] }, duration, useNativeDriver: false, easing: Easing.inOut(Easing.quad) }),
      Animated.sequence([
        Animated.timing(ballScale, { toValue: 0.8, duration: duration * 0.3, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1.2, duration: duration * 0.4, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1, duration: duration * 0.3, useNativeDriver: true }),
      ]),
    ]).start();
  }, [ballAnim, ballScale]);

  useEffect(() => {
    if (!visible) return;
    function tick() {
      const idx = waypointIdxRef.current % waypoints.length;
      const next = waypoints[idx];
      waypointIdxRef.current++;
      const isFast = sport === "hockey" || (sport === "tennis" && idx % 2 === 0);
      const dur = isFast ? 600 + seededRand(seed + idx * 3.1) * 400
        : 900 + seededRand(seed + idx * 2.7) * 1200;
      animateBallTo(next, dur);
      tickRef.current = setTimeout(tick, dur + 200);
    }
    tick();
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [visible, sport, homeWinning, tick]);

  // Refresh waypoints every 8s for variety
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setTick((v) => v + 1), 8000);
    return () => clearInterval(t);
  }, [visible]);

  // React to suspension events
  useEffect(() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    if (r && (r.includes("GOLO") || r.includes("GOAL") || r.includes("VAR") || r.includes("PENAL") || r.includes("CHANCE"))) {
      setEventReason(match.suspensionReason ?? "");
      setEventKey((k) => k + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [match.suspensionReason]);

  // Ball pulse on goal
  useEffect(() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    if (r.includes("GOLO") || r.includes("GOAL")) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]), { iterations: 4 }).start();
    }
  }, [match.suspensionReason]);

  const homePlayers = getFormationPositions(sport, "home", seed);
  const awayPlayers = getFormationPositions(sport, "away", seed + 1000);

  // Player position wander (updates with tick)
  const wanderOffset = (base: PlayerDot, i: number): PlayerDot => {
    const wander = sport === "football" ? 14 : sport === "hockey" ? 18 : sport === "basketball" ? 16 : 8;
    return {
      ...base,
      x: base.x + (seededRand(seed + i * 7.3 + tick * 0.17) - 0.5) * wander,
      y: base.y + (seededRand(seed + i * 3.1 + tick * 0.23) - 0.5) * wander,
    };
  };

  const allPlayers = [
    ...homePlayers.map((p, i) => wanderOffset(p, i)),
    ...awayPlayers.map((p, i) => wanderOffset(p, i + 100)),
  ];

  // Get background gradient for each sport
  const bgColors: [string, string] = sport === "hockey" ? ["#1a2838", "#0d1520"] :
    sport === "basketball" ? ["#1a0d08", "#0d0804"] :
    sport === "baseball" ? ["#0d1a0d", "#080d08"] :
    sport === "tennis" ? ["#1a0d08", "#0d0804"] :
    sport === "volleyball" ? ["#1a0d08", "#0d0804"] :
    ["#0a1a0a", "#050d05"];

  const sportColors: Record<SportType, string> = {
    football: "#22c55e", basketball: "#f97316", tennis: "#c8562a",
    hockey: "#3b82f6", baseball: "#22c55e", volleyball: "#f97316",
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={bgColors} style={styles.container}>
        <ScoreHeader match={match} sport={sport} colors={{ background: "", foreground: "", primary: sportColors[sport], border: "", muted: "", mutedForeground: "", card: "" }} />

        {/* Field */}
        <View style={styles.fieldContainer}>
          <View style={[styles.perspective, { shadowColor: sportColors[sport] }]}>
            {sport === "football" && <FootballField />}
            {sport === "basketball" && <BasketballCourt />}
            {sport === "tennis" && <TennisCourt />}
            {sport === "hockey" && <HockeyRink />}
            {sport === "baseball" && <BaseballDiamond />}
            {sport === "volleyball" && <VolleyballCourt />}

            {/* Players */}
            {allPlayers.map((p, i) => (
              <View key={i} style={[styles.playerDot, { left: p.x - 7, top: p.y - 7, backgroundColor: p.color }]}>
                <View style={[styles.playerInner, { backgroundColor: p.color }]} />
              </View>
            ))}

            {/* Ball */}
            <Animated.View style={[styles.ballWrapper, {
              transform: [
                { translateX: Animated.subtract(ballAnim.x, new Animated.Value(8)) },
                { translateY: Animated.subtract(ballAnim.y, new Animated.Value(8)) },
                { scale: Animated.multiply(ballScale, pulseAnim) },
              ],
            }]}>
              {sport === "baseball" || sport === "tennis" ? (
                <View style={[styles.ball, { backgroundColor: "#fef08a", borderWidth: 1, borderColor: "#ca8a04" }]} />
              ) : sport === "hockey" ? (
                <View style={[styles.ball, { backgroundColor: "#1f2937", width: 10, height: 7, borderRadius: 3 }]} />
              ) : (
                <View style={styles.ball} />
              )}
            </Animated.View>
          </View>

          {/* Event overlay */}
          {eventReason !== "" && <EventOverlay key={eventKey} reason={eventReason} home={match.home} away={match.away} />}

          {/* VAR freeze overlay */}
          {(match.suspensionReason ?? "").toUpperCase().includes("VAR") && (
            <View style={styles.varOverlay}>
              <Text style={styles.varText}>📺  V A R</Text>
              <Text style={styles.varSub}>REVISÃO EM ANDAMENTO</Text>
            </View>
          )}
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <StatItem label="Posse" homeVal={`${Math.round(45 + (homeScore - awayScore) * 5 + seededRand(seed + tick) * 10)}%`} awayVal={`${Math.round(55 - (homeScore - awayScore) * 5 - seededRand(seed + tick) * 10)}%`} homeColor="#ef4444" awayColor="#60a5fa" />
          <StatItem label="Remates" homeVal={String(homeScore * 3 + 2 + Math.round(seededRand(seed + 2) * 4))} awayVal={String(awayScore * 3 + 2 + Math.round(seededRand(seed + 3) * 4))} homeColor="#ef4444" awayColor="#60a5fa" />
          {sport === "football" && <StatItem label="Cantos" homeVal={String(Math.round(seededRand(seed + 4) * 5 + homeScore))} awayVal={String(Math.round(seededRand(seed + 5) * 5 + awayScore))} homeColor="#ef4444" awayColor="#60a5fa" />}
          {sport === "basketball" && <StatItem label="Faltas" homeVal={String(Math.round(seededRand(seed + 6) * 8 + 6))} awayVal={String(Math.round(seededRand(seed + 7) * 8 + 6))} homeColor="#ef4444" awayColor="#60a5fa" />}
          {sport === "hockey" && <StatItem label="Remates G" homeVal={String(Math.round(seededRand(seed + 8) * 12 + 8))} awayVal={String(Math.round(seededRand(seed + 9) * 12 + 8))} homeColor="#ef4444" awayColor="#60a5fa" />}
          {sport === "tennis" && <StatItem label="Aces" homeVal={String(Math.round(seededRand(seed + 10) * 6 + homeScore))} awayVal={String(Math.round(seededRand(seed + 11) * 6 + awayScore))} homeColor="#ef4444" awayColor="#60a5fa" />}
          {sport === "volleyball" && <StatItem label="Aces" homeVal={String(Math.round(seededRand(seed + 12) * 4 + homeScore))} awayVal={String(Math.round(seededRand(seed + 13) * 4 + awayScore))} homeColor="#ef4444" awayColor="#60a5fa" />}
        </View>

        {/* Close button */}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.closeBtnInner}>
            <Ionicons name="close" size={20} color="white" />
          </View>
        </Pressable>
      </LinearGradient>
    </Modal>
  );
}

function StatItem({ label, homeVal, awayVal, homeColor, awayColor }: {
  label: string; homeVal: string; awayVal: string; homeColor: string; awayColor: string;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statVal, { color: homeColor }]}>{homeVal}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, { color: awayColor }]}>{awayVal}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scoreHeader: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 50 : 36,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  scoreLeagueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  scoreLeagueText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#9ca3af", flex: 1 },
  aovivoBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22c55e20", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "#22c55e44" },
  aovivoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  aovivoText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#22c55e" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamNameLeft: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold", color: "#ef4444", textAlign: "left" },
  teamNameRight: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold", color: "#60a5fa", textAlign: "right" },
  scoreCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  scoreNum: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#ffffff", minWidth: 28, textAlign: "center" },
  scoreSep: { alignItems: "center" },
  scoreDash: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#4b5563" },
  periodLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#f59e0b", marginTop: 1 },
  fieldContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#050508",
  },
  perspective: {
    width: FIELD_W,
    height: FIELD_H,
    transform: [{ perspective: 700 }, { rotateX: "22deg" }, { scaleY: 0.92 }],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  playerDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#ffffffcc",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
  playerInner: { width: 6, height: 6, borderRadius: 3, opacity: 0.6 },
  ballWrapper: { position: "absolute" },
  ball: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 6,
  },
  eventOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  eventBox: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "#00000088",
  },
  eventText: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  varOverlay: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  varText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f59e0b", letterSpacing: 3 },
  varSub: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#f59e0b88", marginTop: 2 },
  statsBar: {
    flexDirection: "row",
    backgroundColor: "#0a0a12",
    borderTopWidth: 1,
    borderTopColor: "#1f1f2e",
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: "#6b7280" },
  statVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  closeBtn: { position: "absolute", right: 14 },
  closeBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1f1f2e",
    borderWidth: 1,
    borderColor: "#2e2e3c",
    alignItems: "center",
    justifyContent: "center",
  },
});
