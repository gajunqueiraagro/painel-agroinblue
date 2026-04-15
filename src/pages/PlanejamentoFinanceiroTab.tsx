/**
 * PlanejamentoFinanceiroTab — Redesigned
 *
 * Layout: Saldo Inicial → Total Entradas (macros) → Total Saídas (macros) → Saldo do Mês/Final/Acumulado
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlanejamentoFinanceiro, type SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { ModalParametrosNutricao } from '@/components/financeiro/ModalParametrosNutricao';
import { toast } from 'sonner';
import { Download, Save, ChevronDown, ChevronRight, AlertTriangle, Info, Settings } from 'lucide-react';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Trimester border after Mar(2), Jun(5), Set(8) */
const trimBorder = (i: number) => (i === 2 || i === 5 || i === 8) ? ' border-r border-border/30' : '';
const COL1_BORDER = 'border-r-2 border-border/40';

/** Macros de entrada (na ordem de exibição) */
const MACROS_ENTRADA_ORDERED = ['Receita Operacional', 'Entrada Financeira', 'Deduções de Receitas'];
/** Macros de saída (na ordem de exibição) */
const MACROS_SAIDA_ORDERED = ['Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos', 'Saída Financeira', 'Dividendos'];

const MACROS_ENTRADA_SET = new Set(['Receita Operacional', 'Entrada Financeira']);
const MACROS_SAIDA_SET = new Set(['Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos', 'Deduções de Receitas', 'Saída Financeira', 'Dividendos']);
const MACROS_EXCLUIDOS = new Set(['Transferências']);

const ALL_MACRO_ORDER = [...MACROS_ENTRADA_ORDERED, ...MACROS_SAIDA_ORDERED];

const SUBCENTROS_REBANHO = new Set([
  'Abates de Machos', 'Abates de Fêmeas',
  'Venda de Desmama Machos', 'Venda de Desmama Fêmeas',
  'Venda de Machos Adultos', 'Venda de Fêmeas Adultas',
  'Venda em Boitel',
  'Investimento Compra Bovinos Machos', 'Investimento Compra Bovinos Fêmeas',
]);

const SUBCENTROS_FINANCIAMENTO = new Set([
  'Amortização Financiamento Pecuária', 'Amortização Financiamento Agricultura',
  'Juros de Financiamento Pecuária', 'Juros de Financiamento Agricultura',
]);

const SUBCENTROS_NUTRICAO = new Set([
  'Nutrição Cria', 'Nutrição Recria', 'Nutrição Engorda', 'Despesas Comerciais Pecuária',
]);

const SUBCENTROS_AUTO = new Set([...SUBCENTROS_REBANHO, ...SUBCENTROS_FINANCIAMENTO, ...SUBCENTROS_NUTRICAO]);

