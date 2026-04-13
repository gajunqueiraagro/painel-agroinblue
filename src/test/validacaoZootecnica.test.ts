/**
 * Testes de regressão — Motor Zootécnico
 *
 * Validam a integridade matemática do cálculo oficial.
 * Não dependem do banco — usam dados sintéticos que simulam a estrutura da view.
 */

import { describe, it, expect } from 'vitest';
import {
  validarEquacaoCategoria,
  validarEquacaoTotal,
  validarEncadeamentoMensal,
  gerarResumoValidacao,
  validarParidadeDrilldown,
} from '@/lib/calculos/validacaoZootecnica';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

// ---------------------------------------------------------------------------
// Helper: cria uma row com defaults
// ---------------------------------------------------------------------------
function makeRow(overrides: Partial<ZootCategoriaMensal> & {
  mes: number;
  categoria_id: string;
  categoria_codigo: string;
  saldo_inicial: number;
  entradas_externas?: number;
  saidas_externas?: number;
  evol_cat_entrada?: number;
  evol_cat_saida?: number;
  saldo_final: number;
}): ZootCategoriaMensal {
  return {
    fazenda_id: 'faz-1',
    cliente_id: 'cli-1',
    ano: 2021,
    cenario: 'realizado' as const,
    ano_mes: `2021-${String(overrides.mes).padStart(2, '0')}`,
    categoria_nome: overrides.categoria_codigo,
    ordem_exibicao: 1,
    peso_total_inicial: 0,
    peso_total_final: 0,
    peso_medio_inicial: null,
    peso_medio_final: null,
    peso_entradas_externas: 0,
    peso_saidas_externas: 0,
    peso_evol_cat_entrada: 0,
    peso_evol_cat_saida: 0,
    dias_mes: 31,
    gmd: null,
    producao_biologica: 0,
    fonte_oficial_mes: 'fallback_movimentacao' as const,
    entradas_externas: 0,
    saidas_externas: 0,
    evol_cat_entrada: 0,
    evol_cat_saida: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Caso A — Sta. Rita / Jan 2021 / Total
// ---------------------------------------------------------------------------
describe('Caso A — Equação total Jan/2021', () => {
  const rows: ZootCategoriaMensal[] = [
    makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'MAMOTES_M', saldo_inicial: 423, entradas_externas: 81, saidas_externas: 2, saldo_final: 502 }),
    makeRow({ mes: 1, categoria_id: 'c2', categoria_codigo: 'BOIS', saldo_inicial: 1500, entradas_externas: 50, saidas_externas: 10, evol_cat_entrada: 200, evol_cat_saida: 200, saldo_final: 1540 }),
    makeRow({ mes: 1, categoria_id: 'c3', categoria_codigo: 'VACAS', saldo_inicial: 1684, entradas_externas: 46, saidas_externas: 20, evol_cat_entrada: 214, evol_cat_saida: 214, saldo_final: 1710 }),
  ];

  it('SI + Entradas + EvolIn - Saidas - EvolOut = SF para cada categoria', () => {
    const results = validarEquacaoCategoria(rows);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(r.diferenca).toBe(0);
    }
  });

  it('Total consolidado fecha', () => {
    const results = validarEquacaoTotal(rows);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].saldoFinalReal).toBe(3752);
  });
});

