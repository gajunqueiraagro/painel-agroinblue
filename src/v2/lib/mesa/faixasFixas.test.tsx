/**
 * PR-CONC-MESA-FAIXAS-FIXAS-01 — as faixas de decisão moram num lugar FIXO, sempre presente; a tabela não encolhe ao
 * trocar de linha. PR-CONC-ENRIQUECER-V2-02 — virou uma barra de 20px com Dialog. PR-CONC-MESA-ORDEM-03 — virou um SLOT DE
 * LARGURA FIXA DENTRO DO RODAPÉ (◀ ▶ Reverter | decisão | mensagem | Pular | Aprovar), e a linha de 18px acima do rodapé
 * virou a mensagem única do rodapé.
 *
 * ⚠ O jsdom NÃO FAZ LAYOUT: aqui se prova o contrato (o slot existe em todo estado, com a mesma largura declarada, no
 *   rodapé; sem decisão fica vazio; com decisão, "● Abrir decisão" mostra o MESMO nó). A medida renderizada vai no relatório.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import type { CandidatoProximo } from '@/v2/hooks/useClassificacaoCandidatosProximos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));
let candidatos: CandidatoProximo[] = [];
vi.mock('@/v2/hooks/useClassificacaoCandidatosProximos', () => ({
  useClassificacaoCandidatosProximos: () => ({ data: candidatos, isFetching: false }),
}));

import { EnriquecimentoMesaModal } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';
import { EnriquecimentoCandidatosInline } from '@/v2/components/mesa/enriquecimento/EnriquecimentoCandidatosInline';
import { AreaDecisao, LARGURA_SLOT_DECISAO } from '@/v2/components/mesa/enriquecimento/AreaDecisao';
import { mensagemDoRodape } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

const cand = (i: number): CandidatoProximo => ({
  lanc_id: `l-${i}`, descricao: `Pix - Enviado ${i}`, observacao: null, data_pagamento: '2026-09-28', valor: 3850,
  tipo_operacao: '2-Saídas', subcentro_atual: null, macro_atual: null, grupo_atual: null, favorecido_id: null,
  favorecido_nome: null, conta_bancaria_nome: 'Banco do Brasil', conta_destino_nome: null, documento: `doc-${i}`, distancia_dias: 0,
});
const ROW = toRowVM(linhaCrua({ staging_id: 's-1', lanc_id: 'l-1', excel_valor: 3850, lanc_valor: 3850, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas' }));

const candidatosInline = <EnriquecimentoCandidatosInline stagingId="s-1" excelValor={3850} excelData="2026-09-28" onEscolher={() => {}} />;
const ESTADOS: Array<[string, ReactNode | null, number]> = [
  ['sem decisão', null, 0],
  ['sobrescrever/desfazer', <div key="s" className="flex shrink-0 items-center gap-2 border-t px-3 py-0.5"><label>sobrescrever</label></div>, 0],
  ['juntar grupo', <div key="g" className="shrink-0 border-t px-3 py-1"><span>2 lançamentos do dia somam o valor desta linha.</span><button type="button">Juntar</button></div>, 0],
  ['1 candidato', candidatosInline, 1],
  ['8 candidatos', candidatosInline, 8],
];

type Extra = { salvarMotivo?: string; erroBanco?: string; divergenciasDoExtrato?: string[]; aviso?: boolean };
function montar(faixas: ReactNode | null, extra: Extra = {}) {
  /* "com aviso": a linha classificada cuja conta da planilha não existe no plano ("planilha dizia") */
  const row = extra.aviso
    ? toRowVM(linhaCrua({ staging_id: 's-1', lanc_id: 'l-1', excel_valor: 3850, lanc_valor: 3850, lanc_sinal: '-1',
      lanc_tipo_operacao: '2-Saídas', excel_subcentro: 'Conta que não existe', will_create_subcentro_orfao: true,
      proposto_subcentro: 'Conta que não existe' }))
    : ROW;
  return render(
    <EnriquecimentoMesaModal open onOpenChange={() => {}} sessaoLabel="Set/2026"
      lista={{ rows: [row], selecionadoId: row.id, onSelecionar: () => {} }}
      detalhe={{ row }}
      actions={{ posicao: '1 / 1', onAnterior: () => {}, onProximo: () => {}, canAnterior: false, canProximo: false,
        revisado: false, onRevisado: () => {}, onSalvar: () => {}, onSalvarProximo: () => {}, onReverter: () => {},
        onAplicarTodos: () => {}, nAplicaveis: 0, salvarMotivo: extra.salvarMotivo, erroBanco: extra.erroBanco,
        divergenciasDoExtrato: extra.divergenciasDoExtrato }}
      faixas={faixas} baldePorId={new Map()} />,
  );
}

