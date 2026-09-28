/**
 * OC-VENDA-ENTREGAS-01b — a aba Financeiro da venda em conta corrente (mock v4). A regra do saldo mora no banco; aqui se
 * trava o que a TELA mostra: os quatro cartoes, a entrega na coluna do DRE e o recebimento na do caixa, o status do dado
 * (D6: "sem conta bancária", nunca "conciliado"), o saldo final a explicar, o aviso de saida sem entrega e o motivo
 * obrigatorio do vincular.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AbaContaCorrenteOC } from './AbaContaCorrenteOC';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';

function cc(extra: Record<string, unknown> = {}): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 23, valor_acordado: 2366601.26, entregue: 992138.24, cab_entregue: 317,
    recebido: 992140.99, programado: 0, saldo: -2.75, situacao: 'nos_devemos', a_entregar: 0,
    recebimentos_sem_conta_bancaria: 1, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'entrega', data: '2025-03-19', lancamento_id: 'e1', lote_ordem: 1, cab: 178, categoria: 'desmama_m',
        conta: 'Venda de Desmama Machos', valor: 565521.66, status: 'sem_caixa', no_saldo: true, saldo: 565521.66 },
      { tipo: 'entrega', data: '2025-03-20', lancamento_id: 'e2', lote_ordem: 2, cab: 139, categoria: 'desmama_m',
        conta: 'Venda de Desmama Machos', valor: 426616.58, status: 'sem_caixa', no_saldo: true, saldo: 992138.24 },
      { tipo: 'recebimento', data: '2025-04-17', lancamento_id: 'r1', conta: 'Adiantamento de Clientes', valor: 992140.99,
        status: 'sem_conta_bancaria', no_saldo: true, saldo: -2.75 },
    ],
    ...extra,
  });
  if (!r) throw new Error('fixture');
  return r;
}

function api(c: ContaCorrente, over: Partial<OcContaCorrenteApi> = {}): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null),
    listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [{ lancamentoId: 'x1', data: '2025-07-25', valor: 231104,
      descricao: 'Helder Hofig', subcentro: 'Venda de Desmama Machos', mesmoFavorecido: true, semContaBancaria: true,
      status: 'realizado', conciliado: false }] })),
    vincularRecebimento: vi.fn(async () => null),
    ...over,
  };
}

describe('aba conta corrente da OC', () => {
  it("entrega na coluna do DRE, recebimento na do caixa, e o status e' o do dado: sem conta bancaria", () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    const tabela = screen.getByTestId('conta-corrente-tabela');
    const rec = within(tabela).getAllByRole('row').find(r => r.getAttribute('data-tipo') === 'recebimento');
    expect(rec).toBeTruthy();
    if (!rec) return;
    const cel = rec.querySelectorAll('td');
    expect(cel[5].textContent).toBe('');               // Entrega (DRE) vazio
    expect(cel[6].textContent).toContain('992.140,99'); // Recebido (caixa)
    expect(cel[8].textContent).toContain('2,75');       // Adiantado por ele
    expect(rec.textContent).toContain('sem conta bancária');
    expect(tabela.textContent).not.toContain('conciliado');
    expect(rec.textContent).toContain('Recebimento 1 de 1');
    const ent = within(tabela).getAllByRole('row').filter(r => r.getAttribute('data-tipo') === 'entrega');
    expect(ent).toHaveLength(2);
    expect(ent[0].querySelectorAll('td')[5].textContent).toContain('565.521,66');
    expect(ent[0].querySelectorAll('td')[6].textContent).toBe('');
  });

  it("saldo final a explicar so' com as entregas concluidas, com a diferenca e sem gravar nada", () => {
    const { rerender } = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByText('Saldo final a explicar')).toBeTruthy();
    expect(screen.getByText(/pagou mais que o entregue/)).toBeTruthy();
    rerender(<AbaContaCorrenteOC api={api(cc({ a_entregar: 1374463.02 }))} somenteLeitura={false} />);
    expect(screen.queryByText('Saldo final a explicar')).toBeNull();
  });

  it('saida sem entrega pede "Atualizar entregas", e a recusa do banco aparece ao lado, sem toast', async () => {
    const a = api(cc({ saidas_sem_entrega: 2 }), { sincronizarEntregas: vi.fn(async () => 'Conflito de versao (esperada 22, atual 23)') });
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    expect(screen.getByText('2 saídas ainda não viraram entrega no financeiro.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar entregas' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Conflito de versao'));
    expect(a.sincronizarEntregas).toHaveBeenCalledTimes(1);
  });

  it('sem saida pendente nao ha aviso (a busca sabe achar: o caso acima o encontra)', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.queryByRole('button', { name: 'Atualizar entregas' })).toBeNull();
  });

  it('vincular recebimento: sem motivo nao grava e o campo fica vermelho; com motivo grava o escolhido', async () => {
    const a = api(cc());
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Vincular recebimento já lançado' }));
    await waitFor(() => expect(screen.getByText('Helder Hofig')).toBeTruthy());
    fireEvent.click(screen.getByText('Helder Hofig'));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(screen.getByText('Informe o motivo.')).toBeTruthy();
    expect(a.vincularRecebimento).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'recebimento do contrato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    await waitFor(() => expect(a.vincularRecebimento).toHaveBeenCalledWith('x1', 'recebimento do contrato'));
  });

  it('somente leitura (OC cancelada) desliga as duas escritas; "Programar recebimento" diz por que esta desligado', () => {
    render(<AbaContaCorrenteOC api={api(cc({ saidas_sem_entrega: 1 }))} somenteLeitura />);
    expect(screen.getByRole('button', { name: 'Atualizar entregas' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '+ Vincular recebimento já lançado' })).toHaveProperty('disabled', true);
    const prog = screen.getByRole('button', { name: '+ Programar recebimento' });
    expect(prog).toHaveProperty('disabled', true);
    expect(prog.getAttribute('title')).toContain('lance-o no Financeiro');
  });
});
