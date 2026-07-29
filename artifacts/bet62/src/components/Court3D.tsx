import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

// 3D-styled tennis court, shown for live tennis matches the same way
// Field3D is shown for football. Purely ambient/decorative — a continuous
// rally loop (ball, shadow, both rackets swinging) — unlike Field3D it
// doesn't react to real match events, since a tennis rally has no
// discrete "goal/corner/card"-style moments to key off; scoreboard/point
// data can be layered on top later if wanted.
export default function Court3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const scaleX = (width * 1.08) / 1200;
      const scaleY = (height * 1.05) / 370;
      setScale(Math.max(0.2, Math.min(1.8, Math.min(scaleX, scaleY))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bx     = ["14%", "32%", "49%", "51%", "68%", "84%", "14%"];
  const by     = ["55%", "48%", "50%", "50%", "52%", "45%", "55%"];
  const bz     = [40, 60, 0, 0, 60, 40, 40];
  const bScale = [0.8, 1.1, 0.5, 0.5, 1.1, 0.8, 0.8];
  const sOp    = [0.3, 0.15, 0.6, 0.6, 0.15, 0.3, 0.3];
  const times  = [0, 0.18, 0.35, 0.5, 0.68, 0.85, 1];
  const rkRot  = [0, -30, 30, 10, 0];
  const rkT    = [0, 0.1, 0.35, 0.6, 1];

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center [perspective:1400px] overflow-hidden pointer-events-none"
    >
      <div
        style={{
          transform: `rotateX(52deg) translateZ(-60px) scale(${scale})`,
          transformStyle: "preserve-3d",
        }}
        className="relative origin-center"
      >
        <motion.div
          className="relative w-[1200px] h-[600px] origin-center"
          animate={{ rotateZ: [-0.7, 0.7, -0.7] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
        >

          {/* ── Outer Surround — US Open medium blue ── */}
          <div
            className="absolute inset-0 rounded-xl overflow-hidden"
            style={{
              background: "#4a90c8",
              border: "3px solid #3a7ab0",
              boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Inner court SVG */}
            <svg
              viewBox="0 0 780 360"
              style={{ position: "absolute", left: "17.5%", top: "14%", width: "65%", height: "72%" }}
            >
              {/* Playing surface */}
              <rect x="0" y="0" width="780" height="360" fill="#1a6ab8" />

              {/* BET62 watermark */}
              <text x="390" y="180" fontSize="70" fontWeight="900"
                fill="rgba(255,255,255,0.07)"
                textAnchor="middle" dominantBaseline="central" letterSpacing="0.06em">
                BET62
              </text>

              {/* Court lines */}
              <g stroke="rgba(255,255,255,0.85)" strokeWidth="3" fill="none">
                <rect x="0" y="0" width="780" height="360" />
                <line x1="0"   y1="45"  x2="780" y2="45" />
                <line x1="0"   y1="315" x2="780" y2="315" />
                <line x1="180" y1="45"  x2="180" y2="315" />
                <line x1="600" y1="45"  x2="600" y2="315" />
                <line x1="180" y1="180" x2="600" y2="180" />
                <line x1="0"   y1="180" x2="12"  y2="180" />
                <line x1="768" y1="180" x2="780" y2="180" />
              </g>

              {/* Net shadow on court surface */}
              <line x1="390" y1="0" x2="390" y2="360"
                stroke="rgba(0,0,0,0.35)" strokeWidth="5" />

              {/* Ball trail */}
              <polyline points="110,195 200,185 280,178 390,175 500,168 580,162"
                fill="none" stroke="rgba(204,255,0,0.28)" strokeWidth="4"
                strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="110,195 200,185 280,178 390,175 500,168 580,162"
                fill="none" stroke="rgba(204,255,0,0.12)" strokeWidth="8"
                strokeLinecap="round" />
            </svg>

            {/* ── Net posts inside the surround ──
                Two dark bars running from the court top edge and bottom edge.
                The posts sit outside the inner court area (in the surround). */}
          </div>

          {/*
            ── 3D NET PANEL ──
            translateZ(20px) → small, realistic rise above the court surface.
            The net appears as a dark bar with white top tape, centered on the
            court's width (left: 50%).
          */}
          <div
            style={{
              position: "absolute",
              left: "calc(50% - 3px)",
              top: "14%",
              height: "72%",
              width: "6px",
              transform: "translateZ(20px)",
              transformStyle: "preserve-3d",
              zIndex: 60,
              borderRadius: "1px",
              overflow: "hidden",
            }}
          >
            {/* Net mesh body */}
            <div style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,18,38,0.95)",
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px), " +
                "linear-gradient(90deg, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)",
              backgroundSize: "6px 6px",
            }} />
            {/* White top tape */}
            <div style={{
              position: "absolute",
              top: 0, left: 0, right: 0, height: "6px",
              background: "rgba(245,248,255,0.95)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }} />
          </div>

          {/* Net post caps at the two ends of the net */}
          <div style={{
            position: "absolute",
            left: "calc(50% - 4px)",
            top: "14%",
            width: "8px", height: "8px",
            transform: "translateZ(20px)",
            background: "#7a9cb8",
            borderRadius: "50%",
            zIndex: 61,
          }} />
          <div style={{
            position: "absolute",
            left: "calc(50% - 4px)",
            top: "calc(14% + 72% - 8px)",
            width: "8px", height: "8px",
            transform: "translateZ(20px)",
            background: "#7a9cb8",
            borderRadius: "50%",
            zIndex: 61,
          }} />

          {/* ── Tennis Racket SVG (reusable inline) ── */}
          {/* Left-side racket — server swinging */}
          <motion.div
            style={{ position: "absolute", left: "17%", top: "35%", transformOrigin: "50% 88%", zIndex: 30 }}
            animate={{ rotate: rkRot, x: [0, -8, 12, 4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: rkT }}
          >
            <svg width="36" height="80" viewBox="0 0 36 80" fill="none">
              {/* ── Head frame ── */}
              <ellipse cx="18" cy="20" rx="15" ry="18"
                stroke="rgba(255,255,255,0.90)" strokeWidth="2.8"
                fill="rgba(255,255,255,0.05)" />
              {/* Strings — vertical */}
              {[-10,-5,0,5,10].map((dx) => {
                const half = Math.sqrt(Math.max(0, 225 - dx*dx));
                return <line key={`v${dx}`}
                  x1={18+dx} y1={20 - half + 2} x2={18+dx} y2={20 + half - 2}
                  stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
              })}
              {/* Strings — horizontal */}
              {[-13,-8,-3,2,7,12].map((dy) => {
                const half = Math.sqrt(Math.max(0, 324 - dy*dy));
                return <line key={`h${dy}`}
                  x1={18 - half + 2} y1={20+dy} x2={18 + half - 2} y2={20+dy}
                  stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
              })}
              {/* ── Throat ── two converging lines */}
              <path d="M11 36 L16 50 M25 36 L20 50"
                stroke="rgba(255,255,255,0.80)" strokeWidth="2.2"
                strokeLinecap="round" />
              {/* ── Grip / Handle — black with wrap texture ── */}
              <rect x="14.5" y="50" width="7" height="28" rx="3"
                fill="#111111" />
              {/* Grip wrapping lines */}
              {[54,59,64,69,72].map((y) => (
                <line key={y} x1="14.5" y1={y} x2="21.5" y2={y}
                  stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
              ))}
              {/* Butt cap */}
              <rect x="13" y="76" width="10" height="3" rx="1.5"
                fill="rgba(80,80,80,0.9)" />
            </svg>
          </motion.div>

          {/* Right-side racket — returner, mirrored & offset animation */}
          <motion.div
            style={{ position: "absolute", left: "79%", top: "38%", transformOrigin: "50% 88%", zIndex: 30,
              transform: "scaleX(-1)" /* mirror horizontally */ }}
            animate={{ rotate: rkRot.map(r => -r), x: [0, 8, -12, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", times: rkT, delay: 1.5 }}
          >
            <svg width="36" height="80" viewBox="0 0 36 80" fill="none">
              <ellipse cx="18" cy="20" rx="15" ry="18"
                stroke="rgba(255,255,255,0.90)" strokeWidth="2.8"
                fill="rgba(255,255,255,0.05)" />
              {[-10,-5,0,5,10].map((dx) => {
                const half = Math.sqrt(Math.max(0, 225 - dx*dx));
                return <line key={`v${dx}`}
                  x1={18+dx} y1={20 - half + 2} x2={18+dx} y2={20 + half - 2}
                  stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
              })}
              {[-13,-8,-3,2,7,12].map((dy) => {
                const half = Math.sqrt(Math.max(0, 324 - dy*dy));
                return <line key={`h${dy}`}
                  x1={18 - half + 2} y1={20+dy} x2={18 + half - 2} y2={20+dy}
                  stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />;
              })}
              <path d="M11 36 L16 50 M25 36 L20 50"
                stroke="rgba(255,255,255,0.80)" strokeWidth="2.2"
                strokeLinecap="round" />
              <rect x="14.5" y="50" width="7" height="28" rx="3"
                fill="#111111" />
              {[54,59,64,69,72].map((y) => (
                <line key={y} x1="14.5" y1={y} x2="21.5" y2={y}
                  stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
              ))}
              <rect x="13" y="76" width="10" height="3" rx="1.5"
                fill="rgba(80,80,80,0.9)" />
            </svg>
          </motion.div>

          {/* Ball shadow */}
          <motion.div
            className="absolute w-6 h-6 bg-black/50 rounded-full blur-[4px] pointer-events-none"
            style={{ transform: "translateX(-50%) translateY(-50%)", zIndex: 10 }}
            animate={{ top: by, left: bx, scale: bScale, opacity: sOp }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear", times }}
          />

          {/* Ball */}
          <motion.div
            className="absolute w-4 h-4 rounded-full bg-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.85),inset_-2px_-2px_4px_rgba(0,0,0,0.3)] pointer-events-none"
            style={{ transform: "translateX(-50%) translateY(-50%)", transformStyle: "preserve-3d", zIndex: 20 }}
            animate={{ top: by, left: bx, z: bz }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear", times }}
          />

        </motion.div>
      </div>
    </div>
  );
}
