/**
 * useExtratoParesOfx — identifica movimentos OFX não-conciliados que têm
 * "par" em OUTRA conta do mesmo cliente no mesmo mês (transferência provável).
 *
 * Critério de par:
 *   - mesmo cliente
 *   - conta_bancaria_id diferente
 *   - valor abs igual (tol 0.01)
 *   - tipo_movimento oposto (credito/debito)
 *   - data ±1 dia
 *   - ambos status='nao_conciliado' e cancelado_em IS NULL
 *
 * Não cria/altera dado. Retorna Set<extrato_id> dos IDs que têm par.
 * Escopo: cliente+mês — compartilhado entre todas as contas da tela.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Params {
  clienteId: string | null;
  anoMes: string | null; // 'YYYY-MM'
  enabled?: boolean;
}

interface MovRef {
  id: string;
  data_movimento: string;
  valor: number;
  tipo_movimento: 'credito' | 'debito';
  conta_bancaria_id: string;
}

const TOL = 0.01;
const UM_DIA_MS = 86_400_000;

export function useExtratoParesOfx({ clienteId, anoMes, enabled = true }: Params) {
  const queryKey = ['extrato-pares-ofx', clienteId, anoMes] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: !!clienteId && !!anoMes && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<MovRef[]> => {
      // Cast `(supabase as any)` é padrão do projeto quando os types
      // gerados do Supabase não inferem corretamente uma query path
      // (mesma estratégia usada em useClassificacaoStaging etc.).
      const { data, error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, data_movimento, valor, tipo_movimento, conta_bancaria_id')
        .eq('cliente_id', clienteId as string)
        .eq('ano_mes', anoMes as string)
        .eq('status', 'nao_conciliado')
        .is('cancelado_em', null);
      if (error) throw error;
      return (data || []) as MovRef[];
    },
  });

  const paresOfx = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    const movs = data || [];
    if (movs.length < 2) return set;

    // O(N²) é seguro: N ≤ algumas dezenas por mês.
    for (let i = 0; i < movs.length; i++) {
      const a = movs[i];
      for (let j = i + 1; j < movs.length; j++) {
        const b = movs[j];
        if (a.conta_bancaria_id === b.conta_bancaria_id) continue;
        if (a.tipo_movimento === b.tipo_movimento) continue;
        if (Math.abs(Math.abs(a.valor) - Math.abs(b.valor)) > TOL) continue;
        const diasDif = Math.abs(
          new Date(a.data_movimento).getTime() - new Date(b.data_movimento).getTime(),
        ) / UM_DIA_MS;
        if (diasDif > 1) continue;
        set.add(a.id);
        set.add(b.id);
      }
    }
    return set;
  }, [data]);

  return { paresOfx, loading: isLoading, error: error as Error | null };
}
