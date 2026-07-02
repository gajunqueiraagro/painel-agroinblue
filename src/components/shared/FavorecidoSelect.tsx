// FavorecidoSelect — extraído do LancamentoV2Dialog (PR-U2c-1C) para FONTE ÚNICA.
// Relocação pura: mesmo Popover+Button+busca+lista+botão "Novo", mesmo teclado.
// A BUSCA é CONTROLADA (o caller é dono de `search`/`onSearchChange`) porque o save
// do LancamentoV2Dialog reaproveita o texto digitado para auto-criar fornecedor.
// Efeito colateral (forma/dados de pagamento) sai via `onSelected(f)`; criação inline
// via `onCriarNovo`. Consumido pelo LancamentoV2Dialog e (PR-U2c-2) pela Mesa.
import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';

export interface FavorecidoSelectProps {
  value: string;                          // favorecidoId ('' = nenhum)
  onChange: (id: string) => void;         // seta o id (sem side effect)
  onSelected?: (f: FornecedorV2) => void; // side effect: forma/dados de pagamento
  fornecedores: FornecedorV2[];
  search: string;                         // busca CONTROLADA (o caller é dono)
  onSearchChange: (s: string) => void;
  onCriarNovo: () => void;                // botão "+" → abrir cadastro de fornecedor
  label?: string;
  triggerClassName?: string;              // ex.: fieldBg
  tabIndex?: number;
  disabled?: boolean;
}

function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function FavorecidoSelect({
  value, onChange, onSelected, fornecedores,
  search, onSearchChange, onCriarNovo,
  label, triggerClassName, tabIndex, disabled,
}: FavorecidoSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const fornecedoresList = useMemo(() =>
    fornecedores.filter(f => f.ativo !== false),
  [fornecedores]);

  const filtered = useMemo(() => {
    if (!search.trim()) return fornecedoresList;
    const q = normalizeSearch(search);
    return fornecedoresList.filter(f => normalizeSearch(f.nome).includes(q));
  }, [fornecedoresList, search]);

  useEffect(() => {
    setHighlight(0);
  }, [search]);

  useEffect(() => {
    const el = itemRefs.current[highlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const handleSelect = (fId: string) => {
    onChange(fId);
    setOpen(false);
    onSearchChange('');
    const f = fornecedores.find(x => x.id === fId);
    if (f) onSelected?.(f);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[highlight]) {
        e.preventDefault();
        handleSelect(filtered[highlight].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectedNome = useMemo(() => {
    if (!value) return '';
    return fornecedores.find(f => f.id === value)?.nome || '';
  }, [value, fornecedores]);

  return (
    <div>
      {label && <Label className="text-[10px]">{label}</Label>}
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) onSearchChange(''); }}>
          <PopoverTrigger asChild>
            <Button tabIndex={tabIndex} variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn("flex-1 min-w-0 h-8 justify-between font-normal text-xs", triggerClassName)}>
              <span className="truncate">{selectedNome || 'Selecione fornecedor...'}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={inputRef}
                className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Buscar fornecedor..."
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filtered.length === 0 && <p className="p-2 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado</p>}
              {filtered.map((f, idx) => (
                <button
                  key={f.id}
                  ref={el => { itemRefs.current[idx] = el; }}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                    idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    value === f.id && idx !== highlight && "bg-accent/30",
                  )}
                  onClick={() => handleSelect(f.id)}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === f.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{f.nome}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onCriarNovo} title="Novo Fornecedor">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
