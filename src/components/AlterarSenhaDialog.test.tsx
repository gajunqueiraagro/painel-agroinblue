/**
 * ACESSO-CONVITE-01 PR 1 — o "Trocar senha": confere a senha atual ANTES de gravar; todo erro fica no campo (nenhum toast de erro);
 * só o sucesso avisa.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), updateUser: vi.fn() }));
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { email: 'pessoa@exemplo.com.br' } }) }));
vi.mock('sonner', () => ({ toast: avisos }));

import { AlterarSenhaDialog } from './AlterarSenhaDialog';

const abrirEPreencher = (atual: string, nova: string, confirmar: string) => {
  render(<AlterarSenhaDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText('Senha nova'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Repita a senha nova'), { target: { value: confirmar } });
  const dentro = screen.getByTestId('trocar-senha');
  fireEvent.click(Array.from(dentro.querySelectorAll('button[type="submit"]'))[0]);
};

describe('AlterarSenhaDialog', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('senha nova curta: o erro fica no campo e nada vai ao Supabase', async () => {
    abrirEPreencher('velha1234', '1234567', '1234567');
    expect(await screen.findByTestId('trocar-senha-erro-nova')).toHaveTextContent('8 caracteres');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(avisos.error).not.toHaveBeenCalled();
  });

  it('senha atual errada: confere antes, NÃO grava e diz no campo da atual', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    abrirEPreencher('errada123', 'nova12345', 'nova12345');
    await waitFor(() => expect(screen.getByTestId('trocar-senha-erro-atual')).toHaveTextContent('A senha atual não confere.'));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'pessoa@exemplo.com.br', password: 'errada123' });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(avisos.error).not.toHaveBeenCalled();
  });

  it('tudo certo: confere a atual, grava a nova e avisa "Senha alterada."', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    abrirEPreencher('velha1234', 'nova12345', 'nova12345');
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nova12345' }));
    expect(auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    expect(avisos.success).toHaveBeenCalledWith('Senha alterada.');
  });

  it('o Supabase recusa a nova: a frase vai para o campo da nova, sem toast', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } });
    abrirEPreencher('velha1234', 'nova12345', 'nova12345');
    await waitFor(() => expect(screen.getByTestId('trocar-senha-erro-nova')).toHaveTextContent('diferente da atual'));
    expect(avisos.error).not.toHaveBeenCalled();
    expect(avisos.success).not.toHaveBeenCalled();
  });
});
