/**
 * DatePicker dentro de GRADE — 136c item 0c.
 *
 * ⚠ ESTES TRES CASOS SAO O CONTRATO QUE O `ModoRapidoGrid` DEPENDE. A grade navega entre
 * celulas por setas; o campo abre o calendario com ArrowDown desde o 136a. Sem a ordem
 * (consumidor primeiro) e sem o `abrirComSeta={false}`, a tecla que devia mover o foco
 * abriria um calendario — e o operador perderia a navegacao por teclado da grade inteira.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from './date-picker';

const campo = () => screen.getByPlaceholderText('dd/mm/aaaa');

describe('DatePicker — teclado do consumidor', () => {
  it('o onKeyDown do consumidor recebe o evento', () => {
    const espiao = vi.fn();
    render(<DatePicker value="2026-08-20" onChange={() => {}} onKeyDown={espiao} />);
    fireEvent.keyDown(campo(), { key: 'ArrowRight' });
    expect(espiao).toHaveBeenCalledTimes(1);
    expect(espiao.mock.calls[0][0].key).toBe('ArrowRight');
  });

  it('preventDefault do consumidor impede o handler interno (Enter não commita)', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-20"
        onChange={onChange}
        onKeyDown={(e) => e.preventDefault()}
      />,
    );
    fireEvent.change(campo(), { target: { value: '21/08/2026' } });
    fireEvent.keyDown(campo(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DatePicker — abrirComSeta', () => {
  it('por padrão ArrowDown abre o calendário', () => {
    render(<DatePicker value="2026-08-20" onChange={() => {}} />);
    fireEvent.keyDown(campo(), { key: 'ArrowDown' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('com abrirComSeta={false} ArrowDown NÃO abre', () => {
    render(<DatePicker value="2026-08-20" onChange={() => {}} abrirComSeta={false} />);
    fireEvent.keyDown(campo(), { key: 'ArrowDown' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mesmo com abrirComSeta={false}, o ícone continua abrindo', () => {
    render(<DatePicker value="2026-08-20" onChange={() => {}} abrirComSeta={false} />);
    fireEvent.click(screen.getByLabelText('Abrir calendário'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('DatePicker — data-* atravessam até o input', () => {
  it('data-row e data-col chegam ao elemento que recebe o foco', () => {
    render(<DatePicker value="2026-08-20" onChange={() => {}} data-row={3} data-col={1} />);
    expect(campo()).toHaveAttribute('data-row', '3');
    expect(campo()).toHaveAttribute('data-col', '1');
  });
});
