import { useState, useEffect } from 'react';
import { usePastos, TIPOS_USO } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';
import { MapPin, ChevronRight } from 'lucide-react';
import { TabId } from '@/components/BottomNav';

interface CategoriaDetalhe {
  nome: string;
  quantidade: number;
}

interface PastoResumo {
  pasto: { id: string; nome: string; area_produtiva_ha: number | null; tipo_uso: string };
  totalCabecas: number;
  categorias: CategoriaDetalhe[];
  tipoUsoMes: string | null;
}

interface Props {
  onTabChange?: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
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
        setResumos(pastosAtivos.map(p => ({ pasto: p, totalCabecas: 0, categorias: [], tipoUsoMes: null })));
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
        if (!fech) return { pasto, totalCabecas: 0, categorias: [], tipoUsoMes: null };
        const items = itemsByFechId.get(fech.id) || [];
        const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
        const cats: CategoriaDetalhe[] = items
          .filter(i => i.quantidade > 0)
          .map(i => ({ nome: catMap.get(i.categoria_id) || i.categoria_id, quantidade: i.quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade);
        return { pasto, totalCabecas: totalCab, categorias: cats, tipoUsoMes: fech.tipo_uso_mes };
      });

      setResumos(results);
      setLoading(false);
    };
    calc();
  }, [fechamentos, pastos, loadItens, categorias]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  const totalGeral = resumos.reduce((s, r) => s + r.totalCabecas, 0);
  const areaTotal = resumos.reduce((s, r) => s + (r.pasto.area_produtiva_ha || 0), 0);

  const getTipoLabel = (tipo: string | null) => {
    if (!tipo) return null;
    return TIPOS_USO.find(t => t.value === tipo)?.label || tipo;
  };

  const handleCardClick = (pastoId: string) => {
    if (onTabChange) {
      const [y, m] = anoMes.split('-').map(Number);
      onTabChange('fechamento', { ano: String(y), mes: m });
    }
  };

  return (
    <div className="pb-24">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-2">
        <div className="flex items-center gap-3">
          <Select value={anoMes} onValueChange={setAnoMes}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getAnoMesOptions().map(am => (
                <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground font-bold text-sm px-3 py-1">
              {totalGeral} cab
            </Badge>
            {areaTotal > 0 && (
              <span className="text-xs text-muted-foreground">{(totalGeral / areaTotal).toFixed(2)} cab/ha</span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Calculando...</div>
      ) : (
        <div className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {resumos.map(r => {
              const tipoLabel = getTipoLabel(r.tipoUsoMes || r.pasto.tipo_uso);
              return (
                <button
                  key={r.pasto.id}
                  onClick={() => handleCardClick(r.pasto.id)}
                  className="bg-card border border-border rounded-xl p-3 text-left transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98] flex flex-col justify-between min-h-[140px]"
                >
                  {/* Header */}
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-base font-bold text-foreground leading-tight">{r.pasto.nome}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    {tipoLabel && (
                      <span className="inline-block text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 mt-1">
                        {tipoLabel}
                      </span>
                    )}
                  </div>

                  {/* Categorias */}
                  {r.categorias.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {r.categorias.map(cat => (
                        <div key={cat.nome} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate mr-1">{cat.nome}</span>
                          <span className="font-semibold text-foreground tabular-nums">{cat.quantidade}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {r.pasto.area_produtiva_ha ? `${r.pasto.area_produtiva_ha} ha` : '—'}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${r.totalCabecas > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {r.totalCabecas} cab
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {resumos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
          )}
        </div>
      )}
    </div>
  );
}
