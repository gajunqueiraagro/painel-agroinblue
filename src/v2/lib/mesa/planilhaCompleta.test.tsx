/**
 * PR-CONC-EXCEL-PLANILHA-COMPLETA-01 — a planilha entra inteira e a safra define a atividade.
 *
 * ⚠ QUEM RESOLVE É O BANCO (provado em ROLLBACK pela RPC real: resolvedores, apelido composto antes do simples, precedência
 *   que não sobe plano incoerente). Aqui: o parser lê as quatro colunas, a tela mostra o que o banco devolveu (linhas
 *   como a view as entrega) e a Mesa ensina o apelido com a chave composta do importador.
 * ⚠ O CASO É O DO PRINT: BRUNO SUNIGA, −550,00, "Parque de Máquinas / Manutenção e conserto", safra "Pecuária 2025/2026",
 *   Recibo, "PIX/Transferência Bancária", Status "Sim".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { render, screen, within } from '@testing-library/react';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

const selectAliases = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => selectAliases() }) }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
const persistir = vi.fn();
vi.mock('@/v2/lib/importLanc/persistirApelidos', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/v2/lib/importLanc/persistirApelidos')>();
  return { ...real, persistirApelidos: (...a: unknown[]) => persistir(...a) };
});

import { parseExcelClassificacao } from '@/v2/lib/excelPreview/parserClassificacao';
import { MesaCamposTabela } from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';
import { aprenderApelidoDaMesa, chaveDoApelidoDaMesa } from '@/v2/lib/mesa/aprenderApelido';

function arquivo(aba: string, matriz: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), aba);
  const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const f = new File([bytes], 'nj.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes });
  return f;
}

const cls = (subcentro: string, escopo_negocio: string, id: string): ClassificacaoItem => ({
  id, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável',
  centro_custo: 'Máquinas', tipo_operacao: '2-Saídas',
});
const CLASSIF = [
  cls('Manutenção Máquinas Pecuária', 'pecuaria', 'pc-pec'), cls('Manutenção Máquinas Agricultura', 'agricultura', 'pc-agri'),
  cls('Despesas Administrativas Gerais', 'administrativo', 'pc-adm'),
];
const SAFRAS = [
  { id: 'sf-pec', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', ativa: true },
  { id: 'sf-lav', codigo: '25/26-Lav', escopo_negocio: 'agricultura', ativa: true },
];

/* BRUNO como a view o entrega DEPOIS do banco: cru, o composto resolveu a conta de pecuária, e a safra, o tipo de
   documento e a forma subiram ao topo da proposta. */
const BRUNO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-bruno', lanc_id: 'd3e29d7b', match_status: 'exato', lanc_origem_lancamento: 'extrato',
  lanc_descricao: 'Pix - Enviado - 10/09 BRUNO SUNIGA', lanc_valor: 550, excel_valor: 550, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', excel_data: '2026-09-10', excel_fazenda_codigo: 'Faz Pureza',
  excel_subcentro: 'Parque de Máquinas / Manutenção e conserto', excel_fornecedor: '57.415.546 BRUNO SUNIGA BRAGHIN',
  excel_safra: 'Pecuária 2025/2026', excel_tipo_documento: 'Recibo', excel_forma_pagamento: 'PIX/Transferência Bancária',
  excel_status: 'Sim', planilha_safra_id: 'sf-pec', planilha_tipo_documento: 'Recibo', planilha_forma_pagamento: 'PIX',
  proposto_subcentro: 'Manutenção Máquinas Pecuária', proposto_subcentro_existe_no_plano: true,
  planilha_subcentro: 'Manutenção Máquinas Pecuária', proposto_tier: 'alias_composto', proposto_origem_resolucao: 'alias_composto',
  proposto_safra_id: 'sf-pec', proposto_tipo_documento: 'Recibo', proposto_forma_pagamento: 'PIX',
};
/* A mesma linha quando a conta só tem o apelido SIMPLES, de agricultura, e nenhum composto: o banco não sobe o plano. */
const CONFLITO: Partial<ClassificacaoStagingPreviewRow> = {
  ...BRUNO, staging_id: 's-conf', proposto_subcentro: null, proposto_subcentro_existe_no_plano: false,
  planilha_subcentro: 'Manutenção Máquinas Agricultura', proposto_tier: 'alias', proposto_origem_resolucao: 'alias',
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF, safras: SAFRAS });
const marca = (r: ReturnType<typeof vm>, campo: string) => r.divergenciasPlanilha.find((d) => d.campo === campo);
const montar = (r: ReturnType<typeof vm>) => render(
  <MesaCamposTabela row={r} classificacoes={CLASSIF} onEditar={vi.fn(() => Promise.resolve())} onAtividade={vi.fn()}
    safras={SAFRAS.map((s) => ({ ...s, nome: s.codigo }))} />,
);
const linha = (rotulo: string) => screen.getByTestId(`linha-${rotulo}`);

