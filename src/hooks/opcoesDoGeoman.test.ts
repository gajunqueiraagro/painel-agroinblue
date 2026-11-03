/** MAPA-DICA-GEOMAN-01 — a dica do Geoman que segue o cursor tapava o ponto do clique: as opções únicas do Geoman (usadas no desenho, na
 *  edição e nas opções globais) desligam as dicas, com e sem encaixe. */
import { describe, expect, it } from 'vitest';
import { opcoesDoGeoman } from '@/hooks/useEdicaoDoPoligono';

describe('opcoesDoGeoman', () => {
  it('desliga as dicas flutuantes com e sem encaixe', () => {
    expect(opcoesDoGeoman(true).tooltips).toBe(false);
    expect(opcoesDoGeoman(false).tooltips).toBe(false);
  });
  it('o resto segue: encaixe e cruzamento permitido', () => {
    expect(opcoesDoGeoman(false).snappable).toBe(false);
    expect(opcoesDoGeoman(true).allowSelfIntersection).toBe(true);
  });
});
