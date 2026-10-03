/**
 * PR-CONC-SALDO-UMA-REGUA-02 — o quadro do topo e a aba Sistema do "Casar lançamentos" desenham o DONO.
 *
 * ⚠ O CASO É O EMERSON (NJ Sicredi Lavoura, set/26), do fixture real (`resumoMes.fixture.json`, 01c): a valor cheio o
 *   quadro dizia −1.344,59 nas saídas e −1.217,01 nas entradas, e a aba Sistema terminava em 158.533,89 — o programado
 *   parcial de −2.561,60 contado inteiro — com a Conferência conferindo todos os dias. Pelo dono: 0 nos dois lados, o
 *   retido 1.217,01 (15) na linha própria e a lista terminando em 155.972,29 com "parcial · falta R$ 300,00".
 * ⚠ MUTAÇÃO (no relatório): devolver à aba Sistema o `sistema_completo` com o saldo somado na tela derruba o T1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = vi.hoisted(() => ({ espelho: null as unknown, resumo: null as unknown }));

vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => {
        if (fn === 'fn_conciliacao_resumo_mes') return Promise.resolve({ data: fixture.resumo, error: null });
        return Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: fixture.espelho, error: null } : { data: null, error: null });
      },
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
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => FIN }));
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

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const CASO = FIX.nj_sicredi_lavoura_2026_09;
const CONTA = CASO.conta as string;

beforeEach(() => {
  fixture.espelho = { ...CASO.esp, escopo: { cliente_id: CASO.cliente, conta_id: CONTA, ano_mes: '2026-09', nome_conta: 'Sicredi Lavoura' } };
  fixture.resumo = [{ ...CASO.resumo, nivel: 'conta', conta_id: CONTA, conta_nome: 'Sicredi Lavoura', tem_extrato: true,
    extratos_sem_par: { qtde: 0, valor: 0 }, lancamentos_sem_par: { qtde: 0, valor: 0 } }];
});

function montar(props: Partial<React.ComponentProps<typeof EspelhoConciliacaoTab>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId={CASO.cliente} contaId={CONTA} ano="2026" mes="09" {...props} />
    </QueryClientProvider>,
  );
}
const txt = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s/g, ' ');

describe('T1 — o Emerson no Casar: o quadro do topo e a aba Sistema são do dono', () => {
  it('quadro do topo: 0 nos dois lados, o retido na linha própria, sem par 0', async () => {
    montar();
    await waitFor(() => expect(txt('topo-dif-saidas')).toBe('0,00'));
    expect(txt('topo-dif-entradas')).toBe('0,00');
    expect(txt('topo-retido')).toBe('retido no depósito R$ 1.217,01 (15)');
    expect(screen.getByTestId('topo-retido').getAttribute('title')).toContain('15 retenções');
    expect(txt('topo-sem-par-extratos-qtde')).toBe('0');
    expect(txt('topo-sem-par-lancamentos-qtde')).toBe('0');
  });

  it('aba Sistema: começa no saldo inicial do dono, termina em 155.972,29 e o parcial diz "falta R$ 300,00"', async () => {
    montar({ aba: 'sistema', onAbaChange: () => {} });
    const fim = await screen.findByTestId('sistema-saldo-final');
    expect(fim.textContent).toBe('155.972,29');
    expect(txt('sistema-saldo-inicial')).toBe('30.150,70');
    const saldos = screen.getAllByTestId('sistema-saldo').map((s) => s.textContent);
    expect(saldos[saldos.length - 1]).toBe('155.972,29');
    expect(saldos.length).toBe(CASO.resumo.linhas_sistema.length);
    expect(screen.getByText(/^parcial · falta R\$\s300,00$/)).toBeInTheDocument();
  });
});

describe('T6 (PR-CONC-INTERNA-SEPARADA-01b) — a aba Sistema da conta-MÃE: saldo corrido próprio e as transferências internas', () => {
  const AG = FIX.agnaldo_bradesco_2026_08;
  beforeEach(() => {
    fixture.espelho = { ...AG.esp, escopo: { cliente_id: AG.cliente, conta_id: AG.conta, ano_mes: '2026-08', nome_conta: 'Bradesco' } };
    fixture.resumo = [{ ...AG.resumo, nivel: 'conta', conta_id: AG.conta, conta_nome: 'Bradesco', tem_extrato: true,
      extratos_sem_par: { qtde: 0, valor: 0 }, lancamentos_sem_par: { qtde: 0, valor: 0 } }];
  });
  const montarMae = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <EspelhoConciliacaoTab clienteId={AG.cliente} contaId={AG.conta} ano="2026" mes="08" aba="sistema" onAbaChange={() => {}} />
      </QueryClientProvider>,
    );
  };

  it('começa no saldo inicial PRÓPRIO (1,00, não os 238.791,26 do par), mostra as 18 internas e fecha em proprio.saldo_sistema', async () => {
    montarMae();
    const fim = await screen.findByTestId('sistema-saldo-final');
    expect(fim.textContent).toBe('54.738,55');
    expect(txt('sistema-saldo-inicial')).toBe('1,00');
    const linhas = screen.getAllByTestId('sistema-linha');
    expect(linhas.length).toBe(AG.resumo.linhas_sistema.length);
    expect(linhas.length).toBe(134);
    const internas = screen.getAllByTestId('sistema-transferencia-interna');
    expect(internas.length).toBe(18);
    expect(internas[0].textContent).toBe('⇄ interna · fora do extrato');
    expect(internas[0].getAttribute('title')).toContain('transferência interna · fora do extrato');
    /* a coluna de saldo é o `saldo_apos_proprio` de CADA linha, na ordem do dono */
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const saldos = screen.getAllByTestId('sistema-saldo').map((s) => s.textContent);
    expect(saldos).toEqual(AG.resumo.linhas_sistema.map((l: { saldo_apos_proprio: number }) => fmt(l.saldo_apos_proprio)));
    expect(saldos[saldos.length - 1]).toBe('54.738,55');
    /* e NÃO o corrido consolidado: a primeira linha difere (238.757,65 no consolidado) */
    expect(saldos[0]).not.toBe(fmt(AG.resumo.linhas_sistema[0].saldo_apos));
  });

  it('conta SEM par (o Emerson): a coluna de saldo é a de antes — o próprio é igual ao corrido', async () => {
    fixture.espelho = { ...CASO.esp, escopo: { cliente_id: CASO.cliente, conta_id: CONTA, ano_mes: '2026-09', nome_conta: 'Sicredi Lavoura' } };
    fixture.resumo = [{ ...CASO.resumo, nivel: 'conta', conta_id: CONTA, conta_nome: 'Sicredi Lavoura', tem_extrato: true }];
    montar({ aba: 'sistema', onAbaChange: () => {} });
    await screen.findByTestId('sistema-saldo-final');
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(screen.getAllByTestId('sistema-saldo').map((s) => s.textContent))
      .toEqual(CASO.resumo.linhas_sistema.map((l: { saldo_apos: number }) => fmt(l.saldo_apos)));
    expect(screen.queryByTestId('sistema-transferencia-interna')).toBeNull();
  });
});

describe('o link "N dias com diferença" abre a Conferência no dia', () => {
  it('a mesa rola até o cabeçalho do dia pedido e avisa quem pediu', async () => {
    const rolados: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { rolados.push(this.getAttribute('data-dia') ?? ''); };
    const focado = vi.fn();
    montar({ aba: 'conferencia', onAbaChange: () => {}, diaFoco: '2026-09-02', onDiaFocado: focado });
    await waitFor(() => expect(focado).toHaveBeenCalled());
    expect(rolados).toContain('2026-09-02');
  });

  it('sem pedido, não rola nem avisa', async () => {
    const focado = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    montar({ aba: 'conferencia', onAbaChange: () => {}, onDiaFocado: focado });
    await screen.findByTestId('modal-conferencia');
    fireEvent.click(screen.getByLabelText('Só não conciliados'));
    expect(focado).not.toHaveBeenCalled();
  });
});