describe('o parser lê as 16 colunas do modelo (antes descartava 4)', () => {
  it('a linha do BRUNO traz safra, tipo de documento, forma e status; a Descrição "-" é o produto vazio', async () => {
    const r = await parseExcelClassificacao(arquivo('Lançamentos', [
      ['OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA', 'OBRIGATÓRIA',
        'opcional', 'opcional', 'opcional', 'opcional', 'opcional', 'opcional', 'opcional', 'opcional', 'opcional'],
      ['Data de competência', 'Valor', 'Tipo de operação', 'Conta (plano do cliente)', 'Fazenda', 'Fornecedor',
        'Conta bancária', 'Data de vencimento', 'Data de pagamento', 'Descrição', 'Documento', 'Tipo de documento',
        'Forma de pagamento', 'Observação', 'Status', 'Safra'],
      ['10/09/2026', 550, '2-Saídas', 'Parque de Máquinas / Manutenção e conserto', 'Faz Pureza',
        '57.415.546 BRUNO SUNIGA BRAGHIN', 'BB', '10/09/2026', '10/09/2026', '-', '-', 'Recibo',
        'PIX/Transferência Bancária', 'Pecuária 2025/2026', 'Sim', 'Pecuária 2025/2026'],
    ]));
    expect(r.linhasValidas).toBe(1);
    const row = r.rows[0];
    expect(row.safra).toBe('Pecuária 2025/2026');
    expect(row.tipo_documento).toBe('Recibo');
    expect(row.forma_pagamento).toBe('PIX/Transferência Bancária');
    expect(row.status).toBe('Sim');
    expect(row.produto).toBeNull();
    expect(row.subcentro).toBe('Parque de Máquinas / Manutenção e conserto');
  });
});

describe('BRUNO resolve SOZINHO (apelido composto)', () => {
  it('Manutenção Máquinas Pecuária, Safra 25/26-Pec, Recibo, PIX, Atividade Pecuária — sem marca', () => {
    const r = vm(BRUNO);
    expect(r.edicao.subcentro).toBe('Manutenção Máquinas Pecuária');
    expect(r.edicao.safraId).toBe('sf-pec');
    expect(r.edicao.tipoDocumento).toBe('Recibo');
    expect(r.edicao.formaPagamento).toBe('PIX');
    expect(r.edicao.atividadeProposta).toBe('pecuaria');
    for (const c of ['Subcentro', 'Safra', 'Tipo de documento', 'Forma de pagamento']) expect(marca(r, c), c).toBeUndefined();
    /* a forma da planilha manda; o histórico do banco é só reserva */
    expect(r.edicao.formaPagamentoSugerida).toBeNull();
    expect(r.proveniencia.comoFoiSugerido).toContain('para esta safra');
  });

  it('a coluna Planilha mostra a safra, o tipo de documento e a forma que vieram do arquivo', () => {
    montar(vm(BRUNO));
    /* a 2a célula da linha é a coluna Planilha */
    const planilha = (rotulo: string) => linha(rotulo).querySelectorAll('td')[1];
    expect(planilha('Safra')).toHaveTextContent('Pecuária 2025/2026');
    /* PR-CONC-ENRIQUECER-V2-01 — nº e tipo numa linha só ("Documento · tipo") */
    expect(planilha('Documento · tipo')).toHaveTextContent('Recibo');
    expect(planilha('Forma de pagamento')).toHaveTextContent('PIX/Transferência Bancária');
    expect(planilha('Atividade')).toHaveTextContent('Pecuária (Faz Pureza)');
  });
});

describe('apelido simples de OUTRA atividade, sem composto: a conta fica pendente com a marca', () => {
  it('a atividade é a da safra, a conta está vazia e a marca diz o conflito', () => {
    const r = vm(CONFLITO);
    expect(r.edicao.subcentro).toBeNull();
    expect(r.edicao.atividadeProposta).toBe('pecuaria');
    expect(marca(r, 'Subcentro')?.texto).toBe('apelido é de Lavoura; safra diz Pecuária');
  });

  it('na tela: Conta do plano obrigatória e a marca no slot da linha', () => {
    montar(vm(CONFLITO));
    const l = linha('Conta do plano');
    expect(within(l).getByTestId('marca-planilha')).toHaveTextContent('apelido é de Lavoura; safra diz Pecuária');
  });

  it('sem safra na planilha não há conflito (o legado simples continua valendo)', () => {
    const r = vm(CONFLITO, { excel_safra: null, planilha_safra_id: null });
    expect(marca(r, 'Subcentro')?.texto).toBeUndefined();
  });
});

