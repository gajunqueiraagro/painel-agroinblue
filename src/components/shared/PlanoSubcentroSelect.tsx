// PlanoSubcentroSelect — extraído do LancamentoV2Dialog (PR-U2c-1D) para FONTE ÚNICA.
// Relocação pura: mesmo Popover+busca+lista, mesmo teclado, mesmo filtro por
// tipo_operacao (subárvore por tipo). Efeito colateral (preenche macro/centro/escopo
// a partir do plano) sai via `onSelected(subcentro, cls)`. A BUSCA é CONTROLADA porque
// o caller (LancamentoV2Dialog) reseta a busca ao trocar tipo_operacao. `value`/`onChange`
// = o campo subcentro. Consumido pelo LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

export interface PlanoSubcentroSelectProps {
  value: string;                                                    // subcentro
  onChange: (v: string) => void;                                   // seta o subcentro (sem side effect)
  onSelected?: (subcentro: string, cls?: ClassificacaoItem) => void; // side effect: macro/centro/escopo
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;                                            // filtra a subárvore por tipo
  search: string;                                                  // busca CONTROLADA (o caller é dono)
  onSearchChange: (s: string) => void;
  label?: string;
  triggerClassName?: string;                                       // ex.: fieldBg
  tabIndex?: number;
  disabled?: boolean;
}

export function PlanoSubcentroSelect({
  value, onChange, onSelected, classificacoes, tipoOperacao,
  search, onSearchChange, label, triggerClassName, tabIndex, disabled,
}: PlanoSubcentroSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) {
      if (c.subcentro && !m.has(c.subcentro)) m.set(c.subcentro, c);
    }
    return m;
  }, [classificacoes]);

  /** Subcentros filtered by tipo_operacao then by search text.
   *  Uses the selected tipoOperacao directly – each type has its own subtree. */
  const filtered = useMemo(() => {
    const unique = Array.from(classMap.values());
    const byTipo = unique.filter(c => {
      if (!tipoOperacao) return true;
      // Flexible match: DB may store "3-Transferências" while UI uses "3-Transferência"
      if (tipoOperacao.startsWith('3-')) return c.tipo_operacao.startsWith('3-');
      return c.tipo_operacao === tipoOperacao;
    });
    if (!search.trim()) return byTipo;
    const term = search.toLowerCase();
    return byTipo.filter(c => c.subcentro.toLowerCase().includes(term));
  }, [classMap, search, tipoOperacao]);

  const handleSelect = (sub: string) => {
    onChange(sub);
    setOpen(false);
    onSearchChange('');
    const cls = classMap.get(sub);
    onSelected?.(sub, cls);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
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
      e.preventDefault();
      const sc = filtered[highlight];
      if (sc) handleSelect(sc.subcentro || '');
    } else if (e.key === 'Tab') {
      const sc = filtered[highlight];
      if (sc) handleSelect(sc.subcentro || '');
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) { onSearchChange(''); setHighlight(0); } }}>
        <PopoverTrigger asChild>
          <Button tabIndex={tabIndex} variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn("w-full h-8 justify-between font-normal text-xs", triggerClassName)}>
            <span className="truncate">{value || 'Selecione o subcentro...'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={searchInputRef}
              className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Buscar subcentro..."
              value={search}
              onChange={e => { onSearchChange(e.target.value); setHighlight(0); }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum subcentro encontrado</p>}
            {filtered.map((sc, idx) => (
              <button
                key={sc.subcentro || idx}
                ref={el => { itemRefs.current[idx] = el; }}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                  idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  value === sc.subcentro && idx !== highlight && "bg-accent/30",
                )}
                onClick={() => handleSelect(sc.subcentro || '')}
                onMouseEnter={() => setHighlight(idx)}
              >
                <Check className={cn("mr-2 h-4 w-4", value === sc.subcentro ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{sc.subcentro}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
