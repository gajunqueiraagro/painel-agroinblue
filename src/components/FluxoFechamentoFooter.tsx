/**
 * FluxoFechamentoFooter
 *
 * Barra fixa no rodapé com atalhos de navegação do fluxo operacional de fechamento:
 *   Movimentações → Lançar Rebanho em Pastos → Valor do Rebanho
 *
 * Apresentação apenas. Não altera dados. Cada tela informa qual passo está e
 * recebe callbacks opcionais para "voltar" e "próximo".
 */
import { ChevronLeft, ChevronRight, BarChart3, Map as MapIcon, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type FluxoStep = 'movimentacoes' | 'pastos' | 'valor_rebanho';

interface StepInfo {
  label: string;
  icon: React.ElementType;
}

const STEPS: Record<FluxoStep, StepInfo> = {
  movimentacoes: { label: 'Movimentações', icon: BarChart3 },
  pastos: { label: 'Lançar em Pastos', icon: MapIcon },
  valor_rebanho: { label: 'Valor do Rebanho', icon: DollarSign },
};

const SEQUENCE: FluxoStep[] = ['movimentacoes', 'pastos', 'valor_rebanho'];

interface Props {
  current: FluxoStep;
  onPrev?: () => void;
  onNext?: () => void;
  /** Offset extra no rodapé (default 64px = altura do BottomNav) */
  bottomOffset?: number;
}

export function FluxoFechamentoFooter({ current, onPrev, onNext, bottomOffset = 64 }: Props) {
  const idx = SEQUENCE.indexOf(current);
  const prevStep = idx > 0 ? SEQUENCE[idx - 1] : null;
  const nextStep = idx >= 0 && idx < SEQUENCE.length - 1 ? SEQUENCE[idx + 1] : null;

  if (!prevStep && !nextStep) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]"
      style={{ bottom: bottomOffset }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 max-w-screen-2xl mx-auto">
        {/* Voltar */}
        <div className="flex-1 flex justify-start">
          {prevStep && onPrev ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onPrev}
              className="h-8 text-[11px] font-semibold gap-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Voltar para</span>
              <StepBadge step={prevStep} />
            </Button>
          ) : <span />}
        </div>

        {/* Indicador do passo atual */}
        <div className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
          <span className="font-bold">{idx + 1}</span>
          <span>/</span>
          <span>{SEQUENCE.length}</span>
          <span className="ml-1 font-semibold uppercase tracking-wider">{STEPS[current].label}</span>
        </div>

        {/* Próximo */}
        <div className="flex-1 flex justify-end">
          {nextStep && onNext ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onNext}
              className="h-8 text-[11px] font-semibold gap-1 text-primary hover:text-primary"
            >
              <span className="hidden sm:inline">Próximo passo:</span>
              <StepBadge step={nextStep} />
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}

function StepBadge({ step }: { step: FluxoStep }) {
  const info = STEPS[step];
  const Icon = info.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-foreground">
      <Icon className="h-3 w-3" />
      <span className="font-bold">{info.label}</span>
    </span>
  );
}
