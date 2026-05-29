import { Button } from '@/components/ui/button';
import { Zap, Pencil, AlertTriangle } from 'lucide-react';

interface Props {
  /** Aciona generateFinanceiro do ref existente. */
  onGerarAtualizar: () => void;
  /** Abre o EditarFinanceiroSheet. */
  onEditarFinanceiro: () => void;
  /** Quantidade de lançamentos financeiros existentes (alerta condicional). */
  existingCount: number;
  disabled?: boolean;
}

export function CompraAcoesFinanceiras({
  onGerarAtualizar, onEditarFinanceiro, existingCount, disabled,
}: Props) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-start gap-2 mb-2">
          <Zap className="h-4 w-4 text-purple-700 dark:text-purple-300 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Gerar / Atualizar Financeiro</div>
            <div className="text-[11px] text-muted-foreground">
              Gera ou regenera os lançamentos financeiros desta movimentação.
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onGerarAtualizar}
          disabled={disabled}
        >
          Gerar / Atualizar
        </Button>
      </div>

      <div>
        <div className="flex items-start gap-2 mb-2">
          <Pencil className="h-4 w-4 text-purple-700 dark:text-purple-300 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Editar Financeiro Existente</div>
            <div className="text-[11px] text-muted-foreground">
              Abre o painel financeiro para edição manual.
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onEditarFinanceiro}
          disabled={disabled || existingCount === 0}
        >
          Editar Financeiro
        </Button>
      </div>

      {existingCount > 0 && (
        <div className="flex items-start gap-1.5 p-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-3.5 w-3.5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-red-800 dark:text-red-200 leading-snug">
            <span className="font-semibold">Atenção</span> · Ao atualizar o financeiro, os
            lançamentos programados existentes serão cancelados e substituídos.
          </div>
        </div>
      )}
    </div>
  );
}
