/**
 * CONC-SPLIT-FILHO-CANCELADO-01 passo 1 — a linha do extrato PARCIAL na Conferência.
 *
 * O caso (Santa Rita, BB, 10/08/2026): um extrato de −13.760,35 desmembrado em três; um filho (10.219,33) foi cancelado e o
 * gatilho desfez o vínculo dele. Sobram dois vínculos vivos somando 3.541,02 — e a linha continuava com ✓ e "Conciliado".
 * `montarMesa` já entregava a diferença da linha; quem afirmava "casado" era o desenho.
 *
 * ⚠ O fixture é sintético (o formato de `fn_extratos_espelhados`), com os números do caso; o filho cancelado NÃO chega
 *   (a RPC só devolve vínculo vivo e lançamento vivo). A segunda linha é um extrato FECHADO: tem de continuar com ✓.
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

import { EspelhoConciliacaoTab, faltaDoExtrato, MOTIVO_EXTRATO_PARCIAL } from './EspelhoConciliacaoTab';

const sis = (id: string, valor: number) => ({
  lancamento_id: id, data: '2026-08-10', descricao: `SINT ${id}`, centro: null, subcentro: null, valor_assinado: valor, sinal: '-1', status: 'conciliado',
});
const ESPELHO = {
  escopo: { cliente_id: 'c', conta_id: 'k', ano_mes: '2026-08', nome_conta: 'Banco' },
  saldos: { inicial: 0, final_oficial: null, periodo_ini: null, periodo_fim: null, extrato_ini: null, extrato_fim: null },
  ofx_completo: [
    { extrato_id: 'parcial', data: '2026-08-10', historico: 'Pix - Enviado SINT', documento: null, valor: -13760.35, status: 'parcial', flag_dup: false, flag_investimento: false },
    { extrato_id: 'fechado', data: '2026-08-10', historico: 'Boleto SINT', documento: null, valor: -100, status: 'conciliado', flag_dup: false, flag_investimento: false },
  ],
  sistema_completo: [sis('f1', -250), sis('f2', -3291.02), sis('g1', -60), sis('g2', -40)],
  vinculos: [
    { extrato_id: 'parcial', lancamento_id: 'f1', valor_aplicado: 250, tipo_aprovacao: 'manual', grupo_id: null },
    { extrato_id: 'parcial', lancamento_id: 'f2', valor_aplicado: 3291.02, tipo_aprovacao: 'manual', grupo_id: null },
    { extrato_id: 'fechado', lancamento_id: 'g1', valor_aplicado: 60, tipo_aprovacao: 'manual', grupo_id: null },
    { extrato_id: 'fechado', lancamento_id: 'g2', valor_aplicado: 40, tipo_aprovacao: 'manual', grupo_id: null },
  ],
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
const linhaDe = (modal: HTMLElement, historico: string) => within(modal).getByText(historico).closest('tr') as HTMLElement;

describe('faltaDoExtrato — só o que FALTA é parcial', () => {
  it('diferença positiva acima de um centavo = a falta; zero, um centavo e soma MAIOR que o banco = nulo', () => {
    expect(faltaDoExtrato(10219.33)).toBe(10219.33);
    expect(faltaDoExtrato(0)).toBeNull();
    expect(faltaDoExtrato(0.01)).toBe(0.01);      // CONC-CRIAR-CENTAVO-01: um centavo é falta de verdade
    expect(faltaDoExtrato(0.004)).toBeNull();     // abaixo de meio centavo é arredondamento
    expect(faltaDoExtrato(-360)).toBeNull();
  });
});

describe('a linha do extrato na Conferência', () => {
  it('extrato PARCIAL (dois vínculos vivos, o filho cancelado fora): "!", "Parcial" e "falta 10.219,33" escritos', async () => {
    const modal = await abrir();
    const tr = linhaDe(modal, 'Pix · Enviado SINT');
    expect(within(tr).getByTestId('sinal-do-extrato').textContent).toBe('!');
    expect(tr.querySelector('[data-status]')?.getAttribute('data-status')).toBe('parcial');
    expect(tr.querySelector('[data-status]')?.textContent).toBe('Parcial');
    expect(within(tr).getByTestId('falta-do-extrato').textContent?.replace(/\s/g, ' ')).toBe('falta 10.219,33');   // a tabela não escreve "R$" (está no cabeçalho); o title diz por extenso
    expect(within(tr).getByTestId('falta-do-extrato').closest('td')?.getAttribute('title')).toContain('falta R$ 10.219,33: os lançamentos somam menos que o extrato');
    expect(tr.hasAttribute('data-conciliada')).toBe(false);
    expect(tr.hasAttribute('data-extrato-parcial')).toBe(true);
    expect(tr.textContent).not.toContain('Conciliado');
  });

  it('extrato FECHADO (os vínculos somam o banco): ✓, sem selo e sem a falta', async () => {
    const modal = await abrir();
    const tr = linhaDe(modal, 'Boleto SINT');
    expect(within(tr).getByTestId('sinal-do-extrato').textContent).toBe('✓');
    /* P159a: o casado não leva selo (o ✓ do meio diz); selo só no que NÃO está conciliado */
    expect(tr.querySelector('[data-status]')).toBeNull();
    expect(within(tr).queryByTestId('falta-do-extrato')).toBeNull();
    expect(tr.hasAttribute('data-conciliada')).toBe(true);
  });

  it('o chip "Sem par" mantém o parcial e tira o fechado', async () => {
    const modal = await abrir();
    fireEvent.click(screen.getByTestId('chip-sem_par'));
    expect(within(modal).queryByText('Pix · Enviado SINT')).not.toBeNull();
    expect(within(modal).queryByText('Boleto SINT')).toBeNull();
  });

  it('o motivo do "Desconciliar" apagado, no parcial, não manda a um caminho que não existe', () => {
    expect(MOTIVO_EXTRATO_PARCIAL).toBe('extrato parcial — desfaça o desmembramento na Mesa (em breve aqui)');
  });
});
