import { describe, expect, it } from 'vitest';
import { itemFunciona, MENU_ADICIONAR } from './menuAdicionar';

const todos = MENU_ADICIONAR.flatMap(g => g.itens);

describe('menu "+ Adicionar" (fix1 5): a estrutura do mock, só Importar funciona', () => {
  it('a ordem do mock', () => {
    expect(todos.map(i => i.rotulo)).toEqual(['Pasto (desenhar)', 'Área', 'Infraestrutura', 'Tarefa', 'Movimentar lote', 'Importar mapa (KML/KMZ)']);
    expect(MENU_ADICIONAR.map(g => g.grupo ?? '')).toEqual(['', 'Rebanho', 'Arquivo']);
  });
  it('só "Importar mapa" funciona; os outros 5 são "em breve"', () => {
    expect(todos.filter(itemFunciona).map(i => i.rotulo)).toEqual(['Importar mapa (KML/KMZ)']);
    expect(todos.filter(i => !itemFunciona(i))).toHaveLength(5);
  });
  it('Infraestrutura ▸ tem os 14 itens do briefing; Área ▸ os 12 do mock', () => {
    const infra = todos.find(i => i.rotulo === 'Infraestrutura')!.itens!.map(i => i.rotulo);
    expect(infra).toEqual(['Cocho', 'Bebedouro', 'Saleiro', 'Curral', 'Tronco / brete', 'Balança', 'Porteira', 'Cerca', 'Poço', 'Represa / açude',
      "Caixa d'água", 'Sede / casa', 'Galpão', 'Energia']);
    expect(todos.find(i => i.rotulo === 'Área')!.itens).toHaveLength(12);
  });
});
