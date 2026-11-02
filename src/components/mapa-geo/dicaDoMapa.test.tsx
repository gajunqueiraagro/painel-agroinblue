/* MAPA-DICAS-01 — a dica rica: nome em negrito + frase + atalho; abre ao focar; o toque LONGO (500 ms) abre e o curto não; e a dica
   no mesmo botão do popover (Classificar) não tira o popover. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DicaDoMapa } from './DicaDoMapa';

afterEach(() => { vi.useRealTimers(); });

describe('DicaDoMapa', () => {
  it('mostra o nome em negrito, a frase e o atalho ao focar (teclado)', async () => {
    render(<DicaDoMapa nome="Desfazer" frase="Desfaz o último passo." atalho="Ctrl/Cmd+Z"><button type="button">x</button></DicaDoMapa>);
    act(() => { screen.getByRole('button', { name: 'x' }).focus(); });
    const dica = await screen.findByTestId('dica-do-mapa');
    expect(dica.getAttribute('data-cromo')).toBe('dica');
    /* o Radix repete o texto num <span role=tooltip> invisível (a11y): o visível é o de dentro da dica */
    const nome = within(dica).getAllByTestId('dica-do-mapa-nome')[0];
    expect(nome.textContent).toBe('Desfazer');
    expect(nome.className).toContain('font-bold');
    expect(within(dica).getAllByTestId('dica-do-mapa-frase')[0].textContent).toBe('Desfaz o último passo.');
    expect(within(dica).getAllByTestId('dica-do-mapa-atalho')[0].textContent).toContain('Ctrl/Cmd+Z');
  });

  it('sem atalho, não escreve a linha do atalho', async () => {
    render(<DicaDoMapa nome="Apagar" frase="Tira o desenho."><button type="button">x</button></DicaDoMapa>);
    act(() => { screen.getByRole('button', { name: 'x' }).focus(); });
    await screen.findByTestId('dica-do-mapa');
    expect(screen.queryByTestId('dica-do-mapa-atalho')).toBeNull();
  });

  it('toque longo (500 ms) abre; toque curto não abre', () => {
    vi.useFakeTimers();
    render(<DicaDoMapa nome="Unir" frase="Juntar."><button type="button">x</button></DicaDoMapa>);
    const b = screen.getByRole('button', { name: 'x' });
    fireEvent.touchStart(b); act(() => { vi.advanceTimersByTime(200); }); fireEvent.touchEnd(b); act(() => { vi.advanceTimersByTime(800); });
    expect(screen.queryByTestId('dica-do-mapa')).toBeNull();
    fireEvent.touchStart(b); act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByTestId('dica-do-mapa')).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByTestId('dica-do-mapa').textContent).toContain('Juntar.');
  });

  it('mexer o dedo (touchmove) cancela o toque longo', () => {
    vi.useFakeTimers();
    render(<DicaDoMapa nome="Unir" frase="Juntar."><button type="button">x</button></DicaDoMapa>);
    const b = screen.getByRole('button', { name: 'x' });
    fireEvent.touchStart(b); act(() => { vi.advanceTimersByTime(300); }); fireEvent.touchMove(b); act(() => { vi.advanceTimersByTime(800); });
    expect(screen.queryByTestId('dica-do-mapa')).toBeNull();
  });

  it('botão desabilitado: o span focável mostra a dica com o motivo', async () => {
    render(<DicaDoMapa nome="Prévia e gravar" frase="Feche o desenho primeiro." desabilitado><button type="button" disabled>x</button></DicaDoMapa>);
    act(() => { screen.getByTestId('dica-do-mapa-gatilho').focus(); });
    expect(within(await screen.findByTestId('dica-do-mapa')).getAllByTestId('dica-do-mapa-frase')[0].textContent).toBe('Feche o desenho primeiro.');
  });

  it('Classificar: a dica e o popover no MESMO botão — o clique ainda abre o popover', async () => {
    render(
      <Popover>
        <DicaDoMapa nome="Classificar" frase="Dizer o que é.">
          <PopoverTrigger asChild><button type="button" aria-label="Classificar">c</button></PopoverTrigger>
        </DicaDoMapa>
        <PopoverContent data-testid="popover-dentro">conteúdo</PopoverContent>
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Classificar' }));
    expect(await screen.findByTestId('popover-dentro')).toBeTruthy();
  });
});
