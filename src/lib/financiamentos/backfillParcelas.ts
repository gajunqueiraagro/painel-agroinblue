import { supabase } from '@/integrations/supabase/client';
import { criarMirrorParcela, type FinanciamentoInput, type ParcelaInput } from './parcelaMirror';

/**
 * Varre parcelas pendentes de financiamentos ativos do cliente que ainda não
 * têm lancamento_id vinculado, e cria os mirrors (financeiro_lancamentos_v2 +
 * planejamento_financeiro) para cada uma. Idempotente: pula parcelas já vinculadas.
 *
 * Retorna métricas: { processadas, criadas, puladas, erros }
 */
export interface BackfillReport {
  processadas: number;
  criadas: number;
  puladas: number;
  erros: number;
}

export async function backfillParcelasPendentes(clienteId: string): Promise<BackfillReport> {
  const report: BackfillReport = { processadas: 0, criadas: 0, puladas: 0, erros: 0 };

  const { data: fins, error: fErr } = await supabase
    .from('financiamentos')
    .select('id, cliente_id, fazenda_id, tipo_financiamento, status')
    .eq('cliente_id', clienteId)
    .eq('status', 'ativo');
  if (fErr || !fins || fins.length === 0) {
    if (fErr) console.error('[backfillParcelas] erro financiamentos:', fErr);
    return report;
  }

  const finMap = new Map<string, FinanciamentoInput>();
  for (const f of fins) {
    finMap.set(f.id, {
      id: f.id,
      cliente_id: f.cliente_id,
      fazenda_id: (f as any).fazenda_id ?? null,
      tipo_financiamento: f.tipo_financiamento as 'pecuaria' | 'agricultura',
    });
  }

  const { data: parcs, error: pErr } = await supabase
    .from('financiamento_parcelas')
    .select('id, financiamento_id, cliente_id, data_vencimento, valor_principal, valor_juros, status, lancamento_id')
    .eq('cliente_id', clienteId)
    .eq('status', 'pendente')
    .is('lancamento_id', null);
  if (pErr || !parcs || parcs.length === 0) {
    if (pErr) console.error('[backfillParcelas] erro parcelas:', pErr);
    return report;
  }

  for (const p of parcs) {
    report.processadas++;
    const fin = finMap.get(p.financiamento_id);
    if (!fin) { report.puladas++; continue; }
    const parcela: ParcelaInput = {
      id: p.id,
      cliente_id: p.cliente_id,
      fazenda_id: (p as any).fazenda_id ?? null,
      data_vencimento: p.data_vencimento,
      valor_principal: Number(p.valor_principal) || 0,
      valor_juros: Number(p.valor_juros) || 0,
      lancamento_id: p.lancamento_id,
    };
    try {
      const result = await criarMirrorParcela(supabase as any, parcela, fin);
      if (result.lancamentoIdPrincipal || result.lancamentoIdJuros) {
        report.criadas++;
      } else {
        report.puladas++;
      }
    } catch (e: any) {
      report.erros++;
      console.error('[backfillParcelas] erro parcela', p.id, e);
    }
  }

  console.info('[backfillParcelas] report', report);
  return report;
}
