import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, ListChecks, LogOut, Loader2,
  TrendingUp, DollarSign, Activity, Trophy, Search,
  ChevronUp, ChevronDown, CheckCircle, XCircle, Clock,
  Zap, RefreshCw, Eye, EyeOff, ShieldCheck, ArrowUpCircle,
  Ban, Gift, CreditCard, AlertCircle, ChevronRight, X,
  Wallet, BadgeCheck, FileText, UserX, UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdminStats = {
  users: { total: number };
  bets: { total: number; pending: number; won: number; lost: number; cashedOut: number };
  financial: { totalStaked: number; totalPaidOut: number; totalUserBalance: number; totalDeposited: number; margin: string };
  withdrawals: { pendingCount: number; pendingTotal: number };
  chart: Array<{ day: string; bets: string; volume: string }>;
};

type AdminUser = {
  id: number; name: string; email: string; balance: string; freebetBalance: string;
  kycStatus: string | null; selfExcludedUntil: string | null; banned: boolean;
  createdAt: string; betCount: number; totalStaked: number;
};

type AdminBet = {
  id: number; userId: number; matchTitle: string; stake: string; potentialWin: string;
  totalOdds: string; status: string; createdAt: string; userName: string | null; userEmail: string | null;
};

type AdminWithdrawal = {
  id: number; userId: number; amount: string; iban: string; holderName: string;
  nif: string; status: string; notes: string | null; createdAt: string;
  userName: string | null; userEmail: string | null;
};

type AdminPayment = {
  id: number; orderId: string; userId: number; amount: string; method: string;
  status: string; entity: string | null; reference: string | null; createdAt: string;
  userName: string | null; userEmail: string | null;
};

type UserDetail = {
  user: AdminUser;
  bets: AdminBet[];
  payments: AdminPayment[];
  withdrawals: AdminWithdrawal[];
};

const STATUS_BET: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pendente",  cls: "bg-zinc-800 text-zinc-400" },
  won:        { label: "Ganhou",    cls: "bg-green-900/60 text-green-400" },
  lost:       { label: "Perdeu",    cls: "bg-red-900/40 text-red-400" },
  cashed_out: { label: "Cash Out",  cls: "bg-yellow-900/40 text-yellow-400" },
};

const STATUS_PAYMENT: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendente",   cls: "bg-zinc-800 text-zinc-400" },
  completed: { label: "Concluído",  cls: "bg-green-900/60 text-green-400" },
  failed:    { label: "Falhado",    cls: "bg-red-900/40 text-red-400" },
};

const STATUS_WITHDRAWAL: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Pendente",   cls: "bg-yellow-900/40 text-yellow-400" },
  approved: { label: "Aprovado",   cls: "bg-green-900/60 text-green-400" },
  rejected: { label: "Rejeitado",  cls: "bg-red-900/40 text-red-400" },
};

const KYC_LABELS: Record<string, { label: string; cls: string }> = {
  not_submitted: { label: "Não enviado", cls: "text-zinc-500" },
  pending:       { label: "Em análise",  cls: "text-yellow-400" },
  approved:      { label: "Aprovado",    cls: "text-green-400" },
  rejected:      { label: "Rejeitado",   cls: "text-red-400" },
};

const METHOD_LABEL: Record<string, string> = {
  multibanco: "Multibanco", mbway: "MB WAY", card: "Cartão"
};

