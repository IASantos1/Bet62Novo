// providers/pulsescore/filters.ts — STUB OBSOLETO 2026-09-15.
// PulseScore provider REMOVIDO DEFINITIVAMENTE; este filtro stub sempre retorna
// false (nenhuma liga é "virtual" no contexto legado, já que o array de eventos
// passado ao match engine está SEMPRE vazio agora — não há runtime PulseScore).
// Mantido APENAS para compilar o footballMatchEngine.ts inativo.

/** @obsolete PulseScore removido; sempre retorna false. */
export function isVirtualPulseScoreLeague(
  _league: string | { name?: string; id?: string | number } | null | undefined,
): boolean {
  return false;
}
