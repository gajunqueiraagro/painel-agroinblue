/**
 * O que este teste trava — a identidade de um item de custeio entre um mês e o seguinte.
 *
 * ⚠ O ESTADO ERA UM `Set<number>` EM MEMÓRIA, por número de linha do TXT. Fechar a aba
 * perdia tudo, e o Raul recomeçava do zero; e o número da linha nem serve como identidade,
 * porque muda quando o relatório é reimpresso com uma família a mais.
 */
import { describe, it, expect } from 'vitest';
import { hashItemCusteio } from './hashItemCusteio';

const CLI = '11111111-1111-1111-1111-111111111111';
const base = { clienteId: CLI, competencia: '2026-08', valor: 3200, descricao: 'Óleo Diesel' };

describe('hashItemCusteio', () => {
  it('é determinístico: o mesmo item dá sempre o mesmo hash', async () => {
    expect(await hashItemCusteio(base)).toBe(await hashItemCusteio({ ...base }));
  });

  it('⚠ acento quebrado não cria um item novo', async () => {
    /* O relatório vem em cp1252 e pode ser lido com o acento perdido. Sem normalizar, o
       item viraria outro e o mês seguinte o proporia de novo como se nunca lançado. */
    expect(await hashItemCusteio({ ...base, descricao: 'OLEO DIESEL' }))
      .toBe(await hashItemCusteio({ ...base, descricao: 'óleo  diesel ' }));
  });

  it('⚠ a competência separa os meses — a mesma despesa recorrente volta a ser proposta', async () => {
    expect(await hashItemCusteio({ ...base, competencia: '2026-09' }))
      .not.toBe(await hashItemCusteio(base));
  });

  it('valor diferente é item diferente, inclusive por um centavo', async () => {
    expect(await hashItemCusteio({ ...base, valor: 3200.01 }))
      .not.toBe(await hashItemCusteio(base));
  });

  it('⚠ clientes distintos nunca colidem: a consulta é por hash', async () => {
    expect(await hashItemCusteio({ ...base, clienteId: '22222222-2222-2222-2222-222222222222' }))
      .not.toBe(await hashItemCusteio(base));
  });

  it('é um sha-256 em hexadecimal — 64 caracteres', async () => {
    expect(await hashItemCusteio(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
