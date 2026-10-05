import { describe, it, expect } from 'vitest';
import { calcularConta, ehConta, contaOk, FRASE_DA_CONTA, TETO_DA_CONTA } from './contaNoCampo';

/** FIN-VALOR-CALC-01a — a lib da conta no campo de valor. Só o resultado é guardado; aqui se prova que ele está certo. */
const vale = (texto: string) => { const r = calcularConta(texto); return contaOk(r) ? r.valor : `RECUSA:${r.motivo}`; };
const recusa = (texto: string) => { const r = calcularConta(texto); return contaOk(r) ? `VALE:${r.valor}` : r.motivo; };

describe('calcularConta — a tabela de casos', () => {
  it.each([
    ['16.238,00/2', 8119],
    ['16238/2', 8119],
    ['1.345,50*50%', 672.75],
    ['(1.345,50+220)/3', 521.83],
    ['100/3', 33.33],
    ['0,1+0,2', 0.3],
    ['1.000-10%', 900],
    ['1.000+10%', 1100],
    ['2x3', 6],
    ['2X3', 6],
    ['2×3', 6],
    ['10÷4', 2.5],
    ['=5*5', 25],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['10−4', 6],
    ['16.238,00', 16238],
    ['1.000', 1000],
    ['0,5*4', 2],
    ['200/50%', 400],
    ['50%*200', 100],
    ['100+50%*200', 200],
    ['100+10%+10%', 121],
    ['(100+100)%', 2],
    ['10%', 0.1],
    ['2/3', 0.67],
    ['0,005+0', 0.01],
    ['1,005*1', 1.01],
    ['5-5', 0],
    ['8.119,00*2', 16238],
  ])('%s = %s', (conta, esperado) => {
    expect(vale(conta)).toBe(esperado);
  });

  it('espaços são ignorados, em qualquer lugar', () => {
    expect(vale('  16.238,00 / 2 ')).toBe(8119);
    expect(vale('= ( 1.345,50 + 220 ) / 3')).toBe(521.83);
    expect(vale('=1345,50*50%')).toBe(672.75);
  });

  it.each([
    ['5/0', 'divisao_por_zero'],
    ['5/(2-2)', 'divisao_por_zero'],
    ['5/0%', 'divisao_por_zero'],
    ['5-10', 'negativa'],
    ['5+', 'invalida'],
    ['((2)', 'invalida'],
    ['abc', 'invalida'],
    ['2+a', 'invalida'],
    ['2 3', 'invalida'],
    ['2)', 'invalida'],
    ['()', 'invalida'],
    ['*2', 'invalida'],
    ['-5', 'invalida'],
    ['2++3', 'invalida'],
    ['2%%', 'invalida'],
    [',', 'invalida'],
    ['', 'vazia'],
    ['   ', 'vazia'],
    ['=', 'vazia'],
    ['999.999.999,99+0,01', 'grande_demais'],
    ['1.000.000*1.000.000', 'grande_demais'],
  ])('%s → %s', (conta, motivo) => {
    expect(recusa(conta)).toBe(motivo);
  });

  it('no teto vale; um centavo acima, não', () => {
    expect(vale('999.999.999,99')).toBe(TETO_DA_CONTA);
    expect(vale('999.999.999,98+0,01')).toBe(TETO_DA_CONTA);
  });

  it('incompleta (o texto acabou no meio) é diferente de inválida', () => {
    const r = (t: string) => { const x = calcularConta(t); return contaOk(x) ? null : x.incompleta; };
    expect(r('16.238,00/')).toBe(true);
    expect(r('5+')).toBe(true);
    expect(r('(2+3')).toBe(true);
    expect(r('((2)')).toBe(true);
    expect(r('2*(')).toBe(true);
    expect(r('abc')).toBe(false);
    expect(r('2)')).toBe(false);
    expect(r('5/0')).toBe(false);
    expect(r('')).toBe(false);
  });

  it('nunca devolve Infinity nem NaN — varredura', () => {
    const contas = ['5/0', '0/0', '1/3*3', '0,1+0,2', '1e5', '9'.repeat(30), '1/0,00', '(1)/(0)', '%', '1%%', '0*5/0'];
    for (const c of contas) {
      const x = calcularConta(c);
      if (contaOk(x)) { expect(Number.isFinite(x.valor)).toBe(true); expect(x.valor).toBeGreaterThanOrEqual(0); }
    }
    expect(vale('1/3*3')).toBe(1);
  });

  it('o resultado tem sempre no máximo duas casas', () => {
    for (const c of ['100/3', '2/3', '1.345,50*33,333%', '10/7', '0,015*3']) {
      const x = calcularConta(c);
      expect(contaOk(x)).toBe(true);
      if (contaOk(x)) expect(Math.round(x.valor * 100) / 100).toBe(x.valor);
    }
  });

  it('cada motivo tem a frase da tela', () => {
    expect(FRASE_DA_CONTA.invalida).toBe('conta inválida');
    expect(FRASE_DA_CONTA.divisao_por_zero).toBe('divisão por zero');
    expect(Object.keys(FRASE_DA_CONTA).sort()).toEqual(['divisao_por_zero', 'grande_demais', 'invalida', 'negativa', 'vazia']);
  });
});

describe('ehConta — o que tira o campo da máscara de centavos', () => {
  it.each([
    ['16.238,00', false],
    ['16238', false],
    ['', false],
    ['R$ 16.238,00', false],
    /* "-5" não é conta: não há operando antes do sinal. É número com sinal, que o campo de valor não aceita. */
    ['-5', false],
    ['−5', false],
    ['16.238,00/', true],
    ['16.238,00/2', true],
    ['16238/2', true],
    ['5-3', true],
    ['5 − 3', true],
    ['2x3', true],
    ['50%', true],
    ['(2', true],
    ['=5', true],
    ['  =5*5', true],
    ['10÷4', true],
    ['2×3', true],
  ])('%s → %s', (texto, esperado) => {
    expect(ehConta(texto)).toBe(esperado);
  });
});
