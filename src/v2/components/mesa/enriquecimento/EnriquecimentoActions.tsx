// EnriquecimentoActions — dumb. "Revisei" + "Aplicar exatos (N)".
// A ação real (fn_classificacao_apply) é ligada pelo container.
import { Button } from '@/components/ui/button';

export interface EnriquecimentoActionsProps {
  nAplicaveis: number;
  revisei: boolean;
  onRevisei: (v: boolean) => void;
  onAplicar: () => void;
  isApplying?: boolean;
  bloqueado?: boolean;
  desabilitado?: boolean;
}

export function EnriquecimentoActions({
  nAplicaveis, revisei, onRevisei, onAplicar, isApplying, bloqueado, desabilitado,
}: EnriquecimentoActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={revisei} disabled={desabilitado} onChange={(e) => onRevisei(e.target.checked)} />
        Revisei os candidatos ambíguos
      </label>
      <Button
        size="sm"
        className="h-7 text-[11px]"
        disabled={desabilitado || !revisei || nAplicaveis === 0 || !!isApplying || !!bloqueado}
        onClick={onAplicar}
      >
        {isApplying ? 'Aplicando…' : `Aplicar exatos (${nAplicaveis})`}
      </Button>
    </div>
  );
}
