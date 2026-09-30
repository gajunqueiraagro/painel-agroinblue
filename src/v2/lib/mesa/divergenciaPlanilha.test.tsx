/**
 * PR-CONC-MESA-DIVERGENCIA-EXCEL-01 e PR-CONC-MESA-CRU-EXCEL-PREVALECE-01 — a Mesa renderiza o que o banco decidiu e
 * nunca cala quando a planilha discorda do Resultado.
 *
 * ⚠ QUEM DECIDE É O BANCO (`_fn_classificacao_precedencia_cru`, provado no ROLLBACK do PR): no CRU a planilha vai para a
 *   proposta; no JÁ CLASSIFICADO o sistema fica e a leitura da planilha vem em `planilha_*`. Aqui as linhas chegam como a
 *   view as entrega DEPOIS do banco, e se prova a tela: a marca, o "(não resolvido)", o contador só de classificação e o
 *   fornecedor que nunca aparece vazio com valor no sistema.
 * ⚠ OS CASOS SÃO OS DOS PRINTS: Paulo Henrique (−480,00, "Faz Pureza", competência 04/09) e o seguro Ouro Vida
 *   (−841,48, fornecedor "Banco do Brasil" → "Banco do Brasil S.A. (001)").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { toRowVM, filtrarPorGrupo } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { MesaCamposTabela } from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

const faz = (id: string, nome: string, codigo_importacao: string): Fazenda =>
  ({ id, nome, codigo_importacao, owner_id: 'o', cliente_id: 'nj' });
const FAZENDAS = [faz('pureza', 'Faz. Pureza', 'PUR'), faz('adm', 'Administrativo', 'ADM')];
const ALIASES = { pureza: ['Faz Pureza'], adm: ['Despesas Pessoais'] };

const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Mão de Obra', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Salários e Encargos Pecuária', 'pecuaria'), cls('Despesas Administrativas Gerais', 'administrativo'),
  cls('Seguros', 'administrativo')];

const forn = (id: string, nome: string): FornecedorV2 => ({
  id, nome, cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null,
  banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null,
  observacao_pagamento: null,
});

/* O Paulo, como a view o entrega DEPOIS da precedência: é CRU, então a planilha subiu para a proposta. */
const PAULO_CRU: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 'e1fdc0e4', lanc_id: 'a8a293f3', match_status: 'divergente', lanc_origem_lancamento: 'extrato',
  excel_valor: 480, excel_fazenda_codigo: 'Faz Pureza', excel_data: '2026-09-04', excel_documento: 'FOLHA-09',
  excel_fornecedor: 'Paulo Henrique', excel_data_pagamento: '2026-09-01', excel_data_vencimento: '2026-09-05',
  lanc_valor: 480, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_fazenda_id: 'adm', lanc_fazenda_nome: 'Administrativo', lanc_data_competencia: '2026-09-01',
  lanc_data_pagamento: '2026-09-01', lanc_data_vencimento: '2026-09-01',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
  proposto_fazenda_id: 'pureza', proposto_fazenda_nome: 'Faz. Pureza', proposto_data_competencia: '2026-09-04',
  proposto_data_vencimento: '2026-09-05', proposto_numero_documento: 'FOLHA-09',
  proposto_favorecido_id: 'paulo', proposto_favorecido_nome: 'Paulo Henrique Pereira',
  planilha_fazenda_id: 'pureza', planilha_fazenda_nome: 'Faz. Pureza', planilha_favorecido_id: 'paulo',
  planilha_favorecido_nome: 'Paulo Henrique Pereira', planilha_subcentro: 'Salários e Encargos Pecuária',
};
/* O seguro, JÁ CLASSIFICADO: o banco tirou a classificação do topo; a planilha só está em `planilha_*`. */
const SEGURO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 'seg', lanc_id: 'l-seg', match_status: 'ja_classificado', lanc_origem_lancamento: 'recorrencia',
  excel_valor: 841.48, excel_fornecedor: 'Banco do Brasil', excel_data: '2026-09-01', excel_fazenda_codigo: 'Faz Pureza',
  lanc_valor: 841.48, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_subcentro_atual: 'Seguros', lanc_favorecido_id_atual: 'bbsa', lanc_favorecido_nome_atual: 'Banco do Brasil S.A. (001)',
  lanc_fazenda_id: 'adm', lanc_fazenda_nome: 'Administrativo', lanc_data_competencia: '2026-09-01',
  planilha_favorecido_id: 'bbsa', planilha_favorecido_nome: 'Banco do Brasil S.A. (001)',
  planilha_fazenda_id: 'pureza', planilha_fazenda_nome: 'Faz. Pureza', planilha_subcentro: 'Salários e Encargos Pecuária',
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF, fazendas: FAZENDAS, aliasesFazenda: ALIASES });
const marca = (r: ReturnType<typeof vm>, campo: string) => r.divergenciasPlanilha.find((d) => d.campo === campo);

