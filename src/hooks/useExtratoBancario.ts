/**
 * useExtratoBancario — leitura de extrato bancário (espelho do banco).
 *
 * Lê apenas da tabela `extrato_bancario_v2`. NÃO realiza matching automático
 * nem cria/altera lançamentos financeiros. Filtros: conta, intervalo de data, status.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export type ExtratoStatus = 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';

export interface ExtratoMovimento {
  id: string;
  cliente_id: string;
  conta_bancaria_id: string;
  importacao_id: string | null;
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
  tipo_movimento: 'credito' | 'debito';
  saldo_apos: number | null;
  hash_movimento: string;
  status: ExtratoStatus;
  created_at: string;
  updated_at: string;
}

export interface UseExtratoBancarioParams {
  contaBancariaId?: string;
  /** ISO 'YYYY-MM-DD' (inclusive). */
  dataInicio?: string;
  /** ISO 'YYYY-MM-DD' (inclusive). */
  dataFim?: string;
  status?: ExtratoStatus;
  /** Quando `false`, query fica desabilitada. */
  enabled?: boolean;
}

export function useExtratoBancario(params: UseExtratoBancarioParams = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const { contaBancariaId, dataInicio, dataFim, status, enabled = true } = params;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['extrato-bancario-v2', clienteId, contaBancariaId, dataInicio, dataFim, status],
    enabled: enabled && !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from('extrato_bancario_v2' as any)
        .select('*')
        .eq('cliente_id', clienteId!)
        .order('data_movimento', { ascending: false })
        .order('created_at', { ascending: false });
      if (contaBancariaId) q = q.eq('conta_bancaria_id', contaBancariaId);
      if (dataInicio) q = q.gte('data_movimento', dataInicio);
      if (dataFim) q = q.lte('data_movimento', dataFim);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as ExtratoMovimento[]) ?? [];
    },
  });

  return {
    movimentos: data ?? [],
    loading: isLoading,
    refetch,
  };
}
