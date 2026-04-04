import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Clock, Circle, ArrowRight } from 'lucide-react';
import { useStatusFechamentosAno, type StatusMes } from '@/hooks/useStatusFechamentosAno';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  ano: string;
  onSelectMes?: (anoMes: string) => void;
}

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STATUS_CONFIG: Record<StatusMes, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  oficial: {
    label: 'Fechado',
    className: 'bg-emerald-600/15 text-emerald-700 border-emerald-600/30',
    icon: CheckCircle2,
  },
  provisorio: {
    label: 'Em andamento',
    className: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    icon: Clock,
  },
  bloqueado: {
    label: 'Com problema',
    className: 'bg-red-500/15 text-red-700 border-red-500/30',
    icon: AlertTriangle,
  },
  nao_iniciado: {
    label: 'Não iniciado',
    className: 'bg-muted text-muted-foreground border-border',
    icon: Circle,
  },
};

function getMonthPendencias(m: { status: StatusMes; motivo?: string; divergencias?: number; detalheFechados?: number; detalheTotal?: number }) {
  let criticas = 0;
  let medias = 0;
  if (m.status === 'bloqueado') {
    criticas++;
    if (m.divergencias && m.divergencias > 0) criticas++;
  }
  if (m.status === 'provisorio') {
    if (typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheFechados < m.detalheTotal) {
      medias++;
    }
  }
  return { criticas, medias, total: criticas + medias };
}

function getMonthTooltip(m: { status: StatusMes; motivo?: string; divergencias?: number; detalheFechados?: number; detalheTotal?: number }): string | null {
  const mesIdx = parseInt(m.mes ?? '0') - 1;
  if (m.status === 'oficial') return 'Mês fechado e conciliado';
  if (m.status === 'bloqueado') {
    if (m.motivo === 'divergencia_rebanho') return `Rebanho não bate com os pastos${m.divergencias ? ` (${m.divergencias} categoria${m.divergencias > 1 ? 's' : ''})` : ''}`;
    if (m.motivo === 'sem_pastos_fechados') return 'Pastos ainda não foram fechados';
    if (m.motivo) return m.motivo;
    return 'Problema identificado';
  }
  if (m.status === 'provisorio') {
    if (typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheTotal > 0) {
      return `${m.detalheFechados} de ${m.detalheTotal} pastos fechados`;
    }
    return 'Fechamento em andamento';
  }
  return null;
}

function friendlyMotivo(motivo: string | undefined): string {
  if (!motivo) return 'problema identificado';
  if (motivo === 'divergencia_rebanho') return 'rebanho não bate com os pastos';
  if (motivo === 'sem_pastos_fechados') return 'pastos ainda não foram fechados';
  if (motivo === 'sem_pastos_ativos') return 'nenhum pasto ativo encontrado';
  return motivo;
}

