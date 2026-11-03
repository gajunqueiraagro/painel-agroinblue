/**
 * MAPA-AREA-TIPOS-02 — o catálogo da tela é o MESMO do banco: o teste SQL (`supabase/tests/mapa_area_tipos_02_test.sql`) compara o banco
 * com o bloco entre as marcas CATALOGO; este compara a tela com o mesmo bloco (na mesma ordem). E as cores por família (D4).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { definicaoDoTipoDeArea, opcoesDeTipoDeArea, TIPOS_DE_AREA } from './tiposDeArea';
import { COR_DA_FAMILIA_DE_AREA, COR_TIPO_AREA, corDaArea } from './camadasDoMapa';
import { COR_DA_FAIXA } from './faixasLotacao';
import exemplos from './fichasDaInfra.exemplos.json';

function catalogoDoTesteSql(): unknown {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'tests', 'mapa_area_tipos_02_test.sql'), 'utf8');
  const bloco = sql.slice(sql.indexOf('-- CATALOGO-INICIO'), sql.indexOf('-- CATALOGO-FIM'));
  const m = bloco.match(/'(\[[\s\S]*\])'/);
  if (!m) throw new Error('bloco CATALOGO não achado no teste SQL');
  return JSON.parse(m[1]);
}

describe('o catálogo único (D1)', () => {
  it('a busca sabe achar: o bloco do teste SQL tem os 23 tipos', () => {
    expect(Array.isArray(catalogoDoTesteSql()) && (catalogoDoTesteSql() as unknown[]).length).toBe(23);
  });
  it('a tela = o bloco do teste SQL (que o banco também tem de ser), na mesma ordem', () => {
    expect(TIPOS_DE_AREA.map(t => ({ ...t }))).toEqual(catalogoDoTesteSql());
  });
  it('o seletor: cada família contígua (o cabeçalho aparece uma vez), a atividade à direita', () => {
    const grupos = opcoesDeTipoDeArea().map(o => o.grupo);
    expect([...new Set(grupos)]).toEqual(['Estruturas', 'Estruturas de pecuária', 'Água', 'Ambiental', 'Outros']);
    expect(grupos.join(',')).toBe([...new Set(grupos)].flatMap(g => grupos.filter(x => x === g)).join(','));
    expect(opcoesDeTipoDeArea().find(o => o.value === 'armazem_graos')).toMatchObject({ grupo: 'Estruturas', hint: 'agricultura' });
    expect(definicaoDoTipoDeArea('pasto')).toBeNull();
  });
});

describe('as fichas das 6 infraestruturas novas (D3)', () => {
  it('o bloco FICHAS-NOVAS do teste SQL = os exemplos da tela', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'tests', 'mapa_area_tipos_02_test.sql'), 'utf8');
    const bloco = sql.slice(sql.indexOf('-- FICHAS-NOVAS-INICIO'), sql.indexOf('-- FICHAS-NOVAS-FIM'));
    const m = bloco.match(/'(\{[\s\S]*\})'/);
    if (!m) throw new Error('bloco FICHAS-NOVAS não achado');
    const novas: Record<string, unknown> = JSON.parse(m[1]);
    expect(Object.keys(novas).sort()).toEqual(['armazem_graos', 'casa_funcionario', 'confinamento', 'escritorio', 'oficina', 'silo_secador']);
    for (const [k, v] of Object.entries(novas)) expect(v).toEqual(Reflect.get(exemplos, k));
    /* toda estrutura com valor aponta para uma infraestrutura que a tela conhece */
    for (const t of TIPOS_DE_AREA) if (t.infra) expect(Object.keys(exemplos)).toContain(t.infra);
  });
});

describe('as cores por família (D4)', () => {
  it('estrutura no cinza-violeta (nunca o cinza do Vazio), água azul-claro, ambiental, outros; sem classificação no cinza', () => {
    expect(corDaArea('armazem_graos')).toBe(COR_DA_FAMILIA_DE_AREA.estruturas);
    expect(corDaArea('benfeitoria')).not.toBe(COR_DA_FAIXA.vazio);
    expect(corDaArea('lagoa')).toBe(COR_DA_FAMILIA_DE_AREA.agua);
    expect(corDaArea('reserva_legal')).toBe(COR_TIPO_AREA.ambiental);
    expect(corDaArea('pista')).toBe(COR_TIPO_AREA.area_sem_uso);
    expect(corDaArea('outra')).toBe(COR_TIPO_AREA.estrutura);
    expect(new Set(Object.values(COR_DA_FAMILIA_DE_AREA)).size).toBe(5);
    expect(corDaArea('manga')).toBe(COR_DA_FAMILIA_DE_AREA.estruturas_pecuaria);
    expect(Object.values(COR_DA_FAIXA)).not.toContain(COR_DA_FAMILIA_DE_AREA.estruturas_pecuaria);
  });
});

describe('a prévia sem mudança diz o estado atual (Gabriel 02/11 15:47)', () => {
  it('pasto, piquete de grupo com o mês, área e sem classificação', async () => {
    const { fraseJaEstaAssim } = await import('./tiposDeArea');
    expect(fraseJaEstaAssim({ tipo: 'pasto', pasto: '20A-1-A' })).toBe('Já está ligado ao pasto 20A-1-A — nada para gravar.');
    expect(fraseJaEstaAssim({ tipo: 'pasto', pasto: '20A-1-A', grupo: '20A-1', desde: '2026-11-01' }))
      .toBe('Já está ligado ao pasto 20A-1-A, piquete de 20A-1, vale a partir de 11/2026 — nada para gravar.');
    expect(fraseJaEstaAssim({ tipo: 'pasto', pasto: 'P1', grupo: 'G', desde: null })).toBe('Já está ligado ao pasto P1, piquete de G — nada para gravar.');
    expect(fraseJaEstaAssim({ tipo: 'area', rotulo: 'Manga' })).toBe('Já está marcado como Manga — nada para gravar.');
    expect(fraseJaEstaAssim({ tipo: 'outra' })).toBe('Já está sem classificação — nada para gravar.');
  });
});
