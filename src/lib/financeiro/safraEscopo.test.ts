import { describe, it, expect } from 'vitest';
import { conflitoSafraEscopo, mensagemConflitoSafraEscopo, rotuloAtividade } from './safraEscopo';

describe('quando safra e subcentro discordam', () => {
  it('acusa lavoura com safra de pecuária', () => {
    expect(conflitoSafraEscopo('agricultura', 'pecuaria'))
      .toEqual({ escopoPlano: 'agricultura', escopoSafra: 'pecuaria' });
  });

  it('mesma atividade passa', () => {
    expect(conflitoSafraEscopo('agricultura', 'agricultura')).toBeNull();
  });
});

describe('o que nunca é conflito', () => {
  it('safra vazia — safra não é obrigatória, e coerência não vira obrigatoriedade', () => {
    expect(conflitoSafraEscopo('agricultura', null)).toBeNull();
    expect(conflitoSafraEscopo('agricultura', '')).toBeNull();
  });

  it('administrativo aceita qualquer safra', () => {
    /* ⚠ Rateio, energia e escritório servem a todas as atividades. Recusar aqui obrigaria a
       criar uma conta administrativa por atividade — o oposto do que o plano faz. */
    expect(conflitoSafraEscopo('administrativo', 'pecuaria')).toBeNull();
    expect(conflitoSafraEscopo('administrativo', 'agricultura')).toBeNull();
  });

  it('plano sem escopo serve a qualquer safra', () => {
    expect(conflitoSafraEscopo(null, 'pecuaria')).toBeNull();
    expect(conflitoSafraEscopo('', 'pecuaria')).toBeNull();
  });

  it('espaços em volta não inventam divergência', () => {
    expect(conflitoSafraEscopo(' agricultura ', 'agricultura')).toBeNull();
  });
});

describe('a frase que o operador lê', () => {
  it('usa os rótulos do card, nunca o identificador', () => {
    /* ⚠ O operador diz "Lavoura"; `agricultura` é o nome da coluna. Vazar o identificador
       numa mensagem de erro faz ele procurar uma atividade que a tela não oferece. */
    const msg = mensagemConflitoSafraEscopo({ escopoPlano: 'agricultura', escopoSafra: 'pecuaria' });
    expect(msg).toBe('Subcentro de Lavoura com safra de Pecuária. Troque um dos dois.');
    expect(msg).not.toContain('agricultura');
  });

  it('escopo desconhecido não vira "undefined" na tela', () => {
    expect(rotuloAtividade('vaidosa')).toBe('vaidosa');
    expect(rotuloAtividade(null)).toBe('—');
  });
});
