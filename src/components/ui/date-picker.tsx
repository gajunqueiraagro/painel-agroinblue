import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// DatePicker de apresentação (Popover + Calendar shadcn, pt-BR, dd/mm/aaaa).
//   Liga no MESMO estado string 'yyyy-MM-dd' usado hoje (value/onChange) — sem alterar
//   persistência. Uso restrito ao campo "Data da Compra" nesta rodada.
interface DatePickerProps {
  value: string;                 // 'yyyy-MM-dd'
  onChange: (v: string) => void; // devolve 'yyyy-MM-dd'
  className?: string;
  placeholder?: string;
}

export function DatePicker({ value, onChange, className, placeholder = 'dd/mm/aaaa' }: DatePickerProps) {
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  return (
    <Popover>
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
          onSelect={(d) => { if (d) onChange(format(d, 'yyyy-MM-dd')); }}
          locale={ptBR}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
