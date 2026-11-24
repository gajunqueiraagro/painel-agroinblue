/**
 * FOLHA-NA-CAIXA-01 — a Caixa PONTA A PONTA com o recibo do contador (dado INVENTADO; leitor, banco e divisor em memória): o PDF arrastado
 * que o `lerFolha` reconhece vira a linha "Folha" (tipo · competência, N pessoas, o total) com "Abrir"; Abrir = a prévia por funcionário;
 * Aprovar grava, sobe e a linha fica "feito". E o leitor de verdade (`lerDaCaixaCom`, pdfjs falso) dá o 3º tipo.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { lerDaCaixaCom, type LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';
import type { FolhaCaixaApi } from '@/lib/folha/folhaCaixaApi';
import type { FolhaLida } from '@/lib/folha/lerFolha';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

const FOLHA: FolhaLida = {
  layout: 'sci', tipo: '13_1', competencia: '2026-11', empregadores: ['11122233344'], total: 1530,
  pessoas: [{ codigo: '12', nome: 'FULANA FICTICIA', cei: '11122233344', paginas: [1], valor: 730 },
    { codigo: '15', nome: 'BELTRANO FICTICIO', cei: '11122233344', paginas: [2], valor: 800 }],
};
const ler: LerArquivoDaCaixa = async () => ({ k: 'folha', folha: FOLHA });
const nada = async () => ({ ok: true as const, dados: true as const });
const api = {
  lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
  entrar: vi.fn<CaixaApi['entrar']>(), subirArquivo: vi.fn<CaixaApi['subirArquivo']>(),
  documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
  marcar: vi.fn<CaixaApi['marcar']>(), registrarDocumento: vi.fn<CaixaApi['registrarDocumento']>(),
};
const parcela = { entrar: api.entrar, subirArquivo: api.subirArquivo, ligar: vi.fn<ParcelaApi['ligar']>(), boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>() };
const entrada = {
  endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'd', endereco: null, criadoEm: null } })),
  gerar: vi.fn<EntradaEmailApi['gerar']>(), revogar: vi.fn<EntradaEmailApi['revogar']>(),
  todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: [] })),
  baixar: vi.fn<EntradaEmailApi['baixar']>(), ignorar: vi.fn<EntradaEmailApi['ignorar']>(nada), voltar: vi.fn<EntradaEmailApi['voltar']>(nada),
  resolver: vi.fn<EntradaEmailApi['resolver']>(nada), notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
};
const casa = (k: number) => ({ paginas: FOLHA.pessoas[k].paginas, nome: FOLHA.pessoas[k].nome, lancamentoId: `l${k}`, antes: 1000, depois: FOLHA.pessoas[k].valor,
  nomeConfere: 'exato' as const, casouPor: 'funcionario' as const, acao: 'casar' as const, descricaoAntes: 'Folha Pagamento - 13', descricao: 'Folha Pagamento - 13',
  vencimentoAntes: '2026-12-05', vencimento: '2026-12-05', status: 'previsto', segunda: null, recibo: null, valorConfere: null, statusDepois: null });
const folhaApi = {
  aplicar: vi.fn<FolhaCaixaApi['aplicar']>(async (_c, _e, _d, _i, simular) => ({ ok: true, dados: {
    jaAplicado: false, completar: false, automaticos: [casa(0), casa(1)], criar: [], pendencias: [], semRecibo: [], semFuncionario: [], soma: 1530,
    documentos: simular ? [] : [{ documentoId: 'd0', storagePath: 'cli/m-p1.pdf', nome: 'A', paginas: [1], lancamentoId: 'l0' }, { documentoId: 'd1', storagePath: 'cli/m-p2.pdf', nome: 'B', paginas: [2], lancamentoId: 'l1' }] } })),
  desfazer: vi.fn<FolhaCaixaApi['desfazer']>(), subir: vi.fn<FolhaCaixaApi['subir']>(async () => ({ ok: true, dados: true })),
};
const dividir = async () => ({ ok: true as const, arquivos: [new Uint8Array([1]), new Uint8Array([2])] });
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
  };
}

describe('FOLHA-NA-CAIXA-01 — a Caixa com o recibo do contador', () => {
  it('arrastado → linha "Folha" (13º 1ª parcela · 11/2026, 2 pessoas, o total) → Abrir = a prévia → Aprovar grava, sobe e a linha fica feita', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={api} parcela={parcela} ler={ler} entrada={entrada} hoje="2026-11-24"
      aoFechar={() => {}} folha={{ api: folhaApi, dividir }} />);
    const input = await screen.findByTestId('input-da-caixa');
    fireEvent.change(input, { target: { files: [new File(['%PDF recibos'], 'Recibos 13 fictício.pdf', { type: 'application/pdf' })] } });
    /* a linha "lendo…" dá lugar à linha da folha (outra chave): procura de novo */
    const daFolha = () => screen.getAllByTestId('linha-da-caixa').find((tr) => tr.getAttribute('data-chave')?.startsWith('folha:'));
    await waitFor(() => expect(daFolha()).toBeTruthy());
    const linha = daFolha();
    if (!linha) throw new Error('sem linha');
    const c = within(linha).getAllByRole('cell').map((x) => x.textContent);
    expect(c[0]).toBe('Folha');
    expect(c[3]).toBe('13º 1ª parcela · 11/2026');
    expect(c[5]).toBe('1.530,00');
    expect(c[6]).toMatch(/a aplicar2 pessoas · "Abrir" mostra a prévia/);
    fireEvent.click(within(linha).getByTestId('acao-abrir_folha'));
    await waitFor(() => expect(screen.getByTestId('folha-da-caixa')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled());
    expect(folhaApi.aplicar.mock.calls[0][4]).toBe(true);
    fireEvent.click(screen.getByTestId('aprovar-folha'));
    await waitFor(() => expect(folhaApi.subir).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(daFolha() ?? linha).getByTestId('no-sistema').textContent).toMatch(/^feito/));
    expect(entrada.resolver).not.toHaveBeenCalled();   // arrastado: não há linha de e-mail a marcar
  });

  it('ARRASTADO e aplicado (118610): registra o arquivo, sobe no caminho devolvido, vai para Resolvidos com quem e o que gerou', async () => {
    const md5Do = (await import('@/lib/arquivo/md5')).md5;
    const registrado = { id: 'arr-1', storagePath: 'cli/entrada/x.pdf', jaExistia: false, estado: 'a_ler' };
    const reg = vi.fn<NonNullable<EntradaEmailApi['registrarArrastado']>>(async () => ({ ok: true, dados: registrado }));
    const detalheFolha = { quem: 'Pessoa Ficticia', quando: '2026-11-24T17:02:00Z', folha: { tipo: '13_1', competencia: '2026-11', lancamentos: 2, pessoas: 2 }, boleto: null, nota: null };
    const res = vi.fn<NonNullable<EntradaEmailApi['resolvidos']>>(async () => ({ ok: true, dados: { 'arr-1': detalheFolha } }));
    const todasDepois = [entradaDaLinha({ id: 'arr-1', mensagem_id: 'arrastado:x', remetente: null, assunto: null, recebido_em: '2026-11-24T17:00:00Z',
      arquivo_nome: 'Recibos 13 ficticio.pdf', tipo: 'pdf', tamanho_bytes: 12, storage_path: 'cli/entrada/x.pdf', estado: 'folha', lido_em: '2026-11-24T17:02:00Z', origem: 'arrastado' })];
    entrada.todas.mockResolvedValue({ ok: true, dados: [] });
    entrada.resolver.mockClear(); entrada.resolver.mockImplementation(async () => { entrada.todas.mockResolvedValue({ ok: true, dados: todasDepois }); return { ok: true, dados: true }; });
    api.subirArquivo.mockReset(); api.subirArquivo.mockResolvedValue({ ok: true, dados: true });
    folhaApi.subir.mockClear();
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} parcela={parcela} ler={ler} entrada={{ ...entrada, registrarArrastado: reg, resolvidos: res }} hoje="2026-11-24"
      aoFechar={() => {}} folha={{ api: folhaApi, dividir }} />);
    const arquivo = new File(['%PDF recibos'], 'Recibos 13 ficticio.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByTestId('input-da-caixa'), { target: { files: [arquivo] } });
    const daFolha = () => screen.getAllByTestId('linha-da-caixa').find((tr) => tr.getAttribute('data-chave')?.startsWith('folha:'));
    await waitFor(() => expect(daFolha()).toBeTruthy());
    fireEvent.click(within(daFolha() ?? document.body).getByTestId('acao-abrir_folha'));
    await waitFor(() => expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('aprovar-folha'));
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledWith('arr-1', 'folha', null, null));
    expect(reg.mock.calls[0][1]).toEqual({ nome: 'Recibos 13 ficticio.pdf', tipo: 'pdf', tamanho: 12, md5: md5Do(new TextEncoder().encode('%PDF recibos')) });
    expect(api.subirArquivo.mock.calls[0][0]).toBe('cli/entrada/x.pdf');
    /* em Resolvidos: quem arrastou e o que gerou */
    fireEvent.click(screen.getByTestId('concluir-folha'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Resolvidos/ })[0]);
    const linha = await screen.findByTestId('linha-resolvida');
    const c = within(linha).getAllByRole('cell').map((x) => x.textContent);
    expect(c[3]).toBe('arrastado · Pessoa Ficticia');
    expect(c[5]).toMatch(/^13º 1ª parcela · 11\/2026 · 2 lançamentos/);
  });

  it('veio por E-MAIL: a prévia leva a entrada; aplicado, a linha do e-mail vira "folha" (resolvida, sem lançamento)', async () => {
    entrada.todas.mockResolvedValue({ ok: true, dados: [entradaDaLinha({ id: 'e1', mensagem_id: '<m1@x.invalid>', remetente: 'Contador <c@x.invalid>', assunto: 'Recibos',
      recebido_em: '2026-11-24T10:00:00Z', arquivo_nome: 'recibos.pdf', tipo: 'pdf', tamanho_bytes: 10, storage_path: 'cli/entrada/e1', estado: 'a_ler' })] });
    entrada.baixar.mockResolvedValue({ ok: true, dados: new Blob(['%PDF recibos'], { type: 'application/pdf' }) });
    entrada.resolver.mockClear(); folhaApi.aplicar.mockClear(); folhaApi.subir.mockClear();
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} parcela={parcela} ler={ler} entrada={entrada} hoje="2026-11-24" aoFechar={() => {}} folha={{ api: folhaApi, dividir }} />);
    const daFolha = () => screen.getAllByTestId('linha-da-caixa').find((tr) => tr.getAttribute('data-chave')?.startsWith('folha:'));
    await waitFor(() => expect(daFolha()).toBeTruthy());
    fireEvent.click(within(daFolha() ?? document.body).getByTestId('acao-abrir_folha'));
    await waitFor(() => expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled());
    expect(folhaApi.aplicar.mock.calls[0][1]).toBe('e1');
    fireEvent.click(screen.getByTestId('aprovar-folha'));
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledWith('e1', 'folha', null, null));
  });

  it('o leitor de verdade: o recibo SCI (2 vias por página) vira o 3º tipo da Caixa', async () => {
    const via = [['0001 - EMPREGADORA FICTICIA', 'RECIBO DE PAGAMENTO DE SALÁRIO'], ['CEI: 111.222.333-44', 'Adiantamento 13o.Salário Novembro/2026'],
      ['Código', 'Nome do funcionário', 'C.C:'], ['12', 'FULANA FICTICIA', 'CBO : 6210-05', '1 GERAL'], ['SALÁRIO LÍQUIDO', 'R$', '730,00']];
    const pdfjs: PdfjsMinimo = {
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
        getViewport: () => ({ width: 595, height: 842 }),
        getTextContent: async () => ({ items: [...via, ...via].flatMap((cs, l) => cs.map((str, c) => ({ str, transform: [10, 0, 0, 10, 40 + c * 120, 800 - l * 14], width: 100, height: 10 }))) }),
      }) }) }),
    };
    const r = await lerDaCaixaCom(pdfjs)(new TextEncoder().encode('%PDF falso').buffer, 'pdf');
    expect(r).toMatchObject({ k: 'folha', folha: { layout: 'sci', tipo: '13_1', competencia: '2026-11', total: 730, pessoas: [{ codigo: '12', paginas: [1], valor: 730 }] } });
  });
});
