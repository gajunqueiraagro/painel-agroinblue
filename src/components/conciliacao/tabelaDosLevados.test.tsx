/**
 * CONC-CRIAR-COM-NOTA-02 E2 (homologação 09:48, caso Edson) — o Casar com N lançamentos em TABELA: uma linha por lançamento, o extrato numa
 * faixa em cima, Aplicado editável na linha, Fica (inteira/parcial/a mais) e o rodapé aplicado × extrato × diferença. Sintético.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { oQueFica, TabelaDosLevados, type LinhaDoLevado } from './TabelaDosLevados';

const lev = (id: string, nf: string, valor: number, aplicado: string): LinhaDoLevado => ({
  lancamento_id: id, data_vencimento: '2031-10-10', descricao: `Serviço de manutenção ${id}`, fornecedor: 'Oficina Exemplo Dias-ME',
  numero_documento: nf, status_transacao: 'programado', valor_assinado: valor, valorTexto: aplicado });
const EDSON = [lev('404', '000000404', -5250, '386,65'), lev('402', '000000402', -2900, '2.900,00'), lev('288', '000000288', -1403.35, '1.403,35'),
  lev('405', '000000405', -980, '980,00'), lev('289', '000000289', -330, '330,00')];
const EXT = { data: '2031-10-08', historico: 'PIX - ENVIADO - 08/10 15:21 MECANICA LIDER', valor: -6000 };

describe('E2 — TabelaDosLevados', () => {
  it('uma LINHA por lançamento (5 NFs), a NF inteira, o extrato numa faixa e o rodapé aplicado × extrato × diferença', () => {
    render(<TabelaDosLevados extrato={EXT} nomeConta="Banco Exemplo" levados={EDSON} onValor={() => {}} onRemover={() => {}} />);
    const linhas = screen.getAllByTestId('levado-linha');
    expect(linhas).toHaveLength(5);
    expect(linhas.map((l) => within(l).getByTestId('levado-linha-nf').textContent)).toEqual(['000.000.404', '000.000.402', '000.000.288', '000.000.405', '000.000.289']);
    expect(within(linhas[0]).getByTestId('levado-linha-fica').textContent).toBe('parcial · falta 4.863,35');
    expect(within(linhas[1]).getByTestId('levado-linha-fica').textContent).toBe('inteira');
    expect(screen.getByTestId('levados-extrato-historico').getAttribute('title')).toBe(EXT.historico);
    expect(screen.getByTestId('levados-total-aplicado').textContent).toBe('6.000,00');
    expect(screen.getByTestId('levados-diferenca').textContent).toBe('0,00');
    expect(screen.getByTestId('levados-rodape').textContent).toContain('5 lançamentos · 4 inteiras + 1 parcial');
  });
  it('o campo Aplicado e o ✕ chamam o modal (o estado é dele)', () => {
    const onValor = vi.fn(); const onRemover = vi.fn();
    render(<TabelaDosLevados extrato={EXT} levados={EDSON} onValor={onValor} onRemover={onRemover} />);
    fireEvent.change(screen.getAllByTestId('levado-linha-aplicado')[0], { target: { value: '400,00' } });
    expect(onValor).toHaveBeenCalledWith('404', '400,00');
    fireEvent.click(screen.getAllByTestId('levado-linha-remover')[4]);
    expect(onRemover).toHaveBeenCalledWith('289');
  });
  it('oQueFica: inteira, parcial (falta), a mais', () => {
    expect(oQueFica(-100, 100).tipo).toBe('inteira');
    expect(oQueFica(-100, 40)).toMatchObject({ tipo: 'parcial', texto: 'parcial · falta 60,00' });
    expect(oQueFica(-100, 121.8)).toMatchObject({ tipo: 'a_mais', texto: 'a mais 21,80' });
  });
});
