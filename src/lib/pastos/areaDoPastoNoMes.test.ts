/**
 * PASTO-AREA-OFICIAL-02a — a área de cada pasto em cada mês (a leitura do banco) e os helpers que a recebem.
 *   R1 a leitura tolerante da resposta da `fn_pastos_area_do_mes` e o `areaDe` (sabe = o número; não sabe = `undefined`)
 *   R2 sem `areaDe` os helpers dão EXATAMENTE o número de antes (a área de hoje); com `areaDe`, a área do mês — inclusive 0 e nulo;
 *      o `undefined` cai na área de hoje (nunca zero no lugar de "não sei")
 *   R3 a média do ano do PC-100 Meta com a área de cada mês
 *   T1 A TRAVA: só os arquivos da lista lêem `area_produtiva_ha` (a lista só pode encolher). Arquivo novo que precisa da área de um
 *      MÊS usa `useAreaDosPastosNoMes` / `areaDe`, nunca o cadastro de hoje. Arquivo da lista que deixou de ler = tirar daqui.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { areaDeDaLista, areaNoMesOuHoje, lerAreasDoMes } from './areaDoPastoNoMes';
import { areaDosPastosNoMes, areaPecuariaMediaDoAno, areaPorMes } from './areaDoMes';
import { calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';

const pasto = (id: string, area: number | null, extra: Record<string, unknown> = {}) => ({
  id, ativo: true, area_produtiva_ha: area, tipo_uso: 'recria', data_inicio: null, data_fim: null, ...extra,
});
const PASTOS = [pasto('a', 100), pasto('b', 50), pasto('r', 30, { tipo_uso: 'reserva' })];
/* A mudou para 120 em 11/2026 (antes 100); B fechado em 09/2026 com 48 congelado; nada se sabe do R */
const areaDe = areaDeDaLista(lerAreasDoMes([
  { pasto_id: 'a', ano_mes: '2026-09', area_ha: 100, fonte: 'fechado' }, { pasto_id: 'a', ano_mes: '2026-10', area_ha: '100.00', fonte: 'vigencia' },
  { pasto_id: 'a', ano_mes: '2026-11', area_ha: 120, fonte: 'vigencia' },
  { pasto_id: 'b', ano_mes: '2026-09', area_ha: 48, fonte: 'fechado' }, { pasto_id: 'b', ano_mes: '2026-10', area_ha: 50, fonte: 'vigencia' },
  { pasto_id: 'b', ano_mes: '2026-11', area_ha: null, fonte: 'vigencia' },
  'lixo', { pasto_id: 'x' },
]));

describe('PASTO-AREA-OFICIAL-02a — a área do pasto no mês', () => {
  it('R1 a leitura e o areaDe', () => {
    expect(lerAreasDoMes([{ pasto_id: 'a', ano_mes: '2026-09', area_ha: '95.5', fonte: 'fechado' }, null, { ano_mes: '2026-09' }]))
      .toEqual([{ pastoId: 'a', anoMes: '2026-09', area: 95.5, fonte: 'fechado' }]);
    expect(lerAreasDoMes('x')).toEqual([]);
    expect(areaDe('a', '2026-10')).toBe(100);
    expect(areaDe('b', '2026-11')).toBeNull();
    expect(areaDe('r', '2026-11')).toBeUndefined();
    expect(areaNoMesOuHoje(PASTOS[0], '2026-11', areaDe)).toBe(120);
    expect(areaNoMesOuHoje(PASTOS[2], '2026-11', areaDe)).toBe(30);
    expect(areaNoMesOuHoje(PASTOS[0], undefined, areaDe)).toBe(100);
  });

  it('R2 sem areaDe = o número de antes; com areaDe = a área do mês; undefined cai na de hoje', () => {
    expect(areaDosPastosNoMes(PASTOS, '2026-09')).toBe(180);
    expect(areaDosPastosNoMes(PASTOS, '2026-09', areaDe)).toBe(178);
    expect(areaDosPastosNoMes(PASTOS, '2026-11', areaDe)).toBe(150);
    expect(areaPorMes(PASTOS, ['2026-09', '2026-10', '2026-11'], areaDe)).toEqual([178, 180, 150]);
    expect(calcAreaProdutivaPecuaria(PASTOS, '2026-09')).toBe(150);
    expect(calcAreaProdutivaPecuaria(PASTOS, '2026-09', areaDe)).toBe(148);
    expect(calcAreaProdutivaPecuaria(PASTOS, '2026-11', areaDe)).toBe(120);
    expect(calcAreaProdutivaPecuaria(PASTOS, undefined, areaDe)).toBe(150);
  });

  it('R3 a média do ano com a área de cada mês', () => {
    const doAno = areaDeDaLista(Array.from({ length: 12 }, (_, i) => ({ pastoId: 'a', anoMes: `2026-${String(i + 1).padStart(2, '0')}`, area: i < 10 ? 100 : 120, fonte: 'vigencia' as const })));
    expect(areaPecuariaMediaDoAno([pasto('a', 120)], 2026)).toBe(120);
    expect(areaPecuariaMediaDoAno([pasto('a', 120)], 2026, doAno)).toBeCloseTo((10 * 100 + 2 * 120) / 12, 6);
  });
});

