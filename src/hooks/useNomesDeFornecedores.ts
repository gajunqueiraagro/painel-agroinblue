/**
 * O NOME DE CADA FAVORECIDO, POR ID — PR-AGRI-DRE-DRILL-06.
 *
 * ⚠ NASCEU DE UM DEFEITO DE DOIS MAPAS. O drill do DRE resolvia o favorecido a partir dos
 * lançamentos DA SAFRA; o pool administrativo não é da safra (`safra_id is null` — são os
 * lançamentos da JANELA de datas), então os favorecidos dele nunca entravam naquele mapa e a
 * coluna saía "—" para todo aluguel de escritório. O dado existia o tempo inteiro; faltava
 * quem perguntasse por ele. Com um hook só, quem tem os ids pede os nomes, venham de onde
 * vierem.
 * ⚠ EM LEVAS, como os lançamentos: o `.in()` do PostgREST tem teto, e uma safra chega a duas
 * centenas de favorecidos distintos (medido: 198 na 25/26 do NJ).
 * ⚠ A CHAVE NÃO É A LISTA INTEIRA — são o tamanho e o primeiro id, já ordenados. Pôr um array
 * de 198 uuids na `queryKey` faria o React Query serializá-lo a cada render.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';

const VAZIO = new Map<string, string>();

export function useNomesDeFornecedores(favorecidoIds: readonly (string | null | undefined)[]) {
  const ids = Array.from(new Set(favorecidoIds.filter((v): v is string => !!v))).sort();

  const { data } = useQuery({
    queryKey: ['nomes-fornecedores', ids.length, ids[0] ?? ''],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const nomes = await paginarTudo<{ id: string; nome: string }>(async (de, tamanho) => {
        const fatia = ids.slice(de, de + tamanho);
        if (fatia.length === 0) return { linhas: [], brutas: 0 };
        const { data: linhas } = await (supabase as any)
          .from('financeiro_fornecedores').select('id, nome').in('id', fatia);
        return { linhas: (linhas ?? []) as { id: string; nome: string }[], brutas: fatia.length };
      });
      return new Map(nomes.map(f => [f.id, f.nome]));
    },
  });

  return data ?? VAZIO;
}
