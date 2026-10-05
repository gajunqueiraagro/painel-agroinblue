/**
 * UI-ARRASTAR-ARQUIVO-01a — CARACTERIZAÇÃO das quatro telas que já aceitavam arrastar.
 *
 * ⚠ ESCRITO ANTES DA TROCA, e verde antes e depois: o mesmo arquivo SOLTO na área chega ao MESMO destino, com os mesmos
 *   argumentos. O que cada tela FAZ com o arquivo (anexar, ler o PDF, ler o XML, casar boleto com parcela) não muda.
 * ⚠ SOLTAR É `fireEvent.drop` COM `dataTransfer.files` + `types: ['Files']` (o que o navegador entrega); a área se acha pelo
 *   `data-testid` que cada tela já tinha — na OC, que não tinha, pela borda tracejada.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const leitorPdf = vi.hoisted(() => ({ extractPdfText: vi.fn(async (_f: File) => ({ text: '', pageCount: 1, hasTextLayer: false })) }));
vi.mock('@/lib/financeiro/parser/extractPdfText', () => leitorPdf);
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/financeiro/nfeConsultas', () => ({
  iePorFazenda: async () => ({ 'f-pur': '28.987.654-3' }), fornecedorPeloNome: async () => null, notaJaRegistrada: async () => [],
  ultimaClassificacaoDoFornecedor: async () => null, gravarDocumentoNoCadastro: async () => null,
}));

import { FormDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { NovoDeXmlDialog } from '@/components/financeiro-v2/NovoDeXmlDialog';
import { DocumentoFormOC, FORM_VAZIO } from '@/components/compra/DocumentoFormOC';
import type { LancDocPayload, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { CTE, montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';

const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
const jpg = (nome: string) => new File(['x'], nome, { type: 'image/jpeg' });
/** Solta os arquivos como o navegador solta: `files` + `types` com "Files". */
const soltar = (alvo: Element, arquivos: File[]) =>
  fireEvent.drop(alvo, { dataTransfer: { files: arquivos, types: ['Files'], items: arquivos.map(() => ({ kind: 'file' })) } });

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  leitorPdf.extractPdfText.mockClear();
});

