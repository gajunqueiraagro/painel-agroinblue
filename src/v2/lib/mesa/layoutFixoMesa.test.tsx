/**
 * PR-CONC-MESA-LAYOUT-FIXO-01 — a grade da Mesa é FIXA: trocar de linha (cru <-> classificado, transferência, gravada,
 * com e sem divergência) ou escolher um valor NUNCA muda largura de coluna, altura de linha, a presença de uma linha nem
 * o lugar das dicas e dos avisos.
 *
 * ⚠ O jsdom NÃO FAZ LAYOUT: aqui se prova o CONTRATO de que as medidas saem (colgroup, altura declarada de cada linha,
 *   largura do slot, slots sempre presentes, nenhuma linha condicional) — e que ele é o MESMO em todos os estados. A
 *   medida renderizada (offsetWidth/offsetTop no navegador) vai no relatório do PR.
 * ⚠ PR-CONC-MESA-ORDEM-03: a ordem do Novo lançamento (Datas e pagamento · Identificação · Classificação · Complemento),
 *   altura POR BLOCO (18 nos compactos, 22 nos normais) e os avisos à direita da linha do checklist (o slot de 18px saiu).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import {
  MesaCamposTabela, LARGURA_COL_CAMPO, LARGURA_COL_VAI_GRAVAR, LARGURA_SLOT_DICA, ALTURA_LINHA, ALTURA_LINHA_COMPACTA,
  ROTULOS_DA_GRADE, ROTULOS_COMPACTOS, TITULOS_DOS_BLOCOS, ALTURA_FAIXA_GRUPO, ALTURA_CHECKLIST, CAMPOS_DO_EXTRATO,
} from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

const cls = (subcentro: string, escopo_negocio: string, tipo_operacao = '2-Saídas', ordem?: number): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Centro', tipo_operacao, ...(ordem ? { ordem_exibicao: ordem } : {}),
});
const CLASSIF = [cls('Salários e Encargos Pecuária', 'pecuaria'), cls('Seguros', 'administrativo'),
  cls('Transferência entre contas', 'administrativo', '3-Transferências', 18010)];
const faz = (id: string, nome: string): Fazenda => ({ id, nome, codigo_importacao: id, owner_id: 'o', cliente_id: 'nj' });
const FAZENDAS = [faz('pureza', 'Faz. Pureza'), faz('adm', 'Administrativo')];

/* Os estados que mais mexiam na tela: o cru com sugestão e marca da planilha, o classificado com aviso de rateio, a
   transferência (que abria a linha do destino), a parte de agrupamento e a linha já gravada. */
const CRU: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cru', lanc_id: 'l-cru', match_status: 'divergente', lanc_origem_lancamento: 'ofx',
  lanc_descricao: 'Pix - Enviado - BRUNO SUNIGA', lanc_valor: 550, excel_valor: 550, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', excel_fazenda_codigo: 'Faz Pureza', excel_fornecedor: 'Bruno',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
  planilha_subcentro: 'Salários e Encargos Pecuária', excel_produto: 'Diária',
};
const CLASSIFICADO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cl', lanc_id: 'l-cl', match_status: 'ja_classificado', lanc_origem_lancamento: 'recorrencia',
  lanc_descricao: 'Seguro', lanc_valor: 841.48, excel_valor: 841.48, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_subcentro_atual: 'Salários e Encargos Pecuária', lanc_plano_conta_id_atual: 'pc', lanc_fazenda_id: 'adm',
  lanc_forma_pagamento: 'PIX/Transferência Bancária', excel_subcentro: 'Conta que não existe',
  will_create_subcentro_orfao: true, proposto_subcentro: 'Conta que não existe',
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF, fazendas: FAZENDAS });
const ESTADOS: Array<[string, ReturnType<typeof vm>, string | null]> = [
  ['cru', vm(CRU), null],
  ['cru, atividade trocada (plano incoerente)', vm(CRU), 'administrativo'],
  ['classificado com avisos', vm(CLASSIFICADO), null],
  ['transferência', vm(CRU, { proposto_tipo_operacao: '3-Transferências' }), null],
  ['parte de agrupamento', vm(CRU, { casamento_meta: { grupo_ids: ['a', 'b'] } }), null],
  ['já gravada', vm(CLASSIFICADO, { aplicado: true }), null],
  ['sem lançamento', vm(CRU, { lanc_id: null }), null],
];
const montar = (r: ReturnType<typeof vm>, atividade: string | null) => render(
  <MesaCamposTabela row={r} classificacoes={CLASSIF} fazendas={FAZENDAS} onEditar={vi.fn(() => Promise.resolve())}
    onAtividade={vi.fn()} atividade={atividade} contas={[]} safras={[]} />,
);

