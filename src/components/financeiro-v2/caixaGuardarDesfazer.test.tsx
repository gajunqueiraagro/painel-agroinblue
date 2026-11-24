/**
 * CAIXA-GUARDAR-01 (A; D1 a, Gabriel 23/11) — o boleto GUARDADO sem lançamento: aparece no 1º grupo de A resolver e em Resolvidos com o
 * selo "guardado · sem lançamento"; o "Desfazer" tira o boleto da caixa (`descartado` com o motivo) E devolve o e-mail — depois, UMA linha
 * só em A resolver (a do e-mail); "Guardar" de novo reabre o MESMO boleto (nunca um segundo). Banco FALSO com estado (boletos + entradas),
 * dados inventados.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { entradaDaLinha, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { MOTIVO_DO_DESFEITO, virouDaEntrada } from '@/lib/financeiro/boleto/caixaPorEmail';
import type { LerArquivoDaCaixa } from '@/hooks/useCaixaDeBoletos';

const COD = '7'.repeat(44);
const LINHA = '7'.repeat(47);
const ler = vi.fn<LerArquivoDaCaixa>(async (bytes) => {
  const nome = new TextDecoder().decode(bytes);
  if (nome === 'boleto-escola.pdf') {
    return { k: 'boletos', boletos: [{ ok: true, codigo_barras: COD, linha: LINHA, tipo: 'bancario', banco: '748', valor: 4358.13, vencimento: '2026-12-05' }],
      beneficiario: { nome: 'Escola Ficticia', documento: '11222333000181', confira: false }, pagador: { nome: null, documento: null, confira: false } };
  }
  return { k: 'nada', frase: 'Sem linha digitável nem chave de nota.' };
});

/* o banco falso: 1 boleto guardado (sem lançamento) e o e-mail que o guardou; outro e-mail qualquer para haver 2 grupos */
type Situacao = 'novo' | 'descartado' | 'ligado';
let situacao: Situacao;
let estadoDoEmail: 'boleto' | 'a_ler';
const linhaDoEmail = () => entradaDaLinha({
  id: 'e1', mensagem_id: '<m1@x>', remetente: 'Secretaria <s@x.com>', assunto: 'Boleto dezembro', recebido_em: '2026-11-23T12:33:00Z',
  tipo: 'pdf', tamanho_bytes: 10, storage_path: 'cli/entrada/e1', arquivo_nome: 'boleto-escola.pdf', estado: estadoDoEmail,
  boleto_id: estadoDoEmail === 'boleto' ? 'g1' : null, lido_em: estadoDoEmail === 'boleto' ? '2026-11-23T13:00:00Z' : null,
});
const outroEmail = entradaDaLinha({
  id: 'e2', mensagem_id: '<m2@x>', remetente: 'Outro <o@x.com>', assunto: 'Qualquer', recebido_em: '2026-11-23T14:00:00Z',
  tipo: 'pdf', tamanho_bytes: 10, storage_path: 'cli/entrada/e2', arquivo_nome: 'outro.pdf', estado: 'a_ler',
});
const boletoDoBanco = () => ({ id: 'g1', codigo_barras: COD, linha_digitavel: LINHA, valor: 4358.13, vencimento: '2026-12-05', situacao,
  arquivo_nome: 'boleto-escola.pdf', storage_path: 'cli/boletos/g1.pdf', beneficiario_nome: 'Escola Ficticia' });

let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let parcela: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]: Mock<EntradaEmailApi[K]> };
beforeEach(() => {
  situacao = 'novo';
  estadoDoEmail = 'boleto';
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [boletoDoBanco()] }) })),
    /* o código já está no banco: ja_existe, com a situação de AGORA; o descartado não tem candidatos (como a fn_boleto_entrar) */
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: true, id: 'g1', storage_path: null, avisos: [],
      boleto: boletoDoBanco(), situacao: { lancamentos: [], avisos: [] }, candidatos: [],
    }) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
    marcar: vi.fn<CaixaApi['marcar']>(async (_id, s) => { situacao = s; return { ok: true, dados: true }; }),
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
    todas: vi.fn<EntradaEmailApi['todas']>(async () => ({ ok: true, dados: [linhaDoEmail(), outroEmail] })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async (caminho) => ({ ok: true, dados: new Blob([caminho.endsWith('e1') ? 'boleto-escola.pdf' : 'outro.pdf']) })),
    ignorar: vi.fn<EntradaEmailApi['ignorar']>(async () => ({ ok: true, dados: true })),
    voltar: vi.fn<EntradaEmailApi['voltar']>(async (id) => { if (id === 'e1') estadoDoEmail = 'a_ler'; return { ok: true, dados: true }; }),
    resolver: vi.fn<EntradaEmailApi['resolver']>(async (id) => { if (id === 'e1') estadoDoEmail = 'boleto'; return { ok: true, dados: true }; }),
    notasNoSistema: vi.fn<EntradaEmailApi['notasNoSistema']>(async () => ({ ok: true, dados: {} })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = () => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={api} parcela={parcela} ler={ler}
  entrada={entrada} hoje="2026-11-23" aoFechar={() => {}} />);
const linhasDoBoleto = () => screen.queryAllByTestId('linha-da-caixa').filter((x) => (x.textContent ?? '').includes('05/12/2026'));
const pronto = (n: number) => waitFor(() => {
  expect(screen.queryAllByText(/^(procurando|lendo)/)).toHaveLength(0);
  expect(linhasDoBoleto()).toHaveLength(n);
}, { timeout: 4000 });

