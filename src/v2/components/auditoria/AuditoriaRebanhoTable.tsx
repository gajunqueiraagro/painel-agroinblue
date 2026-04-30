/**
 * AuditoriaRebanhoTable — Tabela SI / Entradas / Saídas / Reclassif. / SF por categoria
 * Ambiente /v2 · Fase 2
 *
 * Leitura direta de campos entregues por useRebanhoOficial.getCategoriasDetalhe().
 * Zero cálculo novo. Todas as categorias exibidas — incluindo zeradas.
 */
import { cn } from '@/lib/utils';
import type { CategoriaDetalhe } from '@/hooks/useRebanhoOficial';

const FONTE_LABEL: Record<string, { label: string; cls: string }> = {
  fechamento_pasto: { label: 'Fechamento', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  calculado:        { label: 'Calculado',  cls: 'bg-amber-50   text-amber-700   border-amber-200'  },
};

function FonteBadge({ fonte }: { fonte: string }) {
  const f = FONTE_LABEL[fonte] ?? {
    label: fonte || '—',
    cls: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', f.cls)}>
      {f.label}
    </span>
  );
}

function N({ v, dec = 0 }: { v: number | null | undefined; dec?: number }) {
  if (v == null || isNaN(v)) return <span className="text-muted-foreground/40">—</span>;
  return <>{v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}</>;
}

interface Props {
  categorias: CategoriaDetalhe[];
  loading?: boolean;
}

export function AuditoriaRebanhoTable({ categorias, loading }: Props) {
  if (loading) return <p className="text-xs text-muted-foreground py-2">Carregando...</p>;
  if (!categorias.length) return (
    <p className="text-xs text-muted-foreground/60 italic py-2">
      Sem dados para o período selecionado.
    </p>
  );

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground/60 italic">
        Leitura da fonte oficial. Esta versão não recalcula saldos nem valida divergências automaticamente.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              {['Categoria','SI','Entradas','Saídas','Reclassif +','Reclassif −','SF','Fonte'].map(h => (
                <th key={h} className="text-right first:text-left py-1.5 px-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...categorias].sort((a, b) => a.ordem - b.ordem).map(c => (
              <tr key={c.categoriaId} className="border-b border-border/40 hover:bg-muted/30">
                <td className="py-1.5 px-2 font-medium text-foreground whitespace-nowrap">{c.categoriaNome}</td>
                <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.saldoInicial} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums text-emerald-700"><N v={c.entradasExternas} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums text-red-600"><N v={c.saidasExternas} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums text-blue-600"><N v={c.evolCatEntrada} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums text-orange-600"><N v={c.evolCatSaida} /></td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold"><N v={c.saldoFinal} /></td>
                <td className="py-1.5 px-2 text-right"><FonteBadge fonte={c.fonteOficial} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
