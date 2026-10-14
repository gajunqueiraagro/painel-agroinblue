/**
 * ABATE-PROJETADO-01c — o cenario em que o abate abre. A regra pura e a ligacao no `LancamentosTab` (que nao se monta em teste:
 * lida da FONTE, com o detector conferido antes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cenarioInicialDoAbate } from '@/lib/oc/cenarioDoAbate';

const HOJE = '2026-10-14';

describe('cenarioInicialDoAbate', () => {
  it('com linha REALIZADA abre em realizado, mesmo com a data futura', () => {
    expect(cenarioInicialDoAbate({ dataAbate: '2026-11-20', hoje: HOJE, cenarios: ['projetado', 'realizado'] })).toBe('realizado');
    expect(cenarioInicialDoAbate({ dataAbate: '2026-11-20', hoje: HOJE, cenarios: ['realizado'] })).toBe('realizado');
  });
  it('data do abate FUTURA e sem realizado abre em projetado (com ou sem linha projetada)', () => {
    expect(cenarioInicialDoAbate({ dataAbate: '2026-11-20', hoje: HOJE, cenarios: [] })).toBe('projetado');
    expect(cenarioInicialDoAbate({ dataAbate: '2026-11-20', hoje: HOJE, cenarios: ['projetado'] })).toBe('projetado');
  });
  it('data de hoje ou passada: so com projetado abre em projetado; sem nada, realizado', () => {
    expect(cenarioInicialDoAbate({ dataAbate: HOJE, hoje: HOJE, cenarios: [] })).toBe('realizado');
    expect(cenarioInicialDoAbate({ dataAbate: '2026-09-30', hoje: HOJE, cenarios: ['projetado'] })).toBe('projetado');
    expect(cenarioInicialDoAbate({ dataAbate: null, hoje: HOJE, cenarios: [] })).toBe('realizado');
  });
  it('a 1645ba75 (data 14/10, criada 06/10, so realizado) seguiria em realizado', () => {
    expect(cenarioInicialDoAbate({ dataAbate: '2026-10-14', hoje: '2026-10-06', cenarios: ['realizado'] })).toBe('realizado');
  });
});

describe('a ligacao no LancamentosTab, lida da fonte', () => {
  const FONTE = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
  const HOOK = readFileSync('src/hooks/useOperacaoAbate.ts', 'utf8');
  const decide = /cenarioDecididoParaRef\.current === ocOperacaoId\) return;\s*cenarioDecididoParaRef\.current = ocOperacaoId;\s*setCenarioAbate\(cenarioInicialDoAbate\(\{ dataAbate: data, hoje: hojeLocal\(\), cenarios: abateApi\.cenarios \}\)\);/;
  it('o detector sabe achar e sabe recusar (auto-teste)', () => {
    expect(decide.test("cenarioDecididoParaRef.current === ocOperacaoId) return;\n cenarioDecididoParaRef.current = ocOperacaoId;\n setCenarioAbate(cenarioInicialDoAbate({ dataAbate: data, hoje: hojeLocal(), cenarios: abateApi.cenarios }));")).toBe(true);
    expect(decide.test("setCenarioAbate('projetado');")).toBe(false);
  });
  it('decide UMA vez por OC existente, depois que o hook leu os cenarios DELA, pelo dono e com a data local', () => {
    expect(FONTE).toMatch(decide);
    expect(FONTE).toContain('if (!ocAbateParam || !ocAberturaExistente || !ocOperacaoId) return;');
    expect(FONTE).toContain('if (abateApi.carregadoPara !== ocOperacaoId');
    /* o reset do abate esquece a decisao: a proxima OC decide de novo */
    expect(FONTE).toContain("setCenarioAbate('realizado'); cenarioDecididoParaRef.current = null;");
  });
  it('o hook diz para qual OC a leitura terminou (e zera sem OC)', () => {
    expect(HOOK).toContain('setCarregadoPara(operacaoId);');
    expect(HOOK).toContain('setCarregadoPara(null);');
    expect(HOOK).toContain('return { linhas, cenarios, carregadoPara, loading, saving, recarregar, salvar };');
  });
});
