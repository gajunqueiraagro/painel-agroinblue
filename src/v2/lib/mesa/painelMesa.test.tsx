/**
 * PR-CONC-MESA-PAINEL-V1 — o painel da linha da Mesa.
 *
 * ⚠ O QUE SE PROVA: nenhum verde fora do valor de uma entrada; o grupo do extrato só leitura e no topo; a Atividade
 *   filtrando a conta do plano e a conta de outra atividade virando pendente; a forma de pagamento pelo histórico do
 *   banco (casos reais do NJ) só no cru; o "?" com o "Sugerido por"; o selo cru/classificado; o valor legado fora da
 *   lista aparecendo como está.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { formaPagamentoPeloHistorico } from '@/v2/lib/mesa/formaPeloHistorico';
import { planoIncoerente, atividadeDoSubcentro } from '@/v2/lib/mesa/atividadeDaLinha';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import {
  MesaCamposTabela, SeloRegraDaLinha, CAMPOS_DO_EXTRATO, CAMPOS_OBRIGATORIOS_MESA, LARGURA_SELO,
} from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

const cls = (subcentro: string, escopo_negocio: string, tipo_operacao = '2-Saídas'): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Centro', tipo_operacao,
});
const CLASSIF = [
  cls('Salários e Encargos Pecuária', 'pecuaria'), cls('Seguros', 'administrativo'),
  cls('Adubos Lavoura', 'agricultura'), cls('Venda de Bois', 'pecuaria', '1-Entradas'),
];

/* O CRU do NJ: veio do OFX, ninguém classificou; a precedência do banco levou a planilha à proposta. */
const CRU: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cru', lanc_id: 'l-cru', match_status: 'divergente', lanc_origem_lancamento: 'ofx',
  lanc_descricao: 'Pagamento de Boleto - UNIPETRO M.S. DIST', excel_valor: 30000, lanc_valor: 30000,
  lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas', excel_fazenda_codigo: 'Faz Pureza',
  lanc_data_pagamento: '2026-09-10', excel_data_pagamento: '2026-09-10',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
  planilha_subcentro: 'Salários e Encargos Pecuária', proposto_origem_resolucao: 'alias', excel_produto: 'Vagão Kuhn',
};
/* O classificado: recorrência, conta do plano no lançamento — o sistema prevalece. */
const CLASSIFICADO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cl', lanc_id: 'l-cl', match_status: 'ja_classificado', lanc_origem_lancamento: 'recorrencia',
  lanc_descricao: 'Pix - Enviado', lanc_valor: 841.48, excel_valor: 841.48, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_subcentro_atual: 'Seguros', lanc_plano_conta_id_atual: 'pc-seg',
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF });
const montar = (r: ReturnType<typeof vm>, extra: { atividade?: string | null } = {}) => render(
  <MesaCamposTabela row={r} classificacoes={CLASSIF} onEditar={vi.fn(() => Promise.resolve())}
    onAtividade={vi.fn()} atividade={extra.atividade ?? null} />,
);
/* A linha da tabela pelo rótulo (o `title` do rótulo é o nome do campo). */
const linha = (rotulo: string) => {
  const el = screen.getByTitle(rotulo).parentElement;
  if (!el) throw new Error(`sem linha ${rotulo}`);
  return el;
};
const verdes = (raiz: HTMLElement) => Array.from(raiz.querySelectorAll('[class*="emerald"], [class*="green"]'));

