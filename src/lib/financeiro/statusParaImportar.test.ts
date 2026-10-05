import { describe, it, expect } from 'vitest';
import { statusParaImportar, importaComoRealizado } from './statusFinanceiro';

/**
 * FIN-IMPORT-EXCEL-STATUS-01a — SEM DATA DE PAGAMENTO, NUNCA REALIZADO.
 * ⚠ NASCE DO NJ, 05/10/2026: 226 previsões de outubro gravadas como realizadas sem data (858.240,65), porque o importador
 * tinha `status ?? 'realizado'`. A função é o dono da decisão; o importador só consulta.
 */
describe('statusParaImportar — o dono do status da linha importada', () => {
  it('com data de pagamento e sem status na planilha: realizado', () => {
    expect(statusParaImportar({ dataPagamento: '2026-10-05', statusPlanilha: null })).toBe('realizado');
  });
  it('com data de pagamento e a planilha dizendo realizado: realizado', () => {
    expect(statusParaImportar({ dataPagamento: '2026-10-05', statusPlanilha: 'realizado' })).toBe('realizado');
  });
  it('sem data de pagamento: recusada, com o motivo', () => {
    expect(statusParaImportar({ dataPagamento: null, statusPlanilha: null })).toEqual({ recusada: 'sem_data_pagamento' });
  });
  /* ⚠ O CASO QUE A REGRA DO GABRIEL NOMEIA: "pago" na coluna Status NÃO substitui a data. O parser entrega "pago",
     "liquidado" e "realizado" como 'realizado'. */
  it('a planilha diz pago/realizado mas não traz data: recusada', () => {
    expect(statusParaImportar({ dataPagamento: null, statusPlanilha: 'realizado' })).toEqual({ recusada: 'sem_data_pagamento' });
    expect(statusParaImportar({ dataPagamento: '', statusPlanilha: 'realizado' })).toEqual({ recusada: 'sem_data_pagamento' });
    expect(statusParaImportar({ dataPagamento: '   ', statusPlanilha: 'realizado' })).toEqual({ recusada: 'sem_data_pagamento' });
  });
  /* "Sim", "Confirmado" e vazio chegam do parser como `null` (fora do vocabulário); `undefined` é a coluna ausente. */
  it('status fora do vocabulário (vazio, "Sim", "Confirmado") sem data: recusada', () => {
    for (const s of [null, undefined, 'Sim', 'Confirmado', '']) {
      expect(statusParaImportar({ dataPagamento: null, statusPlanilha: s })).toEqual({ recusada: 'sem_data_pagamento' });
      expect(statusParaImportar({ dataPagamento: undefined, statusPlanilha: s })).toEqual({ recusada: 'sem_data_pagamento' });
    }
  });
  it('a planilha diz "a pagar" (previsto) sem data: recusada por falta de data', () => {
    expect(statusParaImportar({ dataPagamento: null, statusPlanilha: 'previsto' })).toEqual({ recusada: 'sem_data_pagamento' });
  });
  /* Só realizado tem data de pagamento: "a pagar" com data contradiz a regra dos dois lados, e não é gravada. */
  it('a planilha diz "a pagar" (previsto) COM data: recusada com motivo próprio', () => {
    expect(statusParaImportar({ dataPagamento: '2026-10-05', statusPlanilha: 'previsto' })).toEqual({ recusada: 'a_pagar_com_data' });
  });
  it('NUNCA devolve realizado sem data — varredura de todas as combinações', () => {
    const datas = [null, undefined, '', ' ', '2026-10-05'];
    const status = [null, undefined, '', 'realizado', 'previsto', 'Sim', 'pago'];
    let realizados = 0;
    for (const d of datas) for (const s of status) {
      const r = statusParaImportar({ dataPagamento: d, statusPlanilha: s });
      if (importaComoRealizado(r)) { realizados++; expect((d ?? '').trim()).not.toBe(''); }
    }
    /* a busca sabe achar: há realizados na varredura (os com data, fora o "previsto") */
    expect(realizados).toBe(6);
  });
});
