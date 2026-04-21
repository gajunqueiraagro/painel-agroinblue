import { supabase } from '@/integrations/supabase/client';
import { criarMirrorParcela, type FinanciamentoInput, type ParcelaInput } from './parcelaMirror';

/**
 * Varre parcelas pendentes de financiamentos ativos do cliente que ainda não
 * têm lancamento_id vinculado, e cria os mirrors (financeiro_lancamentos_v2 +
 * planejamento_financeiro) para cada uma. Idempotente em camadas:
 *  - Query filtra lancamento_id IS NULL.
 *  - criarMirrorParcela também consulta financeiro_lancamentos_v2 por observacao=parcela.id
 *    como segunda camada de defesa (caso o update do lancamento_id tenha falhado).
 *
 * Retorna métricas: { processadas, criadas, puladas, erros }.
 */
export interface BackfillReport {
  processadas: number;
  criadas: number;
  puladas: number;
  erros: number;
}

// Query única com embed para obter parcela + dados do financiamento em uma só viagem.
// Evita produto cartesiano e não depende de montar Map em memória.
export async function backfillParcelasPendentes(clienteId: string): Promise<BackfillReport> {
  const report: BackfillReport = { processadas: 0, criadas: 0, puladas: 0, erros: 0 };

  const { data, error } = await supabase
    .from('financiamento_parcelas')
    .select('id, financiamento_id, cliente_id, data_vencimento, valor_principal, valor_juros, status, lancamento_id, financiamentos!inner(id, cliente_id, fazenda_id, tipo_financiamento, descricao, numero_contrato, credor_id, status)')
    .eq('cliente_id', clienteId)
    .eq('status', 'pendente')
    .is('lancamento_id', null);

  if (error) {
    console.error('[backfillParcelas] erro na query:', error);
    return report;
  }
  if (!data || data.length === 0) return report;

  for (const row of data as any[]) {
    report.processadas++;
    const fin = row.financiamentos;
    // Só ativos
    if (!fin || fin.status !== 'ativo') { report.puladas++; continue; }
    if (fin.tipo_financiamento !== 'pecuaria' && fin.tipo_financiamento !== 'agricultura') {
      report.puladas++; continue;
    }

    const parcela: ParcelaInput = {
      id: row.id,
      cliente_id: row.cliente_id,
      fazenda_id: fin.fazenda_id ?? null,
      data_vencimento: row.data_vencimento,
      valor_principal: Number(row.valor_principal) || 0,
      valor_juros: Number(row.valor_juros) || 0,
      lancamento_id: row.lancamento_id,
    };
    const financiamento: FinanciamentoInput = {
      id: fin.id,
      cliente_id: fin.cliente_id,
      fazenda_id: fin.fazenda_id ?? null,
      tipo_financiamento: fin.tipo_financiamento,
      descricao: fin.descricao ?? null,
      numero_contrato: fin.numero_contrato ?? null,
      credor_id: fin.credor_id ?? null,
    };

    try {
      const result = await criarMirrorParcela(supabase as any, parcela, financiamento);
      if (result.lancamentoIdPrincipal || result.lancamentoIdJuros) {
        report.criadas++;
      } else {
        report.puladas++;
      }
    } catch (e: any) {
      report.erros++;
      console.error('[backfillParcelas] erro parcela', row.id, e);
    }
  }

  console.info('[backfillParcelas] report', report);
  return report;
}
