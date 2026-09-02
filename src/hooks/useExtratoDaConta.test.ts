import { describe, it, expect } from 'vitest';
import { somarAtePosicao, movimentoNaConta, fimDoMes, type LinhaDaPosicao } from './useExtratoDaConta';

/**
 * O que este teste protege — FIN-SALDO-POSICAO-01.
 *
 * ⚠ ESTA CONTA RESPONDE "O MÊS FECHA?". Errar para mais faz uma diferença
 * aparecer onde não há, e o operador procura um erro que não existe; errar para
 * menos faz o mês parecer fechado com dinheiro faltando. Foi a falta da DATA
 * nesta comparação que obrigou a arqueologia do Bradesco.
 */

const CONTA = 'conta-a';
const OUTRA = 'conta-b';

/* ⚠ `valor` POSITIVO e `sinal` à parte — como o banco de fato guarda. O helper
   antigo usava valor negativo, e por isso os casos passavam enquanto a soma
   estava errada: o teste espelhava o engano do código em vez de checá-lo. */
const l = (o: Partial<LinhaDaPosicao>): LinhaDaPosicao => ({
  valor: 100, sinal: -1, tipo_operacao: '2-Saídas', data_pagamento: '2026-08-10',
  conta_bancaria_id: CONTA, conta_destino_id: null, ...o,
});

describe('fimDoMes — data civil, sem fuso', () => {
  it('acha o último dia de cada caso que engana', () => {
    expect(fimDoMes(2026, 2)).toBe('2026-02-28');
    expect(fimDoMes(2028, 2)).toBe('2028-02-29');   // bissexto
    expect(fimDoMes(2026, 4)).toBe('2026-04-30');
    expect(fimDoMes(2026, 12)).toBe('2026-12-31');
    expect(fimDoMes(2026, 1)).toBe('2026-01-31');
  });
});

describe('movimentoNaConta — o sinal é COLUNA, valor é sempre positivo', () => {
  /* ⚠ O DEFEITO QUE ISTO TRAVA: somar `valor` cru fez o card mostrar
     +177.636,25 num mês em que o banco tirou 177.617,55 de Vera/Itaú. O módulo
     quase batia — e o "quase" era a soma das entradas contada do lado errado. */
  it('saída sai negativa mesmo com valor positivo', () => {
    expect(movimentoNaConta(l({ valor: 65000, sinal: -1 }), CONTA)).toBe(-65000);
  });
  it('entrada entra positiva', () => {
    expect(movimentoNaConta(l({ valor: 3.45, sinal: 1, tipo_operacao: '1-Entradas' }), CONTA)).toBe(3.45);
  });
  /* ⚠ A PERNA DE DESTINO É ENTRADA, qualquer que seja o sinal da linha. */
  it('a perna de destino é entrada, mesmo com sinal -1', () => {
    expect(movimentoNaConta(
      l({ valor: 18610.5, sinal: -1, tipo_operacao: '3-Transferências',
          conta_bancaria_id: OUTRA, conta_destino_id: CONTA }), CONTA)).toBe(18610.5);
  });
  /* ⚠ TRANSFERÊNCIA NÃO É ZERO NO SALDO — a régua do DRE não serve aqui. */
  it('transferência de saída reduz a conta', () => {
    expect(movimentoNaConta(
      l({ valor: 4779.63, sinal: -1, tipo_operacao: '3-Transferências' }), CONTA)).toBe(-4779.63);
  });
  it('sem sinal legível, o tipo responde', () => {
    expect(movimentoNaConta(l({ valor: 10, sinal: null, tipo_operacao: '1-Entradas' }), CONTA)).toBe(10);
    expect(movimentoNaConta(l({ valor: 10, sinal: null, tipo_operacao: '2-Saídas' }), CONTA)).toBe(-10);
  });
  /* Sem os dois, não movimenta: inventar sentido é pior que não somar. */
  it('sem sinal e sem tipo conhecido, não movimenta', () => {
    expect(movimentoNaConta(l({ valor: 10, sinal: null, tipo_operacao: 'outro' }), CONTA)).toBe(0);
  });

  /* ⚠ O CASO REAL, INTEIRO: Vera/Itaú/agosto conferido contra o PDF do banco. */
  it('reproduz o mês real: 208.561,46 − 177.617,55 = 30.943,91', () => {
    const linhas: LinhaDaPosicao[] = [
      l({ valor: 9.35, sinal: 1, tipo_operacao: '1-Entradas' }),
      l({ valor: 138510.62, sinal: -1, tipo_operacao: '2-Saídas' }),
      l({ valor: 39116.28, sinal: -1, tipo_operacao: '3-Transferências' }),
    ];
    const { ate } = somarAtePosicao(linhas, CONTA, '2026-08-31');
    expect(ate).toBeCloseTo(-177617.55, 2);
    expect(208561.46 + ate).toBeCloseTo(30943.91, 2);
  });
});

