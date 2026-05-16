/**
 * ChuvasTab — bifurca planilha operacional vs painel analítico.
 *
 * Regra oficial do módulo Chuvas (não misturar):
 *   • mode='operacional' (lançamento)
 *       - Fazenda → planilha diária editável
 *       - Global  → BLOQUEADO (mensagem "Selecione uma fazenda")
 *   • mode='analitico' (dashboard)
 *       - Global  → ChuvasGlobalView (comparativo entre fazendas)
 *       - Fazenda → placeholder "Análise pluviométrica por fazenda — em construção"
 *
 * Default = 'operacional' (preserva comportamento legado em Index.tsx).
 */
import { useState, useMemo, useEffect, Fragment } from 'react';
import { useChuvas } from '@/hooks/useChuvas';
import { useFazenda } from '@/contexts/FazendaContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CloudRain, Plus, BarChart3, Construction } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChuvasGlobalView } from './ChuvasGlobalView';

export type ChuvasMode = 'operacional' | 'analitico';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function diasNoMes(mes: number, ano: number) {
  return new Date(ano, mes, 0).getDate();
}

interface Props {
  anoInicial?: string;
  /** Define a finalidade da tela. Default 'operacional' (planilha). */
  mode?: ChuvasMode;
}

export function ChuvasTab({ anoInicial, mode = 'operacional' }: Props = {}) {
  const { chuvas, loading, salvarChuva } = useChuvas();
  const { isGlobal } = useFazenda();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anoFiltro, setAnoFiltro] = useState(currentYear);
  // Filtro de mês limita o período (01/jan → fim do mês).
  // Default = mês atual quando ano filtro = ano corrente; senão Dez.
  const [mesFiltro, setMesFiltro] = useState(currentMonth);

  useEffect(() => {
    if (anoInicial) setAnoFiltro(Number(anoInicial));
  }, [anoInicial]);

  // Quando troca de ano: se ano selecionado < corrente, ir para Dez (ano completo);
  // se ano = corrente, voltar para mês atual; ano futuro → Dez.
  useEffect(() => {
    if (anoFiltro < currentYear) setMesFiltro(12);
    else if (anoFiltro === currentYear) setMesFiltro(currentMonth);
    else setMesFiltro(12);
  }, [anoFiltro, currentYear, currentMonth]);

  // Dialog state for quick entry
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novaData, setNovaData] = useState(new Date().toISOString().slice(0, 10));
  const [novaMm, setNovaMm] = useState('');
  const [novaObs, setNovaObs] = useState('');

  // Collect available years
  const anos = useMemo(() => {
    const s = new Set<number>();
    s.add(currentYear);
    chuvas.forEach(c => {
      const y = parseInt(c.data.slice(0, 4));
      if (!isNaN(y)) s.add(y);
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [chuvas, currentYear]);

  // Build lookup: "MM-DD" -> mm for selected year
  const chuvaMap = useMemo(() => {
    const map: Record<string, number> = {};
    chuvas.forEach(c => {
      const y = parseInt(c.data.slice(0, 4));
      if (y === anoFiltro) {
        const key = c.data.slice(5); // "MM-DD"
        map[key] = (map[key] || 0) + c.milimetros;
      }
    });
    return map;
  }, [chuvas, anoFiltro]);

  // Historical years data
  const historicalYears = useMemo(() => {
    return anos.filter(a => a !== anoFiltro).slice(0, 5);
  }, [anos, anoFiltro]);

  const historicalMaps = useMemo(() => {
    const maps: Record<number, Record<string, number>> = {};
    historicalYears.forEach(year => {
      maps[year] = {};
      chuvas.forEach(c => {
        const y = parseInt(c.data.slice(0, 4));
        if (y === year) {
          const key = c.data.slice(5);
          maps[year][key] = (maps[year][key] || 0) + c.milimetros;
        }
      });
    });
    return maps;
  }, [chuvas, historicalYears]);

  // Monthly totals
  const monthlyTotals = useMemo(() => {
    const totals: number[] = Array(12).fill(0);
    Object.entries(chuvaMap).forEach(([key, mm]) => {
      const m = parseInt(key.slice(0, 2)) - 1;
      if (m >= 0 && m < 12) totals[m] += mm;
    });
    return totals;
  }, [chuvaMap]);

  const yearTotal = monthlyTotals.reduce((a, b) => a + b, 0);

  // Accumulated totals
  const accumulatedTotals = useMemo(() => {
    const acc: number[] = [];
    let sum = 0;
    monthlyTotals.forEach(v => { sum += v; acc.push(sum); });
    return acc;
  }, [monthlyTotals]);

  const maxDays = 31;

  const handleSalvar = async () => {
    const mm = parseFloat(novaMm);
    if (isNaN(mm) || mm < 0) { toast.error('Informe um valor válido'); return; }
    await salvarChuva(novaData, mm, novaObs || undefined);
    setDialogOpen(false);
    setNovaMm('');
    setNovaObs('');
  };

  // Cell click to quickly add/edit
  const [editCell, setEditCell] = useState<{ dia: number; mes: number } | null>(null);
  const [editMm, setEditMm] = useState('');

  const handleCellClick = (dia: number, mes: number) => {
    if (isGlobal) return;
    const maxD = diasNoMes(mes + 1, anoFiltro);
    if (dia + 1 > maxD) return;
    const key = `${String(mes + 1).padStart(2, '0')}-${String(dia + 1).padStart(2, '0')}`;
    setEditCell({ dia, mes });
    setEditMm(chuvaMap[key]?.toString() || '');
  };

  const handleCellSave = async () => {
    if (!editCell) return;
    const mm = parseFloat(editMm);
    if (isNaN(mm) || mm < 0) { toast.error('Valor inválido'); return; }
    const dataStr = `${anoFiltro}-${String(editCell.mes + 1).padStart(2, '0')}-${String(editCell.dia + 1).padStart(2, '0')}`;
    await salvarChuva(dataStr, mm);
    setEditCell(null);
    setEditMm('');
  };

  const getCellColor = (mm: number) => {
    if (mm === 0) return '';
    if (mm <= 5) return 'bg-blue-100 dark:bg-blue-900/30';
    if (mm <= 15) return 'bg-blue-200 dark:bg-blue-800/40';
    if (mm <= 30) return 'bg-blue-300 dark:bg-blue-700/50';
    if (mm <= 50) return 'bg-blue-400 dark:bg-blue-600/60 text-white';
    return 'bg-blue-600 dark:bg-blue-500/80 text-white font-bold';
  };

  if (loading) return <div className="p-4 text-center text-muted-foreground">Carregando...</div>;

  // Regras de finalidade ↓
  const isOperacional = mode === 'operacional';
  const isAnalitico   = mode === 'analitico';
  const mostrarFiltroMes = isAnalitico; // filtro mês só faz sentido em painel
  const mostrarBotaoLancar = isOperacional && !isGlobal;
  const headerSub = isOperacional
    ? (isGlobal ? 'Selecione uma fazenda para lançar' : `Total: ${yearTotal.toFixed(1)} mm`)
    : (isGlobal
        ? `Comparativo entre fazendas — Jan a ${MESES[mesFiltro - 1]}/${anoFiltro}`
        : `Análise por fazenda — Jan a ${MESES[mesFiltro - 1]}/${anoFiltro}`);

  return (
    <div className="pb-20">
      {/* Header - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-blue-500" />
            {!anoInicial && (
            <Select value={String(anoFiltro)} onValueChange={v => setAnoFiltro(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
            {mostrarFiltroMes && (
              <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="text-sm font-semibold text-muted-foreground">{headerSub}</span>
          </div>

          {mostrarBotaoLancar && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-4 w-4" /> Lançar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Registrar Chuva</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} />
                  </div>
                  <div>
                    <Label>Milímetros (mm)</Label>
                    <Input type="number" step="0.1" min="0" value={novaMm} onChange={e => setNovaMm(e.target.value)} placeholder="0.0" />
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Input value={novaObs} onChange={e => setNovaObs(e.target.value)} placeholder="Opcional" />
                  </div>
                  <Button onClick={handleSalvar} className="w-full">Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Bifurcação por finalidade ─────────────────────────────────────
          operacional + Global   → bloqueio
          operacional + Fazenda  → planilha (heatmap editável)
          analítico   + Global   → ChuvasGlobalView
          analítico   + Fazenda  → placeholder (em construção) */}
      {isOperacional && isGlobal && (
        <BloqueioGlobalOperacional anoFiltro={anoFiltro} />
      )}
      {isAnalitico && isGlobal && (
        <ChuvasGlobalView anoFiltro={anoFiltro} mesFiltro={mesFiltro} />
      )}
      {isAnalitico && !isGlobal && (
        <PlaceholderAnaliticoFazenda />
      )}
      {isOperacional && !isGlobal && (
      <div className="px-2">{/* PLANILHA OPERACIONAL ─────────────────── */}

      {/* Grid anual — 12 blocos lado a lado, cada um com sub-colunas Dia|mm.
          24 colunas no corpo (12 meses × 2) + 1 coluna lateral de label para
          rodapé (Total/Acum./históricos). table-fixed + colgroup mantém
          larguras constantes mesmo ao abrir input inline. text-[10px] +
          padding mínimo para caber 12 meses sem rolagem horizontal em
          desktop; min-w-[680px] aciona scroll horizontal só em tela pequena.
          Linha "Total" aparece sticky no topo (visível sem rolar) e
          duplicada no rodapé junto aos acumulados e históricos. */}
      <div className="overflow-auto max-h-[calc(100vh-140px)]">
        <table className="w-full text-[10px] tabular-nums leading-tight border-collapse min-w-[680px] table-fixed">
          <colgroup>
            <col style={{ width: 32 }} />
            {Array.from({ length: 24 }, (_, i) => (
              <col key={i} style={{ width: i % 2 === 0 ? 22 : 32 }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            {/* Linha 1: nome do mês (colspan=2 sobre Dia|mm) */}
            <tr className="bg-[#1E3A5F] text-white">
              <th rowSpan={2} className="border border-[#24466B] px-0.5 py-0.5 text-center font-semibold" />
              {MESES.map((m, i) => (
                <th key={i} colSpan={2} className="border border-[#24466B] px-1 py-0.5 text-center font-semibold">{m}</th>
              ))}
            </tr>
            {/* Linha 2: sub-cabeçalho Dia | mm */}
            <tr className="bg-[#24466B] text-white/90">
              {Array.from({ length: 12 }, (_, i) => (
                <Fragment key={i}>
                  <th className="border border-[#1E3A5F] px-0.5 py-0 text-center text-[9px] font-medium">Dia</th>
                  <th className="border border-[#1E3A5F] px-0.5 py-0 text-center text-[9px] font-medium">mm</th>
                </Fragment>
              ))}
            </tr>
            {/* Linha 3: Total mensal STICKY (visível sem rolar) */}
            <tr className="bg-blue-100/80 dark:bg-blue-900/40 font-bold border-b-2 border-[#1E3A5F]/40">
              <th className="border border-border px-0.5 py-0.5 text-center text-[#1E3A5F] dark:text-blue-200">Tot</th>
              {monthlyTotals.map((t, i) => (
                <th key={i} colSpan={2} className="border border-border px-1 py-0.5 text-center text-[#1E3A5F] dark:text-blue-200 font-bold">
                  {t > 0 ? t.toFixed(1) : '-'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Day rows — para cada dia 1..31, render 12 pares (Dia, mm).
                Dia inexistente no mês (ex.: 30 fev, 31 abr) → célula
                desabilitada (bg cinza, sem número, sem clique). */}
            {Array.from({ length: maxDays }, (_, dia) => (
              <tr key={dia} className="hover:bg-muted/20">
                <td aria-hidden className="border border-border" />
                {Array.from({ length: 12 }, (_, mes) => {
                  const d = dia + 1;
                  const maxD = diasNoMes(mes + 1, anoFiltro);
                  const dayExists = d <= maxD;
                  const key = `${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const mm = chuvaMap[key] || 0;
                  const isEditing = editCell?.dia === dia && editCell?.mes === mes;

                  if (!dayExists) {
                    return (
                      <Fragment key={mes}>
                        <td className="border border-border bg-muted/30" />
                        <td className="border border-border bg-muted/30" />
                      </Fragment>
                    );
                  }

                  if (isEditing) {
                    return (
                      <Fragment key={mes}>
                        <td className="border border-border px-0.5 py-0 text-center text-muted-foreground">{d}</td>
                        <td className="border border-border p-0 overflow-hidden">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={editMm}
                            onChange={e => setEditMm(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={e => e.key === 'Enter' && handleCellSave()}
                            autoFocus
                            className="h-4 w-full min-w-0 text-[10px] px-0.5 rounded-none border-0 text-center tabular-nums box-border"
                          />
                        </td>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={mes}>
                      <td className="border border-border px-0.5 py-0 text-center text-muted-foreground">{d}</td>
                      <td
                        className={`border border-border px-0.5 py-0 text-center cursor-pointer transition-colors ${getCellColor(mm)}`}
                        onClick={() => handleCellClick(dia, mes)}
                      >
                        {mm > 0 ? mm.toFixed(1) : '-'}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* === TOTAL MENSAL (rodapé) === */}
            <tr className="bg-blue-100/70 dark:bg-blue-900/30 font-bold border-t-2 border-[#1E3A5F]/40">
              <td className="border border-border px-0.5 py-0.5 text-center text-[#1E3A5F] dark:text-blue-200">Tot</td>
              {monthlyTotals.map((t, i) => (
                <td key={i} colSpan={2} className="border border-border px-1 py-0.5 text-center text-[#1E3A5F] dark:text-blue-200 font-bold">
                  {t > 0 ? t.toFixed(1) : '-'}
                </td>
              ))}
            </tr>

            {/* Históricos — total mensal por ano */}
            {historicalYears.map(year => {
              const yearMap = historicalMaps[year] || {};
              const mTotals = Array(12).fill(0) as number[];
              Object.entries(yearMap).forEach(([key, mm]) => {
                const m = parseInt(key.slice(0, 2)) - 1;
                if (m >= 0 && m < 12) mTotals[m] += mm;
              });

              return (
                <tr key={`total-${year}`} className="bg-muted/30 text-muted-foreground">
                  <td className="border border-border px-0.5 py-0.5 text-center font-semibold">{year}</td>
                  {mTotals.map((t, i) => (
                    <td key={i} colSpan={2} className="border border-border px-1 py-0.5 text-center">
                      {t > 0 ? t.toFixed(1) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* === ACUMULADO === */}
            <tr className="bg-blue-200/60 dark:bg-blue-900/40 font-bold border-t border-[#1E3A5F]/30">
              <td className="border border-border px-0.5 py-0.5 text-center text-[#1E3A5F] dark:text-blue-100">Acum</td>
              {accumulatedTotals.map((t, i) => (
                <td key={i} colSpan={2} className="border border-border px-1 py-0.5 text-center text-[#1E3A5F] dark:text-blue-100 font-bold">
                  {t > 0 ? t.toFixed(1) : '-'}
                </td>
              ))}
            </tr>

            {/* Acumulados históricos */}
            {historicalYears.map(year => {
              const yearMap = historicalMaps[year] || {};
              const mTotals = Array(12).fill(0) as number[];
              Object.entries(yearMap).forEach(([key, mm]) => {
                const m = parseInt(key.slice(0, 2)) - 1;
                if (m >= 0 && m < 12) mTotals[m] += mm;
              });
              const acc: number[] = [];
              let sum = 0;
              mTotals.forEach(v => { sum += v; acc.push(sum); });

              return (
                <tr key={`acum-${year}`} className="bg-muted/20 text-muted-foreground">
                  <td className="border border-border px-0.5 py-0.5 text-center font-semibold">{year}</td>
                  {acc.map((t, i) => (
                    <td key={i} colSpan={2} className="border border-border px-1 py-0.5 text-center">
                      {t > 0 ? t.toFixed(1) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tfoot>
        </table>
      </div>
      </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────

function BloqueioGlobalOperacional({ anoFiltro }: { anoFiltro: number }) {
  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center text-center gap-3">
      <div className="rounded-full bg-blue-50 dark:bg-blue-950/30 p-4">
        <CloudRain className="h-8 w-8 text-blue-500" />
      </div>
      <div className="text-base font-semibold text-foreground">
        Selecione uma fazenda para lançar chuvas
      </div>
      <div className="text-sm text-muted-foreground max-w-md">
        Lançamento de chuva é feito por estação/fazenda. No filtro Global não há edição
        — alterne para uma fazenda específica no seletor acima para registrar mm em {anoFiltro}.
      </div>
    </div>
  );
}

function PlaceholderAnaliticoFazenda() {
  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center text-center gap-3">
      <div className="rounded-full bg-amber-50 dark:bg-amber-950/30 p-4">
        <Construction className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="text-base font-semibold text-foreground">
        Análise pluviométrica por fazenda — em construção
      </div>
      <div className="text-sm text-muted-foreground max-w-md">
        Em breve: acumulado mensal, comparativo com histórico, intervalo entre chuvas e
        ranking interno. Para registrar chuvas, acesse <span className="font-medium">Lançar Movimentações &gt; Chuvas</span>.
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        <span>Espaço reservado para gráficos e cards.</span>
      </div>
    </div>
  );
}
