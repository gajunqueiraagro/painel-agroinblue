/**
 * FluxoCaixaToggle — 3 botões segmentados para alternar o modo do Modal
 * Fluxo de Caixa Realizado. Cada botão tem um ícone Info com tooltip
 * explicando a semântica do modo.
 *
 * Componente puro de UI: recebe `modo` controlado e callback `onChange`.
 * Sem estado interno. Usa ToggleGroup + Tooltip do shadcn (Radix).
 */

import { Info } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModoToggle } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  modo: ModoToggle;
  onChange: (modo: ModoToggle) => void;
}

const OPCOES: ReadonlyArray<{ value: ModoToggle; label: string; tooltip: string }> = [
  {
    value: 'realizado',
    label: 'Realizado',
    tooltip:
      'Somente lançamentos efetivamente realizados no caixa, do início do ano até o mês selecionado.',
  },
  {
    value: 'confirmado',
    label: 'Confirmado',
    tooltip:
      'Realizado + lançamentos agendados (pagamentos com data confirmada no banco), até 3 meses à frente.',
  },
  {
    value: 'estimado',
    label: 'Estimado',
    tooltip:
      'Confirmado + lançamentos programados e previstos (planejamento operacional). Visão mais ampla, menos precisa.',
  },
];

export function FluxoCaixaToggle({ modo, onChange }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <ToggleGroup
        type="single"
        value={modo}
        onValueChange={(v) => {
          if (v === 'realizado' || v === 'confirmado' || v === 'estimado') onChange(v);
        }}
        className="justify-start gap-0 border border-border rounded-md p-0.5 w-fit"
      >
        {OPCOES.map((op) => (
          <div key={op.value} className="flex items-center">
            <ToggleGroupItem
              value={op.value}
              size="sm"
              className="text-xs px-3 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {op.label}
            </ToggleGroupItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="px-1.5 text-muted-foreground hover:text-foreground cursor-help inline-flex items-center"
                  aria-label={`Sobre o modo ${op.label}`}
                  tabIndex={0}
                >
                  <Info className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {op.tooltip}
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
