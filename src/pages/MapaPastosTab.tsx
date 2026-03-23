import { useState, useEffect, useMemo } from 'react';
import { usePastos, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { exportMapaPastosXlsx } from '@/lib/exportMapaPastos';

interface PastoMapaRow {
  pasto: Pasto;
  lote: string | null;
  tipoUso: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null }>;
  totalCabecas: number;
  pesoMedio: number | null;
  cabHa: number | null;
  uaHa: number | null;
}

function calcUA(quantidade: number, pesoMedioKg: number | null): number {
  if (!pesoMedioKg || pesoMedioKg <= 0) return quantidade;
  return (quantidade * pesoMedioKg) / 450;
}

export function MapaPastosTab() {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [rows, setRows] = useState<PastoMapaRow[]>([]);
  const [loading, setLoading] = useState(false);

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

        // Use monthly data from fechamento, fallback to pasto defaults
        const lote = fech?.lote_mes ?? pasto.lote_padrao ?? null;
        const tipoUso = fech?.tipo_uso_mes ?? pasto.tipo_uso ?? null;
        const qualidade = fech?.qualidade_mes ?? pasto.qualidade ?? null;

        const totalCab = Array.from(catMap.values()).reduce((s, v) => s + v.quantidade, 0);
        const comPeso = Array.from(catMap.values()).filter(v => v.quantidade > 0 && v.peso_medio_kg);
        const pesoMedio = comPeso.length > 0
          ? comPeso.reduce((s, v) => s + (v.peso_medio_kg || 0) * v.quantidade, 0) / comPeso.reduce((s, v) => s + v.quantidade, 0)
          : null;
        const cabHa = pasto.area_produtiva_ha && totalCab > 0 ? totalCab / pasto.area_produtiva_ha : null;

        let totalUA = 0;
        catMap.forEach(v => { totalUA += calcUA(v.quantidade, v.peso_medio_kg); });
        const uaHa = pasto.area_produtiva_ha && totalUA > 0 ? totalUA / pasto.area_produtiva_ha : null;

        return { pasto, lote, tipoUso, qualidade, categorias: catMap, totalCabecas: totalCab, pesoMedio, cabHa, uaHa };
      });

      setRows(result);
      setLoading(false);
    };
    build();
  }, [fechamentos, pastos, loadItens]);

  const totais = useMemo(() => {
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
    const comPesoRows = rows.filter(r => r.pesoMedio !== null && r.totalCabecas > 0);
    const pesoMedioGeral = comPesoRows.length > 0
      ? comPesoRows.reduce((s, r) => s + (r.pesoMedio || 0) * r.totalCabecas, 0) / comPesoRows.reduce((s, r) => s + r.totalCabecas, 0)
      : null;

    return { catTotals, totalCab, areaTotal, pesoMedioGeral };
  }, [rows, categorias]);

  const getLotacaoColor = (cabHa: number | null) => {
    if (!cabHa) return '';
    if (cabHa > 2.5) return 'text-red-600 font-bold';
    if (cabHa > 1.5) return 'text-yellow-600 font-semibold';
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
      <div className="p-4 pb-24 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={anoMes} onValueChange={setAnoMes}>
              <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                {getAnoMesOptions().map(am => (
                  <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{totais.totalCab} cab</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportMapaPastosXlsx(rows, categorias, totais, anoMes, fazendaAtual?.nome || 'Fazenda')}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />Exportar
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando mapa...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
        ) : (
          <div className="relative overflow-auto rounded-lg border">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="sticky left-0 z-20 bg-muted p-2 text-left font-semibold border-b border-r min-w-[120px]">Pasto</th>
                  <th className="p-2 text-left font-medium border-b border-r min-w-[60px]">Lote</th>
                  {categorias.map(cat => (
                    <th key={cat.id} className="p-2 text-center font-medium border-b border-r min-w-[70px]">
                      <div className="text-xs leading-tight">{cat.nome}</div>
                    </th>
                  ))}
                  <th className="p-2 text-center font-semibold border-b border-r min-w-[80px] bg-primary/10">Total</th>
                  <th className="p-2 text-center font-medium border-b border-r min-w-[60px]">Área (ha)</th>
                  <th className="p-2 text-center font-medium border-b border-r min-w-[70px]">Cab/ha</th>
                  <th className="p-2 text-center font-medium border-b border-r min-w-[70px]">UA/ha</th>
                  <th className="p-2 text-center font-medium border-b min-w-[50px]">Qual.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.pasto.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <td className="sticky left-0 z-10 p-2 font-semibold border-r whitespace-nowrap" style={{ backgroundColor: 'inherit' }}>
                      {row.pasto.nome}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground border-r">{row.pasto.lote_padrao || '—'}</td>
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
                                {peso && <p>Peso médio: {peso.toFixed(0)} kg</p>}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-center font-bold border-r bg-primary/5">{row.totalCabecas || '—'}</td>
                    <td className="p-2 text-center border-r">{row.pasto.area_produtiva_ha?.toFixed(1) || '—'}</td>
                    <td className={`p-2 text-center border-r ${getLotacaoColor(row.cabHa)}`}>{row.cabHa?.toFixed(2) || '—'}</td>
                    <td className={`p-2 text-center border-r ${getLotacaoColor(row.uaHa)}`}>{row.uaHa?.toFixed(2) || '—'}</td>
                    <td className="p-2 text-center">
                      {row.pasto.qualidade ? (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getQualidadeColor(row.pasto.qualidade)}`}>
                          {row.pasto.qualidade}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold border-t-2">
                  <td className="sticky left-0 z-10 bg-muted p-2 border-r" colSpan={2}>TOTAL</td>
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
                              {pesoMed && <p>Peso médio: {pesoMed.toFixed(0)} kg</p>}
                            </TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center border-r bg-primary/10 text-lg">{totais.totalCab}</td>
                  <td className="p-2 text-center border-r">{totais.areaTotal.toFixed(1)}</td>
                  <td className={`p-2 text-center border-r ${getLotacaoColor(totais.areaTotal > 0 ? totais.totalCab / totais.areaTotal : null)}`}>
                    {totais.areaTotal > 0 ? (totais.totalCab / totais.areaTotal).toFixed(2) : '—'}
                  </td>
                  <td className="p-2 text-center border-r">—</td>
                  <td className="p-2 text-center">—</td>
                </tr>
                <tr className="bg-muted/60 text-sm">
                  <td className="sticky left-0 z-10 bg-muted/60 p-2 border-r" colSpan={2}>Peso Médio</td>
                  {categorias.map(cat => {
                    const t = totais.catTotals.get(cat.id);
                    const pesoMed = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : null;
                    return (
                      <td key={cat.id} className="p-2 text-center border-r text-muted-foreground">
                        {pesoMed ? pesoMed.toFixed(0) : '—'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center border-r font-semibold">
                    {totais.pesoMedioGeral ? totais.pesoMedioGeral.toFixed(0) : '—'}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
