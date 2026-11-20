/**
 * CONC-SUGESTOES-FONTE-01 item 4 — o fornecedor que o histórico conhece para cada termo do mês (`fn_conciliacao_fornecedores_do_historico`).
 * Os lotes saem juntos (`Promise.all`); falhou = mapa vazio e a lista de sempre (a sugestão nunca trava nem some por isto; o erro vai ao
 * console). Não relê ao voltar o foco: o histórico não muda enquanto o operador confere, e reordenar a lista na mão dele é deslocar.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { emLotes, janelaDoMes, lerFornecedoresDoHistorico, lerNomesDoHistorico } from '@/lib/conciliacao/fornecedoresDoHistorico';

const VAZIO: ReadonlyMap<string, string> = new Map();
/** B1: os nomes (id → nome) da mesma resposta — a família do fornecedor pelo nome */
export interface DoHistorico { ids: ReadonlyMap<string, string>; nomes: ReadonlyMap<string, string> }

export function useFornecedoresDoHistorico(clienteId: string | null | undefined, anoMes: string, termos: readonly string[]) {
  const chaveTermos = [...termos].sort().join('\u0001');
  const q = useQuery({
    queryKey: ['conc-fornecedores-do-historico', clienteId, anoMes, chaveTermos],
    enabled: !!clienteId && termos.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ ids: [string, string][]; nomes: [string, string][] }> => {
      const { de, ate } = janelaDoMes(anoMes);
      const partes = await Promise.all(emLotes(chaveTermos.split('\u0001')).map(async (lote) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { data, error } = await (supabase as any).rpc('fn_conciliacao_fornecedores_do_historico', {
          p_cliente: clienteId, p_termos: lote, p_de: de, p_ate: ate,
        });
        if (error) { console.error('[useFornecedoresDoHistorico]', error); return { ids: [], nomes: [] }; }
        return { ids: [...lerFornecedoresDoHistorico(data)], nomes: [...lerNomesDoHistorico(data)] };
      }));
      return { ids: partes.flatMap((x) => x.ids), nomes: partes.flatMap((x) => x.nomes) };
    },
  });
  return useMemo<DoHistorico>(() => (q.data ? { ids: new Map(q.data.ids), nomes: new Map(q.data.nomes) } : { ids: VAZIO, nomes: VAZIO }), [q.data]);
}
