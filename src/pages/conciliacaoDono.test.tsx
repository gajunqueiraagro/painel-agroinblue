/**
 * PR-CONC-SALDO-UMA-REGUA-02 — a aba Conciliação DESENHA o dono (`fn_conciliacao_resumo_mes` e
 * `fn_conciliacao_status_ano`); não calcula, não soma linha, não escolhe conta.
 *
 * ⚠ O BANCO FALSO DEVOLVE AS LINHAS DO DONO e a tela é montada inteira (os filhos pesados são trocados por nada — o
 *   Espelho fica com um espião das props, para o link "N dias com diferença"). Lançamentos do ano: nenhum — prova de que
 *   nenhum número do Resumo, do Status ou dos Saldos vem deles.
 * (PR-CONC-STATUS-SALDO-01b: motivos = o saldo; avisos = a 2ª prova do extrato; ver o bloco STATUS-SALDO.)
 * T1 Emerson · T2 selo = dono · T3 motivos e o link do dia · T4 Todas · T5 o par do Agnaldo · T6 régua neutra → pintada
 * · T7 posição · T8 fechar sem movimento grava o do dono · T9 nenhum arquivo tocado importa a conta antiga.
 *
 * PR-CONC-INTERNA-SEPARADA-01b — CONTRATO NOVO: a linha de conta desenha o `proprio` do dono. O T5 antigo ("a conta
 * consolidada é UMA linha, a interna não tem linha") virou o seu contrário: a mãe em Conta corrente e a interna em
 * Investimentos, cada uma com o saldo próprio e a marca "conferida com". Entraram o T3 (01b) das ocultas e o T7 (01b) da conta
 * sem par. As linhas de conta escritas à mão passam por `comProprio` (o `proprio` = topo que o dono manda em conta sem par).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comProprio } from '@/lib/conciliacao/resumoDoDono.fixture';

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
  /** As props com que o lápis foi aberto (o `saldoAtual` é o extrato que a linha passa). */
  lapis: [] as Array<Record<string, unknown>>,
  /** As props do modal "Sem classificação" a cada desenho (CONC-SEM-CLASSIFICACAO-01). */
  semClassificacao: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const b: Record<string, unknown> = {};
    /* `ilike`: a consulta das contas que importam OFX (o ícone do saldo, UI-SEM-CORTE-02) */
    for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'is', 'not', 'neq', 'order', 'in', 'limit', 'range', 'ilike']) b[m] = () => b;
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
vi.mock('@/components/conciliacao/SaldoRealDialog', () => ({
  SaldoRealDialog: (p: Record<string, unknown>) => { if (B.lapis[B.lapis.length - 1]?.contaId !== p.contaId) B.lapis.push(p); return null; },
}));
vi.mock('@/components/conciliacao/ImportarBancoInline', () => ({ ImportarBancoInline: () => null }));
vi.mock('@/components/conciliacao/EnriquecerPorPlanilha', () => ({ EnriquecerPorPlanilha: () => null }));
vi.mock('@/components/financeiro-v2/ExtratoGerencialTab', () => ({ ExtratoGerencialTab: () => null }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({
  ABAS_ESPELHO: [{ key: 'conferencia', label: 'Conferência' }, { key: 'ofx', label: 'Extrato (banco)' }],
  EspelhoOfxSistemaModal: () => null,
  /* P141 — o modal "Extrato do sistema" (o ↗) monta a aba Sistema em modo grande */
  AbaSistemaReal: () => <div data-testid="aba-sistema-grande" />,
  EspelhoConciliacaoTab: (p: Record<string, unknown>) => { B.espelhoProps.push(p); return <div data-testid="espelho" />; },
}));
vi.mock('@/v2/components/SeletorPeriodo', () => ({
  SeletorPeriodo: (p: { tomPorMes?: Record<number, unknown> }) => {
    B.tom.push(p.tomPorMes);
    return <div data-testid="regua" data-meses={Object.keys(p.tomPorMes ?? {}).join(',')} />;
  },
}));
vi.mock('@/components/conciliacao/SemClassificacaoModal', () => ({
  SemClassificacaoModal: (p: Record<string, unknown>) => {
    B.semClassificacao.push(p);
    return p.aberto ? <div data-testid="modal-sem-classificacao" data-conta={String(p.contaId)} data-nome={String(p.contaNome)} data-mes={String(p.anoMes)} /> : null;
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ConciliacaoBancariaTab } from './ConciliacaoBancariaTab';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const EMERSON = FIX.nj_sicredi_lavoura_2026_09;
const ID_LAV = EMERSON.conta as string;

const conta = (id: string, nome: string, tipo = 'cc') =>
  ({ id, nome_conta: nome, nome_exibicao: null, tipo_conta: tipo, codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: null });
/* `comProprio`: a linha de conta SEM par vem do dono com `proprio` = topo (PR-CONC-INTERNA-SEPARADA-01a). Quem escreve o
   `proprio` à mão (a conta-mãe) fica com o seu. */
const linhaConta = (x: Record<string, unknown>) => comProprio({
  nivel: 'conta', consolida_em_conta_id: null, tem_extrato: false, entradas: 0, saidas: 0, motivos: [], avisos: [],
  retido_em_depositos: { qtde: 0, valor: 0 }, extratos_sem_par: { qtde: 0, valor: 0 }, lancamentos_sem_par: { qtde: 0, valor: 0 },
  banco: { entradas: 0, saidas: 0 }, posicao: null, sem_conta: null, ...x,
});

/* NJ set/26, recortado: o Emerson conciliado (o fixture real), o Cartão BB não conciliado e uma conta parada. */
const LINHA_EMERSON = linhaConta({
  ...EMERSON.resumo, proprio: undefined, conta_id: ID_LAV, conta_nome: 'Sicredi Lavoura', tipo_conta: 'cc', tem_extrato: true,
  saldo_extrato: 155972.29, saldo_extrato_data: '2026-09-30', diferenca: 0, motivos: [], saldo_inicial_origem: 'informado',
  entradas_terceiros: 352212.94, entradas_transferencias: 820000, saidas_terceiros: -1035210.22, saidas_transferencias: -8619.53,
});
const LINHA_CARTAO = linhaConta({
  conta_id: 'cartao', conta_nome: 'Cartão BB - Visa Infinite', tipo_conta: 'cartao', status: 'nao_conciliado',
  saldo_inicial: 0, saldo_sistema: -6470.73, saldo_extrato: 0, saldo_extrato_data: '2026-09-30', diferenca: 6470.73, tem_extrato: true,
  /* PR-CONC-STATUS-SALDO-01b: o saldo decide (motivos); o extrato importado avisa (avisos). */
  motivos: [{ motivo: 'saldo_diverge', valor: 6470.73 }],
  avisos: [{ motivo: 'dias_com_diferenca', qtde: 2, dias: ['2026-09-08', '2026-09-15'] }],
});
const LINHA_PARADA = linhaConta({
  conta_id: 'parada', conta_nome: 'Invest Parado', tipo_conta: 'inv', status: 'pendente',
  saldo_inicial: 300000, saldo_inicial_origem: 'herdado', saldo_sistema: 300000, saldo_extrato: null, diferenca: null,
  motivos: [{ motivo: 'saldo_nao_informado', falta: 'final' }], avisos: [{ motivo: 'sem_extrato' }],
});
/* CONC-TOTAL-SEM-SALDO-01b — agregados REAIS do dono (proto, 05/10/2026): Santa Rita out/25, NJ out/26 e NJ set/26. */
const SEM_SALDO: Record<string, unknown> = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/semSaldo.fixture.json'), 'utf8'));
const TOTAL_NJ = linhaConta({
  nivel: 'total', conta_id: null, conta_nome: 'Total', status: 'nao_conciliado',
  /* CONC-TOTAL-SEM-SALDO-01a/01b — o contrato do dono: a conta parada PESA (300.000 no sistema) sem saldo informado, então o
     agregado vem SEM extrato e SEM diferença, com o motivo `contas_sem_saldo`. Antes este fixture tinha o padrão do defeito:
     sistema 449.501,56 × extrato 155.972,29 com diferença 0 — duas somas de conjuntos diferentes que a tela chamava de "confere". */
  saldo_inicial: 330150.7, saldo_sistema: 449501.56, saldo_extrato: null, diferenca: null, entradas: 1172212.94, saidas: -1043829.75,
  motivos: [
    { motivo: 'contas_nao_conciliadas', qtde: 1, contas: [{ conta_id: 'cartao', conta_nome: 'Cartão BB - Visa Infinite', status: 'nao_conciliado', motivos: LINHA_CARTAO.motivos, avisos: LINHA_CARTAO.avisos }] },
    { motivo: 'contas_pendentes', qtde: 1 },
    { motivo: 'contas_sem_saldo', qtde: 1, contas: [{ conta_id: 'parada', conta_nome: 'Invest Parado' }] },
    { motivo: 'lancamentos_sem_conta', qtde: 3 },
  ],
  avisos: [{ motivo: 'contas_com_aviso', qtde: 2, qtde_alem_sem_extrato: 1, por_aviso: { sem_extrato: 1, dias_com_diferenca: 1 } }],
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
      SUB('inv', { conta_nome: 'Investimentos', status: 'pendente', saldo_sistema: 300000, saldo_extrato: null, diferenca: null,
        motivos: [{ motivo: 'contas_pendentes', qtde: 1 }, { motivo: 'contas_sem_saldo', qtde: 1, contas: [{ conta_id: 'parada', conta_nome: 'Invest Parado' }] }] }),
      SUB('cartao', { conta_nome: 'Cartão', status: 'nao_conciliado', saldo_sistema: -6470.73, saldo_extrato: 0, diferenca: 6470.73 }),
      TOTAL_NJ],
  };
  B.statusAno = [
    { ano_mes: '2026-08', nivel: 'total', status: 'conciliado', motivos: [], avisos: [] },
    { ano_mes: '2026-09', nivel: 'total', status: 'nao_conciliado', motivos: [], avisos: [] },
  ];
  B.segurarAno = null;
  B.inserts = []; B.rpcs = []; B.espelhoProps = []; B.tom = []; B.lapis = []; B.semClassificacao = [];
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
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado'));
    expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('155.972,29');
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere');
    expect(n(screen.getByTestId('resumo-retido').textContent)).toBe('↳ retido no depósito R$ 1.217,01 (15)');
    expect(screen.getByTestId('resumo-retido').getAttribute('title')).toContain('15 retenções');
    /* P166: a faixa diz o status do dono; "confere em todos os dias" segue no `title` da linha da conta */
    expect(n(screen.getByTestId('faixa-status-rotulo').textContent)).toBe('✓ Set/2026 conciliado');
    expect(screen.getByTestId('faixa-status-frase').textContent).toBe('O saldo do sistema bate com o do extrato');
    expect(n(screen.getByTestId('faixa-classificacao').textContent)).toBe('Classificação: ✓ completa');
    expect(linhaDaConta(ID_LAV).getAttribute('title')).toContain('confere em todos os dias');
  });
});

