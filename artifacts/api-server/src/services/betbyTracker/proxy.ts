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
  lang?: string;
  sportId?: string;
  theme?: BetbyThemeInjection;
  parentOrigin?: string;
};

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
    const rawMatch = html.match(/tracker\.html\?providers=([^"'<>\s`]+)/i);
    if (!rawMatch) return null;
    let encoded = rawMatch[1];
    try { encoded = decodeURIComponent(encoded); } catch (_) { /* ignore */ }
    let obj: any;
    try {
      obj = typeof encoded === "string" && encoded.startsWith("{")
        ? JSON.parse(encoded)
        : JSON.parse(decodeURIComponent(encoded));
    } catch (_) { return null; }
    if (!obj || obj.eventId == null) return null;
    const outId = String(obj.eventId);
    if (/^\d+$/.test(outId) && outId.length >= 4) return outId;
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
      html, body { background: transparent !important; color-scheme: dark; }
      #bt-tracker-container,
      .STATSCOREWidgetContainer,
      .STATSCOREWidget {
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
      function setupResize() {
        const el = document.getElementById("bt-tracker-container") || document.body;
        let last = 0;
        const tick = function () {
          const h = el.getBoundingClientRect().height;
          if (Math.abs(h - last) > 0.5) { last = h; postParent({ type: "resize", height: h }); }
        };
        tick();
        if (typeof ResizeObserver !== "undefined") { try { var ro = new ResizeObserver(tick); ro.observe(el); } catch(_) { setInterval(tick, 400); } }
        else setInterval(tick, 400);
      }
      window.addEventListener("load", function () {
        postParent({ type: "load" });
        setTimeout(setupResize, 200);
      });
      window.addEventListener("message", function (e) {
        try {
          if (!e.data || e.data.source !== "bt-frame") return;
          var inner = e.data.message || {};
          if (inner.type === "bt-frame-loaded" || inner.type === "bt-frame-widget-loaded") {
            postParent({ type: "ready" });
            setupResize();
          } else if (inner.type === "bt-frame-height-changed") {
            postParent({ type: "resize", height: inner.payload });
          } else if (inner.type === "bt-frame-widget-failed") {
            postParent({ type: "error", error: inner.payload ? String(inner.payload) : "widget failed" });
          } else {
            postParent({ type: "inner-event", inner: inner });
          }
        } catch (_) {}
      });
    })();
    <\/script>`;
}

export async function fetchBetbyTrackerHtml(
  input: BetbyTrackerProxyInput,
  timeoutMs = 10_000,
): Promise<BetbyTrackerProxyResult> {
  const outerController = new AbortController();
  const outerTimeout = setTimeout(() => outerController.abort(), timeoutMs + 4000);
  try {
    let resolvedStatscoreEventId: string | null = null;
    try {
      const resolveDeadline = Math.min(timeoutMs, 5500);
      resolvedStatscoreEventId = await Promise.race([
        resolveStatscoreEventIdFromBetby(input.betbyEventId, resolveDeadline),
        new Promise<null>((ok) => setTimeout(() => ok(null), resolveDeadline + 800)),
      ]) as string | null;
    } catch (_) {
      resolvedStatscoreEventId = null;
    }

    const upstreamUrl = buildBetbyTrackerUpstreamUrl(
      resolvedStatscoreEventId
        ? { ...input, statscoreEventId: resolvedStatscoreEventId }
        : input,
    );
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
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n${injectBlock}\n`);
      const titleMatch = /<title>[^<]*<\/title>/i.exec(html);
      if (titleMatch) {
        html = html.replace(titleMatch[0], "<title>Live Match Tracker</title>");
      } else {
        html = html.replace(/<head([^>]*)>/i, `<head$1>\n<title>Live Match Tracker</title>\n`);
      }
      return { html, upstreamUrl };
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
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'self' https://demoapi.betby.com https://wgt-s3-cdn.statscore.com https://widgets.statscore.com https://events-d.pc.statscore.com",
    "img-src 'self' https://demoapi.betby.com https://d1bvoel1nv172p.cloudfront.net https://wgt-s3-cdn.statscore.com https://lmp-s3-cdn.statscore.com https://files-immutable-4cbc033nbd3.sptpub.com https://fonts.gstatic.com data:",
    "style-src 'self' 'unsafe-inline' https://demoapi.betby.com https://wgt-s3-cdn.statscore.com https://fonts.googleapis.com",
    "font-src 'self' 'unsafe-inline' https://fonts.gstatic.com data:",
    "script-src 'self' 'unsafe-inline' https://demoapi.betby.com https://wgt-s3-cdn.statscore.com",
    "connect-src 'self' https://demoapi.betby.com https://widgets.statscore.com https://events-d.pc.statscore.com https://region1.analytics.google.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; "),
};
