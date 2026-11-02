/** MAPA-PIQUETES-03 — a unidade do mapa (pai + grupo), no formato do caso real da Faz. Pureza (P7 → 7A–7D desde 11/2026; P6 → 6A, 6B). */
import { describe, expect, it } from 'vitest';
import { avisoSemDesenho, contornosDePai, divisoesNoPainel, pastosSemDesenho, fechamentosDaUnidade, fraseDasDivisoes, unidadesDoMapa } from './unidadesDoMapa';

const pasto = (id: string, nome: string, o: { inicio?: string | null; fim?: string | null; grupo?: string | null; ativo?: boolean } = {}) =>
  ({ id, nome, fazenda_id: 'pur', ativo: o.ativo ?? true, data_inicio: o.inicio ?? null, data_fim: o.fim ?? null, grupo_id: o.grupo ?? null });
const AREA: Record<string, number> = { p7: 97.3, a: 24.76, b: 25.11, c: 24.35, d: 23.32, p6: 94.9, x: 74.33, y: 21.17, p1: 50 };
const PASTOS = [
  pasto('p7', 'P7', { fim: '2026-10-31' }),
  pasto('a', '7A', { inicio: '2026-11-01', grupo: 'g7' }), pasto('b', '7B', { inicio: '2026-11-01', grupo: 'g7' }),
  pasto('d', '7D', { inicio: '2026-11-01', grupo: 'g7' }), pasto('c', '7C', { inicio: '2026-11-01', grupo: 'g7' }),
  pasto('p6', 'P6', { fim: '2026-10-31' }),
  pasto('x', '6A', { inicio: '2026-11-01', grupo: 'g6' }), pasto('y', '6B', { inicio: '2026-11-01', grupo: 'g6' }),
  pasto('p1', 'P1'),
  pasto('m1', 'M1', { grupo: 'gm' }), pasto('m2', 'M2', { grupo: 'gm' }),     // grupo montado no cadastro (sem origem)
];
const GRUPOS = [
  { id: 'g7', nome: 'P7', pasto_origem_id: 'p7', ativo: true }, { id: 'g6', nome: 'P6', pasto_origem_id: 'p6', ativo: true },
  { id: 'gm', nome: 'Rotação', pasto_origem_id: null, ativo: true },
];
const geo = (id: string, pasto_id: string | null) => ({ id, pasto_id, tipo: pasto_id ? 'pasto' : 'outra' });
const POLIGONOS = [geo('gP7', 'p7'), geo('gA', 'a'), geo('gB', 'b'), geo('gC', 'c'), geo('gD', 'd'), geo('gP6', 'p6'), geo('gP1', 'p1'),
  geo('gM1', 'm1'), geo('gM2', 'm2')];
const rodar = (anoMes: string) => unidadesDoMapa({ pastos: PASTOS, grupos: GRUPOS, poligonos: POLIGONOS, anoMes, areaDe: (p) => AREA[p.id] ?? 0 });

