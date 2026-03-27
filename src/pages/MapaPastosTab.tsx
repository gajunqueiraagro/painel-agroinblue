import { useState, useEffect, useMemo } from 'react';
import { usePastos, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, Upload, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { gerarModeloMapaPastos } from '@/lib/importMapaPastos';
import { ImportMapaPastos } from '@/components/ImportMapaPastos';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
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

export function MapaPastosTab() {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
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
      <div className="pb-24">
        {/* Header - sticky */}
        <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 py-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Select value={anoMes} onValueChange={setAnoMes}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getAnoMesOptions().map(am => (
                    <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
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

        <div className="px-2 pt-2 space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando mapa...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
        ) : (
          <>
            {/* Main Table */}
            <div className="relative overflow-auto rounded-lg border" style={{ maxHeight: 'calc(100vh - 180px)' }}>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="sticky left-0 z-20 bg-muted px-2 py-1.5 text-left text-xs font-semibold border-b border-r min-w-[100px]">Pasto</th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium border-b border-r min-w-[70px]">Atividade</th>
                    <th className="px-2 py-1.5 text-left text-xs font-medium border-b border-r min-w-[50px]">Lote</th>
                    {categorias.map(cat => (
                      <th key={cat.id} className="px-1.5 py-1.5 text-center text-xs font-medium border-b border-r min-w-[60px]">
                        <div className="leading-tight">{cat.nome}</div>
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-center text-xs font-semibold border-b border-r min-w-[60px] bg-primary/10">Total</th>
                    <th className="px-2 py-1.5 text-center text-xs font-medium border-b border-r min-w-[65px]">Peso Méd.</th>
                    <th className="px-2 py-1.5 text-center text-xs font-medium border-b border-r min-w-[55px]">Área</th>
                    <th className="px-2 py-1.5 text-center text-xs font-medium border-b border-r min-w-[55px]">UA/ha</th>
                    <th className="px-2 py-1.5 text-center text-xs font-medium border-b min-w-[45px]">Qual.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.pasto.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <td className="sticky left-0 z-10 p-2 font-semibold border-r whitespace-nowrap" style={{ backgroundColor: 'inherit' }}>
                        {row.pasto.nome}
                      </td>
                      <td className="p-2 text-xs border-r text-muted-foreground">{tipoUsoLabel(row.tipoUso)}</td>
                      <td className="p-2 text-xs text-muted-foreground border-r">{row.lote || '—'}</td>
                      {categorias.map(cat => {
                        const val = row.categorias.get(cat.id);
                        const qty = val?.quantidade || 0;
                        const peso = val?.peso_medio_kg;
                        return (
                          <td key={cat.id} className="p-2 text-center border-r">
                            {qty > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-semibold cursor-default">{qty}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{cat.nome}: {qty} cab</p>
                                  {peso && <p>Peso médio: {formatNum(peso, 0)} kg</p>}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-bold border-r bg-primary/5">{row.totalCabecas || '—'}</td>
                      <td className="p-2 text-center border-r">{row.pesoMedio ? formatNum(row.pesoMedio, 2) : '—'}</td>
                      <td className="p-2 text-center border-r">{row.pasto.area_produtiva_ha ? formatNum(row.pasto.area_produtiva_ha, 1) : '—'}</td>
                      <td className={`p-2 text-center border-r ${getUaHaColor(row.uaHa)}`}>{row.uaHa ? formatNum(row.uaHa, 2) : '—'}</td>
                      <td className="p-2 text-center">
                        {row.qualidade ? (
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getQualidadeColor(row.qualidade)}`}>
                            {row.qualidade}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted font-bold border-t-2">
                    <td className="sticky left-0 z-10 bg-muted p-2 border-r" colSpan={3}>TOTAL / MÉDIA</td>
                    {categorias.map(cat => {
                      const t = totais.catTotals.get(cat.id);
                      const pesoMed = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : null;
                      return (
                        <td key={cat.id} className="p-2 text-center border-r">
                          {t && t.quantidade > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">{t.quantidade}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{cat.nome}: {t.quantidade} cab</p>
                                {pesoMed && <p>Peso médio: {formatNum(pesoMed, 0)} kg</p>}
                              </TooltipContent>
                            </Tooltip>
                          ) : '—'}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center border-r bg-primary/10 text-lg">{totais.totalCab}</td>
                    <td className="p-2 text-center border-r">{totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}</td>
                    <td className="p-2 text-center border-r">{formatNum(totais.areaTotal, 1)}</td>
                    <td className={`p-2 text-center border-r ${getUaHaColor(totais.uaHaGeral)}`}>
                      {totais.uaHaGeral ? formatNum(totais.uaHaGeral, 2) : '—'}
                    </td>
                    <td className="p-2 text-center">
                      {totais.qualidadeMedia ? (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getQualidadeColor(totais.qualidadeMedia)}`}>
                          {formatNum(totais.qualidadeMedia, 1)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Activity Summary */}
            {resumoAtividades.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Resumo por Atividade</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {resumoAtividades.map(a => (
                    <div key={a.tipo} className="rounded-lg border bg-card p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm capitalize">{tipoUsoLabel(a.tipo)}</span>
                        <Badge variant="secondary" className="text-xs">{a.qtdPastos} pastos</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Área:</span><span className="text-right font-medium text-foreground">{formatNum(a.area, 1)} ha</span>
                        <span>Cabeças:</span><span className="text-right font-medium text-foreground">{a.cabecas}</span>
                        <span>Peso Méd.:</span><span className="text-right font-medium text-foreground">{a.pesoMedio ? formatNum(a.pesoMedio, 2) + ' kg' : '—'}</span>
                        <span>UA/ha:</span>
                        <span className={`text-right font-medium ${getUaHaColor(a.uaHa)}`}>
                          {a.uaHa ? formatNum(a.uaHa, 2) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        </div>
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
