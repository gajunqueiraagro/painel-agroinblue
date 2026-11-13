/**
 * CHUVAS-ANALISE-01 F1 — a tela da análise com leituras SINTÉTICAS: A (lança desde 2024, histórico de 2 anos) e B (começou em
 * 2026: sem histórico). Hoje = 15/03/2026.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChuvasAnalise, escalaDoDia, faixaEntreAtualEMedia } from '@/components/chuvas/ChuvasAnalise';
import type { Chuva } from '@/hooks/useChuvas';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const c = (id: string, fazendaId: string, data: string, milimetros: number): Chuva => ({ id, fazendaId, data, milimetros });
const CHUVAS: Chuva[] = [
  c('a1', 'A', '2024-01-10', 100), c('a2', 'A', '2024-02-10', 100),
  c('a3', 'A', '2025-01-10', 100), c('a4', 'A', '2025-02-10', 100),
  c('a5', 'A', '2026-01-05', 60), c('a6', 'A', '2026-02-20', 20), c('a7', 'A', '2026-03-01', 0), c('a8', 'A', '2026-03-10', 30),
  c('b1', 'B', '2026-03-09', 40),
];
const FAZ = [{ id: 'A', nome: 'Fazenda Alfa', codigo: 'ALF' }, { id: 'B', nome: 'Fazenda Beta', codigo: 'BET' }, { id: 'X', nome: 'Administrativo', codigo: 'ADM' }];

const abrir = (o: { isGlobal: boolean; escolhida?: string | null; atual?: string | null; hoje?: string } = { isGlobal: true }) => {
  const salvar = vi.fn(async () => {}); const remover = vi.fn(async () => {}); const escolher = vi.fn();
  render(<ChuvasAnalise chuvas={CHUVAS} fazendas={FAZ} isGlobal={o.isGlobal} fazendaAtualId={o.atual ?? null} fazendaEscolhida={o.escolhida ?? null}
    onEscolherFazenda={escolher} salvarChuva={salvar} removerChuva={remover} hoje={o.hoje ?? '2026-03-15'} />);
  return { salvar, remover, escolher };
};

describe('todas as fazendas (Global)', () => {
  it('só as fazendas com lançamento, pelo código; a sem histórico diz "sem histórico", nunca 0', () => {
    const { escolher } = abrir();
    const t = screen.getByTestId('chuvas-comparativo');
    const linhas = [...t.querySelectorAll('tr[data-fazenda]')].map(r => r.getAttribute('data-fazenda'));
    expect(linhas).toEqual(['ALF', 'BET']);
    const alf = t.querySelector('tr[data-fazenda="ALF"]');
    /* jan–mar/26: 60 + 20 + 0 + 30 = 110; média de 2024 e 2025 até 15/03 = 200 → 55% → Abaixo */
    expect(alf?.textContent).toContain('110,0');
    expect(alf?.textContent).toContain('200,0');
    expect(alf?.textContent).toContain('55%');
    expect(alf?.textContent).toContain('Abaixo da média');
    expect(t.querySelector('tr[data-fazenda="BET"]')?.textContent).toContain('sem histórico');
    /* Chat 15:15: Δ% contra o ano anterior (110 × 200 → −45%), maior chuva (data no title) e maior intervalo entre chuvas lançadas */
    expect(alf?.querySelector('[data-col="dpct"]')?.textContent).toBe('−45%');
    expect(alf?.querySelector('[data-col="maior"]')?.getAttribute('title')).toBe('05/01/2026');
    expect(alf?.querySelector('[data-col="intervalo"]')?.textContent).toBe('45 dias');
    expect(t.querySelector('tr[data-fazenda="BET"] [data-col="dpct"]')?.textContent).toBe('—');
    expect(screen.getByTestId('chuvas-todas-cards').querySelector('[data-card="sem-historico"]')?.textContent).toContain('BET');
    fireEvent.click(within(alf as HTMLElement).getByText('ALF'));
    expect(escolher).toHaveBeenCalledWith('A');
  });

  it('mapa de calor: mês depois do último lançamento é "–" (não lançado), nunca 0', () => {
    abrir();
    const bet = screen.getByTestId('chuvas-mapa-calor').querySelectorAll('tbody tr')[1];
    const cel = [...bet.querySelectorAll('td')].map(td => td.textContent);
    expect(cel[0]).toBe('BET');
    expect(cel[3]).toBe('40');
    expect(cel[4]).toBe('–');
  });
});

