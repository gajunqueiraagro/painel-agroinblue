/**
 * buildMonthlyDataFromView — agregação mensal Jan→Dez do painel oficial PC-100.
 *
 * Extraído de src/pages/PainelConsultorTab.tsx para desacoplar o hook soberano
 * (usePainelConsultorData) da camada de UI. NÃO altera fórmula nem retorno —
 * é um movimento puramente estrutural.
 *
 * Consumidores:
 *   - src/pages/PainelConsultorTab.tsx (UI)
 *   - src/hooks/usePainelConsultorData.ts (orquestrador)
 */
import { calcularIndicadoresEficienciaArea } from '@/lib/calculos/eficienciaArea';
import {
  buildDesfruteCabMensal,
  TIPOS_DESFRUTE_OFICIAL,
} from '@/lib/calculos/painelConsultorIndicadores';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';
import {
  type ZootCategoriaMensal,
  totalizarPorMes as totalizarViewPorMes,
} from '@/hooks/useZootCategoriaMensal';
import {
  isRealizado as isFinRealizado,
  isEntrada as isFinEntrada,
  isSaida as isFinSaida,
  classificarEntrada,
  classificarSaida,
  isCusteioProducaoPecuaria,
  datePagtoMes,
  datePagtoAno,
} from '@/lib/financeiro/classificacao';

// TIPOS_DESFRUTE migrado para src/lib/calculos/painelConsultorIndicadores.ts (TIPOS_DESFRUTE_OFICIAL).
const TIPOS_DESFRUTE = new Set<string>(TIPOS_DESFRUTE_OFICIAL);

// ─── Monthly raw data struct ───
export interface MonthlyData {
  cabIni: number[];
  cabFin: number[];
  cabMediaMes: number[];
  entradas: number[];
  saidas: number[];
  pesoTotalIni: number[];
  pesoTotalFin: number[];
  pesoMedioIni: number[];
  pesoMedioFin: number[];
  gmd: number[];
  arrobasProd: number[];
  prodKg: number[];
  areaProd: number;
  areaProdMensal: number[];
  uaMedia: number[];
  lotUaHa: number[];
  arrHa: number[];
  valorRebIni: number[];
  valorRebFin: number[];
  entFin: number[];
  saiFin: number[];
  recPec: number[];
  custOper: number[];
  /**
   * Custeio Produção Pecuária — fonte: lancFin com macro='custeio produtivo' e escopo!='agri'.
   * Subconjunto estrito de custOper (que também inclui investimento na fazenda).
   * Numerador oficial de: Custo Produtivo R$/@, Custo Cab. R$/cab., Margem por @.
   */
  custeioPec: number[];
  resCaixa: number[];
  recPecComp: number[];
  resOper: number[];
  ebitda: number[];
  varValorReb: number[];
  desfruteCab: number[];
  desfrute_arr: number[];
}

