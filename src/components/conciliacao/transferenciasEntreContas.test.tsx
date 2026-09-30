/**
 * PR-CONC-TRANSFERENCIAS-01 — o modal "Transferências entre contas" e o botão no passo 2.
 *
 * ⚠ OS PARES SÃO OS DO NJ set/26 (a simulação no banco): um limpo (Itaú → Sicredi Lavoura 50k), o nó de 100k que o
 *   mesmo dia resolve, e um ambíguo sintético (a RPC real devolveu zero ambíguos em set/26).
 * ⚠ A RPC É FALSA AQUI: quem prova o banco é o teste em ROLLBACK do PR. Aqui se prova a TELA — o que vai marcado, que a
 *   prévia roda com `simular = true` e não grava, que só o segundo clique grava, e que a recusa não é enviada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { LinhaTransferencia, ResultadoTransferencia } from '@/hooks/useTransferenciasSugeridas';
import { TransferenciasEntreContasModal } from './TransferenciasEntreContasModal';

const ponta = (id: string, data: string, valor: number, conta: string, descricao: string) =>
  ({ id, data, valor, conta_id: `c-${conta}`, conta, descricao });

const LIMPO: LinhaTransferencia = {
  saida: ponta('s50', '2026-09-02', -50000, 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97'),
  como: 'limpo',
  entrada: ponta('e50', '2026-09-02', 50000, 'Sicredi Lavoura', 'RECEBIMENTO PIX-PIX_CRED  21424412897 NATALINO CAVALLI JUNIOR'),
  existente_id: null, candidatas: [],
};
const MESMO_DIA: LinhaTransferencia = {
  saida: ponta('s100', '2026-09-02', -100000, 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97'),
  como: 'mesmo_dia',
  entrada: ponta('b38bb790', '2026-09-02', 100000, 'Banco do Brasil', 'Pix - Recebido - 02/09 09:23 21424412897 NATALINO CAVAL'),
  existente_id: 'lanc-existente', candidatas: [],
};
const AMBIGUO: LinhaTransferencia = {
  saida: ponta('s30', '2026-09-10', -30000, 'Itau BBA', 'TED ENVIADA'),
  como: 'ambiguo', entrada: null, existente_id: null,
  candidatas: [
    { ...ponta('eBB', '2026-09-10', 30000, 'Banco do Brasil', 'TED RECEBIDA BB'), existente_id: null },
    { ...ponta('eSL', '2026-09-11', 30000, 'Sicredi Lavoura', 'TED RECEBIDA SICREDI'), existente_id: null },
  ],
};

const M = vi.hoisted(() => ({
  fechar: vi.fn(),
  aoGravar: vi.fn(),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  M.aoGravar.mockReset();
  M.fechar.mockReset().mockImplementation(async (_s: string): Promise<ResultadoTransferencia> =>
    ({ ok: true, acao: _s === 's100' ? 'casar_existente' : 'criar' }));
});

function abrir(linhas: LinhaTransferencia[] = [LIMPO, MESMO_DIA, AMBIGUO]) {
  return render(
    <TransferenciasEntreContasModal open onClose={() => {}} rotuloMes="09/2026" linhas={linhas}
      fechar={M.fechar} aoGravar={M.aoGravar} />,
  );
}
const linhaDe = (valor: string) => screen.getAllByTestId('transferencia').find((tr) => tr.textContent?.includes(valor))!;
const caixa = (valor: string) => within(linhaDe(valor)).getByRole('checkbox');

describe('a lista', () => {
  it('o resolvido (limpo e mesmo dia) nasce marcado; o ambíguo espera a escolha da entrada', () => {
    abrir();
    expect(caixa('50.000,00')).toBeChecked();
    expect(caixa('100.000,00')).toBeChecked();
    expect(caixa('30.000,00')).not.toBeChecked();
    expect(caixa('30.000,00')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar selecionadas (2)' })).toBeEnabled();
  });

  it('uma informação por coluna: Data | Saída | Descrição | Valor | Data | Entrada | Descrição', () => {
    abrir([LIMPO]);
    const cels = within(linhaDe('50.000,00')).getAllByRole('cell').map((c) => c.textContent);
    expect(cels.slice(1, 8)).toEqual([
      '02/09', 'Itau BBA', 'PIX ENVIADO NATALINO CAVALLI JUNIOR 214.244.128-97', '50.000,00',
      '02/09', 'Sicredi Lavoura', 'RECEBIMENTO PIX-PIX_CRED  21424412897 NATALINO CAVALLI JUNIOR',
    ]);
  });

  it('"casa na existente" só na linha que tem transferência lançada', () => {
    abrir();
    expect(within(linhaDe('100.000,00')).getByTestId('selo-existente').textContent).toBe('casa na existente');
    expect(within(linhaDe('50.000,00')).queryByTestId('selo-existente')).toBeNull();
  });

  it('o ambíguo: escolher a entrada preenche a linha e a marca', async () => {
    abrir();
    fireEvent.keyDown(within(linhaDe('30.000,00')).getByRole('combobox'), { key: 'Enter' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '10/09 · Banco do Brasil · TED RECEBIDA BB', '11/09 · Sicredi Lavoura · TED RECEBIDA SICREDI',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '11/09 · Sicredi Lavoura · TED RECEBIDA SICREDI' }));
    await waitFor(() => expect(caixa('30.000,00')).toBeChecked());
    expect(linhaDe('30.000,00').textContent).toContain('TED RECEBIDA SICREDI');
    expect(screen.getByRole('button', { name: 'Confirmar selecionadas (3)' })).toBeEnabled();
  });

  it('desmarcar tira da seleção', () => {
    abrir();
    fireEvent.click(caixa('50.000,00'));
    expect(screen.getByRole('button', { name: 'Confirmar selecionadas (1)' })).toBeEnabled();
  });
});

describe('confirmar', () => {
  it('1º clique: prévia pela RPC com simular = true, NADA grava; 2º clique grava só o que a prévia aceitou', async () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar selecionadas (2)' }));
    await screen.findByRole('button', { name: 'Confirmar transferência (2)' });
    expect(M.fechar.mock.calls).toEqual([['s50', 'e50', true], ['s100', 'b38bb790', true]]);
    expect(M.aoGravar).not.toHaveBeenCalled();
    expect(screen.getByTestId('previa-transferencias').textContent)
      .toBe('2 transferências: 1 nova · 1 casa na existente · 150.000,00');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferência (2)' }));
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(M.fechar.mock.calls.slice(2)).toEqual([['s50', 'e50', false], ['s100', 'b38bb790', false]]);
    expect(screen.getByTestId('previa-transferencias').textContent).toBe('2 transferências gravadas');
  });

  it('a recusa da prévia aparece na linha e NÃO é enviada na gravação', async () => {
    M.fechar.mockImplementation(async (s: string): Promise<ResultadoTransferencia> =>
      s === 's50' ? { ok: false, motivo: 'mes_fechado' } : { ok: true, acao: 'criar' });
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar selecionadas (2)' }));
    await screen.findByRole('button', { name: 'Confirmar transferência (1)' });
    expect(within(linhaDe('50.000,00')).getByTestId('recusa-transferencia').textContent).toBe('mês fechado');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferência (1)' }));
    await waitFor(() => expect(M.aoGravar).toHaveBeenCalledTimes(1));
    expect(M.fechar.mock.calls.filter((c) => c[2] === false)).toEqual([['s100', 'b38bb790', false]]);
  });

  it('mexer na seleção depois da prévia desfaz a prévia (não se grava o que não se viu)', async () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar selecionadas (2)' }));
    await screen.findByRole('button', { name: 'Confirmar transferência (2)' });
    fireEvent.click(caixa('50.000,00'));
    expect(screen.getByRole('button', { name: 'Confirmar selecionadas (1)' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Confirmar transferência/ })).toBeNull();
  });

  it('nada gravado: aoGravar não é chamado', async () => {
    M.fechar.mockImplementation(async (_s: string, _e: string, simular: boolean): Promise<ResultadoTransferencia> =>
      simular ? { ok: true, acao: 'criar' } : { ok: false, motivo: 'extrato_ja_conciliado' });
    abrir([LIMPO]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar selecionadas (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar transferência (1)' }));
    await waitFor(() => expect(screen.getByTestId('previa-transferencias').textContent)
      .toBe('0 transferências gravadas · 1 recusada (50.000,00: um dos movimentos já está conciliado)'));
    expect(M.aoGravar).not.toHaveBeenCalled();
  });
});