/* ── T1 a trava ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const LEEM_HOJE: readonly string[] = [
  'src/components/FechamentoPastoDialog.tsx',
  'src/components/mapa-geo/MapaGestorView.tsx',
  'src/components/mapa-geo/MapaOperacaoView.tsx',
  'src/components/mapa-geo/PastoDetailSheet.tsx',
  'src/components/mapa-geo/ValidacaoPoligonosView.tsx', // MAPA-EDITAR-POLIGONO-01: a área de HOJE ao lado do polígono que se edita (estado atual, não mês passado)
  'src/components/pastos/GruposDePastejo.tsx',
  'src/components/patrimonio/AbaPastos.tsx',
  'src/hooks/useAnaliseTrimestral.ts',
  'src/hooks/useFechamentoArea.ts',
  'src/hooks/usePainelConsultorData.ts',
  'src/hooks/usePastos.ts',
  'src/hooks/usePlanejamentoAprovacaoData.ts',
  'src/hooks/useProdutivoPorFazenda.ts',
  'src/hooks/useRebanhoOficial.ts',
  'src/hooks/useZootMensal.ts',
  'src/lib/calculos/zootecnicos.ts',
  'src/lib/exportMapaPastos.ts',
  'src/lib/exportMapaPastosPdf.ts',
  'src/lib/fechamento/resumoPecuaria.ts',
  'src/lib/fechamento/resumoPorAtividade.ts',
  'src/lib/mapa/mapaDoMes.ts',
  'src/lib/mapa/resumoGlobal.ts',
  'src/lib/painelConsultor/consolidacaoGlobal.ts',
  'src/lib/painelConsultor/indicadorCatalogo.ts',
  'src/lib/pastos/agruparPorFamilia.ts',
  'src/lib/pastos/areaDoMes.ts',
  'src/lib/pastos/areaDoPastoNoMes.ts',
  'src/lib/pastos/gruposDePastejo.ts',
  'src/lib/pastos/regenerarArea.ts',
  'src/lib/patrimonio/patrimonioApi.ts',
  'src/lib/pecuaria/fechamentoGlobal.ts',
  'src/pages/FechamentoTab.tsx',
  'src/pages/MapaGeoPastosTab.tsx',
  'src/pages/MapaPastosTab.tsx',
  'src/pages/PainelConsultorTab.tsx',
  'src/pages/PastosTab.tsx',
  'src/pages/resumo-op/ResOpDashboard.tsx',
  'src/pages/ResumoPastosTab.tsx',
  'src/pages/ResumoTab.tsx',
  'src/v2/pages/V2AreasMeta.tsx',
  'src/v2/pages/V2Fazendas.tsx',
  'src/v2/pages/V2Home.tsx',
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) return arquivos(c);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [c] : [];
  });
}

describe('PASTO-AREA-OFICIAL-02a — a trava da área de hoje', () => {
  it('T1 só a lista lê area_produtiva_ha (arquivo novo: área do mês por useAreaDosPastosNoMes / areaDe); a lista só encolhe', () => {
    const leem = arquivos('src').filter((f) => !f.includes('integrations/supabase/types') && readFileSync(f, 'utf8').includes('area_produtiva_ha')).sort();
    expect(leem.length).toBeGreaterThan(30); // a busca sabe achar (auto-teste: hoje são 41)
    expect(leem.filter((f) => !LEEM_HOJE.includes(f))).toEqual([]);
    expect(LEEM_HOJE.filter((f) => !leem.includes(f))).toEqual([]);
  });
});
