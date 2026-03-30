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
} from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe, calcValorTotal, calcGMD } from '@/lib/calculos/economicos';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
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

  // Per-month lancamentos (conciliado)
  const lancAno = lancamentos.filter(l => l.data.substring(0, 4) === String(ano) && isLancConciliado(l));
  const lancMes = (m: number) => {
    const prefix = `${ano}-${String(m).padStart(2, '0')}`;
    return lancAno.filter(l => l.data.startsWith(prefix));
  };

  // Helper: create row from monthly values
  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number, format: ZooRow['format'] = 'int'): ZooRow => {
    const valores = Array.from({ length: 12 }, (_, i) => i + 1 <= ateMes ? fn(i + 1) : 0);
    const total = valores.reduce((a, b) => a + b, 0);
    return { grupo, indicador, valores, total, format };
  };

  // ─ BASE MENSAL ─
  const cabIniRow = mkRow('Base Mensal', 'Cabeças iniciais', m => {
    const k = String(m).padStart(2, '0');
    return m === 1 ? saldoInicialAno : (saldoInicioMes[k] ?? 0);
  });

  const pesoIniRow = mkRow('Base Mensal', 'Peso inicial kg', m => {
    if (m === 1) {
      return saldosIniciais.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    }
    // Use previous month's final peso
    return pesoFinKgRow_valores[m - 2] ?? 0;
  }, 'kg');

  // Pre-compute peso final per month for reference by pesoIniRow
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

  const pesoIniArrobasRow = mkRow('Base Mensal', 'Peso inicial @', m => pesoIniRow.valores[m - 1] / 30, 'dec1');

  // Entradas
  const entradasCabRow = mkRow('Base Mensal', 'Entradas (cab)', m => {
    const resumo = calcResumoMovimentacoes(lancamentos, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalEntradas;
  });

  const entradasKgRow = mkRow('Base Mensal', 'Entradas (kg)', m => {
    const lm = lancMes(m).filter(l => ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo));
    return lm.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  }, 'kg');

  const entradasArrobasRow = mkRow('Base Mensal', 'Entradas (@)', m => {
    const lm = lancMes(m).filter(l => ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo));
    return lm.reduce((s, l) => s + calcArrobasSafe(l), 0);
  }, 'dec1');

  // Saídas
  const saidasCabRow = mkRow('Base Mensal', 'Saídas (cab)', m => {
    const resumo = calcResumoMovimentacoes(lancamentos, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalSaidas;
  });

  const saidasKgRow = mkRow('Base Mensal', 'Saídas (kg)', m => {
    const lm = lancMes(m).filter(l => ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo));
    return lm.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  }, 'kg');

  const saidasArrobasRow = mkRow('Base Mensal', 'Saídas (@)', m => {
    const lm = lancMes(m).filter(l => ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo));
    return lm.reduce((s, l) => s + calcArrobasSafe(l), 0);
  }, 'dec1');

  const cabFinRow = mkRow('Base Mensal', 'Cabeças finais', m => saldoFimMes(m));

  const pesoFinKgRow = mkRow('Base Mensal', 'Peso final kg', m => {
    return pesoFinKgRow_valores[m - 1] ?? 0;
  }, 'kg');

  const pesoFinArrobasRow = mkRow('Base Mensal', 'Peso final @', m => pesoFinKgRow.valores[m - 1] / 30, 'dec1');

  const pesoMedioFinRow = mkRow('Base Mensal', 'Peso médio final', m => {
    const cab = cabFinRow.valores[m - 1];
    const pesoKg = pesoFinKgRow.valores[m - 1];
    return cab > 0 ? pesoKg / cab : 0;
  }, 'dec2');

  rows.push(cabIniRow, pesoIniRow, pesoIniArrobasRow, entradasCabRow, entradasKgRow, entradasArrobasRow, saidasCabRow, saidasKgRow, saidasArrobasRow, cabFinRow, pesoFinKgRow, pesoFinArrobasRow, pesoMedioFinRow);

  // ─ ACUMULADOS ─
  const entAcumRow = mkRow('Acumulados', 'Entradas acumuladas', m => {
    let acum = 0;
    for (let i = 1; i <= m; i++) acum += entradasCabRow.valores[i - 1];
    return acum;
  });

  const saiAcumRow = mkRow('Acumulados', 'Saídas acumuladas', m => {
    let acum = 0;
    for (let i = 1; i <= m; i++) acum += saidasCabRow.valores[i - 1];
    return acum;
  });

  const cabMediaRow = mkRow('Acumulados', 'Cabeças médias', m => {
    return (cabIniRow.valores[m - 1] + cabFinRow.valores[m - 1]) / 2;
  }, 'dec1');

  rows.push(entAcumRow, saiAcumRow, cabMediaRow);

  // ─ INDICADORES ─
  const lotCabHaRow = mkRow('Indicadores', 'Lotação cab/ha', m => {
    if (areaProdutiva <= 0) return 0;
    return cabFinRow.valores[m - 1] / areaProdutiva;
  }, 'dec2');

  const uaRow = mkRow('Indicadores', 'UA', m => calcUA(cabFinRow.valores[m - 1], 450), 'dec1');

  const lotUaHaRow = mkRow('Indicadores', 'Lotação UA/ha', m => {
    if (areaProdutiva <= 0) return 0;
    return uaRow.valores[m - 1] / areaProdutiva;
  }, 'dec2');

  const lotKgHaRow = mkRow('Indicadores', 'Lotação kg/ha', m => {
    if (areaProdutiva <= 0) return 0;
    return (cabFinRow.valores[m - 1] * 450) / areaProdutiva;
  }, 'dec1');

  const arrobasProdRow = mkRow('Indicadores', 'Arrobas produzidas', m => {
    return saidasArrobasRow.valores[m - 1];
  }, 'dec1');

  rows.push(lotCabHaRow, uaRow, lotUaHaRow, lotKgHaRow, arrobasProdRow);

  // ─ MOVIMENTAÇÕES ─
  const tiposMov = [
    { tipo: 'nascimento', label: 'Nascimentos' },
    { tipo: 'compra', label: 'Compras' },
    { tipo: 'transferencia_entrada', label: 'Transf. entrada' },
    { tipo: 'transferencia_saida', label: 'Transf. saída' },
    { tipo: 'abate', label: 'Abates' },
    { tipo: 'venda', label: 'Vendas' },
    { tipo: 'consumo', label: 'Consumo' },
    { tipo: 'morte', label: 'Mortes' },
  ];

  tiposMov.forEach(({ tipo, label }) => {
    const qtdRow = mkRow('Movimentações', `${label} — qtd`, m => {
      return lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0);
    });

    const qtdAcumRow = mkRow('Movimentações', `${label} — acum`, m => {
      let acum = 0;
      for (let i = 1; i <= m; i++) acum += qtdRow.valores[i - 1];
      return acum;
    });

    const pesoRow = mkRow('Movimentações', `${label} — kg`, m => {
      return lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    }, 'kg');

    const arrobasRow = mkRow('Movimentações', `${label} — @`, m => {
      return lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcArrobasSafe(l), 0);
    }, 'dec1');

    const valorRow = mkRow('Movimentações', `${label} — R$`, m => {
      return lancMes(m).filter(l => l.tipo === tipo).reduce((s, l) => s + calcValorTotal(l), 0);
    }, 'money');

    rows.push(qtdRow, qtdAcumRow, pesoRow, arrobasRow, valorRow);
  });

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
): FinRow[] {
  const rows: FinRow[] = [];

  // Filter conciliado + correct year (by data_pagamento)
  const conciliados = lancamentos.filter(l => isFinConciliado(l));
  const doAno = conciliados.filter(l => datePagtoAno(l) === ano);
  const doMes = (m: number) => doAno.filter(l => datePagtoMes(l) === m);

  const mkRow = (grupo: string, indicador: string, fn: (m: number) => number): FinRow => {
    const valores = Array.from({ length: 12 }, (_, i) => i + 1 <= ateMes ? fn(i + 1) : 0);
    const total = valores.reduce((a, b) => a + b, 0);
    return { grupo, indicador, valores, total, format: 'money' };
  };

  // ─ ENTRADAS ─
  const totalEntRow = mkRow('Entradas', 'Total Entradas', m =>
    doMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0));

  rows.push(totalEntRow);

  CATEGORIAS_ENTRADA.forEach(cat => {
    rows.push(mkRow('Entradas', cat, m =>
      doMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === cat).reduce((s, l) => s + Math.abs(l.valor), 0)));
  });

  // ─ SAÍDAS ─
  const totalSaiRow = mkRow('Saídas', 'Total Saídas', m =>
    doMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0));

  rows.push(totalSaiRow);

  CATEGORIAS_SAIDA.forEach(cat => {
    rows.push(mkRow('Saídas', cat, m =>
      doMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === cat).reduce((s, l) => s + Math.abs(l.valor), 0)));
  });

  // ─ SALDO ─
  rows.push(mkRow('Saldo', 'Saldo mensal', m => {
    const ent = doMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    const sai = doMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    return ent - sai;
  }));

  rows.push(mkRow('Saldo', 'Saldo acumulado', m => {
    let acum = 0;
    for (let i = 1; i <= m; i++) {
      const ent = doMes(i).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
      const sai = doMes(i).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
      acum += ent - sai;
    }
    return acum;
  }));

  return rows;
}

