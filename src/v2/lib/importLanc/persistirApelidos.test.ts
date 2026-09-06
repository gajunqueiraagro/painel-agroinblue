/**
 * O que este teste trava — a fronteira de ESCRITA entre as vias que compartilham a memória
 * de apelidos.
 *
 * ⚠ NASCE DE UM DEFEITO ARMADO, NÃO DE UMA HIPÓTESE. A unicidade de
 * `financeiro_subcentro_aliases` virou `(cliente_id, origem, lower(trim(alias_text)))` em
 * 20260906130318, e o custeio passou a gravar em `origem = 'custeio'`. O mapa de
 * repontamento do importador de Excel era cego à origem: no primeiro apelido que o custeio
 * gravasse com um texto repetido, o importador daria UPDATE na linha do OUTRO — e o
 * custeio continuaria sugerindo o destino que já não tinha mais.
 * ⚠ LER É DE TODOS, ESCREVER TEM DONO. A sugestão continua saindo da memória inteira; só o
 * repontamento se restringe.
 */
import { describe, it, expect } from 'vitest';
import { mapaDeRepontamento, ORIGEM_IMPORTACAO } from './persistirApelidos';
import { normalizar } from './importLancamentosView';

const CLI = '11111111-1111-1111-1111-111111111111';
const OUTRO_CLI = '22222222-2222-2222-2222-222222222222';

const linha = (over: Partial<{ id: string; cliente_id: string | null; alias_text: string; origem: string }>) => ({
  id: 'a1', cliente_id: CLI, alias_text: 'Combustíveis', origem: ORIGEM_IMPORTACAO, ...over,
});

describe('mapaDeRepontamento', () => {
  it('a linha do próprio importador entra', () => {
    const m = mapaDeRepontamento([linha({ id: 'imp' })], CLI);
    expect(m[normalizar('Combustíveis')]).toBe('imp');
  });

  it('⚠ o alias do CUSTEIO com o mesmo texto NÃO é tocado', () => {
    /* O caso que motivou o 121i. Sem a linha no mapa, `persistirSubcentro` cai no ramo do
       INSERT e cria a linha dele em `importacao` — dois espaços, que a unicidade nova
       permite. Com a linha no mapa, ele daria UPDATE na do custeio. */
    const m = mapaDeRepontamento([linha({ id: 'cus', origem: 'custeio' })], CLI);
    expect(m[normalizar('Combustíveis')]).toBeUndefined();
    expect(Object.keys(m)).toHaveLength(0);
  });

  it('seed e manual também são de outra pessoa', () => {
    const m = mapaDeRepontamento([
      linha({ id: 'seed', origem: 'seed' }),
      linha({ id: 'man', alias_text: 'Vacinas', origem: 'manual' }),
    ], CLI);
    expect(Object.keys(m)).toHaveLength(0);
  });

  it('⚠ origem desconhecida não se reponta: o default do banco é "manual", não "minha"', () => {
    expect(Object.keys(mapaDeRepontamento([linha({ origem: 'migracao' })], CLI))).toHaveLength(0);
  });

  it('quando as duas existem, só a de importacao entra', () => {
    const m = mapaDeRepontamento([
      linha({ id: 'cus', origem: 'custeio' }),
      linha({ id: 'imp', origem: ORIGEM_IMPORTACAO }),
    ], CLI);
    expect(m[normalizar('Combustíveis')]).toBe('imp');
  });

  it('alias de outro cliente fica de fora', () => {
    expect(Object.keys(mapaDeRepontamento([linha({ cliente_id: OUTRO_CLI })], CLI))).toHaveLength(0);
  });

  it('o alias global de importacao continua repontável, como antes', () => {
    /* Não é o assunto do 121i — o escopo global segue com o comportamento que já tinha, e
       hoje não há nenhuma linha global no banco. Se um dia houver, esta linha é a que vai
       lembrar que repontar um global alcança todos os clientes. */
    const m = mapaDeRepontamento([linha({ id: 'glob', cliente_id: null })], CLI);
    expect(m[normalizar('Combustíveis')]).toBe('glob');
  });

  it('acento e espaço não separam o mesmo texto', () => {
    const m = mapaDeRepontamento([linha({ alias_text: '  COMBUSTIVEIS  ' })], CLI);
    expect(m[normalizar('Combustíveis')]).toBe('a1');
  });
});
