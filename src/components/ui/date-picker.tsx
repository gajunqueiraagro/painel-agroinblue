import { useState, useEffect } from 'react';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// DatePicker compartilhado (Popover + Calendar shadcn, pt-BR).
//   Contrato inalterado: entra 'yyyy-MM-dd', sai 'yyyy-MM-dd', exibe 'dd/MM/yyyy'.
//   UI-CALENDARIO-02: (1) abre no mês da data (defaultMonth); (2) input EDITÁVEL — aceita
//   digitação/colagem (dd/MM/yyyy, separadores / - .), validando no blur/Enter, mantendo o
//   texto p/ correção quando inválido e preservando o último valor válido. Sem toISOString
//   (data civil TZ-safe). Digitação manual passou a ser o comportamento padrão.

interface DatePickerProps {
  value: string;                 // 'yyyy-MM-dd'
  onChange: (v: string) => void; // devolve 'yyyy-MM-dd'
  className?: string;
  placeholder?: string;
  disabled?: boolean;            // aditivo (PR-FIN-MODAL-02C): campos travados/OC. Default false.
  tabIndex?: number;
  // Variante COMPACTA (PR-FIN-MODAL-02C) para grids densos (parcelas/recorrência). SÓ apresentação:
  //   reduz altura do campo, padding, fonte e ícone. NÃO altera parsing/formatação/timezone/valor/handlers.
  size?: 'default' | 'compact';
}

// ─── Funções puras (TZ-safe: só aritmética de calendário local, nunca toISOString) ───

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'yyyy-MM-dd' (estrito) → Date local, ou null se vazio/ inválido. Sem Invalid Date vazando. */
export function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  // Rejeita rollover (ex.: 2025-02-31) e datas impossíveis.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy'. ISO inválido/vazio → '' (nunca formata como data). */
export function formatIsoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Date local → 'yyyy-MM-dd'. Sem toISOString (evita deslocamento de fuso). */
export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export type ParseResult =
  | { status: 'empty' }
  | { status: 'valid'; iso: string }
  | { status: 'invalid' };

/**
 * Texto BR → resultado de parse. Tolerante na ENTRADA, estrito na VALIDAÇÃO:
 *   dia 1-2 díg, mês 1-2 díg, ano OBRIGATORIAMENTE 4 díg; separadores / - . (split por classe
 *   de char — não força consistência entre separadores, o que manteria o parser mais complexo).
 *   Datas impossíveis (31/02, 15/13, 00/10, 29/02 não-bissexto, 32/01…) → 'invalid'.
 *   Incompletos (ex.: '15/03', '15/') → 'invalid' (só relevam no commit). Vazio → 'empty'.
 */
export function parseBrDateToIso(text: string): ParseResult {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  const parts = t.split(/[/.\-]/);
  if (parts.length !== 3) return { status: 'invalid' };
  const [dd, mm, yyyy] = parts;
  if (!/^\d{1,2}$/.test(dd) || !/^\d{1,2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) {
    return { status: 'invalid' };
  }
  const d = +dd, mo = +mm, y = +yyyy;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return { status: 'invalid' };
  }
  return { status: 'valid', iso: `${y}-${pad2(mo)}-${pad2(d)}` };
}

export function DatePicker({ value, onChange, className, placeholder = 'dd/mm/aaaa', disabled, tabIndex, size = 'default' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Texto EDITÁVEL local (livre enquanto digita). Inicializa a partir do value válido.
  const [text, setText] = useState<string>(() => formatIsoToBr(value));
  const [error, setError] = useState(false);
  const compact = size === 'compact';

  // Proteção defensiva: value inválido/vazio → sem seleção, sem Invalid Date, sem virar hoje.
  const selectedDate = isoToDate(value);

  // Sincroniza o texto quando o value EXTERNO muda (troca de registro, seleção no calendário,
  // recomputo de parcelas). Digitar altera só `text` (não `value`), então este efeito não
  // interfere na digitação em andamento. ISO inválido → texto vazio.
  useEffect(() => {
    setText(formatIsoToBr(value));
    setError(false);
  }, [value]);

  // Validação SÓ no commit (blur/Enter). Mantém texto inválido p/ correção; preserva o
  // último valor válido; emite onChange apenas com data válida (≠ atual) ou vazio confirmado.
  const commit = () => {
    const r = parseBrDateToIso(text);
    if (r.status === 'empty') {
      setError(false);
      if (value !== '') onChange('');
      return;
    }
    if (r.status === 'valid') {
      setError(false);
      setText(formatIsoToBr(r.iso)); // normaliza exibição (ex.: 1/3/2025 → 01/03/2025)
      if (r.iso !== value) onChange(r.iso);
      return;
    }
    // inválido/incompleto: sinaliza localmente, NÃO emite, NÃO apaga, preserva valor anterior.
    setError(true);
  };

  return (
    <Popover open={open} onOpenChange={o => { if (!disabled) setOpen(o); }}>
      {/* wrapper só posiciona o ícone; o `className` do consumidor vai no INPUT (preserva a
          semântica anterior — antes ele estilizava o gatilho). Ex.: AbaRecebimentoLotes passa
          "h-6 text-[10px]" sem size=compact e espera que o CAMPO encolha. */}
      <div className="relative">
        <Input
          value={text}
          onChange={e => { setText(e.target.value); setError(false); }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          disabled={disabled}
          tabIndex={tabIndex}
          placeholder={placeholder}
          inputMode="numeric"
          aria-invalid={error || undefined}
          className={cn(
            compact ? 'h-6 pl-2 pr-7 text-[11px]' : 'h-8 pr-8 text-[12px]',
            className,
            error && 'border-destructive focus-visible:ring-destructive/40',
          )}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Abrir calendário"
            disabled={disabled}
            tabIndex={-1}
            className={cn(
              'absolute inset-y-0 right-0 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none',
              compact ? 'px-1.5' : 'px-2',
            )}
          >
            <CalendarIcon className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate ?? undefined}
          // UI-CALENDARIO-02 — abre no mês do value (ou hoje se vazio/ inválido). O Popover
          // remonta o Calendar a cada abertura → recalculado a partir do value atual; NÃO
          // memoriza o último mês navegado (sem month/onMonthChange/estado de mês).
          defaultMonth={selectedDate ?? undefined}
          onSelect={(d) => {
            if (d) {
              const iso = dateToIso(d);
              setText(formatIsoToBr(iso));
              setError(false);
              if (iso !== value) onChange(iso); // evita emissão redundante (mesmo dia)
              setOpen(false);
            }
          }}
          locale={ptBR}
          initialFocus
          // PR-UI-CAMPOS-STD-01 (adendo) — ESTABILIDADE POSICIONAL: grade SEMPRE com 6 semanas
          // (fixedWeeks) preenchidas com dias adjacentes (showOutsideDays). Altura total constante
          // entre meses de 4/5/6 linhas ⇒ cabeçalho azul, título e setas NÃO se deslocam ao navegar.
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
