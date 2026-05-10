import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { useState } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AdminPage from "@/pages/admin";
import SplashScreen from "@/components/SplashScreen";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const isAdmin = window.location.pathname.replace(/\/$/, "").endsWith("/admin");
  const [splashDone, setSplashDone] = useState(isAdmin);

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
