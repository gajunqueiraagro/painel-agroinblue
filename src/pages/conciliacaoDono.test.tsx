/**
 * PR-CONC-SALDO-UMA-REGUA-02 — a aba Conciliação DESENHA o dono (`fn_conciliacao_resumo_mes` e
 * `fn_conciliacao_status_ano`); não calcula, não soma linha, não escolhe conta.
 *
 * ⚠ O BANCO FALSO DEVOLVE AS LINHAS DO DONO e a tela é montada inteira (os filhos pesados são trocados por nada — o
 *   Espelho fica com um espião das props, para o link "N dias com diferença"). Lançamentos do ano: nenhum — prova de que
 *   nenhum número do Resumo, do Status ou dos Saldos vem deles.
 * T1 Emerson · T2 selo = dono · T3 motivos e o link do dia · T4 Todas · T5 Agnaldo consolidado · T6 régua neutra → pintada
 * · T7 posição · T8 fechar sem movimento grava o do dono · T9 nenhum arquivo tocado importa a conta antiga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const B = vi.hoisted(() => ({
  resumo: {} as Record<string, unknown[]>,
  statusAno: [] as unknown[],
  /** Segura a resposta do status do ano até o teste soltar (T6). */
  segurarAno: null as null | Promise<void>,
  contas: [] as unknown[],
  inserts: [] as Array<{ tabela: string; linha: Record<string, unknown> }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  espelhoProps: [] as Array<Record<string, unknown>>,
  tom: [] as Array<Record<number, unknown> | undefined>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'is', 'not', 'neq', 'order', 'in', 'limit', 'range']) b[m] = () => b;
    b.single = () => Promise.resolve({ data: { fazenda_id: 'faz' }, error: null });
    b.insert = (linha: Record<string, unknown>) => { B.inserts.push({ tabela: nome, linha }); return Promise.resolve({ error: null }); };
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: nome === 'financeiro_contas_bancarias' ? B.contas : [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        B.rpcs.push({ fn, args });
        if (fn === 'fn_conciliacao_resumo_mes') return { data: B.resumo[String(args.p_ano_mes)] ?? [], error: null };
        if (fn === 'fn_conciliacao_status_ano') { if (B.segurarAno) await B.segurarAno; return { data: B.statusAno, error: null }; }
        return { data: null, error: null };
      },
      from: (nome: string) => tabela(nome),
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ perfil: 'admin_agroinblue' }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {} }));
vi.mock('@/hooks/useConciliacaoDoMes', () => ({ useConciliacaoDoMes: () => ({ movimentos: [] }), contarBaldes: () => ({ todos: 0, conciliado: 0 }) }));
vi.mock('@/components/conciliacao/PainelExtratoMes', () => ({ PainelExtratoMes: () => null }));
vi.mock('@/components/conciliacao/AcoesDoMes', () => ({ AcoesDoMes: () => null }));
vi.mock('@/components/conciliacao/SaldoRealDialog', () => ({ SaldoRealDialog: () => null }));
vi.mock('@/components/conciliacao/ImportarBancoInline', () => ({ ImportarBancoInline: () => null }));
vi.mock('@/components/conciliacao/EnriquecerPorPlanilha', () => ({ EnriquecerPorPlanilha: () => null }));
vi.mock('@/components/financeiro-v2/ExtratoGerencialTab', () => ({ ExtratoGerencialTab: () => null }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({
  ABAS_ESPELHO: [{ key: 'conferencia', label: 'Conferência' }, { key: 'ofx', label: 'Extrato (banco)' }],
  EspelhoOfxSistemaModal: () => null,
  EspelhoConciliacaoTab: (p: Record<string, unknown>) => { B.espelhoProps.push(p); return <div data-testid="espelho" />; },
}));
vi.mock('@/v2/components/SeletorPeriodo', () => ({
  SeletorPeriodo: (p: { tomPorMes?: Record<number, unknown> }) => {
    B.tom.push(p.tomPorMes);
    return <div data-testid="regua" data-meses={Object.keys(p.tomPorMes ?? {}).join(',')} />;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ConciliacaoBancariaTab } from './ConciliacaoBancariaTab';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const EMERSON = FIX.nj_sicredi_lavoura_2026_09;
const ID_LAV = EMERSON.conta as string;

const conta = (id: string, nome: string, tipo = 'cc') =>
  ({ id, nome_conta: nome, nome_exibicao: null, tipo_conta: tipo, codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: null });
const linhaConta = (x: Record<string, unknown>) => ({
  nivel: 'conta', consolida_em_conta_id: null, tem_extrato: false, entradas: 0, saidas: 0, motivos: [],
  retido_em_depositos: { qtde: 0, valor: 0 }, extratos_sem_par: { qtde: 0, valor: 0 }, lancamentos_sem_par: { qtde: 0, valor: 0 },
  banco: { entradas: 0, saidas: 0 }, posicao: null, sem_conta: null, ...x,
});

/* NJ set/26, recortado: o Emerson conciliado (o fixture real), o Cartão BB não conciliado e uma conta parada. */
const LINHA_EMERSON = linhaConta({
  ...EMERSON.resumo, conta_id: ID_LAV, conta_nome: 'Sicredi Lavoura', tipo_conta: 'cc', tem_extrato: true,
  saldo_extrato: 155972.29, saldo_extrato_data: '2026-09-30', diferenca: 0, motivos: [], saldo_inicial_origem: 'informado',
  entradas_terceiros: 352212.94, entradas_transferencias: 820000, saidas_terceiros: -1035210.22, saidas_transferencias: -8619.53,
});
const LINHA_CARTAO = linhaConta({
  conta_id: 'cartao', conta_nome: 'Cartão BB - Visa Infinite', tipo_conta: 'cartao', status: 'nao_conciliado',
  saldo_inicial: 0, saldo_sistema: -6470.73, saldo_extrato: 0, saldo_extrato_data: '2026-09-30', diferenca: 6470.73, tem_extrato: true,
  motivos: [{ motivo: 'dias_com_diferenca', qtde: 2, dias: ['2026-09-08', '2026-09-15'] }, { motivo: 'saldo_diverge', valor: 6470.73 }],
});
const LINHA_PARADA = linhaConta({
  conta_id: 'parada', conta_nome: 'Invest Parado', tipo_conta: 'inv', status: 'pendente',
  saldo_inicial: 300000, saldo_inicial_origem: 'herdado', saldo_sistema: 300000, saldo_extrato: null, diferenca: null,
  motivos: [{ motivo: 'sem_extrato' }],
});
const TOTAL_NJ = linhaConta({
  nivel: 'total', conta_id: null, conta_nome: 'Total', status: 'nao_conciliado',
  saldo_inicial: 330150.7, saldo_sistema: 449501.56, saldo_extrato: 155972.29, diferenca: 0, entradas: 1172212.94, saidas: -1043829.75,
  motivos: [
    { motivo: 'contas_nao_conciliadas', qtde: 1, contas: [{ conta_id: 'cartao', conta_nome: 'Cartão BB - Visa Infinite', status: 'nao_conciliado', motivos: LINHA_CARTAO.motivos }] },
    { motivo: 'contas_pendentes', qtde: 1 },
    { motivo: 'lancamentos_sem_conta', qtde: 3 },
  ],
  sem_conta: { qtde: 3, entradas: 100, saidas: 869.29 },
});
const SUB = (tipo: string, x: Record<string, unknown>) => linhaConta({ nivel: 'tipo', conta_id: null, tipo_conta: tipo, ...x });

/* jsdom não tem ResizeObserver; a tela o usa para MEDIR o cabeçalho fixo (o teste não mede layout). */
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeEach(() => {
  B.contas = [conta(ID_LAV, 'Sicredi Lavoura'), conta('cartao', 'Cartão BB - Visa Infinite', 'cartao'), conta('parada', 'Invest Parado', 'inv')];
  B.resumo = {
    '2026-09': [LINHA_EMERSON, LINHA_PARADA, LINHA_CARTAO,
      SUB('cc', { conta_nome: 'Conta corrente', status: 'conciliado', saldo_sistema: 155972.29, saldo_extrato: 155972.29, diferenca: 0 }),
      SUB('inv', { conta_nome: 'Investimentos', status: 'pendente', saldo_sistema: 300000, saldo_extrato: null, diferenca: null }),
      SUB('cartao', { conta_nome: 'Cartão', status: 'nao_conciliado', saldo_sistema: -6470.73, saldo_extrato: 0, diferenca: 6470.73 }),
      TOTAL_NJ],
  };
  B.statusAno = [
    { ano_mes: '2026-08', nivel: 'total', status: 'conciliado', motivos: [] },
    { ano_mes: '2026-09', nivel: 'total', status: 'nao_conciliado', motivos: [] },
  ];
  B.segurarAno = null;
  B.inserts = []; B.rpcs = []; B.espelhoProps = []; B.tom = [];
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConciliacaoBancariaTab initialAno="2026" initialMes="09" />
    </QueryClientProvider>,
  );
}
const n = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');
const linhaDaConta = (id: string) => screen.getAllByTestId('linha-saldo-conta').find((r) => r.getAttribute('data-conta') === id)!;
async function abrirConta(id: string) {
  montar();
  await screen.findAllByTestId('linha-saldo-conta');
  fireEvent.click(linhaDaConta(id));
}

describe('T1 — o Emerson (NJ Sicredi Lavoura, set/26) pela régua do dono', () => {
  it('Conciliado, saldo 155.972,29, diferença "confere", o retido 1.217,01 (15) com title', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('conciliado'));
    expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('R$ 155.972,29');
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere');
    expect(n(screen.getByTestId('resumo-retido').textContent)).toBe('↳ retido no depósito R$ 1.217,01 (15)');
    expect(screen.getByTestId('resumo-retido').getAttribute('title')).toContain('15 retenções');
    expect(within(screen.getByTestId('status-motivos')).getByText('confere em todos os dias')).toBeInTheDocument();
  });
});

describe('T2 — o selo é o status do dono, e "confere em todos os dias" nunca convive com dias de diferença', () => {
  it('a conta não conciliada: selo e card vermelhos; os motivos do dono, sem o "confere"', async () => {
    await abrirConta('cartao');
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('nao_conciliado'));
    const motivos = screen.getByTestId('status-motivos');
    expect(within(motivos).queryByText('confere em todos os dias')).toBeNull();
    expect(n(motivos.textContent)).toContain('2 dias com diferença');
    expect(n(motivos.textContent)).toContain('saldo diverge R$ 6.470,73');
    expect(screen.getByTestId('selo-mes').getAttribute('data-status')).toBe('nao_conciliado');
    expect(screen.getByTestId('selo-mes').textContent).toBe('❌ Não Conciliado');
  });
});

describe('T3 — os motivos e o link do dia', () => {
  it('"2 dias com diferença" abre a Conferência da conta no PRIMEIRO dia', async () => {
    await abrirConta('cartao');
    const link = await screen.findByTestId('link-dia');
    fireEvent.click(link);
    await screen.findByTestId('espelho');
    const ult = B.espelhoProps[B.espelhoProps.length - 1];
    expect([ult.contaId, ult.aba, ult.diaFoco]).toEqual(['cartao', 'conferencia', '2026-09-08']);
  });

  it('sem extrato e sem saldo: "sem extrato"; nada de link', async () => {
    await abrirConta('parada');
    await waitFor(() => expect(n(screen.getByTestId('status-motivos').textContent)).toBe('sem extrato'));
    expect(screen.queryByTestId('link-dia')).toBeNull();
  });
});

describe('T4 — "Todas as contas": total, subtotais, contas não conciliadas, pendentes e sem conta, do dono', () => {
  it('diferença total 0 com uma conta divergente sai NÃO CONCILIADO, com o nome dela', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('nao_conciliado'));
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere'); // o total fecha…
    const motivos = screen.getByTestId('status-motivos');
    expect(n(motivos.textContent)).toContain('1 conta não conciliada');
    expect(within(motivos).getByTestId('conta-nao-conciliada').textContent).toBe('Cartão BB - Visa Infinite');
    expect(n(motivos.textContent)).toContain('1 pendente');
    expect(n(screen.getByTestId('resumo-sem-conta').textContent)).toBe('lançamentos sem conta +R$ 100,00 / −R$ 869,29 (3)');
    expect(n(screen.getByTestId('total-sistema').textContent)).toBe('R$ 449.501,56');
    expect(screen.getByText('R$ 300.000,00', { selector: 'td.sticky' })).toBeInTheDocument(); // o subtotal Investimentos do dono
  });

  it('o nome da conta não conciliada leva à Conferência dela no primeiro dia', async () => {
    montar();
    const nome = await screen.findByTestId('conta-nao-conciliada');
    fireEvent.click(within(nome).getByRole('button'));
    await screen.findByTestId('espelho');
    const ult = B.espelhoProps[B.espelhoProps.length - 1];
    expect([ult.contaId, ult.diaFoco]).toEqual(['cartao', '2026-09-08']);
  });
});

