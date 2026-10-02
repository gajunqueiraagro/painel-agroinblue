/**
 * PR-CONC-ENRIQ-SAFRA-COMPETENCIA — a safra da competência na Mesa (a regra é do banco; a tela só lê a view).
 *
 * ⚠ O QUE SE PROVA: a sugestão de safra da linha sem safra vem da coluna da view (sem segunda regra no front); a dica
 *   âmbar "competência é da X" quando a safra que vai gravar não contém a competência, e o clique aplica pelo caminho de
 *   sempre (`onEditar({ safra_id })`); sem candidata, só o aviso; quando o banco trocou a safra no cru de pecuária, a dica
 *   neutra "pela competência · planilha: X" no lugar da marca "planilha: X"; nada disso entra no checklist; a linha Safra
 *   não muda de altura nem o slot de largura.
 * ⚠ O jsdom NÃO MEDE: altura e largura são contrato de estilo (a mesma linha, o mesmo slot); a medida vai no relatório.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import {
  MesaCamposTabela, checklistDaLinha, pendenciasDaLinha, ALTURA_LINHA, LARGURA_SLOT_DICA,
} from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável',
  centro_custo: 'Centro', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Nutrição', 'pecuaria'), cls('Fertilizantes Agricultura', 'agricultura')];
const SAFRAS: Safra[] = [
  { id: 's2526p', nome: 'Pecuária 25/26', ativa: true, codigo: '25/26-Pec', escopo_negocio: 'pecuaria' },
  { id: 's2627p', nome: 'Pecuária 26/27', ativa: true, codigo: '26/27-Pec', escopo_negocio: 'pecuaria' },
  { id: 's2526l', nome: 'Lavoura 25/26', ativa: true, codigo: '25/26-Lav', escopo_negocio: 'agricultura' },
  { id: 's2627l', nome: 'Lavoura 26/27', ativa: true, codigo: '26/27-Lav', escopo_negocio: 'agricultura' },
];

/* Classificado de pecuária com a safra do sistema fora do período da competência (setembro/26 na 25/26). */
const CLASSIFICADO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cl', lanc_id: 'l-cl', match_status: 'ja_classificado', lanc_origem_lancamento: 'recorrencia',
  lanc_descricao: 'Suplemento', lanc_valor: 2400, excel_valor: 2400, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_data_pagamento: '2026-09-22', excel_data_pagamento: '2026-09-22', lanc_data_competencia: '2026-09-19',
  lanc_subcentro_atual: 'Nutrição', lanc_plano_conta_id_atual: 'Nutrição', lanc_fazenda_id: 'pureza',
  lanc_conta_bancaria_id: 'bb', lanc_conta_bancaria_nome: 'Banco do Brasil',
  lanc_safra_id: 's2526p', safra_da_competencia_id: 's2627p', safra_fora_do_periodo: true,
};
/* O cru de pecuária em que o banco trocou a safra da planilha (25/26) pela da competência (26/27). */
const CRU_TROCADO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cru', lanc_id: 'l-cru', match_status: 'divergente', lanc_origem_lancamento: 'ofx',
  lanc_descricao: 'Pagamento de Boleto', lanc_valor: 354.88, excel_valor: 354.88, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_data_pagamento: '2026-09-18', excel_data_pagamento: '2026-09-18', proposto_data_competencia: '2026-09-19',
  proposto_subcentro: 'Nutrição', proposto_subcentro_existe_no_plano: true, proposto_fazenda_id: 'pureza',
  proposto_safra_id: 's2627p', planilha_safra_id: 's2526p', safra_da_competencia_id: 's2627p', safra_fora_do_periodo: false,
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF, safras: SAFRAS });
const montar = (r: ReturnType<typeof vm>, onEditar = vi.fn(() => Promise.resolve())) => {
  render(<MesaCamposTabela row={r} classificacoes={CLASSIF} safras={SAFRAS} onEditar={onEditar}
    onAtividade={vi.fn()} atividade={null} />);
  return onEditar;
};
const linhaSafra = () => screen.getByTestId('linha-Safra');

