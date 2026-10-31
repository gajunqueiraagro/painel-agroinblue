import { describe, expect, it } from 'vitest';
import {
  aplicarEmLote, contarLinhas, destinoDoValor, FRASE_ESCOLHER, FRASE_NOVO_JA_EXISTE, FRASE_NOVO_REPETIDO, FRASE_PASTO_REPETIDO,
  itensParaGravar, montarLinhas, problemasDasLinhas, sugerirDestino, trocarDestino, valorDoDestino, type PastoDoDestino, type PoligonoLido,
} from './destinoDoPoligono';

const FAZ = 'faz-3m';
const g: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
// Nomes reais da 3M (proto, 30/10/2026).
const PASTOS: PastoDoDestino[] = [
  { id: 'p07', nome: 'P_07', ativo: true, fazenda_id: FAZ },
  { id: 'p27', nome: 'P_27', ativo: true, fazenda_id: FAZ },
  { id: 'arr', nome: 'Arrendamento - Baldasso', ativo: true, fazenda_id: FAZ, data_fim: '2026-08-31' },
  { id: 'div', nome: '⚠️ Divergência do Campeiro', ativo: true, fazenda_id: FAZ },
];
const poly = (nome: string, areaHa = 10): PoligonoLido => ({ nome, geojson: g, areaHa });

describe('sugestão inicial (MAPA-IMPORT-01b)', () => {
  it('pasto claro pelo nome', () => {
    expect(sugerirDestino('P07', PASTOS, FAZ).destino).toEqual({ tipo: 'pasto', pastoId: 'p07' });
    expect(sugerirDestino('P27 - Mombaça', PASTOS, FAZ).destino).toEqual({ tipo: 'pasto', pastoId: 'p27' });
  });

  it('área pela palavra do nome', () => {
    expect(sugerirDestino('Area Total', PASTOS, FAZ).destino).toEqual({ tipo: 'area', area: 'area_total' });
    expect(sugerirDestino('Reserva Legal 1 (mata)', PASTOS, FAZ).destino).toEqual({ tipo: 'area', area: 'reserva_legal' });
    expect(sugerirDestino('APP triângulo17,6 há', PASTOS, FAZ).destino).toEqual({ tipo: 'area', area: 'app' });
    expect(sugerirDestino('Benfeitorias', PASTOS, FAZ).destino).toEqual({ tipo: 'area', area: 'benfeitoria' });
    expect(sugerirDestino('Estradas internas 1', PASTOS, FAZ).destino).toEqual({ tipo: 'area', area: 'estrada' });
  });

  it('nem pasto nem área: escolher (nunca chuta)', () => {
    expect(sugerirDestino('P01', PASTOS, FAZ).destino).toEqual({ tipo: 'escolher' });
    expect(sugerirDestino('TIPS Engorda Total', PASTOS, FAZ).destino).toEqual({ tipo: 'escolher' });
    expect(sugerirDestino('Piq. Tropa', PASTOS, FAZ).destino).toEqual({ tipo: 'escolher' });
    expect(sugerirDestino('Mapp', PASTOS, FAZ).destino).toEqual({ tipo: 'escolher' });
  });

  it('pasto ambíguo: escolher, com os candidatos', () => {
    const dois = [...PASTOS, { id: 'p07b', nome: 'P 07', ativo: true, fazenda_id: FAZ }];
    const s = sugerirDestino('P07', dois, FAZ);
    expect(s.destino).toEqual({ tipo: 'escolher' });
    expect(s.candidatos.map(c => c.id).sort()).toEqual(['p07', 'p07b']);
  });
});

describe('ordem das linhas', () => {
  it('A escolher, Novo, Pastos ligados, Áreas; dentro do grupo pelo nome (P2 antes de P10)', () => {
    const linhas = montarLinhas([poly('Area Total'), poly('P27 - Mombaça'), poly('P10'), poly('P07'), poly('P2')], PASTOS, FAZ);
    expect(linhas.map(l => l.nome)).toEqual(['P2', 'P10', 'P07', 'P27 - Mombaça', 'Area Total']);
  });

  it('trocar o destino não move a linha', () => {
    const linhas = montarLinhas([poly('P01'), poly('P07')], PASTOS, FAZ);
    const depois = trocarDestino(linhas, linhas[0].i, { tipo: 'nao' });
    expect(depois.map(l => l.i)).toEqual(linhas.map(l => l.i));
  });
});

