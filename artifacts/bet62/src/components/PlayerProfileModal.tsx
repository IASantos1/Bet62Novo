/**
 * Modal de perfil de jogador — bio, estatísticas da temporada atual e
 * últimos jogos. Busca /api/matches/player-profile/:id (dados reais
 * SportMonks). Aberto a partir do nome de um jogador nos eventos ao vivo.
 */

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

type SeasonStats = {
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  yellowCards: number | null;
  redCards: number | null;
  minutesPlayed: number | null;
};

type RecentMatch = {
  fixtureId: number;
  date: string;
  opponent: string;
  competition: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number | null;
  rating: number | null;
};

type PlayerProfile = {
  id: number;
  name: string;
  imageUrl: string | null;
  nationality: string | null;
  nationalityFlagUrl: string | null;
  position: string | null;
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  team: string | null;
  teamLogoUrl: string | null;
  competition: string | null;
  seasonStats: SeasonStats;
  recentMatches: RecentMatch[];
};

function ageFromBirthDate(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function StatBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 py-2.5 text-center">
      <div className="text-lg font-black text-white tabular-nums">
        {value ?? "—"}
      </div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  );
}

export default function PlayerProfileModal({
  playerId,
  onClose,
}: {
  playerId: number | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (playerId == null) return;
    setProfile(null);
    setErrored(false);
    setLoading(true);
    fetch(`/api/matches/player-profile/${playerId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProfile(d as PlayerProfile))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (playerId == null) return null;
  const age = profile ? ageFromBirthDate(profile.dateOfBirth) : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 text-white rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors z-10"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-red-500" size={28} />
          </div>
        )}

        {!loading && errored && (
          <div className="text-center py-20 px-6">
            <div className="text-zinc-600 text-2xl mb-2">👤</div>
            <div className="text-zinc-500 text-sm font-medium">
              Perfil do jogador indisponível
            </div>
          </div>
        )}

        {!loading && !errored && profile && (
          <>
            <div className="bg-zinc-900 p-5 border-b border-zinc-800 flex items-center gap-4">
              {profile.imageUrl ? (
                <img
                  src={profile.imageUrl}
                  alt={profile.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-zinc-800 bg-zinc-800"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
                  👤
                </div>
              )}
              <div className="min-w-0">
                <div className="font-black text-lg leading-tight truncate">
                  {profile.name}
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {[profile.position, profile.nationality, age ? `${age} anos` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {profile.team && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {profile.teamLogoUrl && (
                      <img
                        src={profile.teamLogoUrl}
                        alt={profile.team}
                        className="w-4 h-4 object-contain"
                      />
                    )}
                    <span className="text-[11px] text-zinc-300 font-semibold truncate">
                      {profile.team}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">
                  Temporada Atual{profile.competition ? ` · ${profile.competition}` : ""}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="Jogos" value={profile.seasonStats.appearances} />
                  <StatBox label="Gols" value={profile.seasonStats.goals} />
                  <StatBox label="Assist." value={profile.seasonStats.assists} />
                  <StatBox label="Amarelos" value={profile.seasonStats.yellowCards} />
                  <StatBox label="Vermelhos" value={profile.seasonStats.redCards} />
                  <StatBox label="Minutos" value={profile.seasonStats.minutesPlayed} />
                </div>
              </div>

              {profile.recentMatches.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                    Últimos Jogos
                  </div>
                  <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
                    {profile.recentMatches.map((m) => (
                      <div key={m.fixtureId} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] text-zinc-500">
                            {m.date} · {m.competition || "—"}
                          </div>
                          <div className="text-[11px] font-semibold text-zinc-200 truncate">
                            {m.isHome ? "vs " : "@ "}
                            {m.opponent}{" "}
                            {m.teamScore != null && m.opponentScore != null && (
                              <span className="text-zinc-500">
                                ({m.teamScore}-{m.opponentScore})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          {m.goals > 0 && <span title="Gols">⚽ {m.goals}</span>}
                          {m.assists > 0 && <span title="Assistências">🅰️ {m.assists}</span>}
                          {m.yellowCards > 0 && <span title="Cartões amarelos">🟨 {m.yellowCards}</span>}
                          {m.redCards > 0 && <span title="Cartões vermelhos">🟥 {m.redCards}</span>}
                          {m.rating != null && (
                            <span className="font-black text-white bg-zinc-800 px-1.5 py-0.5 rounded">
                              {m.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
