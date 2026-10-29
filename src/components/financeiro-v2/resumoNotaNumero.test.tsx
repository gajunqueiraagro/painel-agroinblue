/**
 * P121b (Gabriel 29/10) — no Resumo do lançamento › Documento, a linha "Nota" mostrava "Nota Fiscal · da compra · NF 000.521.110" e cortava
 * ANTES do número (o caso: parcela 2/5 de uma compra parcelada). Agora o NÚMERO vem logo depois do rótulo, inteiro, e a origem é um selo
 * depois dele — o selo é que cede. ⚠ jsdom NÃO FAZ LAYOUT: aqui se prova a estrutura (o número não encolhe nem corta; o selo, sim, com
 * o title); a largura se mede no gate (`check:ui-cortes`, cenário `lancamento-editar-nota-11`). Dados SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumoDoLancamento, type ResumoDoLancamentoProps } from './ResumoDoLancamento';
import { docDaLinha, documentoDoResumo } from '@/lib/financeiro/documentoHelper';

const NOTA_11 = { id: 'd1', especie: 'nf', numero: '12.345.678.901', cancelado: false };

const BASE: ResumoDoLancamentoProps = {
  tipo: { rotulo: 'Saídas', cor: 'text-red-500' }, competencia: '10/10/2026', favorecido: 'Fornecedor Sintético de Rações Ltda', favorecidoDocumento: '',
  descricao: 'Ração sintética 2/5', fazenda: 'Faz. Exemplo', valor: 'R$ 1.000,00', sentido: 'saida', conta: [{ rotulo: 'Conta', nome: 'Banco Exemplo' }],
  atividade: null, safra: null, fase: null, centro: null, subcentro: null, status: { rotulo: 'Programado' }, forma: null, vencimento: '10/10/2026',
  pagamento: null, modalidade: null, parcelas: null, documento: null,
};

describe('P121b — o número da nota no Resumo', () => {
  it('a nota da COMPRA (parcela sem número próprio): o número inteiro primeiro, "da compra" num selo; "Nota Fiscal ·" não entra', () => {
    const d = documentoDoResumo(docDaLinha({ tipo_documento: null, numero_documento: null }, [NOTA_11]), null);
    expect(d).toEqual({ numero: 'NF 12.345.678.901', selo: 'da compra', titulo: 'NF 12.345.678.901 · nota da compra' });
  });
  it('a nota do PRÓPRIO lançamento: "NF 000.521.110", sem selo; o tipo por extenso só no title', () => {
    const d = documentoDoResumo(docDaLinha({ tipo_documento: 'Nota Fiscal', numero_documento: '000521110' }, []), 'Nota Fiscal');
    expect(d).toEqual({ numero: 'NF 000.521.110', selo: null, titulo: 'Nota Fiscal · NF 000.521.110' });
  });
  it('sem número: o tipo escolhido fica no lugar; nada = null ("—")', () => {
    expect(documentoDoResumo(docDaLinha({ tipo_documento: 'Recibo', numero_documento: null }, []), 'Recibo')).toEqual({ numero: 'Recibo', selo: null, titulo: 'Recibo' });
    expect(documentoDoResumo(docDaLinha({ tipo_documento: null, numero_documento: null }, []), null)).toBeNull();
  });
  it('o número de 11 dígitos NUNCA corta: não encolhe, não quebra, sem "…"; quem cede é o selo (com o title)', () => {
    render(<ResumoDoLancamento {...BASE} documento={documentoDoResumo(docDaLinha({ tipo_documento: null, numero_documento: null }, [NOTA_11]), null)} />);
    const numero = screen.getByTestId('resumo-nota');
    expect(numero.textContent).toBe('NF 12.345.678.901');
    expect(numero.className.split(' ')).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
    expect(numero.className).not.toContain('truncate');
    /* o número vem ANTES do selo, na mesma linha */
    const selo = screen.getByTestId('resumo-nota-selo');
    expect(numero.compareDocumentPosition(selo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selo.textContent).toBe('da compra');
    expect(selo.className).toContain('truncate');
    expect(selo.getAttribute('title')).toBe('NF 12.345.678.901 · nota da compra');
    /* a célula do número não tem "…" própria (o truncate da célula cortaria o número) */
    expect(numero.closest('td')?.className ?? '').not.toContain('truncate');
  });
});
