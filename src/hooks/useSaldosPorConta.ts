/**
 * Saldo do mês por CONTA BANCÁRIA — fonte: financeiro_saldos_bancarios_v2.
 *
 * ESCOPO CLIENTE, nunca fazenda: mesma regra de useSaldoCaixaMensal.
 * Resultado idêntico em Global e em fazenda específica.
 *
 * Ordena por tipo_conta (cc, inv, cartao) e, dentro do tipo, por
 * ordem_exibicao e nome. Contas com saldo zero SÃO devolvidas — quem
 * decide esconder é a tela, não o hook.
 *
 * Conferência: a soma de todos os saldos deve bater com o saldo final do
 * mês no bloco Caixa. Divergência = erro de leitura, não arredondamento.
 *
 * `ano_mes` e TEXT no formato 'YYYY-MM' nesta tabela — nao `date`, ao
 * contrario de fechamento_area_snapshot. Confirmado pelo filtro
 * `.in('ano_mes', ['2026-07', ...])` de useSaldoCaixaMensal.
 *
 * As DUAS tabelas estao em src/integrations/supabase/types.ts, entao aqui
 * NAO ha `as any`: erro de TSC neste arquivo significa query mal formada,
 * nao divida de tipos.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SaldoPorConta {
  conta_id: string;
  nome: string;
  tipo_conta: string | null;
  saldo: number;
}

/* Ordem oficial dos tipos. Tipo fora desta lista vai para o fim, preservando
   o valor cru — inventar rotulo esconderia dado novo do plano de contas. */
const ORDEM_TIPO: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };
const pesoTipo = (t: string | null): number =>
  t != null && t in ORDEM_TIPO ? ORDEM_TIPO[t] : 99;

export function useSaldosPorConta(
  clienteId: string | undefined,
  anoMes: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ['saldos-por-conta', clienteId, anoMes],
    queryFn: async (): Promise<SaldoPorConta[]> => {
      const { data, error } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final, conta_bancaria_id, financeiro_contas_bancarias!inner(nome_exibicao, nome_conta, tipo_conta, ativa, ordem_exibicao)')
        .eq('cliente_id', clienteId!)
        .eq('ano_mes', anoMes)
        /* Filtro na tabela EMBUTIDA, viavel por causa do !inner. A guarda em JS
           abaixo permanece: se o filtro relacional falhar em runtime, a conta
           inativa ainda nao entra no total. */
        .eq('financeiro_contas_bancarias.ativa', true);
      if (error) throw error;

      const linhas: (SaldoPorConta & { ordem: number })[] = [];
      for (const row of data ?? []) {
        const conta = row.financeiro_contas_bancarias;
        if (!conta || conta.ativa !== true) continue;
        linhas.push({
          conta_id: row.conta_bancaria_id,
          nome: conta.nome_exibicao ?? conta.nome_conta,
          tipo_conta: conta.tipo_conta,
          saldo: Number(row.saldo_final) || 0,
          ordem: conta.ordem_exibicao ?? 0,
        });
      }

      linhas.sort((a, b) =>
        pesoTipo(a.tipo_conta) - pesoTipo(b.tipo_conta)
        || a.ordem - b.ordem
        || a.nome.localeCompare(b.nome, 'pt-BR'),
      );

      return linhas.map(({ ordem: _ordem, ...l }) => l);
    },
    enabled: enabled && !!clienteId && !!anoMes,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
