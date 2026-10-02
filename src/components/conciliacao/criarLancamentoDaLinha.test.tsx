/**
 * CONC-CRIAR-TRANSFERENCIA-01 — o "Criar" da linha do extrato oferece Transferências.
 *
 * ⚠ A RPC E O DIALOG SÃO FALSOS AQUI: quem prova o banco é `supabase/tests/conc_criar_transferencia_01_test.sql` (em
 *   ROLLBACK). Aqui se prova a COSTURA — os tipos oferecidos pelo sinal (nunca o contrário), o que fica travado (só a conta
 *   do extrato, valor e data), que a outra conta vai como `p_outra_conta` pelo lado certo, que fora da transferência os
 *   dois parâmetros vão nulos, que a recusa mostra a frase e que o `semVinculo` não mudou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';
import {
  CriarLancamentoDaLinha, tiposDoExtrato, travasDoExtrato, parametrosDoTipo, fraseDaRecusaCriar, TIPO_TRANSFERENCIA,
} from './CriarLancamentoDaLinha';

interface PropsCapturadas {
  lockedFields?: string[];
  tiposOperacaoPermitidos?: readonly string[];
  onSave: (f: LancamentoV2Form) => Promise<boolean>;
}

const M = vi.hoisted(() => ({
  props: null as PropsCapturadas | null,
  form: {} as Record<string, unknown>,
  rpc: vi.fn(),
  criarComId: vi.fn(),
  erro: vi.fn(),
  ok: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: M.ok, error: M.erro } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: M.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { fazenda_id: 'faz-1' } }) }) }) }),
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { fazenda_id: 'faz-1' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({
    contasBancarias: [], fornecedores: [], classificacoes: [], safras: [],
    loadContas: async () => {}, loadFornecedores: async () => {}, loadClassificacoes: async () => {}, loadSafras: async () => {},
    criarFornecedor: async () => null, criarLancamentoComId: M.criarComId,
  }),
}));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: (p: PropsCapturadas) => {
    M.props = p;
    return <button type="button" data-testid="salvar" onClick={() => { void p.onSave(M.form as unknown as LancamentoV2Form); }}>salvar</button>;
  },
}));

const mov = (valor: number): MovimentoConciliacao => ({
  id: 'ext-1', data_movimento: '2026-09-10', valor, descricao: 'PAGTO FATURA MASTER', documento: null,
} as unknown as MovimentoConciliacao);

const formBase = { fazenda_id: 'faz-1', subcentro: '', descricao: 'PAGTO FATURA MASTER' };

beforeEach(() => {
  M.props = null;
  M.form = { ...formBase };
  M.rpc.mockReset().mockResolvedValue({ error: null });
  M.criarComId.mockReset().mockResolvedValue('novo-id');
  M.erro.mockReset();
  M.ok.mockReset();
});

function abrir(valor: number, semVinculo = false) {
  return render(
    <CriarLancamentoDaLinha movimento={mov(valor)} contaBancariaId="conta-extrato" semVinculo={semVinculo}
      aoFechar={() => {}} aoCriado={() => {}} />,
  );
}

describe('funções puras', () => {
  it('tipos pelo sinal: o do sinal e Transferências, nunca o contrário', () => {
    expect(tiposDoExtrato(-63716)).toEqual(['2-Saídas', TIPO_TRANSFERENCIA]);
    expect(tiposDoExtrato(10764.11)).toEqual(['1-Entradas', TIPO_TRANSFERENCIA]);
    expect(tiposDoExtrato(-1)).not.toContain('1-Entradas');
    expect(tiposDoExtrato(1)).not.toContain('2-Saídas');
  });

  it('travas: só a conta do extrato (origem na saída, destino na entrada), valor e data; semVinculo trava tudo', () => {
    expect(travasDoExtrato(-5, false)).toEqual(['valor', 'data_pagamento', 'conta_bancaria_id']);
    expect(travasDoExtrato(5, false)).toEqual(['valor', 'data_pagamento', 'conta_destino_id']);
    expect(travasDoExtrato(-5, false)).not.toContain('tipo_operacao');
    expect(travasDoExtrato(5, true)).toEqual(['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao']);
  });

  it('parâmetros: outra conta = destino na saída, origem na entrada; fora da transferência, nulos', () => {
    const f = { tipo_operacao: TIPO_TRANSFERENCIA, conta_bancaria_id: 'origem', conta_destino_id: 'destino' };
    expect(parametrosDoTipo(f, -1)).toEqual({ p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: 'destino' });
    expect(parametrosDoTipo(f, 1)).toEqual({ p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: 'origem' });
    expect(parametrosDoTipo({ ...f, tipo_operacao: '2-Saídas' }, -1)).toEqual({ p_tipo_operacao: null, p_outra_conta: null });
    expect(parametrosDoTipo({ ...f, conta_destino_id: '' }, -1)).toEqual({ p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: null });
  });

  it('recusa "codigo: frase" vira a frase; mensagem sem código passa inteira', () => {
    expect(fraseDaRecusaCriar('ja_existe_transferencia: já existe transferência lançada para este movimento — feche pelo "Transferências entre contas"'))
      .toBe('já existe transferência lançada para este movimento — feche pelo "Transferências entre contas"');
    expect(fraseDaRecusaCriar('competencia 2026-09 em mes fechado: criacao bloqueada')).toBe('competencia 2026-09 em mes fechado: criacao bloqueada');
  });
});

describe('a costura com o dialog e a RPC', () => {
  it('extrato negativo: o dialog recebe Saídas|Transferências e trava só a conta de origem', () => {
    abrir(-63716);
    expect(M.props?.tiposOperacaoPermitidos).toEqual(['2-Saídas', TIPO_TRANSFERENCIA]);
    expect(M.props?.lockedFields).toEqual(['valor', 'data_pagamento', 'conta_bancaria_id']);
  });

  it('extrato positivo: Entradas|Transferências, trava só a conta de destino', () => {
    abrir(10764.11);
    expect(M.props?.tiposOperacaoPermitidos).toEqual(['1-Entradas', TIPO_TRANSFERENCIA]);
    expect(M.props?.lockedFields).toEqual(['valor', 'data_pagamento', 'conta_destino_id']);
  });

  it('Transferência num extrato negativo: a RPC recebe p_tipo_operacao e p_outra_conta = o destino escolhido', async () => {
    M.form = { ...formBase, tipo_operacao: TIPO_TRANSFERENCIA, conta_bancaria_id: 'conta-extrato', conta_destino_id: 'cartao' };
    const { getByTestId } = abrir(-63716);
    fireEvent.click(getByTestId('salvar'));
    await waitFor(() => expect(M.rpc).toHaveBeenCalledTimes(1));
    const [nome, args] = M.rpc.mock.calls[0];
    expect(nome).toBe('fn_criar_lancamento_de_extrato');
    expect(args).toMatchObject({ p_extrato_id: 'ext-1', p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: 'cartao' });
  });

  it('Transferência num extrato positivo: p_outra_conta = a origem escolhida', async () => {
    M.form = { ...formBase, tipo_operacao: TIPO_TRANSFERENCIA, conta_bancaria_id: 'invest', conta_destino_id: 'conta-extrato' };
    const { getByTestId } = abrir(10764.11);
    fireEvent.click(getByTestId('salvar'));
    await waitFor(() => expect(M.rpc).toHaveBeenCalledTimes(1));
    expect(M.rpc.mock.calls[0][1]).toMatchObject({ p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: 'invest' });
  });

  it('Saída comum: os dois parâmetros novos vão nulos (o caminho de sempre)', async () => {
    M.form = { ...formBase, tipo_operacao: '2-Saídas', conta_bancaria_id: 'conta-extrato' };
    const { getByTestId } = abrir(-63716);
    fireEvent.click(getByTestId('salvar'));
    await waitFor(() => expect(M.rpc).toHaveBeenCalledTimes(1));
    expect(M.rpc.mock.calls[0][1]).toMatchObject({ p_tipo_operacao: null, p_outra_conta: null });
  });

  it('recusa ja_existe_transferencia: o toast mostra a frase, sem o código, e o modal fica aberto', async () => {
    M.rpc.mockResolvedValue({ error: { message: 'ja_existe_transferencia: já existe transferência lançada para este movimento — feche pelo "Transferências entre contas"' } });
    M.form = { ...formBase, tipo_operacao: TIPO_TRANSFERENCIA, conta_destino_id: 'cartao' };
    const { getByTestId } = abrir(-63716);
    fireEvent.click(getByTestId('salvar'));
    await waitFor(() => expect(M.erro).toHaveBeenCalledTimes(1));
    expect(M.erro.mock.calls[0][0]).toBe('já existe transferência lançada para este movimento — feche pelo "Transferências entre contas"');
    expect(M.ok).not.toHaveBeenCalled();
  });

  it('semVinculo NÃO muda: tudo travado, nenhum filtro de tipo, grava pelo writer comum', async () => {
    const { getByTestId } = abrir(-63716, true);
    expect(M.props?.tiposOperacaoPermitidos).toBeUndefined();
    expect(M.props?.lockedFields).toContain('tipo_operacao');
    fireEvent.click(getByTestId('salvar'));
    await waitFor(() => expect(M.criarComId).toHaveBeenCalledTimes(1));
    expect(M.rpc).not.toHaveBeenCalled();
  });
});

describe('o dialog filtra o Select de tipo pela prop (inspeção do fonte; nenhum teste monta o dialog)', () => {
  it('o filtro existe e só age quando a prop vem', () => {
    const src = readFileSync(resolve(__dirname, '../financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
    expect(src).toContain('tiposOperacaoPermitidos?: readonly string[];');
    expect(src).toMatch(/TIPOS_OPERACAO\.filter\(t => !tiposOperacaoPermitidos \|\| tiposOperacaoPermitidos\.includes\(t\.value\)\)/);
  });
});
