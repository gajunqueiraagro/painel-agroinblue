// OPENFINANCE-PILOTO-01 · P3 mínima — os botões só existem para o admin AgroinBlue; cada um chama a SUA função com o que ela espera.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const quem = vi.hoisted(() => ({ isAdmin: true }));
const invoke = vi.hoisted(() => vi.fn());
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: quem.isAdmin }) }));
const fila = vi.hoisted(() => ({ linhas: [] as unknown[], filtro: '' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke }, from: () => ({
  select: () => ({ or: (f: string) => { fila.filtro = f; return { order: async () => ({ data: fila.linhas, error: null }) }; } }),
}) } }));
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
    invoke.mockResolvedValue({ data: { ok: true, accessToken: 'tok-30min', connectorIds: [601, 602] }, error: null });
    const init = vi.fn().mockResolvedValue(undefined);
    const recebeu: unknown[] = [];
    function PluggyConnect(this: unknown, o: unknown) { recebeu.push(o); return { init }; }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      render(<OpenFinanceDoAdmin clienteId="c1" />);
      fireEvent.click(screen.getByTestId('openfinance-conectar'));
      await waitFor(() => expect(init).toHaveBeenCalled());
      expect(invoke).toHaveBeenCalledWith('openfinance-conectar', { body: { cliente_id: 'c1' } });
      expect(recebeu[0]).toMatchObject({ connectToken: 'tok-30min', includeSandbox: false, connectorIds: [601, 602] });
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

describe('OPENFINANCE-SEG-01 na tela', () => {
  it('(a) a função não devolveu os regulados: o Widget NÃO abre (nunca a lista inteira, com os que pedem senha)', async () => {
    invoke.mockResolvedValue({ data: { ok: true, accessToken: 'tok-30min' }, error: null });
    const init = vi.fn();
    function PluggyConnect() { return { init }; }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      render(<OpenFinanceDoAdmin clienteId="c1" />);
      fireEvent.click(screen.getByTestId('openfinance-conectar'));
      await waitFor(() => expect(avisos.error).toHaveBeenCalledWith(expect.stringMatching(/por segurança a janela não abre/)));
      expect(init).not.toHaveBeenCalled();
    } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });

  it('(b) Desconectar: lista só as conexões do cliente, pede confirmação e chama a função com o item', async () => {
    const C = '43f32d07-dba8-4670-900c-bf645440c04a';
    fila.linhas = [
      { evento: 'item/created', item_id: 'item-a', cliente_id: C, client_user_id: C, connector_id: '601', recebido_em: '2026-11-16T18:40:00Z' },
      { evento: 'item/created', item_id: 'item-b', cliente_id: C, client_user_id: C, connector_id: '602', recebido_em: '2026-11-16T18:41:00Z' },
      { evento: 'agroinblue/item_desconectado', item_id: 'item-b', cliente_id: null, client_user_id: C, connector_id: null, recebido_em: '2026-11-16T18:42:00Z' },
    ];
    invoke.mockResolvedValue({ data: { ok: true, ja_nao_existia: false }, error: null });
    render(<OpenFinanceDoAdmin clienteId={C} />);
    fireEvent.click(screen.getByTestId('openfinance-desconectar'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    expect(fila.filtro).toBe(`cliente_id.eq.${C},client_user_id.eq.${C}`);
    fireEvent.click(screen.getByTestId('openfinance-desconectar-este'));
    expect(invoke).not.toHaveBeenCalled(); // só com a confirmação
    fireEvent.click(screen.getByTestId('openfinance-confirmar-desconectar'));
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/^Banco desconectado/)));
    expect(invoke).toHaveBeenCalledWith('openfinance-desconectar', { body: { cliente_id: C, item_id: 'item-a' } });
    await waitFor(() => expect(screen.getByTestId('openfinance-sem-conexao')).toBeTruthy());
  });
});

