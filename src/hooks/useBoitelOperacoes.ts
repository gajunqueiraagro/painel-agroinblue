import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buscarPlanoContasBoitel } from '@/lib/financeiro/boitelMapping';

/* ═══ TYPES ═══ */

export interface BoitelLote {
  id?: string;
  cliente_id: string;
  fazenda_id: string;
  lote_codigo: string;
  data_envio: string;
  boitel_destino: string;
  contrato_baia: string;
  quantidade_cab: number;
  peso_saida_fazenda_kg: number;
  status_lote?: 'ativo' | 'encerrado' | 'cancelado';
}

export interface BoitelPlanejamento {
  boitel_lote_id: string;
  modalidade: 'diaria' | 'arroba' | 'parceria';
  dias: number;
  gmd: number;
  rendimento_entrada: number;
  rendimento_saida: number;
  custo_diaria: number;
  custo_arroba: number;
  percentual_parceria: number;
  custos_extras_parceria: number;
  custo_nutricao: number;
  custo_sanidade: number;
  custo_frete: number;
  outros_custos: number;
  despesas_abate: number;
  preco_venda_arroba: number;
  faturamento_bruto: number;
  faturamento_liquido: number;
  receita_produtor: number;
  custo_total: number;
  lucro_total: number;
  possui_adiantamento: boolean;
  data_adiantamento: string | null;
  pct_adiantamento_diarias: number;
  valor_adiantamento_diarias: number;
  valor_adiantamento_sanitario: number;
  valor_adiantamento_outros: number;
  valor_total_antecipado: number;
  adiantamento_observacao: string | null;
}

/** Combined type used by the dialog/panel flow */
export interface BoitelOperacao extends BoitelLote {
  id: string;
  planejamento: BoitelPlanejamento;
}

/* ═══ UPSERT LOTE ═══ */

export async function salvarBoitelLote(lote: BoitelLote): Promise<string | null> {
  const payload = {
    lote_codigo: lote.lote_codigo || '',
    data_envio: lote.data_envio || null,
    boitel_destino: lote.boitel_destino || '',
    contrato_baia: lote.contrato_baia || null,
    quantidade_cab: lote.quantidade_cab,
    peso_saida_fazenda_kg: lote.peso_saida_fazenda_kg,
  };

  if (lote.id) {
    const { error } = await supabase
      .from('boitel_lotes')
      .update(payload as any)
      .eq('id', lote.id);
    if (error) { toast.error('Erro ao atualizar lote boitel: ' + error.message); return null; }
    return lote.id;
  } else {
    const { data, error } = await supabase
      .from('boitel_lotes')
      .insert({ ...payload, cliente_id: lote.cliente_id, fazenda_id: lote.fazenda_id } as any)
      .select('id')
      .single();
    if (error) { toast.error('Erro ao criar lote boitel: ' + error.message); return null; }
    return data?.id || null;
  }
}

/* ═══ UPSERT PLANEJAMENTO (with auto-history) ═══ */

export async function salvarBoitelPlanejamento(plan: BoitelPlanejamento): Promise<boolean> {
  const payload = { ...plan };

  // Check if planejamento already exists for this lote
  const { data: existing } = await supabase
    .from('boitel_planejamento')
    .select('id')
    .eq('boitel_lote_id', plan.boitel_lote_id)
    .maybeSingle();

  if (existing) {
    // UPDATE triggers the history trigger automatically
    const { error } = await supabase
      .from('boitel_planejamento')
      .update(payload as any)
      .eq('boitel_lote_id', plan.boitel_lote_id);
    if (error) { toast.error('Erro ao atualizar planejamento: ' + error.message); return false; }
  } else {
    const { error } = await supabase
      .from('boitel_planejamento')
      .insert(payload as any);
    if (error) { toast.error('Erro ao criar planejamento: ' + error.message); return false; }
  }
  return true;
}

/* ═══ VINCULAR LOTE AO LANÇAMENTO ═══ */

export async function vincularBoitelAoLancamento(lancamentoId: string, boitelLoteId: string): Promise<boolean> {
  const { error } = await supabase
    .from('lancamentos')
    .update({ boitel_lote_id: boitelLoteId } as any)
    .eq('id', lancamentoId);
  if (error) { toast.error('Erro ao vincular lote boitel: ' + error.message); return false; }
  return true;
}

/* ═══ CARREGAR OPERAÇÃO COMPLETA ═══ */

