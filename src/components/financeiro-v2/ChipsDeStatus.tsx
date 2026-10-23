/**
 * AS PÍLULAS DE STATUS — P79 (Gabriel 23/10/2026): extraídas da Contas a Pagar e Receber, a MESMA peça nas duas telas (CPR e Visão
 * Geral). "Copiar a CPR, nunca recriar": o DOM e as classes são os que a CPR desenhava (a CPR não muda de aparência nem de
 * comportamento — o gate dela prova). Quem usa decide QUAIS pílulas: a CPR mostra os quatro status; a Visão Geral, os três não
 * realizados (o realizado entra sempre) e a pílula "Vencidos".
 * ⚠ LARGURA ESTÁVEL: ligar/desligar troca só a cor (o rótulo não muda) — nada se desloca.
 */
import { cn } from '@/lib/utils';
import { STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';

/** Os status das pílulas da CPR, na ordem dela. */
export const STATUS_DISPONIVEIS = ['previsto', 'programado', 'agendado', 'realizado'] as const;
/** O padrão das duas telas: os três não realizados ligados (a regra da CPR). */
export const STATUS_INICIAIS: string[] = ['previsto', 'programado', 'agendado'];

export interface PilulaDeStatus { chave: string; rotulo?: string; title?: string }

export const pilulasDosStatus = (status: readonly string[]): PilulaDeStatus[] => status.map((s) => ({ chave: s }));

export function ChipsDeStatus({ pilulas, ligados, onAlternar, compacto = false, testId = 'cpr-status', className }: {
  pilulas: readonly PilulaDeStatus[];
  ligados: readonly string[];
  onAlternar: (chave: string) => void;
  /** 16px / 9,5px (o Ampliado da CPR); senão 22px / 10px */
  compacto?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)} data-testid={testId}>
      {pilulas.map((p) => {
        const ligado = ligados.includes(p.chave);
        return (
          <button
            key={p.chave}
            type="button"
            aria-pressed={ligado}
            title={p.title}
            data-testid={testId === 'cpr-status' ? undefined : `${testId}-${p.chave}`}
            onClick={() => onAlternar(p.chave)}
            className={cn(
              'rounded-md border font-medium transition-colors',
              compacto ? 'h-[16px] px-1.5 text-[9.5px] leading-none' : 'h-[22px] px-2 text-[10px]',
              ligado
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground hover:bg-muted',
            )}
          >
            {p.rotulo ?? STATUS_FILTRO_LABEL[p.chave] ?? p.chave}
          </button>
        );
      })}
    </div>
  );
}

/** Liga ou desliga uma chave na lista (a ordem de quem já estava fica). */
export const alternarNaLista = (atual: readonly string[], chave: string): string[] =>
  atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave];
