/**
 * ChuvasTab — Lançamento + heatmap diário de pluviometria.
 *
 * Pendência registrada — PARTE 2 (Painel Analítico):
 *   • Modo Fazenda: análise pluviométrica detalhada (acumulado anual,
 *     mensal, histórico, intervalo sem chuva, heatmap, ranking).
 *   • Modo Global: comparativo entre fazendas ativas (pecuárias E agrícolas)
 *     — NUNCA soma simples de mm. A leitura oficial pluviométrica é por
 *     estação/fazenda. Se exibir total global, deve ser explicitamente
 *     "soma operacional", não pluviometria oficial.
 *   • Tela separada (sub-tab "Análise") OU rota nova — decisão pendente.
 *
 * Não implementar PARTE 2 sem direcionamento explícito.
 */
import { useState, useMemo, useEffect } from 'react';
import { useChuvas } from '@/hooks/useChuvas';
import { useFazenda } from '@/contexts/FazendaContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CloudRain, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChuvasGlobalView } from './ChuvasGlobalView';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function diasNoMes(mes: number, ano: number) {
  return new Date(ano, mes, 0).getDate();
}

export function ChuvasTab({ anoInicial }: { anoInicial?: string } = {}) {
  const { chuvas, loading, salvarChuva } = useChuvas();
  const { isGlobal } = useFazenda();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anoFiltro, setAnoFiltro] = useState(currentYear);
  // Modo Global: filtro de mês limita o período de análise (01/jan → fim do mês).
  // Default = mês atual quando ano filtro = ano corrente; senão Dez (ano completo).
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
            {/* Filtro de mês — só em Global (define o período Jan→mês para análise) */}
            {isGlobal && (
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
            {!isGlobal && (
              <span className="text-sm font-semibold text-muted-foreground">
                Total: {yearTotal.toFixed(1)} mm
              </span>
            )}
            {isGlobal && (
              <span className="text-sm font-semibold text-muted-foreground">
                Comparativo entre fazendas — Jan a {MESES[mesFiltro - 1]}/{anoFiltro}
              </span>
            )}
          </div>

          {!isGlobal && (
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

      {/* Bifurcação: Global → painel comparativo entre fazendas (não soma).
          Fazenda individual → heatmap operacional atual (intacto). */}
      {isGlobal ? (
        <ChuvasGlobalView anoFiltro={anoFiltro} mesFiltro={mesFiltro} />
      ) : (
      <div className="px-2">

      {/* Matrix table — densidade tipo planilha executiva, header AGROinBLUE.
          table-fixed + colgroup garante que a largura NÃO oscile ao editar
          células (Input inline ocupa 100% da célula sem expandir geometria). */}
      <div className="overflow-auto max-h-[calc(100vh-140px)]">
        <table className="w-full text-[11px] tabular-nums leading-tight border-collapse min-w-[640px] table-fixed">
          <colgroup>
            <col style={{ width: 32 }} />
            {MESES.map((_, i) => <col key={i} style={{ width: 50 }} />)}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#1E3A5F] text-white">
              <th className="border border-[#24466B] px-1 py-0.5 text-center sticky left-0 bg-[#1E3A5F] z-30 font-semibold">Dia</th>
              {MESES.map((m, i) => (
                <th key={i} className="border border-[#24466B] px-1 py-0.5 text-center font-semibold">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Day rows */}
            {Array.from({ length: maxDays }, (_, dia) => (
              <tr key={dia} className="hover:bg-muted/20">
                <td className="border border-border px-1 py-0 text-center font-semibold text-muted-foreground sticky left-0 bg-background z-10">
                  {dia + 1}
                </td>
                {Array.from({ length: 12 }, (_, mes) => {
                  const maxD = diasNoMes(mes + 1, anoFiltro);
                  const dayExists = dia + 1 <= maxD;
                  const key = `${String(mes + 1).padStart(2, '0')}-${String(dia + 1).padStart(2, '0')}`;
                  const mm = chuvaMap[key] || 0;
                  const isEditing = editCell?.dia === dia && editCell?.mes === mes;

                  if (!dayExists) {
                    return <td key={mes} className="border border-border bg-muted/30" />;
                  }

                  if (isEditing) {
                    return (
                      <td key={mes} className="border border-border p-0 overflow-hidden">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={editMm}
                          onChange={e => setEditMm(e.target.value)}
                          onBlur={handleCellSave}
                          onKeyDown={e => e.key === 'Enter' && handleCellSave()}
                          autoFocus
                          className="h-5 w-full min-w-0 text-[11px] px-1 rounded-none border-0 text-center tabular-nums box-border"
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={mes}
                      className={`border border-border px-1 py-0 text-center cursor-pointer transition-colors ${getCellColor(mm)}`}
                      onClick={() => handleCellClick(dia, mes)}
                    >
                      {mm > 0 ? mm.toFixed(1) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* === TOTALS SECTION === */}
            {/* Current year monthly total */}
            <tr className="bg-blue-100/70 dark:bg-blue-900/30 font-bold border-t-2 border-[#1E3A5F]/40">
              <td className="border border-border px-1 py-0.5 sticky left-0 bg-blue-100/70 dark:bg-blue-900/30 z-10 text-center text-[#1E3A5F] dark:text-blue-200">
                Total
              </td>
              {monthlyTotals.map((t, i) => (
                <td key={i} className="border border-border px-1 py-0.5 text-center text-[#1E3A5F] dark:text-blue-200 font-bold">
                  {t > 0 ? t.toFixed(1) : '-'}
                </td>
              ))}
            </tr>

            {/* Historical years monthly totals */}
            {historicalYears.map(year => {
              const yearMap = historicalMaps[year] || {};
              const mTotals = Array(12).fill(0) as number[];
              Object.entries(yearMap).forEach(([key, mm]) => {
                const m = parseInt(key.slice(0, 2)) - 1;
                if (m >= 0 && m < 12) mTotals[m] += mm;
              });

              return (
                <tr key={`total-${year}`} className="bg-muted/30 text-muted-foreground">
                  <td className="border border-border px-1 py-0.5 sticky left-0 bg-muted/30 z-10 text-center font-semibold">
                    {year}
                  </td>
                  {mTotals.map((t, i) => (
                    <td key={i} className="border border-border px-1 py-0.5 text-center">
                      {t > 0 ? t.toFixed(1) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* === ACCUMULATED SECTION === */}
            {/* Current year accumulated */}
            <tr className="bg-blue-200/60 dark:bg-blue-900/40 font-bold border-t border-[#1E3A5F]/30">
              <td className="border border-border px-1 py-0.5 sticky left-0 bg-blue-200/60 dark:bg-blue-900/40 z-10 text-center text-[#1E3A5F] dark:text-blue-100">
                Acum.
              </td>
              {accumulatedTotals.map((t, i) => (
                <td key={i} className="border border-border px-1 py-0.5 text-center text-[#1E3A5F] dark:text-blue-100 font-bold">
                  {t > 0 ? t.toFixed(1) : '-'}
                </td>
              ))}
            </tr>

            {/* Historical years accumulated */}
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
                  <td className="border border-border px-1 py-0.5 sticky left-0 bg-muted/20 z-10 text-center font-semibold">
                    {year}
                  </td>
                  {acc.map((t, i) => (
                    <td key={i} className="border border-border px-1 py-0.5 text-center">
                      {t > 0 ? t.toFixed(1) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </div>
  );
}