describe('o CRU: a planilha já é o Resultado (o banco a pôs na proposta)', () => {
  it('fazenda, fornecedor, competência, vencimento, documento e plano da planilha: nenhuma marca, fora do contador', () => {
    const r = vm(PAULO_CRU);
    for (const c of ['Fazenda', 'Fornecedor', 'Competência', 'Data vencimento', 'Documento', 'Subcentro']) {
      expect(marca(r, c), c).toBeUndefined();
    }
    expect(filtrarPorGrupo([r], 'divergem_planilha')).toEqual([]);
  });

  it('pagamento continua do extrato: a planilha diferente vira marca, mas não conta', () => {
    const r = vm(PAULO_CRU, { excel_data_pagamento: '2026-09-02' });
    expect(marca(r, 'Data pagamento')).toEqual({ campo: 'Data pagamento', planilha: '02/09/2026', contador: false });
  });
});

describe('o JÁ CLASSIFICADO: o sistema prevalece e a divergência aparece', () => {
  it('fazenda, conta do plano e competência: marca com o que a planilha resolveu, e contam', () => {
    const r = vm(SEGURO, { excel_data: '2026-09-04' });
    expect(marca(r, 'Fazenda')).toEqual({ campo: 'Fazenda', planilha: 'Faz. Pureza', contador: true });
    expect(marca(r, 'Subcentro')).toEqual({ campo: 'Subcentro', planilha: 'Salários e Encargos Pecuária', contador: true });
    expect(marca(r, 'Competência')).toEqual({ campo: 'Competência', planilha: '04/09/2026', contador: true });
    expect(filtrarPorGrupo([r], 'divergem_planilha')).toEqual([r]);
  });

  it('fornecedor igual ao do sistema (o apelido resolveu "Banco do Brasil"): sem marca', () => {
    expect(marca(vm(SEGURO), 'Fornecedor')).toBeUndefined();
  });

  it('fornecedor resolvido e diferente do sistema: marca com o nome do cadastro, e conta', () => {
    const r = vm(SEGURO, { planilha_favorecido_id: 'outro', planilha_favorecido_nome: 'Outro Fornecedor' });
    expect(marca(r, 'Fornecedor')).toEqual({ campo: 'Fornecedor', planilha: 'Outro Fornecedor', contador: true });
  });
});

