/**
 * Bloco 3: DRE da Atividade Pecuária — Fechamento Operacional.
 *
 * Estrutura:
 *  1. (+) Receitas Operacionais
 *  2. (-) Deduções de Receita
 *  3. (=) Receita Líquida
 *  4. (-) Custo de Produção (Custeio Produtivo)
 *  5.1 (-) Despesas ADM Rateadas (modo fazenda)
 *  5. (=) Margem Bruta
 *  6. (+/-) Variação do Estoque de Rebanho
 *  7. (=) Resultado Operacional Pecuário Ajustado
 *  8. (-) Investimentos
 *  9. (=) Resultado após Investimentos
 * 10. (+/-) Resultado Financeiro (juros, desp. financeiras)
 * 11. (=) Resultado Final
 */
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MESES_NOMES } from "@/lib/calculos/labels";
import { formatMoeda } from "@/lib/calculos/formatters";
import {
  isCusteioProdutivo,
  isReceitaMacro,
  isDeducaoReceita,
  isSaida,
  somaAbs,
  normMacro,
  isInvestimento,
} from "./analiseHelpers";
import { VariacaoEstoqueExplicacao } from "./VariacaoEstoqueExplicacao";
import { supabase } from "@/integrations/supabase/client";
import type { FinanceiroLancamento, RateioADM } from "@/hooks/useFinanceiro";
import type { Lancamento, SaldoInicial } from "@/types/cattle";
import type { CategoriaRebanho, Pasto } from "@/hooks/usePastos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcSaldoPorCategoriaLegado } from "@/lib/calculos/zootecnicos";

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

type Escopo = "pecuaria" | "agricultura" | "consolidado";

interface DRERow {
  label: string;
  valor: number;
  valorAcum: number;
  isBold?: boolean;
  isSubtotal?: boolean;
  indent?: boolean;
}

// ---------------------------------------------------------------------------
// Hook to fetch valor_rebanho_mensal for stock variation
// ---------------------------------------------------------------------------
function useValorRebanhoForDRE(fazendaId: string | undefined, anoFiltro: string, mesLimite: number, isGlobal: boolean) {
  const [precosMap, setPrecosMap] = useState<Map<string, { categoria: string; preco_kg: number }[]>>(new Map());

  useEffect(() => {
    if (!fazendaId && !isGlobal) return;

    const anoNum = Number(anoFiltro);
    // We need Dec of previous year (initial) + each month up to mesLimite
    const mesesNeeded: string[] = [`${anoNum - 1}-12`];
    for (let m = 1; m <= mesLimite; m++) {
      mesesNeeded.push(`${anoFiltro}-${String(m).padStart(2, "0")}`);
    }

    const fetchData = async () => {
      let query = supabase
        .from("valor_rebanho_mensal")
        .select("ano_mes, categoria, preco_kg, fazenda_id")
        .in("ano_mes", mesesNeeded);

      if (!isGlobal && fazendaId) {
        query = query.eq("fazenda_id", fazendaId);
      }

      const { data } = await query;
      if (!data) return;

      const map = new Map<string, { categoria: string; preco_kg: number }[]>();
      for (const row of data) {
        const key = row.ano_mes;
        const arr = map.get(key) || [];
        // For global, sum across fazendas — we group by categoria
        const existing = arr.find((a) => a.categoria === row.categoria);
        if (existing) {
          // In global mode, take max price (they should be same across farms ideally)
          existing.preco_kg = Math.max(existing.preco_kg, row.preco_kg);
        } else {
          arr.push({ categoria: row.categoria, preco_kg: row.preco_kg });
        }
        map.set(key, arr);
      }
      setPrecosMap(map);
    };

    fetchData();
  }, [fazendaId, anoFiltro, mesLimite, isGlobal]);

  return precosMap;
}

