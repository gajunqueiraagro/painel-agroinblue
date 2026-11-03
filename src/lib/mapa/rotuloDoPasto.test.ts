/**
 * MAPA-ROTULO-POR-CAMADA-01 — a 2ª linha do rótulo segue a camada; vazio/sem fechamento nas de rebanho; o uso fora da pecuária; a área
 * no rótulo por escolha; e a camada "Área (ha)" (cor por faixa, legenda das faixas).
 */
import { describe, expect, it } from 'vitest';
import { rotuloDoPastoNaCamada, textoDaArea, type PastoParaRotulo } from './rotuloDoPasto';
import { corDaFaixaDeArea, corDoPasto, FAIXAS_DE_AREA, legendaDaCamada } from './camadasDoMapa';

const P: PastoParaRotulo = { temFechamento: true, cabecas: 120, pesoMedioKg: 450, kgHa: 2160, atividade: 'cria', foraDaPecuaria: null,
  areaCadastroHa: 25.3, areaMapaHa: 25.35 };

describe('a 2ª linha do rótulo pela camada', () => {
  it('situação e lotação: UA/ha principal, kg/ha no title', () => {
    expect(rotuloDoPastoNaCamada('situacao', P, false)).toEqual({ sub: '4,74 UA/ha', titulo: '4,74 UA/ha (2.160 kg/ha)' });
    expect(rotuloDoPastoNaCamada('kg_ha', P, false).sub).toBe('4,74 UA/ha');
  });
  it('cabeças, atividade, tipo de área, área', () => {
    expect(rotuloDoPastoNaCamada('cabecas', P, false).sub).toBe('120 cab.');
    expect(rotuloDoPastoNaCamada('atividade', P, false).sub).toBe('Cria');
    expect(rotuloDoPastoNaCamada('tipo_area', P, false).sub).toBe('Pasto');
    expect(rotuloDoPastoNaCamada('area', P, false).sub).toBe('25,3 ha');
  });
  it('vazio e sem fechamento nas camadas de rebanho; a área segue valendo', () => {
    expect(rotuloDoPastoNaCamada('cabecas', { ...P, cabecas: 0 }, false).sub).toBe('vazio');
    expect(rotuloDoPastoNaCamada('situacao', { ...P, temFechamento: false }, false).sub).toBe('—');
    expect(rotuloDoPastoNaCamada('area', { ...P, cabecas: 0 }, false).sub).toBe('25,3 ha');
  });
  it('fora da pecuária diz o uso (nunca vazio), e na área diz a área', () => {
    const lav = { ...P, cabecas: 0, foraDaPecuaria: 'Lavoura · Soja' };
    expect(rotuloDoPastoNaCamada('cabecas', lav, false).sub).toBe('Lavoura · Soja');
    expect(rotuloDoPastoNaCamada('area', lav, false).sub).toBe('25,3 ha');
  });
  it('"Mostrar área no rótulo" soma a área em qualquer camada (na de área já é ela)', () => {
    expect(rotuloDoPastoNaCamada('cabecas', P, true).sub).toBe('120 cab. · 25,3 ha');
    expect(rotuloDoPastoNaCamada('area', P, true).sub).toBe('25,3 ha');
  });
  it('a área do mapa aparece quando difere mais de 1 % da oficial', () => {
    expect(textoDaArea(25.3, 25.35)).toBe('25,3 ha');
    expect(textoDaArea(25.3, 25.6)).toBe('25,3 ha · mapa 25,6');
    expect(textoDaArea(null, 25.6)).toBe('mapa 25,6 ha');
    expect(textoDaArea(null, null)).toBe('—');
  });
});

describe('a camada "Área (ha)"', () => {
  it('cor por faixa de tamanho, qualquer que seja o uso; a legenda são as faixas', () => {
    expect(corDaFaixaDeArea(5)).toBe(FAIXAS_DE_AREA[0].cor);
    expect(corDaFaixaDeArea(30)).toBe(FAIXAS_DE_AREA[2].cor);
    expect(corDaFaixaDeArea(250)).toBe(FAIXAS_DE_AREA[4].cor);
    expect(corDoPasto('area', { foraDaPecuaria: 'lavoura', areaHa: 30, temFechamento: true, kgHa: 0, cabecas: 0, faixa: null, atividade: null }))
      .toBe(FAIXAS_DE_AREA[2].cor);
    expect(legendaDaCamada('area', [], ['lavoura']).map(i => i.rotulo)).toEqual(['< 10 ha', '10–25', '25–50', '50–100', '100+ ha', 'Sem área no cadastro']);
  });
});
