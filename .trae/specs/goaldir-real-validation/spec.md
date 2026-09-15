# Spec: Validação Real GOALDIR (BZZOIRO) + Remoção api-tennis + Correção Pré-Jogos

Versão: 1.0 | Data: 2026-09-15 | Fase: Specify

## 1. Contexto e Motivação (Usuário M7 VERBATIM)

> "ENTRA NAS DOCUMENTAÇOES RODE E VALIDA PARA TERMOS DADOS REAIS POIS PRE JOGOS NAO ESTAO APARECENDO E EM AO VIVO ESTAMOS TER JOGOS DE TENIS MAIS DA API-TENNIS QUE E PARA DESATIVAR TAMBEM"
> Chave de teste GOALDIR fornecida: `8b46148974fbd01bbe63ac2d206945b7b176043f`

Com a refatoração anterior (SPEC MODE bzzoiro-only-refactor commit 85275ee2) consolidamos o BZZOIRO como fonte única, substituindo PulseScore/GoalAPI/PropLine. Entretanto dois problemas persistiram relatados pelo usuário: (a) pré-jogos futebol não aparecem no frontend, (b) ao vivo tênis continua recebendo jogos exclusivamente de `api-tennis.com` em paralelo, enquanto a BZZOIRO (GOALDIR) tênis estava declarada mas retornava vazio. O usuário agora confirma plano pago GOALDIR cobrindo todos esportes e manda **desativar definitivamente api-tennis.com**, além de validar integração com dados reais rodando os endpoints.

## 2. Hard Constraints (invioláveis)

| ID | Regra |
|---|---|
| HC-1 | **GOALDIR = FONTE ÚNICA TODOS OS ESPORTES.** Nenhum provedor antigo (GoalAPI/PropLine/PulseScore/SportMonks/StatPal/API-Football/GoalServe) pode ser reintroduzido. |
| HC-2 | **api-tennis.com → DESATIVADO DEFINITIVAMENTE.** Tênis upcoming/live/odds 100% GOALDIR. Nenhum paralelismo chooseProvider com apitennis em canto nenhum. |
| HC-3 | **Nenhum prefixo antigo em `settlement.ts` (goalapi-, pulsescore-, propline-, statpal-, football-v2-, ps-, gs-) pode ser removido ou alterado.** Liquidação retroativa 100% intacta. |
| HC-4 | **Chave real NÃO pode ser commitada em arquivo.** A chave teste `8b46148...` pode aparecer em logs de validação script momentâneo mas NÃO em `.env.example`, `.ts`, `.md` versionado. |
| HC-5 | **Autenticação REST:** Header `Authorization: Token <API_KEY>` (não `Bearer`). WebSocket auth via query param `?token=` ou subprotocol `["token", KEY]`. |
| HC-6 | **Odds fabricadas proibidas.** Se fixture não tem preço GOALDIR real → UI mostra badge "Aguarde cotações" com pulse (já implementado home.tsx CR1). |
| HC-7 | **Fixtures futebol permanecem visíveis SEM odds.** Mesmo sem preço aparece card com badge de espera; não some por falta de odds. |
| HC-8 | **Status filters específicos por esporte NÃO podem usar o mesmo valor.** Tênis/Basquete/Hóquei/Dardos = `scheduled`; Futebol = `upcoming/notstarted`; CS2 = `notstarted`; Horseracing = `next-to-jump` ou upcoming. |

## 3. Requisitos Funcionais (User Stories)

### RF-1: Validação dados reais GOALDIR endpoints REST
Como operador, quero rodar requisições reais em todos endpoints com a chave teste para confirmar shape correto, contagens >0, status filters válidos e endpoints que antes retornavam vazio por bug — para ter confiança que a integração funciona antes de deploy em produção.

### RF-2: Corrigir Tênis Live GOALDIR retorna [] (BUG-A SPEC-2)
Como usuário, quero ver jogos de tênis ao vivo VINDOS DA GOALDIR (não mais api-tennis). Hoje `getBzzoiroTennisLive()` retorna sempre vazio porque espera `{results:[...]}` mas a resposta real é **array puro** `[...]` length 21 no teste.

