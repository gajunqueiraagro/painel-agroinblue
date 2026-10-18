/**
 * FIN-FINANC-28 · PASSO 4b — buscar entradas e pagamentos no contrato de crédito. O banco sugere e decide; a tela lê o envelope
 * (sem cast; peça torta = nulo), mostra a prévia (a gravação desfeita) e só grava na confirmação. Mover de outro contrato pede a
 * confirmação na linha; lançamento que não se move fica apagado.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuscarEntradasDialog, BuscarPagamentoDialog } from './BuscarNoContrato';
import {
  datasDaJanela, encargosPertoDasLiberacoes, fraseDoAviso, fraseDoVazio, janelaDosEncargos, lerBuscaNoContrato, lerResultadoDoVinculo, opcoesParaOBanco,
} from '@/lib/financiamentos/buscaNoContrato';
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
    tela: null, erroDaTela: null, relerTela: vi.fn(),
    liberacoes: [], destinacoes: [], documentos: [], encargos: [], erroDeLeitura: null,
    salvarLiberacao: vi.fn(async () => null), removerLiberacao: vi.fn(async () => null), salvarDestinacao: vi.fn(async () => null),
    removerDestinacao: vi.fn(async () => null), enviarDocumento: vi.fn(async () => null), removerDocumento: vi.fn(async () => null),
    urlDoDocumento: vi.fn(async () => null), lerCaptacoesLivres: vi.fn(async () => []), lerContratosAnteriores: vi.fn(async () => []),
    vinculos: [], buscar: vi.fn(async () => busca ?? 'x'),
    vincularPagamento: vi.fn(async (_p: string, _l: string, _pa: string, _m: boolean, simular: boolean) =>
      ({ simulado: simular, recusa: null, avisos: [], cancelados: 2, movido: false, paga: true, parcelaZerada: false, valorAtualizado: false })),
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
      (mover ? { simulado: s, recusa: null, avisos: [], cancelados: 2, movido: true, paga: true, parcelaZerada: false, valorAtualizado: false } : { simulado: s, recusa: 'Confirme para mover.', avisos: [], cancelados: 0, movido: false, paga: false, parcelaZerada: false, valorAtualizado: false })) });
    render(<BuscarPagamentoDialog api={a} parcela={PARCELA} aoFechar={vi.fn()} />);
    const linhas = await screen.findAllByTestId('candidata-pagamento');
    fireEvent.click(linhas[1]);
    expect(a.vincularPagamento).not.toHaveBeenCalled();
    fireEvent.click(linhas[0]);
    expect(screen.getByTestId('mover-aviso').textContent).toBe('Este lançamento já paga a parcela 2 do contrato C-9.');
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toBe('Confirme para mover.'));
    expect(screen.getByTestId('vincular-a-parcela')).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('confirmar-mover')).getByRole('checkbox'));
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

describe('FIX 4b — a busca nunca é beco sem saída', () => {
  const ZERADA: ParcelaDoContrato = { ...PARCELA, id: 'p-6', numero: 6, valorPrincipal: 0, valorJuros: 0, valorTotal: 0 };
  const BUSCADO = (o: Record<string, unknown> = {}) => ({ faixa: 'qualquer', de: '2031-04-26', ate: '2031-07-25', texto: null, todas: false, sem_previsto: true, ...o });

  it('o leitor e as opções: o que foi procurado volta do banco; a janela é do vencimento; o vazio diz o que procurou', () => {
    const b = lerBuscaNoContrato({ ...ENVELOPE([]), busca: BUSCADO() });
    expect(b?.buscado).toEqual({ faixa: 'qualquer', de: '2031-04-26', ate: '2031-07-25', texto: null, todas: false, semPrevisto: true });
    expect(opcoesParaOBanco({ faixa: 'pct10', busca: ' 1.142.396 ', todas: true })).toEqual({ faixa: '10pct', busca: '1.142.396', todas: true });
    expect(opcoesParaOBanco({})).toEqual({});
    expect(datasDaJanela('2031-06-10', 'd180', { de: null, ate: null })).toEqual({ de: '2030-12-12', ate: '2031-12-07' });
    expect(datasDaJanela('2031-06-10', 'ano', { de: null, ate: null })).toEqual({ de: '2031-01-01', ate: '2031-12-31' });
    expect(datasDaJanela('2031-06-10', 'padrao', { de: null, ate: null })).toEqual({});
    expect(fraseDoVazio(b?.buscado ?? null, 'pagamento')).toBe('Nenhum pagamento encontrado · procurado: 26/04/31 a 25/07/31 · credor, nº do contrato ou conta de financiamento · qualquer valor.');
    expect(lerResultadoDoVinculo({ simulado: true, recusa: null, cancelados: [], avisos: [], parcela_zerada: true, valor_atualizado: true }))
      .toMatchObject({ parcelaZerada: true, valorAtualizado: true });
  });

  it('parcela zerada: o pagamento do credor a 30 dias aparece com "parcela sem valor", "±10%" fica apagado e "juros" fica aceso', async () => {
    const busca = lerBuscaNoContrato({ ...ENVELOPE([LINHA({ data: '2031-07-10', dias: 30, papel_sugerido: 'principal', previsto: 0, diferenca: null,
      motivos: ['favorecido = credor', 'parcela sem valor — sugestão só por credor/data'] })]), busca: BUSCADO() });
    const a = api({ buscar: vi.fn(async () => busca ?? 'x') });
    render(<BuscarPagamentoDialog api={a} parcela={ZERADA} aoFechar={vi.fn()} />);
    const linha = await screen.findByTestId('candidata-pagamento');
    expect(linha.textContent).toContain('parcela sem valor — sugestão só por credor/data');
    const controles = screen.getByTestId('controles-da-busca');
    expect(within(controles).getByText('±10% do previsto').closest('button')).toBeDisabled();
    expect(within(controles).getByText('qualquer').closest('button')?.className).toMatch(/bg-primary/);
    expect(within(screen.getByTestId('escolha-do-pagamento')).getByText('juros').closest('button')).not.toBeDisabled();
  });

  it('a busca livre vai ao banco como opção e mostra o vínculo atual de outro contrato, com a opção de mover', async () => {
    const achada = lerBuscaNoContrato({ ...ENVELOPE([LINHA({ lancamento_id: 'outro-l', valor: 1142396.74, motivos: ['achado pela busca'],
      outro: { tipo: 'parcela_vinculada', numero_contrato: 'C-77', descricao: null, parcela: 3, movivel: true } })]), busca: BUSCADO({ texto: '1.142.396' }) });
    const buscar = vi.fn(async (_al: string, _p: string | null, op?: unknown) => (op ? achada : lerBuscaNoContrato({ ...ENVELOPE([]), busca: BUSCADO() })) ?? 'x');
    const a = api({ buscar });
    render(<BuscarPagamentoDialog api={a} parcela={ZERADA} aoFechar={vi.fn()} />);
    fireEvent.change(await screen.findByTestId('busca-livre'), { target: { value: '1.142.396' } });
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('parcela', 'p-6', expect.objectContaining({ busca: '1.142.396' })), { timeout: 1500 });
    const linha = await screen.findByTestId('candidata-pagamento');
    expect(linha.getAttribute('title')).toContain('já paga a parcela 3 do contrato C-77');
    fireEvent.click(linha);
    expect(await screen.findByTestId('confirmar-mover')).toBeTruthy();
  });

  it('o vazio diz o que procurou e "Ampliar para ±180 dias" pede a janela ao banco', async () => {
    const buscar = vi.fn(async () => lerBuscaNoContrato({ ...ENVELOPE([]), busca: BUSCADO() }) ?? 'x');
    render(<BuscarPagamentoDialog api={api({ buscar })} parcela={ZERADA} aoFechar={vi.fn()} />);
    const vazio = await screen.findByTestId('pagamentos-vazio');
    expect(vazio.textContent).toContain('procurado: 26/04/31 a 25/07/31');
    fireEvent.click(screen.getByTestId('ampliar-180'));
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('parcela', 'p-6', { de: '2030-12-12', ate: '2031-12-07' }));
    fireEvent.click(screen.getByTestId('buscar-em-todas'));
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('parcela', 'p-6', expect.objectContaining({ todas: true, faixa: 'qualquer' })));
  });

  it('vincular na parcela zerada pergunta antes; "Sim" vai ao banco como p_atualizar_valor', async () => {
    const vinc = vi.fn(async (_p: string, _l: string, _pa: string, _m: boolean, s: boolean, at?: boolean | null) =>
      ({ simulado: s, recusa: null, avisos: [], cancelados: 0, movido: false, paga: true, parcelaZerada: true, valorAtualizado: at === true && !s }));
    const a = api({ vincularPagamento: vinc });
    render(<BuscarPagamentoDialog api={a} parcela={ZERADA} aoFechar={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('candidata-pagamento'));
    const lugar = await screen.findByTestId('lugar-da-pergunta');
    await waitFor(() => expect(lugar.textContent).toContain('Atualizar o valor da parcela com o pagamento?'));
    expect(screen.getByTestId('vincular-a-parcela')).toBeDisabled();
    fireEvent.click(within(lugar).getByText('Sim'));
    await waitFor(() => expect(vinc).toHaveBeenLastCalledWith('p-6', 'l-1', 'total', false, true, true));
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toContain('a parcela passa a valer R$ 550,00'));
    fireEvent.click(screen.getByTestId('vincular-a-parcela'));
    await waitFor(() => expect(vinc).toHaveBeenLastCalledWith('p-6', 'l-1', 'total', false, false, true));
    await waitFor(() => expect(screen.getByTestId('previa-do-pagamento').textContent).toContain('a parcela passou a valer R$ 550,00'));
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
