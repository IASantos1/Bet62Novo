// providers/pulsescore/types.ts — STUB OBSOLETO 2026-09-15.
// PulseScore provider REMOVIDO DEFINITIVAMENTE do runtime; este arquivo existe
// APENAS para satisfazer imports orfãos em matching/footballMatchEngine.ts
// (código de debug/matching que não está em nenhum caminho ativo de build ou
// settlement). Não representa dados reais — nunca é populado.

export type PulseScoreEvent = {
  eventId: string;
  home: string;
  away: string;
  startTime?: string | null;
  league: string | { name?: string; id?: string | number };
};
