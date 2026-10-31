/**
 * MAPA-02a-fix1 (5) — o menu "+ Adicionar" do mapa, na estrutura do mock (`docs/mocks/mock-mapa-pastos-v2.html`). Só "Importar mapa
 * (KML/KMZ)" funciona; o resto aparece desabilitado com o selo "em breve" (como nas Camadas). Nada aqui cria tabela nem grava: a
 * Infraestrutura é a fatia 02f.
 */
export type AcaoDoMenu = 'importar_mapa';

export interface ItemDoMenu {
  rotulo: string;
  /** Só o que funciona tem ação; sem ação = "em breve". */
  acao?: AcaoDoMenu;
  /** Submenu (Área ▸, Infraestrutura ▸). */
  itens?: { grupo?: string; rotulo: string }[];
}

export interface GrupoDoMenu { grupo?: string; itens: ItemDoMenu[] }

export const MENU_ADICIONAR: GrupoDoMenu[] = [
  {
    itens: [
      { rotulo: 'Pasto (desenhar)' },
      {
        rotulo: 'Área',
        itens: [
          ...['Área sem uso (terceiros)', 'Reserva legal / mata nativa', 'APP', 'Várzea / brejo', 'Sede / benfeitorias', 'Estrada', 'Curral', 'Confinamento']
            .map(rotulo => ({ grupo: 'Áreas da fazenda', rotulo })),
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
