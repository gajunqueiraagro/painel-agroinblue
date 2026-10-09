/**
 * CONC-DIVIDENDOS-PLANO-01 — o dividendo do cadastro tem conta no plano do cliente, e a tela a encontra.
 *
 * O defeito (Vera, Conciliação › Sem classificação, set/2026): digitar "divi" no seletor de subcentro dava "Nenhum subcentro
 * encontrado". O carregador do plano exclui o macro 'Dividendos' e repunha os nomes do cadastro como entradas SINTÉTICAS
 * (`dividendo-<uuid>`, sem chave), que a tela do Sem classificação descarta — ela só oferece conta do plano.
 * Agora o nome do cadastro leva a chave da conta do plano (a do cliente, ou a global de mesmo nome — a regra do banco).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Chamada = { tabela: string; passos: [string, ...unknown[]][] };
const chamadas: Chamada[] = [];
const respostas: { plano: unknown[]; dividendos: unknown[] } = { plano: [], dividendos: [] };

vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string) => {
    const chamada: Chamada = { tabela, passos: [] };
    chamadas.push(chamada);
    const dados = () => {
      return tabela === 'financeiro_dividendos' ? respostas.dividendos : respostas.plano;
    };
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'or', 'order']) {
      q[m] = (...args: unknown[]) => { chamada.passos.push([m, ...args]); return q; };
    }
    q.then = (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok);
    return q;
  };
  return { supabase: { from: construtor } };
});

import {
  buildDividendoEntries, contaDoDividendo, contaDoPlanoPeloNome, loadContasDoPlanoDoCliente, loadPlanoContasCompleto,
  mapaDeContasPeloNome, planoToClassificacoes,
  type ContaDeDividendo, type ContaDoPlano, type Dividendo,
} from './planoContasBuilder';
import { contasDoPlano } from '@/lib/conciliacao/semClassificacao';

const CLI = 'aaaaaaaa-0000-0000-0000-000000000001';
const OUTRO = 'bbbbbbbb-0000-0000-0000-000000000002';
const div = (id: string, nome: string, cliente = CLI): Dividendo => ({ id, cliente_id: cliente, nome, ativo: true, ordem_exibicao: 0 });
const conta = (id: string, subcentro: string, cliente: string | null, tipo = '2-Saídas'): ContaDeDividendo =>
  ({ id, cliente_id: cliente, tipo_operacao: tipo, subcentro, compoe_dre: false });

const D_FULANA = div('d0000000-0000-0000-0000-000000000001', 'Fulana');
const D_GERAL = div('d0000000-0000-0000-0000-000000000002', 'Despesas Gerais');
const D_NOVO = div('d0000000-0000-0000-0000-000000000003', 'Cadastrado Depois');
const C_FULANA = conta('c0000000-0000-0000-0000-000000000001', 'Dividendos Fulana', CLI);
const C_GERAL_GLOBAL = conta('c0000000-0000-0000-0000-000000000002', 'Dividendos Despesas Gerais', null);

beforeEach(() => {
  chamadas.length = 0;
  respostas.plano = [];
  respostas.dividendos = [];
});

describe('a conta do plano de um dividendo do cadastro (a regra do banco)', () => {
  it('a do cliente; na falta, a global; de outro cliente, nunca', () => {
    expect(contaDoDividendo('Dividendos Fulana', CLI, [C_FULANA])?.id).toBe(C_FULANA.id);
    expect(contaDoDividendo('Dividendos Despesas Gerais', CLI, [C_GERAL_GLOBAL])?.id).toBe(C_GERAL_GLOBAL.id);
    expect(contaDoDividendo('Dividendos Fulana', CLI, [conta('x', 'Dividendos Fulana', OUTRO)])).toBeNull();
  });

  it('a do cliente vence a global de mesmo nome', () => {
    const global = conta('g', 'Dividendos Fulana', null);
    expect(contaDoDividendo('Dividendos Fulana', CLI, [global, C_FULANA])?.id).toBe(C_FULANA.id);
  });

  it('duas do mesmo nível = nenhuma (o banco também não escolhe); outro tipo de operação não serve', () => {
    /* com uma global ao lado: duas do cliente NÃO caem para a global */
    expect(contaDoDividendo('Dividendos Fulana', CLI, [C_FULANA, conta('y', 'Dividendos Fulana', CLI), conta('g', 'Dividendos Fulana', null)])).toBeNull();
    expect(contaDoDividendo('Dividendos Fulana', CLI, [conta('z', 'Dividendos Fulana', CLI, '1-Entradas')])).toBeNull();
  });
});

