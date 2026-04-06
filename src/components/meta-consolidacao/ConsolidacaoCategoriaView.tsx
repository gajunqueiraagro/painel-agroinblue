import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIAS, type Lancamento, type Categoria } from '@/types/cattle';
import { RefreshCw } from 'lucide-react';
import { isEntrada, isSaida, isReclassificacao } from '@/lib/calculos/zootecnicos';
import { TODOS_TIPOS } from '@/types/cattle';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TH = "px-1.5 py-[3px] text-center font-semibold text-[10px] leading-tight";
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

function tipoLabel(tipo: string): string {
  const found = TODOS_TIPOS.find(t => t.value === tipo);
  return found ? found.label : tipo;
}

/** Breakdown of movements for a specific cell */
interface MovBreakdown {
  tipo: string;
  tipoLabel: string;
  quantidade: number;
  pesoTotal: number;
}

function getBreakdown(
  lancamentos: Lancamento[],
  categoria: Categoria,
  mes: string,
  ano: number,
  column: 'ee' | 'se' | 'ei' | 'siInternas',
): MovBreakdown[] {
  const mesPrefix = `${ano}-${mes}`;
  const doMes = lancamentos.filter(l => l.data.startsWith(mesPrefix));
  const map = new Map<string, MovBreakdown>();

  for (const l of doMes) {
    const pesoUnit = l.pesoMedioKg || 0;

    if (column === 'ee' && l.categoria === categoria && isEntrada(l.tipo)) {
      const existing = map.get(l.tipo) || { tipo: l.tipo, tipoLabel: tipoLabel(l.tipo), quantidade: 0, pesoTotal: 0 };
      existing.quantidade += l.quantidade;
      existing.pesoTotal += l.quantidade * pesoUnit;
      map.set(l.tipo, existing);
    }
    if (column === 'se' && l.categoria === categoria && isSaida(l.tipo)) {
      const existing = map.get(l.tipo) || { tipo: l.tipo, tipoLabel: tipoLabel(l.tipo), quantidade: 0, pesoTotal: 0 };
      existing.quantidade += l.quantidade;
      existing.pesoTotal += l.quantidade * pesoUnit;
      map.set(l.tipo, existing);
    }
    if (column === 'ei' && isReclassificacao(l.tipo) && l.categoriaDestino === categoria) {
      const key = `reclass_de_${l.categoria}`;
      const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label || l.categoria;
      const existing = map.get(key) || { tipo: key, tipoLabel: `Reclass. de ${catLabel}`, quantidade: 0, pesoTotal: 0 };
      existing.quantidade += l.quantidade;
      existing.pesoTotal += l.quantidade * pesoUnit;
      map.set(key, existing);
    }
    if (column === 'siInternas' && isReclassificacao(l.tipo) && l.categoria === categoria) {
      const key = `reclass_para_${l.categoriaDestino}`;
      const catLabel = CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label || l.categoriaDestino || '';
      const existing = map.get(key) || { tipo: key, tipoLabel: `Reclass. para ${catLabel}`, quantidade: 0, pesoTotal: 0 };
      existing.quantidade += l.quantidade;
      existing.pesoTotal += l.quantidade * pesoUnit;
      map.set(key, existing);
    }
  }

  return Array.from(map.values());
}

interface Props {
  data: MetaCategoriaMes[];
  ano: number;
  metaLancamentos: Lancamento[];
  onBack: () => void;
  onNavigateToLancamentos?: (ano: string, mes: string, categoria?: string) => void;
  onNavigateToReclass?: (mes?: string) => void;
}

