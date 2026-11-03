/**
 * MAPA-AREA-TIPOS-02 (D3) — a estrutura com valor da área: prévia do banco antes de gravar; já criada, manda para a ficha e o Patrimônio
 * no Gestor; tipo sem valor não mostra nada; a recusa fica no bloco (nunca toast).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EstruturaDaArea } from './EstruturaDaArea';
import type { InfraLida } from '@/lib/mapa/infraestrutura';

const infra: InfraLida = { id: 'i9', fazenda_id: 'f', tipo: 'armazem_graos', geometria: { type: 'Polygon', coordinates: [] }, nome: 'Armazem',
  pasto_id: null, bem_id: null, observacao: null, ficha: {}, geometria_id: 'g1', versao: 2, criado_em: '', criado_por: null };

describe('EstruturaDaArea', () => {
  it('sem infraestrutura: "Criar a estrutura" mostra a prévia e só o "Confirmar" grava', async () => {
    const estrutura = vi.fn((_g: string, simular: boolean) => Promise.resolve({ ok: true, motivo: null,
      dado: simular ? { rotulo: 'Armazém de grãos', area_ha: 0.42, partes: 1 } : { ok: true } }));
    const onCriou = vi.fn();
    render(<EstruturaDaArea geometriaId="g1" tipoDaArea="armazem_graos" infras={[]} estruturaDaArea={estrutura} onCriou={onCriou} />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar a estrutura' }));
    expect(await screen.findByText(/Vira a infraestrutura "Armazém de grãos" · 0,42 ha/)).toBeTruthy();
    expect(estrutura).toHaveBeenLastCalledWith('g1', true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onCriou).toHaveBeenCalled());
    expect(estrutura).toHaveBeenLastCalledWith('g1', false);
  });
  it('já é infraestrutura: o botão abre o Gestor com ela', () => {
    const abrir = vi.fn();
    render(<EstruturaDaArea geometriaId="g1" tipoDaArea="armazem_graos" infras={[infra]} estruturaDaArea={vi.fn()} onCriou={vi.fn()} onAbrirNoGestor={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ficha e Patrimônio no Gestor' }));
    expect(abrir).toHaveBeenCalledWith('i9');
  });
  it('tipo sem valor (lagoa): nada; a recusa do banco aparece no bloco', async () => {
    const { container } = render(<EstruturaDaArea geometriaId="g2" tipoDaArea="lagoa" infras={[]} estruturaDaArea={vi.fn()} onCriou={vi.fn()} />);
    expect(container.textContent).toBe('');
    const recusa = vi.fn(() => Promise.resolve({ ok: false, dado: null, motivo: 'O polígono desta área não tem um contorno válido.' }));
    render(<EstruturaDaArea geometriaId="g3" tipoDaArea="silo_secador" infras={[]} estruturaDaArea={recusa} onCriou={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar a estrutura' }));
    expect(await screen.findByText('O polígono desta área não tem um contorno válido.')).toBeTruthy();
  });
});
