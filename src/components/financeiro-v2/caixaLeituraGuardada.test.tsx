/**
 * ENTRADA-CENTRAL-01 F1 — a caixa MONTADA com a leitura guardada (APIs e leitor falsos, injetados como na bancada): com a leitura desta
 * versão a caixa NÃO baixa nem relê o arquivo (as linhas saem iguais); sem ela (ou de outra versão) lê como sempre e GUARDA o resultado;
 * lida com senha não guarda; o gesto que precisa do arquivo ("Lançar nota") baixa na hora.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { LEITOR_VERSAO, paraGravar } from '@/lib/financeiro/boleto/leituraGravada';
import type { LerArquivoDaCaixa, LeituraDaCaixa } from '@/hooks/useCaixaDeBoletos';

const COD = '3'.repeat(44);
const CHAVE = '5'.repeat(44);
const NOTA: LeituraDaCaixa = { k: 'nota', nota: { chave: CHAVE, numero: '000122048', emitente: 'Agro Sintético', valor: 6300, vencimento: '2026-12-20' } };
const BOLETO: LeituraDaCaixa = {
  k: 'boletos', boletos: [{ ok: true, codigo_barras: COD, linha: '3'.repeat(47), tipo: 'bancario', banco: '341', valor: 2100, vencimento: '2026-12-20' }],
  beneficiario: { nome: 'Agro Sintético', documento: '11222333000181', confira: false }, pagador: { nome: null, documento: null, confira: false },
};
const LER: LerArquivoDaCaixa = async (bytes) => (new TextDecoder().decode(bytes).endsWith('.xml') ? NOTA : BOLETO);
const ler = vi.fn<LerArquivoDaCaixa>(LER);

const email = (id: string, m: Record<string, unknown>) => entradaDaLinha({
  id, mensagem_id: '<m1@x>', remetente: 'Fornecedor Sintético <f@exemplo.test>', assunto: 'Nota e boleto', recebido_em: '2026-11-17T19:27:02Z',
  tipo: 'pdf', tamanho_bytes: 10, storage_path: `cli/entrada/${id}`, estado: 'a_ler', ...m,
});
const gravada = (l: LeituraDaCaixa) => JSON.parse(JSON.stringify(paraGravar(l)));

let todas: ReturnType<typeof entradaDaLinha>[] = [];
let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]-?: Mock<NonNullable<EntradaEmailApi[K]>> };
beforeEach(() => {
  ler.mockReset(); ler.mockImplementation(LER);
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: null, storage_path: null, avisos: [],
      boleto: { codigo_barras: COD, valor: 2100, vencimento: '2026-12-20', situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] }, candidatos: [],
    }) })),
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
    endereco: vi.fn(async () => ({ ok: true as const, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } })),
    gerar: vi.fn(), revogar: vi.fn(),
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: todas })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async (caminho) => ({ ok: true, dados: new Blob([todas.find((e) => e.storagePath === caminho)?.arquivoNome ?? '']) })),
    ignorar: vi.fn(), voltar: vi.fn(), resolver: vi.fn(),
    notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
    registrarArrastado: vi.fn(), resolvidos: vi.fn(async () => ({ ok: true as const, dados: {} })),
    guardarLeitura: vi.fn<NonNullable<EntradaEmailApi['guardarLeitura']>>(async () => ({ ok: true, dados: true })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = (aoLancarNota?: (f: File) => void) => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Sintético" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-18" podeLancar aoLancarNota={aoLancarNota} aoFechar={() => {}} />);
const linhaDe = async (re: RegExp) => {
  const ls = await screen.findAllByTestId('linha-da-caixa');
  const l = ls.find((x) => re.test(x.textContent ?? ''));
  if (!l) throw new Error(`linha ${re} não achada: ${ls.map((x) => x.textContent).join(' | ')}`);
  return l;
};
const esperarPronto = () => waitFor(() => {
  expect(screen.queryAllByTestId('linha-da-caixa').length).toBeGreaterThan(0);
  expect(screen.queryAllByText(/^(procurando|lendo)/)).toHaveLength(0);
});

describe('ENTRADA-CENTRAL-01 F1 — a leitura guardada na caixa', () => {
  it('com a leitura desta versão: não baixa, não relê, não guarda de novo — e as linhas saem iguais', async () => {
    todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml', leitura: gravada(NOTA) }), email('b', { arquivo_nome: 'boleto.pdf', leitura: gravada(BOLETO) })];
    montar(vi.fn());
    await esperarPronto();
    expect((await linhaDe(/NF 122\.048/)).textContent).toMatch(/não lançada/);
    expect((await linhaDe(/boleto\.pdf/)).textContent).toMatch(/21\.00|2\.100,00/);
    expect(ler).not.toHaveBeenCalled();
    expect(entrada.baixar).not.toHaveBeenCalled();
    expect(entrada.guardarLeitura).not.toHaveBeenCalled();
  });

  it('sem leitura (ou de outra versão): lê como sempre e guarda o resultado, uma vez por linha', async () => {
    todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml' }), email('b', { arquivo_nome: 'boleto.pdf', leitura: { ...gravada(BOLETO), v: 'caixa-0' } })];
    montar(vi.fn());
    await esperarPronto();
    expect(ler).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(entrada.guardarLeitura).toHaveBeenCalledTimes(2));
    const guardadas = Object.fromEntries(entrada.guardarLeitura.mock.calls.map(([id, l]) => [id, l]));
    expect(guardadas.x).toEqual({ v: LEITOR_VERSAO, k: 'nota', nota: { chave: CHAVE, numero: '000122048', emitente: 'Agro Sintético', valor: 6300, vencimento: '2026-12-20' } });
    expect(guardadas.b).toMatchObject({ v: LEITOR_VERSAO, k: 'boletos' });
  });

  it('"Lançar nota" com a leitura guardada baixa o arquivo na hora e entrega o XML', async () => {
    todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml', leitura: gravada(NOTA) })];
    const aoLancar = vi.fn();
    montar(aoLancar);
    await esperarPronto();
    fireEvent.click(within(await linhaDe(/NF 122\.048/)).getByTestId('acao-lancar_nota'));
    await waitFor(() => expect(aoLancar).toHaveBeenCalledTimes(1));
    expect(entrada.baixar).toHaveBeenCalledWith('cli/entrada/x');
    const f: File = aoLancar.mock.calls[0][0];
    expect(f.name).toBe('chave.xml');
    expect(new TextDecoder().decode(await f.arrayBuffer())).toBe('chave.xml');
  });

  it('o erro de leitura não se guarda (tenta de novo na próxima abertura)', async () => {
    todas = [email('b', { arquivo_nome: 'boleto.pdf' })];
    ler.mockImplementation(async () => ({ k: 'erro', frase: 'Não consegui ler este arquivo.' }));
    montar(vi.fn());
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(entrada.guardarLeitura).not.toHaveBeenCalled();
  });
});