describe('OPENFINANCE-P3a — Escolher contas', () => {
  const C = '43f32d07-dba8-4670-900c-bf645440c04a';
  const ITEM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const LISTA = { ok: true, contas: [
    { account_id: 'acc-cc', tipo_legivel: 'Conta corrente', banco: 'Itaú', final4: '3456', titular: 'Fulano T. S.', documento: '***.456.789-**', permitida: false },
    { account_id: 'acc-cartao', tipo_legivel: 'Cartão de crédito', banco: 'Itaú', final4: '9876', titular: 'Beltrana S.', documento: null, permitida: false },
  ] };
  const abrir = async () => {
    fila.linhas = [{ evento: 'item/created', item_id: ITEM, cliente_id: C, client_user_id: C, connector_id: null, recebido_em: '2026-11-16T20:10:37Z' }];
    render(<OpenFinanceDoAdmin clienteId={C} />);
    fireEvent.click(screen.getByTestId('openfinance-desconectar'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('openfinance-escolher-contas'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conta')).toHaveLength(2));
  };

  it('tudo DESMARCADO por padrão; sem marcar, nada a gravar; lista só com o que a função mandou', async () => {
    invoke.mockResolvedValue({ data: LISTA, error: null });
    await abrir();
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'listar', cliente_id: C, item_id: ITEM } });
    for (const cb of screen.getAllByTestId('openfinance-conta-marcar')) expect(cb.getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByTestId('openfinance-ver-previa')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('openfinance-contador').textContent).toBe('0 de 2 marcadas');
  });

  it('marca UMA → prévia (simular) → gravar só ela', async () => {
    invoke.mockImplementation(async (_n: string, o: { body: { acao: string; simular?: boolean } }) => (o.body.acao === 'listar'
      ? { data: LISTA, error: null }
      : { data: { ok: true, simulado: o.body.simular, ligar: 1, manter: 0, desligar: 0 }, error: null }));
    await abrir();
    fireEvent.click(screen.getAllByTestId('openfinance-conta-marcar')[0]);
    fireEvent.click(screen.getByTestId('openfinance-ver-previa'));
    await waitFor(() => expect(screen.getByTestId('openfinance-previa').textContent).toMatch(/^Entram 1 · continuam 0 · saem 0/));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'permitir', cliente_id: C, item_id: ITEM, account_ids: ['acc-cc'], simular: true } });
    expect(invoke).not.toHaveBeenCalledWith('openfinance-contas', expect.objectContaining({ body: expect.objectContaining({ simular: false }) }));
    fireEvent.click(screen.getByTestId('openfinance-gravar-escolha'));
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/^Escolha gravada: 1 conta entra/)));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'permitir', cliente_id: C, item_id: ITEM, account_ids: ['acc-cc'], simular: false } });
  });

  it('logo depois de conectar (onSuccess do Widget) abre o Escolher contas do item novo', async () => {
    invoke.mockImplementation(async (n: string) => (n === 'openfinance-conectar'
      ? { data: { ok: true, accessToken: 'tok', connectorIds: [601] }, error: null } : { data: LISTA, error: null }));
    const recebeu: Array<{ onSuccess: (d: unknown) => void }> = [];
    function PluggyConnect(this: unknown, o: { onSuccess: (d: unknown) => void }) { recebeu.push(o); return { init: async () => undefined }; }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      render(<OpenFinanceDoAdmin clienteId={C} />);
      fireEvent.click(screen.getByTestId('openfinance-conectar'));
      await waitFor(() => expect(recebeu).toHaveLength(1));
      recebeu[0].onSuccess({ item: { id: ITEM, connector: { name: 'Itaú' } } });
      await waitFor(() => expect(screen.getAllByTestId('openfinance-conta')).toHaveLength(2));
      expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'listar', cliente_id: C, item_id: ITEM } });
    } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });

  it('mexer na marcação depois da prévia apaga a prévia (nunca grava o que não foi conferido)', async () => {
    invoke.mockImplementation(async (_n: string, o: { body: { acao: string } }) => (o.body.acao === 'listar'
      ? { data: LISTA, error: null } : { data: { ok: true, ligar: 1, manter: 0, desligar: 0 }, error: null }));
    await abrir();
    const cbs = screen.getAllByTestId('openfinance-conta-marcar');
    fireEvent.click(cbs[0]);
    fireEvent.click(screen.getByTestId('openfinance-ver-previa'));
    await waitFor(() => expect(screen.getByTestId('openfinance-gravar-escolha')).toBeTruthy());
    fireEvent.click(cbs[1]);
    expect(screen.queryByTestId('openfinance-gravar-escolha')).toBeNull();
    expect(screen.getByTestId('openfinance-ver-previa')).toBeTruthy();
  });
});
