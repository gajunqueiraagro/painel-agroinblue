/**
 * DA-NOTA-JUROS-01 — pago ≠ nota nunca trava quando tudo está pago: juros (a mais) ou desconto (a menos), com a troca "não é juros".
 * O caso do Gabriel (NJ): nota R$ 3.441,75, pago 1 dia depois R$ 3.446,34.
 */
import { describe, it, expect } from 'vitest';
import { diferencaDaNota, motivoQueVale, numerosDaDiferenca, porqueDaDiferenca, somaPassaDaNotaTrava } from './diferencaDaNota';

const PAGO = { pago: true, vencimento: '2025-05-06', pagamento: '2025-05-06' };

describe('diferencaDaNota', () => {
  it('o caso NJ: pago a mais 4,59, 1 dia depois do vencimento da nota → juros sugerido, a guarda da soma não trava', () => {
    const d = diferencaDaNota({ alvos: [PAGO], somaCent: 344634, notaCent: 344175, nascem: 0, vencimentoDaNota: '2025-05-05' });
    expect(d).toEqual({ pagoCent: 344634, notaCent: 344175, difCent: 459, sugerido: 'juros', diasDepois: 1 });
    const m = motivoQueVale(d, null);
    expect(m).toBe('juros');
    expect(somaPassaDaNotaTrava(344634, 344175, m)).toBe(false);
    expect(numerosDaDiferenca(d!)).toEqual({ pago: 'R$ 3.446,34', nota: 'R$ 3.441,75', diferenca: '+R$ 4,59' });
    expect(porqueDaDiferenca(d!)).toContain('pago 1 dia depois do vencimento');
  });
  it('"não é juros" (conferir) devolve a guarda: a soma passa da nota trava', () => {
    const d = diferencaDaNota({ alvos: [PAGO], somaCent: 344634, notaCent: 344175, nascem: 0 });
    const m = motivoQueVale(d, 'conferir');
    expect(m).toBeNull();
    expect(somaPassaDaNotaTrava(344634, 344175, m)).toBe(true);
  });
  it('pago a menos → desconto (nunca trava; nada muda no lançamento)', () => {
    const d = diferencaDaNota({ alvos: [PAGO], somaCent: 340000, notaCent: 344175, nascem: 0 });
    expect(d?.sugerido).toBe('desconto');
    expect(d?.difCent).toBe(-4175);
    expect(motivoQueVale(d, null)).toBe('desconto');
    expect(numerosDaDiferenca(d!).diferenca).toBe('−R$ 41,75');
  });
  it('motivo trocado para o sinal errado não vale (juros só a mais, desconto só a menos)', () => {
    const mais = diferencaDaNota({ alvos: [PAGO], somaCent: 344634, notaCent: 344175, nascem: 0 });
    expect(motivoQueVale(mais, 'desconto')).toBeNull();
    const menos = diferencaDaNota({ alvos: [PAGO], somaCent: 340000, notaCent: 344175, nascem: 0 });
    expect(motivoQueVale(menos, 'juros')).toBeNull();
  });
  it('nada a explicar: bate no meio centavo, algo em aberto, parcela que nasce, nenhum alvo', () => {
    expect(diferencaDaNota({ alvos: [PAGO], somaCent: 344176, notaCent: 344175, nascem: 0 })).toBeNull();
    expect(diferencaDaNota({ alvos: [PAGO, { pago: false, vencimento: null, pagamento: null }], somaCent: 344634, notaCent: 344175, nascem: 0 })).toBeNull();
    expect(diferencaDaNota({ alvos: [PAGO], somaCent: 344634, notaCent: 344175, nascem: 1 })).toBeNull();
    expect(diferencaDaNota({ alvos: [], somaCent: 344634, notaCent: 344175, nascem: 0 })).toBeNull();
    /* sem diferença a explicar, a guarda de sempre */
    expect(somaPassaDaNotaTrava(13500000, 11923700, motivoQueVale(null, null))).toBe(true);
  });
  it('sem o vencimento da nota, conta contra o do lançamento; pago antes = "antes do vencimento"', () => {
    const d = diferencaDaNota({ alvos: [{ pago: true, vencimento: '2025-05-10', pagamento: '2025-05-06' }], somaCent: 344634, notaCent: 344175, nascem: 0 });
    expect(d?.diasDepois).toBe(-4);
    expect(porqueDaDiferenca(d!)).toContain('pago 4 dias antes do vencimento');
  });
});
