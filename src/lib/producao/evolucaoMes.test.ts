/**
 * PROD-EVOLUCAO-01b — o mês por categoria (conferência): as 9 categorias sempre, subtotais Machos/Fêmeas, os tipos sem movimento escondidos,
 * "Confere", o desvio do peso lançado (âmbar ≥ 15%, vermelho ≥ 25%) e as MESMAS contas da Evolução por Categoria de hoje.
 */
import { describe, expect, it } from 'vitest';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { desvio, kgCabFinal, montarMesPorCategoria, pesosAConferir, tomDoDesvio, type CategoriaDoRebanho } from './evolucaoMes';

const CATS: CategoriaDoRebanho[] = [
  ['mamotes_m', 'Mamotes M'], ['desmama_m', 'Desmama M'], ['garrotes', 'Garrotes'], ['bois', 'Bois'], ['touros', 'Touros'],
  ['mamotes_f', 'Mamotes F'], ['desmama_f', 'Desmama F'], ['novilhas', 'Novilhas'], ['vacas', 'Vacas'],
].map(([codigo, nome], i) => ({ codigo, nome, ordem_exibicao: i + 1 }));

const row = (codigo: string, o: Partial<ZootCategoriaMensal> = {}): ZootCategoriaMensal => ({
  fazenda_id: 'f1', cliente_id: 'c', ano: 2026, mes: 9, cenario: 'realizado', ano_mes: '2026-09', categoria_id: codigo, categoria_codigo: codigo,
  categoria_nome: codigo, ordem_exibicao: 1, saldo_inicial: 100, entradas_externas: 0, saidas_externas: 0, evol_cat_entrada: 0, evol_cat_saida: 0,
  saldo_final: 100, saldo_sistema: 100, saldo_p1: 100, peso_total_inicial: 30_000, peso_total_final: 31_000, peso_medio_inicial: 300, peso_medio_final: 310,
  peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0, dias_mes: 30, gmd: null, producao_biologica: 1000,
  fonte_oficial_mes: 'fechamento', ...o,
});

describe('as 9 categorias sempre, na ordem do Fechamento, com Machos e Fêmeas', () => {
  const m = montarMesPorCategoria([row('bois'), row('vacas')], CATS, 'realizado');
  it('a ordem: os 5 machos, Machos, as 4 fêmeas, Fêmeas, Total — a categoria sem dado aparece (antes sumia)', () => {
    expect(m.linhas.map((l) => l.id)).toEqual(['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros', 'machos', 'mamotes_f', 'desmama_f', 'novilhas', 'vacas', 'femeas', 'total']);
    expect(m.linhas.find((l) => l.id === 'garrotes')!.temDado).toBe(false);
    expect(m.linhas.find((l) => l.id === 'machos')!.inicio.cab).toBe(100);
    expect(m.linhas.find((l) => l.id === 'total')!.inicio.cab).toBe(200);
  });
});

describe('as MESMAS contas da tela de hoje (EvolucaoCategoriaTab)', () => {
  it('categoria: GMD = PB ÷ ((SI + saldo_final do Fechamento)/2) ÷ dias; kg/cab final = peso ÷ saldo_final', () => {
    const m = montarMesPorCategoria([row('bois', { saldo_inicial: 100, saldo_final: 90, saldo_sistema: 92, producao_biologica: 2850, peso_total_final: 27_000 })], CATS, 'realizado');
    const bois = m.linhas.find((l) => l.id === 'bois')!;
    expect(bois.gmd).toBeCloseTo(2850 / ((100 + 90) / 2) / 30, 10);
    expect(kgCabFinal(bois)).toBeCloseTo(27_000 / 90, 10);
    expect(bois.final.cab).toBe(92); // o saldo final mostrado no Realizado é o `saldo_sistema`, como hoje
  });
  it('total: a média de cabeças usa o saldo da tela (o sistema); um nulo no recorte → todos pelo saldo_final', () => {
    const rows = [row('bois', { saldo_final: 90, saldo_sistema: 92 }), row('vacas', { saldo_final: 100, saldo_sistema: 100 })];
    const t = montarMesPorCategoria(rows, CATS, 'realizado').linhas.find((l) => l.id === 'total')!;
    expect(t.final.cab).toBe(192);
    expect(t.gmd).toBeCloseTo(2000 / ((200 + 192) / 2) / 30, 10);
    const tNulo = montarMesPorCategoria([rows[0], row('vacas', { saldo_sistema: null })], CATS, 'realizado').linhas.find((l) => l.id === 'total')!;
    expect(tNulo.final.cab).toBe(190);
  });
});

