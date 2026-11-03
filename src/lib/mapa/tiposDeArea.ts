/**
 * MAPA-AREA-TIPO-01 — os TIPOS de área de um polígono do mapa (Gabriel 01/11). Uma fonte só para a tela.
 * Degradada / em reforma / em recuperação / erosão NÃO são tipo: são situação com data (decisão de 31/10).
 * MAPA-AREA-TIPOS-02 (D1, Gabriel 02/11) — o CATÁLOGO ÚNICO mora no banco (`_fn_mapa_tipos_de_area()`, 117120): as duas travas, o rótulo
 * e o escritor leem dele. Este é o mesmo catálogo, NA MESMA ORDEM: o teste SQL compara o banco com o bloco CATALOGO do
 * `supabase/tests/mapa_area_tipos_02_test.sql`, e o `tiposDeArea.test.ts` compara este com aquele bloco (paridade pelos dois lados).
 * - família = a cor e o grupo no seletor (D4); atividade = a quem a área serve (área cercada, indicadores); nenhum tipo de área conta como
 *   área produtiva (a produtiva é a dos pastos — D2: talhão e cana são "É pasto" em agricultura);
 * - `infra` = a estrutura com valor vira essa infraestrutura (`fn_mapa_estrutura_da_area`) e o bem nasce pelas fichas (D3).
 */
export type FamiliaDeArea = 'estruturas' | 'estruturas_pecuaria' | 'agua' | 'ambiental' | 'outros';
export type AtividadeDaArea = 'agricultura' | 'pecuaria' | 'comum' | null;

interface DefinicaoDeTipoDeArea {
  tipo: string; rotulo: string; familia: FamiliaDeArea; atividade: AtividadeDaArea; infra: string | null;
}

export const TIPOS_DE_AREA = [
  { tipo: 'armazem_graos', rotulo: 'Armazém / barracão de grãos', familia: 'estruturas', atividade: 'agricultura', infra: 'armazem_graos' },
  { tipo: 'silo_secador', rotulo: 'Silo / secador', familia: 'estruturas', atividade: 'agricultura', infra: 'silo_secador' },
  { tipo: 'oficina', rotulo: 'Galpão de máquinas / oficina', familia: 'estruturas', atividade: 'comum', infra: 'oficina' },
  { tipo: 'benfeitoria', rotulo: 'Sede / benfeitorias', familia: 'estruturas', atividade: 'comum', infra: 'sede_casa' },
  { tipo: 'casa_funcionario', rotulo: 'Casa de funcionário', familia: 'estruturas', atividade: 'comum', infra: 'casa_funcionario' },
  { tipo: 'escritorio', rotulo: 'Escritório', familia: 'estruturas', atividade: 'comum', infra: 'escritorio' },
  { tipo: 'patio', rotulo: 'Pátio', familia: 'estruturas', atividade: 'comum', infra: null },
  /* Gabriel 02/11 11:11: ESTRUTURAS DE PECUÁRIA (a praça é a mesma da fatia 2a do MAPA-CRIAR-PIQUETES-01) */
  { tipo: 'curral', rotulo: 'Curral', familia: 'estruturas_pecuaria', atividade: 'pecuaria', infra: 'curral' },
  { tipo: 'confinamento', rotulo: 'Confinamento', familia: 'estruturas_pecuaria', atividade: 'pecuaria', infra: 'confinamento' },
  { tipo: 'manga', rotulo: 'Manga', familia: 'estruturas_pecuaria', atividade: 'pecuaria', infra: null },
  { tipo: 'embarcadouro_brete', rotulo: 'Embarcadouro / brete', familia: 'estruturas_pecuaria', atividade: 'pecuaria', infra: 'tronco_brete' },
  { tipo: 'praca_alimentacao', rotulo: 'Praça de alimentação', familia: 'estruturas_pecuaria', atividade: 'pecuaria', infra: null },
  { tipo: 'represa_acude', rotulo: 'Represa / açude', familia: 'agua', atividade: 'comum', infra: 'represa_acude' },
  { tipo: 'lagoa', rotulo: 'Lagoa', familia: 'agua', atividade: 'comum', infra: null },
  { tipo: 'reserva_legal', rotulo: 'Reserva legal / mata nativa', familia: 'ambiental', atividade: null, infra: null },
  { tipo: 'app', rotulo: 'APP', familia: 'ambiental', atividade: null, infra: null },
  { tipo: 'varzea_brejo', rotulo: 'Várzea / brejo', familia: 'ambiental', atividade: null, infra: null },
  { tipo: 'estrada', rotulo: 'Estrada', familia: 'outros', atividade: 'comum', infra: null },
  { tipo: 'pista', rotulo: 'Pista', familia: 'outros', atividade: 'comum', infra: null },
  { tipo: 'cascalheira', rotulo: 'Cascalheira', familia: 'outros', atividade: 'comum', infra: null },
  { tipo: 'descarte', rotulo: 'Descarte / lixo', familia: 'outros', atividade: 'comum', infra: null },
  { tipo: 'area_fazenda', rotulo: 'Área da fazenda', familia: 'outros', atividade: null, infra: null },
  { tipo: 'area_sem_uso', rotulo: 'Área sem uso (terceiros)', familia: 'outros', atividade: null, infra: null },
] as const satisfies readonly DefinicaoDeTipoDeArea[];