function StatCard({ icon, label, value, sub, color = "red", alert }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  color?: "red" | "green" | "blue" | "yellow" | "purple"; alert?: boolean;
}) {
  const colors = { red: "text-red-500", green: "text-green-500", blue: "text-blue-400", yellow: "text-yellow-400", purple: "text-purple-400" };
  return (
    <div className={`bg-zinc-900 border rounded-xl p-5 ${alert ? "border-yellow-500/40" : "border-zinc-800"}`}>
      <div className="flex items-start justify-between mb-3">
        <span className={colors[color]}>{icon}</span>
        {alert && <AlertCircle size={14} className="text-yellow-400" />}
      </div>
      <div className="text-2xl font-black text-white mb-1">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
      {sub && <div className="text-xs text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

function Badge({ cls, label }: { cls: string; label: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("admin_token"));
  const [username, setUsername] = useState<string>(() => sessionStorage.getItem("admin_username") || "");
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "bets" | "payments" | "withdrawals">("dashboard");

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [betSearch, setBetSearch] = useState("");
  const [betStatusFilter, setBetStatusFilter] = useState("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [sortUsers, setSortUsers] = useState<{ key: keyof AdminUser; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });

  const [balanceModal, setBalanceModal] = useState<AdminUser | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceOp, setBalanceOp] = useState<"add" | "subtract" | "set">("add");
  const [updatingBalance, setUpdatingBalance] = useState(false);

  const [freebetModal, setFreebetModal] = useState<AdminUser | null>(null);
  const [freebetAmount, setFreebetAmount] = useState("");
  const [updatingFreebet, setUpdatingFreebet] = useState(false);

  const [detailModal, setDetailModal] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"bets" | "payments" | "withdrawals">("bets");

  const [withdrawalNotes, setWithdrawalNotes] = useState<Record<number, string>>({});
  const [updatingWithdrawal, setUpdatingWithdrawal] = useState<number | null>(null);
  const [updatingBet, setUpdatingBet] = useState<number | null>(null);
  const [creditingPayment, setCreditingPayment] = useState<number | null>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Credenciais inválidas"); return; }
      setToken(data.token); setUsername(data.username);
      sessionStorage.setItem("admin_token", data.token);
      sessionStorage.setItem("admin_username", data.username);
      toast.success("Bem-vindo ao painel administrativo!");
    } catch { toast.error("Erro de conexão"); }
    finally { setLoginLoading(false); }
  };

  const handleLogout = () => {
    setToken(null); setUsername("");
    sessionStorage.removeItem("admin_token"); sessionStorage.removeItem("admin_username");
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
    if (!token) return; setLoading(true);
    try { const res = await fetch("/api/admin/users", { headers: authHeader }); if (res.ok) setUsers(await res.json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBets = useCallback(async () => {
    if (!token) return; setLoading(true);
    try {
      const url = betStatusFilter !== "all" ? `/api/admin/bets?status=${betStatusFilter}` : "/api/admin/bets";
      const res = await fetch(url, { headers: authHeader }); if (res.ok) setBets(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token, betStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPayments = useCallback(async () => {
    if (!token) return; setLoading(true);
    try { const res = await fetch("/api/admin/payments", { headers: authHeader }); if (res.ok) setPayments(await res.json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWithdrawals = useCallback(async () => {
    if (!token) return; setLoading(true);
    try { const res = await fetch("/api/withdrawals/admin/all", { headers: authHeader }); if (res.ok) setWithdrawals(await res.json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    fetchStats();
    if (activeTab === "users") fetchUsers();
    if (activeTab === "bets") fetchBets();
    if (activeTab === "payments") fetchPayments();
    if (activeTab === "withdrawals") fetchWithdrawals();
  }, [token, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (activeTab === "bets") fetchBets(); }, [betStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openUserDetail = async (user: AdminUser) => {
    setDetailLoading(true); setDetailModal(null); setDetailTab("bets");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/detail`, { headers: authHeader });
      if (res.ok) setDetailModal(await res.json());
    } catch { toast.error("Erro ao carregar detalhes"); }
    finally { setDetailLoading(false); }
  };

  const handleUpdateBalance = async () => {
    if (!balanceModal || !balanceAmount) return; setUpdatingBalance(true);
    try {
      const res = await fetch(`/api/admin/users/${balanceModal.id}/balance`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ operation: balanceOp, amount: balanceAmount }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Saldo atualizado: € ${parseFloat(data.balance).toFixed(2)}`);
      setBalanceModal(null); setBalanceAmount(""); fetchUsers(); fetchStats();
    } catch { toast.error("Erro ao atualizar saldo"); }
    finally { setUpdatingBalance(false); }
  };

  const handleUpdateFreebet = async () => {
    if (!freebetModal || !freebetAmount) return; setUpdatingFreebet(true);
    try {
      const res = await fetch(`/api/admin/users/${freebetModal.id}/freebet`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ amount: freebetAmount }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Freebet de € ${parseFloat(data.freebetBalance).toFixed(2)} atribuído!`);
      setFreebetModal(null); setFreebetAmount(""); fetchUsers();
    } catch { toast.error("Erro ao atribuir freebet"); }
    finally { setUpdatingFreebet(false); }
  };

  const handleBan = async (user: AdminUser) => {
    const newBanned = !user.banned;
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ban`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ banned: newBanned }),
      });
      if (!res.ok) { toast.error("Erro ao alterar estado"); return; }
      toast.success(newBanned ? `${user.name} banido da plataforma` : `${user.name} desbloqueado`);
      fetchUsers();
    } catch { toast.error("Erro ao banir utilizador"); }
  };

  const handleUpdateBetStatus = async (betId: number, status: string) => {
    setUpdatingBet(betId);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Aposta marcada como: ${STATUS_BET[status]?.label}`);
      fetchBets(); fetchStats();
    } catch { toast.error("Erro ao atualizar aposta"); }
    finally { setUpdatingBet(null); }
  };

  const handleUpdateWithdrawal = async (id: number, status: "approved" | "rejected") => {
    setUpdatingWithdrawal(id);
    try {
      const res = await fetch(`/api/withdrawals/admin/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ status, notes: withdrawalNotes[id] || null }),
      });
      if (!res.ok) { toast.error("Erro ao processar levantamento"); return; }
      toast.success(status === "approved" ? "Levantamento aprovado" : "Levantamento rejeitado (saldo devolvido)");
      fetchWithdrawals(); fetchStats();
    } catch { toast.error("Erro ao processar levantamento"); }
    finally { setUpdatingWithdrawal(null); }
  };

  const handleCreditPayment = async (id: number) => {
    setCreditingPayment(id);
    try {
      const res = await fetch(`/api/admin/payments/${id}/credit`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Pagamento creditado manualmente");
      fetchPayments(); fetchStats();
    } catch { toast.error("Erro ao creditar pagamento"); }
    finally { setCreditingPayment(null); }
  };

  const toggleSort = (key: keyof AdminUser) =>
    setSortUsers(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });

  const sortedUsers = [...users]
    .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortUsers.key]; const bv = b[sortUsers.key];
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortUsers.dir === "asc" ? cmp : -cmp;
    });

  const filteredBets = bets.filter(b =>
    b.matchTitle.toLowerCase().includes(betSearch.toLowerCase()) ||
    (b.userName || "").toLowerCase().includes(betSearch.toLowerCase())
  );

  const filteredPayments = payments.filter(p =>
    (p.userName || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
    (p.userEmail || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
    p.orderId.toLowerCase().includes(paymentSearch.toLowerCase())
  );

  const fmtDate = (d: string) => new Date(d).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtEur = (v: string | number) => `€ ${parseFloat(String(v)).toFixed(2)}`;

  // --- LOGIN ---
  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 dark">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
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
              <Input type="text" placeholder="admin" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-white" required autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 text-sm">Senha</Label>
              <div className="relative">
                <Input type={showPass ? "text" : "password"} placeholder="••••••••" value={loginPass}
                  onChange={e => setLoginPass(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white pr-10"
                  required autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11" disabled={loginLoading}>
              {loginLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <ShieldCheck size={16} className="mr-2" />}
              ENTRAR NO PAINEL
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  const tabs = [
    { id: "dashboard",   icon: <LayoutDashboard size={18} />, label: "Dashboard",      badge: null },
    { id: "users",       icon: <Users size={18} />,           label: "Utilizadores",   badge: null },
    { id: "bets",        icon: <ListChecks size={18} />,      label: "Apostas",        badge: stats?.bets.pending || null },
    { id: "payments",    icon: <CreditCard size={18} />,      label: "Depósitos",      badge: null },
    { id: "withdrawals", icon: <ArrowUpCircle size={18} />,   label: "Levantamentos",  badge: stats?.withdrawals.pendingCount || null },
  ];

  const tabLabel: Record<string, string> = { dashboard: "Visão Geral", users: "Utilizadores", bets: "Apostas", payments: "Depósitos", withdrawals: "Levantamentos" };

  return (
    <div className="min-h-screen bg-zinc-950 text-white dark flex">

      {/* SIDEBAR */}
      <aside className="w-16 lg:w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-zinc-800">
          <div className="font-black text-xl tracking-tighter italic hidden lg:block">
            <span className="text-white">BET</span><span className="text-red-600">62</span>
            <span className="text-xs font-normal text-zinc-500 ml-2 not-italic">Admin</span>
          </div>
          <div className="lg:hidden flex justify-center"><ShieldCheck className="text-red-500" size={22} /></div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
              {tab.icon}
              <span className="hidden lg:block flex-1 text-left">{tab.label}</span>
              {tab.badge ? (
                <span className="hidden lg:flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold">{tab.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <div className="hidden lg:block text-xs text-zinc-600 px-2 mb-2 truncate">{username}</div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <LogOut size={18} />
            <span className="hidden lg:block">Sair</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h1 className="font-bold text-lg text-white">{tabLabel[activeTab]}</h1>
          <button onClick={() => { fetchStats(); if (activeTab === "users") fetchUsers(); if (activeTab === "bets") fetchBets(); if (activeTab === "payments") fetchPayments(); if (activeTab === "withdrawals") fetchWithdrawals(); }}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={14} /><span className="hidden sm:block">Atualizar</span>
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">

            {/* ── DASHBOARD ── */}
            {activeTab === "dashboard" && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                {!stats ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <>
                    {stats.withdrawals.pendingCount > 0 && (
                      <div className="flex items-center gap-3 bg-yellow-900/20 border border-yellow-500/30 rounded-xl px-4 py-3 cursor-pointer hover:bg-yellow-900/30 transition-colors" onClick={() => setActiveTab("withdrawals")}>
                        <AlertCircle size={18} className="text-yellow-400 shrink-0" />
                        <span className="text-sm text-yellow-300 font-medium">{stats.withdrawals.pendingCount} levantamento(s) pendente(s) a aguardar aprovação — Total: {fmtEur(stats.withdrawals.pendingTotal)}</span>
                        <ChevronRight size={16} className="text-yellow-400 ml-auto shrink-0" />
                      </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<Users size={20} />} label="Utilizadores" value={stats.users.total} color="blue" />
                      <StatCard icon={<ListChecks size={20} />} label="Total de Apostas" value={stats.bets.total} sub={`${stats.bets.pending} pendentes`} color="yellow" />
                      <StatCard icon={<DollarSign size={20} />} label="Volume Apostado" value={`€ ${stats.financial.totalStaked.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`} color="green" />
                      <StatCard icon={<TrendingUp size={20} />} label="Margem da Casa" value={`${stats.financial.margin}%`} sub="sobre volume apostado" color="red" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<CreditCard size={20} />} label="Total Depositado" value={`€ ${stats.financial.totalDeposited.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`} color="purple" />
                      <StatCard icon={<CheckCircle size={20} />} label="Apostas Ganhas" value={stats.bets.won} color="green" />
                      <StatCard icon={<XCircle size={20} />} label="Apostas Perdidas" value={stats.bets.lost} color="red" />
                      <StatCard icon={<Activity size={20} />} label="Saldo Total Utilizadores" value={`€ ${stats.financial.totalUserBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`} color="blue" />
                    </div>

                    {stats.chart.length > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                          <Activity size={16} className="text-red-500" /> Volume nos últimos 7 dias
                        </h3>
                        <div className="space-y-2">
                          {stats.chart.map(row => {
                            const maxVol = Math.max(...stats.chart.map(r => parseFloat(r.volume || "0")));
                            const pct = maxVol > 0 ? (parseFloat(row.volume || "0") / maxVol) * 100 : 0;
                            return (
                              <div key={row.day} className="flex items-center gap-3 text-sm">
                                <span className="text-zinc-500 w-24 shrink-0 text-xs">{row.day}</span>
                                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.1 }}
                                    className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded" />
                                </div>
                                <span className="text-zinc-400 text-xs w-28 text-right shrink-0">{row.bets} apostas • € {parseFloat(row.volume || "0").toFixed(0)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

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
                              <motion.div initial={{ width: 0 }} animate={{ width: `${row.total > 0 ? (row.value / row.total) * 100 : 0}%` }} transition={{ duration: 0.8 }}
                                className={`h-full ${row.cls} rounded`} />
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

            {/* ── UTILIZADORES ── */}
            {activeTab === "users" && (
              <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input placeholder="Buscar por nome ou e-mail..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    className="bg-zinc-900 border-zinc-700 text-white pl-9" />
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
                              { key: "id", label: "ID" }, { key: "name", label: "Nome" },
                              { key: "email", label: "E-mail" }, { key: "balance", label: "Saldo" },
                              { key: "freebetBalance", label: "Freebet" }, { key: "kycStatus", label: "KYC" },
                              { key: "betCount", label: "Apostas" }, { key: "createdAt", label: "Cadastro" },
                            ].map(col => (
                              <th key={col.key} onClick={() => toggleSort(col.key as keyof AdminUser)}
                                className="text-left px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap">
                                <span className="flex items-center gap-1">{col.label}
                                  {sortUsers.key === col.key ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}
                                </span>
                              </th>
                            ))}
                            <th className="px-4 py-3 text-zinc-500 font-medium text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedUsers.map(user => (
                            <tr key={user.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${user.banned ? "opacity-60" : ""}`}>
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">#{user.id}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => openUserDetail(user)} className="font-medium text-white hover:text-red-400 transition-colors flex items-center gap-1">
                                    {user.name} <ChevronRight size={12} className="text-zinc-600" />
                                  </button>
                                  {user.banned && <Badge cls="bg-red-900/50 text-red-400" label="Banido" />}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-zinc-400 text-xs">{user.email}</td>
                              <td className="px-4 py-3"><span className="font-bold text-green-400">{fmtEur(user.balance)}</span></td>
                              <td className="px-4 py-3"><span className="font-medium text-purple-400">{fmtEur(user.freebetBalance)}</span></td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium ${KYC_LABELS[user.kycStatus || "not_submitted"]?.cls}`}>
                                  {KYC_LABELS[user.kycStatus || "not_submitted"]?.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-400">{user.betCount}</td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{new Date(user.createdAt).toLocaleDateString("pt-PT")}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="outline" onClick={() => { setBalanceModal(user); setBalanceAmount(""); setBalanceOp("add"); }}
                                    className="text-xs border-zinc-700 hover:bg-zinc-700 text-zinc-300 h-7 px-2" title="Ajustar saldo">
                                    <Wallet size={13} />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => { setFreebetModal(user); setFreebetAmount(""); }}
                                    className="text-xs border-purple-800 hover:bg-purple-900/40 text-purple-400 h-7 px-2" title="Atribuir freebet">
                                    <Gift size={13} />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleBan(user)}
                                    className={`text-xs h-7 px-2 ${user.banned ? "border-green-700 hover:bg-green-900/40 text-green-400" : "border-red-800 hover:bg-red-900/40 text-red-400"}`}
                                    title={user.banned ? "Desbanir" : "Banir"}>
                                    {user.banned ? <UserCheck size={13} /> : <UserX size={13} />}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => openUserDetail(user)}
                                    className="text-xs border-zinc-700 hover:bg-zinc-700 text-zinc-300 h-7 px-2" title="Ver detalhes">
                                    <FileText size={13} />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {sortedUsers.length === 0 && (
                            <tr><td colSpan={9} className="px-4 py-12 text-center text-zinc-600">Nenhum utilizador encontrado</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── APOSTAS ── */}
            {activeTab === "bets" && (
              <motion.div key="bets" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <Input placeholder="Buscar por jogo ou utilizador..." value={betSearch} onChange={e => setBetSearch(e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-white pl-9" />
                  </div>
                  <div className="flex gap-1">
                    {["all", "pending", "won", "lost", "cashed_out"].map(s => (
                      <button key={s} onClick={() => setBetStatusFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${betStatusFilter === s ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                        {s === "all" ? "Todos" : STATUS_BET[s]?.label}
                      </button>
                    ))}
                  </div>
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
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Utilizador</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Aposta</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Valor</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Ganho Pot.</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Odds</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                            <th className="text-right px-4 py-3 text-zinc-500 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBets.map(bet => (
                            <tr key={bet.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">#{bet.id}</td>
                              <td className="px-4 py-3">
                                <div className="text-white text-xs font-medium">{bet.userName || "—"}</div>
                                <div className="text-zinc-600 text-xs">{bet.userEmail || ""}</div>
                              </td>
                              <td className="px-4 py-3 max-w-48">
                                <div className="text-zinc-300 text-xs leading-tight line-clamp-2">{bet.matchTitle}</div>
                              </td>
                              <td className="px-4 py-3 font-bold text-white">{fmtEur(bet.stake)}</td>
                              <td className="px-4 py-3 font-bold text-green-400">{fmtEur(bet.potentialWin)}</td>
                              <td className="px-4 py-3 text-zinc-400">{parseFloat(bet.totalOdds).toFixed(2)}</td>
                              <td className="px-4 py-3"><Badge cls={STATUS_BET[bet.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_BET[bet.status]?.label || bet.status} /></td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(bet.createdAt)}</td>
                              <td className="px-4 py-3">
                                {bet.status === "pending" && (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button size="sm" disabled={updatingBet === bet.id} onClick={() => handleUpdateBetStatus(bet.id, "won")}
                                      className="h-7 px-2 text-xs bg-green-700 hover:bg-green-600 text-white">
                                      {updatingBet === bet.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                    </Button>
                                    <Button size="sm" disabled={updatingBet === bet.id} onClick={() => handleUpdateBetStatus(bet.id, "lost")}
                                      className="h-7 px-2 text-xs bg-red-800 hover:bg-red-700 text-white">
                                      {updatingBet === bet.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                                    </Button>
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

            {/* ── DEPÓSITOS ── */}
            {activeTab === "payments" && (
              <motion.div key="payments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input placeholder="Buscar por utilizador, e-mail ou ID de ordem..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)}
                    className="bg-zinc-900 border-zinc-700 text-white pl-9" />
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
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Utilizador</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Método</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Valor</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Referência</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Data</th>
                            <th className="text-right px-4 py-3 text-zinc-500 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map(p => (
                            <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">#{p.id}</td>
                              <td className="px-4 py-3">
                                <div className="text-white text-xs font-medium">{p.userName || "—"}</div>
                                <div className="text-zinc-600 text-xs">{p.userEmail}</div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge cls="bg-zinc-800 text-zinc-300" label={METHOD_LABEL[p.method] || p.method} />
                              </td>
                              <td className="px-4 py-3 font-bold text-green-400">{fmtEur(p.amount)}</td>
                              <td className="px-4 py-3 text-zinc-500 text-xs font-mono">
                                {p.entity && p.reference ? `${p.entity} / ${p.reference}` : p.orderId.slice(0, 16) + "…"}
                              </td>
                              <td className="px-4 py-3"><Badge cls={STATUS_PAYMENT[p.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_PAYMENT[p.status]?.label || p.status} /></td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                              <td className="px-4 py-3 text-right">
                                {p.status === "pending" && (
                                  <Button size="sm" disabled={creditingPayment === p.id} onClick={() => handleCreditPayment(p.id)}
                                    className="h-7 px-2 text-xs bg-green-700 hover:bg-green-600 text-white">
                                    {creditingPayment === p.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                                    Creditar
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredPayments.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-600">Nenhum depósito encontrado</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── LEVANTAMENTOS ── */}
            {activeTab === "withdrawals" && (
              <motion.div key="withdrawals" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <div className="space-y-3">
                    {withdrawals.map(w => (
                      <div key={w.id} className={`bg-zinc-900 border rounded-xl p-5 ${w.status === "pending" ? "border-yellow-500/30" : "border-zinc-800"}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-white">{w.userName || `Utilizador #${w.userId}`}</span>
                              <Badge cls={STATUS_WITHDRAWAL[w.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_WITHDRAWAL[w.status]?.label || w.status} />
                            </div>
                            <div className="text-zinc-500 text-xs">{w.userEmail}</div>
                            <div className="text-2xl font-black text-white mt-2">{fmtEur(w.amount)}</div>
                            <div className="text-xs text-zinc-500 mt-1">
                              <span className="font-mono">{w.iban}</span> • {w.holderName} • NIF {w.nif}
                            </div>
                            <div className="text-xs text-zinc-600">{fmtDate(w.createdAt)}</div>
                            {w.notes && <div className="text-xs text-zinc-400 mt-1 italic">Nota: {w.notes}</div>}
                          </div>
                          {w.status === "pending" && (
                            <div className="flex flex-col gap-2 min-w-48">
                              <textarea
                                placeholder="Nota opcional..."
                                value={withdrawalNotes[w.id] || ""}
                                onChange={e => setWithdrawalNotes(prev => ({ ...prev, [w.id]: e.target.value }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 p-2 resize-none h-16 focus:outline-none focus:border-zinc-500"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" disabled={updatingWithdrawal === w.id} onClick={() => handleUpdateWithdrawal(w.id, "approved")}
                                  className="flex-1 h-8 text-xs bg-green-700 hover:bg-green-600 text-white">
                                  {updatingWithdrawal === w.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                                  Aprovar
                                </Button>
                                <Button size="sm" disabled={updatingWithdrawal === w.id} onClick={() => handleUpdateWithdrawal(w.id, "rejected")}
                                  className="flex-1 h-8 text-xs bg-red-800 hover:bg-red-700 text-white">
                                  {updatingWithdrawal === w.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <XCircle size={12} className="mr-1" />}
                                  Rejeitar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {withdrawals.length === 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center text-zinc-600">Nenhum levantamento encontrado</div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* ── MODAL: Ajustar Saldo ── */}
      <AnimatePresence>
        {balanceModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setBalanceModal(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white">Ajustar Saldo</h2>
                <button onClick={() => setBalanceModal(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
                <div className="text-sm text-zinc-400">{balanceModal.name}</div>
                <div className="text-xl font-black text-green-400">{fmtEur(balanceModal.balance)}</div>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["add", "subtract", "set"] as const).map(op => (
                    <button key={op} onClick={() => setBalanceOp(op)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${balanceOp === op ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                      {op === "add" ? "Adicionar" : op === "subtract" ? "Subtrair" : "Definir"}
                    </button>
                  ))}
                </div>
                <Input type="number" step="0.01" min="0" placeholder="Valor em €"
                  value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white" />
                <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold" disabled={updatingBalance || !balanceAmount} onClick={handleUpdateBalance}>
                  {updatingBalance ? <Loader2 className="animate-spin mr-2" size={16} /> : <Wallet size={16} className="mr-2" />}
                  Confirmar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Freebet ── */}
      <AnimatePresence>
        {freebetModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setFreebetModal(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2"><Gift size={18} className="text-purple-400" /> Atribuir Freebet</h2>
                <button onClick={() => setFreebetModal(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
                <div className="text-sm text-zinc-400">{freebetModal.name}</div>
                <div className="text-sm text-purple-400">Freebet atual: {fmtEur(freebetModal.freebetBalance)}</div>
              </div>
              <div className="space-y-3">
                <Input type="number" step="0.01" min="0.01" placeholder="Valor do freebet em €"
                  value={freebetAmount} onChange={e => setFreebetAmount(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white" />
                <Button className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold" disabled={updatingFreebet || !freebetAmount} onClick={handleUpdateFreebet}>
                  {updatingFreebet ? <Loader2 className="animate-spin mr-2" size={16} /> : <Gift size={16} className="mr-2" />}
                  Atribuir Freebet
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Detalhe do Utilizador ── */}
      <AnimatePresence>
        {(detailLoading || detailModal) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => { setDetailModal(null); }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
                <h2 className="font-bold text-white">{detailModal ? detailModal.user.name : "A carregar…"}</h2>
                <button onClick={() => setDetailModal(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>

              {detailLoading && <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-red-600" size={32} /></div>}

              {detailModal && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-zinc-800 shrink-0">
                    <div className="bg-zinc-800 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Saldo</div>
                      <div className="font-bold text-green-400">{fmtEur(detailModal.user.balance)}</div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Freebet</div>
                      <div className="font-bold text-purple-400">{fmtEur(detailModal.user.freebetBalance)}</div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Apostas</div>
                      <div className="font-bold text-white">{detailModal.bets.length}</div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Depósitos</div>
                      <div className="font-bold text-white">{detailModal.payments.filter(p => p.status === "completed").length}</div>
                    </div>
                  </div>

                  <div className="flex gap-1 px-5 pt-4 shrink-0">
                    {(["bets", "payments", "withdrawals"] as const).map(t => (
                      <button key={t} onClick={() => setDetailTab(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab === t ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                        {t === "bets" ? `Apostas (${detailModal.bets.length})` : t === "payments" ? `Depósitos (${detailModal.payments.length})` : `Levantamentos (${detailModal.withdrawals.length})`}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-auto p-5">
                    {detailTab === "bets" && (
                      <div className="space-y-2">
                        {detailModal.bets.map(b => (
                          <div key={b.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3 text-sm">
                            <Badge cls={STATUS_BET[b.status]?.cls || "bg-zinc-700 text-zinc-400"} label={STATUS_BET[b.status]?.label || b.status} />
                            <span className="flex-1 text-zinc-300 text-xs line-clamp-1">{b.matchTitle}</span>
                            <span className="font-bold text-white shrink-0">{fmtEur(b.stake)}</span>
                            <span className="text-green-400 shrink-0">{fmtEur(b.potentialWin)}</span>
                            <span className="text-zinc-600 text-xs shrink-0">{fmtDate(b.createdAt)}</span>
                          </div>
                        ))}
                        {detailModal.bets.length === 0 && <div className="text-center text-zinc-600 py-8">Sem apostas</div>}
                      </div>
                    )}
                    {detailTab === "payments" && (
                      <div className="space-y-2">
                        {detailModal.payments.map(p => (
                          <div key={p.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3 text-sm">
                            <Badge cls={STATUS_PAYMENT[p.status]?.cls || "bg-zinc-700 text-zinc-400"} label={STATUS_PAYMENT[p.status]?.label || p.status} />
                            <Badge cls="bg-zinc-700 text-zinc-300" label={METHOD_LABEL[p.method] || p.method} />
                            <span className="flex-1 text-zinc-500 text-xs font-mono">{p.reference ? `Ref: ${p.reference}` : p.orderId.slice(0, 20)}</span>
                            <span className="font-bold text-green-400 shrink-0">{fmtEur(p.amount)}</span>
                            <span className="text-zinc-600 text-xs shrink-0">{fmtDate(p.createdAt)}</span>
                          </div>
                        ))}
                        {detailModal.payments.length === 0 && <div className="text-center text-zinc-600 py-8">Sem depósitos</div>}
                      </div>
                    )}
                    {detailTab === "withdrawals" && (
                      <div className="space-y-2">
                        {detailModal.withdrawals.map(w => (
                          <div key={w.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3 text-sm">
                            <Badge cls={STATUS_WITHDRAWAL[w.status]?.cls || "bg-zinc-700 text-zinc-400"} label={STATUS_WITHDRAWAL[w.status]?.label || w.status} />
                            <span className="flex-1 text-zinc-500 text-xs font-mono">{w.iban}</span>
                            <span className="font-bold text-white shrink-0">{fmtEur(w.amount)}</span>
                            <span className="text-zinc-600 text-xs shrink-0">{fmtDate(w.createdAt)}</span>
                          </div>
                        ))}
                        {detailModal.withdrawals.length === 0 && <div className="text-center text-zinc-600 py-8">Sem levantamentos</div>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