describe('o que barra o Salvar', () => {
  it('linha sem destino', () => {
    const linhas = montarLinhas([poly('P01')], PASTOS, FAZ);
    expect(problemasDasLinhas(linhas, PASTOS).get(linhas[0].i)).toBe(FRASE_ESCOLHER);
  });

  it('o mesmo pasto em dois polígonos: as duas linhas', () => {
    let linhas = montarLinhas([poly('P07'), poly('P01')], PASTOS, FAZ);
    const p01 = linhas.find(l => l.nome === 'P01')!;
    linhas = trocarDestino(linhas, p01.i, { tipo: 'pasto', pastoId: 'p07' });
    const m = problemasDasLinhas(linhas, PASTOS);
    expect(m.size).toBe(2);
    expect([...m.values()]).toEqual([FRASE_PASTO_REPETIDO, FRASE_PASTO_REPETIDO]);
  });

  it('dois pastos novos com o mesmo nome; pasto novo com nome de pasto que já existe', () => {
    let linhas = montarLinhas([poly('Piq. Tropa'), poly('piq tropa'), poly('P_07 ')], PASTOS, FAZ);
    linhas = aplicarEmLote(linhas, new Set(linhas.map(l => l.i)), { tipo: 'novo' });
    const m = problemasDasLinhas(linhas, PASTOS);
    const motivo = (nome: string) => m.get(linhas.find(l => l.nome === nome)!.i);
    expect(motivo('P_07 ')).toBe(FRASE_NOVO_JA_EXISTE);
    // "Piq. Tropa" e "piq tropa" não são o mesmo nome para o cadastro (o ponto conta): ficam livres
    expect(motivo('Piq. Tropa')).toBeUndefined();
    const iguais = aplicarEmLote(montarLinhas([poly('Piq. Tropa'), poly('PIQ. TROPA')], PASTOS, FAZ), new Set([0, 1]), { tipo: 'novo' });
    expect([...problemasDasLinhas(iguais, PASTOS).values()]).toEqual([FRASE_NOVO_REPETIDO, FRASE_NOVO_REPETIDO]);
  });

  it('tudo escolhido: nada barra', () => {
    let linhas = montarLinhas([poly('P07'), poly('P01'), poly('Area Total')], PASTOS, FAZ);
    linhas = trocarDestino(linhas, linhas.find(l => l.nome === 'P01')!.i, { tipo: 'nao' });
    expect(problemasDasLinhas(linhas, PASTOS).size).toBe(0);
  });
});

describe('lote', () => {
  it('aplicar muda SÓ as marcadas', () => {
    const linhas = montarLinhas([poly('P01'), poly('P02'), poly('P07')], PASTOS, FAZ);
    const marcadas = new Set([linhas[0].i]);
    const depois = aplicarEmLote(linhas, marcadas, { tipo: 'area', area: 'area_sem_uso' });
    expect(depois[0].destino).toEqual({ tipo: 'area', area: 'area_sem_uso' });
    expect(depois[0].origem).toBe('escolha');
    expect(depois.slice(1)).toEqual(linhas.slice(1));
  });
});

describe('contagem e gravação', () => {
  it('cards e pastos sem mapa', () => {
    let linhas = montarLinhas([poly('P07'), poly('P01'), poly('Area Total'), poly('Piq. Tropa')], PASTOS, FAZ);
    linhas = trocarDestino(linhas, linhas.find(l => l.nome === 'Piq. Tropa')!.i, { tipo: 'novo' });
    const c = contarLinhas(linhas, PASTOS);
    expect([c.ligados, c.novos, c.areas, c.escolher]).toEqual([1, 1, 1, 1]);
    expect(c.semMapa.map(p => p.id)).toEqual(['p27', 'arr', 'div']);
  });

  it('o payload: ordem do arquivo, "Não importar" fora, pasto novo com a área em 2 casas', () => {
    let linhas = montarLinhas([poly('P07'), poly('Piq. Tropa', 17.4449), poly('P01'), poly('Area Total')], PASTOS, FAZ);
    linhas = trocarDestino(linhas, linhas.find(l => l.nome === 'Piq. Tropa')!.i, { tipo: 'novo' });
    linhas = trocarDestino(linhas, linhas.find(l => l.nome === 'P01')!.i, { tipo: 'nao' });
    expect(itensParaGravar(linhas).map(x => [x.tipo, x.pasto_id, x.nome_original, x.area_ha])).toEqual([
      ['pasto', 'p07', 'P07', undefined],
      ['pasto_novo', null, 'Piq. Tropa', 17.44],
      ['area_total', null, 'Area Total', undefined],
    ]);
  });

  it('o valor do seletor ida e volta', () => {
    for (const v of ['pasto:p07', 'novo', 'area:app', 'nao', '']) expect(valorDoDestino(destinoDoValor(v))).toBe(v);
    expect(destinoDoValor('area:xyz')).toEqual({ tipo: 'escolher' });
  });
});
