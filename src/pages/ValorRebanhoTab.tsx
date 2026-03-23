import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Copy } from 'lucide-react';
import { Lancamento, SaldoInicial, CATEGORIAS, Categoria } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { calcSaldoPorCategoria } from '@/lib/calculos/zootecnicos';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { parseISO, format } from 'date-fns';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function ValorRebanhoTab({ lancamentos, saldosIniciais }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesFiltro, setMesFiltro] = useState(mesAtual);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const { precos, loading, saving, salvarPrecos, loadPrecosMesAnterior } = useValorRebanho(anoMes);

  // Local state for price inputs
  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});

  // Saldo final do mês por categoria (usando categorias_rebanho UUIDs)
  const saldoMap = useMemo(() => {
    if (!categorias.length) return new Map<string, number>();
    return calcSaldoPorCategoria(saldosIniciais, lancamentos, Number(anoFiltro), Number(mesFiltro), categorias);
  }, [saldosIniciais, lancamentos, anoFiltro, mesFiltro, categorias]);

  // Peso médio por categoria from saldos_iniciais (simplified)
  const pesoMedioMap = useMemo(() => {
    const map: Record<string, number> = {};
    saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .forEach(s => {
        if (s.pesoMedioKg && s.pesoMedioKg > 0) {
          map[s.categoria] = s.pesoMedioKg;
        }
      });
    return map;
  }, [saldosIniciais, anoFiltro]);

  // Build display rows: merge categorias_rebanho with CATEGORIAS codes
  const rows = useMemo(() => {
    return categorias
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      .map(cat => {
        const saldo = saldoMap.get(cat.id) || 0;
        const pesoMedio = pesoMedioMap[cat.codigo] || 0;
        const precoKg = precosLocal[cat.codigo] ?? 0;
        const valorTotal = saldo * pesoMedio * precoKg;
        return {
          categoriaId: cat.id,
          codigo: cat.codigo,
          nome: cat.nome,
          saldo,
          pesoMedio,
          precoKg,
          valorTotal,
        };
      });
  }, [categorias, saldoMap, pesoMedioMap, precosLocal]);

  const totalRebanho = useMemo(() => rows.reduce((sum, r) => sum + r.valorTotal, 0), [rows]);
  const totalCabecas = useMemo(() => rows.reduce((sum, r) => sum + r.saldo, 0), [rows]);

  // Sync loaded prices to local state
  useEffect(() => {
    const map: Record<string, number> = {};
    precos.forEach(p => { map[p.categoria] = p.preco_kg; });
    setPrecosLocal(map);
  }, [precos]);

  const handlePrecoChange = (codigo: string, value: string) => {
    const num = parseFloat(value.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handleSalvar = async () => {
    const items = Object.entries(precosLocal).map(([categoria, preco_kg]) => ({
      categoria,
      preco_kg,
    }));
    await salvarPrecos(items);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) {
      const { toast: t } = await import('sonner');
      t.info('Nenhum preço encontrado no mês anterior');
      return;
    }
    const map: Record<string, number> = { ...precosLocal };
    prev.forEach(p => { map[p.categoria] = p.preco_kg; });
    setPrecosLocal(map);
  };

  if (isGlobal) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Selecione uma fazenda para ver o valor do rebanho.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-[100px] touch-target text-base font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-[120px] touch-target text-base font-bold">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES_COLS.map(m => (
              <SelectItem key={m.key} value={m.key} className="text-base">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1">
          <Copy className="h-4 w-4" /> Mês anterior
        </Button>
      </div>

      {/* Summary card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Valor Total do Rebanho</p>
              <p className="text-2xl font-extrabold text-foreground">{formatMoeda(totalRebanho)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground font-medium">Total Cabeças</p>
              <p className="text-lg font-bold text-foreground">{totalCabecas}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold text-foreground">Categoria</th>
              <th className="text-right px-3 py-2 font-semibold text-foreground">Qtd</th>
              <th className="text-right px-3 py-2 font-semibold text-foreground">Peso (kg)</th>
              <th className="text-center px-3 py-2 font-semibold text-foreground min-w-[100px]">R$/kg</th>
              <th className="text-right px-3 py-2 font-semibold text-foreground">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'} ${r.saldo === 0 ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 font-medium text-foreground">{r.nome}</td>
                <td className="px-3 py-2 text-right text-foreground font-semibold">
                  {r.saldo > 0 ? r.saldo : '-'}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {r.pesoMedio > 0 ? formatNum(r.pesoMedio, 1) : '-'}
                </td>
                <td className="px-3 py-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-8 text-right text-sm w-full"
                    placeholder="0,00"
                    value={r.precoKg > 0 ? String(r.precoKg).replace('.', ',') : ''}
                    onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                    disabled={r.saldo === 0}
                  />
                </td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">
                  {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-primary/10">
              <td className="px-3 py-2 font-extrabold text-foreground">TOTAL</td>
              <td className="px-3 py-2 text-right font-extrabold text-foreground">{totalCabecas}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-extrabold text-foreground">{formatMoeda(totalRebanho)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSalvar} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar Preços'}
        </Button>
      </div>
    </div>
  );
}
