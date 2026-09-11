/**
 * A CHAVE DO PLANO NO CATÁLOGO DO FRONT — PR-FIN-PLANO-CHAVE-02 (front).
 *
 * ⚠ ESTE TESTE EXISTE POR UM CASO QUE QUEBRARIA O SAVE, não por simetria. Desde o
 * PR-FIN-PLANO-CHAVE-02 o payload manda `plano_conta_id`, e `financeiro_lancamentos_v2.
 * plano_conta_id` é `uuid`. As entradas de DIVIDENDO não vêm de `financeiro_plano_contas`:
 * `buildDividendoEntries` as sintetiza a partir de `financeiro_dividendos` com o id
 * `dividendo-<uuid>` — que não é linha do plano nem uuid válido. Deixá-lo passar faria todo
 * lançamento de dividendo ser recusado pelo banco com `invalid input syntax for type uuid`.
 *
 * ⚠ E O TRIGGER JÁ SABE LIDAR COM A AUSÊNCIA: `resolve_classificacao_from_plano` isenta
 * `macro_custo = 'Dividendos'` do bloqueio de subcentro fora do plano, então dividendo sem
 * chave resolve pelo texto, como sempre resolveu.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  planoToClassificacoes, buildDividendoEntries, DIVIDENDO_ESCOPO, DIVIDENDO_MACRO,
  type PlanoContasItem, type Dividendo,
} from './planoContasBuilder';

const linhaDoPlano: PlanoContasItem = {
  id: '11111111-1111-1111-1111-111111111111',
  tipo_operacao: '2-Saídas',
  macro_custo: 'Custeio Produção',
  grupo_custo: 'Custo Fixo Administrativo',
  centro_custo: 'Administrativo',
  subcentro: 'Aluguel de Escritório',
  escopo_negocio: 'administrativo',
  ativo: true,
  ordem_exibicao: 21010,
  compoe_dre: true,
};

describe('a chave do plano chega ao catálogo do front', () => {
  it('linha do plano leva o id, que é o que o payload manda', () => {
    const [cls] = planoToClassificacoes([linhaDoPlano]);
    expect(cls.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('o resto da linha continua igual — a chave é aditiva', () => {
    const [cls] = planoToClassificacoes([linhaDoPlano]);
    expect(cls.subcentro).toBe('Aluguel de Escritório');
    expect(cls.grupo_custo).toBe('Custo Fixo Administrativo');
    expect(cls.escopo_negocio).toBe('administrativo');
    expect(cls.ordem_exibicao).toBe(21010);
    expect(cls.compoe_dre).toBe(true);
  });

  it('DIVIDENDO NÃO leva chave — o id sintético não é uuid nem linha do plano', () => {
    const dividendos: Dividendo[] = [
      { id: '22222222-2222-2222-2222-222222222222', cliente_id: 'cli', nome: 'Fulano', ativo: true, ordem_exibicao: 1 },
    ];
    const entradas = buildDividendoEntries(dividendos);
    /* A prova de que o perigo é real: o item do plano CARREGA um id, e ele não serve. */
    expect(entradas[0].id).toBe('dividendo-22222222-2222-2222-2222-222222222222');
    const [cls] = planoToClassificacoes(entradas);
    expect(cls.id).toBeUndefined();
    expect(cls.subcentro).toContain('Fulano');
  });

  it('plano e dividendo juntos: só o do plano tem chave', () => {
    const dividendos: Dividendo[] = [
      { id: '33333333-3333-3333-3333-333333333333', cliente_id: 'cli', nome: 'Beltrana', ativo: true, ordem_exibicao: 1 },
    ];
    const entradas = buildDividendoEntries(dividendos);
    const cls = planoToClassificacoes([linhaDoPlano, ...entradas]);
    expect(cls.map(c => c.id)).toEqual(['11111111-1111-1111-1111-111111111111', undefined]);
  });
});

/**
 * O ESCOPO DO DIVIDENDO — FIN-DIVIDENDO-ESCOPO-01.
 *
 * ⚠ ESTE BLOCO EXISTE PORQUE A CONSTANTE JÁ ESTEVE ERRADA, e o erro era invisível: dizia
 * `'pecuaria'`, e nenhum teste, gate ou compilador tinha como discordar. Quem notou foi o
 * operador, abrindo um lançamento de dividendo e vendo o card Pecuária marcado sobre um
 * lançamento que o banco inteiro classifica como administrativo.
 * ⚠ O FRONT NÃO LÊ O PLANO PARA DIVIDENDO: `loadPlanoContasCompleto` exclui o macro
 * 'Dividendos' do `select` e repõe as entradas sintetizadas por cliente. Então a única
 * guarda possível é esta — prender a constante ao valor que o plano usa.
 */
describe('dividendo é administrativo, não pecuária', () => {
  const dividendos: Dividendo[] = [
    { id: '44444444-4444-4444-4444-444444444444', cliente_id: 'cli', nome: 'Despesas Pessoais', ativo: true, ordem_exibicao: 1 },
  ];

  it('a constante do escopo é administrativo', () => {
    /* As 23 linhas de macro 'Dividendos' do plano do proto são administrativo, sem exceção. */
    expect(DIVIDENDO_ESCOPO).toBe('administrativo');
  });

  it('a entrada sintetizada nasce administrativa', () => {
    const [e] = buildDividendoEntries(dividendos);
    expect(e.escopo_negocio).toBe('administrativo');
    expect(e.macro_custo).toBe(DIVIDENDO_MACRO);
  });

  it('e chega assim ao catálogo que o modal lê — é o que marca o card e desliga a safra', () => {
    const [cls] = planoToClassificacoes(buildDividendoEntries(dividendos));
    expect(cls.escopo_negocio).toBe('administrativo');
  });
});
