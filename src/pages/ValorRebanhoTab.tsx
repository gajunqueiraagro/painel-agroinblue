import { useState, useMemo, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Save, Copy, Eye, EyeOff, Info } from 'lucide-react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { calcSaldoPorCategoria } from '@/lib/calculos/zootecnicos';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, format } from 'date-fns';
import { toast } from 'sonner';

/**
 * Fonte do peso médio por categoria — hierarquia de prioridade:
 *
 * 1. "fechamento" — Peso médio ponderado dos fechamentos de pasto do mês
 *    (média ponderada por qtd de `fechamento_pasto_itens` da mesma categoria).
 *    Fonte oficial quando o mês tem fechamento completo.
 *
 * 2. "lancamento" — Último lançamento com peso no período (jan→mês atual).
 *    Usado como dado mais recente disponível quando não há fechamento.
 *
 * 3. "saldo_inicial" — Peso médio informado no saldo inicial do ano.
 *    Fallback base quando não há nenhum dado mais atual.
 *
 * Se nenhuma fonte disponível → peso = 0 (sem estimativa forçada).
 */
type FontePeso = 'fechamento' | 'lancamento' | 'saldo_inicial';

interface PesoInfo {
  valor: number;
  fonte: FontePeso;
}

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function ValorRebanhoTab({ lancamentos, saldosIniciais }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

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

  // --- Fechamento: peso médio ponderado por categoria_id ---
  const [pesoFechamentoMap, setPesoFechamentoMap] = useState<Record<string, number>>({});

  const loadPesosFechamento = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') return;
    try {
      // Get all fechamentos for this month
      const { data: fechamentos } = await supabase
        .from('fechamento_pastos')
        .select('id')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMes);

      if (!fechamentos || fechamentos.length === 0) {
        setPesoFechamentoMap({});
        return;
      }

      const fechIds = fechamentos.map(f => f.id);
      const { data: itens } = await supabase
        .from('fechamento_pasto_itens')
        .select('categoria_id, quantidade, peso_medio_kg')
        .in('fechamento_id', fechIds);

      if (!itens) { setPesoFechamentoMap({}); return; }

      // Média ponderada por categoria_id
      const acum: Record<string, { totalPeso: number; totalQtd: number }> = {};
      itens.forEach(item => {
        if (!item.peso_medio_kg || item.peso_medio_kg <= 0 || item.quantidade <= 0) return;
        if (!acum[item.categoria_id]) acum[item.categoria_id] = { totalPeso: 0, totalQtd: 0 };
        acum[item.categoria_id].totalPeso += item.peso_medio_kg * item.quantidade;
        acum[item.categoria_id].totalQtd += item.quantidade;
      });

      const map: Record<string, number> = {};
      // Map from categoria_id → codigo for consistency
      const idToCodigo = new Map(categorias.map(c => [c.id, c.codigo]));
      Object.entries(acum).forEach(([catId, { totalPeso, totalQtd }]) => {
        const codigo = idToCodigo.get(catId);
        if (codigo && totalQtd > 0) {
          map[codigo] = totalPeso / totalQtd;
        }
      });
      setPesoFechamentoMap(map);
    } catch {
      setPesoFechamentoMap({});
    }
  }, [fazendaId, anoMes, categorias]);

  useEffect(() => { loadPesosFechamento(); }, [loadPesosFechamento]);

  // Saldo final do mês por categoria
  const saldoMap = useMemo(() => {
    if (!categorias.length) return new Map<string, number>();
    return calcSaldoPorCategoria(saldosIniciais, lancamentos, Number(anoFiltro), Number(mesFiltro), categorias);
  }, [saldosIniciais, lancamentos, anoFiltro, mesFiltro, categorias]);

  // --- Peso médio com hierarquia de fontes e rastreamento ---
  const pesoMedioMap = useMemo(() => {
    const map: Record<string, PesoInfo> = {};

    // Nível 3 (fallback): saldo inicial do ano
    saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .forEach(s => {
        if (s.pesoMedioKg && s.pesoMedioKg > 0) {
          map[s.categoria] = { valor: s.pesoMedioKg, fonte: 'saldo_inicial' };
        }
      });

    // Nível 2: último lançamento com peso no período
    const endDate = `${anoFiltro}-${mesFiltro}-31`;
    const startDate = `${anoFiltro}-01-01`;
    lancamentos
      .filter(l => l.data >= startDate && l.data <= endDate && l.pesoMedioKg && l.pesoMedioKg > 0)
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach(l => {
        if (l.pesoMedioKg && l.pesoMedioKg > 0) {
          map[l.categoria] = { valor: l.pesoMedioKg, fonte: 'lancamento' };
        }
      });

    // Nível 1 (oficial): peso do fechamento do mês
    Object.entries(pesoFechamentoMap).forEach(([codigo, peso]) => {
      if (peso > 0) {
        map[codigo] = { valor: peso, fonte: 'fechamento' };
      }
    });

    return map;
  }, [saldosIniciais, lancamentos, anoFiltro, mesFiltro, pesoFechamentoMap]);

  // Build rows
  const allRows = useMemo(() => {
    return categorias
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      .map(cat => {
        const saldo = saldoMap.get(cat.id) || 0;
        const pesoInfo = pesoMedioMap[cat.codigo];
        const pesoMedio = pesoInfo?.valor || 0;
        const fonte = pesoInfo?.fonte || null;
        const precoKg = precosLocal[cat.codigo] ?? 0;
        const valorTotal = saldo * pesoMedio * precoKg;
        const valorCabeca = saldo > 0 && pesoMedio > 0 && precoKg > 0 ? pesoMedio * precoKg : 0;
        return {
          categoriaId: cat.id,
          codigo: cat.codigo,
          nome: cat.nome,
          saldo,
          pesoMedio,
          fonte,
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
  const temEstimativa = rows.some(r => r.saldo > 0 && r.pesoMedio > 0 && r.fonte !== 'fechamento');

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

  const fonteLabel = (fonte: FontePeso | null): string => {
    switch (fonte) {
      case 'fechamento': return 'Fechamento do mês';
      case 'lancamento': return 'Último lançamento';
      case 'saldo_inicial': return 'Saldo inicial do ano';
      default: return 'Sem dados';
    }
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
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <span><strong className="text-foreground">{totalCabecas}</strong> cabeças</span>
            <span>Peso médio: <strong className="text-foreground">{formatNum(pesoMedioGeral, 1)} kg</strong></span>
            <span>R$/cab: <strong className="text-foreground">{formatMoeda(valorMedioCabeca)}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Aviso de estimativa */}
      {temEstimativa && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Algumas categorias usam peso estimado (último lançamento ou saldo inicial).
            Para maior precisão, realize o fechamento de pastos do mês com peso médio informado.
          </span>
        </div>
      )}

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
                <td className="px-2 py-2 text-right text-xs">
                  {r.pesoMedio > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`cursor-help ${r.fonte === 'fechamento' ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                          {formatNum(r.pesoMedio, 1)} kg
                          {r.fonte !== 'fechamento' && ' *'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Fonte: {fonteLabel(r.fonte)}
                      </TooltipContent>
                    </Tooltip>
                  ) : '-'}
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

      {/* Footer: legend + toggle + save */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-muted-foreground">
          * Peso estimado — sem fechamento oficial no mês. Passe o dedo sobre o valor para ver a fonte.
        </p>
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
    </div>
  );
}
