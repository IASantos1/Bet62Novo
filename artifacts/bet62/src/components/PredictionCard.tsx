/**
 * Card "Previsão" — probabilidades reais calculadas pelo modelo da GOAL API
 * (/fixtures/:id/predictions), distintas das odds do jogo: informativo, não
 * apostável. Exibido entre o cabeçalho do jogo e as abas de mercados,
 * mesmo local da Biblioteca de Combinações (SuggestedCombos). Renderiza
 * nada quando o provedor não tem previsão para o jogo (a maioria dos jogos
 * distantes ainda não tem, e a maioria dos esportes não é futebol).
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type Prediction = {
  result: { home: number; draw: number; away: number };
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  overUnder25: { over: number; under: number };
  bothTeamsScore: { yes: number; no: number };
  handicap: { line: number; home: number; away: number } | null;
};

type Props = {
  matchId: string | number;
  sport?: string;
  home: string;
  away: string;
};

export default function PredictionCard({ matchId, sport, home, away }: Props) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  useEffect(() => {
    setPrediction(null);
    if ((sport ?? "football") !== "football") return;
    let cancelled = false;
    fetch(`/api/matches/prediction/${encodeURIComponent(String(matchId))}`)
      .then((r) => (r.ok ? r.json() : { prediction: null }))
      .then((d) => {
        if (!cancelled) setPrediction(d.prediction ?? null);
      })
      .catch(() => {
        if (!cancelled) setPrediction(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, sport]);

  if (!prediction) return null;

  const tiles = [
    { label: home, value: prediction.result.home },
    { label: "Empate", value: prediction.result.draw },
    { label: away, value: prediction.result.away },
    { label: "Mais de 2.5", value: prediction.overUnder25.over },
    { label: "Ambas marcam", value: prediction.bothTeamsScore.yes },
    ...(prediction.handicap
      ? [{ label: `Hcp ${home.slice(0, 3).toUpperCase()} -${prediction.handicap.line}`, value: prediction.handicap.home }]
      : [{ label: "Dupla chance 1X", value: prediction.doubleChance.homeOrDraw }]),
  ];

  return (
    <div className="mb-3 bg-zinc-900 rounded-xl border border-zinc-800 p-3 animate-in fade-in duration-200">
      <div className="flex items-center gap-1.5 mb-3">
        <Sparkles size={13} className="text-red-500 shrink-0" />
        <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
          Previsão
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-zinc-950/60 border border-zinc-800 rounded-lg py-2 px-1.5 text-center"
          >
            <div className="text-[13px] font-black text-white tabular-nums">
              {t.value}%
            </div>
            <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide mt-0.5 truncate">
              {t.label}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-zinc-700 mt-2 leading-relaxed">
        Probabilidades calculadas pelo modelo do provedor de dados. Não são odds.
      </p>
    </div>
  );
}
