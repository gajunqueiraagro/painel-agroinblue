// OPENFINANCE-PILOTO-01 · P3 + OPENFINANCE-PRONTO-NJ-01 — o Open Finance do cliente em Contas bancárias: quem pode (admin e gestor), o termo
// antes da conexão nova, "Bancos conectados" como a Pluggy vê (nome, situação, frase das que não completaram) e "Escolher contas" num passo
// (a conta do sistema sugerida pela agência e conta; gravar = permitir + ligar). Tudo SINTÉTICO; nada fala com a Pluggy.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

const quem = vi.hoisted(() => ({ isAdmin: true, perfil: 'admin_agroinblue' }));
const invoke = vi.hoisted(() => vi.fn());
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const banco = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]> }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: { perfil: quem.perfil } }) }));
interface Cadeia {
  select: () => Cadeia; eq: () => Cadeia; order: () => Cadeia; limit: () => Cadeia; or: () => Cadeia;
  then: (f: (r: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
}
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (t: string): Cadeia => {
    const c: Cadeia = { select: () => c, eq: () => c, order: () => c, limit: () => c, or: () => c,
      then: (f) => Promise.resolve(f({ data: banco.tabelas[t] ?? [], error: null })) };
    return c;
  };
  return { supabase: { functions: { invoke }, from: cadeia } };
});
vi.mock('sonner', () => ({ toast: avisos }));

import { MOTIVO_SEM_ACEITE, MOTIVO_SEM_LINK, OpenFinanceDoAdmin, type PedidoOpenFinance } from './OpenFinanceDoAdmin';
import { FRASE_AINDA_LENDO, MOTIVO_SO_PROPRIETARIO } from '@/lib/openfinance/openfinanceTela';

const C = '43f32d07-dba8-4670-900c-bf645440c04a';
const ITEM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MD5 = '0123456789abcdef0123456789abcdef';
const TERMO = [{ versao: 1, texto: 'Termo SINTÉTICO do Open Finance: o AGROinBLUE só lê o saldo e o extrato das contas escolhidas.', texto_md5: MD5 }];

/* o hospedeiro faz o papel de Contas bancárias (o selo = 'lista'; o "Conectar" da linha = 'conectar') */
function Hospede({ clienteId, finais = [] }: { clienteId: string | null; finais?: string[] }) {
  const [p, setP] = useState<PedidoOpenFinance | null>(null);
  return (<>
    <button type="button" data-testid="t-lista" onClick={() => setP({ tipo: 'lista' })} />
    <button type="button" data-testid="t-conectar" onClick={() => setP({ tipo: 'conectar', banco: 'Sicredi', contaNome: 'Sicredi Sintético 9823', finais })} />
    <OpenFinanceDoAdmin clienteId={clienteId} pedido={p} onFechar={() => setP(null)} />
  </>);
}
const abrirConectar = async () => {
  fireEvent.click(screen.getByTestId('t-conectar'));
  await waitFor(() => expect(screen.getByTestId('openfinance-termo-texto').textContent).toContain('Termo SINTÉTICO'));
};
const conectarAgora = async () => {
  await abrirConectar();
  fireEvent.click(screen.getByTestId('openfinance-termo-aceito'));
  fireEvent.click(screen.getByTestId('openfinance-conectar-agora'));
};
/** o Widget falso: guarda as opções que a tela passou; `init` é o que a tela chama para abrir */
type OpcoesRecebidas = { onSuccess: (d: unknown) => void; connectToken?: string };
const comWidget = async (corpo: () => Promise<void>, init = vi.fn().mockResolvedValue(undefined)) => {
  const recebeu: OpcoesRecebidas[] = [];
  function PluggyConnect(this: unknown, o: OpcoesRecebidas) { recebeu.push(o); return { init }; }
  Reflect.set(window, 'PluggyConnect', PluggyConnect);
  try { await corpo(); return { recebeu, init }; } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
};

beforeEach(() => {
  invoke.mockReset(); avisos.success.mockReset(); avisos.error.mockReset();
  quem.isAdmin = true; quem.perfil = 'admin_agroinblue';
  banco.tabelas = { openfinance_termo_versoes: TERMO };
});

