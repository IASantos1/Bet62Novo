import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { setRememberedEmail } from "@/lib/rememberedLogin";

type User = {
  id: string;
  name: string;
  email: string;
  balance: string;
  freebetBalance: string;
  casinoBonusSpinsRemaining?: number;
  nif?: string | null;
  withdrawalIban?: string | null;
  withdrawalName?: string | null;
  selfExcludedUntil?: string | null;
  kycStatus?: string | null;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  hasPasskey: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, nif: string) => Promise<void>;
  logout: () => Promise<void>;
  invalidateSession: (message?: string) => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPasskey, setHasPasskey] = useState(false);

  // Cookie-based session (HttpOnly bet62_session) — there's no token for JS
  // to read anymore, so "am I logged in" is always answered by asking the
  // server. Idle timeout and logout both revoke the session outright now
  // (no more "LOCKED" resumable state — Santos, 2026-09-28), so anything
  // other than ACTIVE just means logged out.
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await res.json();
      if (data.status === "ACTIVE") {
        setUser(data.user);
        setHasPasskey(!!data.passkeyAvailable);
      } else {
        setUser(null);
        setHasPasskey(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    // data.message is a human-readable string when the server sends one
    // (e.g. the account-lockout "tente novamente em N minuto(s)" text) —
    // prefer it over the bare error code, which is what data.error is for
    // ACCOUNT_LOCKED and not meant to be shown to the user directly.
    if (!res.ok) throw new Error(data.message || data.error || "Login failed");
    setUser(data.user);
    setRememberedEmail(email);
  };

  const register = async (name: string, email: string, password: string, nif: string) => {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, nif })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
    setUser(data.user);
    setRememberedEmail(email);
  };

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear local state regardless — the cookie may already be gone
      // server-side even if this particular request failed.
    }
    setUser(null);
    setHasPasskey(false);
    toast.success("Saiu com sucesso");
  };

  const invalidateSession = (message = "Sessão expirada. Entre novamente.") => {
    setUser(null);
    setHasPasskey(false);
    toast.error(message);
  };

  const refreshUser = async () => {
    await fetchSession();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, hasPasskey, login, register, logout, invalidateSession, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
