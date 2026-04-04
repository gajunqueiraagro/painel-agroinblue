import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Clock, Circle, ArrowRight, ChevronRight, Info } from 'lucide-react';
import { useStatusFechamentosAno, type MesStatus, type StatusMes } from '@/hooks/useStatusFechamentosAno';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { cn } from '@/lib/utils';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pendencia } from '@/hooks/useStatusZootecnico';

interface Props {
  ano: string;
  mesSelecionado: number;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onSelectMes?: (anoMes: string, destino: string) => void;
}

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * ORDEM OFICIAL DOS PILARES (padronizada em todas as telas):
 *   1. Pastos
 *   2. Rebanho conciliado (categorias)
 *   3. Valor do rebanho
 *   4. Financeiro caixa (INFORMATIVO — não trava fechamento)
 *   5. Resultado final (DERIVADO dos operacionais)
 */
const LABEL_COMERCIAL: Record<string, string> = {
  pastos: 'Pastos',
  categorias: 'Rebanho conciliado',
  valor: 'Valor do rebanho',
  financeiro: 'Financeiro caixa',
  economico: 'Resultado final',
};

/** Blocos visuais da checklist */
const BLOCO_BASE = ['pastos', 'categorias', 'valor'];
const BLOCO_ACOMPANHAMENTO = ['financeiro'];
const BLOCO_SINTESE = ['economico'];

/** Navigation targets for each pillar */
const PILLAR_NAV: Record<string, string> = {
  pastos: 'fechamento',
  categorias: 'fechamento',
  valor: 'valor_rebanho',
  financeiro: 'fin_caixa',
  economico: 'zootecnico',
};

function getStatusLabel(status: StatusMes) {
  if (status === 'oficial') return 'Fechado';
  if (status === 'bloqueado') return 'Em aberto';
  if (status === 'provisorio') return 'Em andamento';
  return 'Não iniciado';
}

function monthTooltip(m: MesStatus): string {
  if (m.statusMes === 'oficial') return 'Mês fechado e validado';
  const pendente = m.pendencias.find((p) => p.status !== 'fechado' && !['financeiro', 'economico'].includes(p.id));
  if (pendente) return pendente.descricao;
  return 'Clique para analisar';
}

function buildAcaoTexto(mes: MesStatus, p: Pendencia) {
  const nomeMes = MESES_COMPLETOS[parseInt(mes.mes, 10) - 1];
  const label = LABEL_COMERCIAL[p.id] || p.label;
  if (p.status === 'fechado') return '';
  return `${nomeMes} — ${p.descricao || label}`;
}

/** Checklist step item component */
function ChecklistItem({
  label,
  status,
  isInformativo,
  onClick,
}: {
  label: string;
  status: string;
  isInformativo?: boolean;
  onClick?: () => void;
}) {
  const isDone = status === 'fechado';
  const isPartial = status === 'parcial';
  const isNotStarted = status === 'nao_iniciado';

  // Financial pending = yellow (informativo), not red
  const isPendingInformativo = isInformativo && !isDone;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium',
        onClick && 'cursor-pointer hover:bg-accent/50 transition-colors',
        isDone && 'text-emerald-700',
        !isDone && isInformativo && 'text-amber-600 bg-amber-500/5',
        isPartial && !isInformativo && 'text-amber-700 bg-amber-500/5',
        !isDone && !isPartial && !isNotStarted && !isInformativo && 'text-red-700 bg-red-500/5',
        isNotStarted && 'text-muted-foreground',
      )}
      onClick={onClick}
    >
      <span className="w-4 flex-shrink-0 flex items-center justify-center">
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : isPendingInformativo ? (
          <Info className="h-3.5 w-3.5 text-amber-500" />
        ) : isPartial ? (
          <Clock className="h-3.5 w-3.5 text-amber-600" />
        ) : isNotStarted ? (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        )}
      </span>
      <span className="flex-1">{label}</span>
      {onClick && <ChevronRight className="h-3 w-3 opacity-30 flex-shrink-0" />}
    </div>
  );
}

