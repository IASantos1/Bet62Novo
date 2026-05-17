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
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";
import type { MatchInfo } from "./ComprehensiveMarketsSheet";

const { width: SW, height: SH } = Dimensions.get("window");

const FIELD_W = SW;
const FIELD_H = Math.round(SH * 0.46);

function seededRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

type SportType = "football" | "basketball" | "tennis" | "hockey" | "baseball" | "volleyball";

function getSport(sport: string): SportType {
  if (sport === "basketball") return "basketball";
  if (sport === "tennis") return "tennis";
  if (sport === "hockey") return "hockey";
  if (sport === "baseball") return "baseball";
  if (sport === "volleyball") return "volleyball";
  return "football";
}

// ─────────────────────────────────────────────────────────────────────────────
// HUMANOID PLAYER FIGURE — top-down perspective
// ─────────────────────────────────────────────────────────────────────────────
function PlayerFigure({ x, y, color, isGK = false }: {
  x: number; y: number; color: string; isGK?: boolean;
}) {
  const jerseyColor = isGK ? "#f59e0b" : color;
  const shortsColor = isGK ? "#92400e" : "#1a1a2e";
  const skinTones = ["#f5c5a3", "#e8a87c", "#c68642", "#8d5524"];
  const skinIdx = Math.abs(Math.floor(x * 3.7 + y * 1.3)) % skinTones.length;
  const skin = skinTones[skinIdx]!;
  const hairColors = ["#1a0a00", "#2d1b00", "#0a0a0a", "#4a2800"];
  const hairIdx = Math.abs(Math.floor(x * 2.1 + y * 4.7)) % hairColors.length;
  const hair = hairColors[hairIdx]!;

  return (
    <G>
      {/* Ground shadow */}
      <Ellipse cx={x} cy={y + 4} rx={10} ry={4} fill="#00000055" />

      {/* Left boot */}
      <Ellipse cx={x - 3.5} cy={y + 11} rx={3} ry={4} fill="#111111" />
      {/* Right boot */}
      <Ellipse cx={x + 3.5} cy={y + 11} rx={3} ry={4} fill="#111111" />
      {/* Boot highlights */}
      <Ellipse cx={x - 3.5} cy={y + 10} rx={1.2} ry={1.5} fill="#333333" opacity={0.7} />
      <Ellipse cx={x + 3.5} cy={y + 10} rx={1.2} ry={1.5} fill="#333333" opacity={0.7} />

      {/* Shorts */}
      <Ellipse cx={x - 2} cy={y + 6} rx={4} ry={5} fill={shortsColor} />
      <Ellipse cx={x + 2} cy={y + 6} rx={4} ry={5} fill={shortsColor} />
      {/* Shorts seam */}
      <Line x1={x} y1={y + 3} x2={x} y2={y + 10} stroke="#ffffff22" strokeWidth={0.8} />

      {/* Jersey / Body */}
      <Ellipse cx={x} cy={y - 1} rx={7.5} ry={8.5} fill={jerseyColor} />
      {/* Jersey collar */}
      <Ellipse cx={x} cy={y - 7} rx={2.5} ry={2} fill="#00000033" />
      {/* Jersey stripe */}
      <Line x1={x} y1={y - 8} x2={x} y2={y + 5} stroke="#ffffff18" strokeWidth={2} />

      {/* Left arm */}
      <Ellipse cx={x - 9} cy={y} rx={2.8} ry={5.5} fill={jerseyColor} opacity={0.92} />
      {/* Left wrist/hand */}
      <Ellipse cx={x - 9} cy={y + 5} rx={2} ry={2.5} fill={skin} />

      {/* Right arm */}
      <Ellipse cx={x + 9} cy={y} rx={2.8} ry={5.5} fill={jerseyColor} opacity={0.92} />
      {/* Right wrist/hand */}
      <Ellipse cx={x + 9} cy={y + 5} rx={2} ry={2.5} fill={skin} />

      {/* Neck */}
      <Ellipse cx={x} cy={y - 8} rx={3} ry={2.5} fill={skin} />

      {/* Head */}
      <Circle cx={x} cy={y - 14} r={7} fill={skin} />
      {/* Head shading */}
      <Circle cx={x + 1} cy={y - 14} r={7} fill="#00000010" />

      {/* Hair */}
      <Path
        d={`M${x - 7},${y - 14} Q${x},${y - 23} ${x + 7},${y - 14} Q${x + 5},${y - 18} ${x - 5},${y - 18} Z`}
        fill={hair}
      />

      {/* Eyes */}
      <Circle cx={x - 2.8} cy={y - 14} r={1.3} fill="#ffffffcc" />
      <Circle cx={x + 2.8} cy={y - 14} r={1.3} fill="#ffffffcc" />
      <Circle cx={x - 2.8} cy={y - 14} r={0.7} fill="#1a0a00" />
      <Circle cx={x + 2.8} cy={y - 14} r={0.7} fill="#1a0a00" />

      {/* Eyebrows */}
      <Path d={`M${x - 4.5},${y - 16} Q${x - 2.5},${y - 17.5} ${x - 1},${y - 16}`} stroke={hair} strokeWidth={1.2} fill="none" />
      <Path d={`M${x + 1},${y - 16} Q${x + 2.5},${y - 17.5} ${x + 4.5},${y - 16}`} stroke={hair} strokeWidth={1.2} fill="none" />

      {/* Mouth */}
      <Path d={`M${x - 2},${y - 11.5} Q${x},${y - 10.5} ${x + 2},${y - 11.5}`} stroke="#00000066" strokeWidth={0.8} fill="none" />
    </G>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD COMPONENTS (React.memo — never re-render unless props change)
// ─────────────────────────────────────────────────────────────────────────────
const FootballField = React.memo(function FootballField() {
  const W = FIELD_W, H = FIELD_H;
  const stripeW = W / 9;
  const pbW = W * 0.16, pbH = H * 0.56, pbY = H * 0.22;
  const gbW = W * 0.07, gbH = H * 0.3, gbY = H * 0.35;
  const circR = H * 0.145;
  const goalH = H * 0.2, goalY = (H - goalH) / 2;
  const arcR = H * 0.13;
  const arcX1 = 4 + pbW, arcX2 = W - 4 - pbW;
  const arcY1 = H / 2 - arcR * 1.0, arcY2 = H / 2 + arcR * 1.0;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#16612b" />
          <Stop offset="0.5" stopColor="#1a7032" />
          <Stop offset="1" stopColor="#16612b" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#grass)" />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={i * stripeW} y={0} width={stripeW * 0.5} height={H} fill="#18682e" opacity={0.55} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2} opacity={0.9} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Circle cx={W / 2} cy={H / 2} r={circR} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Circle cx={W / 2} cy={H / 2} r={3.5} fill="white" opacity={0.9} />
      <Rect x={4} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Rect x={4} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1.2} opacity={0.9} />
      <Rect x={W - 4 - pbW} y={pbY} width={pbW} height={pbH} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Rect x={W - 4 - gbW} y={gbY} width={gbW} height={gbH} fill="none" stroke="white" strokeWidth={1.2} opacity={0.9} />
      <Circle cx={4 + pbW * 0.73} cy={H / 2} r={3} fill="white" opacity={0.9} />
      <Circle cx={W - 4 - pbW * 0.73} cy={H / 2} r={3} fill="white" opacity={0.9} />
      <Path d={`M${arcX1},${arcY1} A${arcR},${arcR} 0 0,1 ${arcX1},${arcY2}`} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Path d={`M${arcX2},${arcY1} A${arcR},${arcR} 0 0,0 ${arcX2},${arcY2}`} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />
      <Rect x={0} y={goalY} width={5} height={goalH} fill="#ffffff18" stroke="white" strokeWidth={1.5} />
      <Rect x={W - 5} y={goalY} width={5} height={goalH} fill="#ffffff18" stroke="white" strokeWidth={1.5} />
      <Path d={`M4,4 A10,10 0 0,1 14,14`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M4,${H - 4} A10,10 0 0,0 14,${H - 14}`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M${W - 4},4 A10,10 0 0,0 ${W - 14},14`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
      <Path d={`M${W - 4},${H - 4} A10,10 0 0,1 ${W - 14},${H - 14}`} fill="none" stroke="white" strokeWidth={1} opacity={0.7} />
    </Svg>
  );
});

const BasketballCourt = React.memo(function BasketballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const keyW = W * 0.16, keyH = H * 0.58, keyY = (H - keyH) / 2;
  const hoopR = H * 0.04;
  const threeR = H * 0.42;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="court" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c8783a" />
          <Stop offset="1" stopColor="#b5612a" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#court)" />
      {Array.from({ length: 12 }, (_, i) => (
        <Line key={i} x1={i * (W / 11)} y1={0} x2={i * (W / 11)} y2={H} stroke="#9a5228" strokeWidth={0.8} opacity={0.5} />
      ))}
      <Rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke="white" strokeWidth={2} />
      <Line x1={W / 2} y1={4} x2={W / 2} y2={H - 4} stroke="white" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.1} fill="none" stroke="white" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={H * 0.04} fill="#c8783a" stroke="white" strokeWidth={1.5} />
      <Rect x={4} y={keyY} width={keyW} height={keyH} fill="#2b5fa040" stroke="white" strokeWidth={1.5} />
      <Circle cx={4 + keyW} cy={H / 2} r={keyH / 5} fill="none" stroke="white" strokeWidth={1.5} />
      <Rect x={W - 4 - keyW} y={keyY} width={keyW} height={keyH} fill="#2b5fa040" stroke="white" strokeWidth={1.5} />
      <Circle cx={W - 4 - keyW} cy={H / 2} r={keyH / 5} fill="none" stroke="white" strokeWidth={1.5} />
      <Path d={`M4,${keyY - 2} A${threeR},${threeR} 0 0,1 4,${H - keyY + 2}`} fill="none" stroke="white" strokeWidth={1.5} />
      <Path d={`M${W - 4},${keyY - 2} A${threeR},${threeR} 0 0,0 ${W - 4},${H - keyY + 2}`} fill="none" stroke="white" strokeWidth={1.5} />
      <Line x1={4} y1={H / 2 - H * 0.1} x2={4} y2={H / 2 + H * 0.1} stroke="white" strokeWidth={3} />
      <Circle cx={4 + hoopR + 8} cy={H / 2} r={hoopR} fill="none" stroke="#ff6600" strokeWidth={2.5} />
      <Line x1={W - 4} y1={H / 2 - H * 0.1} x2={W - 4} y2={H / 2 + H * 0.1} stroke="white" strokeWidth={3} />
      <Circle cx={W - 4 - hoopR - 8} cy={H / 2} r={hoopR} fill="none" stroke="#ff6600" strokeWidth={2.5} />
      <Line x1={4 + keyW} y1={keyY} x2={4 + keyW} y2={H - keyY} stroke="white" strokeWidth={1.5} />
      <Line x1={W - 4 - keyW} y1={keyY} x2={W - 4 - keyW} y2={H - keyY} stroke="white" strokeWidth={1.5} />
    </Svg>
  );
});

