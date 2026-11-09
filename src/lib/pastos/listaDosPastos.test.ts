/**
 * PASTO-FICHA-01 PR B — a lista dos pastos (Gabriel 08/11 08:57): piquete embaixo do pai e nunca solto, área do pai = soma dos piquetes,
 * toda coluna ordenável (ausência no fim), total que não conta a mesma terra duas vezes, médias ponderadas pela área.
 * Formas do caso real (Agnaldo · Sta. Tereza: "Modulo 04" com 8 piquetes M4-A…H, cadastro 151 ha, soma 144,55) com números sintéticos.
 */
import { describe, it, expect } from 'vitest';
import {
  acimaDoSuporte, anosDesde, avaliacaoVencida, FICHA_VAZIA, montarLinhas, ordenarLinhas, totaisDaLista,
  type FichaNaLista, type PastoDaLista,
} from './listaDosPastos';

const P = (id: string, nome: string, area: number | null, extra: Partial<PastoDaLista> = {}): PastoDaLista =>
  ({ id, nome, tipo_uso: 'recria', area_ha: area, ativo: true, pai_id: null, ...extra });
const F = (x: Partial<FichaNaLista>): FichaNaLista => ({ ...FICHA_VAZIA, ...x });
const rotulo = (t: string) => t;

/* o Modulo 04: pai (cadastro 151) + 8 piquetes que somam 144,55 */
const PIQ = [18.1, 18.2, 18.05, 18.0, 18.2, 18.0, 18.0, 18.0];
const MOD4 = [P('m4', 'Modulo 04', 151), ...PIQ.map((a, i) => P(`m4${i}`, `M4-${'ABCDEFGH'[i]}`, a, { pai_id: 'm4' }))];

describe('pai e piquetes', () => {
  it('o piquete vem embaixo do pai, nunca solto; a área do pai é a soma dos piquetes', () => {
    const ls = montarLinhas([...MOD4, P('p1', 'Pasto 01', 72.4)], new Map());
    expect(ls.map(l => l.pasto.nome)).toEqual(['Modulo 04', 'Pasto 01']);
    const m4 = ls[0];
    expect(m4.piquetes.map(q => q.pasto.nome)).toEqual(['M4-A', 'M4-B', 'M4-C', 'M4-D', 'M4-E', 'M4-F', 'M4-G', 'M4-H']);
    expect(m4.piquetes.every(q => q.ehPiquete)).toBe(true);
    expect(m4.area).toBe(144.55);
    expect(m4.areaDoCadastro).toBe(151);
    expect(ls[1].areaDoCadastro).toBeNull();
  });

  it('piquete cujo pai não está na lista sobe como linha de cima, marcado (não some)', () => {
    const ls = montarLinhas([P('q', 'P5-A', 101, { pai_id: 'fora' })], new Map());
    expect(ls).toHaveLength(1);
    expect(ls[0].ehPiquete).toBe(true);
  });

  it('o total soma as linhas de cima: os piquetes não contam duas vezes', () => {
    const t = totaisDaLista(montarLinhas([...MOD4, P('p1', 'Pasto 01', 72.4)], new Map()));
    expect(t.pastos).toBe(2);
    expect(t.piquetes).toBe(8);
    expect(t.area).toBe(216.95); // 144,55 + 72,40
  });

  it('sem área em nenhum piquete, o pai fica sem número (nunca 0,00)', () => {
    const ls = montarLinhas([P('pai', 'P8', 85), P('a', 'P8-A', null, { pai_id: 'pai' })], new Map());
    expect(ls[0].area).toBeNull();
  });
});

