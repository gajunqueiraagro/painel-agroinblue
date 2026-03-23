import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';
import type { CategoriaRebanho } from './usePastos';

export interface FechamentoPasto {
  id: string;
  pasto_id: string;
  fazenda_id: string;
  ano_mes: string;
  status: string;
  responsavel_nome: string | null;
  lote_mes: string | null;
  tipo_uso_mes: string | null;
  qualidade_mes: number | null;
  observacao_mes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FechamentoItem {
  id: string;
  fechamento_id: string;
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  lote: string | null;
  observacoes: string | null;
  origem_dado: string;
}

export function useFechamento() {
  const { fazendaAtual } = useFazenda();
  const [fechamentos, setFechamentos] = useState<FechamentoPasto[]>([]);
  const [loading, setLoading] = useState(false);

  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;

  const loadFechamentos = useCallback(async (anoMes: string) => {
    if (!fazendaId) { setFechamentos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('fechamento_pastos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .eq('ano_mes', anoMes);
    if (error) console.error(error);
    else setFechamentos(data || []);
    setLoading(false);
  }, [fazendaId]);

  const criarFechamento = useCallback(async (
    pastoId: string,
    anoMes: string,
    defaults?: { responsavel?: string; lote_mes?: string | null; tipo_uso_mes?: string | null; qualidade_mes?: number | null }
  ) => {
    if (!fazendaId) return null;
    const { data, error } = await supabase
      .from('fechamento_pastos')
      .insert({
        pasto_id: pastoId,
        fazenda_id: fazendaId,
        ano_mes: anoMes,
        responsavel_nome: defaults?.responsavel || null,
        lote_mes: defaults?.lote_mes || null,
        tipo_uso_mes: defaults?.tipo_uso_mes || null,
        qualidade_mes: defaults?.qualidade_mes || null,
      })
      .select()
      .single();
    if (error) { toast.error('Erro ao criar fechamento'); console.error(error); return null; }
    return data;
  }, [fazendaId]);

  const loadItens = useCallback(async (fechamentoId: string): Promise<FechamentoItem[]> => {
    const { data, error } = await supabase
      .from('fechamento_pasto_itens')
      .select('*')
      .eq('fechamento_id', fechamentoId);
    if (error) { console.error(error); return []; }
    return data || [];
  }, []);

  const salvarItens = useCallback(async (
    fechamentoId: string,
    itens: { categoria_id: string; quantidade: number; peso_medio_kg: number | null; lote: string | null; observacoes: string | null; origem_dado: string }[]
  ) => {
    // Delete existing then insert
    await supabase.from('fechamento_pasto_itens').delete().eq('fechamento_id', fechamentoId);
    const toInsert = itens.filter(i => i.quantidade > 0).map(i => ({ ...i, fechamento_id: fechamentoId }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('fechamento_pasto_itens').insert(toInsert);
      if (error) { toast.error('Erro ao salvar itens'); console.error(error); return false; }
    }
    toast.success('Fechamento salvo');
    return true;
  }, []);

  const fecharPasto = useCallback(async (fechamentoId: string) => {
    const { error } = await supabase.from('fechamento_pastos').update({ status: 'fechado' }).eq('id', fechamentoId);
    if (error) { toast.error('Erro ao fechar pasto'); return false; }
    toast.success('Pasto fechado');
    return true;
  }, []);

  const reabrirPasto = useCallback(async (fechamentoId: string) => {
    const { error } = await supabase.from('fechamento_pastos').update({ status: 'rascunho' }).eq('id', fechamentoId);
    if (error) { toast.error('Erro ao reabrir pasto'); return false; }
    toast.success('Pasto reaberto');
    return true;
  }, []);

  const copiarMesAnterior = useCallback(async (
    pastoId: string,
    anoMesAtual: string,
    categorias: CategoriaRebanho[]
  ): Promise<{ categoria_id: string; quantidade: number; peso_medio_kg: number | null; lote: string | null; observacoes: string | null; origem_dado: string }[]> => {
    // Calculate previous month
    const [y, m] = anoMesAtual.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;

    const { data: fechAnterior } = await supabase
      .from('fechamento_pastos')
      .select('id')
      .eq('pasto_id', pastoId)
      .eq('ano_mes', prev)
      .single();

    if (!fechAnterior) {
      toast.info('Sem dados do mês anterior');
      return categorias.map(c => ({ categoria_id: c.id, quantidade: 0, peso_medio_kg: null, lote: null, observacoes: null, origem_dado: 'manual' }));
    }

    const itens = await loadItens(fechAnterior.id);
    // Map to current format
    return categorias.map(c => {
      const found = itens.find(i => i.categoria_id === c.id);
      return {
        categoria_id: c.id,
        quantidade: found?.quantidade || 0,
        peso_medio_kg: found?.peso_medio_kg || null,
        lote: found?.lote || null,
        observacoes: null,
        origem_dado: found ? 'copiado_mes_anterior' : 'manual',
      };
    });
  }, [loadItens]);

  return { fechamentos, loading, loadFechamentos, criarFechamento, loadItens, salvarItens, fecharPasto, reabrirPasto, copiarMesAnterior };
}
