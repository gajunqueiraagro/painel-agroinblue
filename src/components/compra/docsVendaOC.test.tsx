/**
 * OC-DOC-VENDA-01 — a aba Documentos da VENDA e' a do ABATE: o MESMO componente (`AbaDocumentosOC` + `DocumentoFormAbate`), pelo tipo.
 *   · os dois tipos desenham as mesmas pecas (linha da especie, area de 250px, faixa, rodape); so' os grupos e os blocos mudam
 *   · a leitura da NF do produtor e da GTA da venda PROPOE (preenche os campos) e so' grava no "Registrar"; a NF do produtor da
 *     venda grava o valor como ACRESCIMO (e' a nota da venda — soma)
 *   · nota repetida (chave viva noutro documento do cliente): a faixa diz onde, com o link, e o Registrar nao grava
 *   · o legado da venda (NF principal) edita no formulario de hoje
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { DocumentosApi, DocumentoDetalhe, DocumentoLista, DocumentoPayload, NotaRepetida } from '@/hooks/useOperacaoDocumentos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const leitorLinhas = vi.hoisted(() => ({ extrairLinhasPdf: vi.fn(async (_f: File) => ({ linhas: ['DANFE'], paginas: 1, temTexto: true })) }));
vi.mock('@/lib/oc/leitura/linhasDoPdf', () => leitorLinhas);

import { AbaDocumentosOC } from './AbaDocumentosOC';
import { DocumentoFormAbate, ALTURA_AREA_CAMPOS, enderecoDaOC } from './DocumentoFormAbate';
import { formAbateVazio } from '@/lib/oc/formDocumentoAbate';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { NFPE_SAIDA, EGTA_SAIDA, CHAVE_NFPE } from '@/lib/oc/leitura/__fixtures__/linhasAbate';

const registrar = vi.fn(async (_p: DocumentoPayload) => 'doc-1');
const LEGADO: DocumentoDetalhe = {
  documentoId: 'nfp', versao: 1, especie: 'nf_principal', numero: '000000123', serie: '1', chaveAcesso: '', dataEmissao: '2026-09-01',
  observacao: '', url: '', documentoOrigemId: null, emitenteId: null, emitenteNome: '', emitenteDocumento: '', componentes: [], loteIds: [],
};
const doc = (p: Partial<DocumentoLista>): DocumentoLista => ({
  documentoId: 'x', especie: 'nf_produtor', numero: '9444790', serie: '890', dataEmissao: '2026-10-01', situacao: 'ativo',
  cancelado: false, valorLiquido: 750000, totalAcrescimos: 750000, totalDescontosComerciais: 0, totalRetencoesSemCaixa: 0,
  totalDespesasDesembolso: 0, qtdComponentes: 1, qtdLotes: 2, documentoOrigemId: null, url: null, emitenteId: null,
  emitenteNome: null, emitenteDocumento: null, cab: 150, pesoKg: null, dataAbate: null, vencimento: null,
  dados: null, liquidoProprio: 750000, somaNoValor: true, ...p,
});
const api = (documentos: DocumentoLista[] = [], notaRepetida?: DocumentosApi['notaRepetida']): DocumentosApi => ({
  documentos, lotes: [{ loteId: 'l1', ordem: 1, categoria: 'bois', qtd: 75 }, { loteId: 'l2', ordem: 2, categoria: 'bois', qtd: 75 }],
  loading: false, saving: false, registrar, anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
  editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => LEGADO), notaRepetida,
});
const montar = (tipo: string, a = api()) => render(
  <AbaDocumentosOC api={a} operacaoPronta tipoOperacao={tipo} fornecedores={[{ id: 'cp', nome: 'Comprador' }]} contraparteId="cp" clienteId="cli" />);
const formVenda = (a = api(), especie: Parameters<typeof formAbateVazio>[0] = 'nf_produtor') => render(
  <DocumentoFormAbate api={a} initialForm={formAbateVazio(especie, 'venda')} contraparteId="cp" clienteId="cli" onSaved={() => {}} onCancel={() => {}} />);
const soltar = (nome: string) => fireEvent.change(screen.getByTestId('arquivo-abate'),
  { target: { files: [new File(['%PDF'], nome, { type: 'application/pdf' })] } });
const pecas = () => [...screen.getByTestId('form-abate').querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid'))
  .filter(t => ['linha-especie', 'especie-fixa', 'area-campos', 'faixa-conferencia', 'rodape-form'].includes(t ?? '')).join(',');

beforeEach(() => {
  registrar.mockClear();
  definirFornecedoresDoLeitor([{ id: 'cp', nome: 'Comprador' }]);
  Element.prototype.scrollIntoView = () => {};
});

describe('OC-DOC-VENDA-01 — o mesmo componente no abate e na venda', () => {
  it('abate e venda: as MESMAS pecas do formulario (250px); os grupos sao ABATE·SAÍDA e OPERAÇÃO·SAÍDA', () => {
    const grupos = () => [...screen.getByTestId('linha-especie').querySelectorAll('[data-testid^=grupo-especie-]')].map(e => e.getAttribute('data-testid'));
    const { unmount } = montar('abate');
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    const doAbate = pecas();
    expect(grupos()).toEqual(['grupo-especie-ABATE', 'grupo-especie-SAÍDA']);
    unmount();
    montar('venda');
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    expect(pecas()).toBe(doAbate);
    expect(grupos()).toEqual(['grupo-especie-OPERAÇÃO', 'grupo-especie-SAÍDA']);
    expect(screen.getByTestId('area-campos').style.height).toBe(`${ALTURA_AREA_CAMPOS}px`);
    /* a saida da fazenda e' a do abate; a venda nasce na NF do produtor */
    const saida = within(screen.getByTestId('grupo-especie-SAÍDA'));
    for (const e of ['NF produtor', 'GTA', 'Guia', 'Declaração', 'Outro']) expect(saida.getByRole('button', { name: e })).toBeInTheDocument();
    for (const e of ['Contrato', 'NF entrada', 'Comprovante'])
      expect(within(screen.getByTestId('grupo-especie-OPERAÇÃO')).getByRole('button', { name: e })).toBeInTheDocument();
    expect(screen.getByTestId('faixa-conferencia').textContent).toContain('é a nota da venda');
    /* 21/10: o "Outro" da venda e' informativo, igual ao abate */
    fireEvent.click(saida.getByRole('button', { name: 'Outro' }));
    expect(screen.getByTestId('faixa-conferencia').textContent).toBe('Outro · informativo · não soma');
  });

  it('a lista da venda: a tabela do abate em dois blocos, DA OPERAÇÃO e SAÍDA DA FAZENDA; o informativo mostra o seu valor', () => {
    montar('venda', api([doc({}), doc({ documentoId: 'c', especie: 'contrato', numero: 'P-77', somaNoValor: false, liquidoProprio: 0,
      valorLiquido: 0, totalInformativo: 750000 } as Partial<DocumentoLista>)]));
    expect(screen.getByTestId('tabela-docs-abate')).toBeInTheDocument();
    expect(screen.getByTestId('faixa-bloco-operacao').textContent).toContain('DA OPERAÇÃO');
    expect(screen.getByTestId('faixa-bloco-saida').textContent).toContain('SAÍDA DA FAZENDA');
    expect(screen.queryByTestId('faixa-bloco-abate')).toBeNull();
    expect(screen.getAllByTestId('valor-doc').map(e => e.textContent)).toEqual(['750.000,00', '750.000,00']);
    /* a conferencia da venda: a NF do produtor SOMA (o banco diz), o contrato e' informativo; a faixa nao cobra o frigorifico */
    expect(screen.getAllByTestId('celula-conferencia').map(e => e.textContent)).toEqual(['informativo · não soma', 'soma no valor da OC']);
    expect(screen.getByTestId('faixa-conferencia-abate').textContent).not.toMatch(/Acerto|NPR|Romaneio/);
  });

  it('o legado da venda (NF principal) edita no formulario de hoje', async () => {
    montar('venda', api([doc({ documentoId: 'nfp', especie: 'nf_principal' })]));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do documento' }), { key: 'Enter' });
    fireEvent.click(await screen.findByText('Editar'));
    await waitFor(() => expect(screen.getByText('Espécie')).toBeInTheDocument());
    expect(screen.queryByTestId('form-abate')).toBeNull();
  });
});

