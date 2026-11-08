/**
 * DOC-ANEXO-E-IMPORT-01 F1 (Gabriel 05/11) — "o RECIBO pede chave de acesso": o formulário de documento lia TODO PDF/XML como nota (a
 * guarda era só a extensão) — o recibo em PDF ganhava "Não consegui ler a chave da nota" e a nota lida trocava o tipo escolhido para NF
 * calada. Agora: SÓ A NF SE LÊ; sair da NF apaga a leitura; voltar à NF com o arquivo lê; a leitura que termina depois da troca não se
 * aplica. Na OC de compra, a chave só na NF. Na porta da nota, o PDF sem chave diz que não parece nota e aponta a aba Documentos (+ ⓘ).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const itens = vi.hoisted(() => ({ gravar: vi.fn(async (_c: string, _b: ArrayBuffer): Promise<string | null> => null) }));
vi.mock('@/lib/financeiro/itensDaNotaBanco', async (orig) => ({ ...(await orig<typeof import('@/lib/financeiro/itensDaNotaBanco')>()), gravarItensSemTravar: itens.gravar }));
const banco = vi.hoisted(() => ({ fornecedorPeloDocumento: vi.fn(async (_c: string, _d: string) => ({ ok: true, valor: null })) }));
vi.mock('@/lib/financeiro/nfeConsultas', async (orig) => ({ ...(await orig<object>()), ...banco }));
/* o leitor da nota DE VERDADE, espiado: a prova é ele não ser chamado */
const leitor = vi.hoisted(() => ({ chamadas: 0 }));
vi.mock('@/lib/financeiro/nfe/lerNota', async (orig) => {
  const m = await orig<typeof import('@/lib/financeiro/nfe/lerNota')>();
  return { ...m, lerNota: (b: ArrayBuffer) => { leitor.chamadas += 1; return m.lerNota(b); } };
});
const pdfDaOC = vi.hoisted(() => ({ extrair: vi.fn(async (_f: File) => ({ temTexto: false, linhas: [] as string[] })) }));
vi.mock('@/lib/oc/leitura/linhasDoPdf', async (orig) => ({ ...(await orig<object>()), extrairLinhasPdf: pdfDaOC.extrair }));

import { FormDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { DocumentoFormOC, FORM_VAZIO } from '@/components/compra/DocumentoFormOC';
import type { LancDocPayload, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';
import { FRASE_NOTA_NAO_LIDA } from '@/lib/financeiro/nfe/documentoDaNota';
import { FRASE_NOTA_SEM_CHAVE, FRASE_PDF_SEM_TEXTO } from '@/lib/financeiro/nfe/danfe';
import { FRASE_NAO_PARECE_NOTA, fraseDaRecusaDaNota } from '@/lib/financeiro/nfe/chaveDigitada';

if (!('arrayBuffer' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { value(this: Blob) {
    return new Promise<ArrayBuffer>((ok, erro) => { const r = new FileReader(); r.onload = () => (r.result instanceof ArrayBuffer ? ok(r.result) : erro(new Error('não leu'))); r.onerror = () => erro(r.error); r.readAsArrayBuffer(this); });
  } });
}
const arquivo = (nome: string, conteudo: string | Uint8Array, type = '') => new File([typeof conteudo === 'string' ? utf8(conteudo) : conteudo], nome, { type });
const NOTA = montarNFe({ numero: '74974', vNF: '408.77', duplicatas: [['001', '2026-09-24', '408.77']], itens: [['PARAFUSO SINTETICO M8', '100.0000', 'UN', '408.77']] });
/* um "recibo" em PDF: bytes que não são DANFE (o leitor recusaria) */
const RECIBO_PDF = () => arquivo('recibo.pdf', new Uint8Array([37, 80, 68, 70, 1, 2, 3]));

function monta() {
  const registrar = vi.fn(async (_p: LancDocPayload) => ({ id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
  const api: LancamentoDocumentosApi = {
    documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar, editar: vi.fn(), cancelar: vi.fn(async () => true), anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
  render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={vi.fn()} />);
  return { registrar };
}
const soltar = (f: File) => fireEvent.change(screen.getByTestId('doc-arquivo'), { target: { files: [f] } });
const tipo = (rotulo: string) => fireEvent.click(screen.getByRole('button', { name: rotulo }));
const especieDoPedido = (r: ReturnType<typeof monta>['registrar']) => r.mock.calls.at(-1)?.[0].especie;
const umInstante = () => new Promise((ok) => setTimeout(ok, 30));

beforeEach(() => {
  definirFornecedoresDoLeitor([]);
  leitor.chamadas = 0; itens.gravar.mockClear(); pdfDaOC.extrair.mockClear(); banco.fornecedorPeloDocumento.mockClear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('F1 — o formulário de documento do lançamento: só a NF se lê como nota', () => {
  it('o caso do Gabriel: Recibo + PDF → o leitor da nota nem é chamado, nada de "não consegui ler a chave"; registra como recibo', async () => {
    const { registrar } = monta();
    tipo('Recibo');
    soltar(RECIBO_PDF());
    await screen.findByTestId('arquivo-escolhido');
    await umInstante();
    expect(leitor.chamadas).toBe(0);
    expect(screen.queryByTestId('nota-nao-lida')).toBeNull();
    expect(screen.queryByTestId('doc-chave')).toBeNull();
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect([especieDoPedido(registrar), registrar.mock.calls[0][0].chaveAcesso]).toEqual(['recibo', null]);
  });
  it('Comprovante com uma NF-e em XML: o tipo escolhido NUNCA vira NF calado (antes: lia e trocava para NF)', async () => {
    const { registrar } = monta();
    tipo('Comprovante');
    soltar(arquivo('n.xml', NOTA));
    await screen.findByTestId('arquivo-escolhido');
    await umInstante();
    expect([leitor.chamadas, screen.queryByTestId('nota-lida')]).toEqual([0, null]);
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(especieDoPedido(registrar)).toBe('comprovante');
    expect(itens.gravar).not.toHaveBeenCalled();
  });
  it('NF (o padrão) com o PDF que não se lê: o aviso aparece; trocar para Recibo o apaga', async () => {
    monta();
    soltar(RECIBO_PDF());
    expect((await screen.findByTestId('nota-nao-lida')).textContent).toBe(FRASE_NOTA_NAO_LIDA);
    tipo('Recibo');
    expect(screen.queryByTestId('nota-nao-lida')).toBeNull();
  });
  it('a busca sabe achar: Recibo com a NF-e em XML, voltar para Nota fiscal LÊ o arquivo já escolhido', async () => {
    monta();
    tipo('Recibo');
    soltar(arquivo('n.xml', NOTA));
    await screen.findByTestId('arquivo-escolhido');
    expect(screen.queryByTestId('nota-lida')).toBeNull();
    tipo('Nota fiscal');
    expect((await screen.findByTestId('nota-lida')).textContent).toContain('Lido da nota 000.074.974');
    expect(leitor.chamadas).toBe(1);
  });
  it('a leitura que termina DEPOIS da troca para Recibo não se aplica (nem "lido da nota", nem o tipo de volta a NF)', async () => {
    const { registrar } = monta();
    soltar(arquivo('n.xml', NOTA));
    tipo('Recibo');
    await umInstante();
    await waitFor(() => expect(screen.queryByTestId('nota-lendo')).toBeNull());
    expect(screen.queryByTestId('nota-lida')).toBeNull();
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(especieDoPedido(registrar)).toBe('recibo');
  });
  it('a troca para Recibo DURANTE a busca do emitente pelo CNPJ (a segunda espera da leitura) também não aplica a nota', async () => {
    let soltarBusca: (v: { ok: true; valor: null }) => void = () => {};
    banco.fornecedorPeloDocumento.mockImplementationOnce(() => new Promise((ok) => { soltarBusca = ok; }));
    const { registrar } = monta();
    soltar(arquivo('n.xml', NOTA));
    await waitFor(() => expect(banco.fornecedorPeloDocumento).toHaveBeenCalled());
    tipo('Recibo');
    soltarBusca({ ok: true, valor: null });
    await waitFor(() => expect(screen.queryByTestId('nota-lendo')).toBeNull());
    expect(screen.queryByTestId('nota-lida')).toBeNull();
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect([especieDoPedido(registrar), registrar.mock.calls[0][0].numero]).toEqual(['recibo', null]);
  });
});

describe('F1 — a OC de compra: a chave de acesso só na NF', () => {
  const api = (): DocumentosApi => ({
    documentos: [], lotes: [], loading: false, saving: false,
    registrar: vi.fn(async () => 'doc-1'), anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
    editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
  });
  const montarOC = (especie: typeof FORM_VAZIO.especie) => render(
    <DocumentoFormOC api={api()} initialForm={{ ...FORM_VAZIO, especie }} fornecedores={[]} contraparteId="cp" clienteId="cli"
      onCriarFornecedor={async () => null} onSaved={() => {}} onCancel={() => {}} />);
  it('Recibo: sem o campo Chave (o lugar fica reservado) e o PDF não passa pelo leitor de DANFE', async () => {
    const { container } = montarOC('recibo');
    expect(screen.queryByTestId('oc-doc-chave')).toBeNull();
    expect(screen.getByTestId('oc-doc-sem-chave')).toBeTruthy();
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('sem o campo de arquivo');
    fireEvent.change(input, { target: { files: [arquivo('recibo.pdf', new Uint8Array([37, 80, 68, 70]), 'application/pdf')] } });
    await umInstante();
    expect(pdfDaOC.extrair).not.toHaveBeenCalled();
  });
  it('a busca sabe achar: NF principal tem a Chave e o PDF é lido', async () => {
    const { container } = montarOC('nf_principal');
    expect(screen.getByTestId('oc-doc-chave')).toBeTruthy();
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('sem o campo de arquivo');
    fireEvent.change(input, { target: { files: [arquivo('nf.pdf', new Uint8Array([37, 80, 68, 70]), 'application/pdf')] } });
    await waitFor(() => expect(pdfDaOC.extrair).toHaveBeenCalledTimes(1));
  });
});

describe('F1 — a porta da nota: o PDF sem chave não parece nota', () => {
  it('"Nota sem chave de acesso." vira a frase que aponta a aba Documentos; as outras recusas ficam como são', () => {
    expect(fraseDaRecusaDaNota(FRASE_NOTA_SEM_CHAVE)).toBe(FRASE_NAO_PARECE_NOTA);
    expect(FRASE_NAO_PARECE_NOTA).toContain('aba Documentos');
    expect(fraseDaRecusaDaNota(FRASE_PDF_SEM_TEXTO)).toBe(FRASE_PDF_SEM_TEXTO);
    expect(fraseDaRecusaDaNota(null)).toBe('');
  });
});
