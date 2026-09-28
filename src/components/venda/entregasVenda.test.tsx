/**
 * OC-VENDA-ENTREGAS-01a — a aba Entrega da venda por SAIDA: adotar, desvincular, "Enviar todos" com uma data por linha.
 *
 * ⚠ A REGRA DE QUEM PODE SER ADOTADO MORA NO BANCO (`_oc_motivo_nao_adotavel`: financeiro programado do modal antigo
 *   fora, saida ja' adotada fora, estornada fora) e a TRAVA DE LOTES tambem (`oc_salvar_lotes`) — as duas foram provadas
 *   em rollback, com os dados da 232c05aa (cabecalho da migration 20261027166000). Este arquivo trava o que a TELA faz:
 *   ela so' oferece o que `oc_saidas_adotaveis` devolveu, nao tem caminho para adotar outro lancamento, e mostra a recusa
 *   do banco ao lado do botao.
 * Numeros do caso real: Santa Rita, OC 232c05aa, desmama M a 12,80/kg e garrotes a 12,00/kg.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { EntregasVendaTabela, EnviarTodosDialog } from './EntregasVendaTabela';
import { linhasDaEntrega, precoDoContrato, itensEnviarTodos, datasFaltando } from '@/lib/oc/entregasPorLote';
import type { RecebimentoApi, LoteRecebimento, MovimentacaoOC, SaidaAdotavel } from '@/hooks/useOperacaoRecebimento';

const lote = (o: Partial<LoteRecebimento>): LoteRecebimento => ({
  loteId: 'l1', ordem: 1, categoria: 'desmama_m', qtdNegociada: 178, qtdRecebida: 0, diferenca: 178,
  estado: 'nao_iniciado', pesoMedioNegociadoKg: 248.21, criterioValor: 'kg', valorInformado: 12.8, ...o,
});
const mov = (o: Partial<MovimentacaoOC>): MovimentacaoOC => ({
  id: 'm1', loteId: 'l1', data: '2025-03-19', categoria: 'desmama_m', quantidade: 178, pesoMedio: 248.21,
  cancelado: false, origem: 'adotada', lancamentoId: 'ef0a8a40-19d1-47f3-aaba-9acc82524e49', valorTotal: 565521.66, ...o,
});
const L1 = lote({ qtdRecebida: 178, diferenca: 0, estado: 'completo' });
const L7 = lote({ loteId: 'l7', ordem: 7, categoria: 'garrotes', qtdNegociada: 11, diferenca: 11, pesoMedioNegociadoKg: 189.82, valorInformado: 12 });
const ADOTAVEIS: SaidaAdotavel[] = [
  { lancamentoId: '81e41593-d0aa-4963-bd01-99670d2c0af2', data: '2025-06-25', categoria: 'garrotes', quantidade: 11,
    pesoMedio: 189.82, valorTotal: 25056.24, origemRegistro: 'importacao_historica', criadoEm: '2026-04-13T10:00:00Z' },
  { lancamentoId: '5293daf3-85bc-4c4c-85fd-751d0dbb197c', data: '2025-05-21', categoria: 'garrotes', quantidade: 6,
    pesoMedio: 234.77, valorTotal: 18031.09, origemRegistro: 'importacao_historica', criadoEm: '2026-04-13T10:00:00Z' },
];
const catLabel = (s: string | null | undefined) => (s === 'desmama_m' ? 'Desmama M' : s === 'garrotes' ? 'Garrotes' : '—');

function apiFalsa(o: Partial<RecebimentoApi> = {}): RecebimentoApi {
  return {
    lotes: [L1, L7], movimentacoes: [mov({})], loading: false, saving: false,
    concluirNegociacao: vi.fn(), receberTodos: vi.fn(), registrar: vi.fn(), estornar: vi.fn(), encerrar: vi.fn(),
    reabrir: vi.fn(), estornarTudo: vi.fn(), recarregar: vi.fn(),
    listarAdotaveis: vi.fn(async () => ({ saidas: ADOTAVEIS, erro: null })),
    adotar: vi.fn(async () => null), desvincular: vi.fn(async () => null),
    ...o,
  };
}
function montar(api: RecebimentoApi, extra: { onRegistrarNova?: (id: string) => void; onEstornar?: (id: string) => void } = {}) {
  return render(<EntregasVendaTabela api={api} catLabel={catLabel} readOnly={false} fazendaNome="Faz. Sta. Rita"
    contraparteNome="Helder Hofig" onRegistrarNova={extra.onRegistrarNova ?? vi.fn()} onEstornar={extra.onEstornar ?? vi.fn()} />);
}

describe('regras puras da entrega por saida', () => {
  it('uma linha por saida ATIVA; o lote com saldo ganha a linha pendente; a estornada nao aparece', () => {
    const linhas = linhasDaEntrega([L7, L1], [mov({}), mov({ id: 'est', loteId: 'l7', cancelado: true, origem: 'registrada' })]);
    expect(linhas.map(l => [l.lote.loteId, l.tipo])).toEqual([['l1', 'saida'], ['l7', 'pendente']]);
    expect(linhas[1].tipo === 'pendente' && linhas[1].falta).toBe(11);
  });
  it('o preco do contrato sai pelo criterio, e sem valor e' + "' traco", () => {
    expect(precoDoContrato({ criterioValor: 'kg', valorInformado: 12.8 })).toBe('12,80/kg');
    expect(precoDoContrato({ criterioValor: 'cabeca', valorInformado: 1500 })).toBe('R$ 1.500,00/cab');
    expect(precoDoContrato({ criterioValor: 'kg', valorInformado: null })).toBe('—');
  });
  it('"Enviar todos" propoe so' + "' os lotes com saldo, e data vazia e' cobrada por linha", () => {
    const itens = itensEnviarTodos([L1, L7], '2025-03-19');
    expect(itens).toEqual([{ loteId: 'l7', falta: 11, data: '2025-03-19' }]);
    expect([...datasFaltando([{ loteId: 'l7', data: '' }, { loteId: 'l1', data: '2025-06-25' }])]).toEqual(['l7']);
  });
});

describe('tabela da entrega da venda', () => {
  it('saida adotada mostra o selo com o lancamento, o valor da SAIDA em verde e "desvincular"; nada truncado', () => {
    const { container } = montar(apiFalsa());
    const adotada = container.querySelector('[data-linha="saida"]') as HTMLElement;
    expect(within(adotada).getByText('adotada · ef0a8a40')).toBeTruthy();
    const valor = within(adotada).getByText('565.521,66');
    expect(valor.className).toContain('text-emerald-700');
    expect(within(adotada).getByText('desvincular')).toBeTruthy();
    expect(within(adotada).queryByText('estornar')).toBeNull();
    expect(container.querySelector('.truncate')).toBeNull();
    // cabecalhos centralizados
    container.querySelectorAll('thead th').forEach(th => expect(th.className).toContain('text-center'));
  });

  it('saida registrada pela OC mostra "estornar", nunca "desvincular"', () => {
    const onEstornar = vi.fn();
    const { container } = montar(apiFalsa({ movimentacoes: [mov({ origem: 'registrada', id: 'reg' })] }), { onEstornar });
    const linha = container.querySelector('[data-linha="saida"]') as HTMLElement;
    expect(within(linha).queryByText('desvincular')).toBeNull();
    fireEvent.click(within(linha).getByText('estornar'));
    expect(onEstornar).toHaveBeenCalledWith('reg');
  });

  it('desvincular chama so' + "' o desvinculo; a recusa do banco aparece ao lado, sem toast", async () => {
    const desvincular = vi.fn(async () => 'Entrega ja encerrada; reabra a entrega para desvincular');
    montar(apiFalsa({ desvincular }));
    fireEvent.click(screen.getByText('desvincular'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('reabra a entrega'));
    expect(desvincular).toHaveBeenCalledWith('m1');
  });

  it('o lote pendente oferece "Adotar saida ja lancada" e "Registrar nova saida"', () => {
    const onRegistrarNova = vi.fn();
    const { container } = montar(apiFalsa(), { onRegistrarNova });
    const pend = container.querySelector('[data-linha="pendente"]') as HTMLElement;
    expect(within(pend).getByText('pendente')).toBeTruthy();
    fireEvent.click(within(pend).getByText('Registrar nova saída'));
    expect(onRegistrarNova).toHaveBeenCalledWith('l7');
  });

  it('o seletor mostra SO' + "' o que o banco devolveu; sem marcar nada, cobra ao lado e nao grava; marcada, adota", async () => {
    const api = apiFalsa();
    const { container } = montar(api);
    fireEvent.click(screen.getByText('Adotar saída já lançada'));
    await waitFor(() => expect(container.querySelectorAll('[data-adotavel]').length).toBe(2));
    expect(api.listarAdotaveis).toHaveBeenCalledWith('l7');
    // so' as duas que a RPC devolveu — e nao ha campo para digitar outro lancamento
    expect([...container.querySelectorAll('[data-adotavel]')].map(e => e.getAttribute('data-adotavel')))
      .toEqual(ADOTAVEIS.map(s => s.lancamentoId));
    expect(container.querySelector('[data-testid="seletor-adocao"] input[type="text"]')).toBeNull();
    expect(screen.getByText('81e41593 · importado 13/04')).toBeTruthy();

    fireEvent.click(screen.getByText('Adotar 0 saídas'));
    expect(screen.getByRole('alert').textContent).toBe('Selecione ao menos uma saída.');
    expect(api.adotar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Selecionar saída de 25/06/2025'));
    fireEvent.click(screen.getByText('Adotar 1 saída'));
    await waitFor(() => expect(api.adotar).toHaveBeenCalledWith('l7', ['81e41593-d0aa-4963-bd01-99670d2c0af2']));
    await waitFor(() => expect(container.querySelector('[data-testid="seletor-adocao"]')).toBeNull());
  });

  it('a recusa da adocao fica no seletor, ao lado do botao', async () => {
    const api = apiFalsa({ adotar: vi.fn(async () => 'Saida nao pode ser adotada: Saida ja pertence a uma operacao comercial') });
    const { container } = montar(api);
    fireEvent.click(screen.getByText('Adotar saída já lançada'));
    await waitFor(() => expect(container.querySelectorAll('[data-adotavel]').length).toBe(2));
    fireEvent.click(screen.getByLabelText('Selecionar saída de 21/05/2025'));
    fireEvent.click(screen.getByText('Adotar 1 saída'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('ja pertence a uma operacao comercial'));
    expect(container.querySelector('[data-testid="seletor-adocao"]')).not.toBeNull();
  });
});

describe('"Enviar todos" da venda — uma data por linha (D3)', () => {
  it('manda a data de CADA lote; data apagada fica vermelha, com a frase, e nada e' + "' enviado", () => {
    const onConfirmar = vi.fn();
    const L6 = lote({ loteId: 'l6', ordem: 6, categoria: 'garrotes', qtdNegociada: 6, diferenca: 6 });
    const { container } = render(<EnviarTodosDialog lotes={[L1, L6, L7]} dataPadrao="2025-03-19" catLabel={catLabel}
      saving={false} onConfirmar={onConfirmar} onFechar={vi.fn()} />);
    const linhas = document.querySelectorAll('[data-enviar]');
    expect([...linhas].map(l => l.getAttribute('data-enviar'))).toEqual(['l6', 'l7']);
    const campo = within(linhas[1] as HTMLElement).getByRole('textbox');
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Enviar 2 lotes'));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Informe a data da saída.')).toBeTruthy();
    fireEvent.change(campo, { target: { value: '25/06/2025' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByText('Enviar 2 lotes'));
    expect(onConfirmar).toHaveBeenCalledWith({ l6: '2025-03-19', l7: '2025-06-25' });
    expect(container).toBeTruthy();
  });
});
