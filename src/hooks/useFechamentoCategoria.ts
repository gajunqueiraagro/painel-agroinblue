/**
 * Hook que produz a fotografia oficial mensal por categoria.
 *
 * FONTE OFICIAL: vw_zoot_categoria_mensal (via useZootCategoriaMensal)
 * Fonte antiga: calcSaldoPorCategoriaLegado + loadPesosPastosCompleto + resolverPesoOficial
 *
 * PROIBIDO: calcSaldoPorCategoriaLegado, resolverPesoOficial, loadPesosPastos*
 *
 * Telas impactadas: FechamentoCategoriaTab, useValorRebanhoGlobal (tipo OrigemPeso)
 */

import { useMemo } from 'react';
import { useZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

// ---------------------------------------------------------------------------
// Tipos (mantidos para compatibilidade)
// ---------------------------------------------------------------------------

export type OrigemPeso = 'pastos' | 'lancamento' | 'saldo_inicial' | 'sem_base';

export interface FechamentoCategoriaRow {
  categoriaId: string;
  categoriaCodigo: string;
  categoriaNome: string;
  ordemExibicao: number;
  quantidadeFinal: number;
  pesoMedioFinalKg: number | null;
  pesoTotalFinalKg: number;
  origemPeso: OrigemPeso;
}

export interface FechamentoCategoriaResumo {
  rows: FechamentoCategoriaRow[];
  totalCabecas: number;
  pesoMedioGeral: number | null;
  pesoTotalGeral: number;
  pesoMedioGeralPastos: number | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapFonteToOrigem(fonte: string): OrigemPeso {
  switch (fonte) {
    case 'fechamento': return 'pastos';
    case 'fallback_movimentacao': return 'lancamento';
    case 'projecao': return 'saldo_inicial';
    default: return 'sem_base';
  }
}

// ---------------------------------------------------------------------------
// Hook — consome exclusivamente vw_zoot_categoria_mensal
// ---------------------------------------------------------------------------

/**
 * Parâmetros lancamentos, saldosIniciais e categorias são mantidos
 * na assinatura para compatibilidade com os callers existentes,
 * mas NÃO são utilizados internamente (a view é a fonte única).
 */
export function useFechamentoCategoria(
  _fazendaId: string | undefined,
  ano: number,
  mes: number,
  _lancamentos: unknown[],
  _saldosIniciais: unknown[],
  _categorias: unknown[],
): FechamentoCategoriaResumo {
  const { data: viewData, isLoading } = useZootCategoriaMensal({ ano, cenario: 'realizado' });

  return useMemo((): FechamentoCategoriaResumo => {
    const monthData = (viewData || []).filter(r => r.mes === mes);

    const rows: FechamentoCategoriaRow[] = monthData
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      .map(cat => ({
        categoriaId: cat.categoria_id,
        categoriaCodigo: cat.categoria_codigo,
        categoriaNome: cat.categoria_nome,
        ordemExibicao: cat.ordem_exibicao,
        quantidadeFinal: cat.saldo_final,
        pesoMedioFinalKg: cat.peso_medio_final,
        pesoTotalFinalKg: cat.peso_total_final,
        origemPeso: mapFonteToOrigem(cat.fonte_oficial_mes),
      }));

    const totalCabecas = rows.reduce((s, r) => s + r.quantidadeFinal, 0);
    const pesoTotalGeral = rows.reduce((s, r) => s + r.pesoTotalFinalKg, 0);
    const pesoMedioGeral = totalCabecas > 0 ? pesoTotalGeral / totalCabecas : null;

    return {
      rows,
      totalCabecas,
      pesoMedioGeral,
      pesoTotalGeral,
      pesoMedioGeralPastos: pesoMedioGeral,
      loading: isLoading,
    };
  }, [viewData, mes, isLoading]);
}
