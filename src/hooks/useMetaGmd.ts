import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
  const [saving, setSaving] = useState(false);

  const { data: queryData, isLoading: loading, refetch } = useQuery({
    queryKey: ['meta-gmd', clienteId, fazendaId ?? 'global', ano],
    enabled: !!clienteId,
    staleTime: 30_000,
    // Mantém dados anteriores na troca de fazenda/cliente/ano para evitar flash vazio.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MetaGmdRow[]> => {
      const isGlobal = !fazendaId || fazendaId === '__global__';
      let query = supabase
        .from('meta_gmd_mensal')
        .select('*')
        .eq('cliente_id', clienteId!)
        .like('ano_mes', `${ano}-%`);
      if (!isGlobal) {
        query = query.eq('fazenda_id', fazendaId);
      }
      const { data, error } = await query;
      if (error) throw error;

      // Build rows from CATEGORIAS
      // Em modo Global usamos a MÉDIA simples dos valores > 0 por categoria/mês
      // (GMD é taxa — somar não faz sentido).
      return CATEGORIAS.map(cat => {
        const meses: Record<string, number> = {};
        for (let m = 1; m <= 12; m++) {
          const key = String(m).padStart(2, '0');
          const anoMes = `${ano}-${key}`;
          const matches = (data || []).filter(
            (d: any) => d.categoria === cat.value && d.ano_mes === anoMes
          );
          if (isGlobal) {
            const vals = matches.map((d: any) => Number(d.gmd_previsto)).filter(v => v > 0);
            meses[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          } else {
            meses[key] = matches.length ? Number(matches[0].gmd_previsto) : 0;
          }
        }
        return { categoria: cat.value, meses };
      });
    },
  });

  // queryData fica na ref — evita loop de re-render ao chamar setRows
  const queryDataRef = useRef(queryData);
  queryDataRef.current = queryData;
  useEffect(() => {
    if (queryDataRef.current) setRows(queryDataRef.current);
  }, [loading, clienteId, fazendaId, ano]);

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
      await refetch();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }, [fazendaId, clienteId, ano, rows, refetch]);

  return { rows, setRows, loading, saving, updateCell, salvar };
}
