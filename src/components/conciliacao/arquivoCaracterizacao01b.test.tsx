/**
 * UI-ARRASTAR-ARQUIVO-01b — CARACTERIZAÇÃO do extrato do saldo e do boleto por parcela, ESCRITA ANTES DA TROCA.
 *
 * O arquivo ESCOLHIDO (os dois só aceitavam clique) chega ao MESMO destino, com os mesmos argumentos, antes e depois.
 * ⚠ O "Importar Banco" já está caracterizado pelos três testes que existiam e não mudaram (`importarGravacaoAtomica`,
 *   `importarCaixaPorLinha`, `importarLinhaSaldo`): escolhem um OFX pelo `input[type="file"]` e conferem a prévia e a gravação.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const B = vi.hoisted(() => ({
  anexar: vi.fn(async (_p: { clienteId: string; contaId: string; anoMes: string; file: File }) => ({ ok: true, erro: null as string | null })),
  recarregar: vi.fn(async () => {}),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {}, notificarLancamentosMudaram: () => {} }));
vi.mock('@/hooks/useExtratoDaConta', async (orig) => {
  const real = await orig<typeof import('@/hooks/useExtratoDaConta')>();
  return {
    ...real,
    anexarSaldoDocumento: B.anexar,
    useSaldoDeclaradoOfx: () => ({ ofx: null, loading: false }),
    useSaldoDocumentos: () => ({ documentos: [], recarregar: B.recarregar }),
    useExtratoFimDoMes: () => null,
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { SaldoRealDialog } from './SaldoRealDialog';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';

const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
const seletor = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  B.anexar.mockClear(); B.recarregar.mockClear();
  Element.prototype.scrollIntoView = () => {};
});

describe('extrato do saldo (lápis da Conciliação)', () => {
  it('o arquivo escolhido vai a `anexarSaldoDocumento` com cliente, conta, mês e o arquivo — uma vez — e a lista recarrega', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}>
      <SaldoRealDialog clienteId="nj" contaId="conta-1" contaNome="Sicredi Lavoura" ano={2026} mes={9}
        saldoAtual={100} saldoDataAtual="2026-09-30" aoFechar={() => {}} aoSalvar={() => {}} />
    </QueryClientProvider>);
    const arquivo = pdf('extrato-set26.pdf');
    fireEvent.change(seletor(), { target: { files: [arquivo] } });
    await waitFor(() => expect(B.anexar).toHaveBeenCalledTimes(1));
    expect(B.anexar).toHaveBeenCalledWith({ clienteId: 'nj', contaId: 'conta-1', anoMes: '2026-09', file: arquivo });
    await waitFor(() => expect(B.recarregar).toHaveBeenCalledTimes(1));
  });
});

describe('boleto por parcela (novo lançamento parcelado)', () => {
  const PREVIA = [1, 2, 3].map(n => ({ numero: n, dataVencimento: `2026-1${n}-05`, valor: 100 }));
  it('"+ Boleto" da linha entrega o arquivo ESCOLHIDO àquela parcela, e nada mais', () => {
    const onBoleto = vi.fn(); const onTirar = vi.fn();
    render(<ParcelasDaCompra parcelas={PREVIA} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[]}
      onBoleto={onBoleto} onTirarBoleto={onTirar} onAnexarVarios={vi.fn()} />);
    const arquivo = pdf('boleto-2.pdf');
    fireEvent.click(screen.getByTestId('mais-boleto-2'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [arquivo] } });
    expect(onBoleto).toHaveBeenCalledTimes(1);
    expect(onBoleto.mock.calls[0][0]).toBe(2);
    expect(onBoleto.mock.calls[0][1]).toBe(arquivo);
    expect(onTirar).not.toHaveBeenCalled();
  });
  it('tipo errado escolhido: a frase fica na célula Boleto DAQUELA linha, e nada é entregue', () => {
    const onBoleto = vi.fn();
    render(<ParcelasDaCompra parcelas={PREVIA} notaFiscal={null} qtdNotas={0} boletos={[]} foraDoPlano={[]}
      onBoleto={onBoleto} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mais-boleto-3'));
    fireEvent.change(screen.getByTestId('input-boleto-linha'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(onBoleto).not.toHaveBeenCalled();
    const celulas = screen.getAllByTestId('boleto-da-parcela');
    expect(celulas[2].textContent).toContain('Formato não aceito');
    expect(celulas[0].textContent).toBe('sem boleto');
  });
});
