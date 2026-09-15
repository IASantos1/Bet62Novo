# Tasks: GOALDIR Validação Real + Correções + Desativar api-tennis

Espec: .trae/specs/goaldir-real-validation/spec.md | Versão: 1.0

Ordem de execução recomendada: T1 → T2 → T3 → T4 → (T5 opcional) → T6

---

## TASK 1 — Corrigir BUG-A: Tênis Live Array Puro (getBzzoiroTennisLive) + Horseracing Array Puro

**ACs relacionados:** AC-R4

**Arquivos a editar:**
1. `artifacts/api-server/src/providers/bzzoiro/tennis.ts` (função `getBzzoiroTennisLive()` L102-111)
2. `artifacts/api-server/src/providers/bzzoiro/horseracing.ts` (se existir função live / next-to-jump; criar stub se necessário; SPEC-2 mostrou /horseracing/api/v2/races/next-to-jump retorna array puro)
3. (Auditoria) Verificar basketball.ts / hockey.ts / darts.ts / csgo.ts live endpoints se também retornam array puro — SPEC-2 não validou live desses; por segurança usar mesmo padrão defensivo.

**Passos exatos:**

### 1.1 `tennis.ts` getBzzoiroTennisLive()
Antes: `const resp = await tennisGet<...>("/matches/live/"); return resp.results ?? [];`
Problema: resposta REAL é array puro, não objeto com campo results.
- **Alterar lógica:** Se `Array.isArray(resp)` → retornar `resp as BzzoiroTennisMatch[]`; senão retornar `resp.results ?? []`. (Pattern defensivo)

### 1.2 `tennis.ts` header comentário L17-19
Antes: "Wired as an ADDITIONAL candidate (never a hard cut of api-tennis.com)"
Depois: "FONTE ÚNICA de tênis. api-tennis.com DESATIVADO DEFINITIVAMENTE."

### 1.3 Arquivos basquete/hóquei/dardos/csgo live — pattern defensivo
Auditar `getBzzoiro{Basketball,Hockey,Darts,CS2}Live()`. Se hoje esperam `.results`, adicionar mesmo fallback `Array.isArray(resp) ? resp : resp.results ?? []`. Para não introduzir bug em outros esportes se GOALDIR também retorna array puro lá.

### 1.4 Horseracing next-to-jump (se builder existe)
Auditar providers/bzzoiro/horseracing.ts se existe função `getBzzoiroHorseracingUpcoming / getBzzoiroHorseracingRaces`. Se sim, também aplicar fallback array puro.

**Verificação T1:** Apagar script temporário .tmp-validate-goaldir-real.mjs do workspace se ainda existir. Chamar wrapped função getBzzoiroTennisLive com ENV setado → length >= 0 real, não sempre 0.

---

## TASK 2 — Adicionar `status=` correto em TODOS builders upcoming REST (RF-6)

**ACs relacionados:** AC-R5

**Arquivos a editar:**
- `tennis.ts` getBzzoiroTennisUpcoming (L80-99) — adicionar params: `status: "scheduled"`
- `basketball.ts` getBzzoiroBasketballUpcoming — adicionar `status: "scheduled"`
- `hockey.ts` getBzzoiroHockeyUpcoming — adicionar `status: "scheduled"`
- `darts.ts` getBzzoiroDartsUpcoming — adicionar `status: "scheduled"`
- `csgo.ts` getBzzoiroCSGOUpcoming — adicionar `status: "notstarted"`
- (Futebol client.ts getBzzoiroUpcomingEvents → SEM status filter por enquanto. HC-8 permite.)

**Verificação T2:** Grep por cada `rawGet`/`<sport>Get` upcoming → `status` definido correto no objeto params.

---

## TASK 3 — Desativar Definitivamente api-tennis.com (RF-4)

**ACs relacionados:** AC-R3, RNF-3

**Arquivos a editar:**
1. `artifacts/api-server/src/routes/matches.ts` → 3 LOCAIS: rebuildUpcomingCache, buildLivePayload, refreshUpcomingTop
2. `artifacts/api-server/src/lib/config.ts` (opcional: comentário obsoleto TENNIS_API_KEY)
3. `.env.example` raiz → marcar TENNIS_API_KEY como OBSOLETO; GOALDIR FONTE ÚNICA.

