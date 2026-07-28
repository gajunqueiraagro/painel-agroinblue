import { useState } from 'react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// DatePicker de apresentação (Popover + Calendar shadcn, pt-BR, dd/mm/aaaa).
//   Liga no MESMO estado string 'yyyy-MM-dd' usado hoje (value/onChange) — sem alterar
//   persistência. Fecha automaticamente ao selecionar; identidade azul e células compactas.
interface DatePickerProps {
  value: string;                 // 'yyyy-MM-dd'
  onChange: (v: string) => void; // devolve 'yyyy-MM-dd'
  className?: string;
  placeholder?: string;
  disabled?: boolean;            // aditivo (PR-FIN-MODAL-02C): campos travados/OC. Default false.
  tabIndex?: number;
  // Variante COMPACTA (PR-FIN-MODAL-02C) para grids densos (parcelas/recorrência). SÓ apresentação:
  //   reduz altura do trigger, padding, fonte e ícone. NÃO altera parsing/formatação/timezone/valor/handlers.
  size?: 'default' | 'compact';
}

export function DatePicker({ value, onChange, className, placeholder = 'dd/mm/aaaa', disabled, tabIndex, size = 'default' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  const compact = size === 'compact';
  return (
    <Popover open={open} onOpenChange={o => { if (!disabled) setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          tabIndex={tabIndex}
          className={cn(
            'w-full justify-start text-left font-normal',
            compact ? 'h-6 px-2 text-[11px]' : 'h-8 text-[12px]',
            !valid && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className={cn('shrink-0', compact ? 'mr-1 h-3 w-3' : 'mr-2 h-3.5 w-3.5')} />
          {valid ? format(parsed as Date, 'dd/MM/yyyy', { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={valid ? parsed : undefined}
          onSelect={(d) => { if (d) { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); } }}
          locale={ptBR}
          initialFocus
          // PR-UI-CAMPOS-STD-01 (adendo) — ESTABILIDADE POSICIONAL: grade SEMPRE com 6 semanas
          // (fixedWeeks) preenchidas com dias adjacentes (showOutsideDays). Altura total constante
          // entre meses de 4/5/6 linhas ⇒ cabeçalho azul, título e setas NÃO se deslocam ao navegar;
          // sem translateY por mês, sem exceção por mês. Correção na causa (grade variável), no
          // componente compartilhado — vale para o DatePicker normal e o compact.
          fixedWeeks
          showOutsideDays
          className="p-1.5"
          classNames={{
            // Espaçamento vertical enxuto entre cabeçalho azul, dias da semana e grade
            month: 'space-y-1',
            row: 'flex w-full mt-0.5',
            // Faixa superior completa em azul (mês + setas com contraste)
            caption: 'relative flex items-center justify-center bg-primary text-primary-foreground -mx-1.5 -mt-1.5 mb-1 px-3 py-1.5 rounded-t-md',
            caption_label: 'text-[12px] font-semibold',
            nav_button: 'h-5 w-5 bg-transparent p-0 border-0 text-primary-foreground opacity-80 hover:opacity-100',
            // Células compactas (menor altura)
            head_cell: 'text-muted-foreground rounded-md w-7 font-normal text-[0.65rem]',
            cell: 'h-7 w-7 text-center text-[11px] p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
            day: 'h-7 w-7 p-0 font-normal text-[11px] aria-selected:opacity-100',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
