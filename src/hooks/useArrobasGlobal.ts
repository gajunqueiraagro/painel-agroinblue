/**
 * Hook que calcula arrobas produzidas no modo Global
 * usando a regra: Global = Σ (arrobas produzidas de cada fazenda).
 *
 * FONTE OFICIAL: usa exclusivamente vw_zoot_categoria_mensal.
 * PROIBIDO: calcSaldoPorCategoriaLegado, resolverPesoOficial.
 */

import { useMemo } from 'react';
import { useRebanhoOficial, groupByMes } from '@/hooks/useRebanhoOficial';
import { calcGMD } from '@/lib/calculos/economicos';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ArrobasFazenda {
  fazendaId: string;
  fazendaNome: string;
  arrobasProduzidas: number | null;
  pesoFinalEstoque: number;
  pesoInicialEstoque: number;
  pesoEntradas: number;
  pesoSaidas: number;
  ganhoLiquidoKg: number;
}

export interface ArrobasGlobalResult {
  porFazenda: ArrobasFazenda[];
  somaArrobas: number | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArrobasGlobal(
  isGlobal: boolean,
  _lancamentos: any[], // kept for API compatibility but NOT used for saldo/peso
  _saldosIniciais: any[],
  _categorias: any[],
  ano: number,
  mes: number,
  _fazendaIds: string[],
): ArrobasGlobalResult {
  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewData, loading } = useRebanhoOficial({
    ano,
    cenario: 'realizado',
    global: isGlobal,
  });

  const result = useMemo((): ArrobasGlobalResult => {
    if (!isGlobal || !viewData || viewData.length === 0) {
      return { porFazenda: [], somaArrobas: null, loading };
    }

    // Group by fazenda_id
    const byFazenda = new Map<string, typeof viewData>();
    for (const row of viewData) {
      const arr = byFazenda.get(row.fazenda_id) || [];
      arr.push(row);
      byFazenda.set(row.fazenda_id, arr);
    }

    const porFazenda: ArrobasFazenda[] = [];
    let soma = 0;
    let temAlguma = false;

    for (const [fazendaId, rows] of byFazenda.entries()) {
      const byMes = groupByMes(rows);

      // Peso inicial do ano (= peso_total_inicial do mês 1)
      const mes1 = byMes[1] || [];
      const pesoInicialAno = mes1.reduce((s, c) => s + c.peso_total_inicial, 0);
      const saldoInicialAno = mes1.reduce((s, c) => s + c.saldo_inicial, 0);

      // Peso final do mês selecionado
      const mesFinal = byMes[mes] || [];
      const pesoFinal = mesFinal.reduce((s, c) => s + c.peso_total_final, 0);
      const saldoFinal = mesFinal.reduce((s, c) => s + c.saldo_final, 0);

      // Entradas/saídas acumuladas
      let pesoEntradas = 0, pesoSaidas = 0;
      for (let m = 1; m <= mes; m++) {
        const cats = byMes[m] || [];
        pesoEntradas += cats.reduce((s, c) => s + c.peso_entradas_externas, 0);
        pesoSaidas += cats.reduce((s, c) => s + c.peso_saidas_externas, 0);
      }

      const ganhoLiquido = pesoFinal - pesoInicialAno - pesoEntradas + pesoSaidas;
      const cabMedia = (saldoInicialAno + saldoFinal) / 2;

      const arrobas = (pesoFinal > 0 && pesoInicialAno > 0 && cabMedia > 0)
        ? ganhoLiquido / 30
        : null;

      porFazenda.push({
        fazendaId,
        fazendaNome: fazendaId.substring(0, 8) + '…', // Nome será resolvido pelo consumer
        arrobasProduzidas: arrobas,
        pesoFinalEstoque: pesoFinal,
        pesoInicialEstoque: pesoInicialAno,
        pesoEntradas,
        pesoSaidas,
        ganhoLiquidoKg: ganhoLiquido,
      });

      if (arrobas !== null) {
        soma += arrobas;
        temAlguma = true;
      }
    }

    return {
      porFazenda,
      somaArrobas: temAlguma ? soma : null,
      loading,
    };
  }, [isGlobal, viewData, mes, loading]);

  return result;
}
