/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b — a parte pura do caminho de volta: quem recebe cada gesto, a trava do Mover linha, a união das duas vizinhas,
 * a conta do aviso de perda (2%) e a leitura do que as três RPCs devolvem.
 */
import { describe, expect, it, vi } from 'vitest';
import { mesesDeInicio } from './piquetesEmEspera';
import {
  FRASE_ALGUEM_MEXEU, FRASE_LINHA_SEM_VIZINHA, FRASE_LINHA_SO_ENTRE_DUAS, fraseDaVolta, grupoDaDivisao, grupoDoPai, idsDoAlterar, irmasQueEncostam,
  inicioDoGrupo, itensDoMapaDoInicio, lerGravouInicio,
  lerDesfazer, lerDesfazerInicio, lerJuntar, lerMoverLinha, lerMudarInicio, mesBr, mesFechadoDoErro, mesesParaMudarInicio, motivoDaLinha, nomesDosPiquetes, recortarPorPadrao, segmentosSemRepetir, travaDaLinha, uniaoDasDuas, vaiPelaLinha, vizinhosQuePerdem, type GrupoDoMapa,
} from './piquetesVolta';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const A = quad(-54.03, -19.64, -54.02, -19.63);
const B = quad(-54.02, -19.64, -54.01, -19.63);   // encosta no lado leste de A
const LONGE = quad(-53.9, -19.64, -53.89, -19.63);

const grupo: GrupoDoMapa = { id: 'g1', nome: 'R_01', pasto_origem_id: 'pai', ativo: true };
const pastos = [{ id: 'pA', grupo_id: 'g1' }, { id: 'pB', grupo_id: 'g1' }, { id: 'pLonge', grupo_id: 'g1' }, { id: 'pOutro', grupo_id: null }, { id: 'pai', grupo_id: null }];

describe('quem recebe cada gesto', () => {
  it('divisão = o pasto está num grupo ATIVO com origem; o pai = o pasto é a origem de um grupo ativo', () => {
    expect(grupoDaDivisao('pA', pastos, [grupo])?.id).toBe('g1');
    expect(grupoDaDivisao('pOutro', pastos, [grupo])).toBeNull();
    expect(grupoDaDivisao(null, pastos, [grupo])).toBeNull();
    expect(grupoDaDivisao('pA', pastos, [{ ...grupo, ativo: false }])).toBeNull();
    expect(grupoDoPai('pai', [grupo])?.id).toBe('g1');
    expect(grupoDoPai('pA', [grupo])).toBeNull();
    expect(grupoDoPai('pai', [{ ...grupo, ativo: false }])).toBeNull();
  });

  it('as candidatas do Juntar são as irmãs do mesmo grupo QUE ENCOSTAM (não a de longe, nem a de outro grupo)', () => {
    const polis = [
      { id: 'a', nome_original: '6A', pasto_id: 'pA', geojson: A },
      { id: 'b', nome_original: '6B', pasto_id: 'pB', geojson: B },
      { id: 'l', nome_original: '9Z', pasto_id: 'pLonge', geojson: LONGE },
      { id: 'o', nome_original: 'Outro', pasto_id: 'pOutro', geojson: quad(-54.03, -19.63, -54.02, -19.62) },
    ];
    const r = irmasQueEncostam(polis[0], grupo, pastos, polis);
    expect(r.map(x => x.id)).toEqual(['b']);
    // auto-teste do conjunto: sem a regra do grupo o vizinho de cima apareceria (a busca sabe achar)
    expect(irmasQueEncostam(polis[0], { ...grupo, id: 'outro-grupo' }, pastos, polis)).toEqual([]);
  });
});

