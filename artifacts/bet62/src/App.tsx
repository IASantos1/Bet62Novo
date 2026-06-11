import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { useState, useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import SplashScreen from "@/components/SplashScreen";

const AdminPage = lazy(() => import("@/pages/admin"));
const WorldCupPage = lazy(() => import("@/pages/world-cup"));

// 08:00–18:59 → light mode · 19:00–07:59 → dark mode
function applyTheme() {
  const h = new Date().getHours();
  const isDark = h < 8 || h >= 19;
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light-mode", !isDark);
}

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
              onClick={() => window.location.reload()}
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
      <Route path="/" component={Home} />
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

  useEffect(() => {
    applyTheme();
    // Re-check every minute so it switches exactly at 08:00 / 19:00
    const id = setInterval(applyTheme, 60_000);
    return () => clearInterval(id);
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
            <Toaster theme="dark" richColors />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}

export default App;
