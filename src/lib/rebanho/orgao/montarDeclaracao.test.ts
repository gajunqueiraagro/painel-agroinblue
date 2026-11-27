/** REBANHO-ORGAO-01 (F3) — a cola banco/PDF → conta. Dado FICTÍCIO (fazendas "A"/"B", números inventados). */
import { describe, it, expect } from 'vitest';
import {
  bruceloseDaFazenda, comEditado, desdeDaDeclaracao, editadosDoBanco, etapaDaVez, etapasDoBanco, fatosDaRpc, jaDeclaradoDoExtrato,
  linhasGuardadas, movimentosParaCasar, ultimaDeclaracaoNoExtrato, diasAte, type FatosDoBanco,
} from './montarDeclaracao';
import type { ExtratoLido, OperacaoDoExtrato } from './lerExtratoIagro';

const z = (): [number, number, number, number] => [0, 0, 0, 0];
const op = (o: Partial<OperacaoDoExtrato>): OperacaoDoExtrato => ({
  tipo: 'outra', texto: '', mov: { F: z(), M: z() }, geral: 0, quando: null, documento: null, outraFicha: null, municipio: null, dataDaVacina: null, ...o,
});
const extrato = (ops: OperacaoDoExtrato[]): ExtratoLido => ({ ficha: '1', especie: 'BOVINO', periodoDe: '2026-01-01', periodoAte: '2026-11-23',
  operacoes: ops, saldoFinal: { F: z(), M: z() } });

const RPC = {
  cliente_id: 'c', desde: '2026-05-04', ate: '2026-11-30',
  fazendas: [{ id: 'A', nome: 'Fazenda A', uf: 'MS' }, { id: 'B', nome: 'Fazenda B', uf: null }, { id: 7 }],
  nascimentos: [{ id: 'n1', fazenda_id: 'A', data: '2026-07-01', categoria: 'mamotes_f', cab: 10 }, { fazenda_id: 'A', data: '2026-07-01', cab: 0, categoria: 'x' }],
  reclassificacoes: [{ fazenda_id: 'A', data: '2026-07-15', de: 'mamotes_f', para: 'mamotes_m', cab: 2 }],
  mortes_consumo: [{ fazenda_id: 'A', data: '2026-06-10', tipo: 'morte', categoria: 'vacas', cab: 2 }, { fazenda_id: 'A', data: '2026-06-10', tipo: 'outra', categoria: 'vacas', cab: 1 }],
  ajustes: [{ fazenda_id: 'B', data: '2026-09-10', sentido: 'entrada', categoria: 'vacas', cab: 1 }],
  movimentos: [{ id: 'v1', fazenda_id: 'A', tipo: 'venda', data: '2026-08-04', sentido: 'saida', categoria: 'bois', cab: 60, egtas: ['T-1', 9] }],
  rebanho_hoje: [{ fazenda_id: 'A', ano_mes: '2026-11', categoria: 'vacas', cab: 50 }],
};

describe('fatosDaRpc — o json do banco, campo a campo', () => {
  it('lê o que tem a forma certa e deixa de fora o resto (sem cast)', () => {
    const f = fatosDaRpc(RPC);
    expect(f?.fazendas.map((x) => [x.id, x.uf])).toEqual([['A', 'MS'], ['B', null]]);
    expect(f?.nascimentos).toEqual([{ fazendaId: 'A', data: '2026-07-01', cab: 10, categoria: 'mamotes_f' }]);
    expect(f?.mortesConsumo).toHaveLength(1);
    expect(f?.movimentos[0].egtas).toEqual(['T-1']);
    expect(f?.rebanhoHoje).toEqual([{ fazendaId: 'A', anoMes: '2026-11', categoria: 'vacas', cab: 50 }]);
    expect(fatosDaRpc({ fazendas: [] })).toBeNull();
    expect(fatosDaRpc(null)).toBeNull();
  });
  it('as movimentações para casar levam o nº já gravado', () => {
    const f = fatosDaRpc(RPC);
    if (!f) throw new Error('fatos');
    expect(movimentosParaCasar(f, 'A')).toEqual([{ id: 'v1', data: '2026-08-04', sentido: 'saida', cab: 60, numeroDocumento: 'T-1' }]);
    expect(movimentosParaCasar(f, 'B')).toEqual([]);
  });
});

describe('o PDF guardado e o editado', () => {
  it('o PDF volta como as linhas lidas; sem linhas = null', () => {
    expect(linhasGuardadas({ linhas: ['a | b', 3, 'c'] })).toEqual(['a | b', 'c']);
    expect(linhasGuardadas({ linhas: [] })).toBeNull();
    expect(linhasGuardadas(null)).toBeNull();
  });
  it('o editado: lê só inteiros ≥ 0; trocar uma célula e voltar ao sugerido (↺) deixa o objeto vazio', () => {
    expect(editadosDoBanco({ F: { nascimentos: 7, mortesConsumo: { 3: 2, 1: -1 }, passa: { 0: 1.5 } }, M: 'x' }))
      .toEqual({ F: { nascimentos: 7, mortesConsumo: { 3: 2 } } });
    const e1 = comEditado({}, { sexo: 'M', campo: 'passa', faixa: 1 }, 9);
    expect(e1).toEqual({ M: { passa: { 1: 9 } } });
    const e2 = comEditado(e1, { sexo: 'M', campo: 'nascimentos' }, 4);
    expect(comEditado(comEditado(e2, { sexo: 'M', campo: 'passa', faixa: 1 }, null), { sexo: 'M', campo: 'nascimentos' }, null)).toEqual({});
    expect(editadosDoBanco(JSON.parse(JSON.stringify(e2)))).toEqual(e2);   // o que vai ao banco volta igual
  });
});

