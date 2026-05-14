import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 2200);
    const t2 = setTimeout(() => onDoneRef.current(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[9999] bg-zinc-950 flex flex-col items-center justify-center select-none"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-700 origin-left"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center gap-5"
          >
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.25, type: "spring", stiffness: 200 }}
              className="w-24 h-24 rounded-[28px] bg-zinc-950 flex items-center justify-center shadow-2xl shadow-red-900/50 border border-red-600/30"
            >
              <svg viewBox="0 0 192 192" width="88" height="88">
                <defs>
                  <radialGradient id="sg" cx="38%" cy="32%" r="68%">
                    <stop offset="0%" stopColor="#ffffff"/>
                    <stop offset="100%" stopColor="#d0d0d0"/>
                  </radialGradient>
                  <clipPath id="sc">
                    <circle cx="96" cy="88" r="63"/>
                  </clipPath>
                </defs>
                <circle cx="96" cy="88" r="68" fill="none" stroke="#dc2626" strokeWidth="3" opacity="0.35"/>
                <circle cx="96" cy="88" r="63" fill="url(#sg)"/>
                <g clipPath="url(#sc)" fill="#888" opacity="0.7">
                  <polygon points="96,30 114,44 108,63 84,63 78,44"/>
                  <polygon points="32,70 48,56 78,56 84,73 66,83 37,80"/>
                  <polygon points="160,70 144,56 114,56 108,73 126,83 155,80"/>
                  <polygon points="34,112 37,88 62,85 68,103 52,118"/>
                  <polygon points="158,112 155,88 130,85 124,103 140,118"/>
                  <polygon points="96,152 75,133 82,114 110,114 117,133"/>
                </g>
                <ellipse cx="78" cy="69" rx="17" ry="11" fill="white" opacity="0.3" transform="rotate(-28 78 69)"/>
                <text x="96" y="104" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="40" textAnchor="middle" fontStyle="italic" letterSpacing="-1.5">
                  <tspan fill="#111111">BET</tspan><tspan fill="#dc2626">62</tspan>
                </text>
              </svg>
            </motion.div>

            <div className="text-center">
              <motion.div
                initial={{ opacity: 0, letterSpacing: "0.3em" }}
                animate={{ opacity: 1, letterSpacing: "-0.01em" }}
                transition={{ duration: 0.6, delay: 0.35 }}
                className="text-5xl font-black tracking-tighter italic leading-none"
              >
                <span className="text-white">BET</span>
                <span className="text-red-500">62</span>
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65, duration: 0.4 }}
                className="text-zinc-500 text-sm mt-2 tracking-widest uppercase font-medium"
              >
                Apostas Esportivas
              </motion.p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-36"
          >
            <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.4, delay: 0.75, ease: "easeInOut" }}
                className="h-full bg-gradient-to-r from-red-700 to-red-400 rounded-full"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-700 origin-right"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
