/**
 * FECH-PASTO-UNIDADE-01 (Gabriel 07/11: "piquete não é pasto, é apenas uma subárea dentro do pasto") — a tela lê o pai de cada piquete
 * (espelho de `_fn_pai_do_piquete`), a regra única do mês deixa o piquete de fora (espelho de `fn_pastos_aplicaveis_mes`) e o card do pasto
 * mostra "N piquetes". Caso: o Módulo 01 do Agnaldo, dividido em M1-A e M1-B desde out/26; um grupo de pastejo SEM origem não é divisão.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { comPaiDoPiquete, pastosAtivosNoMes, piquetesNoMes } from './usePastos';

const pasto = (id: string, nome: string, grupo: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, nome, grupo_id: grupo, ativo: true, data_inicio: null as string | null, data_fim: null as string | null, ...extra });
const PASTOS = [
  pasto('m1', 'Módulo 01', null),
  pasto('m1a', 'M1-A', 'g-m1', { data_inicio: '2026-10-01' }),
  pasto('m1b', 'M1-B', 'g-m1', { data_inicio: '2026-11-01' }),
  pasto('p10a', 'P10A', 'g-rot'), pasto('p10b', 'P10B', 'g-rot'),
  pasto('velho', 'P_velho', 'g-inativo'),
];
const GRUPOS = [
  { id: 'g-m1', pasto_origem_id: 'm1', ativo: true },
  { id: 'g-rot', pasto_origem_id: null, ativo: true },
  { id: 'g-inativo', pasto_origem_id: 'm1', ativo: false },
];

describe('quem é piquete', () => {
  it('pai = a origem do grupo ATIVO, quando não é o próprio pasto; grupo de pastejo sem origem e grupo inativo não fazem piquete', () => {
    const lidos = comPaiDoPiquete(PASTOS, GRUPOS);
    expect(Object.fromEntries(lidos.map(p => [p.id, p.pai_id]))).toEqual({ m1: null, m1a: 'm1', m1b: 'm1', p10a: null, p10b: null, velho: null });
    /* o pai no próprio grupo (origem = ele mesmo) não é piquete dele */
    expect(comPaiDoPiquete([pasto('m1', 'Módulo 01', 'g-m1')], GRUPOS)[0].pai_id).toBeNull();
  });
});

describe('a regra única do mês', () => {
  it('out/26: o Módulo 01 vale e os piquetes ficam de fora; o grupo de pastejo segue com os seus pastos', () => {
    const lidos = comPaiDoPiquete(PASTOS, GRUPOS);
    expect(pastosAtivosNoMes(lidos, '2026-10').map(p => p.id)).toEqual(['m1', 'p10a', 'p10b', 'velho']);
  });
  it('o selo: os piquetes VIGENTES no mês, por pai (M1-B começa em nov/26)', () => {
    const lidos = comPaiDoPiquete(PASTOS, GRUPOS);
    expect([...piquetesNoMes(lidos, '2026-10')].map(([pai, qs]) => [pai, qs.map(q => q.nome)])).toEqual([['m1', ['M1-A']]]);
    expect(piquetesNoMes(lidos, '2026-11').get('m1')?.map(q => q.nome)).toEqual(['M1-A', 'M1-B']);
    expect(piquetesNoMes(lidos, '2026-09').size).toBe(0);
  });
});

describe('a tela', () => {
  it('a leitura dos pastos traz o pai (pasto_grupos dos grupos citados) e o card do pasto mostra "N piquetes"', () => {
    const hook = readFileSync('src/hooks/usePastos.ts', 'utf8');
    expect(hook).toContain(".from('pasto_grupos').select('id, pasto_origem_id, ativo').in('id', grupoIds)");
    expect(hook).toContain('const result = comPaiDoPiquete(data ?? [], grupos);');
    const tela = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(tela).toContain('const piquetesDoMes = useMemo(() => piquetesNoMes(pastos, anoMes), [pastos, anoMes]);');
    expect(tela).toMatch(/data-testid="selo-piquetes"[\s\S]{0,200}\{piquetesDoMes\.get\(p\.id\)\?\.length\} piquetes/);
  });
});
