import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Clock, Circle } from 'lucide-react';
import { useStatusFechamentosAno, type StatusMes } from '@/hooks/useStatusFechamentosAno';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { cn } from '@/lib/utils';

interface Props {
  ano: string;
  onSelectMes?: (anoMes: string) => void;
}

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

export function StatusFechamentosTab({ ano, onSelectMes }: Props) {
  const { fazendaAtual } = useFazenda();
  const { meses, loading } = useStatusFechamentosAno(fazendaAtual?.id, ano);

  const ultimoFechado = useMemo(() => {
    const fechados = meses.filter(m => m.status === 'oficial');
    if (!fechados.length) return null;
    return fechados[fechados.length - 1];
  }, [meses]);

  const proximoPendente = useMemo(() => {
    return meses.find(m => m.status !== 'oficial') ?? null;
  }, [meses]);

  const alertas = useMemo(() => {
    const items: { mes: string; texto: string; tipo: 'erro' | 'aviso' }[] = [];
    for (const m of meses) {
      if (m.status === 'bloqueado') {
        const mesNome = MESES_NOMES[parseInt(m.mes) - 1];
        if (m.motivo === 'divergencia_rebanho') {
          items.push({ mes: m.mes, texto: `${mesNome} com divergência no rebanho${m.divergencias ? ` (${m.divergencias} categoria${m.divergencias > 1 ? 's' : ''})` : ''}`, tipo: 'erro' });
        } else if (m.motivo === 'sem_pastos_fechados') {
          items.push({ mes: m.mes, texto: `${mesNome} sem pastos fechados`, tipo: 'erro' });
        } else if (m.motivo) {
          items.push({ mes: m.mes, texto: `${mesNome} — ${m.motivo}`, tipo: 'erro' });
        } else {
          items.push({ mes: m.mes, texto: `${mesNome} com problema`, tipo: 'erro' });
        }
      }
      if (m.status === 'provisorio' && typeof m.detalheFechados === 'number' && typeof m.detalheTotal === 'number' && m.detalheTotal > 0) {
        const mesNome = MESES_NOMES[parseInt(m.mes) - 1];
        items.push({ mes: m.mes, texto: `${mesNome} com pastos não fechados (${m.detalheFechados} de ${m.detalheTotal})`, tipo: 'aviso' });
      }
    }
    return items;
  }, [meses]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      {/* Header summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-semibold text-foreground">{fazendaAtual?.nome}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground font-medium">{ano}</span>
        <div className="ml-auto flex flex-wrap gap-3">
          {ultimoFechado && (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Último fechado: <strong>{MESES_NOMES[parseInt(ultimoFechado.mes) - 1]}</strong></span>
            </span>
          )}
          {proximoPendente && (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">Próximo pendente: <strong>{MESES_NOMES[parseInt(proximoPendente.mes) - 1]}</strong></span>
            </span>
          )}
        </div>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {meses.map((m) => {
          const config = STATUS_CONFIG[m.status];
          const Icon = config.icon;
          return (
            <Card
              key={m.mes}
              className={cn(
                'flex flex-col items-center justify-center gap-2 p-4 cursor-pointer hover:shadow-md transition-shadow border',
                m.status === 'oficial' && 'border-emerald-600/30 bg-emerald-600/5',
                m.status === 'bloqueado' && 'border-red-500/30 bg-red-500/5',
                m.status === 'provisorio' && 'border-amber-500/30 bg-amber-500/5',
              )}
              onClick={() => onSelectMes?.(`${ano}-${m.mes}`)}
            >
              <span className="text-sm font-semibold text-foreground">
                {MESES_NOMES[parseInt(m.mes) - 1]}
              </span>
              <Icon className={cn('h-5 w-5', {
                'text-emerald-600': m.status === 'oficial',
                'text-amber-600': m.status === 'provisorio',
                'text-red-500': m.status === 'bloqueado',
                'text-muted-foreground': m.status === 'nao_iniciado',
              })} />
              <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', config.className)}>
                {config.label}
              </Badge>
            </Card>
          );
        })}
      </div>

      {/* Alerts */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2 mt-auto">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium',
                a.tipo === 'erro'
                  ? 'bg-red-500/10 text-red-700'
                  : 'bg-amber-500/10 text-amber-700',
              )}
            >
              {a.tipo === 'erro' ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> : <Clock className="h-3.5 w-3.5 flex-shrink-0" />}
              {a.texto}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
