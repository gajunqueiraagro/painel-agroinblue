/**
 * Visão Anual — Grade anual de status x 12 meses.
 * 4 linhas na ordem oficial:
 *   1. Conciliação do Financeiro
 *   2. Fechamento de Pastos (exige conciliação categorias = 0 divergência)
 *   3. Conciliação de Categorias
 *   4. Valor do Rebanho
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { TabId } from '@/components/BottomNav';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import {
  statusFinanceiro as calcStatusFinanceiro,
  statusCategorias as calcStatusCategorias,
  statusPastos as calcStatusPastos,
  statusValor as calcStatusValor,
} from '@/lib/calculos/statusMensal';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroAnoInicial?: string;
}

type CellStatus = 'aberto' | 'parcial' | 'fechado';

interface MonthStatus {
  financeiro: CellStatus;
  pastos: CellStatus;
  categorias: CellStatus;
  valor: CellStatus;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const ROWS: { id: keyof MonthStatus; label: string; tab: TabId }[] = [
  { id: 'financeiro', label: 'Conciliação do Financeiro', tab: 'fin_caixa' },
  { id: 'pastos', label: 'Fechamento de Pastos', tab: 'fechamento' },
  { id: 'categorias', label: 'Conciliação de Categorias', tab: 'conciliacao_categoria' },
  { id: 'valor', label: 'Valor do Rebanho', tab: 'valor_rebanho' },
];

const EMPTY_MONTH: MonthStatus = { financeiro: 'aberto', pastos: 'aberto', categorias: 'aberto', valor: 'aberto' };

export function VisaoAnualZootecnicaTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial }: Props) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [monthData, setMonthData] = useState<MonthStatus[]>(
    Array.from({ length: 12 }, () => ({ ...EMPTY_MONTH }))
  );
  const [loading, setLoading] = useState(true);

  const loadYear = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const isGlob = !fazendaId || fazendaId === '__global__';

      let fazendaIdsPec: string[] = [];
      let fazendaIdsFin: string[] = [];
      if (isGlob) {
        const { data } = await supabase.from('fazendas').select('id, tem_pecuaria');
        const all = data || [];
        fazendaIdsPec = all.filter(f => f.tem_pecuaria !== false).map(f => f.id);
        fazendaIdsFin = all.map(f => f.id);
      } else {
        fazendaIdsPec = [fazendaId];
        fazendaIdsFin = [fazendaId];
      }

      const fq = (q: any) => isGlob ? q.in('fazenda_id', fazendaIdsPec) : q.eq('fazenda_id', fazendaId);

      const anoStr = anoFiltro;
      const anoMeses = Array.from({ length: 12 }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);

      // Parallel fetches
      const [pastosRes, fpRes, vrRes, itensRes, catsRes, finFechRes] = await Promise.all([
        // Pastos ativos
        fq(supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true)),
        // Fechamento pastos
        fq(supabase.from('fechamento_pastos').select('id, status, pasto_id, ano_mes')
          .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])),
        // Valor rebanho mensal
        fq(supabase.from('valor_rebanho_mensal').select('categoria, ano_mes')
          .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])),
        // Will fetch itens after getting fp IDs
        Promise.resolve(null),
        // Categorias
        supabase.from('categorias_rebanho').select('id, codigo'),
        // Financeiro fechamentos
        clienteAtual?.id
          ? supabase.from('financeiro_fechamentos')
              .select('status_fechamento, fazenda_id, ano_mes')
              .eq('cliente_id', clienteAtual.id)
              .in('fazenda_id', fazendaIdsFin)
              .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])
          : Promise.resolve({ data: [] }),
      ]);

      const fpAll = fpRes.data || [];
      const vrAll = vrRes.data || [];
      const idToCodigo = new Map((catsRes.data || []).map(c => [c.id, c.codigo]));
      const finFechAll = finFechRes.data || [];
      const totalPastos = (pastosRes.data || []).length;

      // Fetch itens
      const fpIds = fpAll.map(f => f.id);
      let itensAll: any[] = [];
      if (fpIds.length > 0) {
        const { data } = await supabase
          .from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id')
          .in('fechamento_id', fpIds)
          .gt('quantidade', 0);
        itensAll = data || [];
      }

      // Build lookups
      const fpByMonth = new Map<string, typeof fpAll>();
      fpAll.forEach(fp => {
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

      // Financeiro fechamento by month
      const finByMonth = new Map<string, typeof finFechAll>();
      finFechAll.forEach(f => {
        const list = finByMonth.get(f.ano_mes) || [];
        list.push(f);
        finByMonth.set(f.ano_mes, list);
      });

      const anoNum = Number(anoStr);
      const result: MonthStatus[] = [];

      for (let m = 1; m <= 12; m++) {
        const am = anoMeses[m - 1];

        // ── Financeiro status ──
        const finMonth = finByMonth.get(am) || [];
        let statusFin: CellStatus = 'aberto';
        if (finMonth.length > 0) {
          const allFechado = finMonth.every(f => f.status_fechamento === 'fechado');
          const someFechado = finMonth.some(f => f.status_fechamento === 'fechado');
          if (allFechado && (isGlob ? finMonth.length >= fazendaIdsFin.length : true)) {
            statusFin = 'fechado';
          } else if (someFechado) {
            statusFin = 'parcial';
          }
        }

        // ── Categorias status (calc first, needed for pastos) ──
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, m);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);

        const fps = fpByMonth.get(am) || [];
        const fechIds = fps.map(f => f.id);
        const monthItens = fechIds.flatMap(id => itensByFech.get(id) || []);

        let catsDivergentes = 0;
        let difTotal = 0;
        let statusCats: CellStatus = 'aberto';

        if (monthItens.length === 0 && catsComSaldo.length > 0) {
          statusCats = 'aberto';
          catsDivergentes = catsComSaldo.length;
          difTotal = catsComSaldo.reduce((s, [, q]) => s + q, 0);
        } else if (monthItens.length > 0) {
          const pastosMap = new Map<string, number>();
          monthItens.forEach(i => {
            const codigo = idToCodigo.get(i.categoria_id);
            if (codigo) pastosMap.set(codigo, (pastosMap.get(codigo) || 0) + i.quantidade);
          });
          const totalSist = catsComSaldo.reduce((s, [, q]) => s + q, 0);
          catsComSaldo.forEach(([cat, qtdSist]) => {
            const qtdP = pastosMap.get(cat) || 0;
            const dif = Math.abs(qtdP - qtdSist);
            if (dif > 0) { catsDivergentes++; difTotal += dif; }
          });
          pastosMap.forEach((qtdP, cat) => {
            if (!saldoMap.has(cat) || (saldoMap.get(cat) || 0) <= 0) {
              if (qtdP > 0) { catsDivergentes++; difTotal += qtdP; }
            }
          });
          if (catsDivergentes === 0) {
            statusCats = 'fechado';
          } else {
            const pct = totalSist > 0 ? difTotal / totalSist : 1;
            statusCats = pct > 0.05 ? 'aberto' : 'parcial';
          }
        } else if (catsComSaldo.length === 0) {
          statusCats = 'fechado';
        }

        // ── Pastos status (requires categorias check) ──
        const fechados = fps.filter(f => f.status === 'fechado').length;
        const categoriasOk = catsDivergentes === 0 && (monthItens.length > 0 || catsComSaldo.length === 0);
        let statusPastos: CellStatus = 'aberto';
        if (totalPastos > 0) {
          if (fechados >= totalPastos) {
            // All pastos fechados — but only truly "fechado" if categorias conciliated
            statusPastos = categoriasOk ? 'fechado' : 'parcial';
          } else if (fechados > 0 || fps.length > 0) {
            statusPastos = 'parcial';
          }
        }

        // ── Valor rebanho status ──
        const vrMonth = vrAll.filter(v => v.ano_mes === am);
        let statusValor: CellStatus = 'aberto';
        if (vrMonth.length === 0) {
          statusValor = 'aberto';
        } else if (catsComSaldo.length > 0 && vrMonth.length < catsComSaldo.length) {
          statusValor = 'parcial';
        } else {
          statusValor = 'fechado';
        }

        result.push({
          financeiro: statusFin,
          pastos: statusPastos,
          categorias: statusCats,
          valor: statusValor,
        });
      }

      setMonthData(result);
    } catch (e) {
      console.error('VisaoAnualZootecnica error:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoFiltro, lancamentos, saldosIniciais, clienteAtual]);

  useEffect(() => { loadYear(); }, [loadYear]);

  const handleCellClick = (rowId: keyof MonthStatus, mes: number) => {
    const row = ROWS.find(r => r.id === rowId);
    if (!row) return;
    onTabChange(row.tab, { ano: anoFiltro, mes });
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-extrabold text-foreground">📋 Visão Anual</h1>
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="w-24 text-sm font-bold ml-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4">
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-bold sticky left-0 bg-background z-10 min-w-[180px]">Pendência</TableHead>
                  {MESES_LABELS.map((m, i) => (
                    <TableHead key={i} className="text-xs font-bold text-center px-1.5 min-w-[48px]">{m}</TableHead>
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

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-destructive" /> Aberto</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Parcial</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Fechado</span>
        </div>
      </div>
    </div>
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
