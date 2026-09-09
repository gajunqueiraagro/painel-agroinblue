/**
 * EM QUE CONTA E EM QUE MÊS EXISTE EXTRATO CARREGADO — PR-CONC-B-3.
 *
 * Nasceu dentro de `FinanceiroV2Tab` no B-1 e saiu daqui quando o Extrato Gerencial passou a
 * precisar da mesma resposta. Copiar o `Set` para a segunda tela criaria duas réguas para o
 * mesmo "!": bastaria alguém mudar o filtro de `ignorado_em` num lado para as duas telas
 * discordarem sobre o mesmo lançamento — e o operador não teria como saber qual acreditar.
 *
 * A `queryKey` é a mesma dos dois consumidores de propósito: quem abrir a segunda tela no
 * mesmo cliente reaproveita o cache em vez de repetir a leitura.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCoberturaExtrato(clienteId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['extrato-cobertura-conta-mes', clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      /* O `enabled` já impede a chamada sem cliente; a guarda existe para o compilador
         saber disso sem um `!` de não-nulo — o `as` que a regra zero-cast proíbe. */
      if (!clienteId) return new Set<string>();
      const PAGE = 1000;
      const pares = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('extrato_bancario_v2')
          .select('conta_bancaria_id, data_movimento')
          .eq('cliente_id', clienteId)
          .is('cancelado_em', null)
          .is('ignorado_em', null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const linhas = data ?? [];
        for (const r of linhas) {
          if (r.conta_bancaria_id && r.data_movimento) {
            pares.add(`${r.conta_bancaria_id}|${r.data_movimento.slice(0, 7)}`);
          }
        }
        if (linhas.length < PAGE) break;
        if (from > 200_000) break; // salvaguarda anti-loop, igual à do hook dos vínculos
      }
      return pares;
    },
  });

  return data;
}
