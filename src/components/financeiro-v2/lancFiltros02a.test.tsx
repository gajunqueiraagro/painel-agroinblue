/**
 * LANC-FILTROS-02a (Gabriel 25/11, mock lancamentos-filtros-ref/mock-aprovado.html) — os filtros compactos, o Período no lugar de Ano/Mês
 * (`de`/`ate` ao banco, lote 118770) e o resumo em dois blocos. A `FinanceiroV2Tab` não se monta em teste: a ligação é lida da FONTE.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { filtrosDaPaginaV2, type FiltrosDaTelaV2 } from '@/lib/financeiro/listaPaginaV2';
import { diaSeguinte, montarPlanoBaseV2 } from '@/lib/financeiro/filtrosBaseV2';
import { temFiltroLimitante } from '@/lib/financeiro/filtroLimitante';
import { chipsDosFiltros, periodoDosAnosEMeses, textoDosAnosEMeses, textoDosAtivos } from '@/lib/financeiro/filtrosAtivosDaLista';
import { aPagarDoResumo, caixaDoResumo, moedaComSinal, ResumoDaListaV2 } from '@/components/financeiro-v2/ResumoDaListaV2';

const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');

const base: FiltrosDaTelaV2 = {
  fazendaId: '__all__', anos: ['2026'], meses: ['10'], dimensao: 'financeira', tipoOperacao: '__all__', status: [], contaOrigem: '__all__',
  contaDestino: '__all__', macro: '__all__', grupo: '__all__', centro: '__all__', subcentro: '__all__', safra: '__all__', cultura: '__all__',
  atividade: '__all__', produto: '', documento: '', fornecedor: '__all__', modoSemCaixa: 'ocultar',
};

describe('o Período vai ao banco por datas e MANDA', () => {
  it('com o período: `de`/`ate` e nada de anos/meses; sem ele, como hoje', () => {
    const f = filtrosDaPaginaV2({ ...base, periodo: { de: '2025-12-01', ate: '2026-11-30' } });
    expect(f).toMatchObject({ de: '2025-12-01', ate: '2026-11-30' });
    expect(f).not.toHaveProperty('anos');
    expect(f).not.toHaveProperty('meses');
    const g = filtrosDaPaginaV2(base);
    expect(g).toMatchObject({ anos: [2026], meses: [10] });
    expect(g).not.toHaveProperty('de');
  });
  it('o plano do front (a seção sem caixa, a exportação "Mostrar"): UMA faixa [de, ate + 1) na dimensão', () => {
    const p = montarPlanoBaseV2('C', { dimensao: 'competencia', periodo: { de: '2026-10-05', ate: '2026-10-31' }, anos: ['2020'] }, { relacao: 'view' });
    expect(p.orTemporal).toBe('and(data_competencia.gte.2026-10-05,data_competencia.lt.2026-11-01)');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
    expect(diaSeguinte('2028-02-28')).toBe('2028-02-29');
  });
  it('o período limita a consulta (como o ano)', () => {
    const nada = { anos: [], meses: [], safra: '__all__', fornecedor: '__all__', produto: '', contaOrigem: '__all__', contaDestino: '__all__', centro: '__all__', subcentro: '__all__' };
    expect(temFiltroLimitante(nada)).toBe(false);
    expect(temFiltroLimitante({ ...nada, periodo: { de: '2026-10-01', ate: '2026-10-31' } })).toBe(true);
  });
});

describe('o ano × mês de hoje no gatilho do Período', () => {
  it('um ano, um mês, meses seguidos de um ano = intervalo; o resto = texto', () => {
    expect(periodoDosAnosEMeses(['2026'], [])).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
    expect(periodoDosAnosEMeses(['2026'], ['10'])).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodoDosAnosEMeses(['2026'], ['10', '08', '09'])).toEqual({ de: '2026-08-01', ate: '2026-10-31' });
    expect(periodoDosAnosEMeses(['2026'], ['08', '10'])).toBeNull();
    expect(periodoDosAnosEMeses(['2025', '2026'], [])).toBeNull();
    expect(periodoDosAnosEMeses([], ['10'])).toBeNull();
    expect(textoDosAnosEMeses(['2026', '2025'], ['10', '08'])).toBe('2025, 2026 · ago, out');
    expect(textoDosAnosEMeses([], [])).toBe('Todos os anos');
  });
});

describe('o cabeçalho da caixa: N ativos e os chips (até 3 e "+N")', () => {
  it('só os ativos; os 3 primeiros viram chip, o resto "+N"', () => {
    const f = ['a', 'b', 'c', 'd', 'e'].map((campo, i) => ({ campo, rotulo: campo, texto: campo, ativo: i !== 1 }));
    const r = chipsDosFiltros(f);
    expect(r.ativos).toBe(4);
    expect(r.chips.map((c) => c.campo)).toEqual(['a', 'c', 'd']);
    expect(r.mais).toBe(1);
    expect(textoDosAtivos(1)).toBe('1 ativo');
    expect(textoDosAtivos(0)).toBe('0 ativos');
  });
});

describe('o resumo: Caixa × A pagar, números do banco', () => {
  it('Saídas negativas, Resultado = Entradas − Saídas; sem resposta = nulo', () => {
    expect(caixaDoResumo({ entradas: 100, saidas: 250.5, transferencias: 40 })).toEqual({ entradas: 100, saidas: -250.5, transferencias: 40, resultado: -150.5 });
    expect(caixaDoResumo(null)).toBeNull();
    expect(aPagarDoResumo({ prontos: 3, prontosValor: 10, faltando: 1, faltandoValor: 3163 })).toMatchObject({ prontos: 3, total: 4, faltando: 1, fracaoPronta: 0.75 });
    expect(moedaComSinal(-15684.46)).toMatch(/^−R\$\s15\.684,46$/);
  });
  it('desenha os 7 cards; sem a resposta, "—"; sem BPO, "sem BPO"', () => {
    const { rerender } = render(<ResumoDaListaV2 totais={{ entradas: 0, saidas: 15684.46, transferencias: 0 }}
      pronto={{ prontos: 0, prontosValor: 0, faltando: 1, faltandoValor: 3163 }} bpoAtivo={false} peloExtrato={null} />);
    expect(screen.getByTestId('resumo-saidas-valor').textContent).toMatch(/^−R\$\s15\.684,46$/);
    expect(screen.getByTestId('resumo-saidas-valor').className).toContain('text-[#c03030]');
    expect(screen.getByTestId('resumo-resultado-valor').textContent).toMatch(/^−R\$/);
    expect(screen.getByTestId('resumo-prontos-valor').textContent).toBe('0 de 1');
    expect(screen.getByTestId('resumo-faltando').textContent).toContain('Faltando · 1 lanç.');
    expect(screen.getByTestId('resumo-aprovacao').textContent).toBe('Aprovação—sem BPO');
    rerender(<ResumoDaListaV2 totais={null} pronto={null} bpoAtivo peloExtrato={null} />);
    expect(screen.getByTestId('resumo-entradas-valor').textContent).toBe('—');
    expect(screen.getByTestId('resumo-prontos-valor').textContent).toBe('—');
    expect(screen.getByTestId('resumo-aprovacao').textContent).toBe('Aprovação—');
  });
  it('as colunas são de largura FIXA (frações da grade), nunca do conteúdo', () => {
    render(<ResumoDaListaV2 totais={null} pronto={null} bpoAtivo peloExtrato={null} />);
    expect(screen.getByTestId('resumo-caixa').style.gridTemplateColumns).toBe('18px repeat(4, minmax(0, 1fr))');
    expect(screen.getByTestId('resumo-a-pagar').style.gridTemplateColumns).toBe('18px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.75fr)');
  });
});

describe('a tela: a ligação (lida da fonte)', () => {
  it('a grade de 6 colunas na ordem de hoje', () => {
    const grade = tela.slice(tela.indexOf('data-testid="grade-dos-filtros"'));
    const rotulos = [...grade.matchAll(/<label className=\{LBL\}>([^<]+)<\/label>/g)].map((m) => m[1]).slice(0, 17);
    expect(rotulos).toEqual(['Período', 'Data por', 'Tipo', 'Status', 'Fazenda', 'Atividade', 'Safra', 'Cultura', 'Conta origem', 'Conta destino',
      'Documento', 'Macro', 'Grupo', 'Centro', 'Subcentro', 'Produto', 'Fornecedor']);
    expect(tela).toContain('<div className="mt-1 grid grid-cols-6 items-start gap-x-2 gap-y-1" data-testid="grade-dos-filtros">');
    expect(tela).toContain('<div className="col-span-2 min-w-0" data-testid="filtro-periodo">');
  });
  it('o Período é o SeletorDePeriodo compacto do DRE, com os atalhos da tela', () => {
    expect(tela).toMatch(/<SeletorDePeriodo testid="lanc-periodo" compacto valor=\{valorDoPeriodo\} onChange=\{setPeriodo\}/);
    expect(tela).toContain("const ATALHOS_FORA_DA_LISTA: readonly string[] = ['ultimo-ano', 'ultima-safra-pecuaria', 'ultima-safra-agricultura'];");
  });
  it('mexer em ano/mês (mobile, drill, memória, Limpar) limpa o período; o período vai à lista, ao plano e à memória', () => {
    expect(tela).toContain('const setAnosSelecionados = useCallback((v: string[] | ((prev: string[]) => string[])) => { setPeriodo(null); setAnosCru(v); }, []);');
    expect(tela).toContain('const setMesesSelecionados = useCallback((v: string[] | ((prev: string[]) => string[])) => { setPeriodo(null); setMesesCru(v); }, []);');
    expect(tela).toMatch(/fazendaId, anos: anosSelecionados, meses: mesesSelecionados, periodo, dimensao: dataPor/);
    expect(tela).toContain('periodo: periodo ? { de: periodo.de, ate: periodo.ate } : undefined,');
    expect(tela).toContain('periodo: periodo ? [periodo.de, periodo.ate] : [],');
  });
  it('o topo do desktop: só "Lançamentos" e o "+ Novo"; o resumo no lugar da faixa (a faixa fica só no mobile)', () => {
    expect(tela).toContain(': <CabecalhoDaTela className="-mx-2.5" titulo="Lançamentos" acoes={menuNovo()} />');
    expect(tela).toContain("{mode === 'list' && !isMobile && (\n        <ResumoDaListaV2");
    expect(tela).toContain("{mode === 'list' && isMobile && (");
  });
  it('a tabela: cantos de 10px e zebra pelo índice da lista virtual', () => {
    expect(tela).toContain('isMobile ? "border-[hsl(var(--border))]" : "rounded-[10px] border-[#c5cdd9]"');
    expect(tela).toContain('zebra={(inicio + k) % 2 === 1}');
  });
});
