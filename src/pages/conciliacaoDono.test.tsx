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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  B.inserts = []; B.rpcs = []; B.espelhoProps = []; B.tom = []; B.lapis = [];
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
    /* o status é o SALDO; o dia com diferença é 2ª prova, fora das frases do status */
    expect(n(motivos.textContent)).toBe('saldo diverge R$ 6.470,73');
    expect(n(screen.getByTestId('segunda-prova').textContent)).toBe('2ª prova · extrato2 dias com diferença');
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
    await waitFor(() => expect(n(screen.getByTestId('status-motivos').textContent)).toBe('saldo não informado'));
    const prova = screen.getByTestId('segunda-prova');
    expect(n(prova.textContent)).toBe('2ª prova · extratosem extrato');
    expect(prova.querySelector('[data-aviso="sem_extrato"]')?.className).toContain('text-muted-foreground');   // informa: neutro
    expect(screen.queryByTestId('link-dia')).toBeNull();
  });
});

describe('T4 — "Todas as contas": total, subtotais, contas não conciliadas, pendentes e sem conta, do dono', () => {
  it('uma conta divergente e uma que pesa sem saldo: NÃO CONCILIADO com o nome dela, e a diferença diz "falta saldo" (nunca "confere")', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('nao_conciliado'));
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('falta saldo · 1 conta');
    const motivos = screen.getByTestId('status-motivos');
    expect(n(motivos.textContent)).toContain('1 conta não conciliada');
    expect(within(motivos).getByTestId('conta-nao-conciliada').textContent).toBe('Cartão BB - Visa Infinite');
    expect(n(motivos.textContent)).toContain('1 pendente');
    /* T-g: as contas com aviso do extrato (além de "sem extrato"), do `contas_com_aviso` do dono */
    const prova = screen.getByTestId('segunda-prova');
    expect(n(prova.textContent)).toBe('2ª prova · extrato1 conta com aviso do extrato');
    expect(prova.querySelector('[data-aviso="contas_com_aviso"] [data-motivo]')?.getAttribute('title')).toBe('sem extrato: 1 · dias com diferença: 1');
    expect(n(screen.getByTestId('resumo-sem-conta').textContent)).toBe('lançamentos sem conta +R$ 100,00 / −R$ 869,29 (3)');
    expect(n(screen.getByTestId('total-sistema').textContent)).toBe('R$ 449.501,56');
    expect(screen.getByText('R$ 300.000,00', { selector: 'td.sticky' })).toBeInTheDocument(); // o subtotal Investimentos do dono
  });

  /* ── CONC-TOTAL-SEM-SALDO-01b — "sistema tem 12 mil, extrato tem 101 mil. Como que a diferença confere?" (Gabriel, 04/10). O
        dono anulou extrato e diferença do agregado com conta que pesa sem saldo; a tela diz o que falta, com UMA frase. ── */
  it('01b: "falta saldo · 1 conta" no Total, no subtotal Investimentos, no Resumo e no card Status — a MESMA frase, com os nomes no title', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('total-falta-saldo')).toBeInTheDocument());
    const pontos = [screen.getByTestId('total-falta-saldo'), screen.getByTestId('subtotal-falta-saldo-inv'), screen.getByTestId('resumo-falta-saldo')];
    for (const p of pontos) {
      expect(p.textContent).toBe('falta saldo · 1 conta');
      expect(p.getAttribute('title')).toBe('Invest Parado');
      /* a cor do status PENDENTE da paleta da conciliação — nunca o verde do "confere" nem o vermelho da diferença */
      expect(p.style.color).toBe('rgb(117, 117, 117)');
      expect(p.closest('td,span.text-success,span.text-destructive')?.className ?? '').not.toMatch(/text-success|text-destructive/);
    }
    expect(n(screen.getByTestId('status-motivos').textContent)).toContain('falta saldo · 1 conta');
    expect(n(screen.getByTestId('status-motivos').textContent)).not.toContain('contas sem saldo');
    /* a coluna Extrato do agregado continua "—", e nada diz "confere" no Total nem no Resumo */
    expect(screen.getByTestId('total-extrato').textContent).toBe('—');
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
    expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('pendente');
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

  it('01b (M4): no Total, que não tem data de saldo, o rótulo é só "Saldo extrato" e o rodapé não afirma data; com UMA conta com data, tudo como antes', async () => {
    B.resumo['2026-09'] = (SEM_SALDO.nj_2026_09 as Record<string, unknown>[]).map((l) => linhaConta(l)).concat([LINHA_EMERSON]);
    montar();
    await waitFor(() => expect(screen.getByTestId('total-diferenca').textContent).toBe('confere'));
    const rotulo = () => n(screen.getByTestId('resumo-saldo-extrato').parentElement?.textContent ?? '');
    expect(rotulo()).toBe('Saldo extrato R$ 1.281.055,45');
    expect(rotulo()).not.toMatch(/\(\d\d\/\d\d\)/);
    expect(screen.queryByTestId('resumo-rodape')).toBeNull();
    fireEvent.click(await screen.findByText('Sicredi Lavoura'));
    await waitFor(() => expect(rotulo()).toBe('Saldo extrato (30/09)R$ 155.972,29'));
    expect(n(screen.getByTestId('resumo-rodape').textContent)).toBe('A diferença compara o saldo do extrato de 30/09.');
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
const celulas = (id: string) => [...linhaDaConta(id).querySelectorAll('td')].slice(1, 4).map((td) => n(td.textContent));
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
    expect(celulas('brad')).toEqual(['-R$ 55.719,49', '-R$ 55.734,67', '-R$ 15,18']);
    expect(celulas('if')).toEqual(['-R$ 4,02', '-R$ 4,02', 'confere']);
    const tabela = n(linhaDaConta('brad').closest('table')?.textContent);
    expect(tabela).not.toContain('⊕');
    /* o consolidado do par aparece SÓ no Total (a linha do dono), nunca na linha da mãe */
    expect(linhaDaConta('brad').textContent).not.toContain('55.738,69');
    expect(linhaDaConta('brad').textContent).not.toContain('55.723,51');
    expect(n(screen.getByTestId('total-sistema').textContent)).toBe('-R$ 55.723,51');
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
    expect(marca('brad').className).toContain('whitespace-nowrap');
    expect([linhaDaConta('brad').getAttribute('data-status'), linhaDaConta('if').getAttribute('data-status')]).toEqual(['nao_conciliado', 'conciliado']);
    expect(linhaDaConta('brad').getAttribute('title')).not.toContain('consolida');
    expect(linhaDaConta('if').getAttribute('title')).toBe('Conciliado: conferida com Bradesco — 2ª prova · extrato: sem extrato');
    expect(within(linhaDaConta('if')).queryByTestId('marca-aviso-conta')).toBeNull();   // "sem extrato" informa, não marca
  });

  it('Resumo com a MÃE aberta: os números próprios (com a abertura terceiros × transferências) e o card diz "conferida com"', async () => {
    await abrirConta('brad');
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('-R$ 55.719,49'));
    expect(n(screen.getByTestId('resumo-saldo-inicial').textContent)).toBe('-R$ 39.997,27');
    expect(n(screen.getByTestId('resumo-entradas').textContent)).toBe('R$ 53.405,50');
    expect(n(screen.getByTestId('resumo-saidas').textContent)).toBe('-R$ 69.127,72');
    expect(n(screen.getByTestId('resumo-saldo-extrato').textContent)).toBe('-R$ 55.734,67');
    expect(n(screen.getByTestId('resumo-diferenca').textContent)).toBe('-R$ 15,18');
    const cartao = n(screen.getByTestId('resumo-saldo-sistema').closest('.rounded-lg, [class*="rounded"]')?.textContent);
    expect(cartao).toContain('R$ 53.305,50');   // ↳ transferências: as pernas com a interna
    const motivos = screen.getByTestId('status-motivos');
    expect(n(motivos.textContent)).toContain('saldo diverge −⁠R$ 15,18');
    expect(n(motivos.textContent)).toContain('conferida com Bradesco-Invest. Facil');
    expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('nao_conciliado');
  });

  it('Resumo com a INTERNA aberta: os números dela e o status PRÓPRIO (o par só aponta)', async () => {
    await abrirConta('if');
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('-R$ 4,02'));
    expect(n(screen.getByTestId('resumo-saldo-extrato').textContent)).toBe('-R$ 4,02');
    expect(screen.getByTestId('resumo-diferenca').textContent).toBe('confere');
    expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('conciliado');
    expect(n(screen.getByTestId('status-motivos').textContent)).toBe('conferida com Bradesco');
    expect(n(screen.getByTestId('segunda-prova').textContent)).toBe('2ª prova · extratosem extrato');
  });

  it('o lápis da linha abre com o extrato PRÓPRIO — o valor que o operador digitou (−55.734,67), nunca o consolidado', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    fireEvent.click(within(linhaDaConta('brad')).getByRole('button'));
    await waitFor(() => expect(B.lapis.length).toBe(1));
    expect(B.lapis[0]).toMatchObject({ contaId: 'brad', saldoAtual: -55734.67 });
    fireEvent.click(within(linhaDaConta('if')).getByRole('button'));
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
    expect(celulas(ID_LAV)).toEqual(['R$ 155.972,29', 'R$ 155.972,29', 'confere']);
    expect(celulas('cartao')).toEqual(['-R$ 6.470,73', 'R$ 0,00', 'R$ 6.470,73']);
    expect(celulas('parada')).toEqual(['R$ 300.000,00', '—', '—']);
    expect(screen.queryByTestId('marca-par')).toBeNull();
    fireEvent.click(linhaDaConta(ID_LAV));
    await waitFor(() => expect(n(screen.getByTestId('resumo-saldo-sistema').textContent)).toBe('R$ 155.972,29'));
    expect(n(screen.getByTestId('resumo-saldo-inicial').textContent)).toBe('R$ 30.150,70');
    expect(n(screen.getByTestId('resumo-entradas').textContent)).toBe(`R$ ${Number(EMERSON.resumo.entradas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.replace(/\s/g, ' '));
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

  it('NJ Sicredi Pessoal mar/26 (linha real): card VERDE; a 2ª prova diz 1 dia, o extrato que não fecha (0,02) e o sem par, em âmbar, com o link do dia', async () => {
    await abrirConta(PESSOAL.conta_id);
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('conciliado'));
    expect(screen.getByTestId('selo-mes').textContent).toBe('✅ Conciliado');
    expect(n(screen.getByTestId('status-motivos').textContent)).toBe('');   // nem "confere em todos os dias": há dia com diferença
    const prova = screen.getByTestId('segunda-prova');
    expect(n(prova.textContent)).toBe('2ª prova · extrato1 dia com diferençao extrato não fecha com o saldo informado R$ 0,021 lançamento sem par');
    for (const el of prova.querySelectorAll('[data-aviso]')) {
      expect(el.className).toContain('text-amber-700');
      expect(el.className).not.toMatch(/destructive|red/);
    }
    fireEvent.click(within(prova).getByTestId('link-dia'));
    await screen.findByTestId('espelho');
    const ult = B.espelhoProps[B.espelhoProps.length - 1];
    expect([ult.contaId, ult.aba, ult.diaFoco]).toEqual([PESSOAL.conta_id, 'conferencia', '2026-03-31']);
  });

  it('Saldos por conta: o ponto segue o status e a conta conciliada COM aviso leva o marcador âmbar; a sem aviso, não', async () => {
    montar();
    await screen.findAllByTestId('linha-saldo-conta');
    const linha = linhaDaConta(PESSOAL.conta_id);
    expect(linha.getAttribute('data-status')).toBe('conciliado');
    expect(within(linha).getByTestId('marca-aviso-conta')).toBeInTheDocument();
    expect(n(linha.getAttribute('title'))).toBe('Conciliado — 2ª prova · extrato: 1 dia com diferença · o extrato não fecha com o saldo informado R$ 0,02 · 1 lançamento sem par');
    expect(within(linhaDaConta(ID_LAV)).queryByTestId('marca-aviso-conta')).toBeNull();
    expect(linhaDaConta(ID_LAV).getAttribute('title')).toBe('Conciliado: confere em todos os dias');
  });

  it('conta SEM aviso nenhum (o Emerson): idêntica a antes — sem bloco de 2ª prova', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(within(screen.getByTestId('status-motivos')).getByText('confere em todos os dias')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByTestId('card-status').getAttribute('data-status')).toBe('conciliado'));
    expect(n(screen.getByTestId('segunda-prova').textContent)).toBe('2ª prova · extratosem extrato1 realizado após 17/09');
    expect(within(linhaDaConta(CDI.conta_id)).getByTestId('marca-aviso-conta')).toBeInTheDocument();
  });
});

/* ── PR-CONC-SALDOS-LAYOUT-01: só apresentação de "Saldos por conta" ── */
describe('LAYOUT — "Saldos por conta": sem a faixa amarela, negativo vermelho no Extrato, selecionada em navy', () => {
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
    expect(n(extratoDa('brad').textContent)).toBe('-R$ 55.734,67');
    expect(extratoDa('brad').className).toContain('text-destructive');
    expect(extratoDa('if').className).toContain('text-destructive');           // −4,02
    const subs = screen.getAllByTestId('subtotal-extrato');
    const sub = (txt: string) => subs.find((s) => n(s.textContent) === txt)!;
    expect(sub('-R$ 55.734,67').className).toContain('text-destructive');      // Conta corrente
    expect(sub('R$ 0,00').className).not.toContain('text-destructive');        // Cartão: zero não é negativo
    expect(n(screen.getByTestId('total-extrato').textContent)).toBe('-R$ 55.738,69');
    expect(screen.getByTestId('total-extrato').className).toContain('text-destructive');
    /* positivo e zero ficam na cor do texto */
    expect(n(extratoDa(ID_LAV).textContent)).toBe('R$ 155.972,29');
    expect(extratoDa(ID_LAV).className).not.toContain('text-destructive');
    expect(extratoDa('cartao').className).not.toContain('text-destructive');
    /* o Sistema segue a mesma regra, como antes */
    expect(screen.getByTestId('total-sistema').className).toContain('text-destructive');
  });

  it('(c) a conta selecionada tem o fundo navy a 10%, o filete e o nome em destaque; as demais ficam a 0,3', async () => {
    await abrirConta(ID_LAV);
    await waitFor(() => expect(linhaDaConta(ID_LAV).getAttribute('data-ativa')).toBe('sim'));
    const ativa = linhaDaConta(ID_LAV);
    expect(ativa.className).toContain('bg-primary/10');
    expect(ativa.style.opacity).toBe('1');
    expect(ativa.querySelector('td')?.className).toContain('shadow-[inset_3px_0_0_hsl(var(--primary))]');
    expect(within(ativa).getByTestId('nome-conta').className).toContain('font-semibold text-primary');
    for (const id of ['cartao', 'parada']) {
      const outra = linhaDaConta(id);
      expect(outra.style.opacity).toBe('0.3');
      expect(outra.className).not.toContain('bg-primary/10');
      expect(outra.querySelector('td')?.className).not.toContain('inset_3px');
      expect(within(outra).getByTestId('nome-conta').className).not.toContain('font-semibold');
    }
    /* sem seleção, ninguém apagado nem marcado */
    fireEvent.click(screen.getByText('← Todas'));
    await waitFor(() => expect(linhaDaConta(ID_LAV).getAttribute('data-ativa')).toBeNull());
    expect(screen.getAllByTestId('linha-saldo-conta').map((r) => r.style.opacity)).toEqual(['1', '1', '1']);
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