/** As medidas declaradas e o LUGAR: o slot da decisão dentro do rodapé, entre o Reverter e a mensagem. */
function assinatura() {
  const slot = screen.getByTestId('slot-decisao');
  const grade = screen.getByTestId('grade-mesa');
  const rodape = screen.getByTestId('rodape-mesa');
  const antes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return {
    largura: slot.style.width,
    naoEncolhe: slot.className.includes('shrink-0'),
    noRodape: rodape.contains(slot),
    alturaRodape: rodape.className.split(/\s+/).filter((c) => /^h-/.test(c)),
    filhosDoRodape: rodape.children.length,
    depoisDaTabela: antes(grade, rodape),
    linhasDaTabela: grade.querySelectorAll('tbody tr').length,
    /* as duas linhas vazias de antes não existem mais */
    semLinhasVazias: !screen.queryByTestId('area-decisao') && !screen.queryByTestId('slot-rodape') && !screen.queryByTestId('slot-aviso'),
  };
}

describe('a área de decisão é fixa em todos os estados', () => {
  /* a linha sem decisão é a referência — calculada dentro de cada caso, para que uma falha aqui derrube o CASO, e não a coleta */
  const base = () => { candidatos = []; const { unmount } = montar(null); const a = assinatura(); unmount(); return a; };

  it('existe sempre, no rodapé de 32px, com a largura fixa; as linhas vazias saíram', () => {
    const b = base();
    /* 15 linhas de campo + 4 faixas de bloco */
    expect(b).toEqual({ largura: LARGURA_SLOT_DECISAO, naoEncolhe: true, noRodape: true, alturaRodape: ['h-8'],
      filhosDoRodape: 7, depoisDaTabela: true, linhasDaTabela: 19, semLinhasVazias: true });
  });

  it.each(ESTADOS)('%s: a mesma assinatura da linha sem decisão', (_n, faixas, nCand) => {
    const b = base();
    candidatos = Array.from({ length: nCand }, (_v, i) => cand(i));
    montar(faixas);
    expect(assinatura()).toEqual(b);
  });

  it.each<[string, Extra]>([
    ['com "falta"', { salvarMotivo: 'Falta preencher: Plano de contas.' }],
    ['com erro do banco', { erroBanco: 'mes_fechado' }],
    ['com divergência do extrato', { divergenciasDoExtrato: ['Valor'] }],
    ['com aviso no checklist', { aviso: true }],
  ])('%s: a mesma assinatura (nada muda de altura nem de lugar)', (_n, extra) => {
    const b = base();
    candidatos = [];
    montar(null, extra);
    expect(assinatura()).toEqual(b);
  });

  it('sem decisão, o slot existe com a MESMA largura e fica VAZIO: sem texto e sem botão', () => {
    candidatos = [];
    montar(null);
    const slot = screen.getByTestId('slot-decisao');
    expect(slot).toHaveTextContent(/^$/);
    expect(slot.style.width).toBe(LARGURA_SLOT_DECISAO);
    expect(within(slot).queryByTestId('abrir-decisao')).not.toBeInTheDocument();
    expect(slot.dataset.temDecisao).toBe('nao');
  });

  it('com decisão, "● Abrir decisão" em âmbar no rodapé mostra o MESMO nó num Dialog', () => {
    candidatos = [];
    montar(ESTADOS[2][1]);
    const area = screen.getByTestId('slot-decisao');
    const botao = within(area).getByTestId('abrir-decisao');
    expect(botao).toHaveTextContent('● Abrir decisão');
    expect(botao.className).toMatch(/border-amber-500/);
    expect(botao.className).toMatch(/text-amber-700/);
    expect(screen.queryByText('2 lançamentos do dia somam o valor desta linha.')).not.toBeInTheDocument();
    fireEvent.click(botao);
    const dialog = screen.getByTestId('dialog-decisao');
    expect(within(dialog).getByText('2 lançamentos do dia somam o valor desta linha.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Juntar' })).toBeInTheDocument();
    /* o título diz de quem é a decisão: fornecedor · valor com sinal */
    expect(within(dialog).getByRole('heading').textContent).toBe(`Decisão · ${ROW.fornecedor} · −${ROW.valor}`);
  });
});

