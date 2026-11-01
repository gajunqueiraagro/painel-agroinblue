/**
 * MAPA-AREA-TIPO-01 — os TIPOS de área de um polígono do mapa (Gabriel 01/11). Uma fonte só para a tela; os rótulos são os mesmos do
 * banco (`_fn_mapa_tipo_rotulo`, 117030) e o escritor `fn_mapa_geometria_classificar` aceita exatamente estes códigos.
 * Degradada / em reforma / em recuperação / erosão NÃO são tipo: são situação com data (decisão de 31/10).
 */
export type TipoDeArea =
  | 'area_fazenda' | 'area_sem_uso' | 'reserva_legal' | 'app' | 'varzea_brejo' | 'benfeitoria' | 'estrada' | 'curral' | 'confinamento';

export const TIPOS_DE_AREA: readonly { tipo: TipoDeArea; rotulo: string }[] = [
  { tipo: 'area_fazenda', rotulo: 'Área da fazenda' },
  { tipo: 'area_sem_uso', rotulo: 'Área sem uso (terceiros)' },
  { tipo: 'reserva_legal', rotulo: 'Reserva legal / mata nativa' },
  { tipo: 'app', rotulo: 'APP' },
  { tipo: 'varzea_brejo', rotulo: 'Várzea / brejo' },
  { tipo: 'benfeitoria', rotulo: 'Sede / benfeitorias' },
  { tipo: 'estrada', rotulo: 'Estrada' },
  { tipo: 'curral', rotulo: 'Curral' },
  { tipo: 'confinamento', rotulo: 'Confinamento' },
];

/** O que o polígono é hoje, em uma palavra para a lista e o painel (o pasto vem pelo nome, à parte). */
export function rotuloDoTipo(tipo: string): string {
  if (tipo === 'pasto') return 'Pasto';
  if (tipo === 'outra') return 'Sem classificação';
  if (tipo === 'area_total') return 'Área total';
  return TIPOS_DE_AREA.find(t => t.tipo === tipo)?.rotulo ?? tipo;
}

export function ehTipoDeArea(tipo: string): tipo is TipoDeArea {
  return TIPOS_DE_AREA.some(t => t.tipo === tipo);
}

/** O destino escolhido no painel: É pasto (com o pasto), É área (com o tipo) ou Sem classificação. */
export type DestinoDoPoligono = { tipo: 'pasto'; pastoId: string } | { tipo: TipoDeArea } | { tipo: 'outra' };

/** Os argumentos do escritor (a tela nunca grava direto na tabela). */
export function argumentosDoEscritor(geometriaId: string, destino: DestinoDoPoligono, simular: boolean, motivo?: string) {
  return {
    p_geometria: geometriaId,
    p_tipo: destino.tipo,
    p_pasto: destino.tipo === 'pasto' ? destino.pastoId : null,
    p_motivo: motivo?.trim() || null,
    p_simular: simular,
  };
}
