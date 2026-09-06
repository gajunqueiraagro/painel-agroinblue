/**
 * O que este teste trava — a fronteira entre a memória que o custeio LÊ e a que ele GRAVA.
 *
 * ⚠ A UNICIDADE MUDOU NO 121b: de `(cliente_id, alias_text)` para `(cliente_id, origem,
 * alias_text)`. A partir dali o MESMO texto pode existir em duas origens, e quem lê
 * precisa de uma regra de precedência — sem ela, a resposta passa a depender da ordem em
 * que o banco devolveu as linhas.
 */
import { describe, it, expect } from 'vitest';
import {
  escolherAlias,
  sugerirAliasDoItem,
  sugerirFornecedor,
  aliasDoCusteio,
  type AliasSubcentro,
} from './memoriaCusteio';

const CLI = '11111111-1111-1111-1111-111111111111';
const alias = (over: Partial<AliasSubcentro>): AliasSubcentro => ({
  id: 'a1', cliente_id: CLI, alias_text: 'Combustíveis', plano_conta_id: 'p1', origem: 'importacao',
  ...over,
});

describe('escolherAlias — precedência de leitura', () => {
  it('o espaço do custeio vence o do importador para o mesmo texto', () => {
    const r = escolherAlias([
      alias({ id: 'imp', origem: 'importacao', plano_conta_id: 'p-excel' }),
      alias({ id: 'cus', origem: 'custeio', plano_conta_id: 'p-custeio' }),
    ], 'combustiveis');
    expect(r?.id).toBe('cus');
  });

  it('sem nada do custeio, o que o importador aprendeu responde', () => {
    expect(escolherAlias([alias({ id: 'imp' })], 'COMBUSTÍVEIS')?.id).toBe('imp');
  });

  it('⚠ o apelido do cliente vence o global, mesmo com origem "mais alta"', () => {
    /* Um `seed` de fábrica global não pode sobrepor o que o cliente ensinou: o escopo
       desempata antes da origem. */
    const r = escolherAlias([
      alias({ id: 'global', cliente_id: null, origem: 'custeio' }),
      alias({ id: 'docliente', cliente_id: CLI, origem: 'seed' }),
    ], 'Combustíveis');
    expect(r?.id).toBe('docliente');
  });

  it('acento e espaço não separam o mesmo apelido', () => {
    expect(escolherAlias([alias({ alias_text: '  COMBUSTIVEIS  ' })], 'Combustíveis')?.id).toBe('a1');
  });

  it('⚠ origem desconhecida não responde sozinha', () => {
    /* Memória gravada por uma via que este código não conhece: chutar o destino de um
       lançamento é pior que não sugerir nada. */
    expect(escolherAlias([alias({ origem: 'via_nova' })], 'Combustíveis')).toBeNull();
  });

  it('texto sem apelido devolve null, e é resposta legítima', () => {
    expect(escolherAlias([alias({})], 'Vacinas')).toBeNull();
    expect(escolherAlias([], 'Combustíveis')).toBeNull();
    expect(escolherAlias([alias({})], '')).toBeNull();
  });
});

describe('sugerirAliasDoItem — a descrição é mais específica que o Sub-Fam', () => {
  const item = { produto_raw: 'Óleo Diesel S10', subfamilia_raw: 'Combustíveis' };

  it('⚠ quem ensinou a descrição vence quem ensinou o grupo', () => {
    const r = sugerirAliasDoItem([
      alias({ id: 'grupo', alias_text: 'Combustíveis' }),
      alias({ id: 'desc', alias_text: 'Óleo Diesel S10', plano_conta_id: 'p-diesel' }),
    ], item);
    expect(r?.alias.id).toBe('desc');
    expect(r?.por).toBe('descricao');
  });

  it('sem memória da descrição, o Sub-Fam responde pelo grupo inteiro', () => {
    const r = sugerirAliasDoItem([alias({ id: 'grupo' })], item);
    expect(r?.alias.id).toBe('grupo');
    expect(r?.por).toBe('subfamilia');
  });

  it('sem memória nenhuma não há sugestão — a linha mostra traço', () => {
    expect(sugerirAliasDoItem([], item)).toBeNull();
  });
});

describe('sugerirFornecedor', () => {
  const forn = (id: string, nome: string, aliases: string[]) => ({ id, nome, aliases });

  it('apelido único resolve o fornecedor', () => {
    expect(sugerirFornecedor([forn('f1', 'Posto Ipiranga', ['ÓLEO DIESEL S10'])], 'Óleo Diesel S10')?.id)
      .toBe('f1');
  });

  it('⚠ dois donos do mesmo apelido não escolhem: ambiguidade fica vazia', () => {
    const r = sugerirFornecedor([
      forn('f1', 'Posto A', ['Óleo Diesel']),
      forn('f2', 'Posto B', ['OLEO DIESEL']),
    ], 'óleo diesel');
    expect(r).toBeNull();
  });

  it('fornecedor sem aliases não atrapalha', () => {
    expect(sugerirFornecedor([{ id: 'f1', nome: 'Posto', aliases: null }], 'Óleo Diesel')).toBeNull();
  });
});

describe('aliasDoCusteio — o que o custeio pode alterar', () => {
  it('encontra a linha da própria origem', () => {
    expect(aliasDoCusteio([alias({ id: 'cus', origem: 'custeio' })], 'Combustíveis')?.id).toBe('cus');
  });

  it('⚠ NÃO devolve a linha de outra origem, mesmo com o texto igual', () => {
    /* Repontar o alias do importador é reescrever a memória de outra via — e ela não fica
       sabendo. O chamador precisa inserir no seu próprio espaço, que a unicidade por
       origem permite. */
    expect(aliasDoCusteio([alias({ id: 'imp', origem: 'importacao' })], 'Combustíveis')).toBeNull();
  });
});