describe('a mensagem do rodapé — uma só, pela prioridade', () => {
  it('1 o banco recusou > 2 falta > 3 a planilha diverge do extrato', () => {
    const todas = { erroBanco: 'mes_fechado', falta: 'Falta preencher: Plano de contas.', divergenciasDoExtrato: ['Valor'] };
    expect(mensagemDoRodape(todas)).toEqual({ tipo: 'erro', texto: 'Não gravou — o banco recusou: mes_fechado' });
    expect(mensagemDoRodape({ ...todas, erroBanco: null })).toEqual({ tipo: 'falta', texto: 'falta: Plano de contas' });
    expect(mensagemDoRodape({ divergenciasDoExtrato: ['Valor', 'Data pagamento'] })).toEqual({ tipo: 'diverge',
      texto: 'Planilha diverge do extrato em: Valor · Data pagamento — o extrato manda, e estes campos não serão gravados.' });
    expect(mensagemDoRodape({})).toEqual({ tipo: null, texto: '' });
  });

  it('na tela: o "falta:" mantém o data-testid e o erro do banco vence o falta', () => {
    candidatos = [];
    const { unmount } = montar(null, { salvarMotivo: 'Falta preencher: Plano de contas.' });
    expect(screen.getByTestId('falta')).toHaveTextContent('falta: Plano de contas');
    unmount();
    montar(null, { salvarMotivo: 'Falta preencher: Plano de contas.', erroBanco: 'mes_fechado' });
    expect(screen.queryByTestId('falta')).not.toBeInTheDocument();
    expect(screen.getByTestId('mensagem-rodape')).toHaveTextContent('Não gravou — o banco recusou: mes_fechado');
  });
});

describe('o Dialog da decisão é da linha', () => {
  it('trocar de linha fecha o Dialog', () => {
    const { rerender } = render(<AreaDecisao chave="a" titulo="X · 1"><span>faixa A</span></AreaDecisao>);
    fireEvent.click(screen.getByTestId('abrir-decisao'));
    expect(screen.getByTestId('dialog-decisao')).toBeInTheDocument();
    rerender(<AreaDecisao chave="b" titulo="Y · 2"><span>faixa B</span></AreaDecisao>);
    expect(screen.queryByTestId('dialog-decisao')).not.toBeInTheDocument();
    expect(screen.getByTestId('abrir-decisao')).toBeInTheDocument();
  });
});

describe('os candidatos, no Dialog da decisão: a LISTA é que rola', () => {
  it.each([1, 8])('%i candidato(s): todos na lista, que ocupa a sobra e rola; sem teto próprio de altura', (n) => {
    candidatos = Array.from({ length: n }, (_v, i) => cand(i));
    render(<AreaDecisao>{candidatosInline}</AreaDecisao>);
    fireEvent.click(screen.getByTestId('abrir-decisao'));
    const raiz = screen.getByTestId('candidatos-inline');
    expect(raiz.className).toMatch(/flex-1/);
    expect(raiz.className).toMatch(/min-h-0/);
    const lista = screen.getByTestId('candidatos-lista');
    expect(lista.className).toMatch(/flex-1/);
    expect(lista.className).toMatch(/overflow-y-auto/);
    expect(lista.className).not.toMatch(/max-h-/);
    expect(within(lista).getAllByRole('radio')).toHaveLength(n);
    /* o botão fica fora da lista: rolar os candidatos não esconde o gesto */
    expect(within(lista).queryByRole('button')).not.toBeInTheDocument();
    expect(within(raiz).getByRole('button', { name: /Usar este/ })).toBeInTheDocument();
  });
});
