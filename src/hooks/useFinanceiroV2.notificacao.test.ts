/**
 * FIN-V2-REFRESH-02 — escrita feita POR FORA do `useFinanceiroV2` avisa quem mostra lancamentos.
 *
 * ⚠ DUAS PORTAS GRAVAVAM NO FINANCEIRO SEM PASSAR PELO HOOK, e a lista do Financeiro V2 (um
 * `useState`, nao react-query) so' as via no F5: o parcelamento do `LancamentoV2Dialog` (RPC
 * `fn_parcelamento_cadastrar`) e a troca de favorecido das parcelas no `LancamentoZooModal`
 * (UPDATE direto). As duas passam a chamar `notificarLancamentosMudaram` — o canal que ja existia.
 * ⚠ "RECARREGOU COM OS ULTIMOS FILTROS" E' AFIRMADO PELOS FILTROS DA CONSULTA, nao pela contagem:
 * a instancia carrega dois recortes em sequencia (2025, depois 2026), e a recarga provocada pela
 * gravacao tem de repetir o SEGUNDO. Repetir o primeiro seria a lista voltando com outro filtro
 * do que o operador ve' — pior que nao atualizar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Op = [string, unknown[]];
interface Consulta { tabela: string; tipo: string; terminal: string | null; ops: Op[] }
const consultas: Consulta[] = [];
const falhas = { rpc: false, update: false };

function responder(c: Consulta) {
  consultas.push(c);
  if (c.tipo === 'update') return { data: null, error: falhas.update ? { message: 'falha simulada' } : null };
  if (c.terminal) return { data: null, error: null };
  if (c.tabela === 'financeiro_lancamentos_v2') return { data: [], count: 0, error: null };
  return { data: [], count: 0, error: null };
}

function construtor(tabela: string) {
  const c: Consulta = { tabela, tipo: 'select', terminal: null, ops: [] };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    update: () => { c.tipo = 'update'; return b; },
    single: () => Promise.resolve(responder({ ...c, terminal: 'single' })),
    maybeSingle: () => Promise.resolve(responder({ ...c, terminal: 'maybeSingle' })),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(responder(c)).then(ok, erro),
  });
  for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) {
    b[m] = (...args: unknown[]) => { c.ops.push([m, args]); return b; };
  }
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => construtor(t),
    rpc: (nome: string) => {
      consultas.push({ tabela: `rpc:${nome}`, tipo: 'rpc', terminal: null, ops: [] });
      return Promise.resolve({ data: null, error: falhas.rpc ? { message: 'falha simulada' } : null });
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));

import { useFinanceiroV2 } from './useFinanceiroV2';
import { gravarParcelamento } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { sincronizarFavorecidoDasParcelas } from '@/v2/components/edicao/LancamentoZooModal';
import { montarPayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';

const cargasDaLista = () => consultas.filter(c =>
  c.tabela === 'financeiro_lancamentos_v2' && c.tipo === 'select' && c.terminal === null);
/* O recorte de uma carga, sem a paginacao: o que ela PERGUNTOU ao banco. */
const recorte = (c: Consulta) => JSON.stringify(c.ops.filter(([m]) => m !== 'range' && m !== 'order'));

async function instanciaComDoisRecortes() {
  const { result } = renderHook(() => useFinanceiroV2());
  await act(async () => { await result.current.loadLancamentos({ ano: '2025' }, 0); });
  await act(async () => { await result.current.loadLancamentos({ ano: '2026' }, 0); });
  const cargas = cargasDaLista();
  /* ⚠ A CONTAGEM SABE ACHAR: as duas cargas de filtro estao la', e perguntaram coisas
     diferentes — sem isso, "repetiu o ultimo" passaria verde num recorte que nao distingue. */
  expect(cargas.length).toBeGreaterThanOrEqual(2);
  const ultimo = recorte(cargas[cargas.length - 1]);
  expect(ultimo).not.toBe(recorte(cargas[0]));
  return { result, antes: cargas.length, ultimo };
}

const CLASSIFICACAO = { plano_conta_id: null, safra_id: null, cultura: null, fase: null };
/* Um payload de verdade, pelo montador de producao — o mock da RPC nao o le, mas o tipo e' o dele. */
const PAYLOAD = montarPayloadParcelamento('cli', {
  fazendaId: 'faz', descricao: 'Energisa', valorTotal: 3000, totalParcelas: 3,
  dataPrimeiraParcela: '2026-10-10', dataCompetencia: '2026-09-25', intervaloMeses: 1,
  favorecidoId: null, formaPagamento: null, contaBancariaId: null, tipoFinanciamento: null,
  numeroContrato: null, observacao: null,
}, CLASSIFICACAO);

describe('gravacao por fora do hook recarrega a lista inscrita, com os ultimos filtros', () => {
  beforeEach(() => { consultas.length = 0; falhas.rpc = false; falhas.update = false; });

  it('parcelamento: a RPC passa e a instancia recarrega o recorte de 2026', async () => {
    const { antes, ultimo } = await instanciaComDoisRecortes();
    const invalidar = vi.fn(() => Promise.resolve());
    await act(async () => { await gravarParcelamento(PAYLOAD, 'cli', invalidar); });
    await waitFor(() => expect(cargasDaLista().length).toBe(antes + 1));
    expect(recorte(cargasDaLista()[antes])).toBe(ultimo);
    /* A invalidacao do react-query continua — ela serve as outras telas. */
    expect(invalidar).toHaveBeenCalledTimes(1);
  });

  it('troca de favorecido no modal zootecnico: o UPDATE passa e a instancia recarrega', async () => {
    const { antes, ultimo } = await instanciaComDoisRecortes();
    let ok: boolean | undefined;
    await act(async () => { ok = await sincronizarFavorecidoDasParcelas(['p1', 'p2'], 'fav', 'cli'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(cargasDaLista().length).toBe(antes + 1));
    expect(recorte(cargasDaLista()[antes])).toBe(ultimo);
  });

  it('falha da gravacao: nenhuma notificacao, nenhuma recarga — nas duas portas', async () => {
    const { antes } = await instanciaComDoisRecortes();

    falhas.rpc = true;
    await act(async () => {
      await expect(gravarParcelamento(PAYLOAD, 'cli', () => Promise.resolve())).rejects.toBeTruthy();
    });
    falhas.update = true;
    let ok: boolean | undefined;
    await act(async () => { ok = await sincronizarFavorecidoDasParcelas(['p1'], 'fav', 'cli'); });
    expect(ok).toBe(false);

    /* Da' tempo a uma notificacao indevida de disparar antes de afirmar que ela nao veio. */
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(cargasDaLista().length).toBe(antes);
  });
});
