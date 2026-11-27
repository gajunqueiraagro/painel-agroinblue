/**
 * BOLETO-FATOR-VENC-01 (Gabriel 25/11/2026) — o fator de vencimento vira data por UMA regra, a mesma na tela e no banco: o ciclo cuja
 * data cai em [data da LEITURA − 3000, + 5500] dias. Nasce de 4 boletos de nov/2024–fev/2025 gravados em 2049 (o ciclo novo sempre).
 * A lista de casos é uma: `fatorDeVencimento.casos.json` (o esperado saiu da aritmética de datas do Postgres). O teste SQL
 * `supabase/tests/boleto_fator_venc_test.sql` roda a função do banco contra ela; aqui, a `vencimentoDoFator` da tela, e a prova de que a
 * lista e o teste SQL batem caso a caso. Sem dado de cliente: só fatores, datas e um código de barras sintético.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import casos from './fatorDeVencimento.casos.json';
import { vencimentoDoFator, normalizarBoleto } from '@/lib/financeiro/linhaDigitavel';

const lista: [number, string, string | null][] = casos.map((c) => [Number(c[0]), String(c[1]), c[2] === null ? null : String(c[2])]);
const sql = readFileSync(resolve(__dirname, '../../../supabase/tests/boleto_fator_venc_test.sql'), 'utf8');
const comoNoSql = (f: number, lido: string, esp: string | null) => `(${f}, '${lido}', ${esp === null ? 'null' : `'${esp}'`})`;

/** Código de barras sintético (banco 341, R$ 550,00) com o fator 9891 — o mesmo do teste SQL. */
const SINTETICO_9891 = '34192989100000550001234567890123456789012345';

describe('o fator de vencimento — a mesma regra da tela e do banco', () => {
  it.each(lista)('fator %i lido em %s -> %s', (fator, lido, esperado) => {
    expect(vencimentoDoFator(fator, lido)).toBe(esperado);
  });

  it('a lista e o teste SQL são a MESMA lista (caso a caso, e nenhum a mais no SQL)', () => {
    for (const [f, l, e] of lista) expect(sql, `${f} ${l}`).toContain(comoNoSql(f, l, e));
    const bloco = sql.slice(sql.indexOf('from (values'), sql.indexOf(') c(f, lido, esperado)'));
    expect((bloco.match(/\n {4}\(/g) ?? []).length).toBe(lista.length);
  });

  it('a lista cobre os dois ciclos, a virada, a lacuna entre as janelas e o fator sem vencimento', () => {
    const anos = lista.map(([, , e]) => (e ? Number(e.slice(0, 4)) : null));
    expect(anos.some((a) => a !== null && a < 2025)).toBe(true); // o ciclo de 07/10/1997
    expect(anos.some((a) => a !== null && a >= 2026)).toBe(true); // o ciclo de 22/02/2025
    expect(lista.some(([f]) => f === 9999)).toBe(true);
    expect(lista.some(([f]) => f === 1000)).toBe(true);
    expect(lista.filter(([, , e]) => e === null).length).toBeGreaterThanOrEqual(3);
  });
});

describe('o boleto lido: a data da leitura escolhe o ciclo', () => {
  it('o fator 9891 lido hoje (25/11/2026) é 05/11/2024 — não 27/06/2049', () => {
    const r = normalizarBoleto(SINTETICO_9891, '2026-11-25');
    expect(r.ok && r.vencimento).toBe('2024-11-05');
  });

  it('o mesmo fator lido em 2049 é 27/06/2049 (a regra anda com a data da leitura)', () => {
    const r = normalizarBoleto(SINTETICO_9891, '2049-01-01');
    expect(r.ok && r.vencimento).toBe('2049-06-27');
  });

  it('sem a data, a leitura é de hoje', () => {
    const r = normalizarBoleto(SINTETICO_9891);
    expect(r.ok && r.vencimento).toBe(vencimentoDoFator(9891));
  });
});