const TennisCourt = React.memo(function TennisCourt() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 5;
  const svcY = pad + (H - pad * 2) * 0.21;
  const halfW = W / 2;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="clay" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c8562a" />
          <Stop offset="1" stopColor="#b84d20" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#clay)" />
      <Rect x={0} y={0} width={pad * 4} height={H} fill="#b54e2688" />
      <Rect x={W - pad * 4} y={0} width={pad * 4} height={H} fill="#b54e2688" />
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} fill="none" stroke="white" strokeWidth={2} />
      <Line x1={pad * 4} y1={pad} x2={pad * 4} y2={H - pad} stroke="white" strokeWidth={1.5} />
      <Line x1={W - pad * 4} y1={pad} x2={W - pad * 4} y2={H - pad} stroke="white" strokeWidth={1.5} />
      <Line x1={pad * 4} y1={svcY} x2={W - pad * 4} y2={svcY} stroke="white" strokeWidth={1.5} />
      <Line x1={pad * 4} y1={H - svcY} x2={W - pad * 4} y2={H - svcY} stroke="white" strokeWidth={1.5} />
      <Line x1={halfW} y1={svcY} x2={halfW} y2={H - svcY} stroke="white" strokeWidth={1.5} />
      <Line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="white" strokeWidth={4} />
      <Line x1={pad * 4} y1={H / 2 - 7} x2={pad * 4} y2={H / 2 + 7} stroke="white" strokeWidth={3.5} />
      <Line x1={W - pad * 4} y1={H / 2 - 7} x2={W - pad * 4} y2={H / 2 + 7} stroke="white" strokeWidth={3.5} />
      <Line x1={halfW} y1={pad} x2={halfW} y2={pad + 10} stroke="white" strokeWidth={2} />
      <Line x1={halfW} y1={H - pad - 10} x2={halfW} y2={H - pad} stroke="white" strokeWidth={2} />
    </Svg>
  );
});

