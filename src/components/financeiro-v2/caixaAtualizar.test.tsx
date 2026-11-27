/**
 * CAIXA-ATUALIZAR-01 — a Caixa MONTADA (APIs e leitor falsos): "↻ Atualizar" relê a lista sem fechar e sem trocar a aba; o e-mail que
 * chegou vira o aviso "1 novo e-mail · agora" no lugar fixo (que mostra a "última chegada" antes); a atualização automática pergunta só
 * "quando chegou o último?" e relê quando isso muda (não relê à toa).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { paraGravar } from '@/lib/financeiro/boleto/leituraGravada';
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
    ultimaChegada: vi.fn<NonNullable<EntradaEmailApi['ultimaChegada']>>(async () => ({ ok: true, dados: null })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = (intervaloMs = 0) => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Sintético" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-28" aoFechar={() => {}} intervaloMs={intervaloMs} />);
const novo = email('n', { arquivo_nome: 'boleto-novo.pdf', mensagem_id: '<m2@x>', recebido_em: '2026-11-28T13:05:00Z', leitura: gravada(BOLETO) });

describe('CAIXA-ATUALIZAR-01 — atualizar a Caixa', () => {
  it('"↻ Atualizar" relê sem fechar nem trocar a aba; o novo e-mail vira o aviso no lugar da última chegada', async () => {
    todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml', leitura: gravada(NOTA) })];
    montar();
    await waitFor(() => expect(screen.getByTestId('chegada-da-caixa').textContent).toMatch(/^última chegada: \d\d\/11 \d\d:\d\d$/));
    fireEvent.click(screen.getByRole('button', { name: /^Ignorados/ }));
    const antes = entrada.todas.mock.calls.length;
    todas = [novo, ...todas];
    fireEvent.click(screen.getByTestId('atualizar-caixa'));
    await waitFor(() => expect(entrada.todas.mock.calls.length).toBe(antes + 1));
    await waitFor(() => expect(screen.getByTestId('chegada-da-caixa').textContent).toBe('1 novo e-mail · agora'));
    expect(screen.getByRole('button', { name: /^Ignorados/ }).className).toMatch(/bg-primary/);   // a aba ficou
    expect(screen.getByTestId('caixa-de-boletos')).toBeTruthy();                                  // nada fechou
  });

  it('a automática: pergunta "quando chegou o último?" e só relê quando muda', async () => {
    todas = [email('x', { arquivo_nome: 'chave.xml', tipo: 'xml', leitura: gravada(NOTA) })];
    let ultima: string | null = '2026-11-17T19:27:02Z';
    entrada.ultimaChegada.mockImplementation(async () => ({ ok: true, dados: ultima }));
    montar(40);
    await waitFor(() => expect(entrada.ultimaChegada.mock.calls.length).toBeGreaterThanOrEqual(2));
    const lidas = entrada.todas.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(entrada.todas.mock.calls.length).toBe(lidas);   // nada mudou: não relê
    todas = [novo, ...todas]; ultima = '2026-11-28T13:05:00Z';
    await waitFor(() => expect(screen.getByTestId('chegada-da-caixa').textContent).toBe('1 novo e-mail · agora'));
    expect(entrada.todas.mock.calls.length).toBe(lidas + 1);
  });
});
