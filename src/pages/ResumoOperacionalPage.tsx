import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useStatusPilares, getPilarBadgeConfig } from '@/hooks/useStatusPilares';
import { FazendaSelector } from '@/components/FazendaSelector';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, TrendingUp, Repeat2, BarChart3,
  DollarSign, PieChart, Wheat, Landmark, Target, ShieldCheck, ChevronLeft,
} from 'lucide-react';
import { ResOpDashboard } from './resumo-op/ResOpDashboard';
import { ResOpZootecnico } from './resumo-op/ResOpZootecnico';
import { ResOpMovimentacoes } from './resumo-op/ResOpMovimentacoes';
import { ResOpProducao } from './resumo-op/ResOpProducao';
import { ResOpOperacional } from './resumo-op/ResOpOperacional';
import { ResOpCentros } from './resumo-op/ResOpCentros';
import { ResOpNutricao } from './resumo-op/ResOpNutricao';
import { ResOpPatrimonio } from './resumo-op/ResOpPatrimonio';
import { ResOpDesvios } from './resumo-op/ResOpDesvios';
import { ResOpAuditoria } from './resumo-op/ResOpAuditoria';

export type ResOpPage =
  'dash' | 'zoo' | 'mov' | 'prod' | 'op' | 'cc' | 'nut' | 'pat' | 'dev' | 'aud';

