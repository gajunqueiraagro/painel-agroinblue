/**
 * OC-DOC-ESPECIE-ABATE-01 passo 2 — a aba Documentos do ABATE: a grade por especie com tamanho fixo, a lista do abate, e o
 * registrar pelo payload do dono. O jsdom nao mede: aqui se prova o CONTRATO (as mesmas pecas, a mesma altura declarada, em
 * todas as especies); a medida renderizada e' da bancada no Chromium.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { DocumentosApi, DocumentoDetalhe, DocumentoLista, DocumentoPayload } from '@/hooks/useOperacaoDocumentos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/lib/financeiro/parser/extractPdfText', () => ({ extractPdfText: vi.fn(async () => ({ text: 'DANFE', hasTextLayer: true })) }));
vi.mock('@/lib/oc/extrairDanfe', () => ({ extrairDanfe: vi.fn(() => ({
  chaveAcesso: null, numero: '8812', serie: '2', dataEmissao: '2026-10-01', emitenteCnpj: '11.222.333/0001-81',
  emitenteNome: 'FRIGORIFICO BOI GORDO LTDA', destinatarioNome: null, valorTotal: 98135.31, daChave: false,
})) }));

import { AbaDocumentosOC } from './AbaDocumentosOC';
import { ALTURA_AREA_CAMPOS, DocumentoFormAbate, FRASE_ESPECIE_FIXA } from './DocumentoFormAbate';
import { formAbateVazio } from '@/lib/oc/formDocumentoAbate';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const registrar = vi.fn(async (_p: DocumentoPayload) => 'doc-1');
const doc = (p: Partial<DocumentoLista>): DocumentoLista => ({
  documentoId: 'x', especie: 'nf_principal', numero: '000008812', serie: '1', dataEmissao: '2026-10-01', situacao: 'ativo',
  cancelado: false, valorLiquido: 96535.7, totalAcrescimos: 0, totalDescontosComerciais: 0, totalRetencoesSemCaixa: 0,
  totalDespesasDesembolso: 0, qtdComponentes: 1, qtdLotes: 0, documentoOrigemId: null, url: null, emitenteId: null,
  emitenteNome: null, emitenteDocumento: null, cab: 54, pesoKg: 12906.5, dataAbate: '2026-09-30', vencimento: null,
  dados: null, liquidoProprio: 96535.7, somaNoValor: true, ...p,
});
const DETALHE_ACERTO: DocumentoDetalhe = {
  documentoId: 'ac', versao: 2, especie: 'acerto', numero: 'Acerto OC 10352', serie: '', chaveAcesso: '', dataEmissao: '',
  observacao: '', url: '', documentoOrigemId: null, emitenteId: null, emitenteNome: '', emitenteDocumento: '', componentes: [], loteIds: [],
};
const api = (documentos: DocumentoLista[] = []): DocumentosApi => ({
  documentos, lotes: [{ loteId: 'l1', ordem: 1, categoria: 'vacas', qtd: 18 }], loading: false, saving: false,
  registrar, anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
  editar: vi.fn(async () => true), cancelar: vi.fn(async () => true),
  carregarDetalhe: vi.fn(async () => DETALHE_ACERTO),
});
const montar = (tipo: string | undefined, a = api()) => render(
  <AbaDocumentosOC api={a} operacaoPronta tipoOperacao={tipo} fornecedores={[{ id: 'cp', nome: 'Frigorífico' }]} contraparteId="cp" clienteId="cli" />);

beforeEach(() => {
  registrar.mockClear();
  definirFornecedoresDoLeitor([{ id: 'cp', nome: 'Frigorífico' }]);
  Element.prototype.scrollIntoView = () => {};
});

const assinatura = () => {
  const form = screen.getByTestId('form-abate');
  return [...form.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid'))
    .filter(t => ['linha-especie', 'especie-fixa', 'area-campos', 'faixa-conferencia', 'rodape-form'].includes(t ?? '')).join(',');
};

describe('aba Documentos do abate', () => {
  it('trocar a especie troca SO os campos: a mesma area de 250px, a mesma linha, a mesma faixa e o mesmo rodape', () => {
    montar('abate');
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    const base = assinatura();
    const vistos: Record<string, number> = {};
    for (const e of ['NF', 'NPR', 'Acerto', 'Romaneio', 'Outro']) {
      fireEvent.click(within(screen.getByTestId('linha-especie')).getByRole('button', { name: e }));
      const area = screen.getByTestId('area-campos');
      expect(area.style.height).toBe(`${ALTURA_AREA_CAMPOS}px`);
      expect(area.className).toContain('overflow-hidden');
      expect(screen.getByTestId('faixa-conferencia').style.height).toBe('22px');
      expect(assinatura()).toBe(base);
      vistos[e] = area.querySelectorAll('[data-campo]').length;
    }
    expect(vistos).toEqual({ NF: 20, NPR: 6, Acerto: 13, Romaneio: 7, Outro: 8 });
  });

  it('obrigatorio que falta fica vermelho e a faixa diz o que falta; nada e gravado', () => {
    montar('abate');
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    fireEvent.click(within(screen.getByTestId('linha-especie')).getByRole('button', { name: 'Acerto' }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    expect(screen.getByTestId('faixa-conferencia').textContent).toMatch(/^falta: Ordem de compra, Data do abate, Cab, Carcaça kg, Bruto R\$, Líquido R\$/);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('NPR preenchida registra pelo payload do dono', async () => {
    montar('abate');
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    fireEvent.click(within(screen.getByTestId('linha-especie')).getByRole('button', { name: 'NPR' }));
    const campo = (k: string) => screen.getByTestId('area-campos').querySelector(`[data-campo=${k}] input`)!;
    fireEvent.change(campo('numero'), { target: { value: 'N-1' } });
    fireEvent.change(campo('vencimento'), { target: { value: '20102026' } }); fireEvent.blur(campo('vencimento'));
    fireEvent.focus(campo('valor')); fireEvent.change(campo('valor'), { target: { value: '96.535,70' } }); fireEvent.blur(campo('valor'));
    fireEvent.change(campo('nfRefNumero'), { target: { value: '8812' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    const p = registrar.mock.calls[0][0];
    expect([p.especie, p.numero, p.vencimento, p.dados]).toEqual(['npr', 'N-1', '2026-10-20', { nf_referida: { numero: '8812' } }]);
    expect(p.componentes).toEqual([{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: 96535.7, ordem: 1 }]);
  });

  it('na edicao a especie fica so leitura, com a frase', async () => {
    montar('abate', api([doc({ documentoId: 'ac', especie: 'acerto', numero: null, somaNoValor: false })]));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do documento' }), { key: 'Enter' });
    fireEvent.click(await screen.findByText('Editar'));
    await screen.findByTestId('form-abate');
    expect(screen.getByTestId('especie-fixa').textContent).toBe(FRASE_ESPECIE_FIXA);
    const linha = within(screen.getByTestId('linha-especie'));
    expect(linha.getByRole('button', { name: 'NF' })).toBeDisabled();
    expect(linha.getByRole('button', { name: 'Acerto' })).not.toBeDisabled();
  });

  it('lista do abate: uma coluna por informacao, a Conferencia reservada e o Outro informativo', () => {
    montar('abate', api([doc({}), doc({ documentoId: 'o', especie: 'outro', numero: null, somaNoValor: false })]));
    const cab = [...screen.getByTestId('tabela-docs-abate').querySelectorAll('th')].map(t => t.textContent);
    expect(cab).toEqual(['Tipo', 'Número', 'Data', 'Venc.', 'Cab', 'Peso kg', 'Valor R$', 'Conferência', '', '']);
    const linhas = screen.getAllByTestId('linha-doc-abate');
    expect(linhas[0].textContent).toContain('000.008.812');
    expect(linhas[0].textContent).toContain('01/10/26');
    expect(linhas[1].textContent).toContain('informativo · não soma');
    expect(screen.getAllByTestId('celula-conferencia').every(c => c.textContent === '')).toBe(true);
  });

  it('compra e venda seguem com o formulario e a lista de hoje', () => {
    montar(undefined, api([doc({})]));
    expect(screen.queryByTestId('tabela-docs-abate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));
    expect(screen.queryByTestId('form-abate')).toBeNull();
    expect(screen.getByText('Espécie')).toBeInTheDocument();
  });

  it('emitente nao achado pelo CNPJ: a faixa ambar sugere o parecido; "usar este" grava o CNPJ e o escolhe; a altura nao muda', async () => {
    const gravar = vi.fn(async (_id: string, _doc: string) => true);
    render(<DocumentoFormAbate api={api()} initialForm={formAbateVazio()} contraparteId="cp" clienteId="cli"
      fornecedores={[{ id: 'cp', nome: 'Outro Comprador' }, { id: 'fg', nome: 'Frigorifico Boi Gordo', cpfCnpj: null }]}
      onGravarDocumentoFornecedor={gravar} onSaved={() => {}} onCancel={() => {}} />);
    const faixa = () => screen.getByTestId('faixa-conferencia');
    const altura = faixa().style.height;
    expect(faixa().getAttribute('data-tom')).toBe('neutro');
    fireEvent.change(screen.getByTestId('arquivo-abate'), { target: { files: [new File(['%PDF'], 'nf.pdf', { type: 'application/pdf' })] } });
    await screen.findByText(/Emitente não achado pelo CNPJ · parecido: Frigorifico Boi Gordo/);
    expect(faixa().getAttribute('data-tom')).toBe('emitente');
    expect(faixa().style.height).toBe(altura);
    fireEvent.click(screen.getByTestId('usar-candidato'));
    await waitFor(() => expect(gravar).toHaveBeenCalledWith('fg', '11.222.333/0001-81'));
    await waitFor(() => expect(faixa().getAttribute('data-tom')).toBe('neutro'));
    expect(faixa().style.height).toBe(altura);
  });

  it('o parecido que ja tem OUTRO CNPJ nao e sobrescrito: a faixa avisa e nada e gravado', async () => {
    const gravar = vi.fn(async () => true);
    render(<DocumentoFormAbate api={api()} initialForm={formAbateVazio()} contraparteId="cp" clienteId="cli"
      fornecedores={[{ id: 'fg', nome: 'Frigorifico Boi Gordo', cpfCnpj: '11.222.333/0002-62' }]}
      onGravarDocumentoFornecedor={gravar} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('arquivo-abate'), { target: { files: [new File(['%PDF'], 'nf.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(await screen.findByTestId('usar-candidato'));
    expect(await screen.findByText(/já tem o CNPJ 11.222.333\/0002-62.*mesma raiz: outra filial\?.*nada foi alterado/)).toBeInTheDocument();
    expect(gravar).not.toHaveBeenCalled();
  });

  it('fonte: a tela do abate nao escreve campo por especie (so desenha o que o dono devolve)', () => {
    const src = readFileSync('src/components/compra/DocumentoFormAbate.tsx', 'utf8');
    expect(src).toContain('camposDaEspecie(');
    expect(src).not.toMatch(/especie\s*===\s*'(npr|romaneio)'/);
    expect(readFileSync('src/components/abate/AbateModalShell.tsx', 'utf8')).toContain('tipoOperacao="abate"');
  });
});