describe('T2 — a faixa é o status do dono, e "confere em todos os dias" nunca convive com dias de diferença', () => {
  it('a conta não conciliada: faixa vermelha, sem valor de conta (P166); o selo e a 2ª prova saíram', async () => {
    await abrirConta('cartao');
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('nao_conciliado'));
    expect(screen.getByTestId('faixa-status').className).toContain('bg-destructive/10');
    expect(n(screen.getByTestId('faixa-status-rotulo').textContent)).toBe('✕ Set/2026 não conciliado');
    /* o status é o SALDO; o valor fica na tabela (a faixa não repete o 6.470,73), por extenso no `title` */
    const frase = screen.getByTestId('faixa-status-frase');
    expect(frase.textContent).toBe('Saldo do sistema e do extrato não batem');
    expect(n(frase.getAttribute('title'))).toBe('saldo diverge R$ 6.470,73');
    expect(n(linhaDaConta('cartao').getAttribute('title'))).not.toContain('confere em todos os dias');
    expect(screen.queryByTestId('segunda-prova')).toBeNull();
    expect(screen.queryByTestId('selo-mes')).toBeNull();
    expect(screen.queryByTestId('card-status')).toBeNull();
  });
});

describe('T3 — os motivos (P166: o link do dia saiu com o card Status; os dias seguem no `title` da conta)', () => {
  it('"2 dias com diferença" fica no `title` da linha; a faixa não tem link', async () => {
    await abrirConta('cartao');
    await screen.findByTestId('faixa-status');
    expect(n(linhaDaConta('cartao').getAttribute('title'))).toContain('2ª prova · extrato: 2 dias com diferença');
    expect(screen.queryByTestId('link-dia')).toBeNull();
  });

  it('sem extrato e sem saldo: faixa CINZA "pendente" com a frase do dono', async () => {
    await abrirConta('parada');
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('pendente'));
    expect(screen.getByTestId('faixa-status').className).toContain('bg-muted');
    expect(n(screen.getByTestId('faixa-status-rotulo').textContent)).toBe('⏳ Set/2026 pendente');
    expect(screen.getByTestId('faixa-status-frase').textContent).toBe('Saldo não informado');
    expect(screen.queryByTestId('link-dia')).toBeNull();
  });
});