export function StatusFechamentosTab({ ano, onSelectMes }: Props) {
  const { fazendaAtual } = useFazenda();
  const { meses, loading } = useStatusFechamentosAno(fazendaAtual?.id, ano);

  // Current month for highlight
  const now = new Date();
  const mesAtualStr = String(now.getMonth() + 1).padStart(2, '0');
  const anoAtual = String(now.getFullYear());
  const isAnoAtual = ano === anoAtual;

  // Status pilares for the current selected month (use the "próximo pendente" or current month)
  const proximoPendente = useMemo(() => meses.find(m => m.status !== 'oficial') ?? null, [meses]);
  const mesFoco = proximoPendente?.mes ?? mesAtualStr;
  const anoMesFoco = `${ano}-${mesFoco}`;

  const { status: pilares, loading: loadingPilares } = useStatusPilares(fazendaAtual?.id, anoMesFoco);

  // Progress
  const totalFechados = useMemo(() => meses.filter(m => m.status === 'oficial').length, [meses]);
  const progressPct = meses.length > 0 ? Math.round((totalFechados / 12) * 100) : 0;

  const ultimoFechado = useMemo(() => {
    const fechados = meses.filter(m => m.status === 'oficial');
    return fechados.length ? fechados[fechados.length - 1] : null;
  }, [meses]);

  // Executive status for the focus month
  const mesFocoData = useMemo(() => meses.find(m => m.mes === mesFoco), [meses, mesFoco]);
  const executiveStatus = useMemo(() => {
    if (!mesFocoData) return { cor: 'muted' as const, label: 'Sem dados', sublabel: '' };
    const hasBloqueado = mesFocoData.status === 'bloqueado';
    const hasProvisorio = mesFocoData.status === 'provisorio';
    const isOficial = mesFocoData.status === 'oficial';

    if (isOficial) return { cor: 'green' as const, label: 'FECHADO', sublabel: 'Mês conciliado e aprovado' };
    if (hasBloqueado) {
      const pend = getMonthPendencias(mesFocoData);
      return {
        cor: 'red' as const,
        label: 'EM ABERTO',
        sublabel: `${pend.criticas > 0 ? `${pend.criticas} pendência${pend.criticas > 1 ? 's' : ''} crítica${pend.criticas > 1 ? 's' : ''}` : ''}${pend.criticas > 0 && pend.medias > 0 ? ' · ' : ''}${pend.medias > 0 ? `${pend.medias} pendência${pend.medias > 1 ? 's' : ''} média${pend.medias > 1 ? 's' : ''}` : ''}`,
      };
    }
    if (hasProvisorio) {
      const pend = getMonthPendencias(mesFocoData);
      return {
        cor: 'yellow' as const,
        label: 'EM ANDAMENTO',
        sublabel: pend.total > 0 ? `${pend.total} item${pend.total > 1 ? 'ns' : ''} pendente${pend.total > 1 ? 's' : ''}` : 'Fechamento parcial',
      };
    }
    return { cor: 'muted' as const, label: 'NÃO INICIADO', sublabel: 'Nenhum dado registrado' };
  }, [mesFocoData]);

  // Próxima ação text
  const proximaAcao = useMemo(() => {
    if (!mesFocoData) return null;
    if (mesFocoData.status === 'oficial') return null;
    if (mesFocoData.status === 'bloqueado') {
      if (mesFocoData.motivo === 'divergencia_rebanho') return 'Corrigir divergência de rebanho nos pastos';
      if (mesFocoData.motivo === 'sem_pastos_fechados') return 'Fechar os pastos do período';
      return 'Resolver pendências para fechar o mês';
    }
    if (mesFocoData.status === 'provisorio') {
      if (typeof mesFocoData.detalheFechados === 'number' && typeof mesFocoData.detalheTotal === 'number') {
        return `Fechar ${mesFocoData.detalheTotal - mesFocoData.detalheFechados} pasto${mesFocoData.detalheTotal - mesFocoData.detalheFechados > 1 ? 's' : ''} restante${mesFocoData.detalheTotal - mesFocoData.detalheFechados > 1 ? 's' : ''}`;
      }
      return 'Completar fechamento dos pastos';
    }
    return null;
  }, [mesFocoData]);

  // Ordem de fechamento steps
  const ordemFechamento = useMemo(() => {
    const p1 = pilares.p1_mapa_pastos;
    const p2 = pilares.p2_valor_rebanho;
    const p3 = pilares.p3_financeiro_caixa;
    const p5 = pilares.p5_economico_consolidado;

    const p1Detalhe = p1.detalhe as Record<string, unknown> | undefined;
    const hasDivergencia = p1.status === 'bloqueado' && p1Detalhe?.motivo === 'divergencia_rebanho';

    const steps = [
      { label: 'Pastos', done: p1.status === 'oficial' || (p1.status !== 'bloqueado' && !hasDivergencia && p1.status !== 'provisorio'), blocked: p1.status === 'bloqueado' && !hasDivergencia },
      { label: 'Rebanho', done: p1.status === 'oficial', blocked: hasDivergencia },
      { label: 'Valor do Gado', done: p2.status === 'oficial', blocked: p2.status === 'bloqueado' },
      { label: 'Financeiro', done: p3.status === 'oficial', blocked: p3.status === 'bloqueado' },
      { label: 'Resultado Final', done: p5.status === 'oficial', blocked: p5.status === 'bloqueado' },
    ];
    return steps;
  }, [pilares]);

  // Actions list
  const acoes = useMemo(() => {
    const items: { mes: string; texto: string; tipo: 'erro' | 'aviso' }[] = [];
    for (const m of meses) {
      const mesNome = MESES_COMPLETOS[parseInt(m.mes) - 1];
      if (m.status === 'bloqueado') {
        if (m.motivo === 'divergencia_rebanho') {
          items.push({ mes: m.mes, texto: `${mesNome} — corrigir divergência de rebanho${m.divergencias ? ` (${m.divergencias} categoria${m.divergencias > 1 ? 's' : ''})` : ''}`, tipo: 'erro' });
        } else if (m.motivo === 'sem_pastos_fechados') {
          items.push({ mes: m.mes, texto: `${mesNome} — fechar pastos do período`, tipo: 'erro' });
        } else if (m.motivo) {
          items.push({ mes: m.mes, texto: `${mesNome} — ${friendlyMotivo(m.motivo)}`, tipo: 'erro' });
        } else {
          items.push({ mes: m.mes, texto: `${mesNome} — resolver pendência`, tipo: 'erro' });
        }
      }
      if (m.status === 'provisorio' && typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheTotal > 0 && m.detalheFechados < m.detalheTotal) {
        const mesNome2 = MESES_COMPLETOS[parseInt(m.mes) - 1];
        items.push({ mes: m.mes, texto: `${mesNome2} — fechar ${m.detalheTotal - m.detalheFechados} pasto${m.detalheTotal - m.detalheFechados > 1 ? 's' : ''} restante${m.detalheTotal - m.detalheFechados > 1 ? 's' : ''}`, tipo: 'aviso' });
      }
    }
    return items;
  }, [meses]);

  const handleClickMes = (m: typeof meses[0]) => {
    const mesNome = MESES_COMPLETOS[parseInt(m.mes) - 1];
    if (m.status === 'bloqueado') {
      toast(`Indo para ${mesNome} — pendência: ${friendlyMotivo(m.motivo)}`, { icon: '🔴' });
    } else if (m.status === 'provisorio') {
      toast(`Indo para ${mesNome} — fechamento em andamento`, { icon: '🟡' });
    } else if (m.status === 'oficial') {
      toast(`Indo para ${mesNome} — mês fechado`, { icon: '🟢' });
    } else {
      toast(`Indo para ${mesNome}`, { icon: '📅' });
    }
    onSelectMes?.(`${ano}-${m.mes}`);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const corMap = {
    green: { bg: 'bg-emerald-600/10', border: 'border-emerald-600/40', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-700', dot: 'bg-red-500' },
    yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-700', dot: 'bg-amber-500' },
    muted: { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  };
  const cores = corMap[executiveStatus.cor];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 flex flex-col gap-4 h-full overflow-auto">

        {/* ── PROGRESSO ANUAL ── */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
            Progresso {ano}
          </span>
          <Progress value={progressPct} className="h-2.5 flex-1" />
          <span className="text-xs font-bold tabular-nums text-foreground whitespace-nowrap">
            {totalFechados}/12 meses
          </span>
        </div>

        {/* ── STATUS EXECUTIVO ── */}
        <Card className={cn('p-4 border-2', cores.bg, cores.border)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn('h-4 w-4 rounded-full flex-shrink-0', cores.dot)} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium">
                    {fazendaAtual?.nome} · {MESES_COMPLETOS[parseInt(mesFoco) - 1]} {ano}
                  </span>
                </div>
                <p className={cn('text-lg font-bold tracking-tight', cores.text)}>
                  {executiveStatus.label}
                </p>
                {executiveStatus.sublabel && (
                  <p className="text-xs text-muted-foreground mt-0.5">{executiveStatus.sublabel}</p>
                )}
              </div>
            </div>
            {proximaAcao && (
              <div className="flex items-center gap-2 bg-background rounded-md px-3 py-2 border text-xs">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <span className="text-muted-foreground font-medium">Próxima ação: </span>
                  <span className="font-semibold text-foreground">{proximaAcao}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── ORDEM DE FECHAMENTO ── */}
        {!loadingPilares && mesFocoData && mesFocoData.status !== 'oficial' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Ordem de Fechamento — {MESES_COMPLETOS[parseInt(mesFoco) - 1]}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {ordemFechamento.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground/40 text-xs">›</span>}
                  <div className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border',
                    step.done
                      ? 'bg-emerald-600/10 text-emerald-700 border-emerald-600/20'
                      : step.blocked
                        ? 'bg-red-500/10 text-red-700 border-red-500/20'
                        : 'bg-muted text-muted-foreground border-border',
                  )}>
                    {step.done ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : step.blocked ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {step.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GRID DE MESES ── */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {meses.map((m) => {
            const config = STATUS_CONFIG[m.status];
            const Icon = config.icon;
            const pend = getMonthPendencias(m);
            const isMesAtual = isAnoAtual && m.mes === mesAtualStr;
            const tooltipText = getMonthTooltip(m);

            const card = (
              <Card
                key={m.mes}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 p-3 cursor-pointer hover:shadow-md transition-shadow border',
                  m.status === 'oficial' && 'border-emerald-600/30 bg-emerald-600/5',
                  m.status === 'bloqueado' && 'border-red-500/30 bg-red-500/5',
                  m.status === 'provisorio' && 'border-amber-500/30 bg-amber-500/5',
                  isMesAtual && 'ring-2 ring-primary ring-offset-1',
                )}
                onClick={() => handleClickMes(m)}
              >
                <span className="text-xs font-bold text-foreground">
                  {MESES_NOMES[parseInt(m.mes) - 1]}
                </span>
                <Icon className={cn('h-4 w-4', {
                  'text-emerald-600': m.status === 'oficial',
                  'text-amber-600': m.status === 'provisorio',
                  'text-red-500': m.status === 'bloqueado',
                  'text-muted-foreground': m.status === 'nao_iniciado',
                })} />
                <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', config.className)}>
                  {config.label}
                </Badge>
                {pend.total > 0 && (
                  <span className="text-[9px] text-muted-foreground">
                    {pend.total} pendência{pend.total > 1 ? 's' : ''}
                  </span>
                )}
              </Card>
            );

            if (tooltipText) {
              return (
                <Tooltip key={m.mes}>
                  <TooltipTrigger asChild>{card}</TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return card;
          })}
        </div>

        {/* ── LISTA DE AÇÕES ── */}
        {acoes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Ações pendentes
            </span>
            {acoes.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity',
                  a.tipo === 'erro'
                    ? 'bg-red-500/10 text-red-700'
                    : 'bg-amber-500/10 text-amber-700',
                )}
                onClick={() => {
                  const mesNome = MESES_COMPLETOS[parseInt(a.mes) - 1];
                  toast(`Indo para ${mesNome}`, { icon: a.tipo === 'erro' ? '🔴' : '🟡' });
                  onSelectMes?.(`${ano}-${a.mes}`);
                }}
              >
                {a.tipo === 'erro' ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> : <Clock className="h-3.5 w-3.5 flex-shrink-0" />}
                {a.texto}
                <ArrowRight className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />
              </div>
            ))}
          </div>
        )}

        {/* Summary footer */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-auto pt-2 border-t">
          {ultimoFechado && (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Último fechado: <strong>{MESES_COMPLETOS[parseInt(ultimoFechado.mes) - 1]}</strong>
            </span>
          )}
          {proximoPendente && (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Próximo pendente: <strong>{MESES_COMPLETOS[parseInt(proximoPendente.mes) - 1]}</strong>
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
