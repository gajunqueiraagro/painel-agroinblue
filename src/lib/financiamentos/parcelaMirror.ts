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
}

export interface FinanciamentoInput {
  id: string;
  cliente_id: string;
  fazenda_id?: string | null;
  tipo_financiamento: 'pecuaria' | 'agricultura';
}

interface Classificacao {
  subcentro: string;
  plano_conta_id: string;
  macro_custo: string;
  grupo_custo: string;
  escopo_negocio: string;
}

const AMORT: Record<'pecuaria' | 'agricultura', Classificacao> = {
  pecuaria: {
    subcentro: 'Amortização Financiamento Pecuária',
    plano_conta_id: '0d42d354-926a-4a10-ab3a-f082adaef972',
    macro_custo: 'Saída Financeira',
    grupo_custo: 'Amortizações',
    escopo_negocio: 'administrativo',
  },
  agricultura: {
    subcentro: 'Amortização Financiamento Agricultura',
    plano_conta_id: '576eb57d-5fb6-4461-9614-a9268b9a50fb',
    macro_custo: 'Saída Financeira',
    grupo_custo: 'Amortizações',
    escopo_negocio: 'administrativo',
  },
};

const JUROS: Record<'pecuaria' | 'agricultura', Classificacao> = {
  pecuaria: {
    subcentro: 'Juros de Financiamento Pecuária',
    plano_conta_id: '5d4a5c70-311d-4302-98f0-b2846d9738fc',
    macro_custo: 'Custeio Produção',
    grupo_custo: 'Juros de Financiamento Pecuária',
    escopo_negocio: 'pecuaria',
  },
  agricultura: {
    subcentro: 'Juros de Financiamento Agricultura',
    plano_conta_id: '0c489373-7035-4b89-8fb4-42ac42796fa5',
    macro_custo: 'Custeio Produção',
    grupo_custo: 'Juros de Financiamento Agricultura',
    escopo_negocio: 'agricultura',
  },
};

function lancamentoRow(
  parcela: ParcelaInput,
  financiamento: FinanciamentoInput,
  cls: Classificacao,
  valor: number,
  origemTipo: 'parcela_principal' | 'parcela_juros',
) {
  const anoMes = parcela.data_vencimento.slice(0, 7);
  return {
    cliente_id: parcela.cliente_id,
    fazenda_id: financiamento.fazenda_id ?? parcela.fazenda_id ?? null,
    ano_mes: anoMes,
    data_pagamento: parcela.data_vencimento,
    data_competencia: parcela.data_vencimento,
    tipo_operacao: '2-Saídas',
    sinal: -1,
    valor,
    status_transacao: 'programado',
    cenario: 'realizado',
    origem_lancamento: 'parcela_financiamento',
    origem_tipo: origemTipo,
    cancelado: false,
    editado_manual: false,
    sem_movimentacao_caixa: false,
    macro_custo: cls.macro_custo,
    grupo_custo: cls.grupo_custo,
    subcentro: cls.subcentro,
    escopo_negocio: cls.escopo_negocio,
    plano_conta_id: cls.plano_conta_id,
    observacao: parcela.id,
  };
}

function planejamentoRow(
  parcela: ParcelaInput,
  financiamento: FinanciamentoInput,
  cls: Classificacao,
  valor: number,
) {
  const [anoStr, mesStr] = parcela.data_vencimento.split('-');
  return {
    cliente_id: parcela.cliente_id,
    fazenda_id: financiamento.fazenda_id ?? parcela.fazenda_id ?? null,
    ano: Number(anoStr),
    mes: Number(mesStr),
    macro_custo: cls.macro_custo,
    grupo_custo: cls.grupo_custo,
    centro_custo: cls.grupo_custo,
    subcentro: cls.subcentro,
    escopo_negocio: cls.escopo_negocio,
    tipo_custo: 'fixo',
    valor_base: valor,
    valor_planejado: valor,
    origem: 'parcela_auto',
    cenario: 'meta',
    observacao: parcela.id,
  };
}

