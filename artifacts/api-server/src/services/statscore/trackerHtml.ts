export const STATSCORE_WIDGET_ID_LIVE_MATCH_PRO = "6703d0b7b594ad13acd73580";
export const STATSCORE_WIDGET_ID_PRE_MATCH = "6703c22cf6a90cb01057c0bf";

export type Bet62ThemeVars = {
  fontFamily?: string;
  fontUrl?: string;
  backgroundMain?: string;
  elementBgPrimary?: string;
  elementBgSecondary?: string;
  highlight?: string;
  lines?: string;
  contrast?: string;
};

const DEFAULT_THEME: Required<Bet62ThemeVars> = {
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontUrl:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  backgroundMain: "rgba(12, 22, 33, 1)",
  elementBgPrimary: "rgba(30, 48, 66, 1)",
  elementBgSecondary: "rgba(20, 36, 50, 1)",
  highlight: "rgba(34, 197, 94, 1)",
  lines: "rgba(255, 255, 255, 0.08)",
  contrast: "rgba(255, 255, 255, 1)",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
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

function buildThemeVars(theme: Bet62ThemeVars): Record<string, string> {
  const t: Required<Bet62ThemeVars> = { ...DEFAULT_THEME, ...theme };
  const op = (c: string, a: number) =>
    c.startsWith("#") ? hexToRgba(c, a) : shadeRgba(c, 0).replace(/rgba?\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(",").map((s: string) => s.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
    });
  const vars: Record<string, string> = {
    "--fontUrl": `'${t.fontUrl}'`,
    "--fontFamily": `'${t.fontFamily}'`,
  };
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
    for (let i = 0; i <= 9; i++) {
      vars[`--${name}Opacity${i}0`] = op(base, i / 10);
    }
    for (const [step, delta] of [
      ["10", 2], ["20", 4], ["30", 6], ["60", 12],
    ] as const) {
      vars[`--${name}Darken${step}`] = shadeRgba(base, delta);
      vars[`--${name}Lighten${step}`] = shadeRgba(base, -delta);
    }
  }
  return vars;
}

export type TrackerBuilderInput = {
  statscoreEventId: number;
  language?: string;
  isLive?: boolean;
  theme?: Bet62ThemeVars;
  parentOrigin?: string;
  nonce?: string;
};

export function buildStatscoreTrackerHtml(input: TrackerBuilderInput): string {
  const statscoreEventId = String(input.statscoreEventId);
  const language = input.language ?? "pt-br";
  const widgetId = STATSCORE_WIDGET_ID_LIVE_MATCH_PRO;
  const parentOrigin = input.parentOrigin ?? "*";
  const themeVars = buildThemeVars(input.theme ?? {});
  const cssVarsString = Object.entries(themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join("\n          ");

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,maximum-scale=1,minimum-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
  <meta name="referrer" content="no-referrer" />
  <title>Live Match Tracker</title>
  <style>
    html,
    body {
      height: 100%;
    }
    body {
      margin: 0;
      background: transparent;
      color-scheme: dark;
    }
    #bt-tracker-container {
      position: absolute;
      inset: 0;
      width: 100%;
      height: auto;
      min-height: 100%;
      ${cssVarsString}
    }
    .STATSCOREWidget *[class*="logo" i],
    .STATSCOREWidget *[class*="brand" i],
    .STATSCOREWidget *[id*="logo" i],
    .STATSCOREWidget *[id*="brand" i],
    .STATSCOREWidget a[href*="statscore.com" i],
    .STATSCOREWidget a[href*="betby.com" i],
    .STATSCOREWidget a[href*="betgenius" i],
    .STATSCOREWidget a[href*="oddin" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  </style>
</head>
<body>
  <div id="bt-tracker-container" lang="${language}"></div>

  <script id="bt-statscore-tracker-script" src="https://wgt-s3-cdn.statscore.com/bundle/Embeder.js"></script>
  <script>
  (function () {
    const EVENT_ID = ${JSON.stringify(statscoreEventId)};
    const LANGUAGE = ${JSON.stringify(language)};
    const WIDGET_ID = ${JSON.stringify(widgetId)};
    const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
    const IS_LIVE = ${input.isLive !== false ? "true" : "false"};

    function postParent(payload) {
      try {
        window.parent.postMessage({ source: "bet62-statscore-tracker", payload: payload }, PARENT_ORIGIN);
      } catch (err) {}
    }

    function setupResizeObserver() {
      const el = document.getElementById("bt-tracker-container");
      if (!el) return;
      let last = 0;
      const tick = () => {
        const h = el.getBoundingClientRect().height;
        if (Math.abs(h - last) > 0.5) {
          last = h;
          postParent({ type: "resize", height: h });
        }
      };
      tick();
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(tick);
        ro.observe(el);
      } else {
        setInterval(tick, 400);
      }
    }

    function bootstrap() {
      const WS = window.STATSCOREWidgets;
      if (!WS || typeof WS.onLoad !== "function") {
        postParent({ type: "error", error: "StatScore Embeder not available" });
        return;
      }
      WS.onLoad(function (err) {
        if (err) {
          postParent({ type: "error", error: String(err && err.message || err) });
          return;
        }
        const el = document.getElementById("bt-tracker-container");
        if (!el) {
          postParent({ type: "error", error: "Container #bt-tracker-container missing" });
          return;
        }
        try {
          const groupConfig = { eventId: EVENT_ID, language: LANGUAGE };
          const styleConfig = {};
          if (typeof WS.WidgetGroup !== "function") {
            postParent({ type: "error", error: "StatScore WidgetGroup missing" });
            return;
          }
          const group = new WS.WidgetGroup(el, WIDGET_ID, groupConfig, styleConfig);
          if (group && typeof group.once === "function") {
            group.once("embedding", function () {
              postParent({ type: "ready", live: IS_LIVE, eventId: EVENT_ID });
              setupResizeObserver();
            });
            group.once("error", function (e) {
              postParent({ type: "error", error: String(e && e.message || e) });
            });
          } else {
            postParent({ type: "ready", live: IS_LIVE, eventId: EVENT_ID });
            setupResizeObserver();
          }
        } catch (e) {
          postParent({ type: "error", error: String(e && e.message || e) });
        }
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
      bootstrap();
    }
  })();
  </script>
</body>
</html>
`;
}

export const STATSC_TRACKER_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'self' https://wgt-s3-cdn.statscore.com https://widgets.statscore.com https://events-d.pc.statscore.com",
    "img-src 'self' https://wgt-s3-cdn.statscore.com https://lmp-s3-cdn.statscore.com https://files-immutable-4cbc033nbd3.sptpub.com https://fonts.gstatic.com data:",
    "style-src 'self' 'unsafe-inline' https://wgt-s3-cdn.statscore.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self' 'unsafe-inline' https://wgt-s3-cdn.statscore.com",
    "connect-src 'self' https://widgets.statscore.com https://events-d.pc.statscore.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; "),
};
