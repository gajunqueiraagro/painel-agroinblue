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
import type { Fazenda } from '@/contexts/FazendaContext';
import { fazendaAdministrativa, avisoFazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';

export interface FazendaSelectProps {
  value: string;
  onChange: (id: string) => void;
  fazendas: Fazenda[];
  /**
   * ⚠ DEIXOU DE SER SÓ DIVIDENDOS — FIN-FAZENDA-ADM-01. A pergunta passou a ser a mesma da
   * safra: o ESCOPO da conta é administrativo? Dividendos continua entrando (é uma das duas
   * portas), agora como caso particular de uma regra maior. O nome da prop já era o certo.
   */
  forcaAdministrativo: boolean;
  label?: string;
  className?: string;             // wrapper
  triggerClassName?: string;      // ex.: fieldBg
  /** 133e adendo — gatilho compacto da Mesa (20px/11px). A caixa aberta segue o A23. */
  size?: 'default' | 'compact';
  tabIndex?: number;
  disabled?: boolean;             // disabled adicional (além de forçado)
  hideAviso?: boolean;            // Mesa: suprime o texto "Dividendos são salvos..." (densidade)
}

export function FazendaSelect({
  value, onChange, fazendas, forcaAdministrativo,
  label, className, triggerClassName, size = 'default', tabIndex, disabled, hideAviso,
}: FazendaSelectProps) {
  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Administrativo sempre na fazenda Administrativo do cliente — a busca mora na lib.
  const fazendaAdm = useMemo(() => fazendaAdministrativa(fazendas), [fazendas]);
  useEffect(() => {
    if (forcaAdministrativo && fazendaAdm && value !== fazendaAdm.id) {
      onChange(fazendaAdm.id);
    }
  }, [forcaAdministrativo, fazendaAdm, value, onChange]);

  return (
    <div className={className}>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={forcaAdministrativo || disabled}>
        <SelectTrigger tabIndex={tabIndex} className={cn('h-8', size === 'compact' && 'h-5 px-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3', triggerClassName)}><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      {!hideAviso && forcaAdministrativo && fazendaAdm && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
          <AlertTriangle className="h-3 w-3" />
          {avisoFazendaAdministrativa(fazendaAdm.nome)}
        </p>
      )}
    </div>
  );
}
