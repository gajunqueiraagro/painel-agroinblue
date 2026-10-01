/**
 * PR-CONC-MESA-LAYOUT-FIXO-01 — a grade da Mesa é FIXA: trocar de linha (cru <-> classificado, transferência, gravada,
 * com e sem divergência) ou escolher um valor NUNCA muda largura de coluna, altura de linha, a presença de uma linha nem
 * o lugar das dicas e dos avisos.
 *
 * ⚠ O jsdom NÃO FAZ LAYOUT: aqui se prova o CONTRATO de que as medidas saem (colgroup, altura declarada de cada linha,
 *   largura do slot, slots sempre presentes, nenhuma linha condicional) — e que ele é o MESMO em todos os estados. A
 *   medida renderizada (offsetWidth/offsetTop no navegador) vai no relatório do PR.
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
  MesaCamposTabela, LARGURA_COL_CAMPO, LARGURA_COL_VAI_GRAVAR, LARGURA_SLOT_DICA, ALTURA_LINHA, ALTURA_SLOT_AVISO,
  ROTULOS_DA_GRADE, ALTURA_FAIXA_GRUPO, ALTURA_CHECKLIST,
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
    slotAviso: within(raiz).getByTestId('slot-aviso').style.height,
    checklist: within(raiz).getByTestId('checklist').style.height,
    /* o que vem DEPOIS da tabela dentro do painel — era aí que nascia o "planilha dizia" */
    irmaos: Array.from(raiz.querySelectorAll('[data-testid="grade-mesa"]')).map((t) => t.parentElement?.children.length),
  };
}

describe('a grade tem as mesmas medidas em todos os estados', () => {
  const base = (() => { const { container, unmount } = montar(vm(CRU), null); const a = assinatura(container); unmount(); return a; })();

  it('as medidas declaradas são as do colgroup, e toda linha tem 22px', () => {
    expect(base.colunas).toEqual([LARGURA_COL_CAMPO, '', '', LARGURA_COL_VAI_GRAVAR]);
    expect(base.linhas.filter((l) => l.startsWith('linha-')).every((l) => l.endsWith(`:${ALTURA_LINHA}`))).toBe(true);
    expect(base.slots.every((w) => w === LARGURA_SLOT_DICA)).toBe(true);
    expect(base.slotAviso).toBe(ALTURA_SLOT_AVISO);
    expect(base.irmaos).toEqual([1]);
  });

  /* PR-CONC-ENRIQUECER-V2-01 (Mesa compacta) — eram 17; Tipo/Data pgto./Valor/Conta bancária viraram "Pagamento" e
     Nº/Tipo de documento viraram "Documento · tipo": 13 linhas de campo, e as quatro faixas de título dos blocos. */
  it('são 13 linhas de campo, inclusive a Conta destino fora da transferência, e 4 faixas de bloco', () => {
    expect(ROTULOS_DA_GRADE).toHaveLength(13);
    expect(base.linhas.filter((l) => l.startsWith('linha-'))).toHaveLength(13);
    expect(base.linhas).toContain(`linha-Conta destino:${ALTURA_LINHA}`);
    expect(base.slots).toHaveLength(13);
    expect(base.linhas.filter((l) => l.startsWith('faixa-'))).toEqual([
      `faixa-extrato:${ALTURA_FAIXA_GRUPO}`, `faixa-datas:${ALTURA_FAIXA_GRUPO}`,
      `faixa-classificacao:${ALTURA_FAIXA_GRUPO}`, `faixa-identificacao:${ALTURA_FAIXA_GRUPO}`]);
    expect(base.checklist).toBe(ALTURA_CHECKLIST);
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
    const slotPlano = within(screen.getByTestId('linha-Conta do plano')).getByTestId('slot-dica');
    expect(within(slotPlano).getByTestId('por-que-sugerido')).toBeInTheDocument();
  });

  it('o select da forma não tem nada ao lado dentro do campo (o rótulo não estreita o controle)', () => {
    montar(vm(CRU), null);
    const combo = within(screen.getByTestId('linha-Forma de pagamento')).getByRole('combobox');
    expect(combo.parentElement?.children).toHaveLength(1);
  });

  it('classificado: "planilha dizia" e o aviso de rateio vão para o slot do topo', () => {
    montar(vm(CLASSIFICADO), null);
    const topo = screen.getByTestId('slot-aviso');
    expect(within(topo).getByTestId('aviso-planilha-dizia')).toHaveTextContent('planilha dizia: Conta que não existe');
    expect(within(topo).getByTestId('aviso-plano-fazenda')).toBeInTheDocument();
    expect(topo.title).toContain('não existe no plano oficial');
  });

  it('plano incoerente: o motivo no slot do topo e o campo marcado, sem linha nova', () => {
    montar(vm(CRU), 'administrativo');
    expect(within(screen.getByTestId('slot-aviso')).getByTestId('plano-incoerente')).toHaveTextContent('outra atividade');
    expect(within(screen.getByTestId('linha-Conta do plano')).getByTestId('plano-pendente')).toBeInTheDocument();
  });

  it('sem aviso, o slot do topo continua lá, vazio e da mesma altura', () => {
    montar(vm(CRU, { excel_fazenda_codigo: null }), null);
    const topo = screen.getByTestId('slot-aviso');
    expect(topo).toBeEmptyDOMElement();
    expect(topo.style.height).toBe(ALTURA_SLOT_AVISO);
  });

  it('fora da transferência a Conta destino é leitura "—" com o motivo no slot', () => {
    montar(vm(CRU), null);
    const l = screen.getByTestId('linha-Conta destino');
    expect(within(l).getByTestId('slot-dica')).toHaveTextContent('só em transferência');
    expect(within(l).queryByRole('combobox')).not.toBeInTheDocument();
  });
});