describe('T4 — "Todas as contas": total, subtotais, contas não conciliadas, pendentes e sem conta, do dono', () => {
  it('uma conta divergente e uma que pesa sem saldo: NÃO CONCILIADO com o nome dela, e a diferença diz "falta saldo" (nunca "confere")', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('nao_conciliado'));
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('falta saldo · 1 conta');
    /* P166: "não batem em N contas" é o `qtde` do motivo do dono; os nomes (com o motivo de cada uma) ficam no `title` */
    const frase = screen.getByTestId('faixa-status-frase');
    expect(frase.textContent).toBe('Saldo do sistema e do extrato não batem em 1 conta');
    expect(n(frase.getAttribute('title'))).toContain('Cartão BB - Visa Infinite: saldo diverge R$ 6.470,73');
    expect(n(frase.getAttribute('title'))).toContain('Invest Parado');
    /* a 2ª prova ("N contas com aviso do extrato") saiu da aba com o card Status */
    expect(screen.queryByTestId('segunda-prova')).toBeNull();
    expect(n(screen.getByTestId('resumo-sem-conta').textContent)).toBe('lançamentos sem conta +R$ 100,00 / −R$ 869,29 (3)');
    expect(n(screen.getByTestId('total-sistema').textContent)).toBe('449.501,56');
    expect(screen.getByText('300.000,00', { selector: 'td.sticky' })).toBeInTheDocument(); // o subtotal Investimentos do dono
  });

  /* ── CONC-TOTAL-SEM-SALDO-01b — "sistema tem 12 mil, extrato tem 101 mil. Como que a diferença confere?" (Gabriel, 04/10). O
        dono anulou extrato e diferença do agregado com conta que pesa sem saldo; a tela diz o que falta, com UMA frase. ── */
  it('01b: "falta saldo · 1 conta" no Total, no subtotal Investimentos e no Resumo — a MESMA frase, com os nomes no title', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo')).toBeInTheDocument());
    const pontos = [screen.getByTestId('total-falta-saldo'), screen.getByTestId('subtotal-falta-saldo-inv'), screen.getByTestId('resumo-falta-saldo')];
    /* CONC-SALDOS-LAYOUT-02: a cor depende do fundo — claro sobre o navy do Total, âmbar na faixa de grupo, e a do status
       PENDENTE no Resumo. Nunca o verde do "confere" nem o vermelho da diferença. */
    const tons = ['rgb(252, 217, 166)', 'rgb(180, 83, 9)', 'rgb(117, 117, 117)'];
    for (const [i, p] of pontos.entries()) {
      expect(p.textContent).toBe('falta saldo · 1 conta');
      expect(p.getAttribute('title')).toBe('Invest Parado');
      expect(p.style.color).toBe(tons[i]);
      expect(p.closest('td,span.text-success,span.text-destructive')?.className ?? '').not.toMatch(/text-success|text-destructive/);
    }
    /* CONC-SALDOS-LAYOUT-02: no Total a frase ocupa Extrato + Diferença JUNTAS (uma célula); nada diz "confere" no Total nem
       no Resumo, e o Extrato do Resumo continua "—" */
    expect(screen.queryByTestId('total-extrato')).toBeNull();
    expect(screen.getByTestId('total-diferenca').textContent).toBe('falta saldo · 1 conta');
    expect(screen.getByTestId('resumo-saldo-extrato').textContent).toBe('—');
  });

  it('01b: diferença nula SEM o motivo continua "—" (o subtotal pendente cuja conta não pesa)', async () => {
    /* o subtotal Investimentos (o 5º do fixture) sem o motivo `contas_sem_saldo`: pendente cuja conta não pesa */
    const linhas = [...B.resumo['2026-09']];
    linhas[4] = SUB('inv', { conta_nome: 'Investimentos', status: 'pendente', saldo_sistema: 0, saldo_extrato: null, diferenca: null,
      motivos: [{ motivo: 'contas_pendentes', qtde: 1 }] });
    B.resumo['2026-09'] = linhas;
    montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo')).toBeInTheDocument());
    expect(screen.queryByTestId('subtotal-falta-saldo-inv')).toBeNull();
  });

  it('01b: linhas REAIS do dono — Santa Rita out/25 (1 conta) e NJ out/26 (8 contas, com os nomes no title); NJ set/26 conciliado segue "confere"', async () => {
    const real = (chave: string) => (SEM_SALDO[chave] as Record<string, unknown>[]).map((l) => linhaConta(l));
    B.contas = [];
    B.resumo['2026-09'] = real('santa_rita_2025_10');
    const sr = montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo').textContent).toBe('falta saldo · 1 conta'));
    expect(screen.getByTestId('total-falta-saldo').getAttribute('title')).toBe('Sicredi-PJ Cap. Social');
    expect(screen.getByTestId('resumo-falta-saldo').textContent).toBe('falta saldo · 1 conta');
    expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('pendente');
    sr.unmount();

    B.resumo['2026-09'] = real('nj_2026_10');
    const nj = montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo').textContent).toBe('falta saldo · 8 contas'));
    const nomes = (screen.getByTestId('total-falta-saldo').getAttribute('title') ?? '').split('\n');
    expect(nomes).toHaveLength(8);
    expect(nomes).toContain('Banco do Brasil');
    nj.unmount();

    B.resumo['2026-09'] = real('nj_2026_09');
    montar();
    await waitFor(() => expect(screen.getByTestId('total-diferenca').textContent).toBe('confere'));
    expect(screen.queryByTestId('total-falta-saldo')).toBeNull();
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere');
  });

  it('01b (M4): no Total, que não tem data de saldo, o rótulo é só "Saldo do extrato" e o rodapé não afirma data; com UMA conta com data, tudo como antes', async () => {
    B.resumo['2026-09'] = (SEM_SALDO.nj_2026_09 as Record<string, unknown>[]).map((l) => linhaConta(l)).concat([LINHA_EMERSON]);
    montar();
    await waitFor(() => expect(screen.getByTestId('total-diferenca').textContent).toBe('confere'));
    const rotulo = () => n(screen.getByTestId('resumo-saldo-extrato').parentElement?.textContent ?? '');
    expect(rotulo()).toBe('Saldo do extrato 1.281.055,45');
    expect(rotulo()).not.toMatch(/\(\d\d\/\d\d\)/);
    expect(screen.queryByTestId('resumo-rodape')).toBeNull();
    fireEvent.click(await screen.findByText('Sicredi Lavoura'));
    await waitFor(() => expect(rotulo()).toBe('Saldo do extrato (30/09)155.972,29'));
    expect(n(screen.getByTestId('resumo-rodape').textContent)).toBe('A diferença compara o saldo do extrato de 30/09.');
  });

  it('P166: a faixa não lista as contas (a conta com diferença tem o ponto vermelho na tabela)', async () => {
    montar();
    await screen.findByTestId('faixa-status');
    expect(screen.queryByTestId('conta-nao-conciliada')).toBeNull();
    expect(linhaDaConta('cartao').getAttribute('data-status')).toBe('nao_conciliado');
  });
});

/* ── PR-CONC-INTERNA-SEPARADA-01b: o par do Agnaldo, cada conta com o saldo PRÓPRIO ──
   O topo da mãe é o CONSOLIDADO do par (o veredito); o `proprio` é o saldo dela. Abr/24, o caso do Gabriel: extrato próprio
   −55.734,67 × sistema próprio −55.719,49 (−15,18); a interna −4,02 × −4,02; o consolidado seria −55.738,69 × −55.723,51. */