describe('quem usa o Open Finance (PRONTO-NJ-01 (8))', () => {
  it('o financeiro (nem admin, nem gestor) não vê nada e nada é chamado', () => {
    quem.isAdmin = false; quem.perfil = 'financeiro';
    const { container } = render(<OpenFinanceDoAdmin clienteId="c1" pedido={{ tipo: 'lista' }} onFechar={() => {}} />);
    expect(container.innerHTML).toBe('');
    expect(invoke).not.toHaveBeenCalled();
  });
  const UMA_CONEXAO = { data: { ok: true, conexoes: [
    { item_id: ITEM, banco: 'Sicredi', empresa: false, situacao: 'conectado', frase: null, criado_em: '2026-11-25T13:47:35Z' },
  ] }, error: null };
  it('o PROPRIETÁRIO vê e conecta (Escolher contas, Reconectar e o Conectar da linha); Desconectar/Descartar seguem só o admin', async () => {
    quem.isAdmin = false; quem.perfil = 'proprietario';
    invoke.mockResolvedValue(UMA_CONEXAO);
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    expect(screen.getByTestId('openfinance-escolher-contas')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('openfinance-reconectar')).toHaveProperty('disabled', false);
    expect(screen.queryByTestId('openfinance-so-proprietario')).toBeNull();
    expect(screen.queryByTestId('openfinance-desconectar-este')).toBeNull();
    await abrirConectar();
    expect(screen.getByTestId('openfinance-conectar-linha')).toBeTruthy();
  });
  it('o GESTOR só vê: a lista e a situação aparecem, os botões ficam desabilitados com o motivo, e o Conectar da linha não abre', async () => {
    quem.isAdmin = false; quem.perfil = 'gestor_cliente';
    invoke.mockResolvedValue(UMA_CONEXAO);
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    expect(screen.getByTestId('openfinance-conexao-situacao').textContent).toContain('Conectado');
    expect(screen.getByTestId('openfinance-escolher-contas')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('openfinance-reconectar')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('openfinance-escolher-contas').getAttribute('title')).toBe(MOTIVO_SO_PROPRIETARIO);
    expect(screen.getByTestId('openfinance-so-proprietario').textContent).toBe(MOTIVO_SO_PROPRIETARIO);
    fireEvent.click(screen.getByTestId('t-conectar'));
    expect(screen.queryByTestId('openfinance-conectar-linha')).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);   // só a leitura da lista: nada de conectar
  });
});

describe('o "Conectar" da linha com o termo', () => {
  it('o modal mostra o banco da linha e o termo; "Conectar agora" só depois do aceite, e diz por quê', async () => {
    render(<Hospede clienteId={C} />);
    await abrirConectar();
    const modal = screen.getByTestId('openfinance-conectar-linha');
    expect(modal.textContent).toContain('Conectar Sicredi');
    expect(modal.textContent).toContain('a partir de Sicredi Sintético 9823');
    expect(screen.getByTestId('openfinance-conectar-agora')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('openfinance-motivo-conectar').textContent).toBe(MOTIVO_SEM_ACEITE);
    expect(screen.getByTestId('openfinance-mandar-link')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('openfinance-motivo-sem-link').textContent).toBe(MOTIVO_SEM_LINK);
    fireEvent.click(screen.getByTestId('openfinance-termo-aceito'));
    expect(screen.getByTestId('openfinance-conectar-agora')).toHaveProperty('disabled', false);
    expect(invoke).not.toHaveBeenCalled();   // abrir e aceitar não chama nada
  });

  it('Conectar agora: o token pedido COM a versão e o md5 do termo mostrado, e o Widget abre com ele', async () => {
    invoke.mockResolvedValue({ data: { ok: true, accessToken: 'tok-30min', connectorIds: [601, 602] }, error: null });
    const init = vi.fn().mockResolvedValue(undefined);
    const { recebeu } = await comWidget(async () => {
      render(<Hospede clienteId={C} />);
      await conectarAgora();
      await waitFor(() => expect(init).toHaveBeenCalled());
    }, init);
    expect(invoke).toHaveBeenCalledWith('openfinance-conectar', { body: { cliente_id: C, termo: { versao: 1, md5: MD5 } } });
    expect(recebeu[0]).toMatchObject({ connectToken: 'tok-30min', includeSandbox: false, connectorIds: [601, 602] });
  });

  it('recusado: a frase da função, e o Widget não abre', async () => {
    const contexto = new Response(JSON.stringify({ ok: false, frase: 'O termo mudou: leia a versão nova e aceite de novo. Nada foi aberto.' }), { status: 409 });
    invoke.mockResolvedValue({ data: null, error: { context: contexto } });
    const init = vi.fn();
    await comWidget(async () => {
      render(<Hospede clienteId={C} />);
      await conectarAgora();
      await waitFor(() => expect(avisos.error).toHaveBeenCalledWith('O termo mudou: leia a versão nova e aceite de novo. Nada foi aberto.'));
    }, init);
    expect(init).not.toHaveBeenCalled();
  });

  it('a função não devolveu os regulados: o Widget NÃO abre (nunca a lista inteira, com os que pedem senha)', async () => {
    invoke.mockResolvedValue({ data: { ok: true, accessToken: 'tok-30min' }, error: null });
    const init = vi.fn();
    await comWidget(async () => {
      render(<Hospede clienteId={C} />);
      await conectarAgora();
      await waitFor(() => expect(avisos.error).toHaveBeenCalledWith(expect.stringMatching(/por segurança a janela não abre/)));
    }, init);
    expect(init).not.toHaveBeenCalled();
  });

  it('sem cliente aberto: não chama a função', async () => {
    render(<Hospede clienteId={null} />);
    await conectarAgora();
    expect(invoke).not.toHaveBeenCalled();
    expect(avisos.error).toHaveBeenCalled();
  });
});

