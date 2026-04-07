/**
 * Hook para gerenciar preços META por categoria de rebanho.
 * Fonte única de precificação para o cenário META.
 * Tabelas: meta_valor_rebanho_precos, meta_valor_rebanho_status
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';

export interface MetaPrecoCategoria {
  categoria: string;
  preco_arroba: number;
}

export interface MetaPrecoStatus {
  status: 'rascunho' | 'parcial' | 'validado';
  validado_por?: string | null;
  validado_em?: string | null;
}

export function useMetaValorRebanhoPrecos(anoMes: string) {
  const { user } = useAuth();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const [precos, setPrecos] = useState<MetaPrecoCategoria[]>([]);
  const [statusMes, setStatusMes] = useState<MetaPrecoStatus>({ status: 'rascunho' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValidado = statusMes.status === 'validado';

  const loadData = useCallback(async () => {
    if (!anoMes || !clienteId) return;
    setLoading(true);
    try {
      const [{ data: precosData, error: e1 }, { data: st, error: e2 }] = await Promise.all([
        supabase.from('meta_valor_rebanho_precos' as any).select('*').eq('cliente_id', clienteId).eq('ano_mes', anoMes),
        supabase.from('meta_valor_rebanho_status' as any).select('*').eq('cliente_id', clienteId).eq('ano_mes', anoMes).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      setPrecos(
        ((precosData as any[]) || []).map((p: any) => ({
          categoria: p.categoria,
          preco_arroba: Number(p.preco_arroba) || 0,
        }))
      );

      if (st) {
        setStatusMes({
          status: (st as any).status as any,
          validado_por: (st as any).validado_por,
          validado_em: (st as any).validado_em,
        });
      } else {
        setStatusMes({ status: 'rascunho' });
      }
    } catch (e: any) {
      console.error('Erro ao carregar preços META:', e);
    } finally {
      setLoading(false);
    }
  }, [anoMes, clienteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvar = useCallback(async (
    items: MetaPrecoCategoria[],
    novoStatus: 'rascunho' | 'parcial' | 'validado',
  ) => {
    if (!anoMes || !clienteId) return;
    setSaving(true);
    try {
      await supabase.from('meta_valor_rebanho_precos' as any).delete().eq('cliente_id', clienteId).eq('ano_mes', anoMes);

      const rows = items
        .filter(i => i.preco_arroba > 0)
        .map(i => ({
          cliente_id: clienteId,
          ano_mes: anoMes,
          categoria: i.categoria,
          preco_arroba: i.preco_arroba,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('meta_valor_rebanho_precos' as any).insert(rows);
        if (error) throw error;
      }

      const { error: sErr } = await supabase.from('meta_valor_rebanho_status' as any).upsert({
        cliente_id: clienteId,
        ano_mes: anoMes,
        status: novoStatus,
        validado_por: novoStatus === 'validado' ? user?.id || null : null,
        validado_em: novoStatus === 'validado' ? new Date().toISOString() : null,
      }, { onConflict: 'cliente_id,ano_mes' });
      if (sErr) throw sErr;

      const labels = { rascunho: 'Rascunho salvo', parcial: 'Salvo como parcial', validado: 'Preços META validados' };
      toast.success(labels[novoStatus]);
      await loadData();
    } catch (e: any) {
      console.error('Erro ao salvar preços META:', e);
      toast.error('Erro ao salvar: ' + e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [anoMes, clienteId, user, loadData]);

  const reabrir = useCallback(async () => {
    if (!anoMes || !clienteId) return;
    try {
      const { error } = await supabase.from('meta_valor_rebanho_status' as any).update({
        status: 'rascunho',
        validado_por: null,
        validado_em: null,
      }).eq('cliente_id', clienteId).eq('ano_mes', anoMes);
      if (error) throw error;
      toast.success('Mês reaberto para edição');
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [anoMes, clienteId, loadData]);

  const copiarMesAnterior = useCallback(async (anoMesAtual: string): Promise<MetaPrecoCategoria[] | null> => {
    if (!clienteId) return null;
    const [aStr, mStr] = anoMesAtual.split('-');
    let aNum = parseInt(aStr);
    let mNum = parseInt(mStr);
    mNum -= 1;
    if (mNum < 1) { mNum = 12; aNum -= 1; }
    const mesAnterior = `${aNum}-${String(mNum).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('meta_valor_rebanho_precos' as any)
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('ano_mes', mesAnterior);
    if (error) { toast.error('Erro ao buscar mês anterior: ' + error.message); return null; }
    if (!data || data.length === 0) { toast.warning('Nenhum preço META no mês anterior.'); return null; }

    return (data as any[]).map((p: any) => ({
      categoria: p.categoria,
      preco_arroba: Number(p.preco_arroba) || 0,
    }));
  }, [clienteId]);

  // Load all months status for year (for month ruler)
  const [statusAno, setStatusAno] = useState<Record<string, string>>({});
  
  const loadStatusAno = useCallback(async (ano: string) => {
    if (!clienteId) return;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const { data, error } = await supabase
      .from('meta_valor_rebanho_status' as any)
      .select('ano_mes, status')
      .eq('cliente_id', clienteId)
      .in('ano_mes', meses);
    if (error) return;
    const map: Record<string, string> = {};
    ((data as any[]) || []).forEach((r: any) => { map[r.ano_mes] = r.status; });
    setStatusAno(map);
  }, [clienteId]);

  return {
    precos,
    statusMes,
    loading,
    saving,
    isValidado,
    salvar,
    reabrir,
    copiarMesAnterior,
    statusAno,
    loadStatusAno,
  };
}