const HockeyRink = React.memo(function HockeyRink() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 8;
  const blueX1 = W * 0.28, blueX2 = W * 0.72;
  const faceoffR = H * 0.15, crease = H * 0.11;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="ice" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#dce8f2" />
          <Stop offset="1" stopColor="#c8dce8" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#ice)" />
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} rx={32} ry={32} fill="none" stroke="#cc0000" strokeWidth={2.5} />
      <Line x1={blueX1} y1={pad} x2={blueX1} y2={H - pad} stroke="#0044cc" strokeWidth={3.5} />
      <Line x1={blueX2} y1={pad} x2={blueX2} y2={H - pad} stroke="#0044cc" strokeWidth={3.5} />
      <Line x1={W / 2} y1={pad} x2={W / 2} y2={H - pad} stroke="#cc0000" strokeWidth={2.5} />
      <Circle cx={W / 2} cy={H / 2} r={faceoffR} fill="none" stroke="#cc0000" strokeWidth={1.5} />
      <Circle cx={W / 2} cy={H / 2} r={4} fill="#cc0000" />
      {[W * 0.19, W * 0.81].map((fx) => [H * 0.28, H * 0.72].map((fy, j) => (
        <G key={`${fx}-${j}`}>
          <Circle cx={fx} cy={fy} r={faceoffR * 0.7} fill="none" stroke="#cc0000" strokeWidth={1.5} />
          <Circle cx={fx} cy={fy} r={3.5} fill="#cc0000" />
          <Line x1={fx - faceoffR * 0.7} y1={fy} x2={fx - faceoffR * 0.7 - 10} y2={fy} stroke="#cc0000" strokeWidth={1.5} />
          <Line x1={fx + faceoffR * 0.7} y1={fy} x2={fx + faceoffR * 0.7 + 10} y2={fy} stroke="#cc0000" strokeWidth={1.5} />
        </G>
      )))}
      <Ellipse cx={pad + 18} cy={H / 2} rx={13} ry={crease} fill="#2255cc18" stroke="#cc0000" strokeWidth={1.5} />
      <Ellipse cx={W - pad - 18} cy={H / 2} rx={13} ry={crease} fill="#2255cc18" stroke="#cc0000" strokeWidth={1.5} />
      <Rect x={pad - 2} y={H / 2 - crease} width={10} height={crease * 2} fill="#cc000033" stroke="#cc0000" strokeWidth={2} />
      <Rect x={W - pad - 8} y={H / 2 - crease} width={10} height={crease * 2} fill="#cc000033" stroke="#cc0000" strokeWidth={2} />
    </Svg>
  );
});

