/**
 * P132 — Fechamento do Período › Desembolso de Produção: o agrupamento dos menores se chama "Demais (N)"; o centro real "Outros" do
 * plano fica com o nome dele; a chave do React é única (antes: duas linhas "Outros", chave repetida).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DesembolsoProducao from './DesembolsoProducao';
import { DetalheCustosCentroSubcentro } from './DetalheCustosCentroSubcentro';
import { agruparDemais, CHAVE_DEMAIS } from '@/v2/lib/agruparDemais';
import type { CentroNode, GrupoNode } from '@/v2/types/fechamentoPeriodo';

const centro = (centro_custo: string, realizado: number): CentroNode => ({
  centro_custo, realizado, meta: realizado, anoAnterior: null, desvioMeta: 0, desvioMetaPct: 0, desvioAnoAnt: null, desvioAnoAntPct: null,
  subcentros: [],
});
const grupo = (grupo_custo: string, centros: CentroNode[]): GrupoNode => ({
  grupo_custo, macro_custo: 'Custeio Produção', realizado: centros.reduce((s, c) => s + (c.realizado ?? 0), 0), meta: null,
  anoAnterior: null, desvioMeta: null, desvioMetaPct: null, desvioAnoAnt: null, desvioAnoAntPct: null, centros,
});

// 9 centros; o "Outros" REAL (700) fica entre os 6 maiores; sobram 3 → "Demais (3)".
const fixo = grupo('Custo Fixo Pecuária', [
  centro('Mão de Obra', 900), centro('Administração', 800), centro('Outros', 700), centro('Impostos', 600), centro('Máquinas', 500),
  centro('Manutenção Fazenda', 400),
]);
const variavel = grupo('Custo Variável Pecuária', [centro('Nutrição', 300), centro('Sanidade', 200), centro('Reprodução', 100)]);
const fixoGrande = grupo('Custo Fixo Pecuária', [...fixo.centros, centro('Comercial', 90), centro('Pastagem', 80)]);

/* o ResponsiveContainer do recharts mede com ResizeObserver, que o jsdom não tem */
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

let erros: ReturnType<typeof vi.spyOn>;
afterEach(() => erros?.mockRestore());
const semChaveRepetida = () => {
  const repetida = erros.mock.calls.some((c) => String(c[0]).includes('same key'));
  expect(repetida).toBe(false);
};

describe('P132 — "Demais (N)" no agrupamento dos menores', () => {
  it('a regra: os N primeiros com o nome deles + "Demais (N)" com chave própria; a soma se preserva', () => {
    const linhas = agruparDemais([5, 4, 3, 2, 1], 3, (v) => `c${v}`, (resto, rotulo) => {
      expect(rotulo).toBe('Demais (2)');
      return resto.reduce((s, v) => s + v, 0);
    });
    expect(linhas.map((l) => l.item)).toEqual([5, 4, 3, 3]);
    expect(linhas.map((l) => l.chave)).toEqual(['c5', 'c4', 'c3', CHAVE_DEMAIS]);
    expect(agruparDemais([1, 2], 3, String, () => 0)).toHaveLength(2);
  });

  it('Resumo por Centro: o "Outros" real fica com o nome, os menores viram "Demais (3)", sem chave repetida', () => {
    erros = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DesembolsoProducao
        dto={{ estruturaCustos: { grupos: [fixo, variavel], totalGeral: { realizado: 4500, meta: null, anoAnterior: null, desvioMeta: null, desvioMetaPct: null, desvioAnoAnt: null, desvioAnoAntPct: null } } }}
        custoCab={10} custoArr={null} custeioAcum={4500}
        custoCabSerieMes={[]} custoCabSerieAcum={[]} custoCabDeltaMeta={null} custoCabDeltaAno={null}
        custoArrSerieMes={[]} custoArrSerieAcum={[]} custoArrDeltaMeta={null} custoArrDeltaAno={null}
        custeioSerieAcum={[]} custeioDeltaMeta={null} custeioDeltaAno={null}
        mesAlvoIdx={9} labelsMeses={['2026-09']} numMeses={1} rebanhoMedioReal={null} rebanhoMedioMeta={null} subtitulo="P132"
      />,
    );
    const tabela = screen.getByText('Centro de Custo').closest('table');
    expect(tabela).not.toBeNull();
    const nomes = within(tabela!).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent);
    expect(nomes).toEqual(['Mão de Obra', 'Administração', 'Outros', 'Impostos', 'Máquinas', 'Manutenção Fazenda', 'Demais (3)', 'TOTAL']);
    semChaveRepetida();
  });

  it('Detalhe do Custo Fixo (donut): o "Outros" real fica, os 2 menores viram "Demais (2)", sem chave repetida', () => {
    erros = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DetalheCustosCentroSubcentro
        dto={{ meses: ['2026-09'], estruturaCustos: { grupos: [fixoGrande], totalGeral: { realizado: 3970, meta: null, anoAnterior: null, desvioMeta: null, desvioMetaPct: null, desvioAnoAnt: null, desvioAnoAntPct: null } } }}
        custeioAcum={3970} custoCab={10} subtitulo="P132" grupoAlvo="Custo Fixo Pecuária"
      />,
    );
    const legenda = screen.getByText('R$/cab/mês', { selector: 'th' }).closest('table');
    expect(legenda).not.toBeNull();
    const nomes = within(legenda!).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent);
    expect(nomes).toEqual(['Mão de Obra', 'Administração', 'Outros', 'Impostos', 'Máquinas', 'Manutenção Fazenda', 'Demais (2)']);
    semChaveRepetida();
  });
});
