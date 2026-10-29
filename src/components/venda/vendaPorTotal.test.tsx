/**
 * P115 (Gabriel 27/10) — "Por total" é o TOTAL da venda: o valor digitado não se multiplica pelas cabeças; por cabeça = total ÷ cabeças.
 * O caso do briefing: 140 cabeças a R$ 700.000,00 "por total" — a tela mostrava R$ 98.000.000,00 (700.000 × 140).
 * A regra única é `tipoPrecoDoMotor` (o diálogo "Detalhes da Venda em Pé" e o painel do LancamentosTab a usam).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildVendaCalculation, tipoPrecoDoMotor, type VendaCalculationInput } from '@/lib/calculos/venda';
import { VendaDetalhesDialog, EMPTY_VENDA_DETALHES } from './VendaDetalhesDialog';

const entrada = (o: Partial<VendaCalculationInput>): VendaCalculationInput => ({
  quantidade: 140, pesoKg: 450, categoria: 'boi', fazendaOrigem: '', compradorNome: '', data: '2026-10-27', statusOperacional: 'realizado',
  tipoPreco: 'por_total', precoInput: 700000, tipoVenda: 'gado_adulto', frete: 0, comissaoPct: 0, outrosCustos: 0, funruralPct: 0,
  funruralReais: 0, notaFiscal: '', formaReceb: 'avista', qtdParcelas: 1, parcelas: [], ...o,
});

describe('P115 — "Por total" é o total', () => {
  it('a regra única: por_total → por_total, por_cab → por_cab, o resto → por_kg (como antes)', () => {
    expect(tipoPrecoDoMotor('por_total')).toBe('por_total');
    expect(tipoPrecoDoMotor('por_cab')).toBe('por_cab');
    expect(tipoPrecoDoMotor('por_kg')).toBe('por_kg');
    expect(tipoPrecoDoMotor(null)).toBe('por_kg');
  });

  it('o motor: 140 cabeças a R$ 700.000,00 por total = R$ 700.000,00 (R$ 5.000,00 por cabeça), nunca × 140', () => {
    const calc = buildVendaCalculation(entrada({ tipoPreco: tipoPrecoDoMotor('por_total') }));
    expect(calc.valorBase).toBe(700000);
    expect(calc.rCab).toBe(5000);
    expect(calc.valorBruto).toBe(700000);
  });

  it('o diálogo "Detalhes da Venda em Pé" mostra o valor bruto de R$ 700.000,00 com 140 cabeças', () => {
    render(<VendaDetalhesDialog open onClose={() => {}} onSave={() => {}} quantidade={140} pesoKg={450} categoria="boi"
      dataVenda="2026-10-27" compradorNome="Comprador Sintético" initialData={{ ...EMPTY_VENDA_DETALHES, tipoPreco: 'por_total', precoInput: '700000' }} />);
    expect(screen.getAllByText(/700\.000,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/98\.000\.000,00/)).toBeNull();
  });

  it('o painel do LancamentosTab usa a mesma regra (nada de "por_total" virar "por_cab" lá)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../pages/LancamentosTab.tsx'), 'utf8');
    expect(fonte).toContain('const tipoPrecoEngine = tipoPrecoDoMotor(vendaDetalhes.tipoPreco);');
    /* a busca sabe achar: a conversão antiga, se voltasse, apareceria assim */
    expect(fonte.includes("=== 'por_total' ? 'por_cab'")).toBe(false);
  });
});
