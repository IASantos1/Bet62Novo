import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Menu, X, Trophy, Activity, Gift, Dribbble, Target, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";

// --- Types ---
type Odds = { home: number; draw: number; away: number };
type Match = {
  id: number;
  home: string;
  away: string;
  league: string;
  time: string;
  odds: Odds;
  isLive: boolean;
};

type BetSelection = {
  matchId: number;
  matchTitle: string;
  selection: "home" | "draw" | "away";
  odd: number;
};

// --- Hardcoded Data ---
const MATCHES: Match[] = [
  { id: 1, home: "Flamengo", away: "Palmeiras", league: "Brasileirão Série A", time: "19:30", odds: { home: 2.15, draw: 3.40, away: 3.25 }, isLive: false },
  { id: 2, home: "Real Madrid", away: "Barcelona", league: "La Liga", time: "22:00", odds: { home: 2.30, draw: 3.50, away: 3.10 }, isLive: false },
  { id: 3, home: "Manchester City", away: "Liverpool", league: "Premier League", time: "17:00", odds: { home: 1.95, draw: 3.60, away: 3.80 }, isLive: false },
  { id: 4, home: "Corinthians", away: "São Paulo", league: "Brasileirão Série A", time: "21:00", odds: { home: 2.60, draw: 3.20, away: 2.80 }, isLive: true },
  { id: 5, home: "Juventus", away: "Inter Milan", league: "Serie A", time: "18:45", odds: { home: 2.10, draw: 3.30, away: 3.50 }, isLive: true },
  { id: 6, home: "PSG", away: "Olympique Lyon", league: "Ligue 1", time: "20:00", odds: { home: 1.55, draw: 4.00, away: 5.50 }, isLive: false },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"sports" | "live" | "promos">("sports");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bets, setBets] = useState<BetSelection[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [betSlipOpenMobile, setBetSlipOpenMobile] = useState(false);

  // --- Handlers ---
  const toggleBet = (match: Match, selection: "home" | "draw" | "away") => {
    setBets(prev => {
      const existing = prev.find(b => b.matchId === match.id);
      if (existing && existing.selection === selection) {
        return prev.filter(b => b.matchId !== match.id);
      }
      const newBet = {
        matchId: match.id,
        matchTitle: `${match.home} vs ${match.away}`,
        selection,
        odd: match.odds[selection]
      };
      if (existing) {
        return prev.map(b => b.matchId === match.id ? newBet : b);
      }
      return [...prev, newBet];
    });
  };

  const removeBet = (matchId: number) => {
    setBets(prev => prev.filter(b => b.matchId !== matchId));
  };

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odd, 1).toFixed(2);
  const [stake, setStake] = useState<string>("");

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthModalOpen(false);
    toast.success("Login realizado com sucesso!");
  };

  // --- UI Components ---
  const MatchCard = ({ match }: { match: Match }) => {
    const homeSelected = bets.find(b => b.matchId === match.id && b.selection === "home");
    const drawSelected = bets.find(b => b.matchId === match.id && b.selection === "draw");
    const awaySelected = bets.find(b => b.matchId === match.id && b.selection === "away");

    return (
      <motion.div
        whileHover={{ y: -4 }}
        className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 hover:border-red-500/50 transition-colors cursor-pointer flex flex-col"
        onClick={() => setSelectedMatch(match)}
      >
        <div className="flex justify-between items-center mb-4 text-xs font-semibold text-zinc-400">
          <span>{match.league}</span>
          <div className="flex items-center gap-1.5">
            {match.isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            <span className={match.isLive ? "text-red-500" : ""}>{match.isLive ? "AO VIVO" : match.time}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center mb-6">
          <div className="text-lg font-bold text-white">{match.home}</div>
          <div className="text-sm text-zinc-500 my-1">vs</div>
          <div className="text-lg font-bold text-white">{match.away}</div>
        </div>

        <div className="grid grid-cols-3 gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => toggleBet(match, "home")}
            className={`flex flex-col items-center p-2 rounded-md transition-all ${homeSelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            <span className="text-xs mb-1">Casa</span>
            <span className="font-bold">{match.odds.home.toFixed(2)}</span>
          </button>
          <button
            onClick={() => toggleBet(match, "draw")}
            className={`flex flex-col items-center p-2 rounded-md transition-all ${drawSelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            <span className="text-xs mb-1">Empate</span>
            <span className="font-bold">{match.odds.draw.toFixed(2)}</span>
          </button>
          <button
            onClick={() => toggleBet(match, "away")}
            className={`flex flex-col items-center p-2 rounded-md transition-all ${awaySelected ? "bg-red-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            <span className="text-xs mb-1">Fora</span>
            <span className="font-bold">{match.odds.away.toFixed(2)}</span>
          </button>
        </div>
      </motion.div>
    );
  };

  const BetSlipContent = () => (
    <div className="flex flex-col h-full bg-zinc-950/50">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
        <h3 className="font-bold text-lg text-white">Boletim de Apostas</h3>
        <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">{bets.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {bets.length === 0 ? (
          <div className="text-center text-zinc-500 py-10">
            <Trophy className="mx-auto h-12 w-12 opacity-20 mb-3" />
            <p>Seu boletim está vazio.</p>
            <p className="text-sm mt-1">Adicione seleções para apostar.</p>
          </div>
        ) : (
          <AnimatePresence>
            {bets.map(bet => (
              <motion.div
                key={bet.matchId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 relative"
              >
                <button 
                  onClick={() => removeBet(bet.matchId)}
                  className="absolute top-2 right-2 text-zinc-500 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
                <div className="text-xs text-zinc-400 mb-1">{bet.matchTitle}</div>
                <div className="font-bold text-white">
                  {bet.selection === "home" ? "Casa" : bet.selection === "draw" ? "Empate" : "Fora"}
                </div>
                <div className="text-red-500 font-bold mt-2">{bet.odd.toFixed(2)}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {bets.length > 0 && (
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-400">Odds Totais</span>
            <span className="font-bold text-lg text-white">{totalOdds}</span>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="stake" className="text-zinc-400 text-xs">Valor da Aposta (R$)</Label>
            <Input 
              id="stake"
              type="number"
              placeholder="0.00"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white font-mono"
            />
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-400">Ganhos Potenciais</span>
            <span className="font-bold text-green-500">
              R$ {(parseFloat(stake || "0") * parseFloat(totalOdds)).toFixed(2)}
            </span>
          </div>

          <Button 
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12"
            onClick={() => {
              if (!stake) return toast.error("Insira um valor para apostar");
              toast.success("Aposta realizada com sucesso!");
              setBets([]);
              setStake("");
              setBetSlipOpenMobile(false);
            }}
          >
            APOSTAR AGORA
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-white flex flex-col dark font-sans">
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-900">
        <div className="flex items-center justify-between px-4 h-16 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <button 
              className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="font-black text-2xl tracking-tighter italic">
              <span className="text-white">BET</span><span className="text-red-600">62</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setAuthModalOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-6"
            >
              ENTRAR
            </Button>
          </div>
        </div>

        {/* TABS */}
        <div className="px-4 max-w-[1600px] mx-auto flex gap-6 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab("sports")}
            className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "sports" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <Trophy size={16} />
            ESPORTES
          </button>
          <button 
            onClick={() => setActiveTab("live")}
            className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "live" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <Activity size={16} />
            AO VIVO
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          </button>
          <button 
            onClick={() => setActiveTab("promos")}
            className={`py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-2 ${activeTab === "promos" ? "border-red-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <Gift size={16} />
            PROMOÇÕES
          </button>
        </div>
      </header>

      {/* SIDEBAR OVERLAY */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div 
              initial={{ x: "-100%" }} 
              animate={{ x: 0 }} 
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-zinc-950 border-r border-zinc-800 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="font-black text-xl tracking-tighter italic">
                  <span className="text-white">BET</span><span className="text-red-600">62</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="text-zinc-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto">
                <div className="mb-8">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Principais Ligas</h4>
                  <ul className="space-y-2">
                    {["Brasileirão", "Premier League", "La Liga", "Serie A"].map(league => (
                      <li key={league}>
                        <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-zinc-900 text-sm text-zinc-300 hover:text-white transition-colors">
                          <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px]">⚽</div>
                          {league}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Esportes</h4>
                  <ul className="space-y-2">
                    {[
                      { icon: <Target size={16} />, label: "Futebol" },
                      { icon: <Dribbble size={16} />, label: "Basquete" },
                      { icon: <Trophy size={16} />, label: "Tênis" },
                      { icon: <Gamepad2 size={16} />, label: "E-Sports" },
                    ].map(sport => (
                      <li key={sport.label}>
                        <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-zinc-900 text-sm text-zinc-300 hover:text-white transition-colors">
                          <div className="text-red-500">{sport.icon}</div>
                          {sport.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <main className="flex-1 p-4 lg:p-8 pb-32 lg:pb-8">
          
          {activeTab === "sports" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                <Trophy className="text-red-600" /> Próximos Eventos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {MATCHES.map(match => <MatchCard key={match.id} match={match} />)}
              </div>
            </div>
          )}

          {activeTab === "live" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                <Activity className="text-red-600" /> Jogos ao Vivo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {MATCHES.filter(m => m.isLive).map(match => <MatchCard key={match.id} match={match} />)}
                {MATCHES.filter(m => m.isLive).length === 0 && (
                  <div className="col-span-full py-20 text-center text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    Nenhum jogo ao vivo no momento.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "promos" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-black italic uppercase tracking-tight mb-6 flex items-center gap-2">
                <Gift className="text-red-600" /> Promoções Bet62
              </h2>
              
              <div className="space-y-6">
                {/* Hero Promo */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-900 to-zinc-900 border border-red-500/30 p-8 lg:p-12">
                  <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                    <Trophy size={200} />
                  </div>
                  <div className="relative z-10 max-w-2xl">
                    <div className="inline-block bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">NOVO CLIENTE</div>
                    <h3 className="text-4xl lg:text-5xl font-black italic tracking-tighter mb-4">
                      BÔNUS DE ATÉ <span className="text-red-500">R$ 500</span>
                    </h3>
                    <p className="text-lg text-zinc-300 mb-8 max-w-xl">
                      100% no primeiro depósito. Cadastre-se, deposite e dobre seu saldo instantaneamente para apostar nos seus esportes favoritos.
                    </p>
                    <Button 
                      size="lg" 
                      className="bg-red-600 hover:bg-red-700 text-white font-bold text-lg px-8 h-14"
                      onClick={() => toast.success("Bônus ativado com sucesso!")}
                    >
                      ATIVAR BÔNUS
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xl font-bold italic mb-2">Cashback de Sexta</h4>
                      <p className="text-zinc-400 text-sm mb-6">Receba 10% de volta em todas as suas apostas perdidas durante a sexta-feira.</p>
                    </div>
                    <Button variant="outline" className="w-full border-zinc-700 text-white hover:bg-zinc-800">Saber Mais</Button>
                  </div>
                  <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xl font-bold italic mb-2">Múltipla Turbinada</h4>
                      <p className="text-zinc-400 text-sm mb-6">Aumente seus ganhos em até 50% fazendo apostas múltiplas com 4+ seleções.</p>
                    </div>
                    <Button variant="outline" className="w-full border-zinc-700 text-white hover:bg-zinc-800">Saber Mais</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* DESKTOP BET SLIP */}
        <aside className="hidden lg:block w-96 border-l border-zinc-900 bg-zinc-950 sticky top-16 h-[calc(100vh-4rem)]">
          <BetSlipContent />
        </aside>
      </div>

      {/* MOBILE BET SLIP DRAWER */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        {bets.length > 0 && (
          <Drawer open={betSlipOpenMobile} onOpenChange={setBetSlipOpenMobile}>
            <DrawerTrigger asChild>
              <Button className="bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg shadow-red-900/20 px-6 h-14 font-bold flex gap-3">
                BOLETIM <span className="bg-white text-red-600 rounded-full w-6 h-6 flex items-center justify-center text-xs">{bets.length}</span>
              </Button>
            </DrawerTrigger>
            <DrawerContent className="bg-zinc-950 border-zinc-800 text-white h-[85vh] p-0">
              <BetSlipContent />
            </DrawerContent>
          </Drawer>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-12 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 text-center">
          <div className="font-black text-3xl tracking-tighter italic opacity-20 mb-8">
            <span>BET</span><span>62</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-zinc-500 mb-8">
            <a href="#" className="hover:text-white transition-colors">Termos e Condições</a>
            <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
            <a href="#" className="hover:text-white transition-colors">Jogo Responsável</a>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-zinc-600">
            <div className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center font-bold">18+</div>
            <span>© 2026 Bet62 • Apostas Responsáveis</span>
          </div>
        </div>
      </footer>

      {/* MATCH DETAIL MODAL */}
      <Dialog open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-lg">
          {selectedMatch && (
            <>
              <DialogHeader>
                <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 mb-2">
                  <span>{selectedMatch.league}</span>
                  <span className={selectedMatch.isLive ? "text-red-500" : ""}>{selectedMatch.isLive ? "AO VIVO" : selectedMatch.time}</span>
                </div>
                <DialogTitle className="text-2xl font-bold text-center py-4">
                  {selectedMatch.home} <span className="text-zinc-500 text-sm mx-2">vs</span> {selectedMatch.away}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider">Resultado Final</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => toggleBet(selectedMatch, "home")} className="bg-zinc-900 border border-zinc-800 hover:border-red-500 hover:bg-zinc-800 p-3 rounded-lg flex flex-col items-center transition-colors">
                      <span className="text-xs mb-1">Casa</span>
                      <span className="font-bold text-lg text-white">{selectedMatch.odds.home.toFixed(2)}</span>
                    </button>
                    <button onClick={() => toggleBet(selectedMatch, "draw")} className="bg-zinc-900 border border-zinc-800 hover:border-red-500 hover:bg-zinc-800 p-3 rounded-lg flex flex-col items-center transition-colors">
                      <span className="text-xs mb-1">Empate</span>
                      <span className="font-bold text-lg text-white">{selectedMatch.odds.draw.toFixed(2)}</span>
                    </button>
                    <button onClick={() => toggleBet(selectedMatch, "away")} className="bg-zinc-900 border border-zinc-800 hover:border-red-500 hover:bg-zinc-800 p-3 rounded-lg flex flex-col items-center transition-colors">
                      <span className="text-xs mb-1">Fora</span>
                      <span className="font-bold text-lg text-white">{selectedMatch.odds.away.toFixed(2)}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider">Mais Mercados</h4>
                  <div className="space-y-2">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm font-medium">Total de Gols: Mais de 2.5</span>
                      <span className="font-bold text-red-500">1.85</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm font-medium">Total de Gols: Menos de 2.5</span>
                      <span className="font-bold text-red-500">1.95</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm font-medium">Ambas Equipes Marcam: Sim</span>
                      <span className="font-bold text-red-500">1.75</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AUTH MODAL */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md p-0 overflow-hidden">
          <div className="bg-zinc-900 p-6 border-b border-zinc-800 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-red-600/10 blur-xl"></div>
            <div className="relative font-black text-3xl tracking-tighter italic">
              <span className="text-white">BET</span><span className="text-red-600">62</span>
            </div>
          </div>
          
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="w-full bg-zinc-950 border-b border-zinc-800 rounded-none p-0 h-auto">
              <TabsTrigger value="login" className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-600 py-4 text-sm font-bold uppercase">Entrar</TabsTrigger>
              <TabsTrigger value="register" className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-600 py-4 text-sm font-bold uppercase">Criar Conta</TabsTrigger>
            </TabsList>
            
            <div className="p-6">
              <TabsContent value="login" className="mt-0 space-y-4">
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" placeholder="seu@email.com" className="bg-zinc-900 border-zinc-800 text-white" required />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password">Senha</Label>
                      <a href="#" className="text-xs text-red-500 hover:text-red-400">Esqueceu a senha?</a>
                    </div>
                    <Input id="password" type="password" placeholder="••••••••" className="bg-zinc-900 border-zinc-800 text-white" required />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 mt-2">ENTRAR</Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register" className="mt-0 space-y-4">
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Nome Completo</Label>
                    <Input id="reg-name" type="text" placeholder="Seu nome" className="bg-zinc-900 border-zinc-800 text-white" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">E-mail</Label>
                    <Input id="reg-email" type="email" placeholder="seu@email.com" className="bg-zinc-900 border-zinc-800 text-white" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Senha</Label>
                    <Input id="reg-password" type="password" placeholder="••••••••" className="bg-zinc-900 border-zinc-800 text-white" required />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 mt-2">CRIAR CONTA</Button>
                </form>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

    </div>
  );
}
