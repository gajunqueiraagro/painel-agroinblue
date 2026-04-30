/**
 * FazendaMesCard — Totais da fazenda no mês + Produção Biológica por categoria
 * Ambiente /v2 · Fase 2
 *
 * Leitura direta de campos entregues por:
 *   useRebanhoOficial.getFazendaMes(mes)        → totais fazenda
 *   useRebanhoOficial.getCategoriasDetalhe(mes)  → produção biológica + GMD por categoria
 * Zero cálculo novo. Todas as categorias exibidas — incluindo zeradas.
 */
import { cn } from '@/lib/utils';
import type { FazendaMesDetalhe, CategoriaDetalhe } from '@/hooks/useRebanhoOficial';

function N({ v, dec = 0, unit }: { v: number | null | undefined; dec?: number; unit?: string }) {
  if (v == null || isNaN(v)) return <span className="text-muted-foreground/40">—</span>;
  const s = v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return <>{s}{unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>}</>;
}

interface Props {
  fazendaMes: FazendaMesDetalhe | null;
  categorias: CategoriaDetalhe[];
  loading?: boolean;
}

export function FazendaMesCard({ fazendaMes, categorias, loading }: Props) {
  if (loading) return <p className="text-xs text-muted-foreground py-2">Carregando...</p>;

  return (
    <div className="space-y-5">
      <p className="text-[10px] text-muted-foreground/60 italic">
        Leitura da fonte oficial. Esta versão não recalcula saldos nem valida divergências automaticamente.
      </p>

      {/* ── Totais da fazenda ─────────────────────────────────────────── */}
      {fazendaMes ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
          {([
            { label: 'Saldo Inicial', v: fazendaMes.cabecasInicio,  unit: 'cab'    },
            { label: 'Entradas',      v: fazendaMes.entradas,       unit: 'cab'    },
            { label: 'Saídas',        v: fazendaMes.saidas,         unit: 'cab'    },
            { label: 'Saldo Final',   v: fazendaMes.cabecasFinal,   unit: 'cab'    },
            { label: 'GMD',           v: fazendaMes.gmdKgCabDia,    unit: 'kg/dia', dec: 3 },
            { label: 'UA Média',      v: fazendaMes.uaMedia,        unit: 'UA',     dec: 1 },
            { label: 'Lotação UA/ha', v: fazendaMes.lotacaoUaHa,   unit: 'UA/ha',  dec: 2 },
            { label: 'Dias do Mês',   v: fazendaMes.diasMes },
          ] as { label: string; v: number | null; unit?: string; dec?: number }[]).map(({ label, v, unit, dec }) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">
                <N v={v} unit={unit} dec={dec} />
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">
          Totais da fazenda — sem dados para o período selecionado.
        </p>
      )}

      {/* ── Produção biológica por categoria ──────────────────────────── */}
      {categorias.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Produção Biológica por Categoria
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {['Categoria','Prod. Bio. (kg)','GMD (kg/dia)','Dias','Peso Médio Ini.','Peso Médio Fin.'].map(h => (
                    <th key={h} className="text-right first:text-left py-1.5 px-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...categorias].sort((a, b) => a.ordem - b.ordem).map(c => (
                  <tr key={c.categoriaId} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium whitespace-nowrap">{c.categoriaNome}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.producaoBiologica} dec={1} /></td>
                    <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.gmd} dec={3} /></td>
                    <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.diasMes} /></td>
                    <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.pesoMedioInicial} dec={1} unit="kg" /></td>
                    <td className="py-1.5 px-2 text-right tabular-nums"><N v={c.pesoMedioFinal}   dec={1} unit="kg" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
