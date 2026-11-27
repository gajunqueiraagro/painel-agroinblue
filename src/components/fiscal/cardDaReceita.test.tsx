/** NOTAS-RECEITA-CARD-SEMPRE-01 — o card nunca some: em cada estado, a frase e a ação do mock aprovado. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CardDaReceita } from './CardDaReceita';

describe('CardDaReceita', () => {
  it('(a) sem certificado: link só para quem pode cadastrar', () => {
    const cad = vi.fn();
    const { rerender } = render(<CardDaReceita estado={{ tipo: 'sem_certificado' }} podeCadastrar onCadastrar={cad} />);
    expect(screen.getByTestId('card-da-receita-frase').textContent).toBe('Notas da Receita · sem certificado digital');
    fireEvent.click(screen.getByTestId('card-da-receita-cadastrar'));
    expect(cad).toHaveBeenCalled();
    rerender(<CardDaReceita estado={{ tipo: 'sem_certificado' }} podeCadastrar={false} onCadastrar={cad} />);
    expect(screen.queryByTestId('card-da-receita-cadastrar')).toBeNull();
    expect(screen.getByTestId('card-da-receita')).toBeTruthy();
  });
  it('(b′) e (c): frase e Abrir', () => {
    const abrir = vi.fn();
    const { rerender } = render(<CardDaReceita estado={{ tipo: 'sem_busca' }} podeCadastrar onAbrir={abrir} />);
    expect(screen.getByTestId('card-da-receita-frase').textContent).toContain('primeira busca ainda não rodou');
    expect(screen.queryByTestId('card-da-receita-abrir')).toBeNull();
    rerender(<CardDaReceita estado={{ tipo: 'com_notas', notas: 3, ultimaBusca: '2026-11-27T11:00:00Z' }} podeCadastrar onAbrir={abrir} />);
    fireEvent.click(screen.getByTestId('card-da-receita-abrir'));
    expect(abrir).toHaveBeenCalled();
  });
  it('(d) busca parada: ver motivo abre o minimodal com o motivo', () => {
    render(<CardDaReceita estado={{ tipo: 'parada', motivo: 'cadeia', desde: '2026-11-27T10:35:00Z', voltaEm: null, validoAte: null }} podeCadastrar onCadastrar={() => {}} />);
    expect(screen.getByTestId('card-da-receita').getAttribute('data-estado')).toBe('parada');
    fireEvent.click(screen.getByTestId('card-da-receita-motivo'));
    expect(screen.getByTestId('card-da-receita-motivo-texto').textContent).toContain('cadeia');
  });
  it('BLOQUEIO-01: pausada (656) mostra "busca pausada até", em âmbar, e a lista segue abrível; a parada de verdade também abre', () => {
    const abrir = vi.fn();
    const { rerender } = render(<CardDaReceita estado={{ tipo: 'parada', motivo: 'bloqueio', desde: '2026-11-27T16:45:00Z', voltaEm: '2026-11-27T17:45:00Z', validoAte: null, notas: 12 }}
      podeCadastrar onAbrir={abrir} />);
    expect(screen.getByTestId('card-da-receita-frase').textContent).toMatch(/^12 da Receita a lançar · busca pausada até \d\d:\d\d$/);
    fireEvent.click(screen.getByTestId('card-da-receita-abrir'));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('card-da-receita-motivo')).toBeTruthy();
    rerender(<CardDaReceita estado={{ tipo: 'parada', motivo: 'cadeia', desde: '2026-11-27T10:35:00Z', voltaEm: null, validoAte: null, notas: 3 }} podeCadastrar onAbrir={abrir} />);
    expect(screen.getByTestId('card-da-receita-frase').textContent).toBe('Busca parada · 3 da Receita a lançar');
    fireEvent.click(screen.getByTestId('card-da-receita-abrir'));
    expect(abrir).toHaveBeenCalledTimes(2);
  });
});
