// ProdutoAutocomplete — extraído do LancamentoV2Dialog (PR-U2c-1A) para FONTE ÚNICA.
// Relocação pura: mesmo markup, mesmo teclado (↑↓ Enter/Esc/Tab), mesma busca de
// sugestões (histórico de descrições do cliente). SEM side effects — só onChange do
// valor. `value`/`onChange` são o campo (descrição); o componente cuida de sugestões,
// dropdown e navegação. Consumido pelo LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ProdutoAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  clienteId: string | null | undefined;
  label?: string;
  className?: string;        // wrapper (ex.: "col-span-2")
  inputClassName?: string;
  tabIndex?: number;
  placeholder?: string;
  disabled?: boolean;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProdutoAutocomplete({
  value, onChange, clienteId, label,
  className, inputClassName, tabIndex,
  placeholder = 'Descrição do produto', disabled,
}: ProdutoAutocompleteProps) {
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch distinct product names for suggestions
  useEffect(() => {
    if (!clienteId) return;
    (async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('descricao')
        .eq('cliente_id', clienteId)
        .not('descricao', 'is', null)
        .order('descricao');
      if (data) {
        const unique = [...new Set(data.map(r => r.descricao).filter(Boolean) as string[])];
        setSugestoes(unique);
      }
    })();
  }, [clienteId]);

  // Filter product suggestions by current input
  const filtered = useMemo(() => {
    if (!value.trim() || value.trim().length < 2) return [];
    const term = norm(value);
    return sugestoes
      .filter(p => norm(p).includes(term) && p !== value)
      .slice(0, 8);
  }, [value, sugestoes]);

  // Close product suggestions on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return; // let Tab proceed naturally
    }
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(prev => {
        const next = Math.min(prev + 1, filtered.length - 1);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(prev => {
        const next = Math.max(prev - 1, 0);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && filtered[highlight]) {
        e.preventDefault();
        onChange(filtered[highlight]);
        setOpen(false);
      }
      // If no highlight (-1), let Enter pass through naturally
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Input
        tabIndex={tabIndex}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
        onKeyDown={handleKeyDown}
        className={cn('h-8', inputClassName)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
          {filtered.map((p, i) => (
            <div
              key={p}
              ref={el => { itemRefs.current[i] = el; }}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer',
                i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
              onMouseDown={e => {
                e.preventDefault();
                onChange(p);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
