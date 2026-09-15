# Debug Session: prematch-empty-live-broken-ui
Session ID: prematch-empty-live-broken-ui
Data: 2026-09-15
Status: [OPEN]

## Symptom 1: AINDA SEM PRE JOGOS
- Expected: Futebol/Tênis/etc pré-jogos aparecem na seção "Em Breve" / upcoming
- Actual: Nenhum jogo pré-jogo aparece; seção vazia

## Symptom 2: AO VIVO AINDA APARECENDO MAL
- Expected: Dardos 🎯 "Ao vivo"; CS2 💣; Corridas 🐎; sem duplo ⚽⚽; sem "0'"
- Actual: Ainda aparecendo mal (detalhes a coletar)

---
## Hipóteses Backend (Sem Pré-Jogos)
- [ ] Hp1: BZZOIRO_API_KEY vazia → early return []
- [ ] Hp2: Cron não executa → cache upcoming vazio
- [ ] Hp3: Shape resposta array puro sem wrapper → parse falha silenciosa
- [ ] Hp4: rebuildUpcomingCache filtro descarta tudo → raw vs idsToPrime vs upcomingTop
- [ ] Hp5: Endpoint /api/matches vazio por displayFilter

## Hipóteses Frontend (Ao Vivo Ruim)
- [ ] Hf1: Upcoming cards (não-live) têm seus próprios defaults ⚽
- [ ] Hf2: Dupla renderização ícones: 2 locais no mesmo header
- [ ] Hf3: Cache HTTP/browser servindo bundle antigo
- [ ] Hf4: renderUpcomingMatchCard tem fallback futebol separado
- [ ] Hf5: match.sport chegando undefined → cai isFootball default

---
## Instrumentation Points
_(adicionar após validação estática inicial)_

---
## Evidence Log
| Hora | ID | Evidência | Status |
|---|---|---|---|

---
## Pre vs Post Comparison
_(preencher após fix)_

---
## Checklist Final
- [ ] Usuário confirma Symptom 1 resolvido (pré-jogos aparecem)
- [ ] Usuário confirma Symptom 2 resolvido (ao vivo OK)
- [ ] Nenhuma regressão: futebol/tennis/KHL continuam OK
- [ ] GetDiagnostics home.tsx = []
- [ ] Typecheck api-server 0 erros