/** A assinatura das medidas da grade — tudo o que decide largura e altura, lido do DOM. */
function assinatura(raiz: HTMLElement) {
  const tabela = within(raiz).getByTestId('grade-mesa');
  return {
    colunas: Array.from(tabela.querySelectorAll('col')).map((c) => c.style.width),
    linhas: Array.from(tabela.querySelectorAll<HTMLTableRowElement>('tbody tr')).map((tr) => `${tr.getAttribute('data-testid') ?? 'faixa'}:${tr.style.height}`),
    slots: within(raiz).getAllByTestId('slot-dica').map((s) => s.style.width),
    checklist: within(raiz).getByTestId('checklist').style.height,
    /* o lugar dos avisos existe sempre, DENTRO da linha do checklist */
    avisosNoChecklist: !!within(within(raiz).getByTestId('checklist')).queryByTestId('avisos-linha'),
    /* o que vem DEPOIS da tabela dentro do painel — era aí que nascia o "planilha dizia" */
    irmaos: Array.from(raiz.querySelectorAll('[data-testid="grade-mesa"]')).map((t) => t.parentElement?.children.length),
  };
}

describe('a grade tem as mesmas medidas em todos os estados', () => {
  const base = (() => { const { container, unmount } = montar(vm(CRU), null); const a = assinatura(container); unmount(); return a; })();

  it('as medidas declaradas são as do colgroup; a altura é a do BLOCO: 18 nos compactos, 22 nos normais', () => {
    expect(base.colunas).toEqual([LARGURA_COL_CAMPO, '', '', LARGURA_COL_VAI_GRAVAR]);
    const linhas = base.linhas.filter((l) => l.startsWith('linha-'));
    for (const l of linhas) {
      const rotulo = l.slice('linha-'.length, l.lastIndexOf(':'));
      expect(l).toBe(`linha-${rotulo}:${ROTULOS_COMPACTOS.includes(rotulo) ? ALTURA_LINHA_COMPACTA : ALTURA_LINHA}`);
    }
    /* 9 compactas (6 de Datas e pagamento + 3 de Complemento) e 6 normais */
    expect(linhas.filter((l) => l.endsWith(`:${ALTURA_LINHA_COMPACTA}`))).toHaveLength(9);
    expect(linhas.filter((l) => l.endsWith(`:${ALTURA_LINHA}`))).toHaveLength(6);
    expect(base.slots.every((w) => w === LARGURA_SLOT_DICA)).toBe(true);
    expect(base.avisosNoChecklist).toBe(true);
    expect(base.irmaos).toEqual([1]);
  });

  it('a ORDEM é a do Novo lançamento do Financeiro, e o extrato é marcado, não inferido pelo bloco', () => {
    expect(ROTULOS_DA_GRADE).toEqual([
      'Competência', 'Data venc.', 'Data pgto.', 'Valor', 'Conta bancária', 'Conta destino',
      'Fornecedor', 'Descrição',
      'Atividade', 'Fazenda', 'Plano de contas', 'Safra',
      'Documento · tipo', 'Forma de pagamento', 'Observação',
    ]);
    expect(TITULOS_DOS_BLOCOS).toEqual(['Datas e pagamento', 'Identificação', 'Classificação', 'Complemento']);
    expect(CAMPOS_DO_EXTRATO).toEqual(['Data pgto.', 'Valor', 'Conta bancária']);
    expect(ROTULOS_COMPACTOS).toEqual(['Competência', 'Data venc.', 'Data pgto.', 'Valor', 'Conta bancária', 'Conta destino',
      'Documento · tipo', 'Forma de pagamento', 'Observação']);
  });

  /* 15 linhas de campo (nenhuma some, nenhuma nasce — PR-CONC-MESA-ORDEM-03 só reordena) e as quatro faixas dos blocos. */
  it('são 15 linhas de campo, inclusive a Conta destino fora da transferência, e 4 faixas de bloco', () => {
    expect(ROTULOS_DA_GRADE).toHaveLength(15);
    expect(base.linhas.filter((l) => l.startsWith('linha-'))).toHaveLength(15);
    expect(base.linhas).toContain(`linha-Conta destino:${ALTURA_LINHA_COMPACTA}`);
    expect(base.slots).toHaveLength(15);
    expect(base.linhas.filter((l) => l.startsWith('faixa-'))).toEqual([
      `faixa-pagamento:${ALTURA_FAIXA_GRUPO}`, `faixa-identificacao:${ALTURA_FAIXA_GRUPO}`,
      `faixa-classificacao:${ALTURA_FAIXA_GRUPO}`, `faixa-complemento:${ALTURA_FAIXA_GRUPO}`]);
    expect(base.checklist).toBe(ALTURA_CHECKLIST);
  });

  it('o bloco compacto desce o texto ao piso (9,5px) e o normal fica na régua da tabela', () => {
    montar(vm(CRU), null);
    expect(screen.getByTestId('linha-Competência').className).toMatch(/text-\[9\.5px\]/);
    expect(screen.getByTestId('linha-Observação').className).toMatch(/text-\[9\.5px\]/);
    expect(screen.getByTestId('linha-Fornecedor').className).not.toMatch(/text-\[9\.5px\]/);
    /* a caixa "do extrato" acompanha o controle: 16px no compacto */
    expect(screen.getByTestId('extrato-Valor').className).toMatch(/\bh-4\b/);
  });

  it.each(ESTADOS)('%s: a assinatura é a mesma do cru', (_nome, r, atividade) => {
    const { container } = montar(r, atividade);
    expect(assinatura(container)).toEqual(base);
  });
});

