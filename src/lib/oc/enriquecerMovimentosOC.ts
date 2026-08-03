// PR-OC-CONFERENCIA-REBANHO-01 — camada de LEITURA que enriquece movimentos zootécnicos
// originados de Operação Comercial (OC) com os dados COMERCIAIS ausentes, SEM tocar o banco.
//
// Regra arquitetural: OC = fonte oficial comercial; movimento zootécnico = fonte oficial física.
//   Nada é gravado em `lancamentos`; o preenchimento é só em memória, na leitura.
//   - Fornecedor: contraparte da OC (zoo_operacoes_comerciais.contraparte_id → financeiro_fornecedores).
//   - Valor: valor NEGOCIADO do lote (zoo_operacao_lotes.valor_informado, critério 'total'),
//     PRORRATEADO por quantidade quando o lote tem múltiplos movimentos: valor × qtdMov / qtdLote.
//     NÃO usa soma de títulos financeiros (isso é liquidação; aqui é custo físico de aquisição).
//   - R$/@ (precoArroba): só quando há peso físico válido (arrobas > 0 via calcArrobas).
//
// Legado intacto: movimentos que já possuem valorTotal/fornecedorId NÃO são tocados; movimentos
//   sem vínculo de OC passam inalterados.
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento } from '@/types/cattle';
import { calcArrobas } from '@/lib/calculos/economicos';

/** Dados comerciais de UMA movimentação OC, já resolvidos do banco (por movimentacao_id). */
export interface EnriquecimentoOC {
  fornecedorId: string | null;
  fornecedorNome: string | null;
  valorLote: number | null;      // zoo_operacao_lotes.valor_informado (total do lote)
  qtdLote: number | null;        // zoo_operacao_lotes.qtd_negociada (para prorrateio)
  criterio: string | null;       // criterio_valor do lote ('total' = valor_informado é o total)
}

const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr));

/**
 * PURA (sem I/O) — aplica o enriquecimento a partir de um mapa `movimentacao_id → EnriquecimentoOC`.
 * Só preenche campos VAZIOS de movimentos presentes no mapa (OC). Legado e não-OC passam intactos.
 */
export function aplicarEnriquecimentoOC(
  lancamentos: Lancamento[],
  mapa: Map<string, EnriquecimentoOC>,
): Lancamento[] {
  if (mapa.size === 0) return lancamentos;
  return lancamentos.map((l) => {
    if (!l.id) return l;
    const e = mapa.get(l.id);
    if (!e) return l;                                   // não é movimento OC → intacto
    // Legado intacto: se já há dado comercial, não sobrescreve.
    if ((l.valorTotal != null && l.valorTotal > 0) || l.fornecedorId) return l;

    // Valor: valor do lote prorrateado pela quantidade do movimento (critério 'total').
    let valorTotal = l.valorTotal;
    if ((valorTotal == null || valorTotal <= 0) && e.valorLote != null && e.criterio === 'total') {
      const qtdMov = l.quantidade ?? 0;
      valorTotal = (e.qtdLote != null && e.qtdLote > 0 && qtdMov > 0)
        ? e.valorLote * (qtdMov / e.qtdLote)
        : e.valorLote;
    }

    // R$/@: só quando há peso físico válido (arrobas > 0). Sem peso → não calcula.
    let precoArroba = l.precoArroba;
    if ((precoArroba == null || precoArroba <= 0) && valorTotal != null && valorTotal > 0) {
      const arrobas = calcArrobas(l) ?? 0;
      if (arrobas > 0) precoArroba = valorTotal / arrobas;
    }

    return {
      ...l,
      fornecedorId: l.fornecedorId ?? e.fornecedorId ?? undefined,
      fornecedorNomeSnapshot: l.fornecedorNomeSnapshot ?? e.fornecedorNome ?? undefined,
      valorTotal: valorTotal ?? undefined,
      precoArroba,
    };
  });
}

/**
 * I/O — resolve o comercial da OC para os movimentos candidatos (dados comerciais vazios) e aplica
 * o enriquecimento. Batched (sem N+1). Se não houver candidatos/vínculo, retorna a lista original.
 */
export async function enriquecerMovimentosOC(lancamentos: Lancamento[]): Promise<Lancamento[]> {
  const candidatos = lancamentos.filter(
    (l) => !!l.id && (l.valorTotal == null || l.valorTotal <= 0) && !l.fornecedorId,
  );
  if (candidatos.length === 0) return lancamentos;
  const ids = uniq(candidatos.map((l) => l.id));

  // Ponte oficial movimento → OC + lote (só leitura). Idioma existente do projeto p/ tabelas zoo não tipadas.
  const { data: movs } = await (supabase as any)
    .from('zoo_operacao_movimentacoes')
    .select('movimentacao_id, operacao_id, operacao_lote_id')
    .in('movimentacao_id', ids);
  const movRows = (movs ?? []) as { movimentacao_id: string; operacao_id: string | null; operacao_lote_id: string | null }[];
  if (movRows.length === 0) return lancamentos;

  const opIds = uniq(movRows.map((m) => m.operacao_id).filter((x): x is string => !!x));
  const loteIds = uniq(movRows.map((m) => m.operacao_lote_id).filter((x): x is string => !!x));

  const [opsRes, lotesRes] = await Promise.all([
    opIds.length
      ? (supabase as any).from('zoo_operacoes_comerciais').select('id, contraparte_id').in('id', opIds)
      : Promise.resolve({ data: [] }),
    loteIds.length
      ? (supabase as any).from('zoo_operacao_lotes').select('id, valor_informado, qtd_negociada, criterio_valor').in('id', loteIds)
      : Promise.resolve({ data: [] }),
  ]);

  const contraByOp = new Map<string, string | null>(
    ((opsRes.data ?? []) as { id: string; contraparte_id: string | null }[]).map((o) => [o.id, o.contraparte_id]),
  );
  const contraIds = uniq(Array.from(contraByOp.values()).filter((x): x is string => !!x));
  const fornRes = contraIds.length
    ? await (supabase as any).from('financeiro_fornecedores').select('id, nome').in('id', contraIds)
    : { data: [] };
  const nomeByContra = new Map<string, string | null>(
    ((fornRes.data ?? []) as { id: string; nome: string | null }[]).map((f) => [f.id, f.nome]),
  );
  const loteById = new Map<string, { valor_informado: number | null; qtd_negociada: number | null; criterio_valor: string | null }>(
    ((lotesRes.data ?? []) as { id: string; valor_informado: number | null; qtd_negociada: number | null; criterio_valor: string | null }[])
      .map((lo) => [lo.id, lo]),
  );

  const mapa = new Map<string, EnriquecimentoOC>();
  for (const m of movRows) {
    const contra = m.operacao_id ? (contraByOp.get(m.operacao_id) ?? null) : null;
    const lote = m.operacao_lote_id ? loteById.get(m.operacao_lote_id) : undefined;
    mapa.set(m.movimentacao_id, {
      fornecedorId: contra,
      fornecedorNome: contra ? (nomeByContra.get(contra) ?? null) : null,
      valorLote: lote?.valor_informado != null ? Number(lote.valor_informado) : null,
      qtdLote: lote?.qtd_negociada != null ? Number(lote.qtd_negociada) : null,
      criterio: lote?.criterio_valor ?? null,
    });
  }

  return aplicarEnriquecimentoOC(lancamentos, mapa);
}
