/**
 * RATEIO-HIGINO-01 — o diálogo "Conferir rateio" com a forma de nov/26 (ids e valores sintéticos): as linhas são os itens da conta comum;
 * o valor digitado (100%) vira a parte; a NF vira mudança; o que é de outra relação fica em "Outros do mês" e se puxa; a diferença com o
 * pagamento fica à vista; o Gravar manda só o que muda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const m = vi.hoisted(() => ({ ler: vi.fn(), gravar: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/financeiro/rateio/rateioNoBanco', () => ({
  lerItensDoRateio: (...a: unknown[]) => m.ler(...a), gravarConferencia: (...a: unknown[]) => m.gravar(...a),
}));

import { ConferirRateioDialog } from './ConferirRateioDialog';
import type { ItemDoRateio } from '@/lib/financeiro/rateio/conferirRateio';

const item = (id: string, descricao: string, valorCent: number, extra: Partial<ItemDoRateio> = {}): ItemDoRateio => ({
  id, descricao, fazendaId: 'faz-3m', planoContaId: 'pc-energia', valorCent, vencimento: '2026-11-19', competencia: '2026-11-01',
  numeroDocumento: 'R_D15', tipoDocumento: 'Recibo', pago: false, ...extra,
});
const DESTA = [item('i-luz-1', 'Conta de Luz - 3M', 174142), item('i-luz-2', 'Conta de Luz - 3M', 165105), item('i-itr', 'ITR 2026 3/4', 454722, { planoContaId: 'pc-itr', numeroDocumento: null })];
const OUTROS = [item('i-folha', 'Folha Pagamento', 121115, { numeroDocumento: 'R_Folha' })];
const PAG = { id: 'pag-d15', descricao: 'Rateio D15', valorCent: 1634129, vencimento: '2026-11-16', contaDestinoId: 'conta-comum', status: 'programado', dataPagamento: null };

function abrir() {
  return render(<ConferirRateioDialog clienteId="cli" pagamento={PAG} nomeDaConta="Conta Fazenda"
    fazendas={[{ id: 'faz-3m', codigo: '3M', nome: 'Três' }, { id: 'faz-bg', codigo: 'BG', nome: 'Baia' }]}
    contasDoPlano={[{ id: 'pc-energia', subcentro: 'Comunicação e Energia Pecuária', centro_custo: 'Administração', tipo_operacao: '2-Saídas' },
      { id: 'pc-itr', subcentro: 'Taxas e Impostos Fixos Pecuária', centro_custo: 'Impostos', tipo_operacao: '2-Saídas' }]}
    criarItem={vi.fn()} onClose={vi.fn()} onGravou={vi.fn()} />);
}
const digitarValor = (linha: HTMLElement, texto: string) => {
  const input = within(linha).getByPlaceholderText('0,00');
  fireEvent.focus(input); fireEvent.change(input, { target: { value: texto } }); fireEvent.blur(input);
};

beforeEach(() => {
  m.ler.mockReset(); m.gravar.mockReset();
  m.ler.mockResolvedValue({ ok: true, valor: { desta: DESTA, outros: OUTROS } });
  m.gravar.mockResolvedValue({ ok: true, valor: { mudaram: 1, criados: [], operacao: 'op', documentoGravado: false } });
  Element.prototype.scrollIntoView = () => {}; Element.prototype.hasPointerCapture = () => false;
});

describe('RATEIO-HIGINO-01 — Conferir rateio', () => {
  it('as linhas são os itens desta relação; os outros do mês ficam à parte', async () => {
    abrir();
    await waitFor(() => expect(screen.getAllByTestId('rateio-linha')).toHaveLength(3));
    expect(screen.getAllByTestId('rateio-outro')).toHaveLength(1);
    expect(screen.getAllByTestId('rateio-situacao').map((s) => s.textContent)).toEqual(['falta o valor da relação', 'falta o valor da relação', 'falta o valor da relação']);
  });

  it('o valor da relação vira a parte (50%): igual = confere; NF digitada = muda', async () => {
    abrir();
    const [luz1, luz2] = await screen.findAllByTestId('rateio-linha');
    digitarValor(luz1, '3482,84');
    digitarValor(luz2, '3302,09');
    fireEvent.change(within(luz2).getByTestId('rateio-nf'), { target: { value: '885860' } });
    expect(within(luz1).getByTestId('rateio-parte').textContent).toBe('1.741,42');
    expect(within(luz2).getByTestId('rateio-parte').textContent).toBe('1.651,05');
    expect([luz1.getAttribute('data-situacao'), luz2.getAttribute('data-situacao')]).toEqual(['confere', 'muda']);
  });

  it('a diferença com o pagamento fica à vista (nunca ajustada)', async () => {
    abrir();
    await screen.findAllByTestId('rateio-linha');
    /* itens 1.741,42 + 1.651,05 + 4.547,22 = 7.939,69; pagamento 16.341,29 */
    expect(screen.getByTestId('rateio-diferenca').textContent).toBe('Diferença 8.401,60');
  });

  it('puxar um dos outros do mês para esta relação', async () => {
    abrir();
    await screen.findAllByTestId('rateio-linha');
    fireEvent.click(screen.getByTestId('rateio-puxar'));
    expect([screen.getAllByTestId('rateio-linha').length, screen.queryAllByTestId('rateio-outro').length]).toEqual([4, 0]);
  });

  it('Gravar manda só o que muda (a NF), com o tipo Nota Fiscal; sem nada a gravar o botão fica desligado', async () => {
    abrir();
    const [, luz2] = await screen.findAllByTestId('rateio-linha');
    expect(screen.getByTestId('rateio-gravar')).toBeDisabled();
    digitarValor(luz2, '3302,09');
    fireEvent.change(within(luz2).getByTestId('rateio-nf'), { target: { value: '885860' } });
    fireEvent.click(screen.getByTestId('rateio-gravar'));
    await waitFor(() => expect(m.gravar).toHaveBeenCalled());
    const [cli, pag, pedido, novos, conferidos, arquivo] = m.gravar.mock.calls[0];
    expect([cli, pag, pedido, novos, conferidos, arquivo]).toEqual(['cli', 'pag-d15', [{ id: 'i-luz-2', numero_documento: '885860', tipo_documento: 'Nota Fiscal' }], [], ['i-luz-2'], null]);
  });

  it('linha nova incompleta trava o Gravar (mesmo com outra mudança pronta) e diz por quê', async () => {
    abrir();
    const [, luz2] = await screen.findAllByTestId('rateio-linha');
    digitarValor(luz2, '3302,09');
    fireEvent.change(within(luz2).getByTestId('rateio-nf'), { target: { value: '885860' } });
    expect(screen.getByTestId('rateio-gravar')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('rateio-nova'));
    expect(screen.getByTestId('rateio-gravar')).toBeDisabled();
    expect(screen.getByTestId('rateio-erro').textContent).toBe('⚠ 1 linha nova incompleta');
  });

  it('a recusa do banco fica escrita no rodapé (não grava)', async () => {
    m.gravar.mockResolvedValueOnce({ ok: false, motivo: '«Conta de Luz - 3M» já é da NF 885859: para trocar, cancele aquela antes.' });
    abrir();
    const [, luz2] = await screen.findAllByTestId('rateio-linha');
    fireEvent.change(within(luz2).getByTestId('rateio-nf'), { target: { value: '885860' } });
    digitarValor(luz2, '3302,09');
    fireEvent.click(screen.getByTestId('rateio-gravar'));
    await waitFor(() => expect(screen.getByTestId('rateio-erro').textContent).toBe('⚠ «Conta de Luz - 3M» já é da NF 885859: para trocar, cancele aquela antes.'));
  });
});
