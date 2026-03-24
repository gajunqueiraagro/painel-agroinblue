/**
 * Bloco 3: DRE da Atividade Pecuária.
 *
 * Estrutura:
 * 1. Receitas Operacionais (macro_custo = "Receitas")
 * 2. (-) Deduções de Receita (macro_custo = "Dedução de Receitas")
 * 3. (=) Receita Líquida
 * 4. (-) Custo de Produção (macro_custo = "Custeio Produtivo")
 * 5. (=) Margem Bruta
 * 6. (-) Despesas ADM (rateio no modo fazenda; original no global)
 * 7. (=) Resultado Operacional
 * 8. (+/-) Resultado Financeiro (juros, despesas financeiras — NÃO amortizações)
 * 9. (=) Resultado Líquido
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { formatMoeda } from '@/lib/calculos/formatters';
import { isCusteioProdutivo, isReceitaMacro, isDeducaoReceita, isSaida, somaAbs, normMacro } from './analiseHelpers';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  lancamentosPecuarios: Lancamento[];
  rateioADM: RateioADM[];
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
}

interface DRERow {
  label: string;
  valor: number;
  valorAcum: number;
  isBold?: boolean;
  isSubtotal?: boolean;
  indent?: boolean;
  color?: 'green' | 'red' | 'default';
}

export function DREAtividade({
  lancConciliadosPorMes,
  lancamentosPecuarios,
  rateioADM,
  anoFiltro,
  mesLimite,
  isGlobal,
}: Props) {
  const [mesSelecionado, setMesSelecionado] = useState(String(mesLimite).padStart(2, '0'));
  const mesNum = Number(mesSelecionado);

  const dreData = useMemo(() => {
    const mesKey = mesSelecionado;
    const lancs = lancConciliadosPorMes.get(mesKey) || [];

    // Acumulado: todos os meses até o selecionado
    const lancsAcum: FinanceiroLancamento[] = [];
    for (let m = 1; m <= mesNum; m++) {
      const k = String(m).padStart(2, '0');
      lancsAcum.push(...(lancConciliadosPorMes.get(k) || []));
    }

    const calc = (list: FinanceiroLancamento[]) => {
      const receitas = somaAbs(list.filter(l => isReceitaMacro(l)));
      const deducoes = somaAbs(list.filter(l => isDeducaoReceita(l)));
      const receitaLiq = receitas - deducoes;

      const custoProd = somaAbs(list.filter(l => isCusteioProdutivo(l) && isSaida(l)));
      const margemBruta = receitaLiq - custoProd;

      // Resultado financeiro: grupo_custo contendo "financeiro" ou "juros" 
      // mas NÃO amortizações
      const resultFinanceiro = list
        .filter(l => {
          const gc = (l.grupo_custo || '').toLowerCase();
          const macro = normMacro(l);
          // Exclui amortizações
          if (macro === 'amortizações financeiras') return false;
          // Inclui se grupo tem "juros" ou "financeiro" ou se macro tem "financeiro"
          return gc.includes('juros') || gc.includes('financeiro') || macro.includes('financeiro');
        })
        .reduce((s, l) => s + l.valor, 0); // valor com sinal

      return { receitas, deducoes, receitaLiq, custoProd, margemBruta, resultFinanceiro };
    };

    const mes = calc(lancs);
    const acum = calc(lancsAcum);

    // Rateio ADM
    const rateioMes = rateioADM
      .filter(r => r.anoMes === `${anoFiltro}-${mesKey}`)
      .reduce((s, r) => s + r.valorRateado, 0);
    const rateioAcum = rateioADM
      .filter(r => {
        if (!r.anoMes.startsWith(anoFiltro)) return false;
        return Number(r.anoMes.substring(5, 7)) <= mesNum;
      })
      .reduce((s, r) => s + r.valorRateado, 0);

    // No global: despesas ADM = custos operacionais reais da ADM (já estão em custoProd)
    // No fazenda: rateio absorvido
    const despADMMes = isGlobal ? 0 : rateioMes;
    const despADMAcum = isGlobal ? 0 : rateioAcum;

    const resultOpMes = mes.margemBruta - despADMMes;
    const resultOpAcum = acum.margemBruta - despADMAcum;

    const resultLiqMes = resultOpMes + mes.resultFinanceiro;
    const resultLiqAcum = resultOpAcum + acum.resultFinanceiro;

    const rows: DRERow[] = [
      { label: '1. Receitas Operacionais', valor: mes.receitas, valorAcum: acum.receitas, indent: false, color: 'green' },
      { label: '2. (-) Deduções de Receita', valor: -mes.deducoes, valorAcum: -acum.deducoes, indent: true },
      { label: '3. (=) Receita Líquida', valor: mes.receitaLiq, valorAcum: acum.receitaLiq, isBold: true, isSubtotal: true },
      { label: '4. (-) Custo de Produção', valor: -mes.custoProd, valorAcum: -acum.custoProd, indent: false, color: 'red' },
      { label: '5. (=) Margem Bruta', valor: mes.margemBruta, valorAcum: acum.margemBruta, isBold: true, isSubtotal: true, color: mes.margemBruta >= 0 ? 'green' : 'red' },
      ...(!isGlobal && (despADMMes > 0 || despADMAcum > 0)
        ? [{ label: '6. (-) Despesas ADM (Rateio)', valor: -despADMMes, valorAcum: -despADMAcum, indent: false }]
        : []),
      { label: isGlobal ? '6. (=) Resultado Operacional' : '7. (=) Resultado Operacional', valor: resultOpMes, valorAcum: resultOpAcum, isBold: true, isSubtotal: true, color: resultOpMes >= 0 ? 'green' : 'red' },
      { label: isGlobal ? '7. (+/-) Resultado Financeiro' : '8. (+/-) Resultado Financeiro', valor: mes.resultFinanceiro, valorAcum: acum.resultFinanceiro, indent: false },
      { label: isGlobal ? '8. (=) Resultado Líquido' : '9. (=) Resultado Líquido', valor: resultLiqMes, valorAcum: resultLiqAcum, isBold: true, isSubtotal: true, color: resultLiqMes >= 0 ? 'green' : 'red' },
    ];

    return rows;
  }, [lancConciliadosPorMes, rateioADM, anoFiltro, mesSelecionado, mesNum, isGlobal]);

  const mesesOpt = Array.from({ length: mesLimite }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MESES_NOMES[i],
  }));

  const colorClass = (r: DRERow) => {
    if (r.color === 'green') return 'text-green-700 dark:text-green-400';
    if (r.color === 'red') return 'text-red-600 dark:text-red-400';
    return '';
  };

  return (
    <div className="space-y-3">
      {/* Seletor de mês */}
      <div className="flex gap-2 items-center">
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-36 text-sm font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mesesOpt.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">
          Regime de caixa · Data Pagamento · Conciliado
        </span>
      </div>

      {/* DRE Table */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-bold mb-3">
            📋 DRE da Atividade Pecuária — {anoFiltro}
          </div>

          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-[1fr_90px_90px] gap-1 pb-1.5 border-b-2 border-foreground/20">
              <div className="text-[10px] font-bold text-muted-foreground">Descrição</div>
              <div className="text-[10px] font-bold text-muted-foreground text-right">
                {MESES_NOMES[mesNum - 1]}
              </div>
              <div className="text-[10px] font-bold text-muted-foreground text-right">
                Acumulado
              </div>
            </div>

            {/* Rows */}
            {dreData.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_90px_90px] gap-1 py-1.5 ${
                  row.isSubtotal ? 'border-t border-foreground/15 bg-muted/30' : ''
                } ${row.indent ? 'pl-3' : ''}`}
              >
                <div className={`text-[11px] ${row.isBold ? 'font-bold' : ''} ${colorClass(row)}`}>
                  {row.label}
                </div>
                <div className={`text-[11px] text-right font-mono ${row.isBold ? 'font-bold' : ''} ${colorClass(row)}`}>
                  {row.valor !== 0 ? formatMoeda(row.valor) : '—'}
                </div>
                <div className={`text-[11px] text-right font-mono ${row.isBold ? 'font-bold' : ''} ${colorClass(row)}`}>
                  {row.valorAcum !== 0 ? formatMoeda(row.valorAcum) : '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[9px] text-muted-foreground mt-3 border-t pt-2">
            Custo de Produção = macro_custo "Custeio Produtivo" · Amortizações e Investimentos ficam fora da DRE (Fluxo de Caixa)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
