/** UI-MESES-PADRAO-01 (D1) — o cabeçalho navy da casa: título, subtítulo, meses e abas; a aba aberta encaixa no corpo. Dados sintéticos. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CabecalhoDaTela } from './cabecalho-da-tela';

describe('CabecalhoDaTela', () => {
  it('a faixa é navy, com o título e o subtítulo', () => {
    render(<CabecalhoDaTela titulo="DRE" subtitulo="Cliente · jan → out/2026" />);
    const faixa = screen.getByTestId('cabecalho-da-tela');
    expect(faixa.className).toContain('bg-navy');
    expect(screen.getByRole('heading', { name: 'DRE' })).toBeTruthy();
    expect(screen.getByText('Cliente · jan → out/2026')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();          // sem abas, sem a linha delas (a busca sabe achar: ver abaixo)
  });
  it('a aba aberta tem a cor do corpo (encaixa); as outras não; o clique avisa; todas no mesmo peso', () => {
    const onAba = vi.fn();
    render(<CabecalhoDaTela titulo="Conciliação" aba="b" onAba={onAba}
      abas={[{ chave: 'a', rotulo: 'Importar' }, { chave: 'b', rotulo: 'Conciliação' }]} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    const [a, b] = screen.getAllByRole('tab');
    expect(b.className).toContain('bg-corpo');
    expect(a.className).not.toContain('bg-corpo');
    expect(a.className).toContain('font-medium');
    expect(b.className).toContain('font-medium');
    fireEvent.click(a);
    expect(onAba).toHaveBeenCalledWith('a');
  });
});
