/**
 * PR-CONC-EXCEL-SESSAO-E-DEPARA-01 — o Enriquecer abre na importação mais recente do mês, o de-para do passo 1 usa o
 * resolvedor do banco, e linha em branco não é "rejeitada".
 *
 * ⚠ OS CASOS SÃO OS DO PRINT DE 01/10: a Imp 03 (8d6efeb7) caía em "2026-07" pelo uuid da primeira linha e sumia de
 *   setembro; Fgts, Luciana A. Martins, Banco Itau, IMPORCATE, Pedagio e Starlink no de-para; L512..L553 em branco.
 *   O resolvedor do banco foi provado pela RPC real (Starlink: o apelido está num fornecedor INATIVO — continua a resolver).
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { mesPredominante } from '@/v2/lib/mesa/mesDaSessao';
import { sessaoMaisNovaQueAberta, sessoesDoMes, toSessoesVM } from '@/v2/lib/mesa/enriquecimentoView';
import type { SessaoClassificacaoResumo } from '@/v2/hooks/useClassificacaoStaging';
import {
  montarDePara, textosParaOBanco, lerResolucoesDoBanco, contarPendentes, type CatalogosImport,
} from '@/v2/lib/importLanc/importLancamentosView';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';
import { parseExcelClassificacao } from '@/v2/lib/excelPreview/parserClassificacao';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';

const sessao = (id: string, mes: string, criada: string): SessaoClassificacaoResumo => ({
  sessao_id: id, excel_ano_mes: mes, total: 509, exatos: 0, ambiguos: 0, sem_match: 0, aplicados: 0, criada_em: criada,
});

describe('a sessão é do mês PREDOMINANTE, e a tela abre na mais recente', () => {
  it('a planilha de set/26 (303 set, 108 ago, 41 jul…) é de setembro', () => {
    expect(mesPredominante(new Map([['2026-07', 41], ['2026-09', 303], ['2026-08', 108], ['2026-04', 25]]))).toBe('2026-09');
  });
  it('empate: o mês mais recente; sem linha com mês: null', () => {
    expect(mesPredominante(new Map([['2026-08', 10], ['2026-09', 10]]))).toBe('2026-09');
    expect(mesPredominante(new Map([['2026-09', 10], ['2026-08', 10]]))).toBe('2026-09');
    expect(mesPredominante(new Map())).toBeNull();
  });

  const LISTA = [
    sessao('b6955356', '2026-09', '2026-09-30T10:38:38Z'),
    sessao('32c52f5c', '2026-09', '2026-09-30T21:15:26Z'),
    sessao('8d6efeb7', '2026-09', '2026-10-01T08:09:11Z'),
  ];
  it('a nova importação (Imp 03) é a primeira do mês — é ela que a tela abre', () => {
    const doMes = sessoesDoMes(toSessoesVM(LISTA), '2026-09');
    expect(doMes[0].id).toBe('8d6efeb7');
    expect(doMes[0].imp).toBe('Imp 03');
  });
  it('com a Imp 02 aberta, o aviso aponta a Imp 03; com a Imp 03 aberta, não há aviso', () => {
    expect(sessaoMaisNovaQueAberta(LISTA, '2026-09', '32c52f5c')?.imp).toBe('Imp 03');
    expect(sessaoMaisNovaQueAberta(LISTA, '2026-09', '8d6efeb7')).toBeNull();
    expect(sessaoMaisNovaQueAberta(LISTA, '2026-09', null)).toBeNull();
  });
  it('sem mês da régua, vale o mês da sessão aberta', () => {
    expect(sessaoMaisNovaQueAberta(LISTA, null, '32c52f5c')?.id).toBe('8d6efeb7');
  });
});

/* ── o de-para pelo resolvedor do banco ─────────────────────────────────────────────────────────────────────────── */
function linha(n: number, over: Partial<LancamentoExcelRow> = {}): LancamentoExcelRow {
  return {
    linha: n, data_competencia: '2026-09-10', valor: 100, tipo_operacao: '2-Saídas',
    conta_plano_texto: 'Parque de Máquinas / Manutenção e conserto', fazenda_texto: 'Faz Pureza',
    fornecedor_texto: 'Fgts', conta_bancaria_texto: 'BB', data_vencimento: null, data_pagamento: null, descricao: null,
    numero_documento: null, tipo_documento: null, forma_pagamento: null, observacao: null, status: null,
    safra_texto: 'Pecuária 2025/2026', id_lancamento: null, ...over,
  };
}
const CAT_VAZIO: CatalogosImport = {
  classificacoes: [], fazendas: [], fornecedores: [], contas: [], aliasesSubcentro: [], aliasesFornecedor: {},
  fechados: new Set(), safras: [], aliasesFazenda: {}, aliasesSafra: {},
};
const TEXTOS = ['Fgts', 'Luciana A. Martins', 'Banco Itau', 'IMPORCATE COM DE PECAS PARATRATORES LTDA', 'Pedagio', 'Starlink'];
const ROWS = [
  ...TEXTOS.map((t, i) => linha(i + 3, { fornecedor_texto: t })),
  linha(20, { safra_texto: 'Amendoim 2025/2026' }),   // a mesma conta com DUAS safras: a chave se desdobra
];
/* A resposta da RPC real (fn_classificacao_depara_resolver), medida no proto em 01/10 — Starlink ausente. */
const RESPOSTA_DO_BANCO = {
  fornecedor: {
    Fgts: { valor: 'eb77889d', origem: 'alias', rotulo: 'Receita Federal' },
    'Luciana A. Martins': { valor: 'edbe7f0b', origem: 'alias', rotulo: 'Luciana Abigail Z.A. Martins' },
    'Banco Itau': { valor: 'c321cde4', origem: 'alias', rotulo: 'Banco Itau BBA' },
    'IMPORCATE COM DE PECAS PARATRATORES LTDA': { valor: 'add336eb', origem: 'alias', rotulo: 'IMPORCATE COMERCIO DE PECAS PARA TRATORES LTDA' },
    Pedagio: { valor: 'dffcfc90', origem: 'alias', rotulo: 'Sem Parar' },
  },
  fazenda: { 'Faz Pureza': { valor: 'pureza', origem: 'alias', rotulo: 'Faz. Pureza' } },
  safra: { 'Pecuária 2025/2026': { valor: 'sf-pec', origem: 'alias', rotulo: 'Safra 25/26 Pecuária' } },
  subcentro: {
    'Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026': { valor: 'Manutenção Máquinas Pecuária', origem: 'alias', rotulo: 'Manutenção Máquinas Pecuária' },
  },
  lixo: 'ignorado',
};

