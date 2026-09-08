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
/** Ano fora deste intervalo é erro de digitação, não data (136a item 1b). */
export const ANO_MIN = 1900;
export const ANO_MAX = 2100;

/**
 * MÁSCARA DE DIGITAÇÃO — 136a item 1a. Pura: texto cru → texto exibido.
 *
 * ⚠ ELA NÃO EXPANDE ANO DE 2 DÍGITOS, e a razão é um conflito medido no desenho: quem
 * digita "20/08/2026" com barras passa por "20/08/20" no caminho. Uma regra que virasse
 * todo grupo de 2 dígitos em `20xx` transformaria esse estado transitório em "2020" e o
 * operador veria o ano trocar debaixo do dedo. A expansão de `dd/mm/aa` mora no
 * `normalizarDataColada`, chamada no `onPaste` — ali se SABE que o texto chegou inteiro.
 *
 * ⚠ SEPARADOR FECHA O GRUPO: digitar "1/" vira "01/". Sem isso, quem digita "1/3/2025"
 * (que o parser sempre aceitou) veria a máscara montar "13/20/25".
 */
export function aplicarMascaraData(raw: string, anterior = ''): string {
  /* ⚠ `anterior` EXISTE POR CAUSA DO BACKSPACE, e é a armadilha clássica da máscara: com a
     barra entrando sozinha aos 2 dígitos, "20/" apagado vira "20", a máscara recoloca a
     barra e o campo fica preso — o operador aperta backspace e nada acontece. Quando o
     texto ENCOLHEU, a máscara não fecha grupo; só formata o que sobrou. */
  const apagando = raw.length < anterior.length;
  const norm = raw.replace(/[.\-]/g, '/');
  let digitos: string;
  if (norm.includes('/')) {
    const partes = norm.split('/');
    const d = (partes[0] ?? '').replace(/\D/g, '');
    const m = (partes[1] ?? '').replace(/\D/g, '');
    const a = (partes[2] ?? '').replace(/\D/g, '');
    const dOk = partes.length >= 2 && d.length === 1 ? `0${d}` : d;
    const mOk = partes.length >= 3 && m.length === 1 ? `0${m}` : m;
    digitos = `${dOk}${mOk}${a}`.slice(0, 8);
  } else {
    digitos = norm.replace(/\D/g, '').slice(0, 8);
  }
  /* 2 dígitos -> "dd/", 4 -> "dd/mm/", 8 -> "dd/mm/aaaa" (item 1a). A barra de fechamento
     só entra quando se está ESCREVENDO — ver `apagando` acima. */
  if (digitos.length <= 2) return digitos.length === 2 && !apagando ? `${digitos}/` : digitos;
  if (digitos.length <= 4) {
    const base = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    return digitos.length === 4 && !apagando ? `${base}/` : base;
  }
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/**
 * NORMALIZAÇÃO DE COLAGEM — 136a item 1e. Os quatro formatos que o operador cola viram
 * `dd/mm/aaaa`: "20082026", "20/08/2026", "2026-08-20" e "20-08-26".
 *
 * ⚠ SÓ NA COLAGEM. É o único momento em que o texto chega COMPLETO, e por isso o único em
 * que expandir "26" para "2026" não briga com a digitação em andamento.
 */
export function normalizarDataColada(texto: string): string {
  const t = texto.trim();
  // ISO: 2026-08-20 (ano na frente é o desempate — dd nunca tem 4 dígitos)
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (iso) return `${pad2(+iso[3])}/${pad2(+iso[2])}/${iso[1]}`;
  // dd/mm/aa → dd/mm/20aa
  const curto = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(t);
  if (curto) return `${pad2(+curto[1])}/${pad2(+curto[2])}/20${curto[3]}`;
  // o resto (8 dígitos corridos, dd/mm/aaaa, separadores mistos) a máscara resolve
  return aplicarMascaraData(t);
}

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
  /* 136a item 1b — ano fora de 1900..2100 é dedo trocado, não data. Antes qualquer ano de
     4 dígitos passava, e "20/08/0226" virava uma data válida no ano 226. */
  if (y < ANO_MIN || y > ANO_MAX) return { status: 'invalid' };
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
          /* 136a item 1a — a máscara põe as barras; o operador só digita dígitos. */
          onChange={e => { setText(aplicarMascaraData(e.target.value, text)); setError(false); }}
          /* ⚠ COLAGEM TEM CAMINHO PRÓPRIO (item 1e): é o único momento em que o texto chega
              inteiro, e por isso o único em que "20-08-26" pode virar 2026 sem atrapalhar
              quem está digitando. `preventDefault` porque quem escreve o campo somos nós. */
          onPaste={e => {
            e.preventDefault();
            setText(normalizarDataColada(e.clipboardData.getData('text')));
            setError(false);
          }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); return; }
            /* Esc devolve o que estava — o operador desiste da edição sem perder o valor. */
            if (e.key === 'Escape') {
              e.preventDefault();
              setText(formatIsoToBr(value));
              setError(false);
              return;
            }
            /* ↓ abre o calendário, como em qualquer campo de data do sistema operacional —
               é o gesto que o teclado espera e o único caminho sem mouse até a grade. */
            if (e.key === 'ArrowDown' && !disabled) { e.preventDefault(); setOpen(true); }
          }}
          disabled={disabled}
          tabIndex={tabIndex}
          placeholder={placeholder}
          inputMode="numeric"
          maxLength={10}
          aria-invalid={error || undefined}
          /* ⚠ ÂMBAR, NÃO VERMELHO (item 1b). Vermelho é a cor de "o banco recusou"; aqui
              nada foi recusado — o campo está incompleto ou o dia não existe, e o valor
              anterior continua de pé. O `title` diz o que a borda só insinua. */
          title={error ? 'Data inválida' : undefined}
          className={cn(
            compact ? 'h-6 pl-2 pr-7 text-[11px]' : 'h-8 pr-8 text-[12px]',
            className,
            error && 'border-amber-500 focus-visible:ring-amber-500/40',
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
