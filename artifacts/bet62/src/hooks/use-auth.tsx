import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { toast } from "sonner";

type User = {
  id: string;
  name: string;
  email: string;
  balance: string;
  freebetBalance: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  token: string | null;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("bet62_token"));
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async (currentToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setToken(null);
        localStorage.removeItem("bet62_token");
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
    localStorage.setItem("bet62_token", data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    setToken(data.token);
    localStorage.setItem("bet62_token", data.token);
    setUser(data.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("bet62_token");
    toast.success("Saiu com sucesso");
  };

  const refreshUser = async () => {
    if (token) await fetchUser(token);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, token, refreshUser }}>
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
