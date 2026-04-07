/**
 * Resumo Executivo — Dashboard profissional de gestão.
 * Visual: software financeiro / ERP / BI executivo.
 */
import { useState, useMemo, useEffect } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabId } from '@/components/BottomNav';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { useResumoStatus, StatusNivel } from '@/hooks/useResumoStatus';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { useFazenda } from '@/contexts/FazendaContext';

import { supabase } from '@/integrations/supabase/client';
import { useZootMensal } from '@/hooks/useZootMensal';
import { ChevronRight, AlertTriangle, CheckCircle2, TrendingUp, Wallet, BarChart3, Landmark, ClipboardCheck } from 'lucide-react';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { Categoria } from '@/types/cattle';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal: FiltroGlobal;
  onFiltroChange: (f: Partial<FiltroGlobal>) => void;
  onSetSaldo?: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
}

const MESES = [
  { value: '1', label: 'Jan' }, { value: '2', label: 'Fev' },
  { value: '3', label: 'Mar' }, { value: '4', label: 'Abr' },
  { value: '5', label: 'Mai' }, { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' }, { value: '8', label: 'Ago' },
  { value: '9', label: 'Set' }, { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

const MESES_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const TIPOS_SAIDA = ['abate', 'venda', 'consumo', 'transferencia_saida'];

// ---------------------------------------------------------------------------
// Status visual components
// ---------------------------------------------------------------------------

function StatusDot({ nivel }: { nivel: StatusNivel }) {
  const bg = {
    aberto: 'bg-destructive',
    parcial: 'bg-warning',
    fechado: 'bg-success',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${bg[nivel]}`} />;
}

function StatusBadge({ nivel, label }: { nivel: StatusNivel; label: string }) {
  const styles = {
    aberto: 'text-destructive bg-destructive/10 border-destructive/20',
    parcial: 'text-warning bg-warning/10 border-warning/20',
    fechado: 'text-success bg-success/10 border-success/20',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[nivel]}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Zoo KPIs hook — uses official weight hierarchy (fechamento > lancamento > saldo)
// ---------------------------------------------------------------------------
// Zoo KPIs — official source: vw_zoot_fazenda_mensal
// ---------------------------------------------------------------------------

function useZooKpis(ano: number, mes: number) {
  const { data: rows } = useZootMensal({ ano, cenario: 'realizado' });

  return useMemo(() => {
    const mesDado = (rows || []).find(r => r.mes === mes);
    const saldoFinal = mesDado?.cabecas_final ?? 0;
    const pesoMedio = mesDado?.peso_medio_final_kg ?? null;
    const area = mesDado?.area_produtiva_ha ?? 0;
    const pesoTotalKg = mesDado?.peso_total_final_kg ?? 0;
    const lotacaoKgHa = pesoTotalKg > 0 && area > 0 ? pesoTotalKg / area : null;

    return { saldoFinal, pesoMedio, lotacaoKgHa, area };
  }, [rows, mes]);
}

// ---------------------------------------------------------------------------
// Per-farm KPIs for global view (table) — official source
// ---------------------------------------------------------------------------

interface FarmKpi {
  id: string;
  nome: string;
  rebanho: number;
  pesoMedio: number | null;
  area: number;
  lotacaoKgHa: number | null;
}

function useGlobalFarmKpis(ano: number, mes: number) {
  const { fazendas, isGlobal } = useFazenda();
  const [farmRows, setFarmRows] = useState<FarmKpi[]>([]);

  const pecuarias = useMemo(() =>
    fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false),
  [fazendas]);

  useEffect(() => {
    if (!isGlobal || pecuarias.length === 0) { setFarmRows([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('vw_zoot_fazenda_mensal' as any)
        .select('*')
        .in('fazenda_id', pecuarias.map(f => f.id))
        .eq('ano', ano)
        .eq('mes', mes)
        .eq('cenario', 'realizado');

      if (cancelled || error || !data) return;

      const rows = (data as any[]).map((r: any) => {
        const faz = pecuarias.find(f => f.id === r.fazenda_id);
        const pesoTotal = r.peso_total_final_kg ?? 0;
        const area = r.area_produtiva_ha ?? 0;
        return {
          id: r.fazenda_id as string,
          nome: faz?.nome || '?',
          rebanho: (r.cabecas_final ?? 0) as number,
          pesoMedio: (r.peso_medio_final_kg ?? null) as number | null,
          area,
          lotacaoKgHa: pesoTotal > 0 && area > 0 ? pesoTotal / area : null,
        };
      }).filter(f => f.rebanho !== 0);

      if (!cancelled) setFarmRows(rows);
    })();
    return () => { cancelled = true; };
  }, [isGlobal, pecuarias, ano, mes]);

  return useMemo(() => {
    const globalRebanho = farmRows.reduce((s, f) => s + f.rebanho, 0);
    const globalArea = farmRows.reduce((s, f) => s + f.area, 0);
    const globalPesoTotal = farmRows.reduce((s, f) => s + (f.pesoMedio ? f.rebanho * f.pesoMedio : 0), 0);
    const globalPesoMedio = globalRebanho > 0 ? globalPesoTotal / globalRebanho : null;
    const globalLotacao = globalPesoTotal > 0 && globalArea > 0 ? globalPesoTotal / globalArea : null;

    const globalRow: FarmKpi = {
      id: '__global__', nome: 'Global', rebanho: globalRebanho,
      pesoMedio: globalPesoMedio, area: globalArea, lotacaoKgHa: globalLotacao,
    };

    return { farms: farmRows, globalRow };
  }, [farmRows]);
}

// ---------------------------------------------------------------------------
// Metric row helper
// ---------------------------------------------------------------------------
function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal, onFiltroChange, onSetSaldo }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaNaoPecuaria = fazendaAtual && fazendaAtual.id !== '__global__' && fazendaAtual.tem_pecuaria === false;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const anoNum = Number(filtroGlobal.ano);
  const mesNum = filtroGlobal.mes;

  const { zootecnico, financeiro, economico, loading } = useResumoStatus(lancamentos, saldosIniciais, anoNum, mesNum);
  const statusZoo = useStatusZootecnico(fazendaAtual?.id, anoNum, mesNum, lancamentos, saldosIniciais);
  const zooKpis = useZooKpis(anoNum, mesNum);
  const globalFarmKpis = useGlobalFarmKpis(anoNum, mesNum);

  // Derive Zoo status from the granular useStatusZootecnico (same source as detail view)
  const zooNivel: StatusNivel = statusZoo.status as StatusNivel;

  // Econômico derived from all 3 layers
  const econNivel: StatusNivel = useMemo(() => {
    const niveis = [zooNivel, financeiro.status.nivel];
    if (niveis.every(n => n === 'fechado')) return 'fechado';
    if (niveis.every(n => n === 'aberto')) return 'aberto';
    return 'parcial';
  }, [zooNivel, financeiro.status.nivel]);

  const statusGeral = useMemo((): StatusNivel => {
    const niveis = [zooNivel, financeiro.status.nivel, econNivel];
    if (niveis.every(n => n === 'fechado')) return 'fechado';
    if (niveis.every(n => n === 'aberto')) return 'aberto';
    return 'parcial';
  }, [zooNivel, financeiro.status.nivel, econNivel]);

  const mesLabel = MESES_FULL[mesNum - 1] || '';

  // Alertas
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao', 'lancamentos', 'valor_rebanho'];
  const alertas = useMemo(() => {
    const items: { texto: string; nivel: StatusNivel; tab: TabId; blockedGlobal: boolean }[] = [];
    if (fazendaNaoPecuaria) return items;
    // All 4 pendências come from statusZoo (financeiro, pastos, categorias, valor)
    statusZoo.pendencias.forEach(p => {
      if (p.status !== 'fechado') {
        const destTab = (p.resolverTab || 'visao_zoo_hub') as TabId;
        items.push({
          texto: `${p.label}: ${p.descricao}`,
          nivel: p.status === 'aberto' ? 'aberto' : 'parcial',
          tab: destTab,
          blockedGlobal: BLOCKED_TABS_GLOBAL.includes(destTab),
        });
      }
    });
    return items;
  }, [statusZoo.pendencias, fazendaNaoPecuaria]);

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 md:px-4 py-0.5">
        <div className="flex items-center justify-between gap-2 w-full">
          <p className="text-[9px] text-muted-foreground font-medium truncate">
            {mesLabel} / {filtroGlobal.ano}
            {isGlobal ? ' · Consolidado' : ` · ${fazendaAtual?.nome || ''}`}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <Select value={filtroGlobal.ano} onValueChange={v => onFiltroChange({ ano: v })}>
              <SelectTrigger className="w-[54px] h-7 min-h-0 text-[10px] font-medium border-border/60 bg-card px-1 py-0 [&>svg]:h-3 [&>svg]:w-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="bottom">
                {anosDisponiveis.map(a => (
                  <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(mesNum)} onValueChange={v => onFiltroChange({ mes: Number(v) })}>
              <SelectTrigger className="w-[48px] h-7 min-h-0 text-[10px] font-medium border-border/60 bg-card px-1 py-0 [&>svg]:h-3 [&>svg]:w-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="bottom">
                {MESES.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="px-3 md:px-4 pt-2 space-y-3">

      {/* ── Topo executivo: Status + Atalhos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        {/* STATUS — destaque principal, alinhado com Zootécnico */}
        <button
          onClick={() => onTabChange('zootecnico' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
          className="rounded-lg border border-primary/30 bg-primary px-4 py-3.5 flex flex-col gap-2.5 transition-colors hover:bg-primary/90 active:bg-primary/80 text-left"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary-foreground flex-shrink-0" />
            <span className="text-xs font-bold text-primary-foreground uppercase tracking-wide">Status</span>
            <ChevronRight className="h-3 w-3 text-primary-foreground/60 flex-shrink-0 ml-auto" />
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              { label: 'Fin', desc: 'Financeiro', nivel: financeiro.status.nivel },
              { label: 'Zoo', desc: 'Zootécnico', nivel: zooNivel },
              { label: 'Econ', desc: 'Econômico', nivel: econNivel },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <StatusDot nivel={item.nivel} />
                <span className="text-[11px] text-primary-foreground/90 font-semibold">{item.desc}</span>
                <span className="text-[9px] text-primary-foreground/60 font-medium ml-auto uppercase">
                  {item.nivel === 'fechado' ? 'OK' : item.nivel === 'parcial' ? 'Parcial' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        </button>

        {/* 3 ATALHOS — alinhados com Financeiro */}
        <div className="grid grid-cols-3 gap-2 items-stretch">
          {/* OPERAÇÃO */}
          <button
            onClick={() => onTabChange('visao_zoo_hub' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
            className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-primary/10 active:bg-primary/15"
          >
            <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-foreground">Operação</span>
            <p className="text-[8px] text-muted-foreground text-center leading-tight">Indicadores e desempenho</p>
          </button>

          {/* PAINEL DO CONSULTOR */}
          <button
            onClick={() => onTabChange('painel_consultor_hub' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
            className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-primary/10 active:bg-primary/15"
          >
            <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
              <Landmark className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-foreground text-center">Painel Consultor</span>
            <p className="text-[8px] text-muted-foreground text-center leading-tight">Conferência e fechamento</p>
          </button>

          {/* STATUS DOS FECHAMENTOS */}
          <button
            onClick={() => onTabChange('status_fechamentos' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
            className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-primary/10 active:bg-primary/15"
          >
            <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-foreground text-center">Fechamentos</span>
            <p className="text-[8px] text-muted-foreground text-center leading-tight">Status do ano</p>
          </button>
        </div>
      </div>

      {/* ── Zootécnico + Financeiro side by side ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* ZOOTÉCNICO */}
        <section className="rounded-lg border border-primary/20 bg-primary/[0.04]">
          <div className="px-3 py-2 border-b border-primary/15 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🐄</span>
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Zootécnico</span>
            </div>
            <StatusBadge
              nivel={zootecnico.status.nivel}
              label={zootecnico.status.nivel === 'fechado' ? 'Fechado' : zootecnico.status.nivel === 'parcial' ? 'Parcial' : 'Aberto'}
            />
          </div>

          {fazendaNaoPecuaria ? (
            <div className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Sem dados de rebanho para esta fazenda</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <div className="text-center">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Rebanho Atual</p>
                <p className="text-3xl font-extrabold text-foreground tabular-nums leading-tight">
                  {formatNum(zooKpis.saldoFinal)}
                </p>
                <p className="text-[10px] text-muted-foreground">cabeças</p>
              </div>

              {isGlobal && globalFarmKpis.farms.length > 0 && (
                <div className="border-t border-border/40 pt-2 -mx-0.5">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[8px] h-6 px-1">Fazenda</TableHead>
                          <TableHead className="text-[8px] h-6 px-1 text-right">Qtde</TableHead>
                          <TableHead className="text-[8px] h-6 px-1 text-right">Peso</TableHead>
                          <TableHead className="text-[8px] h-6 px-1 text-right">Kg/ha</TableHead>
                          <TableHead className="text-[8px] h-6 px-1 text-right">Área</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {globalFarmKpis.farms.map(f => (
                          <TableRow key={f.id} className="hover:bg-muted/30">
                            <TableCell className="text-[9px] py-0.5 px-1 font-medium truncate max-w-[90px]">{f.nome}</TableCell>
                            <TableCell className="text-[9px] py-0.5 px-1 text-right tabular-nums">{formatNum(f.rebanho)}</TableCell>
                            <TableCell className="text-[9px] py-0.5 px-1 text-right tabular-nums">{f.pesoMedio ? formatNum(f.pesoMedio, 0) : '—'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 px-1 text-right tabular-nums">{f.lotacaoKgHa ? formatNum(f.lotacaoKgHa, 0) : '—'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 px-1 text-right tabular-nums">{f.area > 0 ? formatNum(f.area, 0) : '—'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-border bg-muted/30 hover:bg-muted/40 font-semibold">
                          <TableCell className="text-[9px] py-1 px-1 font-bold">Global</TableCell>
                          <TableCell className="text-[9px] py-1 px-1 text-right tabular-nums font-bold">{formatNum(globalFarmKpis.globalRow.rebanho)}</TableCell>
                          <TableCell className="text-[9px] py-1 px-1 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.pesoMedio ? formatNum(globalFarmKpis.globalRow.pesoMedio, 0) : '—'}</TableCell>
                          <TableCell className="text-[9px] py-1 px-1 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.lotacaoKgHa ? formatNum(globalFarmKpis.globalRow.lotacaoKgHa, 0) : '—'}</TableCell>
                          <TableCell className="text-[9px] py-1 px-1 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.area > 0 ? formatNum(globalFarmKpis.globalRow.area, 0) : '—'}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {!isGlobal && (
                <div className="border-t border-border/40 pt-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="text-center rounded-md bg-muted/30 px-1.5 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Área</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{zooKpis.area > 0 ? formatNum(zooKpis.area, 0) : '—'} ha</p>
                    </div>
                    <div className="text-center rounded-md bg-muted/30 px-1.5 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Peso Méd.</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{zooKpis.pesoMedio ? `${formatNum(zooKpis.pesoMedio, 0)} kg` : '—'}</p>
                    </div>
                    <div className="text-center rounded-md bg-muted/30 px-1.5 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Kg/ha</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{zooKpis.lotacaoKgHa !== null ? formatNum(zooKpis.lotacaoKgHa, 0) : '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => onTabChange('visao_zoo_hub', { ano: filtroGlobal.ano, mes: mesNum })}
                className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-primary py-2 rounded border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10"
              >
                Painel Zootécnico <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* FINANCEIRO */}
        <section className="rounded-lg border border-primary/20 bg-primary/[0.04]">
          <div className="px-3 py-2 border-b border-primary/15 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Financeiro</span>
            </div>
            <StatusBadge
              nivel={financeiro.status.nivel}
              label={financeiro.status.nivel === 'fechado' ? 'Realizado' : financeiro.status.nivel === 'parcial' ? 'Parcial' : 'Pendente'}
            />
          </div>

          <div className="p-3 space-y-2">
            <div className="text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Saldo Final em Caixa</p>
              <p className={`text-3xl font-extrabold tabular-nums leading-tight ${financeiro.caixaAtual >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatMoeda(financeiro.caixaAtual)}
              </p>
            </div>

            <div className="border-t border-border/40 pt-1.5">
              <MetricRow
                label="Entradas acum."
                value={formatMoeda(financeiro.totalEntradas)}
                accent="text-success"
              />
              <MetricRow
                label="Saídas acum."
                value={formatMoeda(financeiro.totalSaidas)}
                accent="text-destructive"
              />
            </div>

            <button
              onClick={() => onTabChange('fin_caixa', { ano: filtroGlobal.ano, mes: mesNum })}
              className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-primary py-2 rounded border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10"
            >
              Fluxo Financeiro <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>




      {/* ── Pendências ── */}
      {alertas.length > 0 && (
        <section className="rounded-md border border-warning/30 bg-card overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-warning/20 bg-warning/5 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-semibold text-foreground">Pendências</span>
            <span className="text-[9px] font-semibold text-warning bg-warning/15 px-1.5 py-px rounded tabular-nums ml-auto">
              {alertas.length}
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {alertas.map((a, i) => {
              const blocked = isGlobal && a.blockedGlobal;
              return (
                <button
                  key={i}
                  onClick={() => !blocked && onTabChange(a.tab, { ano: filtroGlobal.ano, mes: mesNum })}
                  className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 transition-colors ${blocked ? 'opacity-50 cursor-default' : 'hover:bg-muted/30'}`}
                >
                  <StatusDot nivel={a.nivel} />
                  <span className="flex-1 text-[10px] text-foreground leading-tight">{a.texto}</span>
                  {blocked ? (
                    <span className="text-[8px] text-muted-foreground whitespace-nowrap">Selecione fazenda</span>
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {alertas.length === 0 && !loading && !statusZoo.loading && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <span className="text-[10px] font-semibold text-success">
            Nenhuma pendência — {mesLabel}/{filtroGlobal.ano}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
