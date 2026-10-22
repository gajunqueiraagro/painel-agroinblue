/**
 * ITENS-NOTA-01 — a aba Documentos da OC le^ os MESMOS itens do lancamento, pela chave do documento:
 *   · so' o documento cuja chave tem itens guardados ganha o "Itens da nota" (lista da compra; tabela do abate somente-leitura e no menu)
 *   · o clique abre o dialogo dos itens COM A CHAVE do documento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DocumentosApi, DocumentoLista } from '@/hooks/useOperacaoDocumentos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const COM = '5'.repeat(44);
const SEM = '4'.repeat(44);
const itens = vi.hoisted(() => ({ useChavesComItens: vi.fn((_c: unknown, _k: unknown): ReadonlySet<string> => new Set()) }));
vi.mock('@/hooks/useItensDaNota', () => itens);
vi.mock('@/components/financeiro-v2/ItensDaNotaDialog', () => ({
  ItensDaNotaDialog: ({ chave }: { chave: string }) => <div data-testid="dialogo-itens">{chave}</div>,
}));

import { AbaDocumentosOC } from './AbaDocumentosOC';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const doc = (p: Partial<DocumentoLista>): DocumentoLista => ({
  documentoId: 'x', especie: 'nf_principal', numero: '000000937', serie: '10', dataEmissao: '2026-09-15', situacao: 'ativo',
  cancelado: false, valorLiquido: 196656, totalAcrescimos: 0, totalDescontosComerciais: 0, totalRetencoesSemCaixa: 0,
  totalDespesasDesembolso: 0, qtdComponentes: 0, qtdLotes: 0, documentoOrigemId: null, url: null, emitenteId: null,
  emitenteNome: null, emitenteDocumento: null, cab: null, pesoKg: null, dataAbate: null, vencimento: null,
  dados: null, liquidoProprio: 196656, somaNoValor: true, chaveAcesso: null, ...p,
});
const api = (documentos: DocumentoLista[]): DocumentosApi => ({
  documentos, lotes: [], loading: false, saving: false, registrar: vi.fn(async () => 'd'), anexarArquivo: vi.fn(async () => true),
  urlAssinada: vi.fn(async () => null), editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
});
const DOCS = [doc({ documentoId: 'a', chaveAcesso: COM }), doc({ documentoId: 'b', numero: '000000938', chaveAcesso: SEM })];

beforeEach(() => {
  definirFornecedoresDoLeitor([]);
  itens.useChavesComItens.mockImplementation(() => new Set([COM]));
  Element.prototype.scrollIntoView = () => {};
});

describe('ITENS-NOTA-01 — "Itens da nota" na aba Documentos da OC', () => {
  it('compra (lista): so\' o documento com itens guardados tem o botao; o clique abre o dialogo com a chave dele', () => {
    render(<AbaDocumentosOC api={api(DOCS)} operacaoPronta tipoOperacao="compra" fornecedores={[]} clienteId="cli" />);
    expect(itens.useChavesComItens).toHaveBeenCalledWith('cli', [COM, SEM]);
    const botoes = screen.getAllByTestId('doc-oc-itens');
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect(screen.getByTestId('dialogo-itens').textContent).toBe(COM);
  });
  it('abate somente-leitura: o icone so\' na linha com itens, e abre com a chave dela', () => {
    render(<AbaDocumentosOC api={api(DOCS)} operacaoPronta somenteLeitura tipoOperacao="abate" fornecedores={[]} clienteId="cli" />);
    const botoes = screen.getAllByTestId('doc-oc-itens');
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect(screen.getByTestId('dialogo-itens').textContent).toBe(COM);
  });
  it('DOC-NOTA-XML-PDF-01 — o arquivo XML abre como os itens da nota (lidos dele), nunca cru; o PDF abre o arquivo', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const a = api([doc({ documentoId: 'x1', url: 'oc/x1/nota.xml', chaveAcesso: SEM }), doc({ documentoId: 'p1', numero: '000000939', url: 'oc/p1/nota.pdf' })]);
    a.urlAssinada = vi.fn(async (c: string) => `https://assinada/${c}`);
    render(<AbaDocumentosOC api={a} operacaoPronta tipoOperacao="compra" fornecedores={[]} clienteId="cli" />);
    const [xml, pdf] = screen.getAllByLabelText('Abrir arquivo');
    fireEvent.click(xml);
    expect((await screen.findByTestId('dialogo-itens')).textContent).toBe(SEM);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(pdf);
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('https://assinada/oc/p1/nota.pdf', '_blank', 'noopener,noreferrer'));
    open.mockRestore();
  });
  it('nenhuma chave com itens: nenhum botao', () => {
    itens.useChavesComItens.mockImplementation(() => new Set());
    render(<AbaDocumentosOC api={api(DOCS)} operacaoPronta tipoOperacao="compra" fornecedores={[]} clienteId="cli" />);
    expect(screen.queryByTestId('doc-oc-itens')).toBeNull();
  });
});
