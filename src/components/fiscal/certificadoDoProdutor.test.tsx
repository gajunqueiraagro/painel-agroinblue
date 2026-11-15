/**
 * NOTAS-RECEITA-A1-01 · F2 — a aba Certificado: só metadados; a frase do A3 sempre à vista; quem não é admin/gestor não sobe; o arquivo e a
 * senha vão à borda num FormData (a tela não lê o certificado) e a recusa da borda fica escrita junto do botão (nunca toast).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CertificadoDoProdutor } from './CertificadoDoProdutor';
import { FRASE_A3_NAO_SERVE } from '@/lib/fiscal/certificadoTela';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/lib/datas/hojeLocal', () => ({ hojeLocal: () => '2026-11-13' }));

const g = globalThis as unknown as Record<string, unknown>;
const CERT = { id: 'c1', situacao: 'ativo', documento: '52998224725', emissor: 'AC SINTETICA', numero_serie: '0a', impressao_digital: 'ab12cd34ef567890'.padEnd(64, '0'),
  valido_de: '2026-01-01T00:00:00+00:00', valido_ate: '2026-12-01T00:00:00+00:00', enviado_em: '2026-11-13T10:00:00+00:00' };
function montar(o: { perfil: string; certs?: unknown[]; funcao?: (nome: string, op: unknown) => { data: unknown; error: unknown } }) {
  g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente', perfil: o.perfil }, clientes: [], isAdmin: false, perfil: o.perfil, loading: false };
  g.__bancoBancada = {
    from: (t: string) => (t === 'fiscal_certificados' ? o.certs ?? [] : t === 'fiscal_certificados_trilha' ? [{ id: 1, acao: 'subiu', em: '2026-11-13T10:00:00Z', motivo: null }] : []),
    funcao: o.funcao,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CertificadoDoProdutor titularId="t1" /></QueryClientProvider>);
}
afterEach(() => { delete g.__clienteBancada; delete g.__bancoBancada; });

describe('CertificadoDoProdutor', () => {
  it('mostra SÓ metadados do ativo: situação, validade com o aviso de 30 dias, impressão curta; e a trilha', async () => {
    montar({ perfil: 'gestor_cliente', certs: [CERT] });
    await waitFor(() => expect(screen.getByTestId('certificado-situacao').textContent).toBe('ativo'));
    expect(screen.getByTestId('certificado-validade').textContent).toBe('vence em 18 dias (01/12/2026)');
    expect(screen.getByTestId('certificado-impressao').textContent).toBe('AB12 CD34 EF56 7890');
    expect(screen.getByTestId('certificado-trilha').textContent).toContain('certificado enviado');
  });
  it('a frase do A3 fica sempre à vista para quem sobe; quem não é admin/gestor não vê o envio', async () => {
    const { unmount } = montar({ perfil: 'gestor_cliente' });
    expect((await screen.findByTestId('certificado-a3-explicacao')).textContent).toBe(FRASE_A3_NAO_SERVE);
    unmount();
    montar({ perfil: 'financeiro' });
    await waitFor(() => expect(screen.getByTestId('certificado-situacao').textContent).toBe('não cadastrado'));
    expect(screen.queryByTestId('certificado-a3-explicacao')).toBeNull();
    expect(screen.queryByTestId('certificado-subir')).toBeNull();
  });
  it('subir: arquivo + senha vão à borda num FormData; a recusa (em error.context) fica ESCRITA junto do botão', async () => {
    const chamadas: { nome: string; corpo: unknown }[] = [];
    montar({ perfil: 'gestor_cliente', funcao: (nome, op) => {
      chamadas.push({ nome, corpo: op && typeof op === 'object' ? Reflect.get(op, 'body') : null });
      return { data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ ok: false, recusa: 'nao_a1', frase: `Este arquivo não é um certificado A1: não traz a chave. ${FRASE_A3_NAO_SERVE}` }), { status: 422 }) } };
    } });
    const entrada = (await screen.findByTestId('certificado-arquivo')).querySelector('input[type="file"]');
    if (!entrada) throw new Error('sem campo de arquivo');
    fireEvent.change(entrada, { target: { files: [new File([new Uint8Array([48, 130, 1])], 'vera.pfx', { type: 'application/x-pkcs12' })] } });
    fireEvent.change(screen.getByTestId('certificado-senha'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByTestId('certificado-subir'));
    await waitFor(() => expect(screen.getByTestId('certificado-recado').textContent).toContain('não é um certificado A1'));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].nome).toBe('fiscal-certificado-subir');
    const corpo = chamadas[0].corpo;
    if (!(corpo instanceof FormData)) throw new Error('não foi FormData');
    expect([corpo.get('titular_id'), corpo.get('senha'), corpo.get('arquivo') instanceof File]).toEqual(['t1', 'segredo', true]);
  });
  it('sem arquivo ou sem senha: diz o que falta e não chama a borda', async () => {
    const funcao = vi.fn();
    montar({ perfil: 'gestor_cliente', funcao });
    fireEvent.click(await screen.findByTestId('certificado-subir'));
    expect(screen.getByTestId('certificado-recado').textContent).toBe('Escolha o arquivo .pfx ou .p12.');
    expect(funcao).not.toHaveBeenCalled();
  });
});
