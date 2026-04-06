import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { BLOCOS_PRECO, type PrecoMercadoItem, type PrecoMercadoStatusData } from '@/hooks/usePrecoMercado';

export function useMetaPrecoMercado(anoMes: string) {
  const { user } = useAuth();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const [itens, setItens] = useState<PrecoMercadoItem[]>([]);
  const [statusMes, setStatusMes] = useState<PrecoMercadoStatusData>({ status: 'rascunho' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValidado = statusMes.status === 'validado';

  const loadData = useCallback(async () => {
    if (!anoMes || !clienteId) return;
    setLoading(true);
    try {
      const [{ data: precos, error: e1 }, { data: st, error: e2 }] = await Promise.all([
        supabase.from('meta_preco_mercado').select('*').eq('ano_mes', anoMes).eq('cliente_id', clienteId),
        supabase.from('meta_preco_mercado_status').select('*').eq('ano_mes', anoMes).eq('cliente_id', clienteId).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const merged = BLOCOS_PRECO.map(def => {
        const saved = (precos || []).find(
          (p: any) => p.bloco === def.bloco && p.categoria === def.categoria
        );
        return saved
          ? { ...def, id: saved.id, valor: Number(saved.valor), agio_perc: Number(saved.agio_perc) }
          : { ...def };
      });
      setItens(merged);

      if (st) {
        setStatusMes({
          status: st.status as any,
          validado_por: st.validado_por,
          validado_em: st.validado_em,
        });
      } else {
        setStatusMes({ status: 'rascunho' });
      }
    } catch (e: any) {
      console.error('Erro ao carregar preços previstos:', e);
    } finally {
      setLoading(false);
    }
  }, [anoMes, clienteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvar = useCallback(async (items: PrecoMercadoItem[], novoStatus: 'rascunho' | 'parcial' | 'validado') => {
    if (!anoMes || !clienteId) return;
    setSaving(true);
    try {
      await supabase.from('meta_preco_mercado').delete().eq('ano_mes', anoMes).eq('cliente_id', clienteId);

      const rows = items
        .filter(i => i.valor > 0 || i.agio_perc !== 0)
        .map(i => ({
          cliente_id: clienteId,
          ano_mes: anoMes,
          bloco: i.bloco,
          categoria: i.categoria,
          unidade: i.unidade,
          valor: i.valor,
          agio_perc: i.agio_perc,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('meta_preco_mercado').insert(rows);
        if (error) throw error;
      }

      const { error: sErr } = await supabase.from('meta_preco_mercado_status').upsert({
        cliente_id: clienteId,
        ano_mes: anoMes,
        status: novoStatus,
        validado_por: novoStatus === 'validado' ? user?.id || null : null,
        validado_em: novoStatus === 'validado' ? new Date().toISOString() : null,
      }, { onConflict: 'cliente_id,ano_mes' });
      if (sErr) throw sErr;

      const labels = { rascunho: 'Rascunho salvo', parcial: 'Salvo como parcial', validado: 'Preços previstos validados' };
      toast.success(labels[novoStatus]);
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [anoMes, clienteId, user, loadData]);

  const reabrir = useCallback(async () => {
    if (!anoMes || !clienteId) return;
    try {
      const { error } = await supabase.from('meta_preco_mercado_status').update({
        status: 'rascunho',
        validado_por: null,
        validado_em: null,
      }).eq('ano_mes', anoMes).eq('cliente_id', clienteId);
      if (error) throw error;
      toast.success('Mês reaberto para edição');
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [anoMes, clienteId, loadData]);

  const copiarMesAnterior = useCallback(async (anoMesAtual: string): Promise<PrecoMercadoItem[] | null> => {
    if (!clienteId) return null;
    const [aStr, mStr] = anoMesAtual.split('-');
    let aNum = parseInt(aStr);
    let mNum = parseInt(mStr);
    mNum -= 1;
    if (mNum < 1) { mNum = 12; aNum -= 1; }
    const mesAnterior = `${aNum}-${String(mNum).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('meta_preco_mercado')
      .select('*')
      .eq('ano_mes', mesAnterior)
      .eq('cliente_id', clienteId);
    if (error) { toast.error('Erro ao buscar mês anterior: ' + error.message); return null; }
    if (!data || data.length === 0) { toast.warning('Nenhum preço previsto no mês anterior.'); return null; }

    const merged = BLOCOS_PRECO.map(def => {
      const saved = data.find((p: any) => p.bloco === def.bloco && p.categoria === def.categoria);
      return saved
        ? { ...def, valor: Number(saved.valor), agio_perc: Number(saved.agio_perc) }
        : { ...def };
    });
    return merged;
  }, [clienteId]);

  return { itens, setItens, statusMes, loading, saving, isValidado, salvar, reabrir, copiarMesAnterior };
}
