/**
 * Status Zootécnico — Pendências do mês + Visão Anual integrada.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MESES_COLS } from '@/lib/calculos/labels';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { useFazenda } from '@/contexts/FazendaContext';
import { TabId } from '@/components/BottomNav';
import { supabase } from '@/integrations/supabase/client';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

type CellStatus = 'aberto' | 'parcial' | 'fechado';
interface MonthStatus { pastos: CellStatus; valor: CellStatus; categorias: CellStatus; }

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ROWS: { id: keyof MonthStatus; label: string; tab: TabId }[] = [
  { id: 'pastos', label: 'Conciliação de Pastos', tab: 'fechamento' },
  { id: 'valor', label: 'Valor do Rebanho', tab: 'valor_rebanho' },
  { id: 'categorias', label: 'Conciliação de Categorias', tab: 'conciliacao_categoria' },
];

export function StatusZootecnicoTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const mesDefault = filtroMesInicial || (anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const handleAnoChange = (val: string) => {
    setAnoFiltro(val);
    const n = Number(val);
    setMesFiltro(n === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  };

  const statusZoo = useStatusZootecnico(fazendaId, anoNum, mesFiltro, lancamentos, saldosIniciais);

  const navTo = (tab: TabId) => {
    onTabChange(tab, { ano: anoFiltro, mes: mesFiltro });
  };

  // ---- Visão Anual data ----
  const [monthData, setMonthData] = useState<MonthStatus[]>(
    Array.from({ length: 12 }, () => ({ pastos: 'aberto', valor: 'aberto', categorias: 'aberto' }))
  );
  const [loadingYear, setLoadingYear] = useState(true);

  const loadYear = useCallback(async () => {
    if (!fazendaId) return;
    setLoadingYear(true);
    try {
      const isGlob = !fazendaId || fazendaId === '__global__';
      let fazendaIdsPec: string[] = [];
      if (isGlob) {
        const { data } = await supabase.from('fazendas').select('id, tem_pecuaria');
        fazendaIdsPec = (data || []).filter(f => f.tem_pecuaria !== false).map(f => f.id);
      }
      const fq = (q: any) => isGlob ? q.in('fazenda_id', fazendaIdsPec) : q.eq('fazenda_id', fazendaId);

      const { data: pastosData } = await fq(supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true));
      const totalPastos = (pastosData || []).length;

      const anoStr = anoFiltro;
      const anoMeses = Array.from({ length: 12 }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);
      const { data: fpAll } = await fq(
        supabase.from('fechamento_pastos').select('id, status, pasto_id, ano_mes')
          .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])
      );
      const { data: vrAll } = await fq(
        supabase.from('valor_rebanho_mensal').select('categoria, ano_mes')
          .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])
      );
      const fpIds = (fpAll || []).map(f => f.id);
      let itensAll: any[] = [];
      if (fpIds.length > 0) {
        const { data } = await supabase.from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id').in('fechamento_id', fpIds).gt('quantidade', 0);
        itensAll = data || [];
      }
      const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
      const idToCodigo = new Map((catsData || []).map(c => [c.id, c.codigo]));

      const fpByMonth = new Map<string, typeof fpAll>();
      (fpAll || []).forEach(fp => {
        const list = fpByMonth.get(fp.ano_mes) || [];
        list.push(fp);
        fpByMonth.set(fp.ano_mes, list);
      });
      const itensByFech = new Map<string, any[]>();
      itensAll.forEach(i => {
        const list = itensByFech.get(i.fechamento_id) || [];
        list.push(i);
        itensByFech.set(i.fechamento_id, list);
      });

      const result: MonthStatus[] = [];
      for (let m = 1; m <= 12; m++) {
        const am = anoMeses[m - 1];
        const fps = fpByMonth.get(am) || [];
        const fechados = fps.filter(f => f.status === 'fechado').length;
        let statusPastos: CellStatus = 'aberto';
        if (totalPastos > 0) {
          if (fechados >= totalPastos) statusPastos = 'fechado';
          else if (fechados > 0 || fps.length > 0) statusPastos = 'parcial';
        }

        const vrMonth = (vrAll || []).filter(v => v.ano_mes === am);
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, Number(anoStr), m);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        let statusValor: CellStatus = 'aberto';
        if (vrMonth.length === 0) statusValor = 'aberto';
        else if (catsComSaldo.length > 0 && vrMonth.length < catsComSaldo.length) statusValor = 'parcial';
        else statusValor = 'fechado';

        const fechIds = fps.map(f => f.id);
        const monthItens = fechIds.flatMap(id => itensByFech.get(id) || []);
        let statusCats: CellStatus = 'aberto';
        if (monthItens.length === 0 && catsComSaldo.length > 0) {
          statusCats = 'aberto';
        } else if (monthItens.length > 0) {
          const pastosMap = new Map<string, number>();
          monthItens.forEach(i => {
            const codigo = idToCodigo.get(i.categoria_id);
            if (codigo) pastosMap.set(codigo, (pastosMap.get(codigo) || 0) + i.quantidade);
          });
          let difTotal = 0;
          const totalSist = catsComSaldo.reduce((s, [, q]) => s + q, 0);
          catsComSaldo.forEach(([cat, qtdSist]) => {
            const dif = Math.abs((pastosMap.get(cat) || 0) - qtdSist);
            if (dif > 0) difTotal += dif;
          });
          pastosMap.forEach((qtdP, cat) => {
            if (!saldoMap.has(cat) || (saldoMap.get(cat) || 0) <= 0) {
              if (qtdP > 0) difTotal += qtdP;
            }
          });
          if (difTotal === 0) statusCats = 'fechado';
          else statusCats = totalSist > 0 && difTotal / totalSist > 0.05 ? 'aberto' : 'parcial';
        } else if (catsComSaldo.length === 0) {
          statusCats = 'fechado';
        }
        result.push({ pastos: statusPastos, valor: statusValor, categorias: statusCats });
      }
      setMonthData(result);
    } catch (e) {
      console.error('StatusZootecnico year load error:', e);
    } finally {
      setLoadingYear(false);
    }
  }, [fazendaId, anoFiltro, lancamentos, saldosIniciais]);

  useEffect(() => { loadYear(); }, [loadYear]);

  const handleCellClick = (rowId: keyof MonthStatus, mes: number) => {
    const row = ROWS.find(r => r.id === rowId);
    if (!row) return;
    onTabChange(row.tab, { ano: anoFiltro, mes });
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      {/* Filtros */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-3 pb-2">
        <div className="flex gap-2 items-center">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="w-24 text-base font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="w-28 text-sm font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_COLS.map((m, i) => (
                <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* ===== STATUS DO MÊS ===== */}
        <Card className={`border-l-4 ${statusZoo.status === 'fechado' ? 'border-l-emerald-500' : statusZoo.status === 'parcial' ? 'border-l-amber-500' : 'border-l-destructive'}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">📊 Status do Mês</h3>
              <StatusBadge status={statusZoo.status} />
            </div>

            <div className="flex gap-3 text-xs font-bold">
              <span className="flex items-center gap-1 text-destructive">🔴 {statusZoo.contadores.aberto}</span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">🟡 {statusZoo.contadores.parcial}</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">🟢 {statusZoo.contadores.fechado}</span>
            </div>

            <div className="space-y-2">
              {statusZoo.pendencias.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">
                      {p.status === 'aberto' ? '🔴' : p.status === 'parcial' ? '🟡' : '🟢'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.descricao}</p>
                    </div>
                  </div>
                  {p.status !== 'fechado' && p.resolverTab && (
                    <button
                      onClick={() => navTo(p.resolverTab as TabId)}
                      className="text-[10px] font-bold text-primary whitespace-nowrap flex items-center gap-0.5 hover:underline"
                    >
                      Resolver <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {statusZoo.status === 'fechado' && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-semibold">Mês completamente fechado</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== VISÃO ANUAL ===== */}
        <div>
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">📋 Visão Anual — {anoFiltro}</h3>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-bold sticky left-0 bg-background z-10 min-w-[140px]">Pendência</TableHead>
                    {MESES_LABELS.map((m, i) => (
                      <TableHead key={i} className="text-xs font-bold text-center px-1.5 min-w-[44px]">{m}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROWS.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-semibold sticky left-0 bg-background z-10">{row.label}</TableCell>
                      {monthData.map((md, i) => {
                        const st = md[row.id];
                        return (
                          <TableCell key={i} className="text-center px-1 py-1.5">
                            <button
                              onClick={() => handleCellClick(row.id, i + 1)}
                              className="w-full flex justify-center hover:scale-110 transition-transform"
                              title={`${row.label} — ${MESES_LABELS[i]}/${anoFiltro}`}
                            >
                              <StatusDot status={st} />
                            </button>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-destructive" /> Aberto</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Parcial</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Fechado</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'aberto' | 'parcial' | 'fechado' }) {
  const config = {
    aberto: { emoji: '🔴', label: 'Em aberto', className: 'bg-destructive/15 text-destructive' },
    parcial: { emoji: '🟡', label: 'Parcial', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
    fechado: { emoji: '🟢', label: 'Fechado', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.emoji} {c.label}
    </span>
  );
}

function StatusDot({ status }: { status: CellStatus }) {
  const config = {
    aberto: 'bg-destructive',
    parcial: 'bg-amber-500',
    fechado: 'bg-emerald-500',
  };
  return <span className={`inline-block w-3.5 h-3.5 rounded-full ${config[status]}`} />;
}
