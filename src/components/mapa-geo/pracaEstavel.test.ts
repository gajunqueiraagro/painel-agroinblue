/* MAPA-PRACA-ESTAVEL-01 (homologação 02/11 21:54, Agnaldo › Sta. Tereza › Modulo 03): as regras puras da estabilidade da praça. */
import { describe, expect, it } from 'vitest';
import { ladoDaDica } from '@/components/mapa-geo/DicaDoMapa';
import { resumoDoRascunho } from '@/components/mapa-geo/CriarPiquetes';
import { configPadrao, rotuloCurtoDaDivisao } from '@/hooks/useCriarPiquetes';

describe('a dica nunca cai sobre a lista das divisões', () => {
  const lista = { left: 1096, right: 1346, top: 242 };
  it('botão em cima da lista (Desfazer, Mais): a dica abre à esquerda', () => {
    expect(ladoDaDica({ left: 1110, right: 1170, bottom: 210 }, lista)).toBe('left');
    expect(ladoDaDica({ left: 1000, right: 1050, bottom: 210 }, lista)).toBe('left'); // a dica de 260 px encostaria na lista
  });
  it('botão longe da lista, ou sem nada a evitar: embaixo (o padrão)', () => {
    expect(ladoDaDica({ left: 400, right: 480, bottom: 210 }, lista)).toBe('bottom');
    expect(ladoDaDica({ left: 1110, right: 1170, bottom: 210 }, null)).toBe('bottom');
  });
});

describe('a letra da divisão é a MESMA no mapa e na lista (a parte depois do nome do pasto)', () => {
  it('"Modulo 03-C" é "C"; nome livre fica inteiro; sem nome, a letra da posição', () => {
    expect(rotuloCurtoDaDivisao('Modulo 03-C', 'Modulo 03', 1)).toBe('C');
    expect(rotuloCurtoDaDivisao('Piquete do Brejo', 'Modulo 03', 1)).toBe('Piquete do Brejo');
    expect(rotuloCurtoDaDivisao('  ', 'Modulo 03', 2)).toBe('C');
  });
});

describe('o rascunho diz o que traz (continuar é escolha do operador; o padrão ao abrir é Losango)', () => {
  it('padrão = "Losango 60 m · 4 · cocho"; círculo 25 m · 8', () => {
    const c = configPadrao('Modulo 03');
    expect(c.formato).toBe('regular'); expect(c.n).toBe(4);
    expect(resumoDoRascunho(c)).toBe('Losango 60 m · 4 · cocho');
    expect(resumoDoRascunho({ ...c, formato: 'circulo', n: 8, medida: { tipo: 'raio', metros: 25 } })).toBe('Círculo 25 m · 8 · cocho');
  });
});
