/**
 * FluxoCaixaToggle — 3 botões segmentados para alternar o modo do Modal
 * Fluxo de Caixa Realizado.
 *
 * Componente puro de UI: recebe `modo` controlado e callback `onChange`.
 * Sem estado interno. Usa ToggleGroup do shadcn (Radix).
 */

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ModoToggle } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  modo: ModoToggle;
  onChange: (modo: ModoToggle) => void;
}

const OPCOES: ReadonlyArray<{ value: ModoToggle; label: string; descricao: string }> = [
  { value: 'realizado', label: 'Realizado', descricao: 'Apenas lançamentos conciliados Jan→mês alvo' },
  { value: 'confirmado', label: 'Confirmado', descricao: 'Realizado + agendados projetados até Dez' },
  { value: 'estimado', label: 'Estimado', descricao: 'Realizado + agendados + programados + previstos' },
];

export function FluxoCaixaToggle({ modo, onChange }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={modo}
      onValueChange={(v) => {
        if (v === 'realizado' || v === 'confirmado' || v === 'estimado') onChange(v);
      }}
      className="justify-start gap-0 border border-border rounded-md p-0.5 w-fit"
    >
      {OPCOES.map((op) => (
        <ToggleGroupItem
          key={op.value}
          value={op.value}
          size="sm"
          className="text-xs px-3 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          title={op.descricao}
        >
          {op.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
