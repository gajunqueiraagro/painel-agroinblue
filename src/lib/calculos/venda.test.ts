import { describe, it, expect } from 'vitest';
import {
  buildVendaCalculation,
  buildVendaSnapshot,
  restoreVendaFromSnapshot,
  type VendaCalculationInput,
} from './venda';

function baseInput(overrides: Partial<VendaCalculationInput> = {}): VendaCalculationInput {
  return {
    quantidade: 100,
    pesoKg: 450,
    categoria: 'bois',
    fazendaOrigem: 'Fazenda A',
    compradorNome: 'Comprador X',
    data: '2025-06-15',
    statusOperacional: 'programado',
    tipoPreco: 'por_arroba',
    precoInput: 300,
    ...overrides,
  };
}

describe('buildVendaCalculation', () => {
  // ── Operacional ──
  it('calcula indicadores operacionais', () => {
    const calc = buildVendaCalculation(baseInput());
    expect(calc.quantidade).toBe(100);
    expect(calc.pesoKg).toBe(450);
    expect(calc.pesoTotalKg).toBe(45000);
    expect(calc.arrobasCab).toBe(15);        // 450/30
    expect(calc.totalArrobas).toBe(1500);     // 15×100
  });

  // ── Preço por @ ──
  it('calcula valor base por arroba', () => {
    const calc = buildVendaCalculation(baseInput({ tipoPreco: 'por_arroba', precoInput: 300 }));
    // 1500 @ × 300 = 450.000
    expect(calc.valorBase).toBe(450000);
    expect(calc.rArroba).toBe(300);
    expect(calc.rCab).toBe(4500);   // 450.000 / 100
    expect(calc.rKg).toBe(10);      // 450.000 / 45.000
  });

  // ── Preço por kg ──
  it('calcula valor base por kg', () => {
    const calc = buildVendaCalculation(baseInput({ tipoPreco: 'por_kg', precoInput: 10 }));
    // 45.000 kg × 10 = 450.000
    expect(calc.valorBase).toBe(450000);
    expect(calc.rKg).toBe(10);
  });

  // ── Preço por cabeça ──
  it('calcula valor base por cabeça', () => {
    const calc = buildVendaCalculation(baseInput({ tipoPreco: 'por_cab', precoInput: 5000 }));
    // 100 × 5000 = 500.000
    expect(calc.valorBase).toBe(500000);
    expect(calc.rCab).toBe(5000);
  });

  // ── Despesas comerciais ──
  it('calcula despesas comerciais (frete + comissão + outros)', () => {
    const calc = buildVendaCalculation(baseInput({
      frete: 5000,
      comissaoPct: 2,
      outrosCustos: 1000,
    }));
    // comissão = 450.000 × 2% = 9.000
    expect(calc.freteVal).toBe(5000);
    expect(calc.comissaoVal).toBe(9000);
    expect(calc.outrosCustosVal).toBe(1000);
    expect(calc.totalDespesas).toBe(15000);
    // líquido = 450.000 - 15.000 = 435.000
    expect(calc.valorLiquido).toBe(435000);
  });

  // ── Funrural por % ──
  it('calcula Funrural por percentual', () => {
    const calc = buildVendaCalculation(baseInput({ funruralPct: 1.5 }));
    // 450.000 × 1.5% = 6.750
    expect(calc.funruralTotal).toBe(6750);
    expect(calc.valorLiquido).toBe(450000 - 6750);
  });

  // ── Funrural por R$ (prioridade sobre %) ──
  it('calcula Funrural por R$ com prioridade sobre %', () => {
    const calc = buildVendaCalculation(baseInput({ funruralPct: 1.5, funruralReais: 7000 }));
    expect(calc.funruralTotal).toBe(7000);
    expect(calc.valorLiquido).toBe(450000 - 7000);
  });

  // ── Combinação completa ──
  it('calcula resultado completo com despesas + deduções', () => {
    const calc = buildVendaCalculation(baseInput({
      frete: 3000,
      comissaoPct: 1,
      funruralPct: 1.5,
    }));
    // base = 450.000
    // comissão = 4.500, frete = 3.000, totalDespesas = 7.500
    // funrural = 6.750
    // líquido = 450.000 - 7.500 - 6.750 = 435.750
    expect(calc.totalDespesas).toBe(7500);
    expect(calc.funruralTotal).toBe(6750);
    expect(calc.valorLiquido).toBe(435750);
  });

  // ── Indicadores líquidos ──
  it('calcula indicadores líquidos', () => {
    const calc = buildVendaCalculation(baseInput());
    // sem despesas/deduções: líquido = bruto = 450.000
    expect(calc.liqArroba).toBe(300);    // 450.000 / 1.500
    expect(calc.liqCabeca).toBe(4500);   // 450.000 / 100
    expect(calc.liqKg).toBe(10);         // 450.000 / 45.000
  });

  // ── Edge cases ──
  it('trata quantidade zero', () => {
    const calc = buildVendaCalculation(baseInput({ quantidade: 0 }));
    expect(calc.quantidade).toBe(0);
    expect(calc.valorBase).toBe(0);
    expect(calc.liqCabeca).toBe(0);
  });

  it('trata valores negativos (força zero)', () => {
    const calc = buildVendaCalculation(baseInput({ quantidade: -5, pesoKg: -100 }));
    expect(calc.quantidade).toBe(0);
    expect(calc.pesoKg).toBe(0);
  });

  it('aceita strings numéricas', () => {
    const calc = buildVendaCalculation(baseInput({ quantidade: '50', pesoKg: '360', precoInput: '250' }));
    expect(calc.quantidade).toBe(50);
    expect(calc.pesoKg).toBe(360);
  });

  // ── Parcelas ──
  it('persiste parcelas e calcula soma', () => {
    const calc = buildVendaCalculation(baseInput({
      formaReceb: 'prazo',
      qtdParcelas: 3,
      parcelas: [
        { data: '2025-07-15', valor: 150000 },
        { data: '2025-08-15', valor: 150000 },
        { data: '2025-09-15', valor: 150000 },
      ],
    }));
    expect(calc.formaReceb).toBe('prazo');
    expect(calc.parcelas).toHaveLength(3);
    expect(calc.somaParcelas).toBe(450000);
  });

  it('preserva campos textuais', () => {
    const calc = buildVendaCalculation(baseInput({ observacao: 'Lote especial' }));
    expect(calc.categoria).toBe('bois');
    expect(calc.compradorNome).toBe('Comprador X');
    expect(calc.observacao).toBe('Lote especial');
  });
});

describe('snapshot helpers', () => {
  it('buildVendaSnapshot adiciona _tipo e _versao', () => {
    const calc = buildVendaCalculation(baseInput());
    const snap = buildVendaSnapshot(calc);
    expect(snap._tipo).toBe('venda');
    expect(snap._versao).toBe(1);
    expect(snap.valorBase).toBe(450000);
  });

  it('restoreVendaFromSnapshot reconstrói cálculo', () => {
    const calc = buildVendaCalculation(baseInput({ frete: 5000 }));
    const snap = buildVendaSnapshot(calc);
    const restored = restoreVendaFromSnapshot(snap);
    expect(restored).not.toBeNull();
    expect(restored!.valorLiquido).toBe(calc.valorLiquido);
    expect(restored!.freteVal).toBe(5000);
  });

  it('restoreVendaFromSnapshot retorna null para snapshot inválido', () => {
    expect(restoreVendaFromSnapshot({})).toBeNull();
    expect(restoreVendaFromSnapshot({ _tipo: 'abate' })).toBeNull();
  });
});
