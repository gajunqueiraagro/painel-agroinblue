/**
 * OPENFINANCE-P3b — as telas do extrato pelo Open Finance com o banco e a Pluggy FALSOS (fixture sintética; nenhuma chamada real):
 * "Buscar do banco" só para o admin e só na conta ligada, e entrega a MESMA fonte da prévia com a frase do corte; "Conferir com o
 * banco" é só leitura; o saldo do banco no Resumo avisa (âmbar) quando diverge; "Lança na conta" sugere pelo final e só grava depois
 * da prévia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn();
let tabelas: Record<string, unknown[]> = {};
const filtros: Array<{ tabela: string; metodo: string; args: unknown[] }> = [];
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'order', 'limit', 'in', 'or']) {
      b[m] = (...args: unknown[]) => { filtros.push({ tabela, metodo: m, args }); return b; };
    }
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: tabelas[tabela] ?? [], error: null }).then(ok);
    return b;
  };
  return { supabase: { from: (t: string) => consulta(t), functions: { invoke: (...a: unknown[]) => invoke(...a) } } };
});
let admin = true;
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: admin, clienteAtual: { id: 'cliente-teste' } }) }));
const toastErro = vi.fn(); const toastOk = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastOk(...a) } }));

import { BuscarDoBanco } from './BuscarDoBanco';
import { SaldoDoBanco } from './SaldoDoBanco';
import { LigarContaDoSistema } from '@/components/financeiro-v2/LigarContaDoSistema';

const CONTA = '131b8501-caf7-4964-b1b1-3f552ad2b75d';
const tx = (id: string, date: string, amount: number) =>
  ({ id, accountId: 'acc', description: `MOV ${id}`, amount, date, status: 'POSTED', type: amount < 0 ? 'DEBIT' : 'CREDIT', providerId: `p-${id}`, currencyCode: 'BRL' });
const respostaDaBorda = (extra: Record<string, unknown> = {}) => ({
  data: {
    ok: true, acao: 'buscar', de: '2026-11-14', ate: '2026-11-16', hoje: '2026-11-16', corte: '2026-11-14', ultimoDia: '2026-11-13',
    conta: { id: 'acc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 500, currencyCode: 'BRL', saldoEm: '2026-11-16T21:00:00.000Z' },
    transacoes: [tx('a', '2026-11-13T15:00:00Z', -5), tx('b', '2026-11-14T15:00:00Z', -10), tx('c', '2026-11-15T15:00:00Z', 20)], saldoGravado: true, ...extra,
  },
  error: null,
});

beforeEach(() => {
  invoke.mockReset(); toastErro.mockReset(); toastOk.mockReset(); filtros.length = 0; admin = true;
  tabelas = { openfinance_contas_permitidas: [{ id: 'perm-1' }] };
});

describe('Buscar do banco', () => {
  it('fora do admin, ou conta sem ligação: nada aparece', async () => {
    admin = false;
    const { unmount } = render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={vi.fn()} aoFrase={vi.fn()} />);
    expect(screen.queryByTestId('openfinance-buscar-do-banco')).toBeNull();
    unmount();
    admin = true; tabelas.openfinance_contas_permitidas = [];
    render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={vi.fn()} aoFrase={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('openfinance-buscar-do-banco')).toBeNull();
  });

  it('a ligação é perguntada por cliente + conta + viva + BANK', async () => {
    render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={vi.fn()} aoFrase={vi.fn()} />);
    await screen.findByTestId('openfinance-buscar-do-banco');
    const eqs = filtros.filter((f) => f.tabela === 'openfinance_contas_permitidas' && f.metodo === 'eq').map((f) => f.args);
    expect(eqs).toEqual(expect.arrayContaining([['cliente_id', 'cliente-teste'], ['conta_bancaria_id', CONTA], ['ativo', true], ['tipo', 'BANK']]));
  });

  it('busca → a MESMA fonte da prévia (OPEN_FINANCE, sem o antes do corte) + nome do lote + frase do corte', async () => {
    invoke.mockResolvedValue(respostaDaBorda());
    const aoFonte = vi.fn(async () => {});
    render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={aoFonte} aoFrase={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('openfinance-buscar-do-banco'));
    await waitFor(() => expect(aoFonte).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('openfinance-extrato', { body: { acao: 'buscar', cliente_id: 'cliente-teste', conta_bancaria_id: CONTA } });
    const [fonte, nome, corte] = aoFonte.mock.calls[0] as unknown as [{ formato: string; movimentos: { data: string }[] }, string, string];
    expect(fonte.formato).toBe('OPEN_FINANCE');
    expect(fonte.movimentos.map((m) => m.data)).toEqual(['2026-11-14', '2026-11-15']);
    expect(nome).toBe('Open Finance · 16/11/2026');
    expect(corte).toBe('Corte: 14/11/2026 (o extrato no sistema vai até 13/11/2026; o antes não entra).');
  });

  it('sem movimento novo: a frase na linha, sem prévia; recusa da borda: a frase dela', async () => {
    invoke.mockResolvedValueOnce(respostaDaBorda({ transacoes: [] }));
    const aoFonte = vi.fn(async () => {}); const aoFrase = vi.fn();
    render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={aoFonte} aoFrase={aoFrase} />);
    fireEvent.click(await screen.findByTestId('openfinance-buscar-do-banco'));
    await waitFor(() => expect(aoFrase).toHaveBeenCalledWith({ tipo: 'ok', texto: 'O banco não tem movimento lançado de 14/11/2026 até 16/11/2026. Nada a importar.' }));
    expect(aoFonte).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce({ data: { ok: false, frase: 'Esta conexão não é deste cliente. Nada foi lido.' }, error: null });
    fireEvent.click(screen.getByTestId('openfinance-buscar-do-banco'));
    await waitFor(() => expect(aoFrase).toHaveBeenCalledWith({ tipo: 'erro', texto: 'Esta conexão não é deste cliente. Nada foi lido.' }));
  });

  it('conferir: período do 1º do mês até a última linha; banco × sistema num diálogo; nada grava', async () => {
    tabelas.extrato_bancario_v2 = [{ data_movimento: '2026-11-13', valor: -5, descricao: 'A' }, { data_movimento: '2026-11-10', valor: 99, descricao: 'SÓ NO SISTEMA' }];
    invoke.mockResolvedValue(respostaDaBorda({ acao: 'conferir', de: '2026-11-01', ate: '2026-11-13', transacoes: [tx('a', '2026-11-13T15:00:00Z', -5), tx('x', '2026-11-12T15:00:00Z', -7)], saldoGravado: null }));
    render(<BuscarDoBanco contaId={CONTA} desabilitado={false} aoFonte={vi.fn()} aoFrase={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('openfinance-conferir-com-banco'));
    const frase = await screen.findByTestId('openfinance-conferencia-frase');
    expect(invoke).toHaveBeenCalledWith('openfinance-extrato', { body: { acao: 'conferir', cliente_id: 'cliente-teste', conta_bancaria_id: CONTA, de: '2026-11-01', ate: '2026-11-13' } });
    /* a última linha veio da mesma tabela; o mock devolve as duas linhas para as duas leituras: a 1ª (ordenada desc) é 13/11 */
    expect(frase.textContent).toMatch(/casam · 1 só no banco · 1 só no sistema\. Nada foi gravado\./);
    expect(screen.getByTestId('openfinance-so-no-sistema').textContent).toContain('SÓ NO SISTEMA');
    expect(screen.getByTestId('openfinance-so-no-banco').textContent).toContain('12/11/2026');
  });
});

