import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value === allValue
    ? allLabel
    : options.find(o => o.value === value)?.label || value;

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

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

  const handleSelect = (val: string) => {
    onValueChange(val);
    setOpen(false);
    setSearch('');
  };

  const handleTriggerClick = () => {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(allValue);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        className={cn(
          'flex h-6 w-full items-center justify-between rounded-md border border-input bg-background px-1.5 text-[10px] ring-offset-background',
          'focus:outline-none focus:ring-1 focus:ring-ring',
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-0.5 w-full min-w-[160px] rounded-md border bg-popover shadow-md">
          <div className="p-1">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full h-5 text-[10px] px-1.5 rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={e => {
                if (e.key === 'Escape') { setOpen(false); setSearch(''); }
                if (e.key === 'Enter' && filtered.length === 1) {
                  handleSelect(filtered[0].value);
                }
              }}
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto px-0.5 pb-0.5">
            <button
              type="button"
              onClick={() => handleSelect(allValue)}
              className={cn(
                'w-full text-left px-1.5 py-[3px] text-[10px] rounded-sm hover:bg-accent cursor-pointer',
                value === allValue && 'bg-accent font-semibold',
              )}
            >
              {allLabel}
            </button>
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleSelect(o.value)}
                className={cn(
                  'w-full text-left px-1.5 py-[3px] text-[10px] rounded-sm hover:bg-accent cursor-pointer truncate',
                  value === o.value && 'bg-accent font-semibold',
                )}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-[10px] text-muted-foreground px-1.5 py-1">Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
