/**
 * ACESSO-CONVITE-01 PR 1 — a página do link do e-mail: o link SÓ é verificado no clique (o leitor de segurança do e-mail que abre o
 * link antes não queima o convite); verificado, grava a senha e entra; link vencido = a frase na página.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), updateUser: vi.fn() }));
const navegar = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navegar }));

import DefinirSenhaPage from './DefinirSenhaPage';

const abrir = (search: string) => {
  window.history.pushState({}, '', `/definir-senha${search}`);
  render(<MemoryRouter><DefinirSenhaPage /></MemoryRouter>);
};
const preencherEEnviar = (senha: string) => {
  fireEvent.change(screen.getByLabelText('Senha nova'), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText('Repita a senha nova'), { target: { value: senha } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
};

describe('DefinirSenhaPage', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('abrir o link NÃO verifica nada; o clique verifica, grava a senha e entra', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    abrir('?token_hash=hash-do-convite&type=invite');
    expect(screen.getByText('Crie a sua senha')).toBeInTheDocument();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    preencherEEnviar('nova12345');
    await waitFor(() => expect(navegar).toHaveBeenCalledWith('/', { replace: true }));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-do-convite', type: 'invite' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nova12345' });
  });

  it('link vencido: a frase do "peça um novo" na página, sem gravar senha', async () => {
    auth.verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    abrir('?token_hash=velho&type=invite');
    preencherEEnviar('nova12345');
    await waitFor(() => expect(screen.getByTestId('definir-senha-erro')).toHaveTextContent('venceu ou já foi usado'));
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('senha curta: o erro no campo e o link nem é verificado (continua valendo)', async () => {
    abrir('?token_hash=hash&type=invite');
    preencherEEnviar('curta');
    expect(await screen.findByTestId('definir-senha-erro-nova')).toHaveTextContent('8 caracteres');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('sem token: "Link incompleto"', () => {
    abrir('');
    expect(screen.getByText('Link incompleto')).toBeInTheDocument();
  });
});