describe('uma entrada por nome do cadastro: a do plano quando a conta existe', () => {
  const entradas = buildDividendoEntries([D_FULANA, D_GERAL, D_NOVO], 9000, [C_FULANA, C_GERAL_GLOBAL]);

  it('nenhum nome em dobro, e a ordem é a do cadastro', () => {
    expect(entradas.map(e => e.subcentro)).toEqual(['Dividendos Fulana', 'Dividendos Despesas Gerais', 'Dividendos Cadastrado Depois']);
    expect(entradas.map(e => e.ordem_exibicao)).toEqual([9000, 9001, 9002]);
  });

  it('com conta: leva o id da conta e chega ao catálogo COM chave', () => {
    const cls = planoToClassificacoes(entradas);
    expect(cls[0].id).toBe(C_FULANA.id);
    expect(cls[1].id).toBe(C_GERAL_GLOBAL.id);
    expect(cls[0].compoe_dre).toBe(false);
    expect(cls[0].escopo_negocio).toBe('administrativo');
  });

  it('sem conta (cadastrado depois do backfill): sobra a sintética, sem chave', () => {
    expect(entradas[2].id).toBe(`dividendo-${D_NOVO.id}`);
    expect(planoToClassificacoes(entradas)[2].id).toBeUndefined();
  });

  it('A BUSCA DO SEM CLASSIFICAÇÃO ACHA: "divi" lista os nomes com conta, e só eles', () => {
    const oferecidas = contasDoPlano(planoToClassificacoes(entradas)).filter(c => c.subcentro.toLowerCase().includes('divi'));
    expect(oferecidas.map(c => c.subcentro)).toEqual(['Dividendos Fulana', 'Dividendos Despesas Gerais']);
    /* a busca sabe achar o que fica de fora: sem as contas, a mesma lista é vazia (era o defeito) */
    expect(contasDoPlano(planoToClassificacoes(buildDividendoEntries([D_FULANA, D_GERAL, D_NOVO])))).toEqual([]);
  });
});

describe('o carregador do plano', () => {
  it('UMA leitura, SÓ do cliente e das globais; a lista geral segue sem Dividendos e o nome do cadastro ganha a chave', async () => {
    const linha = (id: string, sub: string, macro: string, cliente: string | null, ordem: number) => ({
      id, cliente_id: cliente, tipo_operacao: '2-Saídas', macro_custo: macro, grupo_custo: 'G', centro_custo: 'C', subcentro: sub,
      escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: ordem, compoe_dre: macro !== 'Dividendos',
    });
    respostas.plano = [
      linha('p1', 'Sal', 'Custeio', null, 6020),
      linha(C_FULANA.id, 'Dividendos Fulana', 'Dividendos', CLI, 17160),
      linha('de-outro-nome', 'Dividendos Que Não É Do Cadastro', 'Dividendos', null, 17010),
    ];
    respostas.dividendos = [D_FULANA, D_NOVO];
    const itens = await loadPlanoContasCompleto(CLI);

    const leituras = chamadas.filter(c => c.tabela === 'financeiro_plano_contas');
    expect(leituras).toHaveLength(1);
    expect(leituras[0].passos).toContainEqual(['or', `cliente_id.is.null,cliente_id.eq.${CLI}`]);
    expect(leituras[0].passos).toContainEqual(['eq', 'ativo', true]);

    /* conta de macro Dividendos que não é do cadastro do cliente não entra na lista */
    expect(itens.map(i => i.subcentro)).toEqual(['Sal', 'Dividendos Fulana', 'Dividendos Cadastrado Depois']);
    expect(itens[1].id).toBe(C_FULANA.id);
    expect(itens[2].id).toBe(`dividendo-${D_NOVO.id}`);
  });

  it('a leitura base devolve as contas como vieram, na forma que os importadores e o Fluxo leem', async () => {
    respostas.plano = [{ id: 'p1', cliente_id: null, tipo_operacao: '2-Saídas', macro_custo: 'Custeio', grupo_custo: 'G', centro_custo: 'C',
      subcentro: 'Sal', escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: 6020, compoe_dre: true }];
    const contas = await loadContasDoPlanoDoCliente(CLI);
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({ id: 'p1', subcentro: 'Sal', ordem_exibicao: 6020, macro_custo: 'Custeio' });
  });
});

/**
 * PLANO-LEITOR-POR-CLIENTE-01 — o mapa nome → id dos importadores sai da REGRA ÚNICA (espelho de `fn_plano_conta_do_texto`).
 * O defeito: os dois importadores liam o plano inteiro (o admin enxerga as contas de todos os clientes) e montavam o mapa com
 * "o primeiro vence" — com o mesmo nome em dois clientes, o id gravado podia ser o da conta do OUTRO cliente.
 */