const CONF_MAE = [{ motivo: 'conferida_com', conta_id: 'brad', conta_nome: 'Bradesco' }];
const MAE_ABR24 = (x: Record<string, unknown> = {}) => linhaConta({
  conta_id: 'brad', conta_nome: 'Bradesco', tipo_conta: 'cc', status: 'nao_conciliado', tem_extrato: true, saldo_inicial_origem: 'informado',
  saldo_inicial: -40000, entradas: 100, saidas: -15823.51, saldo_sistema: -55723.51, saldo_extrato: -55738.69, saldo_extrato_data: '2024-04-30', diferenca: -15.18,
  entradas_terceiros: 100, entradas_transferencias: 0, saidas_terceiros: -15823.51, saidas_transferencias: 0,
  motivos: [{ motivo: 'saldo_diverge', valor: -15.18 }],
  internas: [{ conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil' }], par_conta_id: null, par_status: null,
  proprio: { saldo_inicial: -39997.27, entradas: 53405.5, saidas: -69127.72, saldo_sistema: -55719.49, saldo_extrato: -55734.67, diferenca: -15.18,
    entradas_terceiros: 100, entradas_transferencias: 53305.5, saidas_terceiros: -15822.22, saidas_transferencias: -53305.5 },
  ...x,
});
const INTERNA_ABR24 = (x: Record<string, unknown> = {}) => linhaConta({
  /* PR-CONC-STATUS-SALDO-01b: a interna é julgada pelo SEU saldo (0,00 = conciliado); `par_status` segue o da mãe. */
  conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil', tipo_conta: 'inv', consolida_em_conta_id: 'brad', status: 'conciliado',
  par_conta_id: 'brad', par_status: 'nao_conciliado', internas: null, saldo_inicial_origem: 'informado',
  saldo_inicial: -2.73, entradas: 53305.5, saidas: -53306.79, saldo_sistema: -4.02, saldo_extrato: -4.02, saldo_extrato_data: '2024-04-30', diferenca: 0,
  entradas_transferencias: 53305.5, saidas_terceiros: -1.29, saidas_transferencias: -53305.5,
  motivos: [], avisos: [{ motivo: 'sem_extrato' }, ...CONF_MAE], ...x,
});
const PAR_ABR24 = (mae = MAE_ABR24(), interna = INTERNA_ABR24()) => [mae, interna,
  SUB('cc', { conta_nome: 'Conta corrente', status: 'nao_conciliado', saldo_sistema: -55719.49, saldo_extrato: -55734.67, diferenca: -15.18 }),
  SUB('inv', { conta_nome: 'Investimentos', status: 'conciliado', saldo_sistema: -4.02, saldo_extrato: -4.02, diferenca: 0 }),
  linhaConta({ nivel: 'total', conta_id: null, conta_nome: 'Total', status: 'nao_conciliado', saldo_inicial: -40000, saldo_sistema: -55723.51,
    saldo_extrato: -55738.69, diferenca: -15.18, entradas: 100, saidas: -15823.51,
    motivos: [{ motivo: 'contas_nao_conciliadas', qtde: 1, contas: [{ conta_id: 'brad', conta_nome: 'Bradesco', status: 'nao_conciliado', motivos: [{ motivo: 'saldo_diverge', valor: -15.18 }], avisos: [] }] }] }),
];
/* P141: Conta · Data · Arquivos · SISTEMA · EXTRATO · DIFERENÇA · ações — os três números são as células 3 a 5 */
const celulas = (id: string) => [...linhaDaConta(id).querySelectorAll('td')].slice(3, 6).map((td) => n(td.textContent));
const grupoDe = (id: string) => n(linhaDaConta(id).closest('tbody')?.querySelector('tr td')?.textContent);
const TITULO_PAR = (nome: string) => `o mês desta conta só fecha junto com ${nome}: o arquivo do banco traz o saldo das duas somado`;

describe('T5 — o par do Agnaldo: a mãe em Conta corrente e a interna em Investimentos, cada uma com o saldo próprio', () => {
  beforeEach(() => {
    B.contas = [conta('brad', 'Bradesco'), conta('if', 'Bradesco-Invest. Facil', 'inv')];
    B.resumo = { '2026-09': PAR_ABR24() };
  });

  it('as duas têm linha, no tipo de cada uma, com sistema / extrato / diferença do `proprio`; sem "⊕"', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(screen.getAllByTestId('linha-saldo-conta').map((r) => r.getAttribute('data-conta'))).toEqual(['brad', 'if']);
    expect([grupoDe('brad'), grupoDe('if')]).toEqual(['Conta corrente', 'Investimentos']);
    expect(celulas('brad')).toEqual(['-55.719,49', '-55.734,67', '-15,18']);
    expect(celulas('if')).toEqual(['-4,02', '-4,02', 'confere']);
    const tabela = n(linhaDaConta('brad').closest('table')?.textContent);
    expect(tabela).not.toContain('⊕');
    /* o consolidado do par aparece SÓ no Total (a linha do dono), nunca na linha da mãe */
    expect(linhaDaConta('brad').textContent).not.toContain('55.738,69');
    expect(linhaDaConta('brad').textContent).not.toContain('55.723,51');
    expect(n(screen.getByTestId('total-sistema').textContent)).toBe('-55.723,51');
  });

  it('a marca do par nas duas linhas, com o title; o ponto é o status PRÓPRIO de cada uma (a interna pelo saldo dela)', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const marca = (id: string) => within(linhaDaConta(id)).getByTestId('marca-par');
    /* na linha, a forma curta (a frase inteira não cabe nos 224px da coluna a 1.135px); o nome e o porquê no title */
    expect(n(marca('brad').textContent)).toBe('· par');
    expect(marca('brad').getAttribute('title')).toBe(`conferida com Bradesco-Invest. Facil — ${TITULO_PAR('Bradesco-Invest. Facil')}`);
    expect(n(marca('if').textContent)).toBe('· par');
    expect(marca('if').getAttribute('title')).toBe(`conferida com Bradesco — ${TITULO_PAR('Bradesco')}`);
    /* CONC-SALDOS-LAYOUT-02: a marca mora DENTRO do nome, que é uma linha só e corta (nunca quebra a linha da conta) */
    expect(marca('brad').parentElement?.getAttribute('data-testid')).toBe('nome-conta');
    expect(marca('brad').parentElement?.className).toContain('truncate');
    expect([linhaDaConta('brad').getAttribute('data-status'), linhaDaConta('if').getAttribute('data-status')]).toEqual(['nao_conciliado', 'conciliado']);
    expect(linhaDaConta('brad').getAttribute('title')).not.toContain('consolida');
    /* o title começa pelo NOME e pela frase do par (o nome pode estar cortado na célula); depois, o texto de sempre */
    expect(linhaDaConta('if').getAttribute('title')).toBe(`Bradesco-Invest. Facil · conferida com Bradesco — ${TITULO_PAR('Bradesco')} — Conciliado: conferida com Bradesco — 2ª prova · extrato: sem extrato`);
    expect(within(linhaDaConta('if')).queryByTestId('marca-aviso-conta')).toBeNull();   // "sem extrato" informa, não marca
  });

  it('Resumo com a MÃE aberta: os números próprios (com a abertura terceiros × transferências) e o card diz "conferida com"', async () => {
    await abrirConta('brad');
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('-55.719,49'));
    expect(n(screen.getByTestId('resumo-saldo-inicial').textContent)).toBe('-39.997,27');
    expect(n(screen.getByTestId('resumo-entradas').textContent)).toBe('53.405,50');
    expect(n(screen.getByTestId('resumo-saidas').textContent)).toBe('-69.127,72');
    expect(n(screen.getByTestId('resumo-saldo-extrato').textContent)).toBe('-55.734,67');
    expect(n(screen.getByTestId('resumo-diferenca').textContent)).toBe('-15,18');
    const cartao = n(screen.getByTestId('resumo-saldo-sistema').closest('.rounded-lg, [class*="rounded"]')?.textContent);
    expect(cartao).toContain('53.305,50');   // ↳ transferências: as pernas com a interna
    /* P166: a faixa diz o status e, sem valor, o motivo; "conferida com" segue no `title` da linha */
    expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('nao_conciliado');
    expect(n(screen.getByTestId('faixa-status-frase').getAttribute('title'))).toContain('saldo diverge −⁠R$ 15,18');
    expect(n(linhaDaConta('brad').getAttribute('title'))).toContain('conferida com Bradesco-Invest. Facil');
  });

  it('Resumo com a INTERNA aberta: os números dela e o status PRÓPRIO (o par só aponta)', async () => {
    await abrirConta('if');
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('-4,02'));
    expect(n(screen.getByTestId('resumo-saldo-extrato').textContent)).toBe('-4,02');
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere');
    expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado');
    expect(n(linhaDaConta('if').getAttribute('title'))).toContain('Conciliado: conferida com Bradesco — 2ª prova · extrato: sem extrato');
  });

  it('o lápis da linha abre com o extrato PRÓPRIO — o valor que o operador digitou (−55.734,67), nunca o consolidado', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    fireEvent.click(within(linhaDaConta('brad')).getByTestId('botao-lapis'));
    await waitFor(() => expect(B.lapis.length).toBe(1));
    expect(B.lapis[0]).toMatchObject({ contaId: 'brad', saldoAtual: -55734.67 });
    fireEvent.click(within(linhaDaConta('if')).getByTestId('botao-lapis'));
    await waitFor(() => expect(B.lapis.length).toBe(2));
    expect(B.lapis[1]).toMatchObject({ contaId: 'if', saldoAtual: -4.02 });
  });
});

