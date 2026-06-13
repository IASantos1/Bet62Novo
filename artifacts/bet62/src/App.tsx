import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { useState, useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { hardResetPwaAndReload } from "@/lib/pwa";
import { applyThemePreference, getStoredThemePreference, getResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "@/lib/theme";
import { readWCClientSnapshotRaw, writeWCClientSnapshotRaw } from "@/lib/world-cup-cache";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LivePage from "@/pages/live";
import SplashScreen from "@/components/SplashScreen";

const AdminPage = lazy(() => import("@/pages/admin"));
const WorldCupPage = lazy(() => import("@/pages/world-cup"));
const preloadWorldCupPage = () => import("@/pages/world-cup");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
    },
  },
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown | null }> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    try { console.error("[app error]", error); } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-950 text-white px-6">
          <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="text-lg font-black mb-2">O app não carregou</div>
            <div className="text-sm text-zinc-400 mb-4">Toque para recarregar. Se continuar, limpe a cache do navegador/PWA.</div>
            <button
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black text-sm rounded-xl py-3 transition-colors"
              onClick={() => { void hardResetPwaAndReload(); }}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <Home />}</Route>
      <Route path="/ao-vivo">{() => <LivePage />}</Route>
      <Route path="/live">{() => <LivePage />}</Route>
      <Route path="/admin">{() => (
        <Suspense fallback={
          <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-950 text-white">
            <div className="text-sm font-bold text-zinc-300">A carregar…</div>
          </div>
        }>
          <AdminPage />
        </Suspense>
      )}</Route>
      <Route path="/copa-do-mundo">{() => (
        <Suspense fallback={
          <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#090909]">
            <div className="w-7 h-7 border-2 border-zinc-800 border-t-red-500 rounded-full animate-spin" />
          </div>
        }>
          <WorldCupPage />
        </Suspense>
      )}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const isAdmin = window.location.pathname.replace(/\/$/, "").endsWith("/admin");
  const [splashDone, setSplashDone] = useState(isAdmin);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getResolvedTheme());

  useEffect(() => {
    const syncTheme = () => setResolvedTheme(applyThemePreference(getStoredThemePreference()));
    syncTheme();
    const unsubscribe = subscribeThemeChange(setResolvedTheme);
    const id = setInterval(() => {
      if (!getStoredThemePreference()) syncTheme();
    }, 60_000);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (isAdmin || !splashDone) return;
    let cancelled = false;
    let timerId: number | null = null;
    const idle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);
    let idleId: number | null = null;

    const prefetch = () => {
      void preloadWorldCupPage();
      const cached = readWCClientSnapshotRaw();
      if (cached) return;
      void fetchWithTimeout("/api/matches/wc2026", {}, 8_000)
        .then(r => (r.ok ? r.json() : { matches: [] }))
        .then((data) => {
          if (cancelled) return;
          const matches = Array.isArray((data as { matches?: unknown[] }).matches)
            ? (((data as { matches?: Record<string, unknown>[] }).matches) ?? [])
            : [];
          writeWCClientSnapshotRaw(matches);
        })
        .catch(() => {});
    };

    if (idle) {
      idleId = idle(() => { prefetch(); }, { timeout: 2_500 });
    } else {
      timerId = window.setTimeout(() => { prefetch(); }, 1_200);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && cancelIdle) cancelIdle(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [isAdmin, splashDone]);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <AppErrorBoundary>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </AppErrorBoundary>
            <Toaster theme={resolvedTheme} richColors />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}

export default App;
