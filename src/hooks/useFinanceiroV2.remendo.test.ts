/**
 * FIN-V2-REFRESH-01 — todo ramo de `editarLancamento` remenda a linha com o que o banco devolveu.
 *
 * ⚠ NASCE DE UM TITULO DE OC QUE O BANCO GRAVOU E A TELA NAO MOSTROU (8b211cae, 25/09/2026): o
 * Gabriel marcou Realizado com data de pagamento no Financeiro V2, o modal fechou e a linha seguiu
 * "Programado" ate' o F5. O ramo do titulo de OC gravava e retornava; so' o ramo comum relia a
 * linha e a remendava no estado — e a lista nao recarrega na edicao, de proposito
 * (PR-FIN-SAVE-LENTO-01).
 * ⚠ O CLIENTE SUPABASE E' UM CONSTRUTOR FALSO que responde por tabela e operacao e REGISTRA cada
 * chamada: "a lista nao recarregou" e' afirmado contando as consultas de lista feitas depois do
 * salvar — e o caso de controle prova que a contagem sabe achar uma (a carga inicial).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface Chamada { tabela: string; tipo: string; colunas: string | null; terminal: string | null }
const chamadas: Chamada[] = [];

const LANC_ID = 'e6b7b90c-b909-420b-8ce9-4ecbf0f49892';
const cenario = {
  /* O titulo que a lista carrega e o que o banco devolve depois do UPDATE. */
  origem: 'operacao_comercial' as string | null,
  statusDepois: 'realizado',
  pagamentoDepois: '2022-05-13' as string | null,
  verifyFalha: false,
};

const linhaBase = () => ({
  id: LANC_ID, cliente_id: 'cli', fazenda_id: 'faz', conta_bancaria_id: 'conta', conta_destino_id: null,
  data_competencia: '2021-12-02', data_pagamento: null, data_vencimento: '2022-04-13',
  valor: 882608.62, sinal: '1', tipo_operacao: '1-Entradas', status_transacao: 'programado',
  descricao: 'Boitel 210 G', macro_custo: 'Receita Operacional', grupo_custo: 'Receita Pecuária',
  centro_custo: 'Venda Peso Vivo', subcentro: 'Venda em Boitel', escopo_negocio: 'pecuaria',
  observacao: null, ano_mes: '2021-12', documento: null, historico: null, numero_documento: null,
  favorecido_id: 'fav', origem_lancamento: cenario.origem, origem_tipo: cenario.origem ? 'oc:obrigacao:principal:principal' : null,
  lote_importacao_id: null, forma_pagamento: null, dados_pagamento: null, cancelado: false,
  conciliado_em: null, editado_manual: false, created_by: 'u', created_at: '2026-09-25', updated_at: '2026-09-25',
  movimentacao_rebanho_id: null, recorrencia_id: null, safra_id: null, plano_conta_id: null, compoe_dre: true,
});

function responder(c: Chamada & { payload?: unknown }) {
  chamadas.push({ tabela: c.tabela, tipo: c.tipo, colunas: c.colunas, terminal: c.terminal });
  if (c.tabela === 'financeiro_lancamentos_v2') {
    if (c.tipo === 'update') return { data: null, error: null };
    if (c.terminal === 'maybeSingle') return { data: linhaBase(), error: null };            // o "atual" do editar
    if (c.terminal === 'single') {                                                          // o select de verificacao
      if (cenario.verifyFalha) return { data: null, error: { message: 'falha simulada' } };
      return { data: { ...linhaBase(), status_transacao: cenario.statusDepois, data_pagamento: cenario.pagamentoDepois }, error: null };
    }
    return { data: [linhaBase()], count: 1, error: null };                                  // a carga da lista
  }
  if (c.terminal === 'maybeSingle' || c.terminal === 'single') return { data: null, error: null };
  return { data: [], count: 0, error: null };
}

