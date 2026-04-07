/**
 * Conferência de GMD — Auditoria completa do cálculo do GMD mensal.
 *
 * Fonte única: vw_zoot_categoria_mensal (via useZootCategoriaMensal).
 * Não recalcula — apenas lê, formata e exibe.
 */
import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useZootCategoriaMensal, groupByMes, type ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { formatNum } from '@/lib/calculos/formatters';

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type ViewMode = 'cabecas' | 'kg_medio' | 'kg_total';
type Cenario = 'realizado' | 'meta';

interface Props {
  onBack: () => void;
  filtroGlobal?: { ano: string; mes: number };
  cenario?: Cenario;
}

function fmt(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || v === 0) return '–';
  return formatNum(v, decimals);
}

function div(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function colorClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-emerald-600' : 'text-red-500';
}

function gmdColorClass(v: number | null): string {
  if (v === null) return 'text-muted-foreground';
  if (v > 2) return 'text-red-500 font-bold';
  return 'text-primary font-bold';
}

interface CatRow {
  categoria_id: string;
  categoria_nome: string;
  saldo_inicial: number;
  entradas_externas: number;
  evol_cat_entrada: number;
  saidas_externas: number;
  evol_cat_saida: number;
  saldo_final: number;
  pesoTotalIni: number;
  pesoTotalFin: number;
  pesoCabIni: number | null;
  pesoCabFin: number | null;
  pesoEntradasExt: number;
  pesoSaidasExt: number;
  ganho: number;
  dias: number;
  cabMedia: number;
  gmd: number | null;
}

