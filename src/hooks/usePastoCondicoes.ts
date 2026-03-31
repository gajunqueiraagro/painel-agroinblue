import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PastoCondicao {
  id: string;
  pasto_id: string;
  fazenda_id: string;
  cliente_id: string;
  data_registro: string;
  condicao: string;
  altura_pasto_cm: number | null;
  cobertura_perc: number | null;
  observacoes: string | null;
  registrado_por: string | null;
  created_at: string;
}

export function usePastoCondicoes() {
  const { user } = useAuth();
  const [condicoes, setCondicoes] = useState<PastoCondicao[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCondicoes = useCallback(async (pastoId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pasto_condicoes')
      .select('*')
      .eq('pasto_id', pastoId)
      .order('data_registro', { ascending: false })
      .limit(20);
    if (error) console.error(error);
    else setCondicoes(data || []);
    setLoading(false);
  }, []);

  const registrarCondicao = useCallback(async (params: {
    pasto_id: string;
    fazenda_id: string;
    cliente_id: string;
    condicao: string;
    altura_pasto_cm?: number | null;
    cobertura_perc?: number | null;
    observacoes?: string | null;
  }) => {
    const { error } = await supabase.from('pasto_condicoes').insert({
      ...params,
      registrado_por: user?.id || null,
    });
    if (error) { toast.error('Erro ao registrar condição'); console.error(error); return false; }
    toast.success('Condição registrada');
    await loadCondicoes(params.pasto_id);
    return true;
  }, [user, loadCondicoes]);

  return { condicoes, loading, loadCondicoes, registrarCondicao };
}
