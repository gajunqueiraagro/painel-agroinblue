/**
 * Resumo Executivo — Dashboard de consultoria em tela única.
 * Substitui o antigo HUB de 3 cards por uma visão completa:
 * 1. Status Geral, 2. Zootécnico, 3. Financeiro, 4. Econômico, 5. Alertas.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabId } from '@/components/BottomNav';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { useResumoStatus, StatusNivel } from '@/hooks/useResumoStatus';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { supabase } from '@/integrations/supabase/client';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { ChevronRight, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal: FiltroGlobal;
  onFiltroChange: (f: Partial<FiltroGlobal>) => void;
}

const MESES = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const TIPOS_SAIDA = ['abate', 'venda', 'consumo', 'transferencia_saida'];

function StatusDot({ nivel }: { nivel: StatusNivel }) {
  const config = {
    aberto: { emoji: '🔴', bg: 'bg-destructive/15' },
    parcial: { emoji: '🟡', bg: 'bg-accent/20' },
    fechado: { emoji: '🟢', bg: 'bg-green-500/15' },
  };
  return <span className="text-base">{config[nivel].emoji}</span>;
}

function StatusBadge({ nivel, label }: { nivel: StatusNivel; label?: string }) {
  const config = {
    aberto: { emoji: '🔴', text: label || 'Em aberto', className: 'bg-destructive/15 text-destructive' },
    parcial: { emoji: '🟡', text: label || 'Parcial', className: 'bg-accent/20 text-accent-foreground' },
    fechado: { emoji: '🟢', text: label || 'Fechado', className: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  };
  const c = config[nivel];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.emoji} {c.text}
    </span>
  );
}

function KpiRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="text-right">
        <span className={`font-bold text-sm ${color || 'text-card-foreground'}`}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  );
}

/** Hook leve para KPIs zootécnicos extras (GMD, Lotação, @) */
function useZooKpis(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: number, mes: number, fazendaId?: string) {
  const { pastos } = usePastos();
  const isGlobal = !fazendaId || fazendaId === '__global__';

  return useMemo(() => {
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const saldoFinal = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);

    // Peso médio (simplificado — sem fechamento de pasto no hook leve)
    const itens = Array.from(saldoMap.entries())
      .filter(([, q]) => q > 0)
      .map(([cat, qtd]) => {
        const si = saldosIniciais.find(s => s.categoria === cat && s.ano === ano);
        return { quantidade: qtd, pesoKg: si?.pesoMedioKg || null };
      });
    const pesoMedio = calcPesoMedioPonderado(itens);

    // UA/ha
    const area = calcAreaProdutivaPecuaria(pastos);
    const ua = calcUA(saldoFinal, pesoMedio);
    const uaHa = calcUAHa(ua, area);

    // Arrobas saídas acumuladas
    const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
    const lancsAcum = lancamentos.filter(l => l.data >= `${ano}-01-01` && l.data <= end);
    const saidasAcum = lancsAcum.filter(l => TIPOS_SAIDA.includes(l.tipo));
    const arrobasSaidas = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);

    return {
      saldoFinal,
      pesoMedio,
      uaHa,
      arrobasSaidas,
      area,
    };
  }, [lancamentos, saldosIniciais, ano, mes, pastos]);
}

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
  const zooKpis = useZooKpis(lancamentos, saldosIniciais, anoNum, mesNum, fazendaAtual?.id);

  // Status geral
  const statusGeral = useMemo((): StatusNivel => {
    const niveis = [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel];
    if (niveis.every(n => n === 'fechado')) return 'fechado';
    if (niveis.every(n => n === 'aberto')) return 'aberto';
    return 'parcial';
  }, [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel]);

  // Destaque do mês
  const destaqueMes = useMemo(() => {
    if (fazendaNaoPecuaria) return 'Fazenda sem operação pecuária.';
    if (statusGeral === 'fechado') return 'Mês conciliado e fechado. ✅';
    const alertas: string[] = [];
    if (zootecnico.status.nivel === 'aberto') alertas.push('pendências zootécnicas');
    if (financeiro.status.nivel === 'aberto') alertas.push('financeiro não conciliado');
    if (alertas.length > 0) return `Atenção: ${alertas.join(', ')}.`;
    return 'Mês em andamento — algumas pendências parciais.';
  }, [statusGeral, zootecnico.status.nivel, financeiro.status.nivel, fazendaNaoPecuaria]);

  // Tabs bloqueadas no modo global
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao_categoria', 'conciliacao', 'lancamentos', 'valor_rebanho'];

  // Alertas automáticos
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

  const [auditOpen, setAuditOpen] = useState(false);

  const mesLabel = MESES.find(m => m.value === String(mesNum))?.label || '';

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-3 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filtroGlobal.ano} onValueChange={v => onFiltroChange({ ano: v })}>
          <SelectTrigger className="w-24 touch-target text-sm font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(mesNum)} onValueChange={v => onFiltroChange({ mes: Number(v) })}>
          <SelectTrigger className="w-36 touch-target text-sm font-bold">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 1. STATUS GERAL */}
      <div className="rounded-xl border bg-card p-4 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-card-foreground">Status Geral</h2>
          <StatusBadge nivel={statusGeral} label={statusGeral === 'fechado' ? 'Conciliado' : statusGeral === 'parcial' ? 'Em andamento' : 'Pendente'} />
        </div>
        <p className="text-sm text-muted-foreground">{destaqueMes}</p>
        <div className="flex gap-4 pt-1">
          <div className="flex items-center gap-1.5">
            <StatusDot nivel={zootecnico.status.nivel} />
            <span className="text-xs text-muted-foreground">Zoo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot nivel={financeiro.status.nivel} />
            <span className="text-xs text-muted-foreground">Fin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot nivel={economico.status.nivel} />
            <span className="text-xs text-muted-foreground">Eco</span>
          </div>
        </div>
      </div>

      {/* Grid 2 cols on md */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 2. ZOOTÉCNICO */}
        <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🐄</span>
              <h2 className="text-sm font-extrabold text-card-foreground">Zootécnico</h2>
            </div>
            <StatusBadge nivel={zootecnico.status.nivel} />
          </div>
          {fazendaNaoPecuaria ? (
            <p className="text-sm text-muted-foreground">Não se aplica.</p>
          ) : (
            <>
              <div className="space-y-1">
                <KpiRow label="Rebanho atual" value={`${formatNum(zootecnico.rebanhoAtual)} cab`} />
                <KpiRow label="Produção (@)" value={`${formatNum(zooKpis.arrobasSaidas)} @`} sub="saídas acum." />
                <KpiRow label="Lotação (UA/ha)" value={zooKpis.uaHa !== null ? formatNum(zooKpis.uaHa, 2) : '—'} />
                <KpiRow label="Peso médio" value={zooKpis.pesoMedio !== null ? `${formatNum(zooKpis.pesoMedio, 0)} kg` : '—'} />
              </div>
              <button
                onClick={() => onTabChange('visao_zoo_hub', { ano: filtroGlobal.ano, mes: mesNum })}
                className="w-full flex items-center justify-center gap-1 text-xs font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
              >
                Ver Painel Zootécnico <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* 3. FINANCEIRO */}
        <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">💰</span>
              <h2 className="text-sm font-extrabold text-card-foreground">Financeiro</h2>
            </div>
            <StatusBadge nivel={financeiro.status.nivel} />
          </div>
          <div className="space-y-1">
            <KpiRow label="Entradas" value={formatMoeda(financeiro.totalEntradas)} color="text-green-600 dark:text-green-400" />
            <KpiRow label="Saídas" value={formatMoeda(financeiro.totalSaidas)} color="text-red-600 dark:text-red-400" />
            <div className="border-t border-border pt-1">
              <KpiRow
                label="Resultado"
                value={formatMoeda(financeiro.resultado)}
                color={financeiro.resultado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
              />
            </div>
            {isGlobal && (
              <KpiRow
                label="Caixa Atual"
                value={formatMoeda(financeiro.caixaAtual)}
                color={financeiro.caixaAtual >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
              />
            )}
          </div>
          <button
            onClick={() => onTabChange('fin_caixa', { ano: filtroGlobal.ano, mes: mesNum })}
            className="w-full flex items-center justify-center gap-1 text-xs font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
          >
            Ver Fluxo Financeiro <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 4. ECONÔMICO */}
      <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h2 className="text-sm font-extrabold text-card-foreground">Econômico</h2>
          </div>
          <StatusBadge nivel={economico.status.nivel} />
        </div>
        <p className="text-sm text-muted-foreground">{economico.status.descricao}</p>
        <button
          onClick={() => onTabChange('analise_economica', { ano: filtroGlobal.ano, mes: mesNum })}
          className="w-full flex items-center justify-center gap-1 text-xs font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
        >
          Ver Análise Econômica <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 5. ALERTAS */}
      {alertas.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-extrabold text-destructive">Pendências do Mês</h2>
          </div>
          <div className="space-y-1.5">
            {alertas.map((a, i) => (
              <button
                key={i}
                onClick={() => onTabChange(a.tab, { ano: filtroGlobal.ano, mes: mesNum })}
                className="w-full flex items-center gap-2 text-left text-sm hover:bg-destructive/10 rounded-md px-2 py-1.5 transition-colors"
              >
                <StatusDot nivel={a.nivel} />
                <span className="flex-1 text-card-foreground">{a.texto}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {alertas.length === 0 && !loading && !statusZoo.loading && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-bold text-green-700 dark:text-green-400">
              Nenhuma pendência para {mesLabel}/{filtroGlobal.ano}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
