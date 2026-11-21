/**
 * BAIXA-DESCONTO-BANCO-01 (115580) — na Conferência, a parte da NF paga com desconto é só uma SUB-LINHA cinza da NF casada:
 * "↳ desconto X · não sai do banco", a coluna de valor vazia, sem status e sem "!", e o fechamento do dia NÃO muda (não é movimento
 * de conta). Sobre o retorno real da RPC (`mesaDoDia.fixture.json`, NJ Itaú BBA set/26: o 1:1 de 01/09, −40.518,54), com a parte
 * sintética que o banco devolveria para aquela NF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EspelhadosReais } from '@/lib/conciliacao/mesaDoDia';
import { descontoPorNf } from '@/lib/conciliacao/parteDoDesconto';

const NF = '618ddd34-9a6c-4cda-b58b-1c5b63c53bdc';
const B = vi.hoisted(() => ({ espelho: null as unknown, partes: [] as { saldo_de_id: string; valor: number }[], pedidos: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const filtros: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.eq = (c: string, v: unknown) => { filtros.push(`${c}=${String(v)}`); return b; };
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => {
      const daParte = tabela === 'financeiro_lancamentos_v2' && filtros.includes('origem_tipo=conc:desconto_parte');
      if (daParte) B.pedidos.push(filtros.join('&'));
      return Promise.resolve({ data: daParte ? B.partes : [], error: null }).then(ok);
    };
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: B.espelho, error: null } : { data: null, error: null }),
      from: (t: string) => consulta(t),
    },
  };
});
const FIN = vi.hoisted(() => {
  const noop = async () => undefined;
  return {
    loadContas: noop, loadClassificacoes: noop, loadFornecedores: noop, loadSafras: noop,
    contasBancarias: [], fornecedores: [], safras: [], classificacoes: [],
    buscarLancamentoPorId: async () => null, criarFornecedor: noop, editarLancamento: noop, criarLancamento: noop, excluirLancamento: noop,
  };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => FIN, inscreverEmLancamentos: () => () => {}, notificarLancamentosMudaram: () => {},
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
const INTERNAS = vi.hoisted(() => ({
  contasInternas: new Set<string>(), lancamentosInternos: new Set<string>(),
  saldoInicialConsolidado: null, saldoInformadoConsolidado: null,
}));
vi.mock('@/hooks/useEspelhoInternas', () => ({ useEspelhoInternas: () => INTERNAS }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({ LancamentoV2Dialog: () => null }));
vi.mock('@/components/financeiro-v2/DecisaoDerivadosDialog', () => ({ DecisaoDerivadosDialog: () => null }));
vi.mock('@/components/financeiro-v2/CasarComBancoModal', () => ({
  CasarComBancoModal: () => null, CasarN1Modal: () => null, CasarBlocoModal: () => null,
  fraseDaRecusa: (m: string) => m,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EspelhoConciliacaoTab } from './EspelhoConciliacaoTab';

const FIX: Record<string, { esp: EspelhadosReais }> = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/mesaDoDia.fixture.json'), 'utf8'));

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; B.pedidos = []; });

async function abrir(partes: { saldo_de_id: string; valor: number }[]) {
  B.espelho = FIX.nj_itau_bba_2026_09.esp;
  B.partes = partes;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId="c" contaId="k" ano="2026" mes="09" />
    </QueryClientProvider>,
  );
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(screen.getByRole('button', { name: 'Conferência' }));
  return screen.findByTestId('modal-conferencia');
}
const fechamento = (modal: HTMLElement, ddmm: string) =>
  [...modal.querySelectorAll('tr[data-fechamento]')].find((r) => r.textContent?.startsWith(`Fechamento ${ddmm}`))?.textContent ?? 'sem linha';

describe('BAIXA-DESCONTO-BANCO-01 — o desconto da NF na Conferência', () => {
  it('a NF casada ganha a sub-linha cinza "↳ desconto 1.013,35 · não sai do banco": valor vazio, sem status e sem "!"', async () => {
    const modal = await abrir([{ saldo_de_id: NF, valor: 1013.35 }]);
    const sub = await screen.findByTestId('desconto-da-nf');
    expect(sub.textContent).toBe('desconto 1.013,35 · não sai do banco');
    const tr = sub.closest('tr');
    expect(tr?.hasAttribute('data-desconto-da-nf')).toBe(true);
    /* logo abaixo da linha do extrato casado com a NF */
    expect(tr?.previousElementSibling?.hasAttribute('data-conciliada')).toBe(true);
    const tds = [...(tr?.querySelectorAll('td') ?? [])];
    expect(tds[2].textContent).toBe('↳');
    expect(tds[3].textContent).toBe('');
    expect(tr?.textContent).not.toMatch(/!|Realizado/);
    expect(modal.querySelectorAll('tr[data-desconto-da-nf]').length).toBe(1);
    /* a leitura é pelos ids dos vinculados, só as partes vivas */
    expect(B.pedidos.some((p) => p.includes('cancelado=false'))).toBe(true);
  });

  it('o fechamento do dia é o mesmo com e sem o desconto: ele não é movimento de conta', async () => {
    const semDesconto = fechamento(await abrir([]), '01/09');
    expect(screen.queryByTestId('desconto-da-nf')).toBeNull();
    cleanup();
    const modal = await abrir([{ saldo_de_id: NF, valor: 1013.35 }]);
    await screen.findByTestId('desconto-da-nf');
    expect(fechamento(modal, '01/09')).toBe(semDesconto);
    expect(semDesconto).not.toBe('sem linha');
  });
});

describe('descontoPorNf', () => {
  it('soma as partes por NF em magnitude, 2 casas; ignora sem NF, zero e lixo', () => {
    const m = descontoPorNf([
      { saldo_de_id: 'a', valor: 1000.1 }, { saldo_de_id: 'a', valor: '13.25' }, { saldo_de_id: 'b', valor: -50 },
      { saldo_de_id: null, valor: 9 }, { saldo_de_id: 'c', valor: 0 }, { saldo_de_id: 'd', valor: 'x' },
    ]);
    expect([...m.entries()]).toEqual([['a', 1013.35], ['b', 50]]);
  });
});