describe('aba Documentos do lançamento (FormDocumento)', () => {
  it('PDF solto na área: o nome aparece e o salvar anexa ESSE arquivo ao documento registrado', async () => {
    const registrar = vi.fn(async (_p: LancDocPayload) => ({ id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
    const anexar = vi.fn(async () => true);
    const api: LancamentoDocumentosApi = {
      documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar, editar: vi.fn(async () => true), cancelar: vi.fn().mockResolvedValue(true), anexar, urlAssinada: vi.fn(), recarregar: vi.fn(),
    };
    const onFechar = vi.fn();
    render(<FormDocumento api={api} documento={null} fornecedores={[]} onFechar={onFechar} />);
    /* ⚠ o jsdom não deixa atribuir uma lista comum a `input.files` (o navegador deixa a do `dataTransfer`): o setter é
       anulado só aqui, e nada no teste lê `input.files`. */
    const input = screen.getByTestId('doc-arquivo');
    Object.defineProperty(input, 'files', { configurable: true, get: () => [], set: () => {} });
    const arquivo = pdf('NFe 31776.pdf');
    soltar(screen.getByTestId('area-arquivo'), [arquivo]);
    expect(screen.getByTestId('arquivo-escolhido').textContent).toBe('NFe 31776.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(anexar).toHaveBeenCalledTimes(1));
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(anexar).toHaveBeenCalledWith('novo', 1, arquivo, { origem: 'lancamento', operacaoId: null });
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
  });
});

describe('Anexar vários boletos', () => {
  const PARCELAS = ['2026-10-05', '2026-11-05', '2026-12-05'].map((vencimento, i) => ({ numero: i + 1, vencimento, valor: 100, temBoleto: false }));
  it('lote solto: cada arquivo vira uma linha; o errado fica recusado NA LINHA e os bons seguem ao confirmar', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(null);
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={onConfirmar} onFechar={() => {}} />);
    const a = pdf('boleto_001.pdf'); const b = jpg('boleto_002.jpg');
    soltar(screen.getByTestId('soltar-boletos'), [a, new File(['x'], 'nota.txt', { type: 'text/plain' }), b]);
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    expect(screen.getAllByTestId('linha-boleto')).toHaveLength(3);
    expect(screen.getByText('Formato não aceito. Envie PDF, JPG ou PNG.')).toBeTruthy();
    /* só o PDF vai ao leitor da linha digitável */
    expect(leitorPdf.extractPdfText).toHaveBeenCalledTimes(1);
    expect(leitorPdf.extractPdfText.mock.calls[0][0]).toBe(a);
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    const itens = onConfirmar.mock.calls[0][0] as { arquivo: File; parcela: number }[];
    expect(itens.map(i => [i.arquivo, i.parcela])).toEqual([[a, 1], [b, 2]]);
  });
});

describe('Novo a partir de XML', () => {
  const xml = (nome: string, conteudo: string, type = '') => {
    const bytes = utf8(conteudo);
    const f = new File([bytes], nome, { type });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes });
    return f;
  };
  it('lote solto: a nota boa vira linha nova; o que não é nota fica recusado NA LINHA, com a frase do leitor', async () => {
    const onAbrir = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'f-pur', nome: 'Faz. Pureza' }]}
      fornecedores={[]} onAbrirLancamento={onAbrir} lancadas={new Set()} />);
    soltar(screen.getByTestId('xml-area-de-soltar'), [xml('a.xml', montarNFe()), xml('cte.xml', CTE, 'text/xml'), xml('foto.pdf', '%PDF', 'application/pdf')]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(3));
    const linhas = screen.getAllByTestId('xml-linha');
    expect(linhas.map(l => l.getAttribute('data-situacao'))).toEqual(['nova', 'recusada', 'recusada']);
    expect(within(linhas[1]).getByTestId('xml-recusa').textContent).toBe('É um conhecimento de transporte (CT-e), não uma nota.');
    /* o PDF é recusado PELO LEITOR, na linha dele — a área não barra o lote */
    expect(within(linhas[2]).getByTestId('xml-recusa').textContent).toBeTruthy();
    fireEvent.click(within(linhas[0]).getByRole('button', { name: 'Abrir lançamento' }));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });
});

describe('Documento da operação comercial (DocumentoFormOC)', () => {
  const api = (): DocumentosApi => ({
    documentos: [], lotes: [], loading: false, saving: false,
    registrar: vi.fn(async () => 'doc-1'), anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
    editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
  });
  const area = () => document.querySelector('.border-dashed') as HTMLElement;
  it('PDF solto: o nome aparece na faixa e o arquivo vai ao leitor da nota, uma vez', async () => {
    render(<DocumentoFormOC api={api()} initialForm={FORM_VAZIO} onSaved={() => {}} onCancel={() => {}} />);
    const arquivo = pdf('NF 84.pdf');
    soltar(area(), [arquivo]);
    await waitFor(() => expect(area().textContent).toContain('NF 84.pdf'));
    await waitFor(() => expect(leitorPdf.extractPdfText).toHaveBeenCalledTimes(1));
    expect(leitorPdf.extractPdfText.mock.calls[0][0]).toBe(arquivo);
  });
  it('imagem solta: o nome aparece e o leitor de PDF NÃO é chamado', async () => {
    render(<DocumentoFormOC api={api()} initialForm={FORM_VAZIO} onSaved={() => {}} onCancel={() => {}} />);
    soltar(area(), [jpg('recibo.jpg')]);
    await waitFor(() => expect(area().textContent).toContain('recibo.jpg'));
    expect(leitorPdf.extractPdfText).not.toHaveBeenCalled();
  });
});
