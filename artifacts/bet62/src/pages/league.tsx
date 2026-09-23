import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

type StandingRow = {
  pos: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  zone?: string;
};

type LeagueEvent = {
  id: string;
  eventId: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: string;
  date?: string;
  time?: string;
  roundNumber?: number;
  roundName?: string;
  groupName?: string;
};

type TopScorer = {
  rank: number;
  playerId: string | null;
  name: string;
  teamId: string | null;
  team: string;
  value: number;
  matches: number;
  position: string;
  imageUrl: string | null;
};

type BestXiPlayer = {
  id: string;
  name: string;
  team: string;
  position: string;
  rating: number | null;
  shirtNumber: string | null;
  imageUrl: string | null;
};

type LeaguePagePayload = {
  header: {
    id: number;
    name: string;
    country: string;
    isWomen: boolean;
    logoUrl: string;
  };
  season: {
    id: string | null;
    name: string;
    year: string | null;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  } | null;
  standings: {
    table: StandingRow[];
    groups: Array<{ name: string; table: StandingRow[] }>;
  };
  fixtures: LeagueEvent[];
  results: LeagueEvent[];
  topScorers: TopScorer[];
  bestXi: {
    formation?: string;
    players: BestXiPlayer[];
  };
};

function formatDateLabel(date?: string, time?: string): string {
  if (!date && !time) return "-";
  const dt = date ? new Date(`${date}T${time ?? "00:00"}:00Z`) : null;
  if (!dt || Number.isNaN(dt.getTime())) return [date, time].filter(Boolean).join(" ");
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: time ? "2-digit" : undefined,
    minute: time ? "2-digit" : undefined,
    timeZone: "UTC",
  }).format(dt);
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-4 md:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function LeaguePage({ leagueId }: { leagueId: string }) {
  const [, navigate] = useLocation();
  const [data, setData] = useState<LeaguePagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/matches/leagues/${encodeURIComponent(leagueId)}/page`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("league page unavailable"))))
      .then((payload: LeaguePagePayload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? "Falha ao carregar liga"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const standingsSections = useMemo(() => {
    if (!data) return [];
    if (data.standings.groups.length > 0) {
      return data.standings.groups.map((group) => ({
        title: group.name,
        rows: group.table,
      }));
    }
    return [{ title: "Classificação", rows: data.standings.table }];
  }, [data]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-8">
        <button
          onClick={() => navigate("/esportes")}
          className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
        >
          Voltar aos esportes
        </button>

        {loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-zinc-400">
            A carregar página da liga...
          </div>
        ) : error || !data ? (
          <div className="rounded-3xl border border-red-900/40 bg-red-950/20 p-8 text-center">
            <div className="text-lg font-black text-white">Liga indisponível</div>
            <div className="mt-2 text-sm text-zinc-400">{error ?? "Sem dados para esta liga."}</div>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[32px] border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950">
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-7">
                <div className="flex items-center gap-4">
                  <img
                    src={data.header.logoUrl}
                    alt={data.header.name}
                    className="h-16 w-16 rounded-2xl bg-white/95 p-2 object-contain"
                  />
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-red-400">
                      Página da Liga
                    </div>
                    <h1 className="mt-1 text-2xl font-black md:text-3xl">
                      {data.header.name}
                    </h1>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">
                        {data.header.country || "País não informado"}
                      </span>
                      {data.season ? (
                        <span className="rounded-full border border-zinc-800 px-2.5 py-1">
                          {data.season.name}
                        </span>
                      ) : null}
                      {data.header.isWomen ? (
                        <span className="rounded-full border border-zinc-800 px-2.5 py-1">
                          Feminino
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {data.season ? (
                  <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Temporada
                      </div>
                      <div className="mt-1 text-sm font-bold text-white">
                        {data.season.year ?? "-"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Atual
                      </div>
                      <div className="mt-1 text-sm font-bold text-white">
                        {data.season.isCurrent ? "Sim" : "Não"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 col-span-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                        Janela
                      </div>
                      <div className="mt-1 text-sm font-bold text-white">
                        {[data.season.startDate, data.season.endDate].filter(Boolean).join(" -> ")}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[1.6fr,1fr]">
              <div className="space-y-5">
                {standingsSections.map((section) => (
                  <SectionCard
                    key={section.title}
                    title={section.title}
                    subtitle="Posição, campanha, golos e pontos"
                  >
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-zinc-500">
                          <tr className="border-b border-zinc-800 text-left">
                            <th className="pb-2 pr-3">#</th>
                            <th className="pb-2 pr-3">Equipa</th>
                            <th className="pb-2 pr-3">J</th>
                            <th className="pb-2 pr-3">V</th>
                            <th className="pb-2 pr-3">E</th>
                            <th className="pb-2 pr-3">D</th>
                            <th className="pb-2 pr-3">GM</th>
                            <th className="pb-2 pr-3">GS</th>
                            <th className="pb-2">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => (
                            <tr key={`${section.title}-${row.pos}-${row.name}`} className="border-b border-zinc-900">
                              <td className="py-2 pr-3 font-black text-zinc-300">{row.pos}</td>
                              <td className="py-2 pr-3 font-semibold text-white">{row.name}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.played}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.won}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.drawn}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.lost}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.gf}</td>
                              <td className="py-2 pr-3 text-zinc-300">{row.ga}</td>
                              <td className="py-2 font-black text-white">{row.pts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                ))}

                <SectionCard
                  title="Jogos"
                  subtitle="Próximas partidas da temporada atual"
                >
                  <div className="space-y-2">
                    {data.fixtures.length === 0 ? (
                      <div className="text-sm text-zinc-500">Sem jogos agendados.</div>
                    ) : (
                      data.fixtures.map((match) => (
                        <div
                          key={match.id}
                          className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-white">{match.home}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              {match.roundName || match.groupName || `Jornada ${match.roundNumber || "-"}`}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-400">
                              {match.status}
                            </div>
                            <div className="mt-1 text-xs text-zinc-400">
                              {formatDateLabel(match.date, match.time)}
                            </div>
                          </div>
                          <div className="min-w-0 text-right">
                            <div className="truncate text-sm font-bold text-white">{match.away}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Resultados"
                  subtitle="Últimos jogos encerrados"
                >
                  <div className="space-y-2">
                    {data.results.length === 0 ? (
                      <div className="text-sm text-zinc-500">Sem resultados recentes.</div>
                    ) : (
                      data.results.map((match) => (
                        <div
                          key={match.id}
                          className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-white">{match.home}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-black text-white">
                              {match.homeScore} - {match.awayScore}
                            </div>
                            <div className="text-xs text-zinc-400">
                              {formatDateLabel(match.date, match.time)}
                            </div>
                          </div>
                          <div className="min-w-0 text-right">
                            <div className="truncate text-sm font-bold text-white">{match.away}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-5">
                <SectionCard
                  title="Artilheiros"
                  subtitle="Top 10 da competição"
                >
                  <div className="space-y-2">
                    {data.topScorers.length === 0 ? (
                      <div className="text-sm text-zinc-500">Sem artilheiros disponíveis.</div>
                    ) : (
                      data.topScorers.map((player) => (
                        <div
                          key={`${player.rank}-${player.playerId ?? player.name}`}
                          className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
                        >
                          <div className="w-7 text-center text-sm font-black text-red-400">
                            {player.rank}
                          </div>
                          {player.imageUrl ? (
                            <img
                              src={player.imageUrl}
                              alt={player.name}
                              className="h-10 w-10 rounded-full bg-zinc-800 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xs font-black text-zinc-400">
                              {player.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-white">{player.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">{player.team}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black text-white">{player.value}</div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                              golos
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Melhor XI"
                  subtitle={data.bestXi.formation ? `Formação ${data.bestXi.formation}` : "Seleção da temporada"}
                >
                  <div className="space-y-2">
                    {data.bestXi.players.length === 0 ? (
                      <div className="text-sm text-zinc-500">Best XI indisponível.</div>
                    ) : (
                      data.bestXi.players.map((player) => (
                        <div
                          key={`${player.id}-${player.name}`}
                          className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
                        >
                          {player.imageUrl ? (
                            <img
                              src={player.imageUrl}
                              alt={player.name}
                              className="h-10 w-10 rounded-full bg-zinc-800 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-xs font-black text-zinc-400">
                              {player.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-white">{player.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">
                              {player.team} {player.position ? `• ${player.position}` : ""}
                            </div>
                          </div>
                          {player.rating != null ? (
                            <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-black text-red-400">
                              {player.rating.toFixed(1)}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
