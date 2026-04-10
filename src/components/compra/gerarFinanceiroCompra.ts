import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';
import type { CompraDetalhes } from '@/components/compra/CompraDetalhesDialog';
import type { FiltroVisual } from '@/lib/statusOperacional';

interface GerarFinanceiroCompraParams {
  compraDetalhes: CompraDetalhes;
  lancamentoId: string;
  clienteId: string;
  fazendaId: string;
  quantidade: number;
  pesoKg: number;
  data: string;
  categoria: string;
  statusOp: FiltroVisual;
  fazendaOrigem: string;
  fornecedorId: string;
}

export async function gerarFinanceiroCompra(params: GerarFinanceiroCompraParams): Promise<boolean> {
  const { compraDetalhes, lancamentoId, clienteId, fazendaId, quantidade, pesoKg, data, categoria, statusOp, fazendaOrigem, fornecedorId } = params;

  const totalKg = quantidade * pesoKg;
  let valorBase = 0;
  if (compraDetalhes.tipoPreco === 'por_kg') valorBase = totalKg * (Number(compraDetalhes.precoKg) || 0);
  else if (compraDetalhes.tipoPreco === 'por_cab') valorBase = quantidade * (Number(compraDetalhes.precoCab) || 0);
  else valorBase = Number(compraDetalhes.valorTotal) || 0;

  if (valorBase <= 0) return true; // Nothing to generate

  const freteVal = Number(compraDetalhes.frete) || 0;
  const comissaoVal = valorBase * ((Number(compraDetalhes.comissaoPct) || 0) / 100);

  // Check for existing records
  const { data: existing } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id')
    .eq('movimentacao_rebanho_id', lancamentoId)
    .eq('cancelado', false)
    .limit(1);

  if (existing && existing.length > 0) {
    toast.error('Lançamentos financeiros já foram gerados para esta movimentação.');
    return false;
  }

  const statusFin = statusOp === 'meta' ? 'meta' : 'programado';
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
  const compraLabel = `Compra ${quantidade} ${catLabel}`;
  const anoMes = data.slice(0, 7);

  const FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
  const isFemea = FEMEAS.includes(categoria);
  const subcentroCompra = isFemea ? 'COMPRAS ANIMAIS/FEMEAS' : 'COMPRAS ANIMAIS/MACHOS';

  const subcentrosNecessarios = [subcentroCompra];
  if (freteVal > 0) subcentrosNecessarios.push('FRETE COMPRA ANIMAIS');
  if (comissaoVal > 0) subcentrosNecessarios.push('COMISSÃO COMPRA ANIMAIS');

  const { data: planoContas } = await supabase
    .from('financeiro_plano_contas')
    .select('id, macro_custo, centro_custo, subcentro')
    .eq('ativo', true)
    .eq('tipo_operacao', '2-Saídas')
    .in('subcentro', subcentrosNecessarios);

  const planoMap = new Map((planoContas || []).map(p => [p.subcentro, p]));

  for (const sub of subcentrosNecessarios) {
    if (!planoMap.has(sub)) {
      toast.error(`Não foi encontrado mapeamento financeiro válido para "${sub}" no plano de classificação.`);
      return false;
    }
  }

  const clasCompra = planoMap.get(subcentroCompra)!;
  const inserts: any[] = [];

  const baseRecord: Record<string, any> = {
    cliente_id: clienteId,
    fazenda_id: fazendaId,
    tipo_operacao: '2-Saídas',
    sinal: -1,
    status_transacao: statusFin,
    origem_lancamento: 'movimentacao_rebanho',
    movimentacao_rebanho_id: lancamentoId,
    macro_custo: clasCompra.macro_custo,
    centro_custo: clasCompra.centro_custo,
  };

  if (fornecedorId) baseRecord.favorecido_id = fornecedorId;

  if (compraDetalhes.formaPag === 'prazo' && compraDetalhes.parcelas.length > 0) {
    compraDetalhes.parcelas.forEach((p, i) => {
      inserts.push({
        ...baseRecord,
        ano_mes: p.data.slice(0, 7),
        subcentro: clasCompra.subcentro,
        valor: p.valor,
        data_competencia: data,
        data_pagamento: p.data,
        descricao: `${compraLabel} - Parcela ${i + 1}/${compraDetalhes.parcelas.length}`,
        historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
        origem_tipo: 'compra_rebanho:parcela',
        numero_documento: compraDetalhes.notaFiscal || undefined,
      });
    });
  } else {
    inserts.push({
      ...baseRecord,
      ano_mes: anoMes,
      subcentro: clasCompra.subcentro,
      valor: valorBase,
      data_competencia: data,
      data_pagamento: data,
      descricao: compraLabel,
      historico: fazendaOrigem ? `Origem: ${fazendaOrigem}` : undefined,
      origem_tipo: 'compra_rebanho:parcela',
      numero_documento: compraDetalhes.notaFiscal || undefined,
    });
  }

  if (freteVal > 0) {
    const clasFrete = planoMap.get('FRETE COMPRA ANIMAIS')!;
    inserts.push({
      ...baseRecord,
      ano_mes: anoMes,
      macro_custo: clasFrete.macro_custo,
      centro_custo: clasFrete.centro_custo,
      subcentro: clasFrete.subcentro,
      valor: freteVal,
      data_competencia: data,
      data_pagamento: data,
      descricao: `Prev. Frete - ${compraLabel}`,
      origem_tipo: 'compra_rebanho:frete',
    });
  }

  if (comissaoVal > 0) {
    const clasComissao = planoMap.get('COMISSÃO COMPRA ANIMAIS')!;
    inserts.push({
      ...baseRecord,
      ano_mes: anoMes,
      macro_custo: clasComissao.macro_custo,
      centro_custo: clasComissao.centro_custo,
      subcentro: clasComissao.subcentro,
      valor: comissaoVal,
      data_competencia: data,
      data_pagamento: data,
      descricao: `Prev. Comissão - ${compraLabel}`,
      origem_tipo: 'compra_rebanho:comissao',
    });
  }

  const { error } = await supabase.from('financeiro_lancamentos_v2').insert(inserts);
  if (error) {
    toast.error('Erro ao gerar lançamentos: ' + error.message);
    return false;
  }

  toast.success(`${inserts.length} lançamento(s) financeiro(s) gerado(s) com sucesso!`);
  return true;
}
