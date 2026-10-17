/**
 * FIN-FINANC-28 · PASSO 8 — a casa e' Inter, sem fonte mono: numero alinha por `tabular-nums`, nunca por monoespacada. A trava
 * varre `src` (fora os testes) com auto-teste do detector: classe `font-mono`, `monospace` e a familia mono por nome.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MONO = /\bfont-mono\b|monospace|Plex Mono|Courier/;

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { arquivos(p, acc); continue; }
    if (/\.(tsx?|css)$/.test(nome) && !/\.test\./.test(nome)) acc.push(p);
  }
  return acc;
}

describe('sem fonte mono no sistema', () => {
  it('o detector sabe achar (auto-teste)', () => {
    expect(MONO.test('className="h-8 text-right font-mono tabular-nums"')).toBe(true);
    expect(MONO.test(".x { font-family: 'IBM Plex Mono', ui-monospace, monospace; }")).toBe(true);
    expect(MONO.test('className="h-8 text-right tabular-nums"')).toBe(false);
  });
  it('nenhum arquivo de src usa fonte mono', () => {
    const achados = arquivos('src').flatMap((p) => readFileSync(p, 'utf8').split('\n')
      .map((l, i) => (MONO.test(l) ? `${p}:${i + 1}` : null)).filter((x): x is string => x !== null));
    expect(achados).toEqual([]);
  });
});
