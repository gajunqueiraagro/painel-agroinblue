/**
 * PR-FIN-LISTA-VENCIMENTO-03 — diferencial LISTA × RPC contra o PostgREST REAL.
 *
 * Os testes unitários provam a lista contra um PostgREST simulado, e a suíte SQL
 * prova a RPC contra valores conhecidos por construção. Falta o encontro dos
 * dois: para o MESMO `FiltrosV2`, a contagem que a RPC devolve tem de ser
 * exatamente o número de linhas que a lista traz. Se os predicados divergirem —
 * e são duas implementações independentes, uma em PostgREST e outra em SQL —,
 * é aqui que aparece.
 *
 * Só roda com a stack local de pé:
 *     INTEGRACAO_LOCAL=1 npx vitest run src/lib/financeiro/listaPaginadaV2.integracao.test.ts
 * Sem a variável, a suíte inteira é pulada, para não quebrar o gate normal.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import {
  consultarPagina,
  consultarTotais,
  totaisNoCliente,
  VIEW_LISTA_DOC,
  RPC_TOTAIS,
  type AbrirView,
  type BuilderView,
  type ChamarRpcTotais,
  type RegistroListaV2,
} from './listaPaginadaV2';
import type { FiltrosV2 } from './filtrosBaseV2';

const ATIVO = process.env.INTEGRACAO_LOCAL === '1';
const URL = 'http://127.0.0.1:54321';
const SEGREDO = 'super-secret-jwt-token-with-at-least-32-characters-long';
const CLIENTE = process.env.INTEGRACAO_CLIENTE ?? '';
const USUARIO = process.env.INTEGRACAO_USUARIO ?? '';

function b64url(v: Buffer | string): string {
  return Buffer.from(v).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** JWT HS256 para o papel `authenticated`, como o GoTrue emitiria. */
function jwt(sub: string): string {
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    sub, role: 'authenticated', aud: 'authenticated',
    exp: 2000000000, iat: 1700000000,
  }));
  const assin = b64url(createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest());
  return `${cab}.${corpo}.${assin}`;
}

let cliente: SupabaseClient;
let abrir: AbrirView;
let chamar: ChamarRpcTotais;

beforeAll(() => {
  if (!ATIVO) return;
  const token = jwt(USUARIO);
  cliente = createClient(URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  abrir = (colunas) =>
    (cliente as unknown as { from: (r: string) => { select: (c: string) => BuilderView } })
      .from(VIEW_LISTA_DOC).select(colunas);
  chamar = (params) =>
    (cliente as unknown as {
      rpc: (n: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
    }).rpc(RPC_TOTAIS, params as unknown as Record<string, unknown>)
      .then((r) => ({ data: r.data as never, error: r.error }));
});

/** Traz o conjunto INTEIRO pela lista, em páginas, só para conferir a RPC. */
async function listaCompleta(filtros: FiltrosV2) {
  const todas: RegistroListaV2[] = [];
  for (let pagina = 0; pagina < 200; pagina++) {
    const p = await consultarPagina(abrir, CLIENTE, filtros, { pagina, tamanhoPagina: 200 });
    todas.push(...(p as unknown as RegistroListaV2[]));
    if (p.length < 200) break;
  }
  return todas;
}

describe.skipIf(!ATIVO)('diferencial LISTA × RPC no PostgREST real', () => {
  const casos: [string, FiltrosV2][] = [
    ['março/2026',                 { ano: '2026', mes: '03' }],
    ['ano inteiro',                { ano: '2026' }],
    ['sem período',                { ano: '__todos__' }],
    ['mês em qualquer ano',        { ano: '__todos__', mes: '03' }],
    ['dimensão vencimento',        { ano: '2026', mes: '03', dimensao: 'vencimento' }],
    ['dimensão competência',       { ano: '2026', mes: '03', dimensao: 'competencia' }],
    ['dimensão pagamento',         { ano: '2026', mes: '03', dimensao: 'pagamento' }],
    ['multimês',                   { ano: '2026', meses: ['03', '04'] }],
    ['direção origem',             { ano: '2026', lista_conta_direcao: 'origem' }],
    ['direção destino',            { ano: '2026', lista_conta_direcao: 'destino' }],
    ['produto',                    { ano: '2026', lista_produto: 'G2' }],
    ['produto com asterisco',      { ano: '2026', lista_produto: 'G1*x' }],
    ['atividade canônica',         { ano: '2026', lista_atividade: 'agricultura' }],
    ['atividade outros',           { ano: '2026', lista_atividade: 'outros' }],
    ['grupo de custo',             { ano: '2026', lista_grupo_custo: 'Nutricao' }],
    ['documento cru',              { ano: '2026', lista_documento: '201' }],
    ['documento formatado',        { ano: '2026', lista_documento: 'NF 000.000.111' }],
    ['documento com parêntese',    { ano: '2026', lista_documento: 'p(q)' }],
    ['status',                     { ano: '2026', status_transacoes: ['previsto'] }],
    ['combinação',                 { ano: '2026', mes: '03', lista_atividade: 'pecuaria', lista_grupo_custo: 'Nutricao' }],
  ];

  it.each(casos)('%s — total e somas coincidem', async (_n, filtros) => {
    const linhas = await listaCompleta(filtros);
    const rpc = await consultarTotais(chamar, CLIENTE, filtros);
    const soma = totaisNoCliente(linhas);

    expect(rpc.total).toBe(linhas.length);
    expect(Number(rpc.entradas)).toBeCloseTo(soma.entradas, 2);
    expect(Number(rpc.saidas)).toBeCloseTo(soma.saidas, 2);
  });

  it('incluirSemVencimento move os dois lados juntos', async () => {
    const filtros: FiltrosV2 = { ano: '2026', mes: '03', dimensao: 'vencimento' };
    const semOpt = await consultarTotais(chamar, CLIENTE, filtros);
    const comOpt = await consultarTotais(chamar, CLIENTE, filtros, { incluirSemVencimento: true });
    const listaCom = await consultarPagina(abrir, CLIENTE, filtros, {
      tamanhoPagina: 200, incluirSemVencimento: true,
    });
    expect(comOpt.total).toBe(listaCom.length);
    expect(comOpt.total).toBeGreaterThanOrEqual(semOpt.total);   // aditivo, nunca estreita
    expect(comOpt.excluidosSemVencimento).toBe(0);
  });

  it('a RPC não vaza tenant vizinho nem quando o id é passado', async () => {
    const alheio = process.env.INTEGRACAO_CLIENTE_VIZINHO ?? '';
    const r = await consultarTotais(chamar, alheio, { ano: '__todos__' });
    expect(r.total).toBe(0);
  });
});