describe('Saldo do banco no Resumo do mês', () => {
  it('banco × extrato do sistema no mesmo dia; diverge = âmbar com a diferença', async () => {
    tabelas = {
      openfinance_saldos: [{ saldo: 1000, saldo_em: '2026-11-16T21:00:00.000Z', lido_em: '2026-11-16T21:05:00.000Z' }],
      extrato_bancario_v2: [{ data_movimento: '2026-11-03', valor: -10 }, { data_movimento: '2026-11-16', valor: 5 }],
    };
    render(<SaldoDoBanco clienteId="cliente-teste" contaId={CONTA} anoMes="2026-11" abertura={1000} />);
    const bloco = await screen.findByTestId('resumo-saldo-do-banco');
    expect(bloco.textContent).toContain('Banco (Open Finance, 16/11/2026 18:00)');
    expect(screen.getByTestId('resumo-saldo-do-banco-diferenca').textContent).toMatch(/5,00/);
    expect(bloco.className).toContain('text-warning');
  });
  it('confere = "confere"; leitura de outro mês = "—" (nunca zero)', async () => {
    tabelas = { openfinance_saldos: [{ saldo: 995, saldo_em: '2026-11-16T21:00:00.000Z', lido_em: 'x' }], extrato_bancario_v2: [{ data_movimento: '2026-11-03', valor: -5 }] };
    const { unmount } = render(<SaldoDoBanco clienteId="cliente-teste" contaId={CONTA} anoMes="2026-11" abertura={1000} />);
    expect((await screen.findByTestId('resumo-saldo-do-banco-diferenca')).textContent).toBe('confere');
    unmount();
    render(<SaldoDoBanco clienteId="cliente-teste" contaId={CONTA} anoMes="2026-10" abertura={1000} />);
    expect((await screen.findByTestId('resumo-saldo-do-banco-diferenca')).textContent).toBe('—');
  });
  it('sem leitura do banco: nada aparece', async () => {
    tabelas = { openfinance_saldos: [] };
    render(<SaldoDoBanco clienteId="cliente-teste" contaId={CONTA} anoMes="2026-11" abertura={1000} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('resumo-saldo-do-banco')).toBeNull();
  });
});

