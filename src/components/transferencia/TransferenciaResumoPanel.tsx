import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { AlertTriangle, CheckCircle, Edit, ArrowRightLeft } from 'lucide-react';
import type { TransferenciaDetalhes } from './TransferenciaDetalhesDialog';
import type { TransferenciaCalculation } from '@/lib/calculos/transferencia';

interface Props {
  quantidade: number;
  pesoKg: number;
  categoria: string;
  fazendaOrigem: string;
  fazendaDestino: string;
  detalhes: TransferenciaDetalhes | null;
  detalhesPreenchidos: boolean;
  canOpenModal: boolean;
  onOpenModal: () => void;
  onRequestRegister: () => void;
  submitting: boolean;
  registerLabel?: string;
  onCancelEdit?: () => void;
  /** Official calculation object — single source of truth */
  calculation?: TransferenciaCalculation | null;
}

export function TransferenciaResumoPanel({
  quantidade, pesoKg, categoria, fazendaOrigem, fazendaDestino,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel, onCancelEdit,
  calculation,
}: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  // Use the official calculation object — NO recalculation
  const calc = calculation || detalhes?.calculation || null;

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg ? formatKg(pesoKg) : '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><strong>{catLabel}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Origem</span><strong className="truncate max-w-[120px]">{fazendaOrigem || '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Destino</span><strong className="truncate max-w-[120px]">{fazendaDestino || '-'}</strong></div>
      </div>

      {calc && (
        <>
          <Separator />
          <div className="space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Peso Total</span><strong className="tabular-nums">{formatKg(calc.pesoTotalKg)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">@/cab</span><strong className="tabular-nums">{formatArroba(calc.arrobasCab)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total @</span><strong className="tabular-nums">{formatArroba(calc.totalArrobas)}</strong></div>
          </div>
        </>
      )}

      <Separator />

      {!detalhesPreenchidos ? (
        <>
          <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-1.5 leading-tight">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Referência econômica não preenchida (opcional)</span>
          </div>
          <Button type="button" variant="outline" className="w-full h-7 text-[11px] font-bold gap-1.5" disabled={!canOpenModal} onClick={onOpenModal}>
            <ArrowRightLeft className="h-3 w-3" />
            Completar Detalhes
          </Button>
          {!canOpenModal && (
            <p className="text-[9px] text-muted-foreground text-center leading-tight">Preencha Data, Quantidade, Peso, Categoria e Destino</p>
          )}

          <Separator />

          <div className="flex items-center gap-1.5">
            {onCancelEdit && (
              <Button type="button" variant="outline" className="flex-1 h-7 text-[10px] font-bold" onClick={onCancelEdit}>
                Cancelar
              </Button>
            )}
            <Button type="button" className="flex-1 h-7 text-[10px] font-bold" onClick={onRequestRegister} disabled={submitting}>
              {submitting ? 'Registrando...' : (registerLabel || 'Registrar Transferência')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Econômico preenchido */}
          <div className="space-y-0 text-[10px] leading-[1.4]">
            {calc && calc.temPrecoReferencia && (
              <>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">R$/@ ref.</span><strong className="tabular-nums">{formatMoeda(calc.precoReferenciaArroba)}</strong></div>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">R$/cab ref.</span><strong className="tabular-nums">{formatMoeda(calc.precoReferenciaCabeca)}</strong></div>
                <Separator className="my-0.5" />
                <div className="flex justify-between text-[11px] font-bold py-px">
                  <span>Valor Econômico</span>
                  <span className="text-primary tabular-nums">{formatMoeda(calc.valorEconomicoLote)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1 leading-tight">
            <CheckCircle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Referência econômica preenchida</span>
          </div>

          <Button type="button" variant="ghost" size="sm" className="w-full h-6 text-[10px] font-medium gap-1 text-muted-foreground" onClick={onOpenModal}>
            <Edit className="h-3 w-3" />
            Editar Detalhes
          </Button>

          <Separator />

          <div className="flex items-center gap-1.5">
            {onCancelEdit && (
              <Button type="button" variant="outline" className="flex-1 h-7 text-[10px] font-bold" onClick={onCancelEdit}>
                Cancelar
              </Button>
            )}
            <Button type="button" className="flex-1 h-7 text-[10px] font-bold" onClick={onRequestRegister} disabled={submitting}>
              {submitting ? 'Registrando...' : (registerLabel || 'Registrar Transferência')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
