/**
 * Hook: useOperacoesComerciaisEmAndamento
 *
 * Contagem LEVE de operações comerciais "em andamento" do cliente atual:
 *   status_comercial <> 'cancelada' E (rascunho = true OU status_comercial = 'programada').
 *
 * count-only (head:true, count:'exact') — não traz linhas. Consumido pelo alerta
 * contextual da Conferência de Movimentações (link para a Central de Operações
 * Comerciais).
 *
 * NÃO consulta zoo_operacao_movimentacoes: o eixo Animais não tem derivação
 * oficial ainda; proibido inferir status por ausência de movimentação.
 *
 * (supabase as any).from é o idioma vigente para zoo_operacoes_comerciais
 * (mesmo padrão de CentralOperacoesComerciais e useOperacaoComercial — tabela
 * zoo_ fora de types.ts).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export function useOperacoesComerciaisEmAndamento() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const { data, isFetching } = useQuery({
    queryKey: ['oc-em-andamento', clienteId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from('zoo_operacoes_comerciais')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .neq('status_comercial', 'cancelada')
        .or('rascunho.eq.true,status_comercial.eq.programada');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!clienteId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return { count: data ?? 0, loading: isFetching };
}
