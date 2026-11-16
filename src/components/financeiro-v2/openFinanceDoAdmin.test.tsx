// OPENFINANCE-PILOTO-01 · P3 mínima — os botões só existem para o admin AgroinBlue; cada um chama a SUA função com o que ela espera.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const quem = vi.hoisted(() => ({ isAdmin: true }));
const invoke = vi.hoisted(() => vi.fn());
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: quem.isAdmin }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: avisos }));

import { OpenFinanceDoAdmin } from './OpenFinanceDoAdmin';

beforeEach(() => { invoke.mockReset(); avisos.success.mockReset(); avisos.error.mockReset(); quem.isAdmin = true; });

describe('OpenFinanceDoAdmin', () => {
  it('quem não é admin não vê nada', () => {
    quem.isAdmin = false;
    const { container } = render(<OpenFinanceDoAdmin clienteId="c1" />);
    expect(container.innerHTML).toBe('');
  });

  it('Registrar webhook: chama o registrar pelo login (corpo vazio) e diz o resultado', async () => {
    invoke.mockResolvedValue({ data: { ok: true, id: 'w1', ja_existia: true }, error: null });
    render(<OpenFinanceDoAdmin clienteId="c1" />);
    fireEvent.click(screen.getByTestId('openfinance-registrar'));
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/já estava registrado/)));
    expect(invoke).toHaveBeenCalledWith('openfinance-webhook-registrar', { body: {} });
  });

  it('Conectar banco: pede o token com o cliente aberto e abre o Widget com ele', async () => {
    invoke.mockResolvedValue({ data: { ok: true, accessToken: 'tok-30min' }, error: null });
    const init = vi.fn().mockResolvedValue(undefined);
    const recebeu: unknown[] = [];
    function PluggyConnect(this: unknown, o: unknown) { recebeu.push(o); return { init }; }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      render(<OpenFinanceDoAdmin clienteId="c1" />);
      fireEvent.click(screen.getByTestId('openfinance-conectar'));
      await waitFor(() => expect(init).toHaveBeenCalled());
      expect(invoke).toHaveBeenCalledWith('openfinance-conectar', { body: { cliente_id: 'c1' } });
      expect(recebeu[0]).toMatchObject({ connectToken: 'tok-30min' });
    } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });

  it('Conectar banco recusado: a frase da função, e o Widget não abre', async () => {
    const contexto = new Response(JSON.stringify({ ok: false, frase: 'Só o gestor do cliente ou a AgroinBlue conecta um banco.' }), { status: 403 });
    invoke.mockResolvedValue({ data: null, error: { context: contexto } });
    const init = vi.fn();
    function PluggyConnect() { return { init }; }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      render(<OpenFinanceDoAdmin clienteId="c1" />);
      fireEvent.click(screen.getByTestId('openfinance-conectar'));
      await waitFor(() => expect(avisos.error).toHaveBeenCalledWith('Só o gestor do cliente ou a AgroinBlue conecta um banco.'));
      expect(init).not.toHaveBeenCalled();
      expect(avisos.error).toHaveBeenCalledTimes(1);
    } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });

  it('sem cliente aberto: não chama a função', () => {
    render(<OpenFinanceDoAdmin clienteId={null} />);
    fireEvent.click(screen.getByTestId('openfinance-conectar'));
    expect(invoke).not.toHaveBeenCalled();
    expect(avisos.error).toHaveBeenCalled();
  });
});
