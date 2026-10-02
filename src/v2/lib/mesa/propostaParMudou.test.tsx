/**
 * PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU — a tela: o aviso "par mudou no Recasar · confira" (D8) e a marca `_sugestao` (D2).
 *
 * ⚠ O QUE SE PROVA: o aviso aparece quando o banco marcou `casamento_meta.par_mudou_em` DEPOIS da última edição e da última
 *   gravação, e some quando o operador edita ou grava; a prioridade do rodapé (erro ao gravar > erro ao editar > par mudou >
 *   falta > diverge); o aviso não bloqueia (o Aprovar segue o `salvarDisabled` de sempre) e mora no MESMO slot da mensagem
 *   (nenhuma linha nova); as três propostas automáticas do Salvar levam `_sugestao: true` e a edição do operador não.
 * ⚠ A REGRA DA PROPOSTA (o que fica e o que é refeito) é do banco: P1–P11 em `supabase/tests/conc_enriq_proposta_par_mudou_test.sql`.
 * ⚠ O jsdom NÃO MEDE: "não muda altura" é contrato de classe (o mesmo span `flex-1 truncate` de toda mensagem).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { toRowVM, parMudouNoRecasar } from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { EnriquecimentoMesaModal, mensagemDoRodape } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

const CLASSIF: ClassificacaoItem[] = [{
  id: 'Nutrição', subcentro: 'Nutrição', escopo_negocio: 'pecuaria', macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Centro', tipo_operacao: '2-Saídas',
}];

const EDITADA = '2026-10-02T17:12:00Z';
const RECASAR = '2026-10-02T19:09:47.123456+00:00';   // o `now()` do banco, com microssegundos
const DEPOIS = '2026-10-02T19:20:00Z';

/* A linha 16 do NJ: editada às 17:12 com o par classificado; o Recasar das 19:09 a moveu para o cru faf8537b. */
const BASE: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-16', lanc_id: 'faf8537b', match_status: 'divergente', aplicado: false, aplicado_em: null,
  proposto_editado_em: EDITADA, lanc_origem_lancamento: 'extrato', lanc_descricao: 'Nutrição Animal - Parc.3',
  proposto_produto: 'Nutrição Animal - Parc.3', lanc_valor: 22400, excel_valor: 22400, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_data_pagamento: '2026-09-28', excel_data_pagamento: '2026-09-28',
  proposto_subcentro: 'Nutrição', proposto_subcentro_existe_no_plano: true,
  casamento_meta: { par_anterior: '0a7c78aa', par_mudou_em: RECASAR },
};
const row = (sobre: Partial<ClassificacaoStagingPreviewRow> = {}) => linhaCrua({ ...BASE, ...sobre });
const vm = (sobre: Partial<ClassificacaoStagingPreviewRow> = {}) => toRowVM(row(sobre), [], { classificacoes: CLASSIF });

describe('quando a linha avisa que o par mudou (D8)', () => {
  it('o Recasar trocou o par depois da última edição: avisa', () => {
    expect(parMudouNoRecasar(row())).toBe(true);
    expect(vm().parMudou).toBe(true);
    /* nunca editada nem gravada: também avisa */
    expect(parMudouNoRecasar(row({ proposto_editado_em: null }))).toBe(true);
  });

  it('o operador editou ou gravou DEPOIS do Recasar: o aviso some', () => {
    expect(parMudouNoRecasar(row({ proposto_editado_em: DEPOIS }))).toBe(false);
    expect(parMudouNoRecasar(row({ aplicado_em: DEPOIS }))).toBe(false);
  });

  it('sem marca, marca nula (par que voltou a nao mudar) ou linha aplicada: nada a dizer', () => {
    expect(parMudouNoRecasar(row({ casamento_meta: null }))).toBe(false);
    expect(parMudouNoRecasar(row({ casamento_meta: { par_anterior: null, par_mudou_em: null } }))).toBe(false);
    expect(parMudouNoRecasar(row({ casamento_meta: { regra: 'exato' } }))).toBe(false);
    expect(parMudouNoRecasar(row({ aplicado: true, aplicado_em: EDITADA }))).toBe(false);
  });
});

describe('a prioridade do rodapé (D8)', () => {
  const tudo = {
    erroBanco: 'lancamento cancelado', erroEdicao: 'campo recusado', parMudou: true,
    falta: 'Falta preencher: Conta do plano.', divergenciasDoExtrato: ['Data pgto.'],
  };
  it('erro ao gravar > erro ao editar > par mudou > falta > diverge', () => {
    expect(mensagemDoRodape(tudo).texto).toMatch(/^Não gravou/);
    expect(mensagemDoRodape({ ...tudo, erroBanco: null }).texto).toMatch(/^Não alterou/);
    expect(mensagemDoRodape({ ...tudo, erroBanco: null, erroEdicao: null }))
      .toEqual({ tipo: 'par_mudou', texto: 'par mudou no Recasar · confira' });
    expect(mensagemDoRodape({ ...tudo, erroBanco: null, erroEdicao: null, parMudou: false }).tipo).toBe('falta');
    expect(mensagemDoRodape({ divergenciasDoExtrato: ['Data pgto.'], parMudou: false }).tipo).toBe('diverge');
    expect(mensagemDoRodape({ divergenciasDoExtrato: ['Data pgto.'], parMudou: true }).tipo).toBe('par_mudou');
  });
});

