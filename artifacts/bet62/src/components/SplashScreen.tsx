import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 2200);
    const t2 = setTimeout(() => onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

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
          {/* Animated red stripe top */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-700 origin-left"
          />

          {/* Logo container */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center gap-5"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.25, type: "spring", stiffness: 200 }}
              className="w-20 h-20 rounded-2xl bg-red-600 flex items-center justify-center shadow-2xl shadow-red-900/60"
            >
              <svg viewBox="0 0 80 80" width="56" height="56" fill="none">
                <path d="M28 56V24h16c5 0 8.5 3 8.5 7.5 0 2.8-1.4 5-3.6 6.2 2.8 1.2 4.6 3.7 4.6 6.8C53.5 50.2 49.5 56 43 56H28zm8-19h7c2.5 0 4-1.4 4-3.5S45.5 30 43 30h-7v7zm0 12h7.5c2.8 0 4.5-1.5 4.5-3.8S46.3 43 43.5 43H36v6z" fill="white"/>
              </svg>
            </motion.div>

            {/* BET62 text */}
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

          {/* Loading bar */}
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

          {/* Red stripe bottom */}
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