describe('o extrato', () => {
  const ex = extrato([
    op({ tipo: 'morte', quando: '2026-05-04T10:00:00', mov: { F: [0, 0, 0, -1], M: z() } }),        // no dia da última: já estava
    op({ tipo: 'morte', quando: '2026-06-01T10:00:00', mov: { F: [0, 0, 0, -2], M: z() } }),
    op({ tipo: 'consumo', quando: '2026-07-01T10:00:00', mov: { F: z(), M: [0, -1, 0, 0] } }),
    op({ tipo: 'era_entrada', documento: '55/U', quando: '2026-05-04T09:00:00' }),
    op({ tipo: 'era_entrada', documento: '44/U', quando: '2025-11-26T09:00:00' }),
    op({ tipo: 'brucelose', dataDaVacina: '2026-10-01', quando: '2026-10-01T08:00:00', mov: { F: [-5, 0, 0, 0], M: z() } }),
  ]);
  it('R4: o já declarado é só DEPOIS de "desde", em positivo', () => {
    expect(jaDeclaradoDoExtrato(ex, '2026-05-04')).toEqual({ morte: { F: [0, 0, 0, 2], M: z() }, consumo: { F: z(), M: [0, 1, 0, 0] } });
  });
  it('"desde": o sistema manda; sem ele, a última declaração ("/U") do extrato; sem as duas, null (nunca chuta)', () => {
    expect(ultimaDeclaracaoNoExtrato(ex)).toBe('2026-05-04');
    expect(desdeDaDeclaracao('2026-05-20', [ex])).toEqual({ data: '2026-05-20', fonte: 'sistema' });
    expect(desdeDaDeclaracao(null, [null, ex])).toEqual({ data: '2026-05-04', fonte: 'extrato' });
    expect(desdeDaDeclaracao(null, [null, extrato([])])).toEqual({ data: null, fonte: null });
  });
  it('brucelose: as fêmeas de 3 a 8 meses no fim da etapa menos as vacinadas; sem extrato, vacinadas "—"', () => {
    const f: FatosDoBanco = { desde: '2026-05-04', ate: '2026-11-30', fazendas: [], reclassificacoes: [], mortesConsumo: [], ajustes: [], movimentos: [], rebanhoHoje: [],
      nascimentos: [
        { fazendaId: 'A', data: '2026-04-01', categoria: 'mamotes_f', cab: 20 },   // 8 meses em 31/12: entra
        { fazendaId: 'A', data: '2026-03-01', categoria: 'mamotes_f', cab: 7 },    // 9 meses: fora
        { fazendaId: 'A', data: '2026-09-01', categoria: 'mamotes_f', cab: 11 },   // 3 meses: entra
        { fazendaId: 'A', data: '2026-10-01', categoria: 'mamotes_f', cab: 4 },    // 2 meses: fora
        { fazendaId: 'A', data: '2026-06-01', categoria: 'mamotes_m', cab: 30 },   // macho: fora
      ] };
    expect(bruceloseDaFazenda(f, 'A', '2026-12-31', ex, '2026-06-06'))
      .toEqual({ candidatas: 31, vacinadas: 5, aVacinar: 26, ultimaVacina: '2026-10-01', vacinarAte: '2026-12-31' });
    expect(bruceloseDaFazenda(f, 'A', '2026-12-31', null, '2026-06-06'))
      .toEqual({ candidatas: 31, vacinadas: null, aVacinar: null, ultimaVacina: '2026-06-06', vacinarAte: '2026-12-31' });
  });
});

describe('a etapa da vez', () => {
  const ETAPAS = etapasDoBanco([
    { id: 'm', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-05-01', fim: '2026-05-31', prorrogado_ate: '2026-06-02', ativo: true },
    { id: 'n', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-11-01', fim: '2026-11-30', prorrogado_ate: null, ativo: true },
    { id: 'x', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2027-05-01', fim: '2027-05-31', ativo: false },
    { id: 'b', uf: 'MS', orgao: 'IAGRO', tipo: 'brucelose', inicio: '2026-07-01', fim: '2026-12-31' },
  ]);
  it('a aberta hoje (até a prorrogação); senão a próxima; a inativa não conta; sem UF = null', () => {
    expect(etapaDaVez(ETAPAS, 'MS', 'declaracao', '2026-11-24')?.id).toBe('n');
    expect(etapaDaVez(ETAPAS, 'MS', 'declaracao', '2026-06-02')?.id).toBe('m');
    expect(etapaDaVez(ETAPAS, 'MS', 'declaracao', '2026-06-03')?.id).toBe('n');
    expect(etapaDaVez(ETAPAS, 'MS', 'declaracao', '2026-12-01')).toBeNull();
    expect(etapaDaVez(ETAPAS, 'SP', 'declaracao', '2026-11-24')).toBeNull();
    expect(etapaDaVez(ETAPAS, null, 'declaracao', '2026-11-24')).toBeNull();
    expect(etapaDaVez(ETAPAS, 'MS', 'brucelose', '2026-11-24')?.id).toBe('b');
    expect(diasAte('2026-11-23', '2026-11-30')).toBe(7);
  });
});
