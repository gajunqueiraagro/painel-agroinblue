/**
 * CONC-SUGESTOES-V2 — REGRA DE FINANCIAMENTO (b) e ADIANTAMENTO (Gabriel 26/11 07:07 / 07:09) no "Casar com o banco".
 * A parcela inteira levada (amortização + juros da MESMA parcela) e o banco com outro valor → a pergunta do motivo:
 *   ajuste de juros (PADRÃO: os juros fecham com o banco, o principal fica) · multa/juros de atraso (só pagando a mais) ·
 *   desconto/bônus (só pagando a menos; grava pelo `fn_casar_parcela_com_motivo`). Pago antes do vencimento: parcela inteira ×
 *   amortização parcial (só a amortização, com o valor dela — o "Conciliar com diferença" liga com falta).
 * O banco falso faz a conta da `fn_espelho_casar` (soma = Σ −|valor|; ok com |diferença| ≤ 0,005). Números SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const B = vi.hoisted(() => ({ alvo: -16831.69, chamadas: [] as { fn: string; args: Record<string, unknown> }[], carencia: false }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q = { select: () => q, or: () => Promise.resolve({ data: [{ id: 'p1', financiamento_id: 'f1', numero_parcela: 1,
        data_vencimento: '2026-11-10', lancamento_id: B.carencia ? null : 'am', lancamento_juros_id: 'ju' }], error: null }),
        in: () => Promise.resolve({ data: [], error: null }), eq: () => q };
      return q;
    },
    rpc: (fn: string, args: { p_itens?: { lancamento_id: string; valor: number }[]; p_simular?: boolean }) => {
      B.chamadas.push({ fn, args });
      if (fn !== 'fn_espelho_casar' && fn !== 'fn_casar_parcela_com_motivo') return Promise.resolve({ data: null, error: null });
      const soma = (args.p_itens ?? []).reduce((a, i) => a - Math.abs(i.valor), 0);
      const diferenca = Math.round((soma - B.alvo) * 100) / 100;
      return Promise.resolve({ data: Math.abs(diferenca) <= 0.005 ? { ok: true, no_extrato: B.alvo, soma }
        : { ok: false, motivo: 'soma_nao_bate', no_extrato: B.alvo, soma, diferenca }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal, type LevadoInicial } from './CasarComBancoModal';

const AM: LevadoInicial = { lancamento_id: 'am', descricao: 'FCO amortização 1/12', valor_assinado: -9000, data_vencimento: '2026-11-10', status_transacao: 'programado' };
const JU: LevadoInicial = { lancamento_id: 'ju', descricao: 'FCO juros 1/12', valor_assinado: -8484.93, data_vencimento: '2026-11-10', status_transacao: 'programado' };

beforeEach(() => { B.chamadas = []; B.alvo = -16831.69; B.carencia = false; });

function abrir(data = '2026-11-10', valor = -16831.69, iniciais: LevadoInicial[] = [AM, JU]) {
  B.alvo = valor;
  render(<CasarComBancoModal open onClose={() => {}} extrato={{ extrato_id: 'e1', data, historico: 'LIQUIDACAO DE PARCELA', valor }}
    iniciais={iniciais} nomeConta="Cooperativa Lavoura" contaBancariaId="cc" onConciliado={() => {}} />);
}
const campo = (desc: string) => screen.getByLabelText(`Valor de ${desc}`);
const valorDoCampo = (desc: string) => { const el = campo(desc); return el instanceof HTMLInputElement ? el.value : ''; };

describe('a parcela inteira com outro valor: a pergunta do motivo', () => {
  it('PADRÃO = ajuste de juros: os juros fecham com o banco (o principal fica) e a frase "previsto → pago (Δ)"', async () => {
    abrir();
    await screen.findByTestId('pergunta-parcela', undefined, { timeout: 3000 });
    await waitFor(() => expect(valorDoCampo('FCO juros 1/12')).toBe('7.831,69'));
    expect(valorDoCampo('FCO amortização 1/12')).toBe('9.000,00');
    expect(screen.getByTestId('motivo-ajuste_juros').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('motivo-bonus')).toBeTruthy();
    expect(screen.queryByTestId('motivo-juros_atraso')).toBeNull();
    expect(screen.getByTestId('frase-ajuste').textContent).toBe('juros previsto 8.484,93 → pago 7.831,69 (−653,24)');
    await waitFor(() => expect(screen.getByTestId('conciliar-casar')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('conciliar-casar'));
    await waitFor(() => expect(B.chamadas.some((c) => c.fn === 'fn_espelho_casar' && c.args.p_simular === false)).toBe(true));
  });

  it('desconto/bônus: o mesmo ajuste, gravado pelo casar com motivo (lote 114420)', async () => {
    abrir();
    await waitFor(() => expect(valorDoCampo('FCO juros 1/12')).toBe('7.831,69'));
    fireEvent.click(screen.getByTestId('motivo-bonus'));
    await waitFor(() => expect(screen.getByTestId('conciliar-casar')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('conciliar-casar'));
    await waitFor(() => expect(B.chamadas.find((c) => c.fn === 'fn_casar_parcela_com_motivo')?.args)
      .toMatchObject({ p_extrato_id: 'e1', p_parcela_id: 'p1', p_motivo_ajuste: 'bonus', p_simular: false }));
  });

  it('pagou A MAIS: a opção é multa/juros de atraso (sem bônus); escolhida, os juros voltam ao previsto', async () => {
    abrir('2026-11-10', -18000);
    await screen.findByTestId('pergunta-parcela', undefined, { timeout: 3000 });
    expect(screen.queryByTestId('motivo-bonus')).toBeNull();
    await waitFor(() => expect(valorDoCampo('FCO juros 1/12')).toBe('9.000,00'));
    fireEvent.click(screen.getByTestId('motivo-juros_atraso'));
    await waitFor(() => expect(valorDoCampo('FCO juros 1/12')).toBe('8.484,93'));
  });

  it('ADIANTAMENTO: pago antes do vencimento pergunta parcela inteira × amortização parcial; parcial leva só a amortização', async () => {
    abrir('2026-11-03', -5000);
    await screen.findByTestId('pergunta-parcela', undefined, { timeout: 3000 });
    expect(screen.getByTestId('pergunta-parcela').textContent).toContain('Pago adiantado');
    fireEvent.click(screen.getByTestId('modo-parcial'));
    await waitFor(() => expect(screen.queryByLabelText('Valor de FCO juros 1/12')).toBeNull());
    expect(valorDoCampo('FCO amortização 1/12')).toBe('9.000,00');
    expect(screen.getByTestId('pergunta-parcela').textContent).toContain('o resto da parcela segue em aberto');
    fireEvent.click(screen.getByTestId('modo-inteira'));
    await waitFor(() => expect(screen.getByLabelText('Valor de FCO juros 1/12')).toBeTruthy());
  });

  it('CARÊNCIA (o FCO 1/12: sem amortização, só os juros): a mesma pergunta; os juros fecham com o banco inteiro; sem "amortização parcial"', async () => {
    B.carencia = true;
    abrir('2026-11-03', -16831.69, [{ ...JU, valor_assinado: -17484.93, descricao: 'FCO juros 1/12' }]);
    await screen.findByTestId('pergunta-parcela', undefined, { timeout: 3000 });
    await waitFor(() => expect(valorDoCampo('FCO juros 1/12')).toBe('16.831,69'));
    expect(screen.getByTestId('frase-ajuste').textContent).toBe('juros previsto 17.484,93 → pago 16.831,69 (−653,24)');
    expect(screen.queryByTestId('modo-parcial')).toBeNull();
  });
});
