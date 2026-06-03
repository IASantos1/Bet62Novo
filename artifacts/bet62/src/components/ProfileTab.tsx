import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  User, Mail, Phone, Shield, ShieldCheck, Key, Bell, CreditCard,
  MessageSquare, Eye, Globe, Lock, AlertTriangle, CheckCircle,
  Clock, HelpCircle, Settings, Download, Trash2, ChevronRight,
  ChevronDown, Activity, Loader2, Smartphone, LogOut,
  FileText, ToggleLeft, ToggleRight, Zap, BarChart2, ArrowUpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

type UserBet = {
  id: number;
  matchTitle: string;
  stake: string;
  totalOdds: string;
  potentialWin: string;
  status: string;
  createdAt: string;
};

type ProfileTabProps = {
  myBets: UserBet[];
  myBetsLoading: boolean;
  fetchMyBets: () => void;
};

const SECTIONS = [
  { id: "pessoais",     icon: User,           label: "Informações Pessoais" },
  { id: "verificacao",  icon: ShieldCheck,    label: "Verificação de Identidade" },
  { id: "seguranca",    icon: Key,            label: "Definições de Segurança" },
  { id: "preferencias", icon: Settings,       label: "Preferências de Conta" },
  { id: "limites",      icon: AlertTriangle,  label: "Limites e Autoexclusão" },
  { id: "atividade",    icon: Activity,       label: "Histórico de Atividade" },
  { id: "pagamento",    icon: CreditCard,     label: "Dados Bancários" },
  { id: "notificacoes", icon: Bell,           label: "Notificações" },
  { id: "sessoes",      icon: Smartphone,     label: "Sessões Ativas" },
  { id: "suporte",      icon: HelpCircle,     label: "Suporte e Assistência" },
  { id: "privacidade",  icon: Eye,            label: "Configurações de Privacidade" },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="shrink-0">
      {on
        ? <ToggleRight className="text-red-500" size={28} />
        : <ToggleLeft className="text-zinc-600" size={28} />}
    </button>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="border-b border-zinc-800 pb-3 mb-5">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{description}</p>
      </div>
      {children}
    </div>
  );
}

