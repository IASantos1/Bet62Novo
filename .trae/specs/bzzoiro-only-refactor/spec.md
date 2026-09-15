# Bet62 — Refatoração: BZZOIRO como Único Provedor Esportivo

## Overview
- **Summary**: Remover completamente as integrações com PulseScore, GoalAPI (Goal-API) e PropLine, e elevar a BZZOIRO como provedora única e autoritativa para TODAS as modalidades esportivas: descoberta de fixtures (pré-jogo e ao vivo), odds e mercados (1X2, Handicap, O/U, BTTS, CS, etc.), estatísticas detalhadas (xG, posse, chutes, escanteios, cartões), posição real da bola (x/y) e placar ao vivo para liquidação.
- **Purpose**: Reduzir complexidade, eliminar redundância cruzada de provedores, remover gargalos de sincronia que hoje impedem o futebol de aparecer em pré-jogo e ao vivo, e ter um único SLA (BZZOIRO) para toda a experiência esportiva.
- **Target Users**: Jogadores finais da Bet62 (futebol e demais esportes) e equipe operacional (admin).

## Goals
- **G1**: Futebol pré-jogo e ao vivo aparecem na home e nas páginas de esporte sem filtros silenciosos que ocultem jogos válidos.
- **G2**: BZZOIRO entrega tudo o que PulseScore/GoalAPI/PropLine entregavam combinados: fixtures, odds, mercados, estatísticas, xG, placar ao vivo, posição da bola.
- **G3**: Nenhuma referência a PulseScore, GoalAPI ou PropLine permaneça em código ativo, configuração kill-switch, crons ou rotas de dados.
- **G4**: Liquidação de apostas de futebol continua usando placar final autoritativo da BZZOIRO.
- **G5**: Demais esportes com cobertura BZZOIRO (basquete, hóquei, tênis, dardos) continuam funcionando; esportes sem cobertura (vôlei, MMA, beisebol) tem comportamento explícito.

## Non-Goals
- **NG1**: Não introduzir novos provedores esportivos além da BZZOIRO.
- **NG2**: Não alterar sistema de pagamentos, casino, auth ou KYC.
- **NG3**: Não alterar schema do banco (apenas código de integração).
- **NG4**: Não re-implementar lógica de odds artificiais/sintéticas; preços que não vêm da BZZOIRO devem mostrar "sem cotação" e não devem ser apostáveis.
- **NG5**: Não remover api-tennis.com caso exista como alternativa de tênis; esta refatoração foca em Pulse/Goal/PropLine.

## Background & Context
Mapeamento realizado em 15/09/2026 sobre `artifacts/api-server/src` e `artifacts/bet62/src` revelou **6 causas-raiz** para o futebol não aparecer, junto com as integrações a remover:

