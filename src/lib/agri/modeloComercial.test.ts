/**
 * O que este teste trava — quem responde pelo modelo comercial é o MAPA, não o nome da cultura.
 *
 * ⚠ O CASO QUE IMPORTA É O DA CULTURA DESCONHECIDA: ela tem de cair em `saca_estocavel`, que é o
 * comportamento que todas as telas já tinham. Um mapa que devolvesse `undefined` faria a tela
 * decidir sozinha — e cada tela decidiria diferente.
 */
import { describe, it, expect } from 'vitest';
import {
  modeloDaCultura, ehEntregaDireta, temClassesDeQualidade,
} from '@/lib/agri/modeloComercial';

describe('o modelo comercial de uma cultura', () => {
  it('amendoim, milho e soja estocam em saca', () => {
    for (const c of ['amendoim', 'milho', 'soja']) {
      expect(modeloDaCultura(c)).toBe('saca_estocavel');
      expect(ehEntregaDireta(c)).toBe(false);
      expect(temClassesDeQualidade(c)).toBe(true);
    }
  });

  it('mandioca é entrega direta paga por rendimento', () => {
    expect(modeloDaCultura('mandioca')).toBe('entrega_direta_rendimento');
    expect(ehEntregaDireta('mandioca')).toBe(true);
    /* ⚠ SEM CLASSES: a indústria pesa e mede o amido; não há grão bom nem roça a classificar. */
    expect(temClassesDeQualidade('mandioca')).toBe(false);
  });

  it('cana é entrega direta paga por peso', () => {
    expect(modeloDaCultura('cana')).toBe('entrega_direta_peso');
    expect(ehEntregaDireta('cana')).toBe(true);
  });

  /* ⚠ CULTURA NOVA NÃO QUEBRA A TELA: cai no padrão, que é o que ela fazia antes do mapa. */
  it('cultura desconhecida, vazia ou nula cai no padrão da saca', () => {
    for (const c of ['sorgo', '', null, undefined]) {
      expect(modeloDaCultura(c)).toBe('saca_estocavel');
      expect(ehEntregaDireta(c)).toBe(false);
    }
  });

  /* ⚠ O BANCO GUARDA TEXTO: espaço e caixa não podem mudar a resposta. */
  it('não se deixa enganar por espaço nem por maiúscula', () => {
    expect(modeloDaCultura('  Mandioca ')).toBe('entrega_direta_rendimento');
    expect(modeloDaCultura('AMENDOIM')).toBe('saca_estocavel');
  });
});
