import { useState, useEffect } from 'react';
import { usePastos } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { getAnoMesOptions, formatAnoMes } from '@/lib/dateUtils';

interface PastoResumo {
  pasto: { id: string; nome: string; area_produtiva_ha: number | null };
  totalCabecas: number;
  pesoMedio: number | null;
  cabHa: number | null;
}

export function ResumoPastosTab() {
  const { isGlobal } = useFazenda();
  const { pastos } = usePastos();
  const { fechamentos, loadFechamentos, loadItens } = useFechamento();
  const [anoMes, setAnoMes] = useState(format(new Date(), 'yyyy-MM'));
  const [resumos, setResumos] = useState<PastoResumo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    const calc = async () => {
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
      if (pastosAtivos.length === 0 || fechamentos.length === 0) {
        setResumos(pastosAtivos.map(p => ({ pasto: p, totalCabecas: 0, pesoMedio: null, cabHa: null })));
        return;
      }
      setLoading(true);

      // Batch: load all items for all fechamentos in parallel
      const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));
      const fechIds = fechamentos.map(f => f.id);
      const allItemsArrays = await Promise.all(fechIds.map(id => loadItens(id)));
      const itemsByFechId = new Map<string, typeof allItemsArrays[0]>();
      fechIds.forEach((id, i) => itemsByFechId.set(id, allItemsArrays[i]));

      const results: PastoResumo[] = pastosAtivos.map(pasto => {
        const fech = fechMap.get(pasto.id);
        if (!fech) return { pasto, totalCabecas: 0, pesoMedio: null, cabHa: null };
        const items = itemsByFechId.get(fech.id) || [];
        const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
        const comPeso = items.filter(i => i.quantidade > 0 && i.peso_medio_kg);
        const pesoMedio = comPeso.length > 0
          ? comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0) / comPeso.reduce((s, i) => s + i.quantidade, 0)
          : null;
        const cabHa = pasto.area_produtiva_ha && totalCab > 0 ? totalCab / pasto.area_produtiva_ha : null;
        return { pasto, totalCabecas: totalCab, pesoMedio, cabHa };
      });

      setResumos(results);
      setLoading(false);
    };
    calc();
  }, [fechamentos, pastos, loadItens]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  const totalGeral = resumos.reduce((s, r) => s + r.totalCabecas, 0);
  const areaTotal = resumos.reduce((s, r) => s + (r.pasto.area_produtiva_ha || 0), 0);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{formatAnoMes(am)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-0.5">
          <Badge variant="secondary">{totalGeral} cab</Badge>
          {areaTotal > 0 && <span className="text-xs text-muted-foreground">{(totalGeral / areaTotal).toFixed(2)} cab/ha geral</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Calculando...</div>
      ) : (
        <div className="space-y-2">
          {resumos.map(r => (
            <div key={r.pasto.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.pasto.nome}</div>
                <div className="text-lg font-bold">{r.totalCabecas} cab</div>
              </div>
              <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                {r.pasto.area_produtiva_ha && <span>{r.pasto.area_produtiva_ha} ha</span>}
                {r.pesoMedio && <span>Peso médio: {r.pesoMedio.toFixed(0)} kg</span>}
                {r.cabHa && <span>{r.cabHa.toFixed(2)} cab/ha</span>}
              </div>
            </div>
          ))}
          {resumos.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
          )}
        </div>
      )}
    </div>
  );
}
