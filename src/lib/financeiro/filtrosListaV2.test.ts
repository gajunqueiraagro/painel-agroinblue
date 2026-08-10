/**
 * PR-FIN-LISTA-VENCIMENTO-03 — átomos dos filtros da lista.
 *
 * Aqui ficam só as peças isoladas. A equivalência servidor × cliente (E1..E6)
 * é provada em `listaPaginadaV2.test.ts`, contra um PostgREST simulado.
 */
import { describe, it, expect } from 'vitest';
import {
  escaparRegex,
  citarValorOr,
  ramoImatch,
  padraoProduto,
  normalizarAtividade,
  ehTransferencia,
  ramoContaDirecao,
  escopoCanonicoAtividade,
  ramoAtividadeOutros,
  filtrarListaV2NoCliente,
  ESCOPOS_CANONICOS,
  TIPOS_TRANSFERENCIA,
  type LinhaFiltravel,
} from './filtrosListaV2';

describe('escaparRegex — todo metacaractere vira literal', () => {
  it.each([
    ['*', '\\*'], ['.', '\\.'], ['+', '\\+'], ['?', '\\?'],
    ['(', '\\('], [')', '\\)'], ['[', '\\['], [']', '\\]'],
    ['{', '\\{'], ['}', '\\}'], ['|', '\\|'], ['^', '\\^'], ['$', '\\$'],
    ['\\', '\\\\'],
  ])('%s', (entrada, esperado) => {
    expect(escaparRegex(entrada)).toBe(esperado);
  });

  it('% e _ NÃO são metacaracteres de regex: passam intactos', () => {
    // Era o oposto no LIKE, e é justamente por isso que trocamos de operador.
    expect(escaparRegex('a%b_c')).toBe('a%b_c');
  });

  it('vírgula e aspas passam intactas pelo escape de regex', () => {
    expect(escaparRegex('v,w')).toBe('v,w');
    expect(escaparRegex('as"pas')).toBe('as"pas');
  });
});

describe('citarValorOr — sobrevive ao parser do or()', () => {
  it('envolve em aspas', () => {
    expect(citarValorOr('abc')).toBe('"abc"');
  });

  it('escapa aspas e barra invertida', () => {
    expect(citarValorOr('a"b')).toBe('"a\\"b"');
    expect(citarValorOr('a\\b')).toBe('"a\\\\b"');
  });

  it('vírgula e parêntese ficam protegidos pelas aspas', () => {
    expect(citarValorOr('v,w')).toBe('"v,w"');
    expect(citarValorOr('p(q)')).toBe('"p(q)"');
  });
});

describe('ramoImatch — a composição das duas camadas', () => {
  it('asterisco sai com DUAS barras: o or() consome uma', () => {
    // Medido contra o PostgREST real: `\\*` chega ao regex como `\*`, literal.
    // Com uma barra só, o or() a consome e o `*` volta a ser quantificador.
    expect(ramoImatch('descricao', '1*2')).toBe('descricao.imatch."1\\\\*2"');
  });

  it('barra invertida digitada vira quatro', () => {
    expect(ramoImatch('descricao', 'a\\b')).toBe('descricao.imatch."a\\\\\\\\b"');
  });

  it('parêntese é escapado como regex e protegido pelas aspas', () => {
    expect(ramoImatch('numero_documento', 'p(q)')).toBe('numero_documento.imatch."p\\\\(q\\\\)"');
  });

  it('termo vazio ou só espaços não gera ramo', () => {
    expect(ramoImatch('descricao', undefined)).toBeNull();
    expect(ramoImatch('descricao', '')).toBeNull();
    expect(ramoImatch('descricao', '   ')).toBeNull();
    expect(ramoImatch('descricao', null)).toBeNull();
  });

  it('apara espaços das pontas', () => {
    expect(ramoImatch('descricao', '  boi  ')).toBe('descricao.imatch."boi"');
  });
});

describe('padraoProduto delega para ramoImatch sobre descricao', () => {
  it('mesmo ramo', () => {
    expect(padraoProduto('milho')).toBe(ramoImatch('descricao', 'milho'));
  });
  it('nulo para vazio', () => {
    expect(padraoProduto('')).toBeNull();
    expect(padraoProduto('   ')).toBeNull();
  });
});

describe('normalizarAtividade', () => {
  it.each([
    ['pecuaria', 'pecuaria'], ['pecuária', 'pecuaria'], ['  PECUARIA ', 'pecuaria'],
    ['agricultura', 'agricultura'], ['agri', 'agricultura'],
    ['administrativo', 'administrativo'],
    ['financeiro', 'outros'], ['', 'outros'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarAtividade(entrada)).toBe(esperado);
  });

  it('null e undefined viram outros', () => {
    expect(normalizarAtividade(null)).toBe('outros');
    expect(normalizarAtividade(undefined)).toBe('outros');
  });
});

