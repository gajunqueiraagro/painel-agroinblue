/**
 * Bloco 3: DRE da Atividade Pecuária — Fechamento Operacional.
 *
 * Estrutura:
 *  1. Receitas Operacionais
 *  2. (-) Deduções de Receita
 *  3. (=) Receita Líquida
 *  4. (-) Custo de Produção (Custeio Produtivo)
 *  5. (=) Margem Bruta
 * 5.1 (-) Despesas ADM Rateadas (modo fazenda)
 *  6. (+/-) Variação do Estoque de Rebanho
 *  7. (=) Resultado Operacional Pecuário Ajustado
 *  8. (-) Investimentos
 *  9. (=) Resultado após Investimentos
 * 10. (+/-) Resultado Financeiro (juros, desp. financeiras)
 * 11. (=) Resultado Final
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { formatMoeda } from '@/lib/calculos/formatters';
import { isCusteioProdutivo, isReceitaMacro, isDeducaoReceita, isSaida, somaAbs, normMacro, isInvestimento } from './analiseHelpers';
import { VariacaoEstoqueExplicacao } from './VariacaoEstoqueExplicacao';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { CategoriaRebanho, Pasto } from '@/hooks/usePastos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  rateioADM: RateioADM[];
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
  fazendaId?: string;
  categorias: CategoriaRebanho[];
  pastos: Pasto[];
}

type Escopo = 'pecuaria' | 'agricultura' | 'consolidado';

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
  saldosIniciais,
  rateioADM,
  anoFiltro,
  mesLimite,
  isGlobal,
  fazendaId,
  categorias,
  pastos,
}: Props) {
  const [mesSelecionado, setMesSelecionado] = useState(String(mesLimite).padStart(2, '0'));
  const [escopo, setEscopo] = useState<Escopo>('pecuaria');
  const mesNum = Number(mesSelecionado);

  // Variação de estoque placeholder — precisa de dados de valor_rebanho_mensal
  // Por ora calcula com base em reposição (compras) do módulo pecuário
  const variacaoEstoque = useMemo(() => {
    // Reposição = compras no período
    const comprasAno = lancamentosPecuarios.filter(l => {
      if (!l.data.startsWith(anoFiltro)) return false;
      if (l.tipo !== 'compra') return false;
      const m = Number(l.data.substring(5, 7));
      return m <= mesNum;
    });
    const reposicao = comprasAno.reduce((s, l) => s + (l.valorTotal || 0), 0);

    // TODO: integrar com valor_rebanho_mensal para estoque inicial/final real
    return { reposicao, variacaoLiquida: 0, estoqueInicial: 0, estoqueFinal: 0 };
  }, [lancamentosPecuarios, anoFiltro, mesNum]);

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

      // Investimentos (Fazenda + Bovinos)
      const investimentos = somaAbs(list.filter(l => isInvestimento(l) && isSaida(l)));

      // Resultado financeiro: juros + despesas financeiras + receitas financeiras
      // Exclui amortizações
      const resultFinanceiro = list
        .filter(l => {
          const gc = (l.grupo_custo || '').toLowerCase();
          const macro = normMacro(l);
          if (macro === 'amortizações financeiras') return false;
          return gc.includes('juros') || gc.includes('financeiro') || macro.includes('financeiro');
        })
        .reduce((s, l) => s + l.valor, 0);

      return { receitas, deducoes, receitaLiq, custoProd, margemBruta, investimentos, resultFinanceiro };
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

    const despADMMes = isGlobal ? 0 : rateioMes;
    const despADMAcum = isGlobal ? 0 : rateioAcum;

    // Margem após ADM
    const margemAposADMMes = mes.margemBruta - despADMMes;
    const margemAposADMAcum = acum.margemBruta - despADMAcum;

    // Variação estoque (acumulado only for now)
    const varEstoqueMes = 0; // TODO
    const varEstoqueAcum = 0; // TODO: integrar com valor_rebanho_mensal

    const resultOpAjustMes = margemAposADMMes + varEstoqueMes;
    const resultOpAjustAcum = margemAposADMAcum + varEstoqueAcum;

    const resultAposInvMes = resultOpAjustMes - mes.investimentos;
    const resultAposInvAcum = resultOpAjustAcum - acum.investimentos;

    const resultFinalMes = resultAposInvMes + mes.resultFinanceiro;
    const resultFinalAcum = resultAposInvAcum + acum.resultFinanceiro;

    let step = 1;
    const rows: DRERow[] = [
      { label: `${step}. Receitas Operacionais`, valor: mes.receitas, valorAcum: acum.receitas, color: 'green' },
      { label: `${++step}. (-) Deduções de Receita`, valor: -mes.deducoes, valorAcum: -acum.deducoes, indent: true },
      { label: `${++step}. (=) Receita Líquida`, valor: mes.receitaLiq, valorAcum: acum.receitaLiq, isBold: true, isSubtotal: true },
      { label: `${++step}. (-) Custo de Produção`, valor: -mes.custoProd, valorAcum: -acum.custoProd, color: 'red' },
      { label: `${++step}. (=) Margem Bruta`, valor: mes.margemBruta, valorAcum: acum.margemBruta, isBold: true, isSubtotal: true, color: mes.margemBruta >= 0 ? 'green' : 'red' },
    ];

    // 5.1 Rateio ADM (only fazenda mode)
    if (!isGlobal && (despADMMes > 0 || despADMAcum > 0)) {
      rows.push({
        label: `${step}.1 (-) Despesas ADM Rateadas`,
        valor: -despADMMes,
        valorAcum: -despADMAcum,
        indent: true,
      });
    }

    rows.push(
      { label: `${++step}. (+/-) Variação Estoque Rebanho`, valor: varEstoqueMes, valorAcum: varEstoqueAcum, indent: false },
      { label: `${++step}. (=) Resultado Op. Pecuário Ajust.`, valor: resultOpAjustMes, valorAcum: resultOpAjustAcum, isBold: true, isSubtotal: true, color: resultOpAjustMes >= 0 ? 'green' : 'red' },
      { label: `${++step}. (-) Investimentos`, valor: -mes.investimentos, valorAcum: -acum.investimentos, indent: false },
      { label: `${++step}. (=) Resultado após Investimentos`, valor: resultAposInvMes, valorAcum: resultAposInvAcum, isBold: true, isSubtotal: true, color: resultAposInvMes >= 0 ? 'green' : 'red' },
      { label: `${++step}. (+/-) Resultado Financeiro`, valor: mes.resultFinanceiro, valorAcum: acum.resultFinanceiro, indent: false },
      { label: `${++step}. (=) Resultado Final`, valor: resultFinalMes, valorAcum: resultFinalAcum, isBold: true, isSubtotal: true, color: resultFinalMes >= 0 ? 'green' : 'red' },
    );

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
      {/* Seletor de mês + escopo */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-28 text-sm font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mesesOpt.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Escopo selector */}
        <div className="flex gap-1">
          {([
            { id: 'pecuaria' as Escopo, label: '🐄 Pecuária', enabled: true },
            { id: 'agricultura' as Escopo, label: '🌾 Agricultura', enabled: false },
            { id: 'consolidado' as Escopo, label: '📊 Consolidado', enabled: false },
          ]).map(e => (
            <button
              key={e.id}
              onClick={() => e.enabled && setEscopo(e.id)}
              disabled={!e.enabled}
              title={!e.enabled ? 'Em breve' : undefined}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                escopo === e.id
                  ? 'bg-primary text-primary-foreground'
                  : e.enabled
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                    : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Regime de caixa · Data Pagamento · Conciliado
      </div>

      {/* DRE Table */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-bold mb-3">
            📋 DRE da Atividade Pecuária — {anoFiltro}
          </div>

          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-[1fr_minmax(90px,110px)_minmax(90px,110px)] gap-2 pb-1.5 border-b-2 border-foreground/20">
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
                className={`grid grid-cols-[1fr_minmax(90px,110px)_minmax(90px,110px)] gap-2 py-1.5 ${
                  row.isSubtotal ? 'border-t border-foreground/15 bg-muted/30' : ''
                } ${row.indent ? 'pl-3' : ''}`}
              >
                <div className={`text-[11px] ${row.isBold ? 'font-bold' : ''} ${colorClass(row)} whitespace-nowrap overflow-hidden text-ellipsis`}>
                  {row.label}
                </div>
                <div className={`text-[11px] text-right font-mono whitespace-nowrap tabular-nums ${row.isBold ? 'font-bold' : ''} ${colorClass(row)}`}>
                  {row.valor !== 0 ? formatMoeda(row.valor) : '—'}
                </div>
                <div className={`text-[11px] text-right font-mono whitespace-nowrap tabular-nums ${row.isBold ? 'font-bold' : ''} ${colorClass(row)}`}>
                  {row.valorAcum !== 0 ? formatMoeda(row.valorAcum) : '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[9px] text-muted-foreground mt-3 border-t pt-2">
            Custo de Produção = "Custeio Produtivo" · Investimentos e Amortizações ficam separados · Resultado Financeiro = juros + desp. financeiras (sem amortizações)
          </div>
        </CardContent>
      </Card>

      {/* Explicação didática da variação de estoque */}
      <VariacaoEstoqueExplicacao
        lancamentosPecuarios={lancamentosPecuarios}
        saldosIniciais={saldosIniciais}
        anoFiltro={anoFiltro}
        mesLimite={mesNum}
        fazendaId={fazendaId}
      />
    </div>
  );
}
