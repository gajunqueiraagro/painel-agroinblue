import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface Pasto {
  id: string;
  fazenda_id: string;
  nome: string;
  lote_padrao: string | null;
  area_produtiva_ha: number | null;
  tipo_uso: string;
  qualidade: number | null;
  entra_conciliacao: boolean;
  ativo: boolean;
  observacoes: string | null;
  ordem_exibicao: number;
  data_inicio: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoriaRebanho {
  id: string;
  codigo: string;
  nome: string;
  ordem_exibicao: number;
}

/**
 * Verifica se um pasto está visível/ativo em um determinado mês,
 * considerando o campo `data_inicio` (data a partir da qual o pasto entra no sistema).
 *
 * Regra: incluir pasto APENAS se:
 *   - data_inicio IS NULL (sem restrição), OU
 *   - data_inicio <= primeiro dia do anoMes selecionado
 *
 * @param pasto Objeto de pasto (precisa ter `data_inicio`)
 * @param anoMes String no formato 'YYYY-MM'
 */
export function isPastoAtivoNoMes(pasto: { data_inicio?: string | null }, anoMes: string): boolean {
  if (!pasto.data_inicio) return true;
  const primeiroDiaMes = `${anoMes}-01`;
  return pasto.data_inicio <= primeiroDiaMes;
}

export const TIPOS_USO = [
  { value: 'cria', label: 'Cria' },
  { value: 'recria', label: 'Recria' },
  { value: 'engorda', label: 'Engorda' },
  { value: 'reforma_pecuaria', label: 'Reforma Pecuária' },
  { value: 'agricultura', label: 'Agricultura' },
  { value: 'app', label: 'APP' },
  { value: 'reserva_legal', label: 'Reserva Legal' },
  { value: 'benfeitorias', label: 'Benfeitorias' },
];

export function usePastos() {
  const { fazendaAtual, fazendas: todasFazendas } = useFazenda();
  const [pastos, setPastos] = useState<Pasto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRebanho[]>([]);
  const [loading, setLoading] = useState(true);

  const isGlobal = fazendaAtual?.id === '__global__';
  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;

  const loadCategorias = useCallback(async () => {
    const { data } = await supabase
      .from('categorias_rebanho')
      .select('*')
      .order('ordem_exibicao');
    if (data) setCategorias(data);
  }, []);

  const globalFazendaIds = useMemo(() => {
    if (!isGlobal) return [];
    return todasFazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false).map(f => f.id);
  }, [isGlobal, todasFazendas]);

  const loadPastos = useCallback(async () => {
    if (isGlobal) {
      if (globalFazendaIds.length === 0) { setPastos([]); setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from('pastos')
        .select('*')
        .in('fazenda_id', globalFazendaIds)
        .order('ordem_exibicao')
        .order('nome');
      if (error) { toast.error('Erro ao carregar pastos'); console.error(error); }
      else setPastos(data || []);
      setLoading(false);
      return;
    }
    if (!fazendaId) { setPastos([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('pastos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('ordem_exibicao')
      .order('nome');
    if (error) { toast.error('Erro ao carregar pastos'); console.error(error); }
    else setPastos(data || []);
    setLoading(false);
  }, [fazendaId, isGlobal, globalFazendaIds]);

  useEffect(() => { loadCategorias(); }, [loadCategorias]);
  useEffect(() => { loadPastos(); }, [loadPastos]);

  const criarPasto = useCallback(async (pasto: Omit<Pasto, 'id' | 'created_at' | 'updated_at'>) => {
    const maxOrdem = pastos.length > 0 ? Math.max(...pastos.map(p => p.ordem_exibicao || 0)) : 0;
    const { error } = await supabase.from('pastos').insert({
      ...pasto,
      ordem_exibicao: maxOrdem + 1,
      cliente_id: fazendaAtual?.cliente_id!,
    } as any);
    if (error) { toast.error('Erro ao criar pasto'); console.error(error); return false; }
    toast.success('Pasto criado');
    await loadPastos();
    return true;
  }, [loadPastos, pastos, fazendaAtual]);

  const editarPasto = useCallback(async (id: string, updates: Partial<Pasto>) => {
    const { error } = await supabase.from('pastos').update(updates).eq('id', id);
    if (error) { toast.error('Erro ao atualizar pasto'); console.error(error); return false; }
    toast.success('Pasto atualizado');
    await loadPastos();
    return true;
  }, [loadPastos]);

  const toggleAtivo = useCallback(async (id: string, ativo: boolean) => {
    return editarPasto(id, { ativo });
  }, [editarPasto]);

  const reorderPastos = useCallback(async (orderedIds: string[]) => {
    // Optimistic update
    setPastos(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      return orderedIds.map((id, i) => ({ ...map.get(id)!, ordem_exibicao: i })).filter(Boolean);
    });

    // Batch update in DB
    const updates = orderedIds.map((id, i) =>
      supabase.from('pastos').update({ ordem_exibicao: i } as any).eq('id', id)
    );
    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);
    if (hasError) {
      toast.error('Erro ao salvar ordem');
      await loadPastos();
    }
  }, [loadPastos]);

  return { pastos, categorias, loading, criarPasto, editarPasto, toggleAtivo, loadPastos, reorderPastos };
}
