/**
 * BOLETO-DDA-API-01 · D1c (a) — a caixa de boletos MONTADA: soltar → ler → prévia (simular) → "Pôr na caixa" (grava) → sobe o PDF.
 * ⚠ O leitor do PDF e o banco são falsos (injetados pela prop, como a bancada do gate): a leitura em si está nos testes da D1b, e a
 *   RPC no `boleto_d1_test.sql`. Aqui se prende o GESTO: nada grava antes do clique, a senha não vai ao banco, a sugestão vem dos
 *   titulares, o repetido na leva fica desmarcado, o arquivo que não sobe é dito.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { CaixaDeBoletosDialog } from './CaixaDeBoletosDialog';
import { respostaDeEntrar, listaDaCaixa, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { LerArquivoDeBoleto } from '@/hooks/useCaixaDeBoletos';
import { FRASE_SENHA, FRASE_SEM_TEXTO, type LeituraDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';

const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
const parte = (nome: string | null, documento: string | null) => ({ nome, documento, confira: false });
const lido = (linha: string, valor: number): LeituraDoBoleto => ({
  boleto: { ok: true, codigo_barras: linha.padEnd(44, '0').slice(0, 44), linha, tipo: 'bancario', banco: '341', valor, vencimento: '2026-12-10' },
  beneficiario: parte('Fornecedor A', '11222333000181'), pagador: parte('Cliente Teste', '11144477735'),
});
const LINHA_A = '3'.repeat(47); const LINHA_B = '4'.repeat(47);

/* o leitor falso: pelo nome do arquivo; "senha.pdf" só abre com 11144 */
const ler = vi.fn<LerArquivoDeBoleto>(async (_bytes, senha) => {
  const nome = ler.mock.calls.length ? ultimoNome : '';
  if (nome === 'senha.pdf') return senha === '11144' ? { ok: true, leitura: lido(LINHA_B, 50) } : { ok: false, motivo: senha ? 'senha_errada' : 'senha', frase: FRASE_SENHA };
  if (nome === 'imagem.pdf') return { ok: false, motivo: 'sem_texto', frase: FRASE_SEM_TEXTO };
  if (nome === 'sem-linha.pdf') return { ok: true, leitura: { ...lido(LINHA_A, 1), boleto: null } };
  return { ok: true, leitura: lido(LINHA_A, 964.67) };
});
let ultimoNome = '';

function respostaDoBanco(linha: string, simular: boolean) {
  return respostaDeEntrar({
    ok: true, simulado: simular, ja_existe: false, id: simular ? null : `id-${linha.slice(0, 1)}`,
    storage_path: simular ? null : `cli/boletos/id-${linha.slice(0, 1)}.pdf`, avisos: [],
    boleto: { codigo_barras: linha.padEnd(44, '0').slice(0, 44), linha_digitavel: linha, tipo: 'bancario', valor: 964.67, vencimento: '2026-12-10', beneficiario_nome: 'Fornecedor A', situacao: 'novo' },
    situacao: { lancamentos: [], avisos: [] },
    candidatos: [{ tipo: 'exato', soma: 964.67, lancamentos: [{ id: 'l1', descricao: 'NF 31.2', valor: 964.67, status: 'previsto', vencimento: '2026-12-10' }] }],
  });
}

let api: { [K in keyof CaixaApi]: Mock<CaixaApi[K]> };
beforeEach(() => {
  ler.mockClear();
  api = {
    lista: vi.fn<CaixaApi['lista']>(async () => ({ ok: true, dados: listaDaCaixa({ contadores: { novo: 0, sem_par: 0 }, itens: [] }) })),
    entrar: vi.fn<CaixaApi['entrar']>(async (_c, l, simular) => ({ ok: true, dados: respostaDoBanco(String(l.linha), simular) })),
    subirArquivo: vi.fn<CaixaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    documentosDosTitulares: vi.fn<CaixaApi['documentosDosTitulares']>(async () => ({ ok: true, dados: ['111.444.777-35', '11.222.333/0001-81'] })),
  };
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0)); r.readAsArrayBuffer(this); });
    };
  }
});

/* solta um arquivo por vez (o leitor falso decide pelo último nome) */
async function soltar(nome: string) {
  ultimoNome = nome;
  fireEvent.change(screen.getByTestId('input-da-caixa'), { target: { files: [pdf(nome)] } });
  await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
}
const linhaDe = (nome: string) => {
  const l = screen.getAllByTestId('boleto-chegando').find((x) => x.textContent?.includes(nome));
  if (!l) throw new Error(`sem a linha de ${nome}`);
  return l;
};

