import { describe, expect, it } from 'vitest';
import { faixaDaLotacao, statusDaFaixa } from './faixasLotacao';

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