describe('item 1 — cabeçalho e nenhum verde fora do valor de uma entrada', () => {
  it('as colunas são Campo | Planilha | Sistema hoje | Vai gravar, e "Vai gravar" é neutro', () => {
    montar(vm(CRU));
    const cab = screen.getByTestId('cabecalho-vai-gravar');
    expect(cab).toHaveTextContent('Vai gravar');
    expect(cab.className).not.toMatch(/emerald|green/);
    for (const t of ['Campo', 'Planilha · referência', 'Sistema hoje']) expect(screen.getByText(t)).toBeInTheDocument();
    /* PR-CONC-ENRIQUECER-V2-02 — o cabeçalho diz quem manda: navy no sistema, azul-claro na planilha (referência) */
    expect(screen.getByTestId('cabecalho-planilha').className).toMatch(/bg-blue-100/);
    expect(screen.getByTestId('cabecalho-planilha').className).toMatch(/text-blue-900/);
    for (const t of ['Campo', 'Sistema hoje', 'Vai gravar']) expect(screen.getByText(t).className).toMatch(/bg-primary text-primary-foreground|bg-primary .*text-primary-foreground/);
    expect(screen.queryByText('Resultado')).not.toBeInTheDocument();
  });

  it('numa SAÍDA não há verde nenhum, nem no "confere" (Produto igual nos dois lados)', () => {
    const { container } = montar(vm(CLASSIFICADO, { excel_produto: 'Pix - Enviado' }));
    expect(verdes(container)).toHaveLength(0);
  });

  it('numa ENTRADA o único verde é o valor, nas três colunas', () => {
    const { container } = montar(vm(CLASSIFICADO, {
      lanc_sinal: '1', lanc_tipo_operacao: '1-Entradas', lanc_subcentro_atual: 'Venda de Bois', excel_valor: 5000,
      lanc_valor: 5000,
    }));
    const v = verdes(container);
    expect(v.length).toBeGreaterThanOrEqual(3);
    for (const el of v) expect(el.textContent).toMatch(/5\.000,00/);
    /* PR-CONC-ENRIQUECER-V2-01 — o Tipo saiu como linha (a cor do valor diz o sentido); o checklist não é verde */
    expect(verdes(screen.getByTestId('checklist'))).toHaveLength(0);
  });

  it('a SAÍDA pinta o valor de vermelho nas três colunas', () => {
    montar(vm(CLASSIFICADO));
    /* PR-CONC-ENRIQUECER-V2-02 — o valor tem linha própria de novo; data e conta, neutras */
    const vermelhos = within(linha('Valor')).getAllByText(/841,48/).filter((el) => /red/.test(el.className));
    expect(vermelhos).toHaveLength(3);
    for (const rot of ['Data pgto.', 'Conta bancária']) {
      /* o asterisco do obrigatório é vermelho por regra própria; o que se olha são os VALORES */
      const coloridos = Array.from(linha(rot).querySelectorAll('[class*="red"], [class*="emerald"]'))
        .filter((el) => el.textContent?.trim() !== '*');
      expect(coloridos).toHaveLength(0);
    }
  });
});

