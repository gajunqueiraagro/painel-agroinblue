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
const respostas: { plano: unknown[]; contas: unknown[]; dividendos: unknown[] } = { plano: [], contas: [], dividendos: [] };

vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string) => {
    const chamada: Chamada = { tabela, passos: [] };
    chamadas.push(chamada);
    const dados = () => {
      if (tabela === 'financeiro_dividendos') return respostas.dividendos;
      const soDividendos = chamada.passos.some(p => p[0] === 'eq' && p[1] === 'macro_custo');
      return soDividendos ? respostas.contas : respostas.plano;
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
  buildDividendoEntries, contaDoDividendo, loadPlanoContasCompleto, planoToClassificacoes,
  type ContaDeDividendo, type Dividendo,
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
  respostas.contas = [];
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
  it('lê as contas de Dividendos SÓ do cliente e globais, e dá a chave ao nome do cadastro', async () => {
    respostas.plano = [{ id: 'p1', tipo_operacao: '2-Saídas', macro_custo: 'Custeio', grupo_custo: 'G', centro_custo: 'C', subcentro: 'Sal', escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: 6020, compoe_dre: true }];
    respostas.dividendos = [D_FULANA, D_NOVO];
    respostas.contas = [C_FULANA, conta('de-outro-nome', 'Dividendos Que Não É Do Cadastro', null)];
    const itens = await loadPlanoContasCompleto(CLI);

    const leituraDasContas = chamadas.find(c => c.tabela === 'financeiro_plano_contas' && c.passos.some(p => p[0] === 'eq' && p[1] === 'macro_custo'));
    expect(leituraDasContas?.passos).toContainEqual(['or', `cliente_id.is.null,cliente_id.eq.${CLI}`]);
    expect(leituraDasContas?.passos).toContainEqual(['eq', 'ativo', true]);
    /* a lista geral continua SEM o macro Dividendos: conta que não é do cadastro do cliente não entra */
    const leituraGeral = chamadas.find(c => c.tabela === 'financeiro_plano_contas' && c.passos.some(p => p[0] === 'neq'));
    expect(leituraGeral?.passos).toContainEqual(['neq', 'macro_custo', 'Dividendos']);

    expect(itens.map(i => i.subcentro)).toEqual(['Sal', 'Dividendos Fulana', 'Dividendos Cadastrado Depois']);
    expect(itens[1].id).toBe(C_FULANA.id);
    expect(itens[2].id).toBe(`dividendo-${D_NOVO.id}`);
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