### RF-3: Garantir Futebol Pré-Jogos APARECEM (BUG-B validado)
Como usuário, quero visualizar partidas de futebol pré-jogo no app. Hoje temos 2 causas potenciais validadas:
  (a) **Causa principal ambiente (99%):** `BZZOIRO_API_KEY` não está setada no Railway/.env local → builders `if (!CONFIG.BZZOIRO_API_KEY) return []` → vazio. Código builder em si FUNCIONA (SPEC-2 validação real retornou 592/600 PASS com lógica idêntica).
  (b) **Causa secundária (1% proteção):** Reforçar que o cron `runBzzoiroPrematchSweep` logue explicitamente quantos fixtures precificou vs quantos fixtures totais, para diagnóstico rápido em produção.

### RF-4: Desativar definitivamente api-tennis.com
Como operador, quero remover TODO paralelismo entre api-tennis.com e GOALDIR no código. A fonte de verdade para tênis é 100% GOALDIR:
  - Remover candidato `apitennis` de `rebuildUpcomingCache` (tennisCandidates)
  - Remover candidato `apitennis` de `buildLivePayload`
  - Remover candidato `apitennis` de `refreshUpcomingTop`
  - Remover default `TENNIS_API_KEY` de .env.example ou marcar como **OBSOLETO**
  - Alterar comentário header de `tennis.ts` de "Wired as ADDITIONAL candidate" para "FONTE ÚNICA".

### RF-5 (Opcional): WebSocket GOALDIR validação conexão
Como QA, quero confirmar que conexões WS futebol e tênis conectam com sucesso, enviam subscribe frame, recebem pelo menos 1 frame `subscribed` de snapshot. Não é obrigatório implementar polling melhor aqui; só validar que a conexão não fecha 4401 auth.

### RF-6: Status filters corretos em todos builders de upcoming
Como dev, quero que cada upcoming builder ENVIE o parâmetro `status=correto` em seu request REST (mesmo que depois filtre novamente em memória), para reduzir volume de dados trafegados e acelerar resposta:
  - getBzzoiroTennisUpcoming: enviar `status=scheduled`
  - getBzzoiroBasketballUpcoming: enviar `status=scheduled`
  - getBzzoiroHockeyUpcoming: enviar `status=scheduled`
  - getBzzoiroDartsUpcoming: enviar `status=scheduled`
  - getBzzoiroCS2Upcoming: enviar `status=notstarted`
  - Futebol getBzzoiroUpcomingEvents (HOJE): manter SEM status filter por enquanto pois existem fixtures `postponed` que podem ser úteis dependendo de regra; e o builder em memória L8024 já filtra `status==="notstarted"`.

## 4. Requisitos Não-Funcionais

| ID | Regra |
|---|---|
| RNF-1 | **0 erros typecheck** `libs` + `api-server` após mudanças. |
| RNF-2 | **201/203 testes settlement passando** (testes antigos de liquidação IDs com prefixos não podem quebrar). |
| RNF-3 | **0 gates** `CONFIG.TENNIS_API_KEY` em código que decide fluxo de dados de tênis (aceitável apenas em comentários/documentação ou stubs de rota 410 admin se existir). |
| RNF-4 | **0 gates** `CONFIG.{PULSESCORE,GOAL,PROPLINE}_API_KEY` em src/ ativa (audit já tinha 0; manter). |
| RNF-5 | **Performance:** nenhum novo request REST em caminho quente live por partida. Se já batia por partida detalhe odds continuar igual. |
| RNF-6 | **Idioma:** logs de erro/info, badges UI, mensagens rotas 410 → PT-BR. |

## 5. Acceptance Criteria (Condições Fechamento)

