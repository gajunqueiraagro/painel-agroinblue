/**
 * Tela de consolidação Meta por categoria/mês — somente leitura.
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIAS, type Lancamento, type SaldoInicial } from '@/types/cattle';
import { useMetaConsolidacao, type MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import type { MetaGmdRow } from '@/hooks/useMetaGmd';

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface Props {
  saldosIniciais: SaldoInicial[];
  metaLancamentos: Lancamento[];
  gmdRows: MetaGmdRow[];
  ano: number;
  onBack: () => void;
}

type ViewMode = 'categoria' | 'mes';

export function MetaConsolidacaoTab({ saldosIniciais, metaLancamentos, gmdRows, ano, onBack }: Props) {
  const data = useMetaConsolidacao(saldosIniciais, metaLancamentos, gmdRows, ano);
  const [viewMode, setViewMode] = useState<ViewMode>('categoria');
  const [selectedCat, setSelectedCat] = useState(CATEGORIAS[0].value);
  const [selectedMes, setSelectedMes] = useState('01');

  // View by category: show 12 months for selected category
  const catRows = useMemo(() => data.filter(d => d.categoria === selectedCat), [data, selectedCat]);
  // View by month: show all categories for selected month
  const mesRows = useMemo(() => data.filter(d => d.mes === selectedMes), [data, selectedMes]);

  const totaisMes = useMemo(() => {
    const rows = mesRows;
    return {
      si: rows.reduce((s, r) => s + r.si, 0),
      ee: rows.reduce((s, r) => s + r.ee, 0),
      se: rows.reduce((s, r) => s + r.se, 0),
      ei: rows.reduce((s, r) => s + r.ei, 0),
      siInt: rows.reduce((s, r) => s + r.siInternas, 0),
      sf: rows.reduce((s, r) => s + r.sf, 0),
      pesoInicial: rows.reduce((s, r) => s + r.pesoInicial, 0),
      pesoEntradas: rows.reduce((s, r) => s + r.pesoEntradas, 0),
      pesoSaidas: rows.reduce((s, r) => s + r.pesoSaidas, 0),
      producaoBio: rows.reduce((s, r) => s + r.producaoBio, 0),
      pesoTotalFinal: rows.reduce((s, r) => s + r.pesoTotalFinal, 0),
    };
  }, [mesRows]);

  return (
    <div className="w-full px-2 pb-24 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-sm font-semibold text-foreground">Consolidação Meta — {ano}</h2>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="categoria">Por Categoria</SelectItem>
            <SelectItem value="mes">Por Mês</SelectItem>
          </SelectContent>
        </Select>

        {viewMode === 'categoria' && (
          <Select value={selectedCat} onValueChange={(v) => setSelectedCat(v as any)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {viewMode === 'mes' && (
          <Select value={selectedMes} onValueChange={setSelectedMes}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_LABELS.map((label, i) => (
                <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        {viewMode === 'categoria' ? (
          <CategoriaTable rows={catRows} />
        ) : (
          <MesTable rows={mesRows} totais={totaisMes} />
        )}
      </div>

      {data.length === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-6">
          Nenhuma movimentação meta encontrada para {ano}. Lance movimentações previstas primeiro.
        </p>
      )}
    </div>
  );
}

function CategoriaTable({ rows }: { rows: MetaCategoriaMes[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="bg-primary/10 text-foreground">
          <th className="px-2 py-1.5 text-left font-semibold">Mês</th>
          <th className="px-2 py-1.5 text-right font-semibold">SI</th>
          <th className="px-2 py-1.5 text-right font-semibold">EE</th>
          <th className="px-2 py-1.5 text-right font-semibold">SE</th>
          <th className="px-2 py-1.5 text-right font-semibold">EI</th>
          <th className="px-2 py-1.5 text-right font-semibold">SI Int.</th>
          <th className="px-2 py-1.5 text-right font-semibold bg-primary/20">SF</th>
          <th className="px-2 py-1.5 text-right font-semibold">GMD</th>
          <th className="px-2 py-1.5 text-right font-semibold">Prod. Bio (kg)</th>
          <th className="px-2 py-1.5 text-right font-semibold">Peso Final (kg)</th>
          <th className="px-2 py-1.5 text-right font-semibold bg-primary/20">PM Final (kg)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.mes} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
            <td className="px-2 py-1 font-medium">{MESES_LABELS[parseInt(r.mes) - 1]}</td>
            <td className="px-2 py-1 text-right">{fmt(r.si)}</td>
            <td className="px-2 py-1 text-right text-emerald-600">{r.ee > 0 ? `+${fmt(r.ee)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-red-600">{r.se > 0 ? `-${fmt(r.se)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-blue-600">{r.ei > 0 ? `+${fmt(r.ei)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-orange-600">{r.siInternas > 0 ? `-${fmt(r.siInternas)}` : '—'}</td>
            <td className="px-2 py-1 text-right font-bold bg-primary/5">{fmt(r.sf)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.gmd, 3)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.producaoBio, 1)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.pesoTotalFinal, 1)}</td>
            <td className="px-2 py-1 text-right font-bold bg-primary/5">{fmt(r.pesoMedioFinal, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MesTable({ rows, totais }: { rows: MetaCategoriaMes[]; totais: any }) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="bg-primary/10 text-foreground">
          <th className="px-2 py-1.5 text-left font-semibold">Categoria</th>
          <th className="px-2 py-1.5 text-right font-semibold">SI</th>
          <th className="px-2 py-1.5 text-right font-semibold">EE</th>
          <th className="px-2 py-1.5 text-right font-semibold">SE</th>
          <th className="px-2 py-1.5 text-right font-semibold">EI</th>
          <th className="px-2 py-1.5 text-right font-semibold">SI Int.</th>
          <th className="px-2 py-1.5 text-right font-semibold bg-primary/20">SF</th>
          <th className="px-2 py-1.5 text-right font-semibold">GMD</th>
          <th className="px-2 py-1.5 text-right font-semibold">Prod. Bio (kg)</th>
          <th className="px-2 py-1.5 text-right font-semibold">Peso Final (kg)</th>
          <th className="px-2 py-1.5 text-right font-semibold bg-primary/20">PM Final (kg)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.categoria} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
            <td className="px-2 py-1 font-medium">{r.categoriaLabel}</td>
            <td className="px-2 py-1 text-right">{fmt(r.si)}</td>
            <td className="px-2 py-1 text-right text-emerald-600">{r.ee > 0 ? `+${fmt(r.ee)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-red-600">{r.se > 0 ? `-${fmt(r.se)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-blue-600">{r.ei > 0 ? `+${fmt(r.ei)}` : '—'}</td>
            <td className="px-2 py-1 text-right text-orange-600">{r.siInternas > 0 ? `-${fmt(r.siInternas)}` : '—'}</td>
            <td className="px-2 py-1 text-right font-bold bg-primary/5">{fmt(r.sf)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.gmd, 3)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.producaoBio, 1)}</td>
            <td className="px-2 py-1 text-right">{fmt(r.pesoTotalFinal, 1)}</td>
            <td className="px-2 py-1 text-right font-bold bg-primary/5">{fmt(r.pesoMedioFinal, 1)}</td>
          </tr>
        ))}
        {/* Total row */}
        <tr className="bg-primary/15 font-bold border-t border-border">
          <td className="px-2 py-1.5">TOTAL</td>
          <td className="px-2 py-1.5 text-right">{fmt(totais.si)}</td>
          <td className="px-2 py-1.5 text-right text-emerald-600">{fmt(totais.ee)}</td>
          <td className="px-2 py-1.5 text-right text-red-600">{fmt(totais.se)}</td>
          <td className="px-2 py-1.5 text-right text-blue-600">{fmt(totais.ei)}</td>
          <td className="px-2 py-1.5 text-right text-orange-600">{fmt(totais.siInt)}</td>
          <td className="px-2 py-1.5 text-right bg-primary/10">{fmt(totais.sf)}</td>
          <td className="px-2 py-1.5 text-right">—</td>
          <td className="px-2 py-1.5 text-right">{fmt(totais.producaoBio, 1)}</td>
          <td className="px-2 py-1.5 text-right">{fmt(totais.pesoTotalFinal, 1)}</td>
          <td className="px-2 py-1.5 text-right bg-primary/10">{totais.sf > 0 ? fmt(totais.pesoTotalFinal / totais.sf, 1) : '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}
