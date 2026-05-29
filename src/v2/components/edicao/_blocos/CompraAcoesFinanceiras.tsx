import { Button } from '@/components/ui/button';
import { Zap, Pencil, AlertTriangle } from 'lucide-react';

interface Props {
  onGerarAtualizar: () => void;
  onEditarFinanceiro: () => void;
  existingCount: number;
  /** PR-ZOO-FIN-LOCK CAMADA1: bloqueia "Gerar / Atualizar" quando há
   * lançamento financeiro realizado vinculado. UI-only — Camada 2
   * SQL fechará bypass. */
  realizedCount?: number;
  /** PR-ZOO-FIN-LOCK CAMADA1: idem para conciliado. */
  conciliadoCount?: number;
  disabled?: boolean;
}

export function CompraAcoesFinanceiras({
  onGerarAtualizar, onEditarFinanceiro, existingCount,
  realizedCount = 0, conciliadoCount = 0, disabled,
}: Props) {
  // PR-ZOO-FIN-LOCK CAMADA1: lock soberano se há realizado/conciliado.
  const recalculoLocked = realizedCount > 0 || conciliadoCount > 0;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] font-semibold border-purple-400 text-purple-800 hover:bg-purple-50"
        onClick={onGerarAtualizar}
        disabled={disabled || recalculoLocked}
      >
        <Zap className="w-3 h-3 mr-1" />
        Gerar / Atualizar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] font-semibold border-purple-400 text-purple-800 hover:bg-purple-50"
        onClick={onEditarFinanceiro}
        disabled={disabled || existingCount === 0}
      >
        <Pencil className="w-3 h-3 mr-1" />
        Editar Financeiro
      </Button>
      {recalculoLocked && (
        <div className="col-span-2 text-[10px] text-red-800 bg-red-100 border border-red-400 rounded px-2 py-1.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <b>Existe lançamento financeiro realizado/conciliado vinculado.</b>{' '}
            O Zoo não pode substituir esse financeiro. Acesse o módulo
            Financeiro para alterar.
            {(realizedCount > 0 || conciliadoCount > 0) && (
              <span className="block text-[9px] mt-0.5 opacity-80">
                {realizedCount > 0 && `${realizedCount} realizado(s)`}
                {realizedCount > 0 && conciliadoCount > 0 && ' · '}
                {conciliadoCount > 0 && `${conciliadoCount} conciliado(s)`}
              </span>
            )}
          </span>
        </div>
      )}
      {!recalculoLocked && existingCount > 0 && (
        <div className="col-span-2 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span><b>Atenção:</b> ao atualizar, lançamentos programados serão cancelados e substituídos.</span>
        </div>
      )}
    </div>
  );
}
