import { formatMoeda } from '@/lib/calculos/formatters';
import type { SituacaoFechamento, ItemPendencia } from '@/lib/financeiro/fechamentoPendencias';

function Linha({ it, cls }: { it: ItemPendencia; cls: string }) {
  return (
    <div className={`flex items-center justify-between rounded border px-2.5 py-1.5 ${cls}`}>
      <span className="text-[11px] font-medium">{it.label}</span>
      <span className="text-[11px] tabular-nums font-bold">
        {it.qtd}
        {it.impacto !== null && <span className="ml-2 font-mono">{formatMoeda(it.impacto)}</span>}
      </span>
    </div>
  );
}

export function SituacaoFechamentoPanel({ situacao }: { situacao: SituacaoFechamento }) {
  const apto = situacao.apto;
  // Correlação: quando o impacto dos duplicados explica a diferença de saldo.
  const dup = situacao.bloqueios.find((b) => b.tipo === 'duplicado');
  const sal = situacao.bloqueios.find((b) => b.tipo === 'saldo');
  const correlacionado =
    dup && sal && sal.impacto !== null && dup.impacto !== null &&
    Math.abs(Math.abs(sal.impacto) - Math.abs(dup.impacto)) < 0.01;

  return (
    <div className="rounded-lg border bg-card overflow-hidden mb-2">
      <div className={`px-3 py-1.5 flex items-center justify-between ${apto ? 'bg-emerald-50' : 'bg-red-50'}`}>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Situação do fechamento</span>
        <span className={`text-[11px] font-bold ${apto ? 'text-emerald-700' : 'text-red-700'}`}>
          {apto ? '🟢 APTO PARA FECHAMENTO' : '🔴 NÃO APTO PARA FECHAMENTO'}
        </span>
      </div>
      {!apto && (
        <div className="p-2 space-y-1">
          {situacao.bloqueios.map((it) => (
            <Linha key={it.tipo} it={it} cls="bg-red-50/60 border-red-200 text-red-800" />
          ))}
          {correlacionado && (
            <div className="text-[9px] text-muted-foreground px-1 pt-0.5">
              Saldo não fecha pela mesma quantia dos duplicados — provável causa.
            </div>
          )}
          {situacao.avisos.map((it) => (
            <Linha key={it.tipo} it={it} cls="bg-amber-50/60 border-amber-200 text-amber-800" />
          ))}
        </div>
      )}
    </div>
  );
}
