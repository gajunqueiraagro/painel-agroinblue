/**
 * P32 — o cancelamento da OC do modelo ANTIGO (sem conta corrente) mostra a mesma lista do modelo conta corrente: o banco
 * (`oc_cancelar_rol`, OC-CANCELAR-CASCATA-01) devolve os compromissos que fecham junto; o dialogo e' o mesmo componente.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CancelarContaCorrenteDialog } from './CancelarContaCorrenteDialog';
import { lerRol, type OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';

const DO_BANCO = { modelo: 'titulo', compromissos: [
  { compromisso_id: 'c1', componente: 'principal', descricao: 'Compra 040 Garrotes · Pagamento', valor: 40000, status: 'aberto', vencimento: '2026-09-15' },
  { compromisso_id: 'c2', componente: 'principal', descricao: null, valor: 31900, status: 'programado', vencimento: null },
] };

describe('P32 — cancelar no modelo antigo', () => {
  it('o rol do modelo titulo e lido (so compromissos); o de outro modelo segue nulo', () => {
    const rol = lerRol(DO_BANCO);
    expect(rol?.modelo).toBe('titulo');
    expect(rol?.compromissos).toEqual([
      { componente: 'principal', valor: 40000, vencimento: '2026-09-15', descricao: 'Compra 040 Garrotes · Pagamento' },
      { componente: 'principal', valor: 31900, vencimento: null, descricao: null },
    ]);
    expect(lerRol({ modelo: 'outro' })).toBeNull();
  });

  it('o dialogo lista os compromissos com data e R$, exige motivo e cancela', async () => {
    const api = { lerRolCancelamento: vi.fn(async () => ({ rol: lerRol(DO_BANCO), erro: null })), recarregar: vi.fn(async () => {}) } as unknown as OcContaCorrenteApi;
    const onCancelar = vi.fn(async () => null);
    const onFechar = vi.fn();
    render(<CancelarContaCorrenteDialog api={api} lado="compra" onCancelar={onCancelar} onFechar={onFechar} />);
    const lista = await screen.findByTestId('cancelar-modelo-titulo');
    const txt = (lista.textContent ?? '').replace(/ /g, ' ');
    expect(txt).toContain('Compromissos e programações cancelados (2)');
    expect(txt).toContain('15/09/26 · Compra 040 Garrotes · Pagamento · R$ 40.000,00');
    expect(txt).toContain('sem vencimento · principal · R$ 31.900,00');
    expect(txt).not.toContain('Entradas canceladas');
    const dlg = screen.getByTestId('dialogo-cancelar-cc');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar operação' }));
    expect(onCancelar).not.toHaveBeenCalled();
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'duplicada' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar operação' }));
    await waitFor(() => expect(onCancelar).toHaveBeenCalledWith('duplicada'));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
  });

  it('a compra do modelo antigo abre o mesmo dialogo (lido da fonte)', () => {
    const fonte = readFileSync('src/components/compra/CompraModalShell.tsx', 'utf8');
    expect(fonte).toContain('onClick={() => setCancelarTituloAberto(true)}');
    expect(fonte).toContain("onCancelar={async (m) => { await api.onCancelarOC?.(m); return null; }}");
  });
});
