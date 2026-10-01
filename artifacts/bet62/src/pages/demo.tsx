import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type Mode = "register" | "login";

export default function DemoPage() {
  const auth = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in (real or demo account) — /demo is only an entry
  // point for getting into a demo session, nothing to do here once one
  // exists.
  useEffect(() => {
    if (!auth.isLoading && auth.user) {
      navigate("/");
    }
  }, [auth.isLoading, auth.user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === "register") {
        if (!name.trim()) {
          toast.error("Indica o teu nome.");
          return;
        }
        if (password.length < 8) {
          toast.error("A senha deve ter pelo menos 8 caracteres.");
          return;
        }
        await auth.registerDemo(name.trim(), email.trim(), password);
        toast.success("Conta demo criada! Bom jogo.");
      } else {
        await auth.login(email.trim(), password);
        toast.success("Sessão iniciada.");
      }
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-white flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-4 h-16 max-w-md mx-auto">
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

      <main className="flex-1 px-4 py-8 max-w-md mx-auto w-full">
        {auth.isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-zinc-500" size={28} />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2 text-amber-300">
              <Sparkles size={20} />
              <h1 className="text-2xl font-black">Modo Demo</h1>
            </div>
            <p className="text-zinc-500 text-sm mb-6">
              Experimenta o casino BET62 com saldo fictício, sem qualquer risco —
              sem cartão, sem depósito. O Sportsbook demo ainda não está disponível;
              para já esta conta serve só para o casino.
            </p>

            <div className="flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 mb-6">
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "register" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"}`}
              >
                Criar conta demo
              </button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "login" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"}`}
              >
                Já tenho conta
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "register" && (
                <div>
                  <label htmlFor="demo-name" className="text-xs text-zinc-500 mb-1 block">
                    Nome
                  </label>
                  <input
                    id="demo-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-600"
                    required
                  />
                </div>
              )}
              <div>
                <label htmlFor="demo-email" className="text-xs text-zinc-500 mb-1 block">
                  Email
                </label>
                <input
                  id="demo-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-600"
                  required
                />
              </div>
              <div>
                <label htmlFor="demo-password" className="text-xs text-zinc-500 mb-1 block">
                  Senha
                </label>
                <input
                  id="demo-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-600"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-black text-sm rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="animate-spin" size={16} />}
                {mode === "register" ? "Criar conta demo grátis" : "Entrar"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