describe('a unidade pai + grupo', () => {
  it('set/26 (antes das divisões): a unidade P7 é o próprio P7, com a área dele e sem divisões', () => {
    const r = rodar('2026-09');
    const u = r.unidades.get('p7');
    expect(u?.fase).toBe('pai');
    expect(u?.pastoIds).toEqual(['p7']);
    expect(u?.areaHa).toBe(97.3);
    expect(u?.divisoes).toEqual([]);
  });
  it('nov/26 (com as divisões): a unidade P7 = os 4 membros; área Σ; divisões em ordem natural, com o polígono de cada uma', () => {
    const r = rodar('2026-11');
    const u = r.unidades.get('p7');
    expect(u?.fase).toBe('grupo');
    expect(u?.pastoIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(u?.areaHa).toBe(97.54);
    expect(u?.divisoes.map((d) => d.nome)).toEqual(['7A', '7B', '7C', '7D']);
    expect(u?.divisoes.map((d) => d.poligono?.id)).toEqual(['gA', 'gB', 'gC', 'gD']);
  });
  it('o mapa recebe UM pasto por unidade (o pai, sem a vigência própria) e nenhum membro; o grupo do cadastro segue um a um', () => {
    const r = rodar('2026-11');
    expect(r.pastos.map((p) => p.id).sort()).toEqual(['m1', 'm2', 'p1', 'p6', 'p7']);
    expect(r.pastos.find((p) => p.id === 'p7')).toMatchObject({ data_inicio: null, data_fim: null });
    expect(r.pastos.find((p) => p.id === 'p1')).toEqual(PASTOS.find((p) => p.id === 'p1'));
  });
  it('os polígonos dos membros saem do desenho de pasto (viram divisões); o contorno do pai fica', () => {
    const ids = rodar('2026-11').poligonos.map((g) => g.id).sort();
    expect(ids).toEqual(['gM1', 'gM2', 'gP1', 'gP6', 'gP7']);
    expect(rodar('2026-09').poligonos.map((g) => g.id)).not.toContain('gA');
  });
  it('pai e membros apontam para a unidade (o pai); o do cadastro não', () => {
    const u = rodar('2026-11').unidadeDe;
    expect(['p7', 'a', 'b', 'c', 'd'].map((id) => u.get(id))).toEqual(['p7', 'p7', 'p7', 'p7', 'p7']);
    expect(u.get('m1')).toBeUndefined();
  });
  it('P6 (contorno no pai, membros sem polígono): divisões listadas, sem linha para desenhar', () => {
    const u = rodar('2026-11').unidades.get('p6');
    expect(u?.divisoes.map((d) => [d.nome, d.poligono])).toEqual([['6A', null], ['6B', null]]);
    expect(u?.areaHa).toBe(95.5);
  });
  it('sem pai nem membros vigentes no mês, não há unidade (e o pai segue com a vigência dele)', () => {
    const r = unidadesDoMapa({ pastos: PASTOS.map((p) => (['a', 'b', 'c', 'd'].includes(p.id) ? { ...p, data_inicio: '2027-01-01' } : p)),
      grupos: GRUPOS, poligonos: POLIGONOS, anoMes: '2026-11', areaDe: () => 1 });
    expect(r.unidades.has('p7')).toBe(false);
    expect(r.pastos.find((p) => p.id === 'p7')?.data_fim).toBe('2026-10-31');
  });
});

describe('os fechamentos pela unidade', () => {
  const F = (id: string, pasto_id: string, ano_mes: string, status = 'fechado', tipo_uso_mes: string | null = 'recria') => ({ id, pasto_id, ano_mes, status, tipo_uso_mes });
  const I = (fechamento_id: string, quantidade: number) => ({ fechamento_id, quantidade, peso_medio_kg: 300, categoria_id: 'bois', lote: null });
  const unidadeDe = rodar('2026-11').unidadeDe;
  it('nov: os 2 cards de piquete (7A com o lote, 7B vedado) viram UM da unidade, com os itens somados', () => {
    const r = fechamentosDaUnidade([F('fa', 'a', '2026-11'), F('fb', 'b', '2026-11', 'fechado', 'vedado'), F('f1', 'p1', '2026-11')],
      [I('fa', 100), I('fb', 0), I('f1', 10)], unidadeDe);
    const doP7 = r.fechamentos.filter((f) => f.pasto_id === 'p7');
    expect(doP7).toEqual([{ id: 'unidade:p7|2026-11', pasto_id: 'p7', ano_mes: '2026-11', status: 'fechado', tipo_uso_mes: 'recria' }]);
    expect(r.itens.filter((i) => i.fechamento_id === 'unidade:p7|2026-11').map((i) => i.quantidade)).toEqual([100, 0]);
    expect(r.fechamentos.find((f) => f.id === 'f1')?.pasto_id).toBe('p1');     // o solto fica como estava
  });
  it('set: o fechamento do pai é da unidade sem trocar de id; um piquete aberto deixa a unidade aberta; todos vedados = vedado', () => {
    expect(fechamentosDaUnidade([F('f7', 'p7', '2026-09')], [I('f7', 148)], unidadeDe).fechamentos[0]).toMatchObject({ id: 'f7', pasto_id: 'p7' });
    const aberto = fechamentosDaUnidade([F('fa', 'a', '2026-11'), F('fb', 'b', '2026-11', 'aberto')], [], unidadeDe).fechamentos[0];
    expect(aberto.status).toBe('aberto');
    const vedados = fechamentosDaUnidade([F('fa', 'a', '2026-11', 'fechado', 'vedado'), F('fb', 'b', '2026-11', 'fechado', 'vedado')], [], unidadeDe);
    expect(vedados.fechamentos[0].tipo_uso_mes).toBe('vedado');
  });
});

describe('a linha do painel', () => {
  it('"4 divisões: 7A 24,8 · … = 97,5 ha"; 1 divisão no singular; sem divisões = vazio', () => {
    const u = rodar('2026-11').unidades.get('p7');
    expect(fraseDasDivisoes(u?.divisoes ?? [])).toBe('4 divisões: 7A 24,8 · 7B 25,1 · 7C 24,4 · 7D 23,3 = 97,5 ha');
    expect(fraseDasDivisoes([{ nome: '6A', areaHa: 74.33 }])).toBe('1 divisão: 6A 74,3 = 74,3 ha');
    expect(fraseDasDivisoes([])).toBe('');
  });
  it('longa demais para 2 linhas: a forma curta no painel e a lista inteira no title', () => {
    const doze = Array.from({ length: 12 }, (_, i) => ({ nome: `P${i + 1}A`, areaHa: 37.525 }));
    const r = divisoesNoPainel(doze);
    expect(r.texto).toBe('12 divisões = 450,3 ha');
    expect(r.title).toBe(fraseDasDivisoes(doze));
    const quatro = rodar('2026-11').unidades.get('p7')?.divisoes ?? [];
    expect(divisoesNoPainel(quatro).texto).toBe('4 divisões: 7A 24,8 · 7B 25,1 · 7C 24,4 · 7D 23,3 = 97,5 ha');
  });
  it('caso P6 (contorno no pai, 6A e 6B sem polígono): "2 divisões sem desenho: 6A, 6B"', () => {
    const doP6 = rodar('2026-11').unidades.get('p6')?.divisoes ?? [];
    expect(divisoesNoPainel(doP6)).toEqual({ texto: '2 divisões sem desenho: 6A, 6B', title: '2 divisões sem desenho: 6A, 6B' });
  });
  it('parte desenhada: a frase inteira + "sem desenho: …"; longa: a forma curta conta as sem desenho', () => {
    const quatro = (rodar('2026-11').unidades.get('p7')?.divisoes ?? []).map((d) => (d.nome === '7C' ? { ...d, poligono: null } : d));
    expect(fraseDasDivisoes(quatro)).toBe('4 divisões: 7A 24,8 · 7B 25,1 · 7C 24,4 · 7D 23,3 = 97,5 ha · sem desenho: 7C');
    const doze = Array.from({ length: 12 }, (_, i) => ({ nome: `P${i + 1}A`, areaHa: 37.525, poligono: i < 3 ? null : { id: `g${i}` } }));
    expect(divisoesNoPainel(doze).texto).toBe('12 divisões = 450,3 ha · 3 sem desenho');
    expect(divisoesNoPainel(doze.map((d) => ({ ...d, poligono: null }))).texto).toBe('12 divisões sem desenho');
  });
});

describe('o contorno do pai na Validação (MAPA-PIQUETES-04, Sta. Rita 20A-1)', () => {
  it('o contorno do P7 (divisões desenhadas) é contorno de pai; o do P6 (divisões sem desenho) não; pasto solto e grupo do cadastro não', () => {
    const c = contornosDePai(POLIGONOS, PASTOS, GRUPOS);
    expect([...c].sort()).toEqual(['gP7']);
  });
  it('o P6 passa a ser contorno de pai quando a 1ª divisão ganha desenho', () => {
    const c = contornosDePai([...POLIGONOS, geo('gX', 'x')], PASTOS, GRUPOS);
    expect([...c].sort()).toEqual(['gP6', 'gP7']);
  });
});

describe('nada some em silêncio (MAPA-PIQUETES-04)', () => {
  it('pai SEM contorno (P18 da Pureza antes do backfill): não vira unidade; as divisões seguem como pastos, com o desenho delas', () => {
    const r = unidadesDoMapa({ pastos: PASTOS, grupos: GRUPOS, poligonos: POLIGONOS.filter((g) => g.id !== 'gP7'), anoMes: '2026-11', areaDe: () => 1 });
    expect(r.unidades.has('p7')).toBe(false);
    expect(r.poligonos.map((g) => g.id)).toEqual(expect.arrayContaining(['gA', 'gB', 'gC', 'gD']));
    expect(r.pastos.map((p) => p.id)).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
  });
  it('os pastos do mês sem polígono, em ordem natural; o aviso curto quando a lista é longa', () => {
    const r = rodar('2026-11');
    expect(pastosSemDesenho(r.pastos, r.poligonos, '2026-11')).toEqual([]);
    const semP1 = POLIGONOS.filter((g) => g.id !== 'gP1');
    expect(pastosSemDesenho(PASTOS, semP1, '2026-09')).toEqual(['P1']);
    expect(avisoSemDesenho(['P25'])?.texto).toBe('Pasto sem desenho: P25');
    expect(avisoSemDesenho(['P21A', 'P21B'])?.texto).toBe('2 pastos sem desenho: P21A, P21B');
    const muitos = Array.from({ length: 51 }, (_v, i) => `Pasto ${i + 1}`);
    expect(avisoSemDesenho(muitos)).toEqual({ texto: '51 pastos sem desenho', title: `51 pastos sem desenho: ${muitos.join(', ')}` });
    expect(avisoSemDesenho(['P25'], 0)).toEqual({ texto: '1 pasto sem desenho', title: 'Pasto sem desenho: P25' });
    expect(avisoSemDesenho([])).toBeNull();
  });
});
