import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';

type StatusOpcao = StatusOperacional | 'meta';

interface Props {
  quantidade: number;
  pesoKg: number;
  origemLabel: string;
  destinoLabel: string;
  pesoMedioOrigem: number | null;
  statusOp: StatusOpcao;
  onRequestRegister: () => void;
  submitting: boolean;
  canRegister: boolean;
  onBack?: () => void;
  backLabel?: string;
}

function fmt(v: number | null, dec = 1) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const STATUS_COLORS: Record<StatusOpcao, { text: string; bg: string; label: string }> = {
  realizado: { text: 'text-green-600', bg: 'bg-green-500', label: STATUS_LABEL.realizado },
  programado: { text: 'text-blue-600', bg: 'bg-blue-500', label: STATUS_LABEL.programado },
  agendado: { text: 'text-purple-600', bg: 'bg-purple-500', label: STATUS_LABEL.agendado },
  previsto: { text: 'text-cyan-600', bg: 'bg-cyan-500', label: STATUS_LABEL.previsto },
  meta: { text: 'text-orange-600', bg: 'bg-orange-500', label: META_VISUAL.label },
};

export function ReclassificacaoResumoPanel({
  quantidade, pesoKg, origemLabel, destinoLabel,
  pesoMedioOrigem, statusOp,
  onRequestRegister, submitting, canRegister,
  onBack, backLabel,
}: Props) {
  const totalKg = quantidade * pesoKg;
  const arrobasCab = pesoKg ? pesoKg / 30 : 0;
  const totalArrobas = totalKg / 30;
  const colors = STATUS_COLORS[statusOp] || STATUS_COLORS.realizado;

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

      <div className="flex justify-between items-center text-[10px] leading-tight">
        <span className="text-muted-foreground">Cenário</span>
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
          <strong className={colors.text}>{colors.label}</strong>
        </span>
      </div>

      <Separator />

      <Button
        type="button"
        className={`w-full h-7 text-[10px] font-bold ${statusOp === 'meta' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
        onClick={onRequestRegister}
        disabled={!canRegister || submitting}
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        {submitting ? 'Registrando...' : 'Registrar Reclassificação'}
      </Button>

      {onBack && (
        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-md py-1.5 transition-colors hover:bg-primary/20 mt-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {backLabel || 'Retornar à Conciliação'}
        </button>
      )}
    </div>
  );
}
