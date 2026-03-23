/**
 * Hook que decompõe o cálculo do GMD para exibição didática.
 *
 * Usa exclusivamente a camada central de cálculos — não replica lógica.
 * O resultado é consumido pelo drawer "Explicando o GMD".
 */

import { useMemo } from 'react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto } from '@/hooks/usePastos';
import {
  calcSaldoPorCategoriaLegado,
  calcPesoMedioPonderado,
  isEntrada,
  isSaida,
} from '@/lib/calculos/zootecnicos';
import { calcGMD } from '@/lib/calculos/economicos';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface DetalheMovimentacao {
  tipo: string;
  label: string;
  quantidade: number;
  pesoTotalKg: number;
}

export interface GMDExplicacao {
  /** GMD calculado (null = dados insuficientes) */
  gmd: number | null;

  /** Período */
  ano: number;
  mes: number;
  diasMes: number;

  /** Componentes do numerador */
  pesoFinalEstoque: number;
  pesoInicialEstoque: number;
  pesoEntradas: number;
  pesoSaidas: number;
  ganhoPesoLiquido: number;

  /** Denominador */
  cabecasInicio: number;
  cabecasFim: number;
  cabecasMedia: number;

  /** Detalhamento */
  entradas: DetalheMovimentacao[];
  saidas: DetalheMovimentacao[];

  /** Qualidade */
  baseCompleta: boolean;
  motivoIncompleto: string | null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const LABELS_TIPO: Record<string, string> = {
  nascimento: 'Nascimentos',
  compra: 'Compras',
  transferencia_entrada: 'Transf. Entrada',
  abate: 'Abates',
  venda: 'Vendas',
  morte: 'Mortes',
  consumo: 'Consumo',
  transferencia_saida: 'Transf. Saída',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGMDExplicacao(
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  ano: number,
  mes: number,
): GMDExplicacao {
  return useMemo(() => {
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const diasMes = new Date(ano, mes, 0).getDate();

    // --- Saldo final do mês ---
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const cabecasFim = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);

    // --- Saldo inicial do mês (= saldo final do mês anterior ou saldo inicial do ano) ---
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === ano)
      .reduce((sum, s) => sum + s.quantidade, 0);

    let cabecasInicio: number;
    if (mes > 1) {
      const saldoMapAnt = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1);
      cabecasInicio = Array.from(saldoMapAnt.values()).reduce((s, v) => s + v, 0);
    } else {
      cabecasInicio = saldoInicialAno;
    }

    const cabecasMedia = (cabecasInicio + cabecasFim) / 2;

    // --- Peso médio do rebanho ---
    const getPesoMedio = (saldoM: Map<string, number>, ateMes: number) => {
      const itens: { quantidade: number; pesoKg: number | null }[] = [];
      saldoM.forEach((qtd, cat) => {
        if (qtd <= 0) return;
        // Buscar último lançamento com peso
        const lancsComPeso = lancamentos.filter(
          l => l.categoria === cat && l.data <= `${ano}-${String(ateMes).padStart(2, '0')}-31` && l.pesoMedioKg && l.pesoMedioKg > 0,
        );
        if (lancsComPeso.length > 0) {
          const sorted = [...lancsComPeso].sort((a, b) => b.data.localeCompare(a.data));
          itens.push({ quantidade: qtd, pesoKg: sorted[0].pesoMedioKg! });
          return;
        }
        // Fallback saldo inicial
        const si = saldosIniciais.find(s => s.ano === ano && s.categoria === cat);
        itens.push({ quantidade: qtd, pesoKg: si?.pesoMedioKg ?? null });
      });
      return calcPesoMedioPonderado(itens);
    };

    const pesoMedioFim = getPesoMedio(saldoMap, mes);
    const pesoFinalEstoque = cabecasFim * (pesoMedioFim || 0);

    // Peso inicial
    let pesoInicialEstoque: number;
    if (mes > 1) {
      const saldoMapAnt = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1);
      const pesoMedioIni = getPesoMedio(saldoMapAnt, mes - 1);
      pesoInicialEstoque = cabecasInicio * (pesoMedioIni || 0);
    } else {
      const pesoMedioIniAno = calcPesoMedioPonderado(
        saldosIniciais.filter(s => s.ano === ano && s.quantidade > 0)
          .map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null })),
      );
      pesoInicialEstoque = saldoInicialAno * (pesoMedioIniAno || 0);
    }

    // --- Lançamentos do mês ---
    const lancsMes = lancamentos.filter(l => l.data.startsWith(anoMes));

    // Agrupar entradas
    const tiposEntrada = ['nascimento', 'compra', 'transferencia_entrada'];
    const entradas: DetalheMovimentacao[] = tiposEntrada.map(tipo => {
      const doTipo = lancsMes.filter(l => l.tipo === tipo);
      const quantidade = doTipo.reduce((s, l) => s + l.quantidade, 0);
      const pesoTotalKg = doTipo.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
      return { tipo, label: LABELS_TIPO[tipo] || tipo, quantidade, pesoTotalKg };
    }).filter(d => d.quantidade > 0);

    // Agrupar saídas
    const tiposSaida = ['abate', 'venda', 'morte', 'consumo', 'transferencia_saida'];
    const saidas: DetalheMovimentacao[] = tiposSaida.map(tipo => {
      const doTipo = lancsMes.filter(l => l.tipo === tipo);
      const quantidade = doTipo.reduce((s, l) => s + l.quantidade, 0);
      const pesoTotalKg = doTipo.reduce((s, l) => {
        // Para saídas, usar peso médio kg ou peso carcaça conforme disponível
        const peso = l.pesoMedioKg || l.pesoCarcacaKg || 0;
        return s + l.quantidade * peso;
      }, 0);
      return { tipo, label: LABELS_TIPO[tipo] || tipo, quantidade, pesoTotalKg };
    }).filter(d => d.quantidade > 0);

    const pesoEntradas = entradas.reduce((s, e) => s + e.pesoTotalKg, 0);
    const pesoSaidas = saidas.reduce((s, e) => s + e.pesoTotalKg, 0);
    const ganhoPesoLiquido = pesoFinalEstoque - pesoInicialEstoque - pesoEntradas + pesoSaidas;

    // --- Calcular GMD usando a função central ---
    const gmd = calcGMD(pesoFinalEstoque, pesoInicialEstoque, pesoEntradas, pesoSaidas, diasMes, cabecasMedia);

    // --- Qualidade ---
    let motivoIncompleto: string | null = null;
    if (pesoFinalEstoque <= 0) motivoIncompleto = 'Peso final do estoque não disponível';
    else if (pesoInicialEstoque <= 0) motivoIncompleto = 'Peso inicial do estoque não disponível';
    else if (cabecasMedia <= 0) motivoIncompleto = 'Sem cabeças no período';
    else if (gmd === null && ganhoPesoLiquido < 0) motivoIncompleto = 'Ganho líquido negativo — verifique os dados de peso';
    else if (gmd === null) motivoIncompleto = 'Resultado fora da faixa operacional (0 a 3,0 kg/dia)';

    return {
      gmd,
      ano,
      mes,
      diasMes,
      pesoFinalEstoque,
      pesoInicialEstoque,
      pesoEntradas,
      pesoSaidas,
      ganhoPesoLiquido,
      cabecasInicio,
      cabecasFim,
      cabecasMedia,
      entradas,
      saidas,
      baseCompleta: gmd !== null,
      motivoIncompleto,
    };
  }, [lancamentos, saldosIniciais, ano, mes]);
}
