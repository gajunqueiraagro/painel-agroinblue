/**
 * Preços para Meta Anual — Motor de precificação oficial do cenário META.
 * Layout espelhado do ValorRebanhoTab com tema laranja (META).
 * Fonte única de preços para Valor do Rebanho META e Painel do Consultor META.
 *
 * Cálculos:
 *   R$/kg = R$/@ ÷ 30
 *   R$/cab = Peso × R$/kg
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Save, Copy, Lock, Unlock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useMetaValorRebanhoPrecos, type MetaPrecoCategoria } from '@/hooks/useMetaValorRebanhoPrecos';
import { useZootCategoriaMensal, type ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  onBack?: () => void;
}

const ORDEM_CATEGORIAS_FIXA = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

const CATEGORIA_LABELS: Record<string, string> = {
  mamotes_m: 'Mamotes M',
  desmama_m: 'Desmama M',
  garrotes: 'Garrotes',
  bois: 'Bois',
  touros: 'Touros',
  mamotes_f: 'Mamotes F',
  desmama_f: 'Desmama F',
  novilhas: 'Novilhas',
  vacas: 'Vacas',
};

const MESES_SHORT = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

const CHART_LABELS = ['I', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/* Fixed grid widths for the META summary card — easy to tweak */
const META_CARD_GRID = '310px 140px 140px 140px 140px';

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-500/20 text-amber-700 border-amber-300', icon: AlertTriangle },
  parcial: { label: 'Parcial', color: 'bg-orange-500/20 text-orange-700 border-orange-300', icon: AlertTriangle },
  validado: { label: 'Validado', color: 'bg-emerald-500/20 text-emerald-700 border-emerald-300', icon: CheckCircle },
};

interface LinhaTabela {
  codigo: string;
  nome: string;
  saldo: number;
  pesoMedio: number;
  precoArroba: number;
  precoKg: number;
  valorCabeca: number;
  valorTotal: number;
}

function fmtArroba(v: number): string {
  return v > 0 ? v.toFixed(2).replace('.', ',') : '0,00';
}