describe('o de-para do passo 1 pergunta ao banco', () => {
  it('os textos vão à RPC pelas MESMAS chaves do de-para (a conta ambígua desdobra em "conta ⟂ safra")', () => {
    const t = textosParaOBanco(ROWS);
    expect(t.fornecedor).toEqual(expect.arrayContaining(TEXTOS));
    expect(t.subcentro).toEqual(expect.arrayContaining([
      'Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026',
      'Parque de Máquinas / Manutenção e conserto ⟂ Amendoim 2025/2026',
    ]));
    expect(t).not.toHaveProperty('conta');
  });

  it('os 5 que o banco resolve caem em "Apelido"; Starlink (apelido de fornecedor INATIVO) segue a resolver', () => {
    const dp = montarDePara(ROWS, CAT_VAZIO, lerResolucoesDoBanco(RESPOSTA_DO_BANCO));
    for (const t of TEXTOS.slice(0, 5)) {
      expect(dp.fornecedor[t].origem, t).toBe('alias');
      expect(dp.fornecedor[t].valor, t).not.toBeNull();
    }
    expect(dp.fornecedor.Starlink.origem).toBe('pendente');
    expect(dp.fornecedor.Fgts.rotulo).toBe('Receita Federal');
    expect(dp.fazenda['Faz Pureza'].origem).toBe('alias');
    expect(dp.safra['Pecuária 2025/2026'].valor).toBe('sf-pec');
    expect(dp.subcentro['Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026'].valor).toBe('Manutenção Máquinas Pecuária');
    /* a outra safra não tem composto no banco: o operador escolhe */
    expect(dp.subcentro['Parque de Máquinas / Manutenção e conserto ⟂ Amendoim 2025/2026'].origem).toBe('pendente');
  });

  it('sem resposta do banco, nada é inventado: tudo "a resolver" (nenhuma memória do front responde por ele)', () => {
    const dp = montarDePara(ROWS, CAT_VAZIO);
    expect(Object.values(dp.fornecedor).every((i) => i.origem === 'pendente')).toBe(true);
    expect(contarPendentes(dp).total).toBeGreaterThan(0);
  });

  it('resposta malformada é "não resolveu", nunca valor', () => {
    const r = lerResolucoesDoBanco({ fornecedor: { Fgts: { valor: 7, origem: 'alias' }, Banco: { valor: 'x', origem: 'chute' } } });
    expect(r.fornecedor).toEqual({});
    expect(lerResolucoesDoBanco(null)).toEqual({});
  });
});

