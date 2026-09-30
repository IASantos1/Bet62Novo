import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Copy, Loader2, Users, Wallet, TrendingUp, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

type PromoterDashboard = {
  affiliate: { id: number; name: string; code: string; commissionRate: number };
  stats: { users: number; deposits: number; commission: number; available: number; paid: number };
  history: Array<{
    userId: number;
    userName: string;
    depositAmount: string;
    commissionAmount: string;
    status: string;
    createdAt: string;
  }>;
};

function formatEur(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value);
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  paid: "Paga",
  reversed: "Revertida",
};

export default function PromoterDashboardPage() {
  const auth = useAuth();
  const [data, setData] = useState<PromoterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAffiliate, setNotAffiliate] = useState(false);

  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.user) {
      setLoading(false);
      return;
    }
    apiFetch("/api/affiliate/dashboard")
      .then(async (res) => {
        if (res.status === 404) {
          setNotAffiliate(true);
          return;
        }
        if (!res.ok) throw new Error();
        setData(await res.json());
      })
      .catch(() => toast.error("Erro ao carregar o painel de promotor."))
      .finally(() => setLoading(false));
  }, [auth.isLoading, auth.user]);

  const link = data ? `${window.location.origin}/?ref=${data.affiliate.code}` : "";

  const copyLink = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado!"),
      () => toast.error("Não foi possível copiar o link."),
    );
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-white flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-4 h-16 max-w-3xl mx-auto">
          <Link href="/" className="font-black text-2xl tracking-tighter italic">
            <span className="text-white">BET</span>
            <span className="text-emerald-300">62</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
        {auth.isLoading || loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-zinc-500" size={28} />
          </div>
        ) : !auth.user ? (
          <div className="text-center py-24">
            <p className="text-zinc-400 mb-2">Precisa de iniciar sessão para ver o seu painel de promotor.</p>
          </div>
        ) : notAffiliate ? (
          <div className="text-center py-24">
            <p className="text-zinc-400">
              Esta conta não está associada a nenhum programa de promotor. Contacte a equipa BET62 para saber mais.
            </p>
          </div>
        ) : data ? (
          <>
            <h1 className="text-2xl font-black mb-1">Painel do Promotor</h1>
            <p className="text-zinc-500 text-sm mb-6">
              {data.affiliate.name} · Comissão {data.affiliate.commissionRate}%
            </p>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 mb-6">
              <div className="text-xs text-zinc-500 mb-1.5">O seu link de divulgação</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate text-sm text-emerald-300 font-mono bg-zinc-950 rounded-lg px-3 py-2 border border-zinc-800">
                  {link}
                </div>
                <button
                  onClick={copyLink}
                  className="shrink-0 p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  aria-label="Copiar link"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <StatCard icon={<Users size={16} />} label="Utilizadores" value={String(data.stats.users)} />
              <StatCard icon={<TrendingUp size={16} />} label="Depósitos" value={formatEur(data.stats.deposits)} />
              <StatCard icon={<Wallet size={16} />} label="Comissão total" value={formatEur(data.stats.commission)} />
              <StatCard
                icon={<CheckCircle2 size={16} />}
                label="Disponível"
                value={formatEur(data.stats.available)}
                highlight
              />
              <StatCard icon={<Wallet size={16} />} label="Pago" value={formatEur(data.stats.paid)} />
            </div>

            <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3">Histórico</h2>
            {data.history.length === 0 ? (
              <p className="text-zinc-600 text-sm py-8 text-center">Ainda sem comissões registadas.</p>
            ) : (
              <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/60">
                {data.history.map((row, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="text-zinc-200">{row.userName}</div>
                      <div className="text-zinc-600 text-xs">
                        {new Date(row.createdAt).toLocaleDateString("pt-PT")} · Depósito{" "}
                        {formatEur(Number(row.depositAmount))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-300 font-medium">{formatEur(Number(row.commissionAmount))}</div>
                      <div className="text-zinc-600 text-xs">{STATUS_LABEL[row.status] ?? row.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? "border-emerald-600/40 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900/60"}`}
    >
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-bold ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}
