/**
 * ACESSO-CONVITE-01 PR 1 (D1) — a tela de entrada: SÓ POR CONVITE (não existe "Criar conta"); "Esqueci minha senha" manda o link para
 * a página `/definir-senha` e responde sempre a mesma frase (não revela quem tem login); erro de login fica na tela, nunca em toast.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));
const entrar = vi.hoisted(() => vi.fn());
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signIn: entrar }) }));
vi.mock('sonner', () => ({ toast: avisos }));

import AuthPage from './AuthPage';
import { FRASE_ESQUECI_ENVIADO } from '@/lib/auth/senhaEConvite';

describe('AuthPage', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('não existe "Criar conta" (o sistema é só por convite)', () => {
    render(<AuthPage />);
    expect(screen.queryByText(/criar conta/i)).toBeNull();
    expect(screen.queryByText(/cadastr/i)).toBeNull();
  });

  it('login errado: a frase na tela, sem toast', async () => {
    entrar.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<AuthPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByTestId('entrada-mensagem')).toHaveTextContent('E-mail ou senha incorretos.'));
    expect(avisos.error).not.toHaveBeenCalled();
  });

  it('"Esqueci minha senha": o link volta para /definir-senha e a resposta é a mesma com ou sem login', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    render(<AuthPage />);
    fireEvent.click(screen.getByTestId('entrada-trocar-modo'));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'quem@exemplo.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar o link' }));
    await waitFor(() => expect(screen.getByTestId('entrada-mensagem')).toHaveTextContent(FRASE_ESQUECI_ENVIADO));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('quem@exemplo.com', { redirectTo: `${window.location.origin}/definir-senha` });
  });
});
