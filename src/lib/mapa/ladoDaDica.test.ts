/** FECH-TOPO-02 acerto 2 — a dica do mapa sempre dentro do quadro (o lado que couber). Medidas sintéticas: mapa 600×400, dica 220×150. */
import { describe, expect, it } from 'vitest';
import { AFASTAMENTO_DA_DICA, FOLGA_DA_BORDA, ladoDaDica, type Ponto } from './ladoDaDica';

const MAPA = { w: 600, h: 400 };
const DICA = { w: 220, h: 150 };
/* a caixa que o Leaflet desenha com a direção e o deslocamento (Tooltip._setPosition: right = x+dx; left = x−w+dx; centrada em y+dy) */
const caixa = (m: Ponto) => {
  const l = ladoDaDica(m, MAPA, DICA);
  const [dx, dy] = l.deslocamento;
  const esq = l.direcao === 'right' ? m.x + dx : m.x - DICA.w + dx;
  const topo = m.y + dy - DICA.h / 2;
  return { l, esq, dir: esq + DICA.w, topo, base: topo + DICA.h };
};
const dentro = (c: ReturnType<typeof caixa>) =>
  c.esq >= FOLGA_DA_BORDA && c.dir <= MAPA.w - FOLGA_DA_BORDA && c.topo >= FOLGA_DA_BORDA && c.base <= MAPA.h - FOLGA_DA_BORDA;

describe('ladoDaDica', () => {
  it('no meio: à direita do mouse, na altura dele', () => {
    const c = caixa({ x: 200, y: 200 });
    expect(c.l).toEqual({ direcao: 'right', deslocamento: [AFASTAMENTO_DA_DICA, 0] });
    expect(dentro(c)).toBe(true);
  });
  it('perto da borda direita: vira para a esquerda (antes saía cortada)', () => {
    const c = caixa({ x: 500, y: 200 });
    expect(c.l.direcao).toBe('left');
    expect(c.l.deslocamento[0]).toBe(-AFASTAMENTO_DA_DICA);
    expect(dentro(c)).toBe(true);
  });
  it('perto do topo e da base: desliza só o necessário para caber', () => {
    const topo = caixa({ x: 100, y: 10 });
    expect(topo.topo).toBe(FOLGA_DA_BORDA);
    expect(dentro(topo)).toBe(true);
    const base = caixa({ x: 100, y: 395 });
    expect(base.base).toBe(MAPA.h - FOLGA_DA_BORDA);
    expect(dentro(base)).toBe(true);
  });
  it('a varredura do quadro inteiro: em nenhum ponto a dica sai do mapa', () => {
    let pontos = 0;
    for (let x = 0; x <= MAPA.w; x += 10) for (let y = 0; y <= MAPA.h; y += 10) { expect(dentro(caixa({ x, y }))).toBe(true); pontos++; }
    expect(pontos).toBe(61 * 41);
  });
  it('mapa mais baixo que a dica: presa no topo (o nome sempre à vista)', () => {
    const l = ladoDaDica({ x: 100, y: 50 }, { w: 600, h: 100 }, DICA);
    expect(50 + l.deslocamento[1] - DICA.h / 2).toBe(FOLGA_DA_BORDA);
  });
});
