import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PrecoMercadoItem {
  id?: string;
  bloco: string;
  categoria: string;
  unidade: string;
  valor: number;
  agio_perc: number;
}

export interface PrecoMercadoStatusData {
  status: 'rascunho' | 'parcial' | 'validado';
  validado_por?: string | null;
  validado_em?: string | null;
}

// Definição dos blocos e categorias padrão
export const BLOCOS_PRECO: PrecoMercadoItem[] = [
  // Bloco Frigorífico no MS
  { bloco: 'frigorifico', categoria: 'Boi Gordo', unidade: 'R$/@', valor: 0, agio_perc: 0 },
  { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'R$/@', valor: 0, agio_perc: 0 },
  { bloco: 'frigorifico', categoria: 'Novilha', unidade: 'R$/@', valor: 0, agio_perc: 0 },
  // Bloco Gado Magro - Machos
  { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
  { bloco: 'magro_macho', categoria: '250 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
  { bloco: 'magro_macho', categoria: 'Garrotes 350 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
  // Bloco Gado Magro - Fêmeas
  { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
  { bloco: 'magro_femea', categoria: '250 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
  { bloco: 'magro_femea', categoria: 'Novilhas 300 kg média', unidade: 'R$/kg', valor: 0, agio_perc: 0 },
];

export function usePrecoMercado(anoMes: string) {
  const { user } = useAuth();
  const [itens, setItens] = useState<PrecoMercadoItem[]>([]);
  const [statusMes, setStatusMes] = useState<PrecoMercadoStatusData>({ status: 'rascunho' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValidado = statusMes.status === 'validado';

  const loadData = useCallback(async () => {
    if (!anoMes) return;
    setLoading(true);
    try {
      const [{ data: precos, error: e1 }, { data: st, error: e2 }] = await Promise.all([
        supabase.from('preco_mercado').select('*').eq('ano_mes', anoMes),
        supabase.from('preco_mercado_status').select('*').eq('ano_mes', anoMes).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // Merge saved data with defaults
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
      console.error('Erro ao carregar preços de mercado:', e);
    } finally {
      setLoading(false);
    }
  }, [anoMes]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvar = useCallback(async (items: PrecoMercadoItem[], novoStatus: 'rascunho' | 'parcial' | 'validado') => {
    if (!anoMes) return;
    setSaving(true);
    try {
      // Delete existing and re-insert
      await supabase.from('preco_mercado').delete().eq('ano_mes', anoMes);

      const rows = items
        .filter(i => i.valor > 0 || i.agio_perc !== 0)
        .map(i => ({
          ano_mes: anoMes,
          bloco: i.bloco,
          categoria: i.categoria,
          unidade: i.unidade,
          valor: i.valor,
          agio_perc: i.agio_perc,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('preco_mercado').insert(rows);
        if (error) throw error;
      }

      // Upsert status
      const { error: sErr } = await supabase.from('preco_mercado_status').upsert({
        ano_mes: anoMes,
        status: novoStatus,
        validado_por: novoStatus === 'validado' ? user?.id || null : null,
        validado_em: novoStatus === 'validado' ? new Date().toISOString() : null,
      }, { onConflict: 'ano_mes' });
      if (sErr) throw sErr;

      const labels = { rascunho: 'Rascunho salvo', parcial: 'Salvo como parcial', validado: 'Preços validados com sucesso' };
      toast.success(labels[novoStatus]);
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [anoMes, user, loadData]);

  const reabrir = useCallback(async () => {
    if (!anoMes) return;
    try {
      const { error } = await supabase.from('preco_mercado_status').update({
        status: 'rascunho',
        validado_por: null,
        validado_em: null,
      }).eq('ano_mes', anoMes);
      if (error) throw error;
      toast.success('Mês reaberto para edição');
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [anoMes, loadData]);

  const copiarMesAnterior = useCallback(async (anoMesAtual: string): Promise<PrecoMercadoItem[] | null> => {
    const [aStr, mStr] = anoMesAtual.split('-');
    let aNum = parseInt(aStr);
    let mNum = parseInt(mStr);
    mNum -= 1;
    if (mNum < 1) { mNum = 12; aNum -= 1; }
    const mesAnterior = `${aNum}-${String(mNum).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('preco_mercado')
      .select('*')
      .eq('ano_mes', mesAnterior);
    if (error) { toast.error('Erro ao buscar mês anterior: ' + error.message); return null; }
    if (!data || data.length === 0) { toast.warning('Nenhum preço encontrado no mês anterior.'); return null; }

    const merged = BLOCOS_PRECO.map(def => {
      const saved = data.find((p: any) => p.bloco === def.bloco && p.categoria === def.categoria);
      return saved
        ? { ...def, valor: Number(saved.valor), agio_perc: Number(saved.agio_perc) }
        : { ...def };
    });
    return merged;
  }, []);

  return { itens, setItens, statusMes, loading, saving, isValidado, salvar, reabrir, copiarMesAnterior };
}
