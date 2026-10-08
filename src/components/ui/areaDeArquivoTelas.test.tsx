/**
 * UI-ARRASTAR-ARQUIVO-01a — o que MUDOU nas quatro telas com a troca (o que não mudou está na caracterização):
 * a recusa aparece NA ÁREA (na OC era toast; na aba Documentos só vinha ao gravar), o `.xml` sem tipo passou a valer na aba
 * Documentos, e a proteção global convive com as áreas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leitorPdf = vi.hoisted(() => ({ extractPdfText: vi.fn(async (_f: File) => ({ text: '', pageCount: 1, hasTextLayer: false })) }));
const toastErro = vi.hoisted(() => vi.fn());
vi.mock('@/lib/financeiro/parser/extractPdfText', () => leitorPdf);
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastErro, info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/financeiro/nfeConsultas', () => ({
  iePorFazenda: async () => ({}), fornecedorPeloNome: async () => null, notaJaRegistrada: async () => [],
  ultimaClassificacaoDoFornecedor: async () => null, gravarDocumentoNoCadastro: async () => null,
}));

import { FormDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { NovoDeXmlDialog } from '@/components/financeiro-v2/NovoDeXmlDialog';
import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { DocumentoFormOC, FORM_VAZIO } from '@/components/compra/DocumentoFormOC';
import { protegerSoltarFora } from '@/lib/arquivo/protegerSoltarFora';
import type { LancDocPayload, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
/* FORN-SELETOR-PADRAO-01 fatia 2a — o emitente lê do leitor único (de mentira no teste) */
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const soltar = (alvo: Element, arquivos: File[]) => fireEvent.drop(alvo, { dataTransfer: { files: arquivos, types: ['Files'] } });
const txt = () => new File(['x'], 'nota.txt', { type: 'text/plain' });
const apiOC = (): DocumentosApi => ({
  documentos: [], lotes: [], loading: false, saving: false,
  registrar: vi.fn(async () => 'doc-1'), anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
  editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
});
function apiLanc() {
  const registrar = vi.fn(async (_p: LancDocPayload) => ({ id: 'novo', origem: 'lancamento' as const, operacaoId: null }));
  const anexar = vi.fn(async (..._a: unknown[]) => true);
  const api: LancamentoDocumentosApi = {
    documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar, editar: vi.fn(async () => true), cancelar: vi.fn().mockResolvedValue(true), anexar, urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
  return { api, registrar, anexar };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  leitorPdf.extractPdfText.mockClear(); toastErro.mockClear();
});

describe('documento da OC — a recusa saiu do toast e foi para a área', () => {
  const area = () => document.querySelector('[data-area-de-arquivo]') as HTMLElement;
  it('tipo errado: a frase na faixa, nenhum toast, o leitor não é chamado e o arquivo não fica', () => {
    render(<DocumentoFormOC api={apiOC()} initialForm={FORM_VAZIO} onSaved={() => {}} onCancel={() => {}} />);
    expect(area().textContent).toBe('Clique ou arraste o arquivo · PDF, imagem ou XML · até 10 MB · NF em PDF preenche os campos abaixoEscolher');
    soltar(area(), [txt()]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(toastErro).not.toHaveBeenCalled();
    expect(leitorPdf.extractPdfText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Escolher' })).toBeTruthy();
  });
  it('XML ENTRA na OC (como desde o 01b1), com o tipo informado ou sem ele — e não vai ao leitor de PDF', async () => {
    for (const type of ['text/xml', '']) {
      const { unmount } = render(<DocumentoFormOC api={apiOC()} initialForm={FORM_VAZIO} onSaved={() => {}} onCancel={() => {}} />);
      soltar(area(), [new File(['<nfeProc/>'], 'NFe-84.xml', { type })]);
      await waitFor(() => expect(area().getAttribute('title')).toBe('NFe-84.xml'));
      expect(screen.queryByTestId('area-de-arquivo-recusa')).toBeNull();
      unmount();
    }
    expect(leitorPdf.extractPdfText).not.toHaveBeenCalled();
  });
  it('acima de 10 MB: a frase diz o tamanho', () => {
    render(<DocumentoFormOC api={apiOC()} initialForm={FORM_VAZIO} onSaved={() => {}} onCancel={() => {}} />);
    soltar(area(), [new File([new Uint8Array(12 * 1024 * 1024)], 'grande.pdf', { type: 'application/pdf' })]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Arquivo de 12.0 MB excede o limite de 10 MB.');
  });
  it('com arquivo: o nome corta com o inteiro no `title`, o tamanho fica fixo e o botão vira "Trocar"; a faixa tem 40px sempre', async () => {
    render(<DocumentoFormOC api={apiOC()} initialForm={{ ...FORM_VAZIO, url: 'c/o/d.pdf' }} onSaved={() => {}} onCancel={() => {}} />);
    /* documento que já tem arquivo: a frase é o TEXTO da faixa, não uma linha a mais */
    expect(area().textContent).toBe('Já há um arquivo anexado · enviar outro substituiEscolher');
    expect(area().className).toContain('h-10');
    soltar(area(), [new File([new Uint8Array(2 * 1024 * 1024)], 'NF 84 Agnaldo.jpg', { type: 'image/jpeg' })]);
    await waitFor(() => expect(area().getAttribute('title')).toBe('NF 84 Agnaldo.jpg'));
    expect(area().textContent).toBe('NF 84 Agnaldo.jpg2.0 MBTrocar');
    expect(area().className).toContain('h-10');
  });
  it('a fonte não tem mais toast nem arrastar próprio', () => {
    const fonte = readFileSync(resolve(__dirname, '../compra/DocumentoFormOC.tsx'), 'utf8');
    expect(fonte).not.toMatch(/toast\.|onDrop=|onDragOver=|type="file"/);
    /* a busca sabe achar: a área do sistema está lá */
    expect(fonte).toContain('<AreaDeArquivo');
  });
});

describe('aba Documentos do lançamento — o tipo errado é recusado ao escolher; `.xml` sem tipo vale', () => {
  it('tipo errado solto: a frase na área e nenhum arquivo escolhido', () => {
    const { api } = apiLanc();
    render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={() => {}} />);
    soltar(screen.getByTestId('area-arquivo'), [txt()]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(screen.queryByTestId('arquivo-escolhido')).toBeNull();
  });
  it('`.xml` que o navegador entrega SEM tipo: aceito, e o que vai ao anexar tem o tipo preenchido', async () => {
    const { api, anexar } = apiLanc();
    render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={() => {}} />);
    soltar(screen.getByTestId('area-arquivo'), [new File(['<nfeProc/>'], 'NFe-12345.xml', { type: '' })]);
    expect(screen.getByTestId('arquivo-escolhido').textContent).toBe('NFe-12345.xml');
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(anexar).toHaveBeenCalledTimes(1));
    const enviado = anexar.mock.calls[0][2] as File;
    expect(enviado.name).toBe('NFe-12345.xml');
    expect(enviado.type).toBe('application/xml');
  });
  it('a área tem 40px fixos e o nome longo não empilha (corta, com o inteiro no `title`)', () => {
    const { api } = apiLanc();
    render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={() => {}} />);
    const area = screen.getByTestId('area-arquivo');
    const nome = 'NFe 000.031.776 Comercial Pantanal de Rio Verde Ltda - via do destinatario - copia (2).pdf';
    soltar(area, [new File(['%PDF'], nome, { type: 'application/pdf' })]);
    expect(area.className).toContain('h-10');
    expect(area.className).toContain('whitespace-nowrap');
    expect(area.getAttribute('title')).toBe(nome);
    expect(screen.getByTestId('arquivo-escolhido').parentElement?.className).toContain('truncate');
  });
});

