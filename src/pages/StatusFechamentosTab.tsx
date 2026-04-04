import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Clock, Circle, ArrowRight, ChevronRight } from 'lucide-react';
import { useStatusFechamentosAno, type MesAcao, type MesStatus, type StatusMes } from '@/hooks/useStatusFechamentosAno';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { StatusCor } from '@/lib/calculos/statusMensal';

interface Props {
  ano: string;
  mesSelecionado: number;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onSelectMes?: (anoMes: string, destino?: 'zootecnico') => void;
}

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type OrdemStatus = StatusCor | 'nao_iniciado';

function getStatusLabel(status: StatusMes) {
  if (status === 'oficial') return 'Fechado';
  if (status === 'bloqueado') return 'Em aberto';
  if (status === 'provisorio') return 'Em andamento';
  return 'Não iniciado';
}

function countPendencias(m: MesStatus) {
  return m.acoes?.length ?? ((m.contadores?.aberto || 0) + (m.contadores?.parcial || 0));
}

function monthTooltip(m: MesStatus): string {
  if (m.status === 'oficial') return 'Mês fechado e validado';
  if (m.motivo === 'divergencia_rebanho') {
    return `Rebanho não bate com os pastos${m.divergencias ? ` (${m.divergencias} categoria${m.divergencias > 1 ? 's' : ''})` : ''}`;
  }
  if (m.motivo === 'sem_pastos_fechados' || m.motivo === 'pastos_pendentes') {
    if (typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheTotal > 0) {
      return `${m.detalheFechados} de ${m.detalheTotal} pastos fechados`;
    }
    return 'Pastos pendentes';
  }
  if (m.motivo === 'valor_rebanho_pendente') return 'Valor do rebanho pendente';
  if (m.motivo === 'financeiro_pendente') return 'Financeiro caixa pendente';
  if (m.motivo === 'resultado_pendente') return 'Resultado final pendente';
  return m.proximaAcao || (m.status === 'nao_iniciado' ? 'Nenhuma etapa iniciada' : 'Abrir status do mês');
}

function buildAcaoTexto(mes: MesStatus, acao: MesAcao) {
  const nomeMes = MESES_COMPLETOS[parseInt(mes.mes, 10) - 1];

  if (acao.id === 'categorias') {
    if (mes.divergencias && mes.divergencias > 0) {
      return `${nomeMes} — corrigir divergência de rebanho (${mes.divergencias} categoria${mes.divergencias > 1 ? 's' : ''})`;
    }
    return `${nomeMes} — conciliar rebanho do mês`;
  }

  if (acao.id === 'pastos') {
    const restantes = Math.max((mes.detalheTotal || 0) - (mes.detalheFechados || 0), 0);
    return restantes > 0
      ? `${nomeMes} — fechar ${restantes} pasto${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}`
      : `${nomeMes} — fechar pastos do período`;
  }

  if (acao.id === 'valor') return `${nomeMes} — informar valor do rebanho`;
  if (acao.id === 'financeiro') return `${nomeMes} — finalizar financeiro caixa`;
  if (acao.id === 'economico') return `${nomeMes} — concluir resultado final`;
  return `${nomeMes} — ${acao.descricao}`;
}

