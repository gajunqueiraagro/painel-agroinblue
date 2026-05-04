/**
 * Hook: useZootCategoriaMensal
 *
 * ⚠️ USO INTERNO — NÃO IMPORTAR DIRETAMENTE EM TELAS/COMPONENTES.
 * Consumir EXCLUSIVAMENTE via useRebanhoOficial.
 *
 * Exceções permitidas (somente auditoria/conciliação):
 *   - FechamentoTab.tsx
 *   - ConciliacaoTab.tsx
 *
 * Qualquer import fora das exceções acima é uma VIOLAÇÃO arquitetural.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';

export interface ZootCategoriaMensal {
  fazenda_id: string;
  cliente_id: string;
  ano: number;
  mes: number;
  cenario: 'realizado' | 'meta';
  ano_mes: string;        // '2025-03'
  categoria_id: string;
  categoria_codigo: string;
  categoria_nome: string;
  ordem_exibicao: number;
  saldo_inicial: number;
  entradas_externas: number;
  saidas_externas: number;
  evol_cat_entrada: number;
  evol_cat_saida: number;
  saldo_final: number;
  saldo_sistema: number | null;  // cadeia pura de lançamentos, sem override de P1
  saldo_p1: number | null;       // snapshot do fechamento de pastos, null se ausente
  peso_total_inicial: number;
  peso_total_final: number;
  peso_medio_inicial: number | null;
  peso_medio_final: number | null;
  peso_entradas_externas: number;
  peso_saidas_externas: number;
  peso_evol_cat_entrada: number;
  peso_evol_cat_saida: number;
  dias_mes: number;
  gmd: number | null;
  producao_biologica: number;
  fonte_oficial_mes: 'fechamento' | 'fallback_movimentacao' | 'projecao' | 'parcial';
}

interface UseZootCategoriaMensalParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  /** Se true, busca todas as fazendas do cliente (visão global) */
  global?: boolean;
}

