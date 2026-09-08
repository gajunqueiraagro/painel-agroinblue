/**
 * useSistemaNaoExplicado — visão INVERSA (read-only) da Mesa: lançamentos vivos do
 * mês/conta da sessão que NENHUMA linha do staging referencia (PR-MESA-INVERSO-01).
 * Fonte única = fn_classificacao_sistema_nao_explicado. Read-only ABSOLUTO.
 *
 * Cast `(supabase as any)` intencional: tipos não regenerados (padrão do projeto).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LancamentoNaoExplicado {
  lanc_id: string;
  data_pagamento: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  descricao: string | null;
  favorecido_nome: string | null;
  conta_nome: string | null;
  documento: string | null;
  /** 133c-a (migration 20260907173022) — a classificação que o lançamento já tem. */
  subcentro: string | null;
  /**
   * 133i-c item 5 (migration 20260908203711) — a conta do lançamento POR ID.
   *
   * ⚠ ELE SUBSTITUI O CASAMENTO POR NOME. Até esta migration a RPC só devolvia
   * `conta_nome`, e a tela achava a conta comparando string com
   * `nome_exibicao || nome_conta` — frágil por construção: nome muda no cadastro,
   * dois clientes repetem nome, e o `nome_exibicao` é editável.
   * ⚠ OPCIONAL NO TIPO de propósito: a RPC nova já está no proto, mas a coluna chega
   * `undefined` em qualquer resposta em cache do react-query anterior ao deploy. O
   * chamador cai no nome quando ela não vier — ver `contaDoLancamento`.
   */
  conta_bancaria_id?: string | null;
}

// PR-MESA-INVERSO-02 — contaId = conta selecionada na toolbar (null = todas da sessão).
// Entra na queryKey → chip e lista refletem o MESMO escopo e reagem à troca de conta.
/**
 * ⚠ `anoMes` É O DA RÉGUA, E SEMPRE — 133c-a. Sem ele a RPC filtrava pela COMPETÊNCIA das
 * linhas da planilha, que no cliente vai de out/2025 a set/2026: 3.926 lançamentos "não
 * explicados", um número que não cabe em tela nem em cabeça. Com o mês, 201 — e 40 sem
 * subcentro, que é o trabalho de verdade.
 * ⚠ ELE ENTRA NA `queryKey`: trocar o mês na régua sem trocar a chave devolveria a lista do
 * mês anterior, e ela pareceria conferida.
 */
export function useSistemaNaoExplicado(
  sessaoId: string | null,
  contaId: string | null = null,
  anoMes: string | null = null,
) {
  return useQuery({
    queryKey: ['sistema-nao-explicado', sessaoId, contaId ?? null, anoMes ?? null],
    enabled: !!sessaoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_sistema_nao_explicado',
        { p_sessao_id: sessaoId, p_conta_id: contaId, p_ano_mes: anoMes },
      );
      if (error) throw error;
      return (data ?? []) as LancamentoNaoExplicado[];
    },
  });
}
