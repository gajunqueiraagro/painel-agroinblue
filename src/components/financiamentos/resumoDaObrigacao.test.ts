/**
 * FIN-FINANC-28 — o resumo lateral do ObrigacaoDialog na ESCALA A18 DE MODAL (Gabriel 17/10/2026): aside de 240px sem rolagem,
 * "Resumo" a 11px/600, seção a 9px maiúscula sem faixa de fundo, linha de 16px a 10px, total a 11px/700, selo a 8,5px e NENHUM
 * texto acima de 11px. A mesma régua para as três naturezas (o resumo é um só). Lido da FONTE, com auto-teste do detector.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FONTE = readFileSync(resolve(__dirname, './ObrigacaoDialog.tsx'), 'utf8');
const aside = FONTE.slice(FONTE.indexOf('<aside'), FONTE.indexOf('</aside>'));
/** detector: algum tamanho de texto acima de 11px */
const acimaDe11 = (t: string) => [...t.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].some((m) => Number(m[1]) > 11) || /\btext-(sm|base|lg|xl)\b/.test(t);

describe('resumo da obrigação — escala A18', () => {
  it('auto-teste do detector', () => {
    expect(acimaDe11('<span className="text-[14px]">')).toBe(true);
    expect(acimaDe11('<span className="text-sm">')).toBe(true);
    expect(acimaDe11('<span className="text-[11px] text-[8.5px]">')).toBe(false);
  });
  it('aside de 240px, sem rolagem; título "Resumo" 11px/600 sem caixa alta', () => {
    expect(FONTE).toContain('lg:grid-cols-[1fr_240px]');
    expect(aside).toContain('lg:overflow-hidden');
    expect(aside).not.toContain('overflow-y-auto');
    expect(aside).toMatch(/text-\[11px\] font-semibold text-primary">\s*Resumo\s*</);
    expect(aside).not.toContain('Resumo da obrigação');
  });
  it('nenhum texto acima de 11px; total 11px/700; selo 8,5px; linhas de 16px', () => {
    expect(acimaDe11(aside)).toBe(false);
    expect(aside).toContain('text-[11px] font-bold');
    expect(aside).toContain('text-[8.5px]');
    const linha = FONTE.slice(FONTE.indexOf('function Linha('), FONTE.indexOf('interface Props'));
    expect(linha).toContain('h-4');
    expect(linha).toContain('truncate');
    const ini = FONTE.indexOf('function BlocoHead(');
    const secao = FONTE.slice(ini, FONTE.indexOf('\n}\n', ini)).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(secao).toContain('text-[9px]');
    expect(secao).toContain('uppercase');
    expect(secao).not.toMatch(/\bbg-/);
  });
});
