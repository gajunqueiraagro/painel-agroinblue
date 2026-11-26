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
import { apiDaFolha, FAZENDAS_DA_FOLHA, fichaCadastroDaFolha } from '../../../scripts/ui-cortes/dados/folha';
import { FichaCadastroApiProvider } from '@/hooks/useFichaCadastro';
import type { FichaCadastroApi } from '@/lib/folha/fichaCadastroApi';
import type { FolhaApi } from '@/lib/folha/folhaApi';

const g = globalThis as unknown as { __fazendaBancada?: unknown };
g.__fazendaBancada = { fazendas: FAZENDAS_DA_FOLHA, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };

function montar(api: FolhaApi, filho: ReactNode = <FolhaTela />, fichaApi: FichaCadastroApi = fichaCadastroDaFolha()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><FolhaApiProvider api={api}><FichaCadastroApiProvider api={fichaApi}>{filho}</FichaCadastroApiProvider></FolhaApiProvider></QueryClientProvider></MemoryRouter>);
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
    expect(screen.getByText('Pix, banco e contato se editam no Editar (aba Cadastro).')).toBeTruthy();
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

/* ── T7 FOLHA-ADMISSAO-01 (Gabriel 25/11 08:05): a admissão é a fonte da data da contratação ─────────────────────────────────────── */
import { FuncionarioDialog } from './FuncionarioDialog';
import { aAtualizarDe, atuacaoVigente, avisoDoDesde, desdeInicial } from '@/lib/folha/admissao';
import type { Ficha } from '@/lib/folha/folhaTela';

const at = (desde: string, fazenda_id: string, atividade: string, pct = 100) => ({ desde, fazenda_id, fazenda: fazenda_id, atividade, pct });
describe('T7a as regras (puras)', () => {
  it('a atuação vigente: as vigências iguais seguidas são uma ("vale desde" a primeira); só futuras = null', () => {
    expect(atuacaoVigente([at('2026-09-01', 'fA', 'pecuaria'), at('2022-05-07', 'fA', 'pecuaria')], '2026-11-25')?.desde).toBe('2022-05-07');
    expect(atuacaoVigente([at('2026-09-01', 'fA', 'agricultura'), at('2024-01-01', 'fA', 'agricultura'), at('2022-05-07', 'fA', 'pecuaria')], '2026-11-25')?.desde).toBe('2024-01-01');
    expect(atuacaoVigente([at('2027-02-01', 'fB', 'pecuaria'), at('2022-05-07', 'fA', 'pecuaria')], '2026-11-25')?.desde).toBe('2022-05-07');
    expect(atuacaoVigente([at('2027-02-01', 'fB', 'pecuaria')], '2026-11-25')).toBeNull();
    expect(atuacaoVigente([], '2026-11-25')).toBeNull();
  });
  it('o Desde: 1ª linha = admissão; linha nova vazia; sem admissão vazio — nunca hoje', () => {
    expect(desdeInicial(false, '2022-05-07')).toBe('2022-05-07');
    expect(desdeInicial(true, '2022-05-07')).toBe('');
    expect(desdeInicial(false, null)).toBe('');
  });
  it('antes da admissão = aviso; depois (ou futura) nada', () => {
    expect(avisoDoDesde('2020-01-01', '2022-05-07')).toBe('antes da admissão (07/05/2022)');
    expect(avisoDoDesde('2031-01-01', '2022-05-07')).toBeNull();
    expect(avisoDoDesde('2020-01-01', null)).toBeNull();
    expect(avisoDoDesde('', '2022-05-07')).toBeNull();
  });
  it('"a atualizar" some quando o dado existe', () => {
    expect(aAtualizarDe({ a_atualizar: ['salario', 'cpf', 'situacao'], cpf: null }, true)).toEqual(['cpf', 'situacao']);
    expect(aAtualizarDe({ a_atualizar: ['salario', 'cpf', 'admissao'], cpf: '00000000000', admissao: '2022-05-07' }, false)).toEqual(['salario']);
  });
});

