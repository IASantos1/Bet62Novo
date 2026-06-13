import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { toast } from "sonner";

type User = {
  id: string;
  name: string;
  email: string;
  balance: string;
  freebetBalance: string;
  nif?: string | null;
  withdrawalIban?: string | null;
  withdrawalName?: string | null;
  selfExcludedUntil?: string | null;
  kycStatus?: string | null;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, nif: string) => Promise<void>;
  logout: () => void;
  invalidateSession: (message?: string) => void;
  token: string | null;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredToken(): string | null {
  try {
    return localStorage.getItem("bet62_token");
  } catch {
    return null;
  }
}

function writeStoredToken(token: string) {
  try {
    localStorage.setItem("bet62_token", token);
  } catch {}
}

function clearStoredToken() {
  try {
    localStorage.removeItem("bet62_token");
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = () => {
    setToken(null);
    setUser(null);
    clearStoredToken();
  };

  const fetchUser = async (currentToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        clearSession();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUser(token);
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    
    setToken(data.token);
    writeStoredToken(data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string, nif: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, nif })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    setToken(data.token);
    writeStoredToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    clearSession();
    toast.success("Saiu com sucesso");
  };

  const invalidateSession = (message = "Sessão expirada. Entre novamente.") => {
    clearSession();
    toast.error(message);
  };

  const refreshUser = async () => {
    if (token) await fetchUser(token);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, invalidateSession, token, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