/* ---------- Mini chart (same as ValorRebanhoTab) ---------- */
function MiniChart({ data, color, title }: { data: { label: string; value: number | null }[]; color: string; title: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 truncate">{title}</p>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={0} tickLine={false} axisLine={false} />
            <YAxis hide domain={['auto', 'auto']} />
            <RechartsTooltip
              contentStyle={{ fontSize: 10, padding: '2px 6px' }}
              labelStyle={{ fontSize: 9 }}
              formatter={(v: number) => [formatNum(v, 1), '']}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MetaPrecoTab({ onBack }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const anoMes = `${ano}-${mes}`;

  const {
    precos, statusMes, loading, saving, isValidado,
    salvar, reabrir, copiarMesAnterior,
    statusAno, loadStatusAno,
  } = useMetaValorRebanhoPrecos(anoMes);

  const { perfil } = usePermissions();
  const isAdmin = perfil === 'admin_agroinblue';

  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;

  // Meta consolidation data for qty/peso
  const { data: viewDataMeta } = useZootCategoriaMensal({ ano: Number(ano), cenario: 'meta' });

  // Realized data for Jan of current year (vs Inic. ano)
  const { data: viewDataRealizadoAno } = useZootCategoriaMensal({ ano: Number(ano), cenario: 'realizado' });
  // Realized data for same month of previous year (vs 1 ano)
  const { data: viewDataRealizadoAnoAnt } = useZootCategoriaMensal({ ano: Number(ano) - 1, cenario: 'realizado' });

  // Valor rebanho fechamento for realized comparisons
  const [valorRebJan, setValorRebJan] = useState<number>(0);
  const [valorRebMesAnoAnt, setValorRebMesAnoAnt] = useState<number>(0);

  useEffect(() => {
    if (!fazendaId) return;
    const janAnoMes = `${ano}-01`;
    const mesAnoAnt = `${Number(ano) - 1}-${mes}`;

    Promise.all([
      supabase.from('valor_rebanho_fechamento').select('valor_total').eq('fazenda_id', fazendaId).eq('ano_mes', janAnoMes).maybeSingle(),
      supabase.from('valor_rebanho_fechamento').select('valor_total').eq('fazenda_id', fazendaId).eq('ano_mes', mesAnoAnt).maybeSingle(),
    ]).then(([r1, r2]) => {
      setValorRebJan(r1.data?.valor_total ?? 0);
      setValorRebMesAnoAnt(r2.data?.valor_total ?? 0);
    });
  }, [fazendaId, ano, mes]);

  const anos = useMemo(() => {
    const a: string[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) a.push(String(y));
    return a;
  }, []);

  useEffect(() => { loadStatusAno(ano); }, [ano, loadStatusAno, statusMes]);

  // Local prices state
  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};
    precos.forEach(p => {
      numMap[p.categoria] = p.preco_arroba;
      strMap[p.categoria] = p.preco_arroba > 0 ? fmtArroba(p.preco_arroba) : '';
    });
    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
  }, [precos]);

  // Meta rows by category
  const metaRowsByCategoria = useMemo(() => {
    if (!viewDataMeta) return new Map<string, ZootCategoriaMensal>();
    const mesNum = Number(mes);
    const map = new Map<string, ZootCategoriaMensal>();
    viewDataMeta.filter(r => r.mes === mesNum).forEach(r => map.set(r.categoria_codigo, r));
    return map;
  }, [viewDataMeta, mes]);

  // Build table rows — R$/kg = R$/@ ÷ 30
  const rows = useMemo<LinhaTabela[]>(() => {
    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const metaRow = metaRowsByCategoria.get(codigo);
      const saldo = metaRow?.saldo_final ?? 0;
      const pesoMedio = metaRow?.peso_medio_final ?? 0;
      const precoArroba = precosLocal[codigo] ?? 0;
      const precoKg = precoArroba > 0 ? precoArroba / 30 : 0;
      const valorCabeca = pesoMedio > 0 && precoKg > 0 ? pesoMedio * precoKg : 0;
      const valorTotal = saldo * pesoMedio * precoKg;

      return {
        codigo,
        nome: CATEGORIA_LABELS[codigo] || metaRow?.categoria_nome || codigo,
        saldo,
        pesoMedio,
        precoArroba,
        precoKg,
        valorCabeca,
        valorTotal,
      };
    });
  }, [metaRowsByCategoria, precosLocal]);

  // Totals
  const totals = useMemo(() => {
    const cabecas = rows.reduce((s, r) => s + r.saldo, 0);
    const pesoTotalKg = rows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0);
    const valor = rows.reduce((s, r) => s + r.valorTotal, 0);
    const pesoMedio = cabecas > 0 ? pesoTotalKg / cabecas : 0;
    const totalArrobas = pesoTotalKg / 30;
    const precoArroba = totalArrobas > 0 ? valor / totalArrobas : 0;
    const valorCabeca = cabecas > 0 ? valor / cabecas : 0;
    const precoKg = pesoTotalKg > 0 ? valor / pesoTotalKg : 0;
    return { cabecas, pesoMedio, precoKg, precoArroba, valorCabeca, valor, totalArrobas };
  }, [rows]);

  // ---------- Comparison data ----------
  // Realized totals for January of current year
  const compJan = useMemo(() => {
    if (!viewDataRealizadoAno) return null;
    const janRows = viewDataRealizadoAno.filter(r => r.mes === 1);
    if (janRows.length === 0) return null;
    const cabecas = janRows.reduce((s, r) => s + r.saldo_final, 0);
    const pesoTotalKg = janRows.reduce((s, r) => s + r.peso_total_final, 0);
    const pesoMedio = cabecas > 0 ? pesoTotalKg / cabecas : 0;
    const totalArrobas = pesoTotalKg / 30;
    const valorCabeca = valorRebJan > 0 && cabecas > 0 ? valorRebJan / cabecas : 0;
    const precoArroba = valorRebJan > 0 && totalArrobas > 0 ? valorRebJan / totalArrobas : 0;
    return { cabecas, pesoMedio, precoArroba, valorCabeca, totalArrobas, valor: valorRebJan };
  }, [viewDataRealizadoAno, valorRebJan]);

  // Realized totals for same month of previous year
  const compAnoAnt = useMemo(() => {
    if (!viewDataRealizadoAnoAnt) return null;
    const mesNum = Number(mes);
    const mesRows = viewDataRealizadoAnoAnt.filter(r => r.mes === mesNum);
    if (mesRows.length === 0) return null;
    const cabecas = mesRows.reduce((s, r) => s + r.saldo_final, 0);
    const pesoTotalKg = mesRows.reduce((s, r) => s + r.peso_total_final, 0);
    const pesoMedio = cabecas > 0 ? pesoTotalKg / cabecas : 0;
    const totalArrobas = pesoTotalKg / 30;
    const valorCabeca = valorRebMesAnoAnt > 0 && cabecas > 0 ? valorRebMesAnoAnt / cabecas : 0;
    const precoArroba = valorRebMesAnoAnt > 0 && totalArrobas > 0 ? valorRebMesAnoAnt / totalArrobas : 0;
    return { cabecas, pesoMedio, precoArroba, valorCabeca, totalArrobas, valor: valorRebMesAnoAnt };
  }, [viewDataRealizadoAnoAnt, mes, valorRebMesAnoAnt]);

  // ---------- Chart data (all 12 months) ----------
  const chartData = useMemo(() => {
    const valorArr: { label: string; value: number | null }[] = [];
    const arrobasArr: { label: string; value: number | null }[] = [];
    const precoArr: { label: string; value: number | null }[] = [];

    // Point "I" — Realized January (início do ano)
    const janRealized = viewDataRealizadoAno?.filter(r => r.mes === 1) ?? [];
    if (janRealized.length > 0) {
      const cabI = janRealized.reduce((s, r) => s + r.saldo_final, 0);
      const pesoI = janRealized.reduce((s, r) => s + r.peso_total_final, 0);
      const arrobasI = pesoI / 30;
      valorArr.push({ label: 'I', value: valorRebJan > 0 ? valorRebJan : null });
      arrobasArr.push({ label: 'I', value: cabI > 0 ? arrobasI : null });
      precoArr.push({ label: 'I', value: valorRebJan > 0 && arrobasI > 0 ? valorRebJan / arrobasI : null });
    } else {
      valorArr.push({ label: 'I', value: null });
      arrobasArr.push({ label: 'I', value: null });
      precoArr.push({ label: 'I', value: null });
    }

    // Points J–D from META
    const chartMonthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    for (let i = 0; i < MESES_SHORT.length; i++) {
      const m = MESES_SHORT[i];
      const mesNum = Number(m.key);
      const rowsMes = viewDataMeta?.filter(r => r.mes === mesNum) ?? [];

      let totalValor = 0;
      let totalPesoKg = 0;
      let totalCab = 0;
      let hasAnyPrice = false;

      ORDEM_CATEGORIAS_FIXA.forEach(codigo => {
        const metaRow = rowsMes.find(r => r.categoria_codigo === codigo);
        const saldo = metaRow?.saldo_final ?? 0;
        const pesoMedio = metaRow?.peso_medio_final ?? 0;
        let precoArroba = 0;
        if (m.key === mes) {
          precoArroba = precosLocal[codigo] ?? 0;
        }
        if (precoArroba > 0) hasAnyPrice = true;
        const precoKg = precoArroba > 0 ? precoArroba / 30 : 0;
        totalValor += saldo * pesoMedio * precoKg;
        totalPesoKg += saldo * pesoMedio;
        totalCab += saldo;
      });

      const totalArrobas = totalPesoKg / 30;
      valorArr.push({ label: chartMonthLabels[i], value: m.key === mes && hasAnyPrice ? totalValor : null });
      arrobasArr.push({ label: chartMonthLabels[i], value: totalCab > 0 ? totalArrobas : null });
      precoArr.push({ label: chartMonthLabels[i], value: m.key === mes && totalArrobas > 0 && hasAnyPrice ? totalValor / totalArrobas : null });
    }

    return { valor: valorArr, arrobas: arrobasArr, precoArroba: precoArr };
  }, [viewDataMeta, viewDataRealizadoAno, valorRebJan, mes, precosLocal]);

  const temPreenchimento = Object.values(precosLocal).some(v => v > 0);
  const todosPreenchidos = ORDEM_CATEGORIAS_FIXA.every(c => (precosLocal[c] ?? 0) > 0);

  const handlePrecoChange = (codigo: string, value: string) => {
    if (isValidado) return;
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handlePrecoBlur = (codigo: string) => {
    const num = precosLocal[codigo] || 0;
    setPrecosDisplay(prev => ({ ...prev, [codigo]: num > 0 ? fmtArroba(num) : '' }));
  };

  const handleSalvar = (status: 'rascunho' | 'parcial' | 'validado') => {
    const items: MetaPrecoCategoria[] = ORDEM_CATEGORIAS_FIXA.map(codigo => ({
      categoria: codigo,
      preco_arroba: precosLocal[codigo] ?? 0,
    }));
    salvar(items, status);
  };

  const handleCopiarMesAnterior = async () => {
    const dados = await copiarMesAnterior(anoMes);
    if (dados) {
      const numMap: Record<string, number> = {};
      const strMap: Record<string, string> = {};
      dados.forEach(p => {
        numMap[p.categoria] = p.preco_arroba;
        strMap[p.categoria] = p.preco_arroba > 0 ? fmtArroba(p.preco_arroba) : '';
      });
      setPrecosLocal(numMap);
      setPrecosDisplay(strMap);
      toast.success('Valores carregados do mês anterior. Salve para confirmar.');
    }
  };

  const stCfg = STATUS_CONFIG[statusMes.status];
  const StIcon = stCfg.icon;
  const mesLabel = MESES_COLS.find(m => m.key === mes)?.label || mes;

  const getMesButtonClass = (mesVal: string) => {
    const key = `${ano}-${mesVal}`;
    const st = statusAno[key];
    const isSelected = mes === mesVal;
    if (isSelected) return 'bg-orange-500 text-white shadow-sm';
    if (st === 'validado') return 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200';
    if (st === 'parcial' || st === 'rascunho') return 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200';
    return 'text-muted-foreground hover:bg-muted';
  };

  const hasMetaData = metaRowsByCategoria.size > 0;

  return (
    <div className="p-1.5 w-full space-y-1 animate-fade-in pb-16">
      {/* Back */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] text-orange-600 hover:underline py-0">
          <ArrowLeft className="h-3 w-3" />
          Voltar para Preços de Mercado
        </button>
      )}

      {/* Toolbar — compact */}
      <div className="flex gap-1 items-center flex-wrap">
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-[68px] h-6 text-[10px] font-bold border-orange-300">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anos.map(a => (
              <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 ${stCfg.color}`}>
          <StIcon className="h-2.5 w-2.5 mr-0.5" />
          {stCfg.label}
        </Badge>

        {!isValidado && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-0.5 h-6 text-[10px] px-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
            <Copy className="h-2.5 w-2.5" /> Mês anterior
          </Button>
        )}

        <div className="ml-auto flex gap-1">
          {isValidado && isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-0.5 h-6 text-[10px] px-1.5 border-orange-300 text-orange-700">
                  <Unlock className="h-2.5 w-2.5" /> Reabrir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reabrir mês?</AlertDialogTitle>
                  <AlertDialogDescription>Os preços META voltarão ao status rascunho.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={reabrir}>Reabrir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {!isValidado && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-0.5 h-6 text-[10px] px-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => handleSalvar(temPreenchimento && !todosPreenchidos ? 'parcial' : 'rascunho')}
                disabled={saving}
              >
                <Save className="h-2.5 w-2.5" /> Rascunho
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-0.5 h-6 text-[10px] px-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={saving || !todosPreenchidos}>
                    <CheckCircle className="h-2.5 w-2.5" /> Validar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Validar preços META de {mesLabel}/{ano}?</AlertDialogTitle>
                    <AlertDialogDescription>Os preços META serão travados para este mês e passam a alimentar o Painel do Consultor.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={() => handleSalvar('validado')}>Validar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Month ruler */}
      <div className="flex gap-0.5 bg-orange-50 dark:bg-orange-950/20 rounded p-0.5 border border-orange-200 dark:border-orange-900/30">
        {MESES_SHORT.map(m => (
          <button
            key={m.key}
            onClick={() => setMes(m.key)}
            className={`flex-1 text-center text-[10px] font-semibold py-0.5 rounded transition-colors ${getMesButtonClass(m.key)}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!hasMetaData && (
        <div className="flex items-center gap-1 text-[9px] bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded px-2 py-0.5 border border-orange-500/30">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
          <span>Nenhuma meta de rebanho encontrada para {mesLabel}/{ano}. Defina a Consolidação Meta antes de precificar.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <>
        <div className="flex gap-3 items-start">
          {/* Table */}
          <div className="flex-1 max-w-[50%] min-w-0 bg-card rounded-lg shadow-sm border overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-orange-500/15">
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider bg-orange-500/25">Categoria</th>
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider">Qtd</th>
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider">Peso</th>
                  <th className="text-center px-0.5 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider w-[80px]">R$/@</th>
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider">R$/kg</th>
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider">R$/cab</th>
                  <th className="text-center px-1 py-0.5 font-semibold text-foreground text-[9px] uppercase tracking-wider">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="px-1 py-0 text-foreground text-[9px] italic whitespace-nowrap bg-orange-500/10">
                      {r.nome}
                    </td>
                    <td className="px-1 py-0 text-right text-foreground tabular-nums italic text-[9px]">
                      {r.saldo > 0 ? formatNum(r.saldo, 0) : '-'}
                    </td>
                    <td className="px-1 py-0 text-right tabular-nums italic text-[9px]">
                      {r.saldo > 0 && r.pesoMedio > 0 ? formatNum(r.pesoMedio, 2) : '-'}
                    </td>
                    <td className="px-0.5 py-0 w-[80px]">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-[18px] text-right !text-[9px] leading-none tabular-nums italic px-1 w-full border-orange-300 focus:border-orange-500 focus:ring-orange-500/20"
                        placeholder="0,00"
                        value={precosDisplay[r.codigo] ?? ''}
                        onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                        onBlur={() => handlePrecoBlur(r.codigo)}
                        disabled={isValidado}
                      />
                    </td>
                    <td className="px-1 py-0 text-right text-foreground tabular-nums italic text-[9px]">
                      {r.precoKg > 0 ? formatNum(r.precoKg, 2) : '-'}
                    </td>
                    <td className="px-1 py-0 text-right text-foreground tabular-nums italic text-[9px]">
                      {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                    </td>
                    <td className="px-1 py-0 text-right text-foreground tabular-nums italic text-[9px]">
                      {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-orange-500/25">
                  <td className="px-1 py-0.5 font-bold text-foreground text-[10px] italic bg-orange-500/30">TOTAL</td>
                  <td className="px-1 py-0.5 text-right font-bold text-foreground tabular-nums italic text-[10px]">
                    {totals.cabecas > 0 ? formatNum(totals.cabecas, 0) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right text-foreground tabular-nums italic text-[10px]">
                    {totals.pesoMedio > 0 ? formatNum(totals.pesoMedio, 2) : '—'}
                  </td>
                  <td className="px-0.5 py-0.5 text-center text-foreground tabular-nums italic text-[10px] w-[80px]">
                    {totals.precoArroba > 0 ? formatMoeda(totals.precoArroba) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right text-foreground tabular-nums italic text-[10px]">
                    {totals.precoKg > 0 ? formatNum(totals.precoKg, 2) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right text-foreground tabular-nums italic text-[10px]">
                    {totals.valorCabeca > 0 ? formatMoeda(totals.valorCabeca) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right font-bold text-foreground tabular-nums italic text-[10px]">
                    {totals.valor > 0 ? formatMoeda(totals.valor) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="flex items-center justify-end px-1 py-0 border-t">
              <p className="text-[8px] text-muted-foreground">
                R$/kg = R$/@ ÷ 30 • R$/cab = Peso × R$/kg
              </p>
            </div>
          </div>

          {/* Summary card — compact horizontal executive layout */}
          <div className="min-w-[280px] flex-1 space-y-1">
            <Card className="bg-orange-500/5 border-orange-500/20">
              <CardContent className="px-2 py-1.5">
                {/* Header row */}
                <div className="flex items-baseline border-b border-orange-200/40 pb-0.5 mb-1" style={{ display: 'grid', gridTemplateColumns: META_CARD_GRID }}>
                  <span className="text-[8px] text-orange-600 font-semibold uppercase tracking-wider truncate">Valor do Rebanho META — {mesLabel}/{ano}</span>
                  <span className="text-[7px] text-muted-foreground font-semibold text-left">Indicador</span>
                  <span className="text-[7px] text-muted-foreground font-semibold text-right">Valor</span>
                  <span className="text-[7px] text-muted-foreground font-semibold text-right">vs Inic. ano</span>
                  <span className="text-[7px] text-muted-foreground font-semibold text-right">vs 1 ano</span>
                </div>

                {/* Content: left value + right metrics table */}
                <div style={{ display: 'grid', gridTemplateColumns: META_CARD_GRID, gap: '0 4px', alignItems: 'start' }}>
                  {/* Left block — value + percentages, only occupies its natural height */}
                  <div className="pr-2 border-r border-orange-200/40">
                    <p className="text-base font-extrabold text-foreground leading-tight">
                      {totals.valor > 0 ? formatMoeda(totals.valor) : '—'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CompBadge meta={totals.valor} base={compJan?.valor ?? 0} tooltip={compJan?.valor ? `Jan: ${formatMoeda(compJan.valor)}` : undefined} />
                      <CompBadge meta={totals.valor} base={compAnoAnt?.valor ?? 0} tooltip={compAnoAnt?.valor ? `${MESES_SHORT.find(m => m.key === mes)?.label}/${Number(ano) - 1}: ${formatMoeda(compAnoAnt.valor)}` : undefined} />
                    </div>
                  </div>

                  {/* Right block — compact metrics table (4 cols × 5 rows) */}
                  <div className="col-span-4" style={{ display: 'grid', gridTemplateColumns: '150px 140px 130px 130px', gap: '0 4px' }}>
                    {[
                      { label: 'Cabeças', val: totals.cabecas, fmt: (v: number) => formatNum(v, 0), baseJan: compJan?.cabecas, baseAA: compAnoAnt?.cabecas, fmtBase: (v: number) => formatNum(v, 0) },
                      { label: 'Peso médio', val: totals.pesoMedio, fmt: (v: number) => `${formatNum(v, 2)} kg`, baseJan: compJan?.pesoMedio, baseAA: compAnoAnt?.pesoMedio, fmtBase: (v: number) => `${formatNum(v, 2)} kg` },
                      { label: 'R$/@ médio', val: totals.precoArroba, fmt: (v: number) => formatMoeda(v), baseJan: compJan?.precoArroba, baseAA: compAnoAnt?.precoArroba, fmtBase: (v: number) => formatMoeda(v) },
                      { label: 'R$/cab', val: totals.valorCabeca, fmt: (v: number) => formatMoeda(v), baseJan: compJan?.valorCabeca, baseAA: compAnoAnt?.valorCabeca, fmtBase: (v: number) => formatMoeda(v) },
                      { label: '@s estoque', val: totals.totalArrobas, fmt: (v: number) => formatNum(v, 2), baseJan: compJan?.totalArrobas, baseAA: compAnoAnt?.totalArrobas, fmtBase: (v: number) => formatNum(v, 2) },
                    ].map(ind => (
                      <React.Fragment key={ind.label}>
                        <span className="text-muted-foreground text-[8px] truncate text-left py-[1px]">{ind.label}</span>
                        <span className="font-semibold text-foreground tabular-nums text-[9px] text-right py-[1px]">{ind.val > 0 ? ind.fmt(ind.val) : '—'}</span>
                        <span className="text-right py-[1px]"><CompBadge meta={ind.val} base={ind.baseJan ?? 0} tooltip={ind.baseJan ? `Jan: ${ind.fmtBase(ind.baseJan)}` : undefined} /></span>
                        <span className="text-right py-[1px]"><CompBadge meta={ind.val} base={ind.baseAA ?? 0} tooltip={ind.baseAA ? `${MESES_SHORT.find(m => m.key === mes)?.label}/${Number(ano) - 1}: ${ind.fmtBase(ind.baseAA)}` : undefined} /></span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mini charts — same structure as Valor do Rebanho */}
            <div className="flex gap-3">
              <MiniChart data={chartData.valor} color="hsl(25, 95%, 53%)" title="Valor do Rebanho" />
              <MiniChart data={chartData.arrobas} color="hsl(142, 71%, 45%)" title="Arrobas em Estoque" />
              <MiniChart data={chartData.precoArroba} color="hsl(25, 80%, 45%)" title="R$/@ Médio" />
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

/* ---------- Comparison badge ---------- */
function CompBadge({ meta, base, tooltip }: { meta: number; base: number; tooltip?: string }) {
  if (!base || base <= 0 || !meta || meta <= 0) {
    return <span className="text-[8px] text-muted-foreground tabular-nums text-center">—</span>;
  }
  const pct = ((meta - base) / base) * 100;
  const isPositive = pct > 0;
  const isZero = Math.abs(pct) < 0.05;
  const colorClass = isZero
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';
  const label = `${isPositive ? '+' : ''}${formatNum(pct, 1)}%`;

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-[8px] font-medium tabular-nums text-center cursor-help ${colorClass}`}>{label}</span>
        </TooltipTrigger>
        <TooltipContent className="text-[10px]">{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
  return <span className={`text-[8px] font-medium tabular-nums text-center ${colorClass}`}>{label}</span>;
}
