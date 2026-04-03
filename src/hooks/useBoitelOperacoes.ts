import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { buscarPlanoContasBoitel, BOITEL_CLASSIFICACAO } from '@/lib/financeiro/boitelMapping';

export interface BoitelOperacao {
  id?: string;
  cliente_id: string;
  fazenda_origem_id: string;
  fazenda_destino_nome: string;
  lote: string;
  numero_contrato: string;
  data_envio: string;
  quantidade: number;
  peso_inicial_kg: number;
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

export async function salvarBoitelOperacao(op: BoitelOperacao): Promise<string | null> {
  const payload = {
    fazenda_destino_nome: op.fazenda_destino_nome,
    lote: op.lote || null,
    numero_contrato: op.numero_contrato || null,
    data_envio: op.data_envio || null,
    quantidade: op.quantidade,
    peso_inicial_kg: op.peso_inicial_kg,
    modalidade: op.modalidade,
    dias: op.dias,
    gmd: op.gmd,
    rendimento_entrada: op.rendimento_entrada,
    rendimento_saida: op.rendimento_saida,
    custo_diaria: op.custo_diaria,
    custo_arroba: op.custo_arroba,
    percentual_parceria: op.percentual_parceria,
    custos_extras_parceria: op.custos_extras_parceria,
    custo_nutricao: op.custo_nutricao,
    custo_sanidade: op.custo_sanidade,
    custo_frete: op.custo_frete,
    outros_custos: op.outros_custos,
    despesas_abate: op.despesas_abate,
    preco_venda_arroba: op.preco_venda_arroba,
    faturamento_bruto: op.faturamento_bruto,
    faturamento_liquido: op.faturamento_liquido,
    receita_produtor: op.receita_produtor,
    custo_total: op.custo_total,
    lucro_total: op.lucro_total,
    possui_adiantamento: op.possui_adiantamento,
    data_adiantamento: op.data_adiantamento || null,
    pct_adiantamento_diarias: op.pct_adiantamento_diarias,
    valor_adiantamento_diarias: op.valor_adiantamento_diarias,
    valor_adiantamento_sanitario: op.valor_adiantamento_sanitario,
    valor_adiantamento_outros: op.valor_adiantamento_outros,
    valor_total_antecipado: op.valor_total_antecipado,
    adiantamento_observacao: op.adiantamento_observacao || null,
  };

  if (op.id) {
    const { error } = await supabase
      .from('boitel_operacoes')
      .update(payload as any)
      .eq('id', op.id);
    if (error) { toast.error('Erro ao atualizar boitel: ' + error.message); return null; }
    return op.id;
  } else {
    const { data, error } = await supabase
      .from('boitel_operacoes')
      .insert({ ...payload, cliente_id: op.cliente_id, fazenda_origem_id: op.fazenda_origem_id } as any)
      .select('id')
      .single();
    if (error) { toast.error('Erro ao salvar boitel: ' + error.message); return null; }
    return data?.id || null;
  }
}

export async function vincularBoitelAoLancamento(lancamentoId: string, boitelId: string): Promise<boolean> {
  const { error } = await supabase
    .from('lancamentos')
    .update({ boitel_id: boitelId } as any)
    .eq('id', lancamentoId);
  if (error) { toast.error('Erro ao vincular boitel: ' + error.message); return false; }
  return true;
}

/**
 * Gera lançamentos financeiros para uma operação de boitel.
 * Usa mapeamento explícito de subcentros via boitelMapping.ts.
 */
export async function gerarFinanceiroBoitel(
  op: BoitelOperacao & { id: string },
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
  if (op.receita_produtor <= 0) {
    toast.error('Resultado do boitel inválido. Receita do produtor deve ser maior que zero.');
    return false;
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;

  // Cancel old entries on update
  if (options?.isUpdate) {
    const { data: old } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id')
      .eq('boitel_id', op.id)
      .eq('cancelado', false);
    const oldIds = (old || []).map(r => r.id);
    if (oldIds.length > 0) {
      await supabase.from('financeiro_lancamentos_v2')
        .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por: userId || null })
        .in('id', oldIds);
      await supabase.from('audit_log_movimentacoes').insert({
        cliente_id: clienteId,
        usuario_id: userId || null,
        acao: 'recalculo_financeiro_boitel',
        movimentacao_id: lancamentoId,
        financeiro_ids: oldIds,
        detalhes: { registros_cancelados: oldIds.length, motivo: 'Recálculo financeiro do boitel' },
      });
    }
  }

  // === MAPEAMENTO EXPLÍCITO ===
  const clasReceita = await buscarPlanoContasBoitel(supabase, clienteId, 'boitel:receita');
  if (!clasReceita) {
    toast.error('Mapeamento financeiro não encontrado para receita de Boitel. Cadastre subcentro PEC/RECEITA/VENDAS/BOITEL no Plano de Contas.');
    return false;
  }

  const inserts: any[] = [];
  const descBase = `Venda ${op.quantidade} cab - Boitel`;
  const temAdiantamento = op.possui_adiantamento && op.valor_total_antecipado > 0;

