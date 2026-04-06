import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw } from 'lucide-react';

interface Props {
  quantidade: number;
  pesoKg: number;
  origemLabel: string;
  destinoLabel: string;
  pesoMedioOrigem: number | null;
  isPrevisto: boolean;
  onRequestRegister: () => void;
  submitting: boolean;
  canRegister: boolean;
}

function fmt(v: number | null, dec = 1) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function ReclassificacaoResumoPanel({
  quantidade, pesoKg, origemLabel, destinoLabel,
  pesoMedioOrigem, isPrevisto,
  onRequestRegister, submitting, canRegister,
}: Props) {
  const totalKg = quantidade * pesoKg;
  const arrobasCab = pesoKg ? pesoKg / 15 : 0;
  const totalArrobas = totalKg / 15;

  return (
    <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
      <h3 className="text-[12px] font-semibold text-foreground leading-tight">Resumo da Operação</h3>
      <Separator />

      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex justify-between"><span className="text-muted-foreground">Origem</span><strong>{origemLabel || '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Destino</span><strong>{destinoLabel || '-'}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><strong>{quantidade || '-'} cab.</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Peso médio</span><strong>{pesoKg ? `${fmt(pesoKg)} kg` : '-'}</strong></div>
        {pesoMedioOrigem && (
          <div className="flex justify-between"><span className="text-muted-foreground">Peso sug. origem</span><strong className="text-orange-600">{fmt(pesoMedioOrigem)} kg</strong></div>
        )}
      </div>

      {pesoKg > 0 && quantidade > 0 && (
        <>
          <Separator />
          <div className="space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Peso Total</span><strong className="tabular-nums">{fmt(totalKg, 1)} kg</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">@/cab</span><strong className="tabular-nums">{fmt(arrobasCab, 2)}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total @</span><strong className="tabular-nums">{fmt(totalArrobas, 2)}</strong></div>
          </div>
        </>
      )}

      <Separator />

      <div className="flex justify-between text-[10px] leading-tight">
        <span className="text-muted-foreground">Cenário</span>
        <strong className={isPrevisto ? 'text-orange-600' : 'text-emerald-600'}>
          {isPrevisto ? 'Previsto' : 'Realizado'}
        </strong>
      </div>

      <Separator />

      <Button
        type="button"
        className={`w-full h-7 text-[10px] font-bold ${isPrevisto ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
        onClick={onRequestRegister}
        disabled={!canRegister || submitting}
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        {submitting ? 'Registrando...' : 'Registrar Reclassificação'}
      </Button>
    </div>
  );
}
