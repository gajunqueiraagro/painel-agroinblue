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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { paginarTudo } from '@/lib/financeiro/paginarTudo';
import { useNomesDeFornecedores } from '@/hooks/useNomesDeFornecedores';
import type { ItemDrill } from '@/lib/analise/drillEconomico';

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
  /**
   * O lançamento compõe o DRE?
   *
   * ⚠ ENTROU PARA O PAINEL DA SAFRA, que peneira por ele: `fn_painel_safra` monta as naturezas
   * do custeio com `compoe_dre = true`, e sem a coluna o drill listaria também as saídas que a
   * própria tela contabiliza FORA do custeio — a linha "lançamentos fora do custeio" que ela
   * mostra no rodapé. A lista somaria mais que o número clicado.
   * ⚠ O DRILL DO DRE NÃO USA e continua sem usar: a RPC dele peneira por grupo, não por esta
   * flag. O campo é aditivo.
   */
  compoe_dre: boolean | null;
}

const COLUNAS = 'id, valor, tipo_operacao, cultura, macro_custo, grupo_custo, centro_custo,'
  + ' subcentro, descricao, favorecido_id, numero_documento, documento,'
  + ' data_pagamento, data_vencimento, data_competencia, compoe_dre';

/**
 * O LANÇAMENTO DA SAFRA COMO O DRILL O ENXERGA.
 *
 * ⚠ MORA AQUI, JUNTO DO TIPO QUE ELE TRADUZ, e não na tela que o usava. Nasceu dentro do
 * `AgriDreCulturaTab`; quando o Painel da Safra passou a abrir o MESMO drawer, copiá-lo seria
 * criar duas traduções do mesmo lançamento — e a primeira divergência (um `doc` que num lugar
 * cai para `documento` e no outro não) apareceria como "o drill do painel mostra outra coisa".
 * ⚠ FUNÇÃO PURA, NÃO HOOK: quem tem o mapa de fornecedores é a tela, e é ela que decide quando
 * memorizar. O corpo é o do DRE, sem uma vírgula de diferença.
 */
export function paraItemDrillDaSafra(
  l: LancamentoDaSafra, nomesDeFavorecidos: Map<string, string>,
): ItemDrill {
  return {
    id: l.id,
    data: l.data_pagamento || l.data_vencimento || l.data_competencia || '',
    mov: ((l.tipo_operacao || '').startsWith('1') ? 1 : -1) * Math.abs(Number(l.valor) || 0),
    tipo: l.tipo_operacao ?? '',
    produto: l.descricao,
    fornecedor: (l.favorecido_id && nomesDeFavorecidos.get(l.favorecido_id)) || '',
    doc: l.numero_documento || l.documento || '',
    macro: l.macro_custo ?? null,
    grupo: l.grupo_custo ?? null,
    centroPlano: l.centro_custo ?? null,
    subcentro: l.subcentro ?? null,
  };
}

export function useLancamentosDaSafra(clienteId: string | null | undefined, safraId: string | null) {
  const queryClient = useQueryClient();
  const chave = ['dre-agri-lancs', clienteId ?? '', safraId ?? ''];
  const { data, isLoading } = useQuery({
    queryKey: chave,
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

  /* Os nomes saem do mesmo hook que o pool administrativo usa — um caminho só. */
  const fornMap = useNomesDeFornecedores((data ?? []).map(l => l.favorecido_id));

  /**
   * ⚠ RECARREGA A SAFRA INTEIRA, e não só a linha editada como faz o Painel por período.
   * Lá a troca de uma linha no cache basta porque o recorte tem até quatro mil linhas em
   * levas de mil. Aqui é UMA consulta de ~1,2 mil, e há um caso que a troca de linha não
   * cobriria: mudar a SAFRA do lançamento o tira deste DRE, e ele continuaria na lista do
   * drill mostrando um valor que já não pertence a esta tela. Recarregar é mais barato que
   * essa mentira.
   * ⚠ O DRAWER NÃO FECHA: o `DrillDownEconomico` guarda o caminho no state dele, e trocar os
   * itens não o desmonta — o operador volta do modal no mesmo degrau.
   */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  return {
    lancamentos: data ?? [],
    fornecedores: fornMap,
    carregando: isLoading,
    recarregar,
  };
}
