import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface PrecoCategoria {
  categoria: string;
  preco_kg: number;
}

export function useValorRebanho(anoMes: string) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const [precos, setPrecos] = useState<PrecoCategoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load prices for the month
  const loadPrecos = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (error) throw error;
      setPrecos((data || []) as PrecoCategoria[]);
    } catch (e: any) {
      console.error('Erro ao carregar preços:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes]);

  // Load previous month prices as suggestion
  const loadPrecosMesAnterior = useCallback(async (): Promise<PrecoCategoria[]> => {
    if (!fazendaId || fazendaId === '__global__') return [];
    try {
      // Parse anoMes to get previous month
      const [anoStr, mesStr] = anoMes.split('-');
      let ano = Number(anoStr);
      let mes = Number(mesStr) - 1;
      if (mes < 1) { mes = 12; ano--; }
      const prevAnoMes = `${ano}-${String(mes).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', prevAnoMes);

      if (error) throw error;
      return (data || []) as PrecoCategoria[];
    } catch {
      return [];
    }
  }, [fazendaId, anoMes]);

  useEffect(() => {
    loadPrecos();
  }, [loadPrecos]);

  // Save/upsert prices for all categories
  const salvarPrecos = useCallback(async (items: PrecoCategoria[]) => {
    if (!fazendaId || fazendaId === '__global__') return;
    setSaving(true);
    try {
      // Delete existing for this month, then insert
      await supabase
        .from('valor_rebanho_mensal')
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      const rows = items
        .filter(i => i.preco_kg > 0)
        .map(i => ({
          fazenda_id: fazendaId,
          ano_mes: anoMes,
          categoria: i.categoria,
          preco_kg: i.preco_kg,
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('valor_rebanho_mensal')
          .insert(rows);
        if (error) throw error;
      }

      toast.success('Preços salvos com sucesso');
      await loadPrecos();
    } catch (e: any) {
      toast.error('Erro ao salvar preços: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [fazendaId, anoMes, loadPrecos]);

  return { precos, loading, saving, salvarPrecos, loadPrecosMesAnterior };
}
