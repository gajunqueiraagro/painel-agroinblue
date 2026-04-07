/**
 * Hook: useZootCategoriaMensal
 *
 * Fonte única oficial de indicadores zootécnicos mensais POR CATEGORIA.
 * Consome a view `vw_zoot_categoria_mensal` do banco.
 *
 * Regra: toda tela que exibe dados por categoria/mês deve usar este hook.
 * O front NÃO recalcula — apenas lê, formata e filtra.
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
  peso_total_inicial: number;
  peso_total_final: number;
  peso_medio_inicial: number | null;
  peso_medio_final: number | null;
  dias_mes: number;
  gmd: number | null;
  producao_biologica: number;
  fonte_oficial_mes: 'fechamento' | 'fallback_movimentacao' | 'projecao';
}

interface UseZootCategoriaMensalParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  /** Se true, busca todas as fazendas do cliente (visão global) */
  global?: boolean;
}

export function useZootCategoriaMensal({ ano, cenario, global = false }: UseZootCategoriaMensalParams) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;

  return useQuery({
    queryKey: ['zoot-categoria-mensal', global ? `global-${clienteId}` : fazendaId, ano, cenario],
    queryFn: async (): Promise<ZootCategoriaMensal[]> => {
      if (!global && !fazendaId) return [];
      if (global && !clienteId) return [];

      let query = supabase
        .from('vw_zoot_categoria_mensal' as any)
        .select('*')
        .eq('ano', ano)
        .eq('cenario', cenario)
        .order('mes')
        .order('ordem_exibicao');

      if (global) {
        query = query.eq('cliente_id', clienteId);
      } else {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('useZootCategoriaMensal error:', error);
        return [];
      }

      return (data as unknown as ZootCategoriaMensal[]) || [];
    },
    enabled: global ? !!clienteId : !!fazendaId,
    staleTime: 30_000,
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
    result[Number(mes)] = {
      saldo_inicial: cats.reduce((s, c) => s + c.saldo_inicial, 0),
      saldo_final: cats.reduce((s, c) => s + c.saldo_final, 0),
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
