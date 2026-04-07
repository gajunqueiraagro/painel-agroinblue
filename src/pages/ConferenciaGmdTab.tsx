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

/** Format number: returns '–' for zero/null, applies color logic externally */
function fmt(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || v === 0) return '–';
  return formatNum(v, decimals);
}

/** Color class based on value sign */
function colorClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-emerald-600' : 'text-red-500';
}

/** GMD color: >2.000 = red warning */
function gmdColorClass(v: number | null): string {
  if (v === null) return 'text-muted-foreground';
  if (v > 2) return 'text-red-500 font-bold';
  return 'text-primary font-bold';
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

  // Per-category derived values
  const catDerived = useMemo(() => {
    return catsMes.map(cat => {
      const ganho = cat.peso_total_final - cat.peso_total_inicial - cat.peso_entradas_externas + cat.peso_saidas_externas;
      const cabMedia = (cat.saldo_inicial + cat.saldo_final) / 2;
      const gmd = cabMedia > 0 && cat.dias_mes > 0 ? ganho / (cabMedia * cat.dias_mes) : null;
      const kgMedioIni = cat.saldo_inicial > 0 ? cat.peso_total_inicial / cat.saldo_inicial : null;
      const kgMedioFin = cat.saldo_final > 0 ? cat.peso_total_final / cat.saldo_final : null;
      return { ...cat, ganho, cabMedia, gmd, kgMedioIni, kgMedioFin };
    });
  }, [catsMes]);

  // Totals row
  const totals = useMemo(() => {
    if (catsMes.length === 0) return null;
    const sum = (fn: (c: ZootCategoriaMensal) => number) => catsMes.reduce((s, c) => s + fn(c), 0);
    const saldoInicial = sum(c => c.saldo_inicial);
    const saldoFinal = sum(c => c.saldo_final);
    const entradasExternas = sum(c => c.entradas_externas);
    const saidasExternas = sum(c => c.saidas_externas);
    const evolCatEntrada = sum(c => c.evol_cat_entrada);
    const evolCatSaida = sum(c => c.evol_cat_saida);
    const pesoInicial = sum(c => c.peso_total_inicial);
    const pesoFinal = sum(c => c.peso_total_final);
    const pesoEntradasExt = sum(c => c.peso_entradas_externas);
    const pesoSaidasExt = sum(c => c.peso_saidas_externas);
    const dias = catsMes[0]?.dias_mes || 0;
    const ganho = pesoFinal - pesoInicial - pesoEntradasExt + pesoSaidasExt;
    const cabMedia = (saldoInicial + saldoFinal) / 2;
    const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;
    const kgMedioIni = saldoInicial > 0 ? pesoInicial / saldoInicial : null;
    const kgMedioFin = saldoFinal > 0 ? pesoFinal / saldoFinal : null;

    return {
      saldoInicial, saldoFinal, entradasExternas, saidasExternas,
      evolCatEntrada, evolCatSaida, pesoInicial, pesoFinal,
      pesoEntradasExt, pesoSaidasExt, ganho, dias, cabMedia, gmd,
      kgMedioIni, kgMedioFin,
    };
  }, [catsMes]);

  // Cell value based on view mode
  const getCellValue = (cat: typeof catDerived[0], col: string): string => {
    if (viewMode === 'cabecas') {
      switch (col) {
        case 'saldo_ini': return fmt(cat.saldo_inicial);
        case 'ent_ext': return fmt(cat.entradas_externas);
        case 'evol_ent': return fmt(cat.evol_cat_entrada);
        case 'sai_ext': return fmt(cat.saidas_externas);
        case 'evol_sai': return fmt(cat.evol_cat_saida);
        case 'saldo_fin': return fmt(cat.saldo_final);
        default: return '–';
      }
    }
    if (viewMode === 'kg_medio') {
      switch (col) {
        case 'saldo_ini': return fmt(cat.kgMedioIni, 1);
        case 'ent_ext': return '–';
        case 'evol_ent': return '–';
        case 'sai_ext': return '–';
        case 'evol_sai': return '–';
        case 'saldo_fin': return fmt(cat.kgMedioFin, 1);
        default: return '–';
      }
    }
    // kg_total
    switch (col) {
      case 'saldo_ini': return fmt(cat.peso_total_inicial, 0);
      case 'ent_ext': return fmt(cat.peso_entradas_externas, 0);
      case 'evol_ent': return fmt(cat.peso_evol_cat_entrada, 0);
      case 'sai_ext': return fmt(cat.peso_saidas_externas, 0);
      case 'evol_sai': return fmt(cat.peso_evol_cat_saida, 0);
      case 'saldo_fin': return fmt(cat.peso_total_final, 0);
      default: return '–';
    }
  };

  const getTotalCellValue = (col: string): string => {
    if (!totals) return '–';
    if (viewMode === 'cabecas') {
      switch (col) {
        case 'saldo_ini': return fmt(totals.saldoInicial);
        case 'ent_ext': return fmt(totals.entradasExternas);
        case 'evol_ent': return fmt(totals.evolCatEntrada);
        case 'sai_ext': return fmt(totals.saidasExternas);
        case 'evol_sai': return fmt(totals.evolCatSaida);
        case 'saldo_fin': return fmt(totals.saldoFinal);
        default: return '–';
      }
    }
    if (viewMode === 'kg_medio') {
      switch (col) {
        case 'saldo_ini': return fmt(totals.kgMedioIni, 1);
        case 'saldo_fin': return fmt(totals.kgMedioFin, 1);
        default: return '–';
      }
    }
    switch (col) {
      case 'saldo_ini': return fmt(totals.pesoInicial, 0);
      case 'ent_ext': return fmt(totals.pesoEntradasExt, 0);
      case 'evol_ent': return '–';
      case 'sai_ext': return fmt(totals.pesoSaidasExt, 0);
      case 'evol_sai': return '–';
      case 'saldo_fin': return fmt(totals.pesoFinal, 0);
      default: return '–';
    }
  };

  const cenarioLabel = cenario === 'meta' ? 'Meta' : 'Realizado';

  return (
    <div className="space-y-2 pb-24">
      {/* Header compact */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-6 w-6">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <h1 className="text-sm font-bold text-foreground">Conferência de GMD</h1>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          cenario === 'meta' ? 'bg-orange-100 text-orange-700' : 'bg-primary/10 text-primary'
        }`}>{cenarioLabel}</span>
      </div>

      {/* Filters - compact */}
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
            <button
              key={i}
              onClick={() => setMesSel(i + 1)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                mesSel === i + 1
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cenário toggle */}
        <div className="flex gap-0.5 ml-1">
          {(['realizado', 'meta'] as Cenario[]).map(c => (
            <button
              key={c}
              onClick={() => setCenario(c)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                cenario === c
                  ? c === 'meta' ? 'bg-orange-500 text-white' : 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c === 'meta' ? 'Meta' : 'Realizado'}
            </button>
          ))}
        </div>

        <div className="flex gap-0.5 ml-auto">
          {([
            { key: 'cabecas', label: 'Cabeça' },
            { key: 'kg_medio', label: 'Kg Médio' },
            { key: 'kg_total', label: 'Kg Total' },
          ] as { key: ViewMode; label: string }[]).map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                viewMode === v.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-6 text-muted-foreground text-xs">Carregando...</div>
      ) : catsMes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-xs">Sem dados para {MESES_LABELS[mesSel - 1]}/{ano} ({cenarioLabel})</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-1.5 py-1 font-semibold text-muted-foreground border-b sticky left-0 bg-muted/50 z-10 min-w-[80px]">Categoria</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[55px]">Saldo Ini.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[50px]">Ent. Ext.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[55px]">Evol. (E)</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[50px]">Saí. Ext.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[55px]">Evol. (S)</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[55px]">Saldo Fin.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b border-l-2 border-l-border min-w-[65px]">Peso Ini.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[65px]">Peso Fin.</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[60px]">Ganho (kg)</th>
                <th className="text-right px-1.5 py-1 font-semibold text-muted-foreground border-b min-w-[35px]">Dias</th>
                <th className="text-right px-1.5 py-1 font-semibold text-primary border-b min-w-[55px]">GMD</th>
              </tr>
            </thead>
            <tbody>
              {catDerived.map(cat => (
                <tr key={cat.categoria_id} className="hover:bg-muted/20 border-b border-border/30">
                  <td className="px-1.5 py-0.5 font-medium text-foreground sticky left-0 bg-background z-10 text-[10px]">{cat.categoria_nome}</td>
                  <td className="text-right px-1.5 py-0.5 text-muted-foreground">{getCellValue(cat, 'saldo_ini')}</td>
                  <td className={`text-right px-1.5 py-0.5 ${colorClass(cat.entradas_externas)}`}>{getCellValue(cat, 'ent_ext')}</td>
                  <td className={`text-right px-1.5 py-0.5 ${colorClass(cat.evol_cat_entrada)}`}>{getCellValue(cat, 'evol_ent')}</td>
                  <td className={`text-right px-1.5 py-0.5 ${colorClass(cat.saidas_externas ? -cat.saidas_externas : 0)}`}>{getCellValue(cat, 'sai_ext')}</td>
                  <td className={`text-right px-1.5 py-0.5 ${colorClass(cat.evol_cat_saida ? -cat.evol_cat_saida : 0)}`}>{getCellValue(cat, 'evol_sai')}</td>
                  <td className="text-right px-1.5 py-0.5 font-medium text-foreground">{getCellValue(cat, 'saldo_fin')}</td>
                  <td className="text-right px-1.5 py-0.5 text-muted-foreground border-l-2 border-l-border">{fmt(cat.peso_total_inicial, 0)}</td>
                  <td className="text-right px-1.5 py-0.5 text-muted-foreground">{fmt(cat.peso_total_final, 0)}</td>
                  <td className={`text-right px-1.5 py-0.5 font-medium ${colorClass(cat.ganho)}`}>{fmt(cat.ganho, 0)}</td>
                  <td className="text-right px-1.5 py-0.5 text-muted-foreground">{cat.dias_mes || '–'}</td>
                  <td className={`text-right px-1.5 py-0.5 ${gmdColorClass(cat.gmd)}`}>
                    {cat.gmd !== null ? formatNum(cat.gmd, 3) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="bg-muted/30 font-bold border-t-2 border-border">
                  <td className="px-1.5 py-1 text-foreground sticky left-0 bg-muted/30 z-10">TOTAL</td>
                  <td className="text-right px-1.5 py-1 text-foreground">{getTotalCellValue('saldo_ini')}</td>
                  <td className={`text-right px-1.5 py-1 ${colorClass(totals.entradasExternas)}`}>{getTotalCellValue('ent_ext')}</td>
                  <td className={`text-right px-1.5 py-1 ${colorClass(totals.evolCatEntrada)}`}>{getTotalCellValue('evol_ent')}</td>
                  <td className={`text-right px-1.5 py-1 ${colorClass(totals.saidasExternas ? -totals.saidasExternas : 0)}`}>{getTotalCellValue('sai_ext')}</td>
                  <td className={`text-right px-1.5 py-1 ${colorClass(totals.evolCatSaida ? -totals.evolCatSaida : 0)}`}>{getTotalCellValue('evol_sai')}</td>
                  <td className="text-right px-1.5 py-1 text-foreground">{getTotalCellValue('saldo_fin')}</td>
                  <td className="text-right px-1.5 py-1 text-foreground border-l-2 border-l-border">{fmt(totals.pesoInicial, 0)}</td>
                  <td className="text-right px-1.5 py-1 text-foreground">{fmt(totals.pesoFinal, 0)}</td>
                  <td className={`text-right px-1.5 py-1 ${colorClass(totals.ganho)}`}>{fmt(totals.ganho, 0)}</td>
                  <td className="text-right px-1.5 py-1 text-foreground">{totals.dias || '–'}</td>
                  <td className={`text-right px-1.5 py-1 text-sm ${gmdColorClass(totals.gmd)}`}>
                    {totals.gmd !== null ? formatNum(totals.gmd, 3) : '–'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Explicação do cálculo */}
      {totals && (
        <div className="border rounded-lg p-2 bg-muted/20 space-y-1.5 text-[10px] text-muted-foreground">
          <h3 className="font-semibold text-foreground text-xs">Fórmula do GMD (Total Fazenda) — {cenarioLabel}</h3>
          <div className="space-y-0.5 font-mono">
            <p>Ganho = Peso Fin. ({fmt(totals.pesoFinal, 0)}) − Peso Ini. ({fmt(totals.pesoInicial, 0)}) − Ent.Ext. ({fmt(totals.pesoEntradasExt, 0)}) + Saí.Ext. ({fmt(totals.pesoSaidasExt, 0)}) = <span className="font-bold text-foreground">{fmt(totals.ganho, 0)} kg</span></p>
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