describe('Mover linha — a trava do gesto', () => {
  it('exatamente 2 polígonos do grupo passam; 3 ou mais travam com a frase do borda-do-pasto; 1 pede um ponto da divisa', () => {
    expect(motivoDaLinha(2)).toBeNull();
    expect(motivoDaLinha(3)).toBe(FRASE_LINHA_SO_ENTRE_DUAS);
    expect(motivoDaLinha(4)).toBe(FRASE_LINHA_SO_ENTRE_DUAS);
    expect(motivoDaLinha(1)).toBe(FRASE_LINHA_SEM_VIZINHA);
    expect(motivoDaLinha(0)).toBe(FRASE_LINHA_SEM_VIZINHA);
    expect(FRASE_LINHA_SO_ENTRE_DUAS).toBe('A linha só se move entre as duas divisões; não arraste pontos da borda do pasto');
  });
  it('2 polígonos mas um é de fora do grupo (o contorno do pai) também trava', () => {
    const doGrupo = new Set(['a', 'b']);
    expect(travaDaLinha(['a', 'b'], doGrupo)).toBeNull();
    expect(travaDaLinha(['a', 'pai-poligono'], doGrupo)).toBe(FRASE_LINHA_SO_ENTRE_DUAS);
    expect(travaDaLinha(['a', 'b', 'pai-poligono'], doGrupo)).toBe(FRASE_LINHA_SO_ENTRE_DUAS);
    expect(travaDaLinha(['a', 'b'], null)).toBeNull();
  });
  it('lê os ids do `alterar` do gesto (sem cast) e devolve vazio para o que não é gesto', () => {
    expect(idsDoAlterar({ acao: 'editar', alterar: [{ id: 'a', versao: 1 }, { id: 'b', versao: -1 }] })).toEqual(['a', 'b']);
    expect(idsDoAlterar({ acao: 'apagar' })).toEqual([]);
    expect(idsDoAlterar(null)).toEqual([]);
  });
});

describe('Juntar — a união das duas', () => {
  it('vizinhas dão UM Polygon com a soma das áreas', () => {
    const r = uniaoDasDuas({ id: 'a', nome: '6A', geojson: A }, { id: 'b', nome: '6B', geojson: B });
    expect('motivo' in r).toBe(false);
    if ('valor' in r) {
      expect(r.valor.type).toBe('Polygon');
      expect(r.valor.coordinates).toHaveLength(1);
    }
  });
  it('quem não encosta: "não são vizinhas", com os dois nomes', () => {
    const r = uniaoDasDuas({ id: 'a', nome: '6A', geojson: A }, { id: 'l', nome: '9Z', geojson: LONGE });
    expect('motivo' in r && r.motivo).toMatch(/^6A e 9Z não são vizinhas/);
  });
  it('MultiPolygon não entra (una só polígonos simples)', () => {
    const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [A.coordinates, B.coordinates] };
    const r = uniaoDasDuas({ id: 'a', nome: '6A', geojson: multi }, { id: 'b', nome: '6B', geojson: B });
    expect('motivo' in r).toBe(true);
  });
});

describe('o aviso do mini-mapa — vizinho que perde mais de 2%', () => {
  const vizinho = (fator: number) => ({ chave: 'v', nome: '6B', vizinho: true, antes: B, depois: quad(-54.02, -19.64, -54.02 + 0.01 * fator, -19.63) });
  it('perde 2,1% avisa; perde 1,9% não; exatamente nada não', () => {
    const r = vizinhosQuePerdem([vizinho(0.979)]);
    expect(r).toHaveLength(1);
    expect(r[0].perdaPct).toBeGreaterThan(2);
    expect(r[0].perdaPct).toBeLessThan(2.2);
    expect(vizinhosQuePerdem([vizinho(0.981)])).toEqual([]);
    expect(vizinhosQuePerdem([vizinho(1)])).toEqual([]);
  });
  it('só vizinho conta: a divisão editada que encolhe, o que ganha área e o sem polígono depois não avisam', () => {
    expect(vizinhosQuePerdem([{ ...vizinho(0.5), vizinho: false }])).toEqual([]);
    expect(vizinhosQuePerdem([vizinho(1.2)])).toEqual([]);
    expect(vizinhosQuePerdem([{ ...vizinho(0.5), depois: null }])).toEqual([]);
  });
});

