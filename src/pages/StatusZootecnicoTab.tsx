/**
 * Status Zootécnico — Pendências do mês + Visão Anual integrada.
 * Global mode: per-farm breakdown under each indicator.
 * Administrative farm: clean "Sem dados de rebanho" message.
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
import { useCliente } from '@/contexts/ClienteContext';
import {
  statusFinanceiro as calcStatusFinanceiro,
  statusCategorias as calcStatusCategorias,
  statusPastos as calcStatusPastos,
  statusValor as calcStatusValor,
  type StatusCor,
} from '@/lib/calculos/statusMensal';
import { ChevronRight, ChevronDown, CheckCircle2, Building2 } from 'lucide-react';
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
interface MonthStatus { financeiro: CellStatus; pastos: CellStatus; categorias: CellStatus; valor: CellStatus; economico: CellStatus; }

interface FazendaStatus {
  fazendaId: string;
  fazendaNome: string;
  financeiro: CellStatus;
  pastos: CellStatus;
  categorias: CellStatus;
  valor: CellStatus;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ROWS: { id: keyof MonthStatus; label: string; tab: TabId }[] = [
  { id: 'financeiro', label: 'Conciliação do Financeiro', tab: 'fin_caixa' },
  { id: 'pastos', label: 'Fechamento de Pastos', tab: 'fechamento' },
  { id: 'categorias', label: 'Conciliação de Categorias', tab: 'fechamento' },
  { id: 'valor', label: 'Valor do Rebanho', tab: 'valor_rebanho' },
  { id: 'economico', label: 'Econômico', tab: 'visao_zoo_hub' },
];

const STATUS_ORDER: Record<CellStatus, number> = { aberto: 0, parcial: 1, fechado: 2 };

export function StatusZootecnicoTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';
  const isAdmin = !isGlobal && fazendaAtual?.tem_pecuaria === false;

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
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);

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

  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao', 'lancamentos', 'valor_rebanho'];

  const navTo = (tab: TabId) => {
    if (isGlobal && BLOCKED_TABS_GLOBAL.includes(tab)) return;
    onTabChange(tab, { ano: anoFiltro, mes: mesFiltro });
  };

  // ---- Per-farm breakdown for Global ----
  const [perFarmStatus, setPerFarmStatus] = useState<FazendaStatus[]>([]);
  const [loadingPerFarm, setLoadingPerFarm] = useState(false);

  const loadPerFarm = useCallback(async () => {
    if (!isGlobal) { setPerFarmStatus([]); return; }
    setLoadingPerFarm(true);
    try {
      const pecFazendas = fazendas.filter(f => f.tem_pecuaria !== false && f.id !== '__global__');
      if (pecFazendas.length === 0) { setPerFarmStatus([]); return; }

      const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;
      const fIds = pecFazendas.map(f => f.id);
      const allFazendas = fazendas.filter(f => f.id !== '__global__');
      const allFIds = allFazendas.map(f => f.id);

      // Fetch all data in bulk (including financeiro)
      const [pastosRes, fpRes, vrRes, catsRes, finFechRes, viewRes] = await Promise.all([
        supabase.from('pastos').select('id, fazenda_id').eq('ativo', true).eq('entra_conciliacao', true).in('fazenda_id', fIds),
        supabase.from('fechamento_pastos').select('id, status, pasto_id, fazenda_id, updated_at').eq('ano_mes', anoMes).in('fazenda_id', fIds),
        supabase.from('valor_rebanho_mensal').select('categoria, fazenda_id').eq('ano_mes', anoMes).in('fazenda_id', fIds),
        supabase.from('categorias_rebanho').select('id, codigo'),
        clienteAtual?.id
          ? supabase.from('financeiro_fechamentos')
              .select('status_fechamento, fazenda_id')
              .eq('cliente_id', clienteAtual.id)
              .eq('ano_mes', anoMes)
              .in('fazenda_id', allFIds)
          : Promise.resolve({ data: [] }),
        supabase.from('vw_zoot_categoria_mensal' as any)
          .select('fazenda_id, categoria_codigo, saldo_inicial, entradas_externas, saidas_externas, evol_cat_entrada, evol_cat_saida')
          .in('fazenda_id', fIds)
          .eq('ano', anoNum)
          .eq('mes', mesFiltro)
          .eq('cenario', 'realizado'),
      ]);

      const fpIds = (fpRes.data || []).map(f => f.id);
      let itensAll: any[] = [];
      if (fpIds.length > 0) {
        const { data } = await supabase.from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id').in('fechamento_id', fpIds).gt('quantidade', 0);
        itensAll = data || [];
      }
      const idToCodigo = new Map((catsRes.data || []).map(c => [c.id, c.codigo]));
      const finFechAll = (finFechRes as any).data || [];

      // Group by fazenda
      const pastosByFaz = new Map<string, number>();
      const activePastoIdsByFaz = new Map<string, Set<string>>();
      (pastosRes.data || []).forEach(p => {
        pastosByFaz.set(p.fazenda_id, (pastosByFaz.get(p.fazenda_id) || 0) + 1);
        if (!activePastoIdsByFaz.has(p.fazenda_id)) activePastoIdsByFaz.set(p.fazenda_id, new Set());
        activePastoIdsByFaz.get(p.fazenda_id)!.add(p.id);
      });

      const fpByFaz = new Map<string, any[]>();
      (fpRes.data || []).forEach(fp => {
        const list = fpByFaz.get(fp.fazenda_id) || [];
        list.push(fp);
        fpByFaz.set(fp.fazenda_id, list);
      });

      const vrByFaz = new Map<string, number>();
      (vrRes.data || []).forEach(v => vrByFaz.set(v.fazenda_id, (vrByFaz.get(v.fazenda_id) || 0) + 1));

      const itensByFech = new Map<string, any[]>();
      itensAll.forEach(i => {
        const list = itensByFech.get(i.fechamento_id) || [];
        list.push(i);
        itensByFech.set(i.fechamento_id, list);
      });

      // Financeiro by fazenda
      const finByFaz = new Map<string, any[]>();
      finFechAll.forEach((f: any) => {
        const list = finByFaz.get(f.fazenda_id) || [];
        list.push(f);
        finByFaz.set(f.fazenda_id, list);
      });

      // FONTE OFICIAL: saldo por movimentações (vw_zoot_categoria_mensal)
      const viewByFaz = new Map<string, any[]>();
      ((viewRes as any).data || []).forEach((r: any) => {
        const list = viewByFaz.get(r.fazenda_id) || [];
        list.push(r);
        viewByFaz.set(r.fazenda_id, list);
      });

      const result: FazendaStatus[] = pecFazendas.map(faz => {
        const totalPastos = pastosByFaz.get(faz.id) || 0;
        const fps = fpByFaz.get(faz.id) || [];
        
        // Deduplicate: keep only the most recent fechamento per pasto ATIVO
        const activePastoIds = activePastoIdsByFaz.get(faz.id) || new Set<string>();
        const dedupByPasto = new Map<string, any>();
        fps.forEach(f => {
          if (!activePastoIds.has(f.pasto_id)) return; // Ignora pastos inativos
          const existing = dedupByPasto.get(f.pasto_id);
          if (!existing || (f.updated_at || '') >= (existing.updated_at || '')) {
            dedupByPasto.set(f.pasto_id, f);
          }
        });
        const dedupFps = Array.from(dedupByPasto.values());
        const fechados = dedupFps.filter(f => f.status === 'fechado').length;

        // Saldo previsto por movimentações (fonte: vw_zoot_categoria_mensal)
        const viewCats = viewByFaz.get(faz.id) || [];
        const saldoMap = new Map<string, number>();
        viewCats.forEach((cat: any) => {
          const movSaldo = cat.saldo_inicial + cat.entradas_externas - cat.saidas_externas
            + cat.evol_cat_entrada - cat.evol_cat_saida;
          saldoMap.set(cat.categoria_codigo, (saldoMap.get(cat.categoria_codigo) || 0) + movSaldo);
        });
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);

        // Build alocado nos pastos (using deduplicated fechamentos)
        const fechIds = dedupFps.map(f => f.id);
        const monthItens = fechIds.flatMap(id => itensByFech.get(id) || []);
        const alocadoPastos = new Map<string, number>();
        monthItens.forEach(i => {
          const codigo = idToCodigo.get(i.categoria_id);
          if (codigo) alocadoPastos.set(codigo, (alocadoPastos.get(codigo) || 0) + i.quantidade);
        });

        // 1. Financeiro
        const finFaz = finByFaz.get(faz.id) || [];
        const stFin = calcStatusFinanceiro({ fechamentos: finFaz, totalFazendasEsperadas: 1 });

        // 3. Categorias
        const stCatsResult = calcStatusCategorias({
          saldoOficial: new Map(catsComSaldo),
          alocadoPastos,
          temItensPastos: monthItens.length > 0,
          pastosAtivos: totalPastos,
        });

        // 2. Pastos
        const stPastos = calcStatusPastos({
          totalPastos,
          pastosFechados: fechados,
          pastosComRegistro: dedupFps.length,
          statusCategorias: stCatsResult.status,
        });

        // 4. Valor
        const precosCount = vrByFaz.get(faz.id) || 0;
        const stValor = calcStatusValor({ precosDefinidos: precosCount, categoriasComSaldo: catsComSaldo.length });

        return { fazendaId: faz.id, fazendaNome: faz.nome, financeiro: stFin, pastos: stPastos, valor: stValor, categorias: stCatsResult.status };
      });

      // Sort: aberto → parcial → fechado (by worst indicator)
      result.sort((a, b) => {
        const worstA = Math.min(STATUS_ORDER[a.pastos], STATUS_ORDER[a.valor], STATUS_ORDER[a.categorias], STATUS_ORDER[a.financeiro]);
        const worstB = Math.min(STATUS_ORDER[b.pastos], STATUS_ORDER[b.valor], STATUS_ORDER[b.categorias], STATUS_ORDER[b.financeiro]);
        return worstA - worstB;
      });

      setPerFarmStatus(result);
    } catch (e) {
      console.error('loadPerFarm error:', e);
    } finally {
      setLoadingPerFarm(false);
    }
  }, [isGlobal, fazendas, anoFiltro, mesFiltro, anoNum, clienteAtual]);

  useEffect(() => { loadPerFarm(); }, [loadPerFarm]);

  // ---- Visão Anual data ----
  const [monthData, setMonthData] = useState<MonthStatus[]>(
    Array.from({ length: 12 }, () => ({ financeiro: 'aberto' as CellStatus, pastos: 'aberto' as CellStatus, valor: 'aberto' as CellStatus, categorias: 'aberto' as CellStatus, economico: 'aberto' as CellStatus }))
  );
  const [loadingYear, setLoadingYear] = useState(true);

  const loadYear = useCallback(async () => {
    if (!fazendaId || isAdmin) return;
    setLoadingYear(true);
    try {
      const cli = clienteAtual;
      let fazendaIdsPec: string[] = [];
      let fazendaIdsFin: string[] = [];
      if (isGlobal) {
        const { data } = await supabase.from('fazendas').select('id, tem_pecuaria');
        const all = data || [];
        fazendaIdsPec = all.filter(f => f.tem_pecuaria !== false).map(f => f.id);
        fazendaIdsFin = all.map(f => f.id);
      } else {
        fazendaIdsPec = [fazendaId!];
        fazendaIdsFin = [fazendaId!];
      }
      const fq = (q: any) => isGlobal ? q.in('fazenda_id', fazendaIdsPec) : q.eq('fazenda_id', fazendaId);

      const anoStr = anoFiltro;
      const anoMeses = Array.from({ length: 12 }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);

      const [pastosRes, fpRes, vrRes, catsRes, finFechRes, viewYearRes] = await Promise.all([
        fq(supabase.from('pastos').select('id').eq('ativo', true).eq('entra_conciliacao', true)),
        fq(
          supabase
            .from('fechamento_pastos')
            .select('id, status, pasto_id, ano_mes, updated_at, created_at')
            .gte('ano_mes', anoMeses[0])
            .lte('ano_mes', anoMeses[11])
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
        ),
        fq(supabase.from('valor_rebanho_mensal').select('categoria, ano_mes')
          .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])),
        supabase.from('categorias_rebanho').select('id, codigo'),
        cli?.id
          ? supabase.from('financeiro_fechamentos')
              .select('status_fechamento, fazenda_id, ano_mes')
              .eq('cliente_id', cli.id)
              .in('fazenda_id', fazendaIdsFin)
              .gte('ano_mes', anoMeses[0]).lte('ano_mes', anoMeses[11])
          : Promise.resolve({ data: [] }),
        fq(supabase.from('vw_zoot_categoria_mensal' as any)
          .select('mes, categoria_codigo, saldo_inicial, entradas_externas, saidas_externas, evol_cat_entrada, evol_cat_saida')
          .eq('ano', Number(anoStr))
          .eq('cenario', 'realizado')),
      ]);

      const pastosAtivosData = pastosRes.data || [];
      const totalPastos = pastosAtivosData.length;
      const activePastoIds = new Set(pastosAtivosData.map(p => p.id));
      const fpAll = fpRes.data || [];
      const vrAll = vrRes.data || [];
      const idToCodigo = new Map((catsRes.data || []).map(c => [c.id, c.codigo]));
      const finFechAll = (finFechRes as any).data || [];

      const fpIds = fpAll.map(f => f.id);
      let itensAll: any[] = [];
      if (fpIds.length > 0) {
        const { data } = await supabase.from('fechamento_pasto_itens')
          .select('fechamento_id, quantidade, categoria_id').in('fechamento_id', fpIds).gt('quantidade', 0);
        itensAll = data || [];
      }

      // Group data by month
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
      const finByMonth = new Map<string, any[]>();
      finFechAll.forEach((f: any) => {
        const list = finByMonth.get(f.ano_mes) || [];
        list.push(f);
        finByMonth.set(f.ano_mes, list);
      });

      // FONTE OFICIAL: saldo por movimentações agrupado por mês (vw_zoot_categoria_mensal)
      const viewByMonthMap = new Map<number, Map<string, number>>();
      ((viewYearRes as any).data || []).forEach((r: any) => {
        if (!viewByMonthMap.has(r.mes)) viewByMonthMap.set(r.mes, new Map());
        const catMap = viewByMonthMap.get(r.mes)!;
        const movSaldo = r.saldo_inicial + r.entradas_externas - r.saidas_externas
          + r.evol_cat_entrada - r.evol_cat_saida;
        catMap.set(r.categoria_codigo, (catMap.get(r.categoria_codigo) || 0) + movSaldo);
      });

      const result: MonthStatus[] = [];
      for (let m = 1; m <= 12; m++) {
        const am = anoMeses[m - 1];
        const fps = fpByMonth.get(am) || [];

        // Base oficial da linha Dif. do Fechamento de Pastos:
        // somente pastos ativos/em conciliação + primeiro fechamento do mês por pasto.
        const categoriasBaseByPasto = new Map<string, any>();
        fps.forEach(f => {
          if (!activePastoIds.has(f.pasto_id)) return;
          if (!categoriasBaseByPasto.has(f.pasto_id)) {
            categoriasBaseByPasto.set(f.pasto_id, f);
          }
        });
        const categoriasBaseFps = Array.from(categoriasBaseByPasto.values());

        // Deduplicate per pasto
        const dedupByPasto = new Map<string, any>();
        fps.forEach(f => {
          if (!activePastoIds.has(f.pasto_id)) return;
          const existing = dedupByPasto.get(f.pasto_id);
          if (!existing || (f.updated_at || '') >= (existing.updated_at || '')) {
            dedupByPasto.set(f.pasto_id, f);
          }
        });
        const dedupFps = Array.from(dedupByPasto.values());
        const fechados = dedupFps.filter(f => f.status === 'fechado').length;

        // Saldo oficial por movimentações (fonte: vw_zoot_categoria_mensal)
        const saldoMap = viewByMonthMap.get(m) || new Map<string, number>();
        const catsComSaldo = Array.from(saldoMap.entries()).filter(([, q]) => q > 0);

        // Build alocado nos pastos usando a MESMA base da linha Dif. validada no Fechamento de Pastos
        const categoriasBaseFechIds = categoriasBaseFps.map(f => f.id);
        const monthItens = categoriasBaseFechIds.flatMap(id => itensByFech.get(id) || []);
        const alocadoPastos = new Map<string, number>();
        monthItens.forEach(i => {
          const codigo = idToCodigo.get(i.categoria_id);
          if (codigo) alocadoPastos.set(codigo, (alocadoPastos.get(codigo) || 0) + i.quantidade);
        });

        // 1. Financeiro
        const finMonth = finByMonth.get(am) || [];
        const stFin = calcStatusFinanceiro({
          fechamentos: finMonth,
          totalFazendasEsperadas: fazendaIdsFin.length,
        });

        // 3. Categorias (before pastos)
        const stCatsResult = calcStatusCategorias({
          saldoOficial: new Map(catsComSaldo),
          alocadoPastos,
          temItensPastos: monthItens.length > 0,
          pastosAtivos: totalPastos,
        });

        // 2. Pastos
        const stPastos = calcStatusPastos({
          totalPastos,
          pastosFechados: fechados,
          pastosComRegistro: dedupFps.length,
          statusCategorias: stCatsResult.status,
        });

        // 4. Valor
        const vrMonth = vrAll.filter(v => v.ano_mes === am);
        const stValor = calcStatusValor({
          precosDefinidos: vrMonth.length,
          categoriasComSaldo: catsComSaldo.length,
        });

        // 5. Econômico (derivado: verde se todos verdes, vermelho se todos vermelhos, senão amarelo)
        const allStatuses = [stFin, stPastos, stCatsResult.status, stValor];
        const stEcon: CellStatus = allStatuses.every(s => s === 'fechado') ? 'fechado'
          : allStatuses.every(s => s === 'aberto') ? 'aberto' : 'parcial';

        result.push({ financeiro: stFin, pastos: stPastos, categorias: stCatsResult.status, valor: stValor, economico: stEcon });
      }
      setMonthData(result);
    } catch (e) {
      console.error('StatusZootecnico year load error:', e);
    } finally {
      setLoadingYear(false);
    }
  }, [fazendaId, anoFiltro, isGlobal, isAdmin, clienteAtual]);

  useEffect(() => { loadYear(); }, [loadYear]);

  const handleCellClick = (rowId: keyof MonthStatus, mes: number) => {
    if (isGlobal) return; // Global mode: view-only
    const row = ROWS.find(r => r.id === rowId);
    if (!row) return;
    onTabChange(row.tab, { ano: anoFiltro, mes });
  };

  // ===== RENDER: Administrative farm =====
  if (isAdmin) {
    return (
      <div className="w-full px-4 animate-fade-in pb-20">
        <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 pt-3 pb-2">
          <div className="flex gap-2 items-center">
            <Select value={anoFiltro} onValueChange={handleAnoChange}>
              <SelectTrigger className="w-24 text-base font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <Building2 className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Sem dados de rebanho</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Fazenda administrativa — utilizada apenas para rateio financeiro
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 pt-2 pb-1.5">
        <div className="flex items-center gap-2">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="h-8 min-h-0 w-[76px] bg-card px-2 py-0 text-xs font-semibold border-border/70 [&>span]:truncate [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="h-8 min-h-0 w-[72px] bg-card px-2 py-0 text-xs font-semibold border-border/70 [&>span]:truncate [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_COLS.map((m, i) => (
                <SelectItem key={m.key} value={String(i + 1)} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center rounded-md border border-border bg-muted px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/80"
          >
            ← Resumo
          </button>
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
              {statusZoo.pendencias.map(p => {
                const isExpanded = expandedIndicator === p.id;
                const farmRows = p.id === 'pastos'
                  ? statusZoo.pastosPorFazenda.map(fs => ({
                      fazendaId: fs.fazendaId,
                      fazendaNome: fs.fazendaNome,
                      status: fs.status as CellStatus,
                    }))
                  : p.id === 'economico'
                    ? perFarmStatus.map(fs => {
                        const all: CellStatus[] = [fs.financeiro, fs.pastos, fs.categorias, fs.valor];
                        const st: CellStatus = all.every(s => s === 'fechado') ? 'fechado'
                          : all.every(s => s === 'aberto') ? 'aberto' : 'parcial';
                        return { fazendaId: fs.fazendaId, fazendaNome: fs.fazendaNome, status: st };
                      })
                    : perFarmStatus.map(fs => ({
                        fazendaId: fs.fazendaId,
                        fazendaNome: fs.fazendaNome,
                        status: fs[p.id as keyof FazendaStatus] as CellStatus,
                      }));
                const farmProblems = isGlobal ? farmRows.filter(fs => fs.status !== 'fechado').length : 0;
                const hasFarmRows = farmRows.length > 0;

                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">
                          {p.status === 'aberto' ? '🔴' : p.status === 'parcial' ? '🟡' : '🟢'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.status !== 'fechado' && p.resolverTab && !isGlobal && (
                          <button
                            onClick={() => navTo(p.resolverTab as TabId)}
                            className="text-[10px] font-bold text-primary whitespace-nowrap flex items-center gap-0.5 hover:underline"
                          >
                            Resolver <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                        {isGlobal && hasFarmRows && (
                          <button
                            onClick={() => setExpandedIndicator(isExpanded ? null : p.id)}
                            className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {farmProblems > 0 && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive/15 text-destructive text-[9px] font-bold">
                                {farmProblems}
                              </span>
                            )}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-farm breakdown - expandable */}
                    {isGlobal && isExpanded && hasFarmRows && (
                      <div className="ml-6 mt-1 mb-2 space-y-0.5 animate-fade-in">
                        {[...farmRows]
                          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                          .map(fs => {
                            const st = fs.status;
                            return (
                              <div key={fs.fazendaId} className="flex items-center justify-between text-[11px] px-2 py-0.5 rounded bg-muted/20">
                                <span className="text-muted-foreground truncate mr-2">{fs.fazendaNome}</span>
                                <span className={`shrink-0 font-semibold ${st === 'fechado' ? 'text-emerald-600 dark:text-emerald-400' : st === 'parcial' ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}>
                                  {st === 'fechado' ? '🟢 Fechado' : st === 'parcial' ? '🟡 Parcial' : '🔴 Em aberto'}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
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
                        const mesNum = i + 1;
                        const now = new Date();
                        const currentYear = now.getFullYear();
                        const currentMonth = now.getMonth() + 1;
                        const isFuture = anoNum > currentYear || (anoNum === currentYear && mesNum > currentMonth);

                        if (isFuture) {
                          return <TableCell key={i} className="text-center px-1 py-1.5" />;
                        }

                        const st = md[row.id];
                        return (
                          <TableCell key={i} className="text-center px-1 py-1.5">
                            <button
                              onClick={() => handleCellClick(row.id, mesNum)}
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
