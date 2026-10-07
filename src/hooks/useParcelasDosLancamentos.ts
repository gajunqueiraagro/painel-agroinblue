/**
 * O "i/N" DE CADA LANÇAMENTO QUE É PARCELA DE PARCELAMENTO — PARC-LIVRES-01 passo 5.
 * Uma leitura por cliente de `fn_parcelas_dos_lancamentos` (o número e o total são do CONTRATO); relê quando um lançamento do
 * cliente muda. A tela só posiciona: o nome corta, o "i/N" não.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { lerParcelasDosLancamentos, type ParcelaDoContrato } from '@/lib/financiamentos/nomeDaParcela';

export const CHAVE_PARCELAS_DOS_LANCAMENTOS = 'parcelas-dos-lancamentos';

export function useParcelasDosLancamentos(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_PARCELAS_DOS_LANCAMENTOS, clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: [CHAVE_PARCELAS_DOS_LANCAMENTOS, clienteId],
    enabled: !!clienteId,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, ParcelaDoContrato>> => {
      const { data, error } = await (supabase as any).rpc('fn_parcelas_dos_lancamentos', { p_cliente_id: clienteId });
      if (error) throw error;
      return lerParcelasDosLancamentos(data);
    },
  });
}
