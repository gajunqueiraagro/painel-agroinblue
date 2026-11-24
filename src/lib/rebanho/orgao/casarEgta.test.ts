/** REBANHO-ORGAO-01 (F2) — R6: a eGTA casa com a movimentação pela soma, o sentido e ±10 dias; o estorno anula. Dados fictícios. */
import { describe, it, expect } from 'vitest';
import { casarEgta, egtasDoExtrato, type MovimentoComGta } from './casarEgta';
import type { OperacaoDoExtrato } from './lerExtratoIagro';

const op = (tipo: OperacaoDoExtrato['tipo'], documento: string, quando: string, geral: number): OperacaoDoExtrato => ({
  tipo, texto: tipo, mov: { F: [0, 0, 0, 0], M: [0, 0, 0, 0] }, geral, quando, documento, outraFicha: null, municipio: null, dataDaVacina: null });
const mov = (id: string, data: string, sentido: 'saida' | 'entrada', cab: number, numeroDocumento: string | null = null): MovimentoComGta => ({ id, data, sentido, cab, numeroDocumento });

describe('casarEgta', () => {
  const egtas = egtasDoExtrato([
    op('egta_saida', '1/P', '2026-05-07T10:00:00', -50), op('egta_saida', '2/P', '2026-05-07T10:05:00', -50),
    op('egta_saida', '3/P', '2026-05-07T10:10:00', -50), op('estorno_saida', '3/P', '2026-05-07T10:20:00', 50),
    op('egta_entrada', '4/P', '2026-06-13T15:30:00', 30), op('egta_saida', '5/P', '2026-08-13T09:00:00', -60),
    op('egta_saida', '6/P', '2026-09-30T09:00:00', -20),
  ]);
  it('o estorno anula a eGTA de mesmo documento', () => {
    expect(egtas.map((e) => e.documento)).toEqual(['1/P', '2/P', '4/P', '5/P', '6/P']);
  });
  it('1 movimentação = a soma de 2 eGTAs; o sentido separa; 9 dias de diferença ainda casa', () => {
    const r = casarEgta(egtas, [mov('venda', '2026-05-06', 'saida', 100), mov('transf', '2026-06-12', 'entrada', 30), mov('venda60', '2026-08-04', 'saida', 60)]);
    expect(r.casados.map((c) => [c.movimentoId, c.documentos, c.diasDeDiferenca])).toEqual([['venda', ['1/P', '2/P'], 1], ['transf', ['4/P'], 1], ['venda60', ['5/P'], 9]]);
    expect(r.egtaSemMovimento.map((e) => e.documento)).toEqual(['6/P']);
  });
  it('mais de 10 dias, ou soma que não bate: o movimento fica SEM eGTA (saída sem GTA)', () => {
    const r = casarEgta(egtas, [mov('longe', '2026-09-15', 'saida', 20), mov('soma', '2026-05-07', 'saida', 70)]);
    expect(r.movimentoSemEgta.map((m) => m.id)).toEqual(['soma', 'longe']);
  });
  it('o nº já gravado diferente da eGTA casada vira aviso', () => {
    const r = casarEgta(egtas, [mov('t', '2026-06-13', 'entrada', 30, '999/P')]);
    expect(r.casados[0].numeroJaGravadoDiferente).toBe(true);
  });
});
