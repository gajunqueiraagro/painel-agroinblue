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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePlanejamentoFinanceiro, type SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { useFazenda } from '@/contexts/FazendaContext';
import { Download, Save, ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Macros de entrada (na ordem de exibição) */
const MACROS_ENTRADA_ORDERED = ['Receita Operacional', 'Entrada Financeira', 'Deduções de Receitas'];
/** Macros de saída (na ordem de exibição) */
const MACROS_SAIDA_ORDERED = ['Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos', 'Saída Financeira', 'Dividendos'];

const MACROS_ENTRADA_SET = new Set(['Receita Operacional', 'Entrada Financeira']);
const MACROS_SAIDA_SET = new Set(['Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos', 'Deduções de Receitas', 'Saída Financeira', 'Dividendos']);
const MACROS_EXCLUIDOS = new Set(['Transferências']);

const ALL_MACRO_ORDER = [...MACROS_ENTRADA_ORDERED, ...MACROS_SAIDA_ORDERED];

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
  const [ano, setAno] = useState(currentYear + 1);
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id || '';
  const isGlobal = !fazendaId || fazendaId === '__global__';

  const { loading, buildGrid, importarRealizado, salvarGrid, saldoInicial } = usePlanejamentoFinanceiro(ano, fazendaId);

  const [grid, setGrid] = useState<SubcentroGrid[]>([]);
  const [dirty, setDirty] = useState(false);
  const [importBanner, setImportBanner] = useState(false);

  useEffect(() => {
    setGrid(buildGrid());
    setDirty(false);
    setImportBanner(false);
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
      const total = g.meses.reduce((a, b) => a + b, 0);

      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const grupoMap = macroMap.get(macro)!;
      if (!grupoMap.has(grupo)) grupoMap.set(grupo, new Map());
      const centroMap = grupoMap.get(grupo)!;
      if (!centroMap.has(centro)) centroMap.set(centro, []);
      centroMap.get(centro)!.push({
        key: `${centro}||${g.subcentro}`,
        subcentro: g.subcentro,
        gridIdx: idx,
        meses: g.meses,
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
  }, [grid]);

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

  /* ── Import realizado ── */
  const handleImport = useCallback(async () => {
    const imported = await importarRealizado();
    if (!imported) return;
    setGrid(prev => {
      const next = prev.map(g => ({ ...g, meses: [...g.meses] }));
      for (const imp of imported) {
        const key = `${imp.centro_custo}||${imp.subcentro}`;
        const idx = next.findIndex(g => `${g.centro_custo}||${g.subcentro}` === key);
        if (idx >= 0) {
          for (let m = 0; m < 12; m++) {
            next[idx].meses[m] = Math.round(imp.meses[m] * 100) / 100;
          }
        }
      }
      return next;
    });
    setDirty(true);
    setImportBanner(true);
  }, [importarRealizado]);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    await salvarGrid(grid);
    setDirty(false);
    setImportBanner(false);
  }, [salvarGrid, grid]);

  /* ── Render macro with its children ── */
  const renderMacro = (macro: MacroNode) => {
    const macroKey = macro.nome;
    const macroOpen = expandedMacros.has(macroKey);
    return (
      <React.Fragment key={macroKey}>
        <TableRow
          className="cursor-pointer hover:bg-muted/30 bg-muted/20"
          onClick={() => toggleMacro(macroKey)}
        >
          <TableCell className="sticky left-0 bg-muted/20 z-10 pl-6">
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              {macroOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {macro.nome}
            </span>
          </TableCell>
          {macro.meses.map((v, i) => (
            <TableCell key={i} className="text-right text-xs">{fmtCompact(v)}</TableCell>
          ))}
          <TableCell className="text-right text-xs font-bold">{fmtCompact(macro.total)}</TableCell>
        </TableRow>

        {macroOpen && macro.grupos.map((grupo) => {
          const grupoKey = `${macroKey}||${grupo.nome}`;
          const grupoOpen = expandedGrupos.has(grupoKey);
          return (
            <React.Fragment key={grupoKey}>
              <TableRow className="cursor-pointer hover:bg-muted/10" onClick={() => toggleGrupo(grupoKey)}>
                <TableCell className="sticky left-0 bg-background z-10 pl-10">
                  <span className="inline-flex items-center gap-1 text-xs">
                    {grupoOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {grupo.nome}
                  </span>
                </TableCell>
                {grupo.meses.map((v, i) => (
                  <TableCell key={i} className="text-right text-xs text-muted-foreground">{fmtCompact(v)}</TableCell>
                ))}
                <TableCell className="text-right text-xs font-medium">{fmtCompact(grupo.total)}</TableCell>
              </TableRow>

              {grupoOpen && grupo.centros.map((centro) => {
                const centroKey = `${grupoKey}||${centro.nome}`;
                const centroOpen = expandedCentros.has(centroKey);
                return (
                  <React.Fragment key={centroKey}>
                    <TableRow className="cursor-pointer hover:bg-muted/5" onClick={() => toggleCentro(centroKey)}>
                      <TableCell className="sticky left-0 bg-background z-10 pl-14">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          {centroOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {centro.nome}
                        </span>
                      </TableCell>
                      {centro.meses.map((v, i) => (
                        <TableCell key={i} className="text-right text-[11px] text-muted-foreground">{fmtCompact(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-[11px] font-medium">{fmtCompact(centro.total)}</TableCell>
                    </TableRow>

                    {centroOpen && centro.subs.map((sub) => (
                      <TableRow key={sub.key}>
                        <TableCell className="sticky left-0 bg-background z-10 pl-[72px] text-[11px]">
                          {sub.subcentro}
                        </TableCell>
                        {sub.meses.map((v, mesIdx) => (
                          <TableCell key={mesIdx} className="p-0.5">
                            {isGlobal ? (
                              <span className="text-[11px] text-right block px-1">{v === 0 ? '–' : fmt(v)}</span>
                            ) : (
                              <EditableCell
                                value={v}
                                onSave={(newVal) => handleCellChange(sub.gridIdx, mesIdx, newVal)}
                              />
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-[11px] font-medium">
                          {sub.total === 0 ? '–' : fmt(sub.total)}
                        </TableCell>
                      </TableRow>
                    ))}
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
        <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleImport} disabled={loading || isGlobal}>
          <Download className="h-4 w-4 mr-1" />Importar Realizado {ano - 1}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={loading || isGlobal || !dirty}>
          <Save className="h-4 w-4 mr-1" />Salvar
        </Button>
      </div>

      {isGlobal && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">Selecione uma fazenda para editar o planejamento.</AlertDescription>
        </Alert>
      )}

      {importBanner && (
        <Alert className="border-primary/40 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs">
            Realizado {ano - 1} carregado como referência. Edite os valores e clique em Salvar para confirmar.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-2 flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">{grid.filter(g => !MACROS_EXCLUIDOS.has(g.macro_custo || '')).length} subcentros</span>
          <span className="flex-1" />
          <span className="font-bold">Total: R$ {fmt(grandTotal)}</span>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <Table className="w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[220px]">Nome</TableHead>
                  {MESES.map(m => (
                    <TableHead key={m} className="w-[75px] text-right">{m}</TableHead>
                  ))}
                  <TableHead className="w-[90px] text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hierarchy.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                      {loading ? 'Carregando...' : 'Nenhum subcentro encontrado no plano de contas.'}
                    </TableCell>
                  </TableRow>
                )}

                {hierarchy.length > 0 && (
                  <>
                    {/* ═══ 1. SALDO INICIAL ═══ */}
                    <TableRow className="bg-muted/40">
                      <TableCell className="sticky left-0 bg-muted/40 z-10 pl-2 text-xs font-bold">
                        Saldo Inicial (Dez/{ano - 1})
                      </TableCell>
                      {MESES.map((_, i) => (
                        <TableCell key={i} className="text-right text-xs font-semibold">
                          {i === 0 ? fmtSaldo(saldoInicial) : ''}
                        </TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtSaldo(saldoInicial)}</TableCell>
                    </TableRow>

                    {/* Separador */}
                    <TableRow><TableCell colSpan={14} className="h-1 bg-border/50 p-0" /></TableRow>

                    {/* ═══ 2. TOTAL ENTRADAS (expansível) ═══ */}
                    <TableRow
                      className="cursor-pointer hover:bg-primary/10 bg-primary/5 font-semibold"
                      onClick={() => setExpandedTotalEntradas(p => !p)}
                    >
                      <TableCell className="sticky left-0 bg-primary/5 z-10 pl-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          {expandedTotalEntradas ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Total Entradas
                        </span>
                      </TableCell>
                      {totals.entradas.map((v, i) => (
                        <TableCell key={i} className="text-right text-xs font-bold">{fmtCompact(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtCompact(totals.totalEntradas)}</TableCell>
                    </TableRow>

                    {expandedTotalEntradas && macrosEntrada.map(renderMacro)}

                    {/* Separador */}
                    <TableRow><TableCell colSpan={14} className="h-1 bg-border/50 p-0" /></TableRow>

                    {/* ═══ 3. TOTAL SAÍDAS (expansível) ═══ */}
                    <TableRow
                      className="cursor-pointer hover:bg-destructive/10 bg-destructive/5 font-semibold"
                      onClick={() => setExpandedTotalSaidas(p => !p)}
                    >
                      <TableCell className="sticky left-0 bg-destructive/5 z-10 pl-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          {expandedTotalSaidas ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Total Saídas
                        </span>
                      </TableCell>
                      {totals.saidas.map((v, i) => (
                        <TableCell key={i} className="text-right text-xs font-bold">{fmtCompact(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtCompact(totals.totalSaidas)}</TableCell>
                    </TableRow>

                    {expandedTotalSaidas && macrosSaida.map(renderMacro)}

                    {/* Separador */}
                    <TableRow><TableCell colSpan={14} className="h-1 bg-border/50 p-0" /></TableRow>

                    {/* ═══ 4. SALDO DO MÊS ═══ */}
                    <TableRow className={totals.totalSaldoMes >= 0 ? 'bg-primary/5' : 'bg-destructive/5'}>
                      <TableCell className="sticky left-0 z-10 pl-2 text-xs font-bold bg-inherit">Saldo do Mês</TableCell>
                      {totals.saldoMes.map((v, i) => (
                        <TableCell key={i} className="text-right text-xs font-semibold">{fmtSaldo(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtSaldo(totals.totalSaldoMes)}</TableCell>
                    </TableRow>

                    {/* ═══ 5. SALDO FINAL ═══ */}
                    <TableRow className="bg-muted/30">
                      <TableCell className="sticky left-0 bg-muted/30 z-10 pl-2 text-xs font-bold">Saldo Final</TableCell>
                      {totals.saldoFinal.map((v, i) => (
                        <TableCell key={i} className="text-right text-xs font-bold">{fmtSaldo(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtSaldo(totals.saldoFinal[11] || 0)}</TableCell>
                    </TableRow>

                    {/* ═══ 6. SALDO ACUMULADO ═══ */}
                    <TableRow className="bg-muted/50">
                      <TableCell className="sticky left-0 bg-muted/50 z-10 pl-2 text-xs font-bold">Saldo Acumulado</TableCell>
                      {totals.saldoFinal.map((v, i) => (
                        <TableCell key={i} className="text-right text-xs font-bold">{fmtSaldo(v)}</TableCell>
                      ))}
                      <TableCell className="text-right text-xs font-bold">{fmtSaldo(totals.saldoFinal[11] || 0)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
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
    const v = parseFloat(text) || 0;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        step="0.01"
        className="h-6 text-[11px] text-right p-1 w-[70px]"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer text-[11px] hover:bg-muted px-1 py-0.5 rounded block text-right"
      onClick={start}
    >
      {value === 0 ? '–' : fmt(value)}
    </span>
  );
}