describe('CAIXA-GUARDAR-01 — o guardado aparece, se desfaz e se guarda de novo', () => {
  it('o grupo "Na caixa, sem lançamento" é o PRIMEIRO; em Resolvidos o e-mail diz "guardado · sem lançamento" (selo âmbar)', async () => {
    montar();
    await pronto(1);
    const grupos = screen.getAllByTestId('grupo-da-caixa');
    expect(grupos.length).toBe(2);
    expect(grupos[0].textContent).toMatch(/^Na caixa, sem lançamento/);
    expect(within(linhasDoBoleto()[0]).getByTestId('acao-desfazer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Resolvidos 1/ }));
    const r = await screen.findByTestId('linha-resolvida');
    expect(r.textContent).toMatch(/guardado · sem lançamento · Boleto dezembro/);
    expect(within(r).getAllByTestId('selo-da-caixa').map((s) => s.textContent)).toContain('guardado · sem lançamento');
  });

  it('Desfazer em Resolvidos: o boleto vai a descartado (o motivo) e o e-mail volta — UMA linha só em A resolver, com "Guardar"', async () => {
    montar();
    await pronto(1);
    fireEvent.click(screen.getByRole('button', { name: /^Resolvidos 1/ }));
    fireEvent.click(await screen.findByTestId('desfazer-resolvido'));
    await waitFor(() => expect(entrada.voltar).toHaveBeenCalledWith('e1'));
    expect(api.marcar).toHaveBeenCalledWith('g1', 'descartado', MOTIVO_DO_DESFEITO);
    expect(api.marcar.mock.invocationCallOrder[0]).toBeLessThan(entrada.voltar.mock.invocationCallOrder[0]);
    fireEvent.click(screen.getByRole('button', { name: /^A resolver/ }));
    await pronto(1);
    expect(screen.getAllByTestId('grupo-da-caixa').map((g) => g.textContent ?? '')).not.toContainEqual(expect.stringMatching(/^Na caixa, sem lançamento/));
    const l = linhasDoBoleto()[0];
    expect(l.textContent).toMatch(/tirado da caixa/);
    expect(within(l).getByTestId('acao-guardar')).toBeTruthy();
  });

  it('Guardar de novo REABRE o mesmo boleto (novo) — nenhum boleto novo entra; o e-mail vira resolvido com ele', async () => {
    montar();
    await pronto(1);
    fireEvent.click(within(linhasDoBoleto()[0]).getByTestId('acao-desfazer'));
    await waitFor(() => expect(entrada.voltar).toHaveBeenCalledWith('e1'));
    await pronto(1);
    fireEvent.click(within(linhasDoBoleto()[0]).getByTestId('acao-guardar'));
    await waitFor(() => expect(entrada.resolver).toHaveBeenCalledWith('e1', 'boleto', 'g1', null));
    expect(api.marcar.mock.calls.map((c) => [c[0], c[1]])).toEqual([['g1', 'descartado'], ['g1', 'novo']]);
    expect(api.entrar.mock.calls.some((c) => c[2] === false)).toBe(false);
    await pronto(1);
    expect(screen.getAllByTestId('grupo-da-caixa')[0].textContent).toMatch(/^Na caixa, sem lançamento/);
    /* desfazer DE NOVO na mesma sessão: a linha do e-mail é consultada outra vez (a prévia de antes dizia "novo") e oferece "Guardar" */
    fireEvent.click(within(linhasDoBoleto()[0]).getByTestId('acao-desfazer'));
    await waitFor(() => expect(api.marcar).toHaveBeenCalledTimes(3));
    await pronto(1);
    expect(within(linhasDoBoleto()[0]).getByTestId('acao-guardar')).toBeTruthy();
  });
});

describe('CAIXA-GUARDAR-01 — "O que virou" em Resolvidos (regra pura)', () => {
  const e = (m: Record<string, unknown>) => entradaDaLinha({ id: 'x', estado: 'boleto', boleto_id: 'b1', ...m });
  const item = (s: string, lancamentos: unknown[] = []) => listaDaCaixa({ itens: [{ id: 'b1', codigo_barras: COD, situacao: s, situacao_atual: { lancamentos } }] }).itens;
  it('guardado (novo/sem par) = selo âmbar e o Desfazer completo; ligado = a que lançamento; sem a lista = o texto de antes', () => {
    expect(virouDaEntrada(e({}), item('novo'))).toEqual({ selo: { texto: 'guardado · sem lançamento', tom: 'ambar' }, texto: 'guardado · sem lançamento', guardadoId: 'b1' });
    expect(virouDaEntrada(e({}), item('sem_par')).guardadoId).toBe('b1');
    expect(virouDaEntrada(e({}), item('ligado', [{ id: 'l1', descricao: 'Mensalidade dezembro', valor: 10, status: 'previsto', vencimento: '2026-12-03' }])))
      .toEqual({ selo: null, texto: 'ligado a Mensalidade dezembro · 03/12/2026', guardadoId: null });
    expect(virouDaEntrada(e({}), null)).toEqual({ selo: null, texto: 'boleto na caixa', guardadoId: null });
    expect(virouDaEntrada(e({ estado: 'nota', boleto_id: null, lancamento_id: 'l9' }), null).texto).toBe('nota no lançamento');
  });
});