describe('OC-DOC-VENDA-01 — a leitura propoe; so o Registrar grava', () => {
  it('NF do produtor (NFP-e) da venda: le, preenche, NAO grava; no Registrar, o valor vai como ACRESCIMO (soma)', async () => {
    leitorLinhas.extrairLinhasPdf.mockResolvedValueOnce({ linhas: NFPE_SAIDA, paginas: 1, temTexto: true });
    formVenda();
    soltar('nfpe.pdf');
    await screen.findByText(/lido do PDF \(NFP-e\)/);
    expect(registrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('registrar-documento'));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    const p = registrar.mock.calls[0][0];
    expect(p.especie).toBe('nf_produtor');
    expect(p.componentes).toEqual([expect.objectContaining({ tipo: 'valor_bruto', natureza: 'acrescimo' })]);
    expect(p.lotes).toEqual(['l1', 'l2']);   // a nota cobre os dois lotes: uma vez so', na operacao inteira
    expect(p.chaveAcesso?.replace(/\D/g, '')).toBe(CHAVE_NFPE.replace(/\D/g, ''));
  });

  it('GTA da venda: le, NAO grava; no Registrar, o cab e Femeas + Machos e nada soma', async () => {
    leitorLinhas.extrairLinhasPdf.mockResolvedValueOnce({ linhas: EGTA_SAIDA, paginas: 1, temTexto: true });
    formVenda(api(), 'gta');
    soltar('gta.pdf');
    await screen.findByText(/lido do PDF \(e-GTA\)/);
    expect(registrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('registrar-documento'));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    const p = registrar.mock.calls[0][0];
    expect(p.especie).toBe('gta');
    expect(p.cab).toBeGreaterThan(0);
    expect(p.componentes).toEqual([]);
  });
});