export function StatusFechamentosTab({ ano, mesSelecionado, lancamentos, saldosIniciais, onSelectMes }: Props) {
  const { fazendaAtual } = useFazenda();
  const { meses, loading } = useStatusFechamentosAno(fazendaAtual?.id, ano, lancamentos, saldosIniciais);

  const mesFoco = String(mesSelecionado).padStart(2, '0');
  const mesFocoData = useMemo(() => {
    return meses.find((m) => m.mes === mesFoco) ?? meses.find((m) => m.status !== 'oficial') ?? meses[0] ?? null;
  }, [meses, mesFoco]);

  const totalFechados = useMemo(() => meses.filter((m) => m.status === 'oficial').length, [meses]);
  const progressPct = meses.length > 0 ? Math.round((totalFechados / 12) * 100) : 0;

  const ultimoFechado = useMemo(() => {
    const fechados = meses.filter((m) => m.status === 'oficial');
    return fechados.length ? fechados[fechados.length - 1] : null;
  }, [meses]);

  const proximoPendente = useMemo(() => meses.find((m) => m.status !== 'oficial') ?? null, [meses]);

  const exec = useMemo(() => {
    if (!mesFocoData) {
      return {
        cor: 'muted' as const,
        label: 'Não iniciado',
        sub: 'Nenhuma etapa iniciada',
        acao: null as string | null,
      };
    }

    if (mesFocoData.status === 'oficial') {
      return { cor: 'green' as const, label: 'Fechado', sub: 'Mês conciliado e validado', acao: null };
    }
    if (mesFocoData.status === 'bloqueado') {
      return {
        cor: 'red' as const,
        label: 'Em aberto',
        sub: 'Pendências impedem o fechamento do mês',
        acao: mesFocoData.proximaAcao || 'Corrigir pendências do mês',
      };
    }
    if (mesFocoData.status === 'provisorio') {
      return {
        cor: 'yellow' as const,
        label: 'Em andamento',
        sub: 'Fechamento parcial em andamento',
        acao: mesFocoData.proximaAcao || 'Concluir etapas pendentes',
      };
    }
    return {
      cor: 'muted' as const,
      label: 'Não iniciado',
      sub: 'Nenhuma etapa iniciada',
      acao: mesFocoData.proximaAcao || 'Iniciar fechamento do mês',
    };
  }, [mesFocoData]);

  const ordemSteps = useMemo(() => {
    if (!mesFocoData?.etapas) return [] as Array<{ label: string; status: OrdemStatus }>;
    const notStarted = mesFocoData.status === 'nao_iniciado';
    const mapStatus = (status: StatusCor): OrdemStatus => (notStarted ? 'nao_iniciado' : status);

    return [
      { label: 'Pastos', status: mapStatus(mesFocoData.etapas.pastos) },
      { label: 'Rebanho conciliado', status: mapStatus(mesFocoData.etapas.categorias) },
      { label: 'Valor do rebanho', status: mapStatus(mesFocoData.etapas.valor) },
      { label: 'Financeiro caixa', status: mapStatus(mesFocoData.etapas.financeiro) },
      { label: 'Resultado final', status: mapStatus(mesFocoData.etapas.economico) },
    ];
  }, [mesFocoData]);

  const acoesPendentes = useMemo(() => {
    const prioridadeAcao: Record<MesAcao['id'], number> = {
      categorias: 0,
      pastos: 1,
      valor: 2,
      financeiro: 3,
      economico: 4,
    };

    return meses
      .flatMap((mes) =>
        (mes.acoes || []).map((acao) => ({
          mes: mes.mes,
          statusMes: mes.status,
          tipo: acao.status === 'aberto' ? 'erro' as const : 'aviso' as const,
          texto: buildAcaoTexto(mes, acao),
          prioridade: (acao.status === 'aberto' ? 0 : 1) * 10 + prioridadeAcao[acao.id],
        })),
      )
      .sort((a, b) => a.prioridade - b.prioridade || Number(a.mes) - Number(b.mes))
      .slice(0, 5);
  }, [meses]);

  const handleOpenMes = (mes: MesStatus) => {
    const nomeMes = MESES_COMPLETOS[parseInt(mes.mes, 10) - 1];
    toast(`${nomeMes} aberto no fechamento`);
    onSelectMes?.(`${ano}-${mes.mes}`, 'zootecnico');
  };

  if (loading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-16 rounded-lg" />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
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
  const c = corMap[exec.cor];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-3 flex flex-col gap-2.5 h-full">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2.5">
          <Card className={cn('px-4 py-3 border-2 flex items-center gap-3', c.bg, c.border)}>
            <div className={cn('h-3.5 w-3.5 rounded-full flex-shrink-0', c.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">
                {fazendaAtual?.nome} · {mesFocoData ? MESES_COMPLETOS[parseInt(mesFocoData.mes, 10) - 1] : MESES_COMPLETOS[mesSelecionado - 1]} {ano}
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
                  Último: {MESES_NOMES[parseInt(ultimoFechado.mes, 10) - 1]}
                </span>
              )}
              {proximoPendente && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  Próximo: {MESES_NOMES[parseInt(proximoPendente.mes, 10) - 1]}
                </span>
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-2.5">
          <Card className="px-3 py-2.5 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Ordem de fechamento
            </span>
            <div className="flex flex-col gap-1">
              {ordemSteps.map((step) => {
                const isDone = step.status === 'fechado';
                const isPartial = step.status === 'parcial';
                const isNotStarted = step.status === 'nao_iniciado';
                return (
                  <div
                    key={step.label}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium',
                      isDone && 'text-emerald-700',
                      isPartial && 'text-amber-700 bg-amber-500/5',
                      !isDone && !isPartial && !isNotStarted && 'text-red-700 bg-red-500/5',
                      isNotStarted && 'text-muted-foreground',
                    )}
                  >
                    <span className="w-4 flex-shrink-0 flex items-center justify-center">
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : isPartial ? (
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                      ) : isNotStarted ? (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 gap-1.5">
            {meses.map((mes) => {
              const isSelecionado = parseInt(mes.mes, 10) === mesSelecionado;
              const pendencias = countPendencias(mes);
              const statusLabel = getStatusLabel(mes.status);
              const isOficial = mes.status === 'oficial';
              const isBloqueado = mes.status === 'bloqueado';
              const isProvisorio = mes.status === 'provisorio';
              const Icon = isOficial ? CheckCircle2 : isBloqueado ? AlertTriangle : isProvisorio ? Clock : Circle;
              const statusColor = isOficial
                ? 'text-emerald-600'
                : isBloqueado
                  ? 'text-red-600'
                  : isProvisorio
                    ? 'text-amber-600'
                    : 'text-muted-foreground';

              const card = (
                <Card
                  key={mes.mes}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 cursor-pointer hover:shadow-md transition-shadow border h-[82px]',
                    isOficial && 'border-emerald-600/25 bg-emerald-600/5',
                    isBloqueado && 'border-red-500/25 bg-red-500/5',
                    isProvisorio && 'border-amber-500/25 bg-amber-500/5',
                    isSelecionado && 'ring-2 ring-primary ring-offset-1',
                  )}
                  onClick={() => handleOpenMes(mes)}
                >
                  <span className="text-[11px] font-bold text-foreground leading-none">
                    {MESES_NOMES[parseInt(mes.mes, 10) - 1]}
                  </span>
                  <Icon className={cn('h-3.5 w-3.5 mt-0.5', statusColor)} />
                  <span className={cn('text-[8px] font-semibold leading-none mt-0.5', statusColor)}>
                    {statusLabel}
                  </span>
                  {pendencias > 0 && (
                    <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
                      {pendencias} pend.
                    </span>
                  )}
                </Card>
              );

              return (
                <Tooltip key={mes.mes}>
                  <TooltipTrigger asChild>{card}</TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] max-w-[220px]">
                    {monthTooltip(mes)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {acoesPendentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              O que falta fazer
            </span>
            {acoesPendentes.map((acao, index) => (
              <div
                key={`${acao.mes}-${index}`}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity',
                  acao.tipo === 'erro' ? 'bg-red-500/8 text-red-700' : 'bg-amber-500/8 text-amber-700',
                )}
                onClick={() => handleOpenMes({ mes: acao.mes, status: acao.statusMes })}
              >
                {acao.tipo === 'erro' ? <AlertTriangle className="h-3 w-3 flex-shrink-0" /> : <Clock className="h-3 w-3 flex-shrink-0" />}
                <span className="flex-1 truncate">{acao.texto}</span>
                <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