describe('plano administrativo com safra, e safra que não resolve', () => {
  it('administrativo: a atividade é a do plano e a safra vira só a marca, sem bloquear', () => {
    const r = vm(BRUNO, { proposto_subcentro: 'Despesas Administrativas Gerais', planilha_subcentro: 'Despesas Administrativas Gerais',
      proposto_safra_id: null });
    expect(r.edicao.atividadeProposta).toBe('administrativo');
    expect(marca(r, 'Safra')?.planilha).toBe('Pecuária 2025/2026 (plano administrativo não leva safra)');
  });

  it('apelido de safra inativa: "(não resolvido)" e a safra do sistema fica', () => {
    const r = vm(BRUNO, { excel_safra: 'Amendoim 2025/2026; Pecuária 2025/2026 …', planilha_safra_id: null,
      proposto_safra_id: null, lanc_safra_id: 'sf-lav' });
    expect(marca(r, 'Safra')?.planilha).toBe('Amendoim 2025/2026; Pecuária 2025/2026 … (não resolvido)');
    expect(r.edicao.safraIdAtual).toBe('sf-lav');
  });

  it('forma e tipo de documento fora da lista: "(não resolvido)"', () => {
    const r = vm(BRUNO, { excel_forma_pagamento: 'Cheque pré', planilha_forma_pagamento: null, proposto_forma_pagamento: null,
      excel_tipo_documento: 'Duplicata', planilha_tipo_documento: null, proposto_tipo_documento: null });
    expect(marca(r, 'Forma de pagamento')?.planilha).toBe('Cheque pré (não resolvido)');
    expect(marca(r, 'Tipo de documento')?.planilha).toBe('Duplicata (não resolvido)');
  });
});

describe('a Mesa aprende pelo caminho do importador', () => {
  beforeEach(() => { selectAliases.mockReset(); persistir.mockReset(); });

  it('a chave é a composta do B-22d com safra, a simples sem', () => {
    expect(chaveDoApelidoDaMesa('Parque de Máquinas / Manutenção e conserto', 'Pecuária 2025/2026'))
      .toBe('Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026');
    expect(chaveDoApelidoDaMesa('Parque de Máquinas / Manutenção e conserto', null)).toBe('Parque de Máquinas / Manutenção e conserto');
    expect(chaveDoApelidoDaMesa('  ', 'Pecuária 2025/2026')).toBeNull();
  });

  it('grava o composto por `persistirApelidos`, repontando o que já existia', async () => {
    selectAliases.mockResolvedValue({ data: [{ id: 'al-1', cliente_id: 'nj', origem: 'importacao',
      alias_text: 'Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026' }], error: null });
    persistir.mockResolvedValue({ subcentro: 1, fornecedor: 0, conta: 0, fazenda: 0, safra: 0, erros: [], idsSubcentroPorTexto: {} });
    const r = await aprenderApelidoDaMesa({ clienteId: 'nj', contaPlanilha: 'Parque de Máquinas / Manutenção e conserto',
      safraPlanilha: 'Pecuária 2025/2026', subcentro: 'Manutenção Máquinas Pecuária', planoContaId: 'pc-pec' });
    expect(r.ok).toBe(true);
    const arg = persistir.mock.calls[0][0];
    const chave = 'Parque de Máquinas / Manutenção e conserto ⟂ Pecuária 2025/2026';
    expect(arg.subcentro[chave]).toMatchObject({ texto: chave, valor: 'Manutenção Máquinas Pecuária', origem: 'manual' });
    expect(arg.planoIdPorSubcentro).toEqual({ 'Manutenção Máquinas Pecuária': 'pc-pec' });
    /* o texto já existia: vira UPDATE (repontar), não INSERT duplicado */
    expect(Object.values(arg.aliasIdPorTexto)).toEqual(['al-1']);
  });

  it('sem plano (conta fora do catálogo) não grava nada', async () => {
    const r = await aprenderApelidoDaMesa({ clienteId: 'nj', contaPlanilha: 'X', safraPlanilha: null,
      subcentro: 'Y', planoContaId: undefined });
    expect(r.ok).toBe(false);
    expect(persistir).not.toHaveBeenCalled();
  });
});