export function useZootCategoriaMensal({ ano, cenario, global = false }: UseZootCategoriaMensalParams) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;

  // Se a fazenda selecionada é o sentinel '__global__', tratar como global
  // automaticamente — jamais enviar fazenda_id=eq.__global__ para o banco (retorna 400).
  const effectiveGlobal = global || fazendaId === '__global__';

  // Em global, lista das fazendas reais (sem o sentinel) — usada como filtro explícito
  // .in('fazenda_id', ...) para evitar cache vazio quando a coluna cliente_id estiver
  // ausente/divergente em zoot_mensal_cache.
  const fazendaIdsReais = fazendas
    .map(f => f.id)
    .filter(id => id && id !== '__global__');
  const fazendaIdsKey = fazendaIdsReais.slice().sort().join(',');

  return useQuery({
    queryKey: ['zoot-categoria-mensal', effectiveGlobal ? `global-${clienteId}-${fazendaIdsKey}` : fazendaId, ano, cenario],
    queryFn: async (): Promise<ZootCategoriaMensal[]> => {
      if (!effectiveGlobal && !fazendaId) return [];
      if (effectiveGlobal && !clienteId) return [];
      if (effectiveGlobal && fazendaIdsReais.length === 0) return [];

      if (!effectiveGlobal) {
        const { data, error } = await supabase.rpc('fn_zoot_categoria_mensal' as any, {
          p_fazenda_id: fazendaId,
          p_ano: ano,
        });

        if (error) {
          console.error('useZootCategoriaMensal RPC error:', error);
          return [];
        }

        const rows = (data as unknown as ZootCategoriaMensal[]) || [];
        return rows.filter(r => r.cenario === cenario);
      }

      // Global: pagina o cache (PostgREST default = 1000) e filtra explicitamente por
      // fazenda_id IN (lista de fazendas do cliente) — não confia em cliente_id da cache.
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('zoot_mensal_cache' as any)
          .select('*')
          .eq('ano', ano)
          .eq('cenario', cenario)
          .in('fazenda_id', fazendaIdsReais)
          .order('mes')
          .order('ordem_exibicao')
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('useZootCategoriaMensal error:', error);
          return [];
        }
        const page = data || [];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all as unknown as ZootCategoriaMensal[];
    },
    // Guard: se NÃO é global e fazendaId é o sentinel, desliga a query.
    enabled: effectiveGlobal ? (!!clienteId && fazendaIdsReais.length > 0) : (!!fazendaId && fazendaId !== '__global__'),
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Helpers de agregação
// ---------------------------------------------------------------------------

/**
 * Agrupa por mês: retorna Record<mes (1-12), ZootCategoriaMensal[]>
 */
export function groupByMes(rows: ZootCategoriaMensal[]): Record<number, ZootCategoriaMensal[]> {
  const map: Record<number, ZootCategoriaMensal[]> = {};
  for (const r of rows) {
    if (!map[r.mes]) map[r.mes] = [];
    map[r.mes].push(r);
  }
  return map;
}

/**
 * Agrupa por categoria: retorna Record<categoria_id, ZootCategoriaMensal[]>
 */
export function groupByCategoria(rows: ZootCategoriaMensal[]): Record<string, ZootCategoriaMensal[]> {
  const map: Record<string, ZootCategoriaMensal[]> = {};
  for (const r of rows) {
    if (!map[r.categoria_id]) map[r.categoria_id] = [];
    map[r.categoria_id].push(r);
  }
  return map;
}

/**
 * Retorna totais consolidados por mês (soma de todas as categorias).
 * Útil para telas que mostram o rebanho total por mês.
 */
export function totalizarPorMes(rows: ZootCategoriaMensal[]): Record<number, {
  saldo_inicial: number;
  saldo_final: number;
  saldo_sistema: number | null;
  saldo_p1: number | null;
  entradas_externas: number;
  saidas_externas: number;
  evol_cat_entrada: number;
  evol_cat_saida: number;
  peso_total_inicial: number;
  peso_total_final: number;
  producao_biologica: number;
}> {
  const byMes = groupByMes(rows);
  const result: Record<number, any> = {};

  for (const [mes, cats] of Object.entries(byMes)) {
    // saldo_sistema: null se qualquer categoria do mês tiver null — sem soma parcial
    const todosSistemaValidos = cats.every(c => c.saldo_sistema != null);
    const todosp1Validos = cats.every(c => c.saldo_p1 != null);
    result[Number(mes)] = {
      saldo_inicial: cats.reduce((s, c) => s + c.saldo_inicial, 0),
      saldo_final: cats.reduce((s, c) => s + c.saldo_final, 0),
      saldo_sistema: todosSistemaValidos
        ? cats.reduce((s, c) => s + c.saldo_sistema!, 0)
        : null,
      saldo_p1: todosp1Validos
        ? cats.reduce((s, c) => s + c.saldo_p1!, 0)
        : null,
      entradas_externas: cats.reduce((s, c) => s + c.entradas_externas, 0),
      saidas_externas: cats.reduce((s, c) => s + c.saidas_externas, 0),
      evol_cat_entrada: cats.reduce((s, c) => s + c.evol_cat_entrada, 0),
      evol_cat_saida: cats.reduce((s, c) => s + c.evol_cat_saida, 0),
      peso_total_inicial: cats.reduce((s, c) => s + c.peso_total_inicial, 0),
      peso_total_final: cats.reduce((s, c) => s + c.peso_total_final, 0),
      producao_biologica: cats.reduce((s, c) => s + c.producao_biologica, 0),
    };
  }

  return result;
}

/**
 * Retorna lista de categorias únicas presentes nos dados, ordenadas.
 */
export function categoriasUnicas(rows: ZootCategoriaMensal[]): { id: string; codigo: string; nome: string; ordem: number }[] {
  const seen = new Map<string, { id: string; codigo: string; nome: string; ordem: number }>();
  for (const r of rows) {
    if (!seen.has(r.categoria_id)) {
      seen.set(r.categoria_id, {
        id: r.categoria_id,
        codigo: r.categoria_codigo,
        nome: r.categoria_nome,
        ordem: r.ordem_exibicao,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.ordem - b.ordem);
}
