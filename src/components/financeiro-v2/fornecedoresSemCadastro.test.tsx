/**
 * FORN-SEM-CADASTRO-01 — a aba "Sem cadastro": (1) "Ligar" só acende com destino escolhido (a sugestão já é um destino);
 * (2) "+ Criar cadastro" abre o modal de cadastro com o texto e NÃO grava nada sozinho — só depois de salvo o cadastro os
 * lançamentos são ligados, marcando que o cadastro foi criado ali; (3) a linha ligada fica verde com "Desfazer"; (4) "Pec.3M-"
 * do outro lado apaga o Ligar com o motivo; (5) a aba antiga ("Pendentes", "Criar", "Vincular") saiu (lido da fonte).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
const respostas: Record<string, unknown> = {};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: async (fn: string, args: Record<string, unknown>) => { chamadas.push({ fn, args }); return { data: respostas[fn] ?? null, error: null }; } },
}));
const modal: { props: Record<string, unknown> | null } = { props: null };
vi.mock('@/components/financeiro-v2/FornecedorFormDialog', () => ({
  FornecedorFormDialog: (p: Record<string, unknown>) => { modal.props = p; return <div data-testid="modal-cadastro">{String(p.nomeInicial)}</div>; },
}));

import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { FornecedoresSemCadastro } from './FornecedoresSemCadastro';

const lanc = (id: string) => ({ id, descricao: `Folha ${id}`, data: '2026-10-05', valor: 1200, fazenda_id: 'fz', status: 'realizado' });
const LEITURA = {
  textos: [
    { chave: 'contador folha', texto: 'Contador Folha', origem: 'descricao', rateio: false, qtd: 4, valor: 4800, ultimo: '2026-10-05',
      sugestao: { fornecedor_id: 'f1', nome: 'Contador BG', documento: null, motivo: 'parecido' }, lancamentos: ['a', 'b', 'c', 'd'].map(lanc) },
    { chave: 'cartorio', texto: 'Cartório', origem: 'descricao', rateio: false, qtd: 1, valor: 50, ultimo: '2026-06-02', sugestao: null, lancamentos: [lanc('e')] },
    { chave: 'pec.3m-combustivel', texto: 'Pec.3M-Combustível', origem: 'planilha', rateio: true, qtd: 2, valor: 90, ultimo: '2026-09-01',
      sugestao: null, lancamentos: [lanc('f'), lanc('g')] },
  ],
  total: { textos: 3, lancamentos: 7, valor: 4940 }, com_sugestao: 1, sem_sugestao: 2,
};
const montar = () => render(<FornecedoresSemCadastro clienteId="cli" fazendas={[{ id: 'fz', nome: 'Baia Grande' }]} />);
const linhaDe = async (texto: string) => (await screen.findByText(texto)).closest('tr') as HTMLElement;

beforeEach(() => {
  chamadas.length = 0; modal.props = null;
  respostas.fn_fornecedor_sem_cadastro = LEITURA;
  respostas.fn_fornecedor_sem_cadastro_ligar = { ok: true, operacao_id: 'op1', lancamentos: 4 };
  definirFornecedoresDoLeitor([{ id: 'f1', nome: 'Contador BG' }, { id: 'f2', nome: 'Cartório Central' }]);
});

describe('FORN-SEM-CADASTRO-01 — a aba', () => {
  it('Ligar só acende com destino: a sugestão já vem escolhida, com a etiqueta e o motivo', async () => {
    montar();
    const com = await linhaDe('Contador Folha');
    expect(within(com).getByTestId('sem-cadastro-ligar')).not.toBeDisabled();
    const tag = within(com).getByTestId('sem-cadastro-tag-sugestao');
    expect(tag.className).not.toContain('invisible');
    expect(tag.getAttribute('title')).toBe('Sugestão: nome parecido');
    const sem = await linhaDe('Cartório');
    expect(within(sem).getByTestId('sem-cadastro-ligar')).toBeDisabled();
    expect(within(sem).getByTestId('sem-cadastro-tag-sugestao').className).toContain('invisible');
    expect(screen.getByTestId('sem-cadastro-total').textContent).toContain('3 textos');
  });
  it('ligar grava pelo banco (simular=false) e a linha fica verde com Desfazer', async () => {
    montar();
    fireEvent.click(within(await linhaDe('Contador Folha')).getByTestId('sem-cadastro-ligar'));
    const ligada = await screen.findByTestId('sem-cadastro-ligado');
    expect(ligada.textContent).toContain('✓ Ligado a Contador BG');
    expect(within(ligada).getByTestId('sem-cadastro-desfazer')).toBeInTheDocument();
    const c = chamadas.find((x) => x.fn === 'fn_fornecedor_sem_cadastro_ligar');
    expect(c?.args).toMatchObject({ p_chave: 'contador folha', p_fornecedor_id: 'f1', p_fornecedor_criado: false, p_simular: false });
    expect(screen.getByTestId('sem-cadastro-rodape').textContent).toContain('1 texto · 4 lançamentos');
  });
  it('"+ Criar cadastro" abre o modal com o texto e não grava; salvo o cadastro, liga marcando que foi criado ali', async () => {
    montar();
    const sem = await linhaDe('Cartório');
    fireEvent.click(within(sem).getByRole('combobox'));
    fireEvent.click(await screen.findByText('+ Criar cadastro "Cartório"…'));
    expect(screen.getByTestId('modal-cadastro').textContent).toBe('Cartório');
    expect(chamadas.some((x) => x.fn === 'fn_fornecedor_sem_cadastro_ligar')).toBe(false);
    const onCriado = modal.props?.onCriado;
    if (typeof onCriado !== 'function') throw new Error('o modal não recebeu onCriado');
    onCriado('novo1');
    await waitFor(() => expect(chamadas.find((x) => x.fn === 'fn_fornecedor_sem_cadastro_ligar')?.args)
      .toMatchObject({ p_chave: 'cartorio', p_fornecedor_id: 'novo1', p_fornecedor_criado: true, p_simular: false }));
  });
  it('"Pec.3M-" com destino do outro lado: Ligar apagado com o motivo', async () => {
    montar();
    const pec = await linhaDe('Pec.3M-Combustível');
    fireEvent.click(within(pec).getByRole('combobox'));
    fireEvent.click(await screen.findByText('Cartório Central'));
    const b = within(pec).getByTestId('sem-cadastro-ligar');
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toContain('"Pec.3M-" marca o pagamento por rateio');
  });
  it('a aba antiga saiu: sem "Pendentes", "Criar", "Vincular" nem UPDATE direto de lançamento na tela', () => {
    const src = readFileSync(resolve(__dirname, '../../pages/FinV2FornecedoresTab.tsx'), 'utf8');
    expect(src).not.toMatch(/value="pendentes"|createAndLink|linkToFornecedor|Vincular<\/|\.update\(\{ favorecido_id/);
    expect(src).toContain('<FornecedoresSemCadastro');
  });
});
