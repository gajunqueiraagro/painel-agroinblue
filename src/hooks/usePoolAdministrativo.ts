/**
 * O POOL ADMINISTRATIVO QUE A SAFRA RATEIA — PR-AGRI-DRE-DRILL-05.
 *
 * ⚠ ELE NÃO É DA SAFRA, e essa é a razão de existir um hook só para ele. Todos os outros
 * números do DRE saem de `safra_id`; o administrativo sai da JANELA DE DATAS da safra
 * (`data_competencia between data_inicio and data_fim`) sobre lançamentos de
 * `escopo_negocio = 'administrativo'`, e entra multiplicado pelo percentual declarado do ANO
 * de cada lançamento (`agri_rateio_admin`). Filtrar por `safra_id` aqui traria lista vazia.
 *
 * ⚠ AS QUATRO EXCLUSÕES DE MACRO SÃO DA RPC, copiadas: dividendo é distribuição de lucro e
 * não custo; investimento não entra no caixa do período; saída financeira e transferência não
 * são custo administrativo. Sem elas o pool listado ficaria maior que o que foi rateado, e o
 * operador procuraria a diferença onde ela não está.
 * ⚠ MACRO NULO FICA DE FORA, como no `not in` do SQL — `NULL not in (…)` é NULL, e a linha não
 * passa. Está escrito aqui porque o dia em que aparecer um administrativo sem macro, a
 * ausência dele na lista é comportamento, não defeito. (Medido em 13/09/2026: zero hoje.)
 * ⚠ O MACRO SE FILTRA EM MEMÓRIA, DE PROPÓSITO. O `not.in` do PostgREST com valores que têm
 * espaço e acento ("Investimento na Fazenda", "Transferências") não tem um único precedente no
 * repo, e uma lista mal serializada não dá erro visível: o pool viria vazio e a tela mostraria
 * "nenhum lançamento" para R$ 190 mil rateados. São 1.318 linhas na janela contra 413 — uma
 * consulta, não treze — e o critério fica idêntico ao do SQL, letra por letra.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';
import { useNomesDeFornecedores } from '@/hooks/useNomesDeFornecedores';
import type { LancamentoDaSafra } from '@/hooks/useLancamentosDaSafra';

/** Os macros que a RPC exclui do custo administrativo. */
export const MACROS_FORA_DO_ADMIN = [
  'Dividendos', 'Investimento na Fazenda', 'Saída Financeira', 'Transferências',
] as const;

/** O mesmo critério do `macro_custo not in (…)` da RPC, nulo incluído na exclusão. */
export function ehCustoAdministrativo(macro: string | null | undefined): boolean {
  if (macro == null) return false;
  return !(MACROS_FORA_DO_ADMIN as readonly string[]).includes(macro);
}

export interface AnoDoPoolAdmin {
  ano: number;
  total: number;
  /** `null` quando o ano não tem percentual declarado — a RPC o trata como zero. */
  percentual: number | null;
  contribui: number;
}

const COLUNAS = 'id, valor, tipo_operacao, cultura, macro_custo, grupo_custo, centro_custo,'
  + ' subcentro, descricao, favorecido_id, numero_documento, documento,'
  + ' data_pagamento, data_vencimento, data_competencia';

export function usePoolAdministrativo(
  clienteId: string | null | undefined,
  de: string | null | undefined,
  ate: string | null | undefined,
) {
  const ativo = !!clienteId && !!de && !!ate;

  const { data: lancamentos } = useQuery({
    queryKey: ['dre-agri-pool-admin', clienteId ?? '', de ?? '', ate ?? ''],
    enabled: ativo,
    queryFn: async (): Promise<LancamentoDaSafra[]> => paginarTudo<LancamentoDaSafra>(
      async (inicio, tamanho) => {
        const { data, error } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .select(COLUNAS)
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .eq('escopo_negocio', 'administrativo')
          .eq('tipo_operacao', '2-Saídas')
          .gte('data_competencia', de)
          .lte('data_competencia', ate)
          .order('id', { ascending: true })
          .range(inicio, inicio + tamanho - 1);
        if (error) throw error;
        const brutas = (data ?? []) as LancamentoDaSafra[];
        /* `brutas` conta a leva INTEIRA — é ela que diz se há próxima página. Contar só as
           filtradas pararia a paginação cedo numa leva cheia de dividendos. */
        return {
          linhas: brutas.filter(l => ehCustoAdministrativo(l.macro_custo)),
          brutas: brutas.length,
        };
      }),
  });

  const { data: percentuais } = useQuery({
    queryKey: ['dre-agri-rateio-admin', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async (): Promise<Map<number, number>> => {
      const { data } = await (supabase as any).from('agri_rateio_admin')
        .select('ano, percentual').eq('cliente_id', clienteId).eq('atividade', 'agricultura');
      const linhas = (data ?? []) as { ano: number; percentual: number }[];
      return new Map(linhas.map(l => [Number(l.ano), Number(l.percentual)]));
    },
  });

  /**
   * ⚠ OS FAVORECIDOS DAQUI NÃO ESTÃO NO MAPA DA SAFRA, e foi esse o defeito: o administrativo
   * tem `safra_id` NULO — ele entra pela janela de datas —, então nenhum dos ids dele aparecia
   * entre os favorecidos dos lançamentos da safra, e a coluna saía "—" em toda a seção
   * rateada. O hook é o mesmo do drill direto; muda só quem entrega os ids.
   */
  const fornecedores = useNomesDeFornecedores((lancamentos ?? []).map(l => l.favorecido_id));

  /* O mesmo `group by ano` da RPC, para o cabeçalho poder dizer com que percentual cada ano
     entrou — dois anos da janela podem ter percentuais diferentes, e uma nota única mentiria. */
  const porAno: AnoDoPoolAdmin[] = [];
  const acumulado = new Map<number, number>();
  for (const l of lancamentos ?? []) {
    const ano = Number((l.data_competencia ?? '').slice(0, 4));
    if (!ano) continue;
    acumulado.set(ano, (acumulado.get(ano) ?? 0) + (Number(l.valor) || 0));
  }
  for (const ano of [...acumulado.keys()].sort((a, b) => a - b)) {
    const total = acumulado.get(ano) ?? 0;
    const pct = percentuais?.has(ano) ? (percentuais.get(ano) ?? null) : null;
    porAno.push({ ano, total, percentual: pct, contribui: total * ((pct ?? 0) / 100) });
  }

  return {
    lancamentos: lancamentos ?? [],
    fornecedores,
    porAno,
    totalDoPool: porAno.reduce((s, a) => s + a.total, 0),
    carregando: ativo && !lancamentos,
  };
}
