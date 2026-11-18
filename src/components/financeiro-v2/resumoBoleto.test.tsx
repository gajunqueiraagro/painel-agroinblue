/**
 * BOLETO D1d D3 (Gabriel 17/11 14:23, mock-boleto-d1d-v1) — o selo "boleto · venc dd/mm/aaaa" no Resumo do Editar lançamento:
 * lugar fixo logo abaixo da "Nota"; o vencimento é o DO BOLETO, sempre dd/mm/aaaa; "abrir na caixa ↗" abre a caixa; sem boleto, "—".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { ResumoDoLancamento, type ResumoDoLancamentoProps } from './ResumoDoLancamento';
import { seloDoBoleto } from '@/lib/financeiro/boleto/boletoDaParcela';

const BASE: ResumoDoLancamentoProps = {
  tipo: { rotulo: 'Saídas', cor: 'text-red-500' }, competencia: '16/10/2026', favorecido: 'Elos', favorecidoDocumento: '', descricao: null,
  fazenda: null, valor: 'R$ 1.250,00', sentido: 'saida', conta: [{ rotulo: 'Conta', nome: 'BB' }], atividade: null, safra: null, fase: null,
  centro: null, subcentro: null, status: { rotulo: 'Programado' }, forma: null, vencimento: '10/12/2026', pagamento: null, modalidade: null,
  parcelas: null, documento: { numero: 'NF 31.283', selo: null, titulo: 'NF 31.283' },
};

describe('BOLETO D1d D3 — o selo do boleto no Resumo', () => {
  it('o texto: vencimento do boleto em dd/mm/aaaa; sem vencimento, só "boleto"', () => {
    expect(seloDoBoleto({ id: 'b', vencimento: '2026-12-10' })).toBe('boleto · venc 10/12/2026');
    expect(seloDoBoleto({ id: 'b', vencimento: null })).toBe('boleto');
  });
  it('com boleto ligado: o selo abaixo da Nota e "abrir na caixa ↗" chama a caixa', () => {
    const onAbrir = vi.fn();
    render(<ResumoDoLancamento {...BASE} boleto={{ selo: 'boleto · venc 10/12/2026', onAbrir }} />);
    const doc = screen.getByTestId('resumo-documento');
    const linhas = [...doc.querySelectorAll('tr')].map((tr) => tr.querySelector('td')?.textContent);
    expect(linhas).toEqual(['Nota', 'Boleto']);
    expect(screen.getByTestId('resumo-boleto').textContent).toBe('boleto · venc 10/12/2026');
    fireEvent.click(screen.getByTestId('resumo-boleto-abrir'));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });
  it('sem boleto: "—" no mesmo lugar (a linha fica: altura fixa) e nada para abrir', () => {
    render(<ResumoDoLancamento {...BASE} boleto={null} />);
    expect(screen.getByTestId('resumo-boleto').textContent).toBe('—');
    expect(screen.queryByTestId('resumo-boleto-abrir')).toBeNull();
    expect(screen.getByTestId('resumo-documento').className).toContain('h-[50px]');
  });
});