describe('item 2 — o grupo do extrato é só leitura e vem no topo', () => {
  /* PR-CONC-ENRIQUECER-V2-02 — uma informação por linha: Data pgto., Valor e Conta bancária, no topo; "Pagamento" é só
     o título do bloco e o item do checklist, não linha da grade. */
  /* PR-CONC-MESA-ORDEM-03 — o bloco do topo é "Datas e pagamento" (a ordem do Novo lançamento): as duas datas editáveis
     primeiro, depois Data pgto., Valor e Conta bancária, que são as do extrato (marca explícita, não o bloco). */
  it('Data pgto., Valor e Conta bancária vêm logo depois das datas, no bloco "Datas e pagamento"', () => {
    expect(CAMPOS_DO_EXTRATO).toEqual(['Data pgto.', 'Valor', 'Conta bancária']);
    const { container } = montar(vm(CRU));
    const rotulos = Array.from(container.querySelectorAll('td[title]'))
      .map((el) => el.getAttribute('title'))
      .filter((t): t is string => !!t && [...CAMPOS_DO_EXTRATO, 'Competência', 'Data venc.', 'Atividade'].includes(t));
    expect(rotulos.slice(0, 5)).toEqual(['Competência', 'Data venc.', 'Data pgto.', 'Valor', 'Conta bancária']);
    expect(screen.queryByTitle('Pagamento')).not.toBeInTheDocument();
    expect(screen.getByTestId('faixa-pagamento')).toHaveTextContent('Datas e pagamento');
    expect(within(linha('Valor')).getAllByText(/30\.000,00/).length).toBeGreaterThanOrEqual(1);
    expect(within(linha('Data pgto.')).getAllByText(/10\/09/).length).toBeGreaterThanOrEqual(1);
  });

  it('cada um é caixa tracejada, com "do extrato" no slot da dica, sem controle nenhum', () => {
    montar(vm(CRU));
    for (const rot of CAMPOS_DO_EXTRATO) {
      const caixa = screen.getByTestId(`extrato-${rot}`);
      expect(caixa.className).toMatch(/border-dashed/);
      expect(within(linha(rot)).getByTestId('slot-dica')).toHaveTextContent('do extrato');
      expect(within(linha(rot)).queryByRole('combobox')).not.toBeInTheDocument();
      expect(within(linha(rot)).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('Situação saiu da tabela', () => {
    montar(vm(CRU, { lanc_status: 'realizado' }));
    expect(screen.queryByTitle('Situação')).not.toBeInTheDocument();
  });
});

describe('item 3 — Atividade filtra a conta do plano; plano de outra atividade vira pendente', () => {
  it('a proposta é o escopo da conta resolvida, e é obrigatória', () => {
    expect(vm(CRU).edicao.atividadeProposta).toBe('pecuaria');
    expect(vm(CLASSIFICADO).edicao.atividadeProposta).toBe('administrativo');
    expect(CAMPOS_OBRIGATORIOS_MESA).toContain('Atividade');
  });

  it('a Planilha mostra a atividade com a fazenda dela entre parênteses', () => {
    montar(vm(CRU));
    expect(within(linha('Atividade')).getByText('Pecuária (Faz Pureza)')).toBeInTheDocument();
  });

  it('a lista da conta do plano encolhe para a atividade escolhida', () => {
    montar(vm(CRU), { atividade: 'administrativo' });
    fireEvent.click(within(linha('Plano de contas')).getByRole('combobox'));
    expect(screen.getByText('Seguros')).toBeInTheDocument();
    expect(screen.queryByText('Adubos Lavoura')).not.toBeInTheDocument();
  });

  it('sem escolha, a lista é a da atividade proposta (pecuária)', () => {
    montar(vm(CRU));
    fireEvent.click(within(linha('Plano de contas')).getByRole('combobox'));
    expect(screen.queryByText('Seguros')).not.toBeInTheDocument();
    expect(screen.queryByText('Adubos Lavoura')).not.toBeInTheDocument();
  });

  it('conta de pecuária com a atividade "administrativo" fica PENDENTE e diz por quê', () => {
    montar(vm(CRU), { atividade: 'administrativo' });
    expect(screen.getByTestId('plano-pendente')).toBeInTheDocument();
    expect(screen.getByTestId('plano-incoerente')).toHaveTextContent('outra atividade');
  });

  it('com a atividade da conta, nada fica pendente', () => {
    montar(vm(CRU), { atividade: 'pecuaria' });
    expect(screen.queryByTestId('plano-pendente')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plano-incoerente')).not.toBeInTheDocument();
  });

  it('planoIncoerente — a regra que a tabela pinta e a aba cobra no Salvar', () => {
    expect(planoIncoerente(CLASSIF, 'Salários e Encargos Pecuária', 'administrativo')).toBe(true);
    expect(planoIncoerente(CLASSIF, 'Salários e Encargos Pecuária', 'pecuaria')).toBe(false);
    expect(planoIncoerente(CLASSIF, 'conta fora do plano', 'pecuaria')).toBe(true);
    expect(planoIncoerente(CLASSIF, null, 'pecuaria')).toBe(false);
    expect(planoIncoerente(CLASSIF, 'Seguros', null)).toBe(false);
    expect(atividadeDoSubcentro(CLASSIF, 'conta fora do plano')).toBeNull();
  });
});

describe('item 4 — forma de pagamento pelo histórico do banco (só no cru)', () => {
  it.each([
    ['Pix - Enviado', 'PIX'],
    ['Pagamento de Boleto - UNIPETRO M.S. DIST', 'Boleto'],
    ['Compra com Cartão - FRADELLI', 'Cartão'],
    ['Compra com Cart�o - 21/09 14:35 SERTAO M', 'Cartão'],
    ['PAGAMENTO PIX-PIX_DEB   15412257000128 G', 'PIX'],
    ['PIX ENVIADO NATALINO CAVALLI JUNIOR', 'PIX'],
    ['TED RECEBIDA 237.2372.FORTUNCERES', 'Transferência'],
    ['Transferência enviada', 'Transferência'],
    ['Pagamento de Boleto - PIX COMERCIO', 'Boleto'],
  ])('%s -> %s', (h, forma) => {
    expect(formaPagamentoPeloHistorico(h)).toBe(forma);
  });

  it.each([
    'RENDIMENTOS REND PAGO APLIC AUT MAIS', 'Pagamento de Impostos - RFB-DARF', 'Tedesco Comercio', '', null,
  ])('%s -> nada', (h) => {
    expect(formaPagamentoPeloHistorico(h)).toBeNull();
  });

  it('o CRU sugere; o classificado e o cru que já tem forma não', () => {
    expect(vm(CRU).edicao.formaPagamentoSugerida).toBe('Boleto');
    expect(vm(CLASSIFICADO).edicao.formaPagamentoSugerida).toBeNull();
    expect(vm(CRU, { lanc_forma_pagamento: 'PIX' }).edicao.formaPagamentoSugerida).toBeNull();
    expect(vm(CRU, { proposto_forma_pagamento: 'Dinheiro' }).edicao.formaPagamentoSugerida).toBeNull();
    /* transferência não é cru, como no banco */
    expect(vm(CRU, { lanc_tipo_operacao: '3-Transferências' }).edicao.formaPagamentoSugerida).toBeNull();
  });

  it('a sugestão aparece em âmbar com "pelo histórico do banco"', () => {
    montar(vm(CRU));
    const l = linha('Forma de pagamento');
    expect(within(l).getByTestId('rotulo-sugestao')).toHaveTextContent('pelo histórico do banco');
    expect(within(l).getByRole('combobox')).toHaveTextContent('Boleto');
    expect(within(l).getByRole('combobox').className).toMatch(/amber/);
  });

  it('no classificado, o valor legado fora da lista aparece como está, sem sugestão', () => {
    montar(vm(CLASSIFICADO, { lanc_forma_pagamento: 'PIX/Transferência Bancária' }));
    const l = linha('Forma de pagamento');
    expect(within(l).getByRole('combobox')).toHaveTextContent('PIX/Transferência Bancária');
    /* o gatilho mostra o valor como está gravado — o " · valor atual" é só do item da lista */
    expect(within(l).getByRole('combobox')).not.toHaveTextContent('valor atual');
    expect(within(l).queryByTestId('rotulo-sugestao')).not.toBeInTheDocument();
  });

  it('tipo de documento e forma entram no "o que muda" e na leitura do sistema', () => {
    const r = vm(CLASSIFICADO, { proposto_tipo_documento: 'Nota Fiscal', lanc_tipo_documento: 'Recibo' });
    expect(r.edicao.tipoDocumento).toBe('Nota Fiscal');
    expect(r.edicao.tipoDocumentoAtual).toBe('Recibo');
    montar(r);
    /* PR-CONC-ENRIQUECER-V2-01 — "Documento · tipo" numa linha: o nº é texto, o tipo é o combobox */
    expect(within(linha('Documento · tipo')).getByRole('combobox')).toHaveTextContent('Nota Fiscal');
  });
});

describe('item 5 — o "?" no lugar do "Sugerido por", e sem legenda', () => {
  it('o "?" ao lado da Conta do plano leva a frase no tooltip', () => {
    montar(vm(CRU));
    const q = within(linha('Plano de contas')).getByTestId('por-que-sugerido');
    expect(q).toHaveTextContent('?');
    expect(q).toHaveAttribute('title', 'Sugerido por: apelido que você ensinou (Vagão Kuhn)');
  });

  it('a legenda saiu', () => {
    montar(vm(CRU));
    expect(screen.queryByText(/faixa âmbar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/gravam a mesma coisa/)).not.toBeInTheDocument();
  });
});

describe('item 6 — o selo da regra da linha', () => {
  it('cru, classificado e sem lançamento', () => {
    expect(vm(CRU).ehCru).toBe(true);
    expect(vm(CLASSIFICADO).ehCru).toBe(false);
    expect(vm(CRU, { lanc_origem_lancamento: 'manual' }).ehCru).toBe(false);
    expect(vm(CRU, { lanc_id: null }).ehCru).toBeNull();

    const { rerender, container } = render(<SeloRegraDaLinha ehCru />);
    expect(screen.getByTestId('selo-regra')).toHaveTextContent('cru · planilha prevalece');
    rerender(<SeloRegraDaLinha ehCru={false} />);
    expect(screen.getByTestId('selo-regra')).toHaveTextContent('classificado · sistema prevalece');
    rerender(<SeloRegraDaLinha ehCru={null} />);
    /* sem lançamento não há selo — mas o lugar fica, da mesma largura (LAYOUT-FIXO-01) */
    expect(screen.queryByTestId('selo-regra')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="selo-regra-vazio"]')).toHaveStyle({ width: LARGURA_SELO });
  });
});
