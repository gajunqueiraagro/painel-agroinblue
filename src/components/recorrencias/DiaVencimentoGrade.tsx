/**
 * O DIA DE VENCIMENTO EM GRADE — PR-FIN-RECORRENCIA-MODAL-01 (decisão do Gabriel, 30/09).
 *
 * ⚠ ERA UM `Select` COM 31 ITENS NUMA COLUNA COMPRIDA: para chegar ao 28 o operador rolava a lista inteira. Agora
 * é a grade de um calendário, 7 colunas (1..31), células de 24px — o dia se acha pela posição, como no calendário.
 * ⚠ A PALETA É A DOS SELETORES DA CASA (`COMBOBOX_PALETA`, o vidro escuro do PR-UI-SELECT-05) e o painel é o
 * `PopoverContent` (portal, vira de lado quando não cabe). A SELEÇÃO SE MARCA EM NAVY (`bg-primary`), regra da casa.
 * ⚠ SEM DIA DA SEMANA: o dia de vencimento é o MESMO em todos os meses, e a grade não é de um mês. As colunas são
 * só o desenho que o olho já conhece.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COMBOBOX_PALETA } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

export function DiaVencimentoGrade({ value, onChange, className }: {
  value: number;
  onChange: (dia: number) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Dia de vencimento"
          className={cn('flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-xs tabular-nums',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1', className)}>
          <span>{value}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2} collisionPadding={8}
        data-testid="grade-dia-vencimento"
        className={cn('w-auto rounded-md border p-1 shadow-md', COMBOBOX_PALETA)}>
        <div className="grid grid-cols-7 gap-0.5">
          {DIAS.map((d) => {
            const sel = d === value;
            return (
              <button key={d} type="button" aria-pressed={sel}
                onClick={() => { onChange(d); setAberto(false); }}
                className={cn('h-6 w-6 rounded-sm text-center text-[10px] tabular-nums leading-6',
                  sel ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-100 hover:bg-zinc-800/45')}>
                {d}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
