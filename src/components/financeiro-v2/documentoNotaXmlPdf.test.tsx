/**
 * DOC-NOTA-XML-PDF-01 — a aba Documentos do lancamento: a MESMA nota em PDF e XML e' UMA linha, com os selos "PDF" e "XML"; abrir
 * mostra o PDF; sem PDF, os "Itens da nota" lidos do XML — nunca o XML cru; cancelar a linha cancela os dois arquivos.
 * ⚠ Sintetico (o caso real foi medido no banco; nenhum dado de cliente aqui).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const itens = vi.hoisted(() => ({
  lerItensGuardados: vi.fn(async (..._a: unknown[]) => null),
  notaComItensDoArquivo: vi.fn(async (..._a: unknown[]) => null),
}));
vi.mock('@/lib/financeiro/itensDaNotaBanco', () => itens);

import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import type { LancDocumento, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';

const CH = '50311011222333000181550020000157861123456789';
const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: null, serie: null,
  chaveAcesso: null, dataEmissao: null, valorDocumento: null, url: null, tipo: null, tamanhoBytes: 1,
  observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false, canceladoMotivo: null,
  versao: 1, ligadoAQtd: 1, ...x,
});
const PDF = doc({ id: 'pdf', nome: 'NF 15786.pdf', tipo: 'application/pdf', url: 'c/l/a.pdf', numero: '15786', valorDocumento: 17600, chaveAcesso: CH });
const XML = doc({ id: 'xml', nome: 'NFe15786.xml', tipo: 'text/xml', url: 'c/l/b.xml', numero: '000.015.786', serie: '2', valorDocumento: 17600,
  chaveAcesso: CH, emitenteDocumento: '11222333000181', emitenteNome: 'Emitente Exemplo', dataEmissao: '2026-09-02' });

function api(documentos: LancDocumento[]): LancamentoDocumentosApi {
  return {
    documentos, confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar: vi.fn(), editar: vi.fn().mockResolvedValue(true), cancelar: vi.fn().mockResolvedValue(true),
    anexar: vi.fn(), urlAssinada: vi.fn(async (c: string) => `https://assinada/${c}`), recarregar: vi.fn(),
  };
}
const monta = (a: LancamentoDocumentosApi) => render(<MemoryRouter><AbaDocumentosLancamento api={a} clienteId="cli" /></MemoryRouter>);
const linhas = () => screen.queryAllByTestId('linha-documento');

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
  globalThis.fetch = vi.fn(async () => new Response(new ArrayBuffer(8))) as typeof fetch;
  itens.lerItensGuardados.mockClear(); itens.notaComItensDoArquivo.mockClear();
});

describe('DOC-NOTA-XML-PDF-01 — uma nota, uma linha', () => {
  it('PDF + XML da mesma nota: UMA linha, "1 documento", selos PDF e XML, os dados do XML', () => {
    monta(api([PDF, XML]));
    expect(linhas()).toHaveLength(1);
    expect(screen.getByText('1 documento')).toBeInTheDocument();
    expect(screen.getByTestId('selo-pdf').textContent).toBe('PDF');
    expect(screen.getByTestId('selo-xml').textContent).toBe('XML');
    expect(screen.getByTestId('doc-nome').textContent).toBe('NF 000.015.786 · série 2');
    expect(screen.getByTestId('doc-emissao').textContent).toBe('02/09/2026');
  });

  it('abrir a linha do par abre o PDF (nunca o XML)', async () => {
    const a = api([XML, PDF]);
    monta(a);
    fireEvent.click(screen.getByTestId('doc-abrir'));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://assinada/c/l/a.pdf', '_blank', 'noopener'));
    expect(a.urlAssinada).not.toHaveBeenCalledWith('c/l/b.xml', expect.anything());
  });

  it('so o XML: abrir mostra os Itens da nota (lidos do XML quando nao guardados), nunca abre o arquivo cru', async () => {
    const a = api([XML]);
    monta(a);
    expect(screen.queryByTestId('selo-pdf')).toBeNull();
    expect(screen.getByTestId('doc-abrir').getAttribute('title')).toBe('Ver os itens da nota (lidos do XML)');
    fireEvent.click(screen.getByTestId('doc-abrir'));
    expect(await screen.findByTestId('itens-da-nota-dialog')).toBeInTheDocument();
    await waitFor(() => expect(itens.notaComItensDoArquivo).toHaveBeenCalledTimes(1));
    expect(itens.lerItensGuardados).toHaveBeenCalledWith('cli', [CH]);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('cancelar a linha da nota cancela os DOIS arquivos, com o mesmo motivo', async () => {
    const a = api([PDF, XML]);
    monta(a);
    fireEvent.click(screen.getByLabelText('Cancelar documento'));
    fireEvent.change(screen.getByPlaceholderText('Motivo do cancelamento'), { target: { value: 'nota errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar documento' }));
    await waitFor(() => expect(a.cancelar).toHaveBeenCalledTimes(2));
    expect(a.cancelar).toHaveBeenCalledWith('pdf', 'nota errada');
    expect(a.cancelar).toHaveBeenCalledWith('xml', 'nota errada');
  });

  it('dois PDFs da mesma nota seguem duas linhas', () => {
    monta(api([PDF, { ...PDF, id: 'pdf2' }]));
    expect(linhas()).toHaveLength(2);
  });
});