describe('ordenar', () => {
  const ficha = new Map<string, FichaNaLista>([
    ['a', F({ lotacao: 1.2, degradacao: 'forte', avaliadoEm: '2026-08-01' })],
    ['b', F({ lotacao: 0.8, degradacao: 'sem', avaliadoEm: '2025-01-10' })],
    ['c', F({})],
  ]);
  const ls = montarLinhas([P('a', 'Pasto 10', 50), P('b', 'Pasto 2', 30), P('c', 'Pasto 3', null)], ficha);

  it('nome em ordem natural: Pasto 2 antes de Pasto 10', () => {
    expect(ordenarLinhas(ls, 'pasto', 'asc', rotulo).map(l => l.pasto.nome)).toEqual(['Pasto 2', 'Pasto 3', 'Pasto 10']);
  });

  it('número: maior primeiro no desc; sem valor vai para o fim nos dois sentidos', () => {
    expect(ordenarLinhas(ls, 'lotacao', 'desc', rotulo).map(l => l.pasto.id)).toEqual(['a', 'b', 'c']);
    expect(ordenarLinhas(ls, 'lotacao', 'asc', rotulo).map(l => l.pasto.id)).toEqual(['b', 'a', 'c']);
    expect(ordenarLinhas(ls, 'area', 'asc', rotulo).map(l => l.pasto.id)).toEqual(['b', 'a', 'c']);
  });

  it('degradação pela escala (sem < leve < … < muito forte), não pela letra', () => {
    expect(ordenarLinhas(ls, 'degradacao', 'desc', rotulo).map(l => l.pasto.id)).toEqual(['a', 'b', 'c']);
  });

  it('os piquetes se ordenam dentro do pai pela mesma coluna', () => {
    const l2 = montarLinhas(MOD4, new Map());
    const o = ordenarLinhas(l2, 'area', 'desc', rotulo);
    expect(o[0].piquetes[0].area).toBe(18.2);
    expect(o[0].piquetes[o[0].piquetes.length - 1].area).toBe(18);
  });
});

describe('o rodapé e os sinais', () => {
  it('suporte e lotação médios são ponderados pela área (UA/ha × ha ÷ ha)', () => {
    const ficha = new Map<string, FichaNaLista>([['a', F({ lotacao: 2, suporte: 1, idadeAnos: 4 })], ['b', F({ lotacao: 1, suporte: 3, idadeAnos: 10 })]]);
    const t = totaisDaLista(montarLinhas([P('a', 'A', 100), P('b', 'B', 300)], ficha));
    expect(t.lotacaoMedia).toBe(1.25); // (2×100 + 1×300) / 400
    expect(t.suporteMedio).toBe(2.5);
    expect(t.idadeMedia).toBe(7);
  });

  it('a degradação média vira o degrau mais próximo', () => {
    const ficha = new Map<string, FichaNaLista>([['a', F({ degradacao: 'leve' })], ['b', F({ degradacao: 'moderada' })], ['c', F({ degradacao: 'leve' })]]);
    const t = totaisDaLista(montarLinhas([P('a', 'A', 1), P('b', 'B', 1), P('c', 'C', 1)], ficha));
    expect(t.degradacaoMedia).toBe(1.3);
    expect(t.degradacaoMediaNome).toBe('leve');
  });

  it('sem nenhum dado, as médias ficam sem número (nunca zero)', () => {
    const t = totaisDaLista(montarLinhas([P('a', 'A', 10)], new Map()));
    expect([t.idadeMedia, t.degradacaoMedia, t.suporteMedio, t.lotacaoMedia]).toEqual([null, null, null, null]);
  });

  it('lotação acima do suporte só com os dois números', () => {
    expect(acimaDoSuporte(F({ lotacao: 1.25, suporte: 1.1 }))).toBe(true);
    expect(acimaDoSuporte(F({ lotacao: 1.1, suporte: 1.1 }))).toBe(false);
    expect(acimaDoSuporte(F({ lotacao: 1.25 }))).toBe(false);
  });

  it('avaliação vencida = mais de 12 meses; sem avaliação não é vencida', () => {
    expect(avaliacaoVencida('2025-11-07', '2026-11-08')).toBe(true);
    expect(avaliacaoVencida('2025-11-08', '2026-11-08')).toBe(false);
    expect(avaliacaoVencida(null, '2026-11-08')).toBe(false);
  });

  it('idade em anos inteiros desde o mês da implantação', () => {
    expect(anosDesde('2019-03-01', '2026-11-08')).toBe(7);
    expect(anosDesde('2026-12-01', '2026-11-08')).toBe(0);
    expect(anosDesde(null, '2026-11-08')).toBeNull();
  });
});

import { colunaDoPasto, FONTE_PASTO_PX, PISO_DA_FONTE_PX } from './listaDosPastos';