  // 0. ADIANTAMENTO PAGO na entrada
  if (temAdiantamento) {
    const dataAdiant = op.data_adiantamento || op.data_envio || dataRecebimento;
    const clsAdiant = await buscarPlanoContasBoitel(supabase, clienteId, 'boitel:adiantamento_pago');

    if (clsAdiant) {
      inserts.push({
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        tipo_operacao: '2-Saídas',
        sinal: -1,
        status_transacao: 'confirmado',
        origem_lancamento: 'boitel',
        movimentacao_rebanho_id: lancamentoId,
        boitel_id: op.id,
        macro_custo: clsAdiant.macro_custo,
        centro_custo: clsAdiant.centro_custo,
        subcentro: clsAdiant.subcentro,
        ano_mes: dataAdiant.slice(0, 7),
        valor: op.valor_total_antecipado,
        data_competencia: dataAdiant,
        data_pagamento: dataAdiant,
        descricao: `Adiantamento - ${descBase}`,
        historico: `Boitel: ${op.fazenda_destino_nome} | Adiantamento na entrada | ${op.adiantamento_observacao || ''}`,
        origem_tipo: 'boitel:adiantamento_pago',
      });
    }
  }

  // 1. RECEITA
  // Adiantamento pago ao boitel é devolvido na liquidação final,
  // então o valor a receber do boitel = receita_produtor + adiantamento
  const valorReceitaLiquida = temAdiantamento
    ? op.receita_produtor + op.valor_total_antecipado
    : op.receita_produtor;

  const parcelas = options?.parcelas || [];
  const isPrazo = options?.formaReceb === 'prazo' && parcelas.length > 0;

  if (isPrazo) {
    parcelas.forEach((p, i) => {
      inserts.push({
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        tipo_operacao: '1-Entradas',
        sinal: 1,
        status_transacao: 'confirmado',
        origem_lancamento: 'boitel',
        movimentacao_rebanho_id: lancamentoId,
        boitel_id: op.id,
        macro_custo: clasReceita.macro_custo,
        centro_custo: clasReceita.centro_custo,
        subcentro: clasReceita.subcentro,
        nota_fiscal: options?.notaFiscal || null,
        favorecido_id: options?.fornecedorId || null,
        ano_mes: p.data.slice(0, 7),
        valor: p.valor,
        data_competencia: dataRecebimento,
        data_pagamento: p.data,
        descricao: `${descBase} - Parcela ${i + 1}/${parcelas.length}`,
        historico: `Boitel: ${op.fazenda_destino_nome} | Lote: ${op.lote || '-'} | Contrato: ${op.numero_contrato || '-'}`,
        origem_tipo: 'boitel:receita',
      });
    });
  } else {
    inserts.push({
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      tipo_operacao: '1-Entradas',
      sinal: 1,
      status_transacao: 'confirmado',
      origem_lancamento: 'boitel',
      movimentacao_rebanho_id: lancamentoId,
      boitel_id: op.id,
      macro_custo: clasReceita.macro_custo,
      centro_custo: clasReceita.centro_custo,
      subcentro: clasReceita.subcentro,
      nota_fiscal: options?.notaFiscal || null,
      favorecido_id: options?.fornecedorId || null,
      ano_mes: dataRecebimento.slice(0, 7),
      valor: valorReceitaLiquida,
      data_competencia: dataRecebimento,
      data_pagamento: dataRecebimento,
      descricao: descBase,
      historico: `Boitel: ${op.fazenda_destino_nome} | Lote: ${op.lote || '-'} | Contrato: ${op.numero_contrato || '-'}${temAdiantamento ? ' | Adiantamento devolvido na liquidação: R$ ' + op.valor_total_antecipado.toFixed(2) : ''}`,
      origem_tipo: 'boitel:receita',
    });
  }

  // 2. CUSTOS DIRETOS (frete, sanidade, outros) — mapeamento explícito
  const custosDiretos: { valor: number; label: string; origemTipo: string }[] = [
    { valor: op.custo_frete, label: `Frete - ${descBase}`, origemTipo: 'boitel:custo_frete' },
    { valor: op.custo_sanidade, label: `Sanidade - ${descBase}`, origemTipo: 'boitel:custo_sanidade' },
    { valor: op.outros_custos + op.custo_nutricao + op.custos_extras_parceria, label: `Outros Custos - ${descBase}`, origemTipo: 'boitel:custo_outros' },
  ];

  for (const custo of custosDiretos) {
    if (custo.valor <= 0) continue;
    const cls = await buscarPlanoContasBoitel(supabase, clienteId, custo.origemTipo);
    if (!cls) continue;

    inserts.push({
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      tipo_operacao: '2-Saídas',
      sinal: -1,
      status_transacao: 'confirmado',
      origem_lancamento: 'boitel',
      movimentacao_rebanho_id: lancamentoId,
      boitel_id: op.id,
      macro_custo: cls.macro_custo,
      centro_custo: cls.centro_custo,
      subcentro: cls.subcentro,
      ano_mes: dataRecebimento.slice(0, 7),
      valor: custo.valor,
      data_competencia: dataRecebimento,
      data_pagamento: dataRecebimento,
      descricao: custo.label,
      origem_tipo: custo.origemTipo,
    });
  }

  const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
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
      boitel_id: op.id,
      receita_produtor: op.receita_produtor,
      lucro_total: op.lucro_total,
      financeiros_gerados: inserts.length,
    },
  });

  toast.success(`${inserts.length} lançamento(s) financeiro(s) de boitel gerado(s)!`);
  return true;
}

export async function carregarBoitelOperacao(boitelId: string): Promise<BoitelOperacao | null> {
  const { data, error } = await supabase
    .from('boitel_operacoes')
    .select('*')
    .eq('id', boitelId)
    .single();
  if (error || !data) return null;
  return data as unknown as BoitelOperacao;
}
