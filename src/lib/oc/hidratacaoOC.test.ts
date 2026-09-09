import { describe, it, expect } from 'vitest';
import { decidirHidratacao, vaiHidratar } from './hidratacaoOC';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('decidirHidratacao', () => {
  it('primeira abertura da montagem hidrata', () => {
    expect(decidirHidratacao(false, null, A)).toBe('hidratar');
  });

  /**
   * O DEFEITO QUE ESTE PR CONSERTA — PR-OC-LISTA-03.
   *
   * Com o booleano antigo, a segunda abertura na mesma montagem da aba caía num `return`
   * mudo: sem toast, sem modal, com os `oc_*` presos na URL. Agora ela hidrata, e o
   * `reabrir` existe para a tela poder dizer que está reabrindo.
   */
  it('SEGUNDA operação na mesma montagem reabre — nunca morre calada', () => {
    expect(decidirHidratacao(false, A, B)).toBe('reabrir');
    expect(vaiHidratar(decidirHidratacao(false, A, B))).toBe(true);
  });

  it('a MESMA operação já aberta não hidrata de novo, e nada tem a dizer', () => {
    expect(decidirHidratacao(false, A, A)).toBe('ja_aberta');
    expect(vaiHidratar(decidirHidratacao(false, A, A))).toBe(false);
  });

  /* A proteção ORIGINAL continua de pé: duas leituras concorrentes escreveriam o mesmo
     estado, e é contra isso que o guard nasceu. */
  it('em voo desiste, mesmo pedindo outra operação', () => {
    expect(decidirHidratacao(true, null, A)).toBe('em_voo');
    expect(decidirHidratacao(true, A, B)).toBe('em_voo');
    expect(vaiHidratar(decidirHidratacao(true, A, B))).toBe(false);
  });

  it('depois de limpar (params apagados), a MESMA operação volta a hidratar', () => {
    /* Fechar o modal e o "editar título" apagam os `oc_*`; o efeito que observa o
       `ocIdParam` zera o id hidratado — e clicar de novo na mesma OC tem de abrir. */
    expect(decidirHidratacao(false, null, A)).toBe('hidratar');
  });
});
