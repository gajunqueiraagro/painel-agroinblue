/**
 * Resumo Executivo — Dashboard profissional de gestão.
 * Visual: software financeiro / ERP / BI executivo.
 */
import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabId } from '@/components/BottomNav';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { useResumoStatus, StatusNivel } from '@/hooks/useResumoStatus';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { ChevronRight, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Wallet, BarChart3, Landmark } from 'lucide-react';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal: FiltroGlobal;
  onFiltroChange: (f: Partial<FiltroGlobal>) => void;
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

function StatusIndicator({ nivel }: { nivel: StatusNivel }) {
  const config = {
    aberto: 'bg-red-500',
    parcial: 'bg-amber-500',
    fechado: 'bg-emerald-500',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${config[nivel]}`} />;
}

function StatusLabel({ nivel, label }: { nivel: StatusNivel; label: string }) {
  const config = {
    aberto: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
    parcial: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    fechado: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };
  return (
    <span className={`text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded border ${config[nivel]}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Zoo KPIs hook
// ---------------------------------------------------------------------------

function useZooKpis(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: number, mes: number) {
  const { pastos } = usePastos();
  return useMemo(() => {
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const saldoFinal = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
    const itens = Array.from(saldoMap.entries())
      .filter(([, q]) => q > 0)
      .map(([cat, qtd]) => {
        const si = saldosIniciais.find(s => s.categoria === cat && s.ano === ano);
        return { quantidade: qtd, pesoKg: si?.pesoMedioKg || null };
      });
    const pesoMedio = calcPesoMedioPonderado(itens);
    const area = calcAreaProdutivaPecuaria(pastos);
    const ua = calcUA(saldoFinal, pesoMedio);
    const uaHa = calcUAHa(ua, area);
    const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
    const lancsAcum = lancamentos.filter(l => l.data >= `${ano}-01-01` && l.data <= end);
    const saidasAcum = lancsAcum.filter(l => TIPOS_SAIDA.includes(l.tipo));
    const arrobasSaidas = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);
    return { saldoFinal, pesoMedio, uaHa, arrobasSaidas, area };
  }, [lancamentos, saldosIniciais, ano, mes, pastos]);
}

// ---------------------------------------------------------------------------
// Per-farm rebanho for global view
// ---------------------------------------------------------------------------

function useRebanhoPerFarm(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: number, mes: number) {
  const { fazendas } = useFazenda();
  return useMemo(() => {
    const pecuarias = fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false);
    return pecuarias.map(faz => {
      const lancsFaz = lancamentos.filter(l => l.fazendaId === faz.id);
      const saldosFaz = saldosIniciais.filter(s => s.fazendaId === faz.id);
      const saldoMap = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, ano, mes);
      const total = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
      return { id: faz.id, nome: faz.nome, rebanho: total };
    }).filter(f => f.rebanho > 0);
  }, [fazendas, lancamentos, saldosIniciais, ano, mes]);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal, onFiltroChange }: Props) {
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
  const zooKpis = useZooKpis(lancamentos, saldosIniciais, anoNum, mesNum);
  const farmBreakdown = useRebanhoPerFarm(lancamentos, saldosIniciais, anoNum, mesNum);

  const statusGeral = useMemo((): StatusNivel => {
    const niveis = [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel];
    if (niveis.every(n => n === 'fechado')) return 'fechado';
    if (niveis.every(n => n === 'aberto')) return 'aberto';
    return 'parcial';
  }, [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel]);

  const mesLabel = MESES_FULL[mesNum - 1] || '';

  // Alertas
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao_categoria', 'conciliacao', 'lancamentos', 'valor_rebanho'];
  const alertas = useMemo(() => {
    const items: { texto: string; nivel: StatusNivel; tab: TabId; blockedGlobal: boolean }[] = [];
    if (fazendaNaoPecuaria) return items;
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
    if (financeiro.status.nivel !== 'fechado') {
      items.push({
        texto: `Financeiro: ${financeiro.status.descricao}`,
        nivel: financeiro.status.nivel,
        tab: 'fin_caixa',
        blockedGlobal: false,
      });
    }
    return items;
  }, [statusZoo.pendencias, financeiro.status, fazendaNaoPecuaria]);

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in pb-24">
      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Resumo Executivo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mesLabel} / {filtroGlobal.ano}
            {isGlobal ? ' · Consolidado' : ` · ${fazendaAtual?.nome || ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filtroGlobal.ano} onValueChange={v => onFiltroChange({ ano: v })}>
            <SelectTrigger className="w-[76px] h-9 text-xs font-semibold border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom">
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mesNum)} onValueChange={v => onFiltroChange({ mes: Number(v) })}>
            <SelectTrigger className="w-[72px] h-9 text-xs font-semibold border-border/60">
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

      {/* ── Status Strip ── */}
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <button
          onClick={() => onTabChange('zootecnico' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
          className="w-full text-left p-4 transition-colors hover:bg-muted/30 active:bg-muted/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground">Status Geral</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {statusGeral === 'fechado' ? 'Conciliado' : statusGeral === 'parcial' ? 'Em andamento' : 'Pendente'}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex gap-6">
            {[
              { label: 'Zootécnico', nivel: zootecnico.status.nivel },
              { label: 'Financeiro', nivel: financeiro.status.nivel },
              { label: 'Econômico', nivel: economico.status.nivel },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <StatusIndicator nivel={item.nivel} />
                <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </button>
      </div>

      {/* ── Grid: Zootécnico + Financeiro ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ZOOTÉCNICO */}
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-sm">🐄</span>
                </div>
                <span className="text-sm font-bold text-foreground">Zootécnico</span>
              </div>
              <StatusLabel
                nivel={zootecnico.status.nivel}
                label={zootecnico.status.nivel === 'fechado' ? 'Fechado' : zootecnico.status.nivel === 'parcial' ? 'Parcial' : 'Aberto'}
              />
            </div>
          </div>

          {fazendaNaoPecuaria ? (
            <div className="p-4">
              <p className="text-sm text-muted-foreground italic">Não se aplica a esta unidade.</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Rebanho principal */}
              <div className="text-center py-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Rebanho Atual</p>
                <p className="text-3xl font-extrabold text-foreground tracking-tight">
                  {formatNum(zootecnico.rebanhoAtual)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">cabeças</p>
              </div>

              {/* Per-farm breakdown (Global) */}
              {isGlobal && farmBreakdown.length > 0 && (
                <div className="border-t border-border/40 pt-3 space-y-1.5">
                  {farmBreakdown.map(f => (
                    <div key={f.id} className="flex justify-between items-center px-1">
                      <span className="text-xs text-muted-foreground truncate max-w-[60%]">{f.nome}</span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">{formatNum(f.rebanho)} cab</span>
                    </div>
                  ))}
                </div>
              )}

              {/* KPIs por fazenda */}
              {!isGlobal && (
                <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
                  <div className="text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Área Prod.</p>
                    <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                      {zooKpis.area > 0 ? `${formatNum(zooKpis.area, 0)} ha` : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Peso Médio</p>
                    <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                      {zooKpis.pesoMedio ? `${formatNum(zooKpis.pesoMedio, 0)} kg` : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Lot. kg/ha</p>
                    <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                      {zooKpis.uaHa !== null ? formatNum(zooKpis.uaHa, 2) : '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={() => onTabChange('visao_zoo_hub', { ano: filtroGlobal.ano, mes: mesNum })}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary py-2.5 rounded-md border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10"
              >
                Painel Zootécnico <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* FINANCEIRO */}
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-bold text-foreground">Financeiro</span>
              </div>
              <StatusLabel
                nivel={financeiro.status.nivel}
                label={financeiro.status.nivel === 'fechado' ? 'Conciliado' : financeiro.status.nivel === 'parcial' ? 'Parcial' : 'Pendente'}
              />
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Resultado destaque */}
            <div className="text-center py-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Resultado Acumulado</p>
              <p className={`text-3xl font-extrabold tracking-tight ${financeiro.resultado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoeda(financeiro.resultado)}
              </p>
            </div>

            {/* Entradas / Saídas */}
            <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Entradas</p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatMoeda(financeiro.totalEntradas)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Saídas</p>
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatMoeda(financeiro.totalSaidas)}
                  </p>
                </div>
              </div>
            </div>

            {/* Caixa Atual (global) */}
            {isGlobal && (
              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                      <Landmark className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Caixa Atual</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${financeiro.caixaAtual >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatMoeda(financeiro.caixaAtual)}
                  </span>
                </div>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => onTabChange('fin_caixa', { ano: filtroGlobal.ano, mes: mesNum })}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary py-2.5 rounded-md border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10"
            >
              Fluxo Financeiro <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Econômico ── */}
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-foreground">Econômico</span>
              <span className="text-xs text-muted-foreground ml-2">{economico.status.descricao}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusLabel
              nivel={economico.status.nivel}
              label={economico.status.nivel === 'fechado' ? 'Validado' : economico.status.nivel === 'parcial' ? 'Parcial' : 'Pendente'}
            />
            <button
              onClick={() => onTabChange('analise_economica', { ano: filtroGlobal.ano, mes: mesNum })}
              className="h-8 px-3 flex items-center gap-1 text-xs font-semibold text-primary rounded-md border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10"
            >
              Abrir <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Pendências ── */}
      {alertas.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-bold text-foreground">
                Pendências
              </span>
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full ml-auto tabular-nums">
                {alertas.length}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {alertas.map((a, i) => {
              const blocked = isGlobal && a.blockedGlobal;
              return (
                <button
                  key={i}
                  onClick={() => !blocked && onTabChange(a.tab, { ano: filtroGlobal.ano, mes: mesNum })}
                  className={`w-full flex items-center gap-3 text-left px-4 py-3 transition-colors ${blocked ? 'opacity-50 cursor-default' : 'hover:bg-muted/30'}`}
                >
                  <StatusIndicator nivel={a.nivel} />
                  <span className="flex-1 text-sm text-foreground">{a.texto}</span>
                  {blocked ? (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Selecione fazenda</span>
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {alertas.length === 0 && !loading && !statusZoo.loading && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Nenhuma pendência — {mesLabel}/{filtroGlobal.ano}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
