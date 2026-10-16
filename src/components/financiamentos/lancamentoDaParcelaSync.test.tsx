/**
 * FIN-CONTRATO-JUROS-SYNC-01 — salvar o lançamento da parcela pelo contrato: o canal do Financeiro é avisado e o contrato, a lista
 * de contratos e as parcelas releem já (nada de F5). O banco leva o valor à parcela (gatilho, provado no teste SQL).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const notificar = vi.fn();
const editar = vi.fn(async () => true);
/* objeto ESTÁVEL entre renders (as funções entram nas dependências dos efeitos do diálogo) */
const fin = {
  loadContas: vi.fn(), loadClassificacoes: vi.fn(), loadFornecedores: vi.fn(), loadSafras: vi.fn(),
  buscarLancamentoPorId: vi.fn(async () => ({ id: 'lj' })), editarLancamento: editar,
  contasBancarias: [{ id: 'c' }], classificacoes: [{ id: 'k' }], fornecedores: [], safras: [], criarFornecedor: vi.fn(),
};
const fazendasVazias = { fazendas: [] };
vi.mock('@/hooks/useFinanceiroV2', () => ({
  notificarLancamentosMudaram: (...a: unknown[]) => notificar(...a),
  useFinanceiroV2: () => fin,
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => fazendasVazias }));
vi.mock('@/hooks/useSituacaoDoContrato', () => ({ CHAVE_SITUACAO_DO_CONTRATO: 'financiamento-situacao' }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: ({ open, onSave }: { open: boolean; onSave: (f: unknown, id: string) => Promise<boolean> }) =>
    open ? <button data-testid="salvar" onClick={() => void onSave({ valor: 128579.3 }, 'lj')}>salvar</button> : null,
}));

import { LancamentoDaParcelaDialog } from './LancamentoDaParcelaDialog';

describe('salvar o lançamento da parcela', () => {
  it('avisa o canal e invalida contrato, lista de contratos e parcelas', async () => {
    const qc = new QueryClient();
    const inv = vi.spyOn(qc, 'invalidateQueries');
    const aoFechar = vi.fn();
    render(<QueryClientProvider client={qc}><LancamentoDaParcelaDialog lancamentoId="lj" clienteId="cli" aoFechar={aoFechar} /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId('salvar'));
    await waitFor(() => expect(notificar).toHaveBeenCalledWith('cli'));
    expect(editar).toHaveBeenCalledWith('lj', { valor: 128579.3 });
    const chaves = inv.mock.calls.map(c => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toEqual(expect.arrayContaining(['["financiamento-situacao"]', '["financiamento-parcelas"]', '["financiamentos-lista"]']));
    expect(aoFechar).toHaveBeenCalled();
  });
});
