/**
 * P153b (D3, Gabriel 29/10) — "Casar e trocar a conta para <conta do extrato>": o em aberto de OUTRA conta, levado do "Procurar no
 * histórico", casa pelo `CasarComBancoModal` de sempre. A tela mostra a confirmação curta (a conta antes × depois; valor e data viram os do
 * extrato) e manda `trocar_conta: true` no item — quem troca é a `fn_espelho_casar`, NA MESMA TRANSAÇÃO do casar (migration 20261028115110,
 * provada em `supabase/tests/p153b_casar_trocando_a_conta_test.sql`). Sem a troca, nada muda: o item vai sem a chave e o botão é "Conciliar".
 * ⚠ A RPC É FALSA AQUI: só registra o que a tela pediu e devolve ok.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LevadoInicial } from './CasarComBancoModal';

const M = vi.hoisted(() => ({ chamadas: [] as { p_itens: Record<string, unknown>[]; p_simular?: boolean }[] }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: Record<string, unknown>[]; p_simular?: boolean }) => {
      if (fn !== 'fn_espelho_casar') return Promise.resolve({ data: null, error: null });
      M.chamadas.push(args);
      return Promise.resolve({ data: { ok: true, no_extrato: -142.72, soma: -142.72, itens: 1 }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e-agua', data: '2031-10-07', historico: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA', valor: -142.72 };
const AGUA: LevadoInicial = {
  lancamento_id: 'agua', descricao: 'Agua e Esgoto - Escritorio', fornecedor: 'Aguas Guariroba SA', valor_assinado: -500,
  usarValorDoBanco: true, data_vencimento: '2031-10-09', status_transacao: 'previsto',
};
const montar = (l: LevadoInicial) => render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[l]}
  nomeConta="Banco do Brasil" contaBancariaId="bb" onConciliado={() => {}} />);

beforeEach(() => { M.chamadas.length = 0; });

describe('P153b — casar trocando a conta', () => {
  it('a confirmação curta: a conta antes × depois, e que valor e data viram os do extrato', async () => {
    montar({ ...AGUA, trocarConta: { de: 'Itaú Personalité', para: 'Banco do Brasil' } });
    const t = screen.getByTestId('levado-troca-conta');
    expect(t.textContent).toBe('Conta: Itaú Personalité → Banco do Brasil · ao conciliar, o lançamento passa para a conta do extrato; valor e data viram os do extrato.');
    /* o valor do banco no campo (o casar de hoje com valor diferente: "era R$ 500,00") */
    expect((screen.getByLabelText('Valor de Agua e Esgoto - Escritorio') as HTMLInputElement).value).toBe('142,72');
    expect(await screen.findByRole('button', { name: 'Conciliar e trocar a conta' })).toBeInTheDocument();
  });

  it('a simulação e a gravação levam `trocar_conta: true` no item — a troca é da RPC, na mesma transação', async () => {
    montar({ ...AGUA, trocarConta: { de: 'Itaú Personalité', para: 'Banco do Brasil' } });
    await waitFor(() => expect(M.chamadas.some((c) => c.p_simular === true)).toBe(true));
    expect(M.chamadas.find((c) => c.p_simular === true)?.p_itens).toEqual([{ lancamento_id: 'agua', valor: 142.72, trocar_conta: true }]);
    const botao = await screen.findByRole('button', { name: 'Conciliar e trocar a conta' });
    await waitFor(() => expect(botao).not.toBeDisabled());
    fireEvent.click(botao);
    await waitFor(() => expect(M.chamadas.some((c) => c.p_simular === false)).toBe(true));
    expect(M.chamadas.find((c) => c.p_simular === false)?.p_itens).toEqual([{ lancamento_id: 'agua', valor: 142.72, trocar_conta: true }]);
  });

  it('sem a troca (mesma conta): o item vai sem a chave, sem a confirmação, e o botão é "Conciliar"', async () => {
    montar(AGUA);
    await waitFor(() => expect(M.chamadas.some((c) => c.p_simular === true)).toBe(true));
    expect(M.chamadas.find((c) => c.p_simular === true)?.p_itens).toEqual([{ lancamento_id: 'agua', valor: 142.72 }]);
    expect(screen.queryByTestId('levado-troca-conta')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Conciliar' })).toBeInTheDocument();
  });
});
