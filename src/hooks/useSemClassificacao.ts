/**
 * AS DUAS LEITURAS DO "SEM CLASSIFICAÇÃO" — CONC-SEM-CLASSIFICACAO-01.
 *
 * ⚠ NENHUM CÁLCULO: `useListaSemClassificacao` lê `fn_conciliacao_sem_classificacao_lista` (a lista do modal, com o resumo e
 *   a sugestão) e `useDreSemClassificacao` lê `fn_dre_sem_classificacao` (o aviso do DRE). As duas relêem sozinhas quando os
 *   lançamentos mudam (o canal do Financeiro) — F5 nunca é necessário.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import {
  lerDreSemClassificacao, lerListaSemClassificacao, type DreSemClassificacao, type ListaSemClassificacao,
} from '@/lib/conciliacao/semClassificacao';

export const CHAVE_SEM_CLASSIFICACAO_LISTA = 'conciliacao-sem-classificacao-lista';
export const CHAVE_SEM_CLASSIFICACAO_DRE = 'dre-sem-classificacao';

/** Relê as duas leituras deste cliente quando qualquer lançamento dele muda. */
function useReleAoMudarLancamentos(clienteId: string | null | undefined, chave: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [chave, clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, chave, qc]);
}

/** A lista do modal: os realizados sem plano do cliente, do mês e da conta (`null` = todas as contas). */
export function useListaSemClassificacao(
  clienteId: string | null | undefined, anoMes: string, contaId: string | null, ligado: boolean,
) {
  useReleAoMudarLancamentos(clienteId, CHAVE_SEM_CLASSIFICACAO_LISTA);
  return useQuery({
    queryKey: [CHAVE_SEM_CLASSIFICACAO_LISTA, clienteId, anoMes, contaId],
    enabled: ligado && !!clienteId && /^\d{4}-\d{2}$/.test(anoMes),
    queryFn: async (): Promise<ListaSemClassificacao> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliacao_sem_classificacao_lista', {
        p_cliente_id: clienteId, p_ano_mes: anoMes, p_conta_id: contaId,
      });
      if (error) throw error;
      const lista = lerListaSemClassificacao(data);
      if (!lista) throw new Error('A lista de lançamentos sem classificação veio em formato inesperado.');
      return lista;
    },
  });
}

export interface RecorteDoDre {
  /** Pecuária: a competência, 'YYYY-MM'. */
  de?: string | null;
  ate?: string | null;
  /** Lavoura: a safra gravada no lançamento. */
  safraId?: string | null;
  cenario?: string;
}

/** O que o DRE deste recorte NÃO vê por falta de plano de contas. `null` enquanto não há recorte. */
export function useDreSemClassificacao(clienteId: string | null | undefined, recorte: RecorteDoDre) {
  useReleAoMudarLancamentos(clienteId, CHAVE_SEM_CLASSIFICACAO_DRE);
  const { de = null, ate = null, safraId = null, cenario = 'realizado' } = recorte;
  const temRecorte = !!safraId || (!!de && !!ate);
  return useQuery({
    queryKey: [CHAVE_SEM_CLASSIFICACAO_DRE, clienteId, de, ate, safraId, cenario],
    enabled: !!clienteId && temRecorte,
    queryFn: async (): Promise<DreSemClassificacao> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_dre_sem_classificacao', {
        p_cliente_id: clienteId, p_de: safraId ? null : de, p_ate: safraId ? null : ate, p_safra_id: safraId, p_cenario: cenario,
      });
      if (error) throw error;
      const dre = lerDreSemClassificacao(data);
      if (!dre) throw new Error('A leitura do DRE sem classificação veio em formato inesperado.');
      return dre;
    },
  });
}