function CellWithTooltip({
  value,
  prefix,
  catLabel,
  mesLabel,
  breakdown,
  hasData,
  onClick,
  colorClass,
}: {
  value: string;
  prefix?: string;
  catLabel: string;
  mesLabel: string;
  breakdown: MovBreakdown[];
  hasData: boolean;
  onClick?: () => void;
  colorClass: string;
}) {
  if (!hasData) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  const display = prefix ? `${prefix}${value}` : value;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`${colorClass} cursor-pointer hover:underline`}
          onClick={onClick}
        >
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-white border border-orange-200 shadow-lg p-2.5 max-w-[260px] rounded-lg"
      >
        <p className="font-bold text-[11px] text-orange-700 mb-1.5">{catLabel} — {mesLabel}</p>
        {breakdown.length === 0 ? (
          <p className="text-muted-foreground italic text-[10px] pl-2">Sem movimentações</p>
        ) : (
          breakdown.map((b, i) => {
            const pesoMedio = b.quantidade > 0 ? b.pesoTotal / b.quantidade : 0;
            return (
              <p key={i} className="text-[10px] text-foreground/80 pl-2 leading-relaxed">
                {b.tipoLabel}: <span className="font-semibold text-foreground">{fmt(b.quantidade)} cab</span>
                {pesoMedio > 0 && (
                  <span className="text-muted-foreground"> | {fmt(pesoMedio, 1)} kg</span>
                )}
              </p>
            );
          })
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function ConsolidacaoCategoriaView({ data, ano, metaLancamentos, onBack, onNavigateToLancamentos, onNavigateToReclass }: Props) {
  const [selectedCat, setSelectedCat] = useState(CATEGORIAS[0].value);
  const rows = useMemo(() => data.filter(d => d.categoria === selectedCat), [data, selectedCat]);

  const selectedCatLabel = CATEGORIAS.find(c => c.value === selectedCat)?.label || selectedCat;

  const handleEntradasClick = (mes: string) => {
    onNavigateToLancamentos?.(String(ano), mes, selectedCat);
  };

  const handleInternasClick = (mes: string) => {
    onNavigateToReclass?.(mes);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full px-2 pb-4 animate-fade-in">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
            </Button>
            <h2 className="text-sm font-semibold text-orange-700">Consolidação por Categoria — {ano}</h2>
          </div>
          {onNavigateToReclass && (
            <Button variant="outline" size="sm" className="h-7 px-3 text-xs font-semibold gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => onNavigateToReclass?.()}>
              <RefreshCw className="h-3 w-3" /> Reclassificar
            </Button>
          )}
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
          <div style={{ width: 663 }}>
            <div className="rounded-lg border border-orange-200">
              <table className="w-full table-fixed text-[10px]">
                <colgroup>
                  <col style={{ width: 43 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 55 }} />
                  <col style={{ width: 55 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 75 }} />
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
                    <th className={`${TH} bg-orange-600/30`}>Peso Médio kg</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const mesLabel = MESES_LABELS[parseInt(r.mes) - 1];
                    const eeBreakdown = getBreakdown(metaLancamentos, selectedCat, r.mes, ano, 'ee');
                    const seBreakdown = getBreakdown(metaLancamentos, selectedCat, r.mes, ano, 'se');
                    const eiBreakdown = getBreakdown(metaLancamentos, selectedCat, r.mes, ano, 'ei');
                    const siBreakdown = getBreakdown(metaLancamentos, selectedCat, r.mes, ano, 'siInternas');

                    return (
                      <tr key={r.mes} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
                        <td className={`${TD} text-left font-medium`}>{mesLabel}</td>
                        <td className={`${TD} bg-orange-50 ${valColor(r.si)}`}>{fmt(r.si)}</td>
                        <td className={`${TD}`}>
                          <CellWithTooltip
                            value={fmt(r.ee)}
                            prefix="+"
                            catLabel={selectedCatLabel}
                            mesLabel={mesLabel}
                            breakdown={eeBreakdown}
                            hasData={r.ee > 0}
                            onClick={() => handleEntradasClick(r.mes)}
                            colorClass="text-emerald-600"
                          />
                        </td>
                        <td className={`${TD}`}>
                          <CellWithTooltip
                            value={fmt(r.se)}
                            prefix="-"
                            catLabel={selectedCatLabel}
                            mesLabel={mesLabel}
                            breakdown={seBreakdown}
                            hasData={r.se > 0}
                            onClick={() => handleEntradasClick(r.mes)}
                            colorClass="text-red-600"
                          />
                        </td>
                        <td className={`${TD}`}>
                          <CellWithTooltip
                            value={fmt(r.ei)}
                            prefix="+"
                            catLabel={selectedCatLabel}
                            mesLabel={mesLabel}
                            breakdown={eiBreakdown}
                            hasData={r.ei > 0}
                            onClick={() => handleInternasClick(r.mes)}
                            colorClass="text-emerald-600"
                          />
                        </td>
                        <td className={`${TD}`}>
                          <CellWithTooltip
                            value={fmt(r.siInternas)}
                            prefix="-"
                            catLabel={selectedCatLabel}
                            mesLabel={mesLabel}
                            breakdown={siBreakdown}
                            hasData={r.siInternas > 0}
                            onClick={() => handleCellClick(r.mes)}
                            colorClass="text-red-600"
                          />
                        </td>
                        <td className={`${TD} font-bold bg-orange-50 ${valColor(r.sf)}`}>{fmt(r.sf)}</td>
                        <td className={`${TD} text-orange-600`}>{fmt(r.gmd, 3)}</td>
                        <td className={`${TD} ${valColor(r.producaoBio)}`}>{fmt(r.producaoBio, 1)}</td>
                        <td className={`${TD} ${valColor(r.pesoTotalFinal)}`}>{fmt(r.pesoTotalFinal, 1)}</td>
                        <td className={`${TD} font-bold bg-orange-50 ${valColor(r.pesoMedioFinal)}`}>{fmt(r.pesoMedioFinal, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
