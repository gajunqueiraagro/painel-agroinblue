/**
 * Visão Anual Zootécnica — Grade anual de status (Pastos, Valor Rebanho, Categorias) x 12 meses.
 * Visão de consultor: clique em célula navega para a tela correspondente no mês.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { TabId } from '@/components/BottomNav';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
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
  pastos: CellStatus;
  valor: CellStatus;
  categorias: CellStatus;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const ROWS: { id: keyof MonthStatus; label: string; tab: TabId }[] = [
  { id: 'pastos', label: 'Fechamento de Pastos', tab: 'fechamento' },
  { id: 'valor', label: 'Valor do Rebanho', tab: 'valor_rebanho' },
  { id: 'categorias', label: 'Conciliação de Categorias', tab: 'conciliacao_categoria' },
];

export function VisaoAnualZootecnicaTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
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
    Array.from({ length: 12 }, () => ({ pastos: 'aberto', valor: 'aberto', categorias: 'aberto' }))
  );
  const [loading, setLoading] = useState(true);

  const loadYear = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const isGlob = !fazendaId || fazendaId === '__global__';

      let fazendaIdsPec: string[] = [];
      if (isGlob) {
        const { data } = await supabase.from('fazendas').select('id, tem_pecuaria');
        fazendaIdsPec = (data || []).filter(f => f.tem_pecuaria !== false).map(f => f.id);
      }

      const fq = (q: any) => isGlob ? q.in('fazenda_id', fazendaIdsPec) : q.eq('fazenda_id', fazendaId);

      // Get all pastos ativos
      const { data: pastosData } = await fq(supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true));
      const totalPastos = (pastosData || []).length;

      // Fechamento pastos for all months of the year
      const anoStr = anoFiltro;
      const anoMeses = Array.from({ length: 12 }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);
      const { data: fpAll } = await fq(
        supabase.from('fechamento_pastos').select('id, status, pasto_id, ano_mes')
          .gte('ano_mes', anoMeses[0])
          .lte('ano_mes', anoMeses[11])
      );

      // Valor rebanho mensal
      const { data: vrAll } = await fq(
        supabase.from('valor_rebanho_mensal').select('categoria, ano_mes')
          .gte('ano_mes', anoMeses[0])
          .lte('ano_mes', anoMeses[11])
      );

      // Fechamento pasto itens for categorias check
      const fpIds = (fpAll || []).map(f => f.id);
      let itensAll: any[] = [];
      if (fpIds.length > 0) {
        // Fetch in chunks if needed
        const { data } = await supabase
          .from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id')
          .in('fechamento_id', fpIds)
          .gt('quantidade', 0);
        itensAll = data || [];
      }

      // Categorias mapping
      const { data: catsData } = await supabase.from('categorias_rebanho').select('id, codigo');
      const idToCodigo = new Map((catsData || []).map(c => [c.id, c.codigo]));

      // Build fp lookup by ano_mes
      const fpByMonth = new Map<string, typeof fpAll>();
      (fpAll || []).forEach(fp => {
        const list = fpByMonth.get(fp.ano_mes) || [];
        list.push(fp);
        fpByMonth.set(fp.ano_mes, list);
      });

      // Build itens by fechamento_id
      const itensByFech = new Map<string, any[]>();
      itensAll.forEach(i => {
        const list = itensByFech.get(i.fechamento_id) || [];
        list.push(i);
        itensByFech.set(i.fechamento_id, list);
      });

      const anoNum = Number(anoStr);
      const result: MonthStatus[] = [];

      for (let m = 1; m <= 12; m++) {
        const am = anoMeses[m - 1];

        // Pastos status
        const fps = fpByMonth.get(am) || [];
        const fechados = fps.filter(f => f.status === 'fechado').length;
        let statusPastos: CellStatus = 'aberto';
        if (totalPastos > 0) {
          if (fechados >= totalPastos) statusPastos = 'fechado';
          else if (fechados > 0 || fps.length > 0) statusPastos = 'parcial';
        }

        // Valor rebanho status
        const vrMonth = (vrAll || []).filter(v => v.ano_mes === am);
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, m);
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);
        let statusValor: CellStatus = 'aberto';
        if (vrMonth.length === 0) {
          statusValor = 'aberto';
        } else if (catsComSaldo.length > 0 && vrMonth.length < catsComSaldo.length) {
          statusValor = 'parcial';
        } else {
          statusValor = 'fechado';
        }

        // Categorias status
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
          let divCount = 0;
          let difTotal = 0;
          const totalSist = catsComSaldo.reduce((s, [, q]) => s + q, 0);
          catsComSaldo.forEach(([cat, qtdSist]) => {
            const qtdP = pastosMap.get(cat) || 0;
            const dif = Math.abs(qtdP - qtdSist);
            if (dif > 0) { divCount++; difTotal += dif; }
          });
          pastosMap.forEach((qtdP, cat) => {
            if (!saldoMap.has(cat) || (saldoMap.get(cat) || 0) <= 0) {
              if (qtdP > 0) { divCount++; difTotal += qtdP; }
            }
          });
          if (divCount === 0) {
            statusCats = 'fechado';
          } else {
            const pct = totalSist > 0 ? difTotal / totalSist : 1;
            statusCats = pct > 0.05 ? 'aberto' : 'parcial';
          }
        } else if (catsComSaldo.length === 0) {
          statusCats = 'fechado';
        }

        result.push({ pastos: statusPastos, valor: statusValor, categorias: statusCats });
      }

      setMonthData(result);
    } catch (e) {
      console.error('VisaoAnualZootecnica error:', e);
    } finally {
      setLoading(false);
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
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-extrabold text-foreground">📋 Visão Anual Zootécnica</h1>
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
                  <TableHead className="text-xs font-bold sticky left-0 bg-background z-10 min-w-[160px]">Pendência</TableHead>
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
