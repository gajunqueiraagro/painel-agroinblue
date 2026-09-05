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
  /**
   * O detalhe do ABATE daquele lote, no cenário realizado — ABATE-T3b.
   *
   * ⚠ A LISTA LIA SÓ `lancamentos`, e num abate vindo de OC as colunas do abate
   * (carcaça, preço da @, bônus) estão VAZIAS ali: elas moram em `zoo_operacao_abate`,
   * por lote. Resultado: REND, P.@ e R$/liq @ apareciam como "—" e o modal mostrava
   * "Valor base R$ 0,00" numa operação de setecentos mil.
   * ⚠ O VÍNCULO É O DO BANCO (`zoo_operacao_movimentacoes.operacao_lote_id`), não
   * heurística por data ou categoria.
   */
  abate?: {
    pesoCarcacaKg: number | null;      // TOTAL do lote (ver `FonteCarcaca`)
    precoArroba: number | null;
    bonusPrecoce: number | null; bonusPrecoceFonte: string | null;
    bonusQualidade: number | null; bonusQualidadeFonte: string | null;
    bonusListaTrace: number | null; bonusListaTraceFonte: string | null;
    descontoQualidade: number | null; descontoQualidadeFonte: string | null;
    outrosDescontos: number | null; outrosDescontosFonte: string | null;
    funrural: number | null; funruralFonte: string | null;
    valorLiquido: number | null;
    qtdLote: number | null;
  } | null;
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
    /* Legado intacto: se já há dado comercial, não sobrescreve — EXCETO o detalhe do
       abate, que é acréscimo puro (a tela não o tinha de onde tirar). */
    const soAbate = (l.valorTotal != null && l.valorTotal > 0) || l.fornecedorId;
    if (soAbate && !(l.tipo === 'abate' && e.abate)) return l;

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

    /* ⚠ O ABATE VEM POR INTEIRO OU NÃO VEM. Preencher só a carcaça deixaria a tela
       calcular um rendimento com preço ausente — meio dado é pior que nenhum aqui,
       porque a lista não sabe distinguir "não informado" de "não carregado".
       ⚠ A CARCAÇA É O TOTAL DO LOTE e `Lancamento.pesoCarcacaKg` é POR CABEÇA — ZOOT-LISTA-01.
       Toda a base lê esse campo por cabeça: `economicos.ts` faz `(pesoCarcacaKg/15) × qtd`
       para as arrobas e `pesoCarcacaKg / pesoMedioKg` para o rendimento; LancamentosTab,
       LancamentoDetalhe e PainelConsultor repetem as duas contas. Gravar o TOTAL aqui punha
       12.260,8 kg num campo que vale 299,04 — a lista mostrava 817 @/cab e rendimento de
       2.269%, e a guarda `0 < r < 100` de FinanceiroTab escondia o segundo apagando a coluna.
       Dividir pela quantidade DO LOTE devolve a unidade certa e dispensa prorratear: o valor
       por cabeça é o mesmo no lote inteiro e em qualquer parte dele. */
    const ab = e.abate ?? null;
    /* Já o que é VALOR em reais continua sendo do lote inteiro e prorrateia. */
    const proporcao = ab && ab.qtdLote && ab.qtdLote > 0 && (l.quantidade ?? 0) > 0
      ? (l.quantidade as number) / ab.qtdLote : 1;
    const campoAbate = ab ? {
      pesoCarcacaKg: ab.pesoCarcacaKg != null && ab.qtdLote != null && ab.qtdLote > 0
        ? ab.pesoCarcacaKg / ab.qtdLote : l.pesoCarcacaKg,
      precoArroba: ab.precoArroba ?? precoArroba,
      bonusPrecoce: ab.bonusPrecoce ?? l.bonusPrecoce,
      bonusQualidade: ab.bonusQualidade ?? l.bonusQualidade,
      bonusListaTrace: ab.bonusListaTrace ?? l.bonusListaTrace,
      descontoQualidade: ab.descontoQualidade ?? l.descontoQualidade,
      descontoFunrural: ab.funrural != null && ab.funruralFonte === 'reais'
        ? ab.funrural * proporcao : l.descontoFunrural,
      /* O RECEBIDO NF do abate vindo de OC — ZOOT-LISTA-01. `valor_total` do lançamento é
         cópia velha: em 3 dos 12 abates de OC do proto ele ficou para trás de uma
         revaloração (−9.009,85, −4.774,56, −3.555,71), porque `oc_salvar_abate` não
         propaga o líquido. Só de LEITURA e só para a coluna; nada grava por aqui. */
      valorLiquidoAbate: ab.valorLiquido != null ? ab.valorLiquido * proporcao : undefined,
    } : {};

    if (soAbate) return { ...l, ...campoAbate };

    return {
      ...l,
      fornecedorId: l.fornecedorId ?? e.fornecedorId ?? undefined,
      fornecedorNomeSnapshot: l.fornecedorNomeSnapshot ?? e.fornecedorNome ?? undefined,
      valorTotal: valorTotal ?? undefined,
      precoArroba,
      ...campoAbate,
    };
  });
}