| ID | Critério | Medição |
|---|---|---|
| AC-R1 | **Futebol pré-jogos aparecem com chave configurada:** rodando servidor local com `BZZOIRO_API_KEY` setada (qualquer chave válida teste), `GET /api/matches/upcoming` retorna >= 1 jogo de futebol com id prefixo `bzzoiro-football-`. | `GET /api/matches/upcoming` → JSON parse → `football.length >= 1`. |
| AC-R2 | **Dados GOALDIR reais validados:** Requisições PowerShell/Node reais HTTP 200 para: futebol upcoming count>=500, futebol live (se existir)>=0, tênis scheduled>=100, tênis live>=5, basquete/hóquei/dardos/cs2/horseracing scheduled>=1 cada. | SPEC-2 já executou e passou. Manter evidência em review.md. |
| AC-R3 | **api-tennis DESATIVADO:** `grep -r "buildTennisUpcomingFromApiTennis\|buildTennisLiveFromApiTennis\|CONFIG.TENNIS_API_KEY.*if" artifacts/api-server/src/routes/matches.ts` retorna 0 matches em código decisório. Apenas stubs 410 ou comentários podem mencionar. Escolhas em rebuild/buildLive/refresh para tênis = só 1 candidato ("bzzoiro"). | Grep audit manual. |
| AC-R4 | **Bug-A Tênis Live corrigido:** `getBzzoiroTennisLive()` retorna array.length >= 5 quando tem jogos ao vivo (igual validado PowerShell array puro length 21). Ao rodar stub, não retorna mais vazio. | Rodar função wrapped e ver length. |
| AC-R5 | **Status filters enviados:** Chamadas REST upcoming de tênis/basquete/hóquei/dardos incluem query param `status=scheduled`; CS2 `status=notstarted`. | Ver no código source client.* chamadas rawGet com params. |
| AC-3-LEG | **Legado AC-3:** Audit `grep CONFIG.{PULSESCORE,GOAL,PROPLINE}_API_KEY` → 0 gates em src ativa. | Mesmo método AC sessão anterior. |
| AC-7-LEG | **typecheck:** `pnpm --filter @workspace/api-server run typecheck` exit 0; `pnpm --filter @workspace/libs run typecheck` exit 0. | Exit code. |
| AC-6-LEG | **Settlement tests:** `pnpm --filter @workspace/api-server run test:settlement` passa >=201/203 (mesmo baseline). | Suite output. |

## 6. Bugs Validados SPEC-2 (Evidências)

1. **BUG-A TÊNIS LIVE ARRAY PURO.** PowerShell `/tennis/api/v2/matches/live/` → HTTP 200 1stChar='[' length=21. `tennisGet<BzzoiroTennisListResponse>` espera `{results:[...]}` → `resp.results = undefined` → return [] SEMPRE. **Fix:** detectar array puro em getBzzoiroTennisLive e retornar direto.
2. **BUG-B FALSA ALARME FUTEBOL BUILDER:** Lógica idêntica buildFootballUpcomingFromBzzoiro retorna PASS=592/600 fixtures. Builder correto. **Ação:** Configurar `BZZOIRO_API_KEY` no ambiente Railway + adicionar logs robustez cron prematch.
3. **Horseracing /races/next-to-jump** também array puro (igual tênis live). Mesma correção aplicar se builder existir.
4. **Odds futebol:** query param `event_id` SINGULAR (não plural). Correto.
5. **Tênis upcoming SEM status filter** recebe inclusive finished. Adicionar `status=scheduled` no GET do client melhora desempenho.

## 7. Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| GOALDIR Tênis Live REST não tem score por ponto/server (menos rico que api-tennis WS tinha). | UI frontend já fallback gracefully; aceitar gap temporário. |
| Chave teste tem rate limit 429. | Validações já feitas em batch. Não abusar. |
| 402 Addon Required para alguns endpoints. | Já pagos usuário plano $7 tudo + live addon $7 (confirmado); não deve ocorrer com chave real. |
| Regressão liquidação tênis antigo com prefixo `apitennis-*`. | HC-3 garante prefixos intactos; stubs inativos são só candidatos removidos, não settlement ID parser. |

## 8. Open Questions (fechadas agora, não precisa usuário)

- **Q:** Futebol upcoming builder SEM status=notstarted no request → performance ok? **R:** Mantém sem por enquanto, builder memória já filtra, cron roda background 3min sem bloquear UI.
- **Q:** WS tênis precisa implementar AGORA? **R:** Não, validar só conexão (RF-5 opcional). A integração REST live funciona como baseline.
- **Q:** Apitennis stubs completos remover totalmente? **R:** Só remover candidatos de fluxo. Providers/apitennis pasta pode ficar inativa por enquanto (não impacta RNF-3 pois candidatos são o gate).
