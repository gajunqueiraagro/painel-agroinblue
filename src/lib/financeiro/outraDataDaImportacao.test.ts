/**
 * OF-CONFERIR-CASAMENTO-01 (OK do Gabriel 17/11) — a regra pura da REPETIDA COM OUTRA DATA na importação: origens diferentes (Open
 * Finance × arquivo), o mesmo valor ao centavo, a data do arquivo no dia seguinte ou até 3 dias úteis depois da do Open Finance, uma a
 * uma, a mais próxima primeiro. Fixture sintética.
 */
import { describe, expect, it } from 'vitest';
import { outraDataDaImportacao, type LinhaParaOutraData } from './duplicidadeImportacao';

const of = (chave: string, data: string, valor: number): LinhaParaOutraData => ({ chave, data, valor, deOpenFinance: true });
const arq = (chave: string, data: string, valor: number): LinhaParaOutraData => ({ chave, data, valor, deOpenFinance: false });

describe('outraDataDaImportacao', () => {
  it('nos dois sentidos: o OFX novo × o Open Finance já gravado, e o "Buscar do banco" novo × o OFX já gravado', () => {
    expect([...outraDataDaImportacao([arq('n', '2026-11-03', -6000)], [of('v', '2026-11-01', -6000)], new Set())]).toEqual([['n', 'v']]);
    expect([...outraDataDaImportacao([of('n', '2026-11-15', -440.2)], [arq('v', '2026-11-17', -440.2)], new Set())]).toEqual([['n', 'v']]);
  });
  it('o lado do ARQUIVO antes do lado do Open Finance não casa; o mesmo dia é da coincidência de sempre; a mesma origem nunca', () => {
    expect(outraDataDaImportacao([arq('n', '2026-11-03', -10)], [of('v', '2026-11-04', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([of('n', '2026-11-04', -10)], [arq('v', '2026-11-03', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([arq('n', '2026-11-03', -10)], [of('v', '2026-11-03', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([arq('n', '2026-11-03', -10)], [arq('v', '2026-11-01', -10)], new Set()).size).toBe(0);
  });
  it('até 3 dias úteis (sex 06 → qua 11 casa; → qui 12 não); valor ao centavo, com o sinal; a viva reivindicada não', () => {
    expect(outraDataDaImportacao([arq('n', '2026-11-11', -10)], [of('v', '2026-11-06', -10)], new Set()).size).toBe(1);
    expect(outraDataDaImportacao([arq('n', '2026-11-12', -10)], [of('v', '2026-11-06', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([arq('n', '2026-11-03', 10)], [of('v', '2026-11-01', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([arq('n', '2026-11-03', -10.01)], [of('v', '2026-11-01', -10)], new Set()).size).toBe(0);
    expect(outraDataDaImportacao([arq('n', '2026-11-03', -10)], [of('v', '2026-11-01', -10)], new Set(['v'])).size).toBe(0);
  });
  it('uma a uma, a mais próxima primeiro: dois Pix iguais do Open Finance (sex e dom) × um só no OFX de terça → o de domingo', () => {
    const r = outraDataDaImportacao([arq('n', '2026-11-03', -6000)], [of('sexta', '2026-10-30', -6000), of('domingo', '2026-11-01', -6000)], new Set());
    expect([...r]).toEqual([['n', 'domingo']]);
    const dois = outraDataDaImportacao([arq('n1', '2026-11-03', -6000), arq('n2', '2026-11-03', -6000)], [of('v', '2026-11-01', -6000)], new Set());
    expect(dois.size).toBe(1);
  });
});
