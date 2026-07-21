import * as React from 'react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';

interface SearchableSelectProps {
  value: string;
  onValueChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  disabled?: boolean;
  className?: string;
  /** Densidade opt-in (usada só pela Compra): itens ~12px, busca sticky, lista mais alta.
   *  Default false → visual idêntico ao atual nos demais fluxos (Abate/Venda/Mapa/FinV2). */
  dense?: boolean;
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
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
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((val: string) => {
    onValueChange(val);
    setOpen(false);
    setSearch('');
  }, [onValueChange]);

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
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
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
        setSearch('');
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
            setSearch(e.key);
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
        <div className={cn("absolute z-50 w-full min-w-[140px] rounded-md border bg-popover shadow-md", openUp ? "bottom-full mb-0.5" : "top-full mt-0.5")}>
          <div className={cn('px-0.5 pt-0.5 pb-0', dense && 'sticky top-0 z-10 bg-popover px-1 pt-1 pb-1')}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
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
                  'w-full text-left leading-tight rounded-sm cursor-pointer truncate',
                  dense ? 'px-2 py-1 text-[12px]' : 'px-1 py-[1.5px] text-[9px]',
                  idx === highlightIdx && 'bg-accent text-accent-foreground',
                  idx !== highlightIdx && 'hover:bg-accent/50',
                  value === o.value && 'font-semibold',
                )}
              >
                {o.label}
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
