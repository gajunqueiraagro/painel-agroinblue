/**
 * PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL — a linha gravada da Mesa passa a ser editável.
 *
 * ⚠ O QUE SE PROVA: os campos de uma linha gravada são editores (o do extrato segue leitura); "alterada · falta gravar"
 *   só com edição DEPOIS da gravação E diferença no comparativo (a data sozinha não basta, o comparativo sozinho acusava
 *   1.281 linhas do proto); o botão "Gravar alteração" e o "já gravada"; o Reverter do filho de desmembramento sem estado
 *   anterior apagado com o motivo no rodapé; a observação do filho só leitura ("elo do desmembramento"); a guarda do
 *   agrupamento deixa passar só o filho gravado; a dica "a Mesa não apaga · mantém"; os erros de editar/salvar no
 *   rodapé, sem toast, e a grade remontando para o campo voltar; bloco e grupo continuam travados.
 * ⚠ O jsdom NÃO MEDE: o rodapé de 32px e o slot de decisão de 96px são contrato de classe; a medida vai no relatório.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import {
  toRowVM, estadoDaLinhaGravada, motivoReverterBloqueado, bloqueiaPorAgrupamento, rodaSugestoesDoSalvar,
  MOTIVO_SEM_DESFAZER, DICA_NAO_APAGA,
} from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { MesaCamposTabela } from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';
import { EnriquecimentoMesaModal, mensagemDoRodape } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Centro', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Nutrição', 'pecuaria'), cls('Taxas e Impostos Fixos Pecuária', 'pecuaria')];

/* Os status que o banco grava e o tipo `MatchStatus` não declara entram pelo JSON (como no enriquecerV2.test) — sem cast. */
const st = (s: string): Partial<ClassificacaoStagingPreviewRow> => JSON.parse(JSON.stringify({ match_status: s }));
const GRAVADO = '2026-10-02T17:13:28Z';
const ANTES = '2026-10-02T17:12:00Z';
const DEPOIS = '2026-10-02T17:20:00Z';

/* A linha 16 do NJ depois de gravada: o lançamento ficou com o documento do banco, a proposta igual a ele. */
const BASE: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-16', lanc_id: 'faf8537b', match_status: 'divergente', aplicado: true, aplicado_em: GRAVADO,
  proposto_editado_em: ANTES, tem_estado_anterior: true, lanc_origem_lancamento: 'extrato',
  lanc_descricao: 'Nutrição Animal - Parc.3', proposto_produto: 'Nutrição Animal - Parc.3', lanc_valor: 22400, excel_valor: 22400, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_data_pagamento: '2026-09-28', excel_data_pagamento: '2026-09-28',
  lanc_subcentro_atual: 'Nutrição', lanc_plano_conta_id_atual: 'Nutrição', proposto_subcentro: 'Nutrição',
  proposto_subcentro_existe_no_plano: true, lanc_numero_documento: '20260928122400000',
  proposto_numero_documento: '20260928122400000', lanc_observacao: 'Pecuária 2025/2026',
  proposto_observacao: 'Pecuária 2025/2026', lanc_fazenda_id: 'pureza', proposto_fazenda_id: 'pureza',
};
/* O filho do desmembramento 709,76 (linha 371): a observação do filho tem o elo; a proposta, não. */
const FILHO: Partial<ClassificacaoStagingPreviewRow> = {
  ...BASE, ...st('sugestao_split'), staging_id: 's-371', lanc_id: '65dbd985', lanc_origem_lancamento: 'mesa_split',
  proposto_editado_em: null, tem_estado_anterior: false, lanc_valor: 354.88, excel_valor: 354.88,
  lanc_subcentro_atual: 'Taxas e Impostos Fixos Pecuária', proposto_subcentro: 'Taxas e Impostos Fixos Pecuária',
  lanc_observacao: 'Pecuária 2025/2026 [split: stg=ee34b362 consol=dfd8ab98 ofx=0fc3df2d sessao=8d6efeb7]',
  proposto_observacao: 'Pecuária 2025/2026',
  casamento_meta: { regra: 'n_linhas_1_lancamento', grupo_ids: ['ee34b362', '11acfd6d'] },
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF });
const montarGrade = (r: ReturnType<typeof vm>, opts: { semEditar?: boolean } = {}) =>
  render(<MesaCamposTabela row={r} classificacoes={CLASSIF} onAtividade={vi.fn()} atividade={null}
    onEditar={opts.semEditar ? undefined : vi.fn(() => Promise.resolve())} />);
