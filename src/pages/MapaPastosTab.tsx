import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePastos, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, Upload, FileDown } from 'lucide-react';
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

export function MapaPastosTab() {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();

  const curYear = new Date().getFullYear();
  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    for (let y = curYear; y >= curYear - 3; y--) set.add(String(y));
    return Array.from(set).sort().reverse();
  }, [curYear]);

  const [anoFiltro, setAnoFiltro] = useState(String(curYear));
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;

  const [rows, setRows] = useState<PastoMapaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    const build = async () => {
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
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

        // Peso médio ponderado via lib central
        const pesoMedio = calcPesoMedioPonderado(
          Array.from(catMap.values()).map(v => ({ quantidade: v.quantidade, pesoKg: v.peso_medio_kg }))
        );

        // UA via lib central
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

    // Peso médio geral via lib central
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
      <div className="flex flex-col h-[100dvh] overflow-hidden">
        {/* Filtros - fixo no topo */}
        <div className="flex-shrink-0 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 z-50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
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
              <Badge variant="secondary" className="text-xs h-6">{totais.totalCab} cab</Badge>
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

        {/* Tabela - ocupa todo o espaço restante, scroll apenas aqui */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando mapa...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
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

function MapaTable({ rows, categorias, totais, getUaHaColor, getQualidadeColor }: {
  rows: PastoMapaRow[];
  categorias: CategoriaRebanho[];
  totais: MapaTotais;
  getUaHaColor: (v: number | null) => string;
  getQualidadeColor: (v: number | null) => string;
}) {
  const colWidths = useMemo(() => {
    const base = [
      60,   // Pasto
      45,   // Atividade
      100,  // Lote
    ];
    const cats = categorias.map(() => 30);
    const tail = [
      38,   // Total
      52,   // Peso
      42,   // Área
      42,   // UA/ha
      34,   // Qual.
    ];
    return [...base, ...cats, ...tail];
  }, [categorias]);

  const thCls = "px-0.5 py-0.5 text-center text-[11px] font-bold border-b border-r border-border/40 whitespace-nowrap bg-muted";

  return (
    <div className="flex-1 min-h-0 overflow-auto border-t border-border/30">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[11px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>

        {/* HEADER — sticky */}
        <thead className="sticky top-0 z-20">
          <tr className="h-7">
            <th className="sticky left-0 z-30 bg-muted px-1.5 py-0.5 text-left text-[11px] font-semibold border-b border-r border-border/40">Pasto</th>
            <th className={`${thCls} text-left font-medium`}>Atividade</th>
            <th className={`${thCls} text-left font-medium text-[10px]`}>Lote</th>
            {categorias.map(cat => (
              <th key={cat.id} className={thCls}>{CAT_SIGLAS[cat.codigo] || cat.codigo}</th>
            ))}
            <th className="px-0.5 py-0.5 text-center text-[11px] font-semibold border-b border-r border-border/40 whitespace-nowrap bg-primary/10">Total</th>
            <th className={`${thCls} font-medium`}>Peso</th>
            <th className={`${thCls} font-medium`}>Área</th>
            <th className={`${thCls} font-medium`}>UA/ha</th>
            <th className="px-0.5 py-0.5 text-center text-[11px] font-medium border-b whitespace-nowrap bg-muted">Qual.</th>
          </tr>
        </thead>

        {/* BODY */}
        <tbody>
          {rows.map((row, idx) => {
            const bgStyle = { backgroundColor: idx % 2 === 0 ? 'hsl(var(--background))' : 'hsl(var(--muted) / 0.3)' };
            return (
              <tr key={row.pasto.id} className="h-6" style={bgStyle}>
                <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[11px] font-semibold border-r border-border/30 whitespace-nowrap overflow-hidden text-ellipsis" style={bgStyle}>
                  {row.pasto.nome}
                </td>
                <td className="px-1 py-0.5 text-[11px] border-r border-border/30 text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{tipoUsoLabel(row.tipoUso)}</td>
                <td className="px-1 py-0.5 text-[10px] text-muted-foreground border-r border-border/30 whitespace-nowrap overflow-hidden text-ellipsis max-w-0" title={row.lote || ''}>
                  {row.lote || <span className="opacity-20">—</span>}
                </td>
                {categorias.map(cat => {
                  const val = row.categorias.get(cat.id);
                  const qty = val?.quantidade || 0;
                  const peso = val?.peso_medio_kg;
                  return (
                    <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/30">
                      {qty > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-semibold cursor-default">{formatNum(qty, 0)}</span>
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
                <td className="px-0.5 py-0.5 text-center text-[11px] font-bold border-r border-border/30 bg-primary/5">
                  {row.totalCabecas ? formatNum(row.totalCabecas, 0) : <span className="opacity-15">—</span>}
                </td>
                <td className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/30 tabular-nums">
                  {row.pesoMedio ? formatNum(row.pesoMedio, 2) : <span className="opacity-15">—</span>}
                </td>
                <td className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/30">{row.pasto.area_produtiva_ha ? formatNum(row.pasto.area_produtiva_ha, 1) : <span className="opacity-15">—</span>}</td>
                <td className={`px-0.5 py-0.5 text-center text-[11px] border-r border-border/30 ${getUaHaColor(row.uaHa)}`}>{row.uaHa ? formatNum(row.uaHa, 2) : <span className="opacity-15">—</span>}</td>
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

        {/* FOOTER — sticky bottom */}
        <tfoot className="sticky bottom-0 z-20">
          <tr className="bg-muted/80 font-bold h-7 border-t-2 border-border">
            <td className="sticky left-0 z-30 bg-muted px-1.5 py-0.5 text-[11px] border-r border-border/40" colSpan={3}>TOTAL / MÉDIA</td>
            {categorias.map(cat => {
              const t = totais.catTotals.get(cat.id);
              const pesoMed = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : null;
              return (
                <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/40">
                  {t && t.quantidade > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">{formatNum(t.quantidade, 0)}</span>
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
            <td className="px-0.5 py-0.5 text-center text-[11px] font-extrabold border-r border-border/40 bg-primary/10">{formatNum(totais.totalCab, 0)}</td>
            <td className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/40 tabular-nums">{totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}</td>
            <td className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/40">{formatNum(totais.areaTotal, 1)}</td>
            <td className={`px-0.5 py-0.5 text-center text-[11px] border-r border-border/40 ${getUaHaColor(totais.uaHaGeral)}`}>
              {totais.uaHaGeral ? formatNum(totais.uaHaGeral, 2) : '—'}
            </td>
            <td className="px-0.5 py-0.5 text-center text-[11px]">
              {totais.qualidadeMedia ? (
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${getQualidadeColor(totais.qualidadeMedia)}`}>
                  {formatNum(totais.qualidadeMedia, 1)}
                </span>
              ) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}