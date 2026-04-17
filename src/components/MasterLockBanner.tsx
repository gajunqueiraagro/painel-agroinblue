import { useState } from 'react';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMasterLock } from '@/hooks/useMasterLock';
import { MasterUnlockDialog } from '@/components/MasterUnlockDialog';

interface Props {
  anoMes: string;
  className?: string;
}

/**
 * Banner exibido em telas que respeitam o bloqueio master.
 * - Mostra estado bloqueado (vermelho) com botão de desbloqueio.
 * - Mostra estado desbloqueado temporário (amarelo) com botão re-lock.
 * - Não renderiza nada se o mês não está locked OU se usuário é master.
 */
export function MasterLockBanner({ anoMes, className }: Props) {
  const { isMaster, isMesLocked, isUnlocked, unlockMes, lockMes } = useMasterLock(anoMes);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isMaster) return null;
  if (!isMesLocked(anoMes)) return null;

  const unlockedNow = isUnlocked(anoMes);

  if (unlockedNow) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 ${className ?? ''}`}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          <span>
            ⚠️ Mês <strong>{anoMes}</strong> desbloqueado temporariamente — alterações serão registradas.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 border-amber-400 text-amber-900 hover:bg-amber-100"
          onClick={() => lockMes(anoMes)}
        >
          <Lock className="h-3 w-3" />
          Re-bloquear
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 ${className ?? ''}`}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span>
            🔒 Mês <strong>{anoMes}</strong> fechado — somente leitura. Alterações exigem autorização master.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 border-red-400 text-red-900 hover:bg-red-100"
          onClick={() => setDialogOpen(true)}
        >
          <LockOpen className="h-3 w-3" />
          Solicitar desbloqueio
        </Button>
      </div>
      <MasterUnlockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        anoMes={anoMes}
        onUnlock={unlockMes}
      />
    </>
  );
}
