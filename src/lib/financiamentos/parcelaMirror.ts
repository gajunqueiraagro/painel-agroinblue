/**
 * Mirror de parcelas de financiamento em financeiro_lancamentos_v2
 * e planejamento_financeiro.
 *
 * Para cada parcela cria:
 *  - 1 lançamento "Principal" (amortização) e 1 "Juros" em financeiro_lancamentos_v2
 *  - 1 planejamento "Principal" e 1 "Juros" em planejamento_financeiro (cenario=meta)
 *
 * Vínculo:
 *  - financiamento_parcelas.lancamento_id recebe o id do lançamento do Principal.
 *  - Todos os lançamentos/planejamentos gerados carregam a parcela_id no campo observacao
 *    para lookup via .eq('observacao', parcelaId).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ParcelaInput {
  id: string;
  cliente_id: string;
  fazenda_id?: string | null;
  data_vencimento: string; // 'YYYY-MM-DD'
  valor_principal: number;
  valor_juros: number;
  lancamento_id?: string | null;
  lancamento_juros_id?: string | null;
}

export interface FinanciamentoInput {
  id: string;
  cliente_id: string;
  fazenda_id?: string | null;
  tipo_financiamento: 'pecuaria' | 'agricultura';
  descricao?: string | null;
  numero_contrato?: string | null;
  credor_id?: string | null;
  data_contrato?: string | null;
}

interface Classificacao {
  subcentro: string;
  plano_conta_id: string;
  macro_custo: string;
  grupo_custo: string;
  escopo_negocio: string;
  centro_custo: string;
}

// PR-FIN-DATAS-VENCIMENTO-02B: criarMirrorParcela, buildDescricao, lancamentoRow,
// planejamentoRow e as tabelas AMORT/JUROS foram removidos. Eram o writer
// historico do espelho, ja sem nenhum chamador vivo: as chamadas de UI estavam
// todas comentadas e o unico chamador restante, backfillParcelasPendentes, era
// orfao. O writer oficial e a RPC fn_reconciliar_parcela_financiamento.

export async function deletarMirrorParcela(
  supabase: SupabaseClient,
  parcelaId: string,
): Promise<void> {
  // Buscar IDs oficiais da parcela
  const { data: parcela } = await supabase
    .from('financiamento_parcelas')
    .select('lancamento_id, lancamento_juros_id')
    .eq('id', parcelaId)
    .maybeSingle();

  const ids = [parcela?.lancamento_id, parcela?.lancamento_juros_id].filter(Boolean) as string[];
  if (ids.length > 0) {
    const { error: lancErr } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ cancelado: true })
      .in('id', ids);
    if (lancErr) console.error('[parcelaMirror] erro cancelar lançamentos:', lancErr);
  } else {
    console.warn('[parcelaMirror] parcela sem IDs vinculados — nenhum lançamento cancelado:', parcelaId);
  }
  // Limpar IDs na parcela para garantir que criarMirrorParcela grava os novos sem ambiguidade
  const { error: clearErr } = await supabase
    .from('financiamento_parcelas')
    .update({ lancamento_id: null, lancamento_juros_id: null })
    .eq('id', parcelaId);
  if (clearErr) console.error('[parcelaMirror] erro limpar IDs da parcela:', clearErr);

  const { error: planErr } = await (supabase
    .from('planejamento_financeiro' as any)
    .delete()
    .eq('origem', 'parcela_auto')
    .eq('observacao', parcelaId) as any);
  if (planErr) console.error('[parcelaMirror] erro delete planejamento:', planErr);
}

/**
 * Cancela TODOS os lancamentos financeiros vinculados a um financiamento, cobrindo
 * 6 mecanismos de vinculo:
 *   a) financiamento_parcelas.lancamento_id           (vinculo bilateral motor)
 *   b) financiamento_parcelas.lancamento_juros_id     (vinculo bilateral motor)
 *   c) observacao = parcela.id::text                  (legado UUID puro)
 *   d) observacao = 'parcela:' + parcela.id + ':parcela_principal'
 *   e) observacao = 'parcela:' + parcela.id + ':parcela_juros'
 *   f) financeiro_lancamentos_v2.financiamento_id     (inclui captacao)
 *
 * Regras invioláveis:
 * - Se algum lancamento estiver conciliado ou editado manualmente, retorna ok=false e NAO cancela nada.
 * - Se cancelar parcialmente, lanca exception e NAO pode terminar com estado inconsistente.
 * - Audit tag e anexada ao final da observacao, preservando conteudo original (rollback simples).
 *
 * Esta funcao deve ser chamada ANTES de deletar parcelas/financiamento.
 */
