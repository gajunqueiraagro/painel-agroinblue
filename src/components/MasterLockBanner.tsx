import { useState } from 'react';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMasterLock } from '@/hooks/useMasterLock';
import { MasterUnlockDialog } from '@/components/MasterUnlockDialog';

interface Props {
  anoMes: string;
  className?: string;
  /** A régua de 22px da Evolução Patrimonial — ver o comentário do componente. */
  compacto?: boolean;
  /** VR-PRECO-EDITAR-01 ampliado (Gabriel 09/11 07:06): a trava é do MÊS inteiro — na linha da faixa do fechamento das 3 telas do mês
   *  (Fechamento área, Valor do Rebanho, Mapa do rebanho), inclusive no mês aberto; curta e com 22px nos DOIS estados (nada desloca). */
  naFaixa?: boolean;
}

/**
 * Banner exibido em telas que respeitam o bloqueio master.
 * - Mostra estado bloqueado (vermelho) com botão de desbloqueio.
 * - Mostra estado desbloqueado temporário (amarelo) com botão re-lock.
 * - Não renderiza nada se o mês não está locked OU se usuário é master.
 */
/**
 * ⚠ `compacto` É OPT-IN, e por isso ele existe: este banner é montado também pelo
 * `FechamentoPastoDialog`, onde a régua de 14px continua valendo. Mudar as medidas no componente
 * mexeria nas duas telas; a prop deixa a Evolução Patrimonial ter os 22px do mock sem arrastar
 * ninguém junto. Quem não passa nada não vê diferença nenhuma.
 */
export function MasterLockBanner({ anoMes, className, compacto, naFaixa }: Props) {
  const { isMaster, isMesLocked, isUnlocked, unlockMes, lockMes } = useMasterLock(anoMes);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isMaster) return null;
  if (!isMesLocked(anoMes)) return null;

  const unlockedNow = isUnlocked(anoMes);

  /* naFaixa: um Desbloquear libera o MÊS inteiro (todos os pastos + o Valor do Rebanho) na sessão — nunca pasto por pasto */
  if (naFaixa) {
    return (
      <>
        <div className="flex h-[22px] flex-none items-center gap-1.5 whitespace-nowrap rounded border px-1.5 text-[10px]"
          style={unlockedNow ? { backgroundColor: '#FEF6E7', borderColor: '#F3D08A', color: '#8A5A00' } : { backgroundColor: '#FBF0EF', borderColor: '#E8B9B6', color: '#A32D2D' }}
          data-testid="trava-do-mes" title={unlockedNow ? 'Mês desbloqueado nesta sessão: as alterações ficam registradas' : 'Mês fechado: somente leitura até desbloquear (vale para todos os pastos do mês)'}>
          {unlockedNow ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {/* só o cadeado e o botão: a faixa do fechamento ao lado nunca perde espaço (a 135% ela cortava); o texto inteiro no title */}
          <button type="button" onClick={() => (unlockedNow ? lockMes(anoMes) : setDialogOpen(true))}
            className="rounded border px-1.5 leading-[14px] hover:bg-white/60" style={{ borderColor: 'currentColor' }}
            data-testid="trava-do-mes-botao">
            {unlockedNow ? 'Re-bloquear' : 'Desbloquear'}
          </button>
        </div>
        <MasterUnlockDialog open={dialogOpen} onOpenChange={setDialogOpen} anoMes={anoMes} onUnlock={unlockMes} />
      </>
    );
  }

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
      {compacto ? (
        <div className="flex items-center justify-between gap-2 rounded border px-2"
          style={{ height: 22, backgroundColor: '#FBF0EF', borderColor: '#E8B9B6', color: '#A32D2D' }}>
          <span className="truncate" style={{ fontSize: 9 }}>
            <Lock className="mr-1 inline h-2.5 w-2.5 align-[-2px]" />
            Mês <strong className="font-semibold">{anoMes}</strong> fechado · somente leitura
          </span>
          <button type="button" onClick={() => setDialogOpen(true)}
            className="shrink-0 rounded border px-1.5 hover:bg-white/60"
            style={{ height: 16, fontSize: 9, borderColor: '#E8B9B6' }}>
            Solicitar desbloqueio
          </button>
        </div>
      ) : (
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
      )}
      <MasterUnlockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        anoMes={anoMes}
        onUnlock={unlockMes}
      />
    </>
  );
}
