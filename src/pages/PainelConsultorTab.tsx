/**
 * Painel do Consultor — tabela analítica mensal (Zootécnico + Financeiro).
 * Leitura rápida, foco em conferência e fechamento.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
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
  format: 'int' | 'dec1' | 'dec2' | 'money' | 'kg';
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

  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number, format: ZooRow['format'] = 'int'): ZooRow => {
    const valores = Array.from({ length: 12 }, (_, i) => i + 1 <= ateMes ? fn(i + 1) : 0);
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
  const pesoIniKgRow = mkRow('Base — Início do Mês', 'Peso total inicial\n(kg)', pesoIniMes, 'kg');
  const pesoIniArrobasRow = mkRow('Base — Início do Mês', 'Peso total inicial\n(@)', m => pesoIniMes(m) / 30, 'dec1');
  const pesoMedioIniRow = mkRow('Base — Início do Mês', 'Peso médio inicial\n(kg/cab)', m => {
    const c = cabIniMes(m); return c > 0 ? pesoIniMes(m) / c : 0;
  }, 'dec2');

  rows.push(cabIniRow, pesoIniKgRow, pesoIniArrobasRow, pesoMedioIniRow);

  // ── Base Final do Mês ──
  const cabFinRow = mkRow('Base — Final do Mês', 'Cabeças finais\n(cab)', cabFinMes);
  const pesoFinKgRow = mkRow('Base — Final do Mês', 'Peso total final\n(kg)', pesoFinMes, 'kg');
  const pesoFinArrobasRow = mkRow('Base — Final do Mês', 'Peso total final\n(@)', m => pesoFinMes(m) / 30, 'dec1');
  const pesoMedioFinRow = mkRow('Base — Final do Mês', 'Peso médio final\n(kg/cab)', pesoMedioMes, 'dec2');

  rows.push(cabFinRow, pesoFinKgRow, pesoFinArrobasRow, pesoMedioFinRow);

  // ── Base Média do Mês ──
  const cabMediaMesRow = mkRow('Base — Média do Mês', 'Rebanho médio do mês\n(cab)', cabMediaMes, 'dec1');
  const pesoMedioRebMesRow = mkRow('Base — Média do Mês', 'Peso médio do rebanho — no mês\n(kg/cab)', pesoMedioMes, 'dec2');
  const areaMesRow = mkRow('Base — Média do Mês', 'Área produtiva — no mês\n(ha)', _m => areaProdutiva, 'dec1');

  rows.push(cabMediaMesRow, pesoMedioRebMesRow, areaMesRow);

  // ── Base Média do Período ──
  const cabMediaPeriodoRow = mkRow('Base — Média do Período', 'Rebanho médio no período\n(cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = cabMediaMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec1');

  const pesoMedioPeriodoRow = mkRow('Base — Média do Período', 'Peso médio no período\n(kg/cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = pesoMedioMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec2');

  const areaPeriodoRow = mkRow('Base — Média do Período', 'Área produtiva — média no período\n(ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = areaMesRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec1');

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
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0), 'kg'));
    rows.push(mkRow('Movimentações — Entradas', `${label}\n(@)`, m =>
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcArrobasSafe(l), 0), 'dec1'));
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
      lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0), 'kg'));
    if (temArroba) {
      rows.push(mkRow('Movimentações — Saídas', `${label}\n(@)`, m =>
        lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcArrobasSafe(l), 0), 'dec1'));
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
  const indAreaMesRow = mkRow('Indicadores — Área e Peso', 'Área produtiva — média no mês\n(ha)', _m => areaProdutiva, 'dec1');
  const indAreaPeriodoRow = mkRow('Indicadores — Área e Peso', 'Área produtiva — média no período\n(ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = indAreaMesRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec1');
  const indPesoMesRow = mkRow('Indicadores — Área e Peso', 'Peso médio do rebanho — no mês\n(kg/cab)', pesoMedioMes, 'dec2');
  const indPesoPeriodoRow = mkRow('Indicadores — Área e Peso', 'Peso médio do rebanho — no período\n(kg/cab)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = pesoMedioMes(i); if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec2');

  rows.push(indAreaMesRow, indAreaPeriodoRow, indPesoMesRow, indPesoPeriodoRow);

  // ── Lotação ──
  const lotCabHaRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio do mês\n(cab/ha)', m => {
    return areaProdutiva > 0 ? cabMediaMes(m) / areaProdutiva : 0;
  }, 'dec2');
  const lotCabHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio no período\n(cab/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotCabHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec2');

  const uaRow = mkRow('Indicadores — Lotação', 'UA — rebanho médio do mês\n(UA)', m => calcUA(cabMediaMes(m), 450), 'dec1');
  const uaAcumRow = mkRow('Indicadores — Lotação', 'UA — rebanho médio no período\n(UA)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = uaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec1');

  const lotUaHaRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio do mês\n(UA/ha)', m => {
    return areaProdutiva > 0 ? uaRow.valores[m - 1] / areaProdutiva : 0;
  }, 'dec2');
  const lotUaHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — rebanho médio no período\n(UA/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotUaHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec2');

  const lotKgHaRow = mkRow('Indicadores — Lotação', 'Lotação — peso médio do mês\n(kg/ha)', m => {
    return areaProdutiva > 0 ? pesoFinMes(m) / areaProdutiva : 0;
  }, 'dec1');
  const lotKgHaAcumRow = mkRow('Indicadores — Lotação', 'Lotação — peso médio no período\n(kg/ha)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = lotKgHaRow.valores[i - 1]; if (v > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec1');

  rows.push(lotCabHaRow, lotCabHaAcumRow, uaRow, uaAcumRow, lotUaHaRow, lotUaHaAcumRow, lotKgHaRow, lotKgHaAcumRow);

  // ── Produção (biológico) ──
  // Fórmula: (Peso final - Peso inicial - Peso entradas + Peso saídas) / 30
  const arrobasProduzidasMesFn = (m: number): number => {
    const pFin = pesoFinMes(m);
    const pIni = pesoIniMes(m);
    if (pFin <= 0 || pIni <= 0) return 0;
    return (pFin - pIni - entradasKgMes(m) + saidasKgMes(m)) / 30;
  };

  const arrobasMesRow = mkRow('Indicadores — Produção', 'Produção de arrobas — no mês\n(@)', arrobasProduzidasMesFn, 'dec1');
  const arrobasPeriodoRow = mkRow('Indicadores — Produção', 'Produção de arrobas — no período\n(@)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += arrobasProduzidasMesFn(i); return acum;
  }, 'dec1');
  const arrobasHaMesRow = mkRow('Indicadores — Produção', 'Produção de arrobas por ha — no mês\n(@/ha)', m => {
    return areaProdutiva > 0 ? arrobasProduzidasMesFn(m) / areaProdutiva : 0;
  }, 'dec2');
  const arrobasHaPeriodoRow = mkRow('Indicadores — Produção', 'Produção de arrobas por ha — no período\n(@/ha)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += arrobasProduzidasMesFn(i);
    return areaProdutiva > 0 ? acum / areaProdutiva : 0;
  }, 'dec2');

  rows.push(arrobasMesRow, arrobasPeriodoRow, arrobasHaMesRow, arrobasHaPeriodoRow);

  // ── Desfrute (realização — arrobas das saídas) ──
  const desfruteMesRow = mkRow('Indicadores — Desfrute', 'Arrobas desfrutadas — no mês\n(@)', saidasArrobasMes, 'dec1');
  const desfrutePeriodoRow = mkRow('Indicadores — Desfrute', 'Arrobas desfrutadas — no período\n(@)', m => {
    let acum = 0; for (let i = 1; i <= m; i++) acum += saidasArrobasMes(i); return acum;
  }, 'dec1');

  rows.push(desfruteMesRow, desfrutePeriodoRow);

  // ── Desempenho (GMD) ──
  const gmdMesRow = mkRow('Indicadores — Desempenho', 'GMD — no mês\n(kg/cab/dia)', m => {
    const rebMedio = cabMediaMes(m);
    const dias = diasNoMes(m);
    if (rebMedio <= 0 || dias <= 0) return 0;
    return (pesoFinMes(m) - pesoIniMes(m) - entradasKgMes(m) + saidasKgMes(m)) / rebMedio / dias;
  }, 'dec2');

  const gmdPeriodoRow = mkRow('Indicadores — Desempenho', 'GMD — no período\n(kg/cab/dia)', m => {
    let soma = 0, n = 0;
    for (let i = 1; i <= m; i++) { const v = gmdMesRow.valores[i - 1]; if (v !== 0 || cabMediaMes(i) > 0) { soma += v; n++; } }
    return n > 0 ? soma / n : 0;
  }, 'dec2');

  rows.push(gmdMesRow, gmdPeriodoRow);

  return rows;
}

// ─── Financeiro helpers ───

interface FinRow {
  grupo: string;
  indicador: string;
  valores: number[];
  total: number;
  format: 'money';
}

function buildFinRows(
  lancamentos: FinanceiroLancamento[],
  ano: number,
  ateMes: number,
  arrobasProdAcum?: number[],
  valorRebanhoMes?: number[],
  pesoFinMes?: number[],
): FinRow[] {
  const rows: FinRow[] = [];

  const conciliados = lancamentos.filter(l => isFinConciliado(l));
  const doAno = conciliados.filter(l => datePagtoAno(l) === ano);
  const doMes = (m: number) => doAno.filter(l => datePagtoMes(l) === m);

  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number): FinRow => {
    const valores = Array.from({ length: 12 }, (_, i) => i + 1 <= ateMes ? fn(i + 1) : 0);
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

function fmtVal(v: number, format: string): string {
  if (format === 'money') return formatMoeda(v);
  if (format === 'dec1') return v === 0 ? '-' : v.toFixed(1);
  if (format === 'dec2') return v === 0 ? '-' : v.toFixed(2);
  if (format === 'kg') return v === 0 ? '-' : formatNum(v);
  return v === 0 ? '-' : formatNum(v);
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
  const [pesosPorMes, setPesosPorMes] = useState<Record<string, Record<string, number>>>({});

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

  const areaProdutiva = useMemo(() => calcAreaProdutivaPecuaria(pastos), [pastos]);

  const zooRows = useMemo(
    () => buildZooRows(lancPec, saldosIniciais, anoNum, ateMes, areaProdutiva, pesosPorMes),
    [lancPec, saldosIniciais, anoNum, ateMes, areaProdutiva, pesosPorMes],
  );

  // Extract arrobas acumuladas from zooRows for financial indicators
  const arrobasProdAcum = useMemo(() => {
    const prodRow = zooRows.find(r => r.indicador.startsWith('Produção de arrobas — no período'));
    return prodRow ? prodRow.valores : undefined;
  }, [zooRows]);

  const finRows = useMemo(
    () => buildFinRows(lancFin, anoNum, ateMes, arrobasProdAcum),
    [lancFin, anoNum, ateMes, arrobasProdAcum],
  );

  const fazendaNome = isGlobal ? 'Global' : (fazendaAtual?.nome || 'Fazenda');

  const handleExport = useCallback(() => {
    console.log('[EXPORT-DIAG] handleExport CLICADO');
    console.log('[EXPORT-DIAG] zooRows:', zooRows.length, 'finRows:', finRows.length, 'ano:', anoNum, 'ateMes:', ateMes);
    try {
      exportToExcel(zooRows, finRows, anoNum, ateMes, fazendaNome);
      console.log('[EXPORT-DIAG] exportToExcel retornou sem erro');
    } catch (err) {
      console.error('[EXPORT-DIAG] ERRO no exportToExcel:', err);
      toast.error('Não foi possível iniciar o download do Excel.');
    }
  }, [zooRows, finRows, anoNum, ateMes, fazendaNome]);

  const mesesVisiveis = MESES_LABELS.slice(0, ateMes);

  const renderTable = (rows: (ZooRow | FinRow)[]) => {
    let lastGrupo = '';
    return (
      <div className="overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-muted text-[10px] font-bold w-[220px] min-w-[220px] max-w-[220px]">Indicador</TableHead>
              {mesesVisiveis.map(m => (
                <TableHead key={m} className="text-[10px] font-bold text-center w-[88px] min-w-[80px] max-w-[100px]">{m}</TableHead>
              ))}
              
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const showGrupo = row.grupo !== lastGrupo;
              lastGrupo = row.grupo;
              const indicadorLines = row.indicador.split('\n');
              return (
                <>
                  {showGrupo && (
                    <TableRow key={`grp-${row.grupo}-${idx}`} className="bg-primary/5">
                      <TableCell
                        colSpan={mesesVisiveis.length + 1}
                        className="sticky left-0 text-[10px] font-bold text-primary uppercase tracking-wider py-1.5 px-2"
                      >
                        {row.grupo}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow key={`row-${idx}`} className="hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-card text-[10px] font-medium py-1 px-2 w-[220px] min-w-[220px] max-w-[220px]">
                      {indicadorLines.length > 1 ? (
                        <span className="leading-tight">
                          {indicadorLines[0]}<br />
                          <span className="text-muted-foreground">{indicadorLines[1]}</span>
                        </span>
                      ) : row.indicador}
                    </TableCell>
                    {row.valores.slice(0, ateMes).map((v, i) => (
                      <TableCell key={i} className="text-[10px] text-right py-1 px-1.5 tabular-nums whitespace-nowrap w-[88px]">
                        {fmtVal(v, row.format)}
                      </TableCell>
                    ))}
                  </TableRow>
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in pb-20">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Painel do Consultor</h1>
              <p className="text-[10px] text-muted-foreground">{fazendaNome} · {ano} até {MESES_LABELS[ateMes - 1]}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[90px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(ateMes)} onValueChange={v => setAteMes(Number(v))}>
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_LABELS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)} className="text-xs">Até {m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={v => setTab(v as 'zoo' | 'fin')}>
          <TabsList className="w-full">
            <TabsTrigger value="zoo" className="flex-1 text-xs">Zootécnico</TabsTrigger>
            <TabsTrigger value="fin" className="flex-1 text-xs">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="zoo" className="mt-3">
            {renderTable(zooRows)}
          </TabsContent>

          <TabsContent value="fin" className="mt-3">
            {renderTable(finRows)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