const editor = (rotulo: string) => within(screen.getByTestId(`linha-${rotulo}`)).queryByRole('textbox');

describe('o estado da linha gravada (D3) — a data E o comparativo', () => {
  it('não gravada: sem estado; gravada e não editada depois: não está alterada', () => {
    expect(vm(BASE, { aplicado: false }).gravada).toBeNull();
    const g = vm(BASE).gravada;
    expect(g).not.toBeNull();
    expect(g?.alterada).toBe(false);
    expect(g?.editadaDepois).toBe(false);
  });

  it('editada DEPOIS da gravação e com diferença: alterada', () => {
    const g = vm(BASE, { proposto_editado_em: DEPOIS, proposto_numero_documento: '116396' }).gravada;
    expect(g?.alterada).toBe(true);
  });

  it('a data sozinha não basta: editada depois, mas igual ao lançamento — não está alterada', () => {
    const g = vm(BASE, { proposto_editado_em: DEPOIS }).gravada;
    expect(g?.editadaDepois).toBe(true);
    expect(g?.alterada).toBe(false);
  });

  it('o comparativo sozinho não basta: o filho de split difere na observação e NÃO está alterado (ninguém editou)', () => {
    /* sem a data, a proposta velha ("Pecuária 2025/2026") contra o "[split: …]" do filho acusaria "alterada" */
    const g = vm(FILHO).gravada;
    expect(g?.editadaDepois).toBe(false);
    expect(g?.alterada).toBe(false);
  });

  it('tem_estado_anterior vem da view; ausente (view antiga) = null', () => {
    expect(vm(BASE).gravada?.temEstadoAnterior).toBe(true);
    expect(vm(FILHO).gravada?.temEstadoAnterior).toBe(false);
    expect(estadoDaLinhaGravada(linhaCrua({ ...BASE, tem_estado_anterior: undefined }), vm(BASE).edicao)?.temEstadoAnterior).toBeNull();
  });
});

