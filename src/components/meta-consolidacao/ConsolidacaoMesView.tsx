import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIAS, type Lancamento, type Categoria } from '@/types/cattle';
import { TODOS_TIPOS } from '@/types/cattle';
import { isEntrada, isSaida, isReclassificacao } from '@/lib/calculos/zootecnicos';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const TH = "px-1.5 py-[3px] text-right font-semibold text-[10px] leading-tight";
const TD = "px-1.5 py-[3px] text-right text-[10px] leading-tight";

const MACHOS = ['garrote', 'boi_magro', 'boi_gordo', 'touruno', 'bezerro_m', 'touro'];

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function tipoLabel(tipo: string): string {
  const found = TODOS_TIPOS.find(t => t.value === tipo);
  return found ? found.label : tipo;
}

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
        <span className={`${colorClass} cursor-pointer hover:underline`} onClick={onClick}>
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

interface Props {
  data: MetaCategoriaMes[];
  ano: number;
  metaLancamentos: Lancamento[];
  onBack: () => void;
}

export function ConsolidacaoMesView({ data, ano, metaLancamentos, onBack }: Props) {
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

  const separatorAfterIndex = useMemo(() => {
    let lastMachoIdx = -1;
    rows.forEach((r, i) => {
      if (MACHOS.includes(r.categoria)) lastMachoIdx = i;
    });
    return lastMachoIdx;
  }, [rows]);

  const mesLabel = MESES_LABELS[parseInt(selectedMes) - 1];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full px-2 pb-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
            </Button>
            <h2 className="text-sm font-semibold text-orange-700">Consolidação por Mês — {ano}</h2>
          </div>
        </div>

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
                <th className={TH}>Evol. Cat. Entrada</th>
                <th className={TH}>Evol. Cat. Saída</th>
                <th className={`${TH} bg-orange-600/30`}>Saldo Final</th>
                <th className={TH}>GMD</th>
                <th className={TH}>Prod. Bio</th>
                <th className={TH}>Peso Final</th>
                <th className={`${TH} bg-orange-600/30`}>PM Final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const eeBreakdown = getBreakdown(metaLancamentos, r.categoria, r.mes, ano, 'ee');
                const seBreakdown = getBreakdown(metaLancamentos, r.categoria, r.mes, ano, 'se');
                const eiBreakdown = getBreakdown(metaLancamentos, r.categoria, r.mes, ano, 'ei');
                const siBreakdown = getBreakdown(metaLancamentos, r.categoria, r.mes, ano, 'siInternas');

                return (
                  <>
                    <tr key={r.categoria} className={i % 2 === 0 ? 'bg-background' : 'bg-orange-50/40'}>
                      <td className={`${TD} text-left font-medium`}>{r.categoriaLabel}</td>
                      <td className={`${TD} bg-orange-50`}>{fmt(r.si)}</td>
                      <td className={TD}>
                        <CellWithTooltip
                          value={fmt(r.ee)}
                          prefix="+"
                          catLabel={r.categoriaLabel}
                          mesLabel={mesLabel}
                          breakdown={eeBreakdown}
                          hasData={r.ee > 0}
                          colorClass="text-emerald-600"
                        />
                      </td>
                      <td className={TD}>
                        <CellWithTooltip
                          value={fmt(r.se)}
                          prefix="-"
                          catLabel={r.categoriaLabel}
                          mesLabel={mesLabel}
                          breakdown={seBreakdown}
                          hasData={r.se > 0}
                          colorClass="text-red-600"
                        />
                      </td>
                      <td className={TD}>
                        <CellWithTooltip
                          value={fmt(r.ei)}
                          prefix="+"
                          catLabel={r.categoriaLabel}
                          mesLabel={mesLabel}
                          breakdown={eiBreakdown}
                          hasData={r.ei > 0}
                          colorClass="text-emerald-600"
                        />
                      </td>
                      <td className={TD}>
                        <CellWithTooltip
                          value={fmt(r.siInternas)}
                          prefix="-"
                          catLabel={r.categoriaLabel}
                          mesLabel={mesLabel}
                          breakdown={siBreakdown}
                          hasData={r.siInternas > 0}
                          colorClass="text-red-600"
                        />
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
                );
              })}
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
    </TooltipProvider>
  );
}
