/**
 * MAPA-REBANHO-02 (Gabriel 07/11 18:33) — a coluna "Programa" do Mapa do rebanho: o programa do lote (LOTES-04: "1ª inseminação" etc.),
 * pela FONTE ÚNICA — o lote do pasto vem dos itens do fechamento do mês (`fechamento_pasto_itens.lote_id`, só os com cabeça), o programa
 * do lote vem de `fn_lotes_da_fazenda` (`programaId`) e o nome do cadastro do lote (`rebanho_lote_cadastros`, pelo `nomeDe` da lista dos
 * lotes). Nada digitado aqui. Sem lote ou sem programa = null (a tela escreve "—"); mais de um programa no pasto = os nomes, sem repetir.
 */
import { nomeDe, type NomesDoCadastro } from '@/lib/lotes/lista';

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
