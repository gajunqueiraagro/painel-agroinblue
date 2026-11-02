/**
 * MAPA-PAINEL-LOTE-UA-01 — o título dos lotes do pasto no mês e a régua em UA/ha (LOTACAO-REF D2: 0,67 / 1,11).
 */
import { describe, expect, it } from 'vitest';
import { tituloDosLotes } from './lotesDoPasto';
import { faixaDaLotacao, faixaDaLotacaoUa } from './faixasLotacao';

describe('tituloDosLotes', () => {
  it('um lote: "Lote X" (sem repetir a palavra); o mesmo lote em várias linhas conta uma vez', () => {
    expect(tituloDosLotes([{ lote: 'Vacas paridas' }, { lote: ' Vacas paridas ' }], true)).toEqual({ titulo: 'Lote Vacas paridas', varios: false });
    expect(tituloDosLotes([{ lote: 'Lote da recria' }], true).titulo).toBe('Lote da recria');
    expect(tituloDosLotes([{ lote: 'Loteamento' }], true).titulo).toBe('Lote Loteamento');
  });
  it('mais de um: "Lotes: A · B" na ordem das linhas, e a tabela mostra o lote por linha', () => {
    expect(tituloDosLotes([{ lote: 'L-12' }, { lote: null }, { lote: 'L-07' }, { lote: 'L-12' }], true)).toEqual({ titulo: 'Lotes: L-12 · L-07', varios: true });
  });
  it('nenhum lote = "Sem lote"; sem fechamento no mês = "Lote —" (ausente, nunca "Sem lote")', () => {
    expect(tituloDosLotes([{ lote: null }, { lote: '  ' }], true)).toEqual({ titulo: 'Sem lote', varios: false });
    expect(tituloDosLotes([], false)).toEqual({ titulo: 'Lote —', varios: false });
  });
});

describe('faixaDaLotacaoUa (0,67 / 1,11 UA/ha)', () => {
  it('as bordas da régua', () => {
    expect(faixaDaLotacaoUa(null)).toBeNull();
    expect(faixaDaLotacaoUa(0)).toBe('vazio');
    expect(faixaDaLotacaoUa(0.66)).toBe('sublotado');
    expect(faixaDaLotacaoUa(0.67)).toBe('ideal');
    expect(faixaDaLotacaoUa(1.11)).toBe('ideal');
    expect(faixaDaLotacaoUa(1.12)).toBe('carga_alta');
  });
  it('equivale à de kg/ha (÷ 450) longe das bordas', () => {
    for (const kg of [100, 299, 301, 420, 499, 501, 800]) {
      const ua = kg / 450;
      if (Math.abs(ua - 0.67) > 0.01 && Math.abs(ua - 1.11) > 0.01) expect(faixaDaLotacaoUa(ua)).toBe(faixaDaLotacao(kg));
    }
  });
});
