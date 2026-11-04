/** VISAO-GERAL-02 — os atalhos da Visão Geral (mock aprovado). */
import type { V2Section } from '@/v2/lib/navGrupos';

export interface Atalho { id: V2Section; rotulo: string }

/** Os seis atalhos do mock. "Novo lançamento" abre a LISTA de Lançamentos financeiros (não há caminho para o modal novo), então o
 *  rótulo diz o que abre. */
export const ATALHOS_VG: readonly Atalho[] = [
  { id: 'lancamentos-zoot', rotulo: 'Lançar movimentação' },
  { id: 'financeiro-lanc', rotulo: 'Lançamentos financeiros' },
  { id: 'conciliacao', rotulo: 'Conciliação' },
  { id: 'fechamento', rotulo: 'Fechamento área' },
  { id: 'mapa-geo-pastos', rotulo: 'Geo pastos' },
  { id: 'dre', rotulo: 'DRE' },
];
