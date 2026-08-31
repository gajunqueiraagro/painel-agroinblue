import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useOperacaoDoLancamento — O ELO entre um lançamento zootécnico e a Operação Comercial
 * que o criou. PR-OC-EDICAO-I-01.
 *
 * ⚠ O ELO NÃO MORA NO LANÇAMENTO. Medido: `lancamentos` não tem coluna de operação, e a
 * lista do V2 lê `from('lancamentos').select('*')` — não há por onde o `operacao_id` vir
 * de carona. Quem guarda a ligação é `zoo_operacao_movimentacoes`
 * (`movimentacao_id` -> `lancamentos.id`), e por isso a consulta é PONTUAL: uma leitura no
 * gesto de editar, não uma coluna a mais em toda lista.
 *
 * ⚠ NÃO HÁ O QUE FILTRAR DE CANCELADO AQUI, e a ausência é medida: `zoo_operacao_movimentacoes`
 * tem SETE colunas e nenhuma delas é `cancelada` — quem carrega o estado é o LANÇAMENTO
 * (`lancamentos.cancelado`). Na b58bf556 há 4 elos, 3 apontando para lançamentos
 * cancelados e 1 para o vivo; como a busca parte do lançamento que o operador clicou — e a
 * lista só mostra vivos —, ela já chega no elo certo. Filtrar aqui seria proteger de um
 * caso que o caminho não produz.
 *
 * ⚠ DUAS PORTAS PARA UMA CONSULTA: a função para quem precisa DECIDIR antes de renderizar
 * (o roteamento do "i", que escolhe entre abrir a OC e abrir o modal), o hook para quem já
 * está montado (a faixa dentro do modal). Escrever a consulta duas vezes é como dois
 * caminhos para a mesma verdade começam a divergir.
 */
export interface OperacaoDoLancamento {
  operacaoId: string;
  /** `compra` | `venda` | `abate` — decide qual shell abrir. */
  tipoOperacao: string;
}

export async function buscarOperacaoDoLancamento(lancamentoId: string | null | undefined): Promise<OperacaoDoLancamento | null> {
  if (!lancamentoId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
  const { data, error } = await (supabase as any)
    .from('zoo_operacao_movimentacoes')
    .select('operacao_id, zoo_operacoes_comerciais(tipo_operacao)')
    .eq('movimentacao_id', lancamentoId)
    .maybeSingle();
  /* ⚠ ERRO NÃO VIRA EXCEÇÃO, vira "não sei" — e "não sei" cai no caminho de sempre. Um
     lançamento avulso é o caso COMUM; deixar a consulta derrubar a edição por uma falha de
     rede seria trocar um caminho que funciona por uma tela quebrada. */
  if (error || !data?.operacao_id) return null;
  return {
    operacaoId: data.operacao_id,
    tipoOperacao: data.zoo_operacoes_comerciais?.tipo_operacao ?? 'compra',
  };
}

/** A mesma consulta, para quem já está renderizado. `null` = avulso (ou ainda carregando). */
export function useOperacaoDoLancamento(lancamentoId: string | null | undefined, enabled = true) {
  const [operacao, setOperacao] = useState<OperacaoDoLancamento | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !lancamentoId) { setOperacao(null); return; }
    let cancelado = false;
    setLoading(true);
    buscarOperacaoDoLancamento(lancamentoId)
      .then(r => { if (!cancelado) setOperacao(r); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [lancamentoId, enabled]);

  return { operacao, loading };
}