describe('OC-DOC-VENDA-01 — nota repetida', () => {
  const REPETIDA: NotaRepetida = { documentoId: 'd0', operacaoId: 'op-outra', tipoOperacao: 'venda', rotulo: 'Venda de 02/04/2031 · Comprador' };

  it('a chave ja viva noutra OC: a faixa diz onde, com o link para a OC (na aba Documentos), e o Registrar nao grava', async () => {
    leitorLinhas.extrairLinhasPdf.mockResolvedValueOnce({ linhas: NFPE_SAIDA, paginas: 1, temTexto: true });
    const pergunta = vi.fn(async () => REPETIDA);
    formVenda(api([], pergunta));
    soltar('nfpe.pdf');
    const faixa = await screen.findByText('Esta nota já está registrada: Venda de 02/04/2031 · Comprador · não grava de novo');
    expect(faixa.closest('[data-testid=faixa-conferencia]')!.getAttribute('data-tom')).toBe('erro');
    expect(pergunta).toHaveBeenCalledWith(CHAVE_NFPE.replace(/\D/g, ''), null);
    const link = screen.getByTestId('abrir-nota-repetida');
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect([url.searchParams.get('oc_venda'), url.searchParams.get('oc_id'), url.searchParams.get('oc_aba')]).toEqual(['1', 'op-outra', 'documentos']);
    expect(link.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByTestId('registrar-documento'));
    await new Promise(r => setTimeout(r, 0));
    expect(registrar).not.toHaveBeenCalled();
    /* a faixa nao muda de altura */
    expect(screen.getByTestId('faixa-conferencia').style.height).toBe('22px');
  });

  it('o endereco troca o tipo e nunca deixa dois shells ligados', () => {
    const u = new URL(enderecoDaOC({ operacaoId: 'a1', tipoOperacao: 'abate' }, '?oc_venda=1&oc_id=zz&x=1'), 'http://x');
    expect([u.searchParams.get('oc_abate'), u.searchParams.get('oc_venda'), u.searchParams.get('oc_id'), u.searchParams.get('x')])
      .toEqual(['1', null, 'a1', '1']);
  });
});