export function ConferenciaGmdTab({ onBack, filtroGlobal, cenario: cenarioInicial = 'realizado' }: Props) {
  const anoAtual = filtroGlobal?.ano || String(new Date().getFullYear());
  const [ano, setAno] = useState(anoAtual);
  const [mesSel, setMesSel] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<ViewMode>('cabecas');
  const [cenario, setCenario] = useState<Cenario>(cenarioInicial);

  const { data: categoriaMensal = [], isLoading } = useZootCategoriaMensal({
    ano: Number(ano),
    cenario,
  });

  const byMes = useMemo(() => groupByMes(categoriaMensal), [categoriaMensal]);
  const catsMes = useMemo(() => (byMes[mesSel] || []).sort((a, b) => a.ordem_exibicao - b.ordem_exibicao), [byMes, mesSel]);

  // Derive all calc fields per category
  const rows: CatRow[] = useMemo(() => {
    return catsMes.map(cat => {
      const pesoTotalIni = cat.peso_total_inicial;
      const pesoTotalFin = cat.peso_total_final;
      const pesoCabIni = div(pesoTotalIni, cat.saldo_inicial);
      const pesoCabFin = div(pesoTotalFin, cat.saldo_final);
      const pesoEntradasExt = cat.peso_entradas_externas;
      const pesoSaidasExt = cat.peso_saidas_externas;
      const ganho = pesoTotalFin - pesoTotalIni - pesoEntradasExt + pesoSaidasExt;
      const cabMedia = (cat.saldo_inicial + cat.saldo_final) / 2;
      const dias = cat.dias_mes;
      const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;
      return {
        categoria_id: cat.categoria_id,
        categoria_nome: cat.categoria_nome,
        saldo_inicial: cat.saldo_inicial,
        entradas_externas: cat.entradas_externas,
        evol_cat_entrada: cat.evol_cat_entrada,
        saidas_externas: cat.saidas_externas,
        evol_cat_saida: cat.evol_cat_saida,
        saldo_final: cat.saldo_final,
        pesoTotalIni, pesoTotalFin, pesoCabIni, pesoCabFin,
        pesoEntradasExt, pesoSaidasExt, ganho, dias, cabMedia, gmd,
      };
    });
  }, [catsMes]);

  // Totals
  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const s = (fn: (r: CatRow) => number) => rows.reduce((a, r) => a + fn(r), 0);
    const saldoInicial = s(r => r.saldo_inicial);
    const saldoFinal = s(r => r.saldo_final);
    const entradasExternas = s(r => r.entradas_externas);
    const saidasExternas = s(r => r.saidas_externas);
    const evolCatEntrada = s(r => r.evol_cat_entrada);
    const evolCatSaida = s(r => r.evol_cat_saida);
    const pesoTotalIni = s(r => r.pesoTotalIni);
    const pesoTotalFin = s(r => r.pesoTotalFin);
    const pesoEntradasExt = s(r => r.pesoEntradasExt);
    const pesoSaidasExt = s(r => r.pesoSaidasExt);
    const pesoCabIni = div(pesoTotalIni, saldoInicial);
    const pesoCabFin = div(pesoTotalFin, saldoFinal);
    const ganho = pesoTotalFin - pesoTotalIni - pesoEntradasExt + pesoSaidasExt;
    const cabMedia = (saldoInicial + saldoFinal) / 2;
    const dias = rows[0]?.dias || 0;
    const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;
    return {
      saldoInicial, saldoFinal, entradasExternas, saidasExternas,
      evolCatEntrada, evolCatSaida, pesoTotalIni, pesoTotalFin,
      pesoCabIni, pesoCabFin, pesoEntradasExt, pesoSaidasExt,
      ganho, dias, cabMedia, gmd,
    };
  }, [rows]);

  const cenarioLabel = cenario === 'meta' ? 'Meta' : 'Realizado';

  // Column definitions change per viewMode
  const movCols = viewMode === 'cabecas';
  const showPesoTotal = viewMode === 'kg_total';
  const showPesoCab = viewMode === 'kg_medio';

  return (
    <div className="space-y-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-6 w-6">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <h1 className="text-sm font-bold text-foreground">Conferência de GMD</h1>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          cenario === 'meta' ? 'bg-orange-100 text-orange-700' : 'bg-primary/10 text-primary'
        }`}>{cenarioLabel}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-20 h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, -1, -2].map(d => {
              const y = String(new Date().getFullYear() + d);
              return <SelectItem key={y} value={y}>{y}</SelectItem>;
            })}
          </SelectContent>
        </Select>

        <div className="flex gap-0.5">
          {MESES_LABELS.map((label, i) => (
            <button key={i} onClick={() => setMesSel(i + 1)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                mesSel === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{label}</button>
          ))}
        </div>

        <div className="flex gap-0.5 ml-1">
          {(['realizado', 'meta'] as Cenario[]).map(c => (
            <button key={c} onClick={() => setCenario(c)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                cenario === c ? (c === 'meta' ? 'bg-orange-500 text-white' : 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{c === 'meta' ? 'Meta' : 'Realizado'}</button>
          ))}
        </div>

        <div className="flex gap-0.5 ml-auto">
          {([
            { key: 'cabecas' as ViewMode, label: 'Cabeça' },
            { key: 'kg_medio' as ViewMode, label: 'Kg Médio' },
            { key: 'kg_total' as ViewMode, label: 'Kg Total' },
          ]).map(v => (
            <button key={v.key} onClick={() => setViewMode(v.key)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                viewMode === v.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-6 text-muted-foreground text-xs">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-xs">Sem dados para {MESES_LABELS[mesSel - 1]}/{ano} ({cenarioLabel})</div>
      ) : (
        <div className="flex justify-start">
          <div className="overflow-x-auto border rounded-lg">
            <table className="table-fixed text-[10px] border-collapse">
              <colgroup>
                <col style={{ width: '76px' }} />
                {/* Mov cols: 6 cols when cabecas, hidden otherwise but we show saldo ini/fin always */}
                {movCols && <><col style={{ width: '48px' }} /><col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '42px' }} /><col style={{ width: '48px' }} /></>}
                {/* Peso cols */}
                {showPesoTotal && <><col style={{ width: '62px' }} /><col style={{ width: '62px' }} /></>}
                {showPesoCab && <><col style={{ width: '58px' }} /><col style={{ width: '58px' }} /></>}
                {/* Always: Ganho, Dias, GMD */}
                {showPesoTotal && <col style={{ width: '54px' }} />}
                <col style={{ width: '30px' }} />
                <col style={{ width: '48px' }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-1 py-0.5 font-semibold text-muted-foreground border-b">Categoria</th>
                  {movCols && <>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Saldo Ini.</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Ent.Ext</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Evol.(E)</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Saí.Ext</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Evol.(S)</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Saldo Fin.</th>
                  </>}
                  {showPesoTotal && <>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b border-l-2 border-l-border">Peso Tot.Ini</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Peso Tot.Fin</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Ganho (kg)</th>
                  </>}
                  {showPesoCab && <>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b border-l-2 border-l-border">Peso/cab Ini</th>
                    <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Peso/cab Fin</th>
                  </>}
                  <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Dias</th>
                  <th className="text-right px-1 py-0.5 font-semibold text-primary border-b">GMD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.categoria_id} className="hover:bg-muted/20 border-b border-border/30">
                    <td className="px-1 py-0.5 font-medium text-foreground truncate">{r.categoria_nome}</td>
                    {movCols && <>
                      <td className="text-right px-1 py-0.5 text-muted-foreground">{fmt(r.saldo_inicial)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(r.entradas_externas)}`}>{fmt(r.entradas_externas)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(r.evol_cat_entrada)}`}>{fmt(r.evol_cat_entrada)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(r.saidas_externas ? -r.saidas_externas : 0)}`}>{fmt(r.saidas_externas)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(r.evol_cat_saida ? -r.evol_cat_saida : 0)}`}>{fmt(r.evol_cat_saida)}</td>
                      <td className="text-right px-1 py-0.5 font-medium text-foreground">{fmt(r.saldo_final)}</td>
                    </>}
                    {showPesoTotal && <>
                      <td className="text-right px-1 py-0.5 text-muted-foreground border-l-2 border-l-border">{fmt(r.pesoTotalIni, 0)}</td>
                      <td className="text-right px-1 py-0.5 text-muted-foreground">{fmt(r.pesoTotalFin, 0)}</td>
                      <td className={`text-right px-1 py-0.5 font-medium ${colorClass(r.ganho)}`}>{fmt(r.ganho, 0)}</td>
                    </>}
                    {showPesoCab && <>
                      <td className="text-right px-1 py-0.5 text-muted-foreground border-l-2 border-l-border">{fmt(r.pesoCabIni, 1)}</td>
                      <td className="text-right px-1 py-0.5 text-muted-foreground">{fmt(r.pesoCabFin, 1)}</td>
                    </>}
                    <td className="text-right px-1 py-0.5 text-muted-foreground">{r.dias || '–'}</td>
                    <td className={`text-right px-1 py-0.5 ${gmdColorClass(r.gmd)}`}>
                      {r.gmd !== null ? formatNum(r.gmd, 3) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-muted/30 font-bold border-t-2 border-border">
                    <td className="px-1 py-0.5 text-foreground">TOTAL</td>
                    {movCols && <>
                      <td className="text-right px-1 py-0.5 text-foreground">{fmt(totals.saldoInicial)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(totals.entradasExternas)}`}>{fmt(totals.entradasExternas)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(totals.evolCatEntrada)}`}>{fmt(totals.evolCatEntrada)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(totals.saidasExternas ? -totals.saidasExternas : 0)}`}>{fmt(totals.saidasExternas)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(totals.evolCatSaida ? -totals.evolCatSaida : 0)}`}>{fmt(totals.evolCatSaida)}</td>
                      <td className="text-right px-1 py-0.5 text-foreground">{fmt(totals.saldoFinal)}</td>
                    </>}
                    {showPesoTotal && <>
                      <td className="text-right px-1 py-0.5 text-foreground border-l-2 border-l-border">{fmt(totals.pesoTotalIni, 0)}</td>
                      <td className="text-right px-1 py-0.5 text-foreground">{fmt(totals.pesoTotalFin, 0)}</td>
                      <td className={`text-right px-1 py-0.5 ${colorClass(totals.ganho)}`}>{fmt(totals.ganho, 0)}</td>
                    </>}
                    {showPesoCab && <>
                      <td className="text-right px-1 py-0.5 text-foreground border-l-2 border-l-border">{fmt(totals.pesoCabIni, 1)}</td>
                      <td className="text-right px-1 py-0.5 text-foreground">{fmt(totals.pesoCabFin, 1)}</td>
                    </>}
                    <td className="text-right px-1 py-0.5 text-foreground">{totals.dias || '–'}</td>
                    <td className={`text-right px-1 py-0.5 ${gmdColorClass(totals.gmd)}`}>
                      {totals.gmd !== null ? formatNum(totals.gmd, 3) : '–'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Fórmula */}
      {totals && (
        <div className="border rounded-lg p-2 bg-muted/20 space-y-1.5 text-[10px] text-muted-foreground max-w-[612px]">
          <h3 className="font-semibold text-foreground text-xs">Fórmula do GMD (Total Fazenda) — {cenarioLabel}</h3>
          <div className="space-y-0.5 font-mono">
            <p>Ganho = Peso Tot.Fin ({fmt(totals.pesoTotalFin, 0)}) − Peso Tot.Ini ({fmt(totals.pesoTotalIni, 0)}) − Ent.Ext.kg ({fmt(totals.pesoEntradasExt, 0)}) + Saí.Ext.kg ({fmt(totals.pesoSaidasExt, 0)}) = <span className="font-bold text-foreground">{fmt(totals.ganho, 0)} kg</span></p>
          </div>
          <div className="pt-0.5 border-t space-y-0.5 font-mono">
            <p>Cab. médias = ({fmt(totals.saldoInicial)} + {fmt(totals.saldoFinal)}) / 2 = {formatNum(totals.cabMedia, 1)} · Dias = {totals.dias}</p>
            <p className="font-bold text-primary">
              GMD = {fmt(totals.ganho, 0)} / ({formatNum(totals.cabMedia, 1)} × {totals.dias}) = {totals.gmd !== null ? formatNum(totals.gmd, 3) : '–'} kg/cab/dia
            </p>
          </div>
          <div className="pt-1 text-[9px] text-muted-foreground/70 flex flex-wrap gap-x-4">
            <span>• Evol. cat. não altera ganho</span>
            <span>• Entradas ext. descontadas</span>
            <span>• Saídas ext. somadas</span>
            <span className="text-red-500">• GMD {'>'} 2,000 = atenção</span>
          </div>
        </div>
      )}
    </div>
  );
}
