import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  // Inputs técnicos
  dias: number;
  gmd: number;
  rendimento_entrada: number;
  rendimento_saida: number;
  // Custos
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
  // Resultados snapshot
  faturamento_bruto: number;
  faturamento_liquido: number;
  receita_produtor: number;
  custo_total: number;
  lucro_total: number;
}

/**
 * Salva operação de boitel na tabela boitel_operacoes.
 * Retorna o ID criado/atualizado.
 */
export async function salvarBoitelOperacao(op: BoitelOperacao): Promise<string | null> {
  if (op.id) {
    // Update
    const { error } = await supabase
      .from('boitel_operacoes')
      .update({
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
      })
      .eq('id', op.id);
    if (error) { toast.error('Erro ao atualizar boitel: ' + error.message); return null; }
    return op.id;
  } else {
    // Insert
    const { data, error } = await supabase
      .from('boitel_operacoes')
      .insert({
        cliente_id: op.cliente_id,
        fazenda_origem_id: op.fazenda_origem_id,
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
      })
      .select('id')
      .single();
    if (error) { toast.error('Erro ao salvar boitel: ' + error.message); return null; }
    return data?.id || null;
  }
}

/**
 * Vincula boitel_id à movimentação de rebanho.
 */
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
 * REGRAS:
 * - Receita = receita_produtor (caixa real)
 * - Saídas = apenas custos pagos diretamente (frete, sanidade, outros)
 * - NÃO gerar faturamento bruto, diárias, custos internos
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
  // Guard: receita_produtor deve ser > 0
  if (op.receita_produtor <= 0) {
    toast.error('Resultado do boitel inválido para geração financeira. Receita do produtor deve ser maior que zero.');
    return false;
  }

  const userId = (await supabase.auth.getUser()).data.user?.id;

  // Se update, cancelar lançamentos antigos
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

  // Buscar plano de contas para receita de venda com boitel
  const subcentroCandidates = [
    'PEC/RECEITA/VENDAS/BOITEL',
    'PEC/RECEITA/VENDAS/MACHOS ADULTOS',
    'PEC/RECEITA/VENDAS/MACHOS',
  ];

  const { data: planoReceita } = await supabase
    .from('financeiro_plano_contas')
    .select('id, macro_custo, centro_custo, subcentro')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .eq('tipo_operacao', '1-Entradas')
    .in('subcentro', subcentroCandidates);

  if (!planoReceita || planoReceita.length === 0) {
    console.error('[Boitel Financeiro] Mapeamento de receita não encontrado.', { clienteId, subcentroCandidates });
    toast.error(`Mapeamento financeiro não encontrado para receita de Boitel. Subcentros buscados: ${subcentroCandidates.join(', ')}. Cadastre no Plano de Contas.`);
    return false;
  }

  const clasReceita = planoReceita[0];
  const inserts: any[] = [];
  const descBase = `Venda ${op.quantidade} cab - Boitel`;

  // 1. RECEITA: usar parcelas se a prazo, senão à vista
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
      valor: op.receita_produtor,
      data_competencia: dataRecebimento,
      data_pagamento: dataRecebimento,
      descricao: descBase,
      historico: `Boitel: ${op.fazenda_destino_nome} | Lote: ${op.lote || '-'} | Contrato: ${op.numero_contrato || '-'}`,
      origem_tipo: 'boitel:receita',
    });
  }

  // 2. SAÍDAS: apenas custos pagos diretamente (frete, sanidade, outros)
  const custosDiretos = [
    { valor: op.custo_frete, label: `Frete - ${descBase}`, subcentroHint: 'FRETE' },
    { valor: op.custo_sanidade, label: `Sanidade - ${descBase}`, subcentroHint: 'SANIDADE' },
    { valor: op.outros_custos + op.custo_nutricao + op.custos_extras_parceria, label: `Outros Custos - ${descBase}`, subcentroHint: 'OUTROS' },
  ];

  for (const custo of custosDiretos) {
    if (custo.valor <= 0) continue;

    const { data: planoSaida } = await supabase
      .from('financeiro_plano_contas')
      .select('id, macro_custo, centro_custo, subcentro')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .eq('tipo_operacao', '2-Saídas')
      .ilike('subcentro', `%${custo.subcentroHint}%`)
      .limit(1);

    let cls = planoSaida?.[0];
    if (!cls) {
      const { data: fallback } = await supabase
        .from('financeiro_plano_contas')
        .select('id, macro_custo, centro_custo, subcentro')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .eq('tipo_operacao', '2-Saídas')
        .ilike('macro_custo', '%custeio%')
        .limit(1);
      if (!fallback || fallback.length === 0) continue;
      cls = fallback[0];
    }

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
      origem_tipo: 'boitel:custo',
    });
  }

  const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
  if (error) {
    toast.error('Erro ao gerar financeiro do boitel: ' + error.message);
    return false;
  }

  // Audit
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

/**
 * Carrega operação de boitel pelo ID.
 */
export async function carregarBoitelOperacao(boitelId: string): Promise<BoitelOperacao | null> {
  const { data, error } = await supabase
    .from('boitel_operacoes')
    .select('*')
    .eq('id', boitelId)
    .single();
  if (error || !data) return null;
  return data as unknown as BoitelOperacao;
}
