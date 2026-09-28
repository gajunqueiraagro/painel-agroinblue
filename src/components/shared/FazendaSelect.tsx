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
import { MSG_FAZENDA_OBRIGATORIA } from '@/lib/zoo/fazendaDoFormulario';

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
  /**
   * FIN-FAZENDA-PADRAO-01 — campo OBRIGATORIO: vazio (e nao forcado ao Administrativo) fica com borda vermelha e
   * "Selecione a fazenda do lançamento." embaixo, o desenho do TRANSF-FAZENDA-ORIGEM-01. Sem a prop, nada muda.
   */
  obrigatorio?: boolean;
  /** `id` do bloco, para quem grava levar o foco ao campo quando ele falta. */
  id?: string;
}

export function FazendaSelect({
  value, onChange, fazendas, forcaAdministrativo,
  label, className, triggerClassName, size = 'default', tabIndex, disabled, hideAviso, obrigatorio, id,
}: FazendaSelectProps) {
  const fazOperacionais = fazendas.filter(f => f.id !== '__global__');

  // Administrativo sempre na fazenda Administrativo do cliente — a busca mora na lib.
  const fazendaAdm = useMemo(() => fazendaAdministrativa(fazendas), [fazendas]);
  useEffect(() => {
    if (forcaAdministrativo && fazendaAdm && value !== fazendaAdm.id) {
      onChange(fazendaAdm.id);
    }
  }, [forcaAdministrativo, fazendaAdm, value, onChange]);

  /* ⚠ FORCADO AO ADMINISTRATIVO NAO FALTA: o efeito acima o preenche no mesmo ciclo, e acusar "falta" nesse
     instante seria um vermelho que pisca e some. */
  const falta = !!obrigatorio && !value && !(forcaAdministrativo && fazendaAdm);

  return (
    <div className={className} id={id}>
      {label && <Label className="text-[10px]">{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={forcaAdministrativo || disabled}>
        <SelectTrigger tabIndex={tabIndex} className={cn('h-8', size === 'compact' && 'h-5 px-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3', triggerClassName, falta && 'border-destructive')}><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      {falta && <p className="mt-0.5 text-[10px] text-destructive">{MSG_FAZENDA_OBRIGATORIA}</p>}
      {!hideAviso && forcaAdministrativo && fazendaAdm && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
          <AlertTriangle className="h-3 w-3" />
          {avisoFazendaAdministrativa(fazendaAdm.nome)}
        </p>
      )}
    </div>
  );
}
