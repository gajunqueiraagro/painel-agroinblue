import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StagingRow } from './types';

/**
 * Busca todos os registros de staging de uma sessão.
 *
 * PR6.1A — resolve nomes humanos via 3 queries paralelas + merge client-side
 * (staging não declara FK pra financeiro_contas_bancarias/financeiro_fornecedores
 * na migration do PR6.1, então PostgREST embed automático não funciona).
 *
 * Resultado: cada StagingRow ganha `conta_nome` e `favorecido_nome` resolvidos.
 */
export function useStaging(sessaoId: string | null) {
  return useQuery<StagingRow[]>({
    queryKey: ['mesa-staging', sessaoId],
    enabled: !!sessaoId,
    staleTime: 0,
    queryFn: async (): Promise<StagingRow[]> => {
      const sb = supabase as any;
      const stagingRes = await sb
        .from('mesa_lancamento_staging')
        .select('*')
        .eq('sessao_id', sessaoId)
        .order('data_pagamento', { ascending: true })
        .order('created_at', { ascending: true });
      if (stagingRes.error) throw stagingRes.error;

      const rows = ((stagingRes.data ?? []) as unknown) as StagingRow[];
      if (rows.length === 0) return rows;

      const contaIds = Array.from(
        new Set(rows.map((r) => r.conta_bancaria_id).filter((v): v is string => !!v)),
      );
      const favIds = Array.from(
        new Set(rows.map((r) => r.favorecido_id).filter((v): v is string => !!v)),
      );

      const [contasRes, favsRes] = await Promise.all([
        contaIds.length > 0
          ? sb
              .from('financeiro_contas_bancarias')
              .select('id, nome_exibicao, nome_conta')
              .in('id', contaIds)
          : Promise.resolve({ data: [], error: null }),
        favIds.length > 0
          ? sb.from('financeiro_fornecedores').select('id, nome').in('id', favIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (contasRes.error) throw contasRes.error;
      if (favsRes.error) throw favsRes.error;

      const contaMap = new Map<string, string>();
      ((contasRes.data ?? []) as Array<{ id: string; nome_exibicao: string | null; nome_conta: string | null }>)
        .forEach((c) => {
          contaMap.set(c.id, c.nome_exibicao ?? c.nome_conta ?? '');
        });

      const favMap = new Map<string, string>();
      ((favsRes.data ?? []) as Array<{ id: string; nome: string | null }>).forEach((f) => {
        favMap.set(f.id, f.nome ?? '');
      });

      return rows.map((r) => ({
        ...r,
        conta_nome: r.conta_bancaria_id ? contaMap.get(r.conta_bancaria_id) ?? null : null,
        favorecido_nome: r.favorecido_id ? favMap.get(r.favorecido_id) ?? null : null,
      }));
    },
  });
}
