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
// saldoMap is now provided externally from the official source
// ---------------------------------------------------------------------------
function calcValorEstoque(
  saldosIniciais: SaldoInicial[],
  precos: { categoria: string; preco_kg: number }[],
  ano: number,
  mes: number,
  pesosReais: Record<string, number>,
  saldoMap?: Map<string, number>,
): number {
  if (!precos || precos.length === 0) return 0;
  const precoMap = new Map(precos.map((p) => [p.categoria, p.preco_kg]));

  if (mes === 0) {
    // Initial value (Dec prev year) — peso vem exclusivamente de pesosReais (fonte oficial)
    return saldosIniciais
      .filter((s) => s.ano === ano)
      .reduce((sum, s) => {
        const preco = precoMap.get(s.categoria) || 0;
        const pesoKg = pesosReais[s.categoria] ?? 0;
        return sum + s.quantidade * pesoKg * preco;
      }, 0);
  }

  if (!saldoMap) return 0;
  let total = 0;
  for (const [cat, qtd] of saldoMap.entries()) {
    const preco = precoMap.get(cat) || 0;
    // FONTE OFICIAL: peso vem exclusivamente de pesosReais (view zootécnica)
    const pesoKg = pesosReais[cat] ?? 0;
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

  // FONTE OFICIAL: useRebanhoOficial
  const rebanho = useRebanhoOficial({ ano: anoNum, cenario: 'realizado', global: isGlobal });
  const rebanhoAnoAnt = useRebanhoOficial({ ano: anoNum - 1, cenario: 'realizado', global: isGlobal });

  // Build pesosReais map from official source
  const pesosReaisFinal = useMemo(() => {
    const map: Record<string, number> = {};
    const pesoMap = rebanho.getPesoMedioMap(mesNum);
    for (const [cat, peso] of pesoMap.entries()) {
      if (peso > 0) map[cat] = peso;
    }
    return map;
  }, [rebanho.getPesoMedioMap, mesNum]);

  // Initial weights from Dec prev year (FONTE OFICIAL exclusiva — sem fallback para saldosIniciais)
  const pesosReaisInicial = useMemo(() => {
    const map: Record<string, number> = {};
    const pesoMap = rebanhoAnoAnt.getPesoMedioMap(12);
    for (const [cat, peso] of pesoMap.entries()) {
      if (peso > 0) map[cat] = peso;
    }
    return map;
  }, [rebanhoAnoAnt.getPesoMedioMap]);

  // Helper to get pesos for a given month (0 = initial)
  // FONTE OFICIAL exclusiva — sem fallback para saldosIniciais
  const getPesosCompletos = (m: number): Record<string, number> => {
    if (m === 0) return pesosReaisInicial;
    const map: Record<string, number> = {};
    const pesoMap = rebanho.getPesoMedioMap(m);
    for (const [cat, peso] of pesoMap.entries()) {
      if (peso > 0) map[cat] = peso;
    }
    return map;
  };

  // Stock variation calculation — using financeiro_lancamentos for reposição
  const variacaoEstoque = useMemo(() => {
    const precosInicial = precosMap.get(`${anoNum - 1}-12`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesNum).padStart(2, "0")}`) || [];

    const valorInicial = calcValorEstoque(saldosIniciais, precosInicial, anoNum, 0, getPesosCompletos(0));
    const saldoMapFinal = rebanho.getSaldoMap(mesNum);
    const valorFinal = calcValorEstoque(saldosIniciais, precosFinal, anoNum, mesNum, getPesosCompletos(mesNum), saldoMapFinal);

    // Reposição = financeiro_lancamentos, macro_custo "Investimento em Bovinos", Conciliado
    const reposicao = calcReposicaoFinanceiro(lancConciliadosPorMes, mesNum);

    const variacaoBruta = valorFinal - valorInicial;
    const variacao = variacaoBruta - reposicao;
    const hasPrecoInicial = precosInicial.length > 0;
    const hasPrecoFinal = precosFinal.length > 0;
    const hasData = hasPrecoInicial && hasPrecoFinal;

    return { valorInicial, valorFinal, variacaoBruta, reposicao, variacao, hasData, hasPrecoInicial, hasPrecoFinal };
  }, [saldosIniciais, precosMap, lancConciliadosPorMes, anoFiltro, anoNum, mesNum, rebanho, rebanhoAnoAnt, pesosReaisInicial]);

  // Stock variation for single month (approximate — only use acum for DRE)
  const variacaoEstoqueMes = useMemo(() => {
    if (mesNum < 1) return 0;
    const mesAnterior = mesNum - 1;
    const precosAnterior = mesAnterior === 0
      ? precosMap.get(`${anoNum - 1}-12`) || []
      : precosMap.get(`${anoFiltro}-${String(mesAnterior).padStart(2, "0")}`) || [];
    const precosFinal = precosMap.get(`${anoFiltro}-${String(mesNum).padStart(2, "0")}`) || [];

    if (precosAnterior.length === 0 || precosFinal.length === 0) return 0;

    const saldoMapAnterior = mesAnterior > 0 ? rebanho.getSaldoMap(mesAnterior) : undefined;
    const valAnterior = mesAnterior === 0
      ? calcValorEstoque(saldosIniciais, precosAnterior, anoNum, 0, getPesosCompletos(0))
      : calcValorEstoque(saldosIniciais, precosAnterior, anoNum, mesAnterior, getPesosCompletos(mesAnterior), saldoMapAnterior);
    const saldoMapFinal = rebanho.getSaldoMap(mesNum);
    const valFinal = calcValorEstoque(saldosIniciais, precosFinal, anoNum, mesNum, getPesosCompletos(mesNum), saldoMapFinal);

    // Reposição only for this month
    const mesKey = String(mesNum).padStart(2, "0");
    const lancsDoMes = lancConciliadosPorMes.get(mesKey) || [];
    const repMes = lancsDoMes.filter(l => isReposicaoBovinos(l)).reduce((s, l) => s + Math.abs(l.valor), 0);

    return valFinal - valAnterior - repMes;
  }, [precosMap, saldosIniciais, lancConciliadosPorMes, anoFiltro, anoNum, mesNum, rebanho, pesosReaisInicial]);

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