describe('T3 (01b) — a interna com movimento não se oculta; zerada, parada e com o par conciliado, pode', () => {
  const zerada = { saldo_inicial: 0, entradas: 0, saidas: 0, saldo_sistema: 0, saldo_extrato: 0, diferenca: 0,
    entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 0 };
  const ids = () => screen.getAllByTestId('linha-saldo-conta').map((r) => r.getAttribute('data-conta'));
  beforeEach(() => { B.contas = [conta('brad', 'Bradesco'), conta('if', 'Bradesco-Invest. Facil', 'inv')]; });

  it('saldo 0 nas duas pontas mas com aplicações e resgates no mês (abr/24: 106.611,00): aparece', async () => {
    B.resumo = { '2026-09': PAR_ABR24(MAE_ABR24({ status: 'conciliado', motivos: [] }),
      INTERNA_ABR24({ ...zerada, entradas: 53305.5, saidas: -53305.5, entradas_transferencias: 53305.5, saidas_transferencias: -53305.5,
        status: 'conciliado', par_status: 'conciliado' })) };
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(ids()).toEqual(['brad', 'if']);
  });

  it('zerada e sem movimento, mas o par NÃO conciliado: aparece', async () => {
    B.resumo = { '2026-09': PAR_ABR24(MAE_ABR24(), INTERNA_ABR24({ ...zerada })) };
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(ids()).toEqual(['brad', 'if']);
  });

  it('zerada e sem movimento, com a MÃE conciliada mas o status DELA pendente (PR-CONC-STATUS-SALDO-01b): aparece', async () => {
    /* cada conta é julgada sozinha: `par_status` (o da mãe) conciliado não basta para esconder a interna que não fechou */
    B.resumo = { '2026-09': PAR_ABR24(MAE_ABR24({ status: 'conciliado', motivos: [] }),
      INTERNA_ABR24({ ...zerada, saldo_extrato: null, diferenca: null, status: 'pendente', par_status: 'conciliado',
        motivos: [{ motivo: 'saldo_nao_informado', falta: 'final' }] })) };
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(ids()).toEqual(['brad', 'if']);
    expect(linhaDaConta('if').getAttribute('data-status')).toBe('pendente');
  });

  it('zerada, sem movimento e com o par conciliado: oculta, e o rodapé a conta', async () => {
    B.resumo = { '2026-09': PAR_ABR24(MAE_ABR24({ status: 'conciliado', motivos: [] }),
      INTERNA_ABR24({ ...zerada, status: 'conciliado', par_status: 'conciliado' })) };
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(ids()).toEqual(['brad']);
    expect(screen.getByText(/1 conta sem saldo e sem movimento oculta/)).toBeInTheDocument();
  });
});

describe('T7 (01b) — conta SEM par: a tela é a mesma com e sem o `proprio` espelhado', () => {
  it('os números do Emerson, do Cartão e da conta parada são os dos campos de topo', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(celulas(ID_LAV)).toEqual(['155.972,29', '155.972,29', 'confere']);
    expect(celulas('cartao')).toEqual(['-6.470,73', '0,00', '6.470,73']);
    expect(celulas('parada')).toEqual(['300.000,00', '—', '—']);
    expect(screen.queryByTestId('marca-par')).toBeNull();
    fireEvent.click(linhaDaConta(ID_LAV));
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('155.972,29'));
    expect(n(screen.getByTestId('resumo-saldo-inicial').textContent)).toBe('30.150,70');
    expect(n(screen.getByTestId('resumo-entradas').textContent)).toBe(Number(EMERSON.resumo.entradas).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  });

  it('conta SEM `proprio` (dono antigo) fica neutra: "—", nunca o campo consolidado por reserva', async () => {
    B.resumo['2026-09'] = [{ ...LINHA_CARTAO, proprio: null }, TOTAL_NJ];
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(celulas('cartao')).toEqual(['—', '—', '—']);
  });
});

/* ── PR-CONC-STATUS-SALDO-01b: o status é o saldo; o extrato importado é a 2ª prova ──
   As linhas são as do ENSAIO da migration (`statusSaldo.fixture.json`), dado real do proto. */
const SS = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/statusSaldo.fixture.json'), 'utf8'));
describe('STATUS-SALDO — conciliado pelo saldo com aviso do extrato: verde, 2ª prova âmbar, marcador', () => {
  const PESSOAL = SS.nj_sicredi_pessoal_2026_03.conta;
  beforeEach(() => {
    B.contas = [conta(PESSOAL.conta_id, 'Sicredi Pessoal'), conta(ID_LAV, 'Sicredi Lavoura')];
    B.resumo = { '2026-09': [PESSOAL, LINHA_EMERSON, SS.nj_sicredi_pessoal_2026_03.total] };
    B.statusAno = SS.nj_status_ano_2026_total;
  });

  it('NJ Sicredi Pessoal mar/26 (linha real): faixa VERDE; os avisos do extrato não mudam a faixa (seguem no `title` e no marcador da linha)', async () => {
    await abrirConta(PESSOAL.conta_id);
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado'));
    expect(screen.getByTestId('faixa-status').className).toContain('bg-success/10');
    expect(n(screen.getByTestId('faixa-status-rotulo').textContent)).toBe('✓ Set/2026 conciliado');
    expect(screen.queryByTestId('segunda-prova')).toBeNull();
    expect(screen.queryByTestId('link-dia')).toBeNull();
    expect(within(linhaDaConta(PESSOAL.conta_id)).getByTestId('marca-aviso-conta')).toBeInTheDocument();
  });

  it('Saldos por conta: o ponto segue o status e a conta conciliada COM aviso leva o marcador âmbar; a sem aviso, não', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const linha = linhaDaConta(PESSOAL.conta_id);
    expect(linha.getAttribute('data-status')).toBe('conciliado');
    expect(within(linha).getByTestId('marca-aviso-conta')).toBeInTheDocument();
    expect(n(linha.getAttribute('title'))).toBe('Sicredi Pessoal — Conciliado — 2ª prova · extrato: 1 dia com diferença · o extrato não fecha com o saldo informado R$ 0,02 · 1 lançamento sem par');
    expect(within(linhaDaConta(ID_LAV)).queryByTestId('marca-aviso-conta')).toBeNull();
    expect(linhaDaConta(ID_LAV).getAttribute('title')).toBe('Sicredi Lavoura — Conciliado: confere em todos os dias');
  });

  it('conta SEM aviso nenhum (o Emerson): faixa verde, sem bloco de 2ª prova', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado'));
    expect(screen.queryByTestId('segunda-prova')).toBeNull();
  });

  it('régua do ano (status real do NJ 2026): a cor é o status; mês conciliado com aviso além de "sem extrato" leva a marca (mar e jul), os outros não', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('regua').getAttribute('data-meses')).toBe('1,2,3,4,5,6,7,8,9,10,11,12'));
    const tom = B.tom[B.tom.length - 1] as Record<number, { title?: string; marca?: string; bg: string }>;
    const comMarca = Object.keys(tom).filter((m) => tom[Number(m)].marca).map(Number);
    expect(comMarca).toEqual([3, 7]);
    expect(tom[3].title).toBe('Conciliado');
    expect(tom[3].marca).toBe('2ª prova · extrato: 1 conta com aviso do extrato (sem extrato: 13 · dias com diferença: 1 · extrato não fecha: 1 · lançamentos sem par: 1)');   // ordem fixa, não a do JSON
    expect(tom[3].bg).toBe(tom[4].bg);   // a marca NÃO muda a cor do mês
  });

  it('Vera Itaú CDI set/26 (linha real): conciliado na POSIÇÃO, com o aviso dos realizados depois dela', async () => {
    const CDI = SS.vera_itau_cdi_2026_09.conta;
    B.contas = [conta(CDI.conta_id, 'Itaú CDI', 'inv')];
    B.resumo = { '2026-09': [CDI, SS.vera_itau_cdi_2026_09.total] };
    await abrirConta(CDI.conta_id);
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado'));
    expect(n(linhaDaConta(CDI.conta_id).getAttribute('title'))).toContain('2ª prova · extrato: sem extrato · 1 realizado após 17/09');
    expect(within(linhaDaConta(CDI.conta_id)).getByTestId('marca-aviso-conta')).toBeInTheDocument();
  });
});