describe('a coluna Pasto nunca corta o nome (Gabriel 09:22)', () => {
  it('cabe: a largura do maior nome, na fonte da régua (o espaço sai da Forrageira)', () => {
    expect(colunaDoPasto(170, 1080, 520)).toEqual({ px: 172, fontePx: FONTE_PASTO_PX });
  });
  it('a 135% não cabe: a fonte desce até caber, e a Forrageira guarda o mínimo', () => {
    const r = colunaDoPasto(180, 760, 500); // teto = 760 − 500 − 90 = 170
    expect(r.fontePx).toBe(9.5);
    expect(r.px).toBeLessThanOrEqual(175);
  });
  it('nem no piso: a coluna fica com o que o nome pede no piso (a Forrageira cede), nunca reticência', () => {
    const r = colunaDoPasto(300, 760, 500);
    expect(r.fontePx).toBe(PISO_DA_FONTE_PX);
    expect(r.px).toBe(Math.ceil(302 * 9.5 / 10));
  });
});

import { encerradoNoMes, filtrarPorVigencia, textoDaVigencia, totaisPorPosse, vigenteNoMes } from './listaDosPastos';

describe('PASTOS-CAD-02 — Vigentes · Encerrados · Todos no mês (o caso da 3M em out/26)', () => {
  const baldasso = P('b', 'Arrendamento - Baldasso', 50, { posse: 'arrendada_de_terceiro', data_inicio: '2026-07-01', data_fim: '2026-08-31', tipo_uso: 'engorda' });
  const reserva = P('r', 'Arrend. Reserva', 50, { posse: 'arrendada_de_terceiro', data_inicio: '2026-09-01', data_fim: null, tipo_uso: 'engorda' });
  const p05 = P('p5', 'P_05', 40.2, { data_inicio: null, data_fim: '2025-05-31' });
  const p07 = P('p7', 'P_07', 35.7, { data_inicio: null, data_fim: null });
  const ficha = new Map<string, FichaNaLista>([['p7', F({ lotacao: 0.94, suporte: 1.2 })]]);
  const ls = montarLinhas([baldasso, reserva, p05, p07], ficha);

  it('vigência no mês: Baldasso (07–08/26) encerrado em out/26; Reserva (09/26 →) vigente; sem data vale sempre', () => {
    expect([vigenteNoMes(baldasso, '2026-10'), vigenteNoMes(reserva, '2026-10'), vigenteNoMes(p07, '2026-10'), vigenteNoMes(p05, '2026-10')]).toEqual([false, true, true, false]);
    expect(vigenteNoMes(baldasso, '2026-08')).toBe(true);
    expect([encerradoNoMes(baldasso, '2026-10'), encerradoNoMes(reserva, '2026-10')]).toEqual([true, false]);
  });
  it('os três filtros', () => {
    const nomes = (f: 'vigentes' | 'encerrados' | 'todos') => filtrarPorVigencia(ls, f, '2026-10').map(l => l.pasto.nome).sort();
    expect(nomes('vigentes')).toEqual(['Arrend. Reserva', 'P_07']);
    expect(nomes('encerrados')).toEqual(['Arrendamento - Baldasso', 'P_05']);
    expect(nomes('todos')).toHaveLength(4);
  });
  it('a vigência como se lê na coluna', () => {
    expect([textoDaVigencia(baldasso), textoDaVigencia(reserva), textoDaVigencia(p05), textoDaVigencia(p07)]).toEqual(['07/26 → 08/26', '09/26 →', 'início → 05/25', '']);
  });
  it('o rodapé soma SÓ os vigentes do mês: própria × arrendada × total (o encerrado na lista não soma)', () => {
    const t = totaisPorPosse(ls, '2026-10');
    expect(t.propria).toMatchObject({ pastos: 1, area: 35.7, lotacaoMedia: 0.94, suporteMedio: 1.2 });
    expect(t.arrendada).toMatchObject({ pastos: 1, area: 50 });
    expect(t.total).toMatchObject({ pastos: 2, area: 85.7 });
    expect(t.naLista).toBe(4);
  });
  it('a divergência do campeiro (pasto técnico) não conta nos vigentes', () => {
    const div = P('d', '⚠️ Divergência do Campeiro', 0, { tipo_uso: 'divergencia', data_inicio: '2026-02-01' });
    expect(totaisPorPosse(montarLinhas([p07, div], new Map()), '2026-10').total.pastos).toBe(1);
  });
});
