import { Wifi, WifiOff, RefreshCw, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Props {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  onSync: () => void;
}

export function SyncStatus({ online, pendingCount, syncing, onSync }: Props) {
  if (online && pendingCount === 0) return null;

  return (
    <div className={cn(
      'fixed top-14 left-0 right-0 z-40 px-3 py-1.5 flex items-center justify-between text-xs font-semibold',
      !online ? 'bg-amber-500 text-amber-950' : 'bg-primary text-primary-foreground'
    )}>
      <div className="flex items-center gap-2">
        {!online ? (
          <>
            <WifiOff className="h-3.5 w-3.5" />
            <span>Modo offline</span>
          </>
        ) : (
          <>
            <Cloud className="h-3.5 w-3.5" />
            <span>Sincronizando...</span>
          </>
        )}
        {pendingCount > 0 && (
          <span className="bg-background/20 rounded-full px-2 py-0.5">
            {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {online && pendingCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', syncing && 'animate-spin')} />
          Sincronizar
        </Button>
      )}
    </div>
  );
}
