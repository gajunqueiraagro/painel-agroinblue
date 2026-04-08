/**
 * Conferência de GMD — Auditoria completa do cálculo do GMD mensal.
 *
 * Fonte única: vw_zoot_categoria_mensal (via useZootCategoriaMensal).
 * Esta é a MESMA fonte usada por Evolução de Categorias e Valor do Rebanho.
 * Não recalcula — apenas lê, formata, exibe e AUDITA divergências.
 */
import { useState, useMemo } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useZootCategoriaMensal, groupByMes } from '@/hooks/useZootCategoriaMensal';
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
  saldo_calculado: number;
  divergencia: number;
  pesoTotalIni: number;
  pesoTotalFin: number;
  pesoCabIni: number | null;
  pesoCabFin: number | null;
  pesoEntradasExt: number;
  pesoSaidasExt: number;
  pesoEvolEntrada: number;
  pesoEvolSaida: number;
  kgMedioEntExt: number | null;
  kgMedioSaiExt: number | null;
  kgMedioEvolEnt: number | null;
  kgMedioEvolSai: number | null;
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

  const rows: CatRow[] = useMemo(() => {
    return catsMes.map(cat => {
      const pesoTotalIni = cat.peso_total_inicial;
      const pesoTotalFin = cat.peso_total_final;
      const pesoCabIni = div(pesoTotalIni, cat.saldo_inicial);
      const pesoCabFin = div(pesoTotalFin, cat.saldo_final);
      const pesoEntradasExt = cat.peso_entradas_externas;
      const pesoSaidasExt = cat.peso_saidas_externas;
      const pesoEvolEntrada = cat.peso_evol_cat_entrada;
      const pesoEvolSaida = cat.peso_evol_cat_saida;
      const ganho = pesoTotalFin - pesoTotalIni - pesoEntradasExt + pesoSaidasExt - pesoEvolEntrada + pesoEvolSaida;
      const cabMedia = (cat.saldo_inicial + cat.saldo_final) / 2;
      const dias = cat.dias_mes;
      const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;

      const saldo_calculado = cat.saldo_inicial + cat.entradas_externas + cat.evol_cat_entrada - cat.saidas_externas - cat.evol_cat_saida;
      const divergencia = cat.saldo_final - saldo_calculado;

      return {
        categoria_id: cat.categoria_id,
        categoria_nome: cat.categoria_nome,
        saldo_inicial: cat.saldo_inicial,
        entradas_externas: cat.entradas_externas,
        evol_cat_entrada: cat.evol_cat_entrada,
        saidas_externas: cat.saidas_externas,
        evol_cat_saida: cat.evol_cat_saida,
        saldo_final: cat.saldo_final,
        saldo_calculado,
        divergencia,
        pesoTotalIni, pesoTotalFin, pesoCabIni, pesoCabFin,
        pesoEntradasExt, pesoSaidasExt,
        pesoEvolEntrada, pesoEvolSaida,
        kgMedioEntExt: div(pesoEntradasExt, cat.entradas_externas),
        kgMedioSaiExt: div(pesoSaidasExt, cat.saidas_externas),
        kgMedioEvolEnt: div(pesoEvolEntrada, cat.evol_cat_entrada),
        kgMedioEvolSai: div(pesoEvolSaida, cat.evol_cat_saida),
        ganho, dias, cabMedia, gmd,
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
    const saldoCalculado = s(r => r.saldo_calculado);
    const divergencia = saldoFinal - saldoCalculado;
    const pesoTotalIni = s(r => r.pesoTotalIni);
    const pesoTotalFin = s(r => r.pesoTotalFin);
    const pesoEntradasExt = s(r => r.pesoEntradasExt);
    const pesoSaidasExt = s(r => r.pesoSaidasExt);
    const pesoEvolEntrada = s(r => r.pesoEvolEntrada);
    const pesoEvolSaida = s(r => r.pesoEvolSaida);
    const pesoCabIni = div(pesoTotalIni, saldoInicial);
    const pesoCabFin = div(pesoTotalFin, saldoFinal);
    const ganho = pesoTotalFin - pesoTotalIni - pesoEntradasExt + pesoSaidasExt - pesoEvolEntrada + pesoEvolSaida;
    const cabMedia = (saldoInicial + saldoFinal) / 2;
    const dias = rows[0]?.dias || 0;
    const gmd = cabMedia > 0 && dias > 0 ? ganho / (cabMedia * dias) : null;
    return {
      saldoInicial, saldoFinal, entradasExternas, saidasExternas,
      evolCatEntrada, evolCatSaida, saldoCalculado, divergencia,
      pesoTotalIni, pesoTotalFin,
      pesoCabIni, pesoCabFin, pesoEntradasExt, pesoSaidasExt,
      pesoEvolEntrada, pesoEvolSaida,
      kgMedioEntExt: div(pesoEntradasExt, entradasExternas),
      kgMedioSaiExt: div(pesoSaidasExt, saidasExternas),
      kgMedioEvolEnt: div(pesoEvolEntrada, evolCatEntrada),
      kgMedioEvolSai: div(pesoEvolSaida, evolCatSaida),
      ganho, dias, cabMedia, gmd,
    };
  }, [rows]);

  const cenarioLabel = cenario === 'meta' ? 'Meta' : 'Realizado';
  const isCab = viewMode === 'cabecas';
  const isKgM = viewMode === 'kg_medio';
  const isKgT = viewMode === 'kg_total';

  // Divergence summary
  const divergentRows = useMemo(() => rows.filter(r => r.divergencia !== 0), [rows]);
  const hasDivergence = divergentRows.length > 0;

  // Movement column value per viewMode
  function movVal(r: CatRow, field: 'saldo_inicial' | 'entradas_externas' | 'evol_cat_entrada' | 'saidas_externas' | 'evol_cat_saida' | 'saldo_final') {
    if (isCab) return { v: r[field], dec: 0 };
    if (isKgM) {
      switch (field) {
        case 'saldo_inicial': return { v: r.pesoCabIni, dec: 1 };
        case 'saldo_final': return { v: r.pesoCabFin, dec: 1 };
        case 'entradas_externas': return { v: r.kgMedioEntExt, dec: 1 };
        case 'saidas_externas': return { v: r.kgMedioSaiExt, dec: 1 };
        case 'evol_cat_entrada': return { v: r.kgMedioEvolEnt, dec: 1 };
        case 'evol_cat_saida': return { v: r.kgMedioEvolSai, dec: 1 };
      }
    }
    // kg_total
    switch (field) {
      case 'saldo_inicial': return { v: r.pesoTotalIni, dec: 0 };
      case 'saldo_final': return { v: r.pesoTotalFin, dec: 0 };
      case 'entradas_externas': return { v: r.pesoEntradasExt, dec: 0 };
      case 'saidas_externas': return { v: r.pesoSaidasExt, dec: 0 };
      case 'evol_cat_entrada': return { v: r.pesoEvolEntrada, dec: 0 };
      case 'evol_cat_saida': return { v: r.pesoEvolSaida, dec: 0 };
    }
  }

  function totalMovVal(field: 'saldoInicial' | 'entradasExternas' | 'evolCatEntrada' | 'saidasExternas' | 'evolCatSaida' | 'saldoFinal') {
    if (!totals) return { v: 0 as number | null, dec: 0 };
    if (isCab) return { v: totals[field], dec: 0 };
    if (isKgM) {
      switch (field) {
        case 'saldoInicial': return { v: totals.pesoCabIni, dec: 1 };
        case 'saldoFinal': return { v: totals.pesoCabFin, dec: 1 };
        case 'entradasExternas': return { v: totals.kgMedioEntExt, dec: 1 };
        case 'saidasExternas': return { v: totals.kgMedioSaiExt, dec: 1 };
        case 'evolCatEntrada': return { v: totals.kgMedioEvolEnt, dec: 1 };
        case 'evolCatSaida': return { v: totals.kgMedioEvolSai, dec: 1 };
      }
    }
    switch (field) {
      case 'saldoInicial': return { v: totals.pesoTotalIni, dec: 0 };
      case 'saldoFinal': return { v: totals.pesoTotalFin, dec: 0 };
      case 'entradasExternas': return { v: totals.pesoEntradasExt, dec: 0 };
      case 'saidasExternas': return { v: totals.pesoSaidasExt, dec: 0 };
      case 'evolCatEntrada': return { v: totals.pesoEvolEntrada, dec: 0 };
      case 'evolCatSaida': return { v: totals.pesoEvolSaida, dec: 0 };
    }
  }

  const colHeaders = isCab
    ? ['Saldo Ini.', 'Ent.Ext', 'Evol.(E)', 'Saí.Ext', 'Evol.(S)', 'Saldo Fin.']
    : isKgM
      ? ['Kg/cab Ini.', 'Kg/cab E.E', 'Kg/cab Ev.E', 'Kg/cab S.E', 'Kg/cab Ev.S', 'Kg/cab Fin.']
      : ['Kg Tot.Ini.', 'Kg E.Ext', 'Kg Ev.(E)', 'Kg S.Ext', 'Kg Ev.(S)', 'Kg Tot.Fin.'];

  const movFields: Array<'saldo_inicial' | 'entradas_externas' | 'evol_cat_entrada' | 'saidas_externas' | 'evol_cat_saida' | 'saldo_final'> =
    ['saldo_inicial', 'entradas_externas', 'evol_cat_entrada', 'saidas_externas', 'evol_cat_saida', 'saldo_final'];
  const totalFields: Array<'saldoInicial' | 'entradasExternas' | 'evolCatEntrada' | 'saidasExternas' | 'evolCatSaida' | 'saldoFinal'> =
    ['saldoInicial', 'entradasExternas', 'evolCatEntrada', 'saidasExternas', 'evolCatSaida', 'saldoFinal'];

  function movColor(field: string, v: number | null | undefined) {
    if (field === 'saldo_inicial' || field === 'saldo_final' || field === 'saldoInicial' || field === 'saldoFinal') return 'text-muted-foreground';
    if (field.includes('saida') || field.includes('Saida') || field.includes('evol_cat_saida') || field.includes('evolCatSaida')) {
      return colorClass(v ? -v : 0);
    }
    return colorClass(v);
  }

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

      {/* Filters — row 1: Ano + Cenário + ViewMode */}
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
          {(['realizado', 'meta'] as Cenario[]).map(c => (
            <button key={c} onClick={() => setCenario(c)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                cenario === c ? (c === 'meta' ? 'bg-orange-500 text-white' : 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{c === 'meta' ? 'Meta' : 'Realizado'}</button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        <div className="flex gap-0.5">
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

      {/* Filters — row 2: Meses */}
      <div className="flex gap-0.5">
        {MESES_LABELS.map((label, i) => (
          <button key={i} onClick={() => setMesSel(i + 1)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              mesSel === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>{label}</button>
        ))}
      </div>

      {/* Divergence Alert */}
      {hasDivergence && !isLoading && (
        <div className="border border-red-300 bg-red-50 rounded-lg p-2 flex items-start gap-2 text-[10px]">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700">
              ⚠ Divergência detectada — Movimentações não batem com o fechamento de pastos
            </p>
            <p className="text-red-600 mt-0.5">
              O saldo final (fechamento) difere do saldo calculado (ini + entradas − saídas).
              Isso indica <strong>movimentações não registradas</strong> no sistema.
            </p>
            <div className="mt-1 space-y-0.5">
              {divergentRows.map(r => (
                <p key={r.categoria_id} className="text-red-600">
                  <strong>{r.categoria_nome}</strong>: calculado = {r.saldo_calculado} cab, fechamento = {r.saldo_final} cab → <strong>divergência de {r.divergencia > 0 ? '+' : ''}{r.divergencia} cab</strong>
                </p>
              ))}
            </div>
            <p className="text-red-500 mt-1 text-[9px]">
              Verifique se há compras, reclassificações ou transferências que não foram lançadas.
            </p>
          </div>
        </div>
      )}

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
                <col style={{ width: '80px' }} />
                <col style={{ width: '52px' }} />
                <col style={{ width: '48px' }} />
                <col style={{ width: '48px' }} />
                <col style={{ width: '48px' }} />
                <col style={{ width: '48px' }} />
                <col style={{ width: '52px' }} />
                {/* fixed peso/cab ini + fin */}
                <col style={{ width: '52px' }} />
                <col style={{ width: '52px' }} />
                {/* Dias, GMD */}
                <col style={{ width: '30px' }} />
                <col style={{ width: '48px' }} />
                {/* Divergência (only in cabeça mode) */}
                {isCab && <col style={{ width: '38px' }} />}
              </colgroup>
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-1 py-0.5 font-semibold text-muted-foreground border-b">Categoria</th>
                  {colHeaders.map((h, i) => (
                    <th key={i} className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">{h}</th>
                  ))}
                  <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b border-l-2 border-l-border">Kg/cab I</th>
                  <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Kg/cab F</th>
                  <th className="text-right px-1 py-0.5 font-semibold text-muted-foreground border-b">Dias</th>
                  <th className="text-right px-1 py-0.5 font-semibold text-primary border-b">GMD</th>
                  {isCab && <th className="text-right px-1 py-0.5 font-semibold text-red-500 border-b border-l-2 border-l-border">Div.</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const hasDiv = r.divergencia !== 0;
                  return (
                    <tr key={r.categoria_id} className={`hover:bg-muted/20 border-b border-border/30 ${hasDiv ? 'bg-red-50/50' : ''}`}>
                      <td className="px-1 py-0.5 font-medium text-foreground truncate">{r.categoria_nome}</td>
                      {movFields.map((f, i) => {
                        const { v, dec } = movVal(r, f)!;
                        const cls = (f === 'saldo_final') ? 'font-medium text-foreground' : movColor(f, v);
                        return <td key={i} className={`text-right px-1 py-0.5 ${cls}`}>{fmt(v, dec)}</td>;
                      })}
                      <td className="text-right px-1 py-0.5 text-muted-foreground border-l-2 border-l-border">{fmt(r.pesoCabIni, 1)}</td>
                      <td className="text-right px-1 py-0.5 text-muted-foreground">{fmt(r.pesoCabFin, 1)}</td>
                      <td className="text-right px-1 py-0.5 text-muted-foreground">{r.dias || '–'}</td>
                      <td className={`text-right px-1 py-0.5 ${gmdColorClass(r.gmd)}`}>
                        {r.gmd !== null ? formatNum(r.gmd, 3) : '–'}
                      </td>
                      {isCab && (
                        <td className={`text-right px-1 py-0.5 border-l-2 border-l-border font-bold ${hasDiv ? 'text-red-500' : 'text-emerald-600'}`}>
                          {hasDiv ? (r.divergencia > 0 ? '+' : '') + r.divergencia : '✓'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-muted/30 font-bold border-t-2 border-border">
                    <td className="px-1 py-0.5 text-foreground">TOTAL</td>
                    {totalFields.map((f, i) => {
                      const { v, dec } = totalMovVal(f)!;
                      const cls = (f === 'saldoFinal' || f === 'saldoInicial') ? 'text-foreground' : movColor(f, v);
                      return <td key={i} className={`text-right px-1 py-0.5 ${cls}`}>{fmt(v, dec)}</td>;
                    })}
                    <td className="text-right px-1 py-0.5 text-foreground border-l-2 border-l-border">{fmt(totals.pesoCabIni, 1)}</td>
                    <td className="text-right px-1 py-0.5 text-foreground">{fmt(totals.pesoCabFin, 1)}</td>
                    <td className="text-right px-1 py-0.5 text-foreground">{totals.dias || '–'}</td>
                    <td className={`text-right px-1 py-0.5 ${gmdColorClass(totals.gmd)}`}>
                      {totals.gmd !== null ? formatNum(totals.gmd, 3) : '–'}
                    </td>
                    {isCab && (
                      <td className={`text-right px-1 py-0.5 border-l-2 border-l-border font-bold ${totals.divergencia !== 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {totals.divergencia !== 0 ? (totals.divergencia > 0 ? '+' : '') + totals.divergencia : '✓'}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Fórmula */}
      {totals && (
        <div className="border rounded-lg p-2 bg-muted/20 space-y-1.5 text-[10px] text-muted-foreground max-w-[650px]">
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
          {hasDivergence && (
            <div className="pt-1 border-t">
              <p className="text-red-500 font-bold">
                ⚠ GMD pode estar distorcido — divergência de {totals.divergencia > 0 ? '+' : ''}{totals.divergencia} cab entre movimentações e fechamento.
              </p>
            </div>
          )}
          <div className="pt-1 text-[9px] text-muted-foreground/70 flex flex-wrap gap-x-4">
            <span>• Fonte: vw_zoot_categoria_mensal (mesma do Evolução e Valor do Rebanho)</span>
            <span>• Evol. cat. não altera ganho</span>
            <span className="text-red-500">• GMD {'>'} 2,000 = atenção</span>
          </div>
        </div>
      )}
    </div>
  );
}
