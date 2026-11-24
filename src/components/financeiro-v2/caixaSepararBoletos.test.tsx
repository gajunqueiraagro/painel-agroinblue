/**
 * BOLETO-SEPARAR-01 — o PDF com VÁRIOS boletos que chega na Caixa: cada parcela recebe SÓ as páginas do seu boleto. PDF SINTÉTICO (pdf-lib,
 * cada página de uma largura: a largura diz qual página foi); boletos e lançamentos inventados. Prende: (1) o boleto 2 de 3 sobe um PDF de
 * 1 página — a 2ª; (2) o 1º leva junto o original do e-mail como "PDF original (3 boletos)" no lançamento dele (espécie 'outro', depois do
 * boleto); (3) 2 boletos na MESMA página: o arquivo inteiro e o aviso; (4) não dividiu = NADA grava (nem entra na caixa).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { FRASE_NAO_SEPAROU, FRASE_PAGINA_COM_2, type LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';
import type { BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';

const LARGURAS = [400, 500, 600];
async function pdfDe3Paginas(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of LARGURAS) doc.addPage([w, 300]);
  return doc.save();
}
const VENC = ['2026-12-20', '2027-01-20', '2027-02-20'];
const boleto = (d: string, venc: string): BoletoNormalizado => ({ ok: true, codigo_barras: d.repeat(44), linha: d.repeat(47), tipo: 'bancario', banco: '341', valor: 24600, vencimento: venc });
const BOLETOS = ['1', '2', '3'].map((d, i) => boleto(d, VENC[i]));
const PARTES = { beneficiario: { nome: 'Fornecedor Ficticio', documento: null, confira: false }, pagador: { nome: null, documento: null, confira: false } };

let bytesDoEmail: Uint8Array;
let paginaDeCada: number[];
let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]: Mock<EntradaEmailApi[K]> };
const ler = vi.fn<LerArquivoDaCaixa>(async () => ({ k: 'boletos', boletos: BOLETOS, ...PARTES, paginaDeCada, totalDePaginas: 3 }));
const EMAIL = entradaDaLinha({
  id: 'v', mensagem_id: '<m2@x>', remetente: 'Fornecedor <f@x.com>', assunto: 'Boletos da NF', recebido_em: '2026-11-18T10:00:00Z',
  tipo: 'pdf', tamanho_bytes: 10, storage_path: 'cli/entrada/v.pdf', estado: 'a_ler', arquivo_nome: 'boletos_nf.pdf',
});

beforeEach(async () => {
  bytesDoEmail = await pdfDe3Paginas();
  paginaDeCada = [1, 2, 3];
  /* a prévia/entrada devolve o boleto da linha pedida; o candidato é o lançamento do mesmo dígito */
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, l, simular) => {
      const d = String(l.linha)[0];
      const b = BOLETOS.find((x) => x.linha[0] === d) ?? BOLETOS[0];
      return { ok: true, dados: respostaDeEntrar({
        ok: true, simulado: simular, ja_existe: false, id: simular ? null : `bol-${d}`, storage_path: simular ? null : `cli/boletos/bol-${d}.pdf`, avisos: [],
        boleto: { codigo_barras: b.codigo_barras, valor: b.valor, vencimento: b.vencimento, situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] },
        candidatos: [{ tipo: 'exato', soma: 24600, lancamentos: [{ id: `lanc-${d}`, descricao: `Nucleo ${d}/3`, valor: 24600, status: 'programado', vencimento: b.vencimento }] }],
      }) };
    }),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
    marcar: vi.fn<CaixaApi['marcar']>(async () => ({ ok: true, dados: true })),
    registrarDocumento: vi.fn<CaixaApi['registrarDocumento']>(async () => ({ ok: true, dados: 'gravado' })),
  };
  parcela = {
    entrar: api.entrar, subirArquivo: api.subirArquivo,
    ligar: vi.fn<ParcelaApi['ligar']>(async () => ({ ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async () => ({ ok: true, dados: null })),
  };
  entrada = {
    endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } })),
    gerar: vi.fn<EntradaEmailApi['gerar']>(),
    revogar: vi.fn<EntradaEmailApi['revogar']>(),
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: [EMAIL] })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async () => ({ ok: true, dados: new Blob([bytesDoEmail.slice().buffer]) })),
    ignorar: vi.fn<EntradaEmailApi['ignorar']>(async () => ({ ok: true, dados: true })),
    voltar: vi.fn<EntradaEmailApi['voltar']>(async () => ({ ok: true, dados: true })),
    resolver: vi.fn<EntradaEmailApi['resolver']>(async () => ({ ok: true, dados: true })),
    notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = () => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-18" aoFechar={() => {}} />);
