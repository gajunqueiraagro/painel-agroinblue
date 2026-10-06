/**
 * ACESSOS-TELA-01 — a tela de Acessos, com as edge functions MOCKADAS (nenhuma chamada real: criar, redefinir e remover de
 * verdade sao do Gabriel). O que se prende: o que vai no corpo da chamada, onde a senha aparece (so' no campo e no corpo),
 * onde o erro e' escrito (ao lado do botao, nunca toast), o que a lista mostra e quem nao tem acoes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

interface Estado {
  cliente: { id: string; nome: string } | null;
  isAdmin: boolean;
  membros: Array<{ id: string; user_id: string; perfil: string }>;
  perfis: Array<{ user_id: string; nome: string | null; email: string | null }>;
  fazendaMembros: Array<{ user_id: string; fazenda_id: string }>;
  invoke: ReturnType<typeof vi.fn>;
  leituras: string[];
}
const estado = vi.hoisted((): Estado => ({
  cliente: { id: 'cli-1', nome: 'Cliente Teste' }, isAdmin: true, membros: [], perfis: [], fazendaMembros: [], invoke: vi.fn(), leituras: [],
}));

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: estado.cliente, isAdmin: estado.isAdmin }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f1', nome: 'Faz. Um' }, { id: 'f2', nome: 'Faz. Dois' }] }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-eu' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const dados = () => (nome === 'cliente_membros' ? estado.membros : nome === 'profiles' ? estado.perfis : estado.fazendaMembros);
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in']) q[m] = () => q;
    q.then = (ok: (v: { data: unknown; error: null }) => unknown) => { estado.leituras.push(nome); return Promise.resolve(ok({ data: dados(), error: null })); };
    return q;
  };
  return { supabase: { from: tabela, functions: { invoke: (...a: unknown[]) => estado.invoke(...a) } } };
});

/* jsdom não tem ResizeObserver; o Checkbox do Radix o usa para medir (o teste não mede layout). */
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

import { AcessosTab } from '@/pages/AcessosTab';
import {
  FRASE_CRIADO, FRASE_LOGIN_EXISTENTE, FRASE_SEM_CLIENTE, FRASE_SO_ADMIN_NA_TELA, MOTIVO_LINHA_ADMIN, MOTIVO_PERFIL_AGUARDA,
  PERFIL_INICIAL, PERFIS_DA_TELA, lerRespostaDaFuncao, pendenciasDoNovoAcesso,
} from '@/lib/acessos/acessosDaTela';

const SENHA = 'Segredo#9431';
const FONTE = readFileSync(resolve(process.cwd(), 'src/pages/AcessosTab.tsx'), 'utf8');
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

beforeEach(() => {
  estado.cliente = { id: 'cli-1', nome: 'Cliente Teste' };
  estado.isAdmin = true;
  estado.membros = [
    { id: 'm1', user_id: 'u-fin', perfil: 'financeiro' },
    { id: 'm2', user_id: 'u-adm', perfil: 'admin_agroinblue' },
    { id: 'm3', user_id: 'u-eu', perfil: 'gestor_cliente' },
  ];
  estado.perfis = [
    { user_id: 'u-fin', nome: 'Fulana Financeira', email: 'fulana@exemplo.com' },
    { user_id: 'u-adm', nome: 'Admin', email: 'admin@exemplo.com' },
    { user_id: 'u-eu', nome: 'Eu Mesmo', email: 'eu@exemplo.com' },
  ];
  estado.fazendaMembros = [{ user_id: 'u-fin', fazenda_id: 'f1' }];
  estado.invoke.mockReset();
  estado.leituras = [];
});

const montar = async () => { const r = render(<AcessosTab />); await waitFor(() => expect(estado.leituras.length).toBeGreaterThan(0)); return r; };
const linhas = () => screen.getAllByTestId('linha-membro');
const preencher = () => {
  fireEvent.change(screen.getByTestId('acesso-nome'), { target: { value: ' Novo Usuário ' } });
  fireEvent.change(screen.getByTestId('acesso-email'), { target: { value: ' novo@exemplo.com ' } });
  fireEvent.change(screen.getByTestId('acesso-senha'), { target: { value: SENHA } });
  fireEvent.click(within(screen.getByTestId('acesso-fazendas')).getAllByRole('checkbox')[0]);
};
const naoOk = (corpo: unknown, status = 400) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(corpo), { status }) } });

