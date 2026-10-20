/**
 * ACESSOS-PERFIL-01 — o nome e o e-mail de todo usuario numa fonte so' (`fn_nomes_dos_autores`), o "Editar acesso" e os nomes
 * na Auditoria do lancamento. Banco e edge functions MOCKADOS; dados SINTETICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

interface Estado {
  membros: Array<{ id: string; user_id: string; perfil: string }>;
  nomes: Array<{ user_id: string; nome: string; email: string | null; situacao: string }>;
  fazendaMembros: Array<{ user_id: string; fazenda_id: string }>;
  audit: Array<Record<string, unknown>>;
  semVia: boolean;
  rpcs: Array<[string, unknown]>;
  tabelas: string[];
  invoke: ReturnType<typeof vi.fn>;
}
const estado = vi.hoisted((): Estado => ({ membros: [], nomes: [], fazendaMembros: [], audit: [], semVia: false, rpcs: [], tabelas: [], invoke: vi.fn() }));

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1', nome: 'Cliente Teste' }, isAdmin: true }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'f1', nome: 'Faz. Um' }, { id: 'f2', nome: 'Faz. Dois' }] }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-eu' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    estado.tabelas.push(nome);
    let colunas = '';
    const q: Record<string, unknown> = {};
    q.select = (c: string) => { colunas = c; return q; };
    for (const m of ['eq', 'in', 'order']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown) => {
      if (nome === 'audit_log' && estado.semVia && colunas.includes('via')) {
        return Promise.resolve(ok({ data: null, error: { code: '42703', message: 'column audit_log.via does not exist' } }));
      }
      const dados = nome === 'cliente_membros' ? estado.membros : nome === 'fazenda_membros' ? estado.fazendaMembros
        : nome === 'audit_log' ? estado.audit : [];
      return Promise.resolve(ok({ data: dados, error: null }));
    };
    return q;
  };
  const rpc = (fn: string, a: unknown) => {
    estado.rpcs.push([fn, a]);
    const ids = (a as { p_ids?: string[] | null })?.p_ids ?? null;
    const data = fn === 'fn_nomes_dos_autores' ? estado.nomes.filter(n => ids == null || ids.includes(n.user_id)) : null;
    return Promise.resolve({ data, error: null });
  };
  return { supabase: { from: tabela, rpc, functions: { invoke: (...x: unknown[]) => estado.invoke(...x) } } };
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AcessosTab } from '@/pages/AcessosTab';
import { AbaAuditoriaLancamento } from '@/components/financeiro-v2/AbaAuditoriaLancamento';
import { autorNaTrilha, lerNomesDosAutores, mapaDosNomes, FRASE_SEM_AUTOR } from '@/lib/acessos/nomesDosAutores';
import { fraseDoLoginNovo } from '@/lib/acessos/acessosDaTela';

beforeEach(() => {
  estado.membros = [{ id: 'm1', user_id: 'u-fin', perfil: 'financeiro' }, { id: 'm9', user_id: 'u-sem', perfil: 'campo' }];
  /* a Financeira nao tinha perfil: o nome e o e-mail vem do banco (perfil criado pelo backfill / login) */
  estado.nomes = [
    { user_id: 'u-fin', nome: 'Fulana Financeira', email: 'fulana@exemplo.com', situacao: 'membro ativo' },
    { user_id: 'u-sem', nome: 'usuário removido (u-sem)', email: null, situacao: 'removido' },
    { user_id: 'u-outro', nome: 'Beltrano Gestor', email: 'beltrano@exemplo.com', situacao: 'ex-membro' },
  ];
  estado.fazendaMembros = [{ user_id: 'u-fin', fazenda_id: 'f1' }];
  estado.audit = [];
  estado.semVia = false;
  estado.rpcs = [];
  estado.tabelas = [];
  estado.invoke.mockReset();
});

const linhaDe = async (u: string) => {
  await waitFor(() => expect(screen.getAllByTestId('linha-membro').length).toBeGreaterThan(0));
  const l = screen.getAllByTestId('linha-membro').find(x => x.getAttribute('data-user') === u);
  if (!l) throw new Error(`sem linha ${u}`);
  return l;
};

