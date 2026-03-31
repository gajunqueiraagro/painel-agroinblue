import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PastoMovimentacao {
  id: string;
  fazenda_id: string;
  cliente_id: string;
  pasto_origem_id: string | null;
  pasto_destino_id: string | null;
  data: string;
  tipo: string;
  quantidade: number;
  categoria: string | null;
  peso_medio_kg: number | null;
  referencia_rebanho: string | null;
  observacoes: string | null;
  registrado_por: string | null;
  created_at: string;
  lote_id: string | null;
  // Joined names for display
  pasto_origem_nome?: string;
  pasto_destino_nome?: string;
}

export const TIPOS_MOV_PASTO = [
  { value: 'entrada', label: 'Entrada', icon: '📥', group: 'Entrada' },
  { value: 'saida', label: 'Saída', icon: '📤', group: 'Saída' },
  { value: 'transferencia', label: 'Transferência entre Pastos', icon: '🔄', group: 'Transferência' },
  { value: 'compra', label: 'Compra', icon: '🛒', group: 'Entrada' },
  { value: 'venda', label: 'Venda', icon: '💰', group: 'Saída' },
  { value: 'abate', label: 'Abate', icon: '🔪', group: 'Saída' },
  { value: 'morte', label: 'Morte', icon: '💀', group: 'Saída' },
  { value: 'consumo', label: 'Consumo', icon: '🍖', group: 'Saída' },
] as const;

export type TipoMovPasto = typeof TIPOS_MOV_PASTO[number]['value'];

export function usePastoMovimentacoes() {
  const { user } = useAuth();
  const [movimentacoes, setMovimentacoes] = useState<PastoMovimentacao[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMovimentacoes = useCallback(async (pastoId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pasto_movimentacoes')
      .select('*')
      .or(`pasto_origem_id.eq.${pastoId},pasto_destino_id.eq.${pastoId}`)
      .order('data', { ascending: false })
      .limit(50);

    if (error) { console.error(error); setLoading(false); return; }

    // Enrich with pasto names
    const pastoIds = new Set<string>();
    (data || []).forEach(m => {
      if (m.pasto_origem_id) pastoIds.add(m.pasto_origem_id);
      if (m.pasto_destino_id) pastoIds.add(m.pasto_destino_id);
    });

    let pastoNames = new Map<string, string>();
    if (pastoIds.size > 0) {
      const { data: pastos } = await supabase
        .from('pastos')
        .select('id, nome')
        .in('id', Array.from(pastoIds));
      (pastos || []).forEach(p => pastoNames.set(p.id, p.nome));
    }

    setMovimentacoes((data || []).map(m => ({
      ...m,
      pasto_origem_nome: m.pasto_origem_id ? pastoNames.get(m.pasto_origem_id) : undefined,
      pasto_destino_nome: m.pasto_destino_id ? pastoNames.get(m.pasto_destino_id) : undefined,
    })));
    setLoading(false);
  }, []);

  const registrarMovimentacao = useCallback(async (params: {
    fazenda_id: string;
    cliente_id: string;
    pasto_origem_id?: string | null;
    pasto_destino_id?: string | null;
    data: string;
    tipo: string;
    quantidade: number;
    categoria?: string | null;
    peso_medio_kg?: number | null;
    referencia_rebanho?: string | null;
    observacoes?: string | null;
  }) => {
    const { error } = await supabase.from('pasto_movimentacoes').insert({
      ...params,
      registrado_por: user?.id || null,
    });
    if (error) { toast.error('Erro ao registrar movimentação'); console.error(error); return false; }
    toast.success('Movimentação registrada');
    return true;
  }, [user]);

  return { movimentacoes, loading, loadMovimentacoes, registrarMovimentacao };
}