describe('o cabeçalho e a lista', () => {
  it('"Acessos de {cliente}", e a lista com E-mail · Nome · Perfil · Situação, uma linha por pessoa', async () => {
    await montar();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(screen.getByTestId('acessos-titulo').textContent).toBe('Acessos de Cliente Teste');
    const fin = linhas().find(l => l.getAttribute('data-user') === 'u-fin');
    expect([...(fin?.querySelectorAll('td') ?? [])].slice(0, 4).map(td => td.textContent)).toEqual(['fulana@exemplo.com', 'Fulana Financeira', 'Financeiro', 'Ativo']);
    expect(fin?.querySelectorAll('td')[1].getAttribute('title')).toContain('fazendas: Faz. Um');
    expect([...document.querySelectorAll('thead th')].map(th => th.textContent)).toEqual(['E-mail', 'Nome', 'Perfil', 'Situação', '']);
    expect(document.querySelector('table')?.className).toContain('table-fixed');
    expect(screen.getByTestId('acessos-rolagem').className).toContain('overflow-y-auto');
  });
  it('a linha do admin do AGROinBLUE não tem ações e diz por quê; a minha própria também não', async () => {
    await montar();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    const de = (u: string) => linhas().find(l => l.getAttribute('data-user') === u);
    expect(de('u-adm')?.textContent).toContain(MOTIVO_LINHA_ADMIN);
    expect(within(de('u-adm') ?? document.body).queryAllByRole('button')).toHaveLength(0);
    expect(within(de('u-eu') ?? document.body).queryAllByRole('button')).toHaveLength(0);
    expect(within(de('u-fin') ?? document.body).getAllByRole('button')).toHaveLength(2);
  });
  it('sem cliente escolhido: título neutro, formulário parado com o motivo, e nada é lido', async () => {
    estado.cliente = null;
    render(<AcessosTab />);
    expect(screen.getByTestId('acessos-titulo').textContent).toBe('Acessos');
    expect(screen.getByTestId('acesso-recado').textContent).toBe(FRASE_SEM_CLIENTE);
    expect(screen.getByTestId('acesso-criar').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('acesso-nome').hasAttribute('disabled')).toBe(true);
    expect(estado.leituras).toEqual([]);
  });
  it('quem não é admin (a tela montada por outro caminho): formulário parado e nenhuma linha com ações', async () => {
    estado.isAdmin = false;
    await montar();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(screen.getByTestId('acesso-recado').textContent).toBe(FRASE_SO_ADMIN_NA_TELA);
    expect(screen.getByTestId('acesso-criar').hasAttribute('disabled')).toBe(true);
    expect(within(screen.getByTestId('acessos-rolagem')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('os perfis do piloto', () => {
  it('só Gestor do Cliente e Financeiro se criam; Campo e Leitura ficam na lista, apagados, com o motivo; admin não existe', () => {
    expect(PERFIS_DA_TELA.map(p => [p.valor, p.motivo])).toEqual([
      ['gestor_cliente', null], ['financeiro', null], ['campo', MOTIVO_PERFIL_AGUARDA], ['leitura', MOTIVO_PERFIL_AGUARDA],
    ]);
    expect(MOTIVO_PERFIL_AGUARDA).toBe('aguarda a trava de gravação no banco');
    expect(PERFIS_DA_TELA.some(p => p.valor === 'admin_agroinblue')).toBe(false);
    /* a tela desenha a lista do dono: o item sem vez vem `disabled`, com o motivo escrito no proprio item */
    const s = semComentario(FONTE);
    expect(s).toContain('PERFIS_DA_TELA.map(p => (');
    expect(s).toContain('disabled={p.motivo != null}');
    expect(s).toContain('{p.motivo ? `${p.rotulo} · ${p.motivo}` : p.rotulo}');
  });
  it('o seletor nasce em Financeiro, e perfil apagado não passa na validação', async () => {
    expect(PERFIL_INICIAL).toBe('financeiro');
    await montar();
    expect(screen.getByTestId('acesso-perfil').textContent).toBe('Financeiro');
    const base = { nome: 'A', email: 'a@b.co', senha: '123456', fazendas: ['f1'] };
    expect(pendenciasDoNovoAcesso({ ...base, perfil: 'financeiro' })).toEqual({});
    expect(pendenciasDoNovoAcesso({ ...base, perfil: 'campo' }).perfil).toBeTruthy();
    expect(pendenciasDoNovoAcesso({ ...base, perfil: 'admin_agroinblue' }).perfil).toBeTruthy();
  });
});

describe('criar', () => {
  it('com pendência não chama a função: cada campo diz o que falta, embaixo dele', async () => {
    await montar();
    fireEvent.click(screen.getByTestId('acesso-criar'));
    expect(estado.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('erro-nome').textContent).toBe('Informe o nome.');
    expect(screen.getByTestId('erro-email').textContent).toBe('Informe um e-mail válido.');
    expect(screen.getByTestId('erro-senha').textContent).toBe('Mínimo de 6 caracteres.');
    expect(screen.getByTestId('erro-fazendas').textContent).toBe('Marque ao menos uma fazenda.');
  });
  it('os slots de mensagem existem antes de qualquer erro (a altura não muda)', async () => {
    await montar();
    for (const c of ['nome', 'email', 'senha', 'perfil', 'fazendas']) {
      expect(screen.getByTestId(`erro-${c}`).textContent).toBe('');
      expect(screen.getByTestId(`erro-${c}`).className).toContain('h-[12px]');
    }
    expect(screen.getByTestId('acesso-recado').textContent).toBe('');
  });
  it('o corpo da chamada: e-mail, nome, perfil, cliente e fazendas — e a senha SÓ ali', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true, user_id: 'u-novo', login_existente: false }, error: null });
    await montar();
    preencher();
    fireEvent.click(screen.getByTestId('acesso-criar'));
    await waitFor(() => expect(estado.invoke).toHaveBeenCalledTimes(1));
    expect(estado.invoke).toHaveBeenCalledWith('criar-usuario', {
      body: { email: 'novo@exemplo.com', senha: SENHA, nome: 'Novo Usuário', cliente_id: 'cli-1', perfil: 'financeiro', fazenda_ids: ['f1'] },
    });
  });
  it('sucesso: a frase combinada ao lado do botão, a linha nova na lista sem F5, e a senha some da tela', async () => {
    estado.invoke.mockImplementation(async () => {
      estado.membros = [...estado.membros, { id: 'm9', user_id: 'u-novo', perfil: 'financeiro' }];
      estado.perfis = [...estado.perfis, { user_id: 'u-novo', nome: 'Novo Usuário', email: 'novo@exemplo.com' }];
      return { data: { success: true, user_id: 'u-novo', login_existente: false }, error: null };
    });
    await montar();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    preencher();
    fireEvent.click(screen.getByTestId('acesso-criar'));
    await waitFor(() => expect(screen.getByTestId('acesso-recado').textContent).toBe(FRASE_CRIADO));
    await waitFor(() => expect(linhas()).toHaveLength(4));
    expect(linhas().some(l => l.textContent?.includes('novo@exemplo.com'))).toBe(true);
    expect(FRASE_CRIADO).toBe('Usuário criado. Passe o e-mail e a senha provisória à pessoa por canais separados.');
    /* a senha nao esta' em lugar nenhum do DOM: nem em texto, nem em valor de campo, nem em atributo */
    expect(document.body.innerHTML).not.toContain(SENHA);
    expect([...document.querySelectorAll('input')].some(i => i.value === SENHA)).toBe(false);
  });
  it('e-mail que já tinha login: a tela diz que a senha dele NÃO mudou', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true, user_id: 'u-x', login_existente: true }, error: null });
    await montar();
    preencher();
    fireEvent.click(screen.getByTestId('acesso-criar'));
    await waitFor(() => expect(screen.getByTestId('acesso-recado').textContent).toBe(FRASE_LOGIN_EXISTENTE));
    expect(FRASE_LOGIN_EXISTENTE).toBe('Este e-mail já tinha login: o acesso ao cliente foi criado e a senha dele NÃO mudou.');
  });
  it('erro do banco (resposta não-2xx): a frase DELE, com a etapa, ao lado do botão, em vermelho — e o digitado fica', async () => {
    estado.invoke.mockResolvedValue(naoOk({ error: 'Erro ao vincular ao cliente: xyz — o login foi criado e ficou SEM acesso a este cliente.', etapa: 'vinculo_cliente' }));
    await montar();
    preencher();
    fireEvent.click(screen.getByTestId('acesso-criar'));
    await waitFor(() => expect(screen.getByTestId('acesso-recado').textContent).toContain('ficou SEM acesso a este cliente'));
    const recado = screen.getByTestId('acesso-recado');
    expect(recado.textContent).toContain('(etapa: vínculo com o cliente)');
    expect(recado.className).toContain('text-destructive');
    expect(screen.getByTestId('acessos-form').contains(recado)).toBe(true);
    expect(recado.parentElement?.contains(screen.getByTestId('acesso-criar'))).toBe(true);
    expect(screen.getByTestId('acesso-nome')).toHaveProperty('value', ' Novo Usuário ');
    expect(screen.getByTestId('acesso-senha')).toHaveProperty('value', SENHA);
  });
  it('a frase de "só admin" da função chega inteira, sem etapa pendurada', async () => {
    const r = await lerRespostaDaFuncao(naoOk({ error: 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.', etapa: 'permissao' }, 403), 'genérica');
    expect(r).toEqual({ ok: false, frase: 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.' });
    expect(await lerRespostaDaFuncao({ data: null, error: { message: 'Failed to fetch' } }, 'genérica')).toEqual({ ok: false, frase: 'Failed to fetch' });
    expect(await lerRespostaDaFuncao({ data: null, error: {} }, 'genérica')).toEqual({ ok: false, frase: 'genérica' });
    expect(await lerRespostaDaFuncao({ data: { error: 'no corpo 200' }, error: null }, 'g')).toEqual({ ok: false, frase: 'no corpo 200' });
  });
});

describe('a senha', () => {
  it('o campo é `type="password"` e só vira texto no "mostrar"', async () => {
    await montar();
    const campo = screen.getByTestId('acesso-senha');
    expect(campo.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'mostrar a senha' }));
    expect(campo.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'ocultar a senha' }));
    expect(campo.getAttribute('type')).toBe('password');
  });
  it('a fonte: sem toast, sem `confirm(`, sem console, sem senha em URL, e nenhum campo de senha em `type="text"` fixo', () => {
    const s = semComentario(FONTE);
    expect(s.length).toBeGreaterThan(5000);
    expect(s).not.toMatch(/\btoast\b|sonner/);
    expect(s).not.toMatch(/\bconfirm\(|\balert\(/);
    expect(s).not.toMatch(/console\./);
    expect(s).not.toMatch(/navigate\(|location\.|searchParams/);
    expect(s).not.toMatch(/<select\b|type="date"/);
    expect(s.match(/type=\{visivel \? 'text' : 'password'\}/g)).toHaveLength(1);
    expect(s).not.toMatch(/type="text"/);
  });
});

describe('redefinir e remover', () => {
  const abrir = async (rotulo: RegExp) => {
    await montar();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: rotulo }));
  };
  it('redefinir abre um diálogo de tamanho fixo; a senha vai só no corpo; o erro fica ao lado do botão', async () => {
    estado.invoke.mockResolvedValue(naoOk({ error: 'Administrador do AGROinBLUE não é gerenciado por esta tela.', etapa: 'alvo' }, 403));
    await abrir(/redefinir a senha de Fulana Financeira/);
    const dlg = screen.getByTestId('dialogo-senha');
    expect(dlg.className).toContain('h-[176px]');
    expect(dlg.className).toContain('w-[380px]');
    expect(screen.getByTestId('senha-nova').getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByTestId('senha-confirmar'));
    expect(estado.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('senha-erro').textContent).toBe('Mínimo de 6 caracteres.');
    fireEvent.change(screen.getByTestId('senha-nova'), { target: { value: SENHA } });
    fireEvent.click(screen.getByTestId('senha-confirmar'));
    await waitFor(() => expect(estado.invoke).toHaveBeenCalledWith('redefinir-senha', { body: { user_id: 'u-fin', nova_senha: SENHA } }));
    await waitFor(() => expect(screen.getByTestId('senha-erro').textContent).toBe('Administrador do AGROinBLUE não é gerenciado por esta tela.'));
    expect(screen.getByTestId('dialogo-senha')).toBeTruthy();
  });
  it('redefinida: o diálogo fecha, o recado vai para a lista e a senha não fica na tela', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await abrir(/redefinir a senha de Fulana Financeira/);
    fireEvent.change(screen.getByTestId('senha-nova'), { target: { value: SENHA } });
    fireEvent.click(screen.getByTestId('senha-confirmar'));
    await waitFor(() => expect(screen.queryByTestId('dialogo-senha')).toBeNull());
    expect(screen.getByTestId('acessos-recado-lista').textContent).toContain('Senha de Fulana Financeira redefinida');
    expect(document.body.innerHTML).not.toContain(SENHA);
  });
  it('remover pede confirmação no padrão da casa, dizendo QUEM e DE QUAL CLIENTE; só o confirmar chama a função', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await abrir(/remover o acesso de Fulana Financeira/);
    const dlg = screen.getByTestId('dialogo-remover');
    expect(dlg.textContent).toContain('Fulana Financeira (fulana@exemplo.com)');
    expect(dlg.textContent).toContain('Cliente Teste');
    expect(estado.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('remover-confirmar'));
    await waitFor(() => expect(estado.invoke).toHaveBeenCalledWith('remover-membro', { body: { membro_id: 'm1' } }));
    await waitFor(() => expect(screen.queryByTestId('dialogo-remover')).toBeNull());
    expect(screen.getByTestId('acessos-recado-lista').textContent).toBe('Acesso de Fulana Financeira removido.');
  });
  it('remover recusado: o diálogo fica aberto com a frase do banco', async () => {
    estado.invoke.mockResolvedValue(naoOk({ error: 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.', etapa: 'permissao' }, 403));
    await abrir(/remover o acesso de Fulana Financeira/);
    fireEvent.click(screen.getByTestId('remover-confirmar'));
    await waitFor(() => expect(screen.getByTestId('remover-erro').textContent).toBe('Só o administrador do AGROinBLUE gerencia acessos por enquanto.'));
    expect(screen.getByTestId('dialogo-remover')).toBeTruthy();
  });
});
