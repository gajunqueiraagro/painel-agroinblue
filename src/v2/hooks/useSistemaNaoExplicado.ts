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
}

// PR-MESA-INVERSO-02 — contaId = conta selecionada na toolbar (null = todas da sessão).
// Entra na queryKey → chip e drawer refletem o MESMO escopo e reagem à troca de conta.
export function useSistemaNaoExplicado(sessaoId: string | null, contaId: string | null = null) {
  return useQuery({
    queryKey: ['sistema-nao-explicado', sessaoId, contaId ?? null],
    enabled: !!sessaoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_sistema_nao_explicado',
        { p_sessao_id: sessaoId, p_conta_id: contaId },
      );
      if (error) throw error;
      return (data ?? []) as LancamentoNaoExplicado[];
    },
  });
}
