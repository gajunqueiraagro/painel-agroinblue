/**
 * ⚠ O RÓTULO E O VALOR SÃO COISAS DIFERENTES, e este arquivo existe principalmente para
 * prender isso: o operador diz "Lavoura", o banco diz `agricultura`. Trocar o identificador
 * para casar com a fala custaria uma migration e quebraria tudo que já grava.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ATIVIDADES, esquecerAtividade, lembrarAtividade, ultimaAtividade } from './ultimaAtividade';

beforeEach(() => esquecerAtividade());

describe('rótulo × valor', () => {
  it('"Lavoura" é o texto de `agricultura`', () => {
    const lavoura = ATIVIDADES.find((a) => a.rotulo === 'Lavoura');
    expect(lavoura?.valor).toBe('agricultura');
  });

  it('os quatro valores são os do escopo_negocio do plano', () => {
    expect(ATIVIDADES.map((a) => a.valor))
      .toEqual(['pecuaria', 'agricultura', 'silvicultura', 'administrativo']);
  });
});

describe('a última da sessão', () => {
  it('no primeiro uso não há nenhuma — e aí a lista é a completa', () => {
    expect(ultimaAtividade()).toBeNull();
  });

  it('guarda a escolhida', () => {
    lembrarAtividade('agricultura');
    expect(ultimaAtividade()).toBe('agricultura');
  });

  it('NÃO guarda o que o card não oferece', () => {
    /* ⚠ O plano tem escopo vazio e valores legados. Guardá-los faria o modal abrir filtrando
       por um escopo sem pílula: lista vazia e nada marcado para explicar por quê. */
    lembrarAtividade('agricultura');
    lembrarAtividade('');
    lembrarAtividade('outros');
    lembrarAtividade(null);
    expect(ultimaAtividade()).toBe('agricultura');
  });

  it('desmarcar limpa — o próximo lançamento abre sem filtro', () => {
    lembrarAtividade('pecuaria');
    lembrarAtividade(null);
    expect(ultimaAtividade()).toBe('pecuaria');
    esquecerAtividade();
    expect(ultimaAtividade()).toBeNull();
  });
});
