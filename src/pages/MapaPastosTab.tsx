import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePastos, isPastoAtivoNoMes, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, Upload, FileDown, ArrowLeft } from 'lucide-react';
import { gerarModeloMapaPastos } from '@/lib/importMapaPastos';
import { ImportMapaPastos } from '@/components/ImportMapaPastos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { exportMapaPastosXlsx } from '@/lib/exportMapaPastos';
import { exportMapaPastosPdf } from '@/lib/exportMapaPastosPdf';
import { calcUA, calcUAHa, calcPesoMedioPonderado } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { tipoUsoLabel } from '@/lib/calculos/labels';

export interface PastoMapaRow {
  pasto: Pasto;
  lote: string | null;
  tipoUso: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null }>;
  totalCabecas: number;
  pesoMedio: number | null;
  uaTotal: number;
  uaHa: number | null;
}

export interface MapaTotais {
  catTotals: Map<string, { quantidade: number; pesoTotal: number; qtdComPeso: number }>;
  totalCab: number;
  areaTotal: number;
  pesoMedioGeral: number | null;
  uaTotal: number;
  uaHaGeral: number | null;
  qualidadeMedia: number | null;
}

export interface AtividadeResumo {
  tipo: string;
  area: number;
  cabecas: number;
  pesoMedio: number | null;
  uaHa: number | null;
  qtdPastos: number;
}

const CAT_SIGLAS: Record<string, string> = {
  mamotes_m: 'MM', desmama_m: 'DM', garrotes: 'G', bois: 'B', touros: 'T',
  mamotes_f: 'MF', desmama_f: 'DF', novilhas: 'N', vacas: 'V',
};

