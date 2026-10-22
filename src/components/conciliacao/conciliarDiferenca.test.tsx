/**
 * CONC-SEM-TRAVA-01 (tela) — o modal "Conciliar" no CASO REAL (OC 0731374f, Banco do Brasil), com a resposta do banco no formato de
 * `fn_conc_simular_diferenca` (provada em `supabase/tests/conc_sem_trava_tela_test.sql`):
 *   T1 sobra (Pix 30/06 R$ 375.000 x Receb. 1/3 R$ 215.000): caixa "Sobram R$ 160.000,00" (ambar), frase do banco, 3 cartoes; a (a) ja'
 *      vem marcada no Receb. 3/3 com "fecha exato"; botao "Conciliar e ligar o Receb. 3/3"; rodape "Extrato R$ 375.000,00 = Receb. 1/3 +
 *      Receb. 3/3"; sem motivo nao grava; com motivo vai `ligar` com o 3/3 acrescentado
 *   T2 falta (Pix 30/07 R$ 290.000 x Receb. 2/3 R$ 375.000): caixa "Falta R$ 85.000,00" (azul); a (a) marcada no Pix de R$ 85.000;
 *      trocar para "deixar em aberto" e para "desconto na OC" muda o verbo e o rodape; o desconto vai `desconto_na_oc`
 *   T3 a regra pura: sem sugestao que fecha exato, nada marcado e o botao pede a escolha; a recusa do banco aparece no rodape
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConciliarDiferencaModal, type ConciliarDiferencaApi } from './ConciliarDiferencaModal';
import { escolhaInicial, lerSimulacao, verboDoBotao } from '@/lib/conciliacao/conciliarDiferenca';

const PIX_0630 = { id: 'pix-0630', data: '2026-06-30', descricao: 'PIX RECEBIDO COMPRADOR A', valor: 375000 };
const PIX_0730 = { id: 'pix-0730', data: '2026-07-30', descricao: 'PIX RECEBIDO COMPRADOR A', valor: 290000 };
const R1 = { id: 'r1', data: '2026-06-30', descricao: 'Venda 118 vacas - 1/2', valor: 215000, parcela: '1/3' };
const R2 = { id: 'r2', data: '2026-07-30', descricao: 'Venda 118 Vacas - 2/2', valor: 375000, parcela: '2/3' };

const SOBRA = { ok: true, sentido: 'a_mais', soma_extratos: 375000, soma_lancamentos: 215000, diferenca: 160000, data_extrato: '2026-06-30',
  ocs: [{ operacao_id: 'oc-0731' }], frase: 'O banco tem R$ 375.000,00 e os lançamentos R$ 215.000,00. Escolha o destino da sobra.',
  opcoes: [
    { codigo: 'acrescentar_lancamento', frase: 'Acrescentar o lançamento que falta (R$ 160.000,00): busca…', sugestoes: [
      { lancamento_id: 'r3', descricao: 'Venda 150 Novilhas/Vacas · Recebimento', data: '2026-06-30', valor: 160000, parcela: '3/3', fecha_exato: true }] },
    { codigo: 'sobra_na_oc', frase: 'Lançar a sobra de R$ 160.000,00 na operação comercial…', previa: { operacao_id: 'oc-0731', valor: 160000, saldo_depois: -590000 } },
    { codigo: 'criar_diferenca', frase: 'Criar o lançamento da diferença…', previa: { valor: 160000, data: '2026-06-30', subcentro: 'Venda de Fêmeas Adultas', favorecido_origem: 'extrato' } },
  ] };
const FALTA = { ok: true, sentido: 'a_menos', soma_extratos: 290000, soma_lancamentos: 375000, diferenca: -85000, data_extrato: '2026-07-30',
  ocs: [{ operacao_id: 'oc-0731' }], frase: 'O banco tem R$ 290.000,00 e os lançamentos R$ 375.000,00. Escolha o que fazer com a falta.',
  opcoes: [
    { codigo: 'juntar_extrato', frase: 'Juntar outro movimento do banco (R$ 85.000,00)…', sugestoes: [
      { extrato_id: 'pix-85', descricao: 'PIX RECEBIDO COMPRADOR A', data: '2026-07-30', valor: 85000, fecha_exato: true }] },
    { codigo: 'ligar_com_falta', frase: 'Ligar o que entrou…', previa: { recebido: 290000, em_aberto: 85000, vencimento: '2026-07-30' } },
    { codigo: 'desconto_na_oc', frase: 'Lançar R$ 85.000,00 de desconto…', previa: { desconto: 85000, lancamento: 'Venda 118 Vacas - 2/2' } },
  ] };

function api(resposta: unknown, erroExec: string | null = null): ConciliarDiferencaApi {
  return {
    simular: vi.fn(async () => lerSimulacao(resposta)),
    executar: vi.fn(async () => erroExec),
    buscar: vi.fn(async () => []),
  };
}
const txt = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ');

describe('CONC-SEM-TRAVA-01 — o modal Conciliar', () => {
  it('T1 sobra: a (a) ja vem marcada no Receb. 3/3 "fecha exato"; o verbo e o rodape dizem a conta; o motivo e obrigatorio', async () => {
    const a = api(SOBRA); const ok = vi.fn(); const fechar = vi.fn();
    render(<ConciliarDiferencaModal open extratos={[PIX_0630]} lancamentos={[R1]} api={a} onConciliado={ok} onClose={fechar} />);
    await waitFor(() => expect(screen.getByTestId('frase-conciliar').textContent).toContain('Escolha o destino da sobra'));
    const caixa = screen.getByTestId('caixa-diferenca');
    expect(txt(caixa)).toBe('SobramR$ 160.000,00');
    expect(caixa.className).toContain('amber');
    expect(screen.getByTestId('cartao-acrescentar_lancamento')).toBeTruthy();
    expect(screen.getByTestId('cartao-sobra_na_oc')).toBeTruthy();
    expect(txt(screen.getByTestId('previa-sobra_na_oc'))).toContain('Saldo da OC depois: R$ 590.000,00');
    expect(txt(screen.getByTestId('previa-criar_diferenca'))).toContain('30/06/2026 · R$ 160.000,00');
    expect(within(screen.getByTestId('lista-acrescentar_lancamento')).getByTestId('selo-fecha-exato')).toBeTruthy();
    expect(screen.getByTestId('botao-conciliar').textContent).toBe('Conciliar e ligar o Receb. 3/3');
    expect(txt(screen.getByTestId('rodape-conciliar'))).toBe('Extrato R$ 375.000,00 = Receb. 1/3 + Receb. 3/3');
    fireEvent.click(screen.getByTestId('botao-conciliar'));
    expect(a.executar).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o motivo.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Pix pagou 1/3 e 3/3 juntos' } });
    fireEvent.click(screen.getByTestId('botao-conciliar'));
    await waitFor(() => expect(a.executar).toHaveBeenCalledWith(['pix-0630'], ['r1', 'r3'], 'ligar', 'Pix pagou 1/3 e 3/3 juntos'));
    await waitFor(() => expect(ok).toHaveBeenCalled());
  });

  it('T2 falta: a (a) marcada no Pix de 85 mil; deixar em aberto e desconto na OC mudam verbo e rodape', async () => {
    const a = api(FALTA);
    render(<ConciliarDiferencaModal open extratos={[PIX_0730]} lancamentos={[R2]} api={a} onConciliado={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('frase-conciliar').textContent).toContain('o que fazer com a falta'));
    const caixa = screen.getByTestId('caixa-diferenca');
    expect(txt(caixa)).toBe('FaltaR$ 85.000,00');
    expect(caixa.className).toContain('sky');
    expect(screen.getByTestId('botao-conciliar').textContent).toBe('Conciliar e juntar o movimento de R$ 85.000,00');
    expect(txt(screen.getByTestId('rodape-conciliar'))).toBe('Extratos R$ 290.000,00 + R$ 85.000,00 = Receb. 2/3');
    fireEvent.click(within(screen.getByTestId('cartao-ligar_com_falta')).getByRole('radio'));
    expect(txt(screen.getByTestId('botao-conciliar'))).toBe('Conciliar e deixar R$ 85.000,00 em aberto');
    expect(txt(screen.getByTestId('previa-ligar_com_falta'))).toContain('Em aberto R$ 85.000,00 · vence 30/07/2026');
    fireEvent.click(within(screen.getByTestId('cartao-desconto_na_oc')).getByRole('radio'));
    expect(screen.getByTestId('botao-conciliar').textContent).toBe('Conciliar e lançar o desconto na OC');
    expect(txt(screen.getByTestId('rodape-conciliar'))).toBe('Extrato R$ 290.000,00 + desconto de R$ 85.000,00 na OC = Receb. 2/3');
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'comprador abateu 85 mil' } });
    fireEvent.click(screen.getByTestId('botao-conciliar'));
    await waitFor(() => expect(a.executar).toHaveBeenCalledWith(['pix-0730'], ['r2'], 'desconto_na_oc', 'comprador abateu 85 mil'));
  });

  it('T3 sem "fecha exato" nada vem marcado; a recusa do banco fica no rodape e o modal nao fecha', async () => {
    const semExato = { ...SOBRA, opcoes: SOBRA.opcoes.map(o => o.codigo === 'acrescentar_lancamento'
      ? { ...o, sugestoes: [{ ...(o.sugestoes as object[])[0], fecha_exato: false }] } : o) };
    const sim = lerSimulacao(semExato).sim;
    expect(escolhaInicial(sim)).toEqual({ codigo: null, itemId: null });
    expect(verboDoBotao(sim, escolhaInicial(sim))).toBeNull();
    const a = api(SOBRA, 'O lançamento "x" (30/06/2026, R$ 160.000,00) já está ligado a outro movimento do banco. Desfaça aquela ligação antes.');
    const fechar = vi.fn();
    render(<ConciliarDiferencaModal open extratos={[PIX_0630]} lancamentos={[R1]} api={a} onConciliado={vi.fn()} onClose={fechar} />);
    await waitFor(() => expect(screen.getByTestId('botao-conciliar').textContent).toBe('Conciliar e ligar o Receb. 3/3'));
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('botao-conciliar'));
    expect((await screen.findByRole('alert')).textContent).toContain('já está ligado a outro movimento do banco');
    expect(fechar).not.toHaveBeenCalled();
  });
});
