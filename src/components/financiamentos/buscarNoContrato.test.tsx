/**
 * FIN-FINANC-28 · PASSO 4b — buscar entradas e pagamentos no contrato de crédito. O banco sugere e decide; a tela lê o envelope
 * (sem cast; peça torta = nulo), mostra a prévia (a gravação desfeita) e só grava na confirmação. Mover de outro contrato pede a
 * confirmação na linha; lançamento que não se move fica apagado.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuscarEntradasDialog, BuscarPagamentoDialog } from './BuscarNoContrato';
import { encargosPertoDasLiberacoes, fraseDoAviso, janelaDosEncargos, lerBuscaNoContrato, lerResultadoDoVinculo } from '@/lib/financiamentos/buscaNoContrato';
import type { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import type { ParcelaDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

type Api = ReturnType<typeof useContratoDeCredito>;

const LINHA = (o: Record<string, unknown> = {}) => ({
  lancamento_id: 'l-1', data: '2031-06-12', valor: 550, descricao: 'PAGTO 4477', conta: 'Itaú', favorecido: 'Banco', extrato: true, dias: 2,
  pontos: 120, motivos: ['valor = total', 'favorecido = credor'], status_transacao: 'realizado', papel_sugerido: 'total', previsto: 550,
  diferenca: 0, outro: null, ...o,
});
const ENVELOPE = (linhas: unknown[], alvo = 'parcela') => ({ alvo, de: '2031-04-26', ate: '2031-07-25', saldo_a_liberar: 1000, linhas });
const PARCELA: ParcelaDoContrato = {
  id: 'p-1', numero: 1, dataVencimento: '2031-06-10', valorPrincipal: 500, valorJuros: 50, valorTotal: 550, situacao: 'pendente',
  pagoEm: null, valorPago: 0, lancamentoId: 'prog-1', lancamentoJurosId: 'prog-2', fonte: 'lancamento', diverge: false, detalhe: null,
};

function api(o: Partial<Api> = {}): Api {
  const busca = lerBuscaNoContrato(ENVELOPE([LINHA()]));
  return {
    liberacoes: [], destinacoes: [], documentos: [], encargos: [], erroDeLeitura: null,
    salvarLiberacao: vi.fn(async () => null), removerLiberacao: vi.fn(async () => null), salvarDestinacao: vi.fn(async () => null),
    removerDestinacao: vi.fn(async () => null), enviarDocumento: vi.fn(async () => null), removerDocumento: vi.fn(async () => null),
    urlDoDocumento: vi.fn(async () => null), lerCaptacoesLivres: vi.fn(async () => []), lerContratosAnteriores: vi.fn(async () => []),
    vinculos: [], buscar: vi.fn(async () => busca ?? 'x'),
    vincularPagamento: vi.fn(async (_p: string, _l: string, _pa: string, _m: boolean, simular: boolean) =>
      ({ simulado: simular, recusa: null, avisos: [], cancelados: 2, movido: false, paga: true })),
    desvincularPagamento: vi.fn(async () => 'x'), lerEncargosPerto: vi.fn(async () => []), vincularEncargo: vi.fn(async () => null),
    baixaViva: null, darBaixa: vi.fn(async () => 'x'), desfazerBaixa: vi.fn(async () => null), lerSucessores: vi.fn(async () => []),
    ...o,
  };
}

describe('o leitor do envelope', () => {
  it('lê as candidatas como o banco manda; peça torta invalida tudo', () => {
    const b = lerBuscaNoContrato(ENVELOPE([LINHA()]));
    expect(b?.linhas[0]).toMatchObject({ lancamentoId: 'l-1', valor: 550, papelSugerido: 'total', diferenca: 0, outro: null, extrato: true });
    expect(lerBuscaNoContrato(ENVELOPE([LINHA({ valor: 'abc' })]))).toBeNull();
    expect(lerBuscaNoContrato(ENVELOPE([LINHA({ outro: { tipo: 'invento' } })]))).toBeNull();
    expect(lerBuscaNoContrato({ alvo: 'parcela' })).toBeNull();
  });
  it('o retorno do vincular: recusa, avisos em português e o número de programados cancelados', () => {
    const r = lerResultadoDoVinculo({ simulado: true, recusa: null, cancelados: ['a', 'b'], avisos: [{ aviso: 'valor_diferente', previsto: 500, lancamento: 510, diferenca: 10 }, { aviso: 'nao_realizado' }] });
    expect(r).toMatchObject({ simulado: true, recusa: null, cancelados: 2 });
    expect(r?.avisos).toEqual(['valor R$ 510,00 · previsto R$ 500,00', 'o lançamento ainda não está realizado']);
    expect(lerResultadoDoVinculo({ simulado: true, recusa: { frase: 'Não pode.' } })?.recusa).toBe('Não pode.');
    expect(fraseDoAviso({ aviso: 'favorecido_diferente' })).toBe('favorecido não é o credor do contrato');
  });
  it('encargos perto das liberações: só IOF / tarifa / seguro a até 15 dias de uma liberação', () => {
    const linhas = [
      { lancamento_id: 'e1', data: '2031-01-20', valor: 30, papel_sugerido: 'iof', descricao: 'IOF' },
      { lancamento_id: 'e2', data: '2031-03-20', valor: 30, papel_sugerido: 'iof', descricao: 'IOF longe' },
      { lancamento_id: 'e3', data: '2031-01-16', valor: 900, papel_sugerido: 'juros', descricao: 'juros' },
      { lancamento_id: 'e4', data: '2031-01-12', valor: 15, papel_sugerido: 'tarifa', descricao: 'TAC' },
    ];
    expect(encargosPertoDasLiberacoes(linhas, ['2031-01-15']).map((e) => e.lancamentoId)).toEqual(['e1', 'e4']);
    expect(encargosPertoDasLiberacoes(linhas, [])).toEqual([]);
    expect(janelaDosEncargos(['2031-02-01', '2031-01-15'])).toEqual({ de: '2030-12-31', ate: '2031-02-16' });
  });
});

describe('Buscar pagamento', () => {
  it('escolher a candidata simula (gravação desfeita) e só "Vincular" grava, com o papel sugerido', async () => {
    const a = api();
    render(<BuscarPagamentoDialog api={a} parcela={PARCELA} aoFechar={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('candidata-pagamento'));
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toContain('2 lançamento(s) programado(s) da parcela saem'));
    expect(a.vincularPagamento).toHaveBeenLastCalledWith('p-1', 'l-1', 'total', false, true);
    fireEvent.click(screen.getByTestId('vincular-a-parcela'));
    await waitFor(() => expect(a.vincularPagamento).toHaveBeenLastCalledWith('p-1', 'l-1', 'total', false, false));
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toContain('Desvincule na linha do cronograma'));
  });
  it('lançamento de outro contrato que se move pede a confirmação; o que não se move fica apagado e não se escolhe', async () => {
    const busca = lerBuscaNoContrato(ENVELOPE([
      LINHA({ lancamento_id: 'mov', outro: { tipo: 'parcela_vinculada', numero_contrato: 'C-9', descricao: 'X', parcela: 2, movivel: true } }),
      LINHA({ lancamento_id: 'fixo', outro: { tipo: 'parcela_do_contrato', numero_contrato: 'C-8', descricao: 'Y', parcela: 3, movivel: false } }),
    ]));
    const a = api({ buscar: vi.fn(async () => busca ?? 'x'), vincularPagamento: vi.fn(async (_p: string, _l: string, _pa: string, mover: boolean, s: boolean) =>
      (mover ? { simulado: s, recusa: null, avisos: [], cancelados: 2, movido: true, paga: true } : { simulado: s, recusa: 'Confirme para mover.', avisos: [], cancelados: 0, movido: false, paga: false })) });
    render(<BuscarPagamentoDialog api={a} parcela={PARCELA} aoFechar={vi.fn()} />);
    const linhas = await screen.findAllByTestId('candidata-pagamento');
    fireEvent.click(linhas[1]);
    expect(a.vincularPagamento).not.toHaveBeenCalled();
    fireEvent.click(linhas[0]);
    expect(screen.getByTestId('mover-aviso').textContent).toBe('Este lançamento já paga a parcela 2 do contrato C-9.');
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toBe('Confirme para mover.'));
    expect(screen.getByTestId('vincular-a-parcela')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('vincular-a-parcela')).not.toBeDisabled());
    expect(a.vincularPagamento).toHaveBeenLastCalledWith('p-1', 'mov', 'total', true, true);
  });
});

describe('Buscar entradas', () => {
  it('"Vincular como liberação" grava pelo salvar de sempre ("em conta" apontando para a entrada); a recusa fica escrita', async () => {
    const busca = lerBuscaNoContrato(ENVELOPE([LINHA({ lancamento_id: 'ent', valor: 1000, data: '2031-01-15' })], 'liberacao'));
    const salvar = vi.fn(async () => 'Este lançamento já está ligado a outra liberação.');
    const a = api({ buscar: vi.fn(async () => busca ?? 'x'), salvarLiberacao: salvar });
    render(<BuscarEntradasDialog api={a} aoFechar={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('vincular-como-liberacao'));
    await waitFor(() => expect(screen.getByTestId('recado-entradas').textContent).toBe('Este lançamento já está ligado a outra liberação.'));
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ id: null, forma: 'conta', lancamentoId: 'ent', valor: 1000, data: '2031-01-15' }));
  });
});

describe('fonte', () => {
  const fonte = readFileSync(resolve(__dirname, 'BuscarNoContrato.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  it('só desenha: sem soma, sem mono; tamanho fixo e lugar reservado da prévia', () => {
    expect(fonte).not.toMatch(/\.reduce\(|\+=/);
    expect(fonte).not.toMatch(/font-mono/);
    expect(fonte).toMatch(/h-\[520px\] w-\[1000px\]/);
    expect(fonte).toMatch(/h-\[30px\] shrink-0/);
  });
});
