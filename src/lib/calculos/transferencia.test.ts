import { describe, it, expect } from 'vitest';
import {
  buildTransferenciaCalculation,
  buildTransferenciaSnapshot,
  restoreTransferenciaFromSnapshot,
  type TransferenciaCalculationInput,
} from './transferencia';

// ─── Helper ──────────────────────────────────────────────────────────────────
function baseInput(overrides: Partial<TransferenciaCalculationInput> = {}): TransferenciaCalculationInput {
  return {
    quantidade: 100,
    pesoKg: 450,
    categoria: 'bois',
    fazendaOrigem: 'Fazenda A',
    fazendaDestino: 'Fazenda B',
    data: '2025-06-15',
    statusOperacional: 'programado',
    ...overrides,
  };
}

describe('buildTransferenciaCalculation', () => {
  it('calcula indicadores operacionais corretamente', () => {
    const calc = buildTransferenciaCalculation(baseInput());

    expect(calc.quantidade).toBe(100);
    expect(calc.pesoKg).toBe(450);
    expect(calc.pesoTotalKg).toBe(45000);
    // 450 / 30 = 15 @/cab
    expect(calc.arrobasCab).toBe(15);
    // 15 × 100 = 1500
    expect(calc.totalArrobas).toBe(1500);
    expect(calc.temPrecoReferencia).toBe(false);
  });

  it('aceita strings numéricas como input', () => {
    const calc = buildTransferenciaCalculation(baseInput({ quantidade: '50', pesoKg: '360' }));

    expect(calc.quantidade).toBe(50);
    expect(calc.pesoKg).toBe(360);
    expect(calc.pesoTotalKg).toBe(18000);
  });

  it('calcula econômico via R$/@ (prioridade)', () => {
    const calc = buildTransferenciaCalculation(baseInput({
      precoReferenciaArroba: 300,
      precoReferenciaCabeca: 9999, // deve ser ignorado
    }));

    expect(calc.temPrecoReferencia).toBe(true);
    expect(calc.precoReferenciaArroba).toBe(300);
    // valorLote = 1500 @ × 300 = 450.000
    expect(calc.valorEconomicoLote).toBe(450000);
    // cab = 450.000 / 100 = 4.500
    expect(calc.valorEconomicoCab).toBe(4500);
    // kg = 4.500 / 450 = 10
    expect(calc.precoReferenciaKg).toBe(10);
  });

  it('calcula econômico via R$/cab quando @ não informado', () => {
    const calc = buildTransferenciaCalculation(baseInput({
      precoReferenciaCabeca: 5000,
    }));

    expect(calc.temPrecoReferencia).toBe(true);
    expect(calc.precoReferenciaCabeca).toBe(5000);
    // valorLote = 5000 × 100 = 500.000
    expect(calc.valorEconomicoLote).toBe(500000);
    // R$/@ = 500.000 / 1500 = 333.33
    expect(calc.precoReferenciaArroba).toBeCloseTo(333.33, 2);
    // R$/kg = 5000 / 450 = 11.11
    expect(calc.precoReferenciaKg).toBeCloseTo(11.11, 2);
  });

  it('retorna zeros econômicos sem preço de referência', () => {
    const calc = buildTransferenciaCalculation(baseInput());

    expect(calc.temPrecoReferencia).toBe(false);
    expect(calc.valorEconomicoLote).toBe(0);
    expect(calc.precoReferenciaArroba).toBe(0);
    expect(calc.precoReferenciaCabeca).toBe(0);
  });

  it('trata quantidade zero sem erro', () => {
    const calc = buildTransferenciaCalculation(baseInput({ quantidade: 0 }));

    expect(calc.quantidade).toBe(0);
    expect(calc.pesoTotalKg).toBe(0);
    expect(calc.totalArrobas).toBe(0);
  });

  it('trata valores negativos (força zero)', () => {
    const calc = buildTransferenciaCalculation(baseInput({ quantidade: -5, pesoKg: -100 }));

    expect(calc.quantidade).toBe(0);
    expect(calc.pesoKg).toBe(0);
  });

  it('preserva campos textuais', () => {
    const calc = buildTransferenciaCalculation(baseInput({ observacao: 'Lote emergencial' }));

    expect(calc.categoria).toBe('bois');
    expect(calc.fazendaOrigem).toBe('Fazenda A');
    expect(calc.fazendaDestino).toBe('Fazenda B');
    expect(calc.observacao).toBe('Lote emergencial');
    expect(calc.statusOperacional).toBe('confirmado');
  });
});

describe('snapshot helpers', () => {
  it('buildTransferenciaSnapshot adiciona _tipo e _versao', () => {
    const calc = buildTransferenciaCalculation(baseInput());
    const snap = buildTransferenciaSnapshot(calc);

    expect(snap._tipo).toBe('transferencia_saida');
    expect(snap._versao).toBe(1);
    expect(snap.quantidade).toBe(100);
  });

  it('restoreTransferenciaFromSnapshot reconstrói cálculo', () => {
    const calc = buildTransferenciaCalculation(baseInput({ precoReferenciaArroba: 300 }));
    const snap = buildTransferenciaSnapshot(calc);
    const restored = restoreTransferenciaFromSnapshot(snap);

    expect(restored).not.toBeNull();
    expect(restored!.valorEconomicoLote).toBe(calc.valorEconomicoLote);
    expect(restored!.totalArrobas).toBe(calc.totalArrobas);
  });

  it('restoreTransferenciaFromSnapshot retorna null para snapshot inválido', () => {
    expect(restoreTransferenciaFromSnapshot({})).toBeNull();
    expect(restoreTransferenciaFromSnapshot({ _tipo: 'abate' })).toBeNull();
  });
});