const BaseballDiamond = React.memo(function BaseballDiamond() {
  const W = FIELD_W, H = FIELD_H;
  const cx = W / 2, cy = H * 0.63;
  const baseLen = Math.min(W, H) * 0.31;
  const hb = { x: cx, y: cy };
  const fb = { x: cx - baseLen, y: cy - baseLen };
  const sb = { x: cx, y: cy - baseLen * 2 };
  const tb = { x: cx + baseLen, y: cy - baseLen };
  const outR = baseLen * 2.2;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="outfield" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1a5c1a" />
          <Stop offset="1" stopColor="#155215" />
        </SvgGradient>
        <SvgGradient id="infield" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#c87832" />
          <Stop offset="1" stopColor="#b06020" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#outfield)" />
      {Array.from({ length: 8 }, (_, i) => (
        <Path key={i} d={`M${cx - outR * (1 - i * 0.12)},${cy} A${outR * (1 - i * 0.12)},${outR * 0.48} 0 0,1 ${cx + outR * (1 - i * 0.12)},${cy}`}
          fill="none" stroke="#196019" strokeWidth={9} opacity={0.35} />
      ))}
      <Path d={`M${cx - outR},${cy} A${outR},${outR * 0.5} 0 0,1 ${cx + outR},${cy}`} fill="none" stroke="#7a4f20" strokeWidth={16} opacity={0.5} />
      <Path d={`M${cx - outR + 16},${cy} A${outR - 16},${(outR - 16) * 0.5} 0 0,1 ${cx + outR - 16},${cy}`} fill="none" stroke="#c87832" strokeWidth={12} opacity={0.3} />
      <Path d={`M${hb.x},${hb.y} L${fb.x},${fb.y} L${sb.x},${sb.y} L${tb.x},${tb.y} Z`} fill="url(#infield)" />
      <Path d={`M${hb.x},${hb.y} L${fb.x},${fb.y} L${sb.x},${sb.y} L${tb.x},${tb.y} Z`} fill="none" stroke="white" strokeWidth={2} />
      <Circle cx={(hb.x + sb.x) / 2} cy={(hb.y + sb.y) / 2} r={11} fill="#b06020" stroke="white" strokeWidth={1.2} />
      {[hb, fb, sb, tb].map((b, i) => (
        <Rect key={i} x={b.x - 7} y={b.y - 7} width={14} height={14} fill="white" stroke="#cccccc" strokeWidth={1} rx={2} />
      ))}
      <Path d={`M${hb.x},${hb.y - 11} L${hb.x - 8},${hb.y - 5} L${hb.x - 8},${hb.y + 5} L${hb.x + 8},${hb.y + 5} L${hb.x + 8},${hb.y - 5} Z`} fill="white" />
      <Path d={`M${cx - outR},${cy} A${outR},${outR * 0.5} 0 0,1 ${cx + outR},${cy}`} fill="none" stroke="#6a4010" strokeWidth={5} />
    </Svg>
  );
});

