import { useState, useEffect, useMemo } from 'react';
import { usePastos, TIPOS_USO } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { formatNum } from '@/lib/calculos/formatters';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { TabId } from '@/components/BottomNav';

interface CategoriaDetalhe {
  nome: string;
  quantidade: number;
  pesoMedio: number | null;
}

interface PastoResumo {
  pasto: { id: string; nome: string; area_produtiva_ha: number | null; tipo_uso: string };
  totalCabecas: number;
  categorias: CategoriaDetalhe[];
  tipoUsoMes: string | null;
  status: string;
  loteMes: string | null;
  uaHa: number | null;
  kgHa: number | null;
  observacao: string | null;
}

interface Props {
  onTabChange?: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
}

const TIPO_USO_COLORS: Record<string, { bg: string; border: string }> = {
  'recria':   { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
  'engorda':  { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
  'cria':     { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800' },
  'agricultura': { bg: 'bg-lime-50 dark:bg-lime-950/30', border: 'border-lime-200 dark:border-lime-800' },
  'reforma_pecuaria': { bg: 'bg-stone-50 dark:bg-stone-900/30', border: 'border-stone-200 dark:border-stone-700' },
};

const EMPTY_CARD_STYLE = { bg: 'bg-muted/30', border: 'border-border/50' };

function getCardStyle(tipoUso: string | null, totalCabecas: number) {
  if (totalCabecas === 0) return EMPTY_CARD_STYLE;
  const key = tipoUso?.toLowerCase().replace(/\s+/g, '_') || '';
  return TIPO_USO_COLORS[key] || { bg: 'bg-card', border: 'border-border' };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'fechado':
      return <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 h-4 leading-none">Fechado</Badge>;
    case 'rascunho':
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 leading-none border-amber-400 text-amber-600 dark:text-amber-400">Rascunho</Badge>;
    default:
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 leading-none text-muted-foreground">Aberto</Badge>;
  }
}

function getTipoLabel(tipo: string | null) {
  if (!tipo) return null;
  return TIPOS_USO.find(t => t.value === tipo)?.label || tipo;
}

export function ResumoPastosTab({ onTabChange }: Props) {
  const { isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [resumos, setResumos] = useState<PastoResumo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    const calc = async () => {
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
      if (pastosAtivos.length === 0 || fechamentos.length === 0) {
        setResumos(pastosAtivos.map(p => ({
          pasto: p, totalCabecas: 0, categorias: [], tipoUsoMes: null,
          status: 'nao_iniciado', loteMes: null, uaHa: null, kgHa: null, observacao: null,
        })));
        return;
      }
      setLoading(true);

      const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));
      const fechIds = fechamentos.map(f => f.id);
      const allItemsArrays = await Promise.all(fechIds.map(id => loadItens(id)));
      const itemsByFechId = new Map<string, typeof allItemsArrays[0]>();
      fechIds.forEach((id, i) => itemsByFechId.set(id, allItemsArrays[i]));

      const catMap = new Map(categorias.map(c => [c.id, c.nome]));

      const results: PastoResumo[] = pastosAtivos.map(pasto => {
        const fech = fechMap.get(pasto.id);
        if (!fech) return {
          pasto, totalCabecas: 0, categorias: [], tipoUsoMes: null,
          status: 'nao_iniciado', loteMes: null, uaHa: null, kgHa: null, observacao: null,
        };
        const items = itemsByFechId.get(fech.id) || [];
        const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
        const cats: CategoriaDetalhe[] = items
          .filter(i => i.quantidade > 0)
          .map(i => ({ nome: catMap.get(i.categoria_id) || i.categoria_id, quantidade: i.quantidade, pesoMedio: i.peso_medio_kg }))
          .sort((a, b) => b.quantidade - a.quantidade);

        const pesoTotal = items.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0);
        const uaTotal = items.reduce((s, i) => s + calcUA(i.quantidade, i.peso_medio_kg), 0);
        const area = pasto.area_produtiva_ha || 0;
        const uaHa = area > 0 && uaTotal > 0 ? uaTotal / area : null;
        const kgHa = area > 0 && pesoTotal > 0 ? pesoTotal / area : null;

        return {
          pasto, totalCabecas: totalCab, categorias: cats,
          tipoUsoMes: fech.tipo_uso_mes,
          status: fech.status,
          loteMes: fech.lote_mes,
          uaHa, kgHa,
          observacao: fech.observacao_mes,
        };
      });

      setResumos(results);
      setLoading(false);
    };
    calc();
  }, [fechamentos, pastos, loadItens, categorias]);

  const totalGeral = useMemo(() => resumos.reduce((s, r) => s + r.totalCabecas, 0), [resumos]);
  const areaTotal = useMemo(() => resumos.reduce((s, r) => s + (r.pasto.area_produtiva_ha || 0), 0), [resumos]);
  const totalPastos = resumos.length;
  const pastosOcupados = resumos.filter(r => r.totalCabecas > 0).length;

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  const handleCardClick = (pastoId: string) => {
    if (onTabChange) {
      const [y, m] = anoMes.split('-').map(Number);
      onTabChange('fechamento', { ano: String(y), mes: m });
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="pb-24">
        {/* Sticky filter + summary bar */}
        <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Left: filter + summary table */}
            <div className="flex items-center gap-4" style={{ maxWidth: '50%' }}>
              <Select value={anoMes} onValueChange={setAnoMes}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getAnoMesOptions().map(am => (
                    <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-3 text-xs tabular-nums">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Pastos:</span>
                  <span className="font-bold text-foreground">{pastosOcupados}/{totalPastos}</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Cab:</span>
                  <span className="font-bold text-primary">{totalGeral}</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Área:</span>
                  <span className="font-semibold text-foreground">{formatNum(areaTotal, 1)} ha</span>
                </div>
                {areaTotal > 0 && (
                  <>
                    <div className="h-3 w-px bg-border" />
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">cab/ha:</span>
                      <span className="font-semibold text-foreground">{formatNum(totalGeral / areaTotal, 2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* Right: GMD button */}
            {onTabChange && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px] px-2 shrink-0" onClick={() => onTabChange('conferencia_gmd')}>
                <BarChart3 className="h-3 w-3" />
                Conferir GMD
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Calculando...</div>
        ) : (
          <div className="p-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
              {resumos.map(r => {
                const tipoUso = r.tipoUsoMes || r.pasto.tipo_uso;
                const tipoLabel = getTipoLabel(tipoUso);
                const style = getCardStyle(tipoUso, r.totalCabecas);

                return (
                  <Tooltip key={r.pasto.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleCardClick(r.pasto.id)}
                        className={`${style.bg} border ${style.border} rounded-lg px-2.5 py-2 text-left transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.98] flex flex-col justify-between min-h-[72px]`}
                      >
                        {/* Row 1: nome + status */}
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[11px] font-bold text-foreground leading-tight truncate flex-1">{r.pasto.nome}</span>
                          {getStatusBadge(r.status)}
                        </div>

                        {/* Row 2: cabeças + area + tipo */}
                        <div className="mt-1.5 flex items-baseline justify-between gap-1">
                          <span className={`text-sm font-extrabold tabular-nums ${r.totalCabecas > 0 ? 'text-primary' : 'text-muted-foreground/50'}`}>
                            {r.totalCabecas} <span className="text-[9px] font-semibold">cab</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground tabular-nums">
                            {r.pasto.area_produtiva_ha ? `${r.pasto.area_produtiva_ha} ha` : ''}
                          </span>
                        </div>

                        {/* Row 3: tipo uso */}
                        {tipoLabel && (
                          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5 truncate">
                            {tipoLabel}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[220px] p-2.5 text-xs space-y-1">
                      <p className="font-bold text-foreground">{r.pasto.nome}</p>
                      {r.loteMes && <p><span className="text-muted-foreground">Lote:</span> {r.loteMes}</p>}
                      {r.uaHa != null && <p><span className="text-muted-foreground">UA/ha:</span> {formatNum(r.uaHa, 2)}</p>}
                      {r.kgHa != null && <p><span className="text-muted-foreground">kg/ha:</span> {formatNum(r.kgHa, 0)}</p>}
                      {r.categorias.length > 0 && (
                        <div className="pt-1 border-t border-border/50 space-y-0.5">
                          {r.categorias.map(cat => (
                            <div key={cat.nome} className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground truncate">{cat.nome}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-semibold tabular-nums">{cat.quantidade}</span>
                                {cat.pesoMedio != null && cat.pesoMedio > 0 && (
                                  <span className="text-muted-foreground tabular-nums text-[10px]">({formatNum(cat.pesoMedio, 0)} kg)</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.observacao && <p className="text-muted-foreground italic truncate">{r.observacao}</p>}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            {resumos.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">Nenhum pasto ativo para conciliação.</div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