describe('não resolvido nunca esvazia', () => {
  it('fornecedor que a planilha não resolve: "(não resolvido)", o Resultado segue o do sistema, fora do contador', () => {
    const r = vm(SEGURO, { planilha_favorecido_id: null, planilha_favorecido_nome: null, planilha_fazenda_id: 'adm',
      planilha_subcentro: null, excel_fazenda_codigo: 'Administrativo' });
    expect(marca(r, 'Fornecedor')).toEqual({ campo: 'Fornecedor', planilha: 'Banco do Brasil (não resolvido)', contador: false });
    expect(r.edicao.favorecidoId).toBeNull();
    expect(r.edicao.favorecidoIdAtual).toBe('bbsa');
    expect(filtrarPorGrupo([r], 'divergem_planilha')).toEqual([]);
  });

  it('fazenda que não resolve (a reserva do front também não acha): "(não resolvido)"', () => {
    const r = vm(SEGURO, { planilha_fazenda_id: null, excel_fazenda_codigo: 'Faz Inexistente' });
    expect(marca(r, 'Fazenda')).toEqual({ campo: 'Fazenda', planilha: 'Faz Inexistente (não resolvido)', contador: false });
  });

  it('sessão antiga (sem `_planilha`): a reserva do front resolve a fazenda só para a marca', () => {
    const r = vm(SEGURO, { planilha_fazenda_id: null, planilha_fazenda_nome: null });
    expect(marca(r, 'Fazenda')).toEqual({ campo: 'Fazenda', planilha: 'Faz. Pureza', contador: true });
  });

  it('sessão antiga: o fornecedor que o populate de antes resolveu (no topo da proposta) não vira "(não resolvido)"', () => {
    const r = vm(SEGURO, { planilha_favorecido_id: null, planilha_favorecido_nome: null,
      proposto_favorecido_id: 'bbsa', proposto_favorecido_nome: 'Banco do Brasil S.A. (001)' });
    expect(marca(r, 'Fornecedor')).toBeUndefined();
  });

  it('Excel vazio não vira marca (nem apaga): sem documento na planilha, nada sobre documento', () => {
    expect(marca(vm(SEGURO, { excel_documento: null, lanc_numero_documento: 'X1' }), 'Documento')).toBeUndefined();
  });

  it('o contador só conta classificação: produto e documento diferentes ficam só na marca', () => {
    const r = vm(SEGURO, { excel_fazenda_codigo: null, planilha_fazenda_id: null, planilha_subcentro: null,
      excel_produto: 'Seguro Ouro Vida', lanc_descricao: 'Seguro - Ouro Vida - Junior', excel_documento: 'A1', lanc_numero_documento: 'B2' });
    expect(marca(r, 'Produto / Descrição')?.contador).toBe(false);
    expect(marca(r, 'Documento')?.contador).toBe(false);
    expect(filtrarPorGrupo([r], 'divergem_planilha')).toEqual([]);
  });

  it('linha sem lançamento: nenhuma marca (não há Resultado a comparar)', () => {
    expect(vm(SEGURO, { lanc_id: null }).divergenciasPlanilha).toEqual([]);
  });
});

describe('na tela', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    Element.prototype.hasPointerCapture = () => false;
  });
  const montar = (r: ReturnType<typeof vm>) => render(
    <MesaCamposTabela row={r} classificacoes={CLASSIF} fazendas={FAZENDAS} fornecedores={[forn('bbsa', 'Banco do Brasil S.A. (001)')]}
      onEditar={async () => {}} onCriarFornecedor={async () => null} />);
  /* PR-CONC-MESA-LAYOUT-FIXO-01: a grade virou <table>; a linha do campo é o <tr> do rótulo. */
  const linhaDe = (rotulo: string) => screen.getByTitle(rotulo).closest('tr')!;

  it('fornecedor sem proposta mostra o do sistema — nunca "Selecione..." com valor no sistema (print 18:35)', () => {
    montar(vm(SEGURO));
    expect(within(linhaDe('Fornecedor')).getByRole('combobox').textContent).toContain('Banco do Brasil S.A. (001)');
  });

  it('classificado: "planilha: Faz. Pureza" na Fazenda e a conta do plano da planilha como marca', () => {
    montar(vm(SEGURO));
    expect(within(linhaDe('Fazenda')).getByTestId('marca-planilha').textContent).toBe('planilha: Faz. Pureza');
    expect(within(linhaDe('Conta do plano')).getByTestId('marca-planilha').textContent)
      .toBe('planilha: Salários e Encargos Pecuária');
  });

  it('cru com plano administrativo: o banco forçou Administrativo, a marca diz a fazenda da planilha, sem aviso de rateio', () => {
    montar(vm(PAULO_CRU, { proposto_subcentro: 'Despesas Administrativas Gerais', planilha_subcentro: 'Despesas Administrativas Gerais',
      proposto_fazenda_id: 'adm', proposto_fazenda_nome: 'Administrativo' }));
    expect(within(linhaDe('Fazenda')).getByTestId('marca-planilha').textContent).toBe('planilha: Faz. Pureza');
    expect(screen.queryByTestId('aviso-plano-fazenda')).toBeNull();
  });

  it('classificado de pecuária na fazenda Administrativo: o aviso de rateio (não trava)', () => {
    montar(vm(SEGURO, { lanc_subcentro_atual: 'Salários e Encargos Pecuária' }));
    expect(screen.getByTestId('aviso-plano-fazenda').textContent)
      .toBe('conta do plano de pecuária na fazenda Administrativo — o rateio do DRE sai errado');
  });
});
