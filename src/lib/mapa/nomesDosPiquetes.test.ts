import { describe, expect, it } from 'vitest';
import { cortesIguais, montar } from './criarPiquetes';
import type { Ponto } from './edicaoDoPoligono';
import { divisoesDasLinhas, linhasDaGrade, pontoInterior } from './linhasDosPiquetes';
import { chaveDoNome, letraDoIndice, nomearClicando, ordemDaLista, presosDasDivisoes, proximoNomeLivre, semNomes, type GeradorDeNome } from './nomesDosPiquetes';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}
const g = retangulo(80);
const divs = (c: number) => { const m = montar(g); return divisoesDasLinhas(g, linhasDaGrade(m, cortesIguais(m, 1, c))); };
const deslocado = (p: Ponto): Ponto => [p[0] - 0.0007, p[1]];
const gerador = (prefixo: string): GeradorDeNome => u => ({ nome: proximoNomeLivre(prefixo, u.nomes), liga: null });

describe('nomes presos à divisão', () => {
  it('a 1ª vez: um nome sugerido por divisão, na ordem do mapa', () => {
    const d = divs(4);
    const p = presosDasDivisoes(d, [], gerador('M3-'));
    expect(p.map(x => x.nome)).toEqual(['M3-A', 'M3-B', 'M3-C', 'M3-D']);
  });

  it('as linhas mudam (3 → 4 partes): cada nome vai para a divisão que contém o ponto dele; a nova ganha a próxima letra livre', () => {
    const tres = divs(3);
    const p3 = presosDasDivisoes(tres, [], gerador('M3-'));
    // o operador renomeou a do meio
    const meio = p3.map((p, i) => (i === 1 ? { ...p, nome: 'Curral', ponto: deslocado(p.ponto) } : p)); // fora do corte exato de 0,5
    const quatro = divs(4);
    const p4 = presosDasDivisoes(quatro, meio, gerador('M3-'));
    expect(p4).toHaveLength(4);
    // o ponto de "Curral" (centro da 2ª de 3) cai na 2ª de 4 (0,33–0,66 contém 0,5)... confere pelo ponto, não pela posição
    const quem = p4.find(p => p.nome === 'Curral')!;
    expect(quem.ponto).toEqual(meio[1].ponto);
    expect(new Set(p4.map(x => chaveDoNome(x.nome))).size).toBe(4); // nunca repete
    expect(p4.filter(x => x.nome.startsWith('M3-')).length).toBe(3);
  });

  it('duas divisões fundidas (4 → 2): a que ficou com dois pontos leva o 1º nome e o outro nome volta a ficar livre', () => {
    const p4 = presosDasDivisoes(divs(4), [], gerador('P-'));
    const p2 = presosDasDivisoes(divs(2), p4, gerador('P-'));
    expect(p2).toHaveLength(2);
    expect(p2.map(x => x.nome)).toEqual(['P-A', 'P-C']);
  });

  it('o grupo que já existe: a ligação segue o ponto (nome e liga do membro); sobrando divisão sem membro, fica vazia', () => {
    const membros = [{ id: 'm1', nome: '6A' }, { id: 'm2', nome: '6B' }];
    const gerar: GeradorDeNome = u => { const m = membros.find(x => !u.ligas.has(x.id)); return m ? { nome: m.nome, liga: m.id } : { nome: '', liga: null }; };
    const p2 = presosDasDivisoes(divs(2), [], gerar);
    expect(p2.map(x => x.liga)).toEqual(['m1', 'm2']);
    const p3 = presosDasDivisoes(divs(3), p2, gerar);
    expect(p3.filter(x => x.liga).map(x => x.liga).sort()).toEqual(['m1', 'm2']);
    expect(p3.filter(x => !x.liga)).toHaveLength(1);
    const comMesmaPosicao = presosDasDivisoes(divs(2), p2, gerar);
    expect(comMesmaPosicao.map(x => x.liga)).toEqual(['m1', 'm2']);
  });

  it('o ponto de cada nome é interior da divisão', () => {
    const d = divs(3);
    const p = presosDasDivisoes(d, [], gerador('X-'));
    p.forEach((x, i) => expect(x.ponto).toEqual(pontoInterior(d[i].geojson!)));
  });
});

describe('nomear clicando', () => {
  it('cada clique dá a próxima letra, na ordem dos cliques; o nome que já existia vai para a divisão trocada (nunca repete)', () => {
    const p0 = presosDasDivisoes(divs(4), [], gerador('M3-'));
    let p = semNomes(p0);
    expect(p.every(x => x.nome === '')).toBe(true);
    const ordemDosCliques = [3, 1, 0, 2]; // 1º clique na D (a última do mapa)
    ordemDosCliques.forEach((i, k) => { p = nomearClicando(p, i, `M3-${letraDoIndice(k)}`); });
    expect(p.map(x => x.nome)).toEqual(['M3-C', 'M3-B', 'M3-D', 'M3-A']);
    // clicar com um nome que outra divisão tem: troca
    const t = nomearClicando(p0, 0, 'M3-C');
    expect(t.map(x => x.nome)).toEqual(['M3-C', 'M3-B', 'M3-A', 'M3-D']);
    expect(nomearClicando(p0, 9, 'x')).toHaveLength(4);
  });

  it('a lista ordena pelo nome (números pelo valor) e deixa o sem nome por último', () => {
    expect(ordemDaLista(['P10', 'P2', '', 'P1'])).toEqual([3, 1, 0, 2]);
    expect(ordemDaLista(['M3-C', 'M3-A', 'M3-B'])).toEqual([1, 2, 0]);
  });

  it('proximoNomeLivre pula os usados sem caixa', () => {
    expect(proximoNomeLivre('M-', new Set(['m-a', 'm-b']))).toBe('M-C');
  });
});
