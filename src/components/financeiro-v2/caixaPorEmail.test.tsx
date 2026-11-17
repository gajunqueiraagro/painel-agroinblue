/**
 * BOLETO D3c — o e-mail de boletos na tela, MONTADO (APIs e leitor falsos, injetados pela prop como na bancada do gate).
 * Prende o GESTO: "ler" leva o PDF do e-mail pelo MESMO caminho da caixa (origem 'email' + Message-ID; nada grava antes do "Pôr na
 * caixa"); gravou → a linha do e-mail vira 'boleto' com o id do banco; sem linha digitável → 'não reconhecido'; XML não se lê aqui;
 * dispensar; o endereço só grava depois da prévia, e trocar/revogar sem motivo não chamam o banco.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { EnderecoDeBoletosDialog } from './EnderecoDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import { entradaDaLinha, fraseDoErroDaEntrada, respostaDoEndereco, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';
import { passosCom } from '@/lib/financeiro/boleto/entradaEmail';
import type { LerArquivoDeBoleto } from '@/hooks/useCaixaDeBoletos';
import type { LeituraDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';

const LINHA = '3'.repeat(47);
const lido = (): LeituraDoBoleto => ({
  boleto: { ok: true, codigo_barras: LINHA.slice(0, 44), linha: LINHA, tipo: 'bancario', banco: '341', valor: 964.67, vencimento: '2026-12-10' },
  beneficiario: { nome: 'Fornecedor A', documento: '11222333000181', confira: false }, pagador: { nome: 'Cliente Teste', documento: null, confira: false },
});
let semLinha = false;
const ler = vi.fn<LerArquivoDeBoleto>(async () => (semLinha ? { ok: true, leitura: { ...lido(), boleto: null } } : { ok: true, leitura: lido() }));

const linhaDoEmail = (m: Record<string, unknown>) => entradaDaLinha({
  id: 'e1', mensagem_id: '<msg-1@exemplo>', remetente: 'cobranca@fornecedor-a.com.br', assunto: 'Boleto NF 31.283', recebido_em: '2026-11-16T22:00:00Z',
  arquivo_nome: 'boleto-31283.pdf', tipo: 'pdf', tamanho_bytes: 5487, storage_path: 'cli/entrada/a97e381d7ca8207431765d2a4f0bc813.pdf', estado: 'a_ler', ...m,
});

let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
let entrada: { [K in keyof EntradaEmailApi]: Mock<EntradaEmailApi[K]> };
let pendentes = [linhaDoEmail({})];
beforeEach(() => {
  semLinha = false; ler.mockClear();
  pendentes = [
    linhaDoEmail({}),
    linhaDoEmail({ id: 'e2', mensagem_id: '<msg-2@exemplo>', arquivo_nome: null, tipo: null, tamanho_bytes: null, storage_path: null, estado: 'sem_anexo', assunto: 'Sem anexo' }),
    linhaDoEmail({ id: 'e3', arquivo_nome: 'nota.xml', tipo: 'xml', storage_path: 'cli/entrada/b.xml' }),
  ];
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: {}, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, _l, simular) => ({ ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: simular ? null : 'bol-1', storage_path: simular ? null : 'cli/boletos/bol-1.pdf', avisos: [],
      boleto: { codigo_barras: LINHA.slice(0, 44), linha_digitavel: LINHA, valor: 964.67, vencimento: '2026-12-10', beneficiario_nome: 'Fornecedor A', situacao: 'novo' },
      situacao: { lancamentos: [], avisos: [] }, candidatos: [],
    }) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: [] })),
  };
  entrada = {
    endereco: vi.fn<EntradaEmailApi['endereco']>(async () => ({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: null, criadoEm: null } })),
    gerar: vi.fn<EntradaEmailApi['gerar']>(async (_c, _m, simular) => ({ ok: true, dados: respostaDoEndereco({
      simulado: simular, endereco: simular ? 'teste-cliente-…@boletos.agroinblue.com.br' : 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', antigo: null,
    }) })),
    revogar: vi.fn<EntradaEmailApi['revogar']>(async () => ({ ok: false, erro: 'Só o gestor do cliente ou a AgroinBlue revoga o endereço de boletos.' })),
    pendentes: vi.fn<EntradaEmailApi['pendentes']>(async () => ({ ok: true, dados: pendentes })),
    baixar: vi.fn<EntradaEmailApi['baixar']>(async () => ({ ok: true, dados: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })),
    marcarLido: vi.fn<EntradaEmailApi['marcarLido']>(async () => ({ ok: true, dados: true })),
    dispensar: vi.fn<EntradaEmailApi['dispensar']>(async () => ({ ok: true, dados: true })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

const montar = () => render(<CaixaDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={api} ler={ler} entrada={entrada} aoFechar={() => {}} />);
const abaPorEmail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^Por e-mail/ }));
  return screen.findByTestId('tabela-por-email');
};

describe('BOLETO D3c — "Por e-mail" na caixa', () => {
  it('lista o que espera; "ler" só no PDF; XML diz o caminho da nota; o contador é o da área de espera', async () => {
    montar();
    const t = await abaPorEmail();
    const linhas = within(t).getAllByTestId('linha-do-email');
    expect(linhas).toHaveLength(3);
    expect(within(linhas[0]).getByTestId('ler-do-email')).toBeTruthy();
    expect(within(linhas[1]).queryByTestId('ler-do-email')).toBeNull();
    expect(within(linhas[1]).getByText(/sem anexo/)).toBeTruthy();
    expect(within(linhas[2]).queryByTestId('ler-do-email')).toBeNull();
    expect(linhas[2].textContent).toMatch(/Da nota fiscal/);
    expect(screen.getByRole('button', { name: /^Por e-mail/ }).textContent).toMatch(/3/);
  });

  it('"ler" → o MESMO caminho (origem email + Message-ID, prévia sem gravar) → "Pôr na caixa" grava, sobe e marca a linha como boleto', async () => {
    montar();
    await abaPorEmail();
    fireEvent.click(screen.getAllByTestId('ler-do-email')[0]);
    await waitFor(() => expect(api.entrar).toHaveBeenCalledTimes(1));
    expect(entrada.baixar).toHaveBeenCalledWith('cli/entrada/a97e381d7ca8207431765d2a4f0bc813.pdf');
    const [, leitura, simular] = api.entrar.mock.calls[0];
    expect(simular).toBe(true);
    expect(leitura.origem).toBe('email');
    expect(leitura.origem_ref).toBe('<msg-1@exemplo>');
    expect(leitura.arquivo_nome).toBe('boleto-31283.pdf');
    expect(entrada.marcarLido).not.toHaveBeenCalled();
    const botao = await screen.findByTestId('por-na-caixa');
    await waitFor(() => expect(botao.hasAttribute('disabled')).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(entrada.marcarLido).toHaveBeenCalledWith('e1', 'boleto', 'bol-1'));
    expect(api.entrar.mock.calls[1][2]).toBe(false);
    expect(api.subirArquivo).toHaveBeenCalledWith('cli/boletos/bol-1.pdf', expect.any(File));
    await waitFor(() => expect(entrada.pendentes.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('sem linha digitável → a linha do e-mail vira "não reconhecido"; nada vai à caixa', async () => {
    semLinha = true;
    montar();
    await abaPorEmail();
    fireEvent.click(screen.getAllByTestId('ler-do-email')[0]);
    await waitFor(() => expect(entrada.marcarLido).toHaveBeenCalledWith('e1', 'nao_reconhecido', null));
    expect(api.entrar).not.toHaveBeenCalled();
  });

  it('a mesma linha não entra duas vezes em "Chegando"', async () => {
    montar();
    await abaPorEmail();
    fireEvent.click(screen.getAllByTestId('ler-do-email')[0]);
    await waitFor(() => expect(api.entrar).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Por e-mail/ }));
    const lerDeNovo = (await screen.findAllByTestId('ler-do-email'))[0];
    expect(lerDeNovo.hasAttribute('disabled')).toBe(true);
    fireEvent.click(lerDeNovo);
    expect(entrada.baixar).toHaveBeenCalledTimes(1);
  });

  it('dispensar chama o banco e relê; a recusa aparece na faixa', async () => {
    montar();
    await abaPorEmail();
    fireEvent.click(screen.getAllByTestId('dispensar-do-email')[1]);
    await waitFor(() => expect(entrada.dispensar).toHaveBeenCalledWith('e2'));
    await waitFor(() => expect(entrada.pendentes.mock.calls.length).toBeGreaterThanOrEqual(2));
    entrada.dispensar.mockResolvedValueOnce({ ok: false, erro: 'Este arquivo já entrou; não se dispensa.' });
    fireEvent.click(screen.getAllByTestId('dispensar-do-email')[0]);
    expect(await screen.findByText('Este arquivo já entrou; não se dispensa.')).toBeTruthy();
  });

  it('o botão "E-mail de boletos" abre o endereço', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('abrir-endereco-de-boletos'));
    expect(await screen.findByTestId('endereco-de-boletos')).toBeTruthy();
  });
});

describe('BOLETO D3c — o endereço de boletos', () => {
  const abrir = () => render(<EnderecoDeBoletosDialog clienteId="cli" clienteNome="Cliente Teste" api={entrada} aoFechar={() => {}} />);

  it('gerar: a PRÉVIA não grava; só "Confirmar" grava; depois relê o endereço', async () => {
    abrir();
    fireEvent.click(await screen.findByTestId('gerar-endereco'));
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenCalledWith('cli', null, true));
    expect((await screen.findByTestId('frase-do-endereco')).textContent).toMatch(/teste-cliente-…@boletos\.agroinblue\.com\.br/);
    expect(entrada.gerar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('confirmar-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenLastCalledWith('cli', null, false));
    await waitFor(() => expect(entrada.endereco).toHaveBeenCalledTimes(2));
  });

  it('trocar sem motivo: o campo fica vermelho e o banco NÃO é chamado; com motivo, a prévia e o gravar levam o motivo', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', criadoEm: '2026-11-16T19:39:00Z' } });
    abrir();
    expect((await screen.findByTestId('endereco-atual')).textContent).toBe('teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br');
    fireEvent.click(screen.getByTestId('trocar-endereco'));
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    expect(screen.getByTestId('motivo-do-endereco').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('frase-do-endereco').textContent).toMatch(/motivo/);
    expect(entrada.gerar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('motivo-do-endereco'), { target: { value: 'endereço divulgado' } });
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenCalledWith('cli', 'endereço divulgado', true));
    fireEvent.click(await screen.findByTestId('confirmar-endereco'));
    await waitFor(() => expect(entrada.gerar).toHaveBeenLastCalledWith('cli', 'endereço divulgado', false));
  });

  it('revogar recusado pelo banco: a frase dele aparece e nada mais acontece', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br', criadoEm: null } });
    abrir();
    fireEvent.click(await screen.findByTestId('revogar-endereco'));
    fireEvent.change(screen.getByTestId('motivo-do-endereco'), { target: { value: 'cliente saiu' } });
    fireEvent.click(screen.getByTestId('previa-do-endereco'));
    expect(await screen.findByText('Só o gestor do cliente ou a AgroinBlue revoga o endereço de boletos.')).toBeTruthy();
    expect(screen.queryByTestId('confirmar-endereco')).toBeNull();
    expect(entrada.revogar).toHaveBeenCalledWith('cli', 'cliente saiu', true);
  });

  it('o passo a passo: Gmail, Hotmail/Outlook.com e Microsoft 365, com o endereço do cliente no lugar', async () => {
    entrada.endereco.mockResolvedValue({ ok: true, dados: { dominio: 'boletos.agroinblue.com.br', endereco: 'nj-abcdefghij@boletos.agroinblue.com.br', criadoEm: null } });
    abrir();
    await screen.findByTestId('endereco-atual');
    expect(screen.getByTestId('passos-do-encaminhamento').textContent).toMatch(/Encaminhamento e POP\/IMAP/);
    fireEvent.click(screen.getByRole('button', { name: 'Hotmail / Outlook.com' }));
    const outlook = screen.getByTestId('passos-do-encaminhamento').textContent ?? '';
    expect(outlook).toMatch(/outlook\.live\.com/);
    expect(outlook).toMatch(/Encaminhar para.*nj-abcdefghij@boletos\.agroinblue\.com\.br/);
    expect(outlook).toMatch(/Não use "Encaminhar como anexo"/);
    fireEvent.click(screen.getByRole('button', { name: 'Microsoft 365 (empresa)' }));
    expect(screen.getByTestId('passos-do-encaminhamento').textContent).toMatch(/5\.7\.520/);
    expect(passosCom('gmail', null).join(' ')).not.toMatch(/\{endereco\}/);
  });
});

describe('BOLETO D3c — a frase do erro', () => {
  it('as frases das fn_entrada_* passam; o 42501 cru do Postgres não', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fraseDoErroDaEntrada({ code: 'P0001', message: 'Revogar pede o motivo.' })).toBe('Revogar pede o motivo.');
    expect(fraseDoErroDaEntrada({ code: '42501', message: 'Só o gestor do cliente ou a AgroinBlue gera o endereço de boletos.' })).toMatch(/^Só o gestor/);
    expect(fraseDoErroDaEntrada({ code: '42501', message: 'permission denied for function x' })).toBe('Sem acesso a este cliente.');
    expect(fraseDoErroDaEntrada({ code: 'XX000', message: 'boom' })).toBe('Não consegui falar com o banco. Tente de novo.');
    erro.mockRestore();
  });
});