describe('a sugestão de safra (D7) — a coluna da view, sem segunda regra', () => {
  it('sem safra em lugar nenhum: a sugestão é a safra da competência que a view deu', () => {
    const r = vm(CLASSIFICADO, { lanc_safra_id: null, safra_fora_do_periodo: null });
    expect(r.edicao.safraSugeridaId).toBe('s2627p');
  });

  it('a view sem candidata (nulo) -> sem sugestão, mesmo com o catálogo que a regra antiga usaria', () => {
    expect(vm(CLASSIFICADO, { lanc_safra_id: null, safra_da_competencia_id: null }).edicao.safraSugeridaId).toBeNull();
  });

  it('com safra no lançamento ou na proposta: nada a sugerir', () => {
    expect(vm(CLASSIFICADO).edicao.safraSugeridaId).toBeNull();
    expect(vm(CRU_TROCADO).edicao.safraSugeridaId).toBeNull();
  });
});

describe('as dicas da linha Safra (D5)', () => {
  it('pecuária fora do período: "competência: 26/27-Pec" em âmbar, a frase no title, e o clique aplica pelo editar de sempre', () => {
    const onEditar = montar(vm(CLASSIFICADO));
    const dica = within(linhaSafra()).getByTestId('dica-safra-competencia');
    expect(dica).toHaveTextContent(/^competência: 26\/27-Pec$/);
    expect(dica.tagName).toBe('BUTTON');
    expect(dica.className).toMatch(/amber/);
    expect(dica.getAttribute('title') ?? within(linhaSafra()).getByTestId('slot-dica').getAttribute('title'))
      .toMatch(/A competência que vai ser gravada é da safra 26\/27-Pec, e a escolhida não a contém/);
    fireEvent.click(dica);
    expect(onEditar).toHaveBeenCalledWith({ safra_id: 's2627p' });
  });

  it('lavoura fora do período: o aviso é SÓ TEXTO, em âmbar — nada a clicar (a safra atravessa o ano)', () => {
    const onEditar = montar(vm(CLASSIFICADO, {
      lanc_subcentro_atual: 'Fertilizantes Agricultura', lanc_plano_conta_id_atual: 'Fertilizantes Agricultura',
      lanc_safra_id: 's2526l', safra_da_competencia_id: 's2627l',
    }));
    const dica = within(linhaSafra()).getByTestId('dica-safra-competencia');
    expect(dica).toHaveTextContent(/^competência: 26\/27-Lav$/);
    expect(dica.tagName).toBe('SPAN');
    expect(dica.className).toMatch(/amber/);
    expect(within(linhaSafra()).getByTestId('slot-dica').getAttribute('title')).toMatch(/Na lavoura a safra atravessa o ano/);
    fireEvent.click(dica);
    expect(onEditar).not.toHaveBeenCalled();
  });

  it('vale também na linha gravada (o sistema prevalece; a correção é o gesto do operador)', () => {
    const onEditar = montar(vm(CLASSIFICADO, { aplicado: true, aplicado_em: '2026-10-02T17:00:00Z' }));
    fireEvent.click(within(linhaSafra()).getByTestId('dica-safra-competencia'));
    expect(onEditar).toHaveBeenCalledWith({ safra_id: 's2627p' });
  });

  it('fora do período sem safra candidata: só o aviso, nada a clicar', () => {
    montar(vm(CLASSIFICADO, { safra_da_competencia_id: null }));
    const dica = within(linhaSafra()).getByTestId('dica-safra-fora');
    expect(dica).toHaveTextContent(/^fora do período$/);
    expect(within(linhaSafra()).getByTestId('slot-dica').getAttribute('title')).toMatch(/nenhuma safra da atividade a contém/);
    expect(dica.tagName).toBe('SPAN');
    expect(within(linhaSafra()).queryByTestId('dica-safra-competencia')).toBeNull();
  });

  it('o banco trocou a safra no cru de pecuária: "pela competência", a planilha só no title, sem âmbar e sem a marca repetida', () => {
    montar(vm(CRU_TROCADO));
    const dica = within(linhaSafra()).getByTestId('dica-safra-pela-competencia');
    expect(dica).toHaveTextContent(/^pela competência$/);
    expect(within(linhaSafra()).getByTestId('slot-dica').getAttribute('title')).toMatch(/pela competência · planilha: 25\/26-Pec/);
    expect(dica.className).not.toMatch(/amber/);
    expect(within(linhaSafra()).queryByTestId('marca-planilha')).toBeNull();
    expect(within(linhaSafra()).queryByTestId('dica-safra-competencia')).toBeNull();
  });

  it('aviso e marca da planilha juntos: UMA dica no slot (o aviso), a marca vai inteira no title — nada corta', () => {
    /* controle: a busca sabe achar — dentro do período a marca "planilha: X" aparece no slot */
    const { unmount } = render(<MesaCamposTabela row={vm(CLASSIFICADO, { planilha_safra_id: 's2627p', excel_safra: 'Pecuária 2026/2027',
      safra_fora_do_periodo: false })} classificacoes={CLASSIF} safras={SAFRAS} onEditar={vi.fn(() => Promise.resolve())}
      onAtividade={vi.fn()} atividade={null} />);
    expect(within(within(linhaSafra()).getByTestId('slot-dica')).getByTestId('marca-planilha')).toBeInTheDocument();
    unmount();
    montar(vm(CLASSIFICADO, { planilha_safra_id: 's2627p', excel_safra: 'Pecuária 2026/2027' }));
    const slot = within(linhaSafra()).getByTestId('slot-dica');
    expect(within(slot).getByTestId('dica-safra-competencia')).toBeInTheDocument();
    expect(within(slot).queryByTestId('marca-planilha')).toBeNull();
    expect(slot.children).toHaveLength(1);
    expect(slot.getAttribute('title')).toMatch(/planilha: /);
  });

  it('dentro do período e sem troca: nenhuma das três dicas', () => {
    montar(vm(CLASSIFICADO, { lanc_safra_id: 's2627p', safra_fora_do_periodo: false }));
    for (const id of ['dica-safra-competencia', 'dica-safra-fora', 'dica-safra-pela-competencia']) {
      expect(within(linhaSafra()).queryByTestId(id)).toBeNull();
    }
  });
});