interface MapaPastosTabProps {
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

export function MapaPastosTab({ onBack, filtroAnoInicial, filtroMesInicial }: MapaPastosTabProps = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();

  const curYear = new Date().getFullYear();
  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    for (let y = curYear; y >= curYear - 3; y--) set.add(String(y));
    return Array.from(set).sort().reverse();
  }, [curYear]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(curYear));
  const mesDefault = filtroMesInicial || (Number(anoFiltro) === curYear ? curYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;

  const [rows, setRows] = useState<PastoMapaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const tableModuleRef = useRef<HTMLDivElement | null>(null);

  const updateLayoutBounds = useCallback(() => {
    const node = tableModuleRef.current;
    if (!node) return;

    const topOffset = Math.max(node.getBoundingClientRect().top, 0);
    node.style.setProperty('--mapa-pastos-top-offset', `${topOffset}px`);
  }, []);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    updateLayoutBounds();
    const rafId = window.requestAnimationFrame(updateLayoutBounds);
    window.addEventListener('resize', updateLayoutBounds);
    window.visualViewport?.addEventListener('resize', updateLayoutBounds);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateLayoutBounds);
      window.visualViewport?.removeEventListener('resize', updateLayoutBounds);
    };
  }, [updateLayoutBounds]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(updateLayoutBounds);
    return () => window.cancelAnimationFrame(rafId);
  }, [updateLayoutBounds, loading, rows.length, anoFiltro, mesFiltro]);

  useEffect(() => {
    const build = async () => {
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao && isPastoAtivoNoMes(p, anoMes));
      if (pastosAtivos.length === 0) { setRows([]); return; }
      setLoading(true);

      const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));
      const allItems = await Promise.all(fechamentos.map(f => loadItens(f.id)));
      const itemsByFechId = new Map(fechamentos.map((f, i) => [f.id, allItems[i]]));

      const result: PastoMapaRow[] = pastosAtivos.map(pasto => {
        const fech = fechMap.get(pasto.id);
        const catMap = new Map<string, { quantidade: number; peso_medio_kg: number | null }>();

        if (fech) {
          const items = itemsByFechId.get(fech.id) || [];
          items.forEach(item => {
            catMap.set(item.categoria_id, { quantidade: item.quantidade, peso_medio_kg: item.peso_medio_kg });
          });
        }

        const lote = fech?.lote_mes ?? null;
        const tipoUso = fech?.tipo_uso_mes ?? null;
        const qualidade = fech?.qualidade_mes ?? null;

        const totalCab = Array.from(catMap.values()).reduce((s, v) => s + v.quantidade, 0);

        const pesoMedio = calcPesoMedioPonderado(
          Array.from(catMap.values()).map(v => ({ quantidade: v.quantidade, pesoKg: v.peso_medio_kg }))
        );

        let uaTotal = 0;
        catMap.forEach(v => { uaTotal += calcUA(v.quantidade, v.peso_medio_kg); });
        const uaHa = calcUAHa(uaTotal, pasto.area_produtiva_ha);

        return { pasto, lote, tipoUso, qualidade, categorias: catMap, totalCabecas: totalCab, pesoMedio, uaTotal, uaHa };
      });

      setRows(result);
      setLoading(false);
    };
    build();
  }, [fechamentos, pastos, loadItens]);

  const totais: MapaTotais = useMemo(() => {
    const catTotals = new Map<string, { quantidade: number; pesoTotal: number; qtdComPeso: number }>();
    categorias.forEach(c => catTotals.set(c.id, { quantidade: 0, pesoTotal: 0, qtdComPeso: 0 }));

    rows.forEach(row => {
      row.categorias.forEach((val, catId) => {
        const t = catTotals.get(catId);
        if (t) {
          t.quantidade += val.quantidade;
          if (val.peso_medio_kg && val.quantidade > 0) {
            t.pesoTotal += val.peso_medio_kg * val.quantidade;
            t.qtdComPeso += val.quantidade;
          }
        }
      });
    });

    const totalCab = rows.reduce((s, r) => s + r.totalCabecas, 0);
    const areaTotal = rows.reduce((s, r) => s + (r.pasto.area_produtiva_ha || 0), 0);

    const pesoMedioGeral = calcPesoMedioPonderado(
      rows.filter(r => r.totalCabecas > 0).map(r => ({ quantidade: r.totalCabecas, pesoKg: r.pesoMedio }))
    );

    const uaTotal = rows.reduce((s, r) => s + r.uaTotal, 0);
    const uaHaGeral = calcUAHa(uaTotal, areaTotal);

    const comQualidade = rows.filter(r => r.qualidade !== null && r.qualidade > 0);
    const qualidadeMedia = comQualidade.length > 0
      ? comQualidade.reduce((s, r) => s + (r.qualidade || 0), 0) / comQualidade.length
      : null;

    return { catTotals, totalCab, areaTotal, pesoMedioGeral, uaTotal, uaHaGeral, qualidadeMedia };
  }, [rows, categorias]);

  const resumoAtividades: AtividadeResumo[] = useMemo(() => {
    const map = new Map<string, { area: number; cabecas: number; pesoTotal: number; qtdComPeso: number; uaTotal: number; qtdPastos: number }>();
    rows.forEach(row => {
      const tipo = row.tipoUso || 'não definido';
      const entry = map.get(tipo) || { area: 0, cabecas: 0, pesoTotal: 0, qtdComPeso: 0, uaTotal: 0, qtdPastos: 0 };
      entry.area += row.pasto.area_produtiva_ha || 0;
      entry.cabecas += row.totalCabecas;
      if (row.pesoMedio && row.totalCabecas > 0) {
        entry.pesoTotal += row.pesoMedio * row.totalCabecas;
        entry.qtdComPeso += row.totalCabecas;
      }
      entry.uaTotal += row.uaTotal;
      entry.qtdPastos += 1;
      map.set(tipo, entry);
    });

    return Array.from(map.entries()).map(([tipo, d]) => ({
      tipo,
      area: d.area,
      cabecas: d.cabecas,
      pesoMedio: d.qtdComPeso > 0 ? d.pesoTotal / d.qtdComPeso : null,
      uaHa: calcUAHa(d.uaTotal, d.area),
      qtdPastos: d.qtdPastos,
    })).sort((a, b) => b.cabecas - a.cabecas);
  }, [rows]);

  const getUaHaColor = (uaHa: number | null) => {
    if (!uaHa) return '';
    if (uaHa > 3) return 'text-red-600 font-bold';
    if (uaHa > 2) return 'text-yellow-600 font-semibold';
    return 'text-green-600';
  };

  const getQualidadeColor = (q: number | null) => {
    if (!q) return '';
    if (q >= 8) return 'bg-green-500/20 text-green-700';
    if (q >= 5) return 'bg-yellow-500/20 text-yellow-700';
    return 'bg-red-500/20 text-red-700';
  };

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  return (
    <TooltipProvider>
      <div
        ref={tableModuleRef}
        className="flex min-h-0 flex-col overflow-hidden bg-background"
        style={{
          height: 'calc(100dvh - var(--mapa-pastos-top-offset, 0px) - var(--bottom-nav-safe, 64px))',
          maxHeight: 'calc(100dvh - var(--mapa-pastos-top-offset, 0px) - var(--bottom-nav-safe, 64px))',
        }}
      >
        <div className="sticky top-0 flex-shrink-0 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 z-30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Select value={anoFiltro} onValueChange={setAnoFiltro}>
                <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
                <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_COLS.map((m, i) => (
                    <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-xs h-6">{formatNum(totais.totalCab, 0)} cab</Badge>
              {totais.uaHaGeral !== null && (
                <Badge variant="outline" className="text-xs h-6">{formatNum(totais.uaHaGeral, 2)} UA/ha</Badge>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => gerarModeloMapaPastos(pastos, categorias, fazendaAtual?.nome || 'Fazenda')}>
                <FileDown className="h-3.5 w-3.5 mr-1" />Modelo
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" />Importar
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => exportMapaPastosXlsx(rows, categorias, totais, resumoAtividades, anoMes, fazendaAtual?.nome || 'Fazenda')}
                disabled={rows.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1" />Excel
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => exportMapaPastosPdf(rows, categorias, totais, resumoAtividades, anoMes, fazendaAtual?.nome || 'Fazenda')}
                disabled={rows.length === 0}>
                <FileText className="h-3.5 w-3.5 mr-1" />PDF
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">Carregando mapa...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
        ) : (
          <MapaTable
            rows={rows}
            categorias={categorias}
            totais={totais}
            getUaHaColor={getUaHaColor}
            getQualidadeColor={getQualidadeColor}
          />
        )}
      </div>

      <ImportMapaPastos
        open={importOpen}
        onOpenChange={setImportOpen}
        pastos={pastos}
        categorias={categorias}
        fazendaId={fazendaAtual?.id || ''}
        clienteId={fazendaAtual?.cliente_id || ''}
        anoMes={anoMes}
        onImported={() => loadFechamentos(anoMes)}
      />
    </TooltipProvider>
  );
}