describe('dicas e avisos moram nos slots, nunca em linha nova', () => {
  it('cru: a sugestão da forma e a marca da planilha estão DENTRO do slot da linha', () => {
    montar(vm(CRU, { excel_fornecedor: 'Bruno Suniga', planilha_favorecido_id: null }), null);
    const slotForma = within(screen.getByTestId('linha-Forma de pagamento')).getByTestId('slot-dica');
    expect(within(slotForma).getByTestId('rotulo-sugestao')).toHaveTextContent('pelo histórico do banco');
    const slotForn = within(screen.getByTestId('linha-Fornecedor')).getByTestId('slot-dica');
    expect(within(slotForn).getByTestId('marca-planilha')).toHaveTextContent('planilha: Bruno Suniga (não resolvido)');
    /* o "?" também */
    const slotPlano = within(screen.getByTestId('linha-Plano de contas')).getByTestId('slot-dica');
    expect(within(slotPlano).getByTestId('por-que-sugerido')).toBeInTheDocument();
  });

  it('o select da forma não tem nada ao lado dentro do campo (o rótulo não estreita o controle)', () => {
    montar(vm(CRU), null);
    const combo = within(screen.getByTestId('linha-Forma de pagamento')).getByRole('combobox');
    expect(combo.parentElement?.children).toHaveLength(1);
  });

  it('classificado: "planilha dizia" e o aviso de rateio vão à direita da linha do checklist', () => {
    montar(vm(CLASSIFICADO), null);
    const topo = screen.getByTestId('avisos-linha');
    expect(screen.getByTestId('checklist').contains(topo)).toBe(true);
    expect(within(topo).getByTestId('aviso-planilha-dizia')).toHaveTextContent('planilha dizia: Conta que não existe');
    expect(within(topo).getByTestId('aviso-plano-fazenda')).toBeInTheDocument();
    expect(topo.title).toContain('não existe no plano oficial');
  });

  it('plano incoerente: o motivo na linha do checklist e o campo marcado, sem linha nova', () => {
    montar(vm(CRU), 'administrativo');
    expect(within(screen.getByTestId('avisos-linha')).getByTestId('plano-incoerente')).toHaveTextContent('outra atividade');
    expect(within(screen.getByTestId('linha-Plano de contas')).getByTestId('plano-pendente')).toBeInTheDocument();
  });

  it('sem aviso, o lugar dos avisos continua lá (vazio) e a linha do checklist tem a mesma altura', () => {
    montar(vm(CRU, { excel_fazenda_codigo: null }), null);
    const topo = screen.getByTestId('avisos-linha');
    expect(topo).toBeEmptyDOMElement();
    expect(screen.getByTestId('checklist').style.height).toBe(ALTURA_CHECKLIST);
    expect(screen.queryByTestId('slot-aviso')).not.toBeInTheDocument();
  });

  it('fora da transferência a Conta destino é leitura "—" com o motivo no slot', () => {
    montar(vm(CRU), null);
    const l = screen.getByTestId('linha-Conta destino');
    expect(within(l).getByTestId('slot-dica')).toHaveTextContent('só em transferência');
    expect(within(l).queryByRole('combobox')).not.toBeInTheDocument();
  });
});
