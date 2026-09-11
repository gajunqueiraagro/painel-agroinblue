/**
 * ⚠ O TESTE QUE IMPORTA É O DO PADRÃO: guardar um campo que está em "Todos" faria a tela
 * restaurar um estado que ninguém escolheu — e travaria qualquer mudança futura de default
 * para quem já tem sessão aberta. "Sem filtro" é ausência, não valor.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  apenasAtivos, vazio, guardarFiltros, lerFiltros, esquecerFiltros, CHAVE_FILTROS_LISTA,
} from './filtrosPersistidos';

const PADROES = { fornecedor: '__all__', macro: '__all__', produto: '', meses: [] as string[] };

beforeEach(() => sessionStorage.clear());

describe('só o ativo é lembrado', () => {
  it('campo no padrão não entra', () => {
    expect(apenasAtivos({ ...PADROES }, PADROES)).toEqual({});
  });

  it('campo escolhido entra, e só ele', () => {
    expect(apenasAtivos({ ...PADROES, fornecedor: 'f1' }, PADROES)).toEqual({ fornecedor: 'f1' });
  });

  it('texto vazio é ausência, não escolha', () => {
    expect(apenasAtivos({ ...PADROES, produto: '' }, PADROES)).toEqual({});
    expect(apenasAtivos({ ...PADROES, produto: 'ureia' }, PADROES)).toEqual({ produto: 'ureia' });
  });

  it('lista vazia é ausência; lista com itens é escolha', () => {
    expect(apenasAtivos({ ...PADROES, meses: [] }, PADROES)).toEqual({});
    expect(apenasAtivos({ ...PADROES, meses: ['08'] }, PADROES)).toEqual({ meses: ['08'] });
  });

  it('vazio() reconhece o nada', () => {
    expect(vazio({})).toBe(true);
    expect(vazio({ fornecedor: 'f1' })).toBe(false);
  });
});

describe('a ida e a volta do storage', () => {
  it('guarda o que está ativo e lê de volta igual', () => {
    guardarFiltros({ fornecedor: 'f1', meses: ['08', '09'] });
    expect(lerFiltros()).toEqual({ fornecedor: 'f1', meses: ['08', '09'] });
  });

  it('guardar nada APAGA o que havia — é o "Limpar"', () => {
    guardarFiltros({ fornecedor: 'f1' });
    guardarFiltros({});
    expect(sessionStorage.getItem(CHAVE_FILTROS_LISTA)).toBeNull();
    expect(lerFiltros()).toBeNull();
  });

  it('lixo no storage devolve null em vez de estourar', () => {
    sessionStorage.setItem(CHAVE_FILTROS_LISTA, '{isto não é json');
    expect(lerFiltros()).toBeNull();
    sessionStorage.setItem(CHAVE_FILTROS_LISTA, '["lista"]');
    expect(lerFiltros()).toBeNull();
  });

  it('esquecer apaga', () => {
    guardarFiltros({ fornecedor: 'f1' });
    esquecerFiltros();
    expect(lerFiltros()).toBeNull();
  });
});

/**
 * A SAFRA NA PERSISTÊNCIA — FIN-LISTA-FILTROS-01b.
 *
 * ⚠ "Sem safra" É UM FILTRO ATIVO, e é o caso que quase se perde: ele não é o padrão nem é
 * vazio — é uma escolha, e das mais úteis (acha financiamento e administrativo carimbados
 * com safra, que é o que os dois PRs de financiamento de hoje corrigiram no dado). Se a
 * persistência o tratasse como ausência, sair da tela e voltar desfaria a busca.
 */
describe('o filtro de safra persiste como qualquer outro', () => {
  const PADRAO = { safraFiltro: '__all__' };

  it('"Todas" é o padrão e não é guardado', () => {
    expect(apenasAtivos({ safraFiltro: '__all__' }, PADRAO)).toEqual({});
  });

  it('uma safra escolhida é guardada', () => {
    expect(apenasAtivos({ safraFiltro: 'abc-123' }, PADRAO)).toEqual({ safraFiltro: 'abc-123' });
  });

  it('"Sem safra" é escolha, não ausência — e sobrevive à ida e volta', () => {
    const ativos = apenasAtivos({ safraFiltro: '__sem_safra__' }, PADRAO);
    expect(ativos).toEqual({ safraFiltro: '__sem_safra__' });
    guardarFiltros(ativos);
    expect(lerFiltros()).toEqual({ safraFiltro: '__sem_safra__' });
  });
});
