/**
 * P85 + P86 (Gabriel 23/10/2026) — a leitura do ACERTO e do ROMANEIO na aba Documentos da OC de abate, com cópias SINTÉTICAS do layout
 * dos PDFs da Fortunceres de 21/10 (2 lotes, ordens de compra 20001/20002, os dois romaneios com a MESMA "Ord. Prod."):
 *   (a) o PDF de acerto com a espécie NF: troca sozinha para Acerto e lê ("lido como Acerto");
 *   (b) o centavo de arredondamento do frigorífico: preenche com o TOTAL impresso e diz a diferença, sem alarme;
 *   (c) o rótulo é o frigorífico LIDO (razão social e CNPJ), nunca o nome do layout;
 *   (d) o lote da OC pela ordem de compra (a observação do lote), não "Todos os lotes";
 *   P86 os dois romaneios gravam, cada um no seu lote; a recusa do banco fica ESCRITA na faixa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { DocumentosApi, DocumentoPayload } from '@/hooks/useOperacaoDocumentos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const leitorLinhas = vi.hoisted(() => ({ extrairLinhasPdf: vi.fn(async (_f: File) => ({ linhas: ['DANFE'], paginas: 1, temTexto: true })) }));
vi.mock('@/lib/oc/leitura/linhasDoPdf', () => leitorLinhas);

import { AbaDocumentosOC } from './AbaDocumentosOC';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { ACERTO_LOTE7_UM_CENTAVO, CNPJ_MINERVA, ROMANEIO_LOTE6, ROMANEIO_LOTE7 } from '@/lib/oc/leitura/__fixtures__/linhasAbate';

const registrar = vi.fn(async (_p: DocumentoPayload): Promise<string | null> => 'doc-1');
const FRIG = { id: 'cp', nome: 'Frigorífico Exemplo', cpfCnpj: CNPJ_MINERVA };
const api = (recusa: string | null = null): DocumentosApi => ({
  documentos: [], loading: false, saving: false,
  /* os lotes da OC: a observação guarda a ordem de compra do frigorífico */
  lotes: [{ loteId: 'l6', ordem: 1, categoria: 'bois', qtd: 30, observacao: '20001' }, { loteId: 'l7', ordem: 2, categoria: 'bois', qtd: 21, observacao: '20002' }],
  registrar, anexarArquivo: vi.fn(async () => true), urlAssinada: vi.fn(async () => null),
  editar: vi.fn(async () => true), cancelar: vi.fn(async () => true), carregarDetalhe: vi.fn(async () => null),
  ultimaRecusa: () => recusa,
});
const montar = (a = api()) => render(<AbaDocumentosOC api={a} operacaoPronta tipoOperacao="abate" fornecedores={[FRIG]} contraparteId="cp" clienteId="cli" />);
const soltar = (linhas: readonly string[], nome = 'doc.pdf') => {
  leitorLinhas.extrairLinhasPdf.mockResolvedValueOnce({ linhas: [...linhas], paginas: 1, temTexto: true });
  fireEvent.change(screen.getByTestId('arquivo-abate'), { target: { files: [new File(['%PDF'], nome, { type: 'application/pdf' })] } });
};
const faixa = () => screen.getByTestId('faixa-conferencia').textContent ?? '';
const marcada = () => within(screen.getByTestId('linha-especie')).getAllByRole('button').filter((b) => b.className.includes('bg-primary')).map((b) => b.textContent);
const campo = (k: string) => { const i = screen.getByTestId('area-campos').querySelector(`[data-campo=${k}] input`); return i instanceof HTMLInputElement ? i.value : null; };
const novo = () => fireEvent.click(screen.getByRole('button', { name: /Novo documento/ }));

beforeEach(() => {
  registrar.mockClear(); registrar.mockImplementation(async () => 'doc-1');
  definirFornecedoresDoLeitor([FRIG]);
  Element.prototype.scrollIntoView = () => {};
});

