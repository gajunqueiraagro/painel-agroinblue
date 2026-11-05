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
import { useState, useMemo, useEffect } from 'react';
import { useChuvas } from '@/hooks/useChuvas';
import { useFazenda } from '@/contexts/FazendaContext';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CloudRain, Plus, BarChart3, Construction } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChuvasGlobalView } from './ChuvasGlobalView';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { formatNum } from '@/lib/calculos/formatters';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';

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
  /* A fazenda escolhida NA TELA quando o filtro está em Global — 114c. `null` = ninguém
     escolheu ainda, e é aí que a lista aparece. Sair dela volta para a lista, e o filtro
     do app continua em Global o tempo todo. */
  const [fazendaEscolhida, setFazendaEscolhida] = useState<string | null>(null);
  const { chuvas, loading, salvarChuva } = useChuvas(fazendaEscolhida);
  const { isGlobal, fazendas } = useFazenda();
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
  const [novaData, setNovaData] = useState(hojeLocal());
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
    /* ⚠ O QUE TRAVA A CÉLULA É NÃO HAVER ESTAÇÃO, não estar em Global — 114c. Sem esta
       troca, a planilha abriria em Global com a fazenda escolhida e nenhuma célula
       responderia ao clique: a tela pareceria quebrada. */
    if (isGlobal && !fazendaEscolhida) return;
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

  /* CHUVAS-LANCAR-01 — o quadro da planilha vai até a base da tela (hook ANTES da saída do "Carregando": hook nunca condicional) */
  const quadro = useAlturaAteOFim({ ativo: mode === 'operacional' && (!isGlobal || !!fazendaEscolhida) });

  if (loading) return <div className="p-4 text-center text-muted-foreground">Carregando...</div>;

  // Regras de finalidade ↓
  const isOperacional = mode === 'operacional';
  const isAnalitico   = mode === 'analitico';
  const mostrarFiltroMes = isAnalitico; // filtro mês só faz sentido em painel
  /* Em Global COM fazenda escolhida a planilha é a mesma de sempre: o que decide não é
     mais o filtro, é haver uma estação definida. */
  const comEstacao = !isGlobal || !!fazendaEscolhida;
  const mostrarBotaoLancar = isOperacional && comEstacao;
  const nomeEscolhida = fazendas.find(f => f.id === fazendaEscolhida)?.nome ?? null;
  const headerSub = isOperacional
    ? (comEstacao
        ? `Total: ${yearTotal.toFixed(1)} mm${nomeEscolhida ? ` · ${nomeEscolhida}` : ''}`
        : 'Escolha a fazenda para lançar')
    : (isGlobal
        ? `Comparativo entre fazendas — Jan a ${MESES[mesFiltro - 1]}/${anoFiltro}`
        : `Análise por fazenda — Jan a ${MESES[mesFiltro - 1]}/${anoFiltro}`);

  /* CHUVAS-LANCAR-01 (Gabriel 04/11/2026, passada tela a tela) — o LANÇAR (planilha de uma fazenda):
     · a barra é uma faixa baixa (34 px, a régua da Geo pastos): ano · "Total 862,0 mm" · Lançar; a tabela começa logo abaixo;
     · UMA coluna "Dia" à esquerda (antes ela se repetia nos 12 meses) e cada mês é só a coluna mm — a sobra vai para os números;
     · a régua de tabela da casa (a do Financeiro: cabeçalho navy 22 px, linha 19 px, 10 px), números com vírgula à direita, dia sem
       chuva VAZIO; a linha Total no topo, presa e em destaque; o quadro vai ATÉ A BASE da tela (`useAlturaAteOFim`), os 31 dias à vista;
     · a volta ("‹ Voltar" reservado) é da barra do topo (o shell sabe de onde se veio).
     O modo ANALÍTICO segue com a barra de antes (fora deste pedido). */
  const mm1 = (v: number) => (v > 0 ? formatNum(v, 1) : '');

  return (
    <div className={isOperacional ? 'flex h-full min-h-0 flex-col' : 'pb-20'}>
      {isOperacional ? (
        <div className="flex h-[34px] flex-none items-center gap-2 border-b border-[#D9DEE5] bg-background px-2.5" data-testid="chuvas-barra">
          {!anoInicial && (
            <Select value={String(anoFiltro)} onValueChange={v => setAnoFiltro(Number(v))}>
              <SelectTrigger className="h-[24px] w-[70px] text-[11px] font-semibold" data-testid="chuvas-ano"><SelectValue /></SelectTrigger>
              <SelectContent>{anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {comEstacao ? (
            <span className="whitespace-nowrap text-[11px] text-muted-foreground" data-testid="chuvas-total">
              Total <b className="tabular-nums text-foreground">{formatNum(yearTotal, 1)} mm</b>{nomeEscolhida ? ` · ${nomeEscolhida}` : ''}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Escolha a fazenda para lançar</span>
          )}
          {mostrarBotaoLancar && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="ml-auto h-[24px] gap-1 px-2 text-[11px]">
                  <Plus className="h-3 w-3" /> Lançar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Registrar Chuva</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Data</Label>
                    <DatePicker value={novaData} onChange={setNovaData} />
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
      ) : (
      /* Header - sticky (o painel analítico, como era) */
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
        </div>
      </div>
      )}

      {/* Bifurcação por finalidade ─────────────────────────────────────
          operacional + Global   → escolha da estação
          operacional + Fazenda  → planilha (heatmap editável)
          analítico   + Global   → ChuvasGlobalView
          analítico   + Fazenda  → placeholder (em construção) */}
      {/* ⚠ GLOBAL DEIXOU DE SER PORTA FECHADA — 114c. Antes, quem estava em Global via
          "Selecione uma fazenda" e tinha de trocar o filtro do app (e perder a tela em que
          estava) para lançar 3 mm. Agora escolhe a estação aqui, lança, e continua em
          Global. A regra do banco não mudou: chuva é de UMA fazenda. */}
      {isOperacional && isGlobal && !fazendaEscolhida && (
        <EscolhaDaEstacao fazendas={fazendas.filter(f => f.id !== '__global__')}
          anoFiltro={anoFiltro} onEscolher={setFazendaEscolhida} />
      )}
      {isAnalitico && isGlobal && (
        <ChuvasGlobalView anoFiltro={anoFiltro} mesFiltro={mesFiltro} />
      )}
      {isAnalitico && !isGlobal && (
        <PlaceholderAnaliticoFazenda />
      )}
      {isOperacional && comEstacao && (
      <div className="flex min-h-0 flex-1 flex-col px-2 pt-1.5">{/* PLANILHA OPERACIONAL ─────────────────── */}

      {/* A volta para a lista, e o nome de quem está sendo lançada — sem isso o operador
          em Global não teria como saber de qual estação é a planilha aberta. */}
      {isGlobal && fazendaEscolhida && (
        <div className="mb-1.5 flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1">
          <button type="button" onClick={() => setFazendaEscolhida(null)}
            className="text-[11px] text-primary underline-offset-2 hover:underline">
            ‹ Trocar fazenda
          </button>
          <span className="text-[11px] text-muted-foreground">Lançando em</span>
          <span className="text-[12px] font-medium">{nomeEscolhida ?? '—'}</span>
        </div>
      )}

      {/* O quadro vai até a base da tela; o cabeçalho (meses) e o Total ficam presos; rolam os 31 dias e, abaixo deles, o histórico. */}
      <div ref={quadro.ref} style={{ height: quadro.altura }} className="min-h-0 overflow-auto rounded-lg border border-border bg-card [scrollbar-gutter:stable]"
        data-testid="chuvas-quadro">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 640 }} data-testid="chuvas-tabela">
          <colgroup>
            <col style={{ width: 40 }} />
            {MESES.map((m) => <col key={m} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH_REGUA, 'sticky top-0 z-[2] bg-primary text-left')}>Dia</th>
              {MESES.map((m) => <th key={m} className={cn(TH_REGUA, 'sticky top-0 z-[2] bg-primary text-right')}>{m}</th>)}
            </tr>
            {/* a linha Total no topo, presa e em destaque */}
            <tr data-testid="chuvas-linha-total">
              <th className={cn(TD_REGUA, 'sticky top-[22px] z-[2] bg-blue-100 text-left font-semibold text-[#1E3A5F]')}>Total</th>
              {monthlyTotals.map((t, i) => (
                <th key={i} className={cn(TD_REGUA_NUM, 'sticky top-[22px] z-[2] bg-blue-100 font-semibold text-[#1E3A5F]')}>{mm1(t)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Para cada dia 1..31, a coluna Dia e 12 células mm. Dia inexistente no mês (30 fev, 31 abr) → célula cinza, sem clique. */}
            {Array.from({ length: maxDays }, (_, dia) => (
              <tr key={dia} className="border-b border-border/50 hover:bg-muted/20">
                <td className={cn(TD_REGUA, 'text-muted-foreground tabular-nums')}>{dia + 1}</td>
                {Array.from({ length: 12 }, (_, mes) => {
                  const d = dia + 1;
                  const dayExists = d <= diasNoMes(mes + 1, anoFiltro);
                  const key = `${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const mm = chuvaMap[key] || 0;
                  const isEditing = editCell?.dia === dia && editCell?.mes === mes;
                  if (!dayExists) return <td key={mes} className={cn(TD_REGUA, 'bg-muted/40')} />;
                  if (isEditing) {
                    return (
                      <td key={mes} className={cn(TD_REGUA, 'p-0')}>
                        <Input type="number" step="0.1" min="0" value={editMm} onChange={e => setEditMm(e.target.value)}
                          onBlur={handleCellSave} onKeyDown={e => e.key === 'Enter' && handleCellSave()} autoFocus
                          className="box-border h-[18px] w-full min-w-0 rounded-none border-0 px-1 text-right text-[10px] tabular-nums" />
                      </td>
                    );
                  }
                  return (
                    <td key={mes} className={cn(TD_REGUA_NUM, 'cursor-pointer transition-colors', getCellColor(mm))}
                      onClick={() => handleCellClick(dia, mes)} data-testid={`chuvas-${key}`}>
                      {mm1(mm)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Históricos — total mensal por ano */}
            {historicalYears.map(year => {
              const yearMap = historicalMaps[year] || {};
              const mTotals = Array(12).fill(0) as number[];
              Object.entries(yearMap).forEach(([key, mm]) => {
                const m = parseInt(key.slice(0, 2)) - 1;
                if (m >= 0 && m < 12) mTotals[m] += mm;
              });
              return (
                <tr key={`total-${year}`} className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                  <td className={cn(TD_REGUA, 'font-semibold')}>{year}</td>
                  {mTotals.map((t, i) => <td key={i} className={TD_REGUA_NUM}>{mm1(t)}</td>)}
                </tr>
              );
            })}

            {/* === ACUMULADO === */}
            <tr className="border-b border-border/50 bg-blue-50 font-semibold text-[#1E3A5F]">
              <td className={TD_REGUA}>Acum.</td>
              {accumulatedTotals.map((t, i) => <td key={i} className={TD_REGUA_NUM}>{mm1(t)}</td>)}
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
                <tr key={`acum-${year}`} className="border-b border-border/50 bg-muted/20 text-muted-foreground">
                  <td className={cn(TD_REGUA, 'font-semibold')}>{year}</td>
                  {acc.map((t, i) => <td key={i} className={TD_REGUA_NUM}>{mm1(t)}</td>)}
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

/**
 * A escolha da estação, no lugar do bloqueio — 114c.
 *
 * ⚠ MEDIDAS DO A18: rótulo 10px, identidade 12px/500. É uma lista de escolha, não um
 * aviso de erro: o operador chegou aqui para lançar, e o que ele precisa é da porta, não
 * da explicação de por que ela estava fechada.
 */
function EscolhaDaEstacao({ fazendas, anoFiltro, onEscolher }: {
  fazendas: { id: string; nome: string }[];
  anoFiltro: number;
  onEscolher: (id: string) => void;
}) {
  return (
    <div className="px-3 py-4">
      <div className="mb-2 flex items-baseline gap-2">
        <CloudRain className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="text-[12px] font-medium">Em qual fazenda?</span>
        <span className="text-[10px] text-muted-foreground">
          A chuva é de uma estação. Escolha para lançar {anoFiltro} — o filtro continua em Global.
        </span>
      </div>
      {fazendas.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted-foreground">
          Nenhuma fazenda ativa neste cliente.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {fazendas.map(f => (
            <button type="button" key={f.id} onClick={() => onEscolher(f.id)}
              className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{f.nome}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">lançar ›</span>
            </button>
          ))}
        </div>
      )}
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