describe('somarAtePosicao — o corte é a data declarada', () => {
  it('soma o que está ATÉ a posição e conta o que vem depois', () => {
    const r = somarAtePosicao([
      l({ valor: 100, data_pagamento: '2026-08-05' }),
      l({ valor: 50,  data_pagamento: '2026-08-13' }),
      l({ valor: 900, data_pagamento: '2026-08-14' }),
      l({ valor: 900, data_pagamento: '2026-08-31' }),
    ], CONTA, '2026-08-13');
    expect(r.ate).toBe(-150);
    expect(r.depois).toBe(2);
  });

  /* ⚠ O DIA DA POSIÇÃO ENTRA. "Posição em 13/08" é o saldo ao FIM do dia 13 —
     excluí-lo faria o saldo do sistema ficar sistematicamente atrás do banco. */
  it('a linha do próprio dia da posição entra na soma', () => {
    const r = somarAtePosicao([l({ valor: 50, data_pagamento: '2026-08-13' })], CONTA, '2026-08-13');
    expect(r.ate).toBe(-50);
    expect(r.depois).toBe(0);
  });

  /* ⚠ A PERNA DE DESTINO É ENTRADA NESTA CONTA. Sem isto, toda transferência
     recebida viraria uma diferença inexplicável. */
  it('transferência recebida entra positiva', () => {
    const r = somarAtePosicao([
      l({ valor: 300, sinal: -1, tipo_operacao: '3-Transferências',
          conta_bancaria_id: OUTRA, conta_destino_id: CONTA }),
    ], CONTA, '2026-08-31');
    expect(r.ate).toBe(300);
  });

  it('a perna de origem mantém o sinal que o lançamento tem', () => {
    const r = somarAtePosicao([
      l({ valor: 300, sinal: -1, tipo_operacao: '3-Transferências',
          conta_bancaria_id: CONTA, conta_destino_id: OUTRA }),
    ], CONTA, '2026-08-31');
    expect(r.ate).toBe(-300);
  });

  /* ⚠ SEM DATA NÃO ENTRA E NÃO COBRA. Contá-la como "depois" pediria ao operador
     uma data mais recente que nunca resolveria o aviso. */
  it('linha sem data de pagamento é ignorada nos dois lados', () => {
    const r = somarAtePosicao([l({ data_pagamento: null }), l({ data_pagamento: '' })], CONTA, '2026-08-31');
    expect(r).toEqual({ ate: 0, depois: 0 });
  });

  it('entradas e saídas se somam pelo sinal que já trazem', () => {
    const r = somarAtePosicao([
      l({ valor: 1000, sinal: 1, tipo_operacao: '1-Entradas', data_pagamento: '2026-08-02' }),
      l({ valor: 250,  sinal: -1, data_pagamento: '2026-08-03' }),
    ], CONTA, '2026-08-31');
    expect(r.ate).toBe(750);
  });

  it('valor em texto é lido como número', () => {
    const r = somarAtePosicao([l({ valor: '100.50' })], CONTA, '2026-08-31');
    expect(r.ate).toBeCloseTo(-100.5, 2);
  });

  it('lista vazia não inventa saldo nem aviso', () => {
    expect(somarAtePosicao([], CONTA, '2026-08-31')).toEqual({ ate: 0, depois: 0 });
  });
});
