import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 700);
    const t2 = setTimeout(() => onDoneRef.current(), 950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center select-none overflow-hidden"
        >
          {/* Radial red glow — centered */}
          <div
            className="absolute pointer-events-none"
            style={{
              inset: 0,
              background:
                "radial-gradient(ellipse 65% 55% at 50% 52%, rgba(185,28,28,0.18) 0%, rgba(185,28,28,0.07) 45%, transparent 70%)",
            }}
          />
          {/* Faint bottom edge glow */}
          <div
            className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 100% at 50% 100%, rgba(185,28,28,0.10) 0%, transparent 70%)",
            }}
          />

          {/* Pulsing brand */}
          <motion.div
            initial={{ opacity: 0, scale: 0.90 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ opacity: { duration: 0.28, delay: 0.05 }, scale: { duration: 0.32, delay: 0.05, ease: "easeOut" } }}
            className="flex items-end leading-none"
          >
            <span
              className="font-black italic tracking-tighter text-white"
              style={{ fontSize: "clamp(72px, 13vw, 100px)", lineHeight: 1 }}
            >
              BET
            </span>
            <span
              className="font-black italic tracking-tighter text-red-600"
              style={{
                fontSize: "clamp(92px, 17vw, 130px)",
                lineHeight: 0.92,
                textShadow:
                  "0 0 48px rgba(220,38,38,0.55), 0 0 100px rgba(220,38,38,0.20)",
              }}
            >
              62
            </span>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.38 }}
            transition={{ delay: 0.22, duration: 0.3 }}
            className="absolute bottom-14 text-white text-xs tracking-[0.30em] uppercase font-medium"
          >
            A melhor casa de apostas
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