describe('Bancos conectados como a Pluggy vê (PRONTO-NJ-01 (1)+(7))', () => {
  const CONEXOES = { ok: true, conexoes: [
    { item_id: ITEM, banco: 'Sicredi', empresa: false, situacao: 'conectado', frase: null, criado_em: '2026-11-25T13:47:35Z' },
    { item_id: 'item-bb', banco: 'Banco do Brasil', empresa: false, situacao: 'erro',
      frase: 'O banco esperou a confirmação no app e o tempo acabou. Tente de novo com o celular em mãos.', criado_em: '2026-11-25T13:38:11Z' },
    { item_id: 'item-pj', banco: 'Sicredi', empresa: true, situacao: 'esperando', frase: 'Esperando o titular aprovar no app do banco (o prazo é de 20 minutos).', criado_em: null },
  ] };
  it('a lista vem da função ("conexoes"): o NOME do banco, a situação e a frase das que não completaram — nada some', async () => {
    invoke.mockResolvedValue({ data: CONEXOES, error: null });
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(3));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'conexoes', cliente_id: C } });
    expect(screen.getAllByTestId('openfinance-conexao-banco').map((e) => e.textContent)).toEqual(['Sicredi', 'Banco do Brasil', 'Sicredi · Empresa']);
    expect(screen.getAllByTestId('openfinance-conexao-situacao').map((e) => e.textContent)).toEqual(['● Conectado', '● Não completou', '● Esperando o titular']);
    const frases = screen.getAllByTestId('openfinance-conexao-frase');
    expect(frases).toHaveLength(2);                                                  // a conectada não tem frase (nem linha vazia)
    expect(frases[0].textContent).toMatch(/o tempo acabou\. Tente de novo com o celular em mãos/);
    expect(screen.getAllByTestId('openfinance-escolher-contas')).toHaveLength(1);    // só a conectada escolhe contas
    expect(screen.getAllByTestId('openfinance-reconectar').map((b) => b.textContent)).toEqual(['Reconectar', 'Tentar de novo', 'Tentar de novo']);
    expect(document.body.textContent).not.toMatch(/conector —/);
  });
  it('Desconectar pede confirmação e chama a função com o item; a que não completou se Descarta', async () => {
    invoke.mockImplementation(async (n: string) => (n === 'openfinance-contas' ? { data: CONEXOES, error: null } : { data: { ok: true, ja_nao_existia: false }, error: null }));
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(3));
    expect(screen.getAllByTestId('openfinance-desconectar-este').map((b) => b.textContent)).toEqual(['Desconectar', 'Descartar', 'Descartar']);
    fireEvent.click(screen.getAllByTestId('openfinance-desconectar-este')[0]);
    expect(invoke).not.toHaveBeenCalledWith('openfinance-desconectar', expect.anything()); // só com a confirmação
    fireEvent.click(screen.getByTestId('openfinance-confirmar-desconectar'));
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/^Banco desconectado/)));
    expect(invoke).toHaveBeenCalledWith('openfinance-desconectar', { body: { cliente_id: C, item_id: ITEM } });
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(2));
  });
  it('a função falha: a frase dela, e a janela não abre vazia fingindo "nenhum banco"', async () => {
    const contexto = new Response(JSON.stringify({ ok: false, frase: 'Não consegui ler as conexões na Pluggy. Tente de novo.' }), { status: 502 });
    invoke.mockResolvedValue({ data: null, error: { context: contexto } });
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(avisos.error).toHaveBeenCalledWith('Não consegui ler as conexões na Pluggy. Tente de novo.'));
    expect(screen.queryByTestId('openfinance-sem-conexao')).toBeNull();
  });
});

