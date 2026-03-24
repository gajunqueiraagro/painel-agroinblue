/**
 * Bloco 4: Fluxo de Caixa mensal.
 *
 * Diferente da DRE — aqui entra TUDO que movimentou caixa:
 * receitas, custos, investimentos, amortizações, dividendos, captações.
 *
 * Nota: Saldo inicial é zero por padrão (não há tabela de saldos bancários).
 * O saldo se acumula mês a mês com base nas entradas e saídas.
 */
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { isEntrada, isSaida, somaAbs, normMacro } from './analiseHelpers';
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
  saidasCusteio: number;
  saidasInvestimentos: number;
  saidasAmortizacoes: number;
  saidasDividendos: number;
  saidasOutras: number;
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
    let saldoAcum = 0; // Saldo inicial = 0

    for (let m = 1; m <= mesLimite; m++) {
      const mesKey = String(m).padStart(2, '0');
      const lancs = lancConciliadosPorMes.get(mesKey) || [];

      const entradas = somaAbs(lancs.filter(isEntrada));

      // Classificar saídas por macro_custo
      const saidasAll = lancs.filter(isSaida);
      let saidasCusteio = 0;
      let saidasInvestimentos = 0;
      let saidasAmortizacoes = 0;
      let saidasDividendos = 0;
      let saidasOutras = 0;

      for (const l of saidasAll) {
        const macro = normMacro(l);
        const valor = Math.abs(l.valor);
        if (macro === 'custeio produtivo') {
          saidasCusteio += valor;
        } else if (macro === 'investimento na fazenda' || macro === 'investimento em bovinos') {
          saidasInvestimentos += valor;
        } else if (macro === 'amortizações financeiras') {
          saidasAmortizacoes += valor;
        } else if (macro === 'dividendos') {
          saidasDividendos += valor;
        } else {
          saidasOutras += valor;
        }
      }

      const totalSaidas = saidasCusteio + saidasInvestimentos + saidasAmortizacoes + saidasDividendos + saidasOutras;
      const saldoMes = entradas - totalSaidas;
      saldoAcum += saldoMes;

      rows.push({
        mes: m,
        mesLabel: MESES_NOMES[m - 1],
        entradas,
        saidasCusteio,
        saidasInvestimentos,
        saidasAmortizacoes,
        saidasDividendos,
        saidasOutras,
        totalSaidas,
        saldoMes,
        saldoAcum,
      });
    }

    return rows;
  }, [lancConciliadosPorMes, mesLimite]);

  // Totais
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
            <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatMoeda(totEntradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">(-) Saídas</div>
            <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(totSaidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[10px] text-muted-foreground">Saldo</div>
            <p className={`text-sm font-bold ${saldoFinal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
                  <TableHead className="text-[10px] px-2 py-1.5 sticky left-0 bg-background z-10">Descrição</TableHead>
                  {dados.map(d => (
                    <TableHead key={d.mes} className="text-[10px] px-2 py-1.5 text-right min-w-[65px]">
                      {d.mesLabel}
                    </TableHead>
                  ))}
                  <TableHead className="text-[10px] px-2 py-1.5 text-right font-bold min-w-[70px]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Entradas */}
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-green-700 dark:text-green-400">
                    (+) Entradas
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono text-green-700 dark:text-green-400">
                      {d.entradas > 0 ? fmtK(d.entradas) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold text-green-700 dark:text-green-400">
                    {fmtK(totEntradas)}
                  </TableCell>
                </TableRow>

                {/* Saídas detalhadas */}
                <SaidaRow label="  Custeio Produtivo" dados={dados} field="saidasCusteio" />
                <SaidaRow label="  Investimentos" dados={dados} field="saidasInvestimentos" />
                <SaidaRow label="  Amortizações" dados={dados} field="saidasAmortizacoes" />
                <SaidaRow label="  Dividendos" dados={dados} field="saidasDividendos" />
                <SaidaRow label="  Outras saídas" dados={dados} field="saidasOutras" />

                {/* Total Saídas */}
                <TableRow className="border-t">
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-red-600 dark:text-red-400">
                    (-) Total Saídas
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono font-bold text-red-600 dark:text-red-400">
                      {d.totalSaidas > 0 ? fmtK(d.totalSaidas) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold text-red-600 dark:text-red-400">
                    {fmtK(totSaidas)}
                  </TableCell>
                </TableRow>

                {/* Saldo mês */}
                <TableRow className="border-t-2">
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">
                    (=) Saldo mês
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className={`text-[10px] px-2 py-1 text-right font-mono font-bold ${d.saldoMes >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtK(d.saldoMes)}
                    </TableCell>
                  ))}
                  <TableCell className={`text-[10px] px-2 py-1 text-right font-mono font-bold ${saldoFinal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtK(saldoFinal)}
                  </TableCell>
                </TableRow>

                {/* Saldo acumulado */}
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">
                    Saldo acumulado
                  </TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className={`text-[10px] px-2 py-1 text-right font-mono ${d.saldoAcum >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmtK(d.saldoAcum)}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono" />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="text-[9px] text-muted-foreground mt-2 border-t pt-2">
            Base: Data Pagamento · Status Conciliado · Saldo inicial = R$ 0 (sem saldo bancário cadastrado) · Inclui todos os macro_custos
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
      <TableCell className="text-[10px] px-2 py-1 text-muted-foreground sticky left-0 bg-background">
        {label}
      </TableCell>
      {dados.map(d => (
        <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono text-muted-foreground">
          {(d[field] as number) > 0 ? fmtK(d[field] as number) : '—'}
        </TableCell>
      ))}
      <TableCell className="text-[10px] px-2 py-1 text-right font-mono text-muted-foreground">
        {fmtK(total)}
      </TableCell>
    </TableRow>
  );
}
