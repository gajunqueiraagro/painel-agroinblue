/**
 * DA-NOTA-ETAPAS-01 (NAV-VOLTA-ORIGEM-01) — o Novo lançamento aberto a partir do "+ Da nota" fica POR CIMA da nota: a nota não fecha no gesto
 * (está numa `<Camada>`), fechar sem salvar volta a ela; salvar fecha a nota também (volta a quem a abriu). Preso pela fonte do Financeiro.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fonte = readFileSync(join(__dirname, 'FinanceiroV2Tab.tsx'), 'utf8');
const trecho = (de: string, ate: string) => { const i = fonte.indexOf(de); return fonte.slice(i, fonte.indexOf(ate, i)); };

describe('o "+ Da nota" → Novo lançamento volta à nota', () => {
  it('o onAbrirNoLancamento empilha "lanc" sobre "nota" e NÃO fecha a nota', () => {
    const t = trecho('onAbrirNoLancamento={(prefill) => {', 'onAbrirRegistrada=');
    expect(t).toMatch(/camadas\.abrir\('lanc', 'nota'\); lancSobreANota\.current = true;/);
    expect(t).not.toMatch(/setNotaAberta\(null\)/);
  });
  it('a nota mora numa <Camada> (fica montada e invisível por baixo)', () => {
    expect(fonte).toMatch(/<Camada coberta=\{camadas\.coberta\('nota'\)\}>\s*<NotaFiscalDialog/);
  });
  it('fechar o lançamento: salvou = a nota fecha também (e volta a quem a abriu); fechou = a nota fica', () => {
    const t = trecho('const salvou = salvouPorCimaDaRegra.current;', 'onSave=');
    expect(t).toMatch(/if \(lancSobreANota\.current\) \{\s*lancSobreANota\.current = false;\s*if \(salvou\) \{\s*setNotaAberta\(null\); camadas\.fechar\('nota', 'salvou', idAberto\);/);
  });
});
