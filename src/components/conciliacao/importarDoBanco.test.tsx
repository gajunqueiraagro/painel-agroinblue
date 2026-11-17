/**
 * OPENFINANCE-P3b — o "Buscar do banco" no Importar banco, ponta a ponta na tela: a fonte do banco (fixture sintética) entra na MESMA
 * prévia do arquivo (hook real) com a frase do corte, e o "Importar N" grava pela MESMA porta (`fn_extrato_importar_arquivo`) com o
 * nome do lote "Open Finance · dd/mm/aaaa" e o tipo OPEN_FINANCE. O banco é falso; a Pluggy não existe aqui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const banco = vi.hoisted(() => ({ chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }> }));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in', 'or', 'range', 'limit', 'neq', 'filter', 'match']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(),
      rpc: (fn: string, args: Record<string, unknown>) => {
        banco.chamadas.push({ fn, args });
        return Promise.resolve(fn === 'fn_extrato_importar_arquivo'
          ? { data: { ok: true, importacao_id: 'imp-1', inseridos: 2, pulados: [], ids: [] }, error: null }
          : { data: [], error: null });
      },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cliente-teste' }, isAdmin: true }) }));
vi.mock('@/v2/pages/V2ImportLancamentosExcel', () => ({ V2ImportLancamentosExcel: () => null }));
vi.mock('@/v2/pages/CusteioTxtImportTab', () => ({ default: () => null }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/* o botão real fala com a borda; aqui ele entrega direto a fonte que a borda montaria (a regra da borda está no pluggyExtrato.test) */
vi.mock('./BuscarDoBanco', async () => {
  const { fonteDaBusca, lerBuscaDoBanco, nomeDaBusca, fraseDoCorte } = await import('@/lib/openfinance/extratoDoBanco');
  const tx = (id: string, date: string, amount: number) =>
    ({ id, accountId: 'acc', description: `PIX ${id}`, amount, date, status: 'POSTED', type: amount < 0 ? 'DEBIT' : 'CREDIT', providerId: `p-${id}`, currencyCode: 'BRL' });
  const b = lerBuscaDoBanco({
    acao: 'buscar', de: '2026-11-14', ate: '2026-11-16', hoje: '2026-11-16', corte: '2026-11-14', ultimoDia: '2026-11-13',
    conta: { id: 'acc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 500, currencyCode: 'BRL', saldoEm: null },
    transacoes: [tx('a', '2026-11-14T15:00:00Z', -10), tx('b', '2026-11-15T15:00:00Z', 20)], saldoGravado: true,
  });
  return {
    BuscarDoBanco: ({ aoFonte }: { aoFonte: (f: unknown, n: string, c: string) => Promise<void> }) => (
      <button type="button" data-testid="openfinance-buscar-do-banco" onClick={() => {
        if (!b) return; const f = fonteDaBusca(b); if (f.ok) void aoFonte(f.fonte, nomeDaBusca(b.hoje), fraseDoCorte(b));
      }}>Buscar do banco</button>
    ),
  };
});

import { ImportarBancoInline } from './ImportarBancoInline';

beforeEach(() => { banco.chamadas = []; Element.prototype.scrollIntoView = () => {}; });

describe('Importar banco › Buscar do banco', () => {
  it('a MESMA prévia, com o corte; grava pela mesma porta com o nome do lote e o tipo OPEN_FINANCE', async () => {
    render(<ImportarBancoInline contas={[{ id: 'itau', label: 'Itaú Personalite', tipo_conta: 'cc' }]} contaId="itau" onContaChange={() => {}} />);
    fireEvent.click(screen.getByTestId('openfinance-buscar-do-banco'));
    expect((await screen.findByTestId('openfinance-corte')).textContent).toBe('Corte: 14/11/2026 (o extrato no sistema vai até 13/11/2026; o antes não entra).');
    expect(screen.getByText('Open Finance · 16/11/2026')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /^Importar 2/ }));
    await waitFor(() => expect(banco.chamadas.some((c) => c.fn === 'fn_extrato_importar_arquivo')).toBe(true));
    const args = banco.chamadas.find((c) => c.fn === 'fn_extrato_importar_arquivo')?.args ?? {};
    expect(args).toMatchObject({ p_conta_bancaria_id: 'itau', p_nome_arquivo: 'Open Finance · 16/11/2026', p_tipo_arquivo: 'OPEN_FINANCE', p_saldo_declarado: 500 });
    expect(Array.isArray(args.p_movimentos) ? args.p_movimentos.length : 0).toBe(2);
  });
});