const VolleyballCourt = React.memo(function VolleyballCourt() {
  const W = FIELD_W, H = FIELD_H;
  const pad = 8;
  const attackY1 = pad + (H - pad * 2) * 0.28;
  const attackY2 = H - pad - (H - pad * 2) * 0.28;
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="vcourt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#d06820" />
          <Stop offset="1" stopColor="#b85818" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#vcourt)" />
      {Array.from({ length: 8 }, (_, i) => (
        <Rect key={i} x={i * W / 7} y={0} width={W / 14} height={H} fill="#b55c1a" opacity={0.4} />
      ))}
      <Rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} fill="none" stroke="white" strokeWidth={2.5} />
      <Line x1={pad} y1={attackY1} x2={W - pad} y2={attackY1} stroke="white" strokeWidth={1.8} />
      <Line x1={pad} y1={attackY2} x2={W - pad} y2={attackY2} stroke="white" strokeWidth={1.8} />
      <Line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="white" strokeWidth={5} />
      <Line x1={pad} y1={H / 2 - 9} x2={pad} y2={H / 2 + 9} stroke="white" strokeWidth={5} />
      <Line x1={W - pad} y1={H / 2 - 9} x2={W - pad} y2={H / 2 + 9} stroke="white" strokeWidth={5} />
      <Line x1={W / 2} y1={H / 2 - 5} x2={W / 2} y2={H / 2 + 5} stroke="white" strokeWidth={2} />
    </Svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER POSITIONS
// ─────────────────────────────────────────────────────────────────────────────
type PlayerDot = { x: number; y: number; color: string; isGK?: boolean };

function getFormationPositions(sport: SportType, side: "home" | "away", seed: number): PlayerDot[] {
  const W = FIELD_W, H = FIELD_H;
  const homeColor = "#dc2626";
  const awayColor = "#2563eb";
  const color = side === "home" ? homeColor : awayColor;
  const mirror = side === "away";

  function jitter(v: number, range: number, s: number) {
    return v + (seededRand(s) - 0.5) * range;
  }
  function pos(fx: number, fy: number, s: number, gk = false): PlayerDot {
    const x = mirror ? W - fx * W : fx * W;
    const y = fy * H;
    return { x: jitter(x, 8, seed + s * 13.7), y: jitter(y, 8, seed + s * 7.3), color, isGK: gk };
  }

  if (sport === "football") {
    return [
      pos(0.07, 0.5, 1, true),
      pos(0.21, 0.2, 2), pos(0.2, 0.4, 3), pos(0.2, 0.6, 4), pos(0.21, 0.8, 5),
      pos(0.43, 0.28, 6), pos(0.42, 0.5, 7), pos(0.43, 0.72, 8),
      pos(0.65, 0.22, 9), pos(0.65, 0.78, 10),
      pos(0.73, 0.5, 11),
    ];
  }
  if (sport === "basketball") {
    return [
      pos(0.13, 0.5, 1),
      pos(0.22, 0.28, 2), pos(0.22, 0.72, 3),
      pos(0.38, 0.5, 4),
      pos(0.47, 0.22, 5),
    ];
  }
  if (sport === "tennis") {
    const baselineY = side === "home" ? H * 0.8 : H * 0.2;
    return [{ x: W / 2 + (seededRand(seed + 1) - 0.5) * 70, y: baselineY, color }];
  }
  if (sport === "hockey") {
    return [
      pos(0.07, 0.5, 1, true),
      pos(0.22, 0.28, 2), pos(0.22, 0.72, 3),
      pos(0.39, 0.5, 4),
      pos(0.48, 0.24, 5), pos(0.48, 0.76, 6),
    ];
  }
  if (sport === "baseball") {
    if (side === "away") {
      const cx = W / 2, cy = H * 0.63, bl = Math.min(W, H) * 0.31;
      return [
        { x: cx, y: cy - bl * 2.3, color },
        { x: cx - bl * 1.3, y: cy - bl * 1.5, color },
        { x: cx + bl * 1.3, y: cy - bl * 1.5, color },
        { x: cx - bl * 0.6, y: cy - bl * 0.55, color },
        { x: cx + bl * 0.6, y: cy - bl * 0.55, color },
        { x: cx - bl * 0.9, y: cy - bl * 1.0, color },
        { x: cx + bl * 0.9, y: cy - bl * 1.0, color },
        { x: cx, y: cy - bl, color },
        { x: cx, y: cy - bl * 1.05, color, isGK: true },
      ];
    } else {
      const cx = W / 2, cy = H * 0.63;
      return [{ x: cx, y: cy + 6, color }];
    }
  }
  if (sport === "volleyball") {
    const yBase = side === "home" ? H * 0.72 : H * 0.28;
    return Array.from({ length: 6 }, (_, i) => ({
      x: W * 0.18 + (i % 3) * W * 0.32,
      y: yBase + Math.floor(i / 3) * H * 0.14 * (side === "home" ? 1 : -1),
      color,
    }));
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// BALL WAYPOINTS
// ─────────────────────────────────────────────────────────────────────────────
function getBallWaypoints(sport: SportType, event: string, seed: number, homeWinning: boolean): Array<[number, number]> {
  const W = FIELD_W, H = FIELD_H;
  const r = (n: number) => seededRand(seed + n);
  const ev = event.toUpperCase();

  if (sport === "football") {
    if (ev.includes("GOLO") || ev.includes("GOAL")) return [[W - 8, H / 2], [W - 8, H / 2 + 12], [W - 8, H / 2 - 12]];
    if (ev.includes("PENAL")) return [[W * 0.88, H / 2]];
    if (ev.includes("VAR")) return [[W / 2, H / 2]];
    if (ev.includes("CORNER")) return [[W - 6, H * 0.07], [W * 0.76, H * 0.33], [W * 0.86, H / 2]];
    if (ev.includes("CHANCE")) return [[W * 0.84, H / 2 + (r(1) - 0.5) * H * 0.3], [W * 0.91, H / 2]];
    const bias = homeWinning ? 0.62 : 0.38;
    return Array.from({ length: 7 }, (_, i) => {
      const inAtk = r(i * 5.3) < bias;
      return [
        inAtk ? lerp(W * 0.55, W * 0.91, r(i * 7.1)) : lerp(W * 0.09, W * 0.55, r(i * 3.2)),
        lerp(H * 0.1, H * 0.9, r(i * 2.9)),
      ] as [number, number];
    });
  }
  if (sport === "basketball") {
    if (homeWinning) return [[W * 0.12, H / 2], [W * 0.28, H * 0.38], [W * 0.1, H * 0.44]];
    return [[W * 0.88, H / 2], [W * 0.72, H * 0.62], [W * 0.9, H * 0.56]];
  }
  if (sport === "tennis") {
    return [
      [W * 0.28, H * 0.76], [W / 2, H / 2 + 5], [W * 0.72, H * 0.24],
      [W * 0.62, H * 0.28], [W / 2, H / 2 - 5], [W * 0.38, H * 0.72],
    ];
  }
  if (sport === "hockey") {
    return Array.from({ length: 6 }, (_, i) => [
      lerp(W * 0.08, W * 0.92, r(i * 4.1)),
      lerp(H * 0.1, H * 0.9, r(i * 3.7)),
    ] as [number, number]);
  }
  if (sport === "baseball") {
    const cx = W / 2, cy = H * 0.63, bl = Math.min(W, H) * 0.31;
    return [[cx, cy - bl], [cx + bl * (r(1) - 0.5) * 1.5, cy - bl * (1 + r(2))], [cx + (r(3) - 0.5) * W * 0.55, cy - H * 0.28]];
  }
  if (sport === "volleyball") {
    return [
      [W * 0.38, H * 0.73], [W / 2, H / 2 - 12], [W * 0.62, H * 0.27],
      [W * 0.5, H * 0.24], [W / 2, H / 2 + 12], [W * 0.5, H * 0.73],
    ];
  }
  return [[W / 2, H / 2]];
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function EventOverlay({ reason }: { reason: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const r = reason.toUpperCase();
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.back(1.8)) }),
      Animated.delay(2800),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [reason]);

  let label = "", color = "#ef4444", bg = "#1a000088";
  if (r.includes("GOLO") || r.includes("GOAL")) { label = "⚽  G O L O !"; color = "#22c55e"; bg = "#00200088"; }
  else if (r.includes("VAR")) { label = "📺  REVISÃO  VAR"; color = "#f59e0b"; bg = "#18100088"; }
  else if (r.includes("PENAL")) { label = "🎯  PENÁLTI"; color = "#f87171"; bg = "#1a000088"; }
  else if (r.includes("CHANCE")) { label = "⚡  GRANDE CHANCE!"; color = "#f59e0b"; bg = "#18100088"; }
  else { label = "⏱  PAUSA"; color = "#9ca3af"; bg = "#11111888"; }

  return (
    <Animated.View style={[styles.eventOverlay, {
      opacity: anim,
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
    }]} pointerEvents="none">
      <View style={[styles.eventBox, { borderColor: color, backgroundColor: bg }]}>
        <Text style={[styles.eventText, { color }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE HEADER
// ─────────────────────────────────────────────────────────────────────────────
function ScoreHeader({ match, sport }: { match: MatchInfo; sport: SportType }) {
  const sportIcon: Record<SportType, string> = {
    football: "soccer", basketball: "basketball", tennis: "tennis-ball",
    hockey: "hockey-puck", baseball: "baseball", volleyball: "volleyball",
  };
  const periods = match._liveExtra?.periods;
  const quarters = match._liveExtra?.quarters;
  const innings = match._liveExtra?.innings;
  let periodLabel = "";
  if (sport === "hockey" && periods) periodLabel = periods.length <= 3 ? `${periods.length}º PERÍODO` : "PRORROGAÇÃO";
  else if (sport === "basketball" && quarters) periodLabel = `${quarters.length}º QUARTO`;
  else if (sport === "baseball" && innings) periodLabel = `${innings.length}ª ENTRADA`;
  else if (match.status === "HT") periodLabel = "INTERVALO";
  else if (match.minute) periodLabel = `${match.minute}'`;

  return (
    <LinearGradient colors={["#08080f", "#0f0f1a"]} style={styles.scoreHeader}>
      <View style={styles.scoreLeagueRow}>
        <MaterialCommunityIcons name={sportIcon[sport] as never} size={13} color="#f59e0b" />
        <Text style={styles.scoreLeagueText} numberOfLines={1}>{match.league ?? sport.toUpperCase()}</Text>
        <View style={styles.aovivoBadge}>
          <View style={styles.aovivoDot} />
          <Text style={styles.aovivoText}>AO VIVO</Text>
        </View>
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.teamNameLeft} numberOfLines={2}>{match.home}</Text>
        <View style={styles.scoreCenter}>
          <Text style={styles.scoreNum}>{match.homeScore ?? 0}</Text>
          <View style={styles.scoreSep}>
            <Text style={styles.scoreDash}>–</Text>
            {periodLabel ? <Text style={styles.periodLabel}>{periodLabel}</Text> : null}
          </View>
          <Text style={styles.scoreNum}>{match.awayScore ?? 0}</Text>
        </View>
        <Text style={styles.teamNameRight} numberOfLines={2}>{match.away}</Text>
      </View>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
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
  const waypointIdxRef = useRef(0);

  const [eventReason, setEventReason] = useState("");
  const [eventKey, setEventKey] = useState(0);
  const [tick, setTick] = useState(0);

  const waypoints = getBallWaypoints(sport, match.suspensionReason ?? "", seed + tick, homeWinning);

  const animateBallTo = useCallback((target: [number, number], duration: number) => {
    Animated.parallel([
      Animated.timing(ballAnim, {
        toValue: { x: target[0], y: target[1] }, duration,
        useNativeDriver: false, easing: Easing.inOut(Easing.quad),
      }),
      Animated.sequence([
        Animated.timing(ballScale, { toValue: 0.75, duration: duration * 0.25, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1.3, duration: duration * 0.45, useNativeDriver: true }),
        Animated.timing(ballScale, { toValue: 1, duration: duration * 0.3, useNativeDriver: true }),
      ]),
    ]).start();
  }, [ballAnim, ballScale]);

  useEffect(() => {
    if (!visible) return;
    function scheduleTick() {
      const idx = waypointIdxRef.current % waypoints.length;
      const next = waypoints[idx]!;
      waypointIdxRef.current++;
      const fast = sport === "hockey" || (sport === "tennis" && idx % 2 === 0) || sport === "volleyball";
      const dur = fast
        ? 500 + seededRand(seed + idx * 3.1) * 400
        : 850 + seededRand(seed + idx * 2.7) * 1300;
      animateBallTo(next, dur);
      tickRef.current = setTimeout(scheduleTick, dur + 150);
    }
    scheduleTick();
    return () => { if (tickRef.current) clearTimeout(tickRef.current); };
  }, [visible, sport, homeWinning, tick]);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setTick((v) => v + 1), 9000);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    if (r && (r.includes("GOLO") || r.includes("GOAL") || r.includes("VAR") || r.includes("PENAL") || r.includes("CHANCE"))) {
      setEventReason(match.suspensionReason ?? "");
      setEventKey((k) => k + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [match.suspensionReason]);

  useEffect(() => {
    const r = (match.suspensionReason ?? "").toUpperCase();
    if (r.includes("GOLO") || r.includes("GOAL")) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.7, duration: 280, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]), { iterations: 5 }).start();
    }
  }, [match.suspensionReason]);

  const homePlayers = getFormationPositions(sport, "home", seed);
  const awayPlayers = getFormationPositions(sport, "away", seed + 1000);

  const wander = (p: PlayerDot, i: number): PlayerDot => {
    const w = sport === "football" ? 15 : sport === "hockey" ? 18 : sport === "basketball" ? 17 : 9;
    return {
      ...p,
      x: p.x + (seededRand(seed + i * 7.3 + tick * 0.17) - 0.5) * w,
      y: p.y + (seededRand(seed + i * 3.1 + tick * 0.23) - 0.5) * w,
    };
  };

  const allPlayers = [
    ...homePlayers.map((p, i) => wander(p, i)),
    ...awayPlayers.map((p, i) => wander(p, i + 100)),
  ];

  const bgColors: [string, string] = sport === "hockey" ? ["#1a2838", "#0d1520"] :
    sport === "basketball" ? ["#1a0d08", "#0d0804"] :
    sport === "baseball" ? ["#0d1a0d", "#080d08"] :
    sport === "tennis" ? ["#1a0d08", "#0d0804"] :
    sport === "volleyball" ? ["#1a0d08", "#0d0804"] :
    ["#080f08", "#040804"];

  const sportPrimary: Record<SportType, string> = {
    football: "#22c55e", basketball: "#f97316", tennis: "#c8562a",
    hockey: "#3b82f6", baseball: "#22c55e", volleyball: "#f97316",
  };

  const ballColor = sport === "baseball" || sport === "tennis" ? "#fef08a" :
    sport === "hockey" ? "#1f2937" : "#ffffff";

  const isVAR = (match.suspensionReason ?? "").toUpperCase().includes("VAR");

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={bgColors} style={styles.container}>
        <ScoreHeader match={match} sport={sport} />

        {/* ── FIELD ─────────────────────────────────────────────── */}
        <View style={styles.fieldOuter}>
          <View style={[styles.fieldPerspective, { shadowColor: sportPrimary[sport] }]}>

            {/* Static field markings */}
            {sport === "football" && <FootballField />}
            {sport === "basketball" && <BasketballCourt />}
            {sport === "tennis" && <TennisCourt />}
            {sport === "hockey" && <HockeyRink />}
            {sport === "baseball" && <BaseballDiamond />}
            {sport === "volleyball" && <VolleyballCourt />}

            {/* Players overlay (SVG humanoid figures) */}
            <Svg width={FIELD_W} height={FIELD_H} style={StyleSheet.absoluteFill}>
              {allPlayers.map((p, i) => (
                <PlayerFigure key={i} x={p.x} y={p.y} color={p.color} isGK={p.isGK} />
              ))}
            </Svg>

            {/* Animated ball */}
            <Animated.View style={[
              styles.ballWrapper,
              {
                left: Animated.subtract(ballAnim.x, new Animated.Value(9)),
                top: Animated.subtract(ballAnim.y, new Animated.Value(9)),
                transform: [{ scale: Animated.multiply(ballScale, pulseAnim) }],
              },
            ]}>
              {sport === "hockey" ? (
                <View style={[styles.ball, { backgroundColor: "#222", width: 14, height: 9, borderRadius: 4 }]} />
              ) : sport === "baseball" || sport === "tennis" ? (
                <View style={[styles.ball, { backgroundColor: ballColor, borderColor: "#ca8a04", borderWidth: 1.5 }]} />
              ) : sport === "volleyball" ? (
                <View style={[styles.ball, { backgroundColor: "#f4c220" }]} />
              ) : sport === "basketball" ? (
                <View style={[styles.ball, { backgroundColor: "#e85d04" }]} />
              ) : (
                <View style={styles.ball} />
              )}
            </Animated.View>

          </View>

          {/* Event overlay */}
          {eventReason !== "" && <EventOverlay key={eventKey} reason={eventReason} />}

          {/* VAR freeze banner */}
          {isVAR && (
            <View style={styles.varBanner}>
              <Text style={styles.varText}>📺  V A R  —  REVISÃO EM ANDAMENTO</Text>
            </View>
          )}
        </View>

        {/* ── STATS BAR ──────────────────────────────────────────── */}
        <View style={[styles.statsBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <StatItem
            label="Posse"
            homeVal={`${Math.min(95, Math.max(5, Math.round(45 + (homeScore - awayScore) * 5 + seededRand(seed + tick) * 12)))}%`}
            awayVal={`${Math.min(95, Math.max(5, Math.round(55 - (homeScore - awayScore) * 5 - seededRand(seed + tick) * 12)))}%`}
            homeColor="#dc2626" awayColor="#2563eb"
          />
          <StatItem
            label="Remates"
            homeVal={String(homeScore * 3 + 2 + Math.round(seededRand(seed + 2) * 5))}
            awayVal={String(awayScore * 3 + 2 + Math.round(seededRand(seed + 3) * 5))}
            homeColor="#dc2626" awayColor="#2563eb"
          />
          {sport === "football" && <StatItem label="Cantos" homeVal={String(Math.round(seededRand(seed + 4) * 6 + homeScore))} awayVal={String(Math.round(seededRand(seed + 5) * 6 + awayScore))} homeColor="#dc2626" awayColor="#2563eb" />}
          {sport === "basketball" && <StatItem label="Faltas" homeVal={String(Math.round(seededRand(seed + 6) * 9 + 5))} awayVal={String(Math.round(seededRand(seed + 7) * 9 + 5))} homeColor="#dc2626" awayColor="#2563eb" />}
          {sport === "hockey" && <StatItem label="Remates G" homeVal={String(Math.round(seededRand(seed + 8) * 13 + 7))} awayVal={String(Math.round(seededRand(seed + 9) * 13 + 7))} homeColor="#dc2626" awayColor="#2563eb" />}
          {sport === "tennis" && <StatItem label="Aces" homeVal={String(Math.round(seededRand(seed + 10) * 7 + homeScore))} awayVal={String(Math.round(seededRand(seed + 11) * 7 + awayScore))} homeColor="#dc2626" awayColor="#2563eb" />}
          {sport === "volleyball" && <StatItem label="Blocks" homeVal={String(Math.round(seededRand(seed + 12) * 6 + homeScore))} awayVal={String(Math.round(seededRand(seed + 13) * 6 + awayScore))} homeColor="#dc2626" awayColor="#2563eb" />}
          {sport === "baseball" && <StatItem label="Hits" homeVal={String(Math.round(seededRand(seed + 14) * 8 + homeScore * 2))} awayVal={String(Math.round(seededRand(seed + 15) * 8 + awayScore * 2))} homeColor="#dc2626" awayColor="#2563eb" />}
        </View>

        {/* Close button */}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 52 : 38,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  scoreLeagueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  scoreLeagueText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#9ca3af", flex: 1 },
  aovivoBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22c55e1a", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "#22c55e44" },
  aovivoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  aovivoText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#22c55e" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamNameLeft: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#ef4444", textAlign: "left" },
  teamNameRight: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", color: "#60a5fa", textAlign: "right" },
  scoreCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  scoreNum: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#ffffff", minWidth: 28, textAlign: "center" },
  scoreSep: { alignItems: "center", gap: 1 },
  scoreDash: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#4b5563" },
  periodLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },
  fieldOuter: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#030508" },
  fieldPerspective: {
    width: FIELD_W,
    height: FIELD_H,
    transform: [{ perspective: 720 }, { rotateX: "24deg" }, { scaleY: 0.9 }],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 14,
  },
  ballWrapper: { position: "absolute" },
  ball: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 8,
  },
  eventOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  eventBox: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  eventText: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  varBanner: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  varText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#f59e0b", letterSpacing: 2 },
  statsBar: {
    flexDirection: "row",
    backgroundColor: "#08080f",
    borderTopWidth: 1,
    borderTopColor: "#1f1f2e",
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: "#6b7280" },
  statVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  closeBtn: { position: "absolute", right: 14 },
  closeBtnInner: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#1f1f2e",
    borderWidth: 1, borderColor: "#2e2e3c",
    alignItems: "center", justifyContent: "center",
  },
});
