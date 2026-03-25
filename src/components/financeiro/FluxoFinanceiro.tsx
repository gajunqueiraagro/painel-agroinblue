/**
 * Fluxo Financeiro — gráfico + cards + tabela 13 linhas.
 * Base: data_pagamento + Conciliado.
 * Valores em milhares (k).
 */
import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFluxoCaixa, type FluxoMensal } from '@/hooks/useFluxoCaixa';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { MESES_NOMES } from '@/lib/calculos/labels';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtK = (v: number): string => {
  if (v === 0) return '-';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};

const fmtMoeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  onAnoChange: (v: string) => void;
  onMesChange: (v: number) => void;
  anosDisponiveis: string[];
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({
  lancamentos, rateioADM, ano, mesAte,
  onAnoChange, onMesChange, anosDisponiveis, onBack,
}: Props) {
  const isMobile = useIsMobile();
  const { meses, loading } = useFluxoCaixa(lancamentos, rateioADM, ano, mesAte);
  const [cardMode, setCardMode] = useState<'mes' | 'acumulado'>('acumulado');

  // Card data
  const cardData = useMemo(() => {
    if (meses.length === 0) return { entradas: 0, saidas: 0, saldo: 0, saidasProprio: 0, saidasRateio: 0 };
    if (cardMode === 'mes') {
      const m = meses[mesAte - 1];
      if (!m) return { entradas: 0, saidas: 0, saldo: 0, saidasProprio: 0, saidasRateio: 0 };
      // For rateio decomposition, compute from rateioADM
      const anoStr = String(ano);
      const anoMes = `${anoStr}-${String(mesAte).padStart(2, '0')}`;
      const rateioMes = rateioADM.filter(r => r.anoMes === anoMes).reduce((s, r) => s + r.valorRateado, 0);
      return {
        entradas: m.totalEntradas,
        saidas: m.totalSaidas,
        saldo: m.saldoFinal - m.saldoInicial,
        saidasProprio: m.totalSaidas - rateioMes,
        saidasRateio: rateioMes,
      };
    }
    // acumulado
    const upTo = meses.slice(0, mesAte);
    const entradas = upTo.reduce((s, m) => s + m.totalEntradas, 0);
    const saidas = upTo.reduce((s, m) => s + m.totalSaidas, 0);
    const anoStr = String(ano);
    const totalRateio = rateioADM
      .filter(r => {
        if (!r.anoMes.startsWith(anoStr)) return false;
        const rm = Number(r.anoMes.substring(5, 7));
        return rm <= mesAte;
      })
      .reduce((s, r) => s + r.valorRateado, 0);
    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
      saidasProprio: saidas - totalRateio,
      saidasRateio: totalRateio,
    };
  }, [meses, cardMode, mesAte, ano, rateioADM]);

  // Chart data
  const chartData = useMemo(() =>
    meses.map(m => ({
      name: m.label,
      Entradas: m.mes <= mesAte ? m.totalEntradas : 0,
      Saídas: m.mes <= mesAte ? -m.totalSaidas : 0,
    })),
  [meses, mesAte]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const MESES_FILTRO = [
    { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
  ];

  return (
    <div className="p-4 max-w-full mx-auto space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
        )}
        <h1 className="text-lg md:text-xl font-extrabold text-foreground">💰 Fluxo Financeiro</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={String(ano)} onValueChange={onAnoChange}>
          <SelectTrigger className="w-24 text-sm font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(mesAte)} onValueChange={v => onMesChange(Number(v))}>
          <SelectTrigger className="w-36 text-sm font-bold">
            <SelectValue placeholder="Até o mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES_FILTRO.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">
                Até {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-4 pb-2">
          <h3 className="text-sm font-bold text-card-foreground mb-2">Entradas vs Saídas</h3>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtK(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmtMoeda(Math.abs(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Entradas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Saídas" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Entradas / Saídas Card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm md:text-base font-bold text-card-foreground">Entradas e Saídas</h3>
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setCardMode('mes')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                  cardMode === 'mes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setCardMode('acumulado')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                  cardMode === 'acumulado' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Acumulado
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm md:text-base text-muted-foreground">Entradas</span>
              <span className="text-base md:text-lg font-bold text-primary">{fmtMoeda(cardData.entradas)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm md:text-base text-muted-foreground">Saídas</span>
              <span className="text-base md:text-lg font-bold text-destructive">{fmtMoeda(cardData.saidas)}</span>
            </div>
            {/* Decomposition */}
            <div className="pl-4 space-y-1 border-l-2 border-destructive/20">
              <div className="flex justify-between items-center">
                <span className="text-xs md:text-sm text-muted-foreground">Próprio</span>
                <span className="text-sm md:text-base font-semibold text-destructive">{fmtMoeda(cardData.saidasProprio)}</span>
              </div>
              {cardData.saidasRateio > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-muted-foreground">Rateio ADM</span>
                  <span className="text-sm md:text-base font-semibold text-destructive">{fmtMoeda(cardData.saidasRateio)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center border-t border-border pt-2">
              <span className="text-sm md:text-base font-semibold text-muted-foreground">Saldo</span>
              <span className={`text-base md:text-lg font-bold ${cardData.saldo >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {fmtMoeda(cardData.saldo)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela Fluxo de Caixa 13 linhas */}
      <Card>
        <CardContent className="pt-4 pb-2 overflow-x-auto">
          <h3 className="text-sm md:text-base font-bold text-card-foreground mb-3">Fluxo de Caixa</h3>
          <FluxoTable meses={meses} mesAte={mesAte} isMobile={isMobile} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela 13 linhas
// ---------------------------------------------------------------------------

function FluxoTable({ meses, mesAte, isMobile }: { meses: FluxoMensal[]; mesAte: number; isMobile: boolean }) {
  const rows: { label: string; key: keyof FluxoMensal | 'acumulado'; bold?: boolean; indent?: boolean; color?: 'primary' | 'destructive' | 'muted' }[] = [
    { label: 'Saldo Inicial', key: 'saldoInicial', bold: true },
    { label: 'Total Entradas', key: 'totalEntradas', bold: true, color: 'primary' },
    { label: 'Receitas', key: 'receitas', indent: true },
    { label: 'Captação Financ.', key: 'captacao', indent: true },
    { label: 'Aportes Pessoais', key: 'aportes', indent: true },
    { label: 'Total Saídas', key: 'totalSaidas', bold: true, color: 'destructive' },
    { label: 'Desemp. Produtivo', key: 'desembolsoProdutivo', indent: true },
    { label: 'Reposição Bovinos', key: 'reposicao', indent: true },
    { label: 'Amortizações Fin.', key: 'amortizacoes', indent: true },
    { label: 'Dividendos', key: 'dividendos', indent: true },
    { label: 'Saldo Final', key: 'saldoFinal', bold: true },
    { label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true },
  ];

  // On mobile, show scrollable table
  const fontSize = isMobile ? 'text-[10px]' : 'text-sm';
  const cellPad = isMobile ? 'px-1 py-1' : 'px-2 py-1.5';

  return (
    <div className="overflow-x-auto -mx-2">
      <table className={`w-full min-w-[700px] ${fontSize}`}>
        <thead>
          <tr className="border-b border-border">
            <th className={`${cellPad} text-left font-bold text-muted-foreground sticky left-0 bg-card z-10`} style={{ minWidth: isMobile ? 100 : 140 }}>
              Linha
            </th>
            {meses.map(m => (
              <th
                key={m.mes}
                className={`${cellPad} text-right font-bold ${
                  m.mes > mesAte ? 'text-muted-foreground/40' : 'text-muted-foreground'
                }`}
              >
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={`border-b border-border/50 ${row.bold ? 'bg-muted/30' : ''}`}>
              <td
                className={`${cellPad} text-left font-${row.bold ? 'bold' : 'normal'} ${
                  row.indent ? 'pl-4 md:pl-6' : ''
                } text-card-foreground sticky left-0 bg-card z-10`}
                style={{ minWidth: isMobile ? 100 : 140 }}
              >
                {row.label}
              </td>
              {meses.map(m => {
                const val = m[row.key as keyof FluxoMensal] as number;
                const isAfter = m.mes > mesAte;
                const colorClass = isAfter
                  ? 'text-muted-foreground/30'
                  : row.color === 'primary'
                    ? 'text-primary'
                    : row.color === 'destructive'
                      ? 'text-destructive'
                      : val < 0
                        ? 'text-destructive'
                        : 'text-card-foreground';

                return (
                  <td
                    key={m.mes}
                    className={`${cellPad} text-right font-${row.bold ? 'bold' : 'normal'} ${colorClass}`}
                  >
                    {isAfter ? '-' : fmtK(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
