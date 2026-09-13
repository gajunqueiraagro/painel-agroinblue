/**
 * OS LANÇAMENTOS DA SAFRA, PARA O DRILL DO DRE — PR-AGRI-DRE-UX-03.
 *
 * ⚠ MESMA PENEIRA DA RPC, PALAVRA POR PALAVRA: cliente, safra e `cancelado = false`. O DRE é
 * somado no banco e a lista é montada aqui; se as duas peneiras divergirem, o drill abre uma
 * lista que não soma o número clicado — e o operador perde a confiança no relatório inteiro,
 * não só naquela célula.
 * ⚠ UMA CONSULTA POR SAFRA, NÃO UMA POR CÉLULA. São ~1,2 mil linhas na safra medida (NJ
 * 25/26); buscar de novo a cada clique deixaria o drawer lento sem reduzir nada — o filtro
 * por coluna e linha é feito em memória, com o mesmo `bucketDaLinha` que a RPC usa.
 * ⚠ `(supabase as any)` É A EXCEÇÃO DA CASA e se aplica aqui pelo motivo já conhecido:
 * `cultura` não existe no `types.ts` gerado, que está defasado.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';

export interface LancamentoDaSafra {
  id: string;
  valor: number | null;
  tipo_operacao: string | null;
  cultura: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  descricao: string | null;
  favorecido_id: string | null;
  numero_documento: string | null;
  documento: string | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  data_competencia: string | null;
}

const COLUNAS = 'id, valor, tipo_operacao, cultura, macro_custo, grupo_custo, centro_custo,'
  + ' subcentro, descricao, favorecido_id, numero_documento, documento,'
  + ' data_pagamento, data_vencimento, data_competencia';

export function useLancamentosDaSafra(clienteId: string | null | undefined, safraId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['dre-agri-lancs', clienteId ?? '', safraId ?? ''],
    enabled: !!clienteId && !!safraId,
    queryFn: async (): Promise<LancamentoDaSafra[]> => paginarTudo<LancamentoDaSafra>(
      async (de, tamanho) => {
        const { data: linhas, error } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select(COLUNAS)
          .eq('cliente_id', clienteId)
          .eq('safra_id', safraId)
          .eq('cancelado', false)
          .order('id', { ascending: true })
          .range(de, de + tamanho - 1);
        if (error) throw error;
        const lista = (linhas ?? []) as LancamentoDaSafra[];
        return { linhas: lista, brutas: lista.length };
      }),
  });

  const ids = (data ?? []).map(l => l.favorecido_id).filter((v): v is string => !!v);
  const favIds = Array.from(new Set(ids)).sort();

  /* Os nomes vêm em levas pela mesma razão dos lançamentos: `.in()` também tem teto. */
  const { data: fornMap } = useQuery({
    queryKey: ['dre-agri-forn', favIds.length, favIds[0] ?? ''],
    enabled: favIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const nomes = await paginarTudo<{ id: string; nome: string }>(async (de, tamanho) => {
        const fatia = favIds.slice(de, de + tamanho);
        if (fatia.length === 0) return { linhas: [], brutas: 0 };
        const { data: linhas } = await (supabase as any)
          .from('financeiro_fornecedores').select('id, nome').in('id', fatia);
        return { linhas: (linhas ?? []) as { id: string; nome: string }[], brutas: fatia.length };
      });
      return new Map(nomes.map(f => [f.id, f.nome]));
    },
  });

  return { lancamentos: data ?? [], fornecedores: fornMap ?? new Map<string, string>(), carregando: isLoading };
}