export async function criarMirrorParcela(
  supabase: SupabaseClient,
  parcela: ParcelaInput,
  financiamento: FinanciamentoInput,
): Promise<{ lancamentoIdPrincipal: string | null; lancamentoIdJuros: string | null }> {
  // Evita duplicata
  if (parcela.lancamento_id) {
    return { lancamentoIdPrincipal: parcela.lancamento_id, lancamentoIdJuros: null };
  }
  const tipo = financiamento.tipo_financiamento;
  if (tipo !== 'pecuaria' && tipo !== 'agricultura') {
    console.warn('[parcelaMirror] tipo_financiamento invalido:', tipo);
    return { lancamentoIdPrincipal: null, lancamentoIdJuros: null };
  }

  const principal = Number(parcela.valor_principal) || 0;
  const juros = Number(parcela.valor_juros) || 0;

  const lancInserts: any[] = [];
  const planInserts: any[] = [];

  if (principal > 0) {
    lancInserts.push({ _kind: 'principal', row: lancamentoRow(parcela, financiamento, AMORT[tipo], principal, 'parcela_principal') });
    planInserts.push(planejamentoRow(parcela, financiamento, AMORT[tipo], principal));
  }
  if (juros > 0) {
    lancInserts.push({ _kind: 'juros', row: lancamentoRow(parcela, financiamento, JUROS[tipo], juros, 'parcela_juros') });
    planInserts.push(planejamentoRow(parcela, financiamento, JUROS[tipo], juros));
  }

  if (lancInserts.length === 0) {
    return { lancamentoIdPrincipal: null, lancamentoIdJuros: null };
  }

  const { data: lancData, error: lancErr } = await supabase
    .from('financeiro_lancamentos_v2')
    .insert(lancInserts.map(x => x.row))
    .select('id, origem_tipo');
  if (lancErr) {
    console.error('[parcelaMirror] erro insert lancamentos:', lancErr);
    return { lancamentoIdPrincipal: null, lancamentoIdJuros: null };
  }
  const principalLanc = (lancData || []).find((r: any) => r.origem_tipo === 'parcela_principal');
  const jurosLanc = (lancData || []).find((r: any) => r.origem_tipo === 'parcela_juros');
  const lancamentoIdPrincipal = principalLanc?.id ?? null;
  const lancamentoIdJuros = jurosLanc?.id ?? null;

  if (planInserts.length > 0) {
    const { error: planErr } = await (supabase
      .from('planejamento_financeiro' as any)
      .insert(planInserts as any) as any);
    if (planErr) console.error('[parcelaMirror] erro insert planejamento:', planErr);
  }

  // Linka principal (ou juros, se não houver principal) na parcela
  const vinculoId = lancamentoIdPrincipal ?? lancamentoIdJuros;
  if (vinculoId) {
    const { error: upErr } = await supabase
      .from('financiamento_parcelas')
      .update({ lancamento_id: vinculoId })
      .eq('id', parcela.id);
    if (upErr) console.error('[parcelaMirror] erro update parcela.lancamento_id:', upErr);
  }

  return { lancamentoIdPrincipal, lancamentoIdJuros };
}

export async function deletarMirrorParcela(
  supabase: SupabaseClient,
  parcelaId: string,
): Promise<void> {
  const { error: lancErr } = await supabase
    .from('financeiro_lancamentos_v2')
    .delete()
    .eq('origem_lancamento', 'parcela_financiamento')
    .eq('observacao', parcelaId);
  if (lancErr) console.error('[parcelaMirror] erro delete lancamentos:', lancErr);

  const { error: planErr } = await (supabase
    .from('planejamento_financeiro' as any)
    .delete()
    .eq('origem', 'parcela_auto')
    .eq('observacao', parcelaId) as any);
  if (planErr) console.error('[parcelaMirror] erro delete planejamento:', planErr);
}

export async function atualizarStatusMirror(
  supabase: SupabaseClient,
  parcelaId: string,
  dataPagamento: string,
): Promise<void> {
  const { error } = await supabase
    .from('financeiro_lancamentos_v2')
    .update({
      status_transacao: 'realizado',
      data_pagamento: dataPagamento,
    })
    .eq('origem_lancamento', 'parcela_financiamento')
    .eq('observacao', parcelaId);
  if (error) console.error('[parcelaMirror] erro update status:', error);
}
