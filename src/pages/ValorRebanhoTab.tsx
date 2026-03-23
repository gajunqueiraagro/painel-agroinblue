import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Save, Copy, Eye, EyeOff } from 'lucide-react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { calcSaldoPorCategoria } from '@/lib/calculos/zootecnicos';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { parseISO, format } from 'date-fns';
import { toast } from 'sonner';

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
  const [mostrarZerados, setMostrarZerados] = useState(false);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const { precos, loading, saving, salvarPrecos, loadPrecosMesAnterior } = useValorRebanho(anoMes);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});

  // Saldo final do mês por categoria
  const saldoMap = useMemo(() => {
    if (!categorias.length) return new Map<string, number>();
    return calcSaldoPorCategoria(saldosIniciais, lancamentos, Number(anoFiltro), Number(mesFiltro), categorias);
  }, [saldosIniciais, lancamentos, anoFiltro, mesFiltro, categorias]);

  // Peso médio ponderado por categoria — usa saldo inicial + movimentações com peso
  const pesoMedioMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Base: saldo inicial do ano
    saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .forEach(s => {
        if (s.pesoMedioKg && s.pesoMedioKg > 0) {
          map[s.categoria] = s.pesoMedioKg;
        }
      });
    // Override com último lançamento que tenha peso no período (mais recente = mais atual)
    const mesStr = mesFiltro;
    const endDate = `${anoFiltro}-${mesStr}-31`;
    const startDate = `${anoFiltro}-01-01`;
    lancamentos
      .filter(l => l.data >= startDate && l.data <= endDate && l.pesoMedioKg && l.pesoMedioKg > 0)
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach(l => {
        // Atualiza o peso da categoria com o dado mais recente
        if (l.pesoMedioKg && l.pesoMedioKg > 0) {
          map[l.categoria] = l.pesoMedioKg;
        }
      });
    return map;
  }, [saldosIniciais, lancamentos, anoFiltro, mesFiltro]);

  // Build rows
  const allRows = useMemo(() => {
    return categorias
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      .map(cat => {
        const saldo = saldoMap.get(cat.id) || 0;
        const pesoMedio = pesoMedioMap[cat.codigo] || 0;
        const precoKg = precosLocal[cat.codigo] ?? 0;
        const valorTotal = saldo * pesoMedio * precoKg;
        const valorCabeca = saldo > 0 && pesoMedio > 0 && precoKg > 0 ? pesoMedio * precoKg : 0;
        return {
          categoriaId: cat.id,
          codigo: cat.codigo,
          nome: cat.nome,
          saldo,
          pesoMedio,
          precoKg,
          valorCabeca,
          valorTotal,
        };
      });
  }, [categorias, saldoMap, pesoMedioMap, precosLocal]);

  const rows = useMemo(() => {
    if (mostrarZerados) return allRows;
    return allRows.filter(r => r.saldo > 0);
  }, [allRows, mostrarZerados]);

  const categoriasOcultas = allRows.length - allRows.filter(r => r.saldo > 0).length;

  const totalRebanho = useMemo(() => allRows.reduce((sum, r) => sum + r.valorTotal, 0), [allRows]);
  const totalCabecas = useMemo(() => allRows.reduce((sum, r) => sum + r.saldo, 0), [allRows]);
  const pesoMedioGeral = useMemo(() => {
    const totalPeso = allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0);
    return totalCabecas > 0 ? totalPeso / totalCabecas : 0;
  }, [allRows, totalCabecas]);
  const valorMedioCabeca = totalCabecas > 0 ? totalRebanho / totalCabecas : 0;

  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

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
      toast.info('Nenhum preço encontrado no mês anterior');
      return;
    }
    const map: Record<string, number> = { ...precosLocal };
    prev.forEach(p => { map[p.categoria] = p.preco_kg; });
    setPrecosLocal(map);
    toast.success(`${prev.length} preços copiados do mês anterior`);
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
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Valor do Rebanho — {mesLabel}/{anoFiltro}
          </p>
          <p className="text-2xl font-extrabold text-foreground">{formatMoeda(totalRebanho)}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{totalCabecas}</strong> cabeças</span>
            <span>Peso médio: <strong className="text-foreground">{formatNum(pesoMedioGeral, 1)} kg</strong></span>
            <span>R$/cab: <strong className="text-foreground">{formatMoeda(valorMedioCabeca)}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold text-foreground">Categoria</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">Qtd</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">Peso</th>
              <th className="text-center px-2 py-2 font-semibold text-foreground min-w-[90px]">R$/kg</th>
              <th className="text-right px-2 py-2 font-semibold text-foreground">R$/cab</th>
              <th className="text-right px-3 py-2 font-semibold text-foreground">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                <td className="px-3 py-2 font-medium text-foreground">{r.nome}</td>
                <td className="px-2 py-2 text-right text-foreground font-semibold">
                  {r.saldo > 0 ? r.saldo : '-'}
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground text-xs">
                  {r.pesoMedio > 0 ? `${formatNum(r.pesoMedio, 1)} kg` : '-'}
                </td>
                <td className="px-2 py-1">
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
                <td className="px-2 py-2 text-right text-muted-foreground text-xs">
                  {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
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
              <td className="px-2 py-2 text-right font-extrabold text-foreground">{totalCabecas}</td>
              <td className="px-2 py-2 text-right text-xs text-muted-foreground">{formatNum(pesoMedioGeral, 1)} kg</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right text-xs font-semibold text-foreground">{formatMoeda(valorMedioCabeca)}</td>
              <td className="px-3 py-2 text-right font-extrabold text-foreground">{formatMoeda(totalRebanho)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Toggle hidden categories + Save */}
      <div className="flex justify-between items-center">
        {categoriasOcultas > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMostrarZerados(!mostrarZerados)} className="gap-1 text-xs text-muted-foreground">
            {mostrarZerados ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {mostrarZerados ? 'Ocultar zeradas' : `Mostrar ${categoriasOcultas} zeradas`}
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={handleSalvar} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Preços'}
          </Button>
        </div>
      </div>
    </div>
  );
}
