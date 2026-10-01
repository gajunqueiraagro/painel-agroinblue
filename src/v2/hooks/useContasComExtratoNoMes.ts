/**
 * As contas que TÊM extrato (OFX) importado no mês — PR-CONC-ENRIQUECER-V2-01, o selo "falta OFX mm/aa" do painel.
 *
 * ⚠ SÓ LEITURA, e o MESMO critério da Conferência: movimento do extrato com `data_movimento` no mês e não cancelado
 *   (`cancelado_em` nulo — o "marcar como duplicado" do PR-EXTRATO-CANCELAR-MOVIMENTO-01). Conta só com movimento
 *   cancelado no mês não tem extrato para conferir.
 * ⚠ PAGINADO (`lerTodasAsPaginas`): o NJ tem ~700 movimentos por mês somando as contas; um select cortado em 1.000
 *   faria uma conta "perder" o OFX calada.
 * ⚠ `undefined` ENQUANTO CARREGA: o painel não afirma "falta OFX" antes de saber.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';

/** O primeiro e o último dia do mês 'YYYY-MM' (o último pelo dia 0 do mês seguinte). */
export function limitesDoMes(anoMes: string): { de: string; ate: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(anoMes);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${m[1]}-${m[2]}-01`, ate: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, '0')}` };
}

export function useContasComExtratoNoMes(clienteId: string | null | undefined, anoMes: string | null | undefined) {
  const q = useQuery({
    queryKey: ['contas-com-extrato-no-mes', clienteId ?? null, anoMes ?? null],
    enabled: !!clienteId && !!anoMes && !!limitesDoMes(anoMes),
    staleTime: 30_000,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const lim = limitesDoMes(anoMes ?? '');
      if (!lim) return new Set();
      const linhas = await lerTodasAsPaginas<{ conta_bancaria_id: string }>(async (de, ate, contar) => {
        const { data, error, count } = await supabase.from('extrato_bancario_v2')
          .select('conta_bancaria_id', contar ? { count: 'exact' } : undefined)
          .eq('cliente_id', clienteId ?? '')
          .gte('data_movimento', lim.de).lte('data_movimento', lim.ate)
          .is('cancelado_em', null)
          .order('id')
          .range(de, ate);
        if (error) throw error;
        return { data: data ?? [], count: contar ? (count ?? null) : null };
      });
      return new Set(linhas.map((l) => l.conta_bancaria_id));
    },
  });
  return q.data;
}
