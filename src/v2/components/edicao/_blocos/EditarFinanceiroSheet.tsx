import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CompraFinanceiroPanel } from '@/components/CompraFinanceiroPanel';
import type { CompraFinanceiroPanelRef } from '@/components/CompraFinanceiroPanel';
import type { Categoria } from '@/types/cattle';
import type { FiltroVisual } from '@/lib/statusOperacional';
import type { RefObject } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  panelRef: RefObject<CompraFinanceiroPanelRef>;
  // Props passthrough — mesma assinatura do CompraFinanceiroPanel:
  quantidade: number;
  pesoKg: number;
  data: string;
  categoria: Categoria;
  statusOp: FiltroVisual;
  fazendaOrigem: string;
  notaFiscal: string;
  onNotaFiscalChange: (v: string) => void;
  fornecedorId: string;
  lancamentoId: string;
  fazendaIdLancamento?: string;
  clienteIdLancamento?: string;
  /** Disparado após salvar/atualizar financeiro. Caller decide o que fazer
   *  (fechar sheet, refetch display, etc). NÃO fecha modal zoo. */
  onFinanceiroUpdated: () => void;
  // PR-ZOO-FIN-LOCK CAMADA1: trava interna espelhada do externo.
  // Quando true, painel renderiza banner vermelho e desabilita
  // "Atualizar lançamentos no financeiro".
  recalculoLocked?: boolean;
}

export function EditarFinanceiroSheet({
  open, onOpenChange, panelRef, onFinanceiroUpdated, ...passthrough
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Financeiro da Compra</SheetTitle>
          <SheetDescription>
            Ajuste valor, parcelas, despesas extras e forma de pagamento.
            O modal de compra permanece aberto ao fechar este painel.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3">
          <CompraFinanceiroPanel
            ref={panelRef}
            mode="update"
            {...passthrough}
            onFinanceiroUpdated={onFinanceiroUpdated}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
