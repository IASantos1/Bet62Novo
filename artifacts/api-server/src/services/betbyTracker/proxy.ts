export type BetbyThemeInjection = {
  fontFamily?: string;
  backgroundMain?: string;
  elementBgPrimary?: string;
  elementBgSecondary?: string;
  highlight?: string;
  lines?: string;
  contrast?: string;
};

export const BETBY_DEMO_TRACKER_BASE = "https://demoapi.betby.com";
export const BETBY_TRACKER_PATH = "/a82d758c/tracker.html";

const DEFAULT_INJECT: Required<BetbyThemeInjection> = {
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  backgroundMain: "rgba(12, 22, 33, 1)",
  elementBgPrimary: "rgba(30, 48, 66, 1)",
  elementBgSecondary: "rgba(20, 36, 50, 1)",
  highlight: "rgba(34, 197, 94, 1)",
  lines: "rgba(255, 255, 255, 0.08)",
  contrast: "rgba(255, 255, 255, 1)",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shadeRgba(rgba: string, delta: number): string {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgba;
  const r = Math.max(0, Math.min(255, Number(m[1]) + delta));
  const g = Math.max(0, Math.min(255, Number(m[2]) + delta));
  const b = Math.max(0, Math.min(255, Number(m[3]) + delta));
  const a = m[4] != null ? Number(m[4]) : 1;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function buildThemeVarsString(theme: BetbyThemeInjection): string {
  const t: Required<BetbyThemeInjection> = { ...DEFAULT_INJECT, ...theme };
  const op = (c: string, a: number) =>
    c.startsWith("#")
      ? hexToRgba(c, a)
      : c.replace(
          /rgba?\(([^)]+)\)/,
          (_: string, inner: string) => {
            const parts = inner.split(",").map((s: string) => s.trim());
            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
          },
        );
  const vars: Record<string, string> = {};
  const palette = [
    ["backgroundMainColor", t.backgroundMain],
    ["elementBgPrimaryColor", t.elementBgPrimary],
    ["elementBgSecondaryColor", t.elementBgSecondary],
    ["highlightColor", t.highlight],
    ["linesColor", t.lines],
  ] as const;
  for (const [name, base] of palette) {
    const contrast = name === "linesColor" ? "rgba(0,0,0,1)" : t.contrast;
    vars[`--${name}`] = base;
    vars[`--${name}Contrast`] = contrast;
    for (let i = 0; i <= 9; i++) vars[`--${name}Opacity${i}0`] = op(base, i / 10);
    for (const [step, delta] of [
      ["10", 2],
      ["20", 4],
      ["30", 6],
      ["60", 12],
    ] as const) {
      vars[`--${name}Darken${step}`] = shadeRgba(base, delta);
      vars[`--${name}Lighten${step}`] = shadeRgba(base, -delta);
    }
  }
  vars["--fontFamily"] = `'${t.fontFamily}'`;
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join("\n      ");
}

export type BetbyTrackerProxyInput = {
  betbyEventId: string;
  statscoreEventId?: string | number;
  homeTeamName?: string;
  awayTeamName?: string;
  lang?: string;
  sportId?: string;
  theme?: BetbyThemeInjection;
  parentOrigin?: string;
};

const MANUAL_TEAM_TO_STATSCORE_ID: Array<{ homeLike: RegExp; awayLike: RegExp; statscoreId: string; note?: string }> = [
  {
    homeLike: /mirassol/i,
    awayLike: /ldu|liga\s*deportiva\s*universitaria/i,
    statscoreId: "6670732",
    note: "Copa Sul-Americana 2026-08-14 Mirassol FC SP vs LDU Quito — ID do Statscore provisto manualmente pois BetBY retornava ID invalido que deixava widget vazio.",
  },
  {
    homeLike: /ldu|liga\s*deportiva\s*universitaria/i,
    awayLike: /mirassol/i,
    statscoreId: "6670732",
    note: "Idem inverted home/away",
  },
];

export function tryManualTeamStatscoreId(home?: string, away?: string): string | null {
  if (!home && !away) return null;
  const h = (home ?? "").trim();
  const a = (away ?? "").trim();
  if (!h && !a) return null;
  for (const row of MANUAL_TEAM_TO_STATSCORE_ID) {
    const homeOk = (h && row.homeLike.test(h)) || (a && row.awayLike.test(a));
    const awayOk = (a && row.awayLike.test(a)) || (h && row.homeLike.test(h));
    if (homeOk && awayOk) {
      try { console.warn(`[betbyTracker/proxy] manualTeamMap HIT: "${h}" vs "${a}" → Statscore ID ${row.statscoreId}${row.note ? ' ('+row.note+')' : ''}`); } catch(_) {}
      return row.statscoreId;
    }
  }
  return null;
}

export function isRealStatscoreId(v: string): boolean {
  const s = String(v ?? "").trim();
  // Statscore IDs nativos = 5 a 10 dígitos (ex: 6670732, 6479574).
  // BetBY IDs = ~19 dígitos que 404 no widgets.statscore.com.
  // Mesma heurística do matches.ts P2 (enrichMatchWithStatscoreId).
  return /^\d{5,10}$/.test(s);
}

export type BetbyTrackerProxyResult = {
  html: string;
  upstreamUrl: string;
};

export function buildBetbyTrackerUpstreamUrl(
  input: BetbyTrackerProxyInput & { statscoreEventId?: string | number },
): string {
  const rawEventId = input.statscoreEventId != null
    ? String(input.statscoreEventId).trim()
    : String(input.betbyEventId).trim();
  const numericCandidate = /^\d+$/.test(rawEventId);
  const MAX_SAFE = Number.MAX_SAFE_INTEGER;
  const eventIdValue = numericCandidate
    ? (() => {
        const n = BigInt(rawEventId);
        const maxSafeBig = BigInt(MAX_SAFE);
        if (n <= maxSafeBig && n >= -maxSafeBig) {
          return Number(n);
        }
        return rawEventId;
      })()
    : rawEventId;
  const providers = {
    id: "statscore",
    sportId: input.sportId ?? "1",
    lang: input.lang ?? "en",
    liveEvent: true,
    eventId: eventIdValue,
  };
  const base = BETBY_DEMO_TRACKER_BASE + BETBY_TRACKER_PATH;
  const url = new URL(base);
  url.searchParams.set("providers", JSON.stringify(providers));
  return url.toString();
}

export function buildBetbyTrackerPublicUrl(
  input: { betbyEventId?: string; statscoreEventId?: string | number; lang?: string; sportId?: string },
): string {
  const fallback = String(input.betbyEventId ?? input.statscoreEventId ?? "1").trim() || "1";
  const safe: BetbyTrackerProxyInput & { statscoreEventId?: string | number } = {
    betbyEventId: fallback,
    lang: input.lang,
    sportId: input.sportId,
    statscoreEventId: input.statscoreEventId,
  };
  return buildBetbyTrackerUpstreamUrl(safe);
}

export async function resolveStatscoreEventIdFromBetby(
  betbyEventId: string,
  timeoutMs = 8000,
): Promise<string | null> {
  if (!betbyEventId) return null;
  const BETBY_BRAND_ID_LIVE = process.env.BETBY_BRAND_ID || "1653815133341880320";
  const BETBY_API_HOST = process.env.BETBY_API_HOST ?? "demoapi.betby.com";
  const BETBY_WEB_HOST = process.env.BETBY_WEB_HOST ?? "demo.betby.com";
  const BETBY_LANG = process.env.BETBY_LANG_DEFAULT ?? "en";
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  const commonHttpHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  } as const;
  const jsonHeaders = {
    Accept: "application/json",
    "User-Agent": commonHttpHeaders["User-Agent"],
    "Accept-Language": commonHttpHeaders["Accept-Language"],
  } as const;
  function extractFromHtml(html: string): string | null {
    if (!html) return null;

    // Padrão 1 (clássico): tracker.html?providers=<JSON ou url-encoded JSON>
    //   Betby usou esse por MUITO tempo:
    //   /tracker.html?providers=%7B%22provider%22:%22statscore%22,%22eventId%22:%22123456%22%7D
    const rawMatch = html.match(/tracker\.html\?providers=([^"'<>\s`]+)/i);
    if (rawMatch) {
      let encoded = rawMatch[1];
      try { encoded = decodeURIComponent(encoded); } catch (_) { /* ignore */ }
      let obj: any;
      try {
        obj = typeof encoded === "string" && encoded.startsWith("{")
          ? JSON.parse(encoded)
          : JSON.parse(decodeURIComponent(encoded));
      } catch (_) { obj = null; }
      if (obj && obj.eventId != null) {
        const outId = String(obj.eventId);
        if (/^\d+$/.test(outId) && outId.length >= 4) return outId;
      }
    }

    // Padrão 2: Qualquer JSON no HTML que contenha chave "eventId" com valor numérico
    //   (statscore widget novo, nextjs __NEXT_DATA__, window.__INITIAL_STATE__, etc.)
    //   Varrendo JSONs inline no HTML com uma regex que captura:
    //     "eventId" : "123456"  OU  "eventId":123456  OU  eventId: 123456
    const jsonPatterns: RegExp[] = [
      /["']eventId["']\s*:\s*["'](\d{4,})["']/g,
      /["']eventId["']\s*:\s*(\d{4,})(?!\d)/g,
      /eventId\s*:\s*["'](\d{4,})["']/g,
      /eventId\s*:\s*(\d{4,})(?!\d)/g,
      // Padrão Betby novo: widgets.statscore.eventId ou tracker.statscore.eventId
      /statscore[^0-9]{0,40}eventId[^0-9]{0,10}(\d{4,})/gi,
      // Provedor statscore declarado em array/objeto
      /provider["']?\s*:\s*["']statscore["'][^}]{0,120}eventId[^0-9]{0,10}(\d{4,})/gi,
    ];
    for (const re of jsonPatterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const candidate = String(m[1]);
        if (/^\d+$/.test(candidate) && candidate.length >= 4 && candidate.length <= 30) {
          return candidate;
        }
      }
    }

    // Padrão 3: <script id="__NEXT_DATA__" type="application/json"> + procurar
    //   qualquer chave eventId numérica DENTRO do JSON (Betby é Next.js SPA hoje)
    try {
      const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        const nextJson = JSON.parse(nextDataMatch[1]);
        const findEventId = (node: any): string | null => {
          if (!node) return null;
          if (typeof node === "object") {
            if (Array.isArray(node)) {
              for (const item of node) {
                const r = findEventId(item);
                if (r) return r;
              }
            } else {
              for (const k of Object.keys(node)) {
                const val = node[k];
                if ((k.toLowerCase() === "eventid" || /statscore.{0,10}event/i.test(k))
                  && typeof val === "string" && /^\d+$/.test(val) && val.length >= 4) return val;
                if ((k.toLowerCase() === "eventid") && typeof val === "number" && val > 999) return String(val);
                const r = findEventId(val);
                if (r) return r;
              }
            }
          }
          return null;
        };
        const r = findEventId(nextJson);
        if (r) return r;
      }
    } catch (_) { /* ignore */ }

    // Padrão 4: window.ANYTHING = { ...JSON... }; inline no HTML
    //   captura qualquer objeto com statscore + eventId no script inline
    try {
      const inlineScripts = [...html.matchAll(/<script(?!\s+src)[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const scriptMatch of inlineScripts) {
        const code = scriptMatch[1];
        // Procurar JSON-blob no window.__xxx = <JSON>;
        const windows = [...code.matchAll(/window\.[\w_]+\s*=\s*(\{[\s\S]{0,5000}?\});/g)];
        for (const w of windows) {
          try {
            const obj = JSON.parse(w[1]);
            const deepFind = (n: any): string | null => {
              if (!n || typeof n !== "object") return null;
              const e = n["eventId"];
              if (typeof e === "string" && /^\d+$/.test(e) && e.length >= 4) return e;
              if (typeof e === "number" && e > 999) return String(e);
              for (const k of Object.keys(n)) {
                const r = deepFind(n[k]);
                if (r) return r;
              }
              return null;
            };
            const res = deepFind(obj);
            if (res) return res;
          } catch (_) { /* ignore */ }
        }
      }
    } catch (_) { /* ignore */ }

    return null;
  }
  try {
    let candidateUrls: string[] = [];
    // (1) Melhor caminho: puxar slugs reais via REST /api/v4/live/brand/.../event/en/ID
    try {
      const restUrl = `https://${BETBY_API_HOST}/api/v4/live/brand/${BETBY_BRAND_ID_LIVE}/event/${BETBY_LANG}/${betbyEventId}`;
      const restRes = await fetch(restUrl, {
        method: "GET",
        headers: jsonHeaders,
        signal: controller.signal,
        redirect: "follow",
      });
      if (restRes.ok) {
        try {
          const json: any = await restRes.json();
          const sports: any = json?.sports ?? {};
          const categories: any = json?.categories ?? {};
          const tournaments: any = json?.tournaments ?? {};
          const events: any = json?.events ?? {};
          const ev: any = events?.[betbyEventId];
          if (ev?.desc) {
            const sportId = String(ev.desc.sport ?? "");
            const catId = String(ev.desc.category ?? "");
            const tourId = String(ev.desc.tournament ?? "");
            const matchSlug = String(ev.desc.slug ?? "").trim();
            const sportSlug = String(sports?.[sportId]?.slug ?? "").trim() || "soccer";
            const catSlug = String(categories?.[catId]?.slug ?? "").trim() || "x";
            const tourSlug = String(tournaments?.[tourId]?.slug ?? "").trim() || "x";
            if (matchSlug) {
              candidateUrls.push(
                `https://${BETBY_WEB_HOST}/sportsbook/classic/${sportSlug}/${catSlug}/${tourSlug}/${matchSlug}-${betbyEventId}`,
              );
            }
          }
        } catch (_json) {
          // ignore
        }
      }
    } catch (_restErr) {
      // fallback abaixo
    }
    // (2) Fallbacks sintéticos + rota curta /event/ID
    candidateUrls = candidateUrls.concat([
      `https://${BETBY_WEB_HOST}/event/${betbyEventId}`,
      `https://${BETBY_WEB_HOST}/sportsbook/classic/soccer/international/placeholder/placeholder-${betbyEventId}`,
      `https://${BETBY_WEB_HOST}/sportsbook/classic/soccer/x/x/placeholder-${betbyEventId}`,
    ]);

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: commonHttpHeaders,
          redirect: "follow",
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const html = await res.text();
        const found = extractFromHtml(html);
        if (found) return found;
      } catch (_inner) {
        // try next candidate
      }
    }
  } catch (_outer) {
    /* fallthrough */
  } finally {
    clearTimeout(to);
  }
  return null;
}

export type BetbyPulseOverlayOptions = {
  enableSseLiveOverlay?: boolean;
  sseUrl?: string;
  betbyEventId?: string;
  pulseBridgeBasePath?: string;
};

export function buildBetbyThemeInjectionStyle(
  theme: BetbyThemeInjection,
  parentOrigin = "*",
  overlayOpts: BetbyPulseOverlayOptions = {},
): string {
  const cssVars = buildThemeVarsString(theme);
  const highlight = theme.highlight ?? DEFAULT_INJECT.highlight;
  const bg = theme.backgroundMain ?? DEFAULT_INJECT.backgroundMain;
  const elBg = theme.elementBgPrimary ?? DEFAULT_INJECT.elementBgPrimary;
  const contrast = theme.contrast ?? DEFAULT_INJECT.contrast;
  const lines = theme.lines ?? DEFAULT_INJECT.lines;
  const pulseOverlaySnippet = (() => {
    if (overlayOpts.enableSseLiveOverlay === false) return "";
    const betbyEventId = overlayOpts.betbyEventId ? String(overlayOpts.betbyEventId) : "";
    const sseBase = overlayOpts.pulseBridgeBasePath ?? "/pulsebridge";
    const sseUrl = overlayOpts.sseUrl ?? `${sseBase}/betby/${betbyEventId}`;
    return `
    <style data-bet62-inject="pulse-overlay-css">
      #bet62-pulse-overlay {
        position: fixed !important; top: 6px !important; left: 6px !important; z-index: 2147483646 !important;
        display: flex !important; flex-direction: column !important; gap: 3px !important;
        padding: 8px 10px !important; border-radius: 10px !important; pointer-events: none !important;
        background: color-mix(in srgb, ${bg} 88%, transparent) !important;
        border: 1px solid color-mix(in srgb, ${highlight} 30%, transparent) !important;
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 8px 22px rgba(0,0,0,0.45); max-width: calc(100% - 12px);
        font-family: ${DEFAULT_INJECT.fontFamily}; color: ${contrast};
        transition: opacity 160ms ease, transform 160ms ease; transform-origin: top left;
      }
      #bet62-pulse-overlay.b62-hidden { opacity: 0 !important; transform: scale(0.96) translateY(-4px); }
      #bet62-pulse-overlay .b62-row1 { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      #bet62-pulse-overlay .b62-badge {
        display: inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px;
        background: color-mix(in srgb, ${highlight} 16%, transparent);
        color: ${highlight}; font-weight:600; font-size:11.5px; letter-spacing:.2px;
        border:1px solid color-mix(in srgb, ${highlight} 30%, transparent);
      }
      #bet62-pulse-overlay .b62-scorebox {
        display:flex; align-items:center; gap:10px; padding: 3px 8px; border-radius:8px;
        background: color-mix(in srgb, ${elBg} 90%, transparent);
        border:1px solid ${lines}; font-size: 14px; font-weight: 650; letter-spacing: .2px;
      }
      #bet62-pulse-overlay .b62-team { max-width: 110px; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; color:${contrast}; }
      #bet62-pulse-overlay .b62-score { color: ${highlight}; font-variant-numeric: tabular-nums; padding: 0 2px; }
      #bet62-pulse-overlay .b62-colon { opacity: .6; }
      #bet62-pulse-overlay .b62-clock { font-size:11px; opacity:.85; color:${contrast}; font-variant-numeric: tabular-nums; }
      #bet62-pulse-overlay .b62-foot { display:flex; gap:6px; flex-wrap:wrap; font-size:10.5px; opacity:.8; }
      #bet62-pulse-overlay .b62-pill {
        padding:1px 7px; border-radius:999px;
        background: color-mix(in srgb, ${elBg} 70%, transparent); border:1px solid ${lines};
        color:${contrast};
      }
      #bet62-pulse-overlay .b62-pill.b62-pill-live { background: color-mix(in srgb, rgba(239,68,68,1) 16%, transparent); color: rgba(248,113,113,1); border-color: color-mix(in srgb, rgba(239,68,68,1) 30%, transparent);}
      #bet62-pulse-overlay .b62-pulse-dot { width:6px; height:6px; border-radius:999px; background: currentColor; display:inline-block; box-shadow:0 0 0 0 rgba(248,113,113,.5); animation: b62Pulse 1.5s infinite ease-out; }
      @keyframes b62Pulse { 0% { box-shadow:0 0 0 0 rgba(248,113,113,.5); } 70% { box-shadow:0 0 0 10px rgba(248,113,113,0); } 100% { box-shadow:0 0 0 0 rgba(248,113,113,0); } }
      #bet62-pulse-overlay .b62-sync-line { height:1px; background: linear-gradient(90deg, transparent, ${highlight}, transparent); opacity:.6; border:0; margin:2px 0 0 0; }
      #bet62-pulse-overlay .b62-sync-label { font-size: 9.5px; opacity: .5; letter-spacing: .4px; text-transform: uppercase;}
    </style>
    <script data-bet62-inject="pulse-overlay-js">
    (function () {
      try {
        if (!("${betbyEventId}" || "")) return;
        function h(tag, attrs, text) {
          var el = document.createElement(tag);
          if (attrs) for (var k in attrs) { if (k === "class") el.className = attrs[k]; else if (k === "html") el.innerHTML = attrs[k]; else el.setAttribute(k, attrs[k]); }
          if (text != null) el.textContent = text;
          return el;
        }
        var mount = function () {
          if (document.getElementById("bet62-pulse-overlay")) return;
          var ov = h("div", { id: "bet62-pulse-overlay", class: "b62-hidden" });
          var r1 = h("div", { class: "b62-row1" });
          var badge = h("div", { class: "b62-badge" });
          var dot = h("span", { class: "b62-pulse-dot" });
          badge.appendChild(dot); badge.appendChild(document.createTextNode(" PulseScore LIVE"));
          var sb = h("div", { class: "b62-scorebox" });
          var home = h("span", { class: "b62-team b62-home" }, "Home");
          var scoreH = h("span", { class: "b62-score b62-home-score" }, "0");
          var col = h("span", { class: "b62-colon" }, ":");
          var scoreA = h("span", { class: "b62-score b62-away-score" }, "0");
          var away = h("span", { class: "b62-team b62-away" }, "Away");
          sb.appendChild(home); sb.appendChild(scoreH); sb.appendChild(col); sb.appendChild(scoreA); sb.appendChild(away);
          var clock = h("span", { class: "b62-clock b62-clock-el" }, "");
          r1.appendChild(badge); r1.appendChild(sb); r1.appendChild(clock);
          var foot = h("div", { class: "b62-foot" });
          var pillLive = h("span", { class: "b62-pill b62-pill-live" }, "Sincronizado Bet62");
          var pillMeta = h("span", { class: "b62-pill b62-pill-meta" }, "Aguardando...");
          foot.appendChild(pillLive); foot.appendChild(pillMeta);
          var sep = h("hr", { class: "b62-sync-line" });
          var syncLabel = h("div", { class: "b62-sync-label" }, "Sincronia PulseScore ativa");
          ov.appendChild(r1); ov.appendChild(foot); ov.appendChild(sep); ov.appendChild(syncLabel);
          (document.body || document.documentElement).appendChild(ov);
          window.__bet62_pulse_overlay = {
            el: ov, home: home, away: away, scoreH: scoreH, scoreA: scoreA, clock: clock, meta: pillMeta
          };
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
        else mount();
        function applyMatch(match) {
          var ref = window.__bet62_pulse_overlay;
          if (!ref) return setTimeout(function(){ applyMatch(match); }, 120);
          if (!match || match.matchedBy === "none" || !match.pulseEventId) {
            ref.el.classList.add("b62-hidden");
            ref.meta.textContent = "Aguardando sincronia PulseScore...";
            return;
          }
          ref.el.classList.remove("b62-hidden");
          ref.home.textContent = match.home || "Home";
          ref.away.textContent = match.away || "Away";
          if (match.score) { ref.scoreH.textContent = String(match.score.home ?? "0"); ref.scoreA.textContent = String(match.score.away ?? "0"); }
          else { ref.scoreH.textContent = "-"; ref.scoreA.textContent = "-"; }
          var clockParts = [];
          if (typeof match.minute === "number") clockParts.push((match.minute < 10 ? "0"+match.minute : String(match.minute)) + "'");
          if (match.period) clockParts.push(String(match.period).replace(/_/g, " "));
          if (typeof match.running === "boolean") clockParts.push(match.running ? "▶" : "⏸");
          ref.clock.textContent = clockParts.join("  ·  ");
          var parts = [];
          parts.push("Confiança: " + ("★★★★☆☆☆".slice(3 - (match.confidence||0), 6 - (match.confidence||0))) + "★".repeat(match.confidence||0));
          if (match.matchedBy === "sport+home+away") parts.push("Match: Completo");
          else if (match.matchedBy === "sport+home") parts.push("Match: Home");
          else if (match.matchedBy === "sport+away") parts.push("Match: Away");
          parts.push("ID: " + (match.pulseEventId ? String(match.pulseEventId).slice(0,10) : "-"));
          ref.meta.textContent = parts.join("  ·  ");
        }
        window.addEventListener("message", function(e){
          try {
            if (!e || !e.data || e.data.source !== "bet62-pulse-update-to-iframe") return;
            if (e.data.type === "match") applyMatch(e.data.payload && e.data.payload.match ? e.data.payload.match : e.data.payload);
          } catch (_) {}
        });
        try {
          var SSE_URL = ${JSON.stringify(sseUrl)};
          if (SSE_URL && typeof EventSource !== "undefined") {
            var es = new EventSource(SSE_URL, { withCredentials: false });
            es.addEventListener("match", function(ev){ try { var m = JSON.parse(ev.data); if (m && m.match) applyMatch(m.match); } catch(_){} });
            es.addEventListener("meta", function(ev){
              try {
                var md = JSON.parse(ev.data); if (!md || !md.meta) return;
                var ref = window.__bet62_pulse_overlay; if (!ref) return;
                ref.home.textContent = md.meta.homeName || ref.home.textContent;
                ref.away.textContent = md.meta.awayName || ref.away.textContent;
              } catch(_){}
            });
            es.addEventListener("error", function(){ try { es && es.close(); } catch(_){} });
            window.addEventListener("beforeunload", function(){ try { es && es.close(); } catch(_){} });
          }
        } catch (_sseErr) {}
      } catch (_rootErr) {}
    })();
    <\/script>`;
  })();

  return `<style data-bet62-inject="theme-branding">
      html, body { background: #18181b !important; color-scheme: dark; }
      #bt-tracker-container,
      .STATSCOREWidgetContainer,
      .STATSCOREWidget {
        background-color: #18181b !important;
        ${cssVars}
      }
      .STATSCOREWidget *[class*="logo" i],
      .STATSCOREWidget *[id*="logo" i],
      .STATSCOREWidget *[class*="brand" i],
      .STATSCOREWidget *[id*="brand" i],
      .STATSCOREWidget a[href*="statscore.com" i],
      .STATSCOREWidget a[href*="betby.com" i],
      .STATSCOREWidget a[href*="betgenius" i],
      .STATSCOREWidget a[href*="oddin" i],
      a[href*="betby.com" i],
      *[class*="betby" i],
      *[id*="betby" i] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    </style>
    ${pulseOverlaySnippet}
    <script data-bet62-inject="bridge">
    (function () {
      function postParent(payload) {
        try { window.parent.postMessage({ source: "bet62-betby-tracker", payload: payload }, ${JSON.stringify(parentOrigin)}); } catch (_) {}
      }
      function getContainer() {
        return document.getElementById("bt-tracker-container") || document.body;
      }
      const BG_COLOR = "#18181b"; /* zinc-900: RGB (24,24,27) — cinza escuro, DIFERENCIÁVEL de preto puro em telas OLED. Antes usávamos #09090b zinc-950, mas RGB 9/9/11 é indistinguível de preto 0x000000 em AMOLED — usuário reportava "tela preta" mesmo quando widget só estava vazio. */
      const MIN_HEIGHT = "470px";
      function ensureVisible() {
        try {
          const el = getContainer();
          const force = " !important";
          if (el) {
            el.style.setProperty("display", "block", "important");
            el.style.setProperty("min-height", MIN_HEIGHT, "important");
            if (!el.style.height || parseInt(el.style.height, 10) < 400) {
              el.style.setProperty("height", MIN_HEIGHT, "important");
            }
            el.style.setProperty("opacity", "1", "important");
            el.style.setProperty("visibility", "visible", "important");
            el.style.setProperty("background", BG_COLOR, "important");
            el.style.setProperty("color-scheme", "dark", "important");
            el.style.setProperty("transform", "none", "important");
            el.style.setProperty("clip", "auto", "important");
            el.style.setProperty("clip-path", "none", "important");
            el.style.setProperty("filter", "none", "important");
            el.removeAttribute("hidden");
          }
          document.documentElement.style.setProperty("display", "block", "important");
          document.documentElement.style.setProperty("min-height", MIN_HEIGHT, "important");
          document.documentElement.style.setProperty("opacity", "1", "important");
          document.documentElement.style.setProperty("visibility", "visible", "important");
          document.documentElement.style.setProperty("background", BG_COLOR, "important");
          document.documentElement.removeAttribute("hidden");
          document.body.style.setProperty("display", "block", "important");
          document.body.style.setProperty("min-height", MIN_HEIGHT, "important");
          document.body.style.setProperty("opacity", "1", "important");
          document.body.style.setProperty("visibility", "visible", "important");
          document.body.style.setProperty("background", BG_COLOR, "important");
          document.body.style.setProperty("margin", "0", "important");
          document.body.style.setProperty("padding", "0", "important");
          document.body.style.setProperty("overflow", "hidden auto", "important");
          document.body.removeAttribute("hidden");
          const iframes = document.querySelectorAll("iframe");
          iframes.forEach(function (f) {
            try {
              f.style.setProperty("display", "block", "important");
              f.style.setProperty("min-height", MIN_HEIGHT, "important");
              f.style.setProperty("width", "100%", "important");
              f.style.setProperty("opacity", "1", "important");
              f.style.setProperty("visibility", "visible", "important");
              f.style.setProperty("background", BG_COLOR, "important");
              f.style.setProperty("border", "0", "important");
              f.removeAttribute("hidden");
            } catch (_) {}
          });
          // Statscore/Betby às vezes criam <div id="statscore-wrapper"> ou
          // elementos com display:none dentro do body → força todos os divs
          // descendentes diretos do body + container também:
          const forceRootChildren = function (root) {
            try {
              const nodes = root.children;
              for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
                const isNone = (n.style.display === "none") || (cs && cs.display === "none");
                const isHidden = n.hasAttribute("hidden") || n.style.visibility === "hidden" || (cs && cs.visibility === "hidden");
                const isZeroH = parseInt(n.style.height,10) === 0 || (cs && parseInt(cs.height,10) === 0) || (cs && parseInt(cs.maxHeight,10) === 0);
                if (isNone) n.style.setProperty("display", "block", "important");
                if (isHidden) {
                  n.style.setProperty("opacity", "1", "important");
                  n.style.setProperty("visibility", "visible", "important");
                  n.removeAttribute("hidden");
                }
                if (isZeroH) n.style.setProperty("min-height", MIN_HEIGHT, "important");
              }
            } catch (_) {}
          };
          forceRootChildren(document.body);
          if (el && el !== document.body) forceRootChildren(el);
        } catch (_) {}
      }
      function fireReady() {
        postParent({ type: "ready" });
        setupResize();
      }
      function setupResize() {
        const el = getContainer();
        let last = 0;
        const tick = function () {
          try {
            const h = el.getBoundingClientRect().height;
            if (Math.abs(h - last) > 0.5) { last = h; postParent({ type: "resize", height: h }); }
          } catch (_) {}
        };
        tick();
        if (typeof ResizeObserver !== "undefined") { try { var ro = new ResizeObserver(tick); ro.observe(el); ro.observe(document.body); } catch(_) { setInterval(tick, 400); } }
        else setInterval(tick, 400);
      }

      // ── CAMADA 1: Garante visibilidade a QUALQUER CUSTO por 30 segundos ──
      //    Widget Statscore pode colocar display:none / hidden / height:0 EM
      //    QUALQUER MOMENTO (ex: data fetch interno que falha depois de 7s
      //    ou 9s, MESMO após nosso fallback 6s inicial). Para ganhar dessa
      //    corrida de JS:
      //      (a) MutationObserver = QUALQUER mudança DOM/style/class/attr
      //          em body / container / iframes → roda ensureVisible IMEDIATO
      //      (b) setInterval 500ms por 30s = rede de segurança
      ensureVisible();
      setupResize();
      try {
        const MO = typeof MutationObserver !== "undefined" ? MutationObserver : null;
        if (MO) {
          const moCb = function () { ensureVisible(); };
          const moOpts = { attributes: true, attributeFilter: ["style","class","hidden"], childList: true, subtree: true, characterData: false };
          const mo1 = new MO(moCb);
          mo1.observe(document.documentElement, moOpts);
          const mo2 = new MO(moCb);
          mo2.observe(document.body, moOpts);
          const el = getContainer();
          if (el && el !== document.body) {
            const mo3 = new MO(moCb);
            mo3.observe(el, moOpts);
          }
          // Observa futuros iframes também
          document.addEventListener("DOMNodeInserted", function (ev) {
            try {
              const n = ev && ev.target;
              if (!n) return;
              if (n.tagName === "IFRAME") {
                n.addEventListener("load", function () { ensureVisible(); setupResize(); }, { once: true });
              }
              if (n.querySelectorAll) {
                const ifs = n.querySelectorAll("iframe");
                ifs.forEach(function (i) { i.addEventListener("load", function () { ensureVisible(); setupResize(); }, { once: true }); });
              }
            } catch (_) {}
          }, false);
        }
      } catch (_) { /* MutationObserver não disponível, cai no interval */ }
      var guardRounds = 0;
      const guardInterval = setInterval(function () {
        guardRounds += 1;
        ensureVisible();
        if (guardRounds > 60) { clearInterval(guardInterval); } /* 60 * 500ms = 30s */
      }, 500);
      // Força extra em momentos caros do ciclo de vida do navegador
      window.addEventListener("DOMContentLoaded", ensureVisible);
      window.addEventListener("load", function () {
        ensureVisible();
        postParent({ type: "load" });
        ensureVisible();
        setTimeout(setupResize, 200);
        setTimeout(ensureVisible, 100);
        setTimeout(ensureVisible, 500);
        setTimeout(ensureVisible, 1500);
        setTimeout(ensureVisible, 3000);
        setTimeout(ensureVisible, 6000);
      });
      window.addEventListener("focus", ensureVisible);

      window.addEventListener("message", function (e) {
        try {
          const data = e.data;
          if (!data) return;
          // ── Camada 1: Betby outer iframe bridge (source: "bt-frame") ──
          if (typeof data === "object" && data.source === "bt-frame") {
            var inner = data.message || {};
            const t = typeof inner === "object" ? inner.type : null;
            if (t === "bt-frame-loaded" || t === "bt-frame-widget-loaded") {
              ensureVisible();
              fireReady();
            } else if (t === "bt-frame-height-changed") {
              postParent({ type: "resize", height: inner.payload });
              ensureVisible();
            } else if (t === "bt-frame-widget-failed") {
              postParent({ type: "error", error: inner.payload ? String(inner.payload) : "widget failed" });
              ensureVisible();
            } else {
              postParent({ type: "inner-event", inner: inner });
            }
            return;
          }
          // ── Camada 2: Statscore widget DIRETO (qualquer formato) ──
          if (typeof data === "object") {
            // Tenta pegar 'type' de dentro (se objeto tiver type/data/resize/datachange etc.)
            const type = typeof data.type === "string" ? data.type : null;
            const hasAvailable = typeof data.available === "boolean";
            const hasHeightNum = typeof data.height === "number" && data.height > 100;
            // 2a) { type: "DATA", available: boolean } (formato do modelo Statscore)
            if (type === "DATA" || (hasAvailable && !type)) {
              const available = data.available === true;
              postParent({ type: "data", available: available });
              if (available) {
                ensureVisible();
                fireReady();
              } else {
                // available=false: Garantimos visibilidade (não deixa
                // preto!), e enviamos sinal para o pai decidir se quer
                // substituir por mensagem (pai cuida de UX após 10s).
                ensureVisible();
                postParent({ type: "resize", height: 470 });
              }
              return;
            }
            // 2b) { type: "RESIZE", height: number } (formato modelo Statscore)
            //     OU qualquer objeto com height numérico grande
            if (type === "RESIZE" || hasHeightNum) {
              if (hasHeightNum) {
                const el = getContainer();
                if (el) {
                  const px = data.height + "px";
                  el.style.setProperty("height", px, "important");
                  document.body.style.setProperty("height", px, "important");
                }
                postParent({ type: "resize", height: data.height });
              } else {
                setupResize();
              }
              ensureVisible();
              return;
            }
            // 2c) Qualquer outro evento conhecido do Statscore
            if (typeof type === "string" && /^(ready|loaded|error|datachange)$/i.test(type)) {
              postParent({ type: type.toLowerCase() });
              ensureVisible();
              return;
            }
          }
        } catch (_) {}
      });
      // ── Fallback safety: nenhum evento chegou em 6s → força visível + ready
      setTimeout(function () {
        ensureVisible();
        fireReady();
      }, 6000);
    })();
    <\/script>`;
}

export function buildClientRedirectBypassWafHtml(
  upstreamUrl: string,
  theme: BetbyThemeInjection = {},
  opts?: { isFallbackSmart?: boolean; parentOrigin?: string },
): string {
  const bg = theme.backgroundMain ?? DEFAULT_INJECT.backgroundMain;
  const contrast = theme.contrast ?? DEFAULT_INJECT.contrast;
  const highlight = theme.highlight ?? DEFAULT_INJECT.highlight;
  const parentOrigin = opts?.parentOrigin && opts.parentOrigin !== "*" ? opts.parentOrigin : "*";
  const isFallbackSmart = !!opts?.isFallbackSmart;
  // When this redirect shell is returned for a "fallback smart" BetBY id (we
  // never found a real Statscore numeric id for the event — the widget at
  // the upstream URL is almost guaranteed to 404, returning a blank widget),
  // the parent frame's `BetbyTrackerIframe` needs to be told that (a) the
  // widget itself loaded fine (ready → hides loading spinner), (b) the
  // tracker reports a real size (resize → prevents the "empty widget" guard
  // from killing it 7s/18s later), and most importantly (c) data.available
  // is explicitly false so the parent degrades to the friendly "Tracker
  // indisponível neste momento" shell instead of a silent black rectangle.
  // When the redirect is for a REAL statscore id (Statscore native widget
  // paints normally at the final origin), we still send the signals from
  // THIS wrapper so the parent iframe sees *something* before the browser
  // navigates away; the final demoapi.betby.com page then paints the real
  // content and the user never notices the wrapper page at all.
  const fallbackResizeHeight = isFallbackSmart ? 470 : 1400;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Live Match Tracker</title>
${isFallbackSmart ? "" : `<meta http-equiv="refresh" content="0; url=${upstreamUrl}">`}
<style>
  html,body{margin:0;padding:0;height:100%;min-height:470px;background:${bg};color:${contrast};
    font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color-scheme:dark;}
  .wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    padding:16px;text-align:center;}
  .spinner{display:inline-block;width:36px;height:36px;border:3px solid color-mix(in srgb, ${contrast} 25%, transparent);
    border-top-color:${highlight};border-radius:50%;animation:spin 0.9s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .box{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:320px;}
  .msg{font-size:13px;font-weight:600;color:${contrast};opacity:.92;}
  .sub{font-size:11.5px;opacity:.65;}
  a.btn{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;
    background:${highlight};color:#fff;text-decoration:none;
    font-weight:650;font-size:12.5px;margin-top:6px;}
</style>
</head>
<body>
<div class="wrap"><div class="box" id="fallback-box">
  <div class="spinner" id="fallback-spinner" role="status" aria-label="Loading"></div>
  <div class="msg" id="fallback-msg">${isFallbackSmart ? "A preparar o tracker..." : "Carregando tracker..."}</div>
  <div class="sub" id="fallback-sub">${isFallbackSmart
      ? "A verificar se existem dados disponiveis para este evento"
      : "Redirecionando para o widget oficial (WAF bypass)"}</div>
  ${isFallbackSmart ? "" : `<a class="btn" href="${upstreamUrl}" target="_self" rel="noopener">Abrir agora</a>`}
</div></div>
<script>
(function(){
  try {
    var parentOrigin = ${JSON.stringify(parentOrigin)};
    var send = function(payload){
      try {
        var msg = { source: "bet62-betby-tracker", payload: payload };
        if (window.parent && window.parent !== window) window.parent.postMessage(msg, parentOrigin);
        if (window.top && window.top !== window && window.top !== window.parent) {
          try { window.top.postMessage(msg, parentOrigin); } catch(_) {}
        }
      } catch (_) {}
    };
    send({ type: "ready" });
    // Size signals — match heights reported by real widgets so the outer
    // BetbyTrackerIframe never confuses the wrapper with an empty one.
    send({ type: "resize", height: ${JSON.stringify(fallbackResizeHeight)} });
    setTimeout(function(){
      send({ type: "resize", height: ${JSON.stringify(fallbackResizeHeight)} });
    }, 1000);
    if (${isFallbackSmart ? "true" : "false"}) {
      // Fallback smart: explicitly tell the parent that Statscore has NO
      // data for this BetBY-derived placeholder id — the parent will then
      // swap to "Tracker indisponível" instantly instead of spinning for
      // 7-18 seconds and then showing a black screen.
      send({ type: "data", available: false });
      setTimeout(function(){ send({ type: "data", available: false }); }, 1500);
      setTimeout(function(){ send({ type: "data", available: false }); }, 3500);
      // ── FAIL CLOSED VISUAL (não depende de postMessage cross-window) ──
      // Mostra "Tracker indisponível neste momento" DENTRO do próprio iframe
      // após 1.5s, caso o front pai não receba/process o postMessage.
      (function(){
        var swap = function(){
          try {
            var box = document.getElementById("fallback-box");
            if (!box) return;
            var spin = document.getElementById("fallback-spinner");
            if (spin) spin.style.display = "none";
            var msg = document.getElementById("fallback-msg");
            if (msg) { msg.textContent = "Tracker indisponível neste momento."; msg.style.opacity = "1"; }
            var sub = document.getElementById("fallback-sub");
            if (sub) sub.style.display = "none";
          } catch(_) {}
        };
        setTimeout(swap, 1500);
        setTimeout(swap, 2500);
        setTimeout(swap, 4000);
      })();
    } else {
      send({ type: "data", available: true });
      // Real Statscore id: proceed with client-side redirect to the
      // official origin so tracker.57e48a41.js paints correctly.
      var fire = function(){
        try { window.location.replace(${JSON.stringify(upstreamUrl)}); }
        catch (e) { /* fallback botao manual */ }
      };
      if (document.readyState === "complete") setTimeout(fire, 50);
      else window.addEventListener("load", function(){ setTimeout(fire, 50); });
      setTimeout(fire, 3000);
    }
  } catch (_) {}
})();
<\/script>
</body>
</html>`;
}

export async function fetchBetbyTrackerHtml(
  input: BetbyTrackerProxyInput,
  timeoutMs = 10_000,
): Promise<BetbyTrackerProxyResult> {
  const outerController = new AbortController();
  const outerTimeout = setTimeout(() => outerController.abort(), timeoutMs + 4000);
  try {
    let resolvedStatscoreEventId: string | null = null;
    // ── SHORTCUT PRIORIDADE 0: Chamador já sabe o Statscore ID (ex: query param
    //    ?statscoreEventId=6670732). Usa DIRETO, NÃO tenta resolver (evita erros).
    //
    // Bug 2026-08-14 #P0NoFormatValidate: NÃO aceita IDs numéricos longos (~19
    // dígitos = BetBY IDs) aqui — eles 404 no widgets.statscore.com. Só aceita
    // se o formato bate com Statscore NATIVO (5-10 dígitos). Qualquer coisa fora
    // disso cai nos outros caminhos (P1 mapa manual / P3 BetBY→Statscore) e por
    // fim no fallback smart L982 que marca usedFallback=true, impede redirect
    // meta refresh para widget 404, e retorna bridge com data.available=false.
    if (input.statscoreEventId != null) {
      const v = String(input.statscoreEventId).trim();
      if (isRealStatscoreId(v)) {
        resolvedStatscoreEventId = v;
        try { console.warn(`[betbyTracker/proxy] Statscore ID REAL passado EXPLICITAMENTE P0 (${resolvedStatscoreEventId}). Usando direto, sem resolver.`); } catch(_) {}
      } else if (v.length >= 4) {
        try { console.warn(`[betbyTracker/proxy] ?statscoreEventId=${v} IGNORADO no P0 (formato inválido Statscore, provavel BetBY ID 19+ dígitos). Prosseguindo P1/P3/FallbackSmart.`); } catch(_) {}
      }
    }
    if (!resolvedStatscoreEventId) {
      try {
        const resolveDeadline = Math.min(timeoutMs, 5500);
        resolvedStatscoreEventId = await Promise.race([
          resolveStatscoreEventIdFromBetby(input.betbyEventId, resolveDeadline),
          new Promise<null>((ok) => setTimeout(() => ok(null), resolveDeadline + 800)),
        ]) as string | null;
      } catch (_) {
        resolvedStatscoreEventId = null;
      }
    }
    // ── SHORTCUT PRIORIDADE 3: Mesmo que resolução automática BetBY → Statscore
    //    falhou, se temos nomes dos times e existe mapeamento MANUAL conhecido,
    //    use esse ID (ex: Mirassol vs LDU = 6670732).
    if (!resolvedStatscoreEventId && (input.homeTeamName || input.awayTeamName)) {
      const mapped = tryManualTeamStatscoreId(input.homeTeamName, input.awayTeamName);
      if (mapped) resolvedStatscoreEventId = mapped;
    }

    // Bug report 2026-08-13 (resolvido AGORA):
    //
    // O PROBLEMA ANTIGO (que justificava o throw draconiano abaixo):
    // Quando resolveStatscoreEventIdFromBetby não achava ID real do Statscore,
    // nós caíamos num fallback "enviar BetBY ID como se fosse Statscore ID".
    // Como o widget do Statscore recebia um ID inexistente, ele não tinha dados
    // → colocava 'display:none' em si mesmo → TELA PRETA ETERNA (nem sinal de vida!).
    // Ninguém conseguia detectar isso. O throw draconiano era a única saída:
    // "melhor não ter tracker do que tela preta enganando o usuário".
    //
    // O MUNDO MUDOU HOJE (4 correções dessa sessão):
    //  1) Bridge injetado (L438-L545) OUVINDO eventos 'DATA' e 'RESIZE' DIRETOS
    //     do widget Statscore + 'ensureVisible()' FORÇA display:block/min-height
    //     /opacity:1 em TUDO (container, body, iframes internos) → MESMO SE o widget
    //     tentar colocar display:none, NÓS TIRAMOS.
    //  2) Fallback 6s safety timeout no bridge força 'ensureVisible' + 'ready' de
    //     qualquer jeito.
    //  3) Frontend ouve 'postMessage' do bridge. Se DATA.available=false chegar,
    //     ou nenhum evento chegar, cai no fallback "Tracker indisponível" em <10s
    //     (com HTTP 200, Cloudflare não intercepta).
    //  4) CSP frame-ancestors apagado, iframe sempre renderiza.
    //
    // → AGORA o risco de "tela preta eterna" é ZERO. Podemos RESTAURAR O FALLBACK
    //   SMART: tenta ID REAL primeiro; se não tiver, TENTA BETBY ID mesmo assim.
    //   Muitas vezes o BetBY ID NUMÉRICO funciona no widget do Statscore!
    //   Se NÃO funcionar (sem dados), o pipeline novo cai em "Tracker indisponível"
    //   de forma controlada, nunca mais trava.
    let usedFallback = false;
    if (!resolvedStatscoreEventId) {
      // Em vez de throw, usa o BetBY ID e deixa o pipeline novo garantir UX:
      resolvedStatscoreEventId = input.betbyEventId;
      usedFallback = true;
      // (loggin via console; logger import é feito no routes/betbyTracker.ts)
      try { console.warn(`[betbyTracker/proxy] Statscore ID real NÃO resolvido para BetBY event ${input.betbyEventId}. Usando BetBY ID como fallback smart (ensureVisible/bridge DATA garante UX segura, nunca tela preta).`); } catch (_) {}
    }
    void 0; // usedFallback logged above; keep as local flag
    const upstreamUrl = buildBetbyTrackerUpstreamUrl({
      ...input,
      statscoreEventId: resolvedStatscoreEventId,
    });
    // Bug found 2026-08-14 auditing network requests (user sent 4 URLs):
    //  - demoapi.betby.com/a82d758c/static/js/tracker.57e48a41.js (widget BetBY Statscore)
    //  - settings-service.watchers.io (Statscore/Watchers tema API)
    //
    // tracker.57e48a41.js TEM BLOQUEIO DE ORIGEM CONHECIDO: retorna ZERO bytes
    // (ou pinta DOM vazio) quando window.location.origin !== betby.com — ou seja,
    // quando nós buscamos o HTML server-side (fetch Node) e re-servimos de NOSSA
    // origem (bet62 Railway), o widget falha.
    //
    // A SOLUCAO CORRETA é: SEMPRE que temos UM Statscore ID REAL (qualquer
    // caminho P0/P1/P3) fazemos redirect client-side (meta refresh 0s +
    // window.location.replace) DIRETO para demoapi.betby.com, assim
    // window.location.origin passa a ser betby.com e o tracker.57e48a41.js
    // RENDERIZA NORMALMENTE.
    //
    // A CONDICAO ANTERIOR BUGADA:
    //   hasRealStatscoreId = !usedFallback && input.statscoreEventId != null
    //
    // Erro GRAVE: usava input.statscoreEventId (SOMENTE P0 - statscore explicito
    // passado pelo chamador), IGNORANDO COMPLETAMENTE:
    //   P1 - tryManualTeamStatscoreId (mapa manual Mirassol/LDU=6670732)
    //   P3 - resolveStatscoreEventIdFromBetby (resolucao automatica BetBY->Statscore)
    // Resultado: hasRealStatscoreId quase sempre FALSE, NUNCA fazia redirect
    // para betby.com, sempre caia no fetch Node → widget tracker.57e48a41.js
    // ficava ZERO bytes, widget não aparecia (ou "Tracker indisponível").
    //
    // FIX FINAL: usa resolvedStatscoreEventId (P0/P1/P3) E NÃO input.statscoreEventId,
    // e ALÉM DISSO valida o FORMATO com isRealStatscoreId (5-10 dígitos), para que
    // IDs BetBY longos nunca sejam tratados como "Statscore REAL" e nunca acionem
    // redirect client-side para um widget que vai 404 → tela preta.
    const hasRealStatscoreId = !usedFallback
      && resolvedStatscoreEventId != null
      && isRealStatscoreId(resolvedStatscoreEventId);
    if (hasRealStatscoreId) {
      try { console.warn(`[betbyTracker/proxy] Statscore ID REAL via canal P0/P1/P3 (${String(resolvedStatscoreEventId).trim()}) → redirect client-side DIRETO para demoapi.betby.com (evita bloqueio de origem widget tracker.57e48a41.js + WAF 503). Pulando fetch Node.`); } catch(_) {}
      const redirectHtml = buildClientRedirectBypassWafHtml(upstreamUrl, input.theme ?? {}, { parentOrigin: input.parentOrigin });
      outerTimeout && clearTimeout(outerTimeout);
      return { html: redirectHtml, upstreamUrl };
    }
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(to);
      if (!res.ok) {
        throw new Error(`Upstream tracker returned HTTP ${res.status}`);
      }
      let html = await res.text();
      // Bug 2026-08-14 #FallbackSmartNoInject (GUARD DEFINITIVO): Não adianta
      // só checar usedFallback — o P3 resolveStatscoreEventIdFromBetby pode
      // retornar um BetBY ID de 19 dígitos como fallback sem marcar
      // usedFallback=true, resultando no mesmo problema: widget Statscore 404
      // silencioso sem bridge postMessage.
      //
      // GUARD DEFINITIVO: Se !isRealStatscoreId(resolvedStatscoreEventId)
      // (não tem 5 a 10 dígitos = não é Statscore nativo), NÃO vamos
      // injetar NADA do HTML upstream. Devolvemos o bridge shell
      // buildClientRedirectBypassWafHtml com isFallbackSmart:true que envia
      // data.available=false imediatamente. Front mostra
      // "Tracker indisponível neste momento" em <500ms sem tela preta.
      const resolvedRealStatscore = isRealStatscoreId(resolvedStatscoreEventId ?? "");
      if (!resolvedRealStatscore) {
        try { console.warn(`[betbyTracker/proxy] resolvedStatscoreEventId="${String(resolvedStatscoreEventId ?? "null")}" NÃO É Statscore REAL (isRealStatscoreId=false). Pulando upstream HTML inject. Retornando bridge shell data.available=false para front degrade amigavel.`); } catch(_) {}
        outerTimeout && clearTimeout(outerTimeout);
        return {
          html: buildClientRedirectBypassWafHtml(upstreamUrl, input.theme ?? {}, { isFallbackSmart: true, parentOrigin: input.parentOrigin }),
          upstreamUrl,
        };
      }
      // Bug report 2026-08-13 ("tela preta"): this HTML is fetched
      // server-side from demoapi.betby.com and re-served verbatim from OUR
      // OWN origin/path (/api/betby-live-tracker/:id), not from
      // demoapi.betby.com. Any relative resource URL the upstream page uses
      // (script src, stylesheet href, XHR without a full origin, etc.) was
      // resolving against our proxy's path instead of the real upstream
      // host — those requests 404 against our server, the widget's own JS
      // bundle never loads, and nothing ever paints inside the iframe: a
      // silent black screen with no error surfaced anywhere, since the page
      // itself finishes loading fine (onLoad fires) — only what it tried to
      // fetch afterward failed. A <base> tag, inserted as the very first
      // thing in <head> (so it wins over any base tag the upstream page
      // might declare itself, per the HTML spec's "first base element
      // wins" rule), makes every relative reference in the page resolve
      // against the real upstream URL again.
      const baseHref = (() => {
        try {
          const u = new URL(upstreamUrl);
          u.search = "";
          u.hash = "";
          return u.toString();
        } catch {
          return BETBY_DEMO_TRACKER_BASE + BETBY_TRACKER_PATH;
        }
      })();
      const injectBlock = buildBetbyThemeInjectionStyle(
        input.theme ?? {},
        input.parentOrigin ?? "*",
        {
          enableSseLiveOverlay: true,
          betbyEventId: input.betbyEventId,
          pulseBridgeBasePath: input.parentOrigin && input.parentOrigin !== "*" ? `${input.parentOrigin.replace(/\/$/, "")}/pulsebridge` : "/pulsebridge",
          sseUrl: undefined,
        },
      );
      // <base> goes in first (single replace, not a second race against the
      // same <head> match) so it's unambiguously the first <base> element in
      // the document regardless of what the upstream page itself declares.
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1>\n<base href="${baseHref}">\n${injectBlock}\n`,
      );
      const titleMatch = /<title>[^<]*<\/title>/i.exec(html);
      if (titleMatch) {
        html = html.replace(titleMatch[0], "<title>Live Match Tracker</title>");
      } else {
        html = html.replace(/<head([^>]*)>/i, `<head$1>\n<title>Live Match Tracker</title>\n`);
      }
      return { html, upstreamUrl };
    } catch (fetchErr) {
      clearTimeout(to);
      if (hasRealStatscoreId) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        try { console.warn(`[betbyTracker/proxy] Upstream BetBY fetch falhou (${msg}). Temos statscoreEventId REAL (${String(resolvedStatscoreEventId).trim()}) → usando fallback de redirect client-side (WAF bypass) para ${upstreamUrl}.`); } catch(_) {}
        const redirectHtml = buildClientRedirectBypassWafHtml(upstreamUrl, input.theme ?? {}, { parentOrigin: input.parentOrigin });
        return { html: redirectHtml, upstreamUrl };
      }
      throw fetchErr;
    } finally {
      clearTimeout(to);
    }
  } finally {
    clearTimeout(outerTimeout);
  }
}

