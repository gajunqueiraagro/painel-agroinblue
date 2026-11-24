/**
 * FOLHA-01 · PR B (telas) — a tela com a API INJETADA (a mesma porta da bancada, `scripts/ui-cortes/dados/folha.ts`, SINTÉTICO):
 *   T1 D5: sem a marca 'folha' (`folha_ok` falso) a tela diz por quê, não lê nada e não mostra as abas; o item some do menu
 *   T2 Funcionários: os 4 filtros com a contagem do banco; a busca; "a confirmar" em âmbar na ficha; a ficha tem 340px sempre (vazia = a frase)
 *   T3 o cadastro: Salvar com o nome vazio não vai ao banco (campo vermelho + rodapé); salvar faz a PRÉVIA e depois grava, com o
 *      `recorrencia_origem_id` que veio
 *   T4 Histórico: filtro por tipo pelo `tipo` do banco; "Pago a" em destaque quando é outro favorecido; o rodapé soma o que está na tela
 *   T5 Pendências: "É o mesmo · ligar" pede a PRÉVIA (simular) e só "Confirmar" grava; "Não é" exige o motivo e descarta
 *   T6 o Editar lançamento: sem a folha, nada de "Funcionário"; com ela, "ligar a um funcionário…"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastErro(...a), warning: vi.fn() } }));

import { FolhaTela } from './FolhaTela';
import { FuncionarioDoLancamento } from './FuncionarioDoLancamento';
import { FolhaApiProvider } from '@/hooks/useFolha';
import { secoesVisiveis } from '@/v2/lib/acessoTelas';
import { NAV_GRUPOS } from '@/v2/lib/navGrupos';
import { apiDaFolha, FAZENDAS_DA_FOLHA } from '../../../scripts/ui-cortes/dados/folha';
import type { FolhaApi } from '@/lib/folha/folhaApi';

const g = globalThis as unknown as { __fazendaBancada?: unknown };
g.__fazendaBancada = { fazendas: FAZENDAS_DA_FOLHA, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };

function montar(api: FolhaApi, filho: ReactNode = <FolhaTela />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><FolhaApiProvider api={api}>{filho}</FolhaApiProvider></QueryClientProvider></MemoryRouter>);
}
const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome });
/** a linha pelo nome EXATO (a lista vem ordenada por nome; a busca acha mais de um) */
async function abrirFicha(nome: string) {
  await screen.findAllByTestId('folha-linha');
  fireEvent.click(within(screen.getByTestId('folha-filtros')).getByText('Todos'));
  fireEvent.change(screen.getByTestId('folha-busca'), { target: { value: nome } });
  const tr = screen.getAllByTestId('folha-linha').find(l => l.querySelector('[data-testid="folha-nome"]')?.textContent === nome);
  if (!tr) throw new Error(`sem a linha ${nome}`);
  fireEvent.click(tr);
}

beforeEach(() => { toastErro.mockReset(); });
afterEach(() => cleanup());

