/**
 * P92 — o "Resultado do lote" do Negociar lote: 400px de 1024 para cima (modal 962; o lado esquerdo segue com 562), colunas de largura
 * FIXA (o número não anda quando a carcaça muda) e o número acima do teto com a fonte reduzida até caber (nunca quebra, nunca corta).
 * ⚠ A medida (cabe / não cabe) é do navegador: o `check:ui-cortes` (`negociar-lote-resumo-*`, dez tamanhos) e o `check:ui-desloca`
 *   (`negociar-lote-troca-carcaca`). Aqui fica o contrato que a tela renderiza.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ModalNegociarLote, LARGURA_TOTAL_PX, LARGURA_POR_ARROBA_PX, REDUCAO_MAXIMA_PX, PISO_DA_FONTE_PX } from '@/components/abate/ModalNegociarLote';
import { linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';

const LOTE: LoteAbate = { id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 136, pesoMedioKg: 540 };

describe('P92 — o Resultado do lote', () => {
  it('tabela de largura fixa: colgroup com o Total e o "por @" medidos; o rótulo leva o resto', () => {
    render(<ModalNegociarLote lote={LOTE} linha={{ ...linhaVazia('l1'), pesoCarcacaKg: 40676, pesoCarcacaFonte: 'total', precoArroba: 360, precoFonte: 'arroba' }}
      cenario="realizado" onAplicar={vi.fn()} onFechar={vi.fn()} />);
    const tab = screen.getByTestId('resultado-do-lote');
    expect(tab.className).toContain('table-fixed');
    const cols = [...tab.querySelectorAll('colgroup col')].map((c) => (c instanceof HTMLElement ? c.style.width : ''));
    expect(cols).toEqual(['', `${LARGURA_TOTAL_PX}px`, `${LARGURA_POR_ARROBA_PX}px`]);
    /* todo número do resumo passa pelo "número que cabe" (13: seis linhas × 2 colunas + o por cabeça) */
    expect(screen.getAllByTestId('numero-que-cabe')).toHaveLength(13);
    expect(screen.getAllByTestId('numero-que-cabe').map((e) => (e.textContent ?? '').replace(/\u00a0/g, ' '))).toContain('R$ 976.224,00');
  });

  it('as medidas: 400 − 131 − 123 = 146 para o rótulo (pede 121,1 + 20); a fonte desce no máximo 2px e nunca abaixo de 9,5', () => {
    expect(400 - LARGURA_TOTAL_PX - LARGURA_POR_ARROBA_PX).toBeGreaterThanOrEqual(142);
    expect(REDUCAO_MAXIMA_PX).toBe(2);
    expect(PISO_DA_FONTE_PX).toBe(9.5);
  });

  it('o modal tem 962 e o resumo 400 de 1024 para cima; abaixo, uma coluna (o resumo ocupa a largura toda)', () => {
    const fonte = readFileSync('src/components/abate/ModalNegociarLote.tsx', 'utf8');
    expect(fonte).toContain('<DialogContent className="flex max-w-[962px] min-h-[300px] flex-col p-0 gap-0 overflow-hidden">');
    expect(fonte).toContain('<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_400px]">');
    /* o número nunca quebra: nowrap na célula e no próprio número */
    expect(fonte).toContain('<span ref={ref} className="inline-block whitespace-nowrap" data-testid="numero-que-cabe">');
  });
});
