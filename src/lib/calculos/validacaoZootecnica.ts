/**
 * Validação Zootécnica — funções puras de verificação de integridade.
 *
 * REGRA ABSOLUTA:
 *   saldo_final = saldo_inicial + entradas_externas + evol_cat_entrada
 *                 - saidas_externas - evol_cat_saida
 *
 * Estas funções não corrigem nem mascaram — apenas sinalizam.
 */

import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ValidacaoEquacaoResult {
  mes: number;
  mesLabel: string;
  categoria?: string;
  categoriaCodigo?: string;
  saldoInicial: number;
  entradasExternas: number;
  evolCatEntrada: number;
  saidasExternas: number;
  evolCatSaida: number;
  saldoFinalEsperado: number;
  saldoFinalReal: number;
  diferenca: number;
  ok: boolean;
}

export interface ValidacaoEncadeamentoResult {
  anoOrigem: number;
  mesOrigem: number;
  anoDestino: number;
  mesDestino: number;
  categoria?: string;
  categoriaCodigo?: string;
  saldoFinalOrigem: number;
  saldoInicialDestino: number;
  diferenca: number;
  ok: boolean;
}

export interface ValidacaoParidadeResult {
  mes: number;
  tipo: string;
  tipoLabel: string;
  totalQuadro: number;
  totalLista: number;
  diferenca: number;
  ok: boolean;
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ---------------------------------------------------------------------------
// 1. Validação da equação por categoria
// ---------------------------------------------------------------------------

export function validarEquacaoCategoria(rows: ZootCategoriaMensal[]): ValidacaoEquacaoResult[] {
  const results: ValidacaoEquacaoResult[] = [];

  for (const r of rows) {
    const esperado = r.saldo_inicial + r.entradas_externas + r.evol_cat_entrada
      - r.saidas_externas - r.evol_cat_saida;
    const diferenca = Math.round(r.saldo_final - esperado);

    results.push({
      mes: r.mes,
      mesLabel: MESES_LABELS[r.mes - 1] || String(r.mes),
      categoria: r.categoria_nome,
      categoriaCodigo: r.categoria_codigo,
      saldoInicial: r.saldo_inicial,
      entradasExternas: r.entradas_externas,
      evolCatEntrada: r.evol_cat_entrada,
      saidasExternas: r.saidas_externas,
      evolCatSaida: r.evol_cat_saida,
      saldoFinalEsperado: esperado,
      saldoFinalReal: r.saldo_final,
      diferenca,
      ok: diferenca === 0,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. Validação da equação consolidada (total por mês)
// ---------------------------------------------------------------------------

export function validarEquacaoTotal(rows: ZootCategoriaMensal[]): ValidacaoEquacaoResult[] {
  const byMes = new Map<number, ZootCategoriaMensal[]>();
  for (const r of rows) {
    if (!byMes.has(r.mes)) byMes.set(r.mes, []);
    byMes.get(r.mes)!.push(r);
  }

  const results: ValidacaoEquacaoResult[] = [];

  for (const [mes, cats] of byMes) {
    const si = cats.reduce((s, c) => s + c.saldo_inicial, 0);
    const ee = cats.reduce((s, c) => s + c.entradas_externas, 0);
    const ece = cats.reduce((s, c) => s + c.evol_cat_entrada, 0);
    const se = cats.reduce((s, c) => s + c.saidas_externas, 0);
    const ecs = cats.reduce((s, c) => s + c.evol_cat_saida, 0);
    const sfReal = cats.reduce((s, c) => s + c.saldo_final, 0);
    const sfEsperado = si + ee + ece - se - ecs;
    const diferenca = Math.round(sfReal - sfEsperado);

    results.push({
      mes,
      mesLabel: MESES_LABELS[mes - 1] || String(mes),
      saldoInicial: si,
      entradasExternas: ee,
      evolCatEntrada: ece,
      saidasExternas: se,
      evolCatSaida: ecs,
      saldoFinalEsperado: sfEsperado,
      saldoFinalReal: sfReal,
      diferenca,
      ok: diferenca === 0,
    });
  }

  return results.sort((a, b) => a.mes - b.mes);
}

// ---------------------------------------------------------------------------
// 3. Validação do encadeamento mensal (SF mês N = SI mês N+1)
// ---------------------------------------------------------------------------

export function validarEncadeamentoMensal(rows: ZootCategoriaMensal[]): ValidacaoEncadeamentoResult[] {
  const results: ValidacaoEncadeamentoResult[] = [];
  const sorted = [...rows].sort((a, b) => a.mes - b.mes);

  // Group by categoria
  const byCat = new Map<string, ZootCategoriaMensal[]>();
  for (const r of sorted) {
    const key = r.categoria_id;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }

  for (const [, catRows] of byCat) {
    const ordered = catRows.sort((a, b) => a.mes - b.mes);
    for (let i = 0; i < ordered.length - 1; i++) {
      const curr = ordered[i];
      const next = ordered[i + 1];
      const diferenca = Math.round(next.saldo_inicial - curr.saldo_final);

      results.push({
        anoOrigem: curr.ano,
        mesOrigem: curr.mes,
        anoDestino: next.ano,
        mesDestino: next.mes,
        categoria: curr.categoria_nome,
        categoriaCodigo: curr.categoria_codigo,
        saldoFinalOrigem: curr.saldo_final,
        saldoInicialDestino: next.saldo_inicial,
        diferenca,
        ok: diferenca === 0,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. Validação de paridade quadro x drilldown
// ---------------------------------------------------------------------------

export function validarParidadeDrilldown(
  quadroMovimentos: Record<string, number>, // tipo -> total
  listaMovimentos: Record<string, number>,  // tipo -> total (soma da lista)
  mes: number,
): ValidacaoParidadeResult[] {
  const TIPO_LABELS: Record<string, string> = {
    nascimento: 'Nascimentos',
    compra: 'Compras',
    transferencia_entrada: 'Transf. Entrada',
    abate: 'Abates',
    venda: 'Vendas em Pé',
    transferencia_saida: 'Transf. Saída',
    consumo: 'Consumo',
    morte: 'Mortes',
  };

  const allTipos = new Set([...Object.keys(quadroMovimentos), ...Object.keys(listaMovimentos)]);
  const results: ValidacaoParidadeResult[] = [];

  for (const tipo of allTipos) {
    const totalQ = quadroMovimentos[tipo] || 0;
    const totalL = listaMovimentos[tipo] || 0;
    const diferenca = totalQ - totalL;

    results.push({
      mes,
      tipo,
      tipoLabel: TIPO_LABELS[tipo] || tipo,
      totalQuadro: totalQ,
      totalLista: totalL,
      diferenca,
      ok: diferenca === 0,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. Resumo geral de validação
// ---------------------------------------------------------------------------

export interface ResumoValidacao {
  equacaoTotal: ValidacaoEquacaoResult[];
  equacaoCategoria: ValidacaoEquacaoResult[];
  encadeamento: ValidacaoEncadeamentoResult[];
  totalErrosEquacao: number;
  totalErrosEncadeamento: number;
  todosOk: boolean;
}

export function gerarResumoValidacao(rows: ZootCategoriaMensal[]): ResumoValidacao {
  const equacaoTotal = validarEquacaoTotal(rows);
  const equacaoCategoria = validarEquacaoCategoria(rows);
  const encadeamento = validarEncadeamentoMensal(rows);

  const totalErrosEquacao = equacaoTotal.filter(e => !e.ok).length
    + equacaoCategoria.filter(e => !e.ok).length;
  const totalErrosEncadeamento = encadeamento.filter(e => !e.ok).length;

  return {
    equacaoTotal,
    equacaoCategoria,
    encadeamento,
    totalErrosEquacao,
    totalErrosEncadeamento,
    todosOk: totalErrosEquacao === 0 && totalErrosEncadeamento === 0,
  };
}
