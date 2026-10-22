/**
 * CONC-TRANSF-DUAS-PONTAS-01 — na Conferencia do BB, a transferencia Bradesco -> BB com so' a ponta do Bradesco ligada aparece SEM
 * vinculo (o status agora e' por conta, no banco) e diz qual ponta falta, com a frase pronta do banco. Com as duas pontas, nada.
 * Fixture sintetico no formato de `fn_extratos_espelhados`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EspelhadosReais } from '@/lib/conciliacao/mesaDoDia';

const fixture = vi.hoisted(() => ({ espelho: null as unknown }));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: fixture.espelho, error: null } : { data: null, error: null }),
      from: () => vazio(),
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

const ESPELHO = {
  escopo: { cliente_id: 'c', conta_id: 'k', ano_mes: '2026-06', nome_conta: 'Banco do Brasil' },
  saldos: { inicial: 0, final_oficial: null, periodo_ini: null, periodo_fim: null, extrato_ini: null, extrato_fim: null },
  ofx_completo: [
    { extrato_id: 'pix', data: '2026-06-29', historico: 'PIX RECEBIDO SINT', documento: null, valor: 50000, status: 'sem_vinculo', flag_dup: false, flag_investimento: false },
  ],
  sistema_completo: [
    { lancamento_id: 'tr', data: '2026-06-29', descricao: 'Transf SINT 29/06', centro: null, subcentro: null, valor_assinado: 50000, sinal: '-1',
      status: 'sem_vinculo', pontas: { origem: true, destino: false, frase: 'conciliado no Banco Bradesco · falta o Banco do Brasil' } },
    { lancamento_id: 'tr2', data: '2026-06-29', descricao: 'Transf SINT duas', centro: null, subcentro: null, valor_assinado: 1000, sinal: '-1',
      status: 'conciliado', pontas: { origem: true, destino: true, frase: 'conciliado nas duas pontas' } },
  ],
  vinculos: [],
  versao: 't', gerado_em: 't',
} as unknown as EspelhadosReais;

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

async function abrir() {
  fixture.espelho = ESPELHO;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId="c" contaId="k" ano="2026" mes="08" />
    </QueryClientProvider>,
  );
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(screen.getByRole('button', { name: 'Conferência' }));
  return screen.findByTestId('modal-conferencia');
}
describe('CONC-TRANSF-DUAS-PONTAS-01 — a frase das pontas na Conferência', () => {
  it('uma ponta só: "conciliado no Banco Bradesco · falta o Banco do Brasil"; duas pontas: sem frase', async () => {
    const modal = await abrir();
    const frases = within(modal).getAllByTestId('pontas-transferencia');
    expect(frases).toHaveLength(1);
    expect(frases[0].textContent).toBe(' · conciliado no Banco Bradesco · falta o Banco do Brasil');
  });
});