export type TipoDeArea = typeof TIPOS_DE_AREA[number]['tipo'];

export const ROTULO_DA_FAMILIA_DE_AREA: Record<FamiliaDeArea, string> = {
  estruturas: 'Estruturas', estruturas_pecuaria: 'Estruturas de pecuária', agua: 'Água', ambiental: 'Ambiental', outros: 'Outros',
};

export const ROTULO_DA_ATIVIDADE_DA_AREA: Record<'agricultura' | 'pecuaria' | 'comum', string> = {
  agricultura: 'Agricultura', pecuaria: 'Pecuária', comum: 'Comum',
};

/** A definição do tipo de área (null para pasto, sem classificação, área total e código desconhecido). */
export function definicaoDoTipoDeArea(tipo: string): DefinicaoDeTipoDeArea | null {
  return TIPOS_DE_AREA.find(t => t.tipo === tipo) ?? null;
}

/** As opções do seletor, agrupadas por família (o `grupo` do seletor da casa; D5), na ordem do catálogo. */
export function opcoesDeTipoDeArea(): { value: string; label: string; grupo: string; hint?: string }[] {
  return TIPOS_DE_AREA.map(t => ({ value: t.tipo, label: t.rotulo, grupo: ROTULO_DA_FAMILIA_DE_AREA[t.familia],
    hint: t.atividade ? ROTULO_DA_ATIVIDADE_DA_AREA[t.atividade].toLowerCase() : undefined }));
}

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

/**
 * MAPA-AREA-TIPOS-02 (Gabriel 02/11 15:47, Sta. Rita "20A-1-A": "Nada muda." com o Gravar apagado parecia "não salva") — a prévia SEM
 * mudança diz o ESTADO ATUAL, não só "nada muda": "Já está ligado ao pasto 20A-1-A, piquete de 20A-1, vale a partir de 11/2026 — nada para
 * gravar." (o grupo e o mês só quando o pasto é piquete de um grupo / tem início de vigência). Puro.
 */
export type EstadoAtualDoPoligono =
  | { tipo: 'pasto'; pasto: string; grupo?: string | null; desde?: string | null }
  | { tipo: 'area'; rotulo: string }
  | { tipo: 'outra' };

function mesAno(iso: string | null | undefined): string | null {
  return iso && /^\d{4}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null;
}

export function fraseJaEstaAssim(e: EstadoAtualDoPoligono): string {
  if (e.tipo === 'outra') return 'Já está sem classificação — nada para gravar.';
  if (e.tipo === 'area') return `Já está marcado como ${e.rotulo} — nada para gravar.`;
  const desde = mesAno(e.desde);
  const piquete = e.grupo ? `, piquete de ${e.grupo}${desde ? `, vale a partir de ${desde}` : ''}` : '';
  return `Já está ligado ao pasto ${e.pasto}${piquete} — nada para gravar.`;
}
