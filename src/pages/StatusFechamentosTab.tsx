import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Clock, Circle, ArrowRight, ChevronRight } from 'lucide-react';
import { useStatusFechamentosAno, type StatusMes } from '@/hooks/useStatusFechamentosAno';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  ano: string;
  onSelectMes?: (anoMes: string, destino?: 'resumo' | 'painel_consultor') => void;
}

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/* ── helpers ── */

function friendlyMotivo(motivo: string | undefined): string {
  if (!motivo) return 'problema identificado';
  if (motivo === 'divergencia_rebanho') return 'rebanho não bate com os pastos';
  if (motivo === 'sem_pastos_fechados') return 'pastos ainda não foram fechados';
  if (motivo === 'sem_pastos_ativos') return 'nenhum pasto ativo encontrado';
  return motivo;
}

function friendlyMotivoAcao(motivo: string | undefined): string {
  if (!motivo) return 'resolver pendência';
  if (motivo === 'divergencia_rebanho') return 'corrigir divergência de rebanho';
  if (motivo === 'sem_pastos_fechados') return 'fechar pastos do período';
  if (motivo === 'sem_pastos_ativos') return 'cadastrar pastos ativos';
  return motivo;
}

function countPendencias(m: { status: StatusMes; divergencias?: number; detalheFechados?: number; detalheTotal?: number }) {
  let n = 0;
  if (m.status === 'bloqueado') n++;
  if (m.status === 'provisorio' && typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheFechados < m.detalheTotal) n++;
  if (m.divergencias && m.divergencias > 0) n++;
  return n;
}

function monthTooltip(m: { status: StatusMes; motivo?: string; divergencias?: number; detalheFechados?: number; detalheTotal?: number }): string | null {
  if (m.status === 'oficial') return 'Mês fechado e conciliado';
  if (m.status === 'bloqueado') {
    if (m.motivo === 'divergencia_rebanho') return `Rebanho não bate com os pastos${m.divergencias ? ` (${m.divergencias} cat.)` : ''}`;
    if (m.motivo === 'sem_pastos_fechados') return 'Pastos ainda não foram fechados';
    if (m.motivo) return friendlyMotivo(m.motivo);
    return 'Problema identificado';
  }
  if (m.status === 'provisorio') {
    if (typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheTotal > 0)
      return `${m.detalheFechados} de ${m.detalheTotal} pastos fechados`;
    return 'Fechamento em andamento';
  }
  return null;
}

/* ── component ── */