export interface ResOpFilters {
  ano: string;
  mes: number;
  visao: 'mensal' | 'acumulado';
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const PAGE_TITLES: Record<ResOpPage, string> = {
  dash: 'Dashboard executivo',    zoo: 'Zootécnico',
  mov:  'Movimentações',          prod: 'Produção e eficiência',
  op:   'Operacional — custos',   cc:  'Centros de custo',
  nut:  'Nutrição',               pat: 'Patrimônio',
  dev:  'Desvios da META',        aud: 'Auditoria dos dados',
};

const NAV = [
  { group: 'Gestão', items: [
    { id: 'dash' as ResOpPage, label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'dev'  as ResOpPage, label: 'Desvios META', icon: Target },
    { id: 'aud'  as ResOpPage, label: 'Auditoria',    icon: ShieldCheck },
  ]},
  { group: 'Produção', items: [
    { id: 'zoo'  as ResOpPage, label: 'Zootécnico',    icon: TrendingUp },
    { id: 'mov'  as ResOpPage, label: 'Movimentações', icon: Repeat2 },
    { id: 'prod' as ResOpPage, label: 'Produção',      icon: BarChart3 },
  ]},
  { group: 'Financeiro', items: [
    { id: 'op'  as ResOpPage, label: 'Operacional',      icon: DollarSign },
    { id: 'cc'  as ResOpPage, label: 'Centros de Custo', icon: PieChart },
    { id: 'nut' as ResOpPage, label: 'Nutrição',         icon: Wheat },
    { id: 'pat' as ResOpPage, label: 'Patrimônio',       icon: Landmark },
  ]},
];

const ResumoOperacionalPage = () => {
  const navigate = useNavigate();
  const now = new Date();

  const [page, setPage] = useState<ResOpPage>('dash');
  const [filtros, setFiltros] = useState<ResOpFilters>({
    ano: String(now.getFullYear()),
    mes: now.getMonth() === 0 ? 12 : now.getMonth(),
    visao: 'acumulado',
  });

  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();

  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const anoMes = `${filtros.ano}-${String(filtros.mes).padStart(2, '0')}`;
  const { status: pilares } = useStatusPilares(fazendaId, anoMes);

  const p1 = pilares.p1_mapa_pastos.status;
  const p2 = pilares.p2_valor_rebanho.status;
  const p3 = pilares.p3_financeiro_caixa.status;

  const alertas = [
    p1 !== 'oficial' && `P1 pasto: ${p1}`,
    p2 !== 'oficial' && `P2 valor rebanho: ${p2}`,
    p3 !== 'oficial' && `P3 financeiro: ${p3}`,
  ].filter(Boolean) as string[];

  const upd = useCallback((f: Partial<ResOpFilters>) => setFiltros(p => ({ ...p, ...f })), []);
  const mesLabel = MESES[filtros.mes - 1] || '';
  const anos = [
    String(now.getFullYear() - 1),
    String(now.getFullYear()),
    String(now.getFullYear() + 1),
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <aside className="w-52 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-border">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-3 w-3" /> Voltar ao app
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold">Agroinblue</span>
          </div>
          <p className="text-[9px] text-muted-foreground pl-4">Gestão Rural · Proto</p>
          <div className="mt-2 bg-muted/50 rounded px-2 py-1.5">
            <p className="text-[10.5px] font-medium truncate">{clienteAtual?.nome || ''}</p>
            <p className="text-[9px] text-muted-foreground">{filtros.ano} · {mesLabel}</p>
          </div>
        </div>

        <nav className="flex-1 py-1">
          {NAV.map(g => (
            <div key={g.group}>
              <p className="px-3 pt-3 pb-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">
                {g.group}
              </p>
              {g.items.map(item => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-[11.5px] border-l-2 transition-colors',
                      active
                        ? 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-foreground font-medium'
                        : 'border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', active && 'text-emerald-600')} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold">{PAGE_TITLES[page]}</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {clienteAtual?.nome} · {isGlobal ? 'Global' : fazendaAtual?.nome} ·{' '}
                {mesLabel}/{filtros.ano} ·{' '}
                {filtros.visao === 'acumulado' ? `Acumulado jan-${mesLabel}` : 'Mensal'}
              </p>
            </div>
            {!isGlobal && (
              <div className="flex items-center gap-1">
                <PilarPill status={p1} label="P1" />
                <PilarPill status={p2} label="P2" />
                <PilarPill status={p3} label="P3" />
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-border bg-background px-4 py-1 flex items-center gap-2 flex-shrink-0 flex-wrap text-[9px] text-muted-foreground font-medium">
          {fazendas.length > 1 && (
            <>
              <span>Fazenda</span>
              <FazendaSelector />
            </>
          )}
          <span className="ml-1">Ano</span>
          <Select value={filtros.ano} onValueChange={v => upd({ ano: v })}>
            <SelectTrigger className="h-6 w-16 text-[10px] px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>Mês</span>
          <Select value={String(filtros.mes)} onValueChange={v => upd({ mes: Number(v) })}>
            <SelectTrigger className="h-6 w-14 text-[10px] px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(['mensal', 'acumulado'] as const).map(v => (
            <button
              key={v}
              onClick={() => upd({ visao: v })}
              className={cn(
                'ml-1 text-[10px] px-2 py-0.5 rounded border font-medium transition-colors',
                filtros.visao === v
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {v === 'mensal' ? 'Mensal' : 'Acumulado'}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {alertas.length > 0 && !isGlobal && (
          <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-1 flex items-center gap-3 overflow-x-auto">
            <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 flex-shrink-0">
              Atenção
            </span>
            {alertas.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[9px] text-amber-700 dark:text-amber-400 flex-shrink-0">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                {a}
              </span>
            ))}
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {page === 'dash' && <ResOpDashboard filtros={filtros} />}
          {page === 'zoo'  && <ResOpZootecnico filtros={filtros} />}
          {page === 'mov'  && <ResOpMovimentacoes filtros={filtros} />}
          {page === 'prod' && <ResOpProducao filtros={filtros} />}
          {page === 'op'   && <ResOpOperacional filtros={filtros} />}
          {page === 'cc'   && <ResOpCentros filtros={filtros} />}
          {page === 'nut'  && <ResOpNutricao filtros={filtros} />}
          {page === 'pat'  && <ResOpPatrimonio filtros={filtros} />}
          {page === 'dev'  && <ResOpDesvios filtros={filtros} />}
          {page === 'aud'  && <ResOpAuditoria filtros={filtros} />}
        </div>
      </div>
    </div>
  );
};

function PilarPill({ status, label }: { status: string; label: string }) {
  const cfg = getPilarBadgeConfig(status as any);
  return (
    <span className={`text-[8.5px] font-semibold px-1.5 py-0.5 rounded border ${cfg.className}`}>
      {label} {status === 'oficial' ? '✓' : status === 'bloqueado' ? '✗' : '~'}
    </span>
  );
}

export default ResumoOperacionalPage;
