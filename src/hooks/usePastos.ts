import { useState, useEffect, useCallback } from 'react';
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
  created_at: string;
  updated_at: string;
}

export interface CategoriaRebanho {
  id: string;
  codigo: string;
  nome: string;
  ordem_exibicao: number;
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
  const { fazendaAtual } = useFazenda();
  const [pastos, setPastos] = useState<Pasto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRebanho[]>([]);
  const [loading, setLoading] = useState(true);

  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;

  const loadCategorias = useCallback(async () => {
    const { data } = await supabase
      .from('categorias_rebanho')
      .select('*')
      .order('ordem_exibicao');
    if (data) setCategorias(data);
  }, []);

  const loadPastos = useCallback(async () => {
    if (!fazendaId) { setPastos([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('pastos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('nome');
    if (error) { toast.error('Erro ao carregar pastos'); console.error(error); }
    else setPastos(data || []);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { loadCategorias(); }, [loadCategorias]);
  useEffect(() => { loadPastos(); }, [loadPastos]);

  const criarPasto = useCallback(async (pasto: Omit<Pasto, 'id' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase.from('pastos').insert({ ...pasto, cliente_id: pasto.cliente_id || (pasto as any).fazenda_id ? fazendaAtual?.cliente_id! : '' } as any);
    if (error) { toast.error('Erro ao criar pasto'); console.error(error); return false; }
    toast.success('Pasto criado');
    await loadPastos();
    return true;
  }, [loadPastos]);

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

  return { pastos, categorias, loading, criarPasto, editarPasto, toggleAtivo, loadPastos };
}
