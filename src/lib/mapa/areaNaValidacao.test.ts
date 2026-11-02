/* MAPA-DICAS-01 (área) — a frase da barra, o sinal da diferença, o perímetro e a visibilidade do rótulo de área. */
import { describe, expect, it } from 'vitest';
import { areaDoBancoHa, haDoBanco } from './criarPiquetes';
import { areaDoMapaHa, dicaDasMedidas, diferencaComSinal, fraseDoCadastro, perimetroDoMapaM, rotuloDeAreaVisivel, textoHa1, textoHa2, ZOOM_MINIMO_DO_ROTULO_DE_AREA } from './areaNaValidacao';

const quadrado: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-54, -19], [-53.99, -19], [-53.99, -19.01], [-54, -19.01], [-54, -19]]] };

describe('área do mapa = a do banco', () => {
  it('2 casas, a mesma conta de areaDoBancoHa', () => {
    expect(areaDoMapaHa(quadrado)).toBe(haDoBanco(areaDoBancoHa(quadrado)));
    expect(areaDoMapaHa(quadrado)).toBeGreaterThan(100);
  });
  it('geometria vazia ou que não é polígono: nulo (nunca 0)', () => {
    expect(areaDoMapaHa({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(areaDoMapaHa({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });
  it('perímetro = soma dos lados do anel externo', () => {
    const p = perimetroDoMapaM(quadrado)!;
    expect(p).toBeCloseTo(4326.58, 0);
    expect(perimetroDoMapaM({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });
});

describe('textos', () => {
  it('pt-BR, vírgula e milhar', () => {
    expect(textoHa2(12.84)).toBe('12,84 ha');
    expect(textoHa2(9999.99)).toBe('9.999,99 ha');
    expect(textoHa1(12.84)).toBe('12,8 ha');
  });
  it('a diferença leva o sinal e 2 casas', () => {
    expect(diferencaComSinal(12.84, 12.5)).toBe('+0,34');
    expect(diferencaComSinal(12.5, 13)).toBe('-0,50');
    expect(diferencaComSinal(12.5, 12.5)).toBe('0,00');
  });
  it('"cadastro" só com pasto de área oficial diferente', () => {
    expect(fraseDoCadastro(12.84, 12.5)).toBe('cadastro 12,50 (+0,34)');
    expect(fraseDoCadastro(12.5, 13)).toBe('cadastro 13,00 (-0,50)');
    expect(fraseDoCadastro(12.5, 12.5)).toBeNull();
    expect(fraseDoCadastro(12.5, 12.5004)).toBeNull(); // igual em 2 casas
    expect(fraseDoCadastro(12.84, null)).toBeNull();
    expect(fraseDoCadastro(12.84, 0)).toBeNull();
    expect(fraseDoCadastro(null, 12.5)).toBeNull();
  });
  it('a dica leva o perímetro em metros', () => {
    expect(dicaDasMedidas(4120.4, 12.84, 12.5)).toBe('Perímetro: 4.120 m · Área do mapa: 12,84 ha · Área do cadastro: 12,50 ha');
    expect(dicaDasMedidas(null, null, null)).toBe('Perímetro: —');
  });
});

describe('rótulo de área no mapa', () => {
  it('some no zoom afastado, mesmo com o polígono grande na tela', () => {
    expect(rotuloDeAreaVisivel(500, 400, ZOOM_MINIMO_DO_ROTULO_DE_AREA - 1, '12,8 ha')).toBe(false);
  });
  it('aparece com zoom ≥ 14 e polígono com largura e altura que comportem', () => {
    expect(rotuloDeAreaVisivel(500, 400, ZOOM_MINIMO_DO_ROTULO_DE_AREA, '12,8 ha')).toBe(true);
  });
  it('polígono pequeno na tela (estreito ou baixo) não leva a linha', () => {
    expect(rotuloDeAreaVisivel(40, 400, 16, '12,8 ha')).toBe(false);
    expect(rotuloDeAreaVisivel(500, 30, 16, '12,8 ha')).toBe(false);
  });
});
