/**
 * Painel do Consultor — tabela analítica mensal (Zootécnico + Financeiro).
 * Leitura rápida, foco em conferência e fechamento.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Download } from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { formatNum, formatMoeda, formatPainel, type PainelFormatType } from '@/lib/calculos/formatters';
import {
  calcSaldoMensalAcumulado,
  calcResumoMovimentacoes,
  calcPesoMedioPonderado,
  calcUA,
  calcUAHa,
  calcAreaProdutivaPecuaria,
  calcSaldoPorCategoriaLegado,
} from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe, calcValorTotal, calcGMD } from '@/lib/calculos/economicos';
import { supabase } from '@/integrations/supabase/client';
import { isConciliado as isLancConciliado } from '@/lib/statusOperacional';
import { loadPesosPastosPorCategoria, resolverPesoOficial } from '@/hooks/useFechamentoCategoria';
import {
  isConciliado as isFinConciliado,
  isEntrada as isFinEntrada,
  isSaida as isFinSaida,
  classificarEntrada,
  classificarSaida,
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
  datePagtoMes,
  datePagtoAno,
} from '@/lib/financeiro/classificacao';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';

// ─── Constants ───
const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface Props {
  onBack: () => void;
  filtroGlobal?: { ano: string; mes: number };
}

// ─── Zootécnico helpers ───

interface ZooRow {
  grupo: string;
  indicador: string;
  valores: number[];
  total: number;
  format: PainelFormatType;
}

function buildZooRows(
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  ano: number,
  ateMes: number,
  areaProdutiva: number,
  pesosPorMes: Record<string, Record<string, number>>,
): ZooRow[] {
  const rows: ZooRow[] = [];

  const { saldoInicioMes, saldoFinalAno, saldoInicialAno } = calcSaldoMensalAcumulado(saldosIniciais, lancamentos, ano);

  const saldoFimMes = (m: number): number => {
    if (m >= 12) return saldoFinalAno;
    const next = String(m + 1).padStart(2, '0');
    return saldoInicioMes[next] ?? 0;
  };

  const lancAno = lancamentos.filter(l => l.data.substring(0, 4) === String(ano) && isLancConciliado(l));
  const lancMes = (m: number) => {
    const prefix = `${ano}-${String(m).padStart(2, '0')}`;
    return lancAno.filter(l => l.data.startsWith(prefix));
  };

  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number, format: PainelFormatType = 'cab'): ZooRow => {
    const valores = Array.from({ length: 12 }, (_, i) => fn(i + 1));
    const total = valores.reduce((a, b) => a + b, 0);
    return { grupo, indicador, valores, total, format };
  };

  // Pre-compute peso final per month
  const pesoFinKgRow_valores = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    if (m > ateMes) return 0;
    const anoMes = `${ano}-${String(m).padStart(2, '0')}`;
    const pesosMap = pesosPorMes[anoMes] || {};
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
    let total = 0;
    saldoMap.forEach((qtd, cat) => {
      const { valor: pesoMedio } = resolverPesoOficial(cat, pesosMap, saldosIniciais, lancamentos, ano, m);
      total += qtd * (pesoMedio || 0);
    });
    return total;
  });

  // Helper: entradas/saídas kg/@ por mês (reusável)
  const tiposEntrada = ['nascimento', 'compra', 'transferencia_entrada'];
  const tiposSaida = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

  const entradasKgMes = (m: number) => lancMes(m).filter(l => tiposEntrada.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  const saidasKgMes = (m: number) => lancMes(m).filter(l => tiposSaida.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  const entradasArrobasMes = (m: number) => lancMes(m).filter(l => tiposEntrada.includes(l.tipo)).reduce((s, l) => s + calcArrobasSafe(l), 0);
  const saidasArrobasMes = (m: number) => lancMes(m).filter(l => tiposSaida.includes(l.tipo)).reduce((s, l) => s + calcArrobasSafe(l), 0);
  const entradasCabMes = (m: number) => {
    const resumo = calcResumoMovimentacoes(lancamentos, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalEntradas;
  };
  const saidasCabMes = (m: number) => {
    const resumo = calcResumoMovimentacoes(lancamentos, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalSaidas;
  };

  const cabIniMes = (m: number) => {
    const k = String(m).padStart(2, '0');
    return m === 1 ? saldoInicialAno : (saldoInicioMes[k] ?? 0);
  };
  const cabFinMes = (m: number) => saldoFimMes(m);
  const pesoIniMes = (m: number) => {
    if (m === 1) return saldosIniciais.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    return pesoFinKgRow_valores[m - 2] ?? 0;
  };
  const pesoFinMes = (m: number) => pesoFinKgRow_valores[m - 1] ?? 0;
  const cabMediaMes = (m: number) => (cabIniMes(m) + cabFinMes(m)) / 2;
  const pesoMedioMes = (m: number) => { const c = cabFinMes(m); return c > 0 ? pesoFinMes(m) / c : 0; };
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();

  // ═══════════════════════════════════════════════
  // 1️⃣ BASES (ESTRUTURA)
  // ═══════════════════════════════════════════════

  // ── Base Início do Mês ──
  const cabIniRow = mkRow('Base — Início do Mês', 'Cabeças iniciais\n(cab)', cabIniMes);
  const pesoIniKgRow = mkRow('Base — Início do Mês', 'Peso total inicial\n(kg)', pesoIniMes, 'padrao');
  const pesoIniArrobasRow = mkRow('Base — Início do Mês', 'Peso total inicial\n(@)', m => pesoIniMes(m) / 30, 'padrao');
  const pesoMedioIniRow = mkRow('Base — Início do Mês', 'Peso médio inicial\n(kg/cab)', m => {
    const c = cabIniMes(m); return c > 0 ? pesoIniMes(m) / c : 0;
  }, 'padrao');

  rows.push(cabIniRow, pesoIniKgRow, pesoIniArrobasRow, pesoMedioIniRow);

  // ── Base Final do Mês ──
  const cabFinRow = mkRow('Base — Final do Mês', 'Cabeças finais\n(cab)', cabFinMes);
  const pesoFinKgRow = mkRow('Base — Final do Mês', 'Peso total final\n(kg)', pesoFinMes, 'padrao');
  const pesoFinArrobasRow = mkRow('Base — Final do Mês', 'Peso total final\n(@)', m => pesoFinMes(m) / 30, 'padrao');
  const pesoMedioFinRow = mkRow('Base — Final do Mês', 'Peso médio final\n(kg/cab)', pesoMedioMes, 'padrao');

  rows.push(cabFinRow, pesoFinKgRow, pesoFinArrobasRow, pesoMedioFinRow);

  // ── Base Média do Mês ──
  const cabMediaMesRow = mkRow('Base — Média do Mês', 'Rebanho médio do mês\n(cab)', cabMediaMes, 'padrao');
  const pesoMedioRebMesRow = mkRow('Base — Média do Mês', 'Peso médio do rebanho — no mês\n(kg/cab)', pesoMedioMes, 'padrao');
  const areaMesRow = mkRow('Base — Média do Mês', 'Área produtiva — no mês\n(ha)', _m => areaProdutiva, 'padrao');

  rows.push(cabMediaMesRow, pesoMedioRebMesRow, areaMesRow);

  // ── Base Média do Período ──
  const cabMediaPeriodoRow = mkRow('Base — Média do Período', 'Rebanho médio no período\n(cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = cabMediaMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  const pesoMedioPeriodoRow = mkRow('Base — Média do Período', 'Peso médio no período\n(kg/cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = pesoMedioMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  const areaPeriodoRow = mkRow('Base — Média do Período', 'Área produtiva — média no período\n(ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = areaMesRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  rows.push(cabMediaPeriodoRow, pesoMedioPeriodoRow, areaPeriodoRow);

  // ═══════════════════════════════════════════════
  // 2️⃣ MOVIMENTAÇÕES (FLUXO)
  // ═══════════════════════════════════════════════

  // ── Entradas ──
  const tiposEntradaMov: { tipo: string; label: string; temValor: boolean }[] = [
    { tipo: 'nascimento', label: 'Nascimentos', temValor: false },
    { tipo: 'compra', label: 'Compras', temValor: true },
    { tipo: 'transferencia_entrada', label: 'Transferências entrada', temValor: true },
  ];

  tiposEntradaMov.forEach(({ tipo, label, temValor }) => {
    rows.push(mkRow('Movimentações — Entradas', `${label}\n(cab)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0)));
    rows.push(mkRow('Movimentações — Entradas', `${label}\n(kg)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0), 'padrao'));
    rows.push(mkRow('Movimentações — Entradas', `${label}\n(@)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcArrobasSafe(l), 0), 'padrao'));
    if (temValor) {
      rows.push(mkRow('Movimentações — Entradas', `${label}\n(R$)`, m =>
        lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcValorTotal(l), 0), 'money'));
    }
  });

  // ── Saídas ──
  const tiposSaidaMov: { tipo: string; label: string; temValor: boolean; temArroba: boolean }[] = [
    { tipo: 'abate', label: 'Abates', temValor: true, temArroba: true },
    { tipo: 'venda', label: 'Vendas', temValor: true, temArroba: true },
    { tipo: 'transferencia_saida', label: 'Transferências saída', temValor: true, temArroba: true },
    { tipo: 'consumo', label: 'Consumo', temValor: true, temArroba: true },
    { tipo: 'morte', label: 'Mortes', temValor: true, temArroba: true },
  ];

  tiposSaidaMov.forEach(({ tipo, label, temValor, temArroba }) => {
    rows.push(mkRow('Movimentações — Saídas', `${label}\n(cab)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0)));
    rows.push(mkRow('Movimentações — Saídas', `${label}\n(kg)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0), 'padrao'));
    if (temArroba) {
      rows.push(mkRow('Movimentações — Saídas', `${label}\n(@)`, m =>
        lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcArrobasSafe(l), 0), 'padrao'));
    }
    if (temValor) {
      rows.push(mkRow('Movimentações — Saídas', `${label}\n(R$)`, m =>
        lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcValorTotal(l), 0), 'money'));
    }
  });

  // ── Acumulados ──
  const entradasCabRow = mkRow('Movimentações — Acumulados', 'Entradas acumuladas\n(cab)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += entradasCabMes(i); return acum;
  });
  const saidasCabAcumRow = mkRow('Movimentações — Acumulados', 'Saídas acumuladas\n(cab)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += saidasCabMes(i); return acum;
  });

  rows.push(entradasCabRow, saidasCabAcumRow);

  // ═══════════════════════════════════════════════
  // 3️⃣ INDICADORES (RESULTADO)
  // ═══════════════════════════════════════════════

  // ── Área e Peso ──
  const indAreaMesRow = mkRow('Indicadores — Área e Peso', 'Área produtiva — média no mês\n(ha)', _m => areaProdutiva, 'padrao');
  const indAreaPeriodoRow = mkRow('Indicadores — Área e Peso', 'Área produtiva — média no período\n(ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = indAreaMesRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');
  const indPesoMesRow = mkRow('Indicadores — Área e Peso', 'Peso médio do rebanho — no mês\n(kg/cab)', pesoMedioMes, 'padrao');
  const indPesoPeriodoRow = mkRow('Indicadores — Área e Peso', 'Peso médio do rebanho — no período\n(kg/cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = pesoMedioMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  rows.push(indAreaMesRow, indAreaPeriodoRow, indPesoMesRow, indPesoPeriodoRow);

  // ── Lotação ──
  const lotCabHaRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio do mês\n(cab/ha)', m => {
    return areaProdutiva > 0 ? cabMediaMes(m) / areaProdutiva : 0;
  }, 'padrao');
  const lotCabHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio no período\n(cab/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotCabHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  const uaRow = mkRow('Indicadores — Lotação', 'UA — rebanho médio do mês\n(UA)', m => calcUA(cabMediaMes(m), 450), 'padrao');
  const uaAcumRow = mkRow('Indicadores — Lotação', 'UA — rebanho médio no período\n(UA)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = uaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  const lotUaHaRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio do mês\n(UA/ha)', m => {
    return areaProdutiva > 0 ? uaRow.valores[m - 1] / areaProdutiva : 0;
  }, 'padrao');
  const lotUaHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio no período\n(UA/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotUaHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  const lotKgHaRow = mkRow('Indicadores — Lotação', 'Lotação — peso médio do mês\n(kg/ha)', m => {
    return areaProdutiva > 0 ? pesoFinMes(m) / areaProdutiva : 0;
  }, 'padrao');
  const lotKgHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — peso médio no período\n(kg/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotKgHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'padrao');

  rows.push(lotCabHaRow, lotCabHaAcumRow, uaRow, uaAcumRow, lotUaHaRow, lotUaHaAcumRow, lotKgHaRow, lotKgHaAcumRow);

  // ── Produção (biológico) ──
  // Fórmula: (Peso final - Peso inicial - Peso entradas + Peso saídas) / 30
  const arrobasProduzidasMesFn = (m: number): number => {
    const pFin = pesoFinMes(m);
    const pIni = pesoIniMes(m);
    if (pFin <= 0 || pIni <= 0) return 0;
    return (pFin - pIni - entradasKgMes(m) + saidasKgMes(m)) / 30;
  };

  const arrobasMesRow = mkRow('Indicadores — Produção', 'Produção de arrobas — no mês\n(@)', arrobasProduzidasMesFn, 'padrao');
  const arrobasPeriodoRow = mkRow('Indicadores — Produção', 'Produção de arrobas — no período\n(@)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += arrobasProduzidasMesFn(i); return acum;
  }, 'padrao');
  const arrobasHaMesRow = mkRow('Indicadores — Produção', 'Produção de arrobas por ha — no mês\n(@/ha)', m => {
    return areaProdutiva > 0 ? arrobasProduzidasMesFn(m) / areaProdutiva : 0;
  }, 'padrao');
  const arrobasHaPeriodoRow = mkRow('Indicadores — Produção', 'Produção de arrobas por ha — no período\n(@/ha)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += arrobasProduzidasMesFn(i);
    return areaProdutiva > 0 ? acum / areaProdutiva : 0;
  }, 'padrao');

  rows.push(arrobasMesRow, arrobasPeriodoRow, arrobasHaMesRow, arrobasHaPeriodoRow);

  // ── Desfrute (realização — arrobas das saídas) ──
  const desfruteMesRow = mkRow('Indicadores — Desfrute', 'Arrobas desfrutadas — no mês\n(@)', saidasArrobasMes, 'padrao');
  const desfrutePeriodoRow = mkRow('Indicadores — Desfrute', 'Arrobas desfrutadas — no período\n(@)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += saidasArrobasMes(i); return acum;
  }, 'padrao');

  rows.push(desfruteMesRow, desfrutePeriodoRow);

  // ── Desempenho (GMD) ──
  const gmdMesRow = mkRow('Indicadores — Desempenho', 'GMD — no mês\n(kg/cab/dia)', m => {
    const rebMedio = cabMediaMes(m);
    const dias = diasNoMes(m);
    if (rebMedio <= 0 || dias <= 0) return 0;
    return (pesoFinMes(m) - pesoIniMes(m) - entradasKgMes(m) + saidasKgMes(m)) / rebMedio / dias;
  }, 'gmd');

  const gmdPeriodoRow = mkRow('Indicadores — Desempenho', 'GMD — no período\n(kg/cab/dia)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = gmdMesRow.valores[i - 1]; if (v !== 0 || cabMediaMes(i) > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'gmd');

  rows.push(gmdMesRow, gmdPeriodoRow);

  return rows;
}

// ─── Financeiro helpers ───

interface FinRow {
  grupo: string;
  indicador: string;
  valores: number[];
  total: number;
  format: PainelFormatType;
}

function buildFinRows(
  lancamentos: FinanceiroLancamento[],
  ano: number,
  _ateMes: number,
  arrobasProdAcum?: number[],
  valorRebanhoMes?: number[],
  pesoFinMes?: number[],
): FinRow[] {
  const rows: FinRow[] = [];

  const conciliados = lancamentos.filter(l => isFinConciliado(l));
  const doAno = conciliados.filter(l => datePagtoAno(l) === ano);
  const doMes = (m: number) => doAno.filter(l => datePagtoMes(l) === m);

  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number): FinRow => {
    const valores = Array.from({ length: 12 }, (_, i) => fn(i + 1));
    const total = valores.reduce((a, b) => a + b, 0);
    return { grupo, indicador, valores, total, format: 'money' };
  };

  // Helper values per month
  const entMes = (m: number) => doMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saiMes = (m: number) => doMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const recPecMes = (m: number) => doMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === 'Receitas Pecuárias').reduce((s, l) => s + Math.abs(l.valor), 0);
  const deducMes = (m: number) => doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Dedução de Receitas').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembPecMes = (m: number) => doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Pec.').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembAgriMes = (m: number) => doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Agri.').reduce((s, l) => s + Math.abs(l.valor), 0);
  const reposMes = (m: number) => doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Reposição Bovinos').reduce((s, l) => s + Math.abs(l.valor), 0);

  // ═══════════════════════════════════════════════
  // 4️⃣ FINANCEIRO — Entradas em Caixa
  // ═══════════════════════════════════════════════
  const totalEntRow = mkRow('Entradas em Caixa', 'Total Entradas', entMes);
  rows.push(totalEntRow);

  CATEGORIAS_ENTRADA.forEach(cat => {
    rows.push(mkRow('Entradas em Caixa', cat, m =>
      doMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === cat).reduce((s, l) => s + Math.abs(l.valor), 0)));
  });

  // ═══════════════════════════════════════════════
  // 4️⃣ FINANCEIRO — Saídas em Caixa
  // ═══════════════════════════════════════════════
  const totalSaiRow = mkRow('Saídas em Caixa', 'Total Saídas', saiMes);
  rows.push(totalSaiRow);

  CATEGORIAS_SAIDA.forEach(cat => {
    rows.push(mkRow('Saídas em Caixa', cat, m =>
      doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === cat).reduce((s, l) => s + Math.abs(l.valor), 0)));
  });

  // ═══════════════════════════════════════════════
  // 4️⃣ FINANCEIRO — Indicadores Financeiros
  // ═══════════════════════════════════════════════
  rows.push(mkRow('Indicadores Financeiros', 'Saldo de caixa no mês\n(R$)', m => entMes(m) - saiMes(m)));

  rows.push(mkRow('Indicadores Financeiros', 'Saldo acumulado\n(R$)', m => {
    let acum = 0;
    for (let i = 1; i <= m; i++) acum += entMes(i) - saiMes(i);
    return acum;
  }));

  rows.push(mkRow('Indicadores Financeiros', 'Geração operacional\n(R$)', m => {
    return recPecMes(m) - deducMes(m) - desembPecMes(m);
  }));

  rows.push(mkRow('Indicadores Financeiros', 'Investimento (CAPEX)\n(R$)', m => {
    return reposMes(m) + desembAgriMes(m);
  }));

  // Custo por arroba e Margem por arroba — require arrobas data from zootécnico
  if (arrobasProdAcum) {
    rows.push(mkRow('Indicadores Financeiros', 'Custo por arroba\n(R$/@)', m => {
      const arrobas = arrobasProdAcum[m - 1] || 0;
      if (arrobas <= 0) return 0;
      let desembAcum = 0;
      for (let i = 1; i <= m; i++) desembAcum += desembPecMes(i);
      return desembAcum / arrobas;
    }));

    rows.push(mkRow('Indicadores Financeiros', 'Margem por arroba\n(R$/@)', m => {
      const arrobas = arrobasProdAcum[m - 1] || 0;
      if (arrobas <= 0) return 0;
      let recAcum = 0, desAcum = 0;
      for (let i = 1; i <= m; i++) { recAcum += recPecMes(i); desAcum += desembPecMes(i); }
      return (recAcum - desAcum) / arrobas;
    }));
  }

  rows.push(mkRow('Indicadores Financeiros', 'EBITDA\n(R$)', m => {
    return recPecMes(m) - deducMes(m) - desembPecMes(m) - desembAgriMes(m);
  }));

  // ═══════════════════════════════════════════════
  // INDICADORES PATRIMONIAIS
  // ═══════════════════════════════════════════════
  if (valorRebanhoMes && pesoFinMes) {
    rows.push(mkRow('Indicadores Patrimoniais', 'Valor do Rebanho\n(R$)', m => valorRebanhoMes[m - 1] || 0));
    rows.push(mkRow('Indicadores Patrimoniais', 'Valor da arroba — estoque final\n(R$/@)', m => {
      const vr = valorRebanhoMes[m - 1] || 0;
      const arrobasEstoque = (pesoFinMes[m - 1] || 0) / 30;
      return vr > 0 && arrobasEstoque > 0 ? vr / arrobasEstoque : 0;
    }));
  }

  return rows;
}

function fmtVal(v: number, format: PainelFormatType): string {
  return formatPainel(v, format);
}

// ─── Export ───

function buildExcelSheet(rows: (ZooRow | FinRow)[], mesesHeaders: string[], includeGrupo = true) {
  const data = rows.map((row) => {
    const base: Record<string, string | number> = includeGrupo
      ? { Grupo: row.grupo, Indicador: row.indicador }
      : { Indicador: row.indicador };

    mesesHeaders.forEach((mes, index) => {
      base[mes] = row.valores[index] ?? 0;
    });

    
    return base;
  });

  const cols = includeGrupo
    ? [{ wch: 18 }, { wch: 26 }, ...mesesHeaders.map(() => ({ wch: 14 }))]
    : [{ wch: 26 }, ...mesesHeaders.map(() => ({ wch: 14 }))];

  return { rows: data, cols };
}

function exportToExcel(zooRows: ZooRow[], finRows: FinRow[], ano: number, ateMes: number, fazendaNome: string) {
  const mesesHeaders = MESES_LABELS.slice(0, Math.max(1, Math.min(12, ateMes)));
  const filename = `Painel_Consultor_${fazendaNome.replace(/\s+/g, '_')}_${ano}.xlsx`;

  const zooSheet = buildExcelSheet(zooRows, mesesHeaders, true);
  const finSheet = buildExcelSheet(finRows, mesesHeaders, true);
  const movSheet = buildExcelSheet(zooRows.filter((row) => row.grupo.startsWith('Movimentações')), mesesHeaders, false);

  triggerXlsxDownload({
    filename,
    sheets: [
      { name: 'Zootecnico', rows: zooSheet.rows, cols: zooSheet.cols },
      { name: 'Financeiro', rows: finSheet.rows, cols: finSheet.cols },
      { name: 'Movimentacoes', rows: movSheet.rows, cols: movSheet.cols },
    ],
  });

  return filename;
}

// ─── Component ───

export function PainelConsultorTab({ onBack, filtroGlobal }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { lancamentos: lancPec, saldosIniciais } = useLancamentos();
  const { lancamentos: lancFin } = useFinanceiro();

  const [ano, setAno] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const [ateMes, setAteMes] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);
  const [tab, setTab] = useState<'zoo' | 'fin'>('zoo');
  const [cenario, setCenario] = useState<'realizado' | 'previsto'>('realizado');
  const [pesosPorMes, setPesosPorMes] = useState<Record<string, Record<string, number>>>({});
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(Array(12).fill(0));

  const anoNum = Number(ano);
  const anosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    s.add(String(new Date().getFullYear()));
    s.add(String(new Date().getFullYear() - 1));
    saldosIniciais.forEach(si => s.add(String(si.ano)));
    return Array.from(s).sort().reverse();
  }, [saldosIniciais]);

  const fazendaId = fazendaAtual?.id;

  // Load peso data from fechamento_pastos for each month
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || categorias.length === 0) {
      setPesosPorMes({});
      return;
    }
    (async () => {
      const result: Record<string, Record<string, number>> = {};
      for (let m = 1; m <= 12; m++) {
        const anoMes = `${anoNum}-${String(m).padStart(2, '0')}`;
        result[anoMes] = await loadPesosPastosPorCategoria(fazendaId, anoMes, categorias);
      }
      setPesosPorMes(result);
    })();
  }, [fazendaId, anoNum, categorias]);

  // Load valor do rebanho directly from the official fechamento table.
  // Global MUST be the exact sum of persisted farm totals for each month.
  useEffect(() => {
    if (!fazendaId) { setValorRebanhoMes(Array(12).fill(0)); return; }
    (async () => {
      const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);

      const fazendaIds = fazendaId === '__global__'
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id)
        : [fazendaId];

      if (fazendaIds.length === 0) {
        setValorRebanhoMes(Array(12).fill(0));
        return;
      }

      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .in('fazenda_id', fazendaIds)
        .in('ano_mes', meses);

      if (error) {
        console.error('Erro ao carregar valor do rebanho oficial:', error);
        setValorRebanhoMes(Array(12).fill(0));
        return;
      }

      const totaisPorMes = new Map(meses.map(mes => [mes, 0]));
      (data || []).forEach(row => {
        const atual = totaisPorMes.get(row.ano_mes) || 0;
        totaisPorMes.set(row.ano_mes, atual + (Number(row.valor_total) || 0));
      });

      setValorRebanhoMes(meses.map(mes => totaisPorMes.get(mes) || 0));
    })();
  }, [fazendaId, anoNum, fazendas]);

  const areaProdutiva = useMemo(() => calcAreaProdutivaPecuaria(pastos), [pastos]);

  const zooRows = useMemo<ZooRow[]>(() => {
    const rows = buildZooRows(lancPec, saldosIniciais, anoNum, ateMes, areaProdutiva, pesosPorMes);
    return Array.isArray(rows) ? rows : [];
  }, [lancPec, saldosIniciais, anoNum, ateMes, areaProdutiva, pesosPorMes]);

  // Extract arrobas acumuladas from zooRows for financial indicators
  const arrobasProdAcum = useMemo(() => {
    const prodRow = zooRows.find(r => r.indicador.startsWith('Produção de arrobas — no período'));
    return prodRow ? prodRow.valores : undefined;
  }, [zooRows]);

  // Extract peso final kg per month from zooRows for patrimonial indicators
  const pesoFinMesArr = useMemo(() => {
    const row = zooRows.find(r => r.indicador.startsWith('Peso total final\n(kg)'));
    return row ? row.valores : undefined;
  }, [zooRows]);

  const finRows = useMemo(
    () => buildFinRows(lancFin, anoNum, ateMes, arrobasProdAcum, valorRebanhoMes, pesoFinMesArr),
    [lancFin, anoNum, ateMes, arrobasProdAcum, valorRebanhoMes, pesoFinMesArr],
  );

  const fazendaNome = isGlobal ? 'Global' : (fazendaAtual?.nome || 'Fazenda');

  const handleExport = useCallback(() => {
    try {
      exportToExcel(zooRows, finRows, anoNum, ateMes, fazendaNome);
    } catch (err) {
      console.error('[EXPORT] Error:', err);
      toast.error('Não foi possível iniciar o download do Excel.');
    }
  }, [zooRows, finRows, anoNum, ateMes, fazendaNome]);

  const mesesVisiveis = MESES_LABELS.slice(0, ateMes);

  const renderTable = (rows: (ZooRow | FinRow)[]) => {
    let lastGrupo = '';
    const colCount = mesesVisiveis.length + 1;
    return (
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-[10px] border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '200px' }} />
            {mesesVisiveis.map((_, i) => (
              <col key={i} style={{ width: `${Math.max(52, Math.floor((100 - 20) / mesesVisiveis.length))}px` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th className="sticky left-0 z-20 bg-muted text-left text-[9px] font-semibold uppercase tracking-wider px-1.5 py-1">Indicador</th>
              {mesesVisiveis.map(m => (
                <th key={m} className="text-center text-[9px] font-semibold uppercase tracking-wider px-0.5 py-1">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const showGrupo = row.grupo !== lastGrupo;
              lastGrupo = row.grupo;
              const indicadorLines = row.indicador.split('\n');
              return (
                <React.Fragment key={idx}>
                  {showGrupo && (
                    <tr className="bg-muted/40">
                      <td
                        colSpan={colCount}
                        className="sticky left-0 text-[9px] font-bold text-primary uppercase tracking-wider py-0.5 px-1.5"
                      >
                        {row.grupo}
                      </td>
                    </tr>
                  )}
                  <tr className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="sticky left-0 z-10 bg-card text-[10px] font-medium py-0.5 px-1.5 leading-tight truncate">
                      {indicadorLines.length > 1 ? (
                        <>
                          {indicadorLines[0]}<br />
                          <span className="text-muted-foreground text-[9px]">{indicadorLines[1]}</span>
                        </>
                      ) : row.indicador}
                    </td>
                    {row.valores.slice(0, ateMes).map((v, i) => (
                      <td key={i} className="text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px]">
                        {fmtVal(v, row.format)}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-16">
      <div className="px-2 pt-2 space-y-1.5">
        {/* Toolbar: back + filters + tabs inline */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[72px] h-7 text-[11px] px-2 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border border-border/50 overflow-hidden h-7">
            <button
              onClick={() => setCenario('realizado')}
              className={`px-2.5 text-[11px] font-semibold h-full transition-colors ${
                cenario === 'realizado'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              Realizado
            </button>
            <button
              onClick={() => setCenario('previsto')}
              className={`px-2.5 text-[11px] font-semibold h-full transition-colors ${
                cenario === 'previsto'
                  ? 'bg-muted text-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              Previsto
            </button>
          </div>

          <div className="flex items-center rounded-md border border-border/50 overflow-hidden h-7">
            <button
              onClick={() => setTab('zoo')}
              className={`px-2.5 text-[11px] font-semibold h-full transition-colors ${
                tab === 'zoo'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              Zootécnico
            </button>
            <button
              onClick={() => setTab('fin')}
              className={`px-2.5 text-[11px] font-semibold h-full transition-colors ${
                tab === 'fin'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              Financeiro
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{fazendaNome} · {ano}</span>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-7 gap-1 text-[11px] px-2">
              <Download className="h-3 w-3" />
              Excel
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-1">
          {tab === 'zoo' ? renderTable(zooRows) : renderTable(finRows)}
        </div>
      </div>
    </div>
  );
}
