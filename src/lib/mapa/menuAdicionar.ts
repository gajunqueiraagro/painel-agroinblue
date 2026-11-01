/**
 * MAPA-02a-fix1 (5) — o menu "+ Adicionar" do mapa, na estrutura do mock (`docs/mocks/mock-mapa-pastos-v2.html`). Só "Importar mapa
 * (KML/KMZ)" funciona; o resto aparece desabilitado com o selo "em breve" (como nas Camadas). Nada aqui cria tabela nem grava: a
 * Infraestrutura é a fatia 02f.
 */
import type { TipoDeArea } from '@/lib/mapa/tiposDeArea';

export type AcaoDoMenu = 'importar_mapa';

/** MAPA-AREA-TIPO-01: o item de Área ▸ com `tipo` FUNCIONA — leva à Validação para marcar um polígono existente com aquele tipo
    (desenhar a área do zero segue "em breve"); sem `tipo` = "em breve". */
export interface SubitemDoMenu { grupo?: string; rotulo: string; tipo?: TipoDeArea }

export interface ItemDoMenu {
  rotulo: string;
  /** Só o que funciona tem ação; sem ação = "em breve". */
  acao?: AcaoDoMenu;
  /** Submenu (Área ▸, Infraestrutura ▸). */
  itens?: SubitemDoMenu[];
}

export interface GrupoDoMenu { grupo?: string; itens: ItemDoMenu[] }

export const MENU_ADICIONAR: GrupoDoMenu[] = [
  {
    itens: [
      { rotulo: 'Pasto (desenhar)' },
      {
        rotulo: 'Área',
        itens: [
          ...([['Área da fazenda', 'area_fazenda'], ['Área sem uso (terceiros)', 'area_sem_uso'], ['Reserva legal / mata nativa', 'reserva_legal'],
            ['APP', 'app'], ['Várzea / brejo', 'varzea_brejo'], ['Sede / benfeitorias', 'benfeitoria'], ['Estrada', 'estrada'], ['Curral', 'curral'],
            ['Confinamento', 'confinamento']] satisfies [string, TipoDeArea][]).map(([rotulo, tipo]) => ({ grupo: 'Áreas da fazenda', rotulo, tipo })),
          ...['Área degradada', 'Área em reforma', 'Área em recuperação', 'Zona de erosão'].map(rotulo => ({ grupo: 'Condição', rotulo })),
        ],
      },
      {
        rotulo: 'Infraestrutura',
        itens: ['Cocho', 'Bebedouro', 'Saleiro', 'Curral', 'Tronco / brete', 'Balança', 'Porteira', 'Cerca', 'Poço', 'Represa / açude',
          "Caixa d'água", 'Sede / casa', 'Galpão', 'Energia'].map(rotulo => ({ rotulo })),
      },
      { rotulo: 'Tarefa' },
    ],
  },
  { grupo: 'Rebanho', itens: [{ rotulo: 'Movimentar lote' }] },
  { grupo: 'Arquivo', itens: [{ rotulo: 'Importar mapa (KML/KMZ)', acao: 'importar_mapa' }] },
];

/** O item funciona (tem ação)? Os outros são "em breve". */
export function itemFunciona(item: ItemDoMenu): boolean {
  return item.acao != null;
}

/** MAPA-AREA-TIPO-01: o subitem funciona (tem tipo de área); o submenu só mostra "em breve" no gatilho se NENHUM funciona. */
export function subitemFunciona(sub: SubitemDoMenu): sub is SubitemDoMenu & { tipo: TipoDeArea } {
  return sub.tipo != null;
}
