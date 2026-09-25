/**
 * OC-STATUS-LADO-01 — a lista de parcelas em aberto do Resumo separa o LADO da operação das despesas.
 *
 * ⚠ O CASO É O DO PROTO: RRCC 744c520e, venda com o principal inteiro recebido e o frete de 20.615 aberto
 *   (compromisso dac75bf9, conta de saída). Antes o frete aparecia em "Falta receber" — a OC dizendo que
 *   ainda ia RECEBER o frete que ela deve PAGAR. E uma compra no espelho.
 * ⚠ O SUPABASE É UM CONSTRUTOR FALSO por tabela; o lado vem da conta do plano do compromisso.
 */
import { describe, it, expect, vi } from 'vitest';

const VENDA = '744c520e-0000-0000-0000-000000000001';
const COMPRA = 'cfdc0000-0000-0000-0000-000000000002';
const TABELAS: Record<string, unknown[]> = {
  vw_oc_lotes_recebimento: [], zoo_operacao_movimentacoes: [],
  vw_oc_operacao_liquidacao: [
    { operacao_id: VENDA, valor_total: 0, total_liquidado_valido: 1252460.61, saldo_operacao: 0, estado_liquidacao: 'quitada' },
    { operacao_id: COMPRA, valor_total: 0, total_liquidado_valido: 0, saldo_operacao: 71900, estado_liquidacao: 'nao_liquidada' },
  ],
  vw_oc_operacao_compromissos_resumo: [
    { operacao_id: VENDA, obrigacao_total: 1273075.61, entrada_obrigacao: 1252460.61, saida_obrigacao: 20615, entrada_liquidado: 1252460.61, saida_liquidado: 0 },
    { operacao_id: COMPRA, obrigacao_total: 72900, entrada_obrigacao: 1000, saida_obrigacao: 71900, entrada_liquidado: 0, saida_liquidado: 0 },
  ],
  vw_oc_parcelas_materializacao: [
    { operacao_id: VENDA, compromisso_id: 'frete', sequencia: 1, valor: 20615, vencimento: '2025-07-15', saldo_titulo: 20615, status: 'prevista', titulo_status_transacao: null },
    { operacao_id: COMPRA, compromisso_id: 'principal', sequencia: 1, valor: 71900, vencimento: '2026-09-10', saldo_titulo: 71900, status: 'materializada', titulo_status_transacao: 'programado' },
    { operacao_id: COMPRA, compromisso_id: 'devolucao', sequencia: 1, valor: 1000, vencimento: '2026-09-12', saldo_titulo: 1000, status: 'materializada', titulo_status_transacao: 'programado' },
  ],
  vw_oc_compromissos_resumo: [
    { compromisso_id: 'frete', plano_conta_id: 'pc-saida' },
    { compromisso_id: 'principal', plano_conta_id: 'pc-saida' },
    { compromisso_id: 'devolucao', plano_conta_id: 'pc-entrada' },
  ],
  financeiro_plano_contas: [{ id: 'pc-saida', tipo_operacao: '2-Saídas' }, { id: 'pc-entrada', tipo_operacao: '1-Entradas' }],
};
function construtor(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: TABELAS[tabela] ?? [], error: null }).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t) } }));

import { carregarResumoOC } from '@/v2/lib/ocResumo';

const op = (id: string, tipo: string) => ({ id, tipo_operacao: tipo, data_operacao: '2025-06-30', contraparte_id: null,
  qtd_negociada: 10, valor_acordado: null, valor_total: 0, status_comercial: 'fechada' });

describe('parcelas em aberto separadas por lado', () => {
  it('venda 744c520e: o frete sai de "Falta receber" e vai para as despesas', async () => {
    const r = await carregarResumoOC('cli', [op(VENDA, 'venda')], () => 'x');
    const b = r.blocos[0];
    expect(b.faltaPagar).toHaveLength(0);
    expect(b.despesasEmAberto.map(p => p.valor)).toEqual([20615]);
  });

  it('compra no espelho: o principal fica no lado; a entrada (devolucao) vira despesa', async () => {
    const r = await carregarResumoOC('cli', [op(COMPRA, 'compra')], () => 'x');
    const b = r.blocos[0];
    expect(b.faltaPagar.map(p => p.valor)).toEqual([71900]);
    expect(b.despesasEmAberto.map(p => p.valor)).toEqual([1000]);
  });
});
