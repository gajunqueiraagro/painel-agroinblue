/**
 * Hook que consolida o cenário Meta por categoria e mês.
 * Somente leitura — calcula SF, Produção Biológica, Peso Final etc.
 */
import { useMemo } from 'react';
import { CATEGORIAS, type Categoria, type Lancamento, type SaldoInicial } from '@/types/cattle';
import { isEntrada, isSaida, isReclassificacao } from '@/lib/calculos/zootecnicos';
import type { MetaGmdRow } from '@/hooks/useMetaGmd';

export interface MetaCategoriaMes {
  categoria: Categoria;
  categoriaLabel: string;
  mes: string; // '01'..'12'
  si: number;          // saldo inicial do mês
  ee: number;          // entradas externas (compra, nascimento, transf_entrada)
  se: number;          // saídas externas (venda, abate, morte, consumo, transf_saida)
  ei: number;          // entradas internas (reclassificação destino)
  siInternas: number;  // saídas internas (reclassificação origem)
  sf: number;          // saldo final
  cabMedias: number;
  pesoInicial: number; // peso total do SI (si * pesoMedioKg do saldoInicial)
  pesoEntradas: number;
  pesoSaidas: number;
  gmd: number;
  dias: number;
  producaoBio: number;
  pesoTotalFinal: number;
  pesoMedioFinal: number | null;
}

export function useMetaConsolidacao(
  saldosIniciais: SaldoInicial[],
  metaLancamentos: Lancamento[],
  gmdRows: MetaGmdRow[],
  ano: number,
) {
  return useMemo(() => {
    const result: MetaCategoriaMes[] = [];

    // Build GMD lookup: cat -> mes -> gmd
    const gmdMap = new Map<string, Record<string, number>>();
    for (const row of gmdRows) {
      gmdMap.set(row.categoria, row.meses);
    }

    // Build peso médio inicial por categoria (do saldo inicial do ano)
    const pesoInicialCat = new Map<string, number>();
    const qtdInicialCat = new Map<string, number>();
    for (const s of saldosIniciais) {
      if (s.ano !== ano) continue;
      qtdInicialCat.set(s.categoria, (qtdInicialCat.get(s.categoria) || 0) + s.quantidade);
      pesoInicialCat.set(
        s.categoria,
        (pesoInicialCat.get(s.categoria) || 0) + s.quantidade * (s.pesoMedioKg || 0),
      );
    }

    // Filter lancamentos for this year
    const lancAno = metaLancamentos.filter(l => l.data.startsWith(String(ano)));

    for (const cat of CATEGORIAS) {
      // Running state across months
      let saldoAtual = qtdInicialCat.get(cat.value) || 0;
      let pesoTotalAtual = pesoInicialCat.get(cat.value) || 0;

      for (let m = 1; m <= 12; m++) {
        const mesKey = String(m).padStart(2, '0');
        const mesPrefix = `${ano}-${mesKey}`;
        const si = saldoAtual;
        const pesoInicial = pesoTotalAtual;

        // Filter movements for this category+month
        const doMes = lancAno.filter(l => l.data.startsWith(mesPrefix));

        let ee = 0, se = 0, ei = 0, siInt = 0;
        let pesoEntradas = 0, pesoSaidas = 0;

        for (const l of doMes) {
          const pesoUnit = l.pesoMedioKg || 0;

          if (l.categoria === cat.value && isEntrada(l.tipo)) {
            ee += l.quantidade;
            pesoEntradas += l.quantidade * pesoUnit;
          }
          if (l.categoria === cat.value && isSaida(l.tipo)) {
            se += l.quantidade;
            pesoSaidas += l.quantidade * pesoUnit;
          }
          // Reclassificação: origem = saída interna, destino = entrada interna
          if (isReclassificacao(l.tipo)) {
            if (l.categoria === cat.value) {
              siInt += l.quantidade;
              pesoSaidas += l.quantidade * pesoUnit;
            }
            if (l.categoriaDestino === cat.value) {
              ei += l.quantidade;
              pesoEntradas += l.quantidade * pesoUnit;
            }
          }
        }

        const sf = si + ee - se + ei - siInt;
        const cabMedias = (si + sf) / 2;

        const gmdVal = gmdMap.get(cat.value)?.[mesKey] || 0;
        const dias = new Date(ano, m, 0).getDate();
        const producaoBio = cabMedias * gmdVal * dias;

        const pesoTotalFinal = pesoInicial + pesoEntradas - pesoSaidas + producaoBio;
        const pesoMedioFinal = sf > 0 ? pesoTotalFinal / sf : null;

        result.push({
          categoria: cat.value,
          categoriaLabel: cat.label,
          mes: mesKey,
          si,
          ee,
          se,
          ei,
          siInternas: siInt,
          sf,
          cabMedias,
          pesoInicial,
          pesoEntradas,
          pesoSaidas,
          gmd: gmdVal,
          dias,
          producaoBio,
          pesoTotalFinal,
          pesoMedioFinal,
        });

        // Carry forward
        saldoAtual = sf;
        pesoTotalAtual = pesoTotalFinal;
      }
    }

    return result;
  }, [saldosIniciais, metaLancamentos, gmdRows, ano]);
}
