/**
 * OC-STATUS-LADO-01 (ADR-2026-20) — a pílula de pagamento da Central lê o estado PELO LADO, a marca âmbar
 * aparece quando o outro lado tem despesa em aberto, e o filtro "Pagamento" ganha "Despesas pendentes".
 *
 * ⚠ OS DADOS SÃO A VIEW APLICADA NO PROTO: 744c520e (RRCC, venda quitada com o frete de 20.615 aberto),
 *   b58bf556 (Vera, venda boitel não liquidada, adiantamento pago — sem despesa pendente) e 02be1a41 (Vera,
 *   abate não liquidado com o Fundersul de 2.165,49 aberto).
 * ⚠ O FILTRO VAI PELA URL (`f_liq`), que é de onde a tela o lê — o Select do Radix não abre em jsdom, e a
 *   URL é o contrato de verdade do filtro. BrowserRouter + `history`, como no `centralFazendaGlobal`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

const Q = '744c520e-0000-0000-0000-000000000001';
const B = 'b58bf556-0000-0000-0000-000000000002';
const G = '02be1a41-0000-0000-0000-000000000003';
const op = (id: string, tipo: string, data: string) => ({
  id, versao: 1, data_operacao: data, tipo_operacao: tipo, contraparte_id: null, fazenda_id: 'faz',
  status_comercial: 'fechada', rascunho: false, entrega_encerrada: false, qtd_negociada: 10,
  peso_total_negociado_kg: null, valor_acordado: 1000, valor_total: 1000,
});
const TABELAS: Record<string, unknown[]> = {
  zoo_operacoes_comerciais: [op(Q, 'venda', '2025-06-30'), op(B, 'venda', '2026-05-13'), op(G, 'abate', '2026-09-02')],
  fazendas: [{ id: 'faz', nome: 'Faz', codigo: 'F' }],
  vw_oc_operacao_liquidacao: [
    { operacao_id: Q, estado_liquidacao: 'quitada', base: 1252460.61, total_liquidado_valido: 1252460.61, despesas_pendentes: 20615 },
    { operacao_id: B, estado_liquidacao: 'nao_liquidada', base: 686857.46, total_liquidado_valido: 0, despesas_pendentes: 0 },
    { operacao_id: G, estado_liquidacao: 'nao_liquidada', base: 367783.4, total_liquidado_valido: 0, despesas_pendentes: 2165.49 },
  ],
};
function construtor(tabela: string) {
  const resposta = { data: TABELAS[tabela] ?? [], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
  b.then = (ok: (v: typeof resposta) => unknown) => Promise.resolve(resposta).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t), rpc: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Vera' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: '__global__', nome: 'Global' }, isGlobal: true }) }));
vi.mock('@/hooks/useOperacaoComercial', () => ({ useOperacaoComercial: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/operacao-comercial/central/ResumoOperacoesModal', () => ({ ResumoOperacoesModal: () => null }));

import { CentralOperacoesComerciais } from '@/components/operacao-comercial/central/CentralOperacoesComerciais';

function montar(url = '/v2') {
  window.history.replaceState(null, '', url);
  return render(<BrowserRouter><CentralOperacoesComerciais /></BrowserRouter>);
}
const visiveis = () => [Q, B, G].filter(id => document.querySelector(`td[title="${id}"]`));
const linhaDe = (id: string) => document.querySelector(`td[title="${id}"]`)?.closest('tr') ?? null;

describe('pilula de pagamento pelo lado', () => {
  it('marca ambar so onde ha despesa pendente, com o valor no title', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    const marcaQ = linhaDe(Q)?.querySelector('[data-testid="despesa-pendente"]');
    expect(marcaQ?.getAttribute('title')).toMatch(/Despesas pendentes: R\$\s20\.615,00/);
    expect(linhaDe(G)?.querySelector('[data-testid="despesa-pendente"]')).not.toBeNull();
    /* b58bf556: o adiantamento esta' pago — nada pendente do outro lado. */
    expect(linhaDe(B)?.querySelector('[data-testid="despesa-pendente"]')).toBeNull();
    /* O estado e' o do lado: a venda do frete aberto esta' PAGA (o frete nao a segura). */
    expect(linhaDe(Q)?.textContent).toContain('Paga');
  });
});

describe('filtro Pagamento', () => {
  it('"Despesas pendentes" mostra so as duas com despesa aberta, qualquer que seja o estado', async () => {
    montar('/v2?f_liq=__despesas_pendentes__');
    await waitFor(() => expect(new Set(visiveis())).toEqual(new Set([Q, G])));
  });

  it('um estado continua filtrando por estado (a busca sabe achar)', async () => {
    montar('/v2?f_liq=nao_liquidada');
    await waitFor(() => expect(new Set(visiveis())).toEqual(new Set([B, G])));
  });
});
