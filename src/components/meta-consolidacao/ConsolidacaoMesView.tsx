import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TH = "px-1.5 py-[3px] text-right font-semibold text-[10px] leading-tight";
const TD = "px-1.5 py-[3px] text-right text-[10px] leading-tight";

// Categorias masculinas (acima da linha separadora)
const MACHOS = ['garrote', 'boi_magro', 'boi_gordo', 'touruno', 'bezerro_m', 'touro'];
// Linha separadora depois de 'touro'

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface Props {
  data: MetaCategoriaMes[];
  ano: number;
  onBack: () => void;
}

export function ConsolidacaoMesView({ data, ano, onBack }: Props) {
  const [selectedMes, setSelectedMes] = useState('01');

  const rows = useMemo(() => data.filter(d => d.mes === selectedMes), [data, selectedMes]);

  const totais = useMemo(() => {
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
  }, [rows]);

  // Find separator index: after the last macho category
  const separatorAfterIndex = useMemo(() => {
    let lastMachoIdx = -1;
    rows.forEach((r, i) => {
      if (MACHOS.includes(r.categoria)) lastMachoIdx = i;
    });
    return lastMachoIdx;
  }, [rows]);

  return (
    <div className="w-full px-2 pb-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
          </Button>
          <h2 className="text-sm font-semibold text-orange-700">Consolidação por Mês — {ano}</h2>
        </div>
      </div>

      {/* Month selector - horizontal cards */}
      <div className="flex items-center gap-1 mb-1">
        {MESES_LABELS.map((label, i) => {
          const mesKey = String(i + 1).padStart(2, '0');
          const isActive = selectedMes === mesKey;
          return (
            <button
              key={mesKey}
              onClick={() => setSelectedMes(mesKey)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                isActive
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-orange-200 mt-0">
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className="bg-orange-500 text-white">
              <th className={`${TH} text-left`}>Categoria</th>
              <th className={`${TH} bg-orange-600/30`}>Saldo Inicial</th>
              <th className={TH}>Entradas</th>
              <th className={TH}>Saídas</th>
              <th className={TH}>Entr. Internas</th>
              <th className={TH}>Saíd. Internas</th>
              <th className={`${TH} bg-orange-600/30`}>Saldo Final</th>
              <th className={TH}>GMD</th>
              <th className={TH}>Prod. Bio</th>
              <th className={TH}>Peso Final</th>
              <th className={`${TH} bg-orange-600/30`}>PM Final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <>
                <tr key={r.categoria} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
                  <td className={`${TD} text-left font-medium`}>{r.categoriaLabel}</td>
                  <td className={`${TD} bg-orange-50`}>{fmt(r.si)}</td>
                  <td className={r.ee > 0 ? `${TD} text-emerald-600` : `${TD} text-muted-foreground/40`}>
                    {r.ee > 0 ? `+${fmt(r.ee)}` : '—'}
                  </td>
                  <td className={r.se > 0 ? `${TD} text-red-600` : `${TD} text-muted-foreground/40`}>
                    {r.se > 0 ? `-${fmt(r.se)}` : '—'}
                  </td>
                  <td className={r.ei > 0 ? `${TD} text-emerald-600` : `${TD} text-muted-foreground/40`}>
                    {r.ei > 0 ? `+${fmt(r.ei)}` : '—'}
                  </td>
                  <td className={r.siInternas > 0 ? `${TD} text-red-600` : `${TD} text-muted-foreground/40`}>
                    {r.siInternas > 0 ? `-${fmt(r.siInternas)}` : '—'}
                  </td>
                  <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.sf)}</td>
                  <td className={`${TD} text-orange-600 italic`}>{fmt(r.gmd, 3)}</td>
                  <td className={TD}>{fmt(r.producaoBio, 1)}</td>
                  <td className={TD}>{fmt(r.pesoTotalFinal, 1)}</td>
                  <td className={`${TD} font-bold bg-orange-50`}>{fmt(r.pesoMedioFinal, 1)}</td>
                </tr>
                {i === separatorAfterIndex && (
                  <tr key="separator" aria-hidden>
                    <td colSpan={11} className="h-[1px] bg-orange-300/50" />
                  </tr>
                )}
              </>
            ))}
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
      </div>
    </div>
  );
}
