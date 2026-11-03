/** MAPA-CROMO-01 — quem aparece em cada zona do mapa: o modo tira os botões e o painel; o aviso é uma barra, não uma pílula. */
import { describe, expect, it } from 'vitest';
import { frasesDoAviso, zonasVisiveis, type EstadoDoCromo } from './cromoDoMapa';

const base: EstadoDoCromo = { editando: false, piquetesAberto: false, pedindoPoligono: false, selecionado: false };

describe('zonasVisiveis', () => {
  it('sem modo e sem seleção: só os botões', () => {
    expect(zonasVisiveis(base)).toEqual({ aviso: false, botoes: true, painel: false });
  });
  it('polígono selecionado sem modo: botões + painel', () => {
    expect(zonasVisiveis({ ...base, selecionado: true })).toEqual({ aviso: false, botoes: true, painel: true });
  });
  it('Adicionar › Área pedindo o polígono: o aviso entra e os botões SAEM (o defeito da Sede)', () => {
    expect(zonasVisiveis({ ...base, pedindoPoligono: true })).toEqual({ aviso: true, botoes: false, painel: false });
  });
  it('pedido já com polígono escolhido: o aviso sai, volta o cromo normal', () => {
    expect(zonasVisiveis({ ...base, pedindoPoligono: true, selecionado: true })).toEqual({ aviso: false, botoes: true, painel: true });
  });
  it('edição ou piquetes: nem botões, nem painel, nem aviso (a barra do modo é a de cima)', () => {
    for (const e of [{ editando: true }, { piquetesAberto: true }]) {
      expect(zonasVisiveis({ ...base, ...e, selecionado: true, pedindoPoligono: true })).toEqual({ aviso: false, botoes: false, painel: false });
    }
  });
});

describe('frasesDoAviso', () => {
  it('a curta leva o tipo inteiro (nunca cortado) e a inteira vai no title', () => {
    const f = frasesDoAviso('Sede / benfeitorias');
    expect(f.curta).toBe('Marcar como Sede / benfeitorias: escolha o polígono');
    expect(f.inteira).toContain('Sede / benfeitorias');
    expect(f.inteira.length).toBeGreaterThan(f.curta.length);
  });
});

describe('frasesDoAviso — MAPA-AREA-TIPOS-02 (desenhar nova | escolher existente)', () => {
  it('desenhar diz que vai desenhar e que ao gravar já fica com o tipo; escolher é a de sempre', () => {
    const d = frasesDoAviso('Manga', 'desenhar');
    expect(d.curta).toBe('Marcar como Manga: desenhe a área nova');
    expect(d.inteira).toContain('ao gravar ela já fica como Manga');
    expect(frasesDoAviso('Manga').curta).toBe('Marcar como Manga: escolha o polígono');
  });
});
