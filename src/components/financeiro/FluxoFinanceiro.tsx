/**
 * Fluxo de Caixa Global — tabela 12 linhas, jan-dez + coluna Total.
 * Base: data_pagamento + Conciliado.
 * SEMPRE GLOBAL — independente da fazenda selecionada.
 */
import { useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFluxoCaixa, type FluxoMensal } from '@/hooks/useFluxoCaixa';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  /** Nome da fazenda atual — se presente, significa que o usuário está numa fazenda específica */
  fazendaAtualNome?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({ lancamentos, rateioADM, ano, mesAte, fazendaAtualNome }: Props) {
  const isMobile = useIsMobile();
  const { meses, loading, saldoInicialAusente, saldoInicialAudit } = useFluxoCaixa(lancamentos, rateioADM, ano, mesAte);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-full mx-auto space-y-3 animate-fade-in">
      {/* Banner: fluxo é sempre global */}
      {fazendaAtualNome && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">
            O Fluxo de Caixa representa o <strong>caixa global consolidado</strong> da operação.
            A visão por fazenda é usada apenas para análise operacional e econômica.
          </span>
        </div>
      )}

      {/* Aviso saldo inicial ausente */}
      {saldoInicialAusente && (
        <div className="text-[10px] text-muted-foreground bg-muted rounded-md px-2.5 py-1.5">
          ⓘ Saldo inicial zerado — sem registros SALDO em Dez/{ano - 1} na EXPORT_APP_UNICO
        </div>
      )}

      {/* Auditoria do saldo inicial */}
      {saldoInicialAudit && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-3 w-3" />
            Auditoria Saldo Inicial
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 text-[10px] bg-muted rounded-md px-2.5 py-2 space-y-0.5">
            <p><strong>Fonte:</strong> {saldoInicialAudit.fonte}</p>
            <p><strong>Período:</strong> {saldoInicialAudit.periodo}</p>
            <p><strong>Registros encontrados:</strong> {saldoInicialAudit.qtdRegistros}</p>
            {saldoInicialAudit.contas.length > 0 && (
              <p><strong>Contas:</strong> {saldoInicialAudit.contas.join(', ')}</p>
            )}
            <p><strong>Soma total:</strong> R$ {saldoInicialAudit.somaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Tabela Fluxo de Caixa */}
      <Card>
        <CardContent className="pt-4 pb-2 overflow-x-auto">
          <h3 className="text-sm md:text-base font-bold text-card-foreground mb-3">
            Fluxo de Caixa Global
          </h3>
          <FluxoTable meses={meses} mesAte={mesAte} isMobile={isMobile} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela 12 linhas + coluna Total
// ---------------------------------------------------------------------------

interface RowDef {
  label: string;
  key: keyof FluxoMensal;
  bold?: boolean;
  indent?: boolean;
  tipo?: 'entrada' | 'saida' | 'saldo';
}

const ROWS: RowDef[] = [
  { label: 'Saldo Inicial', key: 'saldoInicial', bold: true, tipo: 'saldo' },
  { label: 'Total Entradas', key: 'totalEntradas', bold: true, tipo: 'entrada' },
  { label: 'Receitas', key: 'receitas', indent: true, tipo: 'entrada' },
  { label: 'Captação Financ.', key: 'captacao', indent: true, tipo: 'entrada' },
  { label: 'Aportes Pessoais', key: 'aportes', indent: true, tipo: 'entrada' },
  { label: 'Total Saídas', key: 'totalSaidas', bold: true, tipo: 'saida' },
  { label: 'Desemb. Produtivo', key: 'desembolsoProdutivo', indent: true, tipo: 'saida' },
  { label: 'Reposição Bovinos', key: 'reposicao', indent: true, tipo: 'saida' },
  { label: 'Amortizações Fin.', key: 'amortizacoes', indent: true, tipo: 'saida' },
  { label: 'Dividendos', key: 'dividendos', indent: true, tipo: 'saida' },
  { label: 'Saldo Final', key: 'saldoFinal', bold: true, tipo: 'saldo' },
  { label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true, tipo: 'saldo' },
];

function getValueColor(val: number, row: RowDef, isAfter: boolean): string {
  if (isAfter) return 'text-muted-foreground/30';
  if (val === 0) return 'text-muted-foreground';
  if (row.tipo === 'entrada') return 'text-green-600 dark:text-green-400';
  if (row.tipo === 'saida') return 'text-red-600 dark:text-red-400';
  return val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

function FluxoTable({ meses, mesAte, isMobile }: { meses: FluxoMensal[]; mesAte: number; isMobile: boolean }) {
  const totals = useMemo(() => {
    const upTo = meses.filter(m => m.mes <= mesAte);
    const result: Record<string, number> = {};
    for (const row of ROWS) {
      if (row.key === 'saldoInicial') {
        result[row.key] = meses.length > 0 ? meses[0].saldoInicial : 0;
      } else if (row.key === 'saldoFinal') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoFinal : 0;
      } else if (row.key === 'saldoAcumulado') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoAcumulado : 0;
      } else {
        result[row.key] = upTo.reduce((s, m) => s + (m[row.key] as number), 0);
      }
    }
    return result;
  }, [meses, mesAte]);

  const fontSize = isMobile ? 'text-[10px]' : 'text-xs';
  const cellPad = isMobile ? 'px-1 py-1' : 'px-2 py-1.5';

  return (
    <div className="overflow-x-auto -mx-2">
      <table className={`w-full min-w-[800px] ${fontSize}`}>
        <thead className="sticky top-0 z-20 bg-card">
          <tr className="border-b border-border">
            <th className={`${cellPad} text-left font-bold text-muted-foreground sticky left-0 bg-card z-30`} style={{ minWidth: isMobile ? 100 : 140 }}>
              
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
            <th className={`${cellPad} text-right font-bold text-foreground bg-muted/50`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => (
            <tr key={row.key} className={`border-b border-border/50 ${row.bold ? 'bg-muted/30' : ''}`}>
              <td
                className={`${cellPad} text-left ${row.bold ? 'font-bold' : 'font-normal'} ${
                  row.indent ? 'pl-4 md:pl-6' : ''
                } text-card-foreground sticky left-0 bg-card z-10`}
                style={{ minWidth: isMobile ? 100 : 140 }}
              >
                {row.label}
              </td>
              {meses.map(m => {
                const val = m[row.key] as number;
                const isAfter = m.mes > mesAte;
                const colorClass = getValueColor(val, row, isAfter);

                return (
                  <td
                    key={m.mes}
                    className={`${cellPad} text-right ${row.bold ? 'font-bold' : 'font-normal'} ${colorClass}`}
                  >
                    {isAfter ? '-' : fmtK(val)}
                  </td>
                );
              })}
              <td className={`${cellPad} text-right ${row.bold ? 'font-bold' : 'font-normal'} bg-muted/50 ${getValueColor(totals[row.key] || 0, row, false)}`}>
                {fmtK(totals[row.key] || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