export function StatusFechamentosTab({ ano, mesSelecionado, lancamentos, saldosIniciais, onSelectMes }: Props) {
  const { fazendaAtual } = useFazenda();
  const { meses, loading } = useStatusFechamentosAno(fazendaAtual?.id, ano, lancamentos, saldosIniciais);

  // Local selected month (does NOT navigate)
  const [mesFocoLocal, setMesFocoLocal] = useState<number>(mesSelecionado);

  const mesFoco = String(mesFocoLocal).padStart(2, '0');
  const mesFocoData = useMemo(() => {
    return meses.find((m) => m.mes === mesFoco) ?? meses.find((m) => m.statusMes !== 'oficial') ?? meses[0] ?? null;
  }, [meses, mesFoco]);

  const totalFechados = useMemo(() => meses.filter((m) => m.statusMes === 'oficial').length, [meses]);
  const progressPct = meses.length > 0 ? Math.round((totalFechados / 12) * 100) : 0;

  const ultimoFechado = useMemo(() => {
    const fechados = meses.filter((m) => m.statusMes === 'oficial');
    return fechados.length ? fechados[fechados.length - 1] : null;
  }, [meses]);

  const proximoPendente = useMemo(() => meses.find((m) => m.statusMes !== 'oficial') ?? null, [meses]);

  // Executive card data
  const exec = useMemo(() => {
    if (!mesFocoData) {
      return { cor: 'muted' as const, label: 'Não iniciado', sub: 'Nenhuma etapa iniciada', obs: null as string | null, acao: null as string | null };
    }
    if (mesFocoData.statusMes === 'oficial') {
      // Check if financial is pending
      const finPend = mesFocoData.pendencias.find((p) => p.id === 'financeiro' && p.status !== 'fechado');
      return {
        cor: 'green' as const,
        label: 'Fechado',
        sub: 'Base operacional validada',
        obs: finPend ? 'Financeiro ainda pendente' : null,
        acao: null,
      };
    }
    if (mesFocoData.statusMes === 'bloqueado') {
      const primeira = mesFocoData.pendencias.find((p) => p.status === 'aberto' && !['financeiro', 'economico'].includes(p.id));
      return {
        cor: 'red' as const,
        label: 'Em aberto',
        sub: 'Pendências impedem o fechamento do mês',
        obs: null,
        acao: primeira?.descricao || 'Corrigir pendências do mês',
      };
    }
    if (mesFocoData.statusMes === 'provisorio') {
      const primeira = mesFocoData.pendencias.find((p) => p.status !== 'fechado' && !['financeiro', 'economico'].includes(p.id));
      return {
        cor: 'yellow' as const,
        label: 'Em andamento',
        sub: 'Fechamento parcial em andamento',
        obs: null,
        acao: primeira?.descricao || 'Concluir etapas pendentes',
      };
    }
    return {
      cor: 'muted' as const,
      label: 'Não iniciado',
      sub: 'Nenhuma etapa iniciada',
      obs: null,
      acao: 'Iniciar fechamento do mês',
    };
  }, [mesFocoData]);

  // Build checklist blocks from pendencias
  const buildBlock = (ids: string[], isInformativo = false) => {
    if (!mesFocoData?.pendencias) return [];
    return ids.map((id) => {
      const p = mesFocoData.pendencias.find((x) => x.id === id);
      const isNotStarted = mesFocoData.statusMes === 'nao_iniciado';
      return {
        id,
        label: LABEL_COMERCIAL[id] || id,
        status: isNotStarted ? 'nao_iniciado' : (p?.status || 'aberto'),
        isInformativo,
        resolverTab: PILLAR_NAV[id],
      };
    });
  };

  const blocoBase = useMemo(() => buildBlock(BLOCO_BASE), [mesFocoData]);
  const blocoAcomp = useMemo(() => buildBlock(BLOCO_ACOMPANHAMENTO, true), [mesFocoData]);
  const blocoSintese = useMemo(() => buildBlock(BLOCO_SINTESE), [mesFocoData]);

  // Pending actions across all months (only operational pillars, max 5)
  const acoesPendentes = useMemo(() => {
    const prioridade: Record<string, number> = { pastos: 0, categorias: 1, valor: 2, financeiro: 3, economico: 4 };
    return meses
      .flatMap((mes) =>
        mes.pendencias
          .filter((p) => p.status !== 'fechado')
          .map((p) => ({
            mes: mes.mes,
            statusMes: mes.statusMes,
            pilarId: p.id,
            isInformativo: p.id === 'financeiro' || p.id === 'economico',
            tipo: p.id === 'financeiro' ? ('info' as const) : p.status === 'aberto' ? ('erro' as const) : ('aviso' as const),
            texto: buildAcaoTexto(mes, p),
            prioridade: (p.id === 'financeiro' ? 2 : p.status === 'aberto' ? 0 : 1) * 10 + (prioridade[p.id] ?? 9),
            resolverTab: PILLAR_NAV[p.id],
          })),
      )
      .filter((a) => a.texto)
      .sort((a, b) => a.prioridade - b.prioridade || Number(a.mes) - Number(b.mes))
      .slice(0, 5);
  }, [meses]);

  /** Click on month card = update context only (NO navigation) */
  const handleClickMes = (mes: { mes: string }) => {
    setMesFocoLocal(parseInt(mes.mes, 10));
  };

  /** Click on pendency = navigate to resolver tab */
  const handleClickPendencia = (anoMes: string, destino: string) => {
    onSelectMes?.(anoMes, destino);
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
        {/* Row 1: Executive card + Progress */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2.5">
          <Card className={cn('px-4 py-3 border-2 flex items-center gap-3', c.bg, c.border)}>
            <div className={cn('h-3.5 w-3.5 rounded-full flex-shrink-0', c.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">
                {fazendaAtual?.nome} · {mesFocoData ? MESES_COMPLETOS[parseInt(mesFocoData.mes, 10) - 1] : MESES_COMPLETOS[mesFocoLocal - 1]} {ano}
              </p>
              <p className={cn('text-base font-bold leading-tight', c.text)}>{exec.label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{exec.sub}</p>
              {exec.obs && (
                <p className="text-[10px] text-amber-600 leading-snug mt-0.5 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {exec.obs}
                </p>
              )}
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

        {/* Row 2: Checklist + Month grid */}
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-2.5">
          <Card className="px-3 py-2.5 flex flex-col gap-2">
            {/* Block 1: Base operacional (defines month status) */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Base operacional
              </span>
              {blocoBase.map((step) => (
                <ChecklistItem
                  key={step.id}
                  label={step.label}
                  status={step.status}
                  onClick={step.resolverTab && step.status !== 'nao_iniciado'
                    ? () => handleClickPendencia(`${ano}-${mesFoco}`, step.resolverTab!)
                    : undefined}
                />
              ))}
            </div>

            {/* Separator */}
            <div className="border-t border-border/50" />

            {/* Block 2: Acompanhamento (informativo) */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Acompanhamento
              </span>
              {blocoAcomp.map((step) => (
                <ChecklistItem
                  key={step.id}
                  label={step.label}
                  status={step.status}
                  isInformativo
                  onClick={step.resolverTab && step.status !== 'nao_iniciado'
                    ? () => handleClickPendencia(`${ano}-${mesFoco}`, step.resolverTab!)
                    : undefined}
                />
              ))}
            </div>

            {/* Separator */}
            <div className="border-t border-border/50" />

            {/* Block 3: Síntese */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Síntese
              </span>
              {blocoSintese.map((step) => (
                <ChecklistItem
                  key={step.id}
                  label={step.label}
                  status={step.status}
                />
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 gap-1.5">
            {meses.map((mes) => {
              const isSelecionado = parseInt(mes.mes, 10) === mesFocoLocal;
              const pendencias = mes.pendencias.filter((p) => p.status !== 'fechado' && !['financeiro', 'economico'].includes(p.id)).length;
              const statusLabel = getStatusLabel(mes.statusMes);
              const isOficial = mes.statusMes === 'oficial';
              const isBloqueado = mes.statusMes === 'bloqueado';
              const isProvisorio = mes.statusMes === 'provisorio';
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
                  onClick={() => handleClickMes(mes)}
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

        {/* Row 3: Pending actions */}
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
                  acao.tipo === 'erro' ? 'bg-red-500/8 text-red-700' :
                  acao.tipo === 'info' ? 'bg-amber-500/8 text-amber-600' :
                  'bg-amber-500/8 text-amber-700',
                )}
                onClick={() => acao.resolverTab && handleClickPendencia(`${ano}-${acao.mes}`, acao.resolverTab)}
              >
                {acao.tipo === 'erro' ? <AlertTriangle className="h-3 w-3 flex-shrink-0" /> :
                 acao.tipo === 'info' ? <Info className="h-3 w-3 flex-shrink-0" /> :
                 <Clock className="h-3 w-3 flex-shrink-0" />}
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
