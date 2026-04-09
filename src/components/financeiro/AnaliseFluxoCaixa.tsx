/**
 * Bloco 4: Fluxo de Caixa mensal.
 *
 * Usa classificação centralizada de src/lib/financeiro/classificacao.ts.
 * Base: data_pagamento + Realizado.
 */
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import {
  isRealizado,
  isEntrada,
  isSaida,
  getEscopo,
  classificarSaidaFluxo,
  somaAbs,
} from '@/lib/financeiro/classificacao';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface Props {
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
}

interface FluxoMes {
  mes: number;
  mesLabel: string;
  entradas: number;
  saidasDeducao: number;
  saidasDesembolso: number;
  saidasReposicao: number;
  saidasAmortizacoes: number;
  saidasDividendos: number;
  totalSaidas: number;
  saldoMes: number;
  saldoAcum: number;
}

export function FluxoCaixa({
  lancConciliadosPorMes,
  anoFiltro,
  mesLimite,
  isGlobal,
}: Props) {
  const dados = useMemo(() => {
    const rows: FluxoMes[] = [];
    let saldoAcum = 0;

    for (let m = 1; m <= mesLimite; m++) {
      const mesKey = String(m).padStart(2, '0');
      const lancs = lancConciliadosPorMes.get(mesKey) || [];

      const entradas = somaAbs(lancs.filter(isEntrada));

      const saidasAll = lancs.filter(isSaida);
      let saidasDeducao = 0;
      let saidasDesembolso = 0;
      let saidasReposicao = 0;
      let saidasAmortizacoes = 0;
      let saidasDividendos = 0;

      for (const l of saidasAll) {
        const cat = classificarSaidaFluxo(l);
        const valor = Math.abs(l.valor);
        switch (cat) {
          case 'deducao': saidasDeducao += valor; break;
          case 'desembolso': saidasDesembolso += valor; break;
          case 'reposicao': saidasReposicao += valor; break;
          case 'amortizacoes': saidasAmortizacoes += valor; break;
          case 'dividendos': saidasDividendos += valor; break;
        }
      }

      const totalSaidas = saidasDeducao + saidasDesembolso + saidasReposicao + saidasAmortizacoes + saidasDividendos;
      const saldoMes = entradas - totalSaidas;
      saldoAcum += saldoMes;

      rows.push({
        mes: m,
        mesLabel: MESES_NOMES[m - 1],
        entradas,
        saidasDeducao,
        saidasDesembolso,
        saidasReposicao,
        saidasAmortizacoes,
        saidasDividendos,
        totalSaidas,
        saldoMes,
        saldoAcum,
      });
    }

    return rows;
  }, [lancConciliadosPorMes, mesLimite]);

  const totEntradas = dados.reduce((s, d) => s + d.entradas, 0);
  const totSaidas = dados.reduce((s, d) => s + d.totalSaidas, 0);
  const saldoFinal = dados.length > 0 ? dados[dados.length - 1].saldoAcum : 0;

  return (
    <div className="space-y-3">
      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">(+) Entradas</div>
            <p className="text-sm font-bold text-green-700 dark:text-green-400 whitespace-nowrap tabular-nums">{formatMoeda(totEntradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">(-) Saídas</div>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">{formatMoeda(totSaidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">Saldo</div>
            <p className={`text-sm font-bold whitespace-nowrap tabular-nums ${saldoFinal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatMoeda(saldoFinal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela mensal */}
      <Card>
        <CardContent className="p-2">
          <div className="text-[10px] font-bold text-muted-foreground mb-1 px-1">
            🏦 Fluxo de Caixa — {anoFiltro}
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] px-2 py-1.5 sticky left-0 bg-background z-10 min-w-[110px]">Descrição</TableHead>
                  {dados.map(d => (
                    <TableHead key={d.mes} className="text-[10px] px-2 py-1.5 text-right min-w-[70px]">
                      {d.mesLabel}
                    </TableHead>
                  ))}
                  <TableHead className="text-[10px] px-2 py-1.5 text-right font-bold min-w-[75px]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Entradas */}
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-green-700 dark:text-green-400 whitespace-nowrap">
                    (+) Entradas
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono text-green-700 dark:text-green-400 whitespace-nowrap tabular-nums">
                      {d.entradas > 0 ? fmtK(d.entradas) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold text-green-700 dark:text-green-400 whitespace-nowrap tabular-nums">
                    {fmtK(totEntradas)}
                  </TableCell>
                </TableRow>

                {/* Saídas detalhadas */}
                <SaidaRow label="  Dedução de Receitas" dados={dados} field="saidasDeducao" />
                <SaidaRow label="  Desemb. Produtivo" dados={dados} field="saidasDesembolso" />
                <SaidaRow label="  Reposição Bovinos" dados={dados} field="saidasReposicao" />
                <SaidaRow label="  Amortizações" dados={dados} field="saidasAmortizacoes" />
                <SaidaRow label="  Dividendos" dados={dados} field="saidasDividendos" />

                {/* Total Saídas */}
                <TableRow className="border-t">
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-red-600 dark:text-red-400 whitespace-nowrap">
                    (-) Total Saídas
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono font-bold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">
                      {d.totalSaidas > 0 ? fmtK(d.totalSaidas) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">
                    {fmtK(totSaidas)}
                  </TableCell>
                </TableRow>

                {/* Saldo mês */}
                <TableRow className="border-t-2">
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background whitespace-nowrap">
                    (=) Saldo mês
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className={`text-[10px] px-2 py-1 text-right font-mono font-bold whitespace-nowrap tabular-nums ${d.saldoMes >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtK(d.saldoMes)}
                    </TableCell>
                  ))}
                  <TableCell className={`text-[10px] px-2 py-1 text-right font-mono font-bold whitespace-nowrap tabular-nums ${saldoFinal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtK(saldoFinal)}
                  </TableCell>
                </TableRow>

                {/* Saldo acumulado */}
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background whitespace-nowrap">
                    Saldo acumulado
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className={`text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums ${d.saldoAcum >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtK(d.saldoAcum)}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono" />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="text-[9px] text-muted-foreground mt-2 border-t pt-2">
            Base: Data Pagamento · Status Conciliado · Saldo inicial = R$ 0 · Classificação: src/lib/financeiro/classificacao.ts
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helpers

function fmtK(v: number): string {
  if (v === 0) return '—';
  if (Math.abs(v) >= 1000) return formatNum(v / 1000, 0) + 'k';
  return formatMoeda(v);
}

function SaidaRow({ label, dados, field }: { label: string; dados: FluxoMes[]; field: keyof FluxoMes }) {
  const total = dados.reduce((s, d) => s + (d[field] as number), 0);
  if (total === 0) return null;

  return (
    <TableRow>
      <TableCell className="text-[10px] px-2 py-1 text-muted-foreground sticky left-0 bg-background whitespace-nowrap">
        {label}
      </TableCell>
      {dados.map(d => (
        <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono text-muted-foreground whitespace-nowrap tabular-nums">
          {(d[field] as number) > 0 ? fmtK(d[field] as number) : '—'}
        </TableCell>
      ))}
      <TableCell className="text-[10px] px-2 py-1 text-right font-mono text-muted-foreground whitespace-nowrap tabular-nums">
        {fmtK(total)}
      </TableCell>
    </TableRow>
  );
}