describe('T5 — Agnaldo Bradesco set/26: a conta consolidada é UMA linha, com o saldo inicial consolidado', () => {
  it('a Invest Fácil (interna) não tem linha própria; a mãe diz no title que a consolida', async () => {
    B.contas = [conta('brad', 'Bradesco'), conta('if', 'Bradesco-Invest. Facil', 'inv')];
    B.resumo = { '2026-09': [
      linhaConta({ conta_id: 'brad', conta_nome: 'Bradesco', tipo_conta: 'cc', status: 'pendente', saldo_inicial: 54738.55,
        saldo_inicial_origem: 'informado', saldo_sistema: 26205.97, saldo_extrato: null, diferenca: null, entradas: 1132588.6, saidas: -1161121.18,
        motivos: [{ motivo: 'saldo_nao_informado', falta: 'final' }] }),
      linhaConta({ conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil', tipo_conta: 'inv', consolida_em_conta_id: 'brad',
        saldo_inicial: 54737.55, saldo_sistema: 54737.55, saldo_extrato: null, diferenca: null, status: 'pendente', motivos: [{ motivo: 'sem_extrato' }] }),
      linhaConta({ nivel: 'total', conta_id: null, conta_nome: 'Total', status: 'pendente', saldo_inicial: 54738.55, saldo_sistema: 26205.97,
        saldo_extrato: null, diferenca: null, motivos: [{ motivo: 'contas_pendentes', qtde: 1 }] }),
    ] };
    await abrirConta('brad');
    expect(screen.getAllByTestId('linha-saldo-conta').map((r) => r.getAttribute('data-conta'))).toEqual(['brad']);
    expect(linhaDaConta('brad').getAttribute('title')).toContain('consolida Bradesco-Invest. Facil');
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-inicial').textContent)).toBe('R$ 54.738,55'));
    expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('R$ 26.205,97');
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('—');
  });
});

