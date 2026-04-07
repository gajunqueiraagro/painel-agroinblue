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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  isReposicaoBovinos,
  isConciliado as isConciliadoHelper,
} from "./analiseHelpers";
import { VariacaoEstoqueExplicacao } from "./VariacaoEstoqueExplicacao";
import { supabase } from "@/integrations/supabase/client";
import type { FinanceiroLancamento, RateioADM } from "@/hooks/useFinanceiro";
import type { Lancamento, SaldoInicial } from "@/types/cattle";
import type { CategoriaRebanho, Pasto } from "@/hooks/usePastos";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRebanhoOficial } from "@/hooks/useRebanhoOficial";

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
        const existing = arr.find((a) => a.categoria === row.categoria);
        if (existing) {
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
  mes: number,
  pesosReais?: Record<string, number>,
): number {
  if (!precos || precos.length === 0) return 0;
  const precoMap = new Map(precos.map((p) => [p.categoria, p.preco_kg]));

  if (mes === 0) {
    // Initial value (Dec prev year) — use pesosReais if available
    return saldosIniciais
      .filter((s) => s.ano === ano)
      .reduce((sum, s) => {
        const preco = precoMap.get(s.categoria) || 0;
        const pesoKg = pesosReais?.[s.categoria] ?? s.pesoMedioKg ?? 0;
        return sum + s.quantidade * pesoKg * preco;
      }, 0);
  }

  const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, mes);
  let total = 0;
  for (const [cat, qtd] of saldoMap.entries()) {
    const preco = precoMap.get(cat) || 0;
    // Use real weight from pesosReais (fechamento de pastos), fallback to saldo inicial
    const pesoKg = pesosReais?.[cat] ?? saldosIniciais.find((s) => s.ano === ano && s.categoria === cat)?.pesoMedioKg ?? 0;
    total += qtd * pesoKg * preco;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Calculate reposição from financeiro_lancamentos (Investimento em Bovinos, Conciliado)
// ---------------------------------------------------------------------------
function calcReposicaoFinanceiro(
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>,
  ateMes: number,
): number {
  let total = 0;
  for (let m = 1; m <= ateMes; m++) {
    const k = String(m).padStart(2, "0");
    const lancs = lancConciliadosPorMes.get(k) || [];
    for (const l of lancs) {
      if (isReposicaoBovinos(l)) {
        total += Math.abs(l.valor);
      }
    }
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
  const mesSelecionado = String(mesLimite).padStart(2, "0");
  const [escopo, setEscopo] = useState<Escopo>("pecuaria");
  const [visao, setVisao] = useState<"mes" | "acumulado">("acumulado");
  const mesNum = Number(mesSelecionado);
  const anoNum = Number(anoFiltro);

  const precosMap = useValorRebanhoForDRE(fazendaId, anoFiltro, mesLimite, isGlobal);

  // Get real weights from useFechamentoCategoria for the current month
  const resumoFinal = useFechamentoCategoria(
    fazendaId, anoNum, mesNum,
    lancamentosPecuarios, saldosIniciais, categorias,
  );

  // Build pesosReais map for current month from useFechamentoCategoria
  const pesosReaisFinal = useMemo(() => {
    const map: Record<string, number> = {};
    resumoFinal.rows.forEach(r => {
      if (r.pesoMedioFinalKg && r.pesoMedioFinalKg > 0) {
        map[r.categoriaCodigo] = r.pesoMedioFinalKg;
      }
    });
    return map;
  }, [resumoFinal.rows]);

  // Load real weights for Dec prev year (initial stock)
  const [pesosReaisInicial, setPesosReaisInicial] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || !categorias.length) {
      setPesosReaisInicial({});
      return;
    }
    const dezAnoAnterior = `${anoNum - 1}-12`;
    loadPesosPastosPorCategoria(fazendaId, dezAnoAnterior, categorias)
      .then(map => setPesosReaisInicial(map))
      .catch(() => setPesosReaisInicial({}));
  }, [fazendaId, anoNum, categorias]);

  // Also load real weights for each intermediate month (for month-only view)
  const [pesosIntermediarios, setPesosIntermediarios] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || !categorias.length) return;
    const loadAll = async () => {
      const result: Record<string, Record<string, number>> = {};
      for (let m = 1; m <= mesNum; m++) {
        const anoMes = `${anoFiltro}-${String(m).padStart(2, '0')}`;
        try {
          result[String(m)] = await loadPesosPastosPorCategoria(fazendaId, anoMes, categorias);
        } catch { result[String(m)] = {}; }
      }
      setPesosIntermediarios(result);
    };
    loadAll();
  }, [fazendaId, anoFiltro, mesNum, categorias]);

  // Helper to get pesos for a given month (0 = initial)
  const getPesosForMonth = (m: number): Record<string, number> => {
    if (m === 0) return pesosReaisInicial;
    if (m === mesNum) return pesosReaisFinal;
    return pesosIntermediarios[String(m)] || {};
  };

  // Build pesos using resolverPesoOficial for months without pasto data
  const getPesosCompletos = (m: number): Record<string, number> => {
    const pesosBase = getPesosForMonth(m);
    if (m === 0) {
      // For initial, fill from saldos iniciais where pasto data is missing
      const result: Record<string, number> = { ...pesosBase };
      saldosIniciais.filter(s => s.ano === anoNum).forEach(s => {
        if (!result[s.categoria] && s.pesoMedioKg && s.pesoMedioKg > 0) {
          result[s.categoria] = s.pesoMedioKg;
        }
      });
      return result;
    }
    // For other months, use resolverPesoOficial fallback
    const result: Record<string, number> = { ...pesosBase };
    categorias.forEach(cat => {
      if (!result[cat.codigo]) {
        const { valor } = resolverPesoOficial(cat.codigo, pesosBase, saldosIniciais, lancamentosPecuarios, anoNum, m);
        if (valor) result[cat.codigo] = valor;
      }
    });
    return result;
  };

  // Stock variation calculation — using financeiro_lancamentos for reposição
  const variacaoEstoque = useMemo(() => {
    const precosInicial = precosMap.get(`${anoNum - 1}-12`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesNum).padStart(2, "0")}`) || [];

    const valorInicial = calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosInicial, anoNum, 0, getPesosCompletos(0));
    const valorFinal = calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosFinal, anoNum, mesNum, getPesosCompletos(mesNum));

    // Reposição = financeiro_lancamentos, macro_custo "Investimento em Bovinos", Conciliado
    const reposicao = calcReposicaoFinanceiro(lancConciliadosPorMes, mesNum);

    const variacaoBruta = valorFinal - valorInicial;
    const variacao = variacaoBruta - reposicao;
    const hasPrecoInicial = precosInicial.length > 0;
    const hasPrecoFinal = precosFinal.length > 0;
    const hasData = hasPrecoInicial && hasPrecoFinal;

    return { valorInicial, valorFinal, variacaoBruta, reposicao, variacao, hasData, hasPrecoInicial, hasPrecoFinal };
  }, [saldosIniciais, lancamentosPecuarios, precosMap, lancConciliadosPorMes, anoFiltro, anoNum, mesNum, pesosReaisFinal, pesosReaisInicial, pesosIntermediarios, categorias]);

  // Stock variation for single month (approximate — only use acum for DRE)
  const variacaoEstoqueMes = useMemo(() => {
    if (mesNum < 1) return 0;
    const mesAnterior = mesNum - 1;
    const precosAnterior = mesAnterior === 0
      ? precosMap.get(`${anoNum - 1}-12`) || []
      : precosMap.get(`${anoFiltro}-${String(mesAnterior).padStart(2, "0")}`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesNum).padStart(2, "0")}`) || [];

    if (precosAnterior.length === 0 || precosFinal.length === 0) return 0;

    const valAnterior = mesAnterior === 0
      ? calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosAnterior, anoNum, 0, getPesosCompletos(0))
      : calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosAnterior, anoNum, mesAnterior, getPesosCompletos(mesAnterior));
    const valFinal = calcValorEstoque(saldosIniciais, lancamentosPecuarios, precosFinal, anoNum, mesNum, getPesosCompletos(mesNum));

    // Reposição only for this month
    const mesKey = String(mesNum).padStart(2, "0");
    const lancsDoMes = lancConciliadosPorMes.get(mesKey) || [];
    const repMes = lancsDoMes.filter(l => isReposicaoBovinos(l)).reduce((s, l) => s + Math.abs(l.valor), 0);

    return valFinal - valAnterior - repMes;
  }, [precosMap, saldosIniciais, lancamentosPecuarios, lancConciliadosPorMes, anoFiltro, anoNum, mesNum, pesosReaisFinal, pesosReaisInicial, pesosIntermediarios, categorias]);

  const dreData = useMemo(() => {
    const mesKey = mesSelecionado;
    const lancs = lancConciliadosPorMes.get(mesKey) || [];

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
      const investimentos = somaAbs(list.filter((l) => isInvestimento(l) && isSaida(l) && !isReposicaoBovinos(l)));

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

    const margemBrutaMes = mes.receitaLiq - mes.custoProd - despADMMes;
    const margemBrutaAcum = acum.receitaLiq - acum.custoProd - despADMAcum;

    const varEstoqueMesVal = variacaoEstoque.hasData ? variacaoEstoqueMes : 0;
    const varEstoqueAcumVal = variacaoEstoque.hasData ? variacaoEstoque.variacao : 0;

    const resultOpAjustMes = margemBrutaMes + varEstoqueMesVal;
    const resultOpAjustAcum = margemBrutaAcum + varEstoqueAcumVal;

    const resultAposInvMes = resultOpAjustMes - mes.investimentos;
    const resultAposInvAcum = resultOpAjustAcum - acum.investimentos;

    const resultFinalMes = resultAposInvMes + mes.resultFinanceiro;
    const resultFinalAcum = resultAposInvAcum + acum.resultFinanceiro;

    // Build rows based on visão
    const pickVal = (vMes: number, vAcum: number) => visao === "mes" ? vMes : vAcum;

    const rows: DRERow[] = [
      { label: "1. (+) Receitas Operacionais", valor: pickVal(mes.receitas, acum.receitas) },
      { label: "2. (-) Deduções de Receita", valor: pickVal(-mes.deducoes, -acum.deducoes), indent: true },
      {
        label: "3. (=) Receita Líquida",
        valor: pickVal(mes.receitaLiq, acum.receitaLiq),
        isBold: true,
        isSubtotal: true,
      },
      { label: "4. (-) Custo de Produção", valor: pickVal(-mes.custoProd, -acum.custoProd) },
    ];

    if (!isGlobal && (despADMMes > 0 || despADMAcum > 0)) {
      rows.push({
        label: "4.1 (-) Desp. ADM Rateadas",
        valor: pickVal(-despADMMes, -despADMAcum),
        indent: true,
      });
    }

    rows.push(
      {
        label: "5. (=) Margem Bruta",
        valor: pickVal(margemBrutaMes, margemBrutaAcum),
        isBold: true,
        isSubtotal: true,
      },
      {
        label: "6. (+/-) Var. Estoque Rebanho",
        valor: pickVal(varEstoqueMesVal, varEstoqueAcumVal),
      },
      {
        label: "7. (=) Result. Op. Ajustado",
        valor: pickVal(resultOpAjustMes, resultOpAjustAcum),
        isBold: true,
        isSubtotal: true,
      },
      { label: "8. (-) Investimentos", valor: pickVal(-mes.investimentos, -acum.investimentos) },
      {
        label: "9. (=) Result. após Invest.",
        valor: pickVal(resultAposInvMes, resultAposInvAcum),
        isBold: true,
        isSubtotal: true,
      },
      { label: "10. (+/-) Result. Financeiro", valor: pickVal(mes.resultFinanceiro, acum.resultFinanceiro) },
      {
        label: "11. (=) Resultado Final",
        valor: pickVal(resultFinalMes, resultFinalAcum),
        isBold: true,
        isSubtotal: true,
      },
    );

    return rows;
  }, [lancConciliadosPorMes, rateioADM, anoFiltro, mesSelecionado, mesNum, isGlobal, variacaoEstoque, variacaoEstoqueMes, visao]);

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
      {/* Escopo */}
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

      <div className="text-[10px] text-muted-foreground">Regime de caixa · Data Pagamento · Realizado</div>

      {/* DRE Table */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold">📋 DRE Pecuária — {anoFiltro}</div>
            <ToggleGroup
              type="single"
              value={visao}
              onValueChange={(v) => v && setVisao(v as "mes" | "acumulado")}
              size="sm"
              className="gap-0"
            >
              <ToggleGroupItem value="mes" className="text-[10px] px-2 py-1 h-auto rounded-r-none">
                Mês
              </ToggleGroupItem>
              <ToggleGroupItem value="acumulado" className="text-[10px] px-2 py-1 h-auto rounded-l-none">
                Acumulado
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-0">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto] gap-x-3 pb-1.5 border-b-2 border-foreground/20">
              <div className="text-[10px] font-bold text-muted-foreground">Descrição</div>
              <div className="text-[10px] font-bold text-muted-foreground text-right min-w-[100px]">
                {visao === "mes" ? MESES_NOMES[mesNum - 1] : `Jan–${MESES_NOMES[mesNum - 1]}`}
              </div>
            </div>

            {/* Rows */}
            {dreData.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_auto] gap-x-3 py-1.5 ${
                  row.isSubtotal ? "border-t border-foreground/15 bg-muted/30" : ""
                } ${row.indent ? "pl-3" : ""}`}
              >
                <div className={`text-[11px] ${row.isBold ? "font-bold" : ""} leading-tight`}>{row.label}</div>
                <div
                  className={`text-[11px] text-right font-mono whitespace-nowrap tabular-nums min-w-[100px] ${row.isBold ? "font-bold" : ""} ${colorClass(row.valor)}`}
                >
                  {row.valor !== 0 ? formatMoeda(row.valor) : "—"}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[9px] text-muted-foreground mt-3 border-t pt-2">
            Custo de Produção = Custeio Produtivo · Reposição de bovinos entra na Variação de Estoque · Investimentos e Amortizações ficam separados
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
        reposicaoFinanceiro={variacaoEstoque.reposicao}
        pesosReaisInicial={getPesosCompletos(0)}
        pesosReaisFinal={getPesosCompletos(mesNum)}
      />
    </div>
  );
}

// Re-export Select for use in this file
