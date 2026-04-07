/**
 * Validação estrutural de indicadores — Build-safe guard
 *
 * Garante que todo indicadorId usado no painel esteja registrado
 * no catálogo oficial (indicadorCatalogo.ts).
 *
 * - DEV  → console.warn (não bloqueia)
 * - PROD → throw Error (bloqueia build/runtime)
 *
 * Reutilizável para qualquer painel que use a mesma estrutura de blocos.
 */

import { CATALOGO_INDICADORES } from './indicadorCatalogo';

export interface BlocoGenerico {
  nome?: string;
  titulo?: string;
  rows: { indicador: string; indicadorId?: string }[];
}

export interface IndicadorAusente {
  id: string;
  bloco: string;
  linha: string;
}

/** Coleta todos os indicadorId de uma lista de blocos */
export function collectIndicadores(blocos: BlocoGenerico[]): string[] {
  const ids: string[] = [];
  for (const bloco of blocos) {
    for (const row of bloco.rows) {
      if (row.indicadorId) ids.push(row.indicadorId);
    }
  }
  return [...new Set(ids)];
}

/** Retorna lista detalhada de indicadores não registrados no catálogo */
export function getIndicadoresSemCatalogo(blocos: BlocoGenerico[]): IndicadorAusente[] {
  const ausentes: IndicadorAusente[] = [];
  const vistos = new Set<string>();

  for (const bloco of blocos) {
    for (const row of bloco.rows) {
      if (row.indicadorId && !CATALOGO_INDICADORES[row.indicadorId] && !vistos.has(row.indicadorId)) {
        vistos.add(row.indicadorId);
        ausentes.push({
          id: row.indicadorId,
          bloco: bloco.nome || bloco.titulo || '?',
          linha: row.indicador,
        });
      }
    }
  }

  return ausentes;
}

/**
 * Validação central — comportamento por ambiente:
 * - DEV:  console.warn detalhado
 * - PROD: throw Error (impede execução com dados incompletos)
 */
export function assertIndicadoresValidos(
  blocos: BlocoGenerico[],
  contexto = 'PainelConsultor',
): void {
  const ausentes = getIndicadoresSemCatalogo(blocos);
  if (ausentes.length === 0) return;

  const ids = ausentes.map(a => a.id).join(', ');
  const detalhes = ausentes
    .map(a => `  → Bloco: ${a.bloco} | Linha: ${a.linha} | ID: ${a.id}`)
    .join('\n');

  const msg = `[${contexto}] Indicadores sem cadastro no catálogo: ${ids}\n${detalhes}`;

  if (import.meta.env.DEV) {
    console.warn(`⚠️ ${msg}`);
  } else {
    throw new Error(msg);
  }
}

/** Alias legado — redireciona para assertIndicadoresValidos */
export function warnIndicadoresSemCatalogo(
  blocos: BlocoGenerico[],
  contexto = 'PainelConsultor',
): void {
  assertIndicadoresValidos(blocos, contexto);
}
