/** P141 — a lista do sistema por dia: maior |valor| primeiro, saldo só no fim do dia e SEMPRE o do banco (nada somado). */
import { describe, it, expect } from 'vitest';
import { linhasDoDia } from './linhasDoDia';
import type { LinhaSistemaDono } from './resumoDoDono';

const L = (data: string, valor: number, saldo: number | null, id: string): LinhaSistemaDono => ({
  tipo: 'lancamento', data, valor, lancamento_id: id, extrato_id: null, parcial: false, falta: null, descricao: id,
  fornecedor: null, centro: null, subcentro: null, status_exibicao: 'conciliado', saldo_apos: saldo ?? 0, saldo_apos_proprio: saldo,
});

/* Na ordem do BANCO: o saldo corrido é o dele. Dia 01: +10 → 110, −300 → −190, +50 → −140. Dia 02: −5 → −145. */
const DO_BANCO = [L('2031-09-01', 10, 110, 'a'), L('2031-09-01', -300, -190, 'b'), L('2031-09-01', 50, -140, 'c'), L('2031-09-02', -5, -145, 'd')];

describe('P141 — linhasDoDia', () => {
  it('dentro do dia, do maior valor absoluto para o menor (entrada ou saída)', () => {
    expect(linhasDoDia(DO_BANCO).map((x) => x.linha.lancamento_id)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('o saldo só na última linha do dia — e é o fim do dia do BANCO, não o da linha que ficou por último', () => {
    const r = linhasDoDia(DO_BANCO);
    expect(r.map((x) => x.fimDoDia)).toEqual([false, false, true, true]);
    expect(r.map((x) => x.saldoDoDia)).toEqual([null, null, -140, -145]);
  });
  it('empate de valor mantém a ordem do banco; saldo ausente do dono fica nulo', () => {
    const r = linhasDoDia([L('2031-09-03', -7, 1, 'x'), L('2031-09-03', 7, null, 'y')]);
    expect(r.map((x) => x.linha.lancamento_id)).toEqual(['x', 'y']);
    expect(r[1].saldoDoDia).toBeNull();
  });
  it('lista vazia = nada', () => { expect(linhasDoDia([])).toEqual([]); });
});
