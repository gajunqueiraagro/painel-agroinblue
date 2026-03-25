/**
 * Tela Zootécnica — visão física e operacional do rebanho.
 * 6 blocos: KPIs, Estoque Mensal, Entradas, Saídas, Desfrute, Evolução.
 */
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe, calcDesfrute, calcDesfruteArrobas, calcArrobasIniciais, calcGMD } from '@/lib/calculos/economicos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { resolverPesoOficial } from '@/hooks/useFechamentoCategoria';
import { TabId } from '@/components/BottomNav';
import { ArrowLeft, ChevronDown, TrendingUp, TrendingDown, Beef, BarChart2, Activity } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
}

const TIPOS_ENTRADA = ['nascimento', 'compra', 'transferencia_entrada'];
const TIPOS_SAIDA = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

export function ZootecnicoTab({ lancamentos, saldosIniciais, onBack }: Props) {
  const { fazendaAtual, isGlobal, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const mesDefault = anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
  const [mesLimite, setMesLimite] = useState(mesDefault);

  const handleAnoChange = (val: string) => {
    setAnoFiltro(val);
    const n = Number(val);
    setMesLimite(n === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  };

  const zoo = useIndicadoresZootecnicos(fazendaId, anoNum, mesLimite, lancamentos, saldosIniciais, pastos, categorias);

  // ---- Estoque Mensal ----
  const estoqueMensal = useMemo(() => {
    const areaPec = calcAreaProdutivaPecuaria(pastos);
    const rows: any[] = [];
    let sumCab = 0, sumArrobas = 0, sumValor = 0, sumLotacao = 0, sumGmd = 0;
    let countLotacao = 0, countGmd = 0;
    let sumPesoPonderado = 0, sumCabPeso = 0;

    for (let m = 1; m <= mesLimite; m++) {
      const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, m);
      const cabFinal = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
      const saldoMapAnt = m > 1
        ? calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, m - 1)
        : null;
      const cabAnt = saldoMapAnt
        ? Array.from(saldoMapAnt.values()).reduce((s, v) => s + v, 0)
        : saldosIniciais.filter(s => s.ano === anoNum).reduce((s, si) => s + si.quantidade, 0);
      const cabMedia = (cabAnt + cabFinal) / 2;

      // Peso médio simples (sem async) — usa saldos iniciais como fallback
      const itens = Array.from(saldoMap.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => {
          const si = saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat);
          return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
        });
      const pesoMedio = calcPesoMedioPonderado(itens);
      const arrobas = pesoMedio ? (cabFinal * pesoMedio) / 30 : null;
      const lotacao = calcUAHa(calcUA(cabFinal, pesoMedio), areaPec);

      sumCab += cabFinal;
      if (arrobas) sumArrobas += arrobas;
      if (pesoMedio && cabFinal > 0) { sumPesoPonderado += pesoMedio * cabFinal; sumCabPeso += cabFinal; }
      if (lotacao) { sumLotacao += lotacao; countLotacao++; }

      rows.push({
        mes: MESES_NOMES[m - 1],
        cabFinal,
        cabMedia: Math.round(cabMedia),
        pesoMedio,
        arrobas,
        lotacao,
        gmd: null, // simplified
        valorRebanho: null,
      });
    }

    const pesoMedioTotal = sumCabPeso > 0 ? sumPesoPonderado / sumCabPeso : null;
    const lotacaoMedia = countLotacao > 0 ? sumLotacao / countLotacao : null;

    return { rows, sumCab, sumArrobas, pesoMedioTotal, lotacaoMedia };
  }, [saldosIniciais, lancamentos, anoNum, mesLimite, pastos]);

  // ---- Movimentações agrupadas ----
  const movimentacoes = useMemo(() => {
    const lancsAno = lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        return d.getFullYear() === anoNum && d.getMonth() + 1 <= mesLimite;
      } catch { return false; }
    });

    const porTipo = (tipos: string[]) => {
      const filtrados = lancsAno.filter(l => tipos.includes(l.tipo));
      const cab = filtrados.reduce((s, l) => s + l.quantidade, 0);
      const pesoTotal = filtrados.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
      const arrobas = filtrados.reduce((s, l) => s + calcArrobasSafe(l), 0);
      const pesoMedio = cab > 0 ? pesoTotal / cab : null;
      return { cab, pesoMedio, arrobas };
    };

    const porMes = (tipos: string[]) => {
      const result: { mes: string; cab: number }[] = [];
      for (let m = 1; m <= mesLimite; m++) {
        const mesStr = `${anoNum}-${String(m).padStart(2, '0')}`;
        const cab = lancsAno.filter(l => l.data.startsWith(mesStr) && tipos.includes(l.tipo))
          .reduce((s, l) => s + l.quantidade, 0);
        result.push({ mes: MESES_NOMES[m - 1], cab });
      }
      return result;
    };

    return {
      nascimentos: porTipo(['nascimento']),
      compras: porTipo(['compra']),
      transfEntrada: porTipo(['transferencia_entrada']),
      vendas: porTipo(['venda']),
      abates: porTipo(['abate']),
      consumo: porTipo(['consumo']),
      mortes: porTipo(['morte']),
      transfSaida: porTipo(['transferencia_saida']),
      entradasMes: porMes(TIPOS_ENTRADA),
      saidasMes: porMes(TIPOS_SAIDA),
      totalEntradas: porTipo(TIPOS_ENTRADA),
      totalSaidas: porTipo(TIPOS_SAIDA),
    };
  }, [lancamentos, anoNum, mesLimite]);

  // ---- Evolução ----
  const evolucao = useMemo(() => {
    const data: { mes: string; cabecas: number; arrobas: number | null; pesoMedio: number | null }[] = [];
    for (let m = 1; m <= mesLimite; m++) {
      const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum, m);
      const cab = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
      const itens = Array.from(saldoMap.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => {
          const si = saldosIniciais.find(s => s.ano === anoNum && s.categoria === cat);
          return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
        });
      const pm = calcPesoMedioPonderado(itens);
      data.push({
        mes: MESES_NOMES[m - 1],
        cabecas: cab,
        arrobas: pm ? (cab * pm) / 30 : null,
        pesoMedio: pm,
      });
    }
    return data;
  }, [saldosIniciais, lancamentos, anoNum, mesLimite]);

  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const toggle = (id: string) => setOpenBlock(prev => prev === id ? null : id);

  const KpiMini = ({ label, value }: { label: string; value: string }) => (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-extrabold text-foreground">{value}</p>
    </div>
  );

  const MovCard = ({ label, cab, peso, arrobas, emoji }: { label: string; cab: number; peso: number | null; arrobas: number; emoji: string }) => (
    <div className="bg-card border rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <span>{emoji}</span>
        <span className="text-xs font-bold text-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Cabeças</p>
          <p className="text-sm font-extrabold">{formatNum(cab)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Peso Méd.</p>
          <p className="text-sm font-bold">{peso ? `${formatNum(peso, 0)} kg` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Arrobas</p>
          <p className="text-sm font-bold">{formatNum(arrobas, 1)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-extrabold text-foreground">🐄 Zootécnico</h1>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={handleAnoChange}>
          <SelectTrigger className="w-24 text-base font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(mesLimite)} onValueChange={v => setMesLimite(Number(v))}>
          <SelectTrigger className="w-32 text-sm font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>Até {MESES_NOMES[i]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">Jan → {MESES_NOMES[mesLimite - 1]}</span>
      </div>

      {/* BLOCO 1 — KPIs */}
      <div className="bg-primary rounded-xl p-4 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <Beef className="h-6 w-6 text-primary-foreground" />
          <span className="text-primary-foreground font-extrabold text-lg">Resumo do Rebanho</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">Cab. Finais</p>
            <p className="text-lg font-extrabold text-primary-foreground">{formatNum(zoo.saldoFinalMes)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">Peso Médio</p>
            <p className="text-lg font-extrabold text-primary-foreground">{zoo.pesoMedioRebanhoKg ? `${formatNum(zoo.pesoMedioRebanhoKg, 0)}` : '—'}</p>
            <p className="text-[9px] text-primary-foreground/60">kg</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">Lotação</p>
            <p className="text-lg font-extrabold text-primary-foreground">{zoo.uaHa ? formatNum(zoo.uaHa, 2) : '—'}</p>
            <p className="text-[9px] text-primary-foreground/60">UA/ha</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">GMD</p>
            <p className="text-lg font-extrabold text-primary-foreground">{zoo.gmdAcumulado ? formatNum(zoo.gmdAcumulado, 3) : '—'}</p>
            <p className="text-[9px] text-primary-foreground/60">kg/dia</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-primary-foreground/20">
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">@ Produzidas</p>
            <p className="text-sm font-extrabold text-primary-foreground">{zoo.arrobasProduzidasAcumulado ? formatNum(zoo.arrobasProduzidasAcumulado, 0) : '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">Valor Rebanho</p>
            <p className="text-sm font-extrabold text-primary-foreground">{zoo.valorRebanho ? formatMoeda(zoo.valorRebanho) : '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-primary-foreground/70 font-semibold">Desfrute @</p>
            <p className="text-sm font-extrabold text-primary-foreground">{zoo.desfruteArrobasAcumulado ? `${formatNum(zoo.desfruteArrobasAcumulado, 1)}%` : '—'}</p>
          </div>
        </div>
      </div>

      {/* BLOCO 2 — Estoque Mensal */}
      <Collapsible open={openBlock === 'estoque'} onOpenChange={() => toggle('estoque')}>
        <CollapsibleTrigger className="w-full bg-card border rounded-lg p-3 flex items-center justify-between">
          <span className="font-bold text-foreground text-sm">📋 Estoque Mensal</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openBlock === 'estoque' ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto mt-2 border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-bold whitespace-nowrap">Mês</TableHead>
                  <TableHead className="text-xs font-bold text-right whitespace-nowrap">Cab Final</TableHead>
                  <TableHead className="text-xs font-bold text-right whitespace-nowrap">Cab Média</TableHead>
                  <TableHead className="text-xs font-bold text-right whitespace-nowrap">Peso Méd.</TableHead>
                  <TableHead className="text-xs font-bold text-right whitespace-nowrap">@ Total</TableHead>
                  <TableHead className="text-xs font-bold text-right whitespace-nowrap">Lotação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estoqueMensal.rows.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-semibold">{r.mes}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{formatNum(r.cabFinal)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{formatNum(r.cabMedia)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.pesoMedio ? formatNum(r.pesoMedio, 0) : '—'}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.arrobas ? formatNum(r.arrobas, 0) : '—'}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.lotacao ? formatNum(r.lotacao, 2) : '—'}</TableCell>
                  </TableRow>
                ))}
                {/* Linha totalizadora */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell className="text-xs font-extrabold">Total / Média</TableCell>
                  <TableCell className="text-xs text-right font-extrabold tabular-nums">
                    {formatNum(estoqueMensal.rows[estoqueMensal.rows.length - 1]?.cabFinal ?? 0)}
                    <span className="text-[9px] text-muted-foreground ml-1">(último)</span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-extrabold tabular-nums">
                    {formatNum(Math.round(estoqueMensal.sumCab / mesLimite))}
                    <span className="text-[9px] text-muted-foreground ml-1">(média)</span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-extrabold tabular-nums">
                    {estoqueMensal.pesoMedioTotal ? formatNum(estoqueMensal.pesoMedioTotal, 0) : '—'}
                    <span className="text-[9px] text-muted-foreground ml-1">(pond.)</span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-extrabold tabular-nums">
                    {formatNum(estoqueMensal.sumArrobas, 0)}
                    <span className="text-[9px] text-muted-foreground ml-1">(soma)</span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-extrabold tabular-nums">
                    {estoqueMensal.lotacaoMedia ? formatNum(estoqueMensal.lotacaoMedia, 2) : '—'}
                    <span className="text-[9px] text-muted-foreground ml-1">(média)</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* BLOCO 3 — Entradas */}
      <Collapsible open={openBlock === 'entradas'} onOpenChange={() => toggle('entradas')}>
        <CollapsibleTrigger className="w-full bg-card border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="font-bold text-foreground text-sm">Entradas</span>
            <span className="text-xs font-extrabold text-emerald-600">+{formatNum(movimentacoes.totalEntradas.cab)}</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openBlock === 'entradas' ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          <MovCard label="Nascimentos" emoji="🐄" {...movimentacoes.nascimentos} peso={movimentacoes.nascimentos.pesoMedio} />
          <MovCard label="Compras" emoji="🛒" {...movimentacoes.compras} peso={movimentacoes.compras.pesoMedio} />
          <MovCard label="Transf. Entrada" emoji="📥" {...movimentacoes.transfEntrada} peso={movimentacoes.transfEntrada.pesoMedio} />

          {movimentacoes.entradasMes.some(m => m.cab > 0) && (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movimentacoes.entradasMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="cab" name="Cabeças" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* BLOCO 4 — Saídas */}
      <Collapsible open={openBlock === 'saidas'} onOpenChange={() => toggle('saidas')}>
        <CollapsibleTrigger className="w-full bg-card border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <span className="font-bold text-foreground text-sm">Saídas</span>
            <span className="text-xs font-extrabold text-destructive">-{formatNum(movimentacoes.totalSaidas.cab)}</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openBlock === 'saidas' ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          <MovCard label="Vendas" emoji="💰" {...movimentacoes.vendas} peso={movimentacoes.vendas.pesoMedio} />
          <MovCard label="Abates" emoji="🔪" {...movimentacoes.abates} peso={movimentacoes.abates.pesoMedio} />
          <MovCard label="Consumo" emoji="🍖" {...movimentacoes.consumo} peso={movimentacoes.consumo.pesoMedio} />
          <MovCard label="Mortes" emoji="💀" {...movimentacoes.mortes} peso={movimentacoes.mortes.pesoMedio} />
          <MovCard label="Transf. Saída" emoji="📤" {...movimentacoes.transfSaida} peso={movimentacoes.transfSaida.pesoMedio} />

          {movimentacoes.saidasMes.some(m => m.cab > 0) && (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movimentacoes.saidasMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="cab" name="Cabeças" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* BLOCO 5 — Desfrute */}
      <Collapsible open={openBlock === 'desfrute'} onOpenChange={() => toggle('desfrute')}>
        <CollapsibleTrigger className="w-full bg-card border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-600" />
            <span className="font-bold text-foreground text-sm">Desfrute</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openBlock === 'desfrute' ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-semibold">Desfrute Cab. Acum.</p>
              <p className="text-xl font-extrabold">{zoo.desfruteCabecasAcumulado ? `${formatNum(zoo.desfruteCabecasAcumulado, 1)}%` : '—'}</p>
            </div>
            <div className="bg-card border rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-semibold">Desfrute @ Acum.</p>
              <p className="text-xl font-extrabold">{zoo.desfruteArrobasAcumulado ? `${formatNum(zoo.desfruteArrobasAcumulado, 1)}%` : '—'}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* BLOCO 6 — Evolução */}
      <Collapsible open={openBlock === 'evolucao'} onOpenChange={() => toggle('evolucao')}>
        <CollapsibleTrigger className="w-full bg-card border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-600" />
            <span className="font-bold text-foreground text-sm">Evolução do Rebanho</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openBlock === 'evolucao' ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          {evolucao.length > 0 && (
            <>
              <p className="text-xs font-bold text-muted-foreground">Cabeças por mês</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucao}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="cabecas" name="Cabeças" fill="hsl(var(--primary))" fillOpacity={0.3} stroke="hsl(var(--primary))" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs font-bold text-muted-foreground">Peso Médio (kg) por mês</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolucao.filter(d => d.pesoMedio !== null)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pesoMedio" name="Peso Médio (kg)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
