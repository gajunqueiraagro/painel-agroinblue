import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
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

// Re-export da fonte única — NÃO definir lista local.
// Fonte oficial: src/lib/pastos/tiposUso.ts
export { TIPOS_USO_OPTIONS_FLAT as TIPOS_USO } from '@/lib/pastos/tiposUso';

// ─────────────────────────────────────────────────────────────────────────────
// Cache module-level — dedupe de fetches simultâneos entre instâncias do hook.
// Categorias e pastos são keyed por clienteId (e, no caso de pastos, escopo).
// Cada chave guarda:
//   - Cache resolvido: dado pronto, retornado sincronamente para próximas leituras.
//   - Promise em vôo: para que N instâncias chamando ao mesmo tempo aguardem o
//     mesmo fetch, em vez de disparar N queries paralelas.
// Erros: a promise é removida do Map em finally → próxima leitura tenta de novo.
// Mutações (criar/editar/toggle/reorder) limpam APENAS o cache de pastos do
// cliente afetado — categorias não mudam por essas operações.
// ─────────────────────────────────────────────────────────────────────────────

const categoriasCacheByCliente = new Map<string, CategoriaRebanho[]>();
const categoriasPromiseByCliente = new Map<string, Promise<CategoriaRebanho[]>>();

const pastosCacheByKey = new Map<string, Pasto[]>();
const pastosPromiseByKey = new Map<string, Promise<Pasto[]>>();

async function fetchCategoriasShared(clienteId: string): Promise<CategoriaRebanho[]> {
  const cached = categoriasCacheByCliente.get(clienteId);
  if (cached) return cached;
  const inFlight = categoriasPromiseByCliente.get(clienteId);
  if (inFlight) return inFlight;
  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('categorias_rebanho')
        .select('*')
        .order('ordem_exibicao');
      if (error) throw error;
      const result = data ?? [];
      categoriasCacheByCliente.set(clienteId, result);
      return result;
    } finally {
      categoriasPromiseByCliente.delete(clienteId);
    }
  })();
  categoriasPromiseByCliente.set(clienteId, p);
  return p;
}

async function fetchPastosShared(
  cacheKey: string,
  isGlobal: boolean,
  fazendaId: string | undefined,
  globalFazendaIds: string[],
): Promise<Pasto[]> {
  const cached = pastosCacheByKey.get(cacheKey);
  if (cached) return cached;
  const inFlight = pastosPromiseByKey.get(cacheKey);
  if (inFlight) return inFlight;
  const p = (async () => {
    try {
      let query = supabase.from('pastos').select('*');
      if (isGlobal) {
        if (globalFazendaIds.length === 0) return [];
        query = query.in('fazenda_id', globalFazendaIds);
      } else if (fazendaId) {
        query = query.eq('fazenda_id', fazendaId);
      } else {
        return [];
      }
      const { data, error } = await query.order('ordem_exibicao').order('nome');
      if (error) {
        toast.error('Erro ao carregar pastos');
        console.error(error);
        throw error;
      }
      const result = data ?? [];
      pastosCacheByKey.set(cacheKey, result);
      return result;
    } finally {
      pastosPromiseByKey.delete(cacheKey);
    }
  })();
  pastosPromiseByKey.set(cacheKey, p);
  return p;
}

function invalidatePastosForCliente(clienteId: string) {
  const prefix = `${clienteId}|`;
  for (const key of [...pastosCacheByKey.keys()]) {
    if (key.startsWith(prefix)) pastosCacheByKey.delete(key);
  }
  for (const key of [...pastosPromiseByKey.keys()]) {
    if (key.startsWith(prefix)) pastosPromiseByKey.delete(key);
  }
}

export function usePastos() {
  const { fazendaAtual, fazendas: todasFazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const [pastos, setPastos] = useState<Pasto[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRebanho[]>([]);
  const [loading, setLoading] = useState(true);

  const isGlobal = fazendaAtual?.id === '__global__';
  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const clienteId = clienteAtual?.id;

  const globalFazendaIds = useMemo(() => {
    if (!isGlobal) return [];
    return todasFazendas
      .filter(f => f.id !== '__global__' && f.tem_pecuaria !== false)
      .map(f => f.id);
  }, [isGlobal, todasFazendas]);

  const pastosCacheKey = useMemo<string | null>(() => {
    if (!clienteId) return null;
    if (isGlobal) {
      const ids = [...globalFazendaIds].sort().join(',');
      return `${clienteId}|global:${ids}`;
    }
    if (fazendaId) return `${clienteId}|fz:${fazendaId}`;
    return null;
  }, [clienteId, isGlobal, fazendaId, globalFazendaIds]);

  const loadCategorias = useCallback(async () => {
    if (!clienteId) return;
    try {
      const data = await fetchCategoriasShared(clienteId);
      setCategorias(data);
    } catch {
      // Erro já logado dentro do fetch compartilhado; mantém estado anterior.
    }
  }, [clienteId]);

  const loadPastos = useCallback(async () => {
    if (!pastosCacheKey) {
      setPastos([]);
      setLoading(false);
      return;
    }
    // Cache resolvido: serve sincronamente, sem flicker de loading.
    const cached = pastosCacheByKey.get(pastosCacheKey);
    if (cached) {
      setPastos(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchPastosShared(pastosCacheKey, isGlobal, fazendaId, globalFazendaIds);
      setPastos(data);
    } catch {
      // Toast/log já feitos dentro de fetchPastosShared.
    } finally {
      setLoading(false);
    }
  }, [pastosCacheKey, isGlobal, fazendaId, globalFazendaIds]);

  useEffect(() => { loadCategorias(); }, [loadCategorias]);
  useEffect(() => { loadPastos(); }, [loadPastos]);

  const criarPasto = useCallback(async (pasto: Omit<Pasto, 'id' | 'created_at' | 'updated_at'>) => {
    if (clienteId) invalidatePastosForCliente(clienteId);
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
  }, [loadPastos, pastos, fazendaAtual, clienteId]);

  const editarPasto = useCallback(async (id: string, updates: Partial<Pasto>) => {
    if (clienteId) invalidatePastosForCliente(clienteId);
    const { error } = await supabase.from('pastos').update(updates).eq('id', id);
    if (error) { toast.error('Erro ao atualizar pasto'); console.error(error); return false; }
    toast.success('Pasto atualizado');
    await loadPastos();
    return true;
  }, [loadPastos, clienteId]);

  const toggleAtivo = useCallback(async (id: string, ativo: boolean) => {
    if (clienteId) invalidatePastosForCliente(clienteId);
    return editarPasto(id, { ativo });
  }, [editarPasto, clienteId]);

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
    if (clienteId) invalidatePastosForCliente(clienteId);
    if (hasError) {
      toast.error('Erro ao salvar ordem');
      await loadPastos();
    }
  }, [loadPastos, clienteId]);

  return { pastos, categorias, loading, criarPasto, editarPasto, toggleAtivo, loadPastos, reorderPastos };
}