describe('a conta do plano pelo nome, para o cliente em uso', () => {
  const c = (id: string, sub: string, cliente: string | null, tipo = '2-Saídas'): ContaDoPlano => ({
    id, cliente_id: cliente, tipo_operacao: tipo, macro_custo: 'M', grupo_custo: 'G', centro_custo: 'C', subcentro: sub,
    escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: 1, compoe_dre: true,
  });
  const DO_OUTRO = c('do-outro', 'Homônimo', OUTRO);
  const DO_CLIENTE = c('do-cliente', 'Homônimo', CLI);
  const GLOBAL = c('global', 'Homônimo', null);

  it('homônimo em OUTRO cliente: devolve a conta do cliente em uso, venha a do outro antes ou depois na lista', () => {
    expect(mapaDeContasPeloNome([DO_OUTRO, DO_CLIENTE], CLI).get('Homônimo')).toBe('do-cliente');
    expect(mapaDeContasPeloNome([DO_CLIENTE, DO_OUTRO], CLI).get('Homônimo')).toBe('do-cliente');
    expect(mapaDeContasPeloNome([DO_OUTRO, DO_CLIENTE], OUTRO).get('Homônimo')).toBe('do-outro');
  });

  it('cliente + global: a do cliente vence; sem a do cliente, a global', () => {
    expect(mapaDeContasPeloNome([GLOBAL, DO_CLIENTE], CLI).get('Homônimo')).toBe('do-cliente');
    expect(mapaDeContasPeloNome([GLOBAL, DO_OUTRO], CLI).get('Homônimo')).toBe('global');
  });

  it('nome que só o outro cliente tem NÃO resolve (o importador o mostra como não classificado)', () => {
    const mapa = mapaDeContasPeloNome([DO_OUTRO, c('g2', 'Sal', null)], CLI);
    expect(mapa.has('Homônimo')).toBe(false);
    expect([...mapa.keys()]).toEqual(['Sal']);
  });

  it('duas contas do cliente com o mesmo nome não resolvem — nem caem para a global', () => {
    expect(mapaDeContasPeloNome([DO_CLIENTE, c('do-cliente-2', 'Homônimo', CLI), GLOBAL], CLI).has('Homônimo')).toBe(false);
  });

  it('com o tipo, só a conta daquele tipo; sem o tipo, homônimo em dois tipos não resolve', () => {
    const saida = c('saida', 'Ajuste', null, '2-Saídas');
    const entrada = c('entrada', 'Ajuste', null, '1-Entradas');
    expect(contaDoPlanoPeloNome([saida, entrada], CLI, 'Ajuste', '1-Entradas')?.id).toBe('entrada');
    expect(contaDoPlanoPeloNome([saida, entrada], CLI, 'Ajuste')).toBeNull();
    /* as duas grafias de transferência são o mesmo tipo, como no banco */
    expect(contaDoPlanoPeloNome([c('t', 'Entre contas', null, '3-Transferências')], CLI, 'Entre contas', '3-Transferência')?.id).toBe('t');
  });
});

describe('os importadores e o Fluxo leem o plano pelo carregador dono (fonte)', () => {
  const fonte = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const CONSULTA_DIRETA = /\.from\(\s*['"]financeiro_plano_contas['"]\s*\)/;

  it('o detector sabe achar a consulta direta', () => {
    expect(CONSULTA_DIRETA.test(fonte('src/lib/financeiro/planoContasBuilder.ts'))).toBe(true);
  });

  it.each([
    ['src/v2/hooks/useImportLancamentosExcel.ts', 'mapaDeContasPeloNome(contasDoPlano, clienteId)'],
    ['src/v2/pages/CusteioTxtImportTab.tsx', 'mapaDeContasPeloNome(contasDoPlano, clienteId)'],
    ['src/components/financeiro/FluxoFinanceiro.tsx', 'buildPlanoOrdemMap(contas)'],
  ])('%s', (arquivo, uso) => {
    const f = fonte(arquivo);
    expect(CONSULTA_DIRETA.test(f)).toBe(false);
    expect(f).toContain('loadContasDoPlanoDoCliente(clienteId)');
    expect(f).toContain(uso);
    expect(f).not.toMatch(/Primeiro vence/);
  });
});

describe('as listas das outras telas não mudam (fonte)', () => {
  const fonte = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const FILTRO = 'filter(c => !!c.id && c.macro_custo !== DIVIDENDO_MACRO)';

  it('o leitor de fonte sabe achar', () => {
    expect(fonte('src/lib/financeiro/planoContasBuilder.ts')).toContain("export const DIVIDENDO_MACRO = 'Dividendos'");
  });

  it('reclassificar item da OC e desvincular seguem sem Dividendos (filtravam por "tem chave", e o dividendo passou a ter)', () => {
    expect(fonte('src/components/financeiro-v2/ReclassificarItemDialog.tsx')).toContain(FILTRO);
    expect(fonte('src/components/financeiro-v2/DesvincularOperacaoDialog.tsx')).toContain(FILTRO);
  });
});