export async function carregarBoitelOperacao(boitelLoteId: string): Promise<BoitelOperacao | null> {
  const { data: lote, error: e1 } = await supabase
    .from('boitel_lotes')
    .select('*')
    .eq('id', boitelLoteId)
    .single();
  if (e1 || !lote) return null;

  const { data: plan } = await supabase
    .from('boitel_planejamento')
    .select('*')
    .eq('boitel_lote_id', boitelLoteId)
    .maybeSingle();

  return {
    id: lote.id,
    cliente_id: lote.cliente_id,
    fazenda_id: lote.fazenda_id,
    lote_codigo: lote.lote_codigo || '',
    data_envio: lote.data_envio || '',
    boitel_destino: lote.boitel_destino || '',
    contrato_baia: lote.contrato_baia || '',
    quantidade_cab: lote.quantidade_cab,
    peso_saida_fazenda_kg: lote.peso_saida_fazenda_kg,
    status_lote: lote.status_lote as any,
    planejamento: plan ? {
      boitel_lote_id: plan.boitel_lote_id,
      modalidade: plan.modalidade as any,
      dias: plan.dias,
      gmd: plan.gmd,
      rendimento_entrada: plan.rendimento_entrada,
      rendimento_saida: plan.rendimento_saida,
      custo_diaria: plan.custo_diaria,
      custo_arroba: plan.custo_arroba,
      percentual_parceria: plan.percentual_parceria,
      custos_extras_parceria: plan.custos_extras_parceria,
      custo_nutricao: plan.custo_nutricao,
      custo_sanidade: plan.custo_sanidade,
      custo_frete: plan.custo_frete,
      outros_custos: plan.outros_custos,
      despesas_abate: plan.despesas_abate,
      preco_venda_arroba: plan.preco_venda_arroba,
      faturamento_bruto: plan.faturamento_bruto,
      faturamento_liquido: plan.faturamento_liquido,
      receita_produtor: plan.receita_produtor,
      custo_total: plan.custo_total,
      lucro_total: plan.lucro_total,
      possui_adiantamento: plan.possui_adiantamento,
      data_adiantamento: plan.data_adiantamento,
      pct_adiantamento_diarias: plan.pct_adiantamento_diarias,
      valor_adiantamento_diarias: plan.valor_adiantamento_diarias,
      valor_adiantamento_sanitario: plan.valor_adiantamento_sanitario,
      valor_adiantamento_outros: plan.valor_adiantamento_outros,
      valor_total_antecipado: plan.valor_total_antecipado,
      adiantamento_observacao: plan.adiantamento_observacao,
    } : {
      boitel_lote_id: boitelLoteId,
      modalidade: 'diaria', dias: 90, gmd: 0, rendimento_entrada: 50, rendimento_saida: 52,
      custo_diaria: 0, custo_arroba: 0, percentual_parceria: 0, custos_extras_parceria: 0,
      custo_nutricao: 0, custo_sanidade: 0, custo_frete: 0, outros_custos: 0, despesas_abate: 0,
      preco_venda_arroba: 0, faturamento_bruto: 0, faturamento_liquido: 0, receita_produtor: 0,
      custo_total: 0, lucro_total: 0, possui_adiantamento: false, data_adiantamento: null,
      pct_adiantamento_diarias: 0, valor_adiantamento_diarias: 0, valor_adiantamento_sanitario: 0,
      valor_adiantamento_outros: 0, valor_total_antecipado: 0, adiantamento_observacao: null,
    },
  } as BoitelOperacao;
}

/* ═══ CANCELAR LOTE ═══ */

export async function cancelarBoitelLote(boitelLoteId: string, clienteId: string): Promise<boolean> {
  const userId = (await supabase.auth.getUser()).data.user?.id;

  // 1. Set lote status to cancelado
  const { error: e1 } = await supabase
    .from('boitel_lotes')
    .update({ status_lote: 'cancelado' } as any)
    .eq('id', boitelLoteId);
  if (e1) { toast.error('Erro ao cancelar lote: ' + e1.message); return false; }

  // 2. Cancel only automatic financial records (grupo_geracao_id not null)
  const { data: autoFin } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id')
    .eq('boitel_lote_id', boitelLoteId)
    .eq('origem_lancamento', 'boitel')
    .eq('cancelado', false)
    .not('grupo_geracao_id', 'is', null);

  const autoIds = (autoFin || []).map((r: any) => r.id);
  if (autoIds.length > 0) {
    await supabase.from('financeiro_lancamentos_v2')
      .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por: userId || null } as any)
      .in('id', autoIds);
  }

  // 3. Audit
  await supabase.from('audit_log_movimentacoes').insert({
    cliente_id: clienteId,
    usuario_id: userId || null,
    acao: 'cancelou_boitel_lote',
    detalhes: { boitel_lote_id: boitelLoteId, financeiros_cancelados: autoIds.length },
  });

  toast.success('Lote boitel cancelado.');
  return true;
}

