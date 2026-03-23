import { useState, useEffect, useMemo } from 'react';
import { usePastos } from '@/hooks/usePastos';
import { useFechamento } from '@/hooks/useFechamento';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, subMonths } from 'date-fns';

function getAnoMesOptions() {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    opts.push(format(d, 'yyyy-MM'));
  }
  return opts;
}

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
      setLoading(true);
      const results: PastoResumo[] = [];
      const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);

      for (const pasto of pastosAtivos) {
        const fech = fechamentos.find(f => f.pasto_id === pasto.id);
        if (!fech) {
          results.push({ pasto, totalCabecas: 0, pesoMedio: null, cabHa: null });
          continue;
        }
        const items = await loadItens(fech.id);
        const totalCab = items.reduce((s, i) => s + i.quantidade, 0);
        const comPeso = items.filter(i => i.quantidade > 0 && i.peso_medio_kg);
        const pesoMedio = comPeso.length > 0
          ? comPeso.reduce((s, i) => s + (i.peso_medio_kg || 0) * i.quantidade, 0) / comPeso.reduce((s, i) => s + i.quantidade, 0)
          : null;
        const cabHa = pasto.area_produtiva_ha && totalCab > 0 ? totalCab / pasto.area_produtiva_ha : null;
        results.push({ pasto, totalCabecas: totalCab, pesoMedio, cabHa });
      }
      setResumos(results);
      setLoading(false);
    };
    calc();
  }, [fechamentos, pastos, loadItens]);

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  const totalGeral = resumos.reduce((s, r) => s + r.totalCabecas, 0);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3">
        <Select value={anoMes} onValueChange={setAnoMes}>
          <SelectTrigger className="w-40 h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getAnoMesOptions().map(am => (
              <SelectItem key={am} value={am}>{am.split('-').reverse().join('/')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{totalGeral} cab total</Badge>
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
        </div>
      )}
    </div>
  );
}