describe('a lista de Acessos lê o nome e o e-mail da fonte única', () => {
  it('nome e e-mail vêm de fn_nomes_dos_autores (todos os membros do cliente); nunca "—" para quem tem login', async () => {
    render(<AcessosTab />);
    const fin = await linhaDe('u-fin');
    expect(within(fin).getByTestId('membro-email').textContent).toBe('fulana@exemplo.com');
    expect(within(fin).getByTestId('membro-nome').textContent).toBe('Fulana Financeira');
    expect(estado.rpcs).toContainEqual(['fn_nomes_dos_autores', { p_cliente_id: 'cli-1', p_ids: null }]);
    expect(estado.tabelas).not.toContain('profiles');
    /* sem login: diz que nao tem, e o nome e' o "usuário removido" do banco */
    const sem = await linhaDe('u-sem');
    expect(within(sem).getByTestId('membro-email').textContent).toBe('sem login');
    expect(within(sem).getByTestId('membro-nome').textContent).toBe('usuário removido (u-sem)');
  });

  it('nada corta: as células da lista não têm reticências nem `truncate`, e o texto é 11px', async () => {
    render(<AcessosTab />);
    const fin = await linhaDe('u-fin');
    for (const td of fin.querySelectorAll('td')) {
      expect(td.className).not.toMatch(/truncate|text-ellipsis/);
      expect(td.className).toContain('text-[11px]');
    }
  });
});

describe('Editar acesso', () => {
  it('o lápis abre o MESMO painel, preenchido: nome, e-mail, perfil e fazendas; a senha fica na chave', async () => {
    render(<AcessosTab />);
    fireEvent.click(within(await linhaDe('u-fin')).getByTestId('editar-membro'));
    expect(screen.getByTestId('acessos-form-titulo').textContent).toBe('Editar acesso');
    expect((screen.getByTestId('acesso-nome') as HTMLInputElement).value).toBe('Fulana Financeira');
    expect((screen.getByTestId('acesso-email') as HTMLInputElement).value).toBe('fulana@exemplo.com');
    expect(screen.getByTestId('acesso-perfil').textContent).toBe('Financeiro');
    const caixas = within(screen.getByTestId('acesso-fazendas')).getAllByRole('checkbox');
    expect(caixas.map(c => c.getAttribute('data-state'))).toEqual(['checked', 'unchecked']);
    expect(screen.queryByTestId('acesso-senha')).toBeNull();
    expect(screen.getByTestId('acesso-senha-na-chave').textContent).toContain('chave da linha');
    expect(screen.getByTestId('acesso-salvar').textContent).toBe('Salvar alterações');
  });

  it('salva pela editar-membro com o que está no painel; a lista relê e o painel volta a "Novo acesso"', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true }, error: null });
    render(<AcessosTab />);
    fireEvent.click(within(await linhaDe('u-fin')).getByTestId('editar-membro'));
    fireEvent.change(screen.getByTestId('acesso-nome'), { target: { value: ' Fulana de Tal ' } });
    fireEvent.click(within(screen.getByTestId('acesso-fazendas')).getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByTestId('acesso-salvar'));
    await waitFor(() => expect(estado.invoke).toHaveBeenCalledTimes(1));
    expect(estado.invoke).toHaveBeenCalledWith('editar-membro', { body: {
      membro_id: 'm1', nome: 'Fulana de Tal', email: 'fulana@exemplo.com', perfil: 'financeiro', fazenda_ids: ['f1', 'f2'] } });
    await waitFor(() => expect(screen.getByTestId('acessos-form-titulo').textContent).toBe('Novo acesso'));
    expect(screen.getByTestId('acesso-recado').textContent).toBe('Acesso atualizado.');
  });

  it('trocar o e-mail troca o login: o primeiro clique escreve "o login passa a ser X" e só o segundo grava', async () => {
    estado.invoke.mockResolvedValue({ data: { success: true, login_alterado: true }, error: null });
    render(<AcessosTab />);
    fireEvent.click(within(await linhaDe('u-fin')).getByTestId('editar-membro'));
    fireEvent.change(screen.getByTestId('acesso-email'), { target: { value: 'Nova@Exemplo.com' } });
    fireEvent.click(screen.getByTestId('acesso-salvar'));
    expect(estado.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('acesso-recado').textContent).toBe(fraseDoLoginNovo('Nova@Exemplo.com'));
    expect(screen.getByTestId('acesso-salvar').textContent).toBe('Confirmar e salvar');
    fireEvent.click(screen.getByTestId('acesso-salvar'));
    await waitFor(() => expect(estado.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('acesso-recado').textContent).toBe('Acesso atualizado. O login agora é nova@exemplo.com.'));
  });

  it('a recusa da função fica escrita ao lado do botão, com a etapa; o painel continua aberto', async () => {
    estado.invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: 'Este e-mail já é login de outra pessoa.', etapa: 'login' }), { status: 409 }) } });
    render(<AcessosTab />);
    fireEvent.click(within(await linhaDe('u-fin')).getByTestId('editar-membro'));
    fireEvent.change(screen.getByTestId('acesso-email'), { target: { value: 'outra@exemplo.com' } });
    fireEvent.click(screen.getByTestId('acesso-salvar'));
    fireEvent.click(screen.getByTestId('acesso-salvar'));
    await waitFor(() => expect(screen.getByTestId('acesso-recado').textContent).toBe('Este e-mail já é login de outra pessoa. (etapa: login)'));
    expect(screen.getByTestId('acessos-form-titulo').textContent).toBe('Editar acesso');
  });
});

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const montarAuditoria = () => render(
  <QueryClientProvider client={qc()}>
    <AbaAuditoriaLancamento lancamentoId="lanc-1" criadoPor="u-outro" criadoEm="2026-10-01T12:00:00Z" descricao="Sal" catalogos={{}} />
  </QueryClientProvider>);
