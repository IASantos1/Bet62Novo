import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export interface User {
  id: number;
  name: string;
  email: string;
  balance: string;
  freebetBalance: string;
  nif?: string | null;
  withdrawalIban?: string | null;
  withdrawalName?: string | null;
  selfExcludedUntil?: string | null;
  kycStatus?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isBiometricEnabled: boolean;
  isBiometricLocked: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  unlockBiometric: () => Promise<void>;
  failBiometric: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      const bioEnabled = await AsyncStorage.getItem("biometric_enabled");

      if (storedToken) {
        if (bioEnabled === "true") {
          setIsBiometricEnabled(true);
          setPendingToken(storedToken);
          setIsBiometricLocked(true);
        } else {
          setToken(storedToken);
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            await AsyncStorage.removeItem("auth_token");
          }
        }
      } else {
        const bioFlag = await AsyncStorage.getItem("biometric_enabled");
        if (bioFlag === "true") setIsBiometricEnabled(true);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  const unlockBiometric = useCallback(async () => {
    if (!pendingToken) {
      setIsBiometricLocked(false);
      return;
    }
    try {
      setToken(pendingToken);
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        await AsyncStorage.removeItem("auth_token");
        setPendingToken(null);
        setToken(null);
      }
    } catch {
      // ignore
    } finally {
      setIsBiometricLocked(false);
    }
  }, [pendingToken]);

  const failBiometric = useCallback(() => {
    setPendingToken(null);
    setIsBiometricLocked(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no login");
    await AsyncStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha no registo");
    await AsyncStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setPendingToken(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const enableBiometric = useCallback(async () => {
    await AsyncStorage.setItem("biometric_enabled", "true");
    setIsBiometricEnabled(true);
  }, []);

  const disableBiometric = useCallback(async () => {
    await AsyncStorage.removeItem("biometric_enabled");
    setIsBiometricEnabled(false);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      isBiometricEnabled, isBiometricLocked,
      login, register, logout, refreshUser, setUser,
      enableBiometric, disableBiometric,
      unlockBiometric, failBiometric,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { API_BASE };