/* ═══ GERAR FINANCEIRO ═══ */

export async function gerarFinanceiroBoitel(
  loteId: string,
  plan: BoitelPlanejamento,
  lote: BoitelLote & { id: string },
  lancamentoId: string,
  clienteId: string,
  fazendaId: string,
  dataRecebimento: string,
  options?: {
    fornecedorId?: string;
    notaFiscal?: string;
    isUpdate?: boolean;
    parcelas?: { data: string; valor: number }[];
    formaReceb?: 'avista' | 'prazo';
  }
): Promise<boolean> {
  if (plan.receita_produtor <= 0) {
    toast.error('Resultado do boitel inválido. Receita do produtor deve ser maior que zero.');
    return false;
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;
  const grupoId = crypto.randomUUID();

  // IDEMPOTENTE: cancel only automatic records
  const { data: old } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id')
    .eq('boitel_lote_id', loteId)
    .eq('origem_lancamento', 'boitel')
    .eq('cancelado', false)
    .not('grupo_geracao_id', 'is', null);
  const oldIds = (old || []).map((r: any) => r.id);
  if (oldIds.length > 0) {
    await supabase.from('financeiro_lancamentos_v2')
      .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por: userId || null } as any)
      .in('id', oldIds);
    await supabase.from('audit_log_movimentacoes').insert({
      cliente_id: clienteId,
      usuario_id: userId || null,
      acao: 'recalculo_financeiro_boitel',
      movimentacao_id: lancamentoId,
      financeiro_ids: oldIds,
      detalhes: { registros_cancelados: oldIds.length, motivo: 'Recálculo financeiro do boitel (idempotente)' },
    });
  }

  // === MAPEAMENTO EXPLÍCITO ===
  const clasReceita = await buscarPlanoContasBoitel(supabase, clienteId, 'boitel:receita');
  if (!clasReceita) {
    toast.error('Mapeamento financeiro não encontrado para receita de Boitel.');
    return false;
  }

  const inserts: any[] = [];
  const descBase = `Venda ${lote.quantidade_cab} cab - Boitel`;
  const temAdiantamento = plan.possui_adiantamento && plan.valor_total_antecipado > 0;

  // 0. ADIANTAMENTO
  if (temAdiantamento) {
    const dataAdiant = plan.data_adiantamento || lote.data_envio || dataRecebimento;
    const clsAdiant = await buscarPlanoContasBoitel(supabase, clienteId, 'boitel:adiantamento_pago');
    if (clsAdiant) {
      inserts.push({
        cliente_id: clienteId, fazenda_id: fazendaId,
        tipo_operacao: '2-Saídas', sinal: -1, status_transacao: 'programado',
        origem_lancamento: 'boitel', movimentacao_rebanho_id: lancamentoId,
        boitel_lote_id: loteId,
        macro_custo: clsAdiant.macro_custo, centro_custo: clsAdiant.centro_custo, subcentro: clsAdiant.subcentro,
        ano_mes: dataAdiant.slice(0, 7), valor: plan.valor_total_antecipado,
        data_competencia: dataAdiant, data_pagamento: dataAdiant,
        descricao: `Adiantamento - ${descBase}`,
        historico: `Boitel: ${lote.boitel_destino} | Adiantamento na entrada | ${plan.adiantamento_observacao || ''}`,
        origem_tipo: 'boitel:adiantamento_pago',
      });
    }
  }

  // 1. RECEITA
  const valorReceitaLiquida = temAdiantamento
    ? plan.receita_produtor + plan.valor_total_antecipado
    : plan.receita_produtor;

  const parcelas = options?.parcelas || [];
  const isPrazo = options?.formaReceb === 'prazo' && parcelas.length > 0;

  if (isPrazo) {
    parcelas.forEach((p, i) => {
      inserts.push({
        cliente_id: clienteId, fazenda_id: fazendaId,
        tipo_operacao: '1-Entradas', sinal: 1, status_transacao: 'programado',
        origem_lancamento: 'boitel', movimentacao_rebanho_id: lancamentoId,
        boitel_lote_id: loteId,
        macro_custo: clasReceita.macro_custo, centro_custo: clasReceita.centro_custo, subcentro: clasReceita.subcentro,
        numero_documento: options?.notaFiscal || null, favorecido_id: options?.fornecedorId || null,
        ano_mes: p.data.slice(0, 7), valor: p.valor,
        data_competencia: dataRecebimento, data_pagamento: p.data,
        descricao: `${descBase} - Parcela ${i + 1}/${parcelas.length}`,
        historico: `Boitel: ${lote.boitel_destino} | Lote: ${lote.lote_codigo || '-'} | Contrato: ${lote.contrato_baia || '-'}`,
        origem_tipo: 'boitel:receita',
      });
    });
  } else {
    inserts.push({
      cliente_id: clienteId, fazenda_id: fazendaId,
      tipo_operacao: '1-Entradas', sinal: 1, status_transacao: 'programado',
      origem_lancamento: 'boitel', movimentacao_rebanho_id: lancamentoId,
      boitel_lote_id: loteId,
      macro_custo: clasReceita.macro_custo, centro_custo: clasReceita.centro_custo, subcentro: clasReceita.subcentro,
      numero_documento: options?.notaFiscal || null, favorecido_id: options?.fornecedorId || null,
      ano_mes: dataRecebimento.slice(0, 7), valor: valorReceitaLiquida,
      data_competencia: dataRecebimento, data_pagamento: dataRecebimento,
      descricao: descBase,
      historico: `Boitel: ${lote.boitel_destino} | Lote: ${lote.lote_codigo || '-'} | Contrato: ${lote.contrato_baia || '-'}${temAdiantamento ? ' | Adiantamento devolvido: R$ ' + plan.valor_total_antecipado.toFixed(2) : ''}`,
      origem_tipo: 'boitel:receita',
    });
  }

  // 2. CUSTOS DIRETOS
  const custosDiretos = [
    { valor: plan.custo_frete, label: `Frete - ${descBase}`, origemTipo: 'boitel:custo_frete' },
    { valor: plan.custo_sanidade, label: `Sanidade - ${descBase}`, origemTipo: 'boitel:custo_sanidade' },
    { valor: plan.outros_custos + plan.custo_nutricao + plan.custos_extras_parceria, label: `Outros Custos - ${descBase}`, origemTipo: 'boitel:custo_outros' },
  ];

  for (const custo of custosDiretos) {
    if (custo.valor <= 0) continue;
    const cls = await buscarPlanoContasBoitel(supabase, clienteId, custo.origemTipo);
    if (!cls) continue;
    inserts.push({
      cliente_id: clienteId, fazenda_id: fazendaId,
      tipo_operacao: '2-Saídas', sinal: -1, status_transacao: 'programado',
      origem_lancamento: 'boitel', movimentacao_rebanho_id: lancamentoId,
      boitel_lote_id: loteId,
      macro_custo: cls.macro_custo, centro_custo: cls.centro_custo, subcentro: cls.subcentro,
      ano_mes: dataRecebimento.slice(0, 7), valor: custo.valor,
      data_competencia: dataRecebimento, data_pagamento: dataRecebimento,
      descricao: custo.label, origem_tipo: custo.origemTipo,
    });
  }

  const insertsComGrupo = inserts.map(ins => ({ ...ins, grupo_geracao_id: grupoId }));

  const { error } = await supabase.from('financeiro_lancamentos_v2').insert(insertsComGrupo);
  if (error) {
    toast.error('Erro ao gerar financeiro do boitel: ' + error.message);
    return false;
  }

  await supabase.from('audit_log_movimentacoes').insert({
    cliente_id: clienteId,
    usuario_id: userId || null,
    acao: options?.isUpdate ? 'editou_boitel' : 'criou_boitel',
    movimentacao_id: lancamentoId,
    detalhes: {
      boitel_lote_id: loteId,
      receita_produtor: plan.receita_produtor,
      lucro_total: plan.lucro_total,
      financeiros_gerados: inserts.length,
    },
  });

  toast.success(`${inserts.length} lançamento(s) financeiro(s) de boitel gerado(s)!`);
  return true;
}