const linhaDoVencimento = async (venc: string) => {
  const dd = venc.split('-').reverse().join('/');
  await waitFor(() => { expect(screen.queryAllByText(/^(procurando|lendo)/)).toHaveLength(0); expect(screen.queryAllByTestId('linha-da-caixa').some((x) => (x.textContent ?? '').includes(dd))).toBe(true); }, { timeout: 4000 });
  const ls = await screen.findAllByTestId('linha-da-caixa');
  const l = ls.find((x) => (x.textContent ?? '').includes(dd));
  if (!l) throw new Error(`linha ${dd} não achada: ${ls.map((x) => x.textContent).join(' | ')}`);
  return l;
};
const vincular = async (venc: string) => fireEvent.click(within(await linhaDoVencimento(venc)).getByTestId('acao-vincular_boleto'));
const larguras = async (f: File) => (await PDFDocument.load(new Uint8Array(await f.arrayBuffer()))).getPages().map((p) => p.getWidth());

describe('BOLETO-SEPARAR-01 — o PDF de vários boletos se divide na Caixa', () => {
  it('o boleto 2 de 3 sobe SÓ a 2ª página, com o nome "(2 de 3)"; o original não vai (não é o 1º)', async () => {
    montar();
    await vincular(VENC[1]);
    await waitFor(() => expect(api.subirArquivo).toHaveBeenCalledTimes(1));
    const [caminho, arquivo] = api.subirArquivo.mock.calls[0];
    expect(caminho).toBe('cli/boletos/bol-2.pdf');
    expect(arquivo.name).toBe('boletos_nf (2 de 3).pdf');
    expect(await larguras(arquivo)).toEqual([500]);
    await waitFor(() => expect(api.registrarDocumento).toHaveBeenCalledTimes(1));
    expect(api.registrarDocumento.mock.calls[0].slice(1)).toEqual(['lanc-2', { especie: 'boleto', nome: expect.any(String), url: 'cli/boletos/bol-2.pdf', tamanhoBytes: null }]);
  });

  it('o 1º boleto: a 1ª página no boleto e o ORIGINAL do e-mail no lançamento dele ("PDF original (3 boletos)", depois do boleto)', async () => {
    montar();
    await vincular(VENC[0]);
    await waitFor(() => expect(api.registrarDocumento).toHaveBeenCalledTimes(2));
    expect(await larguras(api.subirArquivo.mock.calls[0][1])).toEqual([400]);
    const docs = api.registrarDocumento.mock.calls.map((c) => [c[1], c[2].especie, c[2].nome, c[2].url]);
    expect(docs[0]).toEqual(['lanc-1', 'boleto', expect.any(String), 'cli/boletos/bol-1.pdf']);
    expect(docs[1]).toEqual(['lanc-1', 'outro', 'PDF original (3 boletos)', 'cli/entrada/v.pdf']);
  });

  it('2 boletos na MESMA página: a página não se divide — o arquivo dela vai inteiro e o aviso diz', async () => {
    paginaDeCada = [1, 1, 3];
    montar();
    await vincular(VENC[1]);
    await waitFor(() => expect(api.subirArquivo).toHaveBeenCalledTimes(1));
    expect(await larguras(api.subirArquivo.mock.calls[0][1])).toEqual([400]);
    expect(await screen.findByText(FRASE_PAGINA_COM_2)).toBeTruthy();
  });

  it('não dividiu (o PDF não abre no pdf-lib): NADA grava — nem entra na caixa, nem sobe, nem liga', async () => {
    bytesDoEmail = Uint8Array.from('nao sou pdf', (c) => c.charCodeAt(0));
    montar();
    await vincular(VENC[2]);
    expect(await screen.findByText(FRASE_NAO_SEPAROU)).toBeTruthy();
    expect(api.entrar.mock.calls.some((c) => c[2] === false)).toBe(false);
    expect(api.subirArquivo).not.toHaveBeenCalled();
    expect(parcela.ligar).not.toHaveBeenCalled();
  });
});