describe('as duas telas de lote', () => {
  it('Do XML sem cliente: a área fica APAGADA com o motivo, e soltar não lê nada', () => {
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId={null} fazendas={[]} fornecedores={[]} onAbrirLancamento={() => {}} lancadas={new Set()} />);
    const area = screen.getByTestId('xml-area-de-soltar');
    expect(area.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('area-de-arquivo-motivo').textContent).toBe('Selecione um cliente para ler as notas.');
    soltar(area, [new File(['<x/>'], 'a.xml', { type: 'text/xml' })]);
    expect(screen.queryAllByTestId('xml-linha')).toHaveLength(0);
  });
  it('Do XML com cliente: uma linha de convite, e o botão "Escolher arquivos"', () => {
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[]} fornecedores={[]} onAbrirLancamento={() => {}} lancadas={new Set()} />);
    const area = screen.getByTestId('xml-area-de-soltar');
    expect(area.textContent).toBe('Clique ou arraste os XML das notas · NF-e (modelo 55) · um arquivo por nota · vários de uma vezEscolher arquivos');
    expect(area.className).toContain('h-12');
    expect((screen.getByTestId('xml-input') as HTMLInputElement).multiple).toBe(true);
  });
  it('boletos: uma linha de convite com o limite e "vários de uma vez", 40px', () => {
    render(<AnexarBoletosDialog parcelas={[{ numero: 1, vencimento: '2026-10-05', valor: 1, temBoleto: false }]} onConfirmar={vi.fn()} onFechar={() => {}} />);
    const area = screen.getByTestId('soltar-boletos');
    expect(area.textContent).toBe('Clique ou arraste os boletos · PDF ou imagem · até 10 MB cada · vários de uma vezEscolher arquivos');
    expect(area.className).toContain('h-10');
  });
  it('boletos: a tela mostra o que grava — XML solto vira linha RECUSADA (PDF, JPG ou PNG)', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(null);
    render(<AnexarBoletosDialog parcelas={[{ numero: 1, vencimento: '2026-10-05', valor: 1, temBoleto: false }]} onConfirmar={onConfirmar} onFechar={() => {}} />);
    soltar(screen.getByTestId('soltar-boletos'), [new File(['<x/>'], 'nota.xml', { type: 'text/xml' }), new File(['<x/>'], 'outra.xml', { type: '' })]);
    await waitFor(() => expect(screen.getAllByTestId('linha-boleto')).toHaveLength(2));
    expect(screen.getAllByText('Formato não aceito. Envie PDF, JPG ou PNG.')).toHaveLength(2);
  });
});

describe('a proteção global convive com as áreas', () => {
  it('ligada: soltar DENTRO da área chega ao destino; soltar FORA é só barrado', async () => {
    const desligar = protegerSoltarFora();
    try {
      const { api } = apiLanc();
      render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={() => {}} />);
      soltar(screen.getByTestId('area-arquivo'), [new File(['%PDF'], 'dentro.pdf', { type: 'application/pdf' })]);
      expect(screen.getByTestId('arquivo-escolhido').textContent).toBe('dentro.pdf');
      /* fora: o evento volta prevenido (fireEvent devolve false) e o arquivo escolhido não muda */
      expect(soltar(document.body, [new File(['%PDF'], 'fora.pdf', { type: 'application/pdf' })])).toBe(false);
      expect(screen.getByTestId('arquivo-escolhido').textContent).toBe('dentro.pdf');
    } finally { desligar(); }
  });
});
