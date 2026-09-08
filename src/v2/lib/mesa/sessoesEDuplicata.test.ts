/**
 * Os dois adapters puros do 133h: a peneira de sessões (item 2) e o candidato a
 * duplicata que libera o "Cancelar como duplicado" (item 5).
 *
 * ⚠ ESTE TESTE EXISTE PORQUE OS DOIS DECIDEM O QUE APARECE. Um esconde importações, o
 * outro esconde um botão que apaga dinheiro do mês — e ambos são fáceis de "consertar"
 * errado num PR futuro, porque a tela continua parecendo certa nos dois casos.
 */
import { describe, it, expect } from 'vitest';
import {
  sessoesDoMes, temCandidatoDuplicata, contaEfetivaId, contaEfetivaNome, contasDoLancamento,
  diferencasDoResultado,
} from './enriquecimentoView';
import type { EnriqSessaoVM } from '@/v2/components/mesa/enriquecimento/types';

const sessao = (id: string, anoMes: string | null, criadaEm: string): EnriqSessaoVM => ({
  id, label: id, exatos: 0, ambiguos: 0, aplicados: 0, anoMes, criadaEm, total: 10,
});

describe('sessoesDoMes', () => {
  const todas = [
    sessao('a', '2026-08', '2026-09-01T10:00:00Z'),
    sessao('b', '2026-07', '2026-09-05T10:00:00Z'),
    sessao('c', '2026-08', '2026-09-08T07:00:00Z'),
    sessao('d', null, '2026-09-09T07:00:00Z'),
  ];

  it('fica só no mês da régua', () => {
    expect(sessoesDoMes(todas, '2026-08').map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('mais recente primeiro', () => {
    const r = sessoesDoMes(todas, '2026-08');
    expect(r[0].criadaEm > r[1].criadaEm).toBe(true);
  });

  it('sem régua devolve tudo, ainda ordenado', () => {
    expect(sessoesDoMes(todas, null).map((s) => s.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('mês sem sessão devolve vazio — e não cai no mês errado', () => {
    expect(sessoesDoMes(todas, '2026-05')).toEqual([]);
  });

  it('não muta a lista recebida', () => {
    const antes = todas.map((s) => s.id);
    sessoesDoMes(todas, null);
    expect(todas.map((s) => s.id)).toEqual(antes);
  });
});

describe('temCandidatoDuplicata', () => {
  const l = (id: string, valor: number | null, data: string | null, conta: string | null) =>
    ({ lanc_id: id, valor, data_pagamento: data, conta_nome: conta });

  it('acha o par de mesmo valor e conta dentro de 5 dias', () => {
    const lista = [l('1', 165.88, '2026-08-10', 'Itau BBA'), l('2', 165.88, '2026-08-13', 'Itau BBA')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(true);
  });

  it('não se acha a si mesmo', () => {
    const lista = [l('1', 165.88, '2026-08-10', 'Itau BBA')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(false);
  });

  it('conta diferente não é duplicata', () => {
    const lista = [l('1', 165.88, '2026-08-10', 'Itau BBA'), l('2', 165.88, '2026-08-10', 'Banco do Brasil')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(false);
  });

  it('fora da janela de 5 dias não é duplicata', () => {
    const lista = [l('1', 100, '2026-08-01', 'X'), l('2', 100, '2026-08-07', 'X')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(false);
  });

  it('exatamente 5 dias ainda conta', () => {
    const lista = [l('1', 100, '2026-08-01', 'X'), l('2', 100, '2026-08-06', 'X')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(true);
  });

  it('valor diferente por um centavo não é duplicata', () => {
    const lista = [l('1', 165.88, '2026-08-10', 'X'), l('2', 165.89, '2026-08-10', 'X')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(false);
  });

  it('centavos comparados em inteiro — 0.1+0.2 não escapa', () => {
    const lista = [l('1', 0.1 + 0.2, '2026-08-10', 'X'), l('2', 0.3, '2026-08-10', 'X')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(true);
  });

  it('sem valor ou sem data não oferece o botão', () => {
    const lista = [l('1', null, '2026-08-10', 'X'), l('2', null, '2026-08-10', 'X')];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(false);
    const lista2 = [l('1', 100, null, 'X'), l('2', 100, null, 'X')];
    expect(temCandidatoDuplicata(lista2[0], lista2)).toBe(false);
  });

  it('duas contas nulas casam entre si (ausência é ausência dos dois lados)', () => {
    const lista = [l('1', 50, '2026-08-10', null), l('2', 50, '2026-08-11', null)];
    expect(temCandidatoDuplicata(lista[0], lista)).toBe(true);
  });
});

/**
 * A conta efetiva — 133h item 7. Os números do `describe` são os medidos no Proto, e é o
 * que torna este teste uma trava e não uma decoração: se alguém voltar a ler só
 * `conta_bancaria_id`, 426 entradas do Raul voltam a mostrar "—".
 */
describe('contaEfetivaId / contaEfetivaNome / contasDoLancamento', () => {
  it('entrada lê o DESTINO — o caso das 426 linhas', () => {
    expect(contaEfetivaId('1-Entradas', null, 'itau')).toBe('itau');
    expect(contaEfetivaNome('1-Entradas', null, 'Itau BBA')).toBe('Itau BBA');
  });

  it('entrada com as duas pontas ainda prefere o destino', () => {
    expect(contaEfetivaId('1-Entradas', 'bb', 'itau')).toBe('itau');
  });

  it('saída lê a conta bancária', () => {
    expect(contaEfetivaId('2-Saídas', 'bb', null)).toBe('bb');
    expect(contaEfetivaNome('2-Saídas', 'Banco do Brasil', null)).toBe('Banco do Brasil');
  });

  it('transferência devolve as duas pontas', () => {
    expect(contasDoLancamento('3-Transferências', 'bb', 'itau')).toEqual(['bb', 'itau']);
  });

  it('nos demais tipos, uma ponta só', () => {
    expect(contasDoLancamento('2-Saídas', 'bb', 'itau')).toEqual(['bb']);
    expect(contasDoLancamento('1-Entradas', 'bb', 'itau')).toEqual(['itau']);
  });

  it('sem conta nenhuma devolve null, nunca o texto da planilha', () => {
    expect(contaEfetivaId('1-Entradas', null, null)).toBeNull();
    expect(contaEfetivaNome('2-Saídas', null, null)).toBeNull();
    expect(contasDoLancamento('1-Entradas', null, null)).toEqual([]);
  });

  it('tipo desconhecido cai no ELSE, como o CASE do banco', () => {
    expect(contaEfetivaId(null, 'bb', 'itau')).toBe('bb');
    expect(contaEfetivaId('9-Outro', 'bb', 'itau')).toBe('bb');
  });
});

/**
 * As diferenças do Resultado — 133h item 10. O caso do envelope (safra 25/26 -> 26/27) é o
 * primeiro teste: era exatamente ele que `will_change_anything` não via.
 */
describe('diferencasDoResultado', () => {
  const base = {
    subcentro: null, favorecidoId: null, fazendaId: null, produto: null,
    tipoOperacao: null, macro: null, descricaoAtual: null,
    numeroDocumento: null, numeroDocumentoAtual: null, fazendaIdAtual: null,
    safraId: null, contaBancariaId: null, dataCompetencia: null, dataVencimento: null,
    dataPagamento: null, observacao: null,
    safraIdAtual: null, subcentroAtual: null, favorecidoIdAtual: null,
    contaBancariaIdAtual: null, dataCompetenciaAtual: null, dataVencimentoAtual: null,
    dataPagamentoAtual: null, observacaoAtual: null,
  };

  it('safra 25/26 -> 26/27 É diferença (o caso que a view não via)', () => {
    expect(diferencasDoResultado({ ...base, safraId: '26-27', safraIdAtual: '25-26' }))
      .toEqual(['safra']);
  });

  it('nada proposto = nada difere', () => {
    expect(diferencasDoResultado(base)).toEqual([]);
  });

  it('proposta igual ao atual não difere', () => {
    expect(diferencasDoResultado({ ...base, safraId: 'x', safraIdAtual: 'x' })).toEqual([]);
  });

  it('proposta vazia sobre atual preenchido NÃO é diferença (o gravador é COALESCE)', () => {
    expect(diferencasDoResultado({ ...base, safraId: null, safraIdAtual: 'x' })).toEqual([]);
    expect(diferencasDoResultado({ ...base, observacao: '', observacaoAtual: 'algo' })).toEqual([]);
  });

  it('preencher campo vazio do lançamento é diferença', () => {
    expect(diferencasDoResultado({ ...base, subcentro: 'Salários', subcentroAtual: null }))
      .toEqual(['conta do plano']);
  });

  it('acumula e devolve os rótulos do operador', () => {
    expect(diferencasDoResultado({
      ...base,
      subcentro: 'A', subcentroAtual: 'B',
      contaBancariaId: 'itau', contaBancariaIdAtual: 'bb',
      dataPagamento: '2026-08-12', dataPagamentoAtual: '2026-08-10',
    })).toEqual(['conta do plano', 'conta bancária', 'data de pagamento']);
  });
});
