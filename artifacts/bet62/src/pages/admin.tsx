import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, ListChecks, LogOut, Loader2,
  TrendingUp, DollarSign, Activity, Trophy, Search,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Clock,
  Zap, RefreshCw, Eye, EyeOff, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// --- Types ---
type AdminStats = {
  users: { total: number };
  bets: { total: number; pending: number; won: number; lost: number; cashedOut: number };
  financial: { totalStaked: number; totalPaidOut: number; totalUserBalance: number; margin: string };
  chart: Array<{ day: string; bets: string; volume: string }>;
};

type AdminUser = {
  id: number;
  name: string;
  email: string;
  balance: string;
  createdAt: string;
  betCount: number;
  totalStaked: number;
};

type AdminBet = {
  id: number;
  userId: number;
  matchTitle: string;
  stake: string;
  potentialWin: string;
  totalOdds: string;
  status: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pendente",  cls: "bg-zinc-800 text-zinc-400" },
  won:        { label: "Ganhou",    cls: "bg-green-900/60 text-green-400" },
  lost:       { label: "Perdeu",    cls: "bg-red-900/40 text-red-400" },
  cashed_out: { label: "Cash Out",  cls: "bg-yellow-900/40 text-yellow-400" },
};

function StatCard({ icon, label, value, sub, color = "red" }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: "red" | "green" | "blue" | "yellow";
}) {
  const colors = { red: "text-red-500", green: "text-green-500", blue: "text-blue-400", yellow: "text-yellow-400" };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className={`${colors[color]}`}>{icon}</span>
      </div>
      <div className="text-2xl font-black text-white mb-1">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
      {sub && <div className="text-xs text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("admin_token"));
  const [username, setUsername] = useState<string>(() => sessionStorage.getItem("admin_username") || "");
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "bets">("dashboard");

  // Login form
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [loading, setLoading] = useState(false);

  // UI
  const [userSearch, setUserSearch] = useState("");
  const [betSearch, setBetSearch] = useState("");
  const [balanceModal, setBalanceModal] = useState<AdminUser | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceOp, setBalanceOp] = useState<"add" | "subtract" | "set">("add");
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [updatingBet, setUpdatingBet] = useState<number | null>(null);
  const [sortUsers, setSortUsers] = useState<{ key: keyof AdminUser; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });

  const authHeader = { Authorization: `Bearer ${token}` };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Credenciais inválidas"); return; }
      setToken(data.token);
      setUsername(data.username);
      sessionStorage.setItem("admin_token", data.token);
      sessionStorage.setItem("admin_username", data.username);
      toast.success("Bem-vindo ao painel administrativo!");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUsername("");
    sessionStorage.removeItem("admin_token");
    sessionStorage.removeItem("admin_username");
  };

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/stats", { headers: authHeader });
      if (res.ok) setStats(await res.json());
      else if (res.status === 401) handleLogout();
    } catch { /* ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: authHeader });
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bets", { headers: authHeader });
      if (res.ok) setBets(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    fetchStats();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "bets") fetchBets();
  }, [token, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateBalance = async () => {
    if (!balanceModal || !balanceAmount) return;
    setUpdatingBalance(true);
    try {
      const res = await fetch(`/api/admin/users/${balanceModal.id}/balance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ operation: balanceOp, amount: balanceAmount }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Saldo atualizado: R$ ${parseFloat(data.balance).toFixed(2)}`);
      setBalanceModal(null);
      setBalanceAmount("");
      fetchUsers();
    } catch {
      toast.error("Erro ao atualizar saldo");
    } finally {
      setUpdatingBalance(false);
    }
  };

  const handleUpdateBetStatus = async (betId: number, status: string) => {
    setUpdatingBet(betId);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Aposta marcada como: ${STATUS_CONFIG[status]?.label}`);
      fetchBets();
      fetchStats();
    } catch {
      toast.error("Erro ao atualizar aposta");
    } finally {
      setUpdatingBet(null);
    }
  };

  const sortedUsers = [...users]
    .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortUsers.key];
      const bv = b[sortUsers.key];
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortUsers.dir === "asc" ? cmp : -cmp;
    });

  const filteredBets = bets.filter(b =>
    b.matchTitle.toLowerCase().includes(betSearch.toLowerCase()) ||
    (b.userName || "").toLowerCase().includes(betSearch.toLowerCase())
  );

  const toggleSort = (key: keyof AdminUser) => {
    setSortUsers(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  // --- LOGIN PAGE ---
  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 dark">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500/30 mb-4">
              <ShieldCheck className="text-red-500" size={28} />
            </div>
            <div className="font-black text-3xl tracking-tighter italic mb-1">
              <span className="text-white">BET</span><span className="text-red-600">62</span>
            </div>
            <p className="text-zinc-500 text-sm">Painel Administrativo</p>
          </div>

          <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-sm">E-mail / Usuário Admin</Label>
              <Input
                type="text"
                placeholder="admin"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-white"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 text-sm">Senha</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  className="bg-zinc-950 border-zinc-700 text-white pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11"
              disabled={loginLoading}
            >
              {loginLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <ShieldCheck size={16} className="mr-2" />}
              ENTRAR NO PAINEL
            </Button>
          </form>

          <p className="text-center text-xs text-zinc-700 mt-4">
            Área restrita • Bet62 Admin v1.0
          </p>
        </motion.div>
      </div>
    );
  }

  // --- ADMIN DASHBOARD ---
  return (
    <div className="min-h-screen bg-zinc-950 text-white dark flex">

      {/* SIDEBAR */}
      <aside className="w-16 lg:w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-zinc-800">
          <div className="font-black text-xl tracking-tighter italic hidden lg:block">
            <span className="text-white">BET</span><span className="text-red-600">62</span>
            <span className="text-xs font-normal text-zinc-500 ml-2 not-italic">Admin</span>
          </div>
          <div className="lg:hidden flex justify-center">
            <ShieldCheck className="text-red-500" size={22} />
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {[
            { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
            { id: "users", icon: <Users size={18} />, label: "Usuários" },
            { id: "bets", icon: <ListChecks size={18} />, label: "Apostas" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
            >
              {tab.icon}
              <span className="hidden lg:block">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <div className="hidden lg:block text-xs text-zinc-600 px-2 mb-2 truncate">{username}</div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} />
            <span className="hidden lg:block">Sair</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto">

        {/* TOP BAR */}
        <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h1 className="font-bold text-lg text-white">
            {activeTab === "dashboard" ? "Visão Geral" : activeTab === "users" ? "Gerenciar Usuários" : "Gerenciar Apostas"}
          </h1>
          <button
            onClick={() => { fetchStats(); if (activeTab === "users") fetchUsers(); if (activeTab === "bets") fetchBets(); }}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:block">Atualizar</span>
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">

            {/* DASHBOARD TAB */}
            {activeTab === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

                {!stats ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <>
                    {/* Stat Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<Users size={20} />} label="Total de Usuários" value={stats.users.total} color="blue" />
                      <StatCard icon={<ListChecks size={20} />} label="Total de Apostas" value={stats.bets.total} sub={`${stats.bets.pending} pendentes`} color="yellow" />
                      <StatCard icon={<DollarSign size={20} />} label="Volume Apostado" value={`R$ ${stats.financial.totalStaked.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="green" />
                      <StatCard icon={<TrendingUp size={20} />} label="Margem da Casa" value={`${stats.financial.margin}%`} sub="sobre volume apostado" color="red" />
                    </div>

                    {/* Second row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<CheckCircle size={20} />} label="Apostas Ganhas" value={stats.bets.won} color="green" />
                      <StatCard icon={<XCircle size={20} />} label="Apostas Perdidas" value={stats.bets.lost} color="red" />
                      <StatCard icon={<Zap size={20} />} label="Cash Outs" value={stats.bets.cashedOut} color="yellow" />
                      <StatCard icon={<Activity size={20} />} label="Saldo Total Usuários" value={`R$ ${stats.financial.totalUserBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} color="blue" />
                    </div>

                    {/* Recent activity chart */}
                    {stats.chart.length > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                          <Activity size={16} className="text-red-500" /> Apostas nos últimos 7 dias
                        </h3>
                        <div className="space-y-2">
                          {stats.chart.map((row) => {
                            const maxVol = Math.max(...stats.chart.map(r => parseFloat(r.volume || "0")));
                            const pct = maxVol > 0 ? (parseFloat(row.volume || "0") / maxVol) * 100 : 0;
                            return (
                              <div key={row.day} className="flex items-center gap-3 text-sm">
                                <span className="text-zinc-500 w-24 shrink-0 text-xs">{row.day}</span>
                                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.8, delay: 0.1 }}
                                    className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded"
                                  />
                                </div>
                                <span className="text-zinc-400 text-xs w-24 text-right shrink-0">
                                  {row.bets} apostas • R$ {parseFloat(row.volume || "0").toFixed(0)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bet breakdown */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                        <Trophy size={16} className="text-red-500" /> Distribuição de Apostas
                      </h3>
                      <div className="space-y-3">
                        {[
                          { label: "Pendentes", value: stats.bets.pending, total: stats.bets.total, cls: "bg-zinc-500" },
                          { label: "Ganhas", value: stats.bets.won, total: stats.bets.total, cls: "bg-green-600" },
                          { label: "Perdidas", value: stats.bets.lost, total: stats.bets.total, cls: "bg-red-700" },
                          { label: "Cash Out", value: stats.bets.cashedOut, total: stats.bets.total, cls: "bg-yellow-600" },
                        ].map(row => (
                          <div key={row.label} className="flex items-center gap-3 text-sm">
                            <span className="text-zinc-400 w-20 text-xs shrink-0">{row.label}</span>
                            <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${row.total > 0 ? (row.value / row.total) * 100 : 0}%` }}
                                transition={{ duration: 0.8 }}
                                className={`h-full ${row.cls} rounded`}
                              />
                            </div>
                            <span className="text-zinc-400 text-xs w-12 text-right">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* USERS TAB */}
            {activeTab === "users" && (
              <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    placeholder="Buscar por nome ou e-mail..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="bg-zinc-900 border-zinc-700 text-white pl-9"
                  />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-950/50">
                            {[
                              { key: "id", label: "ID" },
                              { key: "name", label: "Nome" },
                              { key: "email", label: "E-mail" },
                              { key: "balance", label: "Saldo" },
                              { key: "betCount", label: "Apostas" },
                              { key: "createdAt", label: "Cadastro" },
                            ].map(col => (
                              <th
                                key={col.key}
                                onClick={() => toggleSort(col.key as keyof AdminUser)}
                                className="text-left px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                              >
                                <span className="flex items-center gap-1">
                                  {col.label}
                                  {sortUsers.key === col.key
                                    ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                    : null}
                                </span>
                              </th>
                            ))}
                            <th className="px-4 py-3 text-zinc-500 font-medium text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedUsers.map(user => (
                            <tr key={user.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">#{user.id}</td>
                              <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{user.name}</td>
                              <td className="px-4 py-3 text-zinc-400 text-xs">{user.email}</td>
                              <td className="px-4 py-3">
                                <span className="font-bold text-green-400">R$ {parseFloat(user.balance).toFixed(2)}</span>
                              </td>
                              <td className="px-4 py-3 text-zinc-400">{user.betCount}</td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                                {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setBalanceModal(user); setBalanceAmount(""); setBalanceOp("add"); }}
                                  className="text-xs border-zinc-700 hover:bg-zinc-700 text-zinc-300 h-7 px-3"
                                >
                                  Saldo
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {sortedUsers.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-600">Nenhum usuário encontrado</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* BETS TAB */}
            {activeTab === "bets" && (
              <motion.div key="bets" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    placeholder="Buscar por jogo ou usuário..."
                    value={betSearch}
                    onChange={e => setBetSearch(e.target.value)}
                    className="bg-zinc-900 border-zinc-700 text-white pl-9"
                  />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-950/50">
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">ID</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Usuário</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Partida</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Aposta</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Odds</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Potencial</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                            <th className="text-right px-4 py-3 text-zinc-500 font-medium">Liquidar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBets.map(bet => (
                            <tr key={bet.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">#{bet.id}</td>
                              <td className="px-4 py-3">
                                <div className="text-white text-xs font-medium">{bet.userName}</div>
                                <div className="text-zinc-600 text-[10px]">{bet.userEmail}</div>
                              </td>
                              <td className="px-4 py-3 text-zinc-300 text-xs max-w-[160px] truncate">{bet.matchTitle}</td>
                              <td className="px-4 py-3 font-bold text-white">R$ {parseFloat(bet.stake).toFixed(2)}</td>
                              <td className="px-4 py-3 text-red-400 font-bold">{parseFloat(bet.totalOdds).toFixed(2)}</td>
                              <td className="px-4 py-3 text-green-400 font-bold">R$ {parseFloat(bet.potentialWin).toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_CONFIG[bet.status]?.cls || "bg-zinc-800 text-zinc-400"}`}>
                                  {STATUS_CONFIG[bet.status]?.label || bet.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                                {new Date(bet.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-4 py-3">
                                {bet.status === "pending" ? (
                                  <div className="flex items-center gap-1.5 justify-end">
                                    {updatingBet === bet.id ? (
                                      <Loader2 className="animate-spin text-zinc-500" size={14} />
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleUpdateBetStatus(bet.id, "won")}
                                          title="Marcar como Ganhou"
                                          className="p-1.5 rounded bg-green-900/50 hover:bg-green-800 text-green-400 transition-colors"
                                        >
                                          <CheckCircle size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleUpdateBetStatus(bet.id, "lost")}
                                          title="Marcar como Perdeu"
                                          className="p-1.5 rounded bg-red-900/30 hover:bg-red-900 text-red-400 transition-colors"
                                        >
                                          <XCircle size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleUpdateBetStatus(bet.id, "cashed_out")}
                                          title="Marcar Cash Out"
                                          className="p-1.5 rounded bg-yellow-900/30 hover:bg-yellow-900 text-yellow-400 transition-colors"
                                        >
                                          <Zap size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => handleUpdateBetStatus(bet.id, "pending")}
                                      title="Reverter para Pendente"
                                      className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                      <Clock size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredBets.length === 0 && (
                            <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-600">Nenhuma aposta encontrada</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* BALANCE MODAL */}
      <AnimatePresence>
        {balanceModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setBalanceModal(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg text-white mb-1">Ajustar Saldo</h3>
                <p className="text-sm text-zinc-400 mb-4 truncate">{balanceModal.name} — <span className="text-green-400 font-bold">R$ {parseFloat(balanceModal.balance).toFixed(2)}</span></p>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {(["add", "subtract", "set"] as const).map(op => (
                      <button
                        key={op}
                        onClick={() => setBalanceOp(op)}
                        className={`py-2 rounded-lg text-xs font-bold transition-colors ${balanceOp === op ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
                      >
                        {op === "add" ? "Adicionar" : op === "subtract" ? "Remover" : "Definir"}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm">
                      {balanceOp === "add" ? "Valor a adicionar (R$)" : balanceOp === "subtract" ? "Valor a remover (R$)" : "Novo saldo (R$)"}
                    </Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={balanceAmount}
                      onChange={e => setBalanceAmount(e.target.value)}
                      className="bg-zinc-950 border-zinc-700 text-white font-mono"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setBalanceModal(null)} className="flex-1 border-zinc-700 text-zinc-300">Cancelar</Button>
                    <Button onClick={handleUpdateBalance} disabled={updatingBalance || !balanceAmount} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
                      {updatingBalance ? <Loader2 className="animate-spin" size={16} /> : "Confirmar"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
