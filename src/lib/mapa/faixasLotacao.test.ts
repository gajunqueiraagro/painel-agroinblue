import { describe, expect, it } from 'vitest';
import { faixaDaLotacao, statusDaFaixa, textoUaHa, uaPorHa } from './faixasLotacao';

describe('faixas de lotação (MAPA-02a, D2: 300/500)', () => {
  it('os limites', () => {
    expect(faixaDaLotacao(0)).toBe('vazio');
    expect(faixaDaLotacao(299)).toBe('sublotado');
    expect(faixaDaLotacao(299.99)).toBe('sublotado');
    expect(faixaDaLotacao(300)).toBe('ideal');
    expect(faixaDaLotacao(500)).toBe('ideal');
    expect(faixaDaLotacao(500.01)).toBe('carga_alta');
    expect(faixaDaLotacao(501)).toBe('carga_alta');
  });

  it('sem fechamento (kg/ha desconhecido) não é vazio: é null', () => {
    expect(faixaDaLotacao(null)).toBeNull();
    expect(faixaDaLotacao(undefined)).toBeNull();
    expect(faixaDaLotacao(Number.NaN)).toBeNull();
  });

  it('o status antigo da Operação segue a mesma régua', () => {
    expect(statusDaFaixa(faixaDaLotacao(299))).toBe('atencao');
    expect(statusDaFaixa(faixaDaLotacao(300))).toBe('adequado');
    expect(statusDaFaixa(faixaDaLotacao(501))).toBe('pressao');
    expect(statusDaFaixa(faixaDaLotacao(0))).toBe('sem_ocupacao');
    expect(statusDaFaixa(null)).toBe('sem_ocupacao');
  });
});

describe('UA/ha (fix1 3): a regra do Fechamento, kg ÷ 450 ÷ área', () => {
  it('P_10: 76 cab × 215 kg em 59,7 ha = 0,61 UA/ha', () => {
    expect(uaPorHa(76, 215, 59.7)).toBeCloseTo((76 * 215) / 450 / 59.7, 6);
    expect(textoUaHa(uaPorHa(76, 215, 59.7))).toBe('0,61 UA/ha');
  });
  it('3M set/26: 936 cab × 316 kg em 793,5 ha (o card Lotação) = 0,83 UA/ha', () => {
    expect(textoUaHa(uaPorHa(936, 316, 793.5))).toBe('0,83 UA/ha');
  });
  it('sem área ou sem cabeças: "—" (null), nunca 0', () => {
    expect(uaPorHa(76, 215, 0)).toBeNull();
    expect(uaPorHa(null, 215, 50)).toBeNull();
    expect(textoUaHa(null)).toBeNull();
  });
  it('vazio (0 cab) é 0,00 UA/ha (zero é valor real)', () => {
    expect(textoUaHa(uaPorHa(0, null, 50))).toBe('0,00 UA/ha');
  });
});
