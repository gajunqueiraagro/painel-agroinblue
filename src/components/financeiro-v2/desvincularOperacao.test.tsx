/**
 * OC-DESVINCULAR-01 — o dialogo "Desvincular da operação comercial".
 *
 * ⚠ A RPC E' MOCKADA; a regra mora no banco e foi provada em rollback (c80ebe9e / a5c1c61a). Aqui se
 *   trava o que a TELA faz: a simulacao ao abrir (sem motivo, sem gravar), a re-simulacao ao escolher
 *   a conta nova, o motivo obrigatorio, a gravacao com a versao que a simulacao devolveu, e a lista
 *   avisada so' no sucesso.
 * ⚠ O SELETOR DE SUBCENTRO E' TROCADO por um botao: ele e' o `PlanoSubcentroSelect` do LancamentoV2Dialog,
 *   com teste proprio; o que importa aqui e' o `onSelected` levar a CHAVE do plano para a RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const LANC = 'a5c1c61a-7039-4ea8-9492-e264d6187076';
const OC = 'c80ebe9e-e00e-48c6-a7bd-9af27e4f6362';
const CLIENTE = 'cli-vera';
const PL_ESTORNO = 'fc73eac3-ff0c-47cf-819a-d28e2d251608';

const rpc = vi.fn();
function construtor(tabela: string) {
  const dados: Record<string, unknown> = {
    financeiro_lancamentos_v2: { descricao: 'Abate 020 V - Graxaria', tipo_operacao: '2-Saídas', valor: 5056,
      data_competencia: '2025-01-17', subcentro: 'Impostos e Despesas de Abates e Vendas' },
    zoo_operacoes_comerciais: { numero_documento: null, data_operacao: '2025-01-17' },
  };
  const b: Record<string, unknown> = {};
  b.select = () => b; b.eq = () => b;
  b.maybeSingle = () => Promise.resolve({ data: dados[tabela] ?? null, error: null });
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (t: string) => construtor(t) },
}));
const notificar = vi.fn();
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: (id: string) => notificar(id) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/financeiro/planoContasBuilder', () => ({
  loadPlanoContasCompleto: vi.fn(async () => []),
  planoToClassificacoes: () => [
    { id: PL_ESTORNO, subcentro: 'Pagamento Estornado', centro_custo: 'Ajustes', grupo_custo: 'Outras Saídas',
      macro_custo: 'Saída Financeira', tipo_operacao: '2-Saídas', escopo_negocio: 'administrativo' },
  ],
}));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({
  PlanoSubcentroSelect: ({ classificacoes, onSelected, tipoOperacao }: {
    classificacoes: Array<{ id?: string; subcentro: string }>; tipoOperacao: string;
    onSelected: (s: string, c?: { id?: string; subcentro: string }) => void;
  }) => (
    <button type="button" data-testid="escolher-conta" data-tipo={tipoOperacao}
      onClick={() => onSelected(classificacoes[0].subcentro, classificacoes[0])}>escolher</button>
  ),
}));

import { DesvincularOperacaoDialog } from '@/components/financeiro-v2/DesvincularOperacaoDialog';

const CLASSIF_OC = { plano_conta_id: '70d5708e', subcentro: 'Impostos e Despesas de Abates e Vendas', centro_custo: 'Impostos',
  grupo_custo: 'Deduções Pecuária', macro_custo: 'Deduções de Receitas', escopo_negocio: 'pecuaria',
  fazenda_id: 'ac8a596c', fazenda_nome: 'Faz. 3 Muchachas', safra_id: '5e8b70ac', compoe_dre: true };
const CLASSIF_ESTORNO = { ...CLASSIF_OC, plano_conta_id: PL_ESTORNO, subcentro: 'Pagamento Estornado', centro_custo: 'Ajustes',
  grupo_custo: 'Outras Saídas', macro_custo: 'Saída Financeira', escopo_negocio: 'administrativo',
  fazenda_id: '673f02ad', fazenda_nome: 'Administrativo', safra_id: null, compoe_dre: false };

/** A RPC falsa: devolve o envelope provado em rollback, com a classificacao que a conta pedida daria. */
function envelope(args: Record<string, unknown>) {
  const comConta = !!args.p_plano_conta_id;
  return {
    ok: true, acao: args.p_simular ? 'simulado' : 'desvinculado', simulado: !!args.p_simular, operacao_id: OC,
    operacao_versao: args.p_simular ? 16 : 17, parte_id: 'a7ed61c9',
    compromisso: { id: '6b349b87', acao: 'cancelado', componente: 'adiantamento_devolvido', descricao: 'Abate 020 V - Graxaria', valor_anterior: 5056, valor_total: 0 },
    recebido: { de: 107367.46, para: 102311.46 }, compromissos_total: { de: 112423.46, para: 107367.46 },
    liquidacoes_estornadas: ['e3545aaa'],
    lancamento: { id: LANC, valor: 5056, data_pagamento: '2025-01-20', status_transacao: 'realizado', conta_bancaria_id: '1afe76df',
      origem_de: 'operacao_comercial', origem_para: 'manual', era_da_oc: true, intacto: true },
    conciliacao: { vinculos_antes: 0, vinculos_depois: 0 },
    classificacao: { mudou: comConta, de: CLASSIF_OC, para: comConta ? CLASSIF_ESTORNO : CLASSIF_OC },
  };
}
const chamadas = () => rpc.mock.calls.filter(c => c[0] === 'oc_desvincular_lancamento').map(c => c[1] as Record<string, unknown>);

