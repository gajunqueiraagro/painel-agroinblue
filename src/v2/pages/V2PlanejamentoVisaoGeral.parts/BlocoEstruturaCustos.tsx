/**
 * BLOCO 3 — Estrutura Completa de Custos.
 * Custo Variável Pec + Custo Fixo Pec colapsáveis por grupo.
 * Sub-centros listados na ordem oficial do plano de contas.
 *
 * Marco 1.1.B: comparativo ano-1 vem null nos totais e subcentros
 * (documentado em DTO.warnings). UI já preparada para receber em Marco 1.2.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Bloco3Custos, GrupoCustoBloco } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco3Custos;
}

function formatBRL(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function GrupoCard({ grupo }: { grupo: GrupoCustoBloco }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="border border-border rounded-md bg-card mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate">{grupo.grupo}</span>
        </div>
        <div className="text-sm font-bold tabular-nums shrink-0 pl-3">
          {formatBRL(grupo.total.valor)}
        </div>
      </button>

      {aberto && (
        <div className="border-t border-border bg-muted/20 px-3 py-3 space-y-3">
          {grupo.centros.map(centro => (
            <div key={centro.centro}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  {centro.centro}
                </span>
                <span className="text-xs font-bold tabular-nums">
                  {formatBRL(centro.total.valor)}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {centro.subcentros.map(sub => (
                  <div
                    key={sub.subcentro}
                    className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-card border border-border/60"
                  >
                    <span className="text-foreground/80 truncate pr-2">{sub.subcentro}</span>
                    <span className="font-semibold tabular-nums shrink-0">{formatBRL(sub.valorMeta)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlocoEstruturaCustos({ data }: Props) {
  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Estrutura de Custos</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Plano de contas oficial — clique nos grupos para expandir centros e subcentros.
      </p>

      <GrupoCard grupo={data.custoVariavelPecuaria} />
      <GrupoCard grupo={data.custoFixoPecuaria} />
    </section>
  );
}
