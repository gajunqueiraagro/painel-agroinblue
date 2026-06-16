/**
 * ConciliacaoPendenciasPanel — banner agregado de pendências de conciliação.
 *
 * Renderiza no topo da ExtratoListaTab. Read-only.
 * Mostra contador por classe pendente (conciliado e ignorado são omitidos).
 * Não renderiza nada se todas as pendências são zero.
 */
import type { MovimentoEnriquecido } from '@/lib/financeiro/extratoEnriquecer';
import {
  agregarPorClasse,
  CLASSES_PENDENTES,
  DIAG_INFO,
} from '@/lib/financeiro/conciliacaoDiagnostico';

interface Props {
  movimentos: ReadonlyArray<MovimentoEnriquecido>;
  paresOfx: ReadonlySet<string>;
  confirmadosOfx?: ReadonlySet<string>;
}

export function ConciliacaoPendenciasPanel({ movimentos, paresOfx, confirmadosOfx }: Props) {
  const agg = agregarPorClasse(movimentos, paresOfx, confirmadosOfx);
  const totalPendente = CLASSES_PENDENTES.reduce((s, k) => s + agg[k], 0);

  if (totalPendente === 0) return null;

  return (
    <div className="rounded-md border bg-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground">
          Pendências de conciliação ({totalPendente})
        </div>
        <div className="text-[10px] text-muted-foreground">
          diagnóstico — sem ação automática
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {CLASSES_PENDENTES.map((cls) => {
          const info = DIAG_INFO[cls];
          const n = agg[cls];
          return (
            <div
              key={cls}
              className={`rounded border px-2 py-1.5 ${info.badgeCls} ${n === 0 ? 'opacity-40' : ''}`}
            >
              <div className="text-[10px] font-medium leading-tight">{info.label}</div>
              <div className="text-base font-bold tabular-nums leading-tight mt-0.5">{n}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