export async function cancelarLancamentosDoFinanciamento(
  supabase: SupabaseClient,
  financiamentoId: string,
  auditTag: string = `[fin_excluido_cascade_${new Date().toISOString().slice(0, 10)}]`,
): Promise<{
  ok: boolean;
  totalCandidatos: number;
  totalCancelados: number;
  conciliados: number;
  editadosManual: number;
  ids: string[];
}> {
  // ============== ETAPA 1: Buscar parcelas do financiamento ==============
  const { data: parcelas, error: errP } = await supabase
    .from('financiamento_parcelas')
    .select('id, lancamento_id, lancamento_juros_id')
    .eq('financiamento_id', financiamentoId);
  if (errP) throw errP;

  const parcelaIds: string[] = (parcelas ?? []).map((p: any) => p.id);
  const lancIdsDireto: string[] = (parcelas ?? [])
    .flatMap((p: any) => [p.lancamento_id, p.lancamento_juros_id])
    .filter(Boolean);

  // ============== ETAPA 2: Coletar candidatos (6 vinculos) ==============
  const candidatosIds = new Set<string>(lancIdsDireto); // vinculos a + b

  if (parcelaIds.length > 0) {
    // c) observacao = parcelaId (legado UUID puro)
    const { data: c1, error: e1 } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id')
      .in('observacao', parcelaIds);
    if (e1) throw e1;
    (c1 ?? []).forEach((x: any) => candidatosIds.add(x.id));

    // d + e) prefix parcela:<id>:parcela_principal | parcela:<id>:parcela_juros
    // Chunk em 25 parcelas/batch para nao estourar URL do PostgREST
    const CHUNK = 25;
    for (let i = 0; i < parcelaIds.length; i += CHUNK) {
      const batch = parcelaIds.slice(i, i + CHUNK);
      const orFilters = batch
        .flatMap(pid => [
          `observacao.eq.parcela:${pid}:parcela_principal`,
          `observacao.eq.parcela:${pid}:parcela_juros`,
        ])
        .join(',');
      if (orFilters) {
        const { data: c2, error: e2 } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id')
          .or(orFilters);
        if (e2) throw e2;
        (c2 ?? []).forEach((x: any) => candidatosIds.add(x.id));
      }
    }
  }

  // f) financiamento_id (cobre captacao + qualquer outro caso)
  const { data: c3, error: e3 } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id')
    .eq('financiamento_id', financiamentoId);
  if (e3) throw e3;
  (c3 ?? []).forEach((x: any) => candidatosIds.add(x.id));

  const candidatos = Array.from(candidatosIds);
  if (candidatos.length === 0) {
    return { ok: true, totalCandidatos: 0, totalCancelados: 0, conciliados: 0, editadosManual: 0, ids: [] };
  }

  // ============== ETAPA 3: Carregar candidatos + checar bloqueios ==============
  const { data: lancs, error: errL } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id, cancelado, editado_manual, conciliado_em, observacao')
    .in('id', candidatos);
  if (errL) throw errL;

  const ativos = (lancs ?? []).filter((l: any) => l.cancelado === false);
  const conciliados = ativos.filter((l: any) => l.conciliado_em !== null).length;
  const editadosManual = ativos.filter((l: any) => l.editado_manual === true).length;

  if (conciliados > 0 || editadosManual > 0) {
    return {
      ok: false,
      totalCandidatos: ativos.length,
      totalCancelados: 0,
      conciliados,
      editadosManual,
      ids: ativos.map((l: any) => l.id),
    };
  }

  if (ativos.length === 0) {
    return { ok: true, totalCandidatos: 0, totalCancelados: 0, conciliados: 0, editadosManual: 0, ids: [] };
  }

  // ============== ETAPA 4: Cancelar em loop (abort no primeiro erro) ==============
  let cancelados = 0;
  const errosUpdate: string[] = [];

  for (const l of ativos) {
    const lid = (l as any).id as string;
    const obsOriginal = ((l as any).observacao ?? '') as string;
    const novaObs = obsOriginal ? `${obsOriginal} ${auditTag}` : auditTag;

    const { error: errU, count } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ cancelado: true, observacao: novaObs }, { count: 'exact' })
      .eq('id', lid)
      .eq('cancelado', false)
      .is('conciliado_em', null)
      .eq('editado_manual', false);

    if (errU) {
      errosUpdate.push(`${lid}: ${errU.message}`);
      break; // abort imediato
    }
    if (count === 0 || count === null) {
      errosUpdate.push(`${lid}: race condition (count=${count}) — estado mudou durante operacao`);
      break; // abort imediato
    }
    cancelados++;
  }

  if (errosUpdate.length > 0) {
    throw new Error(
      `Cancelamento em cascata ABORTADO. Esperados=${ativos.length}, cancelados=${cancelados}. ` +
      `Erros: ${errosUpdate.join(' | ')}`,
    );
  }

  // ============== ETAPA 5: Garantia de totalizador ==============
  if (cancelados !== ativos.length) {
    throw new Error(
      `Garantia violada: esperados ${ativos.length} cancelamentos, executados ${cancelados}`,
    );
  }

  // ============== ETAPA 6: Re-verificacao defensiva (read-after-write) ==============
  const idsCancelados = ativos.map((l: any) => l.id as string);
  const { data: confirmacao, error: errC } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id, cancelado')
    .in('id', idsCancelados);
  if (errC) throw errC;

  const naoCancelados = (confirmacao ?? []).filter((x: any) => x.cancelado !== true);
  if (naoCancelados.length > 0) {
    throw new Error(
      `Verificacao pos-update FALHOU: ${naoCancelados.length} lancamento(s) nao estao cancelado=true: ` +
      naoCancelados.map((x: any) => x.id).join(', '),
    );
  }

  return {
    ok: true,
    totalCandidatos: ativos.length,
    totalCancelados: cancelados,
    conciliados: 0,
    editadosManual: 0,
    ids: idsCancelados,
  };
}

