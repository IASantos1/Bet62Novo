import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import {
  useState,
  useEffect,
  lazy,
  Suspense,
  Component,
  type ReactNode,
} from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { hardResetPwaAndReload } from "@/lib/pwa";
import {
  applyThemePreference,
  clearStoredThemePreference,
  getResolvedTheme,
  subscribeThemeChange,
  type ResolvedTheme,
} from "@/lib/theme";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LivePage from "@/pages/live";
import SplashScreen from "@/components/SplashScreen";

const AdminPage = lazy(() => import("@/pages/admin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
    },
  },
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    try {
      console.error("[app error]", error);
    } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-950 text-white px-6">
          <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="text-lg font-black mb-2">O app não carregou</div>
            <div className="text-sm text-zinc-400 mb-4">
              Toque para recarregar. Se continuar, limpe a cache do
              navegador/PWA.
            </div>
            <button
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black text-sm rounded-xl py-3 transition-colors"
              onClick={() => {
                void hardResetPwaAndReload();
              }}
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
      <Route path="/promocoes">{() => <Home initialTab="promos" />}</Route>
      <Route path="/carteira">{() => <Home initialTab="wallet" />}</Route>
      <Route path="/minhas-apostas">{() => <Home initialTab="mybets" />}</Route>
      <Route path="/perfil">{() => <Home initialTab="profile" />}</Route>
      <Route path="/ao-vivo">{() => <LivePage />}</Route>
      <Route path="/live">{() => <LivePage />}</Route>
      <Route path="/admin">
        {() => (
          <Suspense
            fallback={
              <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-950 text-white">
                <div className="text-sm font-bold text-zinc-300">
                  A carregar…
                </div>
              </div>
            }
          >
            <AdminPage />
          </Suspense>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const isAdmin = window.location.pathname
    .replace(/\/$/, "")
    .endsWith("/admin");
  const [splashDone, setSplashDone] = useState(isAdmin);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getResolvedTheme(null),
  );

  useEffect(() => {
    clearStoredThemePreference();
    const syncTheme = () => {
      const resolved = applyThemePreference(null);
      setResolvedTheme(resolved);
      // Update the PWA theme-color meta so the mobile status bar follows the
      // auto-theme (dark 19h–8h, light 8h–19h) instead of the hardcoded red.
      try {
        const tcMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (tcMeta) tcMeta.content = resolved === "dark" ? "#0a0a0a" : "#ffffff";
      } catch {}
    };
    syncTheme();
    const unsubscribe = subscribeThemeChange(setResolvedTheme);
    const id = setInterval(syncTheme, 60_000);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, []);


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
