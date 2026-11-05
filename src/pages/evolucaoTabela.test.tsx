/* EVOLUCAO-TABELA-01 (Gabriel 04/11/2026) — a leitura da tabela "Movimentação do rebanho": trimestres, blocos, tamanhos e o Δ da meta pequena. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MesDaEvolucao } from '@/lib/producao/evolucaoAno';

const mes = (m: number, meta = false): MesDaEvolucao => ({
  mes: m, fechado: true, saldoInicio: 1000, saldoFinal: 990, pesoInicioKg: 300_000, pesoFinalKg: 301_000,
  cab: { abate: meta ? 100 : 120, morte: meta ? (m === 1 ? 5 : 0) : 2 }, kg: { abate: 5000 }, kgCarcacaAbate: 2700,
  evolEntrou: 0, evolSaiu: 0, kgEvolEntrou: 0, kgEvolSaiu: 0,
  pesoMedioFinal: 304, gmd: 0.2, producaoBio: 6000, cabInicio: 1000, cabFinal: 990, dias: 30, uaMedia: 669, areaPecuaria: 1000,
});
vi.mock('@/hooks/useEvolucaoDoAno', () => ({
  useEvolucaoDoAno: () => ({ mesesReal: Array.from({ length: 11 }, (_, i) => mes(i + 1)), mesesMeta: Array.from({ length: 12 }, (_, i) => mes(i + 1, true)),
    isGlobal: true, metaRascunho: false, carregando: false }),
}));
vi.mock('@/hooks/useAnosDisponiveis', () => ({ useAnosDisponiveis: () => ({ data: ['2026'] }) }));
const { EvolucaoDoAnoTab } = await import('./EvolucaoDoAnoTab');

const montar = () => render(<QueryClientProvider client={new QueryClient()}><EvolucaoDoAnoTab /></QueryClientProvider>);
const linha = (id: string) => document.querySelector(`tr[data-linha="${id}"]`);
const delta = (id: string) => linha(id)?.lastElementChild?.textContent;

describe('a tabela da Evolução no Ano', () => {
  it('item 1: separador entre os trimestres (Abr, Jul, Out) e um mais forte antes da coluna Ano', () => {
    montar();
    const cab = [...screen.getByTestId('evolucao-tabela').querySelectorAll('thead th')];
    const comBorda = cab.filter((t) => /(^| )border-l( |$)/.test(t.className)).map((t) => t.textContent);
    expect(comBorda).toEqual(['Abr', 'Jul', 'Out']);
    expect(cab.find((t) => t.textContent === 'Ano')?.className).toContain('border-l-2');
    const tds = [...(linha('abate')?.querySelectorAll('td[data-mes]') ?? [])];
    expect(tds.filter((t) => /(^| )border-l( |$)/.test(t.className)).map((t) => t.getAttribute('data-mes'))).toEqual(['4', '7', '10']);
    expect(linha('abate')?.querySelector('td[data-coluna="acum"]')?.className).toContain('border-l-2');
  });
  it('item 2: linha marcada ao abrir cada bloco (Entradas, Saídas, Internas, Saldo final, 1º indicador) e só neles', () => {
    montar();
    const marcadas = [...document.querySelectorAll('tr[data-linha]')].filter((t) => t.className.includes('border-t-2')).map((t) => t.getAttribute('data-linha'));
    const linhas = [...document.querySelectorAll('tr[data-linha]')].map((t) => t.getAttribute('data-linha'));
    const primeiroIndicador = linhas[linhas.indexOf('saldo-final') + 1];
    expect(marcadas).toEqual(['entradas', 'saidas', 'internas', 'saldo-final', primeiroIndicador]);
  });
  it('item 3: indicadores menores (9,5 px); Saldo início e Saldo final em destaque (11 px)', () => {
    montar();
    expect(linha('saldo-inicio')?.className).toContain('[&>td]:text-[11px]');
    expect(linha('saldo-final')?.className).toContain('[&>td]:text-[11px]');
    expect(linha('gmd')?.className).toContain('[&>td]:text-[9.5px]');
    expect(linha('abate')?.className).not.toContain('text-[');
  });
  it('item 4: meta pequena (5 mortes) → "+17 cab"; meta grande (abate 1.200) → o %; a coluna se chama Δ', () => {
    montar();
    expect(delta('morte')).toBe('+17 cab');
    expect(delta('abate')).toBe('+20,0%');
    expect([...document.querySelectorAll('thead th')].at(-1)?.textContent).toBe('Δ');
  });
});
