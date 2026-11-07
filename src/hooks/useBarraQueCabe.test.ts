/**
 * PIQUETE-VIGENCIA-01 (gate a 918): as contas da barra que vira compacta. A prova na tela é o gate (`mapa-validacao-volta-painel-pai` a
 * 918x519); aqui, as três contas que decidem: a largura que a barra INTEIRA pede (com o nome sem corte, até o teto), a largura livre ao
 * lado dos botões do topo, e o "cabe".
 */
import { describe, expect, it } from 'vitest';
import { cabeInteira, larguraInteiraDaBarra, larguraLivre } from './useBarraQueCabe';

describe('a barra do polígono que vira compacta', () => {
  it('a inteira soma o que falta ao nome cortado, até o teto do nome', () => {
    // a barra ocupa 390 com o nome espremido em 40 de 150: pede 390 + 110
    expect(larguraInteiraDaBarra({ scrollWidth: 390 }, { scrollWidth: 150, clientWidth: 40 }, 260)).toBe(500);
    // o nome de 400 só conta até o teto (260): pede 390 + 220
    expect(larguraInteiraDaBarra({ scrollWidth: 390 }, { scrollWidth: 400, clientWidth: 40 }, 260)).toBe(610);
    // o nome inteiro: só a barra
    expect(larguraInteiraDaBarra({ scrollWidth: 480 }, { scrollWidth: 150, clientWidth: 150 }, 260)).toBe(480);
    expect(larguraInteiraDaBarra({ scrollWidth: 480 }, null, 260)).toBe(480);
  });

  it('a livre é a faixa do topo menos os botões da direita e o espaço entre os dois', () => {
    expect(larguraLivre({ clientWidth: 491 }, { offsetWidth: 93 }, 8)).toBe(390);
    expect(larguraLivre({ clientWidth: 491 }, null, 8)).toBe(491);
  });

  it('cabe = a inteira não passa da livre (meio pixel de folga, a do gate)', () => {
    expect(cabeInteira(390, 390)).toBe(true);
    expect(cabeInteira(390, 390.5)).toBe(true);
    expect(cabeInteira(390, 391)).toBe(false);
    expect(cabeInteira(390, 500)).toBe(false);
  });
});
