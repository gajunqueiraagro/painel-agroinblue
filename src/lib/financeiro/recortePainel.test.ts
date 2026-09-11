/**
 * O RECORTE DO PAINEL POR PERÍODO — FIN-PAINEL-SAFRA-01.
 *
 * ⚠ O QUE ESTES TESTES GUARDAM é a fronteira entre os três modos, não a aritmética: safra
 * recorta por vínculo e ignora datas; ano e datas recortam por janela e escolhem o eixo. Foi
 * medindo que se descobriu que safra NÃO é janela — `financeiro_safras` não tem data nenhuma.
 */
import { describe, it, expect } from 'vitest';
import {
  RECORTE_PADRAO, janelaDoAno, janelaDasDatas, janelaDoRecorte, recorteCompleto,
  impedimentoDoRecorte, descreverPeriodo, descreverEixo, rotuloEscopo,
  type RecortePainel,
} from './recortePainel';

const base = (p: Partial<RecortePainel> = {}): RecortePainel => ({ ...RECORTE_PADRAO, ...p });

describe('o padrão do painel', () => {
  it('nasce em todas as contas, todas as atividades e só realizados', () => {
    /* ⚠ `realizado` NÃO É CAUTELA, É O NÚMERO DO FECHAMENTO: na safra 25/26 Amendoim do NJ os
       35 `programado` somam R$ 9,74 mi contra R$ 1,88 mi dos 392 `realizado`. */
    expect(RECORTE_PADRAO.contaId).toBeNull();
    expect(RECORTE_PADRAO.escopo).toBeNull();
    expect(RECORTE_PADRAO.status).toBe('realizado');
  });
});

describe('safra recorta por vínculo, não por data', () => {
  it('não tem janela — a safra é o recorte', () => {
    expect(janelaDoRecorte(base({ modo: 'safra', safraId: 's1' }))).toBeNull();
  });

  it('sem safra escolhida, o recorte não está completo e diz por quê', () => {
    const r = base({ modo: 'safra', safraId: null });
    expect(recorteCompleto(r)).toBe(false);
    expect(impedimentoDoRecorte(r)).toBe('Escolha a safra — ela é o recorte.');
  });

  it('o eixo de data não é descrito no modo safra', () => {
    expect(descreverEixo(base({ modo: 'safra', safraId: 's1', eixo: 'competencia' }))).toBe('');
  });

  it('a frase do período é o nome da safra', () => {
    expect(descreverPeriodo(base({ modo: 'safra', safraId: 's1' }), 'Safra 25/26 Amendoim'))
      .toBe('Safra 25/26 Amendoim');
  });
});

describe('ano e datas viram janela [de, ate)', () => {
  it('o ano vai de 1º de janeiro a 1º de janeiro do seguinte', () => {
    expect(janelaDoAno(2026)).toEqual({ de: '2026-01-01', ate: '2027-01-01' });
  });

  it('o fim digitado é INCLUSIVO na tela e exclusivo na consulta', () => {
    /* Quem digita 31/12 espera o dia 31 dentro. Sem o +1 o último dia sumiria, calado. */
    expect(janelaDasDatas('2026-01-01', '2026-12-31')).toEqual({ de: '2026-01-01', ate: '2027-01-01' });
  });

  it('a virada de mês também soma um dia', () => {
    expect(janelaDasDatas('2026-02-01', '2026-02-28')?.ate).toBe('2026-03-01');
  });

  it('data final antes da inicial é impedimento, não janela vazia', () => {
    const r = base({ modo: 'datas', de: '2026-05-01', ate: '2026-04-01' });
    expect(impedimentoDoRecorte(r)).toBe('A data final não pode ser antes da inicial.');
  });

  it('meia data não completa o recorte', () => {
    expect(recorteCompleto(base({ modo: 'datas', de: '2026-01-01', ate: null }))).toBe(false);
    expect(janelaDasDatas('2026-01-01', null)).toBeNull();
  });
});

describe('as frases que viajam até o drawer', () => {
  it('um mês inteiro vira o mês, não o intervalo', () => {
    expect(descreverPeriodo(base({ modo: 'datas', de: '2026-08-01', ate: '2026-08-31' }))).toBe('ago/26');
  });

  it('intervalo entre meses mostra as duas datas', () => {
    expect(descreverPeriodo(base({ modo: 'datas', de: '2026-08-01', ate: '2026-09-15' })))
      .toBe('01/08/2026 a 15/09/2026');
  });

  it('o rótulo da atividade é o do card — "Lavoura", nunca o identificador', () => {
    expect(rotuloEscopo('agricultura')).toBe('Lavoura');
    expect(rotuloEscopo('silvicultura')).toBe('Silvicultura');
    expect(rotuloEscopo(null)).toBe('Todas');
  });

  it('os dois eixos têm frase própria fora do modo safra', () => {
    expect(descreverEixo(base({ modo: 'ano', ano: 2026, eixo: 'competencia' }))).toBe('por competência');
    expect(descreverEixo(base({ modo: 'ano', ano: 2026, eixo: 'financeira' }))).toBe('por data financeira');
  });
});
