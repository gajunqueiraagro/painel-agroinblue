import { describe, expect, it } from 'vitest';
import { arrumarRotulos, distanciaABorda, pontoMaisInterno, type Aneis, type CandidatoRotulo } from './rotulosDoMapa';

/* um pasto em L: o retângulo envolvente é 0..100 × 0..100, mas a perna grossa fica embaixo (y 60..100) e a fina à esquerda (x 0..20) */
const L_FORMA: Aneis = [[[0, 0], [20, 0], [20, 60], [100, 60], [100, 100], [0, 100], [0, 0]]];

describe('pontoMaisInterno (fix1 2): o polo de inacessibilidade, não o centro do retângulo', () => {
  it('quadrado: o centro, com folga = meio lado', () => {
    const p = pontoMaisInterno([[[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]]);
    expect(p.x).toBeCloseTo(20, 0);
    expect(p.y).toBeCloseTo(20, 0);
    expect(p.folga).toBeCloseTo(20, 0);
  });
  it('pasto em L: o centro do retângulo (50,50) cai FORA; o ponto escolhido fica dentro, na perna grossa', () => {
    expect(distanciaABorda(50, 50, L_FORMA)).toBeLessThan(0);
    const p = pontoMaisInterno(L_FORMA);
    expect(distanciaABorda(p.x, p.y, L_FORMA)).toBeGreaterThan(15);
    expect(p.y).toBeGreaterThan(60);
    expect(p.folga).toBeGreaterThan(15);
  });
  it('pasto comprido e torto (faixa diagonal): o ponto fica dentro da faixa', () => {
    const faixa: Aneis = [[[0, 0], [10, 0], [110, 100], [100, 100], [0, 0]]];
    const p = pontoMaisInterno(faixa);
    expect(distanciaABorda(p.x, p.y, faixa)).toBeGreaterThan(2);
  });
});

const cand = (id: string, x: number, y: number, extra: Partial<CandidatoRotulo> = {}): CandidatoRotulo => ({
  id, x, y, folga: 30, larguraDoPasto: 120, larguraNome: 30, alturaNome: 12, larguraSub: 44, alturaSub: 11, prioridade: 10, ...extra,
});

describe('arrumarRotulos (fix1 2): dois rótulos nunca se sobrepõem', () => {
  it('longe um do outro: os dois completos', () => {
    const m = arrumarRotulos([cand('a', 100, 100), cand('b', 300, 100)]);
    expect(m.get('a')).toBe('completo');
    expect(m.get('b')).toBe('completo');
  });
  it('vizinhos (P5B/P5A): o maior fica completo; o menor perde o kg/ha e fica só com o nome', () => {
    const m = arrumarRotulos([cand('P5A', 100, 100, { prioridade: 50 }), cand('P5B', 100, 120, { prioridade: 20 })]);
    expect(m.get('P5A')).toBe('completo');
    expect(m.get('P5B')).toBe('nome');
  });
  it('em cima um do outro: o menor some (o nome só no hover)', () => {
    const m = arrumarRotulos([cand('T-A1', 100, 100, { prioridade: 50 }), cand('Massay', 104, 102, { prioridade: 20 })]);
    expect(m.get('T-A1')).toBe('completo');
    expect(m.get('Massay')).toBe('oculto');
  });
  it('pasto estreito na tela: o kg/ha não cabe dentro dele → só o nome; nem o nome → oculto', () => {
    expect(arrumarRotulos([cand('a', 100, 100, { larguraDoPasto: 36 })]).get('a')).toBe('nome');
    expect(arrumarRotulos([cand('a', 100, 100, { larguraDoPasto: 20 })]).get('a')).toBe('oculto');
    expect(arrumarRotulos([cand('a', 100, 100, { folga: 2 })]).get('a')).toBe('oculto');
  });
  it('pasto torto: a caixa que sai do polígono não entra, mesmo cabendo na largura do retângulo envolvente', () => {
    const faixa: Aneis = [[[0, 0], [10, 0], [110, 100], [100, 100], [0, 0]]];
    const p = pontoMaisInterno(faixa);
    const c = cand('faixa', p.x, p.y, { folga: p.folga + 6, larguraDoPasto: 110, dentro: (x, y) => distanciaABorda(x, y, faixa) >= 0 });
    expect(arrumarRotulos([c]).get('faixa')).toBe('oculto');
    expect(arrumarRotulos([{ ...c, dentro: undefined }]).get('faixa')).not.toBe('oculto');
  });
  it('as caixas postas nunca se cruzam (varredura de 40 rótulos numa grade apertada)', () => {
    const cs: CandidatoRotulo[] = [];
    for (let i = 0; i < 40; i++) cs.push(cand(`p${i}`, 50 + (i % 8) * 28, 50 + Math.floor(i / 8) * 18, { prioridade: 40 - i }));
    const m = arrumarRotulos(cs);
    const caixas = cs.filter(c => m.get(c.id) !== 'oculto').map(c => {
      const comp = m.get(c.id) === 'completo';
      const w = comp ? Math.max(c.larguraNome, c.larguraSub ?? 0) : c.larguraNome;
      const h = comp ? c.alturaNome + c.alturaSub : c.alturaNome;
      return { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - h / 2, y1: c.y + h / 2 };
    });
    expect(caixas.length).toBeGreaterThan(5);
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i]; const b = caixas[j];
      expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
    }
  });
});
