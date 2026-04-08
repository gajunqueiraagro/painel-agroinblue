import { AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SnapshotStatusValue } from '@/hooks/useSnapshotStatus';

interface Props {
  status: SnapshotStatusValue;
  mesLabel: string;
  onRevalidar?: () => void;
  onIrMesAnterior?: () => void;
  compact?: boolean;
}

/**
 * Banner de governança do snapshot.
 * Exibe alertas visuais quando o snapshot está invalidado ou com cadeia quebrada.
 */
export function SnapshotStatusBanner({ status, mesLabel, onRevalidar, onIrMesAnterior, compact }: Props) {
  if (status === 'validado' || status === 'sem_snapshot') return null;

  if (status === 'invalidado') {
    return (
      <div className={`flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <AlertTriangle className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-amber-600 shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-amber-700`}>
            Snapshot invalidado — {mesLabel}
          </p>
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-amber-600/80`}>
            O rebanho foi alterado após a validação. Dados não oficiais até revalidação.
          </p>
        </div>
        {onRevalidar && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRevalidar}
            className="h-6 text-[10px] px-2 border-amber-500/50 text-amber-700 hover:bg-amber-500/10 shrink-0"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Revalidar
          </Button>
        )}
      </div>
    );
  }

  if (status === 'cadeia_quebrada') {
    return (
      <div className={`flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <ShieldAlert className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-destructive shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-destructive`}>
            Cadeia quebrada — {mesLabel}
          </p>
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-destructive/80`}>
            Um mês anterior foi reaberto. Reconcilie sequencialmente antes de usar este mês.
          </p>
        </div>
        {onIrMesAnterior && (
          <Button
            variant="outline"
            size="sm"
            onClick={onIrMesAnterior}
            className="h-6 text-[10px] px-2 border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0"
          >
            Resolver
          </Button>
        )}
      </div>
    );
  }

  return null;
}
