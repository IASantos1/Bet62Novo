import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { useState, useEffect, lazy, Suspense } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import SplashScreen from "@/components/SplashScreen";

const AdminPage = lazy(() => import("@/pages/admin"));

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin">{() => <Suspense fallback={null}><AdminPage /></Suspense>}</Route>
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
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster theme="dark" richColors />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}

export default App;
