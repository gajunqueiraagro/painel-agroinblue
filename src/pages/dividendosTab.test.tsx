/**
 * DIVIDENDO-ESCRITOR-UNICO-01 passo 3 — a tela de Dividendos fala com o ESCRITOR ÚNICO do banco (funções MOCKADAS aqui).
 * O que se prende: cada gesto chama a função certa com os argumentos certos; a recusa fica ESCRITA no lugar reservado (nunca
 * toast); inativar pergunta ANTES ao banco quantos lançamentos seguram a conta; reordenar é UMA chamada com a lista inteira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Linha { id: string; cliente_id: string; nome: string; ativo: boolean; ordem_exibicao: number }
const estado = vi.hoisted(() => ({
  linhas: [] as Linha[],
  leituras: 0,
  escritas: [] as string[],
  rpc: vi.fn(),
  notificar: vi.fn(),
  toastErro: vi.fn(),
  toastOk: vi.fn(),
}));

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1', nome: 'Cliente Teste' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: (...a: unknown[]) => estado.notificar(...a) }));
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => estado.toastErro(...a), success: (...a: unknown[]) => estado.toastOk(...a) } }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    for (const m of ['insert', 'update', 'delete', 'upsert']) q[m] = () => { estado.escritas.push(`${nome}.${m}`); return q; };
    q.then = (ok: (v: { data: unknown; error: null }) => unknown) => { estado.leituras += 1; return Promise.resolve(ok({ data: estado.linhas, error: null })); };
    return q;
  };
  return { supabase: { from: tabela, rpc: (...a: unknown[]) => estado.rpc(...a) } };
});

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

import { DividendosTab } from '@/pages/DividendosTab';
import { FRASE_RESPOSTA_INESPERADA, fraseDoQueSegura, lerRespostaDoDividendo, ordemCompleta } from '@/lib/financeiro/dividendosCadastro';

const OK = { data: { antes: null, depois: {}, recusa: null }, error: null };
const recusaDoBanco = (frase: string) => ({ data: null, error: { message: `${frase} Nada foi gravado.` } });
let invalidar: ReturnType<typeof vi.spyOn>;

const montar = async () => {
  const qc = new QueryClient();
  invalidar = vi.spyOn(qc, 'invalidateQueries');
  const r = render(<QueryClientProvider client={qc}><DividendosTab /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Ana')).toBeTruthy());
  return r;
};
const chave = (nome: string) => {
  const linha = screen.getByText(nome).parentElement;
  const s = linha?.querySelector('[role="switch"]');
  if (!(s instanceof HTMLElement)) throw new Error(`sem chave na linha de ${nome}`);
  return s;
};

beforeEach(() => {
  estado.linhas = [
    { id: 'd1', cliente_id: 'cli-1', nome: 'Ana', ativo: true, ordem_exibicao: 0 },
    { id: 'd2', cliente_id: 'cli-1', nome: 'Bia', ativo: false, ordem_exibicao: 1 },
    { id: 'd3', cliente_id: 'cli-1', nome: 'Caio', ativo: true, ordem_exibicao: 2 },
  ];
  estado.leituras = 0;
  estado.escritas = [];
  estado.rpc.mockReset();
  estado.rpc.mockResolvedValue(OK);
  estado.notificar.mockReset();
  estado.toastErro.mockReset();
  estado.toastOk.mockReset();
});

describe('a tela de Dividendos chama o escritor único', () => {
  it('os lugares da recusa existem sempre, vazios', async () => {
    await montar();
    expect(screen.getByTestId('dividendo-recado-lista').textContent).toBe('');
    fireEvent.click(screen.getByText('Novo'));
    expect(screen.getByTestId('dividendo-recado-form').textContent).toBe('');
  });

  it('criar: uma chamada com cliente e nome; depois relê e avisa quem mostra o plano', async () => {
    await montar();
    fireEvent.click(screen.getByText('Novo'));
    fireEvent.change(screen.getByPlaceholderText('Ex: Higino'), { target: { value: '  Davi ' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(estado.rpc).toHaveBeenCalledWith('fn_dividendo_criar', { p_cliente_id: 'cli-1', p_nome: 'Davi', p_simular: false });
    await waitFor(() => expect(estado.leituras).toBe(2));
    expect(estado.notificar).toHaveBeenCalledWith('cli-1');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['fin-classificacoes-plano', 'cli-1'] });
    expect(screen.queryByTestId('dividendo-recado-form')).toBeNull();
    expect(estado.escritas).toEqual([]);
  });

  it('criar recusado: a frase do banco fica escrita sob o botão, o digitado fica, e não há toast', async () => {
    estado.rpc.mockResolvedValue(recusaDoBanco('Já existe um dividendo ativo com este nome.'));
    await montar();
    fireEvent.click(screen.getByText('Novo'));
    fireEvent.change(screen.getByPlaceholderText('Ex: Higino'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(screen.getByTestId('dividendo-recado-form').textContent).toBe('Já existe um dividendo ativo com este nome. Nada foi gravado.'));
    expect(screen.getByPlaceholderText('Ex: Higino')).toHaveProperty('value', 'ana');
    expect(estado.toastErro).not.toHaveBeenCalled();
    expect(estado.toastOk).not.toHaveBeenCalled();
    expect(estado.leituras).toBe(1);
    expect(estado.notificar).not.toHaveBeenCalled();
  });

  it('renomear: chama pelo id e diz quantos lançamentos receberam o nome', async () => {
    estado.rpc.mockResolvedValue({ data: { antes: {}, depois: {}, recusa: null, lancamentos_tocados: 4 }, error: null });
    await montar();
    const lapis = screen.getByText('Caio').parentElement?.querySelector('button.h-5');
    if (!(lapis instanceof HTMLElement)) throw new Error('sem lápis');
    fireEvent.click(lapis);
    fireEvent.change(screen.getByPlaceholderText('Ex: Higino'), { target: { value: 'Caio Jr' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledWith('fn_dividendo_renomear', { p_id: 'd3', p_nome: 'Caio Jr', p_simular: false }));
    await waitFor(() => expect(estado.toastOk).toHaveBeenCalledWith('Dividendo atualizado', { description: '4 lançamento(s) receberam o nome novo.' }));
  });

  it('inativar sem lançamento: simula, e grava em seguida sem perguntar', async () => {
    estado.rpc.mockResolvedValue({ data: { antes: {}, depois: {}, recusa: null, conta_acao: 'inativada', lancamentos_que_seguram: 0 }, error: null });
    await montar();
    fireEvent.click(chave('Ana'));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(2));
    expect(estado.rpc.mock.calls).toEqual([
      ['fn_dividendo_inativar', { p_id: 'd1', p_simular: true }],
      ['fn_dividendo_inativar', { p_id: 'd1', p_simular: false }],
    ]);
    expect(screen.queryByTestId('dividendo-quem-segura')).toBeNull();
    await waitFor(() => expect(estado.notificar).toHaveBeenCalledWith('cli-1'));
  });

  it('inativar com lançamentos: mostra ANTES quantos seguram; Voltar não grava; Inativar grava', async () => {
    estado.rpc.mockResolvedValue({ data: { antes: {}, depois: {}, recusa: null, conta_acao: 'mantida', lancamentos_que_seguram: 3 }, error: null });
    await montar();
    fireEvent.click(chave('Ana'));
    await waitFor(() => expect(screen.getByTestId('dividendo-quem-segura').textContent).toBe(fraseDoQueSegura(3)));
    expect(estado.rpc).toHaveBeenCalledTimes(1);
    expect(estado.rpc).toHaveBeenCalledWith('fn_dividendo_inativar', { p_id: 'd1', p_simular: true });
    expect(screen.getByTestId('dividendo-recado-confirmacao').textContent).toBe('');
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => expect(screen.queryByTestId('dividendo-quem-segura')).toBeNull());
    expect(estado.rpc).toHaveBeenCalledTimes(1);

    fireEvent.click(chave('Ana'));
    await waitFor(() => expect(screen.getByTestId('dividendo-quem-segura')).toBeTruthy());
    fireEvent.click(screen.getByText('Inativar'));
    await waitFor(() => expect(estado.rpc).toHaveBeenLastCalledWith('fn_dividendo_inativar', { p_id: 'd1', p_simular: false }));
    await waitFor(() => expect(screen.queryByTestId('dividendo-quem-segura')).toBeNull());
  });

  it('a gravação do inativar recusada fica escrita na confirmação, que continua aberta', async () => {
    estado.rpc
      .mockResolvedValueOnce({ data: { antes: {}, depois: {}, recusa: null, conta_acao: 'mantida', lancamentos_que_seguram: 1 }, error: null })
      .mockResolvedValueOnce(recusaDoBanco('Este dividendo já está inativo.'));
    await montar();
    fireEvent.click(chave('Ana'));
    await waitFor(() => expect(screen.getByTestId('dividendo-quem-segura').textContent).toBe(fraseDoQueSegura(1)));
    fireEvent.click(screen.getByText('Inativar'));
    await waitFor(() => expect(screen.getByTestId('dividendo-recado-confirmacao').textContent).toBe('Este dividendo já está inativo. Nada foi gravado.'));
    expect(screen.getByTestId('dividendo-quem-segura')).toBeTruthy();
    expect(estado.toastErro).not.toHaveBeenCalled();
  });

  it('reativar recusado: a frase fica escrita ao lado dos botões da lista, sem toast', async () => {
    estado.rpc.mockResolvedValue(recusaDoBanco('Já existe um dividendo ativo com este nome: este não pode ser reativado.'));
    await montar();
    fireEvent.click(screen.getByLabelText('Inativos'));
    await waitFor(() => expect(screen.getByText('Bia')).toBeTruthy());
    fireEvent.click(chave('Bia'));
    await waitFor(() => expect(screen.getByTestId('dividendo-recado-lista').textContent)
      .toBe('Já existe um dividendo ativo com este nome: este não pode ser reativado. Nada foi gravado.'));
    expect(estado.rpc).toHaveBeenCalledWith('fn_dividendo_reativar', { p_id: 'd2', p_simular: false });
    expect(screen.getByTestId('dividendo-recado-lista').getAttribute('title')).toContain('não pode ser reativado');
    expect(estado.toastErro).not.toHaveBeenCalled();
    expect(estado.notificar).not.toHaveBeenCalled();
  });
});

describe('o leitor da resposta e a ordem', () => {
  it('erro do banco vira a frase; recusa da simulação vira a frase; peça torta nunca vira sucesso', () => {
    expect(lerRespostaDoDividendo(null, { message: ' X. Nada foi gravado. ' })).toEqual({ ok: false, frase: 'X. Nada foi gravado.' });
    expect(lerRespostaDoDividendo(null, { message: '' })).toEqual({ ok: false, frase: 'Não foi possível gravar. Nada foi gravado.' });
    expect(lerRespostaDoDividendo({ antes: null, depois: null, recusa: { motivo: 'nome_repetido', frase: 'Já existe.' } }, null)).toEqual({ ok: false, frase: 'Já existe.' });
    for (const torta of [null, undefined, 'ok', [], {}, { depois: {} }, { recusa: 'x' }, { recusa: {} }, { recusa: { frase: ' ' } }]) {
      expect(lerRespostaDoDividendo(torta, null)).toEqual({ ok: false, frase: FRASE_RESPOSTA_INESPERADA });
    }
    expect(lerRespostaDoDividendo({ recusa: null, lancamentos_tocados: 2, conta_acao: 'mantida', lancamentos_que_seguram: 5 }, null))
      .toEqual({ ok: true, lancamentosTocados: 2, contaAcao: 'mantida', lancamentosQueSeguram: 5 });
    expect(lerRespostaDoDividendo({ recusa: null }, null)).toEqual({ ok: true, lancamentosTocados: 0, contaAcao: null, lancamentosQueSeguram: 0 });
  });

  it('a frase de quem segura concorda com o número', () => {
    expect(fraseDoQueSegura(1)).toMatch(/^1 lançamento usa este dividendo\. /);
    expect(fraseDoQueSegura(12)).toMatch(/^12 lançamentos usam este dividendo\. /);
    expect(fraseDoQueSegura(12)).toContain('a conta continua no plano');
  });

  it('ordemCompleta: os visíveis trocam entre si; o escondido fica onde estava; a lista é a do cliente, uma vez cada', () => {
    const todos = [{ id: 'a' }, { id: 'x' }, { id: 'b' }, { id: 'c' }];
    expect(ordemCompleta(todos, [{ id: 'c' }, { id: 'a' }, { id: 'b' }])).toEqual(['c', 'x', 'a', 'b']);
    expect(ordemCompleta(todos, [{ id: 'a' }, { id: 'x' }, { id: 'b' }, { id: 'c' }])).toEqual(['a', 'x', 'b', 'c']);
    expect(ordemCompleta(todos, [{ id: 'x' }, { id: 'c' }, { id: 'b' }, { id: 'a' }])).toEqual(['x', 'c', 'b', 'a']);
  });
});

describe('a fonte da tela', () => {
  const FONTE = readFileSync(resolve(process.cwd(), 'src/pages/DividendosTab.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('reordenar é UMA chamada, com a lista inteira; não há gravação em laço nem toast de erro', () => {
    expect(FONTE.split('FN_DIVIDENDO.reordenar').length - 1).toBe(1);
    expect(FONTE).toContain('ordemCompleta(items,');
    expect(FONTE).not.toContain('Promise.all');
    expect(FONTE).not.toContain('toast.error');
  });

  it('a tela não escreve em tabela nenhuma: só lê o cadastro e chama as funções', () => {
    expect(FONTE).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(FONTE.split(".from('financeiro_dividendos')").length - 1).toBe(1);
    for (const fn of ['criar', 'renomear', 'inativar', 'reativar', 'reordenar']) expect(FONTE).toContain(`FN_DIVIDENDO.${fn}`);
  });
});