/** o modal sozinho, com a ficha do funcionário trocada pelo caso */
function montarDialogo(funcionarioId: string, ajustar?: (f: Ficha) => Ficha, fichaApi: FichaCadastroApi = fichaCadastroDaFolha()) {
  const api = apiDaFolha('vera');
  const original = api.ficha.bind(api);
  api.ficha = async id => { const r = await original(id); return r.ok && ajustar ? { ok: true, dados: ajustar(r.dados) } : r; };
  montar(api, <FuncionarioDialog clienteId="cli" funcionarioId={funcionarioId} aoFechar={() => {}} aoCriar={() => {}} />, fichaApi);
  return api;
}
async function abaSalario() {
  await waitFor(() => expect((screen.getByTestId('funcionario-nome') as HTMLInputElement).value).not.toBe(''));
  fireEvent.click(within(screen.getByTestId('funcionario-dialog')).getByText('Salário e atuação'));
  await screen.findByTestId('funcionario-aba-salario');
}
function digitarData(testid: string, ddmmaaaa: string) {
  const i = screen.getByTestId(testid);
  fireEvent.change(i, { target: { value: ddmmaaaa } });
  fireEvent.blur(i);
}
function digitarSalario(v: string) {
  const i = within(screen.getByTestId('funcionario-aba-salario')).getAllByTestId('campo-moeda')[0]?.querySelector('input');
  if (!i) throw new Error('sem o campo do salário');
  fireEvent.change(i, { target: { value: v } });
  fireEvent.blur(i);
}
const valor = (testid: string) => (screen.getByTestId(testid) as HTMLInputElement).value;

describe('T7b o modal: a data da contratação', () => {
  it('COM admissão e histórico: os Desde começam vazios, a atuação diz "vale desde"; data ANTIGA grava como digitada (com o aviso) e o formulário limpa', async () => {
    const api = montarDialogo('f00');
    await abaSalario();
    expect(valor('funcionario-sal-desde')).toBe('');
    expect(valor('funcionario-atu-desde')).toBe('');
    expect(screen.getByTestId('funcionario-atuacao-vigente').textContent).toBe('vale desde 01/11/2025');
    digitarData('funcionario-sal-desde', '01/02/2019');
    expect(screen.getByTestId('funcionario-aviso-salario').textContent).toBe('antes da admissão (03/01/2021)');
    digitarSalario('3000');
    fireEvent.click(screen.getByTestId('funcionario-gravar-salario'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'gravarSalario')).toHaveLength(2));
    expect(api.chamadas.filter(c => c.fn === 'gravarSalario').map(c => [c.args[1], c.args[5]])).toEqual([['2019-02-01', true], ['2019-02-01', false]]);
    await waitFor(() => expect(valor('funcionario-sal-desde')).toBe(''));
    expect(screen.queryByTestId('funcionario-gravar-admissao')).toBeNull();
  });
  it('COM admissão e SEM linhas: a 1ª linha de salário e de atuação nasce na admissão', async () => {
    montarDialogo('f00', f => ({ ...f, salarios: [], atuacoes: [] }));
    await abaSalario();
    expect(valor('funcionario-sal-desde')).toBe('03/01/2021');
    expect(valor('funcionario-atu-desde')).toBe('03/01/2021');
  });
  it('SEM admissão: data FUTURA grava como digitada e oferece gravá-la como admissão (ele confirma)', async () => {
    const api = montarDialogo('f00', f => ({ ...f, funcionario: { ...f.funcionario, admissao: null }, salarios: [] }));
    await abaSalario();
    expect(valor('funcionario-sal-desde')).toBe('');
    digitarData('funcionario-sal-desde', '06/05/2030');
    digitarSalario('4100');
    fireEvent.click(screen.getByTestId('funcionario-gravar-salario'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'gravarSalario')).toHaveLength(2));
    expect(api.chamadas.filter(c => c.fn === 'gravarSalario')[1]?.args[1]).toBe('2030-05-06');
    expect(screen.getByTestId('funcionario-aviso-salario').textContent).toContain('admissão vazia: gravar 06/05/2030 como admissão?');
    expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('funcionario-gravar-admissao'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')).toHaveLength(2));
    expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')[1]?.args[1]).toMatchObject({ id: 'f00', admissao: '2030-05-06' });
  });
  it('"a atualizar" não diz "salário" com salário gravado', async () => {
    montarDialogo('f00', f => ({ ...f, funcionario: { ...f.funcionario, a_atualizar: ['salario', 'situacao'] } }));
    /* FOLHA-FUNC-CADASTRO-01: o topo junta o que falta de todos os blocos — a marca 'situação' segue, a 'salário' não */
    await waitFor(() => expect(screen.getByTestId('funcionario-a-atualizar').textContent).toContain('situação'));
    expect(screen.getByTestId('funcionario-a-atualizar').textContent).not.toContain('salário');
  });
});

