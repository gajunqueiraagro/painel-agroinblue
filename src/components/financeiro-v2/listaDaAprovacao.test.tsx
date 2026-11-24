// BPO-FUNCIONAR-01 — a barra de seleção (aprovar = prévia + gravação; recusar pede motivo; a recusa do banco fica na barra) e os cartões do celular.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BarraDaAprovacao, CartoesDaAprovacao, type LinhaDaEtapa } from './ListaDaAprovacao';
import type { AprovacaoDaLinha } from '@/lib/financeiro/aprovacaoNaCpr';

const L = (id: string, valor: number, fornecedor: string, venc = '2026-12-01'): LinhaDaEtapa => ({
  id, vencimento: venc, descricao: `desc ${id}`, fornecedor, favorecidoId: null, subcentro: 'Nutrição', fazenda: 'PUR', valor, doc: { nf: true, boleto: id !== 'c' },
});
const A = (id: string, o: Partial<AprovacaoDaLinha>): AprovacaoDaLinha => ({
  lancamentoId: id, estado: 'aguardando', motivo: null, observacao: null, decididoPor: null, decididoEm: null, lancadoPor: 'amanda', lancadoEm: null,
  possoDecidir: true, temNota: true, temBoleto: true, forma: null, prontoPagar: null, ...o,
});

beforeEach(() => { rpc.mockReset(); });

describe('BarraDaAprovacao', () => {
  const sel = [{ id: 'a', valor: 22650 }, { id: 'b', valor: 2551.95 }];
  it('o total sempre à vista; "Aprovar 2" faz a prévia e grava as duas (o banco confere de novo)', async () => {
    rpc.mockResolvedValue({ data: { ok: true, n: 2, total: 25201.95 }, error: null });
    const onFeito = vi.fn();
    render(<BarraDaAprovacao clienteId="cli" selecionadas={sel} onFeito={onFeito} />);
    expect(screen.getByTestId('bpo-barra-total').textContent).toContain('2 selecionados');
    expect(screen.getByTestId('bpo-barra-total').textContent).toContain('25.201,95');
    fireEvent.click(screen.getByTestId('bpo-aprovar'));
    await waitFor(() => expect(onFeito).toHaveBeenCalled());
    expect(rpc.mock.calls.map((c) => c[1].p_simular)).toEqual([true, false]);
    expect(rpc.mock.calls[1]).toEqual(['fn_aprovacao_decidir', { p_cliente: 'cli', p_ids: ['a', 'b'], p_aprovar: true, p_motivo: null, p_simular: false }]);
  });
  it('a recusa do banco fica na barra (nada gravado)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'BPO: quem lançou não aprova (x).' } });
    const onFeito = vi.fn();
    render(<BarraDaAprovacao clienteId="cli" selecionadas={sel} onFeito={onFeito} />);
    fireEvent.click(screen.getByTestId('bpo-aprovar'));
    await waitFor(() => expect(screen.getByTestId('bpo-barra-aviso').textContent).toBe('quem lançou não aprova (x).'));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(onFeito).not.toHaveBeenCalled();
  });
  it('"Recusar…" pede o motivo (≥ 3) e grava com ele', async () => {
    rpc.mockResolvedValue({ data: { ok: true, n: 2, total: 1 }, error: null });
    render(<BarraDaAprovacao clienteId="cli" selecionadas={sel} onFeito={() => {}} />);
    fireEvent.click(screen.getByTestId('bpo-recusar'));
    expect(screen.getByTestId('bpo-recusar-confirmar')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('bpo-recusar-motivo'), { target: { value: 'valor errado' } });
    fireEvent.click(screen.getByTestId('bpo-recusar-confirmar'));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_aprovar: false, p_motivo: 'valor errado', p_simular: false });
  });
});

describe('CartoesDaAprovacao (celular)', () => {
  const linhas = [L('a', 22650, 'União Sal'), L('c', 1250, 'Transportes', '2026-12-02')];
  const estados = new Map([['a', A('a', {})], ['c', A('c', { lancadoPor: 'eu', possoDecidir: false })]]);
  it('2 linhas por cartão; a linha que EU lancei não se marca (o motivo no title); marcar avisa', () => {
    const onMarcar = vi.fn();
    render(<CartoesDaAprovacao etapa="aprovar" linhas={linhas} estados={estados} euId="eu" marcadas={new Set()} onMarcar={onMarcar} onAbrir={() => {}} />);
    const cartoes = screen.getAllByTestId('bpo-cartao');
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0].textContent).toContain('01/12 · Nutrição · NF + boleto ✓');
    expect(cartoes[1].textContent).toContain('NF ✓');
    const caixas = screen.getAllByRole('checkbox');
    expect(caixas[1]).toHaveProperty('disabled', true);
    expect(caixas[1].getAttribute('title')).toBe('Quem lançou não aprova');
    fireEvent.click(caixas[0]);
    expect(onMarcar).toHaveBeenCalledWith('a', true);
  });
});
