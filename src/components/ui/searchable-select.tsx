import * as React from 'react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';

export interface OpcaoSearchable {
  value: string;
  label: string;
  /** Texto curto à direita do nome, em tom apagado — ex.: a contagem de uso.
   *  ⚠ NÃO ENTRA NA BUSCA: quem digita procura pelo nome. Se a contagem casasse,
   *  digitar "41" traria todo fornecedor com 41 lançamentos. */
  hint?: string;
}

const PREFIXO = 'ss-busca:';

/**
 * Apaga as buscas lembradas. Só o X do próprio campo e o "Limpar" geral da tela
 * esquecem — fechar, escolher ou apertar Esc, não.
 *
 * @param prefixo quando informado, só as chaves que começam com ele.
 */
export function limparBuscasLembradas(prefixo?: string): void {
  try {
    const alvo = PREFIXO + (prefixo ?? '');
    /* Recolhe ANTES de remover: `key(i)` reindexa a cada remoção, e apagar
       durante a varredura pula uma chave a cada duas. */
    const chaves: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(alvo)) chaves.push(k);
    }
    chaves.forEach(k => sessionStorage.removeItem(k));
  } catch {
    /* navegação privada / storage bloqueado — a memória é conforto, não contrato */
  }
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  options: OpcaoSearchable[];
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  disabled?: boolean;
  className?: string;
  /** Densidade opt-in (usada só pela Compra): itens ~12px, busca sticky, lista mais alta.
   *  Default false → visual idêntico ao atual nos demais fluxos (Abate/Venda/Mapa/FinV2). */
  dense?: boolean;
  /** Classes extras no PAINEL aberto (dropdown), para o tema escuro do sistema.
   *  ADITIVO: `undefined` mantém `bg-popover` e o visual de hoje — Abate, Venda, Mapa
   *  e FinV2 não passam a prop e não mudam em nada. Quem quiser escurecer usa
   *  seletores descendentes (`[&_input]`, `[&_button]`), porque os itens desta lista
   *  são <button> e não `[role=option]`. */
  contentClassName?: string;
  /**
   * Liga a MEMÓRIA DA BUSCA desta instância, gravada em `sessionStorage` sob esta
   * chave. Sem ela o componente se comporta exatamente como antes — as outras 24
   * montagens do app (26 no total, em 11 arquivos) não mudam em nada.
   *
   * ⚠ COM MEMÓRIA, FECHAR NÃO ESQUECE. Clicar fora, apertar Esc, escolher um item
   * ou sair com Tab preservam o texto digitado e a lista filtrada. Quem esquece é
   * o X do campo e o "Limpar" da tela — e só eles.
   *
   * Nasceu de uma lista de 3.361 fornecedores: achar "Wilson" entre seis homônimos
   * custava seis reaberturas, e cada reabertura fazia o operador digitar de novo.
   */
  persistKey?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Buscar...',
  allLabel = 'Todos',
  allValue = '__all__',
  disabled = false,
  className,
  dense = false,
  contentClassName,
  persistKey,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const chave = persistKey ? PREFIXO + persistKey : null;
  const [search, setSearch] = useState(() => {
    if (!chave) return '';
    try { return sessionStorage.getItem(chave) ?? ''; } catch { return ''; }
  });

  /* Escrever a busca e lembrá-la são o MESMO ato: separá-los criaria o estado em
     que a tela mostra um texto e a sessão guarda outro. */
  const alterarBusca = useCallback((txt: string) => {
    setSearch(txt);
    if (!chave) return;
    try {
      if (txt) sessionStorage.setItem(chave, txt);
      else sessionStorage.removeItem(chave);
    } catch { /* storage bloqueado — segue sem memória */ }
  }, [chave]);

  /* Fechar só esquece quando NÃO há memória. Com `persistKey`, fechar é fechar. */
  const esquecerAoFechar = useCallback(() => {
    if (!chave) setSearch('');
  }, [chave]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedLabel = value === allValue
    ? allLabel
    : options.find(o => o.value === value)?.label || value;

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // Cap de render: sem virtualização, listas grandes (milhares de contrapartes)
  // geravam DOM gigante e travavam o dropdown. Limite de 50 itens visíveis,
  // mesmo padrão do FornecedorSelect (Z3); acima disso o excedente é anunciado
  // e o usuário refina a busca. A busca continua operando sobre a lista
  // completa — o cap afeta apenas o DOM. Para listas pequenas, comportamento
  // idêntico ao anterior.
  const RENDER_CAP = 50;
  const filteredVisiveis = useMemo(() => filtered.slice(0, RENDER_CAP), [filtered]);
  const excedente = filtered.length - filteredVisiveis.length;

  const selectableItems = useMemo(() => {
    return [{ value: allValue, label: allLabel }, ...filteredVisiveis];
  }, [filteredVisiveis, allValue, allLabel]);

  useEffect(() => {
    setHighlightIdx(filteredVisiveis.length > 0 ? 1 : 0);
  }, [filteredVisiveis]);

  useEffect(() => {
    const el = itemRefs.current[highlightIdx];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        esquecerAoFechar();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [esquecerAoFechar]);

  const handleSelect = useCallback((val: string) => {
    onValueChange(val);
    setOpen(false);
    esquecerAoFechar();
  }, [onValueChange, esquecerAoFechar]);

  const handleTriggerClick = () => {
    if (disabled) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 160);
    }
    setOpen(true);
    setHighlightIdx(filteredVisiveis.length > 0 ? 1 : 0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(allValue);
    /* ⚠ O X ESQUECE SEMPRE, com memória ou sem: é o gesto de "recomeçar". */
    alterarBusca('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      esquecerAoFechar();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, selectableItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectableItems[highlightIdx]) {
        handleSelect(selectableItems[highlightIdx].value);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (selectableItems[highlightIdx]) {
        handleSelect(selectableItems[highlightIdx].value);
      } else {
        setOpen(false);
        esquecerAoFechar();
      }
      setTimeout(() => {
        const trigger = containerRef.current?.querySelector('button') as HTMLButtonElement | null;
        if (trigger) {
          trigger.focus();
        }
      }, 0);
    }
  };

  itemRefs.current = [];

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleTriggerClick}
        onKeyDown={(e) => {
          if (!open && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleTriggerClick();
          }
          // Printable key → open dropdown and seed search with that char
          if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            alterarBusca(e.key);
            handleTriggerClick();
          }
        }}
        disabled={disabled}
        className={cn(
          'flex h-6 w-full items-center justify-between rounded-md border border-input bg-background px-1.5 text-[10px] ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="truncate text-left flex-1">
          {open ? '' : selectedLabel}
        </span>
        <span className="flex items-center gap-0">
          {value !== allValue && !disabled && (
            <span onClick={handleClear} className="cursor-pointer hover:text-destructive p-0.5">
              <X className="h-2.5 w-2.5" />
            </span>
          )}
          <ChevronsUpDown className="h-2.5 w-2.5 opacity-50 shrink-0" />
        </span>
      </button>

      {open && (
        <div className={cn("absolute z-50 w-full min-w-[140px] rounded-md border bg-popover shadow-md", openUp ? "bottom-full mb-0.5" : "top-full mt-0.5", contentClassName)}>
          <div className={cn('px-0.5 pt-0.5 pb-0', dense && 'sticky top-0 z-10 bg-popover px-1 pt-1 pb-1')}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => alterarBusca(e.target.value)}
              placeholder={placeholder}
              className={cn(
                'w-full rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring',
                dense ? 'h-6 text-[11px] px-1.5' : 'h-4 text-[9px] px-1',
              )}
              onKeyDown={handleKeyDown}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div ref={listRef} className={cn('overflow-y-auto', dense ? 'max-h-[300px] px-1 pb-1' : 'max-h-[120px] px-0.5 pb-0.5')}>
            {selectableItems.map((o, idx) => (
              <button
                key={o.value}
                type="button"
                ref={el => { itemRefs.current[idx] = el; }}
                onClick={() => handleSelect(o.value)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={cn(
                  'w-full text-left leading-tight rounded-sm cursor-pointer',
                  dense ? 'px-2 py-1 text-[12px]' : 'px-1 py-[1.5px] text-[9px]',
                  idx === highlightIdx && 'bg-accent text-accent-foreground',
                  idx !== highlightIdx && 'hover:bg-accent/50',
                  value === o.value && 'font-semibold',
                )}
              >
                {/* ⚠ O NOME ENCOLHE, A CONTAGEM NAO: com `truncate` no conjunto, o
                    numero seria a primeira coisa a sumir — e ele e' o motivo do
                    operador estar olhando. */}
                <span className="flex items-center gap-1 min-w-0">
                  <span className="truncate">{o.label}</span>
                  {o.hint ? <span className="shrink-0 opacity-60">· {o.hint}</span> : null}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-[9px] text-muted-foreground px-1 py-0.5">Nenhum resultado</div>
            )}
            {excedente > 0 && (
              <div className="text-[9px] text-muted-foreground px-1 py-0.5 border-t border-border/50">
                +{excedente} resultado{excedente === 1 ? '' : 's'} — refine a busca
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