/* ── T8 FOLHA-FUNC-CADASTRO-01 (Gabriel 25/11 09:06): a aba Cadastro completa; pagamento e contato gravam no FAVORECIDO ───────────────── */
import {
  camposQueMudaram, formDoFavorecido, oQueFaltaPorBloco, pedidoDosExtras, seloDoBloco, titularDaConta, EXTRAS_VAZIO, FAVORECIDO_VAZIO, FORMA_PIX, FORMA_TED,
  type FavorecidoDaFicha,
} from '@/lib/folha/fichaCadastro';
import { FORM_VAZIO } from '@/lib/folha/folhaTela';

const FAV: FavorecidoDaFicha = { id: 'fav1', nome: 'Fav', tipo_recebimento: FORMA_PIX, pix_tipo_chave: 'CPF', pix_chave: '1', banco: 'B', agencia: '1', conta: '2',
  tipo_conta: 'Salário', cpf_cnpj_pagamento: '00000000191', celular: '9', email: null, logradouro: 'Rua', cep: '00000000' };
describe('T8a as regras da ficha (puras)', () => {
  it('o selo: "Completa" ou "Falta …"; Pix pede a chave, TED pede a conta; sem favorecido, contato e pagamento pedem o favorecido', () => {
    const form = { ...FORM_VAZIO, nome: 'X', cpf: '000.000.001-91', nascimento: '1990-01-01', admissao: '2020-01-01', cargo: 'C', pis: '1', ctps: '2' };
    const x = { ...EXTRAS_VAZIO, sexo: 'M', estado_civil: 'casado', jornada: '44h', fazenda_registro_id: 'f', rg: 'r', dia: '5u' };
    const f = oQueFaltaPorBloco(form, x, formDoFavorecido(FAV), true);
    expect(Object.values(f).map(seloDoBloco)).toEqual(['Completa', 'Completa', 'Completa', 'Completa', 'Completa']);
    expect(oQueFaltaPorBloco(form, x, { ...formDoFavorecido(FAV), pix_chave: '' }, true).pagamento).toEqual(['chave Pix']);
    expect(oQueFaltaPorBloco(form, x, { ...formDoFavorecido(FAV), tipo_recebimento: FORMA_TED, conta: '' }, true).pagamento).toEqual(['conta bancária']);
    expect(oQueFaltaPorBloco(form, x, FAVORECIDO_VAZIO, false)).toMatchObject({ contato: ['favorecido'], pagamento: ['favorecido'] });
    expect(seloDoBloco(['PIS', 'RG'])).toBe('Falta PIS, RG');
  });
  it('o favorecido recebe SÓ o que mudou (CPF do titular e CEP só com os dígitos)', () => {
    const p = formDoFavorecido(FAV);
    expect(camposQueMudaram(FAV, p)).toEqual({});
    expect(camposQueMudaram(FAV, { ...p, banco: 'Outro', cep: '00000-000' })).toEqual({ banco: 'Outro' });
    expect(camposQueMudaram(FAV, { ...p, cpf_cnpj_pagamento: '111.444.777-35' })).toEqual({ cpf_cnpj_pagamento: '11144477735' });
  });
  it('o titular confere o CPF do funcionário; o dia "5u" = 5º dia útil', () => {
    expect(titularDaConta('000.000.001-91', '00000000191')).toBe('proprio');
    expect(titularDaConta('000.000.001-91', '111.444.777-35')).toBe('outro');
    expect(titularDaConta('000.000.001-91', '')).toBe('vazio');
    expect(pedidoDosExtras({ ...EXTRAS_VAZIO, dia: '5u', dependentes: '2' })).toMatchObject({ dia_pagamento: 5, dia_pagamento_util: true, dependentes: 2 });
    expect(pedidoDosExtras({ ...EXTRAS_VAZIO, dia: '10' })).toMatchObject({ dia_pagamento: 10, dia_pagamento_util: false });
  });
});