**Passos exatos:**

### 3.1 rebuildUpcomingCache L10499-10518 (tennisCandidates)
Antes:
```ts
const tennisCandidates: ... = [];
if (CONFIG.TENNIS_API_KEY) { tennisCandidates.push({ provider: "apitennis", matches: await buildTennisUpcomingFromApiTennis() }); }
if (CONFIG.BZZOIRO_API_KEY) { tennisCandidates.push({ provider: "bzzoiro", matches: await buildTennisUpcomingFromBzzoiro() }); }
```
Depois: **apagar bloco `if (CONFIG.TENNIS_API_KEY)` completamente.** Deixar só candidato bzzoiro.

### 3.2 buildLivePayload (tennis live candidates) ~ L10646
Antes: 2 candidatos (apitennis primeiro, depois bzzoiro). Depois: **apenas 1 candidato bzzoiro `buildTennisLiveFromBzzoiro`.** Apagar bloco apitennis.

### 3.3 refreshUpcomingTop (tennisCandidates) ~ L11684-11692
Mesmo padrão 3.1: só bzzoiro. Apagar apitennis.

### 3.4 lib/config.ts
`TENNIS_API_KEY = process.env["TENNIS_API_KEY"] ?? "";` não precisa mudar (ainda pode ser lido mas nunca usado em fluxo decisões — aceitável). Opcional adicionar comentário `// OBSOLETO: GOALDIR/BZZOIRO FONTE ÚNICA TÊNIS.`

### 3.5 .env.example
Na seção Tênis antiga (se existir linha `TENNIS_API_KEY=`), prefixar com `# OBSOLETO — USAR BZZOIRO FONTE ÚNICA. API-TENNIS DESATIVADO 2026-09-15.`.

### 3.6 (Opcional) Rotas admin /test com TENNIS_API_KEY
Grep: se existir rota health com apitennis, marcar status=offline como outros provedores removidos (igual providerHealth.ts stubs OFFLINE). Se não existir, não precisa.

**Verificação T3:** Grep `matches.ts` — 0 ocorrências `buildTennisUpcomingFromApiTennis` e `buildTennisLiveFromApiTennis` dentro de arrays `tennisCandidates.push(...)`. Apenas podem aparecer como imports se não forem usados (remover import morto se houver).

---

## TASK 4 — Fortalecer Futebol Pré-Jogos APARECEM: Melhoria Logs + Ambiente Obrigatório (RF-3)

**ACs relacionados:** AC-R1. IMPORTANTE: SPEC-2 validou builder funciona (592 PASS). O que falta é chave + diagnóstico rápido.

**Arquivos a editar:**
1. `artifacts/api-server/src/api/index.ts` — bloco `runBzzoiroPrematchSweep` startup e cron
2. `.env.example` raiz — seção BZZOIRO reforçar obrigatoriedade chave.

**Passos exatos:**

### 4.1 api/index.ts — Logs diagnósticos no cron
No bloco que chama `runBzzoiroPrematchSweep` (startup e cada 3min), ENVELOPAR com:
```ts
const t0 = Date.now();
const beforeIds = /* (opcional) não precisa */
const result = await runBzzoiroPrematchSweep(startDate, endDate);
// Log INFO: "[prematch-bzzoiro] sweep concluído em Xms. Janela YYYY-MM-DD -> YYYY-MM-DD. fetchRawTotal=N builderPass=M primePrices=K alreadyPriced=L cacheSize=P"
```
Se `runBzzoiroPrematchSweep` não retorna objeto com contagens hoje, alterar o retorno (no arquivo `providers/bzzoiro/prematchPriceCache.ts` ou onde estiver) para retornar `{ fetched, priced, alreadyPriced, elapsedMs }`. Se for muito invasivo, pelo menos logar antes de chamar a contagem bruta do `getBzzoiroUpcomingEvents`.

### 4.2 api/index.ts — WARN imediato se BZZOIRO_API_KEY vazia no startup
Hoje já existe rubrica logs. Adicionar no bloco `[providers]` startup: `if (!CONFIG.BZZOIRO_API_KEY) logger.warn("[providers] BZZOIRO_API_KEY VAZIA: FUTEBOL/TENIS/ESPORTES TODOS retornarão ZERO partidas upcoming/live! Configure no Railway/.env.");`

