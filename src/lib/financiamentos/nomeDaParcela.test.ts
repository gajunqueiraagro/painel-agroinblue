/**
 * PARC-LIVRES-01 passo 5 — o nome da parcela na tela: o "i/N" vem do CONTRATO e nunca aparece duas vezes.
 */
import { describe, it, expect } from 'vitest';
import { lerParcelasDosLancamentos, nomeEParcela } from './nomeDaParcela';

const P = { numero: 2, total: 3 };

describe('nomeEParcela', () => {
  it('sem parcela de contrato: a descrição como está, sem "i/N" (mesmo que o texto termine em "2/3")', () => {
    expect(nomeEParcela('Manutenção Cercas 2/3', null)).toEqual({ nome: 'Manutenção Cercas 2/3', parcela: null, inteiro: 'Manutenção Cercas 2/3' });
    expect(nomeEParcela(null, undefined)).toEqual({ nome: '', parcela: null, inteiro: '' });
  });
  it('forma nova "Descrição 2/3": o "i/N" sai do nome e fica na parte própria — uma vez só', () => {
    expect(nomeEParcela('Manutenção Cercas 2/3', P)).toEqual({ nome: 'Manutenção Cercas', parcela: '2/3', inteiro: 'Manutenção Cercas 2/3' });
  });
  it('forma antiga "… - Parcela 2/3" e variações ("· Parcela", "Parc.", "- 2/3")', () => {
    for (const d of ['Manutenção Cercas - Parcela 2/3', 'Manutenção Cercas · Parcela 2/3', 'Manutenção Cercas Parc. 2/3', 'Manutenção Cercas - 2/3', 'Manutenção Cercas — parcela 2 / 3']) {
      expect(nomeEParcela(d, P), d).toMatchObject({ nome: 'Manutenção Cercas', parcela: '2/3' });
    }
  });
  it('forma do motor "Parcela 2/3 Descrição"', () => {
    expect(nomeEParcela('Parcela 2/3 Protocolo IATF', P)).toMatchObject({ nome: 'Protocolo IATF', parcela: '2/3' });
  });
  it('nome posto à mão, sem "i/N": o nome inteiro + o "i/N" do contrato', () => {
    expect(nomeEParcela('Balança Pesagem', P)).toEqual({ nome: 'Balança Pesagem', parcela: '2/3', inteiro: 'Balança Pesagem 2/3' });
  });
  it('"i/N" DIFERENTE do contrato fica no nome (a tela não corrige texto); "12/3" não é "2/3"', () => {
    expect(nomeEParcela('Adensado/Núcleo - 1/3', P)).toMatchObject({ nome: 'Adensado/Núcleo - 1/3', parcela: '2/3' });
    expect(nomeEParcela('Compra 12/3', P)).toMatchObject({ nome: 'Compra 12/3', parcela: '2/3' });
    expect(nomeEParcela('Lote 2/3 do Zé', P)).toMatchObject({ nome: 'Lote 2/3 do Zé', parcela: '2/3' });
  });
  it('descrição que é só o "i/N": nome vazio, inteiro = o "i/N"', () => {
    expect(nomeEParcela('2/3', P)).toEqual({ nome: '', parcela: '2/3', inteiro: '2/3' });
  });
});

describe('lerParcelasDosLancamentos', () => {
  it('lê `{ id: [numero, total] }`', () => {
    const m = lerParcelasDosLancamentos({ a: [2, 3], b: [1, 1] });
    expect(m.get('a')).toEqual({ numero: 2, total: 3 });
    expect(m.size).toBe(2);
  });
  it('entrada torta é ignorada, nunca inventada', () => {
    expect(lerParcelasDosLancamentos(null).size).toBe(0);
    expect(lerParcelasDosLancamentos([[1, 2]]).size).toBe(0);
    expect(lerParcelasDosLancamentos({ a: [2], b: ['2', 3], c: [0, 3], d: [1.5, 3], e: 'x', f: [2, 3] }).size).toBe(1);
  });
});
