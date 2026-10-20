/* UI-SEM-CORTE-01 — o cliente Supabase da bancada: nada sai da maquina. Cada tela registra o seu banco em `globalThis.__bancoBancada`
 * (from(tabela, estado) -> linhas; rpc(fn, args) -> dado); a cadeia guarda os filtros que importam (eq, in, is, range, single). */
type Estado = { eq: Record<string, unknown>; in: Record<string, unknown[]>; is: Record<string, unknown>; range: [number, number] | null; um: boolean };
type Banco = { from?: (t: string, e: Estado) => unknown[]; rpc?: (fn: string, a: Record<string, unknown>) => unknown };
const banco = (): Banco => (globalThis as unknown as { __bancoBancada?: Banco }).__bancoBancada ?? {};
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
  from: (t: string) => cadeia(t),
  /* a tela pode responder uma RECUSA do banco: `{ __erro: 'codigo: frase' }` vira `{ data: null, error: { message } }` */
  rpc: (fn: string, a: Record<string, unknown>) => {
    const r: any = banco().rpc?.(fn, a ?? {}) ?? null;
    return Promise.resolve(r && typeof r === 'object' && '__erro' in r ? { data: null, error: { code: 'CBLOC', message: r.__erro } } : { data: r, error: null });
  },
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