describe('Escolher contas num passo (PRONTO-NJ-01 (1))', () => {
  const LISTA = { ok: true, banco: 'Sicredi', lendo: false, contas: [
    { account_id: 'acc-cc', tipo: 'BANK', tipo_legivel: 'Conta corrente', banco: 'Sicredi', final4: '9823', agencia: '0748', titular: 'Fulano T. S.', documento: '***.456.789-**', permitida: false },
    { account_id: 'acc-cartao', tipo: 'CREDIT', tipo_legivel: 'Cartão de crédito', banco: 'Sicredi', final4: '9876', agencia: null, titular: 'Beltrana S.', documento: null, permitida: false },
  ] };
  /* a de outra agência termina no mesmo 9823: sem a agência haveria EMPATE (nenhuma sugestão) */
  const CADASTRO = [
    { id: 'k-lavoura', nome_conta: 'Sicredi Lavoura Sintética', nome_exibicao: null, tipo_conta: 'cc', agencia: '748', numero_conta: '95982', conta_digito: '3', ativa: true },
    { id: 'k-outra', nome_conta: 'Sicredi Outra Agência', nome_exibicao: null, tipo_conta: 'cc', agencia: '0911', numero_conta: '19823', conta_digito: null, ativa: true },
  ];
  const CONEXAO = { ok: true, conexoes: [{ item_id: ITEM, banco: 'Sicredi', empresa: false, situacao: 'conectado', frase: null, criado_em: null }] };
  type Pedido = { body: { acao: string; simular?: boolean } };
  const respostas = (listar: unknown = LISTA) => async (_n: string, o: Pedido) => (
    o.body.acao === 'conexoes' ? { data: CONEXAO, error: null }
      : o.body.acao === 'listar' ? { data: listar, error: null }
      : o.body.acao === 'ligar' ? { data: { ok: true, simulado: false, mudou: true }, error: null }
      : { data: { ok: true, simulado: o.body.simular, ligar: 1, manter: 0, desligar: 0 }, error: null });
  const abrir = async () => {
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('openfinance-escolher-contas'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conta')).toHaveLength(2));
  };
  beforeEach(() => { banco.tabelas = { ...banco.tabelas, financeiro_contas_bancarias: CADASTRO, openfinance_contas_permitidas: [] }; });

  it('a conta corrente vem com a conta do sistema SUGERIDA pela agência e conta; o cartão diz que vai pela fatura; nada marcado', async () => {
    invoke.mockImplementation(respostas());
    await abrir();
    expect(screen.getByTestId('openfinance-escolher-dialogo').textContent).toContain('Escolher contas · Sicredi');
    const celulas = screen.getAllByTestId('openfinance-lanca-em');
    expect(celulas[0].getAttribute('data-conta')).toBe('k-lavoura');
    expect(celulas[1].textContent).toMatch(/fatura: pela fonte da fatura/);
    for (const cb of screen.getAllByTestId('openfinance-conta-marcar')) expect(cb.getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByTestId('openfinance-ver-previa')).toHaveProperty('disabled', true);
  });

  it('marca → Prévia (permitir simulado + "Liga 1 conta corrente") → Gravar: permite e LIGA a conta sugerida', async () => {
    invoke.mockImplementation(respostas());
    await abrir();
    fireEvent.click(screen.getAllByTestId('openfinance-conta-marcar')[0]);
    fireEvent.click(screen.getByTestId('openfinance-ver-previa'));
    await waitFor(() => expect(screen.getByTestId('openfinance-previa').textContent).toMatch(/^Entram 1 · continuam 0 · saem 0.*Liga 1 conta corrente à conta escolhida\./));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'permitir', cliente_id: C, item_id: ITEM, account_ids: ['acc-cc'], simular: true } });
    expect(invoke).not.toHaveBeenCalledWith('openfinance-contas', expect.objectContaining({ body: expect.objectContaining({ acao: 'ligar' }) }));
    /* a permitida nasce no Gravar: a tela relê o id dela e liga */
    banco.tabelas = { ...banco.tabelas, openfinance_contas_permitidas: [{ id: 'perm-1', item_id: ITEM, account_id: 'acc-cc', conta_bancaria_id: null }] };
    fireEvent.click(screen.getByTestId('openfinance-gravar-escolha'));
    await waitFor(() => expect(avisos.success).toHaveBeenCalledWith(expect.stringMatching(/^Escolha gravada: 1 conta entra.* 1 ligada à conta do sistema\./)));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'permitir', cliente_id: C, item_id: ITEM, account_ids: ['acc-cc'], simular: false } });
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'ligar', cliente_id: C, permitida_id: 'perm-1', conta_bancaria_id: 'k-lavoura', simular: false } });
    expect(avisos.error).not.toHaveBeenCalled();
  });

  it('a ligação recusada depois de permitir: diz qual conta não ligou (a escolha entrou)', async () => {
    const base = respostas();
    invoke.mockImplementation(async (n: string, o: Pedido) => (o.body.acao === 'ligar'
      ? { data: null, error: { context: new Response(JSON.stringify({ ok: false, frase: 'Esta conta do sistema já recebe de outra conta do banco. Nada foi gravado.' }), { status: 409 }) } }
      : base(n, o)));
    await abrir();
    fireEvent.click(screen.getAllByTestId('openfinance-conta-marcar')[0]);
    fireEvent.click(screen.getByTestId('openfinance-ver-previa'));
    await waitFor(() => expect(screen.getByTestId('openfinance-gravar-escolha')).toBeTruthy());
    banco.tabelas = { ...banco.tabelas, openfinance_contas_permitidas: [{ id: 'perm-1', item_id: ITEM, account_id: 'acc-cc', conta_bancaria_id: null }] };
    fireEvent.click(screen.getByTestId('openfinance-gravar-escolha'));
    await waitFor(() => expect(avisos.error).toHaveBeenCalledWith(expect.stringMatching(/^A escolha entrou, mas não liguei: Conta corrente 9823: Esta conta do sistema já recebe/)));
  });

  it('a Pluggy ainda lendo o banco (logo depois do consentimento): diz que está lendo e oferece "Ler de novo" — nunca "não há contas"', async () => {
    invoke.mockImplementation(respostas({ ok: true, banco: 'Sicredi', lendo: true, contas: [] }));
    render(<Hospede clienteId={C} />);
    fireEvent.click(screen.getByTestId('t-lista'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conexao')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('openfinance-escolher-contas'));
    await waitFor(() => expect(screen.getByTestId('openfinance-sem-contas').textContent).toBe(FRASE_AINDA_LENDO));
    const listar = () => invoke.mock.calls.filter((c) => c[1]?.body?.acao === 'listar').length;
    const antes = listar();
    invoke.mockImplementation(respostas());
    fireEvent.click(screen.getByTestId('openfinance-ler-de-novo'));
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conta')).toHaveLength(2));
    expect(listar()).toBeGreaterThan(antes);
  });

  it('logo depois de conectar (onSuccess do Widget): Escolher contas do item novo COM a conta da linha marcada e sugerida, e o webhook registrado sozinho', async () => {
    const base = respostas();
    invoke.mockImplementation(async (n: string, o: Pedido) => (n === 'openfinance-conectar'
      ? { data: { ok: true, accessToken: 'tok', connectorIds: [601] }, error: null }
      : n === 'openfinance-webhook-registrar' ? { data: { ok: true, id: 'w1', ja_existia: true }, error: null } : base(n, o)));
    const init = vi.fn().mockResolvedValue(undefined);
    const { recebeu } = await comWidget(async () => {
      render(<Hospede clienteId={C} finais={['9823', '5982']} />);
      await conectarAgora();
      await waitFor(() => expect(init).toHaveBeenCalled());
    }, init);
    expect(invoke).not.toHaveBeenCalledWith('openfinance-webhook-registrar', expect.anything());   // só depois do sucesso
    recebeu[0].onSuccess({ item: { id: ITEM, connector: { name: 'Sicredi' } } });
    await waitFor(() => expect(screen.getAllByTestId('openfinance-conta')).toHaveLength(2));
    expect(invoke).toHaveBeenCalledWith('openfinance-contas', { body: { acao: 'listar', cliente_id: C, item_id: ITEM } });
    expect(screen.getAllByTestId('openfinance-conta-marcar').map((cb) => cb.getAttribute('data-state'))).toEqual(['checked', 'unchecked']);
    expect(screen.getAllByTestId('openfinance-lanca-em')[0].getAttribute('data-conta')).toBe('k-lavoura');
    expect(screen.getByTestId('openfinance-ver-previa')).toHaveProperty('disabled', false);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('openfinance-webhook-registrar', { body: {} }));
  });

  it('mexer na marcação depois da prévia apaga a prévia (nunca grava o que não foi conferido)', async () => {
    invoke.mockImplementation(respostas());
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
