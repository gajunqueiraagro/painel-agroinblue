// ============================================================================
// B1b — validação de subcentro canônico (Cenário B / MesaStagingTab).
// Espelha, no front, a régua soberana do trigger resolve_classificacao_from_plano
// (B1a): um subcentro só promove se existir no plano de contas (global + cliente),
// por match EXATO (sem fuzzy, igual ao `=` do trigger). Exceção: dividendos
// (macro='Dividendos') são exclusivos por cliente e ficam fora do plano global —
// o trigger os isenta, então aqui também.
//
// Fonte canônica: useCatalogoCliente — subcentros com origem 'oficial'|'ambos'
// vieram do financeiro_plano_contas (FASE 1 do catálogo); 'historico' é legado
// fora do plano e NÃO é canônico.
// ============================================================================
import type { CatalogoCliente } from '@/v2/lib/excelPreview/catalogoCliente';

/** Set dos subcentros que existem no plano de contas (global + específico do cliente). */
export function construirSetCanonico(catalogo: CatalogoCliente | undefined): Set<string> {
  const set = new Set<string>();
  if (!catalogo) return set;
  for (const s of catalogo.subcentros) {
    if (s.origem === 'oficial' || s.origem === 'ambos') set.add(s.subcentro);
  }
  return set;
}

/** Match EXATO contra o plano (espelha o `=` do trigger; sem normalização/fuzzy). */
export function subcentroEhCanonico(
  subcentro: string | null | undefined,
  canonicos: Set<string>,
): boolean {
  return subcentro != null && canonicos.has(subcentro);
}

/**
 * Pode promover sem disparar o RAISE do trigger:
 * - subcentro nulo → o trigger não bloqueia (resolve por plano_conta_id ou segue);
 * - macro 'Dividendos' → isento (exclusivo por cliente, fora do plano global);
 * - senão → precisa ser canônico (existir no plano).
 */
export function podePromover(
  subcentro: string | null | undefined,
  macro: string | null | undefined,
  canonicos: Set<string>,
): boolean {
  if (subcentro == null) return true;
  if (macro === 'Dividendos') return true;
  return canonicos.has(subcentro);
}
