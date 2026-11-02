import { describe, expect, it } from 'vitest';
import {
  alcasDosCortes, areaDoBancoHa, comAreaDesejada, cortesIguais, divisoesDosCortes, haDoBanco, membrosPorParecenca, montar, moverAlca, nomeSugerido,
} from './criarPiquetes';

const R = 6378137;
/** Um retângulo lat/lon com a área pedida pela fórmula do banco: R²·Δλ·(sen φn − sen φs). */
function retangulo(ha: number, lon0 = -47.9, latS = -15.51, dLon = 0.0112): GeoJSON.Polygon {
  const dl = (dLon * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((latS * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[lon0, latS], [lon0 + dLon, latS], [lon0 + dLon, latN], [lon0, latN], [lon0, latS]]] };
}

describe('a área é a do banco (D4)', () => {
  it('bate com a _fn_area_geodesica_ha (valores lidos do proto: 50,15 com furo; 174,59 quadrilátero)', () => {
    const oeste: GeoJSON.Polygon = { type: 'Polygon', coordinates: [
      [[-48.50, -15.50], [-48.495, -15.50], [-48.495, -15.49], [-48.50, -15.49], [-48.50, -15.50]],
      [[-48.498, -15.497], [-48.498, -15.493], [-48.496, -15.493], [-48.496, -15.497], [-48.498, -15.497]]] };
    const quad: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-47.95, -15.20], [-47.94, -15.20], [-47.937, -15.21], [-47.951, -15.214], [-47.95, -15.20]]] };
    expect(haDoBanco(areaDoBancoHa(oeste))).toBe(50.15);
    expect(haDoBanco(areaDoBancoHa(quad))).toBe(174.59);
  });
});

describe('cortar em partes iguais', () => {
  it('85,2 ha em grade 2 × 4 = 8 divisões de 10,65 ha (a prova do Gabriel)', () => {
    const g = retangulo(85.2);
    expect(areaDoBancoHa(g)).toBeCloseTo(85.2, 6);
    const m = montar(g);
    const ds = divisoesDosCortes(m, cortesIguais(m, 2, 4));
    expect(ds).toHaveLength(8);
    for (const d of ds) {
      expect(d.partes).toBe(1);
      expect(Math.abs(haDoBanco(d.areaHa) - 10.65)).toBeLessThanOrEqual(0.01);
    }
    expect(ds.reduce((s, d) => s + d.areaHa, 0)).toBeCloseTo(85.2, 4);
  });

  it('com FURO: 3 iguais, o furo continua furo na divisão que o contém e a área é sem ele', () => {
    const base = retangulo(90);
    const [[x0, y0], [x1], [, y1]] = base.coordinates[0];
    const cx = x0 + (x1 - x0) * 0.15, cy = (y0 + y1) / 2, r = (x1 - x0) * 0.04;
    const furo = [[cx - r, cy - r], [cx - r, cy + r], [cx + r, cy + r], [cx + r, cy - r], [cx - r, cy - r]];
    const g: GeoJSON.Polygon = { type: 'Polygon', coordinates: [base.coordinates[0], furo] };
    const total = areaDoBancoHa(g);
    expect(total).toBeLessThan(90);
    const m = montar(g);
    const ds = divisoesDosCortes(m, cortesIguais(m, 1, 3));
    expect(ds).toHaveLength(3);
    for (const d of ds) expect(Math.abs(d.areaHa - total / 3)).toBeLessThanOrEqual(0.01);
    const comFuro = ds.filter(d => d.geojson?.type === 'Polygon' && d.geojson.coordinates.length === 2);
    expect(comFuro).toHaveLength(1);
    expect(ds.reduce((s, d) => s + d.areaHa, 0)).toBeCloseTo(total, 4);
  });

  it('polígono côncavo (um U) cortado de través: a divisão sai em 2 partes e diz isso', () => {
    const u: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0.03, 0], [0.03, 0.01], [0.02, 0.01], [0.02, 0.003], [0.01, 0.003], [0.01, 0.01], [0, 0.01], [0, 0]]
      .map(([x, y]) => [-47.9 + x, -15.5 + y])] };
    const m = montar(u);
    const ds = divisoesDosCortes(m, cortesIguais(m, 2, 1));
    expect(ds.some(d => d.partes === 2)).toBe(true);
  });
});

describe('área desejada e alças', () => {
  it('pedir 20 ha na 1ª de 4: ela fica com 20 e as outras 3 dividem o resto', () => {
    const m = montar(retangulo(85.2));
    const r = comAreaDesejada(m, cortesIguais(m, 1, 4), 0, 0, 20);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ds = divisoesDosCortes(m, r.cortes);
    expect(haDoBanco(ds[0].areaHa)).toBeCloseTo(20, 2);
    for (const d of ds.slice(1)) expect(Math.abs(d.areaHa - 65.2 / 3)).toBeLessThanOrEqual(0.01);
  });

  it('pedir a faixa inteira (ou mais) recusa com a frase', () => {
    const m = montar(retangulo(85.2));
    const r = comAreaDesejada(m, cortesIguais(m, 1, 4), 0, 1, 85.2);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('abaixo de 85,20 ha');
  });

  it('a alça desliza a linha paralela e para antes da vizinha (nunca cruza)', () => {
    const m = montar(retangulo(85.2));
    const c = cortesIguais(m, 1, 4);
    const alcas = alcasDosCortes(m, c);
    expect(alcas).toHaveLength(3);
    const a = alcas[0];
    const longe = alcas[2].ponto; // arrastar a 1ª além da 3ª
    const c2 = moverAlca(m, c, a, [longe[0] + 0.01, longe[1]]);
    expect(c2.colunas[0][0]).toBeLessThan(c2.colunas[0][1]);
    expect(c2.colunas[0][1]).toBe(c.colunas[0][1]);
    expect(divisoesDosCortes(m, c2).every(d => d.areaHa > 0)).toBe(true);
  });
});

describe('os nomes', () => {
  it('sugere "<pasto>-A", "-B"… e, no grupo que já existe, o membro de mesmo nome primeiro', () => {
    expect(nomeSugerido('Modulo 03', 0)).toBe('Modulo 03-A');
    expect(nomeSugerido('P6', 7)).toBe('P6-H');
    expect(nomeSugerido('P6', 27)).toBe('P6-AB');
    const membros = [{ nome: '6A' }, { nome: '6B' }, { nome: 'Outro' }];
    expect(membrosPorParecenca('6B', membros).map(x => x.nome)).toEqual(['6B', '6A', 'Outro']);
    expect(membrosPorParecenca('P6-B', membros).map(x => x.nome)[0]).toBe('6B');
  });
});
