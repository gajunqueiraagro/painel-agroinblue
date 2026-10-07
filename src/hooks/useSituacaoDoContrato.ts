/**
 * A leitura única da tela do contrato — PARC-LIVRES-01 passo 4. `fn_financiamento_situacao` devolve as parcelas com a situação
 * derivada do LANÇAMENTO e os cartões prontos. Relê sozinha quando um lançamento do cliente muda (o canal do Financeiro).
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerSituacaoDoContrato, type SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { lerSituacaoEmLote } from '@/lib/financiamentos/situacaoEmLote';

export const CHAVE_SITUACAO_DO_CONTRATO = 'financiamento-situacao';

/** `detalhe` (PARC-CONTRATO-01): a tela do contrato pede também competência, conta, prazo, documentos e as contagens dos cartões. */
export function useSituacaoDoContrato(financiamentoId: string | null | undefined, clienteId: string | null | undefined, hoje: string, opcoes?: { detalhe?: boolean }) {
  const detalhe = opcoes?.detalhe === true;
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_SITUACAO_DO_CONTRATO] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: detalhe ? [CHAVE_SITUACAO_DO_CONTRATO, financiamentoId, hoje, 'detalhe'] : [CHAVE_SITUACAO_DO_CONTRATO, financiamentoId, hoje],
    enabled: !!financiamentoId && !!clienteId,
    queryFn: async (): Promise<SituacaoDoContrato> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_financiamento_situacao', detalhe
        ? { p_financiamento_id: financiamentoId, p_hoje: hoje, p_detalhe: true }
        : { p_financiamento_id: financiamentoId, p_hoje: hoje });
      if (error) throw error;
      const lido = lerSituacaoDoContrato(data);
      if (!lido) throw new Error('A situação do contrato veio em formato inesperado.');
      return lido;
    },
  });
}

/**
 * A situação de TODOS os contratos do cliente numa chamada — PARC-FECHA-02 item 2. A lista e os painéis leem daqui; a chave
 * começa por `CHAVE_SITUACAO_DO_CONTRATO`, então o canal do Financeiro a invalida junto com a do contrato.
 */
export async function lerSituacaoEmLoteDoBanco(clienteId: string, hoje: string): Promise<Map<string, SituacaoDoContrato>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_financiamentos_situacao_lote', { p_cliente_id: clienteId, p_hoje: hoje });
  if (error) throw error;
  const lido = lerSituacaoEmLote(data);
  if (!lido) throw new Error('A situação dos contratos veio em formato inesperado.');
  return lido;
}
export function useSituacaoEmLote(clienteId: string | null | undefined, hoje: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_SITUACAO_DO_CONTRATO] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: [CHAVE_SITUACAO_DO_CONTRATO, 'lote', clienteId, hoje],
    enabled: !!clienteId,
    queryFn: () => lerSituacaoEmLoteDoBanco(clienteId ?? '', hoje),
  });
}
