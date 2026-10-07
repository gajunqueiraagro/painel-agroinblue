/**
 * OS DOCUMENTOS DOS LANÇAMENTOS DE UM CLIENTE, POR LANÇAMENTO — PARC-LIVRES-01 passo 3.
 * A MESMA fonte da aba Documentos e do clipe de Contas a Pagar e Receber: `vw_lancamento_documentos`, que já devolve, para cada
 * lançamento, os documentos dele E os ligados a ele (a nota da compra nas N parcelas). Uma leitura por cliente, em páginas;
 * relê quando um lançamento do cliente muda.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import type { DocumentoDaLinha } from '@/lib/financeiro/documentoHelper';

export const CHAVE_DOCUMENTOS_DO_CLIENTE = 'documentos-do-cliente';
const PAGINA = 1000;

export function useDocumentosDoCliente(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_DOCUMENTOS_DO_CLIENTE, clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: [CHAVE_DOCUMENTOS_DO_CLIENTE, clienteId],
    enabled: !!clienteId,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, DocumentoDaLinha[]>> => {
      const mapa = new Map<string, DocumentoDaLinha[]>();
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from('vw_lancamento_documentos')
          .select('lancamento_id, especie, numero, cancelado')
          .eq('cliente_id', clienteId ?? '')
          .order('lancamento_id', { ascending: true })
          .order('documento_id', { ascending: true })
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        for (const d of data ?? []) {
          if (!d.lancamento_id) continue;
          const lista = mapa.get(d.lancamento_id) ?? [];
          lista.push({ especie: d.especie, numero: d.numero, cancelado: d.cancelado });
          mapa.set(d.lancamento_id, lista);
        }
        if ((data ?? []).length < PAGINA) break;
      }
      return mapa;
    },
  });
}