const fmt = (v: number) => {
  if (v === 0) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtCompact = (v: number) => {
  if (v === 0) return '–';
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};

const fmtSaldo = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

interface Props {
  onBack?: () => void;
  metaConsolidacao?: any[];
}

interface SubNode {
  key: string;
  subcentro: string;
  gridIdx: number;
  meses: number[];
  total: number;
}
interface CentroNode { nome: string; meses: number[]; total: number; subs: SubNode[]; }
interface GrupoNode { nome: string; meses: number[]; total: number; centros: CentroNode[]; }
interface MacroNode { nome: string; meses: number[]; total: number; grupos: GrupoNode[]; }

/* ================================================================ */
export function PlanejamentoFinanceiroTab({ onBack }: Props) {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id || '';
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const { clienteAtual } = useCliente();

  const { loading, buildGrid, importarSubcentro, salvarGrid, saldoInicial, lancamentosRebanho, lancamentosFinanciamento, lancamentosNutricao, reloadNutricao } = usePlanejamentoFinanceiro(ano, fazendaId);

  const [grid, setGrid] = useState<SubcentroGrid[]>([]);
  const [dirty, setDirty] = useState(false);
  const [nutricaoModalOpen, setNutricaoModalOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<{ subcentro: string; centro_custo: string; gridIdx: number } | null>(null);

  useEffect(() => {
    setGrid(buildGrid());
    setDirty(false);
  }, [buildGrid]);

  // Expand state
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set());
  const [expandedCentros, setExpandedCentros] = useState<Set<string>>(new Set());
  const [expandedTotalEntradas, setExpandedTotalEntradas] = useState(true);
  const [expandedTotalSaidas, setExpandedTotalSaidas] = useState(true);

  const toggleMacro = useCallback((k: string) => {
    setExpandedMacros(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }, []);
  const toggleGrupo = useCallback((k: string) => {
    setExpandedGrupos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }, []);
  const toggleCentro = useCallback((k: string) => {
    setExpandedCentros(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }, []);

  /* ── Build hierarchy ── */
  const hierarchy = useMemo<MacroNode[]>(() => {
    const macroMap = new Map<string, Map<string, Map<string, SubNode[]>>>();

    grid.forEach((g, idx) => {
      const macro = g.macro_custo || '(Sem macro)';
      if (MACROS_EXCLUIDOS.has(macro)) return;

      const grupo = g.grupo_custo || '(Sem grupo)';
      const centro = g.centro_custo || '(Sem centro)';

      // For rebanho subcentros, effective meses = auto + ajuste
      const isAuto = SUBCENTROS_AUTO.has(g.subcentro);
      const isRebanho = SUBCENTROS_REBANHO.has(g.subcentro);
      const isNutricao = SUBCENTROS_NUTRICAO.has(g.subcentro);
      const autoMeses = isAuto
        ? (isRebanho ? lancamentosRebanho.get(g.subcentro) : isNutricao ? lancamentosNutricao.get(g.subcentro) : lancamentosFinanciamento.get(g.subcentro)) || new Array(12).fill(0)
        : null;
      const effectiveMeses = isAuto
        ? g.meses.map((v, i) => v + (autoMeses?.[i] || 0))
        : g.meses;
      const total = effectiveMeses.reduce((a, b) => a + b, 0);

      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const grupoMap = macroMap.get(macro)!;
      if (!grupoMap.has(grupo)) grupoMap.set(grupo, new Map());
      const centroMap = grupoMap.get(grupo)!;
      if (!centroMap.has(centro)) centroMap.set(centro, []);
      centroMap.get(centro)!.push({
        key: `${centro}||${g.subcentro}`,
        subcentro: g.subcentro,
        gridIdx: idx,
        meses: effectiveMeses,
        total,
      });
    });

    const sumMeses = (nodes: { meses: number[] }[]) => {
      const r = new Array(12).fill(0);
      for (const n of nodes) for (let i = 0; i < 12; i++) r[i] += n.meses[i];
      return r;
    };

    const unsorted: MacroNode[] = [];
    for (const [macroNome, grupoMap] of macroMap) {
      const grupos: GrupoNode[] = [];
      for (const [grupoNome, centroMap] of grupoMap) {
        const centros: CentroNode[] = [];
        for (const [centroNome, subs] of centroMap) {
          const meses = sumMeses(subs);
          centros.push({ nome: centroNome, meses, total: meses.reduce((a, b) => a + b, 0), subs });
        }
        const meses = sumMeses(centros);
        grupos.push({ nome: grupoNome, meses, total: meses.reduce((a, b) => a + b, 0), centros });
      }
      const meses = sumMeses(grupos);
      unsorted.push({ nome: macroNome, meses, total: meses.reduce((a, b) => a + b, 0), grupos });
    }

    return unsorted.sort((a, b) => {
      const ia = ALL_MACRO_ORDER.indexOf(a.nome);
      const ib = ALL_MACRO_ORDER.indexOf(b.nome);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [grid, lancamentosRebanho, lancamentosFinanciamento, lancamentosNutricao]);

  /* ── Separate entradas / saidas macros ── */
  const macrosEntrada = useMemo(() => hierarchy.filter(m => MACROS_ENTRADA_ORDERED.includes(m.nome)), [hierarchy]);
  const macrosSaida = useMemo(() => hierarchy.filter(m => MACROS_SAIDA_ORDERED.includes(m.nome)), [hierarchy]);

  /* ── Totals computation ── */
  const totals = useMemo(() => {
    const entradas = new Array(12).fill(0);
    const saidas = new Array(12).fill(0);

    for (const macro of hierarchy) {
      if (MACROS_ENTRADA_SET.has(macro.nome)) {
        for (let i = 0; i < 12; i++) entradas[i] += macro.meses[i];
      }
      if (MACROS_SAIDA_SET.has(macro.nome)) {
        for (let i = 0; i < 12; i++) saidas[i] += macro.meses[i];
      }
    }

    const saldoMes = entradas.map((e, i) => e - saidas[i]);
    const saldoFinal: number[] = [];
    let acum = saldoInicial;
    for (let i = 0; i < 12; i++) {
      acum += saldoMes[i];
      saldoFinal.push(acum);
    }

    return {
      entradas,
      totalEntradas: entradas.reduce((a, b) => a + b, 0),
      saidas,
      totalSaidas: saidas.reduce((a, b) => a + b, 0),
      saldoMes,
      totalSaldoMes: entradas.reduce((a, b) => a + b, 0) - saidas.reduce((a, b) => a + b, 0),
      saldoFinal,
    };
  }, [hierarchy, saldoInicial]);

  const grandTotal = useMemo(() => hierarchy.reduce((s, m) => s + m.total, 0), [hierarchy]);

  /* ── Cell edit ── */
  const handleCellChange = useCallback((gridIdx: number, mesIdx: number, value: number) => {
    setGrid(prev => {
      const next = [...prev];
      const row = { ...next[gridIdx], meses: [...next[gridIdx].meses] };
      row.meses[mesIdx] = value;
      next[gridIdx] = row;
      return next;
    });
    setDirty(true);
  }, []);

  /* ── Import subcentro individual ── */
  const handleImportSubcentro = useCallback(async () => {
    if (!importConfirm) return;
    const { subcentro, centro_custo, gridIdx } = importConfirm;
    setImportConfirm(null);
    const meses = await importarSubcentro(subcentro, centro_custo);
    setGrid(prev => {
      const next = [...prev];
      const row = { ...next[gridIdx], meses: [...meses] };
      next[gridIdx] = row;
      return next;
    });
    setDirty(true);
    toast.success(`Realizado ${ano - 1} importado para ${subcentro}`);
  }, [importConfirm, importarSubcentro, ano]);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    await salvarGrid(grid);
    setDirty(false);
  }, [salvarGrid, grid]);

  /* ── Style constants (matching FluxoFinanceiro) ── */
  const BG_CARD = 'hsl(var(--card))';
  const BG_MUTED = 'hsl(var(--muted))';
  const BG_NIVEL1 = 'hsl(var(--muted))';
  const BG_NIVEL2 = 'color-mix(in srgb, hsl(var(--muted)) 45%, hsl(var(--card)))';
  const BG_ZEBRA = 'color-mix(in srgb, hsl(var(--muted)) 18%, hsl(var(--card)))';
  const BG_DYN = 'color-mix(in srgb, hsl(var(--muted)) 10%, hsl(var(--card)))';

  const corTipo = (tipo: 'entrada' | 'saida') => tipo === 'entrada' ? 'text-emerald-600' : 'text-destructive';

  const renderMacro = (macro: MacroNode, tipo: 'entrada' | 'saida') => {
    const cor = corTipo(tipo);
    const macroKey = macro.nome;
    const macroOpen = expandedMacros.has(macroKey);
    return (
      <React.Fragment key={macroKey}>
        <tr
          className="cursor-pointer border-b border-border/30"
          onClick={() => toggleMacro(macroKey)}
        >
          <td
            className="px-1 py-[2px] text-left leading-tight font-semibold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap"
            style={{ background: BG_NIVEL2, paddingLeft: 4 }}
          >
            <span className="inline-flex items-center gap-0.5">
              {macroOpen ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
              {macro.nome}
            </span>
          </td>
           {macro.meses.map((v, i) => (
            <td key={i} className={`px-1 py-[2px] text-right leading-tight font-semibold text-[9px] ${cor}${trimBorder(i)}`} style={{ background: BG_NIVEL2 }}>{fmtCompact(v)}</td>
          ))}
          <td className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>{fmtCompact(macro.total)}</td>
        </tr>

        {macroOpen && macro.grupos.map((grupo) => {
          const grupoKey = `${macroKey}||${grupo.nome}`;
          const grupoOpen = expandedGrupos.has(grupoKey);
          return (
            <React.Fragment key={grupoKey}>
              <tr className="cursor-pointer border-b border-border/20" onClick={() => toggleGrupo(grupoKey)}>
                <td
                  className="px-1 py-[1.5px] text-left leading-tight font-medium text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap"
                  style={{ background: BG_ZEBRA, paddingLeft: 16 }}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {grupoOpen ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
                    {grupo.nome}
                  </span>
                </td>
                {grupo.meses.map((v, i) => (
                  <td key={i} className={`px-1 py-[1.5px] text-right leading-tight font-medium text-[9px] ${cor}${trimBorder(i)}`} style={{ background: BG_ZEBRA }}>{fmtCompact(v)}</td>
                ))}
                <td className={`px-1 py-[1.5px] text-right leading-tight font-medium text-[9px] border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>{fmtCompact(grupo.total)}</td>
              </tr>

              {grupoOpen && grupo.centros.map((centro) => {
                const centroKey = `${grupoKey}||${centro.nome}`;
                const centroOpen = expandedCentros.has(centroKey);
                return (
                  <React.Fragment key={centroKey}>
                    <tr className="cursor-pointer border-b border-border/20" onClick={() => toggleCentro(centroKey)}>
                      <td
                        className="px-1 py-[1.5px] text-left leading-tight font-normal text-[9px] text-muted-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap"
                        style={{ background: BG_DYN, paddingLeft: 28 }}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {centroOpen ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
                          {centro.nome}
                        </span>
                      </td>
                      {centro.meses.map((v, i) => (
                        <td key={i} className={`px-1 py-[1.5px] text-right leading-tight font-normal text-[9px] ${cor}${trimBorder(i)}`} style={{ background: BG_DYN }}>{fmtCompact(v)}</td>
                      ))}
                      <td className={`px-1 py-[1.5px] text-right leading-tight font-normal text-[9px] border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>{fmtCompact(centro.total)}</td>
                    </tr>

                    {centroOpen && centro.subs.map((sub, subIdx) => {
                      const isRebanho = SUBCENTROS_REBANHO.has(sub.subcentro);
                      const isFinanciamento = SUBCENTROS_FINANCIAMENTO.has(sub.subcentro);
                      const isNutricao = SUBCENTROS_NUTRICAO.has(sub.subcentro);
                      const isAuto = isRebanho || isFinanciamento || isNutricao;
                      const autoMeses = isAuto
                        ? (isRebanho ? lancamentosRebanho.get(sub.subcentro) : isNutricao ? lancamentosNutricao.get(sub.subcentro) : lancamentosFinanciamento.get(sub.subcentro)) || new Array(12).fill(0)
                        : null;
                      const subBg = subIdx % 2 === 0 ? BG_CARD : BG_DYN;

                      if (isAuto) {
                        const ajusteMeses = grid[sub.gridIdx]?.meses || new Array(12).fill(0);
                        const totalMeses = autoMeses!.map((a, i) => a + ajusteMeses[i]);
                        const autoTotal = autoMeses!.reduce((a, b) => a + b, 0);
                        const ajusteTotal = ajusteMeses.reduce((a, b) => a + b, 0);
                        const lineTotal = totalMeses.reduce((a, b) => a + b, 0);

                        return (
                          <React.Fragment key={sub.key}>
                            {/* Auto */}
                            <tr className="border-b border-border/10">
                              <td className="px-1 py-[1.5px] text-left leading-tight font-normal text-[8px] italic text-muted-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap" style={{ background: BG_ZEBRA, paddingLeft: 40 }}>
                                {sub.subcentro} (auto)
                              </td>
                              {autoMeses!.map((v, i) => (
                                <td key={i} className={`px-1 py-[1.5px] text-right leading-tight text-[8px] italic opacity-70 ${cor}${trimBorder(i)}`} style={{ background: BG_ZEBRA }}>
                                  {fmtCompact(v)}
                                </td>
                              ))}
                              <td className={`px-1 py-[1.5px] text-right leading-tight text-[8px] italic font-medium border-l-2 border-border opacity-70 ${cor}`} style={{ background: BG_MUTED }}>
                                {fmtCompact(autoTotal)}
                              </td>
                            </tr>
                            {/* Ajuste */}
                            <tr className="border-b border-border/10">
                              <td className="px-1 py-[1.5px] text-left leading-tight font-normal text-[8px] text-muted-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap" style={{ background: subBg, paddingLeft: 40 }}>
                                {sub.subcentro} (ajuste)
                              </td>
                              {ajusteMeses.map((v, mesIdx) => (
                                <td key={mesIdx} className={`px-0.5 py-[1px]${trimBorder(mesIdx)}`} style={{ background: subBg }}>
                                  {isGlobal ? (
                                    <span className="text-[8px] text-right block px-0.5 leading-tight">{fmtCompact(v)}</span>
                                  ) : (
                                    <EditableCell value={v} onSave={(newVal) => handleCellChange(sub.gridIdx, mesIdx, newVal)} />
                                  )}
                                </td>
                              ))}
                              <td className={`px-1 py-[1.5px] text-right leading-tight text-[8px] font-medium border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>
                                {fmtCompact(ajusteTotal)}
                              </td>
                            </tr>
                            {/* Total */}
                            <tr className="border-b border-border/30">
                              <td className="px-1 py-[2px] text-left leading-tight font-semibold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap" style={{ background: BG_NIVEL2, paddingLeft: 40 }}>
                                {sub.subcentro}
                              </td>
                              {totalMeses.map((v, i) => (
                                <td key={i} className={`px-1 py-[2px] text-right leading-tight font-semibold text-[9px] ${cor}${trimBorder(i)}`} style={{ background: BG_NIVEL2 }}>
                                  {fmtCompact(v)}
                                </td>
                              ))}
                              <td className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>
                                {fmtCompact(lineTotal)}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      }

                      // Normal subcentro
                      return (
                        <tr key={sub.key} className="group/subrow border-b border-border/10">
                          <td className="px-1 py-[1.5px] text-left leading-tight font-normal text-[8px] text-muted-foreground sticky left-0 z-10 border-r-2 border-border/40 truncate whitespace-nowrap" style={{ background: subBg, paddingLeft: 40 }}>
                            <span className="inline-flex items-center gap-0.5">
                              {sub.subcentro}
                              {!isGlobal && (
                                <Download
                                  className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50 hover:text-primary cursor-pointer opacity-0 group-hover/subrow:opacity-100 transition-opacity"
                                  onClick={(e) => { e.stopPropagation(); setImportConfirm({ subcentro: sub.subcentro, centro_custo: grid[sub.gridIdx]?.centro_custo || '', gridIdx: sub.gridIdx }); }}
                                />
                              )}
                            </span>
                          </td>
                          {sub.meses.map((v, mesIdx) => (
                            <td key={mesIdx} className={`px-0.5 py-[1px]${trimBorder(mesIdx)}`} style={{ background: subBg }}>
                              {isGlobal ? (
                                <span className="text-[8px] text-right block px-0.5 leading-tight">{fmtCompact(v)}</span>
                              ) : (
                                <EditableCell value={v} onSave={(newVal) => handleCellChange(sub.gridIdx, mesIdx, newVal)} />
                              )}
                            </td>
                          ))}
                          <td className={`px-1 py-[1.5px] text-right leading-tight text-[8px] font-medium border-l-2 border-border ${cor}`} style={{ background: BG_MUTED }}>
                            {fmtCompact(sub.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 animate-fade-in pb-24 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs font-semibold text-card-foreground whitespace-nowrap">Evolução Financeira — META</span>
        <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isGlobal && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            Selecione uma fazenda para editar
          </span>
        )}
        <div className="flex-1" />
        {!isGlobal && (
          <Button size="sm" variant="ghost" onClick={() => setNutricaoModalOpen(true)} title="Parâmetros de Nutrição">
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={loading || isGlobal || !dirty}>
          <Save className="h-4 w-4 mr-1" />Salvar
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-[9px] tabular-nums border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 180 }} />
                {MESES.map(m => <col key={m} style={{ width: 58 }} />)}
                <col style={{ width: 66 }} />
              </colgroup>

              <thead className="sticky top-0 z-20" style={{ position: '-webkit-sticky' as any }}>
                <tr className="border-b-2 border-border">
                  <th className="px-1 py-[3px] text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider sticky left-0 z-30 border-r-2 border-border/40" style={{ background: BG_CARD }} />
                  {MESES.map(m => (
                    <th key={m} className={`px-1 py-[3px] text-right text-[9px] font-bold text-muted-foreground uppercase tracking-wider${trimBorder(MESES.indexOf(m))}`} style={{ background: BG_CARD }}>{m}</th>
                  ))}
                  <th className="px-1 py-[3px] text-right text-[9px] font-extrabold text-foreground uppercase tracking-wider border-l-2 border-border" style={{ background: BG_MUTED }}>Total</th>
                </tr>
              </thead>

              <tbody>
                {hierarchy.length === 0 && (
                  <tr>
                    <td colSpan={14} className="text-center text-muted-foreground py-8 text-[9px]">
                      {loading ? 'Carregando...' : 'Nenhum subcentro encontrado no plano de contas.'}
                    </td>
                  </tr>
                )}

                {hierarchy.length > 0 && (
                  <>
                    {/* ═══ 1. SALDO INICIAL ═══ */}
                    {isGlobal && (
                      <>
                        <tr className="border-b border-border">
                          <td className="px-1 py-[2px] text-left leading-tight font-bold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40" style={{ background: BG_NIVEL1, paddingLeft: 4 }}>
                            Saldo Inicial (Dez/{ano - 1})
                          </td>
                          {MESES.map((_, i) => (
                            <td key={i} className={`px-1 py-[2px] text-right leading-tight font-semibold text-[9px]${trimBorder(i)}`} style={{ background: BG_NIVEL1 }}>
                              {i === 0 ? fmtCompact(saldoInicial) : ''}
                            </td>
                          ))}
                          <td className="px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border" style={{ background: BG_MUTED }}>{fmtCompact(saldoInicial)}</td>
                        </tr>
                        <tr><td colSpan={14} className="h-px" style={{ background: 'hsl(var(--border))' }} /></tr>
                      </>
                    )}

                    {/* ═══ 2. TOTAL ENTRADAS ═══ */}
                    <tr
                      className="cursor-pointer border-b border-border"
                      onClick={() => setExpandedTotalEntradas(p => !p)}
                    >
                      <td className="px-1 py-[2px] text-left leading-tight font-bold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40 select-none" style={{ background: BG_NIVEL1, paddingLeft: 4 }}>
                        <span className="inline-flex items-center gap-0.5">
                          {expandedTotalEntradas ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
                          Total Entradas
                        </span>
                      </td>
                      {totals.entradas.map((v, i) => (
                        <td key={i} className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] text-emerald-600${trimBorder(i)}`} style={{ background: BG_NIVEL1 }}>{fmtCompact(v)}</td>
                      ))}
                      <td className="px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border text-emerald-600" style={{ background: BG_MUTED }}>{fmtCompact(totals.totalEntradas)}</td>
                    </tr>

                    {expandedTotalEntradas && macrosEntrada.map(m => renderMacro(m, 'entrada'))}

                    <tr><td colSpan={14} className="h-px" style={{ background: 'hsl(var(--border))' }} /></tr>

                    {/* ═══ 3. TOTAL SAÍDAS ═══ */}
                    <tr
                      className="cursor-pointer border-b border-border"
                      onClick={() => setExpandedTotalSaidas(p => !p)}
                    >
                      <td className="px-1 py-[2px] text-left leading-tight font-bold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40 select-none" style={{ background: BG_NIVEL1, paddingLeft: 4 }}>
                        <span className="inline-flex items-center gap-0.5">
                          {expandedTotalSaidas ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
                          Total Saídas
                        </span>
                      </td>
                      {totals.saidas.map((v, i) => (
                        <td key={i} className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] text-destructive${trimBorder(i)}`} style={{ background: BG_NIVEL1 }}>{fmtCompact(v)}</td>
                      ))}
                      <td className="px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border text-destructive" style={{ background: BG_MUTED }}>{fmtCompact(totals.totalSaidas)}</td>
                    </tr>

                    {expandedTotalSaidas && macrosSaida.map(m => renderMacro(m, 'saida'))}

                    {/* ═══ Saldos ═══ */}
                    {isGlobal && (
                      <>
                        <tr><td colSpan={14} className="h-px" style={{ background: 'hsl(var(--border))' }} /></tr>

                        <tr className="border-b border-border">
                          <td className="px-1 py-[2px] text-left leading-tight font-bold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40" style={{ background: BG_NIVEL2, paddingLeft: 4 }}>Saldo do Mês</td>
                          {totals.saldoMes.map((v, i) => (
                            <td key={i} className={`px-1 py-[2px] text-right leading-tight font-semibold text-[9px] ${v >= 0 ? 'text-emerald-600' : 'text-destructive'}${trimBorder(i)}`} style={{ background: BG_NIVEL2 }}>{fmtCompact(v)}</td>
                          ))}
                          <td className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border ${totals.totalSaldoMes >= 0 ? 'text-emerald-600' : 'text-destructive'}`} style={{ background: BG_MUTED }}>{fmtCompact(totals.totalSaldoMes)}</td>
                        </tr>


                        <tr className="border-b-2 border-border">
                          <td className="px-1 py-[2px] text-left leading-tight font-bold text-[9px] text-card-foreground sticky left-0 z-10 border-r-2 border-border/40" style={{ background: BG_NIVEL1, paddingLeft: 4 }}>Saldo Acumulado</td>
                          {totals.saldoFinal.map((v, i) => (
                            <td key={i} className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] ${v >= 0 ? 'text-emerald-600' : 'text-destructive'}${trimBorder(i)}`} style={{ background: BG_NIVEL1 }}>{fmtCompact(v)}</td>
                          ))}
                          <td className={`px-1 py-[2px] text-right leading-tight font-bold text-[9px] border-l-2 border-border ${(totals.saldoFinal[11] || 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}`} style={{ background: BG_MUTED }}>{fmtCompact(totals.saldoFinal[11] || 0)}</td>
                        </tr>
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!isGlobal && clienteAtual?.id && (
        <ModalParametrosNutricao
          open={nutricaoModalOpen}
          onOpenChange={setNutricaoModalOpen}
          fazendaId={fazendaId}
          clienteId={clienteAtual.id}
          ano={ano}
          onSaved={reloadNutricao}
        />
      )}

      <AlertDialog open={!!importConfirm} onOpenChange={(open) => { if (!open) setImportConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Importar realizado {ano - 1}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Importar realizado {ano - 1} para <strong>{importConfirm?.subcentro}</strong>? Isso irá sobrepor os valores atuais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8" onClick={handleImportSubcentro}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ================================================================ */
/*  Editable Cell                                                    */
/* ================================================================ */
function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const start = () => {
    setText(value === 0 ? '' : String(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const v = parseFloat(text.replace(',', '.')) || 0;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="text"
        inputMode="decimal"
        className="h-4 text-[8px] text-right p-0.5 w-[54px]"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer text-[8px] hover:bg-muted px-0.5 rounded block text-right leading-tight"
      onClick={start}
    >
      {value === 0 ? '–' : fmtCompact(value)}
    </span>
  );
}