describe('Lança na conta (Escolher contas)', () => {
  beforeEach(() => {
    tabelas = {
      openfinance_contas_permitidas: [{ id: 'perm-1', rotulo: 'Itaú · Conta corrente · 7225', final4: '7225', conta_bancaria_id: null }],
      financeiro_contas_bancarias: [
        { id: CONTA, nome_conta: 'Itaú Personalite', nome_exibicao: null, tipo_conta: 'cc', numero_conta: '3722', conta_digito: '5', ativa: true },
        { id: 'bb', nome_conta: 'Banco do Brasil', nome_exibicao: null, tipo_conta: 'cc', numero_conta: '1234', conta_digito: '0', ativa: true },
      ],
    };
  });
  it('sugere pelo final; só grava depois da prévia; grava com a conta escolhida', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, mudou: true, simulado: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, mudou: true, simulado: false }, error: null });
    render(<LigarContaDoSistema clienteId="cliente-teste" itemId="item-1" versao={0} />);
    fireEvent.click(await screen.findByTestId('openfinance-ver-ligacao'));
    await waitFor(() => expect(screen.getByTestId('openfinance-previa-ligacao').textContent).toBe('Liga Itaú · Conta corrente · 7225 em Itaú Personalite.'));
    expect(invoke).toHaveBeenLastCalledWith('openfinance-contas', { body: { acao: 'ligar', cliente_id: 'cliente-teste', permitida_id: 'perm-1', conta_bancaria_id: CONTA, simular: true } });
    fireEvent.click(screen.getByTestId('openfinance-gravar-ligacao'));
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith('openfinance-contas', { body: { acao: 'ligar', cliente_id: 'cliente-teste', permitida_id: 'perm-1', conta_bancaria_id: CONTA, simular: false } }));
    expect(toastOk).toHaveBeenCalledWith('Ligada: Itaú · Conta corrente · 7225 → Itaú Personalite.');
  });
  it('recusa da borda: a frase dela, nada gravado (a 2ª chamada não sai)', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, frase: 'Esta conta do sistema já recebe de outra conta do banco. Nada foi gravado.' }, error: null });
    render(<LigarContaDoSistema clienteId="cliente-teste" itemId="item-1" versao={0} />);
    fireEvent.click(await screen.findByTestId('openfinance-ver-ligacao'));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Esta conta do sistema já recebe de outra conta do banco. Nada foi gravado.'));
    expect(screen.queryByTestId('openfinance-gravar-ligacao')).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
