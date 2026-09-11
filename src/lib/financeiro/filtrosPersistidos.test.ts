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
