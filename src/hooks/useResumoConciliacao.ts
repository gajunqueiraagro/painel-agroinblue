/**
 * A LEITURA DO DONO DO RESUMO — PR-CONC-SALDO-UMA-REGUA-02.
 *
 * ⚠ DOIS HOOKS, DUAS CHAVES, NENHUM CÁLCULO: `useResumoMes` lê `fn_conciliacao_resumo_mes` (todas as contas com
 *   `contaIds` nulo; uma só, com os dias e a lista do sistema, com `[conta]`), `useStatusAno` lê
 *   `fn_conciliacao_status_ano`. As telas desenham o que vem daqui — a Conciliação, o quadro do topo e a aba Sistema
 *   do Casar. A invalidação depois de um gesto que grava é o PR 03: as chaves são exportadas para isso.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerResumo, lerStatusAno, type LinhaResumo, type StatusAnoDono } from '@/lib/conciliacao/resumoDoDono';

export const CHAVE_RESUMO_MES = 'conciliacao-resumo-mes';
export const CHAVE_STATUS_ANO = 'conciliacao-status-ano';

export function useResumoMes(clienteId: string | null | undefined, anoMes: string, contaIds: readonly string[] | null) {
  const contas = contaIds ? [...contaIds].sort() : null;
  return useQuery({
    queryKey: [CHAVE_RESUMO_MES, clienteId, anoMes, contas],
    enabled: !!clienteId && /^\d{4}-\d{2}$/.test(anoMes) && (contas === null || contas.length > 0),
    queryFn: async (): Promise<LinhaResumo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliacao_resumo_mes', {
        p_cliente_id: clienteId, p_ano_mes: anoMes, p_conta_ids: contas,
      });
      if (error) throw error;
      return lerResumo(data);
    },
  });
}

export function useStatusAno(clienteId: string | null | undefined, ano: number) {
  return useQuery({
    queryKey: [CHAVE_STATUS_ANO, clienteId, ano],
    enabled: !!clienteId && Number.isInteger(ano),
    queryFn: async (): Promise<StatusAnoDono[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliacao_status_ano', {
        p_cliente_id: clienteId, p_ano: ano,
      });
      if (error) throw error;
      return lerStatusAno(data);
    },
  });
}
