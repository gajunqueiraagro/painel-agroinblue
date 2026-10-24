/**
 * ⚠ O TESTE QUE IMPORTA É O DO PADRÃO: guardar um campo que está em "Todos" faria a tela
 * restaurar um estado que ninguém escolheu — e travaria qualquer mudança futura de default
 * para quem já tem sessão aberta. "Sem filtro" é ausência, não valor.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  apenasAtivos, vazio, guardarFiltros, lerFiltros, esquecerFiltros, CHAVE_FILTROS_LISTA, chaveDoCliente,
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
    guardarFiltros('cli-a', { fornecedor: 'f1', meses: ['08', '09'] });
    expect(lerFiltros('cli-a')).toEqual({ fornecedor: 'f1', meses: ['08', '09'] });
  });

  it('guardar nada APAGA o que havia — é o "Limpar"', () => {
    guardarFiltros('cli-a', { fornecedor: 'f1' });
    guardarFiltros('cli-a', {});
    expect(sessionStorage.getItem(chaveDoCliente(CHAVE_FILTROS_LISTA, 'cli-a'))).toBeNull();
    expect(lerFiltros('cli-a')).toBeNull();
  });

  it('lixo no storage devolve null em vez de estourar', () => {
    sessionStorage.setItem(chaveDoCliente(CHAVE_FILTROS_LISTA, 'cli-a'), '{isto não é json');
    expect(lerFiltros('cli-a')).toBeNull();
    sessionStorage.setItem(chaveDoCliente(CHAVE_FILTROS_LISTA, 'cli-a'), '["lista"]');
    expect(lerFiltros('cli-a')).toBeNull();
  });

  it('esquecer apaga', () => {
    guardarFiltros('cli-a', { fornecedor: 'f1' });
    esquecerFiltros('cli-a');
    expect(lerFiltros('cli-a')).toBeNull();
  });
});

/** P94 — A MEMÓRIA É DO CLIENTE: o que se guardou no A nunca volta no B (o caso do Agnaldo × NJ). */
describe('P94 — memória por cliente', () => {
  it('gravada no cliente A, lida no cliente B: nada', () => {
    guardarFiltros('cli-a', { fornecedorFiltro: 'forn-do-a', fazendaId: 'faz-do-a' });
    expect(lerFiltros('cli-b')).toBeNull();
    expect(lerFiltros('cli-a')).toEqual({ fornecedorFiltro: 'forn-do-a', fazendaId: 'faz-do-a' });
    esquecerFiltros('cli-b');
    expect(lerFiltros('cli-a')).not.toBeNull();   // esquecer o B não apaga o A
  });
  it('a chave de antes (sem cliente) nunca é aplicada, e sai na leitura', () => {
    sessionStorage.setItem(CHAVE_FILTROS_LISTA, JSON.stringify({ fornecedorFiltro: 'de-quem' }));
    expect(lerFiltros('cli-b')).toBeNull();
    expect(sessionStorage.getItem(CHAVE_FILTROS_LISTA)).toBeNull();
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
    guardarFiltros('cli-a', ativos);
    expect(lerFiltros('cli-a')).toEqual({ safraFiltro: '__sem_safra__' });
  });
});