export async function atualizarValoresMirror(
  supabase: SupabaseClient,
  lancamentoPrincipalId: string | null,
  lancamentoJurosId: string | null,
  valorPrincipal: number,
  valorJuros: number,
): Promise<void> {
  if (lancamentoPrincipalId) {
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ valor: valorPrincipal })
      .eq('id', lancamentoPrincipalId);
    if (error) console.error('[parcelaMirror] erro update valor principal:', error);
  }
  if (lancamentoJurosId) {
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ valor: valorJuros })
      .eq('id', lancamentoJurosId);
    if (error) console.error('[parcelaMirror] erro update valor juros:', error);
  }
}

export async function atualizarStatusMirror(
  supabase: SupabaseClient,
  lancamentoPrincipalId: string | null,
  lancamentoJurosId: string | null,
  dataPagamento: string,
  contaBancariaId?: string | null,
): Promise<void> {
  const ids = [lancamentoPrincipalId, lancamentoJurosId].filter(Boolean) as string[];
  if (ids.length === 0) {
    console.warn('[parcelaMirror] atualizarStatusMirror: nenhum ID oficial fornecido');
    return;
  }
  const update: Record<string, any> = {
    status_transacao: 'realizado',
    data_pagamento: dataPagamento,
  };
  if (contaBancariaId) update.conta_bancaria_id = contaBancariaId;
  const { error } = await supabase
    .from('financeiro_lancamentos_v2')
    .update(update)
    .in('id', ids);
  if (error) console.error('[parcelaMirror] erro update status:', error);
}