// ─── Format value ───

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

    base.Total = row.total ?? 0;
    return base;
  });

  const cols = includeGrupo
    ? [{ wch: 18 }, { wch: 26 }, ...mesesHeaders.map(() => ({ wch: 14 })), { wch: 14 }]
    : [{ wch: 26 }, ...mesesHeaders.map(() => ({ wch: 14 })), { wch: 14 }];

  return { rows: data, cols };
}

function exportToExcel(zooRows: ZooRow[], finRows: FinRow[], ano: number, ateMes: number, fazendaNome: string) {
  const mesesHeaders = MESES_LABELS.slice(0, Math.max(1, Math.min(12, ateMes)));
  const filename = `Painel_Consultor_${fazendaNome.replace(/\s+/g, '_')}_${ano}.xlsx`;

  const zooSheet = buildExcelSheet(zooRows, mesesHeaders, true);
  const finSheet = buildExcelSheet(finRows, mesesHeaders, true);
  const movSheet = buildExcelSheet(zooRows.filter((row) => row.grupo === 'Movimentações'), mesesHeaders, false);

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

  const finRows = useMemo(
    () => buildFinRows(lancFin, anoNum, ateMes),
    [lancFin, anoNum, ateMes],
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
              <TableHead className="sticky left-0 z-10 bg-muted text-[10px] font-bold min-w-[180px]">Indicador</TableHead>
              {mesesVisiveis.map(m => (
                <TableHead key={m} className="text-[10px] font-bold text-center min-w-[70px]">{m}</TableHead>
              ))}
              <TableHead className="text-[10px] font-bold text-center min-w-[80px] bg-muted">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const showGrupo = row.grupo !== lastGrupo;
              lastGrupo = row.grupo;
              return (
                <>
                  {showGrupo && (
                    <TableRow key={`grp-${row.grupo}-${idx}`} className="bg-primary/5">
                      <TableCell
                        colSpan={mesesVisiveis.length + 2}
                        className="sticky left-0 text-[10px] font-bold text-primary uppercase tracking-wider py-1.5 px-2"
                      >
                        {row.grupo}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow key={`row-${idx}`} className="hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-card text-[10px] font-medium py-1 px-2 whitespace-nowrap">
                      {row.indicador}
                    </TableCell>
                    {row.valores.slice(0, ateMes).map((v, i) => (
                      <TableCell key={i} className="text-[10px] text-right py-1 px-1.5 tabular-nums whitespace-nowrap">
                        {fmtVal(v, row.format)}
                      </TableCell>
                    ))}
                    <TableCell className="text-[10px] text-right py-1 px-1.5 tabular-nums whitespace-nowrap font-bold bg-muted/30">
                      {fmtVal(row.total, row.format)}
                    </TableCell>
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
