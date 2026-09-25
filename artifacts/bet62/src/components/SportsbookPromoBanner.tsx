import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// BET62-branded stand-in for the WinHouse iframe's own banner carousel,
// which sits inside its scrollable content (not at a fixed viewport
// position) — there is no reliable way to overlay something on top of it
// from the parent page across scroll positions/screen sizes, and on
// mobile its own banners were rendering visibly cropped. Same three
// messages, BET62 colors instead of WinHouse's, placed in normal page
// flow right above the embed instead (Santos, 2026-09-25).
const SLIDES = [
  {
    title: "Melhores Odds",
    subtitle: "Odds competitivas em todas as grandes ligas.",
    cta: "Ver o programa de hoje",
  },
  {
    title: "Apostas Ao Vivo",
    subtitle: "Ao vivo em mais de 30 desportos, atualizado em tempo real.",
    cta: "Apostar agora",
  },
  {
    title: "Sportsbook BET62",
    subtitle: "Milhares de mercados. Odds ao vivo a cada segundo.",
    cta: "Explorar desportos",
  },
];

export default function SportsbookPromoBanner() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length);
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[active];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-800 to-black border border-red-900/60 px-5 py-6 sm:px-8 sm:py-8">
      <button
        aria-label="Anterior"
        onClick={() => setActive((prev) => (prev - 1 + SLIDES.length) % SLIDES.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        aria-label="Próximo"
        onClick={() => setActive((prev) => (prev + 1) % SLIDES.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors"
      >
        <ChevronRight size={18} />
      </button>

      <div className="mx-8 text-center sm:mx-12">
        <h2 className="b62-font-display text-2xl sm:text-4xl font-black italic tracking-tight text-white">
          {slide.title}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-white/80">{slide.subtitle}</p>
        <div className="mt-4 inline-flex rounded-full bg-white text-red-700 text-xs sm:text-sm font-black uppercase tracking-wide px-5 py-2.5">
          {slide.cta}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-5 bg-white" : "w-1.5 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
