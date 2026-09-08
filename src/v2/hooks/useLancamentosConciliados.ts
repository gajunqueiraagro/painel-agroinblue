/**
 * Quais lançamentos têm vínculo ATIVO com o extrato — [ENRIQUECER-TELA-03] (133h item 12).
 *
 * ⚠ ESPELHA O PREDICADO DA RPC, PALAVRA POR PALAVRA. `fn_classificacao_apply_row` decide o
 * que ignorar com `EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE
 * c.lancamento_id = ... AND c.desfeito_em IS NULL)` — medido na definição da função no
 * Proto (migration 20260908110224). Uma segunda régua aqui faria a tela travar campos que o
 * banco aceita, ou oferecer campos que ele ignora em silêncio: os dois lados do mesmo erro.
 *
 * ⚠ `status_transacao` NÃO SERVE, e isso foi medido, não suposto: no Proto há 2.459
 * lançamentos 'realizado' COM vínculo e 27.212 'realizado' SEM. Não existe status
 * 'conciliado'. Quem quiser derivar o vínculo do status vai errar em 27 mil linhas.
 *
 * ⚠ SÓ LEITURA, e em blocos: a lista de ids de uma sessão passa de mil, e o PostgREST corta
 * o `in.()` bem antes disso.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BLOCO = 200;

export function useLancamentosConciliados(lancIds: readonly string[]) {
  /* A chave é o CONJUNTO ordenado: reordenar a lista não deve refazer a consulta, e uma
     chave por identidade de array a refaria a cada render. */
  const chave = [...new Set(lancIds)].sort().join(',');

  const query = useQuery({
    queryKey: ['lancamentos-conciliados', chave],
    enabled: chave.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const ids = chave.split(',').filter(Boolean);
      const achados: string[] = [];
      for (let i = 0; i < ids.length; i += BLOCO) {
        const fatia = ids.slice(i, i + BLOCO);
        const { data, error } = await supabase
          .from('conciliacao_bancaria_itens')
          .select('lancamento_id')
          .in('lancamento_id', fatia)
          .is('desfeito_em', null);
        if (error) throw error;
        for (const r of data ?? []) {
          if (r.lancamento_id) achados.push(r.lancamento_id);
        }
      }
      return achados;
    },
  });

  return {
    /* `Set` para a tabela perguntar por linha sem varrer a lista inteira a cada render. */
    conciliados: new Set(query.data ?? []),
    carregando: query.isLoading,
  };
}
