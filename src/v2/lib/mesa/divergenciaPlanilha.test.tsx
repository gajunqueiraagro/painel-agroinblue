/**
 * PR-CONC-MESA-DIVERGENCIA-EXCEL-01 — a Mesa nunca cala quando a planilha discorda do Resultado.
 *
 * ⚠ O CASO É O DO PRINT (Gabriel, 30/09 18:18): NJ · BB −480,00 · Pix Paulo Henrique Pereira. A planilha diz
 *   "Faz Pureza" e competência 04/09/2026; o lançamento (cru do extrato) está em Administrativo, competência 01/09, e o
 *   plano proposto é "Salários e Encargos Pecuária". Os apelidos são os do banco (`fazendas.aliases` do NJ).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { toRowVM, filtrarPorGrupo } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { MesaCamposTabela } from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

const faz = (id: string, nome: string, codigo_importacao: string): Fazenda =>
  ({ id, nome, codigo_importacao, owner_id: 'o', cliente_id: 'nj' });
const PUREZA = faz('pureza', 'Faz. Pureza', 'PUR');
const ADM = faz('adm', 'Administrativo', 'ADM');
const FAZENDAS = [PUREZA, ADM];
const ALIASES = { pureza: ['Faz Pureza'], adm: ['Despesas Pessoais'] };

const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Mão de Obra', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Salários e Encargos Pecuária', 'pecuaria'), cls('Despesas Administrativas Gerais', 'administrativo')];

const PAULO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 'e1fdc0e4', lanc_id: 'a8a293f3', match_status: 'divergente',
  excel_valor: 480, excel_fazenda_codigo: 'Faz Pureza', excel_data: '2026-09-04',
  excel_data_pagamento: '2026-09-01', excel_data_vencimento: '2026-09-01',
  lanc_valor: 480, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_fazenda_id: 'adm', lanc_fazenda_nome: 'Administrativo',
  lanc_data_competencia: '2026-09-01', lanc_data_pagamento: '2026-09-01', lanc_data_vencimento: '2026-09-01',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
};
const vm = (sobre: Parameters<typeof linhaCrua>[0] = {}) =>
  toRowVM(linhaCrua({ ...PAULO, ...sobre }), [], { classificacoes: CLASSIF, fazendas: FAZENDAS, aliasesFazenda: ALIASES });
const planilha = (r: ReturnType<typeof vm>, campo: string) => r.divergenciasPlanilha.find((d) => d.campo === campo)?.planilha;

describe('Fazenda: o resolvedor do de-para, e a proposta âmbar', () => {
  it('"Faz Pureza" resolve pelo apelido e vira sugestão (difere do sistema Administrativo)', () => {
    const r = vm();
    expect(r.edicao.fazendaSugeridaId).toBe('pureza');
    // a sugestão é o Resultado: a planilha não diverge dele
    expect(planilha(r, 'Fazenda')).toBeUndefined();
  });

  it('com proposta anterior diferente (a "escolha" que gravou Administrativo): sem sugestão, e a marca aparece', () => {
    const r = vm({ proposto_fazenda_id: 'adm', proposto_fazenda_nome: 'Administrativo' });
    expect(r.edicao.fazendaSugeridaId).toBeNull();
    expect(planilha(r, 'Fazenda')).toBe('Faz. Pureza');
  });

  it('planilha igual ao sistema: nem sugestão, nem marca', () => {
    const r = vm({ lanc_fazenda_id: 'pureza', lanc_fazenda_nome: 'Faz. Pureza' });
    expect(r.edicao.fazendaSugeridaId).toBeNull();
    expect(planilha(r, 'Fazenda')).toBeUndefined();
  });

  it('texto que não resolve: a marca diz qual e que não foi reconhecida', () => {
    const r = vm({ excel_fazenda_codigo: 'Faz Inexistente' });
    expect(r.edicao.fazendaSugeridaId).toBeNull();
    expect(planilha(r, 'Fazenda')).toBe('Faz Inexistente (não reconhecida)');
  });

  it('sem catálogo (quem monta a view sem fazendas): nada é afirmado', () => {
    const r = toRowVM(linhaCrua(PAULO), []);
    expect(r.edicao.fazendaSugeridaId).toBeNull();
    expect(planilha(r, 'Fazenda')).toBeUndefined();
  });
});

describe('a marca "planilha: X" nos outros campos', () => {
  it('Competência: 04/09 na planilha, 01/09 no Resultado — marca; com a proposta igual, some', () => {
    expect(planilha(vm(), 'Competência')).toBe('04/09/2026');
    expect(planilha(vm({ proposto_data_competencia: '2026-09-04' }), 'Competência')).toBeUndefined();
  });

  it('Tipo pelo rótulo: "2-Saídas" × "2-Saídas" não diverge; "1-Entradas" × saída diverge', () => {
    expect(planilha(vm({ excel_tipo_operacao: '2-Saídas' }), 'Tipo')).toBeUndefined();
    expect(planilha(vm({ excel_tipo_operacao: '1-Entradas' }), 'Tipo')).toBe('Entrada');
  });

  it('Fornecedor só quando o Resultado ficou sem fornecedor', () => {
    expect(planilha(vm({ excel_fornecedor: 'Paulo Henrique' }), 'Fornecedor')).toBe('Paulo Henrique');
    expect(planilha(vm({ excel_fornecedor: 'Paulo Henrique', proposto_favorecido_id: 'f1' }), 'Fornecedor')).toBeUndefined();
  });

  it('linha sem lançamento: nenhuma marca (não há Resultado a comparar)', () => {
    expect(vm({ lanc_id: null }).divergenciasPlanilha).toEqual([]);
  });

  it('o contador filtra: "divergem da planilha" atravessa os grupos', () => {
    const a = vm(); const b = vm({ excel_data: '2026-09-01', lanc_fazenda_id: 'pureza' });
    expect(b.divergenciasPlanilha).toEqual([]);
    expect(filtrarPorGrupo([a, b], 'divergem_planilha')).toEqual([a]);
  });
});

describe('na tela', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
  });
  const montar = (r: ReturnType<typeof vm>) => render(
    <MesaCamposTabela row={r} classificacoes={CLASSIF} fazendas={FAZENDAS} onEditar={async () => {}} />);
  const linhaFazenda = () => screen.getByTitle('Fazenda').closest('div')!.parentElement!;

  it('sugestão: o Select mostra Faz. Pureza com moldura âmbar; sem marca e sem aviso de rateio', () => {
    montar(vm());
    const trig = within(linhaFazenda()).getByRole('combobox');
    expect(trig.textContent).toBe('Faz. Pureza');
    expect(trig.className).toContain('border-amber-500');
    expect(within(linhaFazenda()).queryByTestId('marca-planilha')).toBeNull();
    expect(screen.queryByTestId('aviso-plano-fazenda')).toBeNull();
  });

  it('proposta Administrativo: sem âmbar (não vai mudar), com "planilha: Faz. Pureza" e o aviso de rateio', () => {
    montar(vm({ proposto_fazenda_id: 'adm', proposto_fazenda_nome: 'Administrativo' }));
    const trig = within(linhaFazenda()).getByRole('combobox');
    expect(trig.textContent).toBe('Administrativo');
    expect(trig.className).not.toContain('border-amber-500');
    expect(within(linhaFazenda()).getByTestId('marca-planilha').textContent).toBe('planilha: Faz. Pureza');
    expect(screen.getByTestId('aviso-plano-fazenda').textContent)
      .toBe('conta do plano de pecuária na fazenda Administrativo — o rateio do DRE sai errado');
  });

  it('conta administrativa em Administrativo: sem aviso de rateio', () => {
    montar(vm({ proposto_subcentro: 'Despesas Administrativas Gerais', proposto_fazenda_id: 'adm' }));
    expect(screen.queryByTestId('aviso-plano-fazenda')).toBeNull();
  });
});