export const BETBY_TRACKER_RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, no-cache, must-revalidate, proxy-revalidate",
  "X-Content-Type-Options": "nosniff",
  // Antes: no-referrer (bloqueava envio de Referer para serviços terceiros como GA4/Watchers).
  // strict-origin-when-cross-origin: envia apenas origem (scheme+host+porta) para cross-origin HTTPS,
  // path/query só para mesma origem. Mantém privacidade razoável e não quebra integrações.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Content-Security-Policy": [
    "default-src 'self' https: data: blob:",
    "img-src * data: blob: https://*.statscore.com https://*.watchers.io",
    "media-src * data: blob:",
    "style-src * 'unsafe-inline' data: https://wgt-s3-cdn.statscore.com https://*.statscore.com https://cdn.jsdelivr.net",
    "font-src * 'unsafe-inline' data:",
    // Novo widget ESM STATscore carrega de wgt-s3-cdn.statscore.com (além do velho tracker.57e48a41.js demoapi.betby.com).
    // Também cobre *.statscore.com wildcard para qualquer subdominio futuro (ex: standings.pc.statscore.com descoberto 2026-08-14).
    "script-src * 'unsafe-inline' 'unsafe-eval' data: blob: https://wgt-s3-cdn.statscore.com https://*.statscore.com https://demoapi.betby.com https://demo.betby.com https://www.gstatic.com",
    "worker-src * blob: data:",
    // Connect-src atualizado 2026-08-14 com hosts conhecidos explicitos + wildcard *.statscore.com para cobrir:
    //   - widgets.statscore.com (traducoes/PartialEventStartCountdown/match data)
    //   - standings.pc.statscore.com (classificacoes/tabelas ligas, descoberto 2026-08-14)
    //   - wgt-s3-cdn.statscore.com (CDN widget ESM moderno EmbederESM.js)
    //   - settings-service.watchers.io (tema dark/light + regras widget EN/BR)
    //   - demoapi.betby.com (BetBY live/brand, meta, pulse, API)
    //   - region1.analytics.google.com (GA4 analytics enviado de demo.betby.com)
    "connect-src * wss: ws: data: blob: https://widgets.statscore.com https://standings.pc.statscore.com https://*.statscore.com https://settings-service.watchers.io https://wgt-s3-cdn.statscore.com https://demoapi.betby.com https://region1.analytics.google.com",
    "frame-src * data: blob: https://demoapi.betby.com https://demo.betby.com",
    "frame-ancestors *",
    "base-uri 'self' https://demoapi.betby.com https://demo.betby.com",
    "form-action 'self' https://demoapi.betby.com https://demo.betby.com https:",
    // Força todo request sub-recursos do widget a usarem HTTPS (evita downgrade http):
    "upgrade-insecure-requests",
    "object-src 'none'",
  ].join("; "),
};
