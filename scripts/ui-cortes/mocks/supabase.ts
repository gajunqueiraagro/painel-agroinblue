/* UI-SEM-CORTE-01 — o cliente Supabase da bancada: nada sai da maquina. Cada tela registra o seu banco em `globalThis.__bancoBancada`
 * (from(tabela, estado) -> linhas; rpc(fn, args) -> dado); a cadeia guarda os filtros que importam (eq, in, is, range, single). */
type Estado = { eq: Record<string, unknown>; in: Record<string, unknown[]>; is: Record<string, unknown>; range: [number, number] | null; um: boolean };
type Banco = { from?: (t: string, e: Estado) => unknown[]; rpc?: (fn: string, a: Record<string, unknown>) => unknown };
const banco = (): Banco => (globalThis as unknown as { __bancoBancada?: Banco }).__bancoBancada ?? {};
/* OC-HOSPEDEIRO-LEVE-01 — cada pedido ao banco fica anotado em `globalThis.__pedidosBancada` (tipo, nome, instante): a medicao do
   hospedeiro da OC le^ dali o que disparou ate' a OC ficar pronta */
const anotar = (tipo: 'from' | 'rpc', nome: string) => {
  const g = globalThis as unknown as { __pedidosBancada?: { tipo: string; nome: string; ms: number; quem: string[] }[] };
  /* quem pediu: os quadros da pilha que sao do app (src/), do mais proximo ao mais distante */
  const quem = (new Error().stack ?? '').split('\n').map((l) => /\/src\/([^?:)]+)(?:\?[^:)]*)?:(\d+)/.exec(l)).filter(Boolean)
    .map((m) => `${m![1]}:${m![2]}`).filter((f) => !f.startsWith('integrations/'));
  (g.__pedidosBancada ??= []).push({ tipo, nome, ms: performance.now(), quem });
};
const cadeia = (tabela: string) => {
  const e: Estado = { eq: {}, in: {}, is: {}, range: null, um: false };
  const p: any = new Proxy(() => undefined, { get: (_a, nome: string) => {
    if (nome === 'then') return (ok: any, falha?: any) => {
      let linhas = (banco().from?.(tabela, e) ?? []) as unknown[];
      const total = linhas.length;
      if (e.range) linhas = linhas.slice(e.range[0], e.range[1] + 1);
      return Promise.resolve({ data: e.um ? linhas[0] ?? null : linhas, error: null, count: total }).then(ok, falha);
    };
    return (...a: any[]) => {
      if (nome === 'eq') e.eq[a[0]] = a[1];
      if (nome === 'in') e.in[a[0]] = a[1];
      if (nome === 'is') e.is[a[0]] = a[1];
      if (nome === 'range') e.range = [a[0], a[1]];
      if (nome === 'single' || nome === 'maybeSingle') e.um = true;
      return p;
    };
  } });
  return p;
};
export const supabase: any = {
  from: (t: string) => { anotar('from', t); return cadeia(t); },
  /* a tela pode responder uma RECUSA do banco: `{ __erro: 'codigo: frase' }` vira `{ data: null, error: { message } }` */
  rpc: (fn: string, a: Record<string, unknown>) => {
    anotar('rpc', fn);
    const r: any = banco().rpc?.(fn, a ?? {}) ?? null;
    const resposta = r && typeof r === 'object' && '__erro' in r ? { data: null, error: { code: 'CBLOC', message: r.__erro } } : { data: r, error: null };
    /* Ajuste 11 — `&lento=1`: a busca "nota já lançada" demora 2 s (o print da 1ª abertura mostra o esqueleto, nunca a tela antiga) */
    const lento = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lento') === '1' && fn === 'fn_nota_ja_lancada';
    return lento ? new Promise((ok) => setTimeout(() => ok(resposta), 2000)) : Promise.resolve(resposta);
  },
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  /* ITENS-NOTA-01 — `download` le^ de `globalThis.__arquivosBancada[caminho]` (bytes SINTETICOS que a tela registra); sem ele, o "nao achado" */
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }), download: async (c: string) => {
    const a = (globalThis as unknown as { __arquivosBancada?: Record<string, ArrayBuffer> }).__arquivosBancada?.[c];
    return a ? { data: new Blob([a]), error: null } : { data: null, error: { message: 'Object not found' } };
  } }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
