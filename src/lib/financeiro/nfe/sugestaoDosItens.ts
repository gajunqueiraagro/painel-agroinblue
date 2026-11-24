/**
 * DA-NOTA-CLASSIF-01 (Gabriel 24/11 09:17) — a SUGESTÃO DA CONTA PELOS ITENS (PLANO-SUGESTAO-01 B2: `fn_nota_itens_sugerir_conta`) na etapa 2
 * "Como vai ficar": só SUGERE. A tela mostra "Sugestão pelos itens: <subcentro> · usar"; nada muda sem o clique (e o clique só põe a conta no
 * "Aplicar a todas" — grava o botão do rodapé, como sempre). A escada e o porquê moram no banco; aqui só se lê a resposta e se decide se ela
 * cabe numa conta só para as parcelas. PURO.
 */

export interface ItemSugerido {
  itemId: string;
  nItem: number;
  planoContaId: string | null;
  subcentro: string | null;
  fonte: string;
  confianca: 'alta' | 'media' | 'baixa' | null;
  /** a frase pronta do banco (mostrar como vem) */
  porque: string;
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const CONFIANCAS = new Set(['alta', 'media', 'baixa']);

/** A resposta da RPC → os itens (o que não tem a forma do contrato fica de fora; resposta sem `itens` = lista vazia). */
export function lerItensSugeridos(data: unknown): ItemSugerido[] {
  const itens: unknown = data && typeof data === 'object' ? Reflect.get(data, 'itens') : null;
  if (!Array.isArray(itens)) return [];
  return itens.flatMap((i: unknown): ItemSugerido[] => {
    if (!i || typeof i !== 'object') return [];
    const itemId = txt(Reflect.get(i, 'item_id'));
    if (!itemId) return [];
    const c = txt(Reflect.get(i, 'confianca'));
    return [{
      itemId, nItem: Number(Reflect.get(i, 'n_item')) || 0, planoContaId: txt(Reflect.get(i, 'plano_conta_id')), subcentro: txt(Reflect.get(i, 'subcentro')),
      fonte: txt(Reflect.get(i, 'fonte')) ?? 'sem_sugestao', confianca: c && CONFIANCAS.has(c) ? (c as ItemSugerido['confianca']) : null,
      porque: txt(Reflect.get(i, 'porque')) ?? '',
    }];
  });
}

/** O que a etapa 2 mostra: uma conta para todas, os itens em contas diferentes, ou nada a sugerir. */
export type SugestaoParaAsParcelas =
  | { tipo: 'uma'; planoContaId: string; subcentro: string; porque: string; igualAHoje: boolean }
  | { tipo: 'varias'; contas: number }
  | { tipo: 'nenhuma' };

/**
 * Os itens → a sugestão para as parcelas. UMA conta só quando TODOS os itens com sugestão vão para ela (o item sem sugestão não decide);
 * itens em contas diferentes = "varias" (a divisão pelos itens é a etapa 3, não um palpite aqui). `planoHoje` = as contas das parcelas hoje:
 * se todas já estão na sugerida, `igualAHoje` (a tela diz "já está na sugerida", sem botão).
 */
export function sugestaoParaAsParcelas(itens: readonly ItemSugerido[], planoHoje: readonly (string | null)[]): SugestaoParaAsParcelas {
  const comConta = itens.filter((i) => i.planoContaId && i.subcentro);
  if (!comConta.length) return { tipo: 'nenhuma' };
  const contas = new Set(comConta.map((i) => i.planoContaId));
  if (contas.size > 1) return { tipo: 'varias', contas: contas.size };
  const i = comConta[0];
  const planoContaId = i.planoContaId as string;
  /* o porquê: o do item mais confiável (a frase do banco, como vem) */
  const ordem = { alta: 0, media: 1, baixa: 2 } as const;
  const melhor = [...comConta].sort((a, b) => (a.confianca ? ordem[a.confianca] : 3) - (b.confianca ? ordem[b.confianca] : 3))[0];
  return {
    tipo: 'uma', planoContaId, subcentro: i.subcentro as string, porque: melhor.porque,
    igualAHoje: planoHoje.length > 0 && planoHoje.every((p) => p === planoContaId),
  };
}
