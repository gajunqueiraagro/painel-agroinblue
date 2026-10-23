/**
 * NOTA-JA-LANCADA-01 — a nota ja' lancada (PURO). O banco (`fn_nota_ja_lancada`) devolve os lancamentos do cliente que batem com a
 * nota (valor e data de uma parcela nos cadastros parecidos com o emitente; o numero; a chave); aqui cada parcela da nota fica com o
 * MAIS PROXIMO (menos centavos de diferenca, depois menos dias), cada lancamento uma vez so'. O que sobra pelo valor conta como
 * "parecidos a mais" (outra compra igual?); o que bateu so' pelo numero ou pela chave entra junto (e' a mesma nota).
 */
import { reais } from '@/lib/financeiro/nfe/formatos';

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
  /** NOTA-CONTAS-NA-CRIACAO-01 D — cancelado: aparece cinza, no fim, e NUNCA conta como "ja' lancada" nem recebe o "Anexar" */
  cancelado: boolean;
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
  /** NOTA-CONTAS-NA-CRIACAO-01 C — dos achados so' pelo numero/chave, os que sao uma FRACAO da nota (valor x N = a nota): id -> N */
  fracoes: ReadonlyMap<string, number>;
  /** a nota de uma parcela so' achada EM PARCELAS (a linha "falta" da nota inteira some, e nada se oferece criar) */
  emParcelas: boolean;
  /** D — os CANCELADOS desta nota (pelo numero ou pela chave): so' para mostrar, no fim da lista */
  cancelados: LancamentoJaLancado[];
}

/**
 * NOTA-CONTAS-NA-CRIACAO-01 C (P75) — o lancamento e' uma PARCELA da nota quando o valor x N bate com ela (1 centavo de folga por parcela,
 * o arredondamento de quem dividiu): 821,22 x 4 = 3.284,88. Devolve o menor N (2 a 72), ou `null`. Qual das N, a nota nao diz — a tela
 * mostra "parcela ? de N".
 */
export function fracaoDaNota(valorCent: number, notaCent: number): number | null {
  if (!(valorCent > 0) || !(notaCent > valorCent)) return null;
  for (let n = 2; n <= 72; n++) if (Math.abs(valorCent * n - notaCent) <= n) return n;
  return null;
}

export function casarJaLancados(parcelas: readonly ParcelaDaNotaParaCasar[], todos: readonly LancamentoJaLancado[], notaCent = 0): NotaJaLancada | null {
  /* D — o cancelado nunca casa parcela, nunca e' alvo e sozinho nao faz a nota "ja' lancada" */
  const achados = todos.filter((l) => !l.cancelado);
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
  const fracoes = new Map<string, number>();
  for (const l of pelaNota) { const n = fracaoDaNota(l.valorCent, notaCent); if (n) fracoes.set(l.id, n); }
  /* a nota de UMA parcela (sem duplicatas) ja' lancada EM PARCELAS: a "que falta" seria a nota inteira de novo — em dobro. Nao se oferece. */
  const emParcelas = parcelas.length === 1 && fracoes.size > 0;
  return {
    porParcela, pelaNota, outrosParecidos, fracoes, emParcelas, cancelados: canceladosDaNota(todos),
    alvos: [...porParcela.flatMap((x) => (x.lancamento ? [x.lancamento] : [])), ...pelaNota],
    faltam: emParcelas ? [] : porParcela.filter((x) => !x.lancamento).map((x) => x.parcela),
  };
}

/** D — os cancelados achados (pela data, o mais antigo primeiro). */
export function canceladosDaNota(todos: readonly LancamentoJaLancado[]): LancamentoJaLancado[] {
  const data = (l: LancamentoJaLancado) => l.vencimento ?? l.pagamento ?? l.competencia ?? '';
  return todos.filter((l) => l.cancelado).sort((a, b) => data(a).localeCompare(data(b)) || a.id.localeCompare(b.id));
}

/** A frase do rodape da nota achada EM PARCELAS: "achadas 1 de 4 parcelas (R$ 821,22 cada)" — o N mais comum entre as achadas. */
export function fraseEmParcelas(j: Pick<NotaJaLancada, 'fracoes' | 'pelaNota'>): string {
  const porN = new Map<number, number>();
  for (const n of j.fracoes.values()) porN.set(n, (porN.get(n) ?? 0) + 1);
  const [n, qtd] = [...porN].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
  const uma = j.pelaNota.find((l) => j.fracoes.get(l.id) === n);
  return `Esta nota parece já lançada em parcelas: ${qtd === 1 ? 'achada 1' : `achadas ${qtd}`} de ${n} (R$ ${reais(uma?.valorCent ?? 0)} cada). Nada será criado em dobro.`;
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
      cancelado: Reflect.get(o, 'cancelado') === true,
    }];
  });
}