/**
 * I/O — resolve o comercial da OC para os movimentos candidatos (dados comerciais vazios) e aplica
 * o enriquecimento. Batched (sem N+1). Se não houver candidatos/vínculo, retorna a lista original.
 */
export async function enriquecerMovimentosOC(lancamentos: Lancamento[]): Promise<Lancamento[]> {
  /* ⚠ O ABATE DA OC NÃO ERA CANDIDATO, e por isso a lista ficava em "—": o critério
     antigo é "sem valor e sem fornecedor", e o abate vindo de OC **já tem os dois** — o
     líquido é gravado no lançamento. O que falta nele é o DETALHE (carcaça, preço da @,
     bônus), que mora em `zoo_operacao_abate`. Por isso o abate entra por outra porta:
     é de abate e não tem carcaça. */
  const candidatos = lancamentos.filter(
    (l) => !!l.id && (
      ((l.valorTotal == null || l.valorTotal <= 0) && !l.fornecedorId)
      || (l.tipo === 'abate' && (l.pesoCarcacaKg == null || l.pesoCarcacaKg <= 0))
    ),
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

  /* ⚠ SÓ O CENÁRIO REALIZADO: a lista de lançamentos mostra o que aconteceu, e o
     projetado é outra leitura. Um `IN` por lote, sem N+1 — mesmo desenho das outras duas. */
  const abateRes = loteIds.length
    ? await (supabase as any).from('zoo_operacao_abate')
        .select('operacao_lote_id, peso_carcaca_kg, preco_arroba, bonus_precoce_valor, bonus_precoce_fonte,'
          + ' bonus_qualidade_valor, bonus_qualidade_fonte, bonus_lista_trace_valor, bonus_lista_trace_fonte,'
          + ' desconto_qualidade_valor, desconto_qualidade_fonte, outros_descontos_valor, outros_descontos_fonte,'
          + ' funrural_valor, funrural_fonte, valor_liquido')
        .in('operacao_lote_id', loteIds).eq('cenario', 'realizado')
    : { data: [] };

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

  type AbateRow = Record<string, unknown>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const txt = (v: unknown) => (v == null ? null : String(v));
  const abateByLote = new Map<string, AbateRow>(
    ((abateRes.data ?? []) as AbateRow[]).map(a => [String(a.operacao_lote_id), a]),
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
      abate: (() => {
        const a = m.operacao_lote_id ? abateByLote.get(m.operacao_lote_id) : undefined;
        if (!a) return null;
        return {
          pesoCarcacaKg: num(a.peso_carcaca_kg), precoArroba: num(a.preco_arroba),
          bonusPrecoce: num(a.bonus_precoce_valor), bonusPrecoceFonte: txt(a.bonus_precoce_fonte),
          bonusQualidade: num(a.bonus_qualidade_valor), bonusQualidadeFonte: txt(a.bonus_qualidade_fonte),
          bonusListaTrace: num(a.bonus_lista_trace_valor), bonusListaTraceFonte: txt(a.bonus_lista_trace_fonte),
          descontoQualidade: num(a.desconto_qualidade_valor), descontoQualidadeFonte: txt(a.desconto_qualidade_fonte),
          outrosDescontos: num(a.outros_descontos_valor), outrosDescontosFonte: txt(a.outros_descontos_fonte),
          funrural: num(a.funrural_valor), funruralFonte: txt(a.funrural_fonte),
          valorLiquido: num(a.valor_liquido),
          qtdLote: lote?.qtd_negociada != null ? Number(lote.qtd_negociada) : null,
        };
      })(),
    });
  }

  return aplicarEnriquecimentoOC(lancamentos, mapa);
}
