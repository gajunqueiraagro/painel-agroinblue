/**
 * PASTO-AREA-OFICIAL-02b — o Fechamento lê a área DO MÊS (não a de hoje do cadastro).
 *   F1 `comAreaDoMes`: troca a área pelo do mês; o que o `areaDe` não sabe fica como está (nunca zero no lugar de "não sei")
 *   F2 o Resumo por Atividade: o mês e as colunas "mês a mês" com a área de CADA mês; sem `areaDe`, o número de antes
 *   F3 a ligação na tela (lida do fonte, como o `modalDoPasto.test.tsx`): o FechamentoTab troca os pastos por `comAreaDoMes` lendo
 *      `useAreaDosPastosNoMes` (dez do ano anterior + o ano) e passa o `areaDe` ao Resumo, que o passa às colunas
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { areaDeDaLista, comAreaDoMes } from '@/lib/pastos/areaDoPastoNoMes';
import { colunasDaArea, montarResumoDoMes } from './resumoPorAtividade';

const pasto = (id: string, area: number | null, tipo = 'recria') => ({ id, nome: id.toUpperCase(), tipo_uso: tipo, area_produtiva_ha: area, ativo: true, data_inicio: null, data_fim: null });
const PASTOS = [pasto('a', 100), pasto('b', 50, 'cria')];
const card = (pastoId: string, anoMes: string) => ({ id: `${pastoId}-${anoMes}`, pasto_id: pastoId, ano_mes: anoMes, tipo_uso_mes: null, status: 'fechado' });
const areaDe = areaDeDaLista([
  { pastoId: 'a', anoMes: '2026-09', area: 100, fonte: 'fechado' }, { pastoId: 'a', anoMes: '2026-10', area: 100, fonte: 'vigencia' },
  { pastoId: 'a', anoMes: '2026-11', area: 120, fonte: 'vigencia' },
  { pastoId: 'b', anoMes: '2026-09', area: 48, fonte: 'fechado' }, { pastoId: 'b', anoMes: '2026-10', area: 50, fonte: 'vigencia' },
]);

describe('PASTO-AREA-OFICIAL-02b — o Fechamento lê a área do mês', () => {
  it('F1 comAreaDoMes troca pela do mês; o que não sabe fica', () => {
    expect(comAreaDoMes(PASTOS, '2026-09', areaDe).map((p) => p.area_produtiva_ha)).toEqual([100, 48]);
    expect(comAreaDoMes(PASTOS, '2026-11', areaDe).map((p) => p.area_produtiva_ha)).toEqual([120, 50]);
    expect(comAreaDoMes(PASTOS, '2026-11', areaDe)[1]).toBe(PASTOS[1]);
  });

  it('F2 o Resumo: o mês e as colunas mês a mês com a área de cada mês; sem areaDe, o de antes', () => {
    const cards = ['2026-09', '2026-10', '2026-11'].flatMap((m) => [card('a', m), card('b', m)]);
    const semArea = colunasDaArea({ meses: ['2026-09', '2026-11'], modo: 'fazenda', pastos: PASTOS, cards });
    expect(semArea.map((c) => c.totalHa)).toEqual([150, 150]);
    const comArea = colunasDaArea({ meses: ['2026-09', '2026-10', '2026-11'], modo: 'fazenda', pastos: PASTOS, cards, areaDe });
    expect(comArea.map((c) => c.totalHa)).toEqual([148, 150, 170]);
    const fases = colunasDaArea({ meses: ['2026-09'], modo: 'pecuaria', pastos: PASTOS, cards, areaDe });
    expect(fases[0].partes.find((p) => p.chave === 'cria')?.areaHa).toBe(48);
    expect(montarResumoDoMes({ anoMes: '2026-11', pastos: PASTOS, cards, itens: [], areaDe }).totalAreaHa).toBe(170);
  });

  it('F3 a ligação na tela: comAreaDoMes + useAreaDosPastosNoMes no FechamentoTab, areaDe até as colunas', () => {
    const tab = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(tab).toMatch(/const \{ pastos: pastosDeHoje, categorias, editarPasto \} = usePastos\(\);/);
    expect(tab).toMatch(/useAreaDosPastosNoMes\(fazendasDoAno, `\$\{Number\(anoFiltro\) - 1\}-12`, `\$\{anoFiltro\}-12`\)/);
    expect(tab).toMatch(/const pastos = useMemo\(\(\) => comAreaDoMes\(pastosDeHoje, anoMes, areaDoAno\)/);
    expect(tab).toMatch(/areaDe=\{areaDoAno\}/);
    const resumo = readFileSync('src/components/resumoAtividade/ResumoPorAtividade.tsx', 'utf8');
    expect(resumo.match(/colunasDaArea\(\{[^}]*areaDe: props\.areaDe \}\)/g)?.length).toBe(2);
  });
});
