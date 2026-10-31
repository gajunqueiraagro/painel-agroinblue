/**
 * CAD-CONTAS-BANCARIAS-01 — o modal da conta bancaria.
 *   M1 editar sem mexer: Salvar apagado e nada vai ao banco; mexer no gerente manda SO' o gerente ao escritor (fn_conta_bancaria_salvar)
 *   M2 "Sem extrato" no formato grava a marca do CONC-TRANSF-DUAS-PONTAS-01b, com a dica; e avisa quem mostra contas (a Conciliacao)
 *   M3 nenhum campo de senha; a frase do internet banking na aba Banco e gerente
 *   M4 nova conta: a aba Saldo inicial com o selo "obrigatório"; Criar so' com data e saldo; manda a conta inteira
 *   M5 mudar o saldo inicial: o aviso ambar e o saldo vai ao escritor
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => {
  const cadeia: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'in', 'order', 'limit']) cadeia[k] = () => cadeia;
  cadeia.maybeSingle = async () => ({ data: null, error: null });
  cadeia.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { rpc, from: () => cadeia } };
});
vi.mock('@/hooks/useExtratoDaConta', () => ({
  useSaldoDocumentos: () => ({ documentos: [], loading: false, recarregar: async () => {} }),
  anexarSaldoDocumento: vi.fn(async () => ({ ok: true, erro: null })),
  cancelarSaldoDocumento: vi.fn(async () => ({ ok: true, erro: null })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const avisos = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/financeiro/canalContasBancarias', () => ({ avisarContaBancariaMudou: (_c: string, id: string) => { avisos.push(id); } }));

import { ContaBancariaModal, FRASE_SEM_EXTRATO, FRASE_SEM_SENHA, FRASE_AVISO_SALDO } from './ContaBancariaModal';
import type { ContaBancariaCadastro } from '@/lib/financeiro/contasBancarias';

const CONTA: ContaBancariaCadastro = {
  id: 'c1', cliente_id: 'cli', nome_conta: 'Itaú Personalite', nome_exibicao: null, codigo_conta: '01', tipo_conta: 'cc', fazenda_id: 'f1',
  ativa: true, banco: 'Itaú', agencia: '5596', numero_conta: '03722', conta_digito: '5', mes_inicio: '2024-01', saldo_inicial_oficial: 0,
  gerente_nome: 'Gerente', sem_extrato_bancario: false,
};
const BANCOS = [{ codigo_banco: '341', nome_banco: 'Itaú Unibanco', nome_curto: 'Itaú' }];
const FAZ = [{ id: 'f1', nome: 'Administrativo' }];
const salvos = () => rpc.mock.calls.filter(c => c[0] === 'fn_conta_bancaria_salvar').map(c => c[1]);

function montar(conta: ContaBancariaCadastro | null, aba?: 'dados' | 'gerente' | 'saldo' | 'importacao') {
  const onSalvo = vi.fn(); const onFechar = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ContaBancariaModal aberto onFechar={onFechar} clienteId="cli" clienteNome="Cliente" conta={conta} contas={conta ? [conta] : []}
      bancos={BANCOS} fazendas={FAZ} abaInicial={aba} onSalvo={onSalvo} />
  </QueryClientProvider>);
  return { onSalvo, onFechar };
}

beforeEach(() => {
  rpc.mockReset(); avisos.length = 0;
  rpc.mockImplementation(async (fn: string) => (fn === 'fn_conta_bancaria_salvar' ? { data: { id: 'c1', semente: null }, error: null } : { data: null, error: null }));
});

describe('CAD-CONTAS-BANCARIAS-01 — o modal', () => {
  it('M1 sem mexer nada vai ao banco; mexer manda so o que mudou', async () => {
    const { onSalvo } = montar(CONTA, 'gerente');
    expect(screen.getByTestId('subtitulo-conta')).toHaveTextContent('Itaú Personalite · 341 Itaú · ag. 5596 · c/c 03722-5');
    expect(screen.getByTestId('salvar-conta')).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Gerente'), { target: { value: 'Mariana' } });
    fireEvent.click(screen.getByTestId('salvar-conta'));
    await waitFor(() => expect(salvos()).toHaveLength(1));
    expect(salvos()[0]).toEqual({ p_cliente_id: 'cli', p_conta_id: 'c1', p_dados: { gerente_nome: 'Mariana' } });
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(['c1']));
  });

  it('M2 "Sem extrato" grava a marca e avisa a Conciliacao', async () => {
    montar(CONTA, 'importacao');
    fireEvent.click(screen.getByRole('button', { name: 'Sem extrato' }));
    expect(screen.getByText(FRASE_SEM_EXTRATO)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('salvar-conta'));
    await waitFor(() => expect(salvos()).toHaveLength(1));
    expect(salvos()[0].p_dados).toEqual({ sem_extrato_bancario: true });
    await waitFor(() => expect(avisos).toEqual(['c1']));
  });

  it('M3 nenhum campo de senha; a frase do internet banking', () => {
    montar(CONTA, 'gerente');
    expect(screen.getByTestId('frase-sem-senha')).toHaveTextContent(FRASE_SEM_SENHA);
    for (const aba of ['dados', 'gerente', 'saldo', 'importacao']) {
      fireEvent.click(screen.getByTestId(`aba-conta-${aba}`));
      expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
      expect(screen.queryByText(/senha/i) === null || aba === 'gerente').toBe(true);
    }
  });

  it('M4 nova conta: saldo obrigatorio e a conta inteira', async () => {
    montar(null);
    expect(screen.getByTestId('aba-conta-saldo')).toHaveTextContent('obrigatório');
    expect(screen.getByTestId('salvar-conta')).toHaveTextContent('Criar');
    fireEvent.change(screen.getByTestId('campo-nome-conta'), { target: { value: 'Conta Nova' } });
    expect(screen.getByTestId('salvar-conta')).toBeDisabled();
    fireEvent.click(screen.getByTestId('aba-conta-saldo'));
    const data = screen.getByTestId('campo-saldo-em') as HTMLInputElement;
    fireEvent.change(data, { target: { value: '15/01/2026' } });
    fireEvent.blur(data);
    const valor = screen.getByPlaceholderText('0,00');
    fireEvent.change(valor, { target: { value: '1.000,50' } });
    fireEvent.blur(valor);
    await waitFor(() => expect(screen.getByTestId('salvar-conta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('salvar-conta'));
    await waitFor(() => expect(salvos()).toHaveLength(1));
    expect(salvos()[0]).toEqual({ p_cliente_id: 'cli', p_conta_id: null, p_dados: { nome_conta: 'Conta Nova', ativa: true, fazenda_id: 'f1',
      tipo_conta: 'cc', mes_inicio: '2026-01', saldo_inicial_oficial: 1000.5, sem_extrato_bancario: false } });
  });

  it('M5 mudar o saldo inicial: aviso e o saldo vai ao escritor', async () => {
    montar(CONTA, 'saldo');
    expect(screen.getByTestId('aviso-saldo-inicial')).toHaveTextContent(FRASE_AVISO_SALDO);
    /* P59 — a frase diz o que acontece: só o mês seguinte parte do saldo inicial */
    expect(FRASE_AVISO_SALDO).toBe('Mudar o saldo ou a data muda o ponto de partida da Conciliação (o mês seguinte começa daqui). A alteração fica na Auditoria com quem fez e quando.');
    const valor = screen.getByDisplayValue('0,00');
    fireEvent.change(valor, { target: { value: '48.210,37' } });
    fireEvent.blur(valor);
    await waitFor(() => expect(screen.getByTestId('salvar-conta')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('salvar-conta'));
    await waitFor(() => expect(salvos()).toHaveLength(1));
    expect(salvos()[0].p_dados).toEqual({ saldo_inicial_oficial: 48210.37 });
  });

  /* P58 — "Efeito na Conciliação" numa ida: UM pedido (`fn_conta_bancaria_efeito_conciliacao`), nunca o status do ano por ano */
  it('P58 a aba Saldo inicial lê o efeito numa ida só: meses, o último saldo conferido e o saldo dele', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'fn_conta_bancaria_efeito_conciliacao'
      ? { data: { meses: 30, ultimo: '2026-09', saldo_data: '2026-09-30', saldo_final: 1234.56 }, error: null } : { data: null, error: null }));
    montar(CONTA, 'saldo');
    await waitFor(() => expect(screen.getByTestId('meses-conciliados')).toHaveTextContent('30'));
    expect(screen.getByTestId('bloco-efeito-conciliacao')).toHaveTextContent('30/09/2026');
    expect(screen.getByTestId('bloco-efeito-conciliacao')).toHaveTextContent('R$ 1.234,56');
    expect(rpc.mock.calls.filter(c => c[0] === 'fn_conta_bancaria_efeito_conciliacao')).toEqual([['fn_conta_bancaria_efeito_conciliacao', { p_conta_id: 'c1' }]]);
    expect(rpc.mock.calls.some(c => c[0] === 'fn_conciliacao_status_ano')).toBe(false);
  });

  /* CARTAO-LANCAMENTO-01 (mock v2, Gabriel 30/10 18:28/18:36) — no cartão, Fechamento e Vencimento digitados no lugar de Agência e Conta;
     o vencimento vazio mostra o dia das faturas como SUGESTÃO (nada gravado até o operador usar ou digitar); a frase da fatura embaixo */
  it('M6 cartão: os dois dias no lugar de Agência e Conta; a sugestão das faturas só vai ao banco quando o operador usa', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_cartao_dias_de_vencimento') return { data: [{ dia: 10, lancamentos: 9, ultimo: '2026-10-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-09-13' }], error: null };
      if (fn === 'fn_conta_bancaria_salvar') return { data: { id: 'c1', semente: null }, error: null };
      return { data: null, error: null };
    });
    montar({ ...CONTA, tipo_conta: 'cartao', dia_fechamento: 3, dia_vencimento: null }, 'dados');
    expect(screen.queryByText('Agência')).not.toBeInTheDocument();
    expect(screen.getByTestId('campo-dia-fechamento')).toHaveValue('3');
    expect(screen.getByTestId('campo-dia-vencimento')).toHaveValue('');
    await waitFor(() => expect(screen.getByTestId('campo-dia-vencimento')).toHaveAttribute('placeholder', '10'));
    expect(screen.getByTestId('explicacao-da-fatura')).toHaveTextContent('fecha dia 3, vence dia 10');
    expect(screen.getByTestId('salvar-conta')).toBeDisabled();
    fireEvent.click(screen.getByTestId('usar-dia-sugerido'));
    expect(screen.getByTestId('campo-dia-vencimento')).toHaveValue('10');
    fireEvent.click(screen.getByTestId('salvar-conta'));
    await waitFor(() => expect(salvos()).toHaveLength(1));
    expect(salvos()[0].p_dados).toEqual({ dia_vencimento: 10 });
  });

  it('M7 conta corrente não tem os dias nem a frase da fatura', async () => {
    montar(CONTA, 'dados');
    expect(screen.getByText('Agência')).toBeInTheDocument();
    expect(screen.queryByTestId('campo-dia-fechamento')).not.toBeInTheDocument();
    expect(screen.queryByTestId('explicacao-da-fatura')).not.toBeInTheDocument();
  });
});

