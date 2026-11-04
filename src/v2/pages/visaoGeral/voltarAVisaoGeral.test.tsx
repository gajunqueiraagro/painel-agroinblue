import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('@/v2/hooks/useProfileAtual', () => ({ useProfileAtual: () => ({ nome: 'Pessoa' }) }));
const { BarraSecao } = await import('@/v2/components/BarraSecao');

/* VISAO-GERAL-02 (Gabriel 03/11/2026) — todo atalho da Visão Geral tem caminho de volta: "‹ Voltar à Visão Geral" na barra do topo. */
describe('a volta à Visão Geral', () => {
  it('a barra mostra a volta quando o V2Index a pede, e o clique volta', () => {
    const voltar = vi.fn();
    render(<BarraSecao area="Financeiro" secao="Fluxo de caixa" voltar={{ rotulo: 'Voltar à Visão Geral', onVoltar: voltar }} />);
    fireEvent.click(screen.getByRole('button', { name: '‹ Voltar à Visão Geral' }));
    expect(voltar).toHaveBeenCalled();
  });
  it('sem pedido, a barra fica como sempre', () => {
    render(<BarraSecao area="Financeiro" secao="Fluxo de caixa" />);
    expect(screen.queryByTestId('barra-voltar')).toBeNull();
  });
  it('a regra de origem no V2Index: sair DA Visão Geral liga a volta; o menu e a própria volta a desligam', () => {
    const f = readFileSync(path.resolve(__dirname, '../../V2Index.tsx'), 'utf8');
    expect(f).toContain("if (section === 'home') setVoltarAVisaoGeral(true);");
    expect(f.match(/setVoltarAVisaoGeral\(false\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(f).toMatch(/voltar=\{voltarAVisaoGeral && section !== 'home'/);
    for (const fn of ['function navegarPeloMenu(s: V2Section) {', 'function handleSelect(s: V2Section) {']) {
      const i = f.indexOf(fn);
      expect(f.slice(i, i + 200)).toContain('setVoltarAVisaoGeral(false);');
    }
  });
});
