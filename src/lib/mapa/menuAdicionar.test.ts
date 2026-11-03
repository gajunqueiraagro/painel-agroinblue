import { TIPOS_DE_AREA } from './tiposDeArea';
import { describe, expect, it } from 'vitest';
import { itemFunciona, MENU_ADICIONAR, subitemFunciona } from './menuAdicionar';

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
    /* MAPA-AREA-TIPOS-02 (D6): os 23 do catálogo + as 4 de Condição */
    expect(todos.find(i => i.rotulo === 'Área')!.itens).toHaveLength(27);
  });
  it('MAPA-AREA-TIPO-01/TIPOS-02: em Área ▸ funcionam TODOS os tipos do catálogo, agrupados por família; a Condição segue "em breve"', () => {
    const area = todos.find(i => i.rotulo === 'Área')!.itens!;
    expect(area.filter(subitemFunciona).map(s => s.tipo)).toEqual(TIPOS_DE_AREA.map(t => t.tipo));
    expect(area.find(s => s.tipo === 'armazem_graos')?.grupo).toBe('Estruturas');
    expect(area.filter(s => !subitemFunciona(s)).map(s => s.rotulo)).toEqual(['Área degradada', 'Área em reforma', 'Área em recuperação', 'Zona de erosão']);
    expect(todos.find(i => i.rotulo === 'Infraestrutura')!.itens!.some(subitemFunciona)).toBe(false);
  });
});
