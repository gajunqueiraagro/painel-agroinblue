/**
 * LOTES-03 F1 — o campo Lote do modal do pasto (o MESMO modal do P1). O lote vai em CADA item (categoria) do card (`lote_id`);
 * um lote para o pasto inteiro é o caso comum, e "por categoria" cobre o card com dois lotes (ex.: desmama F + as novilhas de outro lote).
 * Só a categoria com cabeça leva lote; zerou, o lote sai. Lote em 2+ pastos é permitido (o lote não é do pasto).
 */
import type { LoteDaLista } from '@/lib/lotes/tipos';

export interface ItemComLote {
  categoria_id: string;
  quantidade: number;
  lote_id?: string | null;
}

export type LoteDoCard =
  | { tipo: 'nenhum' }
  | { tipo: 'um'; loteId: string; semLote: number }
  | { tipo: 'varios'; loteIds: string[]; semLote: number };

/** O que o card tem hoje: nenhum lote, um (com quantas categorias com cabeça ainda sem lote) ou vários. */
export function loteDoCard(itens: readonly ItemComLote[]): LoteDoCard {
  const comCabeca = itens.filter(i => i.quantidade > 0);
  const ids = [...new Set(comCabeca.flatMap(i => (i.lote_id ? [i.lote_id] : [])))];
  const semLote = comCabeca.filter(i => !i.lote_id).length;
  if (ids.length === 0) return { tipo: 'nenhum' };
  if (ids.length === 1) return { tipo: 'um', loteId: ids[0], semLote };
  return { tipo: 'varios', loteIds: ids, semLote };
}

/** O lote do pasto inteiro: toda categoria com cabeça leva `loteId` (vazio = sem lote); as sem cabeça ficam sem lote. */
export function comLoteEmTodos<T extends ItemComLote>(itens: readonly T[], loteId: string | null): T[] {
  return itens.map(i => ({ ...i, lote_id: i.quantidade > 0 ? loteId : null }));
}

/** O lote de UMA categoria. */
export function comLoteNaCategoria<T extends ItemComLote>(itens: readonly T[], categoriaId: string, loteId: string | null): T[] {
  return itens.map(i => (i.categoria_id === categoriaId ? { ...i, lote_id: i.quantidade > 0 ? loteId : null } : i));
}

/** Zerou a categoria: o lote dela sai (nunca fica um lote numa linha sem cabeça). */
export function semLoteNoZerado<T extends ItemComLote>(itens: readonly T[]): T[] {
  return itens.map(i => (i.quantidade > 0 || !i.lote_id ? i : { ...i, lote_id: null }));
}

/** "Copiar anterior" leva o lote só se ele ainda está ativo na fazenda; senão a categoria volta sem lote. */
export function lotesQueSeguem<T extends ItemComLote>(itens: readonly T[], ativos: ReadonlySet<string>): T[] {
  return itens.map(i => (i.lote_id && !ativos.has(i.lote_id) ? { ...i, lote_id: null } : i));
}

/** O texto do botão do campo: o código (e o nome do campeiro no title), "2 lotes" ou "Sem lote". */
export function rotuloDoLote(card: LoteDoCard, lotes: readonly LoteDaLista[]): { texto: string; title: string } {
  const porId = new Map(lotes.map(l => [l.id, l]));
  const nome = (id: string) => {
    const l = porId.get(id);
    return l ? (l.nomeCampeiro ? `${l.codigo} · ${l.nomeCampeiro}` : l.codigo) : 'lote fora da lista';
  };
  const falta = (n: number) => (n > 0 ? ` · ${n} categoria${n > 1 ? 's' : ''} sem lote` : '');
  if (card.tipo === 'nenhum') return { texto: 'Sem lote', title: 'Nenhuma categoria deste pasto tem lote' };
  if (card.tipo === 'um') return { texto: porId.get(card.loteId)?.codigo ?? 'Lote', title: nome(card.loteId) + falta(card.semLote) };
  return { texto: `${card.loteIds.length} lotes`, title: card.loteIds.map(nome).join(' · ') + falta(card.semLote) };
}

/** POPUP-ORIGINAL-COR — o lote no popup do pasto: o MESMO texto do campo Lote do modal (`rotuloDoLote`); sem lote = nulo (o popup mostra "—") */
export function loteDoPopup(itens: readonly ItemComLote[], lotes: readonly LoteDaLista[]): string | null {
  const card = loteDoCard(itens);
  return card.tipo === 'nenhum' ? null : rotuloDoLote(card, lotes).texto;
}
