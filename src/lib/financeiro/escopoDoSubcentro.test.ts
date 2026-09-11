/**
 * O ESCOPO DO SUBCENTRO, PARA AS DUAS TELAS — MESA-SAFRA-ADM-01.
 *
 * ⚠ A REGRA ERA UM `useMemo` DENTRO DO MODAL, e por isso a Mesa de Enriquecimento mostrava
 * "Safra 25/26 Amendoim" num lançamento cuja conta é "Viagens e Deslocamentos Administrativo".
 * Estes testes existem porque a regra agora é de sistema, não de tela — e porque, na Mesa, o
 * dropdown ainda deixava clicar e nada mudava: o `update_proposto` gravava e o trigger do
 * banco zerava depois, então a tela parecia quebrada num gesto que o sistema já cumpria.
 */
import { describe, it, expect } from 'vitest';
import {
  escopoDoSubcentro, ehSubcentroAdministrativo, ehLinhaAdministrativa, ESCOPO_ADMINISTRATIVO,
  AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI,
} from './escopoDoSubcentro';

const PLANO = [
  { subcentro: 'Viagens e Deslocamentos Administrativo', escopo_negocio: 'administrativo' },
  { subcentro: 'Aluguel de Escritório', escopo_negocio: 'administrativo' },
  { subcentro: 'Combustível Veículos Administrativo', escopo_negocio: 'administrativo' },
  { subcentro: 'Dividendos Despesas Pessoais', escopo_negocio: 'administrativo' },
  { subcentro: 'Fertilizantes', escopo_negocio: 'agricultura' },
  { subcentro: 'Entrada de Financiamento Agricultura', escopo_negocio: 'agricultura' },
  { subcentro: 'Suplementação Mineral', escopo_negocio: 'pecuaria' },
  { subcentro: 'Subcentro Sem Escopo', escopo_negocio: null },
];

describe('o plano manda, não o gravado', () => {
  it('resolve o escopo pelo subcentro', () => {
    expect(escopoDoSubcentro(PLANO, 'Fertilizantes')).toBe('agricultura');
    expect(escopoDoSubcentro(PLANO, 'Suplementação Mineral')).toBe('pecuaria');
  });

  it('⚠ o escopo GRAVADO na linha não vence o do plano', () => {
    /* Foi o caso de 11/09/2026: quatro subcentros de financiamento deixaram de ser
       administrativos, e as linhas antigas ainda diziam "administrativo" na coluna. */
    expect(escopoDoSubcentro(PLANO, 'Entrada de Financiamento Agricultura', 'administrativo'))
      .toBe('agricultura');
  });

  it('o gravado só vale para subcentro que não existe no plano', () => {
    expect(escopoDoSubcentro(PLANO, 'Distribuição de Dividendos Fulano', 'administrativo'))
      .toBe('administrativo');
    expect(escopoDoSubcentro(PLANO, 'Subcentro Que Nunca Existiu')).toBe('');
  });

  it('espaços e caixa não impedem o encontro', () => {
    expect(escopoDoSubcentro(PLANO, '  fertilizantes  ')).toBe('agricultura');
  });

  it('linha do plano sem escopo cai no fallback, não em texto vazio por engano', () => {
    expect(escopoDoSubcentro(PLANO, 'Subcentro Sem Escopo', 'pecuaria')).toBe('pecuaria');
  });
});

describe('quais contas desligam a safra', () => {
  it.each([
    'Viagens e Deslocamentos Administrativo',
    'Aluguel de Escritório',
    'Combustível Veículos Administrativo',
    'Dividendos Despesas Pessoais',
  ])('%s é administrativa', (sub) => {
    expect(ehSubcentroAdministrativo(PLANO, sub)).toBe(true);
  });

  it('o dividendo conta — ele é administrativo desde FIN-DIVIDENDO-ESCOPO-01', () => {
    expect(ehSubcentroAdministrativo(PLANO, 'Dividendos Despesas Pessoais')).toBe(true);
  });

  it.each(['Fertilizantes', 'Suplementação Mineral', 'Entrada de Financiamento Agricultura'])(
    '%s NÃO é — a safra continua editável', (sub) => {
      expect(ehSubcentroAdministrativo(PLANO, sub)).toBe(false);
    });

  it('sem subcentro escolhido, não é administrativo — não se desliga o que ninguém escolheu', () => {
    expect(ehSubcentroAdministrativo(PLANO, null)).toBe(false);
    expect(ehSubcentroAdministrativo(PLANO, '')).toBe(false);
  });

  it('sem catálogo carregado, não trava o campo', () => {
    /* Lista vazia é lista válida — a lição do modal que abria sem fornecedor. Travar a safra
       porque o plano ainda não chegou seria inventar uma regra a partir de uma ausência. */
    expect(ehSubcentroAdministrativo([], 'Aluguel de Escritório')).toBe(false);
    expect(ehSubcentroAdministrativo(null, 'Aluguel de Escritório')).toBe(false);
  });
});

describe('as frases', () => {
  it('são duas porque são dois fatos', () => {
    expect(AVISO_ADMIN_SEM_SAFRA).toBe('administrativo não tem safra');
    expect(AVISO_ADMIN_SAFRA_SAI).toContain('será removida ao salvar');
    expect(ESCOPO_ADMINISTRATIVO).toBe('administrativo');
  });
});

describe('a segunda porta: o dividendo fora do plano', () => {
  it('⚠ 359 lançamentos usam 10 subcentros de dividendo que não existem no plano', () => {
    /* Medido no proto em 11/09/2026. Pela primeira porta o escopo daria "" e a safra ficaria
       editável numa linha que o trigger zera do mesmo jeito. */
    expect(ehSubcentroAdministrativo(PLANO, 'Distribuição Sócio Fulano')).toBe(false);
    expect(ehLinhaAdministrativa(PLANO, 'Distribuição Sócio Fulano', 'Dividendos')).toBe(true);
  });

  it('a porta do plano continua valendo sozinha, com qualquer macro', () => {
    expect(ehLinhaAdministrativa(PLANO, 'Aluguel de Escritório', 'Custo Fixo')).toBe(true);
    expect(ehLinhaAdministrativa(PLANO, 'Aluguel de Escritório', null)).toBe(true);
  });

  it('macro que não é dividendo não abre porta nenhuma', () => {
    expect(ehLinhaAdministrativa(PLANO, 'Fertilizantes', 'Custo Variável')).toBe(false);
    expect(ehLinhaAdministrativa(PLANO, null, null)).toBe(false);
  });
});
