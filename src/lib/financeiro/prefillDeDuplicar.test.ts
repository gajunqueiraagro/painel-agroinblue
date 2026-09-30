/**
 * PR-FIN-DUPLICAR-ABRE-MODAL-01 — o mapeamento do "Duplicar", campo a campo. O que ele COPIA, o que ele NÃO copia, e a
 * conta pela direção. O dialog montado de verdade está em `src/components/financeiro-v2/duplicarAbreModal.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { prefillDeDuplicar } from './prefillDeDuplicar';

const BASE = {
  id: 'orig', cliente_id: 'nj', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', conta_destino_id: null,
  data_competencia: '2026-09-01', data_vencimento: '2026-09-10', data_pagamento: '2026-09-10', ano_mes: '2026-09',
  valor: 506.84, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'realizado', descricao: 'Vivo Casa',
  macro_custo: 'Custeio Produtivo', grupo_custo: 'Despesas Administrativas', centro_custo: 'Administração',
  subcentro: 'Telefonia e Internet', escopo_negocio: 'pecuaria', observacao: 'obs', numero_documento: '000123',
  tipo_documento: 'Fatura', favorecido_id: 'tel', forma_pagamento: 'boleto', dados_pagamento: 'linha',
  origem_lancamento: 'ofx', recorrencia_id: 'rec-1', plano_conta_id: 'pl-tel', safra_id: 'sf-2526', cultura: 'mandioca',
  fase: 'colheita', cancelado: false, editado_manual: true,
} as LancamentoV2;

describe('prefillDeDuplicar — o que COPIA', () => {
  it('copia os dados, o vencimento, a classificação inteira e o status do original (realizado continua realizado)', () => {
    expect(prefillDeDuplicar(BASE)).toEqual({
      fazenda_id: 'f-pur', conta_bancaria_id: 'bb', conta_destino_id: undefined,
      data_competencia: '2026-09-01', data_vencimento: '2026-09-10', valor: 506.84, tipo_operacao: '2-Saídas',
      status_transacao: 'realizado', descricao: 'Vivo Casa', numero_documento: '000123', tipo_documento: 'Fatura',
      favorecido_id: 'tel', plano_conta_id: 'pl-tel', macro_custo: 'Custeio Produtivo',
      grupo_custo: 'Despesas Administrativas', centro_custo: 'Administração', subcentro: 'Telefonia e Internet',
      safra_id: 'sf-2526', cultura: 'mandioca', fase: 'colheita', escopo_negocio: 'pecuaria', observacao: 'obs',
      forma_pagamento: 'boleto', dados_pagamento: 'linha',
    });
  });
  it('a descrição vai SEM o prefixo "(Cópia)"', () => {
    expect(prefillDeDuplicar(BASE).descricao).toBe('Vivo Casa');
  });
});

describe('prefillDeDuplicar — o que NÃO copia', () => {
  it('nem id, nem pagamento, nem origem, recorrência, vínculo ou auditoria', () => {
    const p = prefillDeDuplicar(BASE);
    for (const k of ['id', 'data_pagamento', 'origem_lancamento', 'recorrencia_id', 'conciliado_em', 'editado_manual',
      'cliente_id', 'ano_mes', 'sinal', 'cancelado']) expect(p).not.toHaveProperty(k);
  });
  it('cultura, fase e atividade vão SEMPRE — vazias quando o original não tem —, para o dialog não herdar as da sessão', () => {
    const p = prefillDeDuplicar({ ...BASE, cultura: null, fase: null, escopo_negocio: null } as LancamentoV2);
    expect(p.cultura).toBe('');
    expect(p.fase).toBe('');
    expect(p.escopo_negocio).toBe('');
  });
  it('campo vazio no banco vira ausência (o dialog cai no próprio padrão)', () => {
    const p = prefillDeDuplicar({ ...BASE, data_vencimento: null, observacao: '', safra_id: null } as LancamentoV2);
    expect(p.data_vencimento).toBeUndefined();
    expect(p.observacao).toBeUndefined();
    expect(p.safra_id).toBeUndefined();
  });
});

describe('prefillDeDuplicar — a conta pela direção', () => {
  it('entrada: a conta é a de DESTINO (e só cai para a bancária sem ela), entregue na chave que o dialog lê primeiro', () => {
    const e = { ...BASE, tipo_operacao: '1-Entradas', conta_bancaria_id: 'outra', conta_destino_id: 'sicredi' } as LancamentoV2;
    expect(prefillDeDuplicar(e).conta_bancaria_id).toBe('sicredi');
    expect(prefillDeDuplicar(e).conta_destino_id).toBeUndefined();
    expect(prefillDeDuplicar({ ...e, conta_destino_id: null } as LancamentoV2).conta_bancaria_id).toBe('outra');
  });
  it('saída: a conta bancária; transferência: origem e destino como estão', () => {
    expect(prefillDeDuplicar(BASE).conta_bancaria_id).toBe('bb');
    const t = { ...BASE, tipo_operacao: '3-Transferências', conta_bancaria_id: 'bb', conta_destino_id: 'sicredi' } as LancamentoV2;
    expect(prefillDeDuplicar(t)).toMatchObject({ conta_bancaria_id: 'bb', conta_destino_id: 'sicredi' });
  });
});
