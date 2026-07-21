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
}

export function DatePicker({ value, onChange, className, placeholder = 'dd/mm/aaaa' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('h-8 w-full justify-start text-left font-normal text-[12px]', !valid && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
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
          className="p-2"
          classNames={{
            // Faixa superior completa em azul (mês + setas com contraste)
            caption: 'relative flex items-center justify-center bg-primary text-primary-foreground -mx-2 -mt-2 mb-1.5 px-3 py-2 rounded-t-md',
            caption_label: 'text-[13px] font-semibold',
            nav_button: 'h-6 w-6 bg-transparent p-0 border-0 text-primary-foreground opacity-80 hover:opacity-100',
            // Células compactas
            head_cell: 'text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]',
            cell: 'h-8 w-8 text-center text-[12px] p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
            day: 'h-8 w-8 p-0 font-normal text-[12px] aria-selected:opacity-100',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
