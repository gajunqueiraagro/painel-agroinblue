/**
 * BOLETO D1d D3 (Gabriel 17/11 14:23, mock-boleto-d1d-v1) — o selo "boleto · venc dd/mm/aaaa" no Resumo do Editar lançamento:
 * lugar fixo logo abaixo da "Nota"; o vencimento é o DO BOLETO, sempre dd/mm/aaaa; "abrir na caixa ↗" abre a caixa; sem boleto, "—".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { ResumoDoLancamento, modalidadeCurta, type ResumoDoLancamentoProps } from './ResumoDoLancamento';
import { seloDoBoleto } from '@/lib/financeiro/boleto/boletoDaParcela';

const BASE: ResumoDoLancamentoProps = {
  tipo: { rotulo: 'Saídas', cor: 'text-red-500' }, competencia: '16/10/2026', favorecido: 'Elos', favorecidoDocumento: '', descricao: null,
  fazenda: null, valor: 'R$ 1.250,00', sentido: 'saida', conta: [{ rotulo: 'Conta', nome: 'BB' }], atividade: null, safra: null, fase: null,
  centro: null, subcentro: null, status: { rotulo: 'Programado' }, forma: null, vencimento: '10/12/2026', pagamento: null, modalidade: null,
  parcelas: null, documento: { numero: 'NF 31.283', selo: null, titulo: 'NF 31.283' },
};

describe('BOLETO D1d D3 — o selo do boleto no Resumo', () => {
  it('o texto: vencimento do boleto em dd/mm/aaaa; sem vencimento, só "boleto"', () => {
    expect(seloDoBoleto({ vencimento: '2026-12-10' })).toBe('venc 10/12/2026');
    expect(seloDoBoleto({ vencimento: null })).toBe('sem venc.');
  });
  it('com boleto ligado: "venc dd/mm/aaaa" abaixo da Nota e o 👁 abre o PDF (Gabriel 18/11 14:40: sem "boleto ·" nem "abrir na caixa")', () => {
    const onVer = vi.fn();
    render(<ResumoDoLancamento {...BASE} boleto={{ selo: 'venc 10/12/2026', onVer }} />);
    const doc = screen.getByTestId('resumo-documento');
    const linhas = [...doc.querySelectorAll('tr')].map((tr) => tr.querySelector('td')?.textContent);
    expect(linhas).toEqual(['Nota', 'Boleto']);
    expect(screen.getByTestId('resumo-boleto').textContent).toBe('venc 10/12/2026');
    expect(screen.getByTestId('resumo-documento').textContent).not.toMatch(/abrir|boleto ·/);
    fireEvent.click(screen.getByTestId('resumo-boleto-ver'));
    expect(onVer).toHaveBeenCalledTimes(1);
  });
  it('boleto sem PDF guardado: o 👁 fica apagado e diz por quê', () => {
    render(<ResumoDoLancamento {...BASE} boleto={{ selo: 'venc 10/12/2026', onVer: null }} />);
    expect(screen.getByTestId('resumo-boleto-ver')).toBeDisabled();
    expect(screen.getByTestId('resumo-boleto-ver').getAttribute('title')).toBe('o boleto não tem PDF guardado');
  });
  it('a Nota: só o número na linha (o selo "da compra" saiu); a origem por extenso no title — nada cortado (14:40)', () => {
    render(<ResumoDoLancamento {...BASE} documento={{ numero: 'NF 000.122.048', selo: 'da compra', titulo: 'NF 000.122.048' }} />);
    expect(screen.queryByTestId('resumo-nota-selo')).toBeNull();
    expect(screen.getByTestId('resumo-nota').textContent?.trim()).toBe('NF 000.122.048');
    expect(screen.getByTestId('resumo-nota').closest('td')?.getAttribute('title')).toBe('NF 000.122.048 · da compra: a nota está na compra parcelada e vale para as parcelas');
  });
  it('a Modalid.: o valor curto ("Parcelada", "Solta"), o inteiro no title (14:40: "Compra pa…")', () => {
    render(<ResumoDoLancamento {...BASE} modalidade="Compra parcelada" parcelas="1 de 3" />);
    expect(screen.getByTestId('resumo-modalidade').textContent).toBe('Parcelada');
    expect(screen.getByTestId('resumo-modalidade').closest('td')?.getAttribute('title')).toBe('Compra parcelada');
    expect(modalidadeCurta('Parcela solta')).toBe('Solta');
    expect(modalidadeCurta('À vista')).toBe('À vista');
  });
  it('sem boleto: "—" no mesmo lugar (a linha fica: altura fixa) e nada para abrir', () => {
    render(<ResumoDoLancamento {...BASE} boleto={null} />);
    expect(screen.getByTestId('resumo-boleto').textContent).toBe('—');
    expect(screen.queryByTestId('resumo-boleto-ver')).toBeNull();
    expect(screen.getByTestId('resumo-documento').className).toContain('h-[50px]');
  });
});
