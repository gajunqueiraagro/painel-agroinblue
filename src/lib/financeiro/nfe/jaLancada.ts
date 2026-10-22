/**
 * NOTA-JA-LANCADA-01 — a nota ja' lancada (PURO). O banco (`fn_nota_ja_lancada`) devolve os lancamentos do cliente que batem com a
 * nota (valor e data de uma parcela nos cadastros parecidos com o emitente; o numero; a chave); aqui cada parcela da nota fica com o
 * MAIS PROXIMO (menos centavos de diferenca, depois menos dias), cada lancamento uma vez so'. O que sobra pelo valor conta como
 * "parecidos a mais" (outra compra igual?); o que bateu so' pelo numero ou pela chave entra junto (e' a mesma nota).
 */

export interface LancamentoJaLancado {
  id: string;
  vencimento: string | null;
  pagamento: string | null;
  competencia: string | null;
  descricao: string | null;
  valorCent: number;
  status: string | null;
  conciliado: boolean;
  financiamentoId: string | null;
  numeroDocumento: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  /** como o cadastro dele se parece com o emitente: 'cnpj' (mesma raiz), 'nome' (sem CNPJ, nome parecido), 'mesclado' */
  fornecedorPor: string | null;
  parcelas: { n: number; difCent: number; difDias: number }[];
  por: ('valor' | 'numero' | 'chave')[];
}

export interface ParcelaDaNotaParaCasar { n: number; vencimento: string; valorCent: number }

export interface NotaJaLancada {
  /** uma linha por parcela da nota: o lancamento que a cobre, ou `null` (falta) */
  porParcela: { parcela: ParcelaDaNotaParaCasar; lancamento: LancamentoJaLancado | null }[];
  /** os que bateram so' pelo numero ou pela chave (sem parcela) */
  pelaNota: LancamentoJaLancado[];
  /** os que tambem bateram pelo valor e ficaram sem parcela (outra compra parecida?) */
  outrosParecidos: number;
  /** todos os lancamentos que recebem a nota no "Anexar" */
  alvos: LancamentoJaLancado[];
  faltam: ParcelaDaNotaParaCasar[];
}

export function casarJaLancados(parcelas: readonly ParcelaDaNotaParaCasar[], achados: readonly LancamentoJaLancado[]): NotaJaLancada | null {
  const pares = achados.flatMap((l) => l.parcelas.map((p) => ({ l, ...p })))
    .filter((x) => parcelas.some((p) => p.n === x.n))
    .sort((a, b) => a.difCent - b.difCent || a.difDias - b.difDias || a.n - b.n || a.l.id.localeCompare(b.l.id));
  const daParcela = new Map<number, LancamentoJaLancado>();
  const usados = new Set<string>();
  for (const x of pares) {
    if (daParcela.has(x.n) || usados.has(x.l.id)) continue;
    daParcela.set(x.n, x.l);
    usados.add(x.l.id);
  }
  const pelaNota = achados.filter((l) => !usados.has(l.id) && (l.por.includes('numero') || l.por.includes('chave')));
  for (const l of pelaNota) usados.add(l.id);
  if (usados.size === 0) return null;
  const outrosParecidos = achados.filter((l) => !usados.has(l.id)).length;
  const porParcela = parcelas.map((parcela) => ({ parcela, lancamento: daParcela.get(parcela.n) ?? null }));
  return {
    porParcela, pelaNota, outrosParecidos,
    alvos: [...porParcela.flatMap((x) => (x.lancamento ? [x.lancamento] : [])), ...pelaNota],
    faltam: porParcela.filter((x) => !x.lancamento).map((x) => x.parcela),
  };
}

/** As parcelas da nota para a busca: as duplicatas; sem duplicata, o valor da nota no vencimento escolhido (ou na emissao). */
export function parcelasParaCasar(duplicatas: readonly { vencimento: string; valorCent: number }[], notaCent: number, vencimento: string): ParcelaDaNotaParaCasar[] {
  if (duplicatas.length) return duplicatas.map((d, i) => ({ n: i + 1, vencimento: d.vencimento, valorCent: d.valorCent }));
  return [{ n: 1, vencimento, valorCent: notaCent }];
}

/** Le^ a linha do banco (snake_case) — nada fora do formato passa. */
export function lerJaLancados(r: unknown): LancamentoJaLancado[] {
  if (!Array.isArray(r)) return [];
  const texto = (o: object, k: string) => { const v: unknown = Reflect.get(o, k); return typeof v === 'string' && v ? v : null; };
  return r.flatMap((o: unknown) => {
    if (!o || typeof o !== 'object') return [];
    const id = texto(o, 'id');
    if (!id) return [];
    const parc: unknown = Reflect.get(o, 'parcelas');
    const por: unknown = Reflect.get(o, 'por');
    return [{
      id, vencimento: texto(o, 'vencimento'), pagamento: texto(o, 'pagamento'), competencia: texto(o, 'competencia'),
      descricao: texto(o, 'descricao'), valorCent: Number(Reflect.get(o, 'valor_cent')) || 0, status: texto(o, 'status'),
      conciliado: Reflect.get(o, 'conciliado') === true, financiamentoId: texto(o, 'financiamento_id'), numeroDocumento: texto(o, 'numero_documento'),
      fornecedorId: texto(o, 'fornecedor_id'), fornecedorNome: texto(o, 'fornecedor_nome'), fornecedorPor: texto(o, 'fornecedor_por'),
      parcelas: Array.isArray(parc) ? parc.flatMap((p: unknown) => (p && typeof p === 'object'
        ? [{ n: Number(Reflect.get(p, 'n')), difCent: Number(Reflect.get(p, 'dif_cent')) || 0, difDias: Number(Reflect.get(p, 'dif_dias')) || 0 }] : [])) : [],
      por: Array.isArray(por) ? por.filter((x): x is 'valor' | 'numero' | 'chave' => x === 'valor' || x === 'numero' || x === 'chave') : [],
    }];
  });
}
