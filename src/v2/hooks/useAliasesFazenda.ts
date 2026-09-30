/**
 * Os apelidos de fazenda do cliente — PR-CONC-MESA-DIVERGENCIA-EXCEL-01.
 *
 * ⚠ SÃO OS QUE O PASSO 1 (de-para) ENSINA: `fazendas.aliases`, a mesma leitura de `useImportLancamentosExcel`. A Mesa
 *   não os tinha — o contexto de fazendas não traz a coluna —, e por isso "Faz Pureza", que o de-para resolve pelo
 *   apelido, chegava ao Resultado sem proposta nenhuma.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const VAZIO: Readonly<Record<string, string[]>> = {};

export function useAliasesFazenda(clienteId: string | null | undefined): Readonly<Record<string, string[]>> {
  const q = useQuery({
    queryKey: ['aliases-fazenda', clienteId ?? null],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase.from('fazendas').select('id, aliases').eq('cliente_id', clienteId ?? '');
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const f of data ?? []) {
        const a: unknown = f.aliases;
        out[f.id] = Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
      }
      return out;
    },
  });
  return q.data ?? VAZIO;
}
