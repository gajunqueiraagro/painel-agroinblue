import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/* VG-LEGADO-OCULTO-01 (Gabriel 03/11 07:50) → VISAO-GERAL-02 (mock aprovado, 03/11 11:09): os blocos de números legados/errados SAÍRAM
   da Visão Geral (não ficam mais escondidos atrás de uma chave), e a tela segue a ordem do mock: cartões → Área | Caixa → Fazendas →
   atenção e atalhos → um bloco por atividade. O chip "Financeiro (em construção)" não volta. */
const fonte = readFileSync(path.resolve(__dirname, 'V2Home.tsx'), 'utf8');

describe('Visão Geral sem os blocos legados, na ordem do mock (VISAO-GERAL-02)', () => {
  it('os blocos legados não estão mais no JSX, nem atrás de chave', () => {
    for (const bloco of ["'Fechamento Pecuária — no mês'", "'Pecuária no mês'", 'title="Produção"', 'title="Eficiência"',
      'title="Financeiro Produtivo"', 'title="Estrutura Financeira"', 'title="Disponível em conta"', 'MOSTRAR_BLOCOS_LEGADOS']) {
      expect(fonte.includes(bloco), bloco).toBe(false);
    }
  });

  it('a ordem (VISAO-GERAL-04 de 08/11): cartões → [mapas | atenção] → [Área | Caixa] → Fazendas → blocos por atividade', () => {
    const marcos = ['<CartoesDoTopo', '<MiniaturaDaFazenda', '<PrecisaDeAtencao', "'Área no mês'", "'Caixa no mês'", '<TabelaFazendasVG', '<BlocosPorAtividade'];
    const posicoes = marcos.map((m) => fonte.indexOf(m));
    for (const [i, p] of posicoes.entries()) expect(p, marcos[i]).toBeGreaterThan(0);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it('o chip "Financeiro (em construção)" não é desenhado', () => {
    expect(fonte).not.toMatch(/>\s*Financeiro \(em construção\)\s*</);
  });

  it('título de bloco em sentence case (era 11px em caixa alta espaçada), no Card da Geo pastos (VISAO-GERAL-03)', () => {
    expect(fonte).not.toMatch(/<h3 className="text-\[11px\] font-black uppercase tracking-widest/);
    expect(fonte).toContain('<Card titulo={title}');
  });
});
