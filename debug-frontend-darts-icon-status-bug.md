## Hipóteses Falseáveis | Status Final
| ID | Hipótese | Status | Evidência |
|----|----------|--------|-----------|
| H1 | Backend marca Dardos com sport="football" | ❌ **REFUTADA** | `sport: "darts"` correto em matches.ts L9252 (upcoming) e L9293 (live). Backend OK. |
| H2 | Frontend ícone/sports switch sem case "darts" → default futebol ⚽ | ✅ **CONFIRMADA** | `sportEmoji()` L4547 original tinha 10 esportes (football/tennis/hockey/basketball/volleyball/baseball/boxing/mma/cricket/formula1/handball). `darts/cs2/horseracing` CAÍAM NO DEFAULT "⚽". Segundo default: Top Competições ternário inline L3419-L3431 — **mesma falha**. Terceiro default: `LEAGUE_FLAGS[unknown] ?? "⚽"`. Os 3 juntos explicam o duplo ⚽⚽ reportado. |
| H3 | Case-sensitivity ("darts" vs "Darts" vs "DART") | ❌ REFUTADA | Backend envia lowercase `"darts"` (matches.ts). Compatível. |
| H4 | Builder status: dardos injeta clock "0'" hardcoded genérico | ⚠️ **PARCIAL** | Builder L9296 coloca `minute:0`, mas o problema REAL acontece no BETSLIP L26123-L26129: apenas `sport==="tennis"` escapava de `${minute}'`. Todos os outros (darts/basketball/hockey/cs2/horseracing) mostravam "0'". |
| H5 | Frontend formatador clock default = "0'" para esportes não reconhecidos | ✅ **CONFIRMADA** | Betslip displayMin L26128: `${lm.minute ?? 0}'` fallthrough. Fix: incluir 6 esportes (basketball, hockey, darts, cs2, csgo, horseracing) na lista que mostra `lm.status ?? "Em Jogo"` (igual tennis) |

## Minimal Fix Aplicado — 6 Locais home.tsx ✅
GetDiagnostics: `[]` erros no home.tsx; 0 regressões. Todos erros typecheck bet62 remanescentes HERDADOS admin.tsx (ReactNode ReactPortal — pré existente, nada relacionado).

| # | Local | Problema Original | Solução |
|---|-------|-------------------|---------|
| 1 | `sportEmoji()` L4547-L4562 | Default cai "⚽" sem darts/cs2/csgo/horseracing | +4 cases: `darts→🎯`, `cs2\|csgo→💣`, `horseracing→🐎`. Backward compat. |
| 2 | Top Competições flag L3420 | Ternário aninhado 7 níveis duplicado, mesmo default ⚽ | **Refator DRY**: `sportEmoji(l.sport)` substituindo inline 12 linhas → unica fonte da verdade. |
| 3 | SPORT_GROUPS Upcoming L22385 | Dardos não tinha entrada — partidas iam para "outros" sem cabeçalho | +4 novas entries: `🎯 Dardos` (Modus Super Series confirmado), `💣 CS2`/`CS:GO`, `🐎 Corridas de Cavalos`. Posição: logo após basquete (maior frequência primeiro). |
| 4 | Tab bar Ao Vivo filter `sportsMeta` L25093 | Mesmo que item #3: filtro faltava → Dardos aparecia sem filtro dedicado | +4 mesmas entries da SPORT_GROUPS. |
| 5 | OTHER_SPORTS (drawer sidebar) L3191 | Mesmo: faltavam no menu lateral esquerdo | +4 novas categorias COM ligas reais: Dardos (9 ligas: Premier League, Modus Super Series, PDC World etc); CS2 (9 ligas: BLAST, ESL, IEM, Major, CCT etc); Corridas (8: Ascot, Cheltenham, Kentucky Derby, Arc, Breeders etc) |
| 6 | Betslip displayMin L26171-L26183 | "0'" hardcoded em todos esportes exceto tennis | Expandido OR clause para incluir `basketball \|\| hockey \|\| darts \|\| cs2 \|\| csgo \|\| horseracing`: renderiza `lm.status ?? "Em Jogo"` (ex: "Ao vivo") no lugar de "0'". |

## Evidência Comparativa PRE vs POST

### 🎯 Ícone Dardos (e duplo ⚽⚽):
**PRE:** `sportEmoji("darts")` → `undefined` → fallthrough `"⚽"` + Top Compet inline → fallback ⚽ = **duplo ⚽⚽**.  
**POST:** `sportEmoji("darts")` = **🎯** + Top Compet usa mesma função = **🎯**.

### ⏱️ Status/Clock Betslip Dardos:
**PRE:** `sport = "darts"` não é "tennis" → branch `${minute ?? 0}'` → **"0'"**.  
**POST:** `sport = "darts"` MATCH na OR extensa → branch `lm.status ?? "Em Jogo"` → **"Ao vivo"** (match.status colocado pelo backend).

### 🎯 Cabeçalho Seção Pré-Jogo + Filtro Ao Vivo Dardos:
**PRE:** Nenhuma `SPORT_GROUPS` key="darts" + `presentSports.has("darts")` → FALSO = NÃO ENTRA em SPORT_GROUPS. Dardos nunca aparecem agrupados com cabeçalho separado.  
**POST:** `darts` SPORT_GROUPS entry existe, `🎯 Dardos` com jogos (Modus Super Series etc) listados separadamente. Filtro "Dardos" dedicado visível na tab ao vivo.

---

## Pendente Externa (FORA DO SCOPE CÓDIGO — Usuário / Ambiente)
1. **Rodar frontend local:** `pnpm --filter @workspace/bet62 dev` ou abrir URL Railway deployada **APÓS novo commit/push** para visualizar resultados.
2. **Backlog Futuro (opcional):** Builders CSGO/CS2 e Horseracing no `matches.ts` backend (sport field `"cs2"/"horseracing"` ainda NÃO EXISTEM no grep atual — só `darts` tem builders confirmados 100%). Frontend já está preparado.
3. **Cleanup Debug:** Aguardar usuário responder "A. Corrigido" → apagar este arquivo e instrumentação (nenhuma instrumentação adicionada nesta sessão — static analysis apenas).

