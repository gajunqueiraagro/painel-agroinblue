/**
 * VG-CENTAVO-ACUMULADO D1a — o valor do lançamento vai ao banco em CENTAVOS.
 *   C1 a regra: float do Excel e meio centavo (x,xx5) viram 2 casas; meio centavo para longe do zero, como o `round(…, 2)` do banco
 *   C2 os geradores que gravavam fração (FASE 0) passam pela regra: o importador de planilha, o abate, a venda e a compra do rebanho
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { valorDoLancamento } from './valorDoLancamento';

describe('VG-CENTAVO D1a · valor em centavos', () => {
  it('C1 2 casas; meio centavo para longe do zero', () => {
    expect(valorDoLancamento(1234.5599999999999)).toBe(1234.56);
    expect(valorDoLancamento(0.1 + 0.2)).toBe(0.3);
    expect(valorDoLancamento(10.005)).toBe(10.01);
    expect(valorDoLancamento(1.015)).toBe(1.02);
    expect(valorDoLancamento(-10.005)).toBe(-10.01);
    expect(valorDoLancamento(-0.125)).toBe(-0.13);
    expect(valorDoLancamento(100)).toBe(100);
    expect(valorDoLancamento(12.3449)).toBe(12.34);
  });

  it('C2 o importador, o abate, a venda e a compra do rebanho gravam pela regra', () => {
    const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
    /* o importador: a linha da planilha, que também leva os pares de transferência (`...baseRow`) */
    expect(ler('src/hooks/useFinanceiro.ts')).toMatch(/descricao: l\.produto,[\s\S]{0,200}valor: valorDoLancamento\(l\.valor\),/);
    /* o abate: o insert inteiro (parcela, líquido, dedução) passa pela regra */
    /* o abate, a venda e a compra do rebanho (Gabriel 31/10 07:42): o insert inteiro (parcela, líquido, frete, comissão, Funrural…) passa
       pela regra — a compra também tem teste de comportamento (`gerarFinanceiroCompra.centavos.test.ts`) */
    for (const f of ['src/components/AbateFinanceiroPanel.tsx', 'src/components/VendaFinanceiroPanel.tsx', 'src/components/CompraFinanceiroPanel.tsx',
      'src/components/compra/gerarFinanceiroCompra.ts']) {
      expect(ler(f), f).toMatch(/\.insert\(inserts\.map\(\(r\) => \(\{ \.\.\.r, valor: valorDoLancamento\(r\.valor\) \}\)\)\)/);
    }
  });
});
