/**
 * PARC-CADEIA-01 passo 2 — o aviso de parcela de compra parcelada, MONTADO: mostra o que o banco simulou, oferece os caminhos,
 * apaga com a frase o que o banco recusa, exige o motivo e escreve a recusa da gravação ao lado do botão (sem toast).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lerPreviaCancelarParcela, type PreviaCancelarParcela } from '@/lib/financiamentos/cancelarParcela';

const banco = vi.hoisted(() => ({
  simular: vi.fn(), gravar: vi.fn(), notificar: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/financiamentos/cancelarParcelaBanco', () => ({
  simularCancelarParcela: banco.simular, gravarCancelarParcela: banco.gravar,
}));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: banco.notificar }));
vi.mock('@/hooks/useSituacaoDoContrato', () => ({ CHAVE_SITUACAO_DO_CONTRATO: 'financiamento-situacao' }));
vi.mock('sonner', () => ({ toast: banco.toast }));

import { CancelarParcelaDialog } from './CancelarParcelaDialog';

const BASE = {
  ok: true, escopo: 'so_esta', simulado: true,
  contrato: { id: 'fin-1', descricao: 'Parcela 3 - None', credor: 'Nova Lineagro' },
  parcela: { id: 'par-3', numero: 3, total: 4, valor: 341.35, vencimento: '2026-10-06', paga: false, lancamento_id: 'lan-3' },
  nota: null, antes: { parcelas: 4, valor_total: 1365.38 }, depois: { parcelas: 3, valor_total: 1024.03 }, todas: null, recusa: null,
};
const ler = (j: unknown): PreviaCancelarParcela => { const p = lerPreviaCancelarParcela(j); if (!p) throw new Error('fixture torta'); return p; };
const SO_ESTA = ler(BASE);
const TODAS = ler({ ...BASE, escopo: 'todas', depois: { parcelas: 0, valor_total: 0 }, todas: { lancamentos: 4, parcelas: 4 } });

function montar(over: Partial<Parameters<typeof CancelarParcelaDialog>[0]> = {}) {
  const aoVoltar = vi.fn(); const aoGravar = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <CancelarParcelaDialog clienteId="cli" alvo={{ lancamentoId: 'lan-3' }} previa={SO_ESTA} aoVoltar={aoVoltar} aoGravar={aoGravar} {...over} />
    </QueryClientProvider>,
  );
  return { aoVoltar, aoGravar };
}
const txt = (id: string) => screen.getByTestId(id).textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  banco.simular.mockResolvedValue({ previa: TODAS, erro: null });
  banco.gravar.mockResolvedValue(null);
});

describe('CancelarParcelaDialog', () => {
  it('título numa linha, dados e a tabela antes × depois com os números do banco', async () => {
    montar();
    expect(txt('cancelar-parcela-titulo')).toBe('Parcela 3/4 de «Parcela 3 - None»');
    expect(screen.getByTestId('cancelar-parcela-titulo').className).toContain('truncate');
    expect(txt('cancelar-parcela-dados')).toContain('Nova Lineagro');
    expect(txt('cancelar-parcela-dados')).toContain('sem nota fiscal ligada');
    expect(txt('cancelar-parcela-dados')).toContain('06/10/2026');
    expect(txt('cancelar-parcela-dados')).toContain('341,35');
    const tabela = txt('cancelar-parcela-antes-depois');
    expect(tabela).toContain('1.365,38');
    expect(txt('depois-Parcelas')).toBe('3');
    expect(txt('depois-Total da compra')).toContain('1.024,03');
    await waitFor(() => expect(banco.simular).toHaveBeenCalledWith({ lancamentoId: 'lan-3', parcelaId: undefined }, 'todas'));
  });

  it('trocar para "a compra inteira" troca o DEPOIS pelo da segunda simulação e o rótulo do botão', async () => {
    montar();
    await waitFor(() => expect(txt('caminho-todas-frase')).toBe('4 lançamentos serão cancelados, com as parcelas e o contrato.'));
    fireEvent.click(screen.getByLabelText(/Cancelar a compra inteira/));
    expect(txt('depois-Parcelas')).toBe('0');
    expect(txt('cancelar-parcela-gravar')).toContain('Cancelar a compra');
  });

  it('sem motivo o botão fica apagado e diz por quê; com motivo, grava pelo banco com o escopo e o motivo aparado', async () => {
    const { aoGravar } = montar();
    const botao = screen.getByTestId('cancelar-parcela-gravar');
    expect(botao).toBeDisabled();
    expect(txt('cancelar-parcela-recado')).toBe('Informe o motivo do cancelamento.');
    fireEvent.click(botao);
    expect(banco.gravar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('cancelar-parcela-motivo'), { target: { value: '  lançado em dobro  ' } });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    await waitFor(() => expect(aoGravar).toHaveBeenCalledWith('so_esta'));
    expect(banco.gravar).toHaveBeenCalledWith({ lancamentoId: 'lan-3' }, 'so_esta', 'lançado em dobro');
    expect(banco.notificar).toHaveBeenCalledWith('cli');
  });

  it('o caminho que o banco recusa fica APAGADO com a frase escrita, e o outro nasce marcado', async () => {
    const paga = ler({ ...BASE, ok: false, recusa: { motivo: 'paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes.' } });
    montar({ previa: paga });
    expect(txt('caminho-so_esta-frase')).toBe('A parcela 3 já está paga: desfaça o pagamento antes.');
    expect(screen.getByLabelText(/Cancelar só esta parcela/)).toBeDisabled();
    await waitFor(() => expect(txt('cancelar-parcela-gravar')).toContain('Cancelar a compra'));
  });

  it('os dois recusados: nada grava, e o motivo do botão é a ausência de caminho', async () => {
    const paga = ler({ ...BASE, ok: false, recusa: { motivo: 'paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes.' } });
    banco.simular.mockResolvedValue({ previa: ler({ ...BASE, escopo: 'todas', todas: { lancamentos: 4, parcelas: 4 }, recusa: { motivo: 'ha_paga', frase: 'A parcela 3 já está paga: desfaça o pagamento antes de cancelar a compra.' } }), erro: null });
    montar({ previa: paga });
    await waitFor(() => expect(txt('caminho-todas-frase')).toContain('antes de cancelar a compra'));
    fireEvent.change(screen.getByTestId('cancelar-parcela-motivo'), { target: { value: 'motivo' } });
    expect(screen.getByTestId('cancelar-parcela-gravar')).toBeDisabled();
    expect(txt('cancelar-parcela-recado')).toBe('Nenhum caminho disponível.');
    expect(txt('depois-Parcelas')).toBe('—');
  });

  it('recusa do banco na gravação: escrita ao lado do botão, o diálogo fica, nenhum toast', async () => {
    banco.gravar.mockResolvedValue('Há parcela com competência em mês fechado: reabra o mês antes. Nada foi gravado.');
    const { aoGravar } = montar();
    fireEvent.change(screen.getByTestId('cancelar-parcela-motivo'), { target: { value: 'motivo' } });
    fireEvent.click(screen.getByTestId('cancelar-parcela-gravar'));
    await waitFor(() => expect(txt('cancelar-parcela-recado')).toContain('mês fechado'));
    expect(aoGravar).not.toHaveBeenCalled();
    expect(banco.notificar).not.toHaveBeenCalled();
    for (const f of Object.values(banco.toast)) expect(f).not.toHaveBeenCalled();
    expect(screen.getByTestId('cancelar-parcela')).toBeInTheDocument();
  });

  it('"Voltar" fecha sem gravar', () => {
    const { aoVoltar } = montar();
    fireEvent.click(screen.getByTestId('cancelar-parcela-voltar'));
    expect(aoVoltar).toHaveBeenCalled();
    expect(banco.gravar).not.toHaveBeenCalled();
  });

  it('"Abrir o contrato" só existe para quem recebe o caminho, e leva o id do contrato', () => {
    montar();
    expect(screen.queryByTestId('cancelar-parcela-abrir-contrato')).toBeNull();
  });
  it('"Abrir o contrato" com o caminho: chama com o id do contrato, sem gravar', () => {
    const aoAbrirContrato = vi.fn();
    montar({ aoAbrirContrato });
    fireEvent.click(screen.getByTestId('cancelar-parcela-abrir-contrato'));
    expect(aoAbrirContrato).toHaveBeenCalledWith('fin-1');
    expect(banco.gravar).not.toHaveBeenCalled();
  });

  it('tamanho fixo: a caixa, o cabeçalho, o corpo e o rodapé têm altura declarada em todo estado', async () => {
    montar();
    const assinatura = () => [screen.getByTestId('cancelar-parcela').className.match(/h-\[\d+px\]/)?.[0],
      screen.getByTestId('caminho-so_esta').className.match(/h-\[\d+px\]/)?.[0], screen.getByTestId('caminho-todas').className.match(/h-\[\d+px\]/)?.[0]].join('|');
    const antes = assinatura();
    expect(antes).toBe('h-[330px]|h-[30px]|h-[30px]');
    await waitFor(() => expect(txt('caminho-todas-frase')).toContain('4 lançamentos'));
    fireEvent.change(screen.getByTestId('cancelar-parcela-motivo'), { target: { value: 'm' } });
    expect(assinatura()).toBe(antes);
  });
});
