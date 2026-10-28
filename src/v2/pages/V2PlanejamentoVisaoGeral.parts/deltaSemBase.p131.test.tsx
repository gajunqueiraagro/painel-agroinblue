/**
 * P131 — VG Planejamento: Δ% com o Real do ano anterior = 0 mostra "—" com o title "sem base no ano anterior", nunca um número infinito
 * (antes: (meta − 0) / 1 → "+1714872142.0%", vazando da célula). Vale para todo Δ% da tela contra o ano anterior.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';
import { buildLinhaExecutivaModalData } from '@/v2/lib/buildLinhaExecutivaModalData';
import { TITULO_SEM_BASE_ANO_ANTERIOR } from '@/v2/lib/deltaSemBase';
import { ComposicaoFinanceira } from './ComposicaoFinanceira';
import { DeltaBadge } from './resumoExecutivoUI';
import { CardComparativo } from '@/v2/components/CardComparativo';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { BlocoAnaliseEconomica } from './BlocoAnaliseEconomica';
import type { AnaliseEconomicaGrupo, AnaliseEconomicaLinha, Bloco3AnaliseEconomica } from '@/v2/lib/planejamentoVisaoGeralTypes';

const grid: SubcentroGrid[] = [
  { macro_custo: 'Receita Operacional', grupo_custo: 'Receita Pecuária', centro_custo: 'Abates', subcentro: 'Abates de Machos',
    escopo_negocio: 'pecuaria', ordem_exibicao: 0, meses: new Array(12).fill(142906011.85) },
];
// sem Real do ano anterior: toda linha do Bloco fica sem base
const semBase = buildBlocoResumoExecutivo({ lancFin2025: [], gridMeta2026: grid, saldoInicialMeta: 0 });

describe('P131 — Δ% sem base no ano anterior', () => {
  it('o Bloco devolve delta null (nunca meta/1) quando o Real do ano anterior é 0', () => {
    expect(semBase.receitaPecuaria.meta).toBeGreaterThan(0);
    expect(semBase.receitaPecuaria.real).toBe(0);
    expect(semBase.receitaPecuaria.delta).toBeNull();
    expect(semBase.totalEntradas.delta).toBeNull();
    expect(semBase.custeioPecuaria.delta).toBeNull();
  });

  it('o selo: null → "—" com o title, no mesmo lugar; número → o percentual', () => {
    const { rerender } = render(<DeltaBadge delta={null} />);
    const vazio = screen.getByTestId('delta-sem-base');
    expect(vazio.textContent).toBe('—');
    expect(vazio.getAttribute('title')).toBe(TITULO_SEM_BASE_ANO_ANTERIOR);
    rerender(<DeltaBadge delta={0.25} />);
    expect(screen.getByText('+25.0%')).toBeTruthy();
  });

  it('a tabela de Entradas/Saídas no Planejamento: nenhum percentual gigante, todo Δ% vira "—" com o title', () => {
    render(<ComposicaoFinanceira data={semBase} modo="planejamento" />);
    expect(screen.queryByText(/\d{5,}[.,]\d%/)).toBeNull();
    const vazios = screen.getAllByTestId('delta-sem-base');
    // 2 totais + 5 linhas de entrada + 11 de saída
    expect(vazios).toHaveLength(18);
    for (const v of vazios) expect(v.getAttribute('title')).toBe(TITULO_SEM_BASE_ANO_ANTERIOR);
  });

  it('o modal da linha (Planejamento): subcentro e centro com Real 0 são null', () => {
    const d = buildLinhaExecutivaModalData({
      linha: semBase.receitaPecuaria,
      porSubcentroMeta: { 'Abates de Machos': { centro_custo: 'Abates', meses: new Array(12).fill(100) } },
      porSubcentroReal: {},
    });
    expect(d.porCentro[0].subcentros[0].delta).toBeNull();
    expect(d.porCentro[0].delta).toBeNull();
  });

  it('o card comparativo: "— vs ano ant." com o title', () => {
    render(<CardComparativo titulo="Arrobas" mostrarVsAnoAnt dado={{ valor: 10, origem: 'pc100', tipoSemantica: 'acumulado', formato: 'numero',
      vsAnoFechado: { valor: 0, delta: null }, vsMesmoPeriodo: { valor: null, delta: null } }} />);
    expect(screen.getByText('— vs ano ant.').getAttribute('title')).toBe(TITULO_SEM_BASE_ANO_ANTERIOR);
  });

  it('a Análise Econômica: Δ% contra o ano anterior sem base (Real 0) é "—" com o title, no legado e no de 3 valores', () => {
    const l = (label: string): AnaliseEconomicaLinha => ({ label, valor: 1000, valorAnoAnt: 0, valorAnoCorrente: 900, deltaRs: 1000, deltaPct: null });
    const gr = (label: string): AnaliseEconomicaGrupo => ({ label, total: l(label), detalhes: [] });
    const dto: Bloco3AnaliseEconomica = {
      faturamento: gr('Faturamento'), deducoes: gr('Deduções'), receitaLiquida: l('Receita Líquida'), custeioPecuaria: gr('Custeio'),
      resultadoBruto: l('Resultado Bruto'), investimentoFazendaPec: l('Investimento'), resultadoComInvestimento: l('Res. c/ Inv.'),
      reposicaoBovinos: l('Reposição'), variacaoEstoqueGado: l('Variação'), resultadoOperacional: l('Res. Operacional'),
      resultadoFinanceiro: gr('Financeiro'), resultadoAntesTributos: l('Antes Tributos'), tributosPatrimoniais: null, impostosSobreLucro: null,
      lucroLiquido: l('Lucro Líquido'),
    };
    for (const m of [false, true]) {
      const { container, unmount } = render(<BlocoAnaliseEconomica data={dto} desfocar={false} ano={2026} mostrarAnoCorrente={m} />);
      const comTitulo = container.querySelectorAll(`[title="${TITULO_SEM_BASE_ANO_ANTERIOR}"]`);
      expect(comTitulo.length).toBeGreaterThan(0);
      for (const e of comTitulo) expect(e.textContent).toBe('—');
      unmount();
    }
  });
});