### 4.3 .env.example
Na seção BZZOIRO:
```
# OBRIGATÓRIO (FONTE ÚNICA TODOS OS ESPORTES). Sem esta chave, ZERO partidas aparecem em pré-jogo e ao vivo.
BZZOIRO_API_KEY=
```

### 4.4 (Opcional — sem esforço) routes/matches.ts L8020: log diagnóstico 1x por hora buildFootballUpcomingFromBzzoiro contagens
Adicionar throttled log info: quando buildFootballUpcomingFromBzzoiro roda, 1x por hora logar `[bzzoiro-football-upcoming] raw=${events.length} pass=${results.length} statusFiltered=X leagueFiltered=Y noTeam=Z priceCached=W`. Útil QA.

**Verificação T4:** Typecheck 0 erros.

---

## TASK 5 — (Opcional, RF-5) Validar Conexão WebSocket GOALDIR Futebol + Tênis

**ACs relacionados:** Nenhum direto (opcional).

**Passos exatos:**
Criar script temporário `.tmp-ws-validate.mjs` (NÃO commitar) usando biblioteca `ws` instalada ou `WebSocket` nativo Node 24 (se suportar — Node 22+ sim).:
1. Conectar `wss://sports.bzzoiro.com/live/football/?token=<KEY>`
2. Esperar 5s; se não fechar 4401 ou 4402 → sucesso auth;
3. Pegar qualquer match ID de GET /events/live (ex: request 3 id 601555) → enviar frame subscribe;
4. Esperar 5s mais → pelo menos frame ping ou subscribed.
5. Conectar `wss://sports.bzzoiro.com/ws/live/?token=<KEY>` → enviar `{"action":"subscribe","sport":"tennis","event_id":<QUALQUER_ID_TENNIS_LIVE>}` → ver se não fecha erro.
6. Registrar resultado em review.md.
7. Apagar script temporário.

Se Node 24 tem WebSocket nativo (sim), sem precisar instalar pacotes.

---

## TASK 6 — Review Final (Qualidade + ACs)

**ACs relacionados:** TODOS (AC-R1 até AC-6-LEG)

**Passos:**

### 6.1 Typecheck
```bash
# Workspace root
pnpm --filter @workspace/libs run typecheck
pnpm --filter @workspace/api-server run typecheck
```
Espera exit 0 ambos.

### 6.2 Testes Settlement
```bash
pnpm --filter @workspace/api-server run test:settlement
```
Espera >= 201/203 passing (baseline sessão anterior).

### 6.3 Grep Audit ACs
Executar e salvar output em review.md:
1. `grep -r "buildTennisUpcomingFromApiTennis\|buildTennisLiveFromApiTennis" artifacts/api-server/src/routes/matches.ts | grep push` → 0 matches (AC-R3)
2. `grep -r "CONFIG.TENNIS_API_KEY" artifacts/api-server/src/routes/matches.ts | grep "if "` → 0 (AC-R3)
3. `grep -rE "CONFIG\.(PULSESCORE|GOAL|PROPLINE)_API_KEY" artifacts/api-server/src/routes artifacts/api-server/src/lib artifacts/api-server/src/providers --include="*.ts" | grep "if "` → 0 (AC-3-LEG)
4. `grep -rE "status:\s*['\"](scheduled|notstarted)['\"]" artifacts/api-server/src/providers/bzzoiro/` → >=5 ocorrências (AC-R5)

### 6.4 Criar `.trae/specs/goaldir-real-validation/review.md`
Conteúdo:
- Checklist AC-R1 até AC-6-LEG marcados ✔/✘ com evidências (screenshots ou command outputs texto)
- Tarefas executadas (T1..T6) com status
- Bugs encontrados vs corrigidos
- Próximos passos (ex: setar BZZOIRO_API_KEY real no Railway, deploy Railway)

### 6.5 Limpeza
- Apagar .tmp-* scripts se ainda existirem na raiz.
- `git status` → só arquivos esperados modificados (nenhum .env real, nenhum script temporário).

---

## Critérios Rollback por Task

Se qualquer task quebrar typecheck 0 → imediatamente reverter antes de passar para próxima. Ordem de rollback reversa.