describe('T8b a aba Cadastro', () => {
  it('os blocos com selo e o topo juntando o que falta; títulos sem caixa alta', async () => {
    montarDialogo('f00');
    expect(await screen.findByTestId('selo-pagamento')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('selo-pagamento').textContent).toBe('Completa'));
    expect(screen.getByTestId('selo-documentos').textContent).toBe('Falta CTPS');
    expect(screen.getByTestId('funcionario-a-atualizar').textContent).toContain('CTPS');
    expect(screen.getByTestId('funcionario-bloco-pagamento').querySelector('h3')?.textContent).toBe('Pagamento');
  });
  it('Salvar: as DUAS prévias, depois as duas gravações; o favorecido recebe só o banco mudado; os campos novos vão no pedido', async () => {
    const fichaApi = fichaCadastroDaFolha();
    const api = montarDialogo('f00', undefined, fichaApi);
    await waitFor(() => expect((screen.getByTestId('funcionario-banco') as HTMLInputElement).value).toContain('Banco Exemplo'));
    fireEvent.change(screen.getByTestId('funcionario-banco'), { target: { value: '001 Outro Banco' } });
    fireEvent.click(screen.getByTestId('funcionario-salvar'));
    await waitFor(() => expect(fichaApi.chamadas).toHaveLength(2));
    expect(fichaApi.chamadas.map(c => [c.args[1], c.args[2]])).toEqual([[{ banco: '001 Outro Banco' }, true], [{ banco: '001 Outro Banco' }, false]]);
    const fun = api.chamadas.filter(c => c.fn === 'gravarFuncionario');
    expect(fun.map(c => c.args[2])).toEqual([true, false]);
    expect(fun[1]?.args[1]).toMatchObject({ sexo: 'M', estado_civil: 'uniao_estavel', jornada: '44h', dia_pagamento: 5, dia_pagamento_util: true });
  });
  it('sem mudar o pagamento, o favorecido não é chamado; titular de outro CPF = aviso', async () => {
    const fichaApi = fichaCadastroDaFolha();
    const api = montarDialogo('f00', undefined, fichaApi);
    await waitFor(() => expect(screen.getByTestId('funcionario-titular-confere').textContent).toContain('próprio funcionário'));
    fireEvent.change(screen.getByTestId('funcionario-titular'), { target: { value: '111.444.777-35' } });
    expect(screen.getByTestId('funcionario-titular-confere').textContent).toContain('outra pessoa');
    fireEvent.change(screen.getByTestId('funcionario-titular'), { target: { value: '000.000.000-00' } });
    fireEvent.click(screen.getByTestId('funcionario-salvar'));
    await waitFor(() => expect(api.chamadas.filter(c => c.fn === 'gravarFuncionario')).toHaveLength(2));
    expect(fichaApi.chamadas).toHaveLength(0);
  });
});
