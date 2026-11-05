import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';

/* CHUVAS-LANCAR-01 + PEC-ABAS-01 (Gabriel 04/11/2026, passada tela a tela) — a planilha de Chuvas (lançar) e a volta das abas. */
vi.mock('@/hooks/useChuvas', () => ({
  useChuvas: () => ({
    loading: false, salvarChuva: vi.fn(),
    chuvas: [
      { id: 'a', fazendaId: 'f', data: '2026-01-01', milimetros: 93, observacao: null },
      { id: 'b', fazendaId: 'f', data: '2026-01-04', milimetros: 20.5, observacao: null },
      { id: 'c', fazendaId: 'f', data: '2026-03-10', milimetros: 1000.25, observacao: null },
      { id: 'd', fazendaId: 'f', data: '2025-01-02', milimetros: 10, observacao: null },
    ],
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'x@exemplo.com' }, loading: false, signOut: vi.fn() }) }));
vi.mock('@/v2/hooks/useProfileAtual', () => ({ useProfileAtual: () => ({ nome: 'X', email: 'x@exemplo.com' }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ isGlobal: false, fazendas: [{ id: 'f', nome: 'Faz. X' }] }) }));
const { ChuvasTab } = await import('./ChuvasTab');
const { BarraSecao } = await import('@/v2/components/BarraSecao');
const { semFiltrosDeOutraTela } = await import('@/v2/lib/semFiltrosDeOutraTela');
const ler = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8');

describe('Chuvas › lançar (a planilha de uma fazenda)', () => {
  it('a faixa baixa: o ano, "Total 1.113,8 mm" com vírgula e o Lançar; nada de "Total:" com ponto decimal', () => {
    render(<ChuvasTab mode="operacional" />);
    expect(screen.getByTestId('chuvas-total').textContent).toBe('Total 1.113,8 mm');
    expect(screen.getByTestId('chuvas-barra').className).toContain('h-[34px]');
    expect(screen.getByRole('button', { name: /Lançar/ })).toBeTruthy();
  });

  it('UMA coluna Dia e uma coluna por mês (13 cabeçalhos); a linha Total presa no topo, no cabeçalho', () => {
    render(<ChuvasTab mode="operacional" />);
    const tabela = screen.getByTestId('chuvas-tabela');
    const cab = [...tabela.querySelectorAll('thead tr:first-child th')].map((t) => t.textContent);
    expect(cab).toEqual(['Dia', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
    const total = screen.getByTestId('chuvas-linha-total');
    expect(total.closest('thead')).toBeTruthy();
    expect(total.querySelector('th')?.className).toContain('sticky');
    expect([...total.querySelectorAll('th')].slice(1, 4).map((t) => t.textContent)).toEqual(['113,5', '', '1.000,3']);
    /* 31 linhas de dia, cada uma com 13 células (Dia + 12 meses) */
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(31);
    expect(tabela.querySelectorAll('tbody tr:first-child td')).toHaveLength(13);
  });

  it('número com vírgula, à direita; dia sem chuva VAZIO (nunca "-")', () => {
    render(<ChuvasTab mode="operacional" />);
    const jan1 = screen.getByTestId('chuvas-01-01');
    expect(jan1.textContent).toBe('93,0');
    expect(jan1.className).toContain('text-right');
    expect(screen.getByTestId('chuvas-01-02').textContent).toBe('');
    expect(within(screen.getByTestId('chuvas-tabela')).queryAllByText('-')).toHaveLength(0);
  });

  it('o quadro vai até a base da tela (useAlturaAteOFim) e o hook vem antes da saída do "Carregando" (nunca condicional)', () => {
    const tela = ler('pages/ChuvasTab.tsx');
    expect(tela).toContain("const quadro = useAlturaAteOFim({ ativo: mode === 'operacional' && (!isGlobal || !!fazendaEscolhida) });");
    expect(tela.indexOf('const quadro = useAlturaAteOFim(')).toBeLessThan(tela.indexOf('if (loading) return'));
    expect(tela).toContain('<div ref={quadro.ref} style={{ height: quadro.altura }}');
  });
});

describe('a volta (regra origem e volta) e as abas da Pecuária', () => {
  it('a barra do topo reserva o lugar do "‹ Voltar" (invisível) quando não há volta, e mostra a volta quando há', () => {
    const { rerender } = render(<BarraSecao area="Produção" secao="Chuvas" reservarVoltar />);
    expect(screen.getByTestId('barra-voltar-reservado').className).toContain('invisible');
    expect(screen.queryByTestId('barra-voltar')).toBeNull();
    rerender(<BarraSecao area="Produção" secao="Chuvas" reservarVoltar voltar={{ rotulo: 'Voltar', onVoltar: vi.fn() }} />);
    expect(screen.getByTestId('barra-voltar').textContent).toBe('‹ Voltar');
    expect(screen.queryByTestId('barra-voltar-reservado')).toBeNull();
  });

  it('com as abas na barra, a seção (que repete a aba marcada) sai abaixo de 1.100px; sem abas, fica sempre (gate 05/11, 1000×600)', () => {
    const { rerender } = render(<BarraSecao area="Produção" secao="Lançar movimentação" atalho={<span>abas</span>} />);
    expect(screen.getByTestId('barra-secao-nome').className).toContain('hidden min-[1100px]:inline');
    rerender(<BarraSecao area="Produção" secao="Chuvas" />);
    expect(screen.getByTestId('barra-secao-nome').className).not.toContain('hidden');
  });

  it('o shell: a aba e o card "Chuvas" gravam a origem; o menu a apaga; a barra volta para ela nas telas com volta', () => {
    const shell = ler('v2/V2Index.tsx');
    expect(shell).toContain('if (s !== section) setVoltarPara(section);');
    expect(shell).toMatch(/function abrirChuvasComVolta\(\) \{\s*setVoltarPara\(section\);\s*setSection\('chuvas-lancamento'\);/);
    expect(shell).toContain("onNavegarChuvas={podeAbrirTela('chuvas-lancamento') ? abrirChuvasComVolta : undefined}");
    expect((shell.match(/setVoltarPara\(null\);/g) ?? []).length).toBeGreaterThanOrEqual(3); // menu, seleção e a própria volta
    expect(shell).toContain("? { rotulo: 'Voltar', onVoltar: () => { const o = voltarPara; setVoltarPara(null); limparOCAoSairDoLancar(o); setSection(o); } }");
    expect(shell).toContain('reservarVoltar={TELAS_COM_VOLTA.includes(section) && !modoResumo}');
  });

  it('entrar nas telas de Chuvas tira os `f_*` de outra tela da URL (o ?f_tipo=abate não viaja); o resto da barra fica', () => {
    expect(semFiltrosDeOutraTela('?f_tipo=abate&f_de=2026-01&oc_id=9')?.toString()).toBe('oc_id=9');
    expect(semFiltrosDeOutraTela('?oc_id=9')).toBeNull();
    expect(semFiltrosDeOutraTela('')).toBeNull();
    const shell = ler('v2/V2Index.tsx');
    expect(shell).toMatch(/if \(section !== 'chuvas' && section !== 'chuvas-lancamento'\) return;\s*const p = semFiltrosDeOutraTela\(window\.location\.search\);\s*if \(p\) setSearchParams\(p, \{ replace: true \}\);/);
  });
});
