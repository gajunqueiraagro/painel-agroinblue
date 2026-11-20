/** DRE-AJUSTES-05 (Gabriel 19/11) — o DRE SEMPRE abre em R$: nunca com R$/ha ligado, nem lembrado de uma sessão anterior. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const f = readFileSync('src/pages/AgriDreLavouraTab.tsx', 'utf8');

describe('DRE-AJUSTES-05: o DRE abre em R$', () => {
  it('as unidades da Pecuária e da Lavoura nascem só com R$', () => {
    expect(f).toContain("useState<readonly UnidadeLav[]>(['rs'])");
    expect(f).toContain("useState<readonly UnidadePec[]>(['rs'])");
  });
  it('a escolha da unidade não é lembrada (nem armazenamento do navegador, nem URL)', () => {
    const trechos = f.split('\n').filter((l) => /unidades(Pec|Lav)/.test(l));
    for (const l of trechos) expect(l, l.trim()).not.toMatch(/localStorage|sessionStorage|searchParams|useLembrar|usePersist/);
  });
});
