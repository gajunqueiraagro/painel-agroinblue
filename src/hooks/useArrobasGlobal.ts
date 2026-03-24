/**
 * Hook que calcula arrobas produzidas no modo Global
 * usando a regra: Global = Σ (arrobas produzidas de cada fazenda).
 *
 * Para cada fazenda, carrega os pesos oficiais de fechamento de pasto
 * e aplica resolverPesoOficial — garantindo consistência com os
 * indicadores individuais de cada fazenda.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial, Categoria } from '@/types/cattle';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { loadPesosPastosPorCategoria, resolverPesoOficial } from '@/hooks/useFechamentoCategoria';

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
// Constantes
// ---------------------------------------------------------------------------

const TIPOS_ENTRADA = ['nascimento', 'compra', 'transferencia_entrada'];
const TIPOS_SAIDA_GMD = ['abate', 'venda', 'consumo', 'transferencia_saida', 'morte'];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArrobasGlobal(
  isGlobal: boolean,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  categorias: CategoriaRebanho[],
  ano: number,
  mes: number,
  fazendaIds: string[],
): ArrobasGlobalResult {
  const [loading, setLoading] = useState(false);
  const [pesosPorFazenda, setPesosPorFazenda] = useState<Map<string, Record<string, number>>>(new Map());
  const [nomeFazendas, setNomeFazendas] = useState<Map<string, string>>(new Map());
  const [saldosPorFazenda, setSaldosPorFazenda] = useState<Map<string, SaldoInicial[]>>(new Map());

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // Carregar pesos de fechamento, nomes e saldos iniciais por fazenda
  const loadData = useCallback(async () => {
    if (!isGlobal || fazendaIds.length === 0 || !categorias.length) {
      setPesosPorFazenda(new Map());
      setSaldosPorFazenda(new Map());
      return;
    }
    setLoading(true);
    try {
      // Carregar pesos de fechamento de cada fazenda em paralelo
      const [pesosResults, fazendasRes, saldosRes] = await Promise.all([
        Promise.all(
          fazendaIds.map(async fid => {
            const pesos = await loadPesosPastosPorCategoria(fid, anoMes, categorias);
            return { fid, pesos };
          })
        ),
        supabase.from('fazendas').select('id, nome').in('id', fazendaIds),
        supabase.from('saldos_iniciais').select('*').in('fazenda_id', fazendaIds).eq('ano', ano),
      ]);

      // Pesos
      const pesoMap = new Map<string, Record<string, number>>();
      pesosResults.forEach(r => pesoMap.set(r.fid, r.pesos));
      setPesosPorFazenda(pesoMap);

      // Nomes
      if (fazendasRes.data) {
        const nomeMap = new Map<string, string>();
        fazendasRes.data.forEach(f => nomeMap.set(f.id, f.nome));
        setNomeFazendas(nomeMap);
      }

      // Saldos iniciais agrupados por fazenda
      if (saldosRes.data) {
        const sMap = new Map<string, SaldoInicial[]>();
        saldosRes.data.forEach((s: any) => {
          const fid = s.fazenda_id as string;
          const arr = sMap.get(fid) || [];
          arr.push({
            ano: s.ano,
            categoria: s.categoria as Categoria,
            quantidade: s.quantidade,
            pesoMedioKg: s.peso_medio_kg ?? undefined,
          });
          sMap.set(fid, arr);
        });
        setSaldosPorFazenda(sMap);
      }
    } catch {
      setPesosPorFazenda(new Map());
      setSaldosPorFazenda(new Map());
    } finally {
      setLoading(false);
    }
  }, [isGlobal, fazendaIds.join(','), anoMes, ano, categorias]);

  useEffect(() => { loadData(); }, [loadData]);

  // Calcular arrobas produzidas por fazenda
  const result = useMemo((): ArrobasGlobalResult => {
    if (!isGlobal || fazendaIds.length === 0) {
      return { porFazenda: [], somaArrobas: null, loading };
    }

    const porFazenda: ArrobasFazenda[] = [];
    let soma = 0;
    let temAlguma = false;

    for (const fid of fazendaIds) {
      const lancsFazenda = lancamentos.filter(l => l.fazendaId === fid);
      const saldosFazenda = saldosPorFazenda.get(fid) || [];
      const pesosMap = pesosPorFazenda.get(fid) || {};

      // Peso inicial do ano (saldos iniciais)
      const pesoInicialAno = saldosFazenda
        .filter(s => s.ano === ano)
        .reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);

      // Saldo final do mês — com pesos oficiais
      const saldoMap = calcSaldoPorCategoriaLegado(saldosFazenda, lancsFazenda, ano, mes);
      let pesoFinal = 0;
      saldoMap.forEach((qtd, cat) => {
        const { valor: pesoMedio } = resolverPesoOficial(cat, pesosMap, saldosFazenda, lancsFazenda, ano, mes);
        pesoFinal += qtd * (pesoMedio || 0);
      });

      // Movimentações acumuladas
      const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
      const lancsAcum = lancsFazenda.filter(l => l.data >= `${ano}-01-01` && l.data <= end);
      const pesoEntradas = lancsAcum
        .filter(l => TIPOS_ENTRADA.includes(l.tipo))
        .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
      const pesoSaidas = lancsAcum
        .filter(l => TIPOS_SAIDA_GMD.includes(l.tipo))
        .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);

      const ganhoLiquido = pesoFinal - pesoInicialAno - pesoEntradas + pesoSaidas;

      const saldoInicialAno = saldosFazenda.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade, 0);
      const saldoFinalMes = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
      const cabMedia = (saldoInicialAno + saldoFinalMes) / 2;

      const arrobas = (pesoFinal > 0 && pesoInicialAno > 0 && cabMedia > 0)
        ? ganhoLiquido / 30
        : null;

      porFazenda.push({
        fazendaId: fid,
        fazendaNome: nomeFazendas.get(fid) || fid.substring(0, 8) + '…',
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
  }, [isGlobal, fazendaIds, lancamentos, saldosPorFazenda, pesosPorFazenda, nomeFazendas, ano, mes, loading]);

  return result;
}
