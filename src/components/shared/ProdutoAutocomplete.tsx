// ProdutoAutocomplete — extraído do LancamentoV2Dialog (PR-U2c-1A) para FONTE ÚNICA.
// P0-3: busca SERVER-SIDE (ilike + limit + debounce) — corrige o cap de 1000 do
// fetch-tudo-no-mount (agora só traz o que casa o termo). `value`/`onChange` = o campo.
// `onCommit?` (opcional) dispara em Enter/seleção — a Mesa usa p/ gravar só em ação
// explícita (o oficial não passa → comportamento inalterado). Consumido pelo
// LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ProdutoAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;   // P0-3: seleção/Enter (a Mesa grava aqui)
  clienteId: string | null | undefined;
  label?: string;
  className?: string;        // wrapper (ex.: "col-span-2")
  inputClassName?: string;
  tabIndex?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function ProdutoAutocomplete({
  value, onChange, onCommit, clienteId, label,
  className, inputClassName, tabIndex,
  placeholder = 'Descrição do produto', disabled,
}: ProdutoAutocompleteProps) {
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // P0-3: busca SERVER-SIDE por termo (ilike), debounced, limitada — sem cap de 1000.
  useEffect(() => {
    const term = value.trim();
    if (!clienteId || term.length < 2) { setSugestoes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('descricao')
        .eq('cliente_id', clienteId)
        .ilike('descricao', `%${term}%`)
        .not('descricao', 'is', null)
        .order('descricao')
        .limit(30);
      const unique = [...new Set((data ?? []).map(r => r.descricao).filter(Boolean) as string[])]
        .filter(p => p !== value)
        .slice(0, 8);
      setSugestoes(unique);
      setHighlight(-1);
    }, 250);
    return () => clearTimeout(t);
  }, [value, clienteId]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Tab') { setOpen(false); return; } // deixa o Tab seguir
    if (e.key === 'Enter') {
      if (open && highlight >= 0 && sugestoes[highlight]) {
        e.preventDefault();
        onChange(sugestoes[highlight]);
        onCommit?.(sugestoes[highlight]);
        setOpen(false);
      } else {
        onCommit?.(value);   // texto livre confirmado
      }
      return;
    }
    if (!open || sugestoes.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(prev => { const next = Math.min(prev + 1, sugestoes.length - 1); itemRefs.current[next]?.scrollIntoView({ block: 'nearest' }); return next; });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(prev => { const next = Math.max(prev - 1, 0); itemRefs.current[next]?.scrollIntoView({ block: 'nearest' }); return next; });
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Input
        tabIndex={tabIndex}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => { if (value.trim().length >= 2) setOpen(true); }}
        onKeyDown={handleKeyDown}
        className={cn('h-8', inputClassName)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />
      {open && sugestoes.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
          {sugestoes.map((p, i) => (
            <div
              key={p}
              ref={el => { itemRefs.current[i] = el; }}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer',
                i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
              onMouseDown={e => { e.preventDefault(); onChange(p); onCommit?.(p); setOpen(false); }}
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
