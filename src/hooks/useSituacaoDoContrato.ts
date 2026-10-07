/**
 * A leitura única da tela do contrato — PARC-LIVRES-01 passo 4. `fn_financiamento_situacao` devolve as parcelas com a situação
 * derivada do LANÇAMENTO e os cartões prontos. Relê sozinha quando um lançamento do cliente muda (o canal do Financeiro).
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerSituacaoDoContrato, type SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

export const CHAVE_SITUACAO_DO_CONTRATO = 'financiamento-situacao';

export function useSituacaoDoContrato(financiamentoId: string | null | undefined, clienteId: string | null | undefined, hoje: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_SITUACAO_DO_CONTRATO] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: [CHAVE_SITUACAO_DO_CONTRATO, financiamentoId, hoje],
    enabled: !!financiamentoId && !!clienteId,
    queryFn: async (): Promise<SituacaoDoContrato> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_financiamento_situacao', { p_financiamento_id: financiamentoId, p_hoje: hoje });
      if (error) throw error;
      const lido = lerSituacaoDoContrato(data);
      if (!lido) throw new Error('A situação do contrato veio em formato inesperado.');
      return lido;
    },
  });
}
