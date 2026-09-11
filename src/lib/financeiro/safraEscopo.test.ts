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

  it('plano sem escopo serve a qualquer safra', () => {
    expect(conflitoSafraEscopo(null, 'pecuaria')).toBeNull();
    expect(conflitoSafraEscopo('', 'pecuaria')).toBeNull();
  });

  it('espaços em volta não inventam divergência', () => {
    expect(conflitoSafraEscopo(' agricultura ', 'agricultura')).toBeNull();
  });
});

describe('administrativo não recebe safra', () => {
  /* ⚠ A REGRA VIROU — PR-FIN-SAFRA-ADM-01. Este bloco substitui um teste que afirmava o
     CONTRÁRIO ("administrativo aceita qualquer safra"), e o par fica registrado de
     propósito: quem reabrir o arquivo tem de ver que a mudança foi de decisão, não de
     descuido. Justamente por servir a todas as atividades, a despesa administrativa não
     pertence a nenhuma; o rateio é conta do resultado por atividade. */
  it('recusa administrativo com safra de pecuária', () => {
    expect(conflitoSafraEscopo('administrativo', 'pecuaria'))
      .toEqual({ escopoPlano: 'administrativo', escopoSafra: 'pecuaria' });
  });

  it('recusa administrativo com safra de lavoura', () => {
    expect(conflitoSafraEscopo('administrativo', 'agricultura'))
      .toEqual({ escopoPlano: 'administrativo', escopoSafra: 'agricultura' });
  });

  it('administrativo SEM safra passa — é o estado que a tela força', () => {
    expect(conflitoSafraEscopo('administrativo', null)).toBeNull();
    expect(conflitoSafraEscopo('administrativo', '')).toBeNull();
  });

  it('a frase manda esvaziar, não "trocar um dos dois"', () => {
    /* ⚠ Não existe safra de escopo administrativo no cadastro (medido: 19 de pecuária, 4 de
       lavoura, zero administrativas). Mandar "trocar" poria o operador a procurar uma
       opção que a lista não tem. */
    const msg = mensagemConflitoSafraEscopo({ escopoPlano: 'administrativo', escopoSafra: 'pecuaria' });
    expect(msg).toBe('Lançamento administrativo não recebe safra — deixe a safra vazia.');
    expect(msg).not.toContain('Troque');
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