describe('os metros dos lados — sem repetir a divisa comum', () => {
  it('duas vizinhas têm 7 lados (4 + 4 − 1 comum), não 8', () => {
    expect(segmentosSemRepetir([A, B])).toHaveLength(7);
    expect(segmentosSemRepetir([A])).toHaveLength(4);
    expect(segmentosSemRepetir([A, null])).toHaveLength(4);
  });
});

describe('o que as três RPCs devolvem', () => {
  it('mover linha: lê itens e somas; formato errado = null (nunca prévia vazia)', () => {
    const p = lerMoverLinha({ ok: true, mes: '2026-11-01', itens: [{ pasto_id: 'pA', nome: '6A', situacao: 'muda', area_antes: 10, area_mapa: 11, dif_ha: 1, dif_pct: 10 }],
      soma_antes_ha: 20, soma_depois_ha: 20, dif_soma_ha: 0, area_muda: true, frase: 'A linha muda.' });
    expect(p?.itens[0]).toMatchObject({ pastoId: 'pA', nome: '6A', areaAntesHa: 10, areaMapaHa: 11, difHa: 1 });
    expect(p?.areaMuda).toBe(true);
    expect(lerMoverLinha({ ok: true })).toBeNull();
    expect(lerMoverLinha(null)).toBeNull();
  });
  it('juntar e desfazer', () => {
    const j = lerJuntar({ ok: true, fica: { id: 'a', nome: '6A', area_antes_ha: 10, area_depois_ha: 20 }, sai: { id: 'b', nome: '6B', area_antes_ha: 10, encerra_em: '2026-10-31' },
      grupo: { id: 'g', nome: 'R_01', divisoes: 3 }, frase: 'ok' });
    expect(j?.sai.encerraEm).toBe('2026-10-31');
    expect(j?.grupo.divisoes).toBe(3);
    expect(lerJuntar({ ok: true, fica: {} })).toBeNull();
    const d = lerDesfazer({ ok: true, modo: 'criados', pai: { id: 'p', nome: 'R_01', volta_a_valer: true }, divisoes: [{ id: 'x', nome: '1A', fica_inativo: true }],
      poligonos: [{ id: 'g1', nome: '1A', destino: 'apagar' }, { id: 'g2', nome: '1B', destino: 'soltar' }], areas: [{ id: 'z', nome: 'Praça', tipo: 'benfeitoria' }], frase: 'f' });
    expect(d?.poligonos.map(x => x.destino)).toEqual(['apagar', 'soltar']);
    expect(d?.pai.voltaAValer).toBe(true);
    expect(lerDesfazer({ ok: true, modo: 'outro' })).toBeNull();
  });
});

describe('a frase da recusa', () => {
  it('P0001 vai inteira; 40001 = alguém mexeu; 42501 traduzido; o resto é frase da casa', () => {
    expect(fraseDaVolta({ code: 'P0001', message: 'Informe o motivo. Nada foi gravado.' })).toBe('Informe o motivo. Nada foi gravado.');
    expect(fraseDaVolta({ code: '40001', message: 'versão' })).toBe(FRASE_ALGUEM_MEXEU);
    expect(fraseDaVolta({ code: '42501', message: 'sem acesso a esta fazenda' })).toBe('Sem acesso a esta fazenda.');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fraseDaVolta({ code: 'XX000', message: 'boom cru' })).not.toContain('boom');
    erro.mockRestore();
  });
});

