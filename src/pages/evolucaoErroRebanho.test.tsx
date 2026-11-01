/**
 * REBANHO-LEITURA-01 D4 (Gabriel 01/11/2026) — a Evolução no Ano e o mês por categoria dizem quando a leitura do rebanho falhou:
 * "Não consegui ler o rebanho." + "Tentar de novo", na faixa do cabeçalho da tabela (no lugar do subtítulo). Sem erro, o subtítulo de sempre.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const estado = vi.hoisted(() => ({ erro: null as string | null, tentar: vi.fn() }));

vi.mock('@/hooks/useAnosDisponiveis', () => ({ useAnosDisponiveis: () => ({ data: ['2026'] }) }));
vi.mock('@/hooks/useEvolucaoDoAno', () => ({
  useEvolucaoDoAno: () => ({ mesesReal: [], mesesMeta: [], isGlobal: false, metaRascunho: false, carregando: false,
    erroRebanho: estado.erro, tentarDeNovo: estado.tentar }),
}));
vi.mock('@/hooks/useEvolucaoDoMes', () => ({
  useEvolucaoDoMes: () => ({ rowsDoMes: [], rowsDoMesAnterior: [], categorias: [], fechado: true, ultimoFechado: 9, isGlobal: false,
    lancamentos: [], erroLancamentos: null, carregando: false, erroRebanho: estado.erro, tentarDeNovo: estado.tentar }),
}));

import { EvolucaoDoAnoTab } from './EvolucaoDoAnoTab';
import { EvolucaoMesTab } from './EvolucaoMesTab';
import { ERRO_LEITURA_REBANHO } from '@/hooks/useRebanhoOficial';

beforeEach(() => { estado.erro = null; estado.tentar = vi.fn(); });

describe.each([
  ['Evolução no Ano', () => render(<EvolucaoDoAnoTab />), /clique no mês para ver por categoria/],
  ['o mês por categoria', () => render(<EvolucaoMesTab anoInicial={2026} mesInicial={9} />), /as 9 categorias/],
])('%s', (_nome, montar, subtitulo) => {
  it('com a falha: a frase e o "Tentar de novo" (que relê), no lugar do subtítulo', () => {
    estado.erro = ERRO_LEITURA_REBANHO;
    montar();
    const aviso = screen.getByRole('alert');
    expect(aviso.textContent).toContain('Não consegui ler o rebanho.');
    expect(screen.queryByText(subtitulo)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(estado.tentar).toHaveBeenCalledTimes(1);
  });
  it('sem falha: nenhum aviso, o subtítulo de sempre', () => {
    montar();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(subtitulo)).toBeTruthy();
  });
});