describe('a caixa de boletos — fatia (a)', () => {
  it('soltar só LÊ e pede a PRÉVIA (simular); nada grava antes do "Pôr na caixa"', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('boleto-a.pdf');
    expect(api.entrar).toHaveBeenCalledTimes(1);
    expect(api.entrar.mock.calls[0][2]).toBe(true);
    expect(api.entrar.mock.calls[0][1]).toMatchObject({ linha: LINHA_A, origem: 'pdf', arquivo_nome: 'boleto-a.pdf', beneficiario_documento: '11222333000181' });
    const l = linhaDe('boleto-a.pdf');
    expect(l.textContent).toContain('exato');
    expect(l.textContent).toContain('10/12/2026');
    expect(l.textContent).toContain('964,67');
    expect(api.subirArquivo).not.toHaveBeenCalled();
    expect(screen.getByTestId('por-na-caixa').textContent).toContain('Pôr 1 na caixa');
  });

  it('"Pôr na caixa" grava pela MESMA RPC sem simular e sobe o PDF no caminho que o banco devolveu', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('boleto-a.pdf');
    fireEvent.click(screen.getByTestId('por-na-caixa'));
    await waitFor(() => expect(api.subirArquivo).toHaveBeenCalledTimes(1));
    expect(api.entrar).toHaveBeenCalledTimes(2);
    expect(api.entrar.mock.calls[1][2]).toBe(false);
    expect(api.entrar.mock.calls[1][1]).toEqual(api.entrar.mock.calls[0][1]);
    expect(api.subirArquivo.mock.calls[0][0]).toBe('cli/boletos/id-3.pdf');
    await waitFor(() => expect(linhaDe('boleto-a.pdf').textContent).toContain('na caixa'));
    expect(api.lista).toHaveBeenCalledTimes(2);
  });

  it('o arquivo que não sobe é DITO (o boleto ficou na caixa sem ele)', async () => {
    api.subirArquivo.mockResolvedValueOnce({ ok: false, erro: 'O arquivo não subiu.' });
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('boleto-a.pdf');
    fireEvent.click(screen.getByTestId('por-na-caixa'));
    await waitFor(() => expect(linhaDe('boleto-a.pdf').textContent).toContain('O boleto entrou na caixa, mas o arquivo não subiu.'));
  });

  it('o mesmo título duas vezes na leva: o 2º vem desmarcado, "repetido nesta leva"', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('boleto-a.pdf');
    await soltar('copia-a.pdf');
    expect(linhaDe('copia-a.pdf').textContent).toContain('repetido nesta leva');
    expect(screen.getByTestId('por-na-caixa').textContent).toContain('Pôr 1 na caixa');
  });

  it('PDF com senha: pede a senha, sugere SÓ dos titulares (5 dígitos), e a senha nunca vai ao banco', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('senha.pdf');
    expect(linhaDe('senha.pdf').textContent).toContain('protegido por senha');
    await waitFor(() => expect(screen.getAllByTestId('sugestao-de-senha').map((b) => b.textContent)).toEqual(['11144', '11222']));
    expect(api.documentosDosTitulares).toHaveBeenCalledWith('cli');
    expect(api.entrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTestId('sugestao-de-senha')[0]);
    await waitFor(() => expect(api.entrar).toHaveBeenCalledTimes(1));
    expect(ler.mock.calls.at(-1)?.[1]).toBe('11144');
    /* o pagador (o titular) vai ao banco e contém os mesmos dígitos: o que se prende é que NENHUM campo de senha vai junto */
    expect(Object.keys(api.entrar.mock.calls[0][1]).sort()).toEqual(
      ['arquivo_extensao', 'arquivo_nome', 'beneficiario_documento', 'beneficiario_nome', 'linha', 'origem', 'pagador_documento', 'pagador_nome']);
    await waitFor(() => expect(linhaDe('senha.pdf').textContent).toContain('exato'));
  });

  it('senha errada diz "senha não abriu" e segue pedindo', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('senha.pdf');
    const campo = within(linhaDe('senha.pdf')).getByTestId('senha-do-boleto');
    fireEvent.change(campo, { target: { value: '99999' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(linhaDe('senha.pdf').textContent).toContain('senha não abriu'));
    expect(api.entrar).not.toHaveBeenCalled();
  });

  it('sem texto e sem linha digitável: a linha diz por quê e não entra; o botão trava com o motivo', async () => {
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    await soltar('imagem.pdf');
    await soltar('sem-linha.pdf');
    expect(linhaDe('imagem.pdf').getAttribute('title') ?? linhaDe('imagem.pdf').textContent).toContain('imagem');
    expect(linhaDe('sem-linha.pdf').textContent).toContain('Não achei a linha digitável');
    expect(api.entrar).not.toHaveBeenCalled();
    const b = screen.getByTestId('por-na-caixa');
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('motivo-da-caixa').textContent).toBe('nada marcado para pôr na caixa');
  });

  it('as abas: Na caixa / Sem par / Todos leem a lista gravada com a situação à vista', async () => {
    api.lista.mockResolvedValue({ ok: true, dados: listaDaCaixa({
      contadores: { novo: 1, sem_par: 1, ligado: 1 },
      itens: [
        { id: 'b1', codigo_barras: '1'.repeat(44), situacao: 'novo', beneficiario_nome: 'Fornecedor B', valor: 10, vencimento: '2026-12-01', criado_em: '2026-11-15T10:00:00Z', situacao_atual: { lancamentos: [] } },
        { id: 'b2', codigo_barras: '2'.repeat(44), situacao: 'sem_par', beneficiario_nome: 'Fornecedor C', valor: 20, situacao_atual: { lancamentos: [] } },
        { id: 'b3', codigo_barras: '5'.repeat(44), situacao: 'ligado', beneficiario_nome: 'Fornecedor D', valor: 30,
          situacao_atual: { lancamentos: [{ id: 'l9', descricao: 'NF 77', valor: 30, status: 'agendado', conta: 'BB CC', agendado_para: '2026-12-05', programado_por: { nome: 'Amanda' } }] } },
      ],
    }) });
    render(<CaixaDeBoletosDialog clienteId="cli" api={api} ler={ler} aoFechar={() => {}} />);
    fireEvent.click(await screen.findByText('Na caixa'));
    expect(screen.getAllByTestId('boleto-gravado').map((l) => l.textContent?.includes('Fornecedor B'))).toEqual([true]);
    fireEvent.click(screen.getByText('Sem par'));
    expect(screen.getAllByTestId('boleto-gravado')).toHaveLength(1);
    fireEvent.click(screen.getByText('Todos'));
    const linhas = screen.getAllByTestId('boleto-gravado');
    expect(linhas).toHaveLength(3);
    expect(linhas[2].textContent).toContain('NF 77 · agendado · BB CC · para 05/12/2026 · por Amanda');
  });
});
