/**
 * OC-VENDA-ENTREGAS-01b — `_oc_subcentro_venda` (SQL) e' espelho de `subcentroDaVenda` (TS). A entrega da conta corrente
 * escolhe a conta do plano no banco; a OC classifica a principal no front. Se os dois mapas divergirem, a mesma venda cai
 * em 1120 por um caminho e em 1140 pelo outro — e nenhum gate ve'. O caso le o TEXTO da migration e compara par a par, nos
 * dois sentidos, e prova que sabe achar (13 pares, o boitel na frente).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { POR_CATEGORIA, SUBCENTRO_VENDA_BOITEL, subcentroDaVenda } from './subcentroVenda';

const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261027167000_oc_venda_entregas_01b.sql'), 'utf8');
const corpo = sql.slice(sql.indexOf('create or replace function public._oc_subcentro_venda'), sql.indexOf('$fn$;', sql.indexOf('create or replace function public._oc_subcentro_venda')));

describe('espelho SQL x TS do subcentro de venda', () => {
  it('os pares do banco sao exatamente os do front (13, nos dois sentidos)', () => {
    const doBanco: Record<string, string> = {};
    let n = 0;
    for (const m of corpo.matchAll(/WHEN '([a-z_]+)' THEN '([^']+)'/g)) { doBanco[m[1]] = m[2]; n += 1; }
    expect(n).toBe(13);
    expect(doBanco).toEqual(POR_CATEGORIA);
  });

  it('boitel vem antes da categoria nos dois', () => {
    expect(corpo).toContain(`WHEN p_tem_boitel THEN '${SUBCENTRO_VENDA_BOITEL}'`);
    expect(subcentroDaVenda('garrotes', true)).toBe(SUBCENTRO_VENDA_BOITEL);
  });

  it('D7: garrotes -> Venda de Machos Adultos (1140) e desmama M -> Venda de Desmama Machos (1120)', () => {
    expect(subcentroDaVenda('garrotes', false)).toBe('Venda de Machos Adultos');
    expect(subcentroDaVenda('desmama_m', false)).toBe('Venda de Desmama Machos');
  });
});
