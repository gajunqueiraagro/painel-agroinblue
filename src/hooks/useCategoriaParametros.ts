/**
 * useCategoriaParametros — Hook para consultar faixas de peso e regras de evolução
 *
 * Regra de prioridade:
 *   1º — Configuração específica do cliente (cliente_id = X)
 *   2º — Fallback padrão global (cliente_id IS NULL, is_default = true)
 *
 * NOTA ARQUITETURAL: o campo 'categoria_proxima' representa o caminho
 * DEFAULT de evolução na hierarquia. NÃO representa todos os caminhos
 * futuros possíveis.
 *
 * REGRA TEMPORÁRIA: Os thresholds de alerta (ALERTA_FAIXA_PCT = 10%
 * e ALERTA_GMD_DESVIO_PCT = 20%) estão fixos no código nesta fase.
 * Devem ser parametrizáveis no futuro.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import type { Categoria } from '@/types/cattle';

// ── Thresholds de alerta (REGRA TEMPORÁRIA — parametrizar no futuro) ──
export const ALERTA_FAIXA_PCT = 0.10; // 10% do limite superior
export const ALERTA_GMD_DESVIO_PCT = 0.20; // 20% de desvio

export interface CategoriaParametros {
  id: string;
  categoriaCodigo: string;
  pesoMinKg: number;
  pesoMaxKg: number;
  categoriaProxima: string | null;
  pesoEvolucaoKg: number | null;
  ordemHierarquia: number;
  grupo: 'macho' | 'femea';
  clienteId: string | null;
  isDefault: boolean;
}

function mapRow(row: any): CategoriaParametros {
  return {
    id: row.id,
    categoriaCodigo: row.categoria_codigo,
    pesoMinKg: Number(row.peso_min_kg),
    pesoMaxKg: Number(row.peso_max_kg),
    categoriaProxima: row.categoria_proxima,
    pesoEvolucaoKg: row.peso_evolucao_kg != null ? Number(row.peso_evolucao_kg) : null,
    ordemHierarquia: row.ordem_hierarquia,
    grupo: row.grupo,
    clienteId: row.cliente_id,
    isDefault: row.is_default,
  };
}

export function useCategoriaParametros(clienteId?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['cfg_categoria_parametros', clienteId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('cfg_categoria_parametros')
        .select('*')
        .eq('ativo', true)
        .order('ordem_hierarquia');
      if (error) throw error;
      return (rows || []).map(mapRow);
    },
    staleTime: 5 * 60 * 1000,
  });

  /** Map resolvido com fallback: cliente → global */
  const resolvedMap = useMemo(() => {
    const map = new Map<string, CategoriaParametros>();
    if (!data) return map;

    // 1º passo: preencher com defaults globais
    for (const row of data) {
      if (row.isDefault && row.clienteId === null) {
        map.set(row.categoriaCodigo, row);
      }
    }
    // 2º passo: sobrescrever com configs do cliente
    if (clienteId) {
      for (const row of data) {
        if (row.clienteId === clienteId) {
          map.set(row.categoriaCodigo, row);
        }
      }
    }
    return map;
  }, [data, clienteId]);

  /** Retorna parâmetros resolvidos para uma categoria */
  const getParametros = (categoriaCodigo: string): CategoriaParametros | undefined => {
    return resolvedMap.get(categoriaCodigo);
  };

  /** Retorna parâmetros da categoria próxima (se existir) */
  const getProximaCategoria = (categoriaCodigo: string): CategoriaParametros | undefined => {
    const atual = resolvedMap.get(categoriaCodigo);
    if (!atual?.categoriaProxima) return undefined;
    return resolvedMap.get(atual.categoriaProxima);
  };

  return {
    parametros: data ?? [],
    resolvedMap,
    getParametros,
    getProximaCategoria,
    isLoading,
  };
}