// ---------------------------------------------------------------------------
// Calculate stock value: sum(qtd * pesoMedioKg * precoKg) for each category
// ---------------------------------------------------------------------------
function calcValorEstoque(
  saldosIniciais: SaldoInicial[],
  lancamentosPecuarios: Lancamento[],
  precos: { categoria: string; preco_kg: number }[],
  ano: number,
  mes: number, // 0 = use saldo inicial directly
): number {
  if (!precos || precos.length === 0) return 0;
  const precoMap = new Map(precos.map((p) => [p.categoria, p.preco_kg]));

  if (mes === 0) {
    // Initial stock = saldo inicial × peso × preco
    return saldosIniciais
      .filter((s) => s.ano === ano)
      .reduce((sum, s) => {
        const preco = precoMap.get(s.categoria) || 0;
        const pesoKg = s.pesoMedioKg || 0;
        return sum + s.quantidade * pesoKg * preco;
      }, 0);
  }

  // End of month stock
  const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, mes);
  let total = 0;
  for (const [cat, qtd] of saldoMap.entries()) {
    const preco = precoMap.get(cat) || 0;
    // We need weight — use saldo inicial weight as fallback
    const si = saldosIniciais.find((s) => s.ano === ano && s.categoria === cat);
    const pesoKg = si?.pesoMedioKg || 0;
    total += qtd * pesoKg * preco;
  }
  return total;
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
  const [mesSelecionado, setMesSelecionado] = useState(String(mesLimite).padStart(2, "0"));
  const [escopo, setEscopo] = useState<Escopo>("pecuaria");
  const mesNum = Number(mesSelecionado);
  const anoNum = Number(anoFiltro);

  // Fetch valor_rebanho prices
  const precosMap = useValorRebanhoForDRE(fazendaId, anoFiltro, mesLimite, isGlobal);

  // Stock variation calculation
  const variacaoEstoque = useMemo(() => {
    const precosInicial = precosMap.get(`${anoNum - 1}-12`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesNum).padStart(2, "0")}`) || [];

    const valorInicial = calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosInicial, anoNum, 0);
    const valorFinal = calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosFinal, anoNum, mesNum);

    // Reposição = compras no período
    const compras = lancamentosPecuarios.filter((l) => {
      if (!l.data.startsWith(anoFiltro)) return false;
      if (l.tipo !== "compra") return false;
      return Number(l.data.substring(5, 7)) <= mesNum;
    });
    const reposicao = compras.reduce((s, l) => s + (l.valorTotal || 0), 0);

    const variacao = valorFinal - valorInicial - reposicao;
    const hasData = precosInicial.length > 0 && precosFinal.length > 0;

    return { valorInicial, valorFinal, reposicao, variacao, hasData };
  }, [saldosIniciais, lancamentosPecuarios, precosMap, anoFiltro, anoNum, mesNum]);

  const dreData = useMemo(() => {
    const mesKey = mesSelecionado;
    const lancs = lancConciliadosPorMes.get(mesKey) || [];

    // Acumulado
    const lancsAcum: FinanceiroLancamento[] = [];
    for (let m = 1; m <= mesNum; m++) {
      const k = String(m).padStart(2, "0");
      lancsAcum.push(...(lancConciliadosPorMes.get(k) || []));
    }

    const calc = (list: FinanceiroLancamento[]) => {
      const receitas = somaAbs(list.filter((l) => isReceitaMacro(l)));
      const deducoes = somaAbs(list.filter((l) => isDeducaoReceita(l)));
      const receitaLiq = receitas - deducoes;
      const custoProd = somaAbs(list.filter((l) => isCusteioProdutivo(l) && isSaida(l)));
      const investimentos = somaAbs(list.filter((l) => isInvestimento(l) && isSaida(l)));

      const resultFinanceiro = list
        .filter((l) => {
          const gc = (l.grupo_custo || "").toLowerCase();
          const macro = normMacro(l);
          if (macro === "amortizações financeiras") return false;
          return gc.includes("juros") || gc.includes("financeiro") || macro.includes("financeiro");
        })
        .reduce((s, l) => s + l.valor, 0);

      return { receitas, deducoes, receitaLiq, custoProd, investimentos, resultFinanceiro };
    };

    const mes = calc(lancs);
    const acum = calc(lancsAcum);

    // Rateio ADM
    const rateioMes = rateioADM
      .filter((r) => r.anoMes === `${anoFiltro}-${mesKey}`)
      .reduce((s, r) => s + r.valorRateado, 0);
    const rateioAcum = rateioADM
      .filter((r) => {
        if (!r.anoMes.startsWith(anoFiltro)) return false;
        return Number(r.anoMes.substring(5, 7)) <= mesNum;
      })
      .reduce((s, r) => s + r.valorRateado, 0);

    const despADMMes = isGlobal ? 0 : rateioMes;
    const despADMAcum = isGlobal ? 0 : rateioAcum;

    // Margem Bruta = Receita Líquida - Custo Produção - Desp ADM
    const margemBrutaMes = mes.receitaLiq - mes.custoProd - despADMMes;
    const margemBrutaAcum = acum.receitaLiq - acum.custoProd - despADMAcum;

    // Variação estoque
    const varEstoqueMes = 0; // monthly not available yet
    const varEstoqueAcum = variacaoEstoque.hasData ? variacaoEstoque.variacao : 0;

    const resultOpAjustMes = margemBrutaMes + varEstoqueMes;
    const resultOpAjustAcum = margemBrutaAcum + varEstoqueAcum;

    const resultAposInvMes = resultOpAjustMes - mes.investimentos;
    const resultAposInvAcum = resultOpAjustAcum - acum.investimentos;

    const resultFinalMes = resultAposInvMes + mes.resultFinanceiro;
    const resultFinalAcum = resultAposInvAcum + acum.resultFinanceiro;

    const rows: DRERow[] = [
      { label: "1. Receitas Operacionais", valor: mes.receitas, valorAcum: acum.receitas },
      { label: "2. (-) Deduções de Receita", valor: -mes.deducoes, valorAcum: -acum.deducoes, indent: true },
      {
        label: "3. (=) Receita Líquida",
        valor: mes.receitaLiq,
        valorAcum: acum.receitaLiq,
        isBold: true,
        isSubtotal: true,
      },
      { label: "4. (-) Custo de Produção", valor: -mes.custoProd, valorAcum: -acum.custoProd },
    ];

    // 5.1 Rateio ADM (only fazenda mode) — right after cost of production
    if (!isGlobal && (despADMMes > 0 || despADMAcum > 0)) {
      rows.push({
        label: "4.1 (-) Despesas ADM Rateadas",
        valor: -despADMMes,
        valorAcum: -despADMAcum,
        indent: true,
      });
    }

    rows.push(
      {
        label: "5. (=) Margem Bruta",
        valor: margemBrutaMes,
        valorAcum: margemBrutaAcum,
        isBold: true,
        isSubtotal: true,
      },
      { label: "6. (+/-) Variação Estoque Rebanho", valor: varEstoqueMes, valorAcum: varEstoqueAcum },
      {
        label: "7. (=) Result. Op. Pecuário Ajust.",
        valor: resultOpAjustMes,
        valorAcum: resultOpAjustAcum,
        isBold: true,
        isSubtotal: true,
      },
      { label: "8. (-) Investimentos", valor: -mes.investimentos, valorAcum: -acum.investimentos },
      {
        label: "9. (=) Result. após Investimentos",
        valor: resultAposInvMes,
        valorAcum: resultAposInvAcum,
        isBold: true,
        isSubtotal: true,
      },
      { label: "10. (+/-) Resultado Financeiro", valor: mes.resultFinanceiro, valorAcum: acum.resultFinanceiro },
      {
        label: "11. (=) Resultado Final",
        valor: resultFinalMes,
        valorAcum: resultFinalAcum,
        isBold: true,
        isSubtotal: true,
      },
    );

    return rows;
  }, [lancConciliadosPorMes, rateioADM, anoFiltro, mesSelecionado, mesNum, isGlobal, variacaoEstoque]);

  const mesesOpt = Array.from({ length: mesLimite }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: MESES_NOMES[i],
  }));

  const colorClass = (val: number) => {
    if (val > 0) return "text-blue-600 dark:text-blue-400";
    if (val < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
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
            {mesesOpt.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {[
            { id: "pecuaria" as Escopo, label: "🐄 Pecuária", enabled: true },
            { id: "agricultura" as Escopo, label: "🌾 Agricultura", enabled: false },
            { id: "consolidado" as Escopo, label: "📊 Consolidado", enabled: false },
          ].map((e) => (
            <button
              key={e.id}
              onClick={() => e.enabled && setEscopo(e.id)}
              disabled={!e.enabled}
              title={!e.enabled ? "Em breve" : undefined}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                escopo === e.id
                  ? "bg-primary text-primary-foreground"
                  : e.enabled
                    ? "bg-muted text-muted-foreground hover:bg-muted/80"
                    : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">Regime de caixa · Data Pagamento · Conciliado</div>

      {/* DRE Table */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-bold mb-3">📋 DRE da Atividade Pecuária — {anoFiltro}</div>

          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 pb-1.5 border-b-2 border-foreground/20">
              <div className="text-[10px] font-bold text-muted-foreground">Descrição</div>
              <div className="text-[10px] font-bold text-muted-foreground text-right min-w-[90px]">
                {MESES_NOMES[mesNum - 1]}
              </div>
              <div className="text-[10px] font-bold text-muted-foreground text-right min-w-[90px]">Acumulado</div>
            </div>

            {/* Rows */}
            {dreData.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_auto_auto] gap-x-3 py-1.5 ${
                  row.isSubtotal ? "border-t border-foreground/15 bg-muted/30" : ""
                } ${row.indent ? "pl-3" : ""}`}
              >
                <div className={`text-[11px] ${row.isBold ? "font-bold" : ""} leading-tight`}>{row.label}</div>
                <div
                  className={`text-[11px] text-right font-mono whitespace-nowrap tabular-nums min-w-[90px] ${row.isBold ? "font-bold" : ""} ${colorClass(row.valor)}`}
                >
                  {row.valor !== 0 ? formatMoeda(row.valor) : "—"}
                </div>
                <div
                  className={`text-[11px] text-right font-mono whitespace-nowrap tabular-nums min-w-[90px] ${row.isBold ? "font-bold" : ""} ${colorClass(row.valorAcum)}`}
                >
                  {row.valorAcum !== 0 ? formatMoeda(row.valorAcum) : "—"}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[9px] text-muted-foreground mt-3 border-t pt-2">
            Custo de Produção = "Custeio Produtivo" · Investimentos e Amortizações ficam separados · Resultado
            Financeiro = juros + desp. financeiras (sem amortizações)
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
        precosMap={precosMap}
      />
    </div>
  );
}
