/**
 * A REGRA QUE EVITA A CONSULTA QUE NINGUÉM PEDE — FIN-LISTA-PERF-01.
 *
 * ⚠ OS NÚMEROS QUE A JUSTIFICAM (NJ, proto, 11/09/2026): sem recorte são 30.065 lançamentos em
 * 31 requisições EM SÉRIE; um ano são 4.146 em cinco. Não é filtro lento, é ausência de filtro
 * — e o operador cai nela ao LIMPAR o Ano para procurar outra coisa, não por querer a base.
 * ⚠ E A LISTA DE LIMITANTES TEM UM CRITÉRIO, não um gosto: só entra o que vai ao `WHERE` do
 * servidor E corta para centenas. Quem entrar aqui sem ir ao servidor transforma a defesa no
 * seu contrário — "Documento 123 + Todos os anos" leria 30 mil para mostrar uma linha.
 */
import { describe, it, expect } from 'vitest';
import { temFiltroLimitante, FRASE_SEM_FILTRO, TODOS, SEM_SAFRA, SEM_CULTURA, type FiltrosDaTela } from './filtroLimitante';

const vazio: FiltrosDaTela = {
  anos: [], meses: [], safra: TODOS, cultura: TODOS, fornecedor: TODOS, produto: '',
  contaOrigem: TODOS, contaDestino: TODOS, centro: TODOS, subcentro: TODOS,
};
const com = (p: Partial<FiltrosDaTela>): FiltrosDaTela => ({ ...vazio, ...p });

describe('nada escolhido não consulta', () => {
  it('tudo em Todos é o caso que trava a tela', () => {
    expect(temFiltroLimitante(vazio)).toBe(false);
  });

  it('texto em branco não é filtro', () => {
    expect(temFiltroLimitante(com({ produto: '   ' }))).toBe(false);
  });
});

describe('o que limita', () => {
  it.each([
    ['um ano', { anos: ['2026'] }],
    ['dois anos', { anos: ['2025', '2026'] }],
    ['um mês em qualquer ano', { meses: ['08'] }],
    ['uma safra', { safra: 'sf-1' }],
    ['uma cultura', { cultura: 'mandioca' }],
    ['um fornecedor', { fornecedor: 'forn-1' }],
    ['um produto', { produto: 'ureia' }],
    ['conta de origem', { contaOrigem: 'cb-1' }],
    ['conta de destino', { contaDestino: 'cb-2' }],
    ['um centro', { centro: 'Insumos' }],
    ['um subcentro', { subcentro: 'Fertilizantes' }],
  ])('%s basta', (_rotulo, p) => {
    expect(temFiltroLimitante(com(p))).toBe(true);
  });

  it('⚠ "Sem cultura" NÃO limita — é a base inteira, e não vai ao servidor', () => {
    /* Mesma regra de "Sem safra": a coluna nasceu no AGRI-04A e quase toda linha é nula.
       Deixá-la contar como limitante seria a permissão para puxar as 30 mil. */
    expect(temFiltroLimitante(com({ cultura: SEM_CULTURA }))).toBe(false);
  });

  it('a cultura sozinha basta — é a pergunta da auditoria por lavoura', () => {
    expect(temFiltroLimitante(com({ cultura: 'amendoim', anos: [] }))).toBe(true);
  });

  it('a safra sozinha basta — ela atravessa dois anos civis de propósito', () => {
    /* ⚠ Exigir um ano junto da safra seria pedir ao produtor que desfizesse a pergunta:
       "23/24" é jul/2023 a jun/2024, e nenhum ano civil a contém. */
    expect(temFiltroLimitante(com({ safra: 'sf-23-24', anos: [] }))).toBe(true);
  });

  it('o fornecedor sozinho basta — é o caso "tudo que paguei ao Wilson"', () => {
    expect(temFiltroLimitante(com({ fornecedor: 'wilson', anos: [] }))).toBe(true);
  });
});

describe('o que NÃO limita, e por quê', () => {
  it('"Sem safra" não limita: é a maioria da base', () => {
    expect(temFiltroLimitante(com({ safra: SEM_SAFRA }))).toBe(false);
  });

  it('documento não está na regra — ele não vai ao servidor', () => {
    /* Se um dia for, entra aqui NO MESMO PR. Contá-lo antes disso faria
       "Documento + Todos os anos" puxar as 30 mil para mostrar uma. */
    const comDoc = { ...vazio } as FiltrosDaTela & { documento?: string };
    comDoc.documento = '12345';
    expect(temFiltroLimitante(comDoc)).toBe(false);
  });

  it('atividade e tipo não estão na regra — cortam pouco demais', () => {
    /* Medido: administrativo são 15.869 de 30 mil; `2-Saídas` são a maioria. Ativos e
       inúteis como defesa — e a regra é sobre o TAMANHO da leitura, não sobre haver filtro. */
    const comAtividade = { ...vazio } as FiltrosDaTela & { atividade?: string; tipo?: string };
    comAtividade.atividade = 'administrativo';
    comAtividade.tipo = '2-Saídas';
    expect(temFiltroLimitante(comAtividade)).toBe(false);
  });
});

describe('a frase', () => {
  it('pede exatamente os quatro caminhos mais usados', () => {
    expect(FRASE_SEM_FILTRO)
      .toBe('Escolha um período, uma safra, um fornecedor ou uma conta para ver os lançamentos.');
  });
});
