/**
 * OC-LIQ-SINAL-01 (B) — o Resumo da Central lê PELO LADO DA OPERAÇÃO, como o modal da OC.
 *
 * ⚠ OS NÚMEROS SÃO DO PROTO, medidos em 25/09/2026 em `vw_oc_operacao_compromissos_resumo`:
 *   c80ebe9e (Vera, abate 17/01/2025) — entrada 107.367,46 (principal + a Graxaria de entrada), recebido
 *     102.311,46; saída 5.772,83 (a devolução de 5.056 + o Fundersul de 716,83), toda liquidada. O resumo
 *     antigo dizia Valor 113.140,29 e Pago 108.084,29 — os dois lados somados.
 *   b58bf556 (Vera, venda boitel 13/05/2026) — entrada 686.857,46, NADA recebido; saída 107.150,94 (o
 *     adiantamento), paga. O resumo antigo dizia "paga 14%" sem um real recebido do boitel.
 * ⚠ O SUPABASE É UM CONSTRUTOR FALSO que responde por tabela. O ESTADO da OC (`estado_liquidacao`) não
 *   muda neste PR — é o OC-STATUS-LADO-01; aqui se trava o que o resumo mostra.
 */
import { describe, it, expect, vi } from 'vitest';

const C80 = 'c80ebe9e-e00e-48c6-a7bd-9af27e4f6362';
const B58 = 'b58bf556-4dfd-4ab9-b6fe-60a4f1598d21';
const COMPRA = 'f56c50d3-0000-0000-0000-000000000001';
const LEGADA = 'legada00-0000-0000-0000-000000000002';

const TABELAS: Record<string, unknown[]> = {
  vw_oc_lotes_recebimento: [],
  vw_oc_parcelas_materializacao: [],
  zoo_operacao_movimentacoes: [],
  vw_oc_operacao_liquidacao: [
    { operacao_id: C80, valor_total: 0, total_liquidado_valido: 108084.29, saldo_operacao: 5056, estado_liquidacao: 'parcial' },
    { operacao_id: B58, valor_total: 0, total_liquidado_valido: 107150.94, saldo_operacao: 660460.5, estado_liquidacao: 'parcial' },
    { operacao_id: COMPRA, valor_total: 0, total_liquidado_valido: 892645, saldo_operacao: 0, estado_liquidacao: 'quitada' },
    { operacao_id: LEGADA, valor_total: 0, total_liquidado_valido: 1000, saldo_operacao: 4000, estado_liquidacao: 'parcial' },
  ],
  vw_oc_operacao_compromissos_resumo: [
    { operacao_id: C80, obrigacao_total: 113140.29, entrada_obrigacao: 107367.46, saida_obrigacao: 5772.83, entrada_liquidado: 102311.46, saida_liquidado: 5772.83 },
    { operacao_id: B58, obrigacao_total: 794008.40, entrada_obrigacao: 686857.46, saida_obrigacao: 107150.94, entrada_liquidado: 0, saida_liquidado: 107150.94 },
    { operacao_id: COMPRA, obrigacao_total: 892645, entrada_obrigacao: 0, saida_obrigacao: 892645, entrada_liquidado: 0, saida_liquidado: 892645 },
    { operacao_id: LEGADA, obrigacao_total: 0, entrada_obrigacao: 0, saida_obrigacao: 0, entrada_liquidado: 0, saida_liquidado: 0 },
  ],
};
function construtor(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: TABELAS[tabela] ?? [], error: null }).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t) } }));

import { carregarResumoOC, valoresPeloLado, totalLinhas, type OcResumoLinha } from '@/v2/lib/ocResumo';

const op = (id: string, tipo: string, acordado: number | null) => ({
  id, tipo_operacao: tipo, data_operacao: '2026-05-13', contraparte_id: null, qtd_negociada: 20,
  valor_acordado: acordado, valor_total: 0, status_comercial: 'fechada',
});
async function linha(id: string, tipo: string, acordado: number | null = null): Promise<OcResumoLinha> {
  const r = await carregarResumoOC('cli', [op(id, tipo, acordado)], () => 'Frigorífico');
  const l = r.blocos[0].naoEntrou[0] ?? r.blocos[0].entrou[0];
  if (!l) throw new Error('linha nao montada');
  return l;
}

describe('Resumo pelo lado da OC', () => {
  it('c80ebe9e (abate): valor e recebido so das ENTRADAS; a devolucao e o Fundersul vao para Despesas', async () => {
    const l = await linha(C80, 'abate');
    expect(l).toMatchObject({ valor: 107367.46, pago: 102311.46, faltaPagar: 5056, despesas: 5772.83 });
    /* O que o resumo NAO pode mais dizer: os dois lados somados. */
    expect(l.valor).not.toBe(113140.29);
    expect(l.pago).not.toBe(108084.29);
  });

  it('b58bf556 (venda boitel): nada recebido e o adiantamento nao conta como recebimento', async () => {
    const l = await linha(B58, 'venda');
    expect(l).toMatchObject({ valor: 686857.46, pago: 0, faltaPagar: 686857.46, despesas: 107150.94 });
    /* O estado da OC ainda e' o de antes (OC-STATUS-LADO-01); a porcentagem ja' le' o lado. */
    expect(l.situacao).toBe('paga 0%');
  });

  it('compra: o lado e a SAIDA — nada muda de sentido; despesas (entradas) zero', async () => {
    const l = await linha(COMPRA, 'compra');
    expect(l).toMatchObject({ valor: 892645, pago: 892645, faltaPagar: 0, despesas: 0 });
  });

  it('sem compromisso: o caminho de antes (valor acordado e a base da view), despesas em traco', async () => {
    const l = await linha(LEGADA, 'venda', 5000);
    expect(l).toMatchObject({ valor: 5000, pago: 1000, faltaPagar: 4000, despesas: null });
  });

  it('os totais somam Despesas, e o traco conta como nada', () => {
    const base = { operacao_id: 'x', data: null, descricao: '', fornecedor: '', tipo: 'venda', qtdNegociada: 1, qtdRecebida: 0,
      dataRecebimento: { primeira: null, n: 0 }, valor: 10, pago: 5, faltaPagar: 5, situacao: '', tomSituacao: 'parcial' as const };
    expect(totalLinhas([{ ...base, despesas: 3 }, { ...base, despesas: null }]).despesas).toBe(3);
  });
});

describe('valoresPeloLado', () => {
  it('pagar a mais nao e dever negativo', () => {
    expect(valoresPeloLado('venda', { obrigacao_total: 10, entrada_obrigacao: 10, saida_obrigacao: 0, entrada_liquidado: 12, saida_liquidado: 0 })?.falta).toBe(0);
  });
  it('sem obrigacao nenhuma devolve null (quem chama usa o caminho de antes)', () => {
    expect(valoresPeloLado('venda', undefined)).toBeNull();
    expect(valoresPeloLado('venda', { obrigacao_total: 0, entrada_obrigacao: 0, saida_obrigacao: 0, entrada_liquidado: 0, saida_liquidado: 0 })).toBeNull();
  });
});