describe('T1 D5: quem não tem a folha', () => {
  it('a tela diz que não está liberada e não mostra as abas nem lê a lista', async () => {
    const api = apiDaFolha('nj', { folhaOk: false });
    const lista = vi.spyOn(api, 'lista');
    montar(api);
    expect(await screen.findByTestId('folha-sem-acesso')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(lista).not.toHaveBeenCalled();
  });
  it('o menu tira o item quando o banco diz que não (`ocultas`) e o mantém sem isso', () => {
    const fin = NAV_GRUPOS.find(x => x.id === 'financeiro');
    if (!fin) throw new Error('sem o grupo financeiro');
    const ids = (o?: ReadonlySet<'folha-pagamento'>) => secoesVisiveis('admin_agroinblue', true, fin, { ocultas: o }).flatMap(s => s.itens.map(i => i.id));
    expect(ids()).toContain('folha-pagamento');
    expect(ids(new Set(['folha-pagamento']))).not.toContain('folha-pagamento');
  });
});

describe('T2 a aba Funcionários', () => {
  it('os filtros com a contagem do banco; a busca; a ficha de 340px sempre presente', async () => {
    montar(apiDaFolha('nj'));
    await screen.findAllByTestId('folha-linha');
    const filtros = screen.getByTestId('folha-filtros');
    expect(within(filtros).getByText('Ativos').parentElement?.textContent).toContain('27');
    expect(screen.getAllByTestId('folha-linha')).toHaveLength(27);
    fireEvent.click(within(filtros).getByText('Desligados'));
    expect(screen.getAllByTestId('folha-linha')).toHaveLength(62);
    fireEvent.click(within(filtros).getByText('Todos'));
    fireEvent.change(screen.getByTestId('folha-busca'), { target: { value: 'maria aparecida' } });
    expect(screen.getAllByTestId('folha-linha')).toHaveLength(1);
    /* a divisão não muda com a ficha aberta ou fechada */
    expect(screen.getByTestId('folha-divisao').style.gridTemplateColumns).toBe('minmax(0,1fr) 340px');
    expect(screen.getByTestId('folha-ficha-vazia')).toBeTruthy();
  });
  it('a ficha: "a confirmar" em âmbar (nunca vazio nem zero), Pix do fornecedor só leitura, os documentos com o aviso', async () => {
    montar(apiDaFolha('nj'));
    await abrirFicha('Bruno Simulado Costa');
    const sal = await screen.findByTestId('folha-ficha-salario');
    expect(sal.textContent).toBe('a confirmar');
    expect(sal.className).toContain('text-amber-700');
    expect(screen.getByText('Pix, banco e contato se editam no cadastro do fornecedor.')).toBeTruthy();
  });
  it('os documentos da ficha: vencido em vermelho, a vencer em âmbar', async () => {
    montar(apiDaFolha('nj'));
    await abrirFicha('Antônio Exemplo Prado');
    fireEvent.click(await screen.findByText('Documentos'));
    const vencs = await screen.findAllByTestId('folha-documento-vencimento');
    const aso = vencs.find(v => v.textContent?.startsWith('10/11/2026'));
    const contrato = vencs.find(v => v.textContent?.startsWith('01/12/2026'));
    expect(aso?.className).toContain('text-red-700');
    expect(contrato?.className).toContain('text-amber-700');
    expect(screen.getByTestId('folha-documentos-aviso').textContent).toContain('ASO vencido há 11 dias');
  });
});

describe('T3 o cadastro', () => {
  it('sem o nome, nada vai ao banco: o campo fica vermelho e a frase no rodapé', async () => {
    const api = apiDaFolha('vera');
    montar(api);
    await screen.findAllByTestId('folha-linha');
    fireEvent.click(screen.getByTestId('folha-novo'));
    fireEvent.click(await screen.findByTestId('funcionario-salvar'));
    expect(screen.getByTestId('funcionario-rodape').textContent).toBe('Informe o nome.');
    expect(screen.getByTestId('funcionario-nome').className).toContain('border-destructive');
    expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')).toHaveLength(0);
    expect(toastErro).not.toHaveBeenCalled();
  });
  it('editar: a prévia primeiro (simular), depois grava — com o recorrencia_origem_id que veio', async () => {
    const api = apiDaFolha('nj');
    montar(api);
    await abrirFicha('Antônio Exemplo Prado');
    fireEvent.click(await screen.findByTestId('folha-ficha-editar'));
    await waitFor(() => expect((screen.getByTestId('funcionario-nome') as HTMLInputElement).value).toContain('Antônio'));
    fireEvent.click(screen.getByTestId('funcionario-salvar'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')).toHaveLength(2));
    const [previa, gravar] = api.chamadas.filter(c => c.fn === 'gravarFuncionario');
    expect(previa.args[2]).toBe(true);
    expect(gravar.args[2]).toBe(false);
    expect(gravar.args[1]).toMatchObject({ id: 'f00', recorrencia_origem_id: 'rec-bancada' });
  });
});

describe('T4 o Histórico', () => {
  it('filtra pelo tipo do banco; "Pago a" em destaque; o rodapé conta o que está na tela', async () => {
    montar(apiDaFolha('vera'));
    await abrirFicha('Antônio Exemplo Prado');
    fireEvent.click(aba(/Histórico/));
    const linhas = await screen.findAllByTestId('folha-historico-linha');
    expect(linhas).toHaveLength(60);
    expect(screen.getByTestId('folha-historico-rodape').textContent).toContain('60 pagamentos ligados');
    const destaque = screen.getAllByTestId('folha-historico-pago-a').filter(td => td.className.includes('text-amber-800'));
    expect(destaque.length).toBeGreaterThan(0);
    expect(destaque.every(td => /Contabilidade|Caixa/.test(td.textContent ?? ''))).toBe(true);
    fireEvent.click(within(screen.getByTestId('folha-historico-faixa')).getByText('Rescisão'));
    const resc = screen.getAllByTestId('folha-historico-linha');
    expect(resc.length).toBeLessThan(60);
    expect(resc.every(tr => tr instanceof HTMLTableRowElement && /Rescisão|Multa rescisória/.test(tr.cells[2]?.textContent ?? ''))).toBe(true);
  });
});

describe('T5 as Pendências', () => {
  it('"É o mesmo · ligar": a prévia (simular) mostra a frase e só "Confirmar" grava', async () => {
    const api = apiDaFolha('nj');
    montar(api);
    fireEvent.click(await screen.findByRole('tab', { name: /Pendências · 157/ }));
    const [primeiro] = await screen.findAllByTestId('folha-pendencia-ligar_sugestao');
    fireEvent.click(primeiro);
    fireEvent.click(await screen.findByTestId('resolver-confirmar'));
    await waitFor(() => expect(screen.getByTestId('resolver-previa').textContent).toMatch(/^Liga \d+ lançamentos? a /));
    expect(api.chamadas.filter(c => c.fn === 'ligar').map(c => c.args[3])).toEqual([true]);
    fireEvent.click(screen.getByTestId('resolver-confirmar'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'ligar').map(c => c.args[3])).toEqual([true, false]));
  });
  it('"Não é": sem motivo não vai ao banco; com motivo, descarta pela chave', async () => {
    const api = apiDaFolha('vera');
    montar(api);
    fireEvent.click(await screen.findByRole('tab', { name: /Pendências · 28/ }));
    const [naoE] = await screen.findAllByTestId('folha-pendencia-descartar');
    fireEvent.click(naoE);
    fireEvent.click(await screen.findByTestId('resolver-confirmar'));
    expect(screen.getByTestId('resolver-erro').textContent).toBe('Diga por que não é pendência.');
    expect(api.chamadas.filter(c => c.fn === 'descartar')).toHaveLength(0);
    fireEvent.change(screen.getByTestId('resolver-motivo'), { target: { value: 'é o titular' } });
    fireEvent.click(screen.getByTestId('resolver-confirmar'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'descartar')).toHaveLength(1));
    expect(api.chamadas.find(c => c.fn === 'descartar')?.args).toEqual(['cli', 'fav:00000000-0000-0000-0000-000000000000', 'é o titular', false]);
  });
});

describe('T6 o Editar lançamento', () => {
  it('sem a folha, nada; com ela, "ligar a um funcionário…" ou o nome com ↗', async () => {
    const { unmount } = montar(apiDaFolha('nj', { folhaOk: false }), <FuncionarioDoLancamento lancamentoId="lanc-x" clienteId="cli" />);
    await waitFor(() => expect(screen.queryByTestId('lanc-funcionario')).toBeNull());
    unmount();
    montar(apiDaFolha('nj'), <><FuncionarioDoLancamento lancamentoId="lanc-x" clienteId="cli" /></>);
    expect(await screen.findByTestId('lanc-funcionario-ligar')).toBeTruthy();
    cleanup();
    montar(apiDaFolha('nj'), <FuncionarioDoLancamento lancamentoId="lanc-ligado" clienteId="cli" />);
    expect((await screen.findByTestId('lanc-funcionario-abrir')).textContent).toContain('Antônio');
  });
});
