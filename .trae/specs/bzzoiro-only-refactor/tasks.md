# Bet62 — Refatoração BZZOIRO only (Plano de Implementação)

Ordem de execução: CR-1/CR-2 (bugs bloqueantes de visibilidade) primeiro → depois remoção de provedores antigos → depois limpeza/config → depois verificação.

---

## Task 1: Corrigir visibilidade pré-jogo no frontend (CR-1)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Em [home.tsx](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/bet62/src/pages/home.tsx#L7817-L7818), remover o filtro que oculta prematch BZZOIRO quando `hasRealOdds === false` e odds 0.
  - Modificar a regra: quando `m.sport === "football"` e `hasRealOdds === false`, mostrar a partida mas marcar visualmente como "Aguarde cotações" (botões desabilitados), em vez de remover do DOM.
  - A regra antiga de manter para esportes não-futebol permanece.
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-1.1: Renderizar home.tsx com Mock UpcomingMatch `{sport:"football", hasRealOdds:false, odds:{home:0,draw:0,away:0}}` → partida aparece no DOM (não filtrada), botões home/away/draw estão disabled.
  - `rule` TR-1.2: Mesmo mock com `hasRealOdds:true` → partida aparece, botões enabled.
  - `rule` TR-1.3: Mesmo mock com sport="basketball" hasRealOdds:false odds 0 → comportamento antigo mantido (filtrado OU não-apostável).
- **Notes**: Evitar brilhos; usar estilo sóbrio. A tag visual "Aguarde cotações" pode ser um Badge sutil.

---

## Task 2: Corrigir visibilidade ao vivo server-side (CR-2)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Em [matches.ts:10851-10852](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L10851-L10852), flexibilizar `isVisibleFootballFixture`.
  - Nova regra: partida de futebol é visível quando **(a)** tem `hasRealPriceSource(m._priceSource)` **OU (b)** está em status live e foi atualizada pela última vez há ≤5min (campo `marketVersion > 0` OU `existing?._missingSinceAt === undefined`).
  - Partidas sem `_priceSource` são renderizadas no payload mas com `hasRealOdds: false`; o frontend já mostra a UI de "Aguarde cotações" da Task 1.
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-2.1: Injetar em `liveMatchState` uma entry `bzzoiro-football-{id}` com `_priceSource = undefined` mas minute>0 → `buildLivePayload()` a retorna em `filteredLive`.
  - `rule` TR-2.2: Mesma entry quando `hasRealPriceSource(_priceSource)=true` → retorna normalmente.
  - `rule` TR-2.3: Entry ausente há >15s e com `_missingSinceAt` definido → continua sob desaparecimento gracioso existente.

---