describe('tipos do mês, Confere e o desvio do peso', () => {
  const rows = [
    row('bois', { saldo_inicial: 344, cab_abate: 52, peso_abate: 52 * 547, cab_venda: 140, peso_venda: 140 * 424.5, evol_cat_entrada: 67, peso_evol_cat_entrada: 67 * 390.2,
      saldo_final: 218, saldo_sistema: 218, peso_total_final: 218 * 501.1 }),
    row('garrotes', { saldo_inicial: 388, cab_compra: 29, peso_compra: 29 * 257.4, evol_cat_saida: 67, peso_evol_cat_saida: 67 * 390.2, saldo_final: 350, saldo_sistema: 350, peso_total_final: 350 * 355.9 }),
  ];
  const m = montarMesPorCategoria(rows, CATS, 'realizado');
  it('só os tipos COM movimento são colunas; os outros ficam escondidos (a tela avisa)', () => {
    expect(m.tiposVisiveis).toEqual(['compra', 'abate', 'venda']);
    expect(m.tiposEscondidos).toEqual(['nascimento', 'transferencia_entrada', 'consumo', 'morte', 'transferencia_saida']);
  });
  it('Confere: inicial + entradas − saídas + entrou − saiu = final', () => {
    expect(m.confere).toMatchObject({ inicio: 732, entradas: 29, saidas: 192, entrou: 67, saiu: 67, calculado: 569, final: 568, bate: false });
  });
  it('o desvio: âmbar a partir de 15%, vermelho a partir de 25% (Bois entrou a 390,2 × 501,1 final = −22% → âmbar)', () => {
    expect(tomDoDesvio(desvio(390.2, 501.1))).toBe('ambar');
    expect(tomDoDesvio(desvio(420, 501.1))).toBe('ambar'); // −16%: âmbar já a partir de 15%
    expect(tomDoDesvio(desvio(430, 501.1))).toBeNull(); // −14%: ainda nada
    expect(tomDoDesvio(desvio(257.4, 355.9))).toBe('vermelho');
    expect(tomDoDesvio(desvio(547, 501.1))).toBeNull();
    expect(tomDoDesvio(desvio(100, null))).toBeNull();
  });
  it('Conferir pesos: do maior desvio para o menor; a evolução compara com a categoria de DESTINO', () => {
    const lista = pesosAConferir([
      { id: 'a', data: '2026-09-18', tipo: 'abate', categoria: 'bois', categoria_destino: null, quantidade: 52, peso_medio_kg: 547 },
      { id: 'e', data: '2026-09-01', tipo: 'reclassificacao', categoria: 'garrotes', categoria_destino: 'bois', quantidade: 67, peso_medio_kg: 390.2 },
      { id: 'c', data: '2026-09-29', tipo: 'compra', categoria: 'garrotes', categoria_destino: null, quantidade: 4, peso_medio_kg: 220 },
      { id: 's', data: '2026-09-02', tipo: 'morte', categoria: 'garrotes', categoria_destino: null, quantidade: 1, peso_medio_kg: null },
    ], m.referencia);
    expect(lista.map((p) => p.id)).toEqual(['c', 'e', 'a']);
    expect(lista[1].referencia).toBeCloseTo(501.1, 6);
    expect(lista.map((p) => p.tom)).toEqual(['vermelho', 'ambar', null]);
  });
});
