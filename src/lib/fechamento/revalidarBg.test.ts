/**
 * BG-SET26-REVALIDAR (Gabriel 08/11 06:40) — o caso real: Vera · BG · set/26 com o snapshot invalidado, os 16 pastos fechados e os preços
 * gravados; o cliente não tem master. A trava de tela (`useMasterLock`) dava o mês como somente leitura e o Revalidar ficava desabilitado
 * para todos ("Só quem edita o Valor do Rebanho revalida."). Agora quem decide é `podeRevalidarOMes`, sem a trava.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { motivoParaRevalidar, podeRevalidarOMes } from './travaDoP2';

describe('podeRevalidarOMes', () => {
  it('o caso da BG set/26: fazenda, mês ao vivo, não futuro → pode (e o motivo some com P1 fechado e preços)', () => {
    const pode = podeRevalidarOMes({ global: false, fonteMes: 'live', mesFuturo: false });
    expect(pode).toBe(true);
    expect(motivoParaRevalidar({ podeEditar: pode, pastosOficiais: true, semPreco: [], anoMes: '2026-09' })).toBeNull();
  });
  it('Global, mês com snapshot fechado ou mês futuro → não pode', () => {
    expect(podeRevalidarOMes({ global: true, fonteMes: 'live', mesFuturo: false })).toBe(false);
    expect(podeRevalidarOMes({ global: false, fonteMes: 'snapshot', mesFuturo: false })).toBe(false);
    expect(podeRevalidarOMes({ global: false, fonteMes: 'live', mesFuturo: true })).toBe(false);
  });
});

describe('a tela usa a regra nova (fonte)', () => {
  const tela = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');
  it('o motivo do Revalidar vem de `podeRevalidar`, nunca do `uCanEdit` (que leva a trava de tela)', () => {
    expect(tela).toContain('const podeRevalidar = podeRevalidarOMes({ global: isGlobal, fonteMes, mesFuturo: isMesFuturo });');
    expect(tela).toContain('podeEditar: podeRevalidar, pastosOficiais: p1Fechado, anoMes,');
    expect(tela).not.toContain('podeEditar: uCanEdit');
  });
  it('a regra não olha a trava de tela', () => {
    const lib = readFileSync('src/lib/fechamento/travaDoP2.ts', 'utf8');
    const i = lib.indexOf('export function podeRevalidarOMes');
    const corpo = lib.slice(i, lib.indexOf('\n}\n', i));
    expect(corpo).not.toMatch(/master|ReadOnly|Lock/i);
  });
});