// ---------------------------------------------------------------------------
// Caso B — Sta. Rita / Jan 2021 / Mamotes M
// ---------------------------------------------------------------------------
describe('Caso B — Mamotes M Jan/2021', () => {
  it('423 + 81 - 2 = 502', () => {
    const rows = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'MAMOTES_M', saldo_inicial: 423, entradas_externas: 81, saidas_externas: 2, saldo_final: 502 }),
    ];
    const results = validarEquacaoCategoria(rows);
    expect(results[0].saldoFinalEsperado).toBe(502);
    expect(results[0].ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Caso C — Encadeamento anual (SF Dez/2020 = SI Jan/2021)
// ---------------------------------------------------------------------------
describe('Caso C — Encadeamento mensal', () => {
  it('SF mês N = SI mês N+1 por categoria', () => {
    const rows: ZootCategoriaMensal[] = [
      makeRow({ mes: 12, categoria_id: 'c1', categoria_codigo: 'MAMOTES_M', saldo_inicial: 400, entradas_externas: 23, saidas_externas: 0, saldo_final: 423 }),
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'MAMOTES_M', saldo_inicial: 423, entradas_externas: 81, saidas_externas: 2, saldo_final: 502 }),
    ];
    // Simulate cross-year by setting year differently
    rows[0].ano = 2020;
    rows[0].ano_mes = '2020-12';
    rows[1].ano = 2021;
    rows[1].ano_mes = '2021-01';

    const results = validarEncadeamentoMensal(rows);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].saldoFinalOrigem).toBe(423);
    expect(results[0].saldoInicialDestino).toBe(423);
  });

  it('detecta quebra de encadeamento', () => {
    const rows: ZootCategoriaMensal[] = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 100, saldo_final: 120 }),
      makeRow({ mes: 2, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 115, saldo_final: 130 }), // SI deveria ser 120
    ];
    const results = validarEncadeamentoMensal(rows);
    expect(results[0].ok).toBe(false);
    expect(results[0].diferenca).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// Caso D — Paridade quadro x drilldown
// ---------------------------------------------------------------------------
describe('Caso D — Paridade drilldown', () => {
  it('valores iguais = ok', () => {
    const quadro = { abate: 40, morte: 1 };
    const lista = { abate: 40, morte: 1 };
    const results = validarParidadeDrilldown(quadro, lista, 3);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('divergência detectada', () => {
    const quadro = { abate: 40, morte: 1 };
    const lista = { abate: 38, morte: 1 };
    const results = validarParidadeDrilldown(quadro, lista, 3);
    const abateResult = results.find(r => r.tipo === 'abate');
    expect(abateResult?.ok).toBe(false);
    expect(abateResult?.diferenca).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Caso E — Isolamento por cliente
// ---------------------------------------------------------------------------
describe('Caso E — Isolamento por cliente', () => {
  it('rows de clientes distintos não se misturam no gerarResumoValidacao', () => {
    const rowsClienteA = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 100, entradas_externas: 10, saldo_final: 110 }),
    ];
    rowsClienteA[0].cliente_id = 'cliente-a';

    const rowsClienteB = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 200, entradas_externas: 20, saldo_final: 220 }),
    ];
    rowsClienteB[0].cliente_id = 'cliente-b';

    // O hook filtra por cliente — aqui validamos que a função de validação
    // opera sobre dados já filtrados (nunca mistura)
    const resumoA = gerarResumoValidacao(rowsClienteA);
    const resumoB = gerarResumoValidacao(rowsClienteB);

    expect(resumoA.todosOk).toBe(true);
    expect(resumoB.todosOk).toBe(true);
    expect(resumoA.equacaoTotal[0].saldoInicial).toBe(100);
    expect(resumoB.equacaoTotal[0].saldoInicial).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Resumo geral
// ---------------------------------------------------------------------------
describe('gerarResumoValidacao', () => {
  it('retorna todosOk=true para dados consistentes', () => {
    const rows = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 100, entradas_externas: 10, saidas_externas: 5, saldo_final: 105 }),
      makeRow({ mes: 2, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 105, entradas_externas: 0, saidas_externas: 3, saldo_final: 102 }),
    ];
    const resumo = gerarResumoValidacao(rows);
    expect(resumo.todosOk).toBe(true);
    expect(resumo.totalErrosEquacao).toBe(0);
    expect(resumo.totalErrosEncadeamento).toBe(0);
  });

  it('detecta erro de equação', () => {
    const rows = [
      makeRow({ mes: 1, categoria_id: 'c1', categoria_codigo: 'BOIS', saldo_inicial: 100, entradas_externas: 10, saldo_final: 115 }), // deveria ser 110
    ];
    const resumo = gerarResumoValidacao(rows);
    expect(resumo.todosOk).toBe(false);
    expect(resumo.totalErrosEquacao).toBeGreaterThan(0);
  });
});
