import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Params {
  clienteId: string | null;
  anoMes: string | null; // 'YYYY-MM'
  enabled?: boolean;
}

type DecisaoStatus = 'confirmado' | 'rejeitado';

interface ParDecididoRow {
  ofx_saida_id: string;
  ofx_entrada_id: string;
  status: DecisaoStatus;
}

/** Chave-de-par: rejeição é da ARESTA, não do nó. */
export function chaveParOfx(saidaId: string, entradaId: string): string {
  return `${saidaId}|${entradaId}`;
}

/**
 * useTransferenciasDecididas — lê decisões humanas já gravadas em
 * transferencia_ofx_pares (status confirmado/rejeitado) por cliente+mês.
 * Só leitura. As sugestões on-read vêm de useExtratoParesOfx (separado).
 *
 * - confirmadosOfx: Set<ofx_id> (saída E entrada) de pares status='confirmado'.
 *   Usado pelo gate H2 (PR-Det-5) para excluir OFX já resolvido.
 * - rejeitados: Set<chaveParOfx> de pares status='rejeitado'.
 *   Rejeição é da aresta — NÃO condena o OFX inteiro.
 */
export function useTransferenciasDecididas({ clienteId, anoMes, enabled = true }: Params) {
  const queryKey = ['transferencias-decididas', clienteId, anoMes] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: !!clienteId && !!anoMes && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<ParDecididoRow[]> => {
      const { data, error } = await supabase
        .from('transferencia_ofx_pares' as any)
        .select('ofx_saida_id, ofx_entrada_id, status')
        .eq('cliente_id', clienteId as string)
        .eq('ano_mes', anoMes as string)
        .in('status', ['confirmado', 'rejeitado']);
      if (error) throw error;
      return (data as unknown as ParDecididoRow[]) ?? [];
    },
  });

  const { confirmadosOfx, rejeitados } = useMemo(() => {
    const confirmadosOfx = new Set<string>();
    const rejeitados = new Set<string>();
    for (const row of data ?? []) {
      if (row.status === 'confirmado') {
        confirmadosOfx.add(row.ofx_saida_id);
        confirmadosOfx.add(row.ofx_entrada_id);
      } else {
        rejeitados.add(chaveParOfx(row.ofx_saida_id, row.ofx_entrada_id));
      }
    }
    return { confirmadosOfx, rejeitados };
  }, [data]);

  return { confirmadosOfx, rejeitados, loading: isLoading, error: error as Error | null };
}