describe('T6 — a régua nasce neutra e se pinta quando o status do ano responde; a tela não espera', () => {
  it('antes do status do ano: só o mês aberto pintado (pelo resumo) e o Resumo já na tela; depois, os meses do ano', async () => {
    let soltar: () => void = () => {};
    B.segurarAno = new Promise<void>((r) => { soltar = r; });
    montar();
    await screen.findByTestId('resumo-saldo-sistema');
    expect(screen.getByTestId('regua').getAttribute('data-meses')).toBe('9');
    soltar();
    await waitFor(() => expect(screen.getByTestId('regua').getAttribute('data-meses')).toBe('8,9'));
  });
});

describe('T7 — a posição é do dono', () => {
  it('posição antes do fim do mês: o rodapé diz a data e a diferença na data, e o aviso conta os realizados depois', async () => {
    B.resumo['2026-09'] = [linhaConta({ ...LINHA_CARTAO, status: 'nao_conciliado', saldo_extrato_data: '2026-09-10',
      posicao: { data: '2026-09-10', saldo_sistema_na_data: 0, diferenca_na_data: 0, realizados_apos: { qtde: 11, valor: -500 } } }), TOTAL_NJ];
    await abrirConta('cartao');
    await waitFor(() => expect(screen.getByTestId('resumo-realizados-apos')).toBeInTheDocument());
    expect(n(screen.getByTestId('resumo-realizados-apos').textContent)).toMatch(/^11 realizados após 10\/09 não conferidos/);
    expect(n(screen.getByTestId('resumo-rodape').textContent)).toBe('Posição declarada em 10/09: na data, a diferença é R$ 0,00.');
  });
});

