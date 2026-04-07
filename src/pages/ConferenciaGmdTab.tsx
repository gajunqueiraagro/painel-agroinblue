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

interface Props {
  onBack: () => void;
  filtroGlobal?: { ano: string; mes: number };
  cenario?: 'realizado' | 'meta';
}

export function ConferenciaGmdTab({ onBack, filtroGlobal, cenario = 'realizado' }: Props) {
  const anoAtual = filtroGlobal?.ano || String(new Date().getFullYear());
  const [ano, setAno] = useState(anoAtual);
  const [mesSel, setMesSel] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<ViewMode>('cabecas');

  const { data: categoriaMensal = [], isLoading } = useZootCategoriaMensal({
    ano: Number(ano),
    cenario,
  });

  const byMes = useMemo(() => groupByMes(categoriaMensal), [categoriaMensal]);
  const catsMes = useMemo(() => (byMes[mesSel] || []).sort((a, b) => a.ordem_exibicao - b.ordem_exibicao), [byMes, mesSel]);

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

    // Ganho líquido = PesoFinal - PesoInicial - PesoEntradas + PesoSaídas
    const ganho = pesoFinal - pesoInicial - pesoEntradasExt + pesoSaidasExt;
    const cabMedia = (saldoInicial + saldoFinal) / 2;
    const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;

    return {
      saldoInicial, saldoFinal, entradasExternas, saidasExternas,
      evolCatEntrada, evolCatSaida, pesoInicial, pesoFinal,
      pesoEntradasExt, pesoSaidasExt, ganho, dias, cabMedia, gmd,
    };
  }, [catsMes]);

  const getCellValue = (cat: ZootCategoriaMensal, col: string): string => {
    if (viewMode === 'cabecas') {
      switch (col) {
        case 'saldo_ini': return formatNum(cat.saldo_inicial);
        case 'ent_ext': return formatNum(cat.entradas_externas);
        case 'evol_ent': return formatNum(cat.evol_cat_entrada);
        case 'sai_ext': return formatNum(cat.saidas_externas);
        case 'evol_sai': return formatNum(cat.evol_cat_saida);
        case 'saldo_fin': return formatNum(cat.saldo_final);
        default: return '—';
      }
    }
    if (viewMode === 'kg_medio') {
      switch (col) {
        case 'saldo_ini': return cat.peso_medio_inicial !== null ? formatNum(cat.peso_medio_inicial, 1) : '—';
        case 'saldo_fin': return cat.peso_medio_final !== null ? formatNum(cat.peso_medio_final, 1) : '—';
        default: return '—';
      }
    }
    // kg_total
    switch (col) {
      case 'saldo_ini': return formatNum(cat.peso_total_inicial, 0);
      case 'ent_ext': return formatNum(cat.peso_entradas_externas, 0);
      case 'evol_ent': return formatNum(cat.peso_evol_cat_entrada, 0);
      case 'sai_ext': return formatNum(cat.peso_saidas_externas, 0);
      case 'evol_sai': return formatNum(cat.peso_evol_cat_saida, 0);
      case 'saldo_fin': return formatNum(cat.peso_total_final, 0);
      default: return '—';
    }
  };

  const getTotalCellValue = (col: string): string => {
    if (!totals) return '—';
    if (viewMode === 'cabecas') {
      switch (col) {
        case 'saldo_ini': return formatNum(totals.saldoInicial);
        case 'ent_ext': return formatNum(totals.entradasExternas);
        case 'evol_ent': return formatNum(totals.evolCatEntrada);
        case 'sai_ext': return formatNum(totals.saidasExternas);
        case 'evol_sai': return formatNum(totals.evolCatSaida);
        case 'saldo_fin': return formatNum(totals.saldoFinal);
        default: return '—';
      }
    }
    if (viewMode === 'kg_medio') {
      switch (col) {
        case 'saldo_ini': return totals.saldoInicial > 0 ? formatNum(totals.pesoInicial / totals.saldoInicial, 1) : '—';
        case 'saldo_fin': return totals.saldoFinal > 0 ? formatNum(totals.pesoFinal / totals.saldoFinal, 1) : '—';
        default: return '—';
      }
    }
    // kg_total
    switch (col) {
      case 'saldo_ini': return formatNum(totals.pesoInicial, 0);
      case 'ent_ext': return formatNum(totals.pesoEntradasExt, 0);
      case 'evol_ent': return '—';
      case 'sai_ext': return formatNum(totals.pesoSaidasExt, 0);
      case 'evol_sai': return '—';
      case 'saldo_fin': return formatNum(totals.pesoFinal, 0);
      default: return '—';
    }
  };

  const unitLabel = viewMode === 'cabecas' ? 'cab' : viewMode === 'kg_medio' ? 'kg/cab' : 'kg total';

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Conferência de GMD</h1>
        <span className="text-xs text-muted-foreground ml-1">({cenario === 'meta' ? 'Meta' : 'Realizado'})</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, -1, -2].map(d => {
              const y = String(new Date().getFullYear() + d);
              return <SelectItem key={y} value={y}>{y}</SelectItem>;
            })}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {MESES_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setMesSel(i + 1)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                mesSel === i + 1
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 ml-auto">
          {([
            { key: 'cabecas', label: 'Por Cabeça' },
            { key: 'kg_medio', label: 'Por Kg Médio' },
            { key: 'kg_total', label: 'Por Kg Total' },
          ] as { key: ViewMode; label: string }[]).map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
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
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : catsMes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Sem dados para {MESES_LABELS[mesSel - 1]}/{ano}</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground border-b sticky left-0 bg-muted/50 z-10 min-w-[100px]">
                  Categoria
                </th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Saldo Ini.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Ent. Ext.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Evol. Cat. (E)</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Saí. Ext.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Evol. Cat. (S)</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[70px]">Saldo Fin.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b border-l-2 border-l-border min-w-[80px]">Peso Ini. (kg)</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[80px]">Peso Fin. (kg)</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[80px]">Ganho (kg)</th>
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground border-b min-w-[50px]">Dias</th>
                <th className="text-right px-2 py-1.5 font-semibold text-primary border-b min-w-[70px]">GMD</th>
              </tr>
            </thead>
            <tbody>
              {catsMes.map(cat => {
                // Per-category GMD
                const ganho = cat.peso_total_final - cat.peso_total_inicial - cat.peso_entradas_externas + cat.peso_saidas_externas;
                const cabMedia = (cat.saldo_inicial + cat.saldo_final) / 2;
                const gmdCat = cabMedia > 0 && cat.dias_mes > 0 ? ganho / (cabMedia * cat.dias_mes) : null;

                return (
                  <tr key={cat.categoria_id} className="hover:bg-muted/20 border-b border-border/40">
                    <td className="px-2 py-1 font-medium text-foreground sticky left-0 bg-background z-10">{cat.categoria_nome}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{getCellValue(cat, 'saldo_ini')}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{getCellValue(cat, 'ent_ext')}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{getCellValue(cat, 'evol_ent')}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{getCellValue(cat, 'sai_ext')}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{getCellValue(cat, 'evol_sai')}</td>
                    <td className="text-right px-2 py-1 font-medium text-foreground">{getCellValue(cat, 'saldo_fin')}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground border-l-2 border-l-border">{formatNum(cat.peso_total_inicial, 0)}</td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{formatNum(cat.peso_total_final, 0)}</td>
                    <td className={`text-right px-2 py-1 font-medium ${ganho >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatNum(ganho, 0)}
                    </td>
                    <td className="text-right px-2 py-1 text-muted-foreground">{cat.dias_mes}</td>
                    <td className="text-right px-2 py-1 font-bold text-primary">
                      {gmdCat !== null ? formatNum(gmdCat, 3) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="bg-muted/30 font-bold border-t-2 border-border">
                  <td className="px-2 py-1.5 text-foreground sticky left-0 bg-muted/30 z-10">TOTAL</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('saldo_ini')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('ent_ext')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('evol_ent')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('sai_ext')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('evol_sai')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{getTotalCellValue('saldo_fin')}</td>
                  <td className="text-right px-2 py-1.5 text-foreground border-l-2 border-l-border">{formatNum(totals.pesoInicial, 0)}</td>
                  <td className="text-right px-2 py-1.5 text-foreground">{formatNum(totals.pesoFinal, 0)}</td>
                  <td className={`text-right px-2 py-1.5 ${totals.ganho >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatNum(totals.ganho, 0)}
                  </td>
                  <td className="text-right px-2 py-1.5 text-foreground">{totals.dias}</td>
                  <td className="text-right px-2 py-1.5 text-primary text-sm">
                    {totals.gmd !== null ? formatNum(totals.gmd, 3) : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Explicação do cálculo */}
      {totals && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2 text-xs text-muted-foreground">
          <h3 className="font-semibold text-foreground text-sm">Fórmula do GMD (Total Fazenda)</h3>
          <div className="space-y-1 font-mono">
            <p>Ganho líquido = Peso Final ({formatNum(totals.pesoFinal, 0)} kg)</p>
            <p className="pl-12">− Peso Inicial ({formatNum(totals.pesoInicial, 0)} kg)</p>
            <p className="pl-12">− Peso Entradas Ext. ({formatNum(totals.pesoEntradasExt, 0)} kg)</p>
            <p className="pl-12">+ Peso Saídas Ext. ({formatNum(totals.pesoSaidasExt, 0)} kg)</p>
            <p className="font-bold text-foreground pl-12">= {formatNum(totals.ganho, 0)} kg</p>
          </div>
          <div className="pt-1 border-t space-y-1 font-mono">
            <p>Cab. médias = ({formatNum(totals.saldoInicial)} + {formatNum(totals.saldoFinal)}) / 2 = {formatNum(totals.cabMedia, 1)}</p>
            <p>Dias = {totals.dias}</p>
            <p className="font-bold text-primary">
              GMD = {formatNum(totals.ganho, 0)} / ({formatNum(totals.cabMedia, 1)} × {totals.dias}) ={' '}
              {totals.gmd !== null ? formatNum(totals.gmd, 3) : '—'} kg/cab/dia
            </p>
          </div>
          <div className="pt-2 text-[10px] text-muted-foreground/70">
            <p>• Evol. de categoria NÃO altera ganho (apenas redistribui peso)</p>
            <p>• Entradas externas são descontadas do ganho</p>
            <p>• Saídas externas são somadas ao ganho</p>
            <p>• Unidade: {unitLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}