export function buildMonthlyDataFromView(
  viewTotals: ReturnType<typeof totalizarViewPorMes>,
  viewRows: ZootCategoriaMensal[],
  lancFin: FinanceiroLancamento[],
  lancPec: Lancamento[],
  ano: number,
  areaProdutiva: number,
  valorRebanhoMes: number[],
  isGlobal = false,
  areaProdutivaMensal?: number[],
  gmdPrevistoLookup?: Map<string, number> | null,
): MonthlyData {
  const mk = (fn: (m: number) => number) => Array.from({ length: 12 }, (_, i) => fn(i + 1));
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();
  const mesPrefix = (m: number) => `${ano}-${String(m).padStart(2, '0')}`;

  // Zootechnical data from official view
  const cabIni = mk(m => viewTotals[m]?.saldo_inicial ?? 0);
  const cabFin = mk(m => viewTotals[m]?.saldo_final ?? 0);
  const cabMediaMes = mk(m => {
    const ini = cabIni[m - 1];
    const fin = cabFin[m - 1];
    if (isNaN(ini) || isNaN(fin)) return NaN;
    return (ini + fin) / 2;
  });
  // REGRA OFICIAL: entradas/saídas = apenas fluxo externo real da fazenda
  // Evol. Cat. (reclassificação interna) NÃO entra nos indicadores de fluxo
  let entradas = mk(m => viewTotals[m]?.entradas_externas ?? 0);
  let saidas = mk(m => viewTotals[m]?.saidas_externas ?? 0);

  // ── GLOBAL: neutralizar transferências inter-fazendas ──
  // No nível Global, transferências entre fazendas do grupo são movimento interno
  // e não devem inflar entradas nem saídas do sistema.
  if (isGlobal) {
    const transferRealizado = lancPec.filter(l =>
      l.cenario !== 'meta' &&
      (l.tipo === 'transferencia_entrada' || l.tipo === 'transferencia_saida') &&
      l.data.startsWith(String(ano)),
    );
    const transfEntMes = mk(m =>
      transferRealizado
        .filter(l => l.tipo === 'transferencia_entrada' && l.data.startsWith(mesPrefix(m)))
        .reduce((s, l) => s + l.quantidade, 0),
    );
    const transfSaiMes = mk(m =>
      transferRealizado
        .filter(l => l.tipo === 'transferencia_saida' && l.data.startsWith(mesPrefix(m)))
        .reduce((s, l) => s + l.quantidade, 0),
    );
    entradas = entradas.map((v, i) => Math.max(0, v - transfEntMes[i]));
    saidas = saidas.map((v, i) => Math.max(0, v - transfSaiMes[i]));
  }
  const pesoTotalIni = mk(m => viewTotals[m]?.peso_total_inicial ?? 0);
  const pesoTotalFin = mk(m => viewTotals[m]?.peso_total_final ?? 0);
  const pesoMedioIni = mk(m => { const c = cabIni[m - 1]; return c > 0 ? pesoTotalIni[m - 1] / c : NaN; });
  const pesoMedioFin = mk(m => { const c = cabFin[m - 1]; return c > 0 ? pesoTotalFin[m - 1] / c : NaN; });

  // GMD: fonte depende do cenário
  // - META  (gmdPrevistoLookup presente): média ponderada de gmd_previsto por
  //   cabMedia da categoria, soberano via meta_gmd_mensal.
  // - Realizado (lookup ausente): producao_biologica / cabMedia / dias
  //   (fórmula original, INALTERADA).
  //
  // Guardrail: se nenhuma categoria do mês tiver match em gmdPrevistoLookup,
  // retorna NaN (ausência de base oficial). NUNCA retorna 0 nesse caso —
  // zero significaria dado válido = "GMD = 0", mascarando ausência.
  const gmd = mk(m => {
    const mesRows = viewRows.filter(r => r.mes === m);

    if (gmdPrevistoLookup) {
      // ── MODO META ──
      let numer = 0;
      let denom = 0;
      for (const row of mesRows) {
        const key = `${row.fazenda_id}|${row.ano_mes}|${row.categoria_codigo}`;
        const gmdPrev = gmdPrevistoLookup.get(key);
        if (gmdPrev == null) continue;
        const cabMediaCat = (row.saldo_inicial + row.saldo_final) / 2;
        if (cabMediaCat <= 0) continue;
        numer += gmdPrev * cabMediaCat;
        denom += cabMediaCat;
      }
      return denom > 0 ? numer / denom : NaN;
    }

    // ── MODO REALIZADO (fórmula original, inalterada) ──
    const cabMedia = (cabIni[m - 1] + cabFin[m - 1]) / 2;
    if (cabMedia <= 0) return NaN;
    const prodBio = mesRows.reduce((s, r) => s + r.producao_biologica, 0);
    const dias = diasNoMes(m);
    return dias > 0 ? prodBio / cabMedia / dias : NaN;
  });

  const arrobasProd = mk(m => (viewTotals[m]?.producao_biologica ?? 0) / 30);
  const prodKg = mk(m => viewTotals[m]?.producao_biologica ?? 0);

  // ── Desfrute: apenas abate + venda + consumo (REGRA OFICIAL) ──
  // Filtragem de desfruteLancs usada para desfrute_arr e recPecCompMes (peso/valor) — financeiros.
  // Filtro statusOperacional='realizado' aplica APENAS para cenario realizado;
  // não afeta desfruteCab (zoot, calculado via buildDesfruteCabMensal direto sobre lancPec).
  const desfruteLancs = lancPec.filter(l =>
    TIPOS_DESFRUTE.has(l.tipo) && l.cenario !== 'meta' && l.statusOperacional === 'realizado',
  );
  // mesPrefix already defined above
  // desfruteCab oficial — vem do helper compartilhado.
  const desfruteCab = buildDesfruteCabMensal(lancPec, ano);
  // Por lançamento via calcArrobasSafe: abate usa pesoCarcacaKg/15, venda/consumo
  // usam pesoMedioKg/30. Convenção alinhada com V2 Visão Geral Rebanho.
  const desfrute_arr = mk(m => desfruteLancs
    .filter(l => l.data.startsWith(mesPrefix(m)))
    .reduce((s, l) => s + calcArrobasSafe(l), 0));

  // ── Receita pecuária por competência: valorTotal de abate+venda+consumo ──
  const recPecCompMes = (m: number) => desfruteLancs
    .filter(l => l.data.startsWith(mesPrefix(m)))
    .reduce((s, l) => s + Math.abs(l.valorTotal || 0), 0);

  // Financial data (kept as-is from useFinanceiro)
  const concFin = lancFin.filter(l => isFinRealizado(l));
  const finDoAno = concFin.filter(l => datePagtoAno(l) === ano);
  const finDoMes = (m: number) => finDoAno.filter(l => datePagtoMes(l) === m);

  const entFinMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saiFinMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const recPecMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === 'Receitas Pecuárias').reduce((s, l) => s + Math.abs(l.valor), 0);
  const deducMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Dedução de Receitas').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembPecMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Pec.').reduce((s, l) => s + Math.abs(l.valor), 0);
  // Custeio Produção Pecuária — grupo_custo IN ('Custo Fixo Pecuária', 'Custo Variável Pecuária').
  // Fonte oficial do plano (mesma regra de useAnaliseTrimestral.ts).
  // NÃO inclui Juros, Agri, Investimentos.
  const custeioPecMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && isCusteioProducaoPecuaria(l)).reduce((s, l) => s + Math.abs(l.valor), 0);

  // valorRebanhoMes has 13 elements: [0]=Dec prev year, [1]=Jan, ..., [12]=Dec
  const valorRebFin = valorRebanhoMes.slice(1);
  const valorRebIni = valorRebanhoMes.slice(0, 12);

  const entFinArr = mk(entFinMes);
  const saiFinArr = mk(saiFinMes);
  const recPecArr = mk(recPecMes);
  const custOperArr = mk(desembPecMes);
  const custeioPecArr = mk(custeioPecMes);
  const resCaixaArr = mk(m => entFinMes(m) - saiFinMes(m));
  const recPecCompArr = mk(recPecCompMes);
  const resOperArr = mk(m => recPecCompMes(m) - deducMes(m) - desembPecMes(m));
  const ebitdaArr = mk(m => recPecCompMes(m) - deducMes(m) - desembPecMes(m));
  const varValorRebArr = mk(m => {
    const atual = valorRebFin[m - 1] || 0;
    const anterior = valorRebIni[m - 1] || 0;
    return atual - anterior;
  });

  return {
    cabIni, cabFin, cabMediaMes, entradas, saidas,
    pesoTotalIni, pesoTotalFin, pesoMedioIni, pesoMedioFin,
    gmd, arrobasProd, prodKg, areaProd: areaProdutiva,
    areaProdMensal: Array.from({ length: 12 }, (_, i) => {
      const v = areaProdutivaMensal?.[i];
      return typeof v === 'number' && !Number.isNaN(v) ? v : areaProdutiva;
    }),
    ...(() => {
      const areaProdMensalFinal = Array.from({ length: 12 }, (_, i) => {
        const v = areaProdutivaMensal?.[i];
        return typeof v === 'number' && !Number.isNaN(v) ? v : areaProdutiva;
      });
      return calcularIndicadoresEficienciaArea({
        cabIni, cabFin, pesoMedioFin, arrobasProd,
        areaProdMensal: areaProdMensalFinal,
      });
    })(),
    valorRebIni, valorRebFin,
    entFin: entFinArr, saiFin: saiFinArr, recPec: recPecArr,
    custOper: custOperArr, custeioPec: custeioPecArr, resCaixa: resCaixaArr,
    recPecComp: recPecCompArr, resOper: resOperArr,
    ebitda: ebitdaArr, varValorReb: varValorRebArr,
    desfruteCab, desfrute_arr,
  };
}