beforeEach(() => {
  rpc.mockReset(); notificar.mockReset();
  rpc.mockImplementation(async (_n: string, args: Record<string, unknown>) => ({ data: envelope(args), error: null }));
});

const montar = (onClose = vi.fn(), onDesvinculado = vi.fn()) => {
  render(<DesvincularOperacaoDialog open lancamentoId={LANC} operacaoId={OC} clienteId={CLIENTE} onClose={onClose} onDesvinculado={onDesvinculado} />);
  return { onClose, onDesvinculado };
};
const resumo = () => screen.getByTestId('desv-resumo').textContent ?? '';

describe('simulacao', () => {
  it('ao abrir: simula sem motivo e sem conta, mostra o efeito, e NAO grava nada', async () => {
    montar();
    await waitFor(() => expect(resumo()).toMatch(/cancelado/));
    expect(resumo()).toMatch(/107\.367,46/);
    expect(resumo()).toMatch(/102\.311,46/);
    expect(resumo()).toMatch(/mantida · Impostos e Despesas de Abates e Vendas/);
    expect(chamadas()).toEqual([expect.objectContaining({ p_simular: true, p_motivo: null, p_plano_conta_id: null })]);
    expect(chamadas().some(a => a.p_simular === false)).toBe(false);
    /* Sem motivo o botao nao grava. */
    const botao = screen.getByTestId('desv-confirmar');
    expect(botao.hasAttribute('disabled')).toBe(true);
    fireEvent.click(botao);
    expect(chamadas()).toHaveLength(1);
  });

  it('o seletor filtra pela DIRECAO do lancamento', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('escolher-conta').getAttribute('data-tipo')).toBe('2-Saídas'));
  });
});

describe('reclassificar para (opcional)', () => {
  it('escolher a conta re-simula com a CHAVE do plano e mostra de A para B; "manter a atual" volta', async () => {
    montar();
    await waitFor(() => expect(resumo()).toMatch(/mantida/));
    fireEvent.click(await screen.findByTestId('escolher-conta'));
    await waitFor(() => expect(resumo()).toMatch(/Impostos e Despesas de Abates e Vendas → Pagamento Estornado/));
    expect(resumo()).toMatch(/Faz\. 3 Muchachas → Administrativo/);
    expect(resumo()).toMatch(/deixa de compor/);
    expect(chamadas().at(-1)).toMatchObject({ p_simular: true, p_plano_conta_id: PL_ESTORNO });

    fireEvent.click(screen.getByTestId('desv-manter'));
    await waitFor(() => expect(resumo()).toMatch(/mantida/));
    expect(chamadas().at(-1)).toMatchObject({ p_simular: true, p_plano_conta_id: null });
  });
});

describe('gravar', () => {
  it('com motivo: grava com a versao da simulacao, a conta escolhida e o motivo; avisa a lista; fecha', async () => {
    const { onClose, onDesvinculado } = montar();
    fireEvent.click(await screen.findByTestId('escolher-conta'));
    await waitFor(() => expect(resumo()).toMatch(/Pagamento Estornado/));
    fireEvent.change(screen.getByTestId('desv-motivo'), { target: { value: 'devolução ao comprador não é da OC' } });
    fireEvent.click(screen.getByTestId('desv-confirmar'));
    await waitFor(() => expect(onDesvinculado).toHaveBeenCalled());
    expect(chamadas().at(-1)).toEqual({
      p_operacao_id: OC, p_versao_esperada: 16, p_lancamento_id: LANC, p_motivo: 'devolução ao comprador não é da OC',
      p_plano_conta_id: PL_ESTORNO, p_simular: false,
    });
    expect(notificar).toHaveBeenCalledWith(CLIENTE);
    expect(onClose).toHaveBeenCalled();
  });

  it('a falha da gravacao nao avisa a lista nem fecha', async () => {
    const { onClose, onDesvinculado } = montar();
    await waitFor(() => expect(resumo()).toMatch(/cancelado/));
    rpc.mockImplementation(async (_n: string, args: Record<string, unknown>) =>
      (args.p_simular ? { data: envelope(args), error: null } : { data: null, error: { message: 'Conflito de versao (esperada 16, atual 17)' } }));
    fireEvent.change(screen.getByTestId('desv-motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('desv-confirmar'));
    await waitFor(() => expect(chamadas().some(a => a.p_simular === false)).toBe(true));
    expect(notificar).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDesvinculado).not.toHaveBeenCalled();
  });
});
