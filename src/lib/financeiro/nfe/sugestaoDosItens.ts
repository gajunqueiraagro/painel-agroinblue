/**
 * A SUGESTÃO DA CONTA PELOS ITENS DA NOTA — o leitor ÚNICO da resposta do banco (DA-NOTA-CLASSIF-01; NOTA-ITENS-SUGESTAO, Gabriel 27/11,
 * lote 114360). A escada mora no banco (`fn_itens_sugerir_conta`: regra do item > mesmo produto > NCM no cliente > família NCM >
 * último deste fornecedor > nada; a `fn_nota_itens_sugerir_conta` é a mesma para a nota já gravada). Aqui só se lê a resposta e se
 * resume para a tela: UMA conta (a classificação já vem preenchida, a faixa diz a origem), VÁRIAS (o aviso pequeno "N itens em X
 * classificações · ver por item") ou NENHUMA. Material de construção/cerca/água/elétrica volta com `pergunta` e as duas contas
 * (obra/reforma × manutenção): não decide sozinho. PURO.
 */

export interface OpcaoDaPergunta { planoContaId: string; subcentro: string }

export interface ItemSugerido {
  /** nulo na nota ainda NÃO gravada (Novo · do XML): o item se acha pelo `nItem` */
  itemId: string | null;
  nItem: number;
  planoContaId: string | null;
  subcentro: string | null;
  /** 'regra' | 'mesmo_produto' | 'ncm_cliente' | 'familia' | 'familia_pergunta' | 'fornecedor' | 'sem_sugestao' */
  fonte: string;
  confianca: 'alta' | 'media' | 'baixa' | null;
  /** a frase pronta do banco para o ⓘ (mostrar como vem) */
  porque: string;
  /** a origem curta para a linha ("mesmo produto em 14/08", "último deste fornecedor"); nula sem sugestão */
  origem: string | null;
  /** I1 — obra/reforma × manutenção: a tela pergunta (sem conta até a resposta) */
  pergunta: { manutencao: OpcaoDaPergunta; obra: OpcaoDaPergunta } | null;
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const CONFIANCAS: readonly NonNullable<ItemSugerido['confianca']>[] = ['alta', 'media', 'baixa'];
const confiancaDe = (v: unknown): ItemSugerido['confianca'] => CONFIANCAS.find((c) => c === v) ?? null;

function opcao(v: unknown): OpcaoDaPergunta | null {
  if (!v || typeof v !== 'object') return null;
  const planoContaId = txt(Reflect.get(v, 'plano_conta_id'));
  const subcentro = txt(Reflect.get(v, 'subcentro'));
  return planoContaId && subcentro ? { planoContaId, subcentro } : null;
}

/** A resposta da RPC → os itens (o que não tem a forma do contrato fica de fora; resposta sem `itens` = lista vazia). */
export function lerItensSugeridos(data: unknown): ItemSugerido[] {
  const itens: unknown = data && typeof data === 'object' ? Reflect.get(data, 'itens') : null;
  if (!Array.isArray(itens)) return [];
  return itens.flatMap((i: unknown): ItemSugerido[] => {
    if (!i || typeof i !== 'object') return [];
    const itemId = txt(Reflect.get(i, 'item_id'));
    const nItem = Number(Reflect.get(i, 'n_item'));
    if (!itemId && !(nItem > 0)) return [];
    const ops: unknown = Reflect.get(i, 'opcoes');
    const manutencao = Reflect.get(i, 'pergunta') === true && ops && typeof ops === 'object' ? opcao(Reflect.get(ops, 'manutencao')) : null;
    const obra = manutencao && ops && typeof ops === 'object' ? opcao(Reflect.get(ops, 'obra')) : null;
    return [{
      itemId, nItem: nItem > 0 ? nItem : 0, planoContaId: txt(Reflect.get(i, 'plano_conta_id')), subcentro: txt(Reflect.get(i, 'subcentro')),
      fonte: txt(Reflect.get(i, 'fonte')) ?? 'sem_sugestao', confianca: confiancaDe(Reflect.get(i, 'confianca')),
      porque: txt(Reflect.get(i, 'porque')) ?? '', origem: txt(Reflect.get(i, 'origem')),
      pergunta: manutencao && obra ? { manutencao, obra } : null,
    }];
  });
}

/** O "último deste fornecedor" da resposta (a conta da nota quando nenhum item é conhecido). */
export interface SugestaoDoFornecedor { planoContaId: string; subcentro: string; ultimo: string | null }
export function lerSugestaoDoFornecedor(data: unknown): SugestaoDoFornecedor | null {
  const f: unknown = data && typeof data === 'object' ? Reflect.get(data, 'fornecedor') : null;
  if (!f || typeof f !== 'object') return null;
  const planoContaId = txt(Reflect.get(f, 'plano_conta_id'));
  const subcentro = txt(Reflect.get(f, 'subcentro'));
  return planoContaId && subcentro ? { planoContaId, subcentro, ultimo: txt(Reflect.get(f, 'ultimo')) } : null;
}

/** O que a etapa 2 do "+ Da nota" mostra: uma conta para todas, os itens em contas diferentes, ou nada a sugerir. */
export type SugestaoParaAsParcelas =
  | { tipo: 'uma'; planoContaId: string; subcentro: string; porque: string; igualAHoje: boolean }
  | { tipo: 'varias'; contas: number }
  | { tipo: 'nenhuma' };

/**
 * Os itens → a sugestão para as parcelas. UMA conta só quando TODOS os itens com sugestão vão para ela (o item sem sugestão não decide);
 * itens em contas diferentes = "varias" (a divisão pelos itens é a etapa 3, não um palpite aqui). Item que PERGUNTA (obra ×
 * manutenção) conta como uma conta a decidir: nunca "uma". `planoHoje` = as contas das parcelas hoje: se todas já estão na sugerida,
 * `igualAHoje` (a tela diz "já está na sugerida", sem botão).
 */
export function sugestaoParaAsParcelas(itens: readonly ItemSugerido[], planoHoje: readonly (string | null)[]): SugestaoParaAsParcelas {
  const comConta = itens.filter((i) => i.planoContaId && i.subcentro);
  const aDecidir = itens.filter((i) => i.pergunta).length;
  if (!comConta.length && !aDecidir) return { tipo: 'nenhuma' };
  const contas = new Set(comConta.map((i) => i.planoContaId));
  if (contas.size + (aDecidir ? 1 : 0) > 1 || !comConta.length) return { tipo: 'varias', contas: contas.size + (aDecidir ? 1 : 0) };
  const i = comConta[0];
  /* o porquê: o do item mais confiável (a frase do banco, como vem) */
  const ordem: Record<NonNullable<ItemSugerido['confianca']>, number> = { alta: 0, media: 1, baixa: 2 };
  const melhor = [...comConta].sort((a, b) => (a.confianca ? ordem[a.confianca] : 3) - (b.confianca ? ordem[b.confianca] : 3))[0];
  return {
    tipo: 'uma', planoContaId: i.planoContaId ?? '', subcentro: i.subcentro ?? '', porque: melhor.porque,
    igualAHoje: planoHoje.length > 0 && planoHoje.every((p) => p === i.planoContaId),
  };
}

/** A conta de cada item que a vista "Contas" usa de partida (o item que pergunta fica SEM conta até a resposta). */
export function contasSugeridasDosItens(itens: readonly ItemSugerido[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const i of itens) if (i.planoContaId && !i.pergunta) m.set(i.nItem, i.planoContaId);
  return m;
}

/** O resumo para o NOVO lançamento (a faixa da Classificação e o aviso pequeno). `valorDoItem` = o líquido de cada item (centavos). */
export type ResumoDaSugestao =
  | { tipo: 'uma'; planoContaId: string; subcentro: string; itens: number; peloFornecedor: boolean; nomes: string[] }
  | { tipo: 'varias'; itens: number; classificacoes: number; aDecidir: number; maior: { planoContaId: string; subcentro: string } | null }
  | { tipo: 'nenhuma' };

export function resumoDaSugestao(itens: readonly ItemSugerido[], valorDoItem: ReadonlyMap<number, number>,
  descricaoDoItem: ReadonlyMap<number, string>): ResumoDaSugestao {
  const comConta = itens.filter((i) => i.planoContaId && i.subcentro && !i.pergunta);
  const aDecidir = itens.filter((i) => i.pergunta).length;
  if (!comConta.length && !aDecidir) return { tipo: 'nenhuma' };
  const porConta = new Map<string, { subcentro: string; cent: number }>();
  for (const i of comConta) {
    const p = i.planoContaId ?? '';
    const x = porConta.get(p) ?? { subcentro: i.subcentro ?? '', cent: 0 };
    x.cent += valorDoItem.get(i.nItem) ?? 0;
    porConta.set(p, x);
  }
  if (porConta.size === 1 && !aDecidir) {
    const [planoContaId, x] = [...porConta][0];
    const peloFornecedor = comConta.every((i) => i.fonte === 'fornecedor');
    const nomes = comConta.filter((i) => i.fonte !== 'fornecedor').map((i) => nomeCurtoDoItem(descricaoDoItem.get(i.nItem) ?? '')).filter(Boolean);
    return { tipo: 'uma', planoContaId, subcentro: x.subcentro, itens: itens.length, peloFornecedor, nomes: [...new Set(nomes)] };
  }
  /* Q2 (Gabriel 27/11) — o "Juntar tudo numa conta" e a classificação de partida = a conta de MAIOR valor */
  const maior = [...porConta].sort((a, b) => b[1].cent - a[1].cent || a[1].subcentro.localeCompare(b[1].subcentro, 'pt-BR'))[0];
  return { tipo: 'varias', itens: itens.length, classificacoes: porConta.size, aDecidir, maior: maior ? { planoContaId: maior[0], subcentro: maior[1].subcentro } : null };
}

/** "SAL MINERAL 80 P SC 30KG" → "sal mineral" (as 2 primeiras palavras, em minúsculas; o resto vai no title). */
export function nomeCurtoDoItem(descricao: string): string {
  return descricao.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter((p) => /\p{L}/u.test(p)).slice(0, 2).join(' ');
}

/** A frase da faixa amarela da Classificação (uma linha; o resto no title). */
export function fraseDaFaixa(r: ResumoDaSugestao, fornecedor: SugestaoDoFornecedor | null, dataCurta: (iso: string) => string): string | null {
  if (r.tipo === 'uma') {
    if (r.peloFornecedor) return `Classificação sugerida: ${r.subcentro} · último deste fornecedor${fornecedor?.ultimo ? ` (${dataCurta(fornecedor.ultimo)})` : ''} · nenhum item conhecido`;
    const nomes = r.nomes.slice(0, 3).join(', ') + (r.nomes.length > 3 ? '…' : '');
    return `Classificação sugerida pelos itens (${r.itens}): ${r.subcentro}${nomes ? ` · ${nomes}` : ''}`;
  }
  if (r.tipo === 'varias') {
    /* a nota só de material (areia, brita, cerca…): nenhum item decide sozinho */
    if (r.classificacoes === 0) return `A nota tem ${r.itens} ${r.itens === 1 ? 'item' : 'itens'}: ${r.aDecidir === 1 ? 'espera' : 'todos esperam'} obra ou manutenção`;
    return `A nota tem ${r.itens} itens em ${r.classificacoes} ${r.classificacoes === 1 ? 'classificação' : 'classificações'}`
      + (r.aDecidir ? ` (${r.aDecidir} a decidir: obra ou manutenção)` : '');
  }
  return null;
}
