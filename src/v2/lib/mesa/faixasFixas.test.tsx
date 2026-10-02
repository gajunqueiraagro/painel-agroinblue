/**
 * PR-CONC-MESA-FAIXAS-FIXAS-01 — as faixas de decisão moram numa área de ALTURA FIXA, sempre presente; a tabela não
 * encolhe ao trocar de linha. PR-CONC-ENRIQUECER-V2-02 — a área virou uma BARRA de 20px, e as faixas abrem num Dialog.
 *
 * ⚠ O jsdom NÃO FAZ LAYOUT: aqui se prova o contrato (a barra existe em todo estado, com a mesma altura declarada, ENTRE a
 *   tabela e o rodapé; sem decisão fica vazia; com decisão, "Abrir decisão" mostra o MESMO nó). A medida renderizada vai
 *   no relatório.
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
import { AreaDecisao, ALTURA_AREA_DECISAO } from '@/v2/components/mesa/enriquecimento/AreaDecisao';

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

function montar(faixas: ReactNode | null) {
  return render(
    <EnriquecimentoMesaModal open onOpenChange={() => {}} sessaoLabel="Set/2026"
      lista={{ rows: [ROW], selecionadoId: ROW.id, onSelecionar: () => {} }}
      detalhe={{ row: ROW }}
      actions={{ posicao: '1 / 1', onAnterior: () => {}, onProximo: () => {}, canAnterior: false, canProximo: false,
        revisado: false, onRevisado: () => {}, onSalvar: () => {}, onSalvarProximo: () => {}, onReverter: () => {},
        onAplicarTodos: () => {}, nAplicaveis: 0 }}
      faixas={faixas} baldePorId={new Map()} />,
  );
}

/** As medidas declaradas e a ORDEM: tabela -> área de decisão -> slot acima do rodapé. */
function assinatura() {
  const area = screen.getByTestId('area-decisao');
  const grade = screen.getByTestId('grade-mesa');
  const rodape = screen.getByTestId('slot-rodape');
  const antes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return {
    altura: area.style.height,
    naoEncolhe: area.className.includes('shrink-0'),
    ordem: antes(grade, area) && antes(area, rodape),
    linhasDaTabela: grade.querySelectorAll('tbody tr').length,
  };
}

describe('a área de decisão é fixa em todos os estados', () => {
  /* a linha sem decisão é a referência — calculada dentro de cada caso, para que uma falha aqui derrube o CASO, e não a coleta */
  const base = () => { candidatos = []; const { unmount } = montar(null); const a = assinatura(); unmount(); return a; };

  it('existe sempre, com 20px, entre a tabela e o rodapé', () => {
    const b = base();
    /* 15 linhas de campo + 4 faixas de bloco (V2-02: Pagamento virou Data pgto. / Valor / Conta bancária; eram 13 + 4) */
    expect(b).toEqual({ altura: ALTURA_AREA_DECISAO, naoEncolhe: true, ordem: true, linhasDaTabela: 19 });
    expect(ALTURA_AREA_DECISAO).toBe('20px');
  });

  it.each(ESTADOS)('%s: a mesma assinatura da linha sem decisão', (_n, faixas, nCand) => {
    const b = base();
    candidatos = Array.from({ length: nCand }, (_v, i) => cand(i));
    montar(faixas);
    expect(assinatura()).toEqual(b);
  });

  it('sem decisão, a barra existe e fica VAZIA: sem texto e sem botão', () => {
    candidatos = [];
    montar(null);
    const area = screen.getByTestId('area-decisao');
    expect(area).toHaveTextContent(/^$/);
    expect(within(area).queryByTestId('abrir-decisao')).not.toBeInTheDocument();
    expect(area.dataset.temDecisao).toBe('nao');
  });

  it('com decisão, a barra avisa e "Abrir decisão" mostra o MESMO nó num Dialog', () => {
    candidatos = [];
    montar(ESTADOS[2][1]);
    const area = screen.getByTestId('area-decisao');
    expect(within(area).getByTestId('aviso-decisao')).toHaveTextContent('● Esta linha pede uma decisão');
    expect(screen.queryByText('2 lançamentos do dia somam o valor desta linha.')).not.toBeInTheDocument();
    fireEvent.click(within(area).getByTestId('abrir-decisao'));
    const dialog = screen.getByTestId('dialog-decisao');
    expect(within(dialog).getByText('2 lançamentos do dia somam o valor desta linha.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Juntar' })).toBeInTheDocument();
    /* o título diz de quem é a decisão: fornecedor · valor com sinal */
    expect(within(dialog).getByRole('heading').textContent).toBe(`Decisão · ${ROW.fornecedor} · −${ROW.valor}`);
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
