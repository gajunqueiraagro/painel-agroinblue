import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/* VG-LEGADO-OCULTO-01 (Gabriel 03/11 07:50) — na Visão Geral ficam só Área no mês (com a distribuição por fazenda) e Caixa no
   mês. Os blocos de números legados/errados e o chip "Financeiro (em construção)" não aparecem até a VISAO-GERAL-02. */
const fonte = readFileSync(path.resolve(__dirname, 'V2Home.tsx'), 'utf8');

describe('Visão Geral sem os blocos legados (VG-LEGADO-OCULTO-01)', () => {
  it('a chave dos blocos legados está desligada', () => {
    expect(fonte).toMatch(/const MOSTRAR_BLOCOS_LEGADOS = false;/);
  });

  it('todo bloco legado está atrás da chave, e Área e Caixa ficam antes dela', () => {
    const chave = fonte.indexOf('{MOSTRAR_BLOCOS_LEGADOS && (<>');
    const fim = fonte.indexOf('</>)}', chave);
    expect(chave).toBeGreaterThan(0);
    for (const bloco of ["'Fechamento Pecuária — no mês'", "'Pecuária no mês'", 'title="Produção"', 'title="Eficiência"',
      'title="Financeiro Produtivo"', 'title="Estrutura Financeira"', 'title="Disponível em conta"']) {
      const onde = fonte.indexOf(bloco);
      expect(onde, bloco).toBeGreaterThan(chave);
      expect(onde, bloco).toBeLessThan(fim);
    }
    for (const fica of ["'Área no mês'", "'Caixa no mês'", 'Distribuição de áreas por fazenda']) {
      const onde = fonte.indexOf(fica);
      expect(onde, fica).toBeGreaterThan(0);
      expect(onde, fica).toBeLessThan(chave);
    }
  });

  it('o chip "Financeiro (em construção)" não é desenhado', () => {
    expect(fonte).not.toMatch(/>\s*Financeiro \(em construção\)\s*</);
  });
});
