/** MAPA-LISTA-COMPACTA-01 (Gabriel 03/11 11:01, Validação da Pureza) — a etiqueta do vínculo ao lado do nome e o rótulo de praça que cede ao do pasto. */
import { describe, expect, it } from 'vitest';
import { ehRotuloDePraca, etiquetaDoVinculo, pracasEscondidas } from '@/lib/mapa/areaNaValidacao';

describe('MAPA-LISTA-COMPACTA-01 · a etiqueta do vínculo', () => {
  it('pasto de outro nome: o nome do pasto; o mesmo nome (sem caixa/espaço): "pasto"; sem pasto: o selo de sempre', () => {
    expect(etiquetaDoVinculo('12-Retiro', 'P12A', 'sem vínculo')).toBe('P12A');
    expect(etiquetaDoVinculo('P_01 ', 'p_01', 'sem vínculo')).toBe('pasto');
    expect(etiquetaDoVinculo('Praça P_16', null, 'sem vínculo')).toBe('sem vínculo');
    expect(etiquetaDoVinculo(null, null, 'Reserva legal')).toBe('Reserva legal');
  });
});

describe('MAPA-LISTA-COMPACTA-01 · o rótulo de praça no mapa', () => {
  it('é praça pelo tipo ou pelo nome que começa com "Praça"/"Praca"; "Prado" e "Piq. da praça" não', () => {
    expect(ehRotuloDePraca('praca_alimentacao', 'TA11')).toBe(true);
    expect(ehRotuloDePraca('outra', 'Praça P_16')).toBe(true);
    expect(ehRotuloDePraca('manga', 'praca P_09')).toBe(true);
    expect(ehRotuloDePraca('pasto', 'Prado')).toBe(false);
    expect(ehRotuloDePraca('outra', 'Piq. da praça')).toBe(false);
  });
  it('a praça cujo rótulo encosta no de um pasto não é desenhada (o pasto vence); a que não encosta fica', () => {
    const pasto = { id: 'p', left: 100, top: 100, right: 130, bottom: 110 };
    const sobre = { id: 'a', left: 110, top: 105, right: 160, bottom: 114 };
    const longe = { id: 'b', left: 300, top: 300, right: 340, bottom: 309 };
    const encosta = { id: 'c', left: 130, top: 100, right: 170, bottom: 109 }; // borda com borda: não sobrepõe
    expect([...pracasEscondidas([sobre, longe, encosta], [pasto])]).toEqual(['a']);
    expect(pracasEscondidas([sobre], []).size).toBe(0);
  });
});
