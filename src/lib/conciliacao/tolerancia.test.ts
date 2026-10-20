/**
 * CONC-CRIAR-CENTAVO-01 — a tolerância da conciliação é UMA (meio centavo, a do banco) e "Criar lançamento pela diferença" nunca
 * fica apagado com R$ 0,01 de diferença. A fonte das telas que decidem conciliar ou criar não tem `0.01` solto.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fechaAoCentavo, podeCriarPelaDiferenca, TOLERANCIA_CONCILIACAO } from './tolerancia';

describe('a tolerância', () => {
  it('é meio centavo: 0,004 fecha, 0,01 não', () => {
    expect(TOLERANCIA_CONCILIACAO).toBe(0.005);
    expect(fechaAoCentavo(0.004)).toBe(true);
    expect(fechaAoCentavo(-0.004)).toBe(true);
    expect(fechaAoCentavo(0.01)).toBe(false);
    expect(fechaAoCentavo(-0.01)).toBe(false);
  });
});

describe('criar pela diferença', () => {
  it('sem levados: liberado sempre que o extrato ≠ 0 (R$ 0,01 inclusive)', () => {
    expect(podeCriarPelaDiferenca({ ok: false, diferenca: -0.01, noExtrato: 0.01 }, true)).toBe(true);
    expect(podeCriarPelaDiferenca({ ok: false, diferenca: 0, noExtrato: 0 }, true)).toBe(false);
  });
  it('com levados: diferença de 0,01 libera; 0,004 não; simulação que fechou não', () => {
    expect(podeCriarPelaDiferenca({ ok: false, diferenca: 0.01, noExtrato: 100 }, false)).toBe(true);
    expect(podeCriarPelaDiferenca({ ok: false, diferenca: -0.01, noExtrato: 100 }, false)).toBe(true);
    expect(podeCriarPelaDiferenca({ ok: false, diferenca: 0.004, noExtrato: 100 }, false)).toBe(false);
    expect(podeCriarPelaDiferenca({ ok: true, diferenca: 0, noExtrato: 100 }, false)).toBe(false);
    expect(podeCriarPelaDiferenca(null, true)).toBe(false);
  });
});

/** Acha comparação de diferença contra um 0.01 solto (`> 0.01`, `<= 0.01`…), que decidiria conciliar ou criar por fora da regra. */
const zeroUmSolto = (fonte: string) => fonte.split('\n').filter((l) => /(?:<=|>=|<|>)\s*0\.01\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));

describe('as telas da conciliação leem a regra (fonte)', () => {
  it('o detector acha o padrão antigo', () => {
    expect(zeroUmSolto('  const podeCriar = !!sim && !sim.ok && Math.abs(sim.diferenca) > 0.01;')).toHaveLength(1);
    expect(zeroUmSolto('  if (Math.abs(diferenca) <= 0.01) return \'confere\';')).toHaveLength(1);
    expect(zeroUmSolto('// comentário com > 0.01')).toHaveLength(0);
  });
  for (const arquivo of ['../../components/financeiro-v2/CasarComBancoModal.tsx', '../../components/financeiro-v2/EspelhoConciliacaoTab.tsx',
    '../../hooks/useImportacaoExtrato.ts']) {
    it(`${arquivo.split('/').pop()} não decide por um 0.01 solto`, () => {
      expect(zeroUmSolto(readFileSync(resolve(__dirname, arquivo), 'utf8'))).toEqual([]);
    });
  }
  it('o modal decide o criar pela regra', () => {
    const fonte = readFileSync(resolve(__dirname, '../../components/financeiro-v2/CasarComBancoModal.tsx'), 'utf8');
    expect(fonte).toMatch(/const podeCriar = podeCriarPelaDiferenca\(sim, semItens\);/);
  });
});
