/** PARC-CONTRATO-01 item 2 — o que vai para a prévia do banco e como ela é lida. Nenhuma contagem é feita na tela. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OPCOES_DO_CONTRATO, camposAPropagar, fraseDoNomeProprio, lancamentosDoEscopo, lerPreviaDaPropagacao, type ComumDasParcelas,
} from './propagarContrato';

const BASE = { descricao: 'Lascas Eucalipto Tratado', credor_id: 'cr-1', conta_bancaria_id: 'ct-1', fazenda_id: 'fz-1', plano_conta_id: 'pl-1' };
const COMUM: ComumDasParcelas = {
  forma_pagamento: { tipo: 'igual', valor: 'Boleto' }, safra_id: { tipo: 'igual', valor: 'sf-1' },
  cultura: { tipo: 'igual', valor: '' }, fase: { tipo: 'varia' },
};

describe('camposAPropagar', () => {
  it('sem mexer em nada vai SÓ a descrição (é ela que alcança o contrato renomeado antes sem propagar)', () => {
    expect(camposAPropagar(BASE, BASE, {}, COMUM)).toEqual({ descricao: 'Lascas Eucalipto Tratado' });
  });
  it('campo do contrato só entra quando mudou; vazio vira nulo', () => {
    expect(camposAPropagar(BASE, { ...BASE, descricao: ' Novo nome ', credor_id: 'cr-2', conta_bancaria_id: '' }, {}, COMUM))
      .toEqual({ descricao: 'Novo nome', credor_id: 'cr-2', conta_bancaria_id: null });
  });
  it('campo das parcelas: não mexido fica fora; igual ao que TODAS têm fica fora; diferente entra; quando elas variam, entra', () => {
    expect(camposAPropagar(BASE, BASE, { forma_pagamento: 'Boleto', safra_id: 'sf-2', cultura: null, fase: 'cria' }, COMUM))
      .toEqual({ descricao: 'Lascas Eucalipto Tratado', safra_id: 'sf-2', fase: 'cria' });
    /* limpar (escolher "Nenhuma") um campo que todas têm preenchido manda nulo */
    expect(camposAPropagar(BASE, BASE, { forma_pagamento: null }, COMUM)).toEqual({ descricao: 'Lascas Eucalipto Tratado', forma_pagamento: null });
  });
  it('data e valor não têm como entrar: não são chave de `camposAPropagar` (a fonte prende)', () => {
    const fonte = readFileSync(resolve(__dirname, './propagarContrato.ts'), 'utf8');
    const tipo = fonte.slice(fonte.indexOf('export type CampoPropagavel'), fonte.indexOf('export type CamposAPropagar'));
    expect(tipo).toContain("'descricao'");
    expect(/valor|data_|vencimento/.test(tipo)).toBe(false);
  });
});

const PREVIA = {
  ok: true, parcelas: { nao_pagas: 3, pagas: 1 }, nome_proprio: { nao_pagas: 1, pagas: 2 },
  campos: [
    { campo: 'descricao', de: 'LASCAS VELHO', para: 'Lascas Novo', nao_pagas: 2, pagas: 1, nas_pagas: true },
    { campo: 'forma_pagamento', de: 'Boleto', para: null, nao_pagas: 3, pagas: 0, nas_pagas: false },
  ],
  alteradas: { futuros: 3, todos: 4 }, gravadas: 0,
};

describe('a prévia do banco', () => {
  it('lê como veio', () => {
    expect(lerPreviaDaPropagacao(PREVIA)).toEqual({
      parcelas: { naoPagas: 3, pagas: 1 }, nomeProprio: { naoPagas: 1, pagas: 2 },
      campos: [
        { campo: 'descricao', de: 'LASCAS VELHO', para: 'Lascas Novo', naoPagas: 2, pagas: 1, nasPagas: true },
        { campo: 'forma_pagamento', de: 'Boleto', para: null, naoPagas: 3, pagas: 0, nasPagas: false },
      ],
      alteradas: { futuros: 3, todos: 4 }, gravadas: 0,
    });
  });
  it('peça torta = nulo INTEIRO (campo desconhecido, contagem que não é número, raiz que não é objeto)', () => {
    expect(lerPreviaDaPropagacao('novo-id')).toBeNull();
    expect(lerPreviaDaPropagacao({ ...PREVIA, alteradas: { futuros: 3 } })).toBeNull();
    expect(lerPreviaDaPropagacao({ ...PREVIA, campos: [{ ...PREVIA.campos[0], campo: 'valor' }] })).toBeNull();
    expect(lerPreviaDaPropagacao({ ...PREVIA, campos: [{ ...PREVIA.campos[0], nao_pagas: '2' }] })).toBeNull();
  });
  it('o número do escopo é o do banco; o nome próprio é dito sem somar; as três opções são as da casa', () => {
    const p = lerPreviaDaPropagacao(PREVIA)!;
    expect([lancamentosDoEscopo(p, 'futuros'), lancamentosDoEscopo(p, 'todos'), lancamentosDoEscopo(p, 'nenhum')]).toEqual([3, 4, 0]);
    expect(fraseDoNomeProprio(p, 'futuros')).toBe('Com nome próprio, ficam como estão: 1 não paga.');
    expect(fraseDoNomeProprio(p, 'todos')).toBe('Com nome próprio, ficam como estão: 1 não paga e 2 pagas.');
    expect(fraseDoNomeProprio(p, 'nenhum')).toBeNull();
    expect(fraseDoNomeProprio({ ...p, nomeProprio: { naoPagas: 0, pagas: 0 } }, 'todos')).toBeNull();
    expect(OPCOES_DO_CONTRATO.map((o) => o.rotulo)).toEqual(['Só os futuros', 'Futuros e passados', 'Não propagar']);
  });
  it('o leitor e as frases não somam nem subtraem (a fonte prende; o detector acha o caso conhecido)', () => {
    const conta = (t: string) => /\.reduce\(|\+=|naoPagas \+ |pagas \+ /.test(t);
    expect(conta('const n = p.nomeProprio.naoPagas + p.nomeProprio.pagas;')).toBe(true);
    expect(conta(readFileSync(resolve(__dirname, './propagarContrato.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).toBe(false);
  });
});
