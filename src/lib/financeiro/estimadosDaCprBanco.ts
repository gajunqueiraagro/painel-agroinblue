/**
 * A LEITURA DOS ESTIMADOS DA CPR — FIN-POS-FIXADO-01a: o UNICO dono do conjunto que a tela entrega ao recorte. Por cliente, nunca
 * por linha: as leituras da recorrencia (`lerEstimadasDoCliente`, ate' duas) + UMA chamada de `fn_juros_estimados_do_cliente`.
 */
import { supabase } from '@/integrations/supabase/client';
import { lerEstimadasDoCliente } from '@/hooks/useRecorrencias';
import { lerJurosEstimados } from '@/lib/financiamentos/jurosPosFixado';
import { juntarEstimados, type EstimadosDaCpr } from './estimadosDaCpr';

export async function lerEstimadosDaCpr(clienteId: string): Promise<EstimadosDaCpr> {
  const [rec, juros] = await Promise.all([
    lerEstimadasDoCliente(clienteId),
    (supabase as any).rpc('fn_juros_estimados_do_cliente', { p_cliente_id: clienteId }),
  ]);
  if (juros.error) throw juros.error;
  const ids = lerJurosEstimados(juros.data);
  if (ids == null) throw new Error('resposta inesperada dos juros estimados');
  return juntarEstimados(rec.ids, ids, rec.incompleto);
}
