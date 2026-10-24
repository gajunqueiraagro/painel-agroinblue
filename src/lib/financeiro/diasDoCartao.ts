/**
 * P74 — os dias do mês em que vencem os lançamentos não cancelados de UM cartão nos últimos 12 meses (`fn_cartao_dias_de_vencimento`,
 * SECURITY INVOKER: a RLS por tenant filtra). A escolha do dia é pura (`diaMaisFrequente`). Falha de leitura = sem sugestão (o campo
 * fica vazio e obrigatório), nunca um dia inventado.
 */
import { supabase } from '@/integrations/supabase/client';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { periodoDaSugestao, type DiaDoCartao } from '@/lib/financeiro/pagamentoNoCartao';

export async function diasDoCartao(contaId: string, hoje: string = hojeLocal()): Promise<DiaDoCartao[]> {
  const { desde, ate } = periodoDaSugestao(hoje);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_cartao_dias_de_vencimento', { p_conta: contaId, p_desde: desde, p_ate: ate });
  if (error || !Array.isArray(data)) return [];
  const lista: DiaDoCartao[] = [];
  for (const r of data) {
    const dia: unknown = r && typeof r === 'object' ? Reflect.get(r, 'dia') : null;
    const n: unknown = r && typeof r === 'object' ? Reflect.get(r, 'lancamentos') : null;
    const ultimo: unknown = r && typeof r === 'object' ? Reflect.get(r, 'ultimo') : null;
    if (typeof dia === 'number' && typeof n === 'number' && typeof ultimo === 'string') lista.push({ dia, lancamentos: n, ultimo });
  }
  return lista;
}