/* ── PR-CONC-SALDOS-LAYOUT-01: só apresentação de "Saldos por conta" ── */
describe('LAYOUT — "Saldos por conta": sem a faixa amarela, negativo vermelho no Extrato, escolhida com contorno, régua fixa', () => {
  it('(a) a faixa "Informe o saldo final REAL…" não existe; o lápis da linha continua', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(screen.queryByText(/Informe o saldo final/)).toBeNull();
    expect(linhaDaConta(ID_LAV).querySelector('button')).not.toBeNull();   // o lápis
    expect(screen.getByText('Saldos por conta')).toBeInTheDocument();
  });

  it('(b) Extrato NEGATIVO é vermelho na conta, no subtotal e no Total; positivo e zero, não', async () => {
    B.contas = [conta('brad', 'Bradesco'), conta('if', 'Bradesco-Invest. Facil', 'inv'), conta(ID_LAV, 'Sicredi Lavoura'), conta('cartao', 'Cartão BB - Visa Infinite', 'cartao')];
    B.resumo = { '2026-09': [...PAR_ABR24().slice(0, 2), LINHA_EMERSON, LINHA_CARTAO, ...PAR_ABR24().slice(2),
      SUB('cartao', { conta_nome: 'Cartão', status: 'nao_conciliado', saldo_sistema: -6470.73, saldo_extrato: 0, diferenca: 6470.73 })] };
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const extratoDa = (id: string) => within(linhaDaConta(id)).getByTestId('conta-extrato');
    /* a busca sabe achar: os três níveis têm Extrato negativo neste fixture */
    expect(n(extratoDa('brad').textContent)).toBe('-55.734,67');
    expect(extratoDa('brad').className).toContain('text-destructive');
    expect(extratoDa('if').className).toContain('text-destructive');           // −4,02
    const subs = screen.getAllByTestId('subtotal-extrato');
    const sub = (txt: string) => subs.find((s) => n(s.textContent) === txt)!;
    expect(sub('-55.734,67').className).toContain('text-destructive');      // Conta corrente
    expect(sub('0,00').className).not.toContain('text-destructive');        // Cartão: zero não é negativo
    expect(n(screen.getByTestId('total-extrato').textContent)).toBe('-55.738,69');
    /* CONC-SALDOS-LAYOUT-02: o Total é navy escuro — o negativo dele é o tom claro, não o vermelho do fundo branco */
    expect(screen.getByTestId('total-extrato').className).toContain('text-[#fca5a5]');
    /* positivo e zero ficam na cor do texto */
    expect(n(extratoDa(ID_LAV).textContent)).toBe('155.972,29');
    expect(extratoDa(ID_LAV).className).not.toContain('text-destructive');
    expect(extratoDa('cartao').className).not.toContain('text-destructive');
    /* o Sistema segue a mesma regra, como antes */
    expect(screen.getByTestId('total-sistema').className).toContain('text-[#fca5a5]');
  });

  it('(c) a conta escolhida tem CONTORNO navy e fundo branco (nunca preenchimento); as demais ficam a 0,38', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(linhaDaConta(ID_LAV).getAttribute('data-ativa')).toBe('sim'));
    const ativa = linhaDaConta(ID_LAV);
    expect(ativa.className).toContain('bg-card');
    expect(ativa.className).not.toContain('bg-primary/10');
    expect(ativa.style.opacity).toBe('1');
    const celulas = Array.from(ativa.querySelectorAll('td'));
    expect(celulas).toHaveLength(7);
    /* o contorno: em cima e embaixo em TODA célula, o filete de 3px na primeira e 1,5px na última */
    for (const td of celulas) {
      expect(td.className).toContain('inset_0_1.5px_0_hsl(var(--primary))');
      expect(td.className).toContain('inset_0_-1.5px_0_hsl(var(--primary))');
    }
    expect(celulas[0].className).toContain('inset_3px_0_0_hsl(var(--primary))');
    expect(celulas[6].className).toContain('inset_-1.5px_0_0_hsl(var(--primary))');
    expect(within(ativa).getByTestId('nome-conta').className).toContain('font-semibold text-primary');
    for (const id of ['cartao', 'parada']) {
      const outra = linhaDaConta(id);
      expect(outra.style.opacity).toBe('0.38');
      expect(outra.className).not.toContain('bg-card');
      for (const td of Array.from(outra.querySelectorAll('td'))) expect(td.className).not.toMatch(/inset_3px|1\.5px/);
      expect(within(outra).getByTestId('nome-conta').className).not.toContain('font-semibold');
    }
    /* o "+ Cadastrar" não anda: o lugar do "← Todas" existe com e sem conta escolhida */
    expect(screen.getByTestId('lugar-todas').className).toContain('w-[52px]');
    /* sem seleção, ninguém apagado nem marcado */
    fireEvent.click(screen.getByText('← Todas'));
    await waitFor(() => expect(linhaDaConta(ID_LAV).getAttribute('data-ativa')).toBeNull());
    expect(screen.getAllByTestId('linha-saldo-conta').map((r) => r.style.opacity)).toEqual(['1', '1', '1']);
    expect(screen.getByTestId('lugar-todas').className).toContain('w-[52px]');
    expect(screen.getByTestId('lugar-todas').children).toHaveLength(0);
  });

  it('(d) a linha de conta tem os mesmos lugares com e sem dado: data, OFX, PDF e lápis existem sempre', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const formas = screen.getAllByTestId('linha-saldo-conta').map((linha) => {
      const cel = within(linha).getByTestId('celula-conta');
      return {
        filhos: cel.children.length,
        data: within(linha).getByTestId('slot-data').textContent ?? '',
        slots: ['slot-data', 'slot-ofx', 'slot-pdf', 'slot-lapis'].map((t) => within(linha).queryAllByTestId(t).length).join(''),
        altura: Array.from(linha.querySelectorAll('td')).every((td) => td.className.includes('h-[19px]')),
      };
    });
    /* a busca sabe achar: há conta COM data de saldo e conta SEM, e as duas têm a mesma forma */
    expect(formas.some((f) => /^\d\d\/\d\d$/.test(f.data))).toBe(true);
    expect(formas.some((f) => f.data === '')).toBe(true);
    /* P141: a célula da Conta tem só o ponto e o nome (data e arquivos em colunas próprias); os lugares OFX/PDF têm largura FIXA */
    for (const f of formas) expect({ filhos: f.filhos, slots: f.slots, altura: f.altura }).toEqual({ filhos: 2, slots: '1111', altura: true });
    for (const t of ['slot-ofx', 'slot-pdf']) for (const el of screen.getAllByTestId(t)) expect(el.className).toContain('w-[20px]');
  });

  it('(e) o Total é a faixa navy escura; "falta saldo" ocupa Extrato + Diferença juntas no Total e no grupo; a régua é fixa em px', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo')).toBeInTheDocument());
    const total = screen.getByTestId('linha-total');
    expect(total.className).toContain('bg-[hsl(213_52%_16%)]');
    for (const td of Array.from(total.querySelectorAll('td'))) expect(td.className).toContain('h-[19px]');   // P166: a régua da casa
    expect(screen.getByTestId('total-falta-saldo').closest('td')?.getAttribute('colspan')).toBe('2');
    expect(screen.getByTestId('subtotal-falta-saldo-inv').closest('td')?.getAttribute('colspan')).toBe('2');
    for (const f of screen.getAllByTestId('faixa-grupo')) {
      expect(f.className).toContain('h-[19px]');
      expect(f.className).toContain('bg-[color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card)))]');
    }
    /* a régua, lida da FONTE: tabela fixa e as seis larguras em px (a Conta fica com o resto) — P141 */
    const fonte = readFileSync(resolve(process.cwd(), 'src/pages/ConciliacaoBancariaTab.tsx'), 'utf8');
    const temReguaFixa = (f: string) => /tableLayout:'fixed'/.test(f) && /const REGUA_SALDOS = \[38, 44, 86, 86, 86, 38\];/.test(f)
      && /REGUA_SALDOS\.map\(\(w, i\) => <col key=\{i\} style=\{\{width:`\$\{w\}px`\}\} \/>\)/.test(f);
    expect(temReguaFixa(fonte)).toBe(true);
    expect(fonte).not.toMatch(/tableLayout:'auto'/);
    /* a busca sabe achar: a tabela de antes (auto, sem a régua) é recusada */
    expect(temReguaFixa(fonte.split("tableLayout:'fixed'").join("tableLayout:'auto'"))).toBe(false);
    expect(temReguaFixa(fonte.replace('[38, 44, 86, 86, 86, 38]', '[95, 95, 112, 34]'))).toBe(false);
    /* e o colgroup desenhado tem as quatro larguras */
    const cols = Array.from(total.closest('table')!.querySelectorAll('col')).map((c) => c.style.width);
    expect(cols).toEqual(['', '38px', '44px', '86px', '86px', '86px', '38px']);
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

describe('CONC-SEM-CLASSIFICACAO-01 — o contador vermelho, a "Classificação" da faixa e a porta do modal, lidos do dono', () => {
  const SC = { motivo: 'sem_classificacao', qtde: 39, valor_entradas: 36.9, valor_saidas: 2659.36 };
  const SF = { motivo: 'sem_fornecedor', qtde: 2 };
  const comAvisos = () => {
    B.resumo['2026-09'] = [
      linhaConta({ ...LINHA_EMERSON, proprio: undefined, avisos: [SC, SF] }), LINHA_PARADA, LINHA_CARTAO,
      linhaConta({ ...TOTAL_NJ, proprio: undefined, avisos: [...(TOTAL_NJ.avisos as unknown[]), { ...SC, qtde: 41 }, SF] }),
    ];
    B.statusAno = [
      { ano_mes: '2026-08', nivel: 'total', status: 'conciliado', motivos: [], avisos: [] },
      { ano_mes: '2026-09', nivel: 'total', status: 'conciliado', motivos: [], avisos: [{ ...SC, qtde: 41 }, SF] },
    ];
  };

  it('a busca sabe achar: sem o aviso do dono não há contador, "sem subcentro" nem âmbar ("✓ completa")', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(screen.getByTestId('faixa-status').getAttribute('data-status')).toBe('conciliado'));
    expect(screen.queryByTestId('sem-classificacao-qtde')).toBeNull();
    expect(screen.queryByTestId('classificar-agora')).toBeNull();
    expect(screen.getByTestId('faixa-status').getAttribute('data-pendencia')).toBeNull();
    expect(n(screen.getByTestId('faixa-classificacao').textContent)).toBe('Classificação: ✓ completa');
    expect(screen.queryByTestId('contador-sem-classificacao')).toBeNull();
    expect(Object.values(B.tom.at(-1) ?? {}).some((t) => (t as { contador?: unknown }).contador)).toBe(false);
  });

  it('P166: a conta conciliada com sem classificação fica ÂMBAR na faixa ("conciliado, com pendência") — o status do dono não muda', async () => {
    comAvisos();
    await abrirConta(ID_LAV);
    await waitFor(() => expect(screen.getByTestId('sem-classificacao-qtde')).toBeInTheDocument());
    /* D6 — o status do dono não muda; só a cor da faixa e a frase do rótulo */
    const faixa = screen.getByTestId('faixa-status');
    expect(faixa.getAttribute('data-status')).toBe('conciliado');
    expect(faixa.getAttribute('data-pendencia')).toBe('sim');
    expect(faixa.className).toContain('bg-warning/10');
    expect(n(screen.getByTestId('faixa-status-rotulo').textContent)).toBe('⚠ Set/2026 conciliado, com pendência');
    expect(screen.queryByTestId('segunda-prova')).toBeNull();   // os dois avisos NÃO são 2ª prova do extrato
    expect(screen.queryByTestId('marca-aviso-conta')).toBeNull();
    /* a quantidade é a do dono ("sem subcentro" = sem plano de contas); o "sem fornecedor" não muda o DRE e fica no `title` da linha */
    expect(screen.getByTestId('sem-classificacao-qtde').textContent).toBe('39 sem subcentro');
    expect(n(screen.getByTestId('faixa-classificacao').textContent)).toBe('Classificação: 39 sem subcentro');
    expect(screen.queryByTestId('sem-fornecedor-qtde')).toBeNull();
    expect(linhaDaConta(ID_LAV).getAttribute('title')).toContain('2 sem fornecedor');
    /* a linha da conta: contador vermelho com a quantidade; o ponto continua o do status */
    const linha = linhaDaConta(ID_LAV);
    expect(within(linha).getByTestId('contador-sem-classificacao').textContent).toBe('39');
    expect(linha.getAttribute('data-status')).toBe('conciliado');
    expect(within(linhaDaConta('cartao')).queryByTestId('contador-sem-classificacao')).toBeNull();
  });

  it('"Classificar agora" abre o modal da conta aberta; o contador da linha, o da conta dela; no Todas, todas as contas', async () => {
    comAvisos();
    await abrirConta(ID_LAV);
    fireEvent.click(await screen.findByTestId('classificar-agora'));
    let m = screen.getByTestId('modal-sem-classificacao');
    expect([m.getAttribute('data-conta'), m.getAttribute('data-nome'), m.getAttribute('data-mes')]).toEqual([ID_LAV, 'Sicredi Lavoura', '2026-09']);
    cleanup();
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(screen.getByTestId('sem-classificacao-qtde').textContent).toBe('41 sem subcentro');   // o total do dono, não uma soma da tela
    fireEvent.click(screen.getByTestId('classificar-agora'));
    m = screen.getByTestId('modal-sem-classificacao');
    expect([m.getAttribute('data-conta'), m.getAttribute('data-nome')]).toEqual(['null', 'Todas as contas']);
    cleanup();
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    fireEvent.click(within(linhaDaConta(ID_LAV)).getByTestId('contador-sem-classificacao'));
    expect(screen.getByTestId('modal-sem-classificacao').getAttribute('data-conta')).toBe(ID_LAV);
  });

  it('a régua: o mês leva o contador do TOTAL do dono e a cor continua sendo a do status (sem marca âmbar por isso)', async () => {
    comAvisos();
    montar();
    await waitFor(() => expect((B.tom.at(-1)?.[9] as { contador?: { qtde: number } } | undefined)?.contador?.qtde).toBe(41));
    const set = B.tom.at(-1)?.[9] as { bg: string; marca?: string; contador?: { qtde: number; title: string } };
    const ago = B.tom.at(-1)?.[8] as { bg: string; marca?: string; contador?: unknown };
    expect(set.contador).toEqual({ qtde: 41, title: '41 sem classificação' });
    expect(set.bg).toBe(ago.bg);            // os dois meses conciliados têm a MESMA cor
    expect(set.marca).toBeUndefined();
    expect(ago.contador).toBeUndefined();
  });

  it('o "🔴 N sem classificação" antigo e a regra do front saíram; os duplicados seguem com o diálogo deles', () => {
    const fonte = readFileSync(resolve(process.cwd(), 'src/pages/ConciliacaoBancariaTab.tsx'), 'utf8');
    expect(fonte).not.toMatch(/derivarDetalhePendencias\(/);
    expect(fonte).not.toContain('🔴 {diagPendencias.semClassificacao');
    expect(fonte).toContain('detectarDuplicatasCrossOrigin(lancMes)');
    expect(fonte).toContain('Duplicados entre origens');
    /* a busca sabe achar */
    expect('const x = derivarDetalhePendencias(lancMes);').toMatch(/derivarDetalhePendencias\(/);
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

/* ── CONC-CARDS-ORDEM-01 → P141 → P166 (CONC-TELA-02): a faixa do status em cima, e DOIS blocos: Saldos por conta | Resumo do mês ── */
describe('ORDEM — a faixa do status e os 2 blocos: Saldos por conta | Resumo do mês (P166)', () => {
  it('a faixa vem antes dos blocos; o grid tem Saldos (o resto) e Resumo (260px); o card Status não existe', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const faixa = screen.getByTestId('faixa-status');
    const grid = screen.getByTestId('blocos-conciliacao');
    const antes = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(antes(faixa, grid)).toBe(true);
    expect(grid.style.gridTemplateColumns).toBe('minmax(0,1fr) 260px');
    expect([...grid.children].map((c) => c.getAttribute('data-testid'))).toEqual(['card-saldos', 'card-resumo']);
    expect(within(grid.children[0] as HTMLElement).getByText('Saldos por conta')).toBeInTheDocument();
    expect(within(grid.children[1] as HTMLElement).getByText('Resumo do mês')).toBeInTheDocument();
    expect(screen.queryByTestId('card-status')).toBeNull();
    expect(screen.queryByText('Resumo das movimentações')).toBeNull();
  });
});

/* ── P166 (CONC-TELA-02): nada em CAIXA ALTA na aba; as abas com 1ª maiúscula; o Resumo no desenho do Saldos ── */
describe('P166 — a tela da Conciliação sem CAIXA ALTA, abas e o Resumo do mês', () => {
  it('nenhum `uppercase` nem `tracking-` na aba Conciliação; "Total" e os grupos como o cadastro escreve', async () => {
    const { container } = montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const comCaixa = [...container.querySelectorAll('[class*="uppercase"], [class*="tracking-"]')];
    expect(comCaixa.map((e) => e.textContent)).toEqual([]);
    expect(within(screen.getByTestId('linha-total')).getAllByRole('cell')[0].textContent).toBe('Total');
    expect(screen.getAllByTestId('faixa-grupo').map((g) => g.textContent)).toEqual(['Conta corrente', 'Investimentos', 'Cartão']);
    /* a busca sabe achar: o predicado acusa um elemento com `uppercase` */
    const d = document.createElement('div'); d.className = 'text-[9px] uppercase'; container.appendChild(d);
    expect(container.querySelectorAll('[class*="uppercase"], [class*="tracking-"]').length).toBe(1);
  });

  it('as cinco abas com só a 1ª letra maiúscula; a aberta branca com o traço navy embaixo', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const abas = [...document.querySelectorAll('button[data-aba]')];
    expect(abas.map((a) => a.textContent)).toEqual(['Importar banco', 'Casar lançamentos', 'Enriquecer (Excel)', 'Extrato gerencial', 'Conciliação']);
    const aberta = abas.find((a) => a.getAttribute('data-aba') === 'conciliacao')!;
    expect(aberta.className).toContain('bg-card');
    expect(aberta.className).toContain('inset_0_-2px_0_hsl(var(--primary))');
    for (const a of abas.filter((x) => x !== aberta)) expect(a.className).not.toContain('inset_0_-2px_0');
    /* o mesmo peso em todas: trocar de aba não muda a largura de nenhuma */
    expect(new Set(abas.map((a) => (a.className.match(/font-(medium|bold|semibold|normal)/) ?? [''])[0]))).toEqual(new Set(['font-medium']));
  });

  it('Resumo do mês: Saldo inicial e Saldo no sistema na faixa navy do Total; Entradas, Saídas e Saldo do extrato como os grupos; sem "(o mês fecha?)"', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('155.972,29'));
    const navy = 'bg-[hsl(213_52%_16%)]';
    const grupo = 'bg-[color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card)))]';
    expect(screen.getByTestId('resumo-saldo-inicial').className).toContain(navy);
    expect(screen.getByTestId('resumo-saldo-sistema').className).toContain(navy);
    for (const t of ['resumo-entradas', 'resumo-saidas', 'resumo-saldo-extrato']) expect(screen.getByTestId(t).className, t).toContain(grupo);
    expect(screen.getByTestId('resumo-entradas').className).toContain('text-success');
    expect(screen.getByTestId('resumo-saidas').className).toContain('text-destructive');
    expect(screen.getByTestId('resumo-diferenca').className).toContain('bg-muted');
    expect(screen.queryByText(/o mês fecha\?/)).toBeNull();
    /* o cabeçalho das colunas do Resumo é o mesmo do Saldos (22px), e o card tem a mesma barra (26px) */
    const thResumo = within(screen.getByTestId('card-resumo')).getByText('Movimento');
    const thSaldos = within(screen.getByTestId('card-saldos')).getByText('Conta');
    expect(thResumo.className).toBe(thSaldos.className.replace(' truncate', ''));
  });
});

/* ── P141 (CONC-LAYOUT-01): o ↗ da linha abre o "Extrato do sistema" da conta — a mesma fonte, os números do dono ── */
describe('P141 — o ↗ de "Saldos por conta"', () => {
  it('abre o modal da conta no mês, pede ao dono SÓ aquela conta e a faixa traz os números dele (nada somado)', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    expect(screen.queryByTestId('modal-extrato-sistema')).toBeNull();
    fireEvent.click(within(linhaDaConta(ID_LAV)).getByTestId('abrir-extrato-sistema'));
    const modal = await screen.findByTestId('modal-extrato-sistema');
    expect(within(modal).getByText(/^Extrato do sistema · .+ · set\/2026$/)).toBeInTheDocument();
    await waitFor(() => expect(B.rpcs.some((r) => r.fn === 'fn_conciliacao_resumo_mes'
      && JSON.stringify(r.args.p_conta_ids) === JSON.stringify([ID_LAV]))).toBe(true));
    await waitFor(() => expect(n(within(modal).getByTestId('es-saldo-final').textContent)).toBe('R$ 155.972,29'));
    expect(n(within(modal).getByTestId('es-saldo-inicial').textContent)).toBe('R$ 30.150,70');
    expect(n(within(modal).getByTestId('es-extrato').textContent)).toBe('R$ 155.972,29');
    expect(within(modal).getByText('Extrato 30/09/2026')).toBeInTheDocument();
    expect(n(within(modal).getByTestId('es-diferenca').textContent)).toBe('confere');
    expect(within(modal).getByTestId('aba-sistema-grande')).toBeInTheDocument();
    /* o ↗ não muda a conta escolhida (abre por cima, sem selecionar a linha) */
    expect(linhaDaConta(ID_LAV).getAttribute('data-ativa')).toBeNull();
  });
});

