import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PrecoCategoria {
  categoria: string;
  preco_kg: number;
}

export interface FechamentoStatus {
  status: 'aberto' | 'fechado';
  fechado_por?: string | null;
  fechado_em?: string | null;
}

export function useValorRebanho(anoMes: string) {
  const { fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const fazendaId = fazendaAtual?.id;
  const [precos, setPrecos] = useState<PrecoCategoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fechamento, setFechamento] = useState<FechamentoStatus>({ status: 'aberto' });

  const isFechado = fechamento.status === 'fechado';

  // Check if user can edit (dono or gerente)
  const papel = fazendaAtual?.papel;
  const isAdmin = papel === 'dono' || papel === 'gerente';

  // Load fechamento status
  const loadFechamentoStatus = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') return;
    try {
      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('status, fechado_por, fechado_em')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setFechamento({
          status: data.status as 'aberto' | 'fechado',
          fechado_por: data.fechado_por,
          fechado_em: data.fechado_em,
        });
      } else {
        setFechamento({ status: 'aberto' });
      }
    } catch {
      setFechamento({ status: 'aberto' });
    }
  }, [fazendaId, anoMes]);

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

  // Load December prices of previous year (base for "sem efeito de mercado")
  const loadPrecosBaseAnual = useCallback(async (): Promise<PrecoCategoria[]> => {
    if (!fazendaId || fazendaId === '__global__') return [];
    try {
      const ano = Number(anoMes.split('-')[0]);
      const dezAnoAnterior = `${ano - 1}-12`;

      const { data, error } = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', dezAnoAnterior);

      if (error) throw error;
      return (data || []) as PrecoCategoria[];
    } catch {
      return [];
    }
  }, [fazendaId, anoMes]);

  useEffect(() => {
    loadPrecos();
    loadFechamentoStatus();
  }, [loadPrecos, loadFechamentoStatus]);

  // Save/upsert prices and close the month
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

      // Upsert fechamento status to 'fechado'
      const { error: fErr } = await supabase
        .from('valor_rebanho_fechamento')
        .upsert({
          fazenda_id: fazendaId,
          ano_mes: anoMes,
          status: 'fechado',
          fechado_por: user?.id || null,
          fechado_em: new Date().toISOString(),
        }, { onConflict: 'fazenda_id,ano_mes' });

      if (fErr) throw fErr;

      toast.success('Valores salvos e fechamento registrado');
      await loadPrecos();
      await loadFechamentoStatus();
    } catch (e: any) {
      toast.error('Erro ao salvar preços: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [fazendaId, anoMes, user, loadPrecos, loadFechamentoStatus]);

  // Reopen the month (admin only)
  const reabrirFechamento = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__' || !isAdmin) return;
    try {
      const { error } = await supabase
        .from('valor_rebanho_fechamento')
        .update({
          status: 'aberto',
          reaberto_por: user?.id || null,
          reaberto_em: new Date().toISOString(),
        })
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (error) throw error;
      toast.success('Fechamento reaberto para edição');
      await loadFechamentoStatus();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [fazendaId, anoMes, user, isAdmin, loadFechamentoStatus]);

  return {
    precos,
    loading,
    saving,
    salvarPrecos,
    loadPrecosMesAnterior,
    loadPrecosBaseAnual,
    isFechado,
    fechamento,
    isAdmin,
    reabrirFechamento,
  };
}
