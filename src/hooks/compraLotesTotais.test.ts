/**
 * OC-VENDA-ENTREGAS-01a — o total da Negociacao e' o numero que o banco grava em `valor_acordado`.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' A 232c05aa: o banco (`_oc_valor_do_lote` arredonda cada lote, `oc_salvar_lotes`
 *   soma) gravou 2.366.601,26 e a tela, que somava os lotes crus, mostrava 2.366.601,25. O caso afirma o numero do banco
 *   E que ele NAO e' o da soma crua — sem a segunda assercao, uma soma que continuasse crua passaria em outro fixture.
 */
import { describe, it, expect } from 'vitest';
import { totaisDosLotes, centavosDoLote } from '@/hooks/useCompraLotes';

const L = (quantidade: string, pesoMedioKg: string, valorInformado: string, criterioValor = 'kg') =>
  ({ quantidade, pesoMedioKg, valorInformado, criterioValor });

describe('total dos lotes = valor_acordado do banco', () => {
  it('232c05aa: sete lotes a R$/kg somam 2.366.601,26 (cada lote arredondado), e nao os 2.366.601,25 da soma crua', () => {
    const lotes = [
      L('178', '248,21', '12,80'), L('139', '239,78', '12,80'), L('193', '232,37', '12,80'), L('183', '234,77', '12,80'),
      L('69', '231,22', '13,00'), L('6', '234,77', '12,80'), L('11', '189,82', '12,00'),
    ];
    const t = totaisDosLotes(lotes);
    expect(t.valorNegociado).toBe(2366601.26);
    const somaCrua = 178 * 248.21 * 12.8 + 139 * 239.78 * 12.8 + 193 * 232.37 * 12.8 + 183 * 234.77 * 12.8
      + 69 * 231.22 * 13 + 6 * 234.77 * 12.8 + 11 * 189.82 * 12;
    expect(Math.round(somaCrua * 100) / 100).toBe(2366601.25);
    expect(t.animais).toBe(779);
  });

  it('meio centavo arredonda para cima como o ROUND do Postgres, mesmo quando o ponto flutuante cai um fio abaixo', () => {
    expect(1.005 * 100).toBeLessThan(100.5);
    expect(centavosDoLote('total', 0, 0, 1.005)).toBe(101);
    expect(centavosDoLote('cabeca', 3, 0, 1500)).toBe(450000);
  });
});
