/**
 * FluxoCaixaModal — orquestrador do Modal Fluxo de Caixa Realizado.
 *
 * Camada 3 / FASE 1 / Commit 4B. Componente puro de orquestração:
 *   1. Consome useFluxoCaixaModalData (hook do Commit 2)
 *   2. Mantém estado local `modo` (toggle Realizado/Confirmado/Estimado)
 *   3. Layout 2 colunas (12-grid):
 *      Header sticky (título + subtítulo + toggle)
 *      ├── Gráfico (col-span-7 lg)
 *      └── KPIs sticky (col-span-5 lg, layout vertical)
 *      Top Impactos (col-span-12)
 *      Rodapé (warnings + origemProjecao)
 *
 * Read-only analítico: não cria, edita ou deleta nada.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { useFluxoCaixaModalData } from '@/hooks/useFluxoCaixaModalData';
import type { ModoToggle } from '@/v2/lib/fluxoCaixaModalTypes';
import { FluxoCaixaToggle } from './FluxoCaixaToggle';
import { FluxoCaixaKPIs } from './FluxoCaixaKPIs';
import { FluxoCaixaGrafico3Trilhos } from './FluxoCaixaGrafico3Trilhos';
import { FluxoCaixaTopImpactos } from './FluxoCaixaTopImpactos';

interface Props {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  ano: number;
  mesAlvo: number;
  painel: PainelConsultorDataResult | null;
  saldoInicialMeta: number;
  gridMetaConsolidado: SubcentroGrid[] | null;
  isContextoIndividual?: boolean;
}

export function FluxoCaixaModal({
  open,
  onClose,
  clienteId,
  ano,
  mesAlvo,
  painel,
  saldoInicialMeta,
  gridMetaConsolidado,
  isContextoIndividual,
}: Props) {
  const [modo, setModo] = useState<ModoToggle>('realizado');

  const { data, loading, error } = useFluxoCaixaModalData({
    clienteId,
    ano,
    mesAlvo,
    modo,
    painel,
    saldoInicialMeta,
    gridMetaConsolidado,
    isContextoIndividual,
    enabled: open,
  });

  // Subtítulo vem pré-formatado do builder; fallback string garante texto
  // descritivo mesmo enquanto data carrega (a11y aria-describedby).
  const subtitulo =
    data?.subtituloPeriodo ?? `Análise de fluxo de caixa realizado versus meta — Real ${ano} vs Meta ${ano}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-6xl max-h-[92vh] overflow-y-auto p-0"
        aria-describedby="fluxo-caixa-modal-desc"
      >
        {/* Header sticky com título, subtítulo e toggle */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3.5 space-y-2">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold m-0 leading-tight">
              Fluxo de Caixa Realizado
            </DialogTitle>
            <DialogDescription
              id="fluxo-caixa-modal-desc"
              className="text-xs text-muted-foreground"
            >
              {subtitulo}
            </DialogDescription>
          </DialogHeader>
          <FluxoCaixaToggle modo={modo} onChange={setModo} />
        </div>

        {/* Corpo */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200 px-3 py-2">
              Erro ao carregar lançamentos: {error.message}
            </div>
          )}

          {loading && !data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="border border-border bg-muted/30 rounded-md p-2.5 h-16 animate-pulse" />
                ))}
              </div>
              <div className="border border-border bg-muted/30 rounded-md h-80 animate-pulse" />
              <div className="border border-border bg-muted/30 rounded-md h-32 animate-pulse" />
            </div>
          ) : (
            <>
              {/* Layout 2 colunas: gráfico à esquerda, KPIs sticky à direita */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7 min-w-0">
                  <FluxoCaixaGrafico3Trilhos
                    real2025={data?.trilhoReal2025 ?? null}
                    meta2026={data?.trilhoMeta2026 ?? null}
                    real2026={data?.trilhoReal2026 ?? null}
                    modo={modo}
                    mesAlvo={mesAlvo}
                    mesHorizonteInclusivo={data?.mesHorizonteInclusivo ?? mesAlvo - 1}
                  />
                </div>
                <div className="lg:col-span-5 lg:sticky lg:top-4 lg:self-start min-w-0">
                  <FluxoCaixaKPIs
                    kpis={data?.kpis ?? null}
                    labelCard1={data?.labelCard1 ?? 'Fluxo Real'}
                    labelCard2={data?.labelCard2 ?? 'Fluxo Meta'}
                    layout="vertical"
                  />
                </div>
              </div>

              {/* Top Impactos — full width */}
              <FluxoCaixaTopImpactos impactos={data?.topImpactos ?? []} />
            </>
          )}

          {/* Rodapé: warnings + origem */}
          <div className="text-[11px] text-muted-foreground space-y-1 pt-3 border-t border-border">
            {data?.warnings && data.warnings.length > 0 && (
              <div className="space-y-0.5">
                {data.warnings.map((w, i) => (
                  <div key={i} className="text-amber-700 dark:text-amber-300">⚠ {w}</div>
                ))}
              </div>
            )}
            {data?.origemProjecao && data.origemProjecao.length > 0 && (
              <div>
                <span className="font-semibold">Origem da projeção:</span> {data.origemProjecao.join(' • ')}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
