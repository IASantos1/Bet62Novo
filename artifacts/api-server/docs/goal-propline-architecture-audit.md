# BET62 - Auditoria Goal API + PropLine

Data: 2026-09-22

## Resumo

O worktree atual ja contem uma migracao relevante para a arquitetura `Goal API + PropLine`, mas ela ainda esta num estado hibrido.

O runtime principal de `matches.ts` ja puxa:
- `Goal API` para estado e dados de futebol
- `PropLine` para odds multi-sport e fallback de futebol

O que ainda falta para bater com a arquitetura alvo:
- websocket real dos providers
- Redis como live-state principal
- matching forte com `internalFixtureId`
- freshness por sport/bookmaker/market
- separacao clara entre integracao, live engine, cache e broadcast

## Correto

### Configuracao central

Ficheiro: `src/lib/config.ts`

Correto:
- `GOAL_API_*` existe e esta orientado para futebol
- `PROPLINE_*` existe e esta orientado para odds multi-sport
- `MRDOGE` ja esta marcado como legado
- ha thresholds de suspensao e tuning operacional centralizados

Manter:
- base de env
- delays de suspensao
- timeouts de APIs

### Integracao Goal API

Ficheiros:
- `src/services/goal/client.ts`
- `src/services/goal/mapper.ts`

Correto:
- cliente REST com fallback de endpoints
- normalizacao base de fixtures, eventos, stats, commentary e odds fallback
- gating por chave real configurada

Manter:
- cliente REST
- mapeamento base do futebol

### Integracao PropLine

Ficheiros:
- `src/services/propline/client.ts`
- `src/services/propline/mapper.ts`

Correto:
- cliente REST com selecao de sport keys
- markets por desporto
- normalizacao de odds/bookmakers/outcomes
- filtro de freshness basico

Manter:
- cliente REST
- mapeador de mercados e odds

### Agregador Bet62

Ficheiro: `src/services/providers/bet62.ts`

Correto:
- `Goal API` como fonte principal para futebol
- `PropLine` como fonte principal de odds
- Goal odds como fallback no futebol
- agregacao multi-sport centralizada num unico modulo

Manter:
- `getGoalFootballMatches()`
- `getPropLineMatches()`
- logica de fallback Goal odds

## Parcial

### Bootstrap real

Ficheiros:
- `build.mjs`
- `src/index.ts`
- `src/api/index.ts`

Estado:
- o projeto tinha duas entradas
- o build estava a usar `src/api/index.ts`, nao `src/index.ts`
- a entrada nova existia, mas incompleta

Acao aplicada:
- `build.mjs` agora aponta para `src/index.ts`
- `src/index.ts` foi alinhado com o bootstrap operacional necessario:
  - `dotenv/config`
  - `createServer(app)`
  - handlers de processo
  - `startSettlementWorker()`
  - `ensureBigBangCatalogFresh()`
  - `startAiAgentsCron()`

### Health operacional

Ficheiro: `src/routes/health.ts`

Estado:
- a rota ainda dizia que todos os providers estavam removidos
- isso estava desalinhado com a migracao atual

Acao aplicada:
- `health-data-providers` agora expoe:
  - `goalApiEnabled`
  - `propLineEnabled`
  - `mrDogeLegacyEnabled`
  - presence das chaves
  - URLs base configuradas

### Runtime de matches

Ficheiro: `src/routes/matches.ts`

Parcial:
- `rebuildUpcomingCache()` ja usa:
  - Goal API para futebol
  - PropLine para tennis, basketball, hockey, volleyball, mma
- `buildLivePayload()` ja usa:
  - Goal API para estado live do futebol
  - PropLine live para odds e multi-sport

Mas ainda parcial porque:
- o ficheiro continua a conter blocos grandes de `MRDOGE`
- ha comentarios historicos e funcoes legadas no mesmo modulo
- continua monolitico demais para a arquitetura final

### Matching

Ficheiros:
- `src/services/providers/bet62.ts`
- `lib/db/src/schema/matchProviderMapping.ts`

Parcial:
- existe matching heuristico por nome + kickoff
- existe tabela persistente de mapping por provider

Falta:
- `internalFixtureId` como centro real do mapping
- score de confianca forte
- normalizadores dedicados:
  - `team-normalizer.ts`
  - `league-normalizer.ts`
  - `fixture-matcher.ts`

### Freshness

Ficheiros:
- `src/services/propline/mapper.ts`
- `src/services/providers/bet62.ts`

Parcial:
- ja existe filtro por idade de odd
- ja existe `sourceTimestamp` e `receivedTimestamp`

Falta:
- `latencyMs`
- estados `FRESH/WARNING/STALE`
- thresholds por bookmaker, mercado e desporto

## Incorreto ou em falta

### WebSocket principal dos providers

Falta:
- Goal API WS integrado na nova stack
- PropLine WS/streaming integrado na nova stack
- recovery + resubscribe + reconciliation apos reconnect

### Redis como live-state principal

Estado atual:
- Redis existe no projeto para settlement, locks e cache generico
- nao esta a servir como store central do live sportsbook

Falta:
- keys do tipo:
  - `bet62:fixture:{id}`
  - `bet62:fixture:{id}:score`
  - `bet62:fixture:{id}:events`
  - `bet62:fixture:{id}:stats`
  - `bet62:fixture:{id}:odds`
  - `bet62:fixture:{id}:markets`
  - `bet62:fixture:{id}:suspensions`
  - `bet62:fixture:{id}:freshness`

### Estrutura de codigo final

Ainda nao existe a estrutura final pedida:

- `integrations/goal/*`
- `integrations/propline/*`
- `live/*`
- `matching/*`
- `cache/*`
- `websocket/*`
- `workers/*`

Hoje a maior parte disto ainda esta concentrada em `src/routes/matches.ts` e em poucos servicos auxiliares.

### Webhooks

Estado:
- comments antigos diziam que Goal/PropLine estavam removidos
- isso foi corrigido em `src/app.ts`

Falta:
- decidir se a nova arquitetura vai usar webhooks reais
- se sim, criar endpoints dedicados e versionados

## Legado a suspender

### MrDoge

Ficheiros com legado ainda presente:
- `src/routes/matches.ts`
- `src/services/mrdoge/*`

Recomendacao:
- nao apagar agora
- manter apenas como compatibilidade isolada
- impedir que volte a ser o provider principal por configuracao ou build path

## Proximos passos recomendados

1. Extrair o runtime novo de `matches.ts` para modulos:
   - `integrations/goal/*`
   - `integrations/propline/*`
   - `live/*`

2. Criar o matching forte:
   - `team-normalizer.ts`
   - `league-normalizer.ts`
   - `fixture-matcher.ts`

3. Criar o modelo final de odds:
   - `provider`
   - `fixtureId`
   - `providerFixtureId`
   - `bookmaker`
   - `market`
   - `selection`
   - `line`
   - `oddsDecimal`
   - `oddsAmerican`
   - `status`
   - `sourceTimestamp`
   - `receivedTimestamp`
   - `latencyMs`
   - `sequence`
   - `version`

4. Passar o live state para Redis.

5. Ligar WebSocket real de Goal API e PropLine.

6. Criar `BET62 WS` como canal principal do frontend.

7. So depois disso limpar o bloco legado grande de `MRDOGE`.