describe('T8 — "Fechar contas sem movimento" grava o saldo do dono', () => {
  it('só a conta parada; o saldo final é o saldo_sistema do dono e a conta com movimento não é fechada', async () => {
    B.resumo['2026-09'] = [...B.resumo['2026-09'],
      linhaConta({ conta_id: 'mexeu', conta_nome: 'Mexeu', tipo_conta: 'cc', status: 'pendente', saldo_inicial: 10, saldo_inicial_origem: 'herdado',
        saldo_sistema: 60, saldo_extrato: null, entradas: 50, motivos: [] })];
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar contas sem movimento' }));
    await waitFor(() => expect(B.inserts.length).toBe(1));
    expect(B.inserts[0].tabela).toBe('financeiro_saldos_bancarios_v2');
    expect(B.inserts[0].linha).toMatchObject({
      conta_bancaria_id: 'parada', ano_mes: '2026-09', saldo_inicial: 300000, saldo_final: 300000, origem_saldo: 'sem_movimento',
    });
  });
});

describe('T9 — nenhum arquivo tocado importa a conta antiga', () => {
  it('ConciliacaoBancariaTab, EspelhoConciliacaoTab, o hook e a lib não importam calcConciliacaoMensal / getConciliacaoStatus', () => {
    for (const f of ['src/pages/ConciliacaoBancariaTab.tsx', 'src/components/financeiro-v2/EspelhoConciliacaoTab.tsx',
      'src/hooks/useResumoConciliacao.ts', 'src/lib/conciliacao/resumoDoDono.ts']) {
      const fonte = readFileSync(resolve(process.cwd(), f), 'utf8');
      const imports = fonte.split('\n').filter((l) => /^\s*import\b/.test(l) || /^\s{2}\w.*,\s*$/.test(l)).join('\n')
        + fonte.match(/import\s*\{[^}]*\}\s*from[^;]+;/g)?.join('\n');
      expect(imports, f).not.toMatch(/calcConciliacaoMensal|getConciliacaoStatus/);
    }
    /* a busca sabe achar: o mesmo predicado acusa o arquivo antigo */
    const antigo = 'import {\n  belongsToConta,\n  calcConciliacaoMensal,\n} from \'@/lib/financeiro/conciliacaoCalc\';';
    expect(antigo.match(/import\s*\{[^}]*\}\s*from[^;]+;/g)?.join('\n')).toMatch(/calcConciliacaoMensal/);
  });
});
