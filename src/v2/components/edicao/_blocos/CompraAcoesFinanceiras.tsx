import { Button } from '@/components/ui/button';
import { Zap, Pencil, AlertTriangle } from 'lucide-react';

interface Props {
  onGerarAtualizar: () => void;
  onEditarFinanceiro: () => void;
  existingCount: number;
  disabled?: boolean;
}

export function CompraAcoesFinanceiras({
  onGerarAtualizar, onEditarFinanceiro, existingCount, disabled,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] font-semibold border-purple-400 text-purple-800 hover:bg-purple-50"
        onClick={onGerarAtualizar}
        disabled={disabled}
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
      {existingCount > 0 && (
        <div className="col-span-2 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span><b>Atenção:</b> ao atualizar, lançamentos programados serão cancelados e substituídos.</span>
        </div>
      )}
    </div>
  );
}