## Task 3: Adicionar "bzzoiro" ao tipo FootballProvider (CR-4) e crons BZZOIRO
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - [config.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/config.ts#L265-L274): Expandir `type FootballProvider = "bzzoiro" | "goalapi" | "propline" | "pulsescore" | "statpal"`.
  - Defaults `FOOTBALL_DAILY_PROVIDER` e `FOOTBALL_ODDS_PROVIDER`: quando `BZZOIRO_API_KEY` está setada, preferir "bzzoiro" como primeiro da cadeia (antes de goalapi).
  - Em [api/index.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/api/index.ts#L192-L238): Remover o antigo cron que exige as duas chaves. Criar novo cron `runBzzoiroPrematchSweep()` que roda a cada 3 min: roda `getBzzoiroUpcomingEvents(+0..+8 dias)` e chama `primeBzzoiroPrematchPrices(eventIds)` **de forma síncrona/bloqueante no primeiro ciclo startup** (não fire-and-forget) para já popular o cache antes do primeiro rebuildUpcomingCache. Depois disso, ciclos subseqüentes podem ser fire-and-forget.
  - **Mantido**: `startBzzoiroBallSync()` já existente (line 181).
- **Acceptance Criteria Addressed**: AC-1, AC-7
- **Test Requirements**:
  - `rule` TR-3.1: `tsc --noEmit` passa; `FootballProvider` aceita valor `"bzzoiro"`.
  - `rule` TR-3.2: Simular BZZOIRO_API_KEY setada, GOAL/PULSE/PROP "" → `FOOTBALL_DAILY_PROVIDER === "bzzoiro"`.
  - `rule` TR-3.3: Start server, logs mostram que o cron BZZOIRO rodou UMA VEZ sincronamente ANTES do primeiro request ser aceito (ou imediatamente no startup, visível no log).

---

## Task 4: Remover GoalAPI, PulseScore, PropLine dos candidatos em matches.ts (CR-3 CR-4 CR-5)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - Em [rebuildUpcomingCache](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L10350-L10463), para **FUTEBOL**: apagar branches `if (CONFIG.GOAL_API_KEY) push goalapi candidates`; manter apenas `if (CONFIG.BZZOIRO_API_KEY) push bzzoiro`.
  - Em [buildLivePayload](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L10485-L10512), para **FUTEBOL**: apagar branch `if (CONFIG.GOAL_API_KEY) push goalapi candidates`; manter o buildFootballLiveFromBzzoiro (que já é o additive na linha 10504).
  - Para **BASQUETE, HÓQUEI**: remover candidatos propline (apagar `if (CONFIG.PROPLINE_API_KEY)`); deixar só BZZOIRO.
  - Para **VÔLEI, MMA, BEISEBOL**: se Q1 (open question) for "BZZOIRO não cobre", remover blocos `if (CONFIG.PROPLINE_API_KEY)` (ficam como lista vazia, sem 5xx).
  - Para **TÊNIS**: manter `CONFIG.TENNIS_API_KEY` option + BZZOIRO.
  - Mesmas mudanças em [refreshUpcomingTop](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L11587-L11699): refletir as mesmas remoções (GoalAPI football, Propline todos os esportes).
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-4.1: grep `CONFIG.GOAL_API_KEY` em matches.ts retorna 0 ocorrências.
  - `rule` TR-4.2: grep `CONFIG.PROPLINE_API_KEY` em rebuildUpcomingCache / buildLivePayload / refreshUpcomingTop retorna 0 ocorrências (exceto talvez vôlei/MMA/beisebol se usuário decidir).
  - `rule` TR-4.3: grep `CONFIG.PULSESCORE_API_KEY` em matches.ts retorna 0 ocorrências.

---

## Task 5: Remover importações não usadas e código morto (app.ts, api/index.ts, config.ts CRONs)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Em [app.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/app.ts#L26-L28) (imports GoalAPI webhook), [app.ts:316-348](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/app.ts#L316-L348) (handler `/api/webhooks/goal-api`): remover completamente. Se houver problema de tipo (usado em outro lugar), resolver.
  - Em [api/index.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/api/index.ts):
    - Remover imports de propline (line 8-9), goalApi (lines 10, 16), pulseScore (lines 13-14).
    - Remover `proplineStartupAndPeriodicCheck` e seu setInterval (lines 67-120).
    - Remover `if (CONFIG.GOAL_API_KEY)` WebSocket e setInterval (lines 129-141).
    - Remover `if (CONFIG.PULSESCORE_API_KEY)` shadowMatchSync e setInterval (lines 160-163).
    - Remover `if (CONFIG.PULSESCORE_API_KEY)` PulseScore WebSocket (lines 171-173).
    - Remover **todo** o bloco `if (CONFIG.PULSESCORE_API_KEY && CONFIG.GOAL_API_KEY) runPrematchCron…` (lines 192-238) — substituído pela Task 3.
  - Em [config.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/config.ts):
    - Manter campos PULSESCORE_*/GOAL_*/PROPLINE_* por enquanto (typecheck) mas adicionar comentário `// DESCONTINUADO — removendo na Task 9`. Alternativa: já remover todos agora se não mais referenciados (fazer no final da task se typecheck passar).
- **Acceptance Criteria Addressed**: AC-3, NFR-3
- **Test Requirements**:
  - `rule` TR-5.1: app.ts não tem handler `/api/webhooks/goal-api`.
  - `rule` TR-5.2: api/index.ts não referencia `propline.`, `goalApi.` fora comentários; não tem `proplineStartupAndPeriodicCheck`.
  - `rule` TR-5.3: `tsc --noEmit` no api-server passa.

---

## Task 6: Normalizar estatísticas BZZOIRO e alimentar matchStats + events (A-2 Q2)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - Em [ballMatchSync.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/providers/bzzoiro/ballMatchSync.ts) ou arquivo novo ao lado de oddsNormalizer.ts: criar normalizador para o payload raw de `/events/:id/stats/` → campos padrão `matchStats { possessionHome/Away, shotsHome/Away, shotsOnTargetHome/Away, cornersHome/Away, cardsHome/Away, xGHome, xGAway, ... }`.
  - No loop `buildFootballLiveFromBzzoiro`, após criar a state, chamar o stats normalizer e popular `state.matchStats` e `state.events` (incidentes).
  - Se /stats/ retornar erro ou não tiver campos: manter `matchStats undefined` sem quebrar visibilidade (compatível com CR-2 fix).
- **Acceptance Criteria Addressed**: FR-4, AC-2
- **Test Requirements**:
  - `rule` TR-6.1: Quando mocked getBzzoiroEventStatsRaw retorna xG Home 1.2, state.matchStats.xGHome === 1.2 no próximo tick.
  - `rule` TR-6.2: Quando mocked falha (reject ou 404), state.matchStats = undefined mas partida continua visível.
  - `rubric` TR-6.3: Cobertura de matchStats (campos preenchidos vs disponíveis na BZZOIRO). Scale 1-5; 1 = nenhum campo; 3 = posse/chutes/escanteios; 5 = posse/chutes/on-target/escanteios/cartões/xG/forma. Threshold >= 4.

---

## Task 7: Rotas admin (admin.ts, adminPro.ts) e health
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - Ler [adminPro.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/adminPro.ts) e [admin.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/admin.ts) e [health/providerHealth.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/health/providerHealth.ts).
  - Rotas que entregam status/dados de PulseScore, GoalAPI ou PropLine: substituir por resposta `{status: "discontinued", message: "Provedor removido; consulte /admin/bzzoiro-status", code: 410}`.
  - Se a rota for obsoleta total (ex: debug PulseScore only), retornar 410; se tiver correspondente BZZOIRO, redirecionar.
  - `providerHealth.ts`: contadores GoalAPI/Pulse/PropLine → mudar função para não mais registrar (remover import; ou retornar 0 sempre).
- **Acceptance Criteria Addressed**: AC-3, NFR-5
- **Test Requirements**:
  - `rule` TR-7.1: GET /admin/some-propline-only rota retorna status 410 ou mensagem "descontinuado".
  - `rule` TR-7.2: `providerHealth` snapshot não tem campos pulseScore/goalApi/propline com valores >0 quando suas APIs não são chamadas.

---

## Task 8: Rotas de teste (routes/test/index.ts), bets.ts, canonicalMatchCatalog, settlement.ts
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - [routes/test/index.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/test/index.ts): se endpoints de debug GoalAPI/Pulse/Prop existirem → marcar 410.
  - [bets.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/bets.ts): verificar se `_priceSource` aceita `"goalapi"` etc; manter **aceitando** para retrocompatibilidade (apostas antigas) mas **não gerar novos** (não é problema — novo é só BZZOIRO).
  - [canonicalMatchCatalog.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/canonicalMatchCatalog.ts): quaisquer funções que recebiam `provider === "goalapi"` / `"pulsescore"` → suportar `"bzzoiro"` também; se houve cron que sincronizava Goal/Pulse, trocar por BZZOIRO.
  - **Hard constraint**: [settlement.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/settlement.ts) **NÃO** alterar parsing de prefixos de ID antigos (goalapi-football-*, pulsescore-football-*, propline-*, statpal-*, football-v2-*, ps-*, gs-*). Apenas garantir que nada novo quebra. Os testes devem passar (Task 9).
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-8.1: `settlement.ts` parse de ID `"goalapi-football-1234"` retorna mesma tupla {provider,id} que antes.
  - `rule` TR-8.2: `canonicalMatchCatalog.ts` aceita provider="bzzoiro".

---

## Task 9: Limpar diretórios mortos, config.ts dead keys, .env.example; rodar typecheck + tests
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Tasks 4,5,6,7,8
- **Description**:
  - **Apagar pastas**: `artifacts/api-server/src/services/goalapi/`, `artifacts/api-server/src/services/propline/`, `artifacts/api-server/src/providers/pulsescore/` **inteiras**.
  - Em `config.ts`: apagar todas as constantes `GOAL_API_*`, `PULSESCORE_*`, `PROPLINE_*` que não forem mais lidas (nesta altura já devem ser 0 referências ativas).
  - Em `.env.example`: remover seções **8.1 (PulseScore old)** / **8.8 PropLine** / **8.9 Goal API** / **8.11 PulseScore (api.pulsescore.net)** — ou comentar header "DESCONTINUADO". Atualizar **8.7 Seleção provider** para dizer que "bzzoiro é o default". Atualizar **8.12 BZZOIRO** para dizer que É O PROVEDOR PRINCIPAL E ÚNICO (agora cobre fixtures/odds/stats/xG e bola).
  - Rodar typecheck dos dois workspaces. Rodar testes relevantes: `test:settlement`, `test:core`.
- **Acceptance Criteria Addressed**: AC-3, AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-9.1: Pastas goalapi, propline, pulsescore dentro de src/services e src/providers não existem ou são vazias.
  - `rule` TR-9.2: `pnpm typecheck` (ou `npm run typecheck`) em `artifacts/api-server/` → exit 0.
  - `rule` TR-9.3: `pnpm typecheck` em `artifacts/bet62/` → exit 0.
  - `rule` TR-9.4: Se possível rodar, `pnpm test:settlement` → todos testes que passavam antes continuam passando (compatibilidade de liquidação histórica).

---

## Task 10: Logs de inicialização e health de provedores
- **Status**: `pending`
- **Priority**: low
- **Depends On**: Task 5, Task 7
- **Description**:
  - No startup do server (api/index.ts server.listen callback), adicionar bloco de log estruturado:
    `{msg:"Provedores esportivos inicializados", football:{daily:CONFIG.FOOTBALL_DAILY_PROVIDER, odds:CONFIG.FOOTBALL_ODDS_PROVIDER, bzzoiroKey: !!CONFIG.BZZOIRO_API_KEY}, tennis:{apiTennis: !!CONFIG.TENNIS_API_KEY, bzzoiro: !!CONFIG.BZZOIRO_API_KEY}, discontinued: ["goalapi","pulsescore","propline"]}`.
  - Adicionar warning se `!CONFIG.BZZOIRO_API_KEY`: `[warn] BZZOIRO_API_KEY não configurada — Nenhum esporte coletará dados!`.
- **Acceptance Criteria Addressed**: AC-8 (rubric)
- **Test Requirements**:
  - `rubric` TR-10.1: Clareza dos logs. Scale 1-5; 1 = sem logs novos; 3 = log único com chaves; 5 = log estruturado + warning se chave faltar. Threshold >= 4.