describe('nunca é pendência (D8) e nada muda de lugar', () => {
  it('o checklist e o "falta:" são os mesmos com a safra dentro e fora do período', () => {
    const fora = vm(CLASSIFICADO);
    const dentro = vm(CLASSIFICADO, { lanc_safra_id: 's2627p', safra_fora_do_periodo: false });
    expect(checklistDaLinha(fora, { classificacoes: CLASSIF })).toEqual(checklistDaLinha(dentro, { classificacoes: CLASSIF }));
    expect(pendenciasDaLinha(fora, { classificacoes: CLASSIF })).toEqual([]);
  });

  it('a linha Safra tem a mesma altura e o slot a mesma largura, com e sem a dica', () => {
    const { unmount } = render(<MesaCamposTabela row={vm(CLASSIFICADO)} classificacoes={CLASSIF} safras={SAFRAS}
      onEditar={vi.fn(() => Promise.resolve())} onAtividade={vi.fn()} atividade={null} />);
    const comDica = { h: linhaSafra().style.height, w: within(linhaSafra()).getByTestId('slot-dica').style.width };
    unmount();
    montar(vm(CLASSIFICADO, { lanc_safra_id: 's2627p', safra_fora_do_periodo: false }));
    const semDica = { h: linhaSafra().style.height, w: within(linhaSafra()).getByTestId('slot-dica').style.width };
    expect(comDica).toEqual(semDica);
    expect(comDica).toEqual({ h: ALTURA_LINHA, w: LARGURA_SLOT_DICA });
  });

  it('a dica que aplica é botão SEM caixa: sem padding, sem borda, na mesma linha', () => {
    montar(vm(CLASSIFICADO));
    const b = within(linhaSafra()).getByTestId('dica-safra-competencia');
    expect(b.tagName).toBe('BUTTON');
    expect(b.className).toMatch(/\bp-0\b/);
    expect(b.className).not.toMatch(/\bborder\b|\bpx-|\bpy-|\bh-\d/);
  });
});