export function StatusFechamentosTab({ ano, onSelectMes }: Props) {
  const { fazendaAtual } = useFazenda();
  const { meses, loading } = useStatusFechamentosAno(fazendaAtual?.id, ano);

  const now = new Date();
  const mesAtualStr = String(now.getMonth() + 1).padStart(2, '0');
  const isAnoAtual = ano === String(now.getFullYear());

  const proximoPendente = useMemo(() => meses.find(m => m.status !== 'oficial') ?? null, [meses]);
  const mesFoco = proximoPendente?.mes ?? mesAtualStr;
  const anoMesFoco = `${ano}-${mesFoco}`;

  const { status: pilares, loading: loadingPilares } = useStatusPilares(fazendaAtual?.id, anoMesFoco);

  const totalFechados = useMemo(() => meses.filter(m => m.status === 'oficial').length, [meses]);
  const progressPct = meses.length > 0 ? Math.round((totalFechados / 12) * 100) : 0;

  const ultimoFechado = useMemo(() => {
    const f = meses.filter(m => m.status === 'oficial');
    return f.length ? f[f.length - 1] : null;
  }, [meses]);

  const mesFocoData = useMemo(() => meses.find(m => m.mes === mesFoco), [meses, mesFoco]);

  /* executive status */
  const exec = useMemo(() => {
    if (!mesFocoData || mesFocoData.status === 'nao_iniciado')
      return { cor: 'muted' as const, label: 'Não iniciado', sub: 'Nenhum dado registrado', acao: null };
    if (mesFocoData.status === 'oficial')
      return { cor: 'green' as const, label: 'Fechado', sub: 'Mês conciliado e validado', acao: null };
    if (mesFocoData.status === 'bloqueado') {
      const p = countPendencias(mesFocoData);
      return {
        cor: 'red' as const,
        label: 'Em aberto',
        sub: `${p} pendência${p > 1 ? 's' : ''} crítica${p > 1 ? 's' : ''}`,
        acao: friendlyMotivoAcao(mesFocoData.motivo),
      };
    }
    // provisorio
    const p = countPendencias(mesFocoData);
    return {
      cor: 'yellow' as const,
      label: 'Em andamento',
      sub: p > 0 ? `Fechamento parcial — ${p} item${p > 1 ? 'ns' : ''} pendente${p > 1 ? 's' : ''}` : 'Fechamento parcial em andamento',
      acao: typeof mesFocoData.detalheFechados === 'number' && typeof mesFocoData.detalheTotal === 'number'
        ? `Fechar ${mesFocoData.detalheTotal - mesFocoData.detalheFechados} pasto${mesFocoData.detalheTotal - mesFocoData.detalheFechados > 1 ? 's' : ''} restante${mesFocoData.detalheTotal - mesFocoData.detalheFechados > 1 ? 's' : ''}`
        : 'Completar fechamento dos pastos',
    };
  }, [mesFocoData]);

  /* ordem de fechamento */
  const ordemSteps = useMemo(() => {
    const p1 = pilares.p1_mapa_pastos;
    const p2 = pilares.p2_valor_rebanho;
    const p3 = pilares.p3_financeiro_caixa;
    const p5 = pilares.p5_economico_consolidado;
    const p1d = p1.detalhe as Record<string, unknown> | undefined;
    const hasDiverg = p1.status === 'bloqueado' && p1d?.motivo === 'divergencia_rebanho';

    return [
      { label: 'Pastos', done: p1.status === 'oficial' || (!hasDiverg && p1.status !== 'bloqueado' && p1.status !== 'provisorio'), blocked: p1.status === 'bloqueado' && !hasDiverg },
      { label: 'Rebanho', done: p1.status === 'oficial', blocked: hasDiverg },
      { label: 'Valor do Gado', done: p2.status === 'oficial', blocked: p2.status === 'bloqueado' },
      { label: 'Financeiro', done: p3.status === 'oficial', blocked: p3.status === 'bloqueado' },
      { label: 'Resultado Final', done: p5.status === 'oficial', blocked: p5.status === 'bloqueado' },
    ];
  }, [pilares]);

  /* ações pendentes (max 5) */
  const acoes = useMemo(() => {
    const items: { mes: string; texto: string; tipo: 'erro' | 'aviso' }[] = [];
    for (const m of meses) {
      if (items.length >= 5) break;
      const nome = MESES_COMPLETOS[parseInt(m.mes) - 1];
      if (m.status === 'bloqueado') {
        items.push({
          mes: m.mes,
          texto: `${nome} — ${friendlyMotivoAcao(m.motivo)}${m.divergencias ? ` (${m.divergencias} categoria${m.divergencias > 1 ? 's' : ''})` : ''}`,
          tipo: 'erro',
        });
      } else if (m.status === 'provisorio' && typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheFechados < m.detalheTotal) {
        const rest = m.detalheTotal - m.detalheFechados;
        items.push({
          mes: m.mes,
          texto: `${nome} — fechar ${rest} pasto${rest > 1 ? 's' : ''} restante${rest > 1 ? 's' : ''}`,
          tipo: 'aviso',
        });
      }
    }
    return items;
  }, [meses]);

  const handleClickMes = (m: typeof meses[0]) => {
    const nome = MESES_COMPLETOS[parseInt(m.mes) - 1];
    const msgs: Record<StatusMes, string> = {
      bloqueado: `${nome} selecionado — ${friendlyMotivo(m.motivo)}`,
      provisorio: `${nome} selecionado — fechamento em andamento`,
      oficial: `${nome} selecionado — mês fechado`,
      nao_iniciado: `${nome} selecionado`,
    };
    toast(msgs[m.status]);
    onSelectMes?.(`${ano}-${m.mes}`);
  };

  /* ── loading ── */
  if (loading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const corMap = {
    green:  { bg: 'bg-emerald-600/10', border: 'border-emerald-600/40', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    red:    { bg: 'bg-red-500/10',      border: 'border-red-500/40',     text: 'text-red-700',     dot: 'bg-red-500' },
    yellow: { bg: 'bg-amber-500/10',    border: 'border-amber-500/40',   text: 'text-amber-700',   dot: 'bg-amber-500' },
    muted:  { bg: 'bg-muted',           border: 'border-border',         text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  };
  const c = corMap[exec.cor];

  const showOrdem = !loadingPilares && mesFocoData && mesFocoData.status !== 'oficial' && mesFocoData.status !== 'nao_iniciado';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-3 flex flex-col gap-2.5 h-full">

        {/* ═══ LINHA 1: Status + Próxima ação + Progresso ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5">
          {/* Card executivo */}
          <Card className={cn('px-4 py-3 border-2 flex items-center gap-3', c.bg, c.border)}>
            <div className={cn('h-3.5 w-3.5 rounded-full flex-shrink-0', c.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">
                {fazendaAtual?.nome} · {MESES_COMPLETOS[parseInt(mesFoco) - 1]} {ano}
              </p>
              <p className={cn('text-base font-bold leading-tight', c.text)}>{exec.label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{exec.sub}</p>
            </div>
            {exec.acao && (
              <div className="hidden sm:flex items-center gap-1.5 bg-background border rounded px-2.5 py-1.5 text-[11px] max-w-[260px]">
                <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="truncate">
                  <span className="text-muted-foreground">Próxima ação: </span>
                  <span className="font-semibold text-foreground">{exec.acao}</span>
                </span>
              </div>
            )}
          </Card>

          {/* Progresso anual */}
          <Card className="px-4 py-3 flex flex-col justify-center gap-1 min-w-[180px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Progresso {ano}</span>
              <span className="text-xs font-bold tabular-nums text-foreground">{totalFechados}/12</span>
            </div>
            <Progress value={progressPct} className="h-2" />
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
              {ultimoFechado && (
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Último: {MESES_NOMES[parseInt(ultimoFechado.mes) - 1]}
                </span>
              )}
              {proximoPendente && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  Próximo: {MESES_NOMES[parseInt(proximoPendente.mes) - 1]}
                </span>
              )}
            </div>
          </Card>
        </div>

        {/* ═══ LINHA 2: Ordem de fechamento + Grid de meses ═══ */}
        <div className={cn('grid gap-2.5', showOrdem ? 'grid-cols-1 md:grid-cols-[220px_1fr]' : 'grid-cols-1')}>
          {/* Ordem de fechamento */}
          {showOrdem && (
            <Card className="px-3 py-2.5 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Ordem de fechamento
              </span>
              <div className="flex flex-col gap-1">
                {ordemSteps.map((step, i) => (
                  <div key={step.label} className={cn(
                    'flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium',
                    step.done
                      ? 'text-emerald-700'
                      : step.blocked
                        ? 'text-red-700 bg-red-500/5'
                        : 'text-muted-foreground',
                  )}>
                    <span className="w-4 flex-shrink-0 flex items-center justify-center">
                      {step.done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : step.blocked ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </span>
                    <span className={cn(step.done && 'line-through opacity-60')}>{step.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Grid de meses */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 gap-1.5">
            {meses.map((m) => {
              const isOficial = m.status === 'oficial';
              const isBloqueado = m.status === 'bloqueado';
              const isProvisorio = m.status === 'provisorio';
              const isMesAtual = isAnoAtual && m.mes === mesAtualStr;
              const pend = countPendencias(m);
              const tip = monthTooltip(m);

              const statusLabel = isOficial ? 'Fechado' : isBloqueado ? 'Com problema' : isProvisorio ? 'Em andamento' : 'Não iniciado';
              const statusColor = isOficial ? 'text-emerald-600' : isBloqueado ? 'text-red-600' : isProvisorio ? 'text-amber-600' : 'text-muted-foreground';
              const Icon = isOficial ? CheckCircle2 : isBloqueado ? AlertTriangle : isProvisorio ? Clock : Circle;

              const card = (
                <Card
                  key={m.mes}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 cursor-pointer hover:shadow-md transition-shadow border',
                    isOficial && 'border-emerald-600/25 bg-emerald-600/5',
                    isBloqueado && 'border-red-500/25 bg-red-500/5',
                    isProvisorio && 'border-amber-500/25 bg-amber-500/5',
                    isMesAtual && 'ring-2 ring-primary ring-offset-1',
                  )}
                  onClick={() => handleClickMes(m)}
                >
                  <span className="text-[11px] font-bold text-foreground leading-none">
                    {MESES_NOMES[parseInt(m.mes) - 1]}
                  </span>
                  <Icon className={cn('h-3.5 w-3.5 mt-0.5', statusColor)} />
                  <span className={cn('text-[8px] font-semibold leading-none mt-0.5', statusColor)}>
                    {statusLabel}
                  </span>
                  {pend > 0 && (
                    <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
                      {pend} pend.
                    </span>
                  )}
                </Card>
              );

              return tip ? (
                <Tooltip key={m.mes}>
                  <TooltipTrigger asChild>{card}</TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] max-w-[200px]">{tip}</TooltipContent>
                </Tooltip>
              ) : card;
            })}
          </div>
        </div>

        {/* ═══ LINHA 3: Ações pendentes ═══ */}
        {acoes.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              O que falta fazer
            </span>
            {acoes.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity',
                  a.tipo === 'erro' ? 'bg-red-500/8 text-red-700' : 'bg-amber-500/8 text-amber-700',
                )}
                onClick={() => {
                  const nome = MESES_COMPLETOS[parseInt(a.mes) - 1];
                  toast(`${nome} selecionado`);
                  onSelectMes?.(`${ano}-${a.mes}`);
                }}
              >
                {a.tipo === 'erro' ? <AlertTriangle className="h-3 w-3 flex-shrink-0" /> : <Clock className="h-3 w-3 flex-shrink-0" />}
                <span className="flex-1 truncate">{a.texto}</span>
                <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
