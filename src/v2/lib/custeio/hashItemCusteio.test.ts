/**
 * O que este teste trava — a identidade de um item de custeio entre um mês e o seguinte.
 *
 * ⚠ O ESTADO ERA UM `Set<number>` EM MEMÓRIA, por número de linha do TXT. Fechar a aba
 * perdia tudo, e o Raul recomeçava do zero; e o número da linha nem serve como identidade,
 * porque muda quando o relatório é reimpresso com uma família a mais.
 */
import { describe, it, expect } from 'vitest';
import { hashItemCusteio, hashesDoCusteio } from './hashItemCusteio';

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

/**
 * CUSTEIO-HASH-01 — dois itens iguais no mesmo arquivo são dois itens.
 * ⚠ NASCE DE LANÇAMENTO EM DOBRO: a mesma descrição com o mesmo valor, duas vezes na competência, dava UM hash; com o
 * hash gravado, lançar um marcaria os dois como lançados.
 */
describe('hashesDoCusteio — a ocorrência entre itens de conteúdo idêntico', () => {
  const ITENS = [
    { linha_num: 10, valor: 971.09, produto_raw: 'ENCARGO FICTICIO - FAZENDA' },
    { linha_num: 11, valor: 500, produto_raw: 'OUTRO ITEM' },
    { linha_num: 12, valor: 971.09, produto_raw: 'encargo  ficticio - fazenda ' },
    { linha_num: 13, valor: 971.09, produto_raw: 'ENCARGO FICTICIO - FAZENDA' },
  ];
  const puro = (i: number, ocorrencia?: number) => hashItemCusteio({
    clienteId: CLI, competencia: '2026-09', valor: ITENS[i].valor, descricao: ITENS[i].produto_raw, ocorrencia,
  });

  it('dois itens iguais têm hashes DIFERENTES, e cada linha do arquivo tem o seu', async () => {
    const m = await hashesDoCusteio(ITENS, CLI, '2026-09');
    expect(m.size).toBe(4);
    expect(m.get(10)).not.toBe(m.get(12));
    expect(m.get(12)).not.toBe(m.get(13));
    expect(new Set(m.values()).size).toBe(4);
    // ⚠ A BUSCA SABE ACHAR: sem a ocorrência, os três são o MESMO hash.
    expect(await puro(0)).toBe(await puro(2));
    expect(await puro(0)).toBe(await puro(3));
  });

  it('a 1ª ocorrência é o hash de sempre (o que já foi gravado continua valendo), e o item único também', async () => {
    const m = await hashesDoCusteio(ITENS, CLI, '2026-09');
    expect(m.get(10)).toBe(await puro(0));
    expect(m.get(11)).toBe(await puro(1));
    expect(await puro(0, 1)).toBe(await puro(0));
  });

  it('a 2ª leva |2 e a 3ª leva |3, na ordem do arquivo', async () => {
    const m = await hashesDoCusteio(ITENS, CLI, '2026-09');
    expect(m.get(12)).toBe(await puro(2, 2));
    expect(m.get(13)).toBe(await puro(3, 3));
    expect(await puro(3, 3)).not.toBe(await puro(3, 2));
    // a ordem do arquivo decide quem é a primeira
    const invertido = await hashesDoCusteio([ITENS[3], ITENS[0]], CLI, '2026-09');
    expect(invertido.get(13)).toBe(await puro(3));
    expect(invertido.get(10)).toBe(await puro(0, 2));
  });
});
