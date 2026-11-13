/**
 * L1 LIGAÇÃO fechamento↔lote (Chat 12/11 15:05; LOTE-MAPA-ALIMENTACAO-01: em out/26 só 227 de 383 itens com cabeça tinham lote).
 * (b) A sugestão do campo Lote no modal do pasto: sai das MESMAS opções do seletor (`opcoesDosLotesNoPasto`) — "Pelo nome no caderno"
 *     primeiro, senão "Neste pasto no mês anterior"; nenhum = nenhuma sugestão (nunca inventa). Só quando o card tem cabeça e nenhum lote.
 * (c) O indicador do topo do Fechamento: quantos itens com cabeça do mês têm lote. Nunca bloqueia o Fechar Mês.
 */
import type { OpcaoSearchable } from '@/components/ui/searchable-select';
import { GRUPO_DO_CADERNO, GRUPO_NESTE_PASTO } from './buscaDoLote';

export interface SugestaoDoLote {
  /** os lotes sugeridos (1 = "Usar"; 2 ou mais = "N sugestões") */
  opcoes: OpcaoSearchable[];
  /** por quê, em palavras ("pelo nome no caderno" · "neste pasto no mês anterior") */
  porque: string;
}

export function sugestaoDoLote(opcoes: readonly OpcaoSearchable[], itens: readonly { quantidade: number; lote_id?: string | null }[]): SugestaoDoLote | null {
  const comCabeca = itens.filter(i => i.quantidade > 0);
  if (comCabeca.length === 0 || comCabeca.some(i => i.lote_id)) return null;
  const doCaderno = opcoes.filter(o => o.grupo === GRUPO_DO_CADERNO);
  if (doCaderno.length) return { opcoes: doCaderno, porque: 'pelo nome no caderno' };
  const nestePasto = opcoes.filter(o => o.grupo === GRUPO_NESTE_PASTO);
  if (nestePasto.length) return { opcoes: nestePasto, porque: 'neste pasto no mês anterior' };
  return null;
}

export interface LigacaoDoMes { com: number; total: number }

/** Os itens com cabeça do mês e quantos têm lote (os cards de fora — divergência, lavoura — o chamador já tira). */
export function ligacaoDoMes(itensPorCard: Iterable<readonly { quantidade: number; lote_id?: string | null }[]>): LigacaoDoMes {
  let com = 0; let total = 0;
  for (const itens of itensPorCard) {
    for (const i of itens) {
      if (i.quantidade <= 0) continue;
      total++;
      if (i.lote_id) com++;
    }
  }
  return { com, total };
}

/** O texto do indicador (Chat 12/11 14:12): "Itens com lote 64/86" (title com a frase inteira); sem item com cabeça = null (o lugar fica, vazio). */
export function textoDaLigacao(l: LigacaoDoMes): { texto: string; title: string; completo: boolean } | null {
  if (l.total === 0) return null;
  return { texto: `Itens com lote ${l.com}/${l.total}`, title: `${l.com} de ${l.total} itens com cabeça têm lote neste mês (não impede fechar)`, completo: l.com === l.total };
}