function VerifyBadge({ label, status }: { label: string; status: "verified" | "pending" | "unverified" }) {
  const cfg = {
    verified:   { icon: <CheckCircle size={14} />, text: "Verificado",     cls: "bg-green-900/40 text-green-400 border-green-800" },
    pending:    { icon: <Clock size={14} />,        text: "Pendente",      cls: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
    unverified: { icon: <AlertTriangle size={14} />,text: "Não verificado",cls: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  }[status];
  return (
    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
        {cfg.icon}{cfg.text}
      </span>
    </div>
  );
}

export default function ProfileTab({ myBets, myBetsLoading, fetchMyBets }: ProfileTabProps) {
  const auth = useAuth();
  const [activeSection, setActiveSection] = useState("pessoais");
  const [mobileOpen, setMobileOpen] = useState<string | null>("pessoais");

  useEffect(() => { fetchMyBets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [editName, setEditName] = useState(auth.user?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [twoFA, setTwoFA] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);

  const [oddsFormat, setOddsFormat] = useState<"decimal" | "fracionado" | "americano">("decimal");

  const [limitDep, setLimitDep] = useState("");
  const [limitBet, setLimitBet] = useState("");
  const [limitLoss, setLimitLoss] = useState("");
  const [excludingFor, setExcludingFor] = useState<string | null>(null);

  const [notifEmailResults, setNotifEmailResults] = useState(true);
  const [notifEmailPromos, setNotifEmailPromos] = useState(false);
  const [notifSMS, setNotifSMS] = useState(false);
  const [notifPush, setNotifPush] = useState(true);

  const [cookieAnalytics, setCookieAnalytics] = useState(true);
  const [cookieMarketing, setCookieMarketing] = useState(false);
  const [dataShare, setDataShare] = useState(false);

  const [iban, setIban] = useState(auth.user?.withdrawalIban ?? "");
  const [ibanName, setIbanName] = useState(auth.user?.withdrawalName ?? "");
  const [nif, setNif] = useState(auth.user?.nif ?? "");
  const [savingBanking, setSavingBanking] = useState(false);
  const [kycUploading, setKycUploading] = useState<null | "id" | "address">(null);
  const kycIdInputRef = useRef<HTMLInputElement | null>(null);
  const kycAddressInputRef = useRef<HTMLInputElement | null>(null);

  const wonBets = myBets.filter(b => b.status === "won");
  const totalWagered = myBets.reduce((s, b) => s + parseFloat(b.stake), 0);
  const totalWon = wonBets.reduce((s, b) => s + parseFloat(b.potentialWin), 0);
  const biggestWin = wonBets.reduce((m, b) => Math.max(m, parseFloat(b.potentialWin)), 0);
  const winRate = myBets.length > 0 ? Math.round((wonBets.length / myBets.length) * 100) : 0;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    await new Promise(r => setTimeout(r, 800));
    setSavingProfile(false);
    toast.success("Perfil atualizado com sucesso.");
  };

  const handleChangePassword = () => {
    if (!currentPw || !newPw || !confirmPw) { toast.error("Preencha todos os campos."); return; }
    if (newPw !== confirmPw) { toast.error("As passwords não coincidem."); return; }
    if (newPw.length < 8) { toast.error("A password deve ter no mínimo 8 caracteres."); return; }
    toast.success("Password alterada com sucesso.");
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
  };

  const handleSaveBanking = async () => {
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIban)) { toast.error("IBAN inválido."); return; }
    if (nif && !/^\d{9}$/.test(nif)) { toast.error("NIF deve ter 9 dígitos."); return; }
    setSavingBanking(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ nif: nif || undefined, withdrawalIban: cleanIban || undefined, withdrawalName: ibanName || undefined }),
      });
      if (r.ok) {
        await auth.refreshUser();
        toast.success("Dados bancários guardados com sucesso.");
      } else {
        const d = await r.json() as { error?: string };
        toast.error(d.error ?? "Erro ao guardar.");
      }
    } catch { toast.error("Erro de ligação."); }
    finally { setSavingBanking(false); }
  };

  const handleSelfExclude = async (period: string, label: string) => {
    if (!confirm(`Tem a certeza que quer ativar a autoexclusão por ${label}? Esta ação não pode ser revertida imediatamente.`)) return;
    setExcludingFor(period);
    try {
      const r = await fetch("/api/profile/self-exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ period }),
      });
      if (r.ok) {
        await auth.refreshUser();
        toast.success(`Autoexclusão ativada por ${label}.`);
      } else {
        const d = await r.json() as { error?: string };
        toast.error(d.error ?? "Erro ao ativar autoexclusão.");
      }
    } catch { toast.error("Erro de ligação."); }
    finally { setExcludingFor(null); }
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler ficheiro"));
      reader.onload = () => {
        const result = String(reader.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.readAsDataURL(file);
    });

  const uploadKycFiles = async (kind: "id" | "address", fileList: FileList) => {
    if (!auth.token) { toast.error("Sessão inválida. Faça login novamente."); return; }
    const files = Array.from(fileList).slice(0, 4);
    if (files.length === 0) return;
    const tooBig = files.find(f => f.size > 5 * 1024 * 1024);
    if (tooBig) { toast.error("Arquivo muito grande. Máximo 5MB por arquivo."); return; }

    setKycUploading(kind);
    try {
      const payloadFiles = await Promise.all(files.map(async (f) => ({
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        base64: await readFileAsBase64(f),
      })));

      const r = await fetch("/api/profile/kyc/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ kind, files: payloadFiles }),
      });
      const d = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { toast.error(d.error ?? "Erro ao enviar documentos."); return; }
      await auth.refreshUser();
      toast.success("Documentos enviados. Estado: em análise.");
    } catch {
      toast.error("Erro ao enviar documentos.");
    } finally {
      setKycUploading(null);
    }
  };

  const user = auth.user;
  if (!user) return null;

  const kycStatus = user.kycStatus ?? "not_submitted";
  const selfExcludedUntil = user.selfExcludedUntil ? new Date(user.selfExcludedUntil) : null;
  const isExcluded = selfExcludedUntil ? selfExcludedUntil > new Date() : false;

  const memberId = `BET62-${String(user.id).padStart(6, "0")}`;
  const joinedDate = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  const SectionContent = ({ id }: { id: string }) => {
    switch (id) {
      case "pessoais":
        return (
          <SectionCard
            title="Informações Pessoais"
            description="Área destinada à gestão e atualização dos dados pessoais do utilizador, garantindo a exatidão e conformidade com os requisitos legais aplicáveis."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Nome completo</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-zinc-900 border-zinc-700 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Endereço de email</Label>
                <Input value={user.email} readOnly className="bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">ID de Membro</Label>
                <Input value={memberId} readOnly className="bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Membro desde</Label>
                <Input value={joinedDate} readOnly className="bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed" />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveProfile} disabled={savingProfile} className="bg-red-600 hover:bg-red-700 text-white">
                {savingProfile ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                Guardar Alterações
              </Button>
            </div>
          </SectionCard>
        );

      case "verificacao":
        return (
          <SectionCard
            title="Verificação de Identidade (KYC)"
            description="Complete a verificação para desbloquear levantamentos e limites mais elevados. O processo demora até 48 horas úteis."
          >
            <div className="space-y-2">
              <VerifyBadge label="Email" status="verified" />
              <VerifyBadge label="NIF / Número de Identificação Fiscal" status={user.nif ? "verified" : "unverified"} />
              <VerifyBadge
                label="Documento de Identificação (CC / Passaporte)"
                status={kycStatus === "verified" ? "verified" : kycStatus === "pending" ? "pending" : "unverified"}
              />
              <VerifyBadge label="Comprovativo de Morada" status={kycStatus === "verified" ? "verified" : "unverified"} />
            </div>

            {kycStatus === "not_submitted" && (
              <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-yellow-400 shrink-0 mt-0.5" size={16} />
                  <div className="text-sm text-yellow-200/80">
                    Para ativar levantamentos, submeta os seus documentos de identificação.
                  </div>
                </div>
              </div>
            )}

            {kycStatus === "pending" && (
              <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
                <div className="flex items-start gap-3">
                  <Clock className="text-blue-400 shrink-0 mt-0.5" size={16} />
                  <div className="text-sm text-blue-200/80">
                    Os seus documentos estão em análise. Será notificado por email em até 48 horas úteis.
                  </div>
                </div>
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                <FileText size={14} className="text-red-500" /> Como submeter documentos
              </h4>
              <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Inclua o seu ID de membro: <span className="text-red-400 font-mono font-bold">{memberId}</span></li>
                <li>Anexe: Cartão de Cidadão ou Passaporte (frente e verso)</li>
                <li>Anexe: Comprovativo de morada recente (fatura, extrato)</li>
                <li>Limites: até 4 ficheiros por envio, máximo 5MB cada</li>
                <li>Suporte: <span className="text-white font-semibold">suportebet62@gmail.com</span></li>
              </ol>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  ref={kycIdInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) uploadKycFiles("id", e.target.files); e.currentTarget.value = ""; }}
                />
                <input
                  ref={kycAddressInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) uploadKycFiles("address", e.target.files); e.currentTarget.value = ""; }}
                />
                <button
                  onClick={() => kycIdInputRef.current?.click()}
                  disabled={kycUploading !== null}
                  className="inline-flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-md transition-colors"
                >
                  {kycUploading === "id" ? <Loader2 className="animate-spin" size={12} /> : <FileText size={12} />} Enviar Documento (ID)
                </button>
                <button
                  onClick={() => kycAddressInputRef.current?.click()}
                  disabled={kycUploading !== null}
                  className="inline-flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-zinc-200 text-xs font-semibold px-3 py-2 rounded-md transition-colors"
                >
                  {kycUploading === "address" ? <Loader2 className="animate-spin" size={12} /> : <FileText size={12} />} Enviar Morada
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText("suportebet62@gmail.com"); toast.success("Email copiado!"); }}
                  className="inline-flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-semibold px-3 py-2 rounded-md transition-colors"
                >
                  <Mail size={12} /> Copiar email
                </button>
              </div>
            </div>
          </SectionCard>
        );

      case "seguranca":
        return (
          <SectionCard
            title="Definições de Segurança"
            description="Espaço para configuração de medidas de proteção da conta, incluindo autenticação e controlo de acessos."
          >
            <div className="space-y-5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2"><Key size={14} className="text-red-500" /> Alterar Password</h4>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Password atual</Label>
                    <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" placeholder="••••••••" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Nova password (mínimo 8 caracteres)</Label>
                    <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" placeholder="••••••••" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Confirmar nova password</Label>
                    <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" placeholder="••••••••" />
                  </div>
                  <Button onClick={handleChangePassword} className="bg-red-600 hover:bg-red-700 text-white w-full">Atualizar Password</Button>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2"><Shield size={14} className="text-red-500" /> Autenticação de Dois Fatores</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-300">Autenticação via App (TOTP)</div>
                    <div className="text-xs text-zinc-500">Google Authenticator, Authy, etc.</div>
                  </div>
                  <Toggle on={twoFA} onToggle={() => { setTwoFA(v => !v); toast.success(twoFA ? "2FA desativado." : "2FA ativado — configure a sua app de autenticação."); }} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-300">Alertas de novo acesso</div>
                    <div className="text-xs text-zinc-500">Notificação por email em cada novo login</div>
                  </div>
                  <Toggle on={loginAlerts} onToggle={() => setLoginAlerts(v => !v)} />
                </div>
              </div>
            </div>
          </SectionCard>
        );

      case "preferencias":
        return (
          <SectionCard
            title="Preferências de Conta"
            description="Permite ao utilizador personalizar definições gerais da conta de acordo com as suas preferências individuais."
          >
            <div className="space-y-5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h4 className="font-semibold text-sm text-white mb-4 flex items-center gap-2"><BarChart2 size={14} className="text-red-500" /> Formato de Odds</h4>
                <div className="flex gap-2 flex-wrap">
                  {(["decimal", "fracionado", "americano"] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setOddsFormat(fmt)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${oddsFormat === fmt ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                    >
                      {fmt === "decimal" ? "Decimal (2.50)" : fmt === "fracionado" ? "Fracionado (3/2)" : "Americano (+150)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2"><Globe size={14} className="text-red-500" /> Idioma e Região</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-300">Idioma</div>
                    <div className="text-xs text-zinc-500">Português (Portugal)</div>
                  </div>
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">🇵🇹 PT</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-300">Fuso horário</div>
                    <div className="text-xs text-zinc-500">Europe/Lisbon (UTC+1)</div>
                  </div>
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">WET/WEST</span>
                </div>
              </div>
            </div>
          </SectionCard>
        );

      case "limites":
        return (
          <SectionCard
            title="Limites e Autoexclusão"
            description="Defina limites pessoais e opções de autoexclusão para uma experiência de jogo responsável."
          >
            <div className="space-y-5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2"><Lock size={14} className="text-red-500" /> Limites Financeiros</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Depósito diário (€)</Label>
                    <Input type="number" placeholder="Sem limite" value={limitDep} onChange={e => setLimitDep(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Aposta máxima (€)</Label>
                    <Input type="number" placeholder="Sem limite" value={limitBet} onChange={e => setLimitBet(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Perda semanal (€)</Label>
                    <Input type="number" placeholder="Sem limite" value={limitLoss} onChange={e => setLimitLoss(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                </div>
                <Button onClick={() => toast.success("Limites guardados.")} className="bg-red-600 hover:bg-red-700 text-white">Guardar Limites</Button>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                  <AlertTriangle size={14} className="text-orange-400" /> Autoexclusão
                </h4>

                {isExcluded ? (
                  <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-orange-400 shrink-0 mt-0.5" size={16} />
                      <div>
                        <div className="text-sm font-semibold text-white">Autoexclusão ativa</div>
                        <div className="text-xs text-orange-300 mt-1">
                          Excluído até: <strong>{selfExcludedUntil?.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Para cancelar, contacte: suportebet62@gmail.com
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      A autoexclusão impede o acesso à sua conta por um período definido. Esta ação é imediata e não pode ser revertida antes do prazo terminar.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { period: "1d", label: "1 dia" },
                        { period: "7d", label: "1 semana" },
                        { period: "30d", label: "1 mês" },
                        { period: "180d", label: "6 meses" },
                        { period: "permanent", label: "Permanente" },
                      ].map(({ period, label }) => (
                        <Button
                          key={period}
                          onClick={() => handleSelfExclude(period, label)}
                          disabled={!!excludingFor}
                          variant="outline"
                          className="border-orange-800/60 text-orange-300 hover:bg-orange-900/20 text-xs"
                        >
                          {excludingFor === period ? <Loader2 className="animate-spin mr-1" size={12} /> : null}
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className="text-xs text-zinc-600 bg-zinc-800/50 rounded-lg p-3">
                      Ajuda com problemas de jogo: <span className="text-zinc-400 font-semibold">808 200 999</span> (linha gratuita)
                    </div>
                  </>
                )}
              </div>
            </div>
          </SectionCard>
        );

      case "atividade":
        return (
          <SectionCard
            title="Histórico de Atividade"
            description="Resumo da sua atividade na plataforma, incluindo apostas realizadas e resultados obtidos."
          >
            {myBetsLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-red-600" size={24} /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total apostado", value: `€ ${totalWagered.toFixed(2)}`, icon: <Zap size={16} className="text-red-500" /> },
                  { label: "Total ganho", value: `€ ${totalWon.toFixed(2)}`, icon: <CheckCircle size={16} className="text-green-500" /> },
                  { label: "Maior ganho", value: `€ ${biggestWin.toFixed(2)}`, icon: <BarChart2 size={16} className="text-yellow-500" /> },
                  { label: "Taxa de vitória", value: `${winRate}%`, icon: <Activity size={16} className="text-blue-400" /> },
                ].map(card => (
                  <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    <div className="flex justify-center mb-2">{card.icon}</div>
                    <div className="text-lg font-black text-white">{card.value}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{card.label}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        );

      case "pagamento":
        return (
          <SectionCard
            title="Dados Bancários para Levantamento"
            description="Guarde os seus dados bancários para facilitar futuros pedidos de levantamento. Os dados são encriptados e seguros."
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                <ArrowUpCircle size={14} className="text-orange-400" /> Conta Bancária
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">IBAN</Label>
                  <Input
                    placeholder="PT50 0000 0000 0000 0000 0000 0"
                    value={iban}
                    onChange={e => setIban(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Nome do Titular</Label>
                  <Input
                    placeholder="Nome completo como no banco"
                    value={ibanName}
                    onChange={e => setIbanName(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">NIF</Label>
                  <Input
                    placeholder="123456789"
                    maxLength={9}
                    value={nif}
                    onChange={e => setNif(e.target.value.replace(/\D/g, ""))}
                    className="bg-zinc-800 border-zinc-700 text-white font-mono"
                  />
                </div>
                <Button onClick={handleSaveBanking} disabled={savingBanking} className="bg-red-600 hover:bg-red-700 text-white w-full">
                  {savingBanking ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                  Guardar Dados Bancários
                </Button>
              </div>
            </div>
            {(user.withdrawalIban || user.nif) && (
              <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 text-xs text-green-300 flex items-center gap-2">
                <CheckCircle size={14} />
                Dados bancários guardados — serão pré-preenchidos nos seus levantamentos.
              </div>
            )}
          </SectionCard>
        );

      case "notificacoes":
        return (
          <SectionCard
            title="Notificações"
            description="Gerencie as preferências de comunicação e alertas da sua conta."
          >
            <div className="space-y-2">
              {[
                { label: "Resultados de apostas (email)", sub: "Notificação quando uma aposta é resolvida", val: notifEmailResults, set: setNotifEmailResults },
                { label: "Promoções e ofertas (email)", sub: "Novidades, bónus e promoções especiais", val: notifEmailPromos, set: setNotifEmailPromos },
                { label: "SMS", sub: "Alertas por mensagem de texto", val: notifSMS, set: setNotifSMS },
                { label: "Notificações push", sub: "Alertas no navegador", val: notifPush, set: setNotifPush },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{item.label}</div>
                    <div className="text-xs text-zinc-500">{item.sub}</div>
                  </div>
                  <Toggle on={item.val} onToggle={() => item.set(v => !v)} />
                </div>
              ))}
            </div>
          </SectionCard>
        );

      case "sessoes":
        return (
          <SectionCard
            title="Sessões Ativas"
            description="Gerencie os dispositivos e sessões atualmente com acesso à sua conta."
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Smartphone size={18} className="text-red-400 shrink-0 mt-1" />
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    {navigator.userAgent.includes("Mobile") ? "Dispositivo Móvel" : "Navegador Web"}
                    <span className="text-[10px] bg-green-900/50 text-green-400 border border-green-800 px-1.5 py-0.5 rounded-full font-bold">ATIVA AGORA</span>
                  </div>
                  <div className="text-xs text-zinc-500">Sessão atual</div>
                  <div className="text-xs text-zinc-600">Iniciada recentemente</div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <Button
                variant="outline"
                onClick={() => { auth.logout(); toast.success("Todas as sessões encerradas."); }}
                className="border-red-800 text-red-400 hover:bg-red-900/20 flex items-center gap-2"
              >
                <LogOut size={14} /> Encerrar todas as sessões
              </Button>
            </div>
          </SectionCard>
        );

      case "suporte":
        return (
          <SectionCard
            title="Suporte e Assistência"
            description="Acesso a recursos de apoio e canais de contacto para esclarecimento de dúvidas relacionadas com a conta."
          >
            <div className="space-y-3">
              {[
                { icon: <Mail size={16} className="text-red-400" />, label: "Email de suporte", value: "suportebet62@gmail.com", sub: "Resposta em até 24 horas úteis" },
                { icon: <Phone size={16} className="text-red-400" />, label: "Linha de apoio", value: "+351 800 000 000", sub: "Chamada gratuita · 24h / 7 dias" },
                { icon: <Clock size={16} className="text-red-400" />, label: "Horário de atendimento", value: "24 horas, 7 dias por semana", sub: "Chat ao vivo disponível" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-xs text-zinc-500">{item.label}</div>
                    <div className="text-sm font-semibold text-white">{item.value}</div>
                    <div className="text-xs text-zinc-600">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 flex-wrap">
              <Button onClick={() => toast.info("Chat ao vivo disponível em breve.")} className="bg-red-600 hover:bg-red-700 text-white">
                <MessageSquare size={14} className="mr-2" /> Chat ao Vivo
              </Button>
              <Button variant="outline" onClick={() => toast.info("Centro de ajuda disponível em breve.")} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <HelpCircle size={14} className="mr-2" /> Centro de Ajuda / FAQ
              </Button>
            </div>
          </SectionCard>
        );

      case "privacidade":
        return (
          <SectionCard
            title="Configurações de Privacidade"
            description="Gestão das preferências relativas ao tratamento e proteção dos dados pessoais do utilizador."
          >
            <div className="space-y-2">
              {[
                { label: "Cookies analíticos", sub: "Dados de utilização para melhorar a plataforma", val: cookieAnalytics, set: setCookieAnalytics },
                { label: "Cookies de marketing", sub: "Personalização de anúncios e conteúdos", val: cookieMarketing, set: setCookieMarketing },
                { label: "Partilha de dados com parceiros", sub: "Dados partilhados com entidades afiliadas", val: dataShare, set: setDataShare },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{item.label}</div>
                    <div className="text-xs text-zinc-500">{item.sub}</div>
                  </div>
                  <Toggle on={item.val} onToggle={() => item.set(v => !v)} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4 flex-wrap">
              <Button variant="outline" onClick={() => toast.info("Download de dados disponível em breve.")} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <Download size={14} className="mr-2" /> Descarregar os Meus Dados
              </Button>
              <Button variant="outline" onClick={() => toast.error("Para eliminar a conta contacte o suporte.")} className="border-red-800 text-red-400 hover:bg-red-900/20">
                <Trash2 size={14} className="mr-2" /> Eliminar Conta
              </Button>
            </div>
          </SectionCard>
        );

      default:
        return null;
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Profile header */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-2xl font-black shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black text-white truncate">{user.name}</div>
          <div className="text-sm text-zinc-400 truncate">{user.email}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{memberId}</div>
        </div>
        <div className="ml-auto text-right shrink-0 hidden sm:block">
          <div className="text-xs text-zinc-500">Saldo disponível</div>
          <div className="text-xl font-black text-green-400">€ {parseFloat(user.balance).toFixed(2)}</div>
          {isExcluded && (
            <div className="text-[10px] text-orange-400 mt-1">Autoexcluído até {selfExcludedUntil?.toLocaleDateString("pt-PT")}</div>
          )}
        </div>
      </div>

      {/* Desktop: sidebar + content */}
      <div className="flex gap-6">
        <aside className="hidden md:block w-64 shrink-0">
          <nav className="space-y-1">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${active ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}
                >
                  <Icon size={15} className={active ? "text-white" : "text-zinc-500"} />
                  <span className="flex-1">{s.label}</span>
                  {active && <ChevronRight size={14} />}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="hidden md:block">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6"
              >
                <SectionContent id={activeSection} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mobile: accordion */}
          <div className="md:hidden space-y-2">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const open = mobileOpen === s.id;
              return (
                <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setMobileOpen(open ? null : s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <Icon size={15} className={open ? "text-red-500" : "text-zinc-500"} />
                    <span className={`flex-1 text-sm font-medium ${open ? "text-white" : "text-zinc-300"}`}>{s.label}</span>
                    <ChevronDown size={14} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-zinc-800">
                          <SectionContent id={s.id} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
