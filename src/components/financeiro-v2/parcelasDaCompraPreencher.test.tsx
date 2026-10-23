/**
 * PARC-DOCS-TABELA-01 — a tabela das Parcelas na aba Documentos do contrato (`ParcelasDaCompra preencher`).
 *   P1 o vencimento sempre dd/mm/aaaa, numa fonte MENOR que o resto da linha
 *   P2 a densidade: a régua quando cabeçalho, N linhas e Total cabem no quadro; senão a compacta (sem medida, a régua)
 *   P3 o Total fica FORA do corpo que rola (preso no pé do quadro): o corpo tem só cabeçalho e linhas
 *   P4 no quadro baixo, 18 parcelas vão para a compacta (linha a 8,5px) e o cabeçalho prende; no alto, a régua sem prender
 *   P5 o recado de quem hospeda ocupa o lugar da dica, na linha do título (sem linha própria)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { ParcelasDaCompra, dataDaParcela, densidadeQueCabe } from '@/components/financeiro-v2/ParcelasDaCompra';

const parcelas = (n: number) => Array.from({ length: n }, (_x, i) => ({ numero: i + 1, dataVencimento: `2026-${String((i % 12) + 1).padStart(2, '0')}-09`, valor: 344 }));
const montar = (n: number, extra: Record<string, unknown> = {}) => render(
  <ParcelasDaCompra preencher parcelas={parcelas(n)} notaFiscal="12345" qtdNotas={1} boletos={[]} foraDoPlano={[]}
    onBoleto={vi.fn()} onTirarBoleto={vi.fn()} onAnexarVarios={vi.fn()} {...extra} />);
const comAltura = (px: number) => vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(px);
const fonte = (el: Element) => /text-\[([\d.]+)px\]/.exec(el.className)?.[1];

afterEach(() => vi.restoreAllMocks());

describe('ParcelasDaCompra — preencher o quadro', () => {
  it('P1 vencimento dd/mm/aaaa, em fonte menor que a linha', () => {
    expect(dataDaParcela('2026-10-09')).toBe('09/10/2026');
    expect(dataDaParcela(null)).toBe('—');
    montar(2);
    const linha = screen.getAllByTestId('linha-parcela')[0];
    const data = within(linha).getByTestId('vencimento-da-parcela');
    expect(data.textContent).toBe('09/01/2026');
    const celulas = linha.querySelectorAll('td');
    expect(Number(fonte(data))).toBeLessThan(Number(fonte(celulas[0])));
  });

  it('P2 a régua quando tudo cabe; a compacta quando não; sem medida, a régua', () => {
    expect(densidadeQueCabe(0, 36)).toBe('normal');
    expect(densidadeQueCabe(120, 2)).toBe('normal');
    expect(densidadeQueCabe(300, 18)).toBe('compacta');
    expect(densidadeQueCabe(17 + 18 * 19 + 21, 18)).toBe('normal');
  });

  it('P3 o Total fica fora do corpo que rola, dentro do quadro', () => {
    montar(18);
    const corpo = screen.getByTestId('corpo-das-parcelas');
    const quadro = screen.getByTestId('quadro-das-parcelas');
    expect(corpo.querySelector('thead')).not.toBeNull();
    expect(corpo.querySelector('tfoot')).toBeNull();
    expect(quadro.querySelector('tfoot')?.textContent).toContain('18 parcelas');
    expect(screen.getByTestId('total-das-parcelas-da-compra').textContent).toBe('6.192,00');
  });

  it('P4 quadro baixo: 18 parcelas na compacta com o cabeçalho preso; quadro alto: a régua sem prender', () => {
    comAltura(200);
    const { unmount } = montar(18);
    expect(screen.getByTestId('quadro-das-parcelas').getAttribute('data-densidade')).toBe('compacta');
    expect(fonte(screen.getAllByTestId('linha-parcela')[0].querySelector('td')!)).toBe('8.5');
    expect(screen.getByText('Parcela').className).toContain('sticky');
    unmount();
    vi.restoreAllMocks();
    comAltura(600);
    montar(18);
    expect(screen.getByTestId('quadro-das-parcelas').getAttribute('data-densidade')).toBe('normal');
    expect(fonte(screen.getAllByTestId('linha-parcela')[0].querySelector('td')!)).toBe('10');
    expect(screen.getByText('Parcela').className).not.toContain('sticky');
  });

  it('P5 o recado entra no lugar da dica, na linha do título', () => {
    montar(2, { aviso: <span data-testid="recado-x">Boleto gravado.</span> });
    const titulo = screen.getByText('Parcelas').parentElement!;
    expect(within(titulo).getByTestId('recado-x')).toBeTruthy();
    expect(titulo.textContent).not.toContain('1 boleto por parcela');
  });
});
