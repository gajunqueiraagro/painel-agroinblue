import { describe, it, expect } from 'vitest';
import { outrasCargasDaNota } from '@/hooks/useCargaMandioca';

/**
 * A trava do ICMS: "uma vez por nota". Ela pergunta se OUTRA carga da NF já levou o imposto —
 * e a resposta é `outrasCargasDaNota(...).length > 0`.
 */
describe('outrasCargasDaNota', () => {
  /* ⚠ O CASO QUE JUSTIFICA O ARQUIVO, e ele é o bug de 21/09/2026. Depois da fusão é uma carga
     por nota: a única colheita ativa da NF é a que está aberta. Se ela contar, a trava conclui
     que a nota já foi servida e esconde o ICMS da própria carga — R$ 0,00 com cadeado sobre
     R$ 2.470,26. */
  it('carga reaberta não conta contra si mesma', () => {
    expect(outrasCargasDaNota(['C1'], ['C1'])).toEqual([]);
  });

  /* ⚠ E A REGRA CONTINUA VALENDO ONDE DEVE — é o outro lado, e sem ele o conserto viraria a
     remoção da trava. Duas cargas reais na mesma nota: a segunda ainda trava. */
  it('outra carga da mesma nota continua travando', () => {
    expect(outrasCargasDaNota(['C1', 'C2'], ['C2'])).toEqual(['C1']);
  });

  /* Carga NOVA não tem colheita ainda: tudo que existe na nota é "outra carga". */
  it('carga nova vê todas as cargas da nota', () => {
    expect(outrasCargasDaNota(['C1'], [])).toEqual(['C1']);
    expect(outrasCargasDaNota([], [])).toEqual([]);
  });

  /* ⚠ AS DUAS METADES DE UMA CARGA NÃO FUNDIDA saem juntas: antes da fusão a carga tinha duas
     colheitas, e excluir só uma deixaria a outra travando o próprio ICMS. */
  it('uma carga com várias colheitas sai inteira', () => {
    expect(outrasCargasDaNota(['A', 'B', 'C'], ['A', 'B'])).toEqual(['C']);
    expect(outrasCargasDaNota(['A', 'B'], ['A', 'B'])).toEqual([]);
  });
});
