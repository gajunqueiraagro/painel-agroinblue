/**
 * BOLETO-DDA-API-01 · D1b — a régua do DV do boleto é UMA, a do banco (`_fn_boleto_normalizar`, 118100).
 * A lista de casos é uma: `linhaDigitavel.casos.json` (o esperado de cada caso SAIU da função do banco em 14/11/2026). O teste SQL
 * `supabase/tests/boleto_d1b_dv_test.sql` roda a função do banco contra ela; aqui, a `normalizarBoleto` da tela contra a mesma lista,
 * e a prova de que a lista e o teste SQL batem caso a caso (caso novo num lado só = este teste cai).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import casos from './linhaDigitavel.casos.json';
import { normalizarBoleto, acharBoletoNoTexto, lerLinhaDigitavel } from '@/lib/financeiro/linhaDigitavel';

const lista: [string, Record<string, unknown>][] = casos.map((c) => [String(c[0]), Object(c[1])]);
const sql = readFileSync(resolve(__dirname, '../../../supabase/tests/boleto_d1b_dv_test.sql'), 'utf8');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const comoNoSql = (o: Record<string, unknown>) =>
  `{${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;

describe('o DV do boleto — a mesma régua da tela e do banco', () => {
  it.each(lista)('%s', (entrada, esperado) => {
    expect(normalizarBoleto(entrada)).toEqual(esperado);
  });

  it('a lista e o teste SQL são a MESMA lista (caso a caso, e nenhum a mais no SQL)', () => {
    for (const [entrada, esperado] of lista) expect(sql, entrada).toContain(`(${q(entrada)}, ${q(comoNoSql(esperado))})`);
    const bloco = sql.slice(sql.indexOf('from (values'), sql.indexOf(') c(e, s)'));
    expect((bloco.match(/\n {4}\('/g) ?? []).length).toBe(lista.length);
  });

  it('a lista cobre os três formatos e os cinco motivos', () => {
    const ok = lista.filter(([, e]) => e.ok === true);
    expect(new Set(ok.map(([e]) => e.replace(/\D/g, '').length))).toEqual(new Set([47, 48, 44]));
    expect(new Set(lista.filter(([, e]) => e.ok === false).map(([, e]) => e.motivo)))
      .toEqual(new Set(['tamanho', 'dv_campo', 'dv_bloco', 'dv_geral', 'arrecadacao_sem_8']));
  });
});

describe('a linha no texto do PDF', () => {
  const vera = '34191090080488182004919646100008816110000300650';
  const errada = '34191090080488182004919646100008916110000300650'; // o DV geral trocado
  const impressa = (l: string) =>
    `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;

  it('uma linha lida errada antes da certa: vale a primeira COM DV certo', () => {
    const r = acharBoletoNoTexto(`Recibo ${impressa(errada)} ... Ficha de compensação ${impressa(vera)}`);
    expect(r?.linha).toBe(vera);
    expect(lerLinhaDigitavel(`Recibo ${impressa(errada)} ... ${impressa(vera)}`)?.linha).toBe(vera);
  });

  it('só a errada: null (nunca o vencimento/valor de uma linha que não confere)', () => {
    expect(acharBoletoNoTexto(`Linha ${impressa(errada)}`)).toBeNull();
    expect(lerLinhaDigitavel(`Linha ${impressa(errada)}`)).toBeNull();
  });

  it('arrecadação em blocos ("…-1 …-4") e corrida; o Anexar (lerLinhaDigitavel) segue só bancário', () => {
    const arr = '816600000011234500011114222233334440455556666770';
    expect(acharBoletoNoTexto('Conta de luz 81660000001-1 23450001111-4 22223333444-0 45555666677-0 vence')?.codigo_barras)
      .toBe('81660000001234500011112222333344445555666677');
    expect(acharBoletoNoTexto(`x ${arr} y`)?.tipo).toBe('arrecadacao');
    expect(lerLinhaDigitavel(`x ${arr} y`)).toBeNull();
  });

  it('o código de barras de 44 solto no texto NÃO é lido (a chave da NF-e também tem 44)', () => {
    expect(acharBoletoNoTexto('Chave 00191170000001250750000002345678901234567817 fim')).toBeNull();
    expect(normalizarBoleto('00191170000001250750000002345678901234567817').ok).toBe(true);
  });
});
