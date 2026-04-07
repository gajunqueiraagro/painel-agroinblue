/**
 * Guard de desenvolvimento — detecta indicadores usados no painel
 * que não estão registrados no catálogo oficial.
 *
 * Roda SOMENTE em dev (import.meta.env.DEV).
 * Nunca bloqueia UI — apenas console.warn.
 */

import { CATALOGO_INDICADORES } from './indicadorCatalogo';

interface BlocoGenerico {
  nome?: string;
  titulo?: string;
  rows: { indicador: string; indicadorId?: string }[];
}

export function warnIndicadoresSemCatalogo(
  blocos: BlocoGenerico[],
  contexto = 'PainelConsultor',
): void {
  if (!import.meta.env.DEV) return;

  const ausentes: { id: string; bloco: string; linha: string }[] = [];

  for (const bloco of blocos) {
    for (const row of bloco.rows) {
      if (row.indicadorId && !CATALOGO_INDICADORES[row.indicadorId]) {
        ausentes.push({
          id: row.indicadorId,
          bloco: bloco.nome || bloco.titulo || '?',
          linha: row.indicador,
        });
      }
    }
  }

  if (ausentes.length === 0) return;

  const ids = ausentes.map(a => a.id).join(', ');
  console.warn(
    `[${contexto}] ⚠️ Indicadores sem cadastro no catálogo: ${ids}`,
  );
  for (const a of ausentes) {
    console.warn(`  → Bloco: ${a.bloco} | Linha: ${a.linha} | ID: ${a.id}`);
  }
}
