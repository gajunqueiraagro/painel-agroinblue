import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIAS } from '@/types/cattle';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TH = "px-1.5 py-[3px] text-right font-semibold text-[10px] leading-tight";
const TD = "px-1.5 py-[3px] text-right text-[10px] leading-tight italic";

const SEPARATOR_AFTER = 'touros';

function valColor(v: number | null): string {
  if (v == null || v === 0) return 'text-muted-foreground/40';
  return v > 0 ? 'text-emerald-600' : 'text-red-600';
}

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface Props {
  data: MetaCategoriaMes[];
  ano: number;
  onBack: () => void;
}

export function ConsolidacaoCategoriaView({ data, ano, onBack }: Props) {
  const [selectedCat, setSelectedCat] = useState(CATEGORIAS[0].value);
  const rows = useMemo(() => data.filter(d => d.categoria === selectedCat), [data, selectedCat]);

  return (
    <div className="w-full px-2 pb-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
        </Button>
        <h2 className="text-sm font-semibold text-orange-700">Consolidação por Categoria — {ano}</h2>
      </div>

      {/* Category selector - horizontal cards */}
      <div className="flex items-center gap-1 mb-1 overflow-x-auto">
        {CATEGORIAS.map((cat) => {
          const isActive = selectedCat === cat.value;
          return (
            <span key={cat.value} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCat(cat.value)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
              {cat.value === SEPARATOR_AFTER && (
                <span className="w-px h-5 bg-orange-300/60 mx-1 shrink-0" />
              )}
            </span>
          );
        })}
      </div>

      <div className="w-full flex justify-start mt-0">
        <div className="w-[70%] min-w-[900px]">
          <div className="rounded-lg border border-orange-200">
            <table className="w-full table-fixed text-[10px]">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className={`${TH} text-left`}>Mês</th>
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
                  <tr key={r.mes} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
                    <td className={`${TD} text-left font-medium`}>{MESES_LABELS[parseInt(r.mes) - 1]}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