const evento = (id: string, usuario: string | null, via?: string | null) => ({
  id, acao: 'editou', usuario_id: usuario, created_at: `2026-10-0${id.length}T13:00:00Z`, dados_anteriores: { valor: 1 }, dados_novos: { valor: 2 }, via });

describe('a aba Auditoria do lançamento', () => {
  it('mostra o nome de OUTRO membro (da fonte única) e "sem autor registrado" no evento antigo sem autor', async () => {
    estado.audit = [evento('a1', 'u-fin'), evento('a22', null)];
    montarAuditoria();
    await waitFor(() => expect(screen.getAllByTestId('trilha-autor').length).toBe(3));
    const autores = screen.getAllByTestId('trilha-autor').map(x => x.textContent);
    expect(autores).toContain('Fulana');
    expect(autores).toContain(FRASE_SEM_AUTOR);
    expect(autores).toContain('Beltrano');
    expect(autores).not.toContain('sistema');
    const pedido = estado.rpcs.find(([fn]) => fn === 'fn_nomes_dos_autores');
    const args = pedido?.[1] as { p_cliente_id: string; p_ids: string[] };
    expect(args.p_cliente_id).toBe('cli-1');
    expect([...args.p_ids].sort()).toEqual(['u-fin', 'u-outro']);
  });

  it('com a coluna `via`: o evento sem autor diz "sistema · <via>"', async () => {
    estado.audit = [evento('a1', 'u-fin'), evento('a22', null, 'sistema:fn_recorrencia_gerar')];
    montarAuditoria();
    await waitFor(() => expect(screen.getAllByTestId('trilha-autor').map(x => x.textContent)).toContain('sistema · fn_recorrencia_gerar'));
  });

  it('sem a coluna `via` no banco ainda: lê de novo sem ela, e o evento sem autor diz "sem autor registrado"', async () => {
    estado.semVia = true;
    estado.audit = [evento('a1', 'u-fin'), evento('a22', null)];
    montarAuditoria();
    await waitFor(() => expect(screen.getAllByTestId('trilha-autor').map(x => x.textContent)).toContain(FRASE_SEM_AUTOR));
    expect(estado.tabelas.filter(t => t === 'audit_log')).toHaveLength(2);
  });
});

describe('o leitor dos nomes', () => {
  it('peça torta invalida a leitura inteira; o autor nulo nunca vira "sistema" sem a via', () => {
    expect(lerNomesDosAutores([{ user_id: 'a', nome: 'X', email: null, situacao: 'membro ativo' }])).toHaveLength(1);
    expect(lerNomesDosAutores([{ user_id: 'a', nome: 'X', email: null, situacao: 'qualquer' }])).toBeNull();
    expect(lerNomesDosAutores({})).toBeNull();
    const m = mapaDosNomes([{ userId: 'a', nome: 'Ana Maria', email: null, situacao: 'membro ativo' },
      { userId: 'r', nome: 'usuário removido (r)', email: null, situacao: 'removido' }]);
    expect(autorNaTrilha('a', m)).toBe('Ana');
    expect(autorNaTrilha('r', m)).toBe('usuário removido (r)');
    expect(autorNaTrilha('z', m)).toBeNull();
    expect(autorNaTrilha(null, m)).toBe(FRASE_SEM_AUTOR);
    expect(autorNaTrilha(null, m, 'sistema')).toBe('sistema');
    expect(autorNaTrilha(null, m, 'sistema:fn_x')).toBe('sistema · fn_x');
  });
});
