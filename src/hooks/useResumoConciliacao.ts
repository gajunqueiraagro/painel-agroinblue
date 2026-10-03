/**
 * A LEITURA DO DONO DO RESUMO — PR-CONC-SALDO-UMA-REGUA-02.
 *
 * ⚠ DOIS HOOKS, DUAS CHAVES, NENHUM CÁLCULO: `useResumoMes` lê `fn_conciliacao_resumo_mes` (todas as contas com
 *   `contaIds` nulo; uma só, com os dias e a lista do sistema, com `[conta]`), `useStatusAno` lê
 *   `fn_conciliacao_status_ano`. As telas desenham o que vem daqui — a Conciliação, o quadro do topo e a aba Sistema
 *   do Casar. A invalidação depois de um gesto que grava é o PR 03: as chaves são exportadas para isso.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerResumo, lerStatusAno, type LinhaResumo, type StatusAnoDono } from '@/lib/conciliacao/resumoDoDono';

export const CHAVE_RESUMO_MES = 'conciliacao-resumo-mes';
export const CHAVE_STATUS_ANO = 'conciliacao-status-ano';

/**
 * `servirDoCache` (PR-CONC-SALDO-UMA-REGUA-02b, D1): o observador aceita o resumo já no cache por 60 s sem reler ao montar.
 * É o que deixa o painel do Importar, o "Conciliar o mês" e o lápis abrirem a conta que o Casar já leu SEM uma segunda ida
 * ao dono (com o `staleTime` 0 padrão, cada montagem relia). Fica fresco pelo gatilho, não pelo relógio: os gestos desta
 * tela invalidam a chave (`useReleDonoAoMudarLancamentos`, salvar o saldo); os das outras telas são o PR 03.
 */
export function useResumoMes(
  clienteId: string | null | undefined, anoMes: string, contaIds: readonly string[] | null,
  opcoes?: { servirDoCache?: boolean },
) {
  const contas = contaIds ? [...contaIds].sort() : null;
  return useQuery({
    queryKey: [CHAVE_RESUMO_MES, clienteId, anoMes, contas],
    ...(opcoes?.servirDoCache ? { staleTime: 60_000 } : {}),
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

/**
 * RELER O DONO QUANDO OS LANÇAMENTOS MUDAM — PR-CONC-SALDO-UMA-REGUA-02b (D6). É o MESMO gatilho que o hook antigo do painel
 * ouvia (`inscreverEmLancamentos`, o "Conciliar o mês" grava por RPC): agora ele invalida o resumo do cliente. Os gestos
 * das outras telas (casar, conciliar fora daqui) são o PR 03.
 */
export function useReleDonoAoMudarLancamentos(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_RESUMO_MES, clienteId] });
    });
  }, [clienteId, qc]);
}

/**
 * AS CONTAS INTERNAS CONSOLIDADAS NESTA — só os NOMES, para a marca "⊕" e o "consolida X" (PR-CONC-SALDO-UMA-REGUA-02b,
 * D2a/D4a). É cadastro, não saldo: o número consolidado é o do dono. A linha do dono de UMA conta não diz quem se consolida
 * nela; a interna é que aponta para a mãe (`consolida_em_conta_id`).
 */
export function useContasConsolidadasEm(clienteId: string | null | undefined, contaId: string | null | undefined) {
  return useQuery({
    queryKey: ['contas-consolidadas-em', clienteId, contaId],
    enabled: !!clienteId && !!contaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('financeiro_contas_bancarias')
        .select('nome_exibicao, nome_conta')
        .eq('cliente_id', clienteId ?? '')
        .eq('consolida_em_conta_id', contaId ?? '');
      if (error) throw error;
      return (data ?? []).map((c) => c.nome_exibicao || c.nome_conta);
    },
  });
}