### Causas-Raiz Identificadas
**CR-1 — Pré-jogo: Filtro explícito de hasRealOdds=false no frontend**
- [home.tsx](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/bet62/src/pages/home.tsx#L7817-L7818): `m.hasRealOdds !== false || (m.odds.home > 0 && m.odds.away > 0)`
- `buildFootballUpcomingFromBzzoiro` em [matches.ts:7988](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L7988-L8043) grava `hasRealOdds: !!cachedPrice` → **antes do primeiro pricing assíncrono (primeBzzoiroPrematchPrices) completar, todo jogo tem hasRealOdds=false + odds={0,0,0}**, e o filtro home.tsx remove todos. Resultado: lista vazia.

**CR-2 — Ao vivo: Filtro server-side hasRealPriceSource antes da chegada do primeiro WS odds frame**
- [matches.ts:10851-10852](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L10851-L10852): `isVisibleFootballFixture` exige `_priceSource === "bzzoiro"`
- `_priceSource` só é escrito por `handleOdds()` em [ballMatchSync.ts:282](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/providers/bzzoiro/ballMatchSync.ts#L282), que roda apenas após o WebSocket da BZZOIRO entregar um frame `odds` válido com 3 pernas >1.
- Race: primeiro tick do `buildFootballLiveFromBzzoiro` grava state com `_priceSource: undefined` no liveMatchState; o filtro isVisibleFootballFixture expulsa todas as partidas deste tick. Apenas no tick SEGUINTE (após WS odds frame ter rodado) elas reaparecem.

**CR-3 — Cron de prematch depende de GOAL_API_KEY e PULSESCORE_API_KEY ambas "on"**
- [api/index.ts:192](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/api/index.ts#L192): `if (CONFIG.PULSESCORE_API_KEY && CONFIG.GOAL_API_KEY)` é condição para rodar o cron de prematch. Como ambas estão hardcoded `""` (kill-switches em [config.ts:143](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/config.ts#L143) e [config.ts:189](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/config.ts#L189)), este cron NUNCA roda — porém o equivalente BZZOIRO (primeBzzoiroPrematchPrices) é fire-and-forget e não tem garantia de rodar antes do primeiro rebuildUpcomingCache.

**CR-4 — Tipo FootballProvider não inclui "bzzoiro"**
- [config.ts:265-274](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/lib/config.ts#L265-L274): `type FootballProvider = "goalapi" | "propline" | "pulsescore" | "statpal"` — BZZOIRO não existe como opção de tipo. Embora a lógica real de matches.ts use gates explícitos `if (CONFIG.BZZOIRO_API_KEY)`, as variáveis `FOOTBALL_DAILY_PROVIDER` e `FOOTBALL_ODDS_PROVIDER` tem defaults que caem para "pulsescore" (provavelmente sem efeito hoje, mas inconsistente).

**CR-5 — Qualidade de prematch BZZOIRO falha no primeiro ciclo**
- Limiares em [matches.ts:837-840](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/routes/matches.ts#L837-L840): `UPCOMING_MIN_ANY_ODDS_RATIO = 0.35`. Primeiro ciclo BZZOIRO tem withAnyOdds=0 → accepted=false. Embora `chooseUpcomingProvider` ainda retorne a única candidata, o debug de qualidade marca como rejeitado; isto é fragilidade: se houver mais de uma candidata, pode-se escolher a errada.

**CR-6 — Vôlei e MMA: sem candidato BZZOIRO**
- rebuildUpcomingCache linhas 10430-10453 e refreshUpcomingTop 11654-11669: vôlei e MMA só aceitam PROPLINE como candidato. Após remover PropLine, estes esportes somem completamente. Precisa confirmar: BZZOIRO cobre vôlei/MMA? Se não, comportamento esperado é lista vazia explícita.

### Inventário de Módulos a Remover/Alterar
- **PulseScore (providers/pulsescore/)**: 7 arquivos + referências em rotas, canonical, settlement, health, markets/suspension
- **GoalAPI (services/goalapi/)**: 5 arquivos + referências em app.ts webhook handler, routes/matches.ts builders, settlement, health
- **PropLine (services/propline/)**: 9 arquivos + referências em rotas, admin, canonical, health
- **Config**: kill-switches hardcoded devem virar remoção definitiva; FootballProvider atualizado
- **api/index.ts**: crons de Probe/Quota Propline, WS GoalAPI/PulseScore, Prematch Cron (goalo+pulse) → substituídos por crons BZZOIRO
- **app.ts**: webhook GOAL API handler → removido
- **settlement.ts**: prefixos de ID goalapi-football-*, pulsescore-football-*, propline-* → manter compatibilidade de liquidação histórica (hard constraint do projeto)

## Functional Requirements
- **FR-1**: Ao iniciar com `BZZOIRO_API_KEY` definida, o backend deve descoberta de **fixtures de futebol pré-jogo** usando exclusivamente `buildFootballUpcomingFromBzzoiro` (sem fallback GoalAPI/Pulse/Propline).
- **FR-2**: Ao iniciar com `BZZOIRO_API_KEY` definida, o backend deve descoberta de **fixtures de futebol ao vivo** usando exclusivamente `buildFootballLiveFromBzzoiro` + dados do WS BZZOIRO.
- **FR-3**: Odds e mercados de futebol (1X2, O/U linhas 0.5–6.5, BTTS, Handicap Asiático com linhas, Dupla Chance, DrawNoBet, Resultado Intervalo 1T, HT/FT, Placar Exato, Cantos, Cartões, Artilheiros) devem ser 100% derivados da BZZOIRO (REST odds-summary, REST odds-feed e WS `odds` frame).
- **FR-4**: Estatísticas de futebol (xG, posse, chutes/no alvo, escanteios, cartões, H2H, forma recente, lineups, commentary ao vivo) devem ser extraídas da BZZOIRO REST `/events/:id/stats/` e `/events/:id/incidents/`.
- **FR-5**: Posição real da bola (x/y, lado, situação, comentário) continua vindo do WS BZZOIRO frame `livedata`.
- **FR-6**: Placar ao vivo autoritativo para liquidação vem do WS BZZOIRO frame `event` (score.home, score.away, time.minute). Função `finalizeStaleLiveMatch` deve continuar acionada após desaparecimento gracioso de 15s.
- **FR-7**: Basquete, hóquei, tênis e dardos usam BZZOIRO com candidatos existentes; o choiceUpcomingProvider/chooseLiveProvider deve preferir BZZOIRO quando houver (sem fallback a Propline).
- **FR-8**: Vôlei, MMA, beisebol: após remover Propline, quando BZZOIRO não oferece cobertura, a lista retornada vazia é o comportamento correto; não deve haver erro 5xx.
- **FR-9**: Nenhuma rota ativa do backend lê ou depende de `PULSESCORE_API_KEY`, `GOAL_API_KEY` ou `PROPLINE_API_KEY` (esses campos podem permanecer em CONFIG export apenas para compatibilidade de tipo, mas nunca são lidos — ou removidos completamente).
- **FR-10**: Compatibilidade histórico: IDs de partidas antigas com prefixos `goalapi-football-*`, `pulsescore-football-*`, `propline-*`, `statpal-*`, `football-v2-*`, `ps-*`, `gs-*` continuam válidos para leitura e liquidação de apostas já abertas — NÃO devem ser quebrados. Liquidação incremental deve continuar usando os prefixos antigos em tabelas `settlementQueue` e `matchResultsTable`.
- **FR-11**: Rota GET `/api/admin/bzzoiro-status` e detalhes de subscrição devem continuar funcionando como janela de debug (não removê-las).

## Non-Functional Requirements
- **NFR-1 (Perf)**: Primeiro rebuildUpcomingCache frio não deve exceder 10s em horário de pico; lista de futebol pré-jogo deve conter jogos reais em ≤30s após cold start (antes dependia de 2 ciclos para pricing).
- **NFR-2 (Perf)**: Primeiro buildLivePayload frio deve mostrar jogos ao vivo já no PRIMEIRO tick (não esperar segundo tick após WS odds frame chegar).
- **NFR-3 (Estabilidade)**: Nenhum unhandledRejection por falta de GoalAPI/PulseScore/PropLine ao iniciar server em ambiente com só BZZOIRO definida.
- **NFR-4 (Build)**: `pnpm typecheck` (api-server e bet62) deve passar sem novos erros TypeScript.
- **NFR-5 (Observabilidade)**: Logs de inicialização devem declarar explicitamente quais provedores estão ativos, e um warning deve ser emitido se BZZOIRO_API_KEY estiver faltando.
- **NFR-6 (Reversibilidade)**: Mantida estrutura de módulos; remoção é definitiva (não kill-switches), mas rollback por git revert é trivial pois commit atômico.

## Constraints
- **Técnicas**:
  - Hard constraint do projeto: manter prefixos antigos de ID para liquidação (ver project_memory). Não alterar parsing de selection keys em settlement.ts que lê prefixos históricos.
  - Não remover `api-tennis.com` (tênis dedicado) ou `apitennis` type/config — não está na lista de remoção.
  - Manter `buildFootballLiveFromBzzoiro` atualizando `liveMatchState` (já escreve; confirmado via inspeção).
- **Negócio**:
  - Apostas já abertas em jogos GoalAPI/PulseScore/PropLine existentes não devem ficar "órfãs" de liquidação (ver FR-10).
  - Sempre que uma partida de futebol NÃO tiver odds reais BZZOIRO: ela pode ser visível no frontend com "Aguarde cotações" mas **nunca** clicável/apostável — e isto é comportamento aceitável, diferente do "desaparece completamente" atual.
- **Dependências**:
  - Requer `BZZOIRO_API_KEY` válida e plano com cobertura dos endpoints `/events/`, `/events/live/`, `/events/:id/odds/`, `/odds/`, `/events/:id/stats/`, `/events/:id/incidents/`, e WS `livedata/event/odds`.
  - Não há novas deps de npm; tudo usa `fetch` nativo e WS `ws` existente.

## Assumptions
- **A-1**: Usuário confirma que plano pago da BZZOIRO oferece `/events/:id/stats/` com xG e `/events/:id/incidents/` para liquidação autoritativa de gols/cartões (já existem wrappers `getBzzoiroEventStatsRaw`/`getBzzoiroEventIncidentsRaw` mas eram investigação-only; agora usados em produção).
- **A-2**: BZZOIRO oferece cobertura para esportes "stick" (basquete, hóquei) com endpoints separados em basketball.ts/hockey.ts/tennis.ts/darts.ts (já existem; assumidos funcionais).
- **A-3**: Vôlei e MMA: usuário confirma se BZZOIRO oferece ou não. Se não oferecer, lista vazia + log info é aceitável.

## Acceptance Criteria

### AC-1: Futebol pré-jogo aparece no primeiro rebuildUpcomingCache
- **Type**: `rule`
- **Given**: Backend inicializa apenas com `BZZOIRO_API_KEY` definida (GOAL, PULSE, PROP vazias).
- **When**: Primeiro ciclo de `rebuildUpcomingCache()` ou `refreshUpcomingTop()` completa.
- **Then**: Lista `football` retornada contém jogos BZZOIRO, hasRealOdds=true/false mas **nenhum jogo é filtrado no frontend home.tsx por hasRealOdds=false quando odds também são zero**.
- **Pass Condition**: Em ambiente configurado corretamente, primeira resposta GET `/api/matches/upcoming` tem `football.length > 0` e resposta GET `/api/matches/` (legacy) tem partidas de futebol em "Em Breve" visíveis sem que o primeiro pricing async tenha completado; também home.tsx não filtra por hasRealOdds quando a partida é marcada "aguardando cotações" explicitamente.
- **Evidence**: Teste manual ou curl com resposta JSON; ou teste unitário do chooseUpcomingProvider + filtro home.

### AC-2: Futebol ao vivo aparece no PRIMEIRO buildLivePayload tick
- **Type**: `rule`
- **Given**: Há pelo menos um jogo BZZOIRO em status `inprogress` com WS conectado mas frame `odds` ainda não entregue.
- **When**: Primeiro `buildLivePayload()` roda após refreshSubscriptions.
- **Then**: A partida está no payload (visível) com `_priceSource = undefined` e `hasRealOdds = false`; **não** é filtrada por `isVisibleFootballFixture` (ou o filtro é flexibilizado para permitir "aguardando preço"). UI mostra "Aguarde cotações" em vez de esconder.
- **Pass Condition**: Após cold start, primeira chamada GET `/api/live` (ou SSE primeiro evento) inclui a partida com status "ao vivo" e o UI não a esconde.
- **Evidence**: Snapshot do primeiro SSE broadcast; ou buildLivePayload isolado com mocked nativeLiveEvents.

### AC-3: Nenhuma rota/lógica ativa lê PULSESCORE_API_KEY, GOAL_API_KEY, PROPLINE_API_KEY
- **Type**: `rule`
- **Given**: Repósitorio após a refatoração, grep por essas 3 constantes em código TS ativo (excluindo tests spec e comentários).
- **When**: Rodar busca textual em `artifacts/api-server/src` e `artifacts/bet62/src`.
- **Then**: Zero ocorrências de `CONFIG.PULSESCORE_API_KEY`, `CONFIG.GOAL_API_KEY`, `CONFIG.PROPLINE_API_KEY` usadas em gates `if` que condicionam fluxo de dados (ocorrências em arquivo test-only ou comentários OK).
- **Pass Condition**: Grep em `src/` (não tests) retorna 0 matches dos usos de gate. Pastas `services/goalapi/`, `services/propline/`, `providers/pulsescore/` podem ser deletadas ou mantidas vazias.
- **Evidence**: Saída do grep; lista de arquivos deletados.

### AC-4: Builders de futebol usam só BZZOIRO; sem fallback Goal/Pulse/Prop
- **Type**: `rule`
- **Given**: rebuildUpcomingCache e buildLivePayload.
- **When**: Inspecionar candidatos array em football upcoming e football live.
- **Then**: Arrays `candidates` contêm apenas `{provider: "bzzoiro", ...}`; nenhum push de goalapi, pulsescore ou propline para futebol.
- **Pass Condition**: matches.ts:10358 (`if (CONFIG.GOAL_API_KEY)`) removido para futebol; matches.ts:10489 (`if (CONFIG.GOAL_API_KEY)`) removido para futebol. Somente BZZOIRO.
- **Evidence**: Diff de matches.ts mostrando remoção das branches.

### AC-5: Basquete/hóquei/tênis/dardos preferem BZZOIRO; Propline removido
- **Type**: `rule`
- **Given**: rebuildUpcomingCache e buildLivePayload para basquete, hóquei.
- **When**: Inspecionar candidatos arrays.
- **Then**: Nenhum candidato "propline" é adicionado. Apenas BZZOIRO e (para tênis) opcionalmente apitennis se chave existe.
- **Pass Condition**: 0 gates `if (CONFIG.PROPLINE_API_KEY)` em rebuildUpcomingCache/buildLivePayload para qualquer esporte (exceto talvez vôlei/MMA/beisebol se usuário decidir manter com placeholder).
- **Evidence**: Diff matches.ts + grep count 0.

### AC-6: Liquidação histórica intacta
- **Type**: `rule`
- **Given**: Apostas existentes em banco com selection keys contendo IDs goalapi-football-*, pulsescore-football-*, propline-*, statpal-*, football-v2-*, ps-*, gs-*.
- **When**: Rodar settlement.spec.ts ou settlement worker sobre fixtures antigas.
- **Then**: Parse de selection key e matchIdPrefix em [settlement.ts](file:///c:/Users/israe/Desktop/Nova%20pasta/artifacts/api-server/src/settlement.ts) continua reconhecendo todos prefixos antigos; liquidação ou void ocorre normalmente.
- **Pass Condition**: `pnpm test:settlement` ou ao menos typecheck não quebre; manual inspection de `parseSelectionPlayerMarket`, `getFootballGoalEventsFromExtras`, prefixos de ID.
- **Evidence**: Testes passing; ou diff de settlement.ts mostrando que parsing de prefixos não foi alterado.

### AC-7: typecheck api-server e bet62 passam
- **Type**: `rule`
- **Given**: Código da refatoração salvo em disco.
- **When**: Executar `pnpm typecheck` em cada workspace.
- **Then**: Exit code 0; 0 erros TS de tipo indefinido para módulos removidos (caso deletados, todas imports resolvidas).
- **Pass Condition**: Comandos exit 0; se não pnpm rodar, ao menos `tsc --noEmit` via npm scripts.
- **Evidence**: Saída dos comandos.

### AC-8: Observabilidade e inicialização
- **Type**: `rubric`
- **Dimension**: Clareza e completude dos logs de inicialização e health de provedores.
- **Scale**: 1-5
- **Anchors**: 1 = nenhum log de provedores; 3 = logs existentes não regrediram; 5 = logs explícitos "BZZOIRO provider ATIVO: key set, 657 upcoming, 4 live subscriptions", warning se BZZOIRO_API_KEY faltar, menção que Goal/Pulse/Prop foram descontinuados.
- **Pass Threshold**: >= 4
- **Evidence**: Startup logs capturados; health/providerHealth.ts atualizado sem referências a provedores removidos.

## Open Questions
- [ ] **Q1**: BZZOIRO oferece vôlei e MMA? Se sim, criar builders `buildVolleyballFromBzzoiro` / `buildMmaFromBzzoiro`. Se não, manter listas vazias é aceitável?
- [ ] **Q2**: `/events/:id/stats/` e `/events/:id/incidents/` da BZZOIRO: usuario já confirmou payload real em produção (xG, gols, cartões)? Se sim, normalizar e usar na `buildFootballLiveFromBzzoiro` para `matchStats` e `events`. Caso negativo, manter matchStats vazio mas não quebrar visibilidade.
- [ ] **Q3**: Rotas de admin `/api/admin/pro` (adminPro.ts) que referem PropLine/PulseScore — remover completamente ou manter como stubs que retornam 410 Gone + mensagem "descontinuado: use BZZOIRO status endpoint"?
- [ ] **Q4**: Manter `providers/pulsescore/`, `services/goalapi/`, `services/propline/` como pastas com index.mjs vazio (zero-impact type) ou **deletar** pastas e todas as referências? Preferência: deletar para evitar ruído futuro.
- [ ] **Q5**: `.env.example`: remover seções 8.1, 8.8, 8.11 (PulseScore, GoalAPI, PropLine) inteiras, ou manter comentando-as como "descontinuadas"? Também atualizar a seção 8.7 seleção de provedor.
