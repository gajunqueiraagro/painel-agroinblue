/**
 * OS INSUMOS DE UM CONTRATO DE BARTER — a perna RECEBI (PR-AGRI-BARTER-TELA-B).
 *
 * ⚠ O INSUMO PENDURA NO CONTRATO, NÃO NA VENDA — `agri_oc_insumos.contrato_barter_id`. Ele é
 * recebido antes de existir operação de venda: o produtor pega a semente na abertura da safra
 * e entrega o grão meses depois. Prendê-lo à OC obrigaria a inventar uma venda para lançar o
 * que já chegou.
 * ⚠ `financeiro_lancamento_id` NASCE NULO. Quem o preenche é a materialização (fatia D), e é
 * ele que serve de trava: insumo materializado não se edita nem se apaga sem estornar antes,
 * senão o lançamento no DRE ficaria apontando para um valor que mudou por baixo.
 * ⚠ TABELA FORA DO `types.ts`: idioma da casa, `(supabase as any)` no builder.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BarterInsumo {
  id: string;
  contrato_barter_id: string;
  safra_id: string | null;
  produto: string;
  nf_numero: string | null;
  /**
   * A DATA DA NOTA — AGRI-BARTER-04.
   *
   * ⚠ É ELA QUE VIRA A COMPETÊNCIA NO DRE. O materializador usava `current_date`: os 26 insumos
   * de abril de 2025 entravam no resultado com a data do dia em que alguém clicou em
   * materializar — um custo saindo do ano que o gerou e caindo num que não teve nada com ele.
   * ⚠ NULO TEM PADRÃO, e ele mora no banco: `coalesce(data_recebimento, contrato.data_abertura)`.
   * Insumo sem data não perde a competência, só herda a do contrato.
   */
  data_recebimento: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor: number;
  plano_conta_id: string | null;
  financeiro_lancamento_id: string | null;
  observacoes: string | null;
}

export interface InsumoPayload {
  safra_id: string | null;
  produto: string;
  nf_numero: string | null;
  data_recebimento: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor: number;
  plano_conta_id: string | null;
  observacoes: string | null;
}

const COLS = 'id, contrato_barter_id, safra_id, produto, nf_numero, data_recebimento,'
  + ' quantidade, unidade, valor, plano_conta_id, financeiro_lancamento_id, observacoes';

export function useBarterInsumos(clienteId: string | null | undefined, contratoId: string | null) {
  const queryClient = useQueryClient();
  const chave = ['barter-insumos', contratoId ?? ''];

  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!contratoId,
    queryFn: async (): Promise<BarterInsumo[]> => {
      const { data: linhas, error } = await (supabase as any).from('agri_oc_insumos')
        .select(COLS)
        .eq('contrato_barter_id', contratoId)
        .eq('ativo', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (linhas ?? []) as BarterInsumo[];
    },
  });

  const salvar = async (
    id: string | null, payload: InsumoPayload,
  ): Promise<{ ok: boolean; erro?: string }> => {
    if (!clienteId || !contratoId) return { ok: false, erro: 'Sem cliente ou contrato.' };
    const db = supabase as any;
    const { error } = id
      ? await db.from('agri_oc_insumos').update(payload).eq('id', id)
      : await db.from('agri_oc_insumos')
        .insert({ ...payload, cliente_id: clienteId, contrato_barter_id: contratoId });
    if (error) return { ok: false, erro: error.message };
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true };
  };

  /**
   * ⚠ EXCLUSÃO LÓGICA (`ativo = false`), como na colheita: o insumo é documento — tem nota
   * fiscal do parceiro atrás dele. Apagar a linha tiraria do sistema o que continua existindo
   * no arquivo do produtor.
   */
  const excluir = async (id: string): Promise<{ ok: boolean; erro?: string }> => {
    const { error } = await (supabase as any).from('agri_oc_insumos')
      .update({ ativo: false }).eq('id', id);
    if (error) return { ok: false, erro: error.message };
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true };
  };

  const total = (data ?? []).reduce((s, i) => s + (Number(i.valor) || 0), 0);

  /**
   * ⚠ EXPOSTO PARA QUEM EDITA O LANÇAMENTO VINCULADO — o mesmo idioma de
   * `useLancamentosDaSafra` e `usePainelSafra`, que já devolvem o seu `recarregar`. O valor do
   * insumo e o do lançamento são o MESMO dinheiro visto de dois lados: corrigir um pelo modal
   * financeiro e não recarregar o outro deixaria a linha e o "Total recebido" discordando na
   * mesma tela aberta.
   */
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  /**
   * ⚠ O ERRO SOBE PARA A TELA, e é o conserto de um defeito que já custou uma investigação: o
   * `queryFn` lança em falha, a tela ignorava e renderizava "Nenhum insumo lançado". Uma lista
   * que mente sobre estar vazia é pior que uma que não carrega — foi assim que uma venda
   * "sumiu" sem nunca ter saído do banco.
   */
  return {
    insumos: data ?? [], carregando: isLoading, erro: error as Error | null,
    salvar, excluir, total, recarregar,
  };
}
