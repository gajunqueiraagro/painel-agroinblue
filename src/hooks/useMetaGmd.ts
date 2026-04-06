import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { CATEGORIAS, type Categoria } from '@/types/cattle';

export interface MetaGmdRow {
  categoria: Categoria;
  meses: Record<string, number>; // '01'..'12' -> gmd value
}

export function useMetaGmd(ano: string) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const [rows, setRows] = useState<MetaGmdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!fazendaId || !clienteId || fazendaId === '__global__') return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meta_gmd_mensal')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .like('ano_mes', `${ano}-%`);
      if (error) throw error;

      // Build rows from CATEGORIAS
      const built: MetaGmdRow[] = CATEGORIAS.map(cat => {
        const meses: Record<string, number> = {};
        for (let m = 1; m <= 12; m++) {
          const key = String(m).padStart(2, '0');
          const anoMes = `${ano}-${key}`;
          const found = (data || []).find(
            (d: any) => d.categoria === cat.value && d.ano_mes === anoMes
          );
          meses[key] = found ? Number(found.gmd_previsto) : 0;
        }
        return { categoria: cat.value, meses };
      });
      setRows(built);
    } catch (e: any) {
      console.error('Erro ao carregar GMD previsto:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, clienteId, ano]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateCell = useCallback((cat: Categoria, mes: string, val: number) => {
    setRows(prev => prev.map(r =>
      r.categoria === cat ? { ...r, meses: { ...r.meses, [mes]: val } } : r
    ));
  }, []);

  const salvar = useCallback(async () => {
    if (!fazendaId || !clienteId || fazendaId === '__global__') return;
    setSaving(true);
    try {
      // Delete existing for this fazenda+year
      for (let m = 1; m <= 12; m++) {
        const anoMes = `${ano}-${String(m).padStart(2, '0')}`;
        await supabase.from('meta_gmd_mensal').delete()
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes);
      }

      // Insert non-zero values
      const inserts: any[] = [];
      for (const row of rows) {
        for (let m = 1; m <= 12; m++) {
          const key = String(m).padStart(2, '0');
          const val = row.meses[key] || 0;
          if (val > 0) {
            inserts.push({
              fazenda_id: fazendaId,
              cliente_id: clienteId,
              ano_mes: `${ano}-${key}`,
              categoria: row.categoria,
              gmd_previsto: val,
            });
          }
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('meta_gmd_mensal').insert(inserts);
        if (error) throw error;
      }

      toast.success('GMD previsto salvo com sucesso');
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [fazendaId, clienteId, ano, rows, loadData]);

  return { rows, setRows, loading, saving, updateCell, salvar };
}