/* ── P141 D6 (Gabriel 28/10): Diferença positiva VERDE, negativa VERMELHA, "confere" verde — a regra do `corDaDiferenca` ── */
describe('P141 D6 — a cor da Diferença em "Saldos por conta"', () => {
  const corDe = (td: Element | null | undefined) => td?.className ?? '';
  it('positiva verde na conta e no grupo; "confere" verde; negativa vermelha', async () => {
    B.resumo['2026-09'] = [...B.resumo['2026-09'].map((l) => (l === LINHA_PARADA ? linhaConta({ ...LINHA_PARADA, proprio: undefined,
      saldo_extrato: 300100, diferenca: -100, motivos: [{ motivo: 'saldo_diverge', valor: -100 }] }) : l))];
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const dif = (id: string) => linhaDaConta(id).querySelectorAll('td')[5];
    expect(n(dif('cartao').textContent)).toBe('6.470,73');
    expect(corDe(dif('cartao'))).toContain('text-success');
    expect(corDe(dif('cartao'))).not.toContain('text-destructive');
    expect(corDe(dif(ID_LAV))).toContain('text-success');
    expect(n(dif('parada').textContent)).toBe('-100,00');
    expect(corDe(dif('parada'))).toContain('text-destructive');
    const grupoCartao = screen.getAllByTestId('faixa-grupo').find((g) => n(g.textContent) === 'Cartão')!.parentElement!;
    const tdDif = grupoCartao.querySelectorAll('td')[5];
    expect(n(tdDif.textContent)).toBe('6.470,73');
    expect(corDe(tdDif)).toContain('text-success');
  });
});