describe('a grade da linha gravada (D5, D6, D8)', () => {
  it('linha gravada 1:1: os campos são editores; pagamento, valor e conta seguem do extrato (leitura)', () => {
    montarGrade(vm(BASE));
    expect(editor('Documento · tipo')).not.toBeNull();
    expect(editor('Observação')).not.toBeNull();
    expect(editor('Descrição')).not.toBeNull();
    for (const r of ['Data pgto.', 'Valor', 'Conta bancária']) {
      expect(screen.getByTestId(`extrato-${r}`)).toBeInTheDocument();
      expect(within(screen.getByTestId(`linha-${r}`)).queryByRole('textbox')).toBeNull();
    }
  });

  it('filho de desmembramento: editável, mas a OBSERVAÇÃO é só leitura, com a dica "elo do desmembramento"', () => {
    montarGrade(vm(FILHO));
    expect(editor('Documento · tipo')).not.toBeNull();
    expect(editor('Observação')).toBeNull();
    expect(within(screen.getByTestId('linha-Observação')).getByTestId('dica-elo-desmembramento'))
      .toHaveTextContent('elo do desmembramento');
  });

  it('campo esvaziado numa linha gravada: "a Mesa não apaga · mantém" — e só depois de editar', () => {
    montarGrade(vm(BASE, { proposto_editado_em: DEPOIS, proposto_observacao: null }));
    expect(within(screen.getByTestId('linha-Observação')).getByTestId('dica-nao-apaga')).toHaveTextContent(DICA_NAO_APAGA);
    /* a mesma proposta sem chave, mas sem edição depois da gravação: nada a dizer (é a proposta velha, não um gesto) */
    expect(vm(BASE, { proposto_observacao: null }).gravada?.camposEsvaziados).toEqual([]);
    expect(vm(BASE, { proposto_editado_em: DEPOIS, proposto_observacao: null }).gravada?.camposEsvaziados).toEqual(['OBS']);
  });

  it('linha em bloco conferido: a aba não passa onEditar — continua toda leitura', () => {
    montarGrade(vm(BASE, { aplicado: false, ...st('conferido_bloco') }), { semEditar: true });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

describe('Reverter, agrupamento e as sugestões do Salvar (D4, D7, D11)', () => {
  it('Reverter: filho sem estado anterior -> o motivo; com estado -> livre; view antiga -> como antes', () => {
    expect(motivoReverterBloqueado(vm(FILHO))).toBe(MOTIVO_SEM_DESFAZER);
    expect(motivoReverterBloqueado(vm(BASE))).toBeNull();
    expect(motivoReverterBloqueado(vm(BASE, { tem_estado_anterior: undefined }))).toBeNull();
  });

  it('agrupamento: o filho GRAVADO passa; parte não gravada, sugestão de grupo e ambíguo continuam travados', () => {
    expect(bloqueiaPorAgrupamento(vm(FILHO))).toBe(false);
    expect(bloqueiaPorAgrupamento(vm(FILHO, { aplicado: false }))).toBe(true);
    const grupo = { casamento_meta: { grupo_ids: ['a', 'b'] } };
    expect(bloqueiaPorAgrupamento(vm(BASE, { ...grupo, aplicado: false, ...st('sugestao_grupo') }))).toBe(true);
    expect(bloqueiaPorAgrupamento(vm(BASE, { ...grupo, aplicado: false, match_status: 'ambiguo' }))).toBe(true);
    /* parte gravada por cima de um consolidado que NÃO é filho de split (o DARF de 25.590,80): continua travada */
    expect(bloqueiaPorAgrupamento(vm(BASE, { ...grupo, lanc_origem_lancamento: 'extrato' }))).toBe(true);
  });

  it('as três sugestões do Salvar só rodam em linha não gravada', () => {
    expect(rodaSugestoesDoSalvar(vm(BASE, { aplicado: false }))).toBe(true);
    expect(rodaSugestoesDoSalvar(vm(BASE))).toBe(false);
  });
});

const ACOES = (sobre: Record<string, unknown> = {}) => ({
  posicao: '1 / 1', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: true,
  revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
  onAplicarTodos: vi.fn(), nAplicaveis: 0, ...sobre,
});
const montarMesa = (row: ReturnType<typeof vm>, acoes: ReturnType<typeof ACOES>, versaoRestauro = 0) => (
  <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
    lista={{ rows: [row], selecionadoId: row.id, onSelecionar: vi.fn() }}
    detalhe={{ row, classificacoes: CLASSIF, onEditar: vi.fn(() => Promise.resolve()), versaoRestauro }}
    actions={acoes} contaId={null} contaNome="BB" baldePorId={new Map([[row.id, 'gravada']])} filtroInicial="feitas" />
);

describe('o rodapé da Mesa na linha gravada (D3, D4, D9)', () => {
  it('sem alteração: "Gravar alteração" apagado e "já gravada"', () => {
    const r = vm(BASE);
    const a = ACOES({ gravada: { alterada: false }, salvarDisabled: true,
      salvarMotivo: 'Já gravada: altere um campo para gravar de novo.' });
    render(montarMesa(r, a));
    const botao = screen.getByTestId('aprovar');
    expect(botao).toHaveTextContent('Gravar alteração');
    expect(botao).toBeDisabled();
    expect(screen.getByTestId('mensagem-rodape')).toHaveTextContent(/^já gravada$/);
    expect(screen.queryByTestId('falta')).toBeNull();
    /* Enter respeita o mesmo disabled */
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(a.onSalvarProximo).not.toHaveBeenCalled();
  });

  it('alterada: "alterada · falta gravar" e o botão aceso; a bolinha da lista fica âmbar (continua em Feitas)', () => {
    const r = vm(BASE, { proposto_editado_em: DEPOIS, proposto_numero_documento: '116396' });
    const a = ACOES({ gravada: { alterada: true }, salvarDisabled: false });
    render(montarMesa(r, a));
    expect(screen.getByTestId('mensagem-rodape')).toHaveTextContent('alterada · falta gravar');
    expect(screen.getByTestId('mensagem-rodape').getAttribute('data-mensagem')).toBe('alterada');
    fireEvent.click(screen.getByTestId('aprovar'));
    expect(a.onSalvarProximo).toHaveBeenCalledTimes(1);
    const item = screen.getByTestId('item-mesa');
    expect(item.getAttribute('data-balde')).toBe('gravada');
    expect(item.getAttribute('data-alterada')).toBe('sim');
    expect(within(item).getByTestId('bolinha-mesa').className).toMatch(/bg-amber-400/);
  });

  it('filho sem estado anterior: Reverter apagado e o motivo escrito no rodapé', () => {
    const r = vm(FILHO);
    render(montarMesa(r, ACOES({ gravada: { alterada: false }, salvarDisabled: true, reverterDisabled: true,
      motivoReverter: MOTIVO_SEM_DESFAZER })));
    expect(screen.getByTestId('reverter')).toBeDisabled();
    expect(screen.getByTestId('mensagem-rodape')).toHaveTextContent(`já gravada · ${MOTIVO_SEM_DESFAZER}`);
  });

  it('erro de editar e de salvar no rodapé, em vermelho, pela prioridade', () => {
    expect(mensagemDoRodape({ erroEdicao: 'campo recusado: safra_id (safra_nao_encontrada)', gravada: { alterada: true } }))
      .toEqual({ tipo: 'erro', texto: 'Não alterou — campo recusado: safra_id (safra_nao_encontrada)' });
    expect(mensagemDoRodape({ erroBanco: 'lancamento cancelado', erroEdicao: 'x' }).texto)
      .toBe('Não gravou — o banco recusou: lancamento cancelado');
    const r = vm(BASE, { proposto_editado_em: DEPOIS, proposto_numero_documento: '116396' });
    render(montarMesa(r, ACOES({ gravada: { alterada: true }, erroEdicao: 'canceling statement due to statement timeout' })));
    const m = screen.getByTestId('mensagem-rodape');
    expect(m).toHaveTextContent('Não alterou — canceling statement due to statement timeout');
    expect(m.className).toMatch(/text-red-700/);
  });

  it('o campo que falhou volta ao valor do banco: a grade remonta quando a recusa sobe a versão', () => {
    const r = vm(BASE);
    const a = ACOES({ gravada: { alterada: false }, salvarDisabled: true });
    const { rerender } = render(montarMesa(r, a, 0));
    const campo = () => within(screen.getByTestId('linha-Documento · tipo')).getByRole('textbox');
    fireEvent.change(campo(), { target: { value: '116396' } });
    expect(campo()).toHaveValue('116396');
    rerender(montarMesa(r, a, 1));
    expect(campo()).toHaveValue('20260928122400000');
  });

  it('nenhum toast de erro no editar e no salvar da aba (D9) — o texto mora no rodapé', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    const corpo = (inicio: string, fim: string) => {
      const i = src.indexOf(inicio);
      const f = src.indexOf(fim, i + inicio.length);
      if (i < 0 || f < 0) throw new Error(`não achei ${inicio}`);
      return src.slice(i, f);
    };
    const editar = corpo('async function onEditar(', '\n  }\n');
    const salvar = corpo('async function salvar(', 'async function handleSalvarProximo');
    /* a busca sabe achar: o handler do Reverter (fora deste PR) ainda tem toast.error */
    expect(corpo('async function handleReverter(', '\n  }\n')).toMatch(/toast\.error/);
    expect(editar).not.toMatch(/toast\.error/);
    expect(salvar).not.toMatch(/toast\.error/);
    expect(editar).toMatch(/recusarEdicao\(/);
  });
});