/* ── linhas em branco no fim da planilha ─────────────────────────────────────────────────────────────────────────── */
function arquivo(matriz: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), 'Lançamentos');
  const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const f = new File([bytes], 'nj.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes });
  return f;
}
const CAB = ['Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)', 'Fazenda', 'Fornecedor',
  'Conta bancária', 'Status', 'Safra'];
const DADO = ['10/09/2026', 550, '2-Saídas', 'Parque de Máquinas / Manutenção e conserto', 'Faz Pureza', 'BRUNO', 'BB', 'Sim', 'Pecuária 2025/2026'];

describe('linha em branco não é rejeitada', () => {
  it('as linhas do fim sem nenhum obrigatório (mesmo com Status/Safra arrastados) somem em silêncio', async () => {
    const brancas = Array.from({ length: 42 }, () => ['', null, '', '', '', '', '', 'Sim', '']);
    const r = await parseExcelClassificacao(arquivo([CAB, DADO, DADO, ...brancas]));
    expect(r.linhasValidas).toBe(2);
    expect(r.linhasComErro).toBe(0);
    expect(r.erros).toEqual([]);
    expect(r.totalLinhas).toBe(2);
  });

  it('linha com ALGUM dado obrigatório e erro real continua rejeitada', async () => {
    const semData = ['', 550, '2-Saídas', 'Conta X', 'Faz Pureza', 'BRUNO', 'BB', '', ''];
    const r = await parseExcelClassificacao(arquivo([CAB, DADO, semData]));
    expect(r.linhasValidas).toBe(1);
    expect(r.linhasComErro).toBe(1);
    expect(r.erros[0].motivo).toMatch(/Data de competência/);
  });
});

/* ── a paginação que alimenta a gravação do apelido ─────────────────────────────────────────────────────────────── */

describe('os apelidos dos fornecedores são lidos INTEIROS (3.433 no NJ, não 1.000)', () => {
  const TODOS = Array.from({ length: 3433 }, (_v, i) => ({ id: `f-${i}` }));
  it('lê as 4 páginas e devolve as 3.433 linhas, sem duplicar', async () => {
    const pedidos: Array<[number, number, boolean]> = [];
    const r = await lerTodasAsPaginas(async (de, ate, contar) => {
      pedidos.push([de, ate, contar]);
      return { data: TODOS.slice(de, ate + 1), count: contar ? TODOS.length : null };
    });
    expect(r).toHaveLength(3433);
    expect(new Set(r.map((x) => x.id)).size).toBe(3433);
    expect(pedidos).toHaveLength(4);
    expect(pedidos.filter((p) => p[2])).toHaveLength(1);
  });
  it('sem `count`, uma página só — nunca o total inventado pelo tamanho da primeira', async () => {
    const r = await lerTodasAsPaginas(async (de, ate) => ({ data: TODOS.slice(de, ate + 1), count: null }));
    expect(r).toHaveLength(1000);
  });
});
