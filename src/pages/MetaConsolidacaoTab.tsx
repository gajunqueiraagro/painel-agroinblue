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

const TH = "px-1 py-[2px] text-right font-semibold text-[9px] leading-tight";
const TD = "px-1 py-[2px] text-right text-[9px] leading-tight";

export function MetaConsolidacaoTab({ saldosIniciais, metaLancamentos, gmdRows, ano, onBack }: Props) {
  const data = useMetaConsolidacao(saldosIniciais, metaLancamentos, gmdRows, ano);
  const [viewMode, setViewMode] = useState<ViewMode>('categoria');
  const [selectedCat, setSelectedCat] = useState(CATEGORIAS[0].value);
  const [selectedMes, setSelectedMes] = useState('01');

  const catRows = useMemo(() => data.filter(d => d.categoria === selectedCat), [data, selectedCat]);
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
      producaoBio: rows.reduce((s, r) => s + r.producaoBio, 0),
      pesoTotalFinal: rows.reduce((s, r) => s + r.pesoTotalFinal, 0),
    };
  }, [mesRows]);

  return (
    <div className="w-full px-2 pb-4 animate-fade-in">
      {/* Header + filters on same line */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
          </Button>
          <h2 className="text-sm font-semibold text-orange-700">Consolidação Meta — {ano}</h2>
        </div>

        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-[130px] h-7 text-[10px] border-orange-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="categoria">Por Categoria</SelectItem>
              <SelectItem value="mes">Por Mês</SelectItem>
            </SelectContent>
          </Select>

          {viewMode === 'categoria' && (
            <Select value={selectedCat} onValueChange={(v) => setSelectedCat(v as any)}>
              <SelectTrigger className="w-[140px] h-7 text-[10px] border-orange-300">
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
              <SelectTrigger className="w-[100px] h-7 text-[10px] border-orange-300">
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
      </div>

      {/* Table */}
      <div className="rounded-lg border border-orange-200 mt-0">
        {viewMode === 'categoria' ? (
          <CategoriaTable rows={catRows} />
        ) : (
          <MesTable rows={mesRows} totais={totaisMes} />
        )}
      </div>

      {data.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center mt-4">
          Nenhuma movimentação meta encontrada para {ano}. Lance movimentações previstas primeiro.
        </p>
      )}
    </div>
  );
}

function CategoriaTable({ rows }: { rows: MetaCategoriaMes[] }) {
  return (
    <table className="w-full table-fixed text-[9px]">
      <thead>
        <tr className="bg-orange-500 text-white">
          <th className={`${TH} text-left`}>Mês</th>
          <th className={`${TH} bg-orange-600/30`}>SI</th>
          <th className={TH}>EE</th>
          <th className={TH}>SE</th>
          <th className={TH}>EI</th>
          <th className={TH}>SI Int.</th>
          <th className={`${TH} bg-orange-600/30`}>SF</th>
          <th className={TH}>GMD</th>
          <th className={TH}>Prod. Bio</th>
          <th className={TH}>Peso Final</th>
          <th className={`${TH} bg-orange-600/30`}>PM Final</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.mes} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
            <td className={`${TD} text-left font-medium`}>{MESES_LABELS[parseInt(r.mes) - 1]}</td>
            <td className={`${TD} bg-orange-50`}>{fmt(r.si)}</td>
            <td className={`${TD} text-emerald-600`}>{r.ee > 0 ? `+${fmt(r.ee)}` : '—'}</td>
            <td className={`${TD} text-red-600`}>{r.se > 0 ? `-${fmt(r.se)}` : '—'}</td>
            <td className={`${TD} text-emerald-600`}>{r.ei > 0 ? `+${fmt(r.ei)}` : '—'}</td>
            <td className={`${TD} text-red-600`}>{r.siInternas > 0 ? `-${fmt(r.siInternas)}` : '—'}</td>
            <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.sf)}</td>
            <td className={`${TD} text-orange-600 italic`}>{fmt(r.gmd, 3)}</td>
            <td className={TD}>{fmt(r.producaoBio, 1)}</td>
            <td className={TD}>{fmt(r.pesoTotalFinal, 1)}</td>
            <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.pesoMedioFinal, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MesTable({ rows, totais }: { rows: MetaCategoriaMes[]; totais: any }) {
  return (
    <table className="w-full table-fixed text-[9px]">
      <thead>
        <tr className="bg-orange-500 text-white">
          <th className={`${TH} text-left`}>Categoria</th>
          <th className={`${TH} bg-orange-600/30`}>SI</th>
          <th className={TH}>EE</th>
          <th className={TH}>SE</th>
          <th className={TH}>EI</th>
          <th className={TH}>SI Int.</th>
          <th className={`${TH} bg-orange-600/30`}>SF</th>
          <th className={TH}>GMD</th>
          <th className={TH}>Prod. Bio</th>
          <th className={TH}>Peso Final</th>
          <th className={`${TH} bg-orange-600/30`}>PM Final</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.categoria} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
            <td className={`${TD} text-left font-medium`}>{r.categoriaLabel}</td>
            <td className={`${TD} bg-orange-50`}>{fmt(r.si)}</td>
            <td className={`${TD} text-emerald-600`}>{r.ee > 0 ? `+${fmt(r.ee)}` : '—'}</td>
            <td className={`${TD} text-red-600`}>{r.se > 0 ? `-${fmt(r.se)}` : '—'}</td>
            <td className={`${TD} text-emerald-600`}>{r.ei > 0 ? `+${fmt(r.ei)}` : '—'}</td>
            <td className={`${TD} text-red-600`}>{r.siInternas > 0 ? `-${fmt(r.siInternas)}` : '—'}</td>
            <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.sf)}</td>
            <td className={`${TD} text-orange-600 italic`}>{fmt(r.gmd, 3)}</td>
            <td className={TD}>{fmt(r.producaoBio, 1)}</td>
            <td className={TD}>{fmt(r.pesoTotalFinal, 1)}</td>
            <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.pesoMedioFinal, 1)}</td>
          </tr>
        ))}
        {/* Total row */}
        <tr className="bg-orange-100 text-orange-700 font-bold border-t border-orange-300">
          <td className={`${TD} text-left`}>TOTAL</td>
          <td className={`${TD} bg-orange-100`}>{fmt(totais.si)}</td>
          <td className={`${TD} text-emerald-700`}>{fmt(totais.ee)}</td>
          <td className={`${TD} text-red-700`}>{fmt(totais.se)}</td>
          <td className={`${TD} text-emerald-700`}>{fmt(totais.ei)}</td>
          <td className={`${TD} text-red-700`}>{fmt(totais.siInt)}</td>
          <td className={`${TD} bg-orange-100`}>{fmt(totais.sf)}</td>
          <td className={TD}>—</td>
          <td className={TD}>{fmt(totais.producaoBio, 1)}</td>
          <td className={TD}>{fmt(totais.pesoTotalFinal, 1)}</td>
          <td className={`${TD} bg-orange-100`}>{totais.sf > 0 ? fmt(totais.pesoTotalFinal / totais.sf, 1) : '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}
