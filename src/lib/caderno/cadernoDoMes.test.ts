/**
 * CADERNO-CAMPO-01 peça 1 — a lib pura do "Exportar mês". Dados SINTÉTICOS (nenhum dado de cliente no repo).
 */
import { describe, expect, it } from 'vitest';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { Lancamento } from '@/types/cattle';
import type { Chuva } from '@/hooks/useChuvas';
import type { CategoriaRebanho, Pasto } from '@/hooks/usePastos';
import type { DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import {
  TRACO, cadernoDoMes, causaDaMorte, celula, chuvaDoAno, conciliacaoDoAno, listasDoAno, mapaDoRebanho,
} from './cadernoDoMes';

function zoot(mes: number, codigo: string, p: Partial<ZootCategoriaMensal>): ZootCategoriaMensal {
  return {
    fazenda_id: 'f', cliente_id: 'c', ano: 2031, mes, cenario: 'realizado', ano_mes: `2031-${String(mes).padStart(2, '0')}`,
    categoria_id: codigo, categoria_codigo: codigo, categoria_nome: codigo, ordem_exibicao: 1,
    saldo_inicial: 0, entradas_externas: 0, saidas_externas: 0, evol_cat_entrada: 0, evol_cat_saida: 0, saldo_final: 0,
    saldo_sistema: null, saldo_p1: null, peso_total_inicial: 0, peso_total_final: 0, peso_medio_inicial: null, peso_medio_final: null,
    peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0, dias_mes: 30, gmd: null,
    producao_biologica: 0, fonte_oficial_mes: 'fechamento', ...p,
  };
}

describe('conciliacaoDoAno', () => {
  const linhas = [
    zoot(1, 'vacas', { saldo_inicial: 100, saldo_final: 99, saldo_sistema: 99, saldo_p1: 99, saidas_externas: 1, cab_morte: 1 }),
    zoot(1, 'mamotes_m', { saldo_inicial: 0, saldo_final: 10, saldo_sistema: 10, saldo_p1: 9, entradas_externas: 10, cab_nascimento: 10 }),
    zoot(2, 'vacas', { saldo_inicial: 99, saldo_final: 79, saldo_sistema: 79, saldo_p1: null, saidas_externas: 20, cab_transf_saida: 15, cab_venda: 2, cab_venda_pe: 3 }),
    zoot(2, 'mamotes_m', { saldo_inicial: 10, saldo_final: 14, saldo_sistema: 14, entradas_externas: 4, cab_compra: 1 }),
    zoot(3, 'vacas', { saldo_inicial: 79, saldo_final: 50, saldo_sistema: 50, saidas_externas: 29, cab_abate: 29 }),
  ];
  const c = conciliacaoDoAno(linhas, 2);

  it('T1 saldo inicial, entradas e saídas por tipo, totais e saldo final, só até o mês escolhido', () => {
    expect(c.saldoInicial.meses.slice(0, 3)).toEqual([100, 109, null]);
    expect(c.saldoInicial.ano).toBe(100);
    expect(c.entradas.find((l) => l.rotulo === 'Nascimentos')?.meses.slice(0, 2)).toEqual([10, 0]);
    expect(c.saidas.find((l) => l.rotulo === 'Vendas em pé')?.meses[1]).toBe(5);
    expect(c.saidas.find((l) => l.rotulo === 'Transf. saídas')?.ano).toBe(15);
    expect(c.totalSaidas.meses.slice(0, 2)).toEqual([1, 20]);
    expect(c.saldoFinal.meses.slice(0, 3)).toEqual([109, 93, null]);
    expect(c.saldoFinal.ano).toBe(93);
  });
  it('T2 a entrada que a quebra não explica (ajuste/linha antiga) vira "Outras entradas" — nunca some da conta', () => {
    const outras = c.entradas.find((l) => l.rotulo === 'Outras entradas');
    expect(outras?.meses.slice(0, 2)).toEqual([0, 3]);
    expect(c.totalEntradas.meses.slice(0, 2)).toEqual([10, 4]);
    expect(c.saidas.some((l) => l.rotulo === 'Outras saídas')).toBe(false);
  });
  it('T3 saldo no mapa = soma do fechamento (sem fechamento = null, "—"); diferença = mapa − saldo final', () => {
    expect(c.saldoNoMapa.meses.slice(0, 2)).toEqual([108, null]);
    expect(c.diferenca.meses.slice(0, 2)).toEqual([-1, null]);
    expect(c.saldoNoMapa.ano).toBe(108);
    const semMapa = conciliacaoDoAno([zoot(1, 'vacas', { saldo_inicial: 5, saldo_final: 5, saldo_sistema: 5 })], 1);
    expect(semMapa.saldoNoMapa.meses[0]).toBeNull();
    expect(semMapa.diferenca.meses[0]).toBeNull();
  });
});

function lanc(p: Partial<Lancamento> & Pick<Lancamento, 'data' | 'tipo'>): Lancamento {
  return { id: p.data + p.tipo, quantidade: 1, categoria: 'vacas', cenario: 'realizado', statusOperacional: 'realizado', ...p };
}

describe('listasDoAno', () => {
  const ls: Lancamento[] = [
    lanc({ data: '2031-01-05', tipo: 'compra', quantidade: 10, categoria: 'novilhas', pesoMedioKg: 300, fornecedorNomeSnapshot: 'Vendedor X' }),
    lanc({ data: '2031-02-10', tipo: 'transferencia_saida', quantidade: 20, fazendaDestino: 'Faz. B' }),
    lanc({ data: '2031-02-11', tipo: 'morte', categoria: 'mamotes_f', fazendaDestino: 'Natimorto', numeroId: 'B-1' }),
    lanc({ data: '2031-02-12', tipo: 'morte', motivo: 'Raiva', fazendaDestino: 'Causa desconhecida' }),
    lanc({ data: '2031-02-13', tipo: 'consumo', fazendaDestino: 'Consumo Interno' }),
    lanc({ data: '2031-02-14', tipo: 'reclassificacao', quantidade: 3, categoria: 'mamotes_m', categoriaDestino: 'desmama_m' }),
    lanc({ data: '2031-02-15', tipo: 'reclassificacao', quantidade: 2, categoria: 'novilhas', categoriaDestino: 'vacas' }),
    lanc({ data: '2031-02-16', tipo: 'nascimento', quantidade: 7, categoria: 'mamotes_m', observacao: 'brincos 1 a 7' }),
    lanc({ data: '2031-02-17', tipo: 'abate', quantidade: 5, statusOperacional: 'programado' }),
    lanc({ data: '2031-03-01', tipo: 'compra', quantidade: 99 }),
    lanc({ data: '2030-12-31', tipo: 'compra', quantidade: 99 }),
  ];
  const r = listasDoAno(ls, 2031, 2);

  it('T4 só o realizado do ano até o mês escolhido (programado, mês seguinte e ano anterior ficam fora)', () => {
    expect(r.entradas.linhas.map((l) => l.data)).toEqual(['05/01/2031']);
    expect(r.entradas.linhas[0].colunas).toEqual(['Compra', '10', 'Novilha', '300', 'Vendedor X', '']);
    expect(r.saidas.linhas).toHaveLength(1);
    expect(r.saidas.linhas[0].colunas[4]).toBe('Faz. B');
    expect(r.saidas.totalCab).toBe(20);
    expect(r.saidas.totalCabNoMes).toBe(20);
  });
  it('T5 a causa da morte é o motivo; sem ele, o campo de destino (D2); consumo não tem causa; identificação do brinco', () => {
    expect(r.mortes.linhas.map((l) => l.colunas[6])).toEqual(['Natimorto', 'Raiva', '']);
    expect(r.mortes.linhas[0].colunas[4]).toBe('B-1');
    expect(r.mortes.linhas[0].colunas[5]).toBe(TRACO);
    expect(causaDaMorte(lanc({ data: '2031-01-01', tipo: 'morte' }))).toBe('');
  });
  it('T6 desmama = mamote → desmama; o resto da reclassificação vai para Engorda; nascimento com sexo pela categoria', () => {
    expect(r.desmamas.linhas.map((l) => l.colunas.slice(0, 2))).toEqual([['3', 'M']]);
    expect(r.engorda.linhas.map((l) => l.colunas.slice(1, 3))).toEqual([['Novilha', 'Vaca']]);
    expect(r.nascimentos.linhas[0].colunas).toEqual(['7', 'M', TRACO, TRACO, TRACO, 'brincos 1 a 7']);
  });
});

describe('mapaDoRebanho', () => {
  const categorias: CategoriaRebanho[] = [
    { id: '1', codigo: 'vacas', nome: 'Vacas', ordem_exibicao: 1 }, { id: '2', codigo: 'mamotes_m', nome: 'Mamotes M', ordem_exibicao: 2 },
  ];
  const pasto = (id: string, nome: string, area: number | null): Pasto => ({
    id, fazenda_id: 'f', nome, lote_padrao: null, area_produtiva_ha: area, tipo_uso: 'recria', qualidade: null, entra_conciliacao: true,
    ativo: true, observacoes: null, ordem_exibicao: 1, data_inicio: null, created_at: '', updated_at: '',
  });
  const dado = (id: string, pecuaria: boolean, cats: DadosDoPastoNoMes['categorias']): DadosDoPastoNoMes => ({
    pastoId: id, temFechamento: cats.length > 0, fechado: true, cabecas: null, pesoTotalKg: null, pesoMedioKg: null, kgHa: null, faixa: null,
    atividade: null, usoDoMes: null, pecuaria, categorias: cats, categoriaPrincipalId: null, ultimoFechamento: null, historico: [],
  });
  const vig = [pasto('a', 'Pasto A', 50), pasto('b', 'Pasto B', 30), pasto('r', 'Reserva', 100)];
  const dados = new Map<string, DadosDoPastoNoMes>([
    ['a', dado('a', true, [
      { nome: 'Vacas', quantidade: 10, peso_medio_kg: 400, lote: 'L1' }, { nome: 'Vacas', quantidade: 30, peso_medio_kg: 480, lote: 'L1' },
      { nome: 'Mamotes M', quantidade: 5, peso_medio_kg: 80, lote: 'L2' }, { nome: 'Mamotes M', quantidade: 0, peso_medio_kg: null, lote: 'L2' },
    ])],
    ['b', dado('b', true, [])],
    ['r', dado('r', false, [])],
  ]);
  const m = mapaDoRebanho(vig, dados, categorias);

  it('T7 uma linha por pasto e lote (D4), peso médio ponderado, só pecuária, pasto sem gado = linha vazia, área contada uma vez', () => {
    expect(m.linhas.map((l) => [l.pasto, l.lote, l.total])).toEqual([['Pasto A', 'L1', 40], ['Pasto A', 'L2', 5], ['Pasto B', '', 0]]);
    expect(m.linhas[0].porCategoria.vacas).toEqual({ quantidade: 40, pesoMedioKg: 460 });
    expect(m.totalPorCategoria).toEqual({ vacas: 40, mamotes_m: 5 });
    expect(m.total).toBe(45);
    expect(m.areaHa).toBe(80);
  });
  it('T7b a área é a DO MÊS (PASTO-AREA-OFICIAL-02a): o areaDe manda; o que ele não sabe fica com a do cadastro; sem área = null, nunca 0', () => {
    const vig2 = [pasto('a', 'Pasto A', 50), pasto('b', 'Pasto B', null)];
    const areaDe = (id: string, am: string) => (am === '2031-02' && id === 'a' ? 42 : undefined);
    const m2 = mapaDoRebanho(vig2, dados, categorias, '2031-02', areaDe);
    expect(m2.linhas.map((l) => [l.pasto, l.areaHa])).toEqual([['Pasto A', 42], ['Pasto A', 42], ['Pasto B', null]]);
    expect(m2.areaHa).toBe(42);
    expect(mapaDoRebanho(vig2, dados, categorias, '2031-03', areaDe).areaHa).toBe(50);
  });
});

describe('chuvaDoAno e celula', () => {
  const ch = (data: string, mm: number): Chuva => ({ id: data, fazendaId: 'f', data, milimetros: mm });
  const chuvas = [ch('2031-01-03', 15), ch('2031-01-03', 5), ch('2031-02-10', 30), ch('2031-03-01', 99), ch('2030-01-01', 7),
    ch('2026-05-05', 1), ch('2027-05-05', 2), ch('2028-05-05', 3), ch('2029-05-05', 4), ch('2031-01-09', 0)];
  const c = chuvaDoAno(chuvas, 2031, 2);

  it('T8 dia × mês até o mês escolhido, total, acumulado, dias de chuva e o histórico dos 4 anos anteriores', () => {
    expect(c.grade[2][0]).toBe(20);
    expect(c.grade[0][2]).toBeNull();
    expect(c.total.slice(0, 3)).toEqual([20, 30, null]);
    expect(c.acumulado.slice(0, 2)).toEqual([20, 50]);
    expect(c.diasComChuva).toBe(3);
    expect(c.historico.map((h) => h.ano)).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(c.historico[4].total).toBe(50);
  });
  it('T9 zero = célula vazia; ausente = "—"', () => {
    expect(celula(0)).toBe('');
    expect(celula(null)).toBe(TRACO);
    expect(celula(1387)).toBe('1.387');
    expect(celula(134.5, 1)).toBe('134,5');
  });
  it('T10 o caderno respeita as folhas escolhidas, na ordem do caderno, e o nome do arquivo sem acento', () => {
    const k = cadernoDoMes({
      cliente: 'C', fazenda: 'Faz. São José', ano: 2031, mes: 2, geradoEm: '04/11/2031', folhas: ['chuva', 'conciliacao'],
      rebanho: [], lancamentos: [], vigentes: [], mapa: new Map(), categorias: [], chuvas,
    });
    expect(k.folhas).toEqual(['conciliacao', 'chuva']);
    expect(k.arquivo).toBe('caderno-Faz-Sao-Jose-2031-02');
  });
});