describe('uma fazenda', () => {
  it('cards, "entre chuvas lançadas" na leitura e o histórico de 2 anos', () => {
    abrir({ isGlobal: false, atual: 'A' });
    const cards = screen.getByTestId('chuvas-uma-cards');
    expect(cards.querySelector('[data-card="acumulado"]')?.textContent).toContain('110,0');
    expect(cards.querySelector('[data-card="sem-chuva"]')?.textContent).toContain('5');
    expect(cards.querySelector('[data-card="sem-chuva"]')?.textContent).toContain('10/03/2026');
    expect(screen.getByTestId('chuvas-por-mes').textContent).toContain('média histórica (2 anos)');
    expect(screen.getByTestId('chuvas-leitura').textContent).toContain('entre chuvas lançadas');
  });

  it('dia a dia: só a chuva desenha; 0 mm e sem lançamento ficam vazios (D-A); o clique abre o lançamento do dia', () => {
    const { remover } = abrir({ isGlobal: false, atual: 'A' });
    const dias = screen.getByTestId('chuvas-dias');
    expect(dias.querySelector('[data-dia="2026-03-10"] i[style]')).not.toBeNull();
    expect(dias.querySelector('[data-dia="2026-03-01"] i[style]')).toBeNull();
    expect(dias.querySelector('[data-dia="2026-03-02"] i[style]')).toBeNull();
    /* 21/02 a 09/03 = 17 dias entre chuvas lançadas (o 0 mm de 01/03 não é chuva) → veranico */
    expect(dias.querySelector('[data-dia="2026-03-01"]')?.getAttribute('title')).toContain('veranico (entre chuvas lançadas)');
    fireEvent.click(dias.querySelector('[data-dia="2026-03-10"]') ?? document.body);
    const m = screen.getByTestId('chuvas-editar-dia');
    expect(m.textContent).toContain('10/03/2026');
    fireEvent.click(within(m).getByText('Cancelar lançamento'));
    expect(remover).toHaveBeenCalledWith('a8');
  });

  it('fazenda que começou no ano: "sem histórico (1º ano lançado)"', () => {
    abrir({ isGlobal: true, escolhida: 'B' });
    expect(screen.getByTestId('chuvas-por-mes').textContent).toContain('sem histórico (1º ano lançado)');
    expect(screen.getByTestId('chuvas-uma-cards').querySelector('[data-card="diferenca"]')?.textContent).toContain('sem histórico');
  });

  it('P1: troca para o ano-safra (jul–jun)', () => {
    abrir({ isGlobal: false, atual: 'A' });
    fireEvent.click(screen.getByText('Ano-safra jul–jun'));
    expect(screen.getByTestId('chuvas-analise-titulo').textContent).toContain('safra 25/26');
  });
});

describe('gráficos (Chat 12/11 17:30)', () => {
  it('acumulado: faixa azul acima e vermelha abaixo da média, com o ponto do cruzamento', () => {
    const p = faixaEntreAtualEMedia([100, 100, null], [80, 120, 150], [0, 0, 0]);
    expect(p.map(x => x.x)).toEqual([0, 0.5, 1, 2]);
    expect(p[0]).toMatchObject({ acima: [80, 100], abaixo: null });
    expect(p[1]).toMatchObject({ acima: [100, 100], abaixo: [100, 100] });
    expect(p[2]).toMatchObject({ acima: null, abaixo: [100, 120] });
    expect(p[3]).toMatchObject({ acima: null, abaixo: null });
  });
  it('dia a dia: escala com marcas e o mm em cima da chuva de 30 mm ou mais', () => {
    expect(escalaDoDia(58)).toEqual({ topo: 60, marcas: [0, 20, 40, 60] });
    expect(escalaDoDia(0).topo).toBe(20);
    abrir({ isGlobal: false, atual: 'A' });
    const dias = screen.getByTestId('chuvas-dias');
    expect(dias.querySelector('[data-dia="2026-03-10"]')?.textContent).toBe('30');
    expect(screen.getByTestId('chuvas-dia-a-dia').textContent).toContain('15');
  });
  it('mês sem lançamento: "sem lançamento em abr" por extenso, nunca "—"', () => {
    abrir({ isGlobal: false, atual: 'A', hoje: '2026-04-20' });
    const mes = screen.getByTestId('chuvas-uma-cards').querySelector('[data-card="mes"]');
    expect(mes?.textContent).toContain('sem lançamento em abr');
    expect(mes?.textContent).not.toContain('—mm');
  });
});