const MACHOS_CODES = new Set(['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros']);
const FEMEAS_CODES = new Set(['mamotes_f', 'desmama_f', 'novilhas', 'vacas']);

function isMacho(cat: CategoriaRebanho) { return MACHOS_CODES.has(cat.codigo); }
function isFemea(cat: CategoriaRebanho) { return FEMEAS_CODES.has(cat.codigo); }

// Block separator: stronger border between Lote|MM, T|MF, V|Total, Total|Peso
function isBlockSeparator(catIdx: number, categorias: CategoriaRebanho[]) {
  if (catIdx === 0) return true; // Lote → first cat
  const prev = categorias[catIdx - 1];
  const cur = categorias[catIdx];
  if (!prev || !cur) return false;
  // T→MF boundary
  if (isMacho(prev) && isFemea(cur)) return true;
  return false;
}

function MapaTable({ rows, categorias, totais, getUaHaColor, getQualidadeColor }: {
  rows: PastoMapaRow[];
  categorias: CategoriaRebanho[];
  totais: MapaTotais;
  getUaHaColor: (v: number | null) => string;
  getQualidadeColor: (v: number | null) => string;
}) {
  const colWidths = useMemo(() => {
    const base = [60, 55, 120];
    const cats = categorias.map(() => 44);
    const tail = [50, 50, 45, 42, 34];
    return [...base, ...cats, ...tail];
  }, [categorias]);

  const tableWidth = useMemo(() => colWidths.reduce((sum, width) => sum + width, 0), [colWidths]);

  // Determine last macho and last femea index for V|Total separator
  const lastFemeaIdx = useMemo(() => {
    for (let i = categorias.length - 1; i >= 0; i--) {
      if (isFemea(categorias[i])) return i;
    }
    return -1;
  }, [categorias]);

  // Header/footer backgrounds per group
  const hdrBg = 'hsl(220 14% 82%)'; // darker grey for header
  const hdrBgMacho = 'hsl(213 35% 86%)'; // subtle blue-grey
  const hdrBgFemea = 'hsl(340 25% 88%)'; // subtle rosé
  const ftBg = 'hsl(220 14% 85%)';
  const ftBgMacho = 'hsl(213 35% 88%)';
  const ftBgFemea = 'hsl(340 25% 90%)';

  // Text colors for body values
  const txtMacho = 'hsl(213 55% 30%)'; // dark blue
  const txtFemea = 'hsl(340 40% 35%)'; // dark rosé/wine

  // Block separator border style
  const blockBorder = '2px solid hsl(220 13% 75%)';
  const normalBorder = '1px solid hsl(var(--border) / 0.4)';

  const getCatBorderLeft = (catIdx: number) => {
    if (isBlockSeparator(catIdx, categorias)) return blockBorder;
    return undefined;
  };

  // Total column gets block separator on left (after last femea)
  const totalLeftBorder = blockBorder;
  // Peso column gets block separator on left (after Total)
  const pesoLeftBorder = blockBorder;

  const renderColGroup = () => (
    <colgroup>
      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
    </colgroup>
  );

  // Compute peso médio per category from totais (for the new "Peso Kg" row)
  const pesosPorCategoria = useMemo(() => {
    const map = new Map<string, number | null>();
    categorias.forEach(cat => {
      const t = totais.catTotals.get(cat.id);
      if (t && t.qtdComPeso > 0) {
        map.set(cat.id, t.pesoTotal / t.qtdComPeso);
      } else {
        map.set(cat.id, null);
      }
    });
    return map;
  }, [categorias, totais]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden border-t border-border/30 bg-background">
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        <div className="flex min-h-0 flex-col mx-auto" style={{ width: tableWidth }}>
          {/* ── TABLE (THEAD sticky + TBODY + TFOOT) ── */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-3">
            <table className="w-full border-separate border-spacing-0 text-[11px]" style={{ tableLayout: 'fixed' }}>
              {renderColGroup()}
              <thead>
                <tr className="h-7">
                  <th className="sticky left-0 top-0 z-30 px-1.5 py-0.5 text-left text-[11px] font-semibold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Pasto</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-bold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Atividade</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[10px] font-bold border-b whitespace-nowrap" style={{ backgroundColor: hdrBg, borderRightStyle: 'solid', borderRightWidth: 2, borderRightColor: 'hsl(220 13% 75%)', borderBottomWidth: 1, borderBottomColor: 'hsl(220 13% 75%)' }}>Lote</th>
                  {categorias.map((cat, idx) => {
                    const bg = isMacho(cat) ? hdrBgMacho : isFemea(cat) ? hdrBgFemea : hdrBg;
                    const leftBdr = getCatBorderLeft(idx);
                    return (
                      <th key={cat.id} className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-bold border-b border-r whitespace-nowrap" style={{ backgroundColor: bg, borderColor: 'hsl(220 13% 75%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {CAT_SIGLAS[cat.codigo] || cat.codigo}
                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-semibold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>Total</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>Peso</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Área</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>UA/ha</th>
                  <th className="sticky top-0 z-20 px-0.5 py-0.5 text-center text-[11px] font-medium border-b whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Qual.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const bgStyle = { backgroundColor: idx % 2 === 0 ? 'hsl(var(--background))' : 'hsl(var(--muted) / 0.3)' };
                  return (
                    <tr key={row.pasto.id} className="h-6" style={bgStyle}>
                      <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[11px] font-semibold border-r border-border/30 whitespace-nowrap overflow-hidden text-ellipsis" style={bgStyle}>
                        {row.pasto.nome}
                      </td>
                      <td className="px-1 py-0.5 text-[11px] border-r border-border/30 text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{tipoUsoLabel(row.tipoUso)}</td>
                      <td className="px-1 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-0" title={row.lote || ''} style={{ borderRight: blockBorder }}>
                        {row.lote || <span className="opacity-20">—</span>}
                      </td>
                      {categorias.map((cat, catIdx) => {
                        const val = row.categorias.get(cat.id);
                        const qty = val?.quantidade || 0;
                        const peso = val?.peso_medio_kg;
                        const leftBdr = getCatBorderLeft(catIdx);
                        const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                        return (
                          <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/30" style={leftBdr ? { borderLeft: leftBdr } : undefined}>
                            {qty > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-semibold cursor-default" style={color ? { color } : undefined}>{formatNum(qty, 0)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{cat.nome}: {formatNum(qty, 0)} cab</p>
                                  {peso && <p>Peso médio: {formatNum(peso, 2)} kg</p>}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="opacity-15">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-0.5 py-0.5 text-center text-[11px] font-bold border-r border-border/30 bg-primary/5" style={{ borderLeft: totalLeftBorder }}>
                        {row.totalCabecas ? formatNum(row.totalCabecas, 0) : <span className="opacity-15">—</span>}
                      </td>
                      <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r border-border/30 tabular-nums text-muted-foreground" style={{ borderLeft: pesoLeftBorder }}>
                        {row.pesoMedio ? formatNum(row.pesoMedio, 2) : <span className="opacity-15">—</span>}
                      </td>
                      <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r border-border/30 text-muted-foreground">{row.pasto.area_produtiva_ha ? formatNum(row.pasto.area_produtiva_ha, 1) : <span className="opacity-15">—</span>}</td>
                      <td className={`px-0.5 py-0.5 text-center text-[10px] italic border-r border-border/30 ${getUaHaColor(row.uaHa)}`}>{row.uaHa ? formatNum(row.uaHa, 2) : <span className="opacity-15">—</span>}</td>
                      <td className="px-0.5 py-0.5 text-center text-[11px]">
                        {row.qualidade ? (
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${getQualidadeColor(row.qualidade)}`}>
                            {row.qualidade}
                          </span>
                        ) : <span className="opacity-15">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* ── TOTAL / MÉDIA ── */}
                <tr className="font-bold h-7" style={{ borderTop: '2px solid hsl(220 13% 75%)' }}>
                  <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[11px] border-r" style={{ backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)' }} colSpan={3}>TOTAL / MÉDIA</td>
                  {categorias.map((cat, catIdx) => {
                    const t = totais.catTotals.get(cat.id);
                    const pesoMed = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : null;
                    const bg = isMacho(cat) ? ftBgMacho : isFemea(cat) ? ftBgFemea : ftBg;
                    const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                    const leftBdr = getCatBorderLeft(catIdx);
                    return (
                      <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r" style={{ backgroundColor: bg, borderColor: 'hsl(220 13% 75%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {t && t.quantidade > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default font-bold" style={color ? { color } : undefined}>{formatNum(t.quantidade, 0)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{cat.nome}: {formatNum(t.quantidade, 0)} cab</p>
                              {pesoMed && <p>Peso médio: {formatNum(pesoMed, 2)} kg</p>}
                            </TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-0.5 py-0.5 text-center text-[11px] font-extrabold border-r" style={{ backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>{formatNum(totais.totalCab, 0)}</td>
                  <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r tabular-nums" style={{ backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>{totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}</td>
                  <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r" style={{ backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)' }}>{formatNum(totais.areaTotal, 1)}</td>
                  <td className={`px-0.5 py-0.5 text-center text-[10px] italic border-r ${getUaHaColor(totais.uaHaGeral)}`} style={{ backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)' }}>
                    {totais.uaHaGeral ? formatNum(totais.uaHaGeral, 2) : '—'}
                  </td>
                  <td className="px-0.5 py-0.5 text-center text-[11px]" style={{ backgroundColor: ftBg }}>
                    {totais.qualidadeMedia ? (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${getQualidadeColor(totais.qualidadeMedia)}`}>
                        {formatNum(totais.qualidadeMedia, 1)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
                {/* ── PESO KG (nova linha) ── */}
                <tr className="h-6" style={{ backgroundColor: 'hsl(220 14% 92%)' }}>
                  <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[10px] font-semibold border-r italic text-muted-foreground" style={{ backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)' }} colSpan={3}>Peso Kg</td>
                  {categorias.map((cat, catIdx) => {
                    const pesoMed = pesosPorCategoria.get(cat.id);
                    const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                    const leftBdr = getCatBorderLeft(catIdx);
                    return (
                      <td key={cat.id} className="px-0.5 py-0.5 text-center text-[10px] italic tabular-nums border-r" style={{ borderColor: 'hsl(220 13% 80%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {pesoMed ? (
                          <span style={color ? { color } : undefined}>{formatNum(pesoMed, 2)}</span>
                        ) : <span className="opacity-20">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-0.5 py-0.5 text-center text-[10px] italic tabular-nums border-r" style={{ borderColor: 'hsl(220 13% 80%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>
                    {totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}
                  </td>
                  <td className="border-r" style={{ borderColor: 'hsl(220 13% 80%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }} />
                  <td className="border-r" style={{ borderColor: 'hsl(220 13% 80%)' }} />
                  <td className="border-r" style={{ borderColor: 'hsl(220 13% 80%)' }} />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}