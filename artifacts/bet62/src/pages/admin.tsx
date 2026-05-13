import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, ListChecks, LogOut, Loader2,
  TrendingUp, DollarSign, Activity, Trophy, Search,
  ChevronUp, ChevronDown, CheckCircle, XCircle,
  RefreshCw, Eye, EyeOff, ShieldCheck, ArrowUpCircle,
  Gift, CreditCard, AlertCircle, ChevronRight, X,
  Wallet, FileText, UserX, UserCheck, Download,
  BarChart2, ShieldAlert, Zap, Settings, Calendar,
  Ban, AlertTriangle, WifiOff, Wifi, Clock, Lock, Unlock,
  PlusCircle, Trash2, Radio
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
  kycDocumentType?: string | null; kycDocumentNumber?: string | null; kycSubmittedAt?: string | null;
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

type RiskData = {
  summary: { pendingBets: number; totalPendingStake: number; totalLiability: number; highExposureCount: number };
  exposureByMatch: Array<{ match_title: string; match_id: string; bet_count: string; total_staked: string; total_liability: string }>;
  bigBets: Array<{ id: number; matchTitle: string; stake: string; potentialWin: string; totalOdds: string; status: string; createdAt: string; userName: string | null; userEmail: string | null }>;
  sharpBettors: Array<{ id: number; name: string; email: string; settled: string; won: string; total_staked: string; total_won: string }>;
};

type AnalyticsData = {
  kpis: { turnover: number; ggr: number; ngr: number; hold: string; totalDeposited: number; bonusCost: number; activeUsers7d: number };
  daily: Array<{ day: string; bets: string; turnover: string; paid_out: string; ggr: string }>;
  byStatus: Array<{ status: string; count: string; volume: string }>;
  topDepositors: Array<{ name: string; email: string; deposits: string; total: string }>;
};

type SuspendedMatch = {
  id: number; matchId: string; matchTitle: string; sport: string; reason: string | null; createdAt: string;
};

type AuditLog = {
  id: number; action: string; adminUser: string; targetType: string | null; targetId: string | null;
  details: unknown; ip: string | null; createdAt: string;
};

type FeedStatus = {
  overall: "ok" | "degraded";
  endpoints: Array<{ name: string; status: string; statusCode: number; latency: number }>;
  checkedAt: string;
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

const SPORT_LABEL: Record<string, string> = {
  football: "Futebol", basketball: "Basquete", tennis: "Ténis", hockey: "Hóquei", volleyball: "Voleibol"
};

const SETTING_META: Record<string, { label: string; desc: string; type: "number" | "text" | "boolean"; unit?: string }> = {
  max_bet:            { label: "Aposta Máxima",       desc: "Valor máximo por aposta",             type: "number", unit: "€" },
  min_bet:            { label: "Aposta Mínima",        desc: "Valor mínimo por aposta",             type: "number", unit: "€" },
  max_odds:           { label: "Odds Máximas",          desc: "Odd máxima aceite em aposta",         type: "number" },
  live_delay:         { label: "Atraso Live (s)",       desc: "Segundos de atraso no feed ao vivo",  type: "number", unit: "s" },
  default_margin:     { label: "Margem Padrão",         desc: "Margem da casa (0.06 = 6%)",          type: "number" },
  bet_limits_enabled: { label: "Limites Ativos",        desc: "Ativar/desativar limites de aposta",  type: "boolean" },
  sports_enabled:     { label: "Desportos Ativos",      desc: "Lista separada por vírgulas",         type: "text" },
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  settings_update: "Configuração alterada",
  suspend_match:   "Evento suspenso",
  unsuspend_match: "Evento reativado",
};

function StatCard({ icon, label, value, sub, color = "red", alert }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  color?: "red" | "green" | "blue" | "yellow" | "purple" | "orange"; alert?: boolean;
}) {
  const colors = { red: "text-red-500", green: "text-green-500", blue: "text-blue-400", yellow: "text-yellow-400", purple: "text-purple-400", orange: "text-orange-400" };
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

type TabId = "dashboard" | "users" | "bets" | "payments" | "withdrawals" | "risk" | "analytics" | "events" | "settings";

const ADMIN_VERSION = "v2.1";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("admin_token"));
  const [username, setUsername] = useState<string>(() => sessionStorage.getItem("admin_username") || "");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Force full reload when browser has stale cached JS
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_version");
    sessionStorage.setItem("admin_version", ADMIN_VERSION);
    if (stored !== null && stored !== ADMIN_VERSION) {
      window.location.reload();
    }
  }, []);

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Core data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(false);

  // Pro data
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [suspendedMatches, setSuspendedMatches] = useState<SuspendedMatch[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [suspendForm, setSuspendForm] = useState({ matchId: "", matchTitle: "", sport: "football", reason: "" });
  const [suspending, setSuspending] = useState(false);
  const [unsuspending, setUnsuspending] = useState<string | null>(null);
  const [savingSetting, setSavingSetting] = useState<string | null>(null);

  // Filters/UI
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

  const [exportType, setExportType] = useState<"bets" | "deposits" | "withdrawals">("bets");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);

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

  const fetchRisk = useCallback(async () => {
    if (!token) return; setLoading(true);
    try { const res = await fetch("/api/admin/risk", { headers: authHeader }); if (res.ok) setRiskData(await res.json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(async () => {
    if (!token) return; setLoading(true);
    try { const res = await fetch("/api/admin/analytics", { headers: authHeader }); if (res.ok) setAnalyticsData(await res.json()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSuspended = useCallback(async () => {
    if (!token) return;
    try { const res = await fetch("/api/admin/events/suspended", { headers: authHeader }); if (res.ok) setSuspendedMatches(await res.json()); }
    catch { /* ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/settings", { headers: authHeader });
      if (res.ok) { const d = await res.json(); setSettings(d); setSettingsDraft(d); }
    }
    catch { /* ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAuditLogs = useCallback(async () => {
    if (!token) return;
    try { const res = await fetch("/api/admin/audit", { headers: authHeader }); if (res.ok) setAuditLogs(await res.json()); }
    catch { /* ignore */ }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeed = useCallback(async () => {
    if (!token) return; setFeedLoading(true);
    try { const res = await fetch("/api/admin/feed", { headers: authHeader }); if (res.ok) setFeedStatus(await res.json()); }
    catch { /* ignore */ } finally { setFeedLoading(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    fetchStats();
    if (activeTab === "users") fetchUsers();
    else if (activeTab === "bets") fetchBets();
    else if (activeTab === "payments") fetchPayments();
    else if (activeTab === "withdrawals") fetchWithdrawals();
    else if (activeTab === "risk") fetchRisk();
    else if (activeTab === "analytics") fetchAnalytics();
    else if (activeTab === "events") { fetchSuspended(); fetchFeed(); }
    else if (activeTab === "settings") { fetchSettings(); fetchAuditLogs(); }
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ type: exportType });
      if (exportFrom) params.set("from", exportFrom);
      if (exportTo) params.set("to", exportTo);
      const res = await fetch(`/api/admin/export?${params.toString()}`, { headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error || "Erro ao exportar");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `bet62_${exportType}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório CSV exportado com sucesso!");
    } catch { toast.error("Erro ao exportar relatório"); }
    finally { setExporting(false); }
  };

  const handleSuspendMatch = async () => {
    if (!suspendForm.matchId || !suspendForm.matchTitle) { toast.error("ID e nome do evento são obrigatórios"); return; }
    setSuspending(true);
    try {
      const res = await fetch("/api/admin/events/suspend", {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(suspendForm),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Evento suspenso com sucesso");
      setSuspendForm({ matchId: "", matchTitle: "", sport: "football", reason: "" });
      fetchSuspended();
    } catch { toast.error("Erro ao suspender evento"); }
    finally { setSuspending(false); }
  };

  const handleUnsuspend = async (matchId: string) => {
    setUnsuspending(matchId);
    try {
      const res = await fetch(`/api/admin/events/suspend/${encodeURIComponent(matchId)}`, { method: "DELETE", headers: authHeader });
      if (!res.ok) { toast.error("Erro ao reativar evento"); return; }
      toast.success("Evento reativado");
      fetchSuspended();
    } catch { toast.error("Erro ao reativar evento"); }
    finally { setUnsuspending(null); }
  };

  const handleSaveSetting = async (key: string) => {
    const value = settingsDraft[key];
    if (value === undefined) return;
    setSavingSetting(key);
    try {
      const res = await fetch(`/api/admin/settings/${key}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) { toast.error("Erro ao guardar configuração"); return; }
      toast.success("Configuração guardada");
      setSettings(prev => ({ ...prev, [key]: value }));
      fetchAuditLogs();
    } catch { toast.error("Erro ao guardar configuração"); }
    finally { setSavingSetting(null); }
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

  const refreshCurrentTab = () => {
    fetchStats();
    if (activeTab === "users") fetchUsers();
    else if (activeTab === "bets") fetchBets();
    else if (activeTab === "payments") fetchPayments();
    else if (activeTab === "withdrawals") fetchWithdrawals();
    else if (activeTab === "risk") fetchRisk();
    else if (activeTab === "analytics") fetchAnalytics();
    else if (activeTab === "events") { fetchSuspended(); fetchFeed(); }
    else if (activeTab === "settings") { fetchSettings(); fetchAuditLogs(); }
  };

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
              <Label className="text-zinc-400 text-sm">Utilizador</Label>
              <Input type="text" placeholder="admin" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-white" required autoComplete="off" />
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

  const tabs: Array<{ id: TabId; icon: React.ReactNode; label: string; badge?: number | null; section?: string }> = [
    { id: "dashboard",   icon: <LayoutDashboard size={18} />, label: "Dashboard",      section: "core" },
    { id: "users",       icon: <Users size={18} />,           label: "Utilizadores",   section: "core" },
    { id: "bets",        icon: <ListChecks size={18} />,      label: "Apostas",        badge: stats?.bets.pending || null, section: "core" },
    { id: "payments",    icon: <CreditCard size={18} />,      label: "Depósitos",      section: "core" },
    { id: "withdrawals", icon: <ArrowUpCircle size={18} />,   label: "Levantamentos",  badge: stats?.withdrawals.pendingCount || null, section: "core" },
    { id: "risk",        icon: <ShieldAlert size={18} />,     label: "Risco",          section: "pro" },
    { id: "analytics",   icon: <BarChart2 size={18} />,       label: "Analytics",      section: "pro" },
    { id: "events",      icon: <Zap size={18} />,             label: "Eventos",        section: "pro" },
    { id: "settings",    icon: <Settings size={18} />,        label: "Configurações",  section: "pro" },
  ];

  const tabLabel: Record<TabId, string> = {
    dashboard: "Visão Geral", users: "Utilizadores", bets: "Apostas",
    payments: "Depósitos", withdrawals: "Levantamentos",
    risk: "Gestão de Risco", analytics: "Analytics", events: "Controlo de Eventos", settings: "Configurações",
  };

  const switchTab = (tab: TabId) => { setActiveTab(tab); setMobileSidebarOpen(false); };

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="font-black text-xl tracking-tighter italic">
          <span className="text-white">BET</span><span className="text-red-600">62</span>
          <span className="text-xs font-normal text-zinc-500 ml-2 not-italic">Admin</span>
          <span className="text-[10px] font-bold text-red-500 ml-1 not-italic bg-red-900/30 px-1 rounded">{ADMIN_VERSION}</span>
        </div>
        <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden text-zinc-500 hover:text-white p-1"><X size={18} /></button>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        <div className="text-xs text-zinc-600 px-3 pt-2 pb-1 font-semibold uppercase tracking-wider">Operações</div>
        {tabs.filter(t => t.section === "core").map(tab => (
          <button key={tab.id} onClick={() => switchTab(tab.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
            {tab.icon}
            <span className="flex-1 text-left">{tab.label}</span>
            {tab.badge ? (
              <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold">{tab.badge}</span>
            ) : null}
          </button>
        ))}
        <div className="text-xs text-zinc-600 px-3 pt-3 pb-1 font-semibold uppercase tracking-wider border-t border-zinc-800/60 mt-1">Avançado</div>
        {tabs.filter(t => t.section === "pro").map(tab => (
          <button key={tab.id} onClick={() => switchTab(tab.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-600/20 text-red-400 border border-red-500/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
            {tab.icon}
            <span className="flex-1 text-left">{tab.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-zinc-800">
        <div className="text-xs text-zinc-600 px-2 mb-2 truncate">{username}</div>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white dark flex">

      {/* MOBILE DRAWER OVERLAY */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.aside initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col md:hidden">
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-56 bg-zinc-900 border-r border-zinc-800 flex-col shrink-0 sticky top-0 h-screen overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden text-zinc-400 hover:text-white p-1 -ml-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="font-bold text-base sm:text-lg text-white truncate">{tabLabel[activeTab]}</h1>
          </div>
          <button onClick={refreshCurrentTab} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors shrink-0">
            <RefreshCw size={14} /><span className="hidden sm:block">Atualizar</span>
          </button>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-900 border-t border-zinc-800 flex md:hidden">
          {[
            { id: "dashboard" as TabId, icon: <LayoutDashboard size={20} />, label: "Início" },
            { id: "users" as TabId, icon: <Users size={20} />, label: "Users" },
            { id: "bets" as TabId, icon: <ListChecks size={20} />, label: "Apostas", badge: stats?.bets.pending },
            { id: "payments" as TabId, icon: <CreditCard size={20} />, label: "Depósitos" },
            { id: "withdrawals" as TabId, icon: <ArrowUpCircle size={20} />, label: "Levant.", badge: stats?.withdrawals.pendingCount },
          ].map(item => (
            <button key={item.id} onClick={() => switchTab(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${activeTab === item.id ? "text-red-400" : "text-zinc-500"}`}>
              {item.badge ? (
                <span className="absolute top-1.5 right-[calc(50%-8px)] flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold">{item.badge}</span>
              ) : null}
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setMobileSidebarOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-zinc-500">
            <Settings size={20} />
            <span>Mais</span>
          </button>
        </nav>

        <div className="p-3 sm:p-6">
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
                              <div key={row.day} className="flex items-center gap-2 text-sm">
                                <span className="text-zinc-500 w-16 sm:w-24 shrink-0 text-xs truncate">{row.day}</span>
                                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden min-w-0">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.1 }}
                                    className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded" />
                                </div>
                                <span className="text-zinc-400 text-xs shrink-0 text-right">
                                  <span className="hidden sm:inline">{row.bets} apostas • </span>€ {parseFloat(row.volume || "0").toFixed(0)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                          <Download size={16} className="text-red-500" /> Exportar Relatório CSV
                        </h3>
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-1">
                            {([
                              { value: "bets", label: "Apostas" },
                              { value: "deposits", label: "Depósitos" },
                              { value: "withdrawals", label: "Levantamentos" },
                            ] as const).map(opt => (
                              <button key={opt.value} onClick={() => setExportType(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${exportType === opt.value ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <Label className="text-zinc-500 text-xs mb-1 block">De</Label>
                              <Input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-white text-xs h-8 w-full" />
                            </div>
                            <div className="flex-1">
                              <Label className="text-zinc-500 text-xs mb-1 block">Até</Label>
                              <Input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-white text-xs h-8 w-full" />
                            </div>
                          </div>
                          <Button onClick={handleExport} disabled={exporting}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 px-4 text-xs">
                            {exporting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}
                            Exportar CSV
                          </Button>
                        </div>
                        <p className="text-xs text-zinc-600 mt-2">Sem datas exporta todos os registos. Inclui BOM UTF-8 para Excel.</p>
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
                            <th onClick={() => toggleSort("id")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden sm:table-cell">
                              <span className="flex items-center gap-1">ID {sortUsers.key === "id" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("name")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap">
                              <span className="flex items-center gap-1">Nome {sortUsers.key === "name" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("email")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden md:table-cell">
                              <span className="flex items-center gap-1">E-mail {sortUsers.key === "email" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("balance")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap">
                              <span className="flex items-center gap-1">Saldo {sortUsers.key === "balance" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("freebetBalance")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden lg:table-cell">
                              <span className="flex items-center gap-1">Freebet {sortUsers.key === "freebetBalance" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("kycStatus")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden sm:table-cell">
                              <span className="flex items-center gap-1">KYC {sortUsers.key === "kycStatus" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("betCount")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden md:table-cell">
                              <span className="flex items-center gap-1">Apostas {sortUsers.key === "betCount" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th onClick={() => toggleSort("createdAt")} className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden lg:table-cell">
                              <span className="flex items-center gap-1">Cadastro {sortUsers.key === "createdAt" ? sortUsers.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : null}</span>
                            </th>
                            <th className="px-3 sm:px-4 py-3 text-zinc-500 font-medium text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedUsers.map(user => (
                            <tr key={user.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${user.banned ? "opacity-60" : ""}`}>
                              <td className="px-3 sm:px-4 py-3 text-zinc-600 font-mono text-xs hidden sm:table-cell">#{user.id}</td>
                              <td className="px-3 sm:px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button onClick={() => openUserDetail(user)} className="font-medium text-white hover:text-red-400 transition-colors flex items-center gap-1">
                                    {user.name} <ChevronRight size={12} className="text-zinc-600" />
                                  </button>
                                  {user.banned && <Badge cls="bg-red-900/50 text-red-400" label="Banido" />}
                                  <span className="text-xs text-zinc-500 md:hidden">{user.email}</span>
                                </div>
                              </td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{user.email}</td>
                              <td className="px-3 sm:px-4 py-3"><span className="font-bold text-green-400">{fmtEur(user.balance)}</span></td>
                              <td className="px-3 sm:px-4 py-3 hidden lg:table-cell"><span className="font-medium text-purple-400">{fmtEur(user.freebetBalance)}</span></td>
                              <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                                <span className={`text-xs font-medium ${KYC_LABELS[user.kycStatus || "not_submitted"]?.cls}`}>
                                  {KYC_LABELS[user.kycStatus || "not_submitted"]?.label}
                                </span>
                              </td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-400 hidden md:table-cell">{user.betCount}</td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-500 text-xs whitespace-nowrap hidden lg:table-cell">{new Date(user.createdAt).toLocaleDateString("pt-PT")}</td>
                              <td className="px-3 sm:px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="outline" onClick={() => { setBalanceModal(user); setBalanceAmount(""); setBalanceOp("add"); }}
                                    className="text-xs border-zinc-700 hover:bg-zinc-700 text-zinc-300 h-7 px-2" title="Ajustar saldo">
                                    <Wallet size={13} />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => { setFreebetModal(user); setFreebetAmount(""); }}
                                    className="text-xs border-purple-800 hover:bg-purple-900/40 text-purple-400 h-7 px-2" title="Freebet">
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
                  <div className="flex gap-1 flex-wrap">
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
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden sm:table-cell">ID</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden sm:table-cell">Utilizador</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Aposta</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Valor</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Ganho Pot.</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Odds</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Status</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Data</th>
                            <th className="text-right px-3 sm:px-4 py-3 text-zinc-500 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBets.map(bet => (
                            <tr key={bet.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-3 sm:px-4 py-3 text-zinc-600 font-mono text-xs hidden sm:table-cell">#{bet.id}</td>
                              <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                                <div className="text-white text-xs font-medium">{bet.userName || "—"}</div>
                                <div className="text-zinc-600 text-xs">{bet.userEmail || ""}</div>
                              </td>
                              <td className="px-3 sm:px-4 py-3 max-w-[160px] sm:max-w-48">
                                <div className="text-zinc-300 text-xs leading-tight line-clamp-2">{bet.matchTitle}</div>
                                <div className="text-zinc-600 text-xs mt-0.5 sm:hidden">{bet.userName || "—"}</div>
                              </td>
                              <td className="px-3 sm:px-4 py-3 font-bold text-white">{fmtEur(bet.stake)}</td>
                              <td className="px-3 sm:px-4 py-3 font-bold text-green-400 hidden md:table-cell">{fmtEur(bet.potentialWin)}</td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-400 hidden md:table-cell">{parseFloat(bet.totalOdds).toFixed(2)}</td>
                              <td className="px-3 sm:px-4 py-3"><Badge cls={STATUS_BET[bet.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_BET[bet.status]?.label || bet.status} /></td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-500 text-xs whitespace-nowrap hidden lg:table-cell">{fmtDate(bet.createdAt)}</td>
                              <td className="px-3 sm:px-4 py-3">
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
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden sm:table-cell">ID</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Utilizador</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden sm:table-cell">Método</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Valor</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden lg:table-cell">Referência</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium">Status</th>
                            <th className="text-left px-3 sm:px-4 py-3 text-zinc-500 font-medium hidden md:table-cell">Data</th>
                            <th className="text-right px-3 sm:px-4 py-3 text-zinc-500 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map(p => (
                            <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-3 sm:px-4 py-3 text-zinc-600 font-mono text-xs hidden sm:table-cell">#{p.id}</td>
                              <td className="px-3 sm:px-4 py-3">
                                <div className="text-white text-xs font-medium">{p.userName || "—"}</div>
                                <div className="text-zinc-600 text-xs">{p.userEmail}</div>
                                <div className="mt-0.5 sm:hidden"><Badge cls="bg-zinc-800 text-zinc-300" label={METHOD_LABEL[p.method] || p.method} /></div>
                              </td>
                              <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                                <Badge cls="bg-zinc-800 text-zinc-300" label={METHOD_LABEL[p.method] || p.method} />
                              </td>
                              <td className="px-3 sm:px-4 py-3 font-bold text-green-400">{fmtEur(p.amount)}</td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-500 text-xs font-mono hidden lg:table-cell">
                                {p.entity && p.reference ? `${p.entity} / ${p.reference}` : p.orderId.slice(0, 16) + "…"}
                              </td>
                              <td className="px-3 sm:px-4 py-3"><Badge cls={STATUS_PAYMENT[p.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_PAYMENT[p.status]?.label || p.status} /></td>
                              <td className="px-3 sm:px-4 py-3 text-zinc-500 text-xs whitespace-nowrap hidden md:table-cell">{fmtDate(p.createdAt)}</td>
                              <td className="px-3 sm:px-4 py-3 text-right">
                                {p.status === "pending" && (
                                  <Button size="sm" disabled={creditingPayment === p.id} onClick={() => handleCreditPayment(p.id)}
                                    className="h-7 px-2 text-xs bg-green-700 hover:bg-green-600 text-white">
                                    {creditingPayment === p.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                                    <span className="hidden sm:inline">Creditar</span>
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

            {/* ── RISCO ── */}
            {activeTab === "risk" && (
              <motion.div key="risk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                {loading || !riskData ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<ListChecks size={20} />} label="Apostas Pendentes" value={riskData.summary.pendingBets} color="yellow" />
                      <StatCard icon={<DollarSign size={20} />} label="Volume em Risco" value={fmtEur(riskData.summary.totalPendingStake)} color="blue" />
                      <StatCard icon={<TrendingUp size={20} />} label="Passivo Total" value={fmtEur(riskData.summary.totalLiability)} color="red" alert={riskData.summary.totalLiability > 5000} />
                      <StatCard icon={<AlertTriangle size={20} />} label="Eventos Críticos" value={riskData.summary.highExposureCount} sub="passivo > € 500" color="orange" alert={riskData.summary.highExposureCount > 0} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                          <ShieldAlert size={16} className="text-red-500" />
                          <span className="font-bold text-sm text-zinc-300">Exposição por Evento</span>
                          <span className="ml-auto text-xs text-zinc-600">Top 20</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-zinc-800 bg-zinc-950/30">
                                <th className="text-left px-4 py-2 text-zinc-500">Evento</th>
                                <th className="text-right px-4 py-2 text-zinc-500">Apostas</th>
                                <th className="text-right px-4 py-2 text-zinc-500">Volume</th>
                                <th className="text-right px-4 py-2 text-zinc-500">Passivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {riskData.exposureByMatch.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-600">Sem apostas pendentes</td></tr>
                              ) : riskData.exposureByMatch.map((row, i) => {
                                const liability = parseFloat(row.total_liability || "0");
                                const isHigh = liability > 500;
                                return (
                                  <tr key={i} className={`border-b border-zinc-800/40 hover:bg-zinc-800/20 ${isHigh ? "bg-red-900/10" : ""}`}>
                                    <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-1.5">
                                        {isHigh && <AlertTriangle size={11} className="text-red-500 shrink-0" />}
                                        <span className="text-zinc-300 line-clamp-1">{row.match_title}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-zinc-400">{row.bet_count}</td>
                                    <td className="px-4 py-2.5 text-right text-zinc-400">{fmtEur(row.total_staked)}</td>
                                    <td className={`px-4 py-2.5 text-right font-bold ${isHigh ? "text-red-400" : "text-zinc-300"}`}>{fmtEur(row.total_liability)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                            <DollarSign size={16} className="text-yellow-500" />
                            <span className="font-bold text-sm text-zinc-300">Maiores Apostas</span>
                          </div>
                          <div className="divide-y divide-zinc-800">
                            {riskData.bigBets.slice(0, 8).map(bet => (
                              <div key={bet.id} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-zinc-300 line-clamp-1">{bet.matchTitle}</div>
                                  <div className="text-xs text-zinc-600">{bet.userName || "—"}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-white text-sm">{fmtEur(bet.stake)}</div>
                                  <div className="text-xs text-green-400">→ {fmtEur(bet.potentialWin)}</div>
                                </div>
                                <Badge cls={STATUS_BET[bet.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_BET[bet.status]?.label || bet.status} />
                              </div>
                            ))}
                            {riskData.bigBets.length === 0 && <div className="px-4 py-8 text-center text-zinc-600 text-xs">Sem apostas</div>}
                          </div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                            <Trophy size={16} className="text-orange-400" />
                            <span className="font-bold text-sm text-zinc-300">Apostadores Sharp</span>
                            <span className="ml-auto text-xs text-zinc-600">&gt;55% win rate</span>
                          </div>
                          <div className="divide-y divide-zinc-800">
                            {riskData.sharpBettors.length === 0 ? (
                              <div className="px-4 py-8 text-center text-zinc-600 text-xs">Nenhum apostador sharp identificado</div>
                            ) : riskData.sharpBettors.map((b, i) => {
                              const winRate = parseInt(b.settled) > 0 ? Math.round((parseInt(b.won) / parseInt(b.settled)) * 100) : 0;
                              return (
                                <div key={i} className="px-4 py-3 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-zinc-300 font-medium">{b.name}</div>
                                    <div className="text-xs text-zinc-600">{b.email}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-sm font-bold text-orange-400">{winRate}%</div>
                                    <div className="text-xs text-zinc-500">{b.won}/{b.settled} ganhas</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ── ANALYTICS ── */}
            {activeTab === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                {loading || !analyticsData ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32} /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<DollarSign size={20} />} label="Turnover Total" value={fmtEur(analyticsData.kpis.turnover)} color="blue" />
                      <StatCard icon={<TrendingUp size={20} />} label="GGR (Receita Bruta)" value={fmtEur(analyticsData.kpis.ggr)} color={analyticsData.kpis.ggr >= 0 ? "green" : "red"} sub={`${analyticsData.kpis.hold}% hold`} />
                      <StatCard icon={<BarChart2 size={20} />} label="NGR (Receita Líquida)" value={fmtEur(analyticsData.kpis.ngr)} color={analyticsData.kpis.ngr >= 0 ? "green" : "red"} />
                      <StatCard icon={<Users size={20} />} label="Utilizadores Ativos 7d" value={analyticsData.kpis.activeUsers7d} color="purple" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard icon={<CreditCard size={20} />} label="Total Depositado" value={fmtEur(analyticsData.kpis.totalDeposited)} color="blue" />
                      <StatCard icon={<Gift size={20} />} label="Custo em Freebets" value={fmtEur(analyticsData.kpis.bonusCost)} color="purple" />
                      <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <div className="text-xs text-zinc-500 mb-2">Distribuição por Status</div>
                        <div className="space-y-2">
                          {analyticsData.byStatus.map(row => {
                            const total = analyticsData.byStatus.reduce((s, r) => s + parseInt(r.count), 0);
                            const pct = total > 0 ? (parseInt(row.count) / total) * 100 : 0;
                            return (
                              <div key={row.status} className="flex items-center gap-2 text-xs">
                                <span className="text-zinc-400 w-20 shrink-0">{STATUS_BET[row.status]?.label || row.status}</span>
                                <div className="flex-1 h-2.5 bg-zinc-800 rounded overflow-hidden">
                                  <div className={`h-full rounded ${STATUS_BET[row.status]?.cls.split(" ")[0] || "bg-zinc-600"}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-zinc-500 w-8 text-right">{row.count}</span>
                                <span className="text-zinc-600 w-16 text-right">{fmtEur(row.volume || "0")}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                        <BarChart2 size={16} className="text-red-500" /> GGR Diário — últimos 30 dias
                      </h3>
                      {analyticsData.daily.length === 0 ? (
                        <div className="py-8 text-center text-zinc-600 text-sm">Sem dados suficientes</div>
                      ) : (
                        <div className="space-y-1.5">
                          {analyticsData.daily.map(row => {
                            const ggr = parseFloat(row.ggr || "0");
                            const maxGgr = Math.max(...analyticsData.daily.map(r => Math.abs(parseFloat(r.ggr || "0"))));
                            const pct = maxGgr > 0 ? (Math.abs(ggr) / maxGgr) * 100 : 0;
                            const isPos = ggr >= 0;
                            return (
                              <div key={row.day} className="flex items-center gap-3 text-xs">
                                <span className="text-zinc-600 w-20 shrink-0">{row.day}</span>
                                <div className="flex-1 flex items-center h-4">
                                  <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }}
                                      className={`h-full rounded ${isPos ? "bg-green-700" : "bg-red-800"}`} />
                                  </div>
                                </div>
                                <span className={`w-20 text-right font-medium ${isPos ? "text-green-400" : "text-red-400"}`}>{fmtEur(ggr)}</span>
                                <span className="text-zinc-600 w-16 text-right">{row.bets} apostas</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                        <Trophy size={16} className="text-yellow-500" />
                        <span className="font-bold text-sm text-zinc-300">Maiores Depositantes</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-950/30">
                              <th className="text-left px-4 py-2 text-zinc-500">Utilizador</th>
                              <th className="text-right px-4 py-2 text-zinc-500">Depósitos</th>
                              <th className="text-right px-4 py-2 text-zinc-500">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyticsData.topDepositors.map((d, i) => (
                              <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                                <td className="px-4 py-2.5">
                                  <div className="text-zinc-300 font-medium">{d.name}</div>
                                  <div className="text-zinc-600">{d.email}</div>
                                </td>
                                <td className="px-4 py-2.5 text-right text-zinc-400">{d.deposits}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-green-400">{fmtEur(d.total)}</td>
                              </tr>
                            ))}
                            {analyticsData.topDepositors.length === 0 && (
                              <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-600">Sem depósitos completados</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ── EVENTOS ── */}
            {activeTab === "events" && (
              <motion.div key="events" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

                {/* Feed de Dados */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                    <Radio size={16} className={feedStatus?.overall === "ok" ? "text-green-500" : "text-red-500"} />
                    <span className="font-bold text-sm text-zinc-300">Estado do Feed de Dados (Statpal)</span>
                    {feedStatus && (
                      <Badge cls={feedStatus.overall === "ok" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}
                        label={feedStatus.overall === "ok" ? "Operacional" : "Degradado"} />
                    )}
                    <Button size="sm" onClick={fetchFeed} disabled={feedLoading}
                      className="ml-auto h-7 px-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                      {feedLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                      Verificar
                    </Button>
                  </div>
                  {feedLoading && !feedStatus ? (
                    <div className="p-6 text-center"><Loader2 className="animate-spin text-red-600 mx-auto" size={24} /></div>
                  ) : feedStatus ? (
                    <div className="divide-y divide-zinc-800">
                      {feedStatus.endpoints.map((ep, i) => (
                        <div key={i} className="px-5 py-3 flex items-center gap-3">
                          {ep.status === "ok"
                            ? <Wifi size={16} className="text-green-500 shrink-0" />
                            : <WifiOff size={16} className="text-red-500 shrink-0" />}
                          <span className="text-sm text-zinc-300 flex-1">{ep.name}</span>
                          <span className={`text-xs font-mono ${ep.latency < 500 ? "text-green-400" : ep.latency < 1500 ? "text-yellow-400" : "text-red-400"}`}>
                            {ep.latency}ms
                          </span>
                          <Badge cls={ep.status === "ok" ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}
                            label={ep.status === "ok" ? "OK" : `Erro ${ep.statusCode}`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-zinc-600 text-sm">Clique em "Verificar" para testar o feed</div>
                  )}
                  {feedStatus && <div className="px-5 py-2 border-t border-zinc-800 text-xs text-zinc-600">Última verificação: {fmtDate(feedStatus.checkedAt)}</div>}
                </div>

                {/* Suspender Evento */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <h3 className="font-bold text-sm text-zinc-300 mb-4 flex items-center gap-2">
                    <Ban size={16} className="text-red-500" /> Suspender Evento
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-zinc-500 text-xs mb-1 block">ID do Evento *</Label>
                      <Input placeholder="ex: match_12345" value={suspendForm.matchId} onChange={e => setSuspendForm(p => ({ ...p, matchId: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm h-9" />
                    </div>
                    <div>
                      <Label className="text-zinc-500 text-xs mb-1 block">Nome do Evento *</Label>
                      <Input placeholder="ex: Porto vs Benfica" value={suspendForm.matchTitle} onChange={e => setSuspendForm(p => ({ ...p, matchTitle: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm h-9" />
                    </div>
                    <div>
                      <Label className="text-zinc-500 text-xs mb-1 block">Desporto</Label>
                      <select value={suspendForm.sport} onChange={e => setSuspendForm(p => ({ ...p, sport: e.target.value }))}
                        className="w-full h-9 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm px-3 focus:outline-none">
                        {Object.entries(SPORT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-zinc-500 text-xs mb-1 block">Motivo (opcional)</Label>
                      <Input placeholder="ex: odds suspeitas" value={suspendForm.reason} onChange={e => setSuspendForm(p => ({ ...p, reason: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm h-9" />
                    </div>
                  </div>
                  <Button onClick={handleSuspendMatch} disabled={suspending || !suspendForm.matchId || !suspendForm.matchTitle}
                    className="mt-3 bg-red-600 hover:bg-red-700 text-white font-bold h-9 px-5 text-sm">
                    {suspending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Ban size={14} className="mr-2" />}
                    Suspender Evento
                  </Button>
                </div>

                {/* Lista de Eventos Suspensos */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                    <Lock size={16} className="text-red-500" />
                    <span className="font-bold text-sm text-zinc-300">Eventos Suspensos</span>
                    <span className="ml-auto text-xs text-zinc-600">{suspendedMatches.length} evento(s)</span>
                  </div>
                  {suspendedMatches.length === 0 ? (
                    <div className="px-5 py-10 text-center text-zinc-600 text-sm">
                      <Unlock size={24} className="mx-auto mb-2 text-zinc-700" />
                      Nenhum evento suspenso — todos os eventos estão ativos
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800">
                      {suspendedMatches.map(m => (
                        <div key={m.id} className="px-5 py-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-white text-sm">{m.matchTitle}</span>
                              <Badge cls="bg-zinc-800 text-zinc-400" label={SPORT_LABEL[m.sport] || m.sport} />
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-zinc-600 font-mono">{m.matchId}</span>
                              {m.reason && <span className="text-xs text-zinc-500 italic">"{m.reason}"</span>}
                              <span className="text-xs text-zinc-700">{fmtDate(m.createdAt)}</span>
                            </div>
                          </div>
                          <Button size="sm" disabled={unsuspending === m.matchId} onClick={() => handleUnsuspend(m.matchId)}
                            className="h-7 px-3 text-xs bg-green-700 hover:bg-green-600 text-white shrink-0">
                            {unsuspending === m.matchId ? <Loader2 size={12} className="animate-spin mr-1" /> : <Unlock size={12} className="mr-1" />}
                            Reativar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── CONFIGURAÇÕES ── */}
            {activeTab === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

                {/* Configurações da Plataforma */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                    <Settings size={16} className="text-red-500" />
                    <span className="font-bold text-sm text-zinc-300">Parâmetros da Plataforma</span>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {Object.entries(SETTING_META).map(([key, meta]) => {
                      const isDirty = settingsDraft[key] !== settings[key];
                      return (
                        <div key={key} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white text-sm">{meta.label}</span>
                              {isDirty && <span className="text-xs text-yellow-400 font-medium">• não guardado</span>}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">{meta.desc}</div>
                          </div>
                          <div className="flex items-center gap-2 sm:w-64">
                            {meta.type === "boolean" ? (
                              <div className="flex gap-2">
                                {["true", "false"].map(v => (
                                  <button key={v} onClick={() => setSettingsDraft(p => ({ ...p, [key]: v }))}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${settingsDraft[key] === v ? (v === "true" ? "bg-green-700 text-white" : "bg-red-700 text-white") : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                                    {v === "true" ? "Ativo" : "Inativo"}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-1">
                                <Input type={meta.type === "number" ? "number" : "text"}
                                  value={settingsDraft[key] || ""}
                                  onChange={e => setSettingsDraft(p => ({ ...p, [key]: e.target.value }))}
                                  className="bg-zinc-800 border-zinc-700 text-white text-sm h-8 flex-1"
                                  step={key === "default_margin" ? "0.01" : "1"} />
                                {meta.unit && <span className="text-zinc-500 text-xs">{meta.unit}</span>}
                              </div>
                            )}
                            <Button size="sm" disabled={!isDirty || savingSetting === key} onClick={() => handleSaveSetting(key)}
                              className={`h-8 px-3 text-xs shrink-0 ${isDirty ? "bg-red-600 hover:bg-red-700 text-white" : "bg-zinc-800 text-zinc-600 cursor-default"}`}>
                              {savingSetting === key ? <Loader2 size={12} className="animate-spin" /> : "Guardar"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Log de Auditoria */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                    <FileText size={16} className="text-blue-400" />
                    <span className="font-bold text-sm text-zinc-300">Log de Auditoria</span>
                    <span className="ml-auto text-xs text-zinc-600">{auditLogs.length} registos</span>
                  </div>
                  {auditLogs.length === 0 ? (
                    <div className="px-5 py-10 text-center text-zinc-600 text-sm">
                      <Clock size={24} className="mx-auto mb-2 text-zinc-700" />
                      Nenhuma ação registada ainda
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
                      {auditLogs.map(log => (
                        <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                          <div className="shrink-0 mt-0.5">
                            {log.action === "suspend_match" && <Ban size={14} className="text-red-500" />}
                            {log.action === "unsuspend_match" && <Unlock size={14} className="text-green-500" />}
                            {log.action === "settings_update" && <Settings size={14} className="text-blue-400" />}
                            {!["suspend_match", "unsuspend_match", "settings_update"].includes(log.action) && <Activity size={14} className="text-zinc-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-zinc-300 font-medium">{AUDIT_ACTION_LABEL[log.action] || log.action}</span>
                              {log.targetId && <span className="text-xs text-zinc-600 font-mono">{log.targetId}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-zinc-600">por <span className="text-zinc-500">{log.adminUser}</span></span>
                              {log.ip && <span className="text-xs text-zinc-700 font-mono">{log.ip}</span>}
                              <span className="text-xs text-zinc-700">{fmtDate(log.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

                  {/* KYC Documents section */}
                  {detailModal.user.kycDocumentType && (
                    <div className="p-5 border-b border-zinc-800 shrink-0">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                          <span>🪪</span> Documentos KYC
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${KYC_LABELS[detailModal.user.kycStatus || "not_submitted"]?.cls}`}>
                          {KYC_LABELS[detailModal.user.kycStatus || "not_submitted"]?.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500 mb-1">Tipo</div>
                          <div className="font-semibold text-white text-sm">
                            {detailModal.user.kycDocumentType === "cc" ? "Cartão de Cidadão" : "Passaporte"}
                          </div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500 mb-1">Nº Documento</div>
                          <div className="font-mono font-semibold text-white text-sm">{detailModal.user.kycDocumentNumber || "—"}</div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500 mb-1">Submetido</div>
                          <div className="font-semibold text-white text-xs">{detailModal.user.kycSubmittedAt ? fmtDate(detailModal.user.kycSubmittedAt) : "—"}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex border-b border-zinc-800 shrink-0">
                    {(["bets", "payments", "withdrawals"] as const).map(t => (
                      <button key={t} onClick={() => setDetailTab(t)}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${detailTab === t ? "text-red-400 border-b-2 border-red-500" : "text-zinc-500 hover:text-zinc-300"}`}>
                        {t === "bets" ? "Apostas" : t === "payments" ? "Depósitos" : "Levantamentos"}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-auto p-5">
                    {detailTab === "bets" && (
                      <div className="space-y-2">
                        {detailModal.bets.length === 0 ? <div className="text-center text-zinc-600 py-8">Nenhuma aposta</div> :
                          detailModal.bets.map(b => (
                            <div key={b.id} className="bg-zinc-800 rounded-lg p-3 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-300 line-clamp-1">{b.matchTitle}</div>
                                <div className="text-xs text-zinc-600 mt-0.5">{fmtDate(b.createdAt)}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-bold text-white text-sm">{fmtEur(b.stake)}</div>
                                <div className="text-xs text-zinc-500">odds {parseFloat(b.totalOdds).toFixed(2)}</div>
                              </div>
                              <Badge cls={STATUS_BET[b.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_BET[b.status]?.label || b.status} />
                            </div>
                          ))}
                      </div>
                    )}
                    {detailTab === "payments" && (
                      <div className="space-y-2">
                        {detailModal.payments.length === 0 ? <div className="text-center text-zinc-600 py-8">Nenhum depósito</div> :
                          detailModal.payments.map(p => (
                            <div key={p.id} className="bg-zinc-800 rounded-lg p-3 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-300">{METHOD_LABEL[p.method] || p.method}</div>
                                <div className="text-xs text-zinc-600 mt-0.5">{fmtDate(p.createdAt)}</div>
                              </div>
                              <div className="font-bold text-green-400">{fmtEur(p.amount)}</div>
                              <Badge cls={STATUS_PAYMENT[p.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_PAYMENT[p.status]?.label || p.status} />
                            </div>
                          ))}
                      </div>
                    )}
                    {detailTab === "withdrawals" && (
                      <div className="space-y-2">
                        {detailModal.withdrawals.length === 0 ? <div className="text-center text-zinc-600 py-8">Nenhum levantamento</div> :
                          detailModal.withdrawals.map(w => (
                            <div key={w.id} className="bg-zinc-800 rounded-lg p-3 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-300 font-mono">{w.iban}</div>
                                <div className="text-xs text-zinc-600 mt-0.5">{fmtDate(w.createdAt)}</div>
                              </div>
                              <div className="font-bold text-white">{fmtEur(w.amount)}</div>
                              <Badge cls={STATUS_WITHDRAWAL[w.status]?.cls || "bg-zinc-800 text-zinc-400"} label={STATUS_WITHDRAWAL[w.status]?.label || w.status} />
                            </div>
                          ))}
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
