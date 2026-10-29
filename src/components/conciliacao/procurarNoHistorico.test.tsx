/**
 * P153 (CONC-HISTORICO-01) — o "Procurar no histórico": a lib pura (ler a resposta, a faixa, o modelo) e o componente.
 * ⚠ A RPC É FALSA AQUI: quem prova o banco é `supabase/tests/p153_conciliacao_historico_buscar_test.sql` (termina em RAISE). Aqui se
 *   prova a COSTURA — o campo nasce com o nome do banco (D1: vazio + frase), buscar é gesto, o que vai à RPC, a lista com a data
 *   inteira, a faixa amarela, "não consegui" nunca vira "nada achado", e o "Criar igual" entrega o modelo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { lerResultado, fraseDaFaixa, modeloDoAchado, contagemDosAchados } from '@/lib/conciliacao/procurarNoHistorico';

const M = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: M.rpc } }));

import { ProcurarNoHistorico } from './ProcurarNoHistorico';

const ACHADO = {
  lancamento_id: 'l1', data_pagamento: '2026-06-02', banco: 'PAGAMENTO DE BOLETO - ZEBRALUX SINT', descricao: 'Ração de engorda',
  fornecedor_id: 'f1', fornecedor: 'Comércio Sintético de Rações Ltda', plano_conta_id: 'p1', centro: 'Pecuária', subcentro: 'Nutrição',
  fazenda_id: 'fz1', fazenda: 'Fazenda Sintética', conta_bancaria_id: 'cb1', conta: 'Banco Exemplo', valor: -1382, onde: ['banco'],
};
const RESPOSTA = { total: 1, achados: [ACHADO], resumo: { fornecedor_id: 'f1', fornecedor: 'Comércio Sintético de Rações Ltda', vezes: 7, desde: '2026-02-03' } };
const MOV_BB = { data: '2026-10-05', historico: 'Pagamento de Boleto - ZEBRALUX SINT', valor: -1382 };

beforeEach(() => { M.rpc.mockReset().mockResolvedValue({ data: RESPOSTA, error: null }); });

describe('a lib do Procurar no histórico', () => {
  it('lerResultado lê a resposta; formato inesperado = null (nunca lista vazia)', () => {
    const r = lerResultado(RESPOSTA);
    expect(r?.achados[0]).toMatchObject({ lancamentoId: 'l1', valor: -1382, subcentro: 'Nutrição', onde: ['banco'] });
    expect(r?.resumo).toEqual({ fornecedorId: 'f1', fornecedor: 'Comércio Sintético de Rações Ltda', vezes: 7, desde: '2026-02-03' });
    expect(lerResultado(null)).toBeNull();
    expect(lerResultado({ total: 0 })).toBeNull();
    expect(lerResultado({ achados: [{ sem_id: true }] })).toBeNull();
    expect(lerResultado({ total: 0, achados: [], resumo: null })).toEqual({ total: 0, achados: [], resumo: null });
  });
  it('a faixa só aparece quando o nome do banco não está no fornecedor', () => {
    const resumo = { fornecedorId: 'f1', fornecedor: 'Comércio Sintético de Rações Ltda', vezes: 7, desde: '2026-02-03' };
    expect(fraseDaFaixa('ZEBRALUX SINT', resumo))
      .toBe('O banco escreve "ZEBRALUX SINT"; o fornecedor costuma ser Comércio Sintético de Rações Ltda (7 vezes desde 03/02/2026).');
    expect(fraseDaFaixa('comercio sintetico', resumo)).toBeNull();
    expect(fraseDaFaixa('ZEBRALUX', null)).toBeNull();
  });
  it('o modelo leva só fornecedor, subcentro, fazenda e descrição — nunca valor, data ou conta', () => {
    const r = lerResultado(RESPOSTA);
    if (!r) throw new Error('sem resultado');
    expect(modeloDoAchado(r.achados[0])).toEqual({
      favorecido_id: 'f1', plano_conta_id: 'p1', subcentro: 'Nutrição', centro_custo: 'Pecuária', fazenda_id: 'fz1', descricao: 'Ração de engorda',
    });
    expect(contagemDosAchados(r)).toBe('1 achado');
    expect(contagemDosAchados({ total: 180, achados: Array.from({ length: 50 }, () => r.achados[0]), resumo: null })).toBe('50 de 180 achados');
  });
});

describe('o componente ProcurarNoHistorico', () => {
  it('o campo nasce com o nome do banco e NADA sai sozinho; Procurar manda termo, lugares, período, data e valor', async () => {
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV_BB} onCriarIgual={() => {}} />);
    expect(screen.getByTestId('procurar-historico-termo')).toHaveValue('ZEBRALUX SINT');
    expect(M.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    await waitFor(() => expect(M.rpc).toHaveBeenCalledTimes(1));
    expect(M.rpc).toHaveBeenCalledWith('fn_conciliacao_historico_buscar', {
      p_cliente: 'cli', p_termo: 'ZEBRALUX SINT', p_onde: ['banco', 'descricao', 'fornecedor'],
      p_de: '2026-01-01', p_ate: '2026-10-05', p_valor: -1382,
    });
    const linha = await screen.findByTestId('procurar-historico-achado');
    expect(within(linha).getByText('02/06/2026')).toBeInTheDocument();
    expect(within(linha).getByText('-1.382,00')).toBeInTheDocument();
    expect(within(linha).getByTitle('Pecuária · Nutrição')).toHaveTextContent('Nutrição');
    expect(screen.getByTestId('procurar-historico-contagem')).toHaveTextContent('1 achado');
    expect(screen.getByTestId('procurar-historico-frase').className).toContain('bg-amber-50');
  });

  it('D1: banco sem nome → o campo vazio, a frase "o banco não trouxe o nome: digite" e o Procurar travado', () => {
    render(<ProcurarNoHistorico clienteId="cli" movimento={{ data: '2026-10-05', historico: 'PIX ENVIADO', valor: -50 }} onCriarIgual={() => {}} />);
    expect(screen.getByTestId('procurar-historico-termo')).toHaveValue('');
    expect(screen.getByTestId('procurar-historico-frase')).toHaveTextContent('o banco não trouxe o nome: digite');
    expect(screen.getByTestId('procurar-historico-botao')).toBeDisabled();
  });

  it('desmarcar um lugar e abrir o ano anterior mudam o pedido; Enter procura', async () => {
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV_BB} onCriarIgual={() => {}} />);
    fireEvent.click(screen.getByTestId('procurar-onde-banco'));
    fireEvent.click(screen.getByTestId('procurar-periodo'));
    expect(screen.getByTestId('procurar-periodo')).toHaveTextContent('desde jan/2025');
    fireEvent.keyDown(screen.getByTestId('procurar-historico-termo'), { key: 'Enter' });
    await waitFor(() => expect(M.rpc).toHaveBeenCalledTimes(1));
    expect(M.rpc.mock.calls[0][1]).toMatchObject({ p_onde: ['descricao', 'fornecedor'], p_de: '2025-01-01' });
  });

  it('a recusa diz "Não consegui procurar" com "Tentar de novo" — nunca "nada achado"', async () => {
    M.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } }).mockResolvedValueOnce({ data: { total: 0, achados: [], resumo: null }, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV_BB} onCriarIgual={() => {}} />);
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    expect(await screen.findByText(/Não consegui procurar: o banco recusou a busca/)).toBeInTheDocument();
    expect(screen.queryByText(/nada achado/)).toBeNull();
    fireEvent.click(screen.getByText('Tentar de novo'));
    expect(await screen.findByText('nada achado com "ZEBRALUX SINT"')).toBeInTheDocument();
  });

  it('"Criar igual" entrega o modelo do achado', async () => {
    const onCriarIgual = vi.fn();
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV_BB} onCriarIgual={onCriarIgual} />);
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    fireEvent.click(await screen.findByTestId('procurar-criar-igual'));
    expect(onCriarIgual).toHaveBeenCalledWith({
      favorecido_id: 'f1', plano_conta_id: 'p1', subcentro: 'Nutrição', centro_custo: 'Pecuária', fazenda_id: 'fz1', descricao: 'Ração de engorda',
    });
  });

  it('LAYOUT FIXO: o quadro tem a altura de 6 linhas e piso de 800px; a frase é a 1ª linha DO QUADRO (o "…" com o title vale em tabela)', async () => {
    const { container } = render(<ProcurarNoHistorico clienteId="cli" movimento={MOV_BB} onCriarIgual={() => {}} />);
    const quadro = container.querySelector('table')?.parentElement;
    expect(quadro?.style.height).toBe('138px');
    expect(container.querySelector('table')?.style.minWidth).toBe('800px');
    /* com 1 achado o quadro não rola: o cabeçalho não fica preso (preso num quadro que não rola é vão no gate) */
    expect(container.querySelector('thead')?.className).not.toContain('sticky');
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    const linha = await screen.findByTestId('procurar-historico-achado');
    const frase = screen.getByTestId('procurar-historico-frase');
    expect(frase.tagName).toBe('TD');
    expect(frase.className).toContain('truncate');
    expect(frase.getAttribute('title')).toBe(frase.textContent);
    const banco = within(linha).getByText(ACHADO.banco);
    expect(banco.className).toContain('truncate');
    expect(banco.getAttribute('title')).toBe(ACHADO.banco);
  });
});