const ACOES = (sobre: Record<string, unknown> = {}) => ({
  posicao: '1 / 1', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: true,
  revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
  onAplicarTodos: vi.fn(), nAplicaveis: 0, ...sobre,
});
const montarMesa = (r: ReturnType<typeof vm>, acoes: ReturnType<typeof ACOES>) => (
  <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
    lista={{ rows: [r], selecionadoId: r.id, onSelecionar: vi.fn() }}
    detalhe={{ row: r, classificacoes: CLASSIF, onEditar: vi.fn(() => Promise.resolve()) }}
    actions={acoes} contaId={null} contaNome="Sicredi" baldePorId={new Map([[r.id, 'pronta']])} filtroInicial="todas" />
);

describe('o aviso na Mesa (D8): âmbar, no slot da mensagem, sem bloquear', () => {
  it('aparece em âmbar e o Aprovar continua valendo', () => {
    const a = ACOES({ parMudou: true, salvarDisabled: false });
    render(montarMesa(vm(), a));
    const m = screen.getByTestId('mensagem-rodape');
    expect(m).toHaveTextContent(/^par mudou no Recasar · confira$/);
    expect(m.getAttribute('data-mensagem')).toBe('par_mudou');
    expect(m.className).toMatch(/text-amber-700/);
    fireEvent.click(screen.getByTestId('aprovar'));
    expect(a.onSalvarProximo).toHaveBeenCalledTimes(1);
  });

  it('é o MESMO slot de toda mensagem (nenhuma linha nova): mesmas classes de caixa com e sem aviso', () => {
    const caixa = (c: string) => c.split(/\s+/).filter((k) => !/^(dark:)?text-(amber|red|muted)/.test(k) && k !== 'font-medium').join(' ');
    const { unmount } = render(montarMesa(vm(), ACOES({ parMudou: true })));
    const com = caixa(screen.getByTestId('mensagem-rodape').className);
    unmount();
    render(montarMesa(vm({ casamento_meta: null }), ACOES({ parMudou: false, divergenciasDoExtrato: ['Data pgto.'] })));
    expect(caixa(screen.getByTestId('mensagem-rodape').className)).toBe(com);
    expect(com).toMatch(/flex-1/);
    expect(com).toMatch(/truncate/);
  });

  it('sem a marca, o rodapé fica como antes (vazio)', () => {
    render(montarMesa(vm({ casamento_meta: null }), ACOES({ parMudou: false })));
    expect(screen.getByTestId('mensagem-rodape').getAttribute('data-mensagem')).toBe('nenhuma');
  });
});

describe('a marca `_sugestao` (D2): só nas três propostas automáticas do Salvar', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
  const corpo = (inicio: string, fim: string) => {
    const i = src.indexOf(inicio);
    const f = src.indexOf(fim, i + inicio.length);
    if (i < 0 || f < 0) throw new Error(`não achei ${inicio}`);
    return src.slice(i, f);
  };
  const comMarca = /patch: \{[^}]*_sugestao: true[^}]*\}/g;

  it('as três chamadas do salvar() levam a marca: alinhar subcentro, safra sugerida, forma pelo histórico', () => {
    const salvar = corpo('async function salvar(', 'async function handleSalvarProximo');
    const chamadas = salvar.match(comMarca) ?? [];
    expect(chamadas).toHaveLength(3);
    expect(chamadas.some((c) => /subcentro: selecionado\.edicao\.subcentro/.test(c))).toBe(true);
    expect(chamadas.some((c) => /safra_id: selecionado\.edicao\.safraSugeridaId/.test(c))).toBe(true);
    expect(chamadas.some((c) => /forma_pagamento: selecionado\.edicao\.formaPagamentoSugerida/.test(c))).toBe(true);
    /* nenhum editarProposto do salvar ficou sem a marca */
    expect((salvar.match(/editarProposto\(/g) ?? []).length).toBe(3);
  });

  it('a edição do operador (onEditar) e o resto da aba não levam a marca', () => {
    expect(corpo('async function onEditar(', '\n  }\n')).not.toMatch(/_sugestao/);
    /* no arquivo inteiro, só as três */
    expect((src.match(comMarca) ?? []).length).toBe(3);
  });
});