function construtor(tabela: string) {
  const st: Chamada & { payload?: unknown } = { tabela, tipo: 'select', colunas: null, terminal: null };
  const b: Record<string, unknown> = {};
  const encadeia = () => b;
  Object.assign(b, {
    select: (colunas?: string) => { if (st.tipo !== 'update') st.colunas = colunas ?? null; return b; },
    update: (payload: unknown) => { st.tipo = 'update'; st.payload = payload; return b; },
    single: () => Promise.resolve(responder({ ...st, terminal: 'single' })),
    maybeSingle: () => Promise.resolve(responder({ ...st, terminal: 'maybeSingle' })),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(responder({ ...st, terminal: null })).then(ok, erro),
  });
  for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) {
    b[m] = encadeia;
  }
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => construtor(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('@/lib/financeiro/conciliacaoSync', () => ({
  sincronizarVinculosDoLancamento: vi.fn(() => Promise.resolve()),
  recomputarStatusExtrato: vi.fn(() => Promise.resolve()),
}));

import { useFinanceiroV2, type LancamentoV2Form } from './useFinanceiroV2';

/* O form do modal: os estruturais IGUAIS ao gravado (o ramo de OC recusa mudar valor,
   classificacao, tipo ou competencia) e o gesto do Gabriel — realizado com data de pagamento. */
const form: LancamentoV2Form = {
  fazenda_id: 'faz', conta_bancaria_id: 'conta', data_competencia: '2021-12-02',
  data_pagamento: '2022-05-13', valor: 882608.62, tipo_operacao: '1-Entradas', status_transacao: 'realizado',
  descricao: 'Boitel 210 G', macro_custo: 'Receita Operacional', grupo_custo: 'Receita Pecuária',
  centro_custo: 'Venda Peso Vivo', subcentro: 'Venda em Boitel', favorecido_id: 'fav',
};

async function montarComLinha() {
  const { result } = renderHook(() => useFinanceiroV2());
  await act(async () => { await result.current.loadLancamentos({ ano: '2021' }, 0); });
  return result;
}
const consultasDeLista = () => chamadas.filter(c =>
  c.tabela === 'financeiro_lancamentos_v2' && c.tipo === 'select' && c.terminal === null).length;

describe('editarLancamento remenda a linha nos dois ramos', () => {
  beforeEach(() => {
    chamadas.length = 0;
    Object.assign(cenario, { origem: 'operacao_comercial', statusDepois: 'realizado', pagamentoDepois: '2022-05-13', verifyFalha: false });
  });

  it('titulo de OC: programado -> realizado com data, sem recarregar a lista', async () => {
    const r = await montarComLinha();
    expect(r.current.lancamentos[0]?.status_transacao).toBe('programado');
    /* A contagem SABE ACHAR: a carga inicial e' uma consulta de lista. */
    const antes = consultasDeLista();
    expect(antes).toBeGreaterThan(0);

    let ok: boolean | undefined;
    await act(async () => { ok = await r.current.editarLancamento(LANC_ID, form); });

    expect(ok).toBe(true);
    expect(r.current.lancamentos[0]?.status_transacao).toBe('realizado');
    expect(r.current.lancamentos[0]?.data_pagamento).toBe('2022-05-13');
    expect(consultasDeLista()).toBe(antes);
    /* ⚠ E FOI MESMO O RAMO DE OC: ele grava com UPDATE RESTRITO, que nao leva `valor`. */
    expect(chamadas.some(c => c.tipo === 'update')).toBe(true);
  });

  it('controle — titulo comum: o mesmo resultado, pelo ramo de sempre', async () => {
    cenario.origem = null;
    const r = await montarComLinha();
    const antes = consultasDeLista();
    await act(async () => { await r.current.editarLancamento(LANC_ID, form); });
    expect(r.current.lancamentos[0]?.status_transacao).toBe('realizado');
    expect(r.current.lancamentos[0]?.data_pagamento).toBe('2022-05-13');
    expect(consultasDeLista()).toBe(antes);
    /* O ramo comum pergunta pelo vinculo reverso da OC antes de decidir; o de OC, com o
       marcador na linha, nao precisa. E' o que prova que os dois casos passaram por ramos
       diferentes. */
    expect(chamadas.some(c => c.tabela === 'zoo_operacao_partes')).toBe(true);
  });

  it('falha do select de verificacao: nos dois ramos o save vale e a linha fica como estava', async () => {
    for (const origem of ['operacao_comercial', null]) {
      chamadas.length = 0;
      Object.assign(cenario, { origem, verifyFalha: true });
      const r = await montarComLinha();
      let ok: boolean | undefined;
      await act(async () => { ok = await r.current.editarLancamento(LANC_ID, form); });
      /* O UPDATE ja passou: o salvar nao desmente o banco. O que falta e' so' o retrato — a
         linha segue com o que tinha, e o F5 a acerta. Igual nos dois ramos. */
      expect(ok).toBe(true);
      expect(r.current.lancamentos[0]?.status_transacao).toBe('programado');
    }
  });
});
