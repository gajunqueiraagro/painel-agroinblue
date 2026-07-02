// FazendaSelect — extraído do LancamentoV2Dialog (PR-U2c-1B) para FONTE ÚNICA.
// Relocação pura: mesmo <Select>, mesmas fazendas operacionais (exclui __global__),
// mesma regra "Dividendos → fazenda Administrativo" (força via useEffect + aviso âmbar
// + disabled). `value`/`onChange` = o campo. Consumido pelo LancamentoV2Dialog e
// (PR-U2c-2) pela Mesa.
import { useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DARK_GLASS_CONTENT } from '@/components/shared/ContaBancariaSelect';
import type { Fazenda } from '@/contexts/FazendaContext';

export interface FazendaSelectProps {
  value: string;
  onChange: (id: string) => void;
  fazendas: Fazenda[];
  forcaAdministrativo: boolean;   // = macroCusto === 'Dividendos'
  label?: string;
  className?: string;             // wrapper
  triggerClassName?: string;      // ex.: fieldBg
  tabIndex?: number;
  disabled?: boolean;             // disabled adicional (além de forçado)
}

export function FazendaSelect({
  value, onChange, fazendas, forcaAdministrativo,
  label, className, triggerClassName, tabIndex, disabled,
}: FazendaSelectProps) {
  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Dividendos sempre na fazenda Administrativo do cliente.
  const fazendaAdm = useMemo(
    () => fazendas.find(f => f.nome?.toLowerCase().includes('administrat')),
    [fazendas],
  );
  useEffect(() => {
    if (forcaAdministrativo && fazendaAdm && value !== fazendaAdm.id) {
      onChange(fazendaAdm.id);
    }
  }, [forcaAdministrativo, fazendaAdm, value, onChange]);

  return (
    <div className={className}>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={forcaAdministrativo || disabled}>
        <SelectTrigger tabIndex={tabIndex} className={cn('h-8', triggerClassName)}><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent className={DARK_GLASS_CONTENT}>
          {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      {forcaAdministrativo && fazendaAdm && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
          <AlertTriangle className="h-3 w-3" />
          Dividendos são salvos automaticamente em {fazendaAdm.nome}
        </p>
      )}
    </div>
  );
}
