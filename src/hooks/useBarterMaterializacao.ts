/**
 * MATERIALIZAR E ESTORNAR O BARTER, E O EXTRATO DA PERMUTA — PR-AGRI-BARTER-TELA-D.
 *
 * ⚠ AS DUAS RPCs SÃO O MOTOR, E O FRONT NÃO REPETE A REGRA. `agri_barter_materializar_contrato`
 * varre as partes da OC e os insumos ainda sem lançamento e decide o SINAL pela natureza
 * (receita_venda entra, imposto/desconto/frete saem); `agri_barter_estornar_contrato` apaga por
 * `origem_lancamento='barter'`. Recalcular qualquer parte disso aqui criaria uma segunda
 * verdade — e a que o operador veria não seria a que foi ao DRE.
 *
 * ⚠ O ERRO DO BANCO CHEGA INTEIRO À TELA. As guardas falam português ("Contrato cancelado nao
 * materializa", "Contrato sem conta de permuta"); traduzi-las aqui seria uma segunda mensagem
 * para manter em dia.
 *
 * ⚠ O EXTRATO NÃO TEM COMPONENTE NA CASA, e isto foi medido antes de escrever. O que se chama
 * "Extrato" no financeiro — `ExtratoListaTab`, `PainelExtratoMes` — lê `extrato_bancario_v2`,
 * que são os movimentos IMPORTADOS do OFX. A conta de permuta não tem OFX: ela existe só em
 * `financeiro_lancamentos_v2`, e apontar aquele componente para cá mostraria uma lista vazia.
 * O que a casa tem de lançamentos densos é `TabelaLancamentosCompacta`, sem saldo acumulado e
 * sem separar entrada de saída.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LinhaExtrato {
  id: string;
  data: string;
  descricao: string;
  /** Positivo entra na permuta (o parceiro deve), negativo sai. */
  movimento: number;
  /** O saldo DEPOIS desta linha. */
  saldo: number;
}

export interface ResultadoMaterializacao {
  ok?: boolean;
  lancamentos_gerados?: number;
  conta_permuta?: string;
}

/**
 * O extrato da conta de permuta do contrato.
 *
 * ⚠ O SALDO É ACUMULADO NA ORDEM DA LISTA, e a ordem tem de ser total: `data_competencia` sozinha
 * empata — as 26 linhas de insumo do barter 23/24 nascem todas com a data de hoje. Sem o
 * desempate por `created_at` e `id`, duas leituras da mesma tela mostrariam saldos diferentes nas
 * linhas do meio, e o operador não teria como saber qual está certo. O saldo FINAL seria o mesmo
 * nas duas — o que torna o defeito invisível até alguém conferir linha a linha.
 */
export function useExtratoPermuta(contaPermutaId: string | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['barter-extrato-permuta', contaPermutaId ?? ''],
    enabled: !!contaPermutaId,
    queryFn: async (): Promise<LinhaExtrato[]> => {
      const { data: linhas, error } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, data_competencia, descricao, valor, sinal, created_at')
        .eq('conta_bancaria_id', contaPermutaId as string)
        .eq('cancelado', false)
        .order('data_competencia', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;

      let saldo = 0;
      return (linhas ?? []).map(l => {
        /* ⚠ O SINAL É TEXTO NO BANCO ('1' / '-1'), não número. Comparar com `=== 1` daria
           sempre falso e todo lançamento viraria saída. */
        const mov = (Number(l.valor) || 0) * (String(l.sinal) === '1' ? 1 : -1);
        saldo += mov;
        return {
          id: l.id,
          data: l.data_competencia ?? '',
          descricao: l.descricao ?? '—',
          movimento: mov,
          saldo,
        };
      });
    },
  });

  const linhas = data ?? [];
  return {
    linhas,
    carregando: isLoading,
    /** O saldo final — o mesmo crédito/débito que o card do contrato mostra. */
    saldo: linhas.length > 0 ? linhas[linhas.length - 1].saldo : 0,
  };
}

export function useBarterMaterializacao(contratoId: string | null, contaPermutaId: string | null) {
  const queryClient = useQueryClient();

  /**
   * ⚠ INVALIDA TUDO QUE A MATERIALIZAÇÃO TOCA, não só o extrato. A RPC carimba
   * `financeiro_lancamento_id` nas partes e nos insumos — é esse campo que trava a edição e
   * pinta o cadeado. Sem recarregar as três listas, o operador materializaria e continuaria
   * vendo os lápis, editaria, e a edição não teria como chegar ao lançamento já gerado.
   */
  const recarregar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['barter-extrato-permuta', contaPermutaId ?? ''] }),
      queryClient.invalidateQueries({ queryKey: ['barter-insumos', contratoId ?? ''] }),
      queryClient.invalidateQueries({ queryKey: ['barter-vendas', contratoId ?? ''] }),
    ]);
  };

  const materializar = async (): Promise<{ ok: boolean; erro?: string; gerados?: number }> => {
    if (!contratoId) return { ok: false, erro: 'Sem contrato aberto.' };
    const { data, error } = await (supabase as any).rpc('agri_barter_materializar_contrato', {
      p_contrato_id: contratoId,
    });
    if (error) return { ok: false, erro: error.message };
    await recarregar();
    return { ok: true, gerados: (data as ResultadoMaterializacao)?.lancamentos_gerados ?? 0 };
  };

  const estornar = async (): Promise<{ ok: boolean; erro?: string }> => {
    if (!contratoId) return { ok: false, erro: 'Sem contrato aberto.' };
    const { error } = await (supabase as any).rpc('agri_barter_estornar_contrato', {
      p_contrato_id: contratoId,
    });
    if (error) return { ok: false, erro: error.message };
    await recarregar();
    return { ok: true };
  };

  return { materializar, estornar };
}
