/**
 * Visualização de chave (bracket) de um torneio de tênis — consome
 * /api/matches/tournaments/:id/draw (get_draw da api-tennis.com) diretamente,
 * em colunas por rodada. Complementa (não substitui) a lista plana de
 * partidas já existente no card de "Torneios em Curso", que perde o
 * agrupamento por rodada/seeding/progressão de chave que este componente
 * mostra.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type DrawPlayer = {
  player_key: number;
  name: string;
  seed: string | null;
  logo: string | null;
};

type DrawMatch = {
  draw_key: number;
  match_number: number;
  match_key: number | null;
  status: string;
  live: boolean;
  first_player: DrawPlayer | null;
  second_player: DrawPlayer | null;
  result: string | null;
  game_score: string | null;
  winner_player_key: number | null;
  next_slot_key: number | null;
};

type DrawRound = { round_name: string; matches: DrawMatch[] };
type DrawBracket = {
  stage: string;
  qualification: boolean;
  draw_size: number;
  rounds: DrawRound[];
};
type Draw = {
  tournament: {
    tournament_key: string;
    tournament_name: string;
    tournament_surface: string | null;
    tournament_country: string | null;
    tournament_season: string;
  };
  source: "draw_feed" | "reconstructed_from_results";
  brackets: DrawBracket[];
};

const ROUND_PT: Record<string, string> = {
  "1/64-finals": "1ª Fase",
  "1/32-finals": "2ª Fase",
  "1/16-finals": "3ª Fase",
  "1/8-finals": "Oitavas",
  "quarter-finals": "Quartos",
  "semi-finals": "Meias-Finais",
  final: "Final",
};

function PlayerSlot({
  player,
  isWinner,
}: {
  player: DrawPlayer | null;
  isWinner: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-1 truncate ${isWinner ? "text-white font-bold" : "text-zinc-400"}`}
    >
      {player?.seed && (
        <span className="text-[8px] text-zinc-600 shrink-0">
          ({player.seed})
        </span>
      )}
      <span className="truncate">{player?.name ?? "A definir"}</span>
    </div>
  );
}

function MatchCard({ m, accentBar }: { m: DrawMatch; accentBar: string }) {
  const p1Wins =
    m.winner_player_key != null &&
    m.first_player?.player_key === m.winner_player_key;
  const p2Wins =
    m.winner_player_key != null &&
    m.second_player?.player_key === m.winner_player_key;
  return (
    <div className="w-40 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/60 overflow-hidden text-[10px]">
      {m.live && <div className={`h-0.5 w-full ${accentBar} animate-pulse`} />}
      <div className="divide-y divide-zinc-800/60">
        <PlayerSlot player={m.first_player} isWinner={p1Wins} />
        <PlayerSlot player={m.second_player} isWinner={p2Wins} />
      </div>
      {m.result && (
        <div className="px-1.5 py-0.5 text-[9px] text-zinc-600 border-t border-zinc-800/60 truncate">
          {m.result}
        </div>
      )}
    </div>
  );
}

export default function TournamentBracket({
  tournamentId,
  accentBar = "bg-red-600",
  accentText = "text-red-400",
}: {
  tournamentId: string | null;
  accentBar?: string;
  accentText?: string;
}) {
  const [draw, setDraw] = useState<Draw | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    setDraw(null);
    setErrored(false);
    setLoading(true);
    fetch(`/api/matches/tournaments/${tournamentId}/draw`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setDraw(d as Draw))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (!tournamentId) return null;
  if (loading) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 flex items-center justify-center">
        <Loader2 className={`animate-spin ${accentText}`} size={18} />
      </div>
    );
  }
  if (errored || !draw || draw.brackets.length === 0) return null;

  return (
    <div className="mt-3 space-y-4">
      {draw.brackets.map((bracket, bi) => (
        <div
          key={bi}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
        >
          <div className={`h-0.5 w-full ${accentBar}`} />
          <div className="p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
              Chave{bracket.qualification ? " · Qualifying" : ""}
              {draw.brackets.length > 1 ? ` · ${bracket.stage}` : ""}
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {bracket.rounds.map((round, ri) => (
                <div key={ri} className="flex flex-col gap-2 shrink-0">
                  <div
                    className={`text-[9px] font-black uppercase tracking-wide ${accentText}`}
                  >
                    {ROUND_PT[round.round_name.toLowerCase()] ??
                      round.round_name}
                  </div>
                  <div className="flex flex-col gap-2 justify-around flex-1">
                    {round.matches.map((m) => (
                      <MatchCard
                        key={m.draw_key}
                        m={m}
                        accentBar={accentBar}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
