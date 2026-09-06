/**
 * O que este teste trava — quando uma divergência de reconciliação é ALARME e quando é
 * o arredondamento do próprio relatório.
 *
 * ⚠ O CASO É REAL, ago/2026, homologação do Raul: a família INVESTIMENTOS acusou R$ 0,01.
 * Os itens somam 54.962,05; o relatório impresso traz 54.962,04, porque arredonda o
 * subtotal. Em vermelho, a tela dizia que o parser tinha errado e que o arquivo não
 * prestava — e um alarme que grita por um centavo ensina o operador a ignorar alarmes.
 * ⚠ MAS NÃO SOME: cinco centavos viram âmbar com o nome do que são; acima disso volta ao
 * vermelho, porque aí dupla contagem e linha perdida voltam a ser hipóteses vivas.
 */
import { describe, it, expect } from 'vitest';

const TOL = 0.05;
/** A mesma regra da tela: TODA divergência tem de caber na tolerância. */
const soArredondamento = (difs: number[]) =>
  difs.length > 0 && difs.every(d => Math.abs(d) <= TOL);

describe('tolerância de arredondamento na reconciliação do custeio', () => {
  it('o centavo do INVESTIMENTOS de ago/2026 é arredondamento', () => {
    expect(soArredondamento([54962.05 - 54962.04])).toBe(true);
  });

  it('cinco centavos ainda é arredondamento; seis não é', () => {
    expect(soArredondamento([0.05])).toBe(true);
    expect(soArredondamento([0.06])).toBe(false);
  });

  it('o sinal não importa — o impresso pode arredondar para cima', () => {
    expect(soArredondamento([-0.01])).toBe(true);
  });

  it('uma divergência grande contamina o conjunto, mesmo com centavos ao lado', () => {
    /* Se QUALQUER família diverge de verdade, o alarme é vermelho para todas: a hipótese
       de dupla contagem vale para o arquivo, não para uma linha. */
    expect(soArredondamento([0.01, 0.02, 1250.00])).toBe(false);
  });

  it('sem divergência nenhuma não há faixa de arredondamento a mostrar', () => {
    /* `every` sobre lista vazia devolve `true`; sem a guarda de tamanho, um arquivo que
       fecha perfeito exibiria "diferença de arredondamento" — dizendo que há diferença
       onde não há. */
    expect(soArredondamento([])).toBe(false);
  });
});