/* MAPA-PIQUETES-MANUAL-01 (Gabriel 03/11 06:22): o caminho manual dos piquetes */
describe('(2) os vértices de um piquete com a divisa junto entre duas irmãs gravam pelo Mover linha', () => {
  const grupo = new Set(['gA', 'gB', 'gC']);
  const base = { modo: 'vertices', moverLinha: false, divisaJunto: true, recortar: false, divisoesDoGrupo: grupo };
  it('duas divisões do grupo: vai pela linha (mês, motivo, área oficial)', () => {
    expect(vaiPelaLinha({ ...base, ids: ['gA', 'gB'] })).toBe(true);
  });
  it('um polígono só, vizinho de fora do grupo, três polígonos, sem a divisa junto, com recorte ou fora do vértices: o escritor de sempre', () => {
    expect(vaiPelaLinha({ ...base, ids: ['gA'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, ids: ['gA', 'gX'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, ids: ['gA', 'gB', 'gC'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, divisaJunto: false, ids: ['gA', 'gB'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, recortar: true, ids: ['gA', 'gB'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, modo: 'redesenhar', ids: ['gA', 'gB'] })).toBe(false);
    expect(vaiPelaLinha({ ...base, divisoesDoGrupo: null, ids: ['gA', 'gB'] })).toBe(false);
  });
  it('o "Mover linha" do painel continua indo pela linha', () => {
    expect(vaiPelaLinha({ ...base, moverLinha: true, divisaJunto: false, ids: ['gA'] })).toBe(true);
  });
});

describe('(4) o desenho à mão sobre um piquete nasce com o "Recortar vizinhos" ligado', () => {
  const q = (x0: number, y0: number, l: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + l, y0], [x0 + l, y0 + l], [x0, y0 + l], [x0, y0]]] });
  const piq = { id: 'gA', nome: 'P-A', geojson: q(-48, -15, 0.01) };
  const solto = { id: 'gS', nome: 'Solto', geojson: q(-47.9, -15, 0.01) };
  it('cai em cima de um piquete: liga', () => {
    expect(recortarPorPadrao(q(-47.996, -14.996, 0.002), [piq, solto], new Set(['gA']))).toBe(true);
  });
  it('cai fora dos piquetes (ou só num polígono que não é piquete), sem desenho, sem piquetes: não liga', () => {
    expect(recortarPorPadrao(q(-47.896, -14.996, 0.002), [piq, solto], new Set(['gA']))).toBe(false);
    expect(recortarPorPadrao(null, [piq], new Set(['gA']))).toBe(false);
    expect(recortarPorPadrao(q(-47.996, -14.996, 0.002), [piq], new Set())).toBe(false);
  });
});

// PIQUETE-VIGENCIA-01 — a parte pura do "Mudar mês de início"

describe('PIQUETE-VIGENCIA-01: Mudar mês de início (parte pura)', () => {
  it('D1: os últimos 4 meses a partir de hoje, sem o do início atual (o caso do P7: início 11/2026, hoje 05/11/2026)', () => {
    const m = mesesParaMudarInicio(mesesDeInicio(new Date(2026, 10, 5)), '2026-11-01');
    expect(m.map(x => x.rotulo)).toEqual(['08/2026', '09/2026', '10/2026']);
    // início mais antigo que os 4 meses: os 4 ficam (todos são adiar)
    expect(mesesParaMudarInicio(mesesDeInicio(new Date(2026, 10, 5)), '2026-03-01')).toHaveLength(4);
    expect(mesesParaMudarInicio(mesesDeInicio(new Date(2026, 10, 5)), null)).toHaveLength(4);
  });

  it('D3: o mês fechado vem do HINT do banco, e só no formato dele', () => {
    expect(mesFechadoDoErro({ code: 'P0001', message: 'x', hint: 'fechamento:2026-09' })).toBe('2026-09');
    expect(mesFechadoDoErro({ code: 'P0001', message: 'x', hint: ' fechamento:2026-09 ' })).toBe('2026-09');
    expect(mesFechadoDoErro({ code: 'P0001', message: 'x', hint: 'outra coisa' })).toBeNull();
    expect(mesFechadoDoErro({ code: 'P0001', message: 'x' })).toBeNull();
    expect(mesFechadoDoErro(null)).toBeNull();
  });

  it('lê a prévia do mudar e a do desfazer; fora do formato = null (nunca prévia vazia)', () => {
    const boa = { ok: true, direcao: 'antecipar', de: '2026-11-01', para: '2026-10-01', meses: ['2026-10'], frase: 'f',
      pai: { id: 'p7', nome: 'P7' }, area_pai_ha: '97.3', lotacao: { area_grupo_ha: 97.54 }, pastos: [{ id: 'a', nome: '7A' }], cards: [{}], cabecas_antes: 12 };
    const l = lerMudarInicio(boa);
    expect(l).toMatchObject({ direcao: 'antecipar', meses: ['2026-10'], areaPaiHa: 97.3, areaGrupoHa: 97.54, cards: 1, cabecas: 12 });
    expect(lerMudarInicio({ ...boa, direcao: 'outra' })).toBeNull();
    expect(lerMudarInicio({ ...boa, meses: [1] })).toBeNull();
    expect(lerMudarInicio({ ...boa, ok: false })).toBeNull();
    const d = { ok: true, direcao: 'adiar', de: '2026-10-01', para: '2026-11-01', meses: ['2026-10'], frase: 'f', pai: { id: 'p7', nome: 'P7' }, cards: 1, cabecas: 12 };
    expect(lerDesfazerInicio(d)).toMatchObject({ direcao: 'adiar', cards: 1, cabecas: 12 });
    expect(lerDesfazerInicio({ ...d, pai: null })).toBeNull();
  });

  it('nomes curtos dos piquetes e o mês em MM/AAAA', () => {
    expect(nomesDosPiquetes(['7A', '7B', '7C', '7D'])).toBe('7A–7D (4)');
    expect(nomesDosPiquetes(['7A'])).toBe('7A');
    expect(nomesDosPiquetes([])).toBe('—');
    expect(mesBr('2026-10')).toBe('10/2026');
    expect(mesBr('2026-10-01')).toBe('10/2026');
  });
});

describe('PIQUETE-VIGENCIA-01 — bugs do P9 e do P17 (06/11)', () => {
  it('a GRAVAÇÃO tem o leitor dela: a resposta real (sem frase/meses/pastos) vale; a prévia não vale como gravação', () => {
    const gravou = { ok: true, simulado: false, trilha_id: 'efddc735', de: '2026-11-01', para: '2026-10-01', direcao: 'antecipar', cards: [] };
    expect(lerGravouInicio(gravou)).toEqual({ trilhaId: 'efddc735' });
    expect(lerMudarInicio(gravou)).toBeNull();                       // o leitor da prévia não entende a gravação (era o bug)
    expect(lerGravouInicio({ ...gravou, simulado: true })).toBeNull();
    expect(lerGravouInicio({ ok: true, simulado: false })).toBeNull();
  });

  it('o início do grupo: todos no mesmo mês = esse mês; diferentes = desencontrados; vazio = nada', () => {
    const p = (nome: string, inicio: string | null) => ({ pastoId: nome, nome, inicio });
    expect(inicioDoGrupo([p('A', '2026-10-01'), p('B', '2026-10-15')])).toEqual({ mes: '2026-10-01', desencontrados: false });
    expect(inicioDoGrupo([p('A', '2026-10-01'), p('B', '2026-11-01')])).toEqual({ mes: null, desencontrados: true });
    expect(inicioDoGrupo([p('A', null), p('B', null)])).toEqual({ mes: null, desencontrados: false });
    expect(inicioDoGrupo([])).toEqual({ mes: null, desencontrados: false });
  });

  it('o mini-mapa sem prévia mostra o que vale hoje (o pai e os piquetes) — nunca vazio', () => {
    const pai = { chave: 'pai', nome: 'P9', geojson: quad(0, 0, 2, 1) }, piq = [{ pastoId: 'a', nome: 'P9-A', geojson: quad(0, 0, 1, 1) }];
    expect(itensDoMapaDoInicio(null, pai, piq).map(i => [i.chave, !!i.antes, !!i.depois])).toEqual([['pai', true, false], ['a', false, true]]);
    expect(itensDoMapaDoInicio('antecipar', pai, piq).map(i => [i.chave, !!i.antes, !!i.depois])).toEqual([['pai', true, false], ['a', false, true]]);
    expect(itensDoMapaDoInicio('adiar', pai, piq).map(i => [i.chave, !!i.antes, !!i.depois])).toEqual([['pai', false, true], ['a', true, false]]);
  });
});
