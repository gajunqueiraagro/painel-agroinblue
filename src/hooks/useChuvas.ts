import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface Chuva {
  id: string;
  fazendaId: string;
  data: string; // YYYY-MM-DD
  milimetros: number;
  observacao?: string;
}

export function useChuvas() {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const [chuvas, setChuvas] = useState<Chuva[]>([]);
  const [loading, setLoading] = useState(true);

  const fazendaId = fazendaAtual?.id;

  const loadData = useCallback(async () => {
    if (!fazendaId) { setChuvas([]); setLoading(false); return; }
    setLoading(true);

    const query = isGlobal
      ? supabase.from('chuvas').select('*').in('fazenda_id', fazendas.map(f => f.id))
      : supabase.from('chuvas').select('*').eq('fazenda_id', fazendaId);

    const { data, error } = await query.order('data', { ascending: false });

    if (data) {
      setChuvas(data.map((c: any) => ({
        id: c.id,
        fazendaId: c.fazenda_id,
        data: c.data,
        milimetros: Number(c.milimetros),
        observacao: c.observacao ?? undefined,
      })));
    }
    if (error) toast.error('Erro ao carregar chuvas');
    setLoading(false);
  }, [fazendaId, isGlobal, fazendas]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvarChuva = async (data: string, milimetros: number, observacao?: string) => {
    if (!fazendaId || fazendaId === '__global__') return;

    const { error } = await supabase.from('chuvas').upsert({
      fazenda_id: fazendaId,
      data,
      milimetros,
      observacao: observacao || null,
    }, { onConflict: 'fazenda_id,data' });

    if (error) {
      toast.error('Erro ao salvar chuva');
    } else {
      toast.success('Chuva registrada');
      await loadData();
    }
  };

  const removerChuva = async (id: string) => {
    const { error } = await supabase.from('chuvas').delete().eq('id', id);
    if (!error) {
      setChuvas(prev => prev.filter(c => c.id !== id));
    }
  };

  return { chuvas, loading, salvarChuva, removerChuva, loadData };
}
