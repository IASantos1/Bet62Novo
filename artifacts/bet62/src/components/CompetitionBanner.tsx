import { Clock } from "lucide-react";

// Shared render for a "Jogo em Destaque" banner styled per its competition
// (gradient + logo + accent color from a banner_templates row, plus real
// team crests when available — from api-football.com's automatic sync or
// pasted by the admin for a manual banner). Used in 4 places so the visual
// logic lives exactly once: the admin's "Modelos de Banner" gallery tiles,
// the live preview inside that create/edit modal, the preview inside the
// "Novo Jogo" (Destaques) modal, and the public Destaques page itself.
const DEFAULT_PRIMARY_COLOR = "#1e3a8a";
const DEFAULT_SECONDARY_COLOR = "#0f172a";
const DEFAULT_ACCENT_COLOR = "#dc2626";

export type CompetitionBannerProps = {
  competitionName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  homeTeam: string;
  awayTeam: string;
  // Real crest URLs — when both are present, the banner switches to the
  // "realistic" layout (two big crests either side of "VS", competition
  // logo as a background watermark). Missing either one falls back to the
  // original dashed "Time A vs Time B" text box, so this never breaks for
  // older manual banners or a club api-football.com has no logo for.
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  kickoffAt: string | Date;
  isLive?: boolean;
  className?: string;
};

// Generic tricolor triangle shown when a template has no logoUrl yet — the
// same decorative device as the reference mockup, built from stacked
// CSS-border triangles (real elements, not ::before/::after, so it works as
// a plain React component).
function GenericLogoPlaceholder({
  accentColor,
  primaryColor,
}: {
  accentColor: string;
  primaryColor: string;
}) {
  return (
    <div className="relative" style={{ width: 44, height: 38 }} aria-hidden="true">
      <div
        className="absolute left-1/2"
        style={{
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "22px solid transparent",
          borderRight: "22px solid transparent",
          borderBottom: `38px solid ${accentColor}`,
        }}
      />
      <div
        className="absolute left-1/2"
        style={{
          transform: "translateX(-68%)",
          top: 8,
          width: 0,
          height: 0,
          borderLeft: "18px solid transparent",
          borderRight: "18px solid transparent",
          borderBottom: `30px solid ${primaryColor}`,
        }}
      />
      <div
        className="absolute left-1/2"
        style={{
          transform: "translateX(-50%)",
          top: 16,
          width: 0,
          height: 0,
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderBottom: "20px solid #ffffff",
        }}
      />
    </div>
  );
}

export function CompetitionBanner({
  competitionName,
  logoUrl,
  primaryColor,
  secondaryColor,
  accentColor,
  homeTeam,
  awayTeam,
  homeLogoUrl,
  awayLogoUrl,
  kickoffAt,
  isLive,
  className,
}: CompetitionBannerProps) {
  const primary = primaryColor || DEFAULT_PRIMARY_COLOR;
  const secondary = secondaryColor || DEFAULT_SECONDARY_COLOR;
  const accent = accentColor || DEFAULT_ACCENT_COLOR;
  const kickoff = typeof kickoffAt === "string" ? new Date(kickoffAt) : kickoffAt;
  const hasValidKickoff = !Number.isNaN(kickoff.getTime());
  const dateLabel = hasValidKickoff
    ? kickoff.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "DD/MM/AAAA";
  const timeLabel = hasValidKickoff
    ? kickoff.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : "HH:MM";
  const hasBothCrests = Boolean(homeLogoUrl && awayLogoUrl);

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-xl flex flex-col items-center justify-center gap-2 px-4 py-3 text-white ${className ?? ""}`}
      style={{
        background: `linear-gradient(160deg, ${primary} 0%, ${secondary} 100%)`,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
      }}
    >
      <div
        className="pointer-events-none absolute -bottom-5 -left-8 h-36 w-36 rotate-[-25deg]"
        style={{
          background: `linear-gradient(45deg, transparent 40%, ${accent}26 40%, ${accent}26 60%, transparent 60%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-5 -right-8 h-36 w-36 rotate-[25deg]"
        style={{
          background:
            "linear-gradient(-45deg, transparent 40%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.08) 60%, transparent 60%)",
        }}
      />

      {/* Competition logo as a large, faint background watermark — only
          once real team crests take over the foreground; otherwise the
          logo stays the normal-sized foreground mark below. */}
      {hasBothCrests && logoUrl && (
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[65%] max-h-40 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.12]"
        />
      )}

      {isLive && (
        <div
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white"
          style={{ background: accent, boxShadow: `0 2px 10px ${accent}88` }}
        >
          <Clock className="h-3 w-3" strokeWidth={3} />
          AO VIVO
        </div>
      )}

      {hasBothCrests ? (
        <>
          <div className="flex w-full items-center justify-center gap-3 sm:gap-5">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <img
                src={homeLogoUrl!}
                alt=""
                className="h-12 w-12 object-contain drop-shadow-lg sm:h-16 sm:w-16"
              />
              <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-wide sm:text-xs">
                {homeTeam || "Time A"}
              </span>
            </div>
            <span className="shrink-0 text-lg font-extrabold italic opacity-90 sm:text-xl">VS</span>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <img
                src={awayLogoUrl!}
                alt=""
                className="h-12 w-12 object-contain drop-shadow-lg sm:h-16 sm:w-16"
              />
              <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-wide sm:text-xs">
                {awayTeam || "Time B"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="h-0.5 w-6 shrink-0" style={{ background: accent }} />
            <span className="max-w-[220px] truncate">{competitionName || "Jogo em Destaque"}</span>
            <span className="h-0.5 w-6 shrink-0" style={{ background: accent }} />
          </div>
        </>
      ) : (
        <>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 max-w-[70%] object-contain drop-shadow" />
          ) : (
            <GenericLogoPlaceholder accentColor={accent} primaryColor={primary} />
          )}

          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="h-0.5 w-6 shrink-0" style={{ background: accent }} />
            <span className="max-w-[220px] truncate">{competitionName || "Jogo em Destaque"}</span>
            <span className="h-0.5 w-6 shrink-0" style={{ background: accent }} />
          </div>

          <div className="flex max-w-full items-center gap-2 rounded-md border border-dashed border-white/35 px-3 py-1.5 text-center text-sm font-extrabold uppercase tracking-wide">
            <span className="truncate">{homeTeam || "Time A"}</span>
            <span className="shrink-0 text-xs font-semibold opacity-85">vs</span>
            <span className="truncate">{awayTeam || "Time B"}</span>
          </div>
        </>
      )}

      <span className="rounded-md border border-dashed border-white/35 px-2.5 py-1 text-xs font-semibold">
        {dateLabel} <span className="opacity-70">•</span> {timeLabel}
      </span>
    </div>
  );
}
