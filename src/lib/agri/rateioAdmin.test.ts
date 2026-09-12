/**
 * A chave de rateio do administrativo — AGRI-RATEIO-TELA-01.
 *
 * ⚠ O QUE ESTES TESTES GUARDAM é o invariante que o banco NÃO guarda: o CHECK de
 * `agri_rateio_admin` limita cada linha a 0–100, mas as três linhas são independentes lá —
 * nada no banco impede 72 + 25 + 40. A soma é regra desta camada.
 */
import { describe, it, expect } from 'vitest';
import {
  ATIVIDADES_RATEIO, RATEIO_VAZIO, percentualDe, somaPercentuais, validarRateio, anosDoRateio,
  type RateioForm,
} from './rateioAdmin';

const form = (p: string, a: string, s: string): RateioForm =>
  ({ pecuaria: p, agricultura: a, silvicultura: s });

describe('a leitura do percentual', () => {
  it('vírgula decimal é o que se digita em português', () => {
    expect(percentualDe('72,5')).toBe(72.5);
  });

  it('vazio é zero — campo em branco não trava a soma', () => {
    expect(percentualDe('')).toBe(0);
    expect(percentualDe(null)).toBe(0);
  });
});

describe('a soma', () => {
  it('o caso do NJ: 72 / 25 / 3 fecha em 100', () => {
    expect(somaPercentuais(form('72', '25', '3'))).toBe(100);
  });

  it('⚠ decimais não deixam resíduo binário virar erro de validação', () => {
    /* 72,1 + 24,9 + 3 dá 100 em aritmética decimal e 99,99999999999999 em ponto flutuante —
       e o operador veria "ajuste para 100" com a conta certa na tela. */
    expect(somaPercentuais(form('72,1', '24,9', '3'))).toBe(100);
  });

  it('vazio soma zero', () => {
    expect(somaPercentuais(RATEIO_VAZIO)).toBe(0);
  });
});

describe('validarRateio', () => {
  it('100 exato passa e devolve as três linhas', () => {
    const r = validarRateio(form('72', '25', '3'));
    expect(r.ok).toBe(true);
    expect(r.soma).toBe(100);
    expect(r.payload).toEqual([
      { atividade: 'pecuaria', percentual: 72 },
      { atividade: 'agricultura', percentual: 25 },
      { atividade: 'silvicultura', percentual: 3 },
    ]);
  });

  it('⚠ 102 não passa — o caso do print, 72/25/5', () => {
    const r = validarRateio(form('72', '25', '5'));
    expect(r.ok).toBe(false);
    expect(r.soma).toBe(102);
    expect(r.erro).toContain('ajuste para 100');
  });

  it('95 também não passa — faltar é tão errado quanto sobrar', () => {
    /* Com 95%, cinco por cento do contador e do escritório ficam fora de toda atividade: o
       custo some do DRE sem ninguém apagar nada. */
    expect(validarRateio(form('70', '25', '0')).ok).toBe(false);
  });

  it('só pecuária: 100 / 0 / 0 é válido — zero é resposta', () => {
    const r = validarRateio(form('100', '0', '0'));
    expect(r.ok).toBe(true);
    expect(r.payload?.find(p => p.atividade === 'silvicultura')?.percentual).toBe(0);
  });

  it('campos em branco valem zero e a soma continua mandando', () => {
    expect(validarRateio(form('100', '', '')).ok).toBe(true);
    expect(validarRateio(form('', '', '')).ok).toBe(false);
  });

  it('acima de 100 numa linha é recusado pelo nome da atividade', () => {
    const r = validarRateio(form('120', '0', '0'));
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Pecuária');
  });

  it('negativo é recusado', () => {
    expect(validarRateio(form('110', '-10', '0')).ok).toBe(false);
  });

  it('decimais que fecham 100 passam', () => {
    expect(validarRateio(form('33,33', '33,33', '33,34')).ok).toBe(true);
  });
});

describe('os anos dos cards', () => {
  it('cinco atrás, o corrente e um à frente, do mais novo para o mais velho', () => {
    expect(anosDoRateio(2026)).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021]);
  });

  it('⚠ ano com chave gravada NUNCA some, ainda que fora da janela', () => {
    /* Uma chave de 2018 invisível é uma chave que ninguém consegue abrir para corrigir — e
       ela continua valendo no DRE daquele ano. */
    expect(anosDoRateio(2026, [2018])).toContain(2018);
    expect(anosDoRateio(2026, [2018])[anosDoRateio(2026, [2018]).length - 1]).toBe(2018);
  });

  it('ano com chave dentro da janela não duplica', () => {
    const anos = anosDoRateio(2026, [2025, 2024]);
    expect(anos.filter(a => a === 2025)).toHaveLength(1);
  });
});

describe('as três atividades', () => {
  it('são as do CHECK do banco, nesta ordem', () => {
    expect(ATIVIDADES_RATEIO.map(a => a.valor)).toEqual(['pecuaria', 'agricultura', 'silvicultura']);
  });

  it('o rótulo da agricultura é Lavoura — a fala do produtor', () => {
    expect(ATIVIDADES_RATEIO.find(a => a.valor === 'agricultura')?.rotulo).toBe('Lavoura');
  });
});
