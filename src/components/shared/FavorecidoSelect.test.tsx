/**
 * OC-HOMOLOG-FIX-02 — o FavorecidoSelect serve o dialogo de despesa da OC (so' `{ id, nome }`) e, la', o campo
 * e' OPCIONAL: `limpavel` poe "— nenhum —" no topo. Sem a prop, nada muda — onde o favorecido e' obrigatorio
 * ele continua sem como esvaziar.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavorecidoSelect } from './FavorecidoSelect';

const FORNECEDORES = [{ id: 'f1', nome: 'Agroinblue - GF' }, { id: 'f2', nome: 'Elo MS Leilões' }];

function Harness({ inicial = '', limpavel, onChange, onSelected }: {
  inicial?: string; limpavel?: boolean; onChange: (id: string) => void; onSelected?: (f: { id: string; nome: string }) => void;
}) {
  const [value, setValue] = useState(inicial);
  const [busca, setBusca] = useState('');
  return (
    <FavorecidoSelect
      value={value} onChange={id => { setValue(id); onChange(id); }} onSelected={onSelected}
      fornecedores={FORNECEDORES} search={busca} onSearchChange={setBusca}
      limpavel={limpavel} placeholder={limpavel ? 'Opcional' : undefined}
    />
  );
}

const abrir = () => fireEvent.click(screen.getByRole('combobox'));

describe('FavorecidoSelect — limpavel', () => {
  it('com `limpavel`, "— nenhum —" esvazia o campo e nao dispara onSelected', () => {
    const onChange = vi.fn();
    const onSelected = vi.fn();
    render(<Harness inicial="f1" limpavel onChange={onChange} onSelected={onSelected} />);
    expect(screen.getByRole('combobox').textContent).toContain('Agroinblue - GF');
    abrir();
    fireEvent.click(screen.getByText('— nenhum —'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(onSelected).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox').textContent).toContain('Opcional');
  });

  it('sem `limpavel`, a opcao nao existe (callers atuais inalterados)', () => {
    render(<Harness inicial="f1" onChange={vi.fn()} />);
    abrir();
    expect(screen.getByText('Elo MS Leilões')).toBeTruthy();
    expect(screen.queryByText('— nenhum —')).toBeNull();
  });

  it('sem valor e sem `placeholder`, o gatilho segue com o texto de sempre', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.getByRole('combobox').textContent).toContain('Selecione fornecedor...');
  });

  it('escolher um fornecedor segue chamando onChange e onSelected com o objeto de quem chama', () => {
    const onChange = vi.fn();
    const onSelected = vi.fn();
    render(<Harness limpavel onChange={onChange} onSelected={onSelected} />);
    abrir();
    fireEvent.click(screen.getByText('Elo MS Leilões'));
    expect(onChange).toHaveBeenCalledWith('f2');
    expect(onSelected).toHaveBeenCalledWith(FORNECEDORES[1]);
  });
});