describe('P85 — o acerto', () => {
  it('(a)(b)(c)(d) o acerto solto com a espécie NF: vira Acerto, lê com o TOTAL impresso e o centavo dito, mostra o frigorífico lido e pega o lote pela OC', async () => {
    montar();
    novo();
    expect(marcada()).toEqual(['NF']);
    soltar(ACERTO_LOTE7_UM_CENTAVO);
    await waitFor(() => expect(faixa()).toContain('lido como Acerto (a espécie era NF principal)'));
    expect(marcada()).toEqual(['Acerto']);
    expect(faixa()).toContain('lido do PDF (Acerto · FORTUNCERES S.A. 52.168.923/0002-31)');
    expect(faixa()).not.toContain('Minerva');
    expect(faixa()).toContain('diferença de R$ 0,01 de arredondamento no PDF (soma do resumo ≠ total)');
    expect(faixa()).not.toContain('nada preenchido');
    expect(campo('cab')).toBe('21');
    expect(campo('bruto')).toMatch(/124\.000,00$/);
    expect(screen.getByTestId('seletor-lotes').textContent).toBe('Lote 2 · 21 cab');
    expect(faixa()).toContain('lote pela ordem de compra 20002 · confira');
  });
});

describe('P86 — dois romaneios da mesma OC (a mesma Ord. Prod.)', () => {
  it('cada um grava no SEU lote (pela ordem de compra), mesmo soltos com outra espécie marcada', async () => {
    montar();
    novo();
    soltar(ROMANEIO_LOTE6, 'rom6.pdf');
    await waitFor(() => expect(marcada()).toEqual(['Romaneio']));
    await waitFor(() => expect(screen.getByTestId('seletor-lotes').textContent).toBe('Lote 1 · 30 cab'));
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(1));
    novo();
    soltar(ROMANEIO_LOTE7, 'rom7.pdf');
    await waitFor(() => expect(screen.getByTestId('seletor-lotes').textContent).toBe('Lote 2 · 21 cab'));
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(2));
    const pedidos = registrar.mock.calls.map((c) => c[0]);
    expect(pedidos.map((p) => [p.especie, p.lotes.join(','), p.cab])).toEqual([['romaneio', 'l6', 30], ['romaneio', 'l7', 21]]);
  });
  it('trocar a espécie à mão com o arquivo já escolhido LÊ DE NOVO (antes os campos ficavam vazios e o Registrar parava nas pendências)', async () => {
    montar();
    novo();
    fireEvent.click(within(screen.getByTestId('linha-especie')).getByRole('button', { name: 'NPR' }));
    leitorLinhas.extrairLinhasPdf.mockResolvedValue({ linhas: [...ROMANEIO_LOTE7], paginas: 1, temTexto: true });
    fireEvent.change(screen.getByTestId('arquivo-abate'), { target: { files: [new File(['%PDF'], 'r.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(marcada()).toEqual(['Romaneio']));
    fireEvent.click(within(screen.getByTestId('linha-especie')).getByRole('button', { name: 'Acerto' }));
    /* o PDF é romaneio: a releitura o devolve para Romaneio, com os campos lidos */
    await waitFor(() => expect(marcada()).toEqual(['Romaneio']));
    await waitFor(() => expect(campo('cab')).toBe('21'));
    leitorLinhas.extrairLinhasPdf.mockReset();
  });
  it('a recusa do banco fica ESCRITA na faixa ("Nada foi gravado: …"), nunca só no toast', async () => {
    registrar.mockImplementation(async () => null);
    montar(api('Operacao cancelada'));
    novo();
    soltar(ROMANEIO_LOTE7);
    await waitFor(() => expect(screen.getByTestId('seletor-lotes').textContent).toBe('Lote 2 · 21 cab'));
    fireEvent.click(screen.getByRole('button', { name: /Registrar documento/ }));
    await waitFor(() => expect(faixa()).toContain('Nada foi gravado: Operacao cancelada'));
  });
});