describe('escopoCanonicoAtividade e ramoAtividadeOutros são complementares', () => {
  it('canônica gera escopo e não gera ramo', () => {
    for (const a of ESCOPOS_CANONICOS) {
      expect(escopoCanonicoAtividade(a)).toBe(a);
      expect(ramoAtividadeOutros(a)).toBeNull();
    }
  });

  it('outros gera ramo e não gera escopo', () => {
    expect(escopoCanonicoAtividade('outros')).toBeNull();
    expect(ramoAtividadeOutros('outros'))
      .toBe('escopo_negocio.is.null,escopo_negocio.not.in.(pecuaria,agricultura,administrativo)');
  });

  it('ausência não gera nenhum dos dois', () => {
    expect(escopoCanonicoAtividade(undefined)).toBeNull();
    expect(ramoAtividadeOutros(undefined)).toBeNull();
  });

  it('valor não canônico é tratado como outros', () => {
    expect(escopoCanonicoAtividade('financeiro')).toBeNull();
    expect(ramoAtividadeOutros('financeiro')).not.toBeNull();
  });
});

describe('ehTransferencia aceita a variante legada de importação', () => {
  it.each([...TIPOS_TRANSFERENCIA])('%s', (t) => {
    expect(ehTransferencia(t)).toBe(true);
  });
  it('apara espaços', () => {
    expect(ehTransferencia('  3-Transferências  ')).toBe(true);
  });
  it('recusa o resto', () => {
    expect(ehTransferencia('2-Saídas')).toBe(false);
    expect(ehTransferencia(null)).toBe(false);
  });
});

describe('ramoContaDirecao', () => {
  it('origem = saídas mais transferências', () => {
    expect(ramoContaDirecao('origem'))
      .toBe('sinal.lt.0,tipo_operacao.in.("3-Transferências","3-Transferência")');
  });
  it('destino = entradas mais transferências', () => {
    expect(ramoContaDirecao('destino'))
      .toBe('sinal.gt.0,tipo_operacao.in.("3-Transferências","3-Transferência")');
  });
  it('sem direção, sem ramo', () => {
    expect(ramoContaDirecao(undefined)).toBeNull();
  });
});

describe('filtrarListaV2NoCliente — a cadeia em memória', () => {
  const linhas: (LinhaFiltravel & { id: string })[] = [
    { id: 'a', sinal: '-1', tipo_operacao: '2-Saídas',         descricao: 'Ração bovina', favorecido_id: 'f1', grupo_custo: 'Nutricao', escopo_negocio: 'pecuaria' },
    { id: 'b', sinal: '1',  tipo_operacao: '1-Entradas',       descricao: 'Venda de boi', favorecido_id: 'f2', grupo_custo: 'Receita',  escopo_negocio: 'pecuaria' },
    { id: 'c', sinal: '1',  tipo_operacao: '3-Transferências', descricao: 'Transf',       favorecido_id: null, grupo_custo: null,       escopo_negocio: null },
    { id: 'd', sinal: '0',  tipo_operacao: '2-Saídas',         descricao: 'Zerado',       favorecido_id: null, grupo_custo: null,       escopo_negocio: 'financeiro' },
  ];
  const ids = (ls: { id: string }[]) => ls.map((l) => l.id);

  it('sinal em TEXT é coagido como o JS faz', () => {
    // A coluna é text no schema; sem a coerção, '-1' < 0 seria falso.
    expect(ids(filtrarListaV2NoCliente(linhas, { lista_conta_direcao: 'origem' }))).toEqual(['a', 'c']);
    expect(ids(filtrarListaV2NoCliente(linhas, { lista_conta_direcao: 'destino' }))).toEqual(['b', 'c']);
  });

  it('sinal zero não é entrada nem saída', () => {
    const so0 = linhas.filter((l) => l.id === 'd');
    expect(filtrarListaV2NoCliente(so0, { lista_conta_direcao: 'origem' })).toEqual([]);
    expect(filtrarListaV2NoCliente(so0, { lista_conta_direcao: 'destino' })).toEqual([]);
  });

  it('produto é substring, case-insensitive', () => {
    expect(ids(filtrarListaV2NoCliente(linhas, { lista_produto: 'RAÇÃO' }))).toEqual(['a']);
  });

  it('atividade outros pega NULL e não canônico', () => {
    expect(ids(filtrarListaV2NoCliente(linhas, { lista_atividade: 'outros' }))).toEqual(['c', 'd']);
  });

  it('sem filtro, devolve tudo', () => {
    expect(filtrarListaV2NoCliente(linhas, {})).toHaveLength(4);
  });

  it('filtros combinam por E, não por OU', () => {
    expect(ids(filtrarListaV2NoCliente(linhas, {
      lista_produto: 'ração', lista_grupo_custo: 'Receita',
    }))).toEqual([]);
  });
});
