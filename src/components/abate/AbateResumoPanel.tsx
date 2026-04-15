import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMoeda, formatKg } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { AlertTriangle, CheckCircle, Edit, Tag } from 'lucide-react';
import type { AbateDetalhes } from './AbateDetalhesDialog';
import type { AbateCalculation } from '@/lib/calculos/abate';

interface Props {
  quantidade: number;
  pesoKg: number;
  categoria: string;
  frigorificoNome: string;
  detalhes: AbateDetalhes | null;
  detalhesPreenchidos: boolean;
  canOpenModal: boolean;
  onOpenModal: () => void;
  onRequestRegister: () => void;
  submitting: boolean;
  registerLabel?: string;
  onCancelEdit?: () => void;
  /** Official calculation object — single source of truth */
  calculation?: AbateCalculation | null;
}

export function AbateResumoPanel({
  quantidade, pesoKg, categoria, frigorificoNome,
  detalhes, detalhesPreenchidos, canOpenModal,
  onOpenModal, onRequestRegister, submitting, registerLabel, onCancelEdit,
  calculation,
}: Props) {
  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  // Use the official calculation object — NO recalculation
  const calc = calculation || detalhes?.calculation || null;

  const tipoAbateLabel = detalhes?.tipoPeso === 'morto' ? 'Peso morto' : detalhes?.tipoPeso === 'vivo' ? 'Peso vivo' : '-';
  const comercLabel = detalhes?.tipoVenda
    ? { escala: 'Escala', a_termo: 'A termo', spot: 'Spot', outro: 'Outro' }[detalhes.tipoVenda] || detalhes.tipoVenda
    : '-';
  const pagLabel = detalhes?.formaReceb === 'prazo' && detalhes.parcelas.length > 0
    ? `A prazo (${detalhes.parcelas.length}x)`
    : 'À vista';

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg ? formatKg(pesoKg) : '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Categoria</span><strong>{catLabel}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Frigorífico</span><strong className="truncate max-w-[120px]">{frigorificoNome || '-'}</strong></div>
        {detalhesPreenchidos && detalhes && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo de Abate</span><strong>{tipoAbateLabel}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Comercialização</span><strong>{comercLabel}</strong></div>
          </>
        )}
      </div>

      <Separator />

      {!detalhesPreenchidos ? (
        <>
          <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-1.5 leading-tight">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Financeiro não preenchido</span>
          </div>
          <Button type="button" variant="outline" className="w-full h-7 text-[11px] font-bold gap-1.5" disabled={!canOpenModal} onClick={onOpenModal}>
            <Tag className="h-3 w-3" />
            Completar Abate
          </Button>
          {!canOpenModal && (
            <p className="text-[9px] text-muted-foreground text-center leading-tight">Preencha Data, Quantidade, Peso, Categoria e Frigorífico</p>
          )}
        </>
      ) : (
        <>
          <div className="space-y-0 text-[10px] leading-[1.4]">
            {calc && calc.valorBase > 0 && (
              <>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">Base (NF)</span><strong className="tabular-nums">{formatMoeda(calc.valorBase)}</strong></div>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">+ Bônus</span><strong className="text-green-600 dark:text-green-400 tabular-nums">{calc.totalBonus > 0 ? `+${formatMoeda(calc.totalBonus)}` : '-'}</strong></div>
                <div className="flex justify-between py-px"><span className="text-muted-foreground">– Despesas</span><strong className="text-destructive tabular-nums">{calc.totalDescontos > 0 ? `-${formatMoeda(calc.totalDescontos)}` : '-'}</strong></div>
                {calc.funruralTotal > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">{`– Funrural${calc.valorBase > 0 ? ` (${((calc.funruralTotal / calc.valorBase) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% da NF)` : ''}`}</span><strong className="text-destructive tabular-nums">-{formatMoeda(calc.funruralTotal)}</strong></div>
                )}
                <Separator className="my-0.5" />
                <div className="flex justify-between text-[11px] font-bold py-px">
                  <span>= Valor Líquido</span>
                  <span className="text-primary tabular-nums">{formatMoeda(calc.valorLiquido)}</span>
                </div>
                {calc.liqArroba > 0 && (
                  <div className="flex justify-between py-px"><span className="text-muted-foreground">R$/@ líq.</span><strong className="tabular-nums">{formatMoeda(calc.liqArroba)}</strong></div>
                )}
              </>
            )}
            <div className="flex justify-between py-px"><span className="text-muted-foreground">Pagamento</span><strong>{pagLabel}</strong></div>
            {detalhes?.notaFiscal && (
              <div className="flex justify-between py-px"><span className="text-muted-foreground">NF</span><strong>{detalhes.notaFiscal}</strong></div>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1 leading-tight">
            <CheckCircle className="h-3 w-3 shrink-0" />
            <span className="font-medium">Detalhes financeiros preenchidos</span>
          </div>

          <Button type="button" variant="ghost" size="sm" className="w-full h-6 text-[10px] font-medium gap-1 text-muted-foreground" onClick={onOpenModal}>
            <Edit className="h-3 w-3" />
            Editar Detalhes
          </Button>
        </>
      )}

      <Separator />

      <div className="flex items-center gap-1.5">
        {onCancelEdit && (
          <Button type="button" variant="outline" className="flex-1 h-7 text-[10px] font-bold" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
        <Button type="button" className="flex-1 h-7 text-[10px] font-bold" onClick={onRequestRegister} disabled={submitting || !detalhesPreenchidos}>
          {submitting ? 'Registrando...' : (registerLabel || 'Registrar Abate')}
        </Button>
      </div>
    </div>
  );
}
