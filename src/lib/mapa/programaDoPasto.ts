/**
 * MAPA-REBANHO-02 (Gabriel 07/11 18:33) — a coluna "Programa" do Mapa do rebanho: o programa do lote (LOTES-04: "1ª inseminação" etc.),
 * pela FONTE ÚNICA — o lote do pasto vem dos itens do fechamento do mês (`fechamento_pasto_itens.lote_id`, só os com cabeça), o programa
 * do lote vem de `fn_lotes_da_fazenda` (`programaId`) e o nome do cadastro do lote (`rebanho_lote_cadastros`, pelo `nomeDe` da lista dos
 * lotes). Nada digitado aqui. Sem lote ou sem programa = null (a tela escreve "—"); mais de um programa no pasto = os nomes, sem repetir.
 */
import { nomeDe, type NomesDoCadastro } from '@/lib/lotes/lista';
import { nomeDoLote } from '@/lib/lotes/tipos';

export interface LoteComPrograma { id: string; programaId: string | null }
export interface ItemComLote { quantidade: number; lote_id?: string | null }

/** Os lotes do pasto no mês: os `lote_id` dos itens COM cabeça, sem repetir, na ordem em que aparecem. */
export function lotesDoPasto(itens: readonly ItemComLote[]): string[] {
  const ids: string[] = [];
  for (const i of itens) if (i.quantidade > 0 && i.lote_id && !ids.includes(i.lote_id)) ids.push(i.lote_id);
  return ids;
}

/** O programa do pasto: os nomes dos programas dos lotes dele, sem repetir ("a · b"); nenhum = null. */
export function programaDoPasto(loteIds: readonly string[], lotes: readonly LoteComPrograma[], nomes: NomesDoCadastro): string | null {
  const porId = new Map(lotes.map(l => [l.id, l]));
  const vistos: string[] = [];
  for (const id of loteIds) {
    const nome = nomeDe(nomes, porId.get(id)?.programaId ?? null);
    if (nome && !vistos.includes(nome)) vistos.push(nome);
  }
  return vistos.length > 0 ? vistos.join(' · ') : null;
}

/**
 * MAPA-REBANHO-L2 (Gabriel 09/11 07:51, prints Raul · Monterrey · set/26) — a coluna "Lote" mostra o LOTE, não o nome do caderno:
 * o nome da regra única (`nomeDoLote`: carimbo na cria, senão o código) de cada lote do pasto, sem repetir ("7.1 · REC-NOV-01");
 * sem lote cadastrado = null (a tela escreve "—"). O nome no caderno (`lote_mes`) vai no `title`, com o código quando aparece o carimbo.
 */
export interface LoteComNome { id: string; codigo: string; carimbo: string | null }

export function loteDoMapa(loteIds: readonly string[], lotes: readonly LoteComNome[]): string | null {
  const porId = new Map(lotes.map(l => [l.id, l]));
  const nomes: string[] = [];
  for (const id of loteIds) {
    const l = porId.get(id);
    const n = l ? nomeDoLote(l) : null;
    if (n && !nomes.includes(n)) nomes.push(n);
  }
  return nomes.length > 0 ? nomes.join(' · ') : null;
}

/** L2 ajuste (Gabriel 09/11 08:12): sem lote cadastrado, a célula mostra o texto do caderno em cinza itálico (nunca "—") e o title diz
 *  "sem lote cadastrado" — com o texto junto, porque o texto comprido corta e a regra de corte pede o inteiro no title. */
export const SEM_LOTE_CADASTRADO = 'sem lote cadastrado';

export function tituloDoLoteNoMapa(loteIds: readonly string[], lotes: readonly LoteComNome[], noCaderno: string | null): string {
  const porId = new Map(lotes.map(l => [l.id, l]));
  if (!loteIds.some(id => porId.has(id)) && noCaderno?.trim()) return `${SEM_LOTE_CADASTRADO} — ${noCaderno.trim()}`;
  const codigos = loteIds.map(id => porId.get(id)).filter((l): l is LoteComNome => !!l && !!l.carimbo?.trim()).map(l => l.codigo);
  return [noCaderno?.trim() ? `No caderno: ${noCaderno.trim()}` : null, codigos.length ? codigos.join(' · ') : null].filter(Boolean).join(' · ');
}
