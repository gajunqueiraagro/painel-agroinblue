/**
 * OC-CORRECOES-01 C3 · OC-CC-BUSCAR-01 — o "Buscar recebimento no Financeiro" (Gabriel 21/10, print 15h41 da 0731374f: so' aparecia
 * "Outro favorecido"). O banco devolve tambem o que e' do comprador e a regra exclui, com o motivo (`oc_recebimentos_do_financeiro`,
 * provado em `supabase/tests/oc_recebimentos_do_financeiro_01_test.sql`); aqui se trava o que a TELA faz com isso:
 *   B1 os dois avulsos do comprador aparecem em "Do comprador", apagados, com o motivo no Status e sem poder escolher
 *   B2 a busca livre: "118" acha os dois (descricao); favorecido e valor tambem casam; sem nada, a frase da busca
 *   B3 as nove colunas na ordem pedida; datas inteiras (dd/mm/aaaa) e valor nunca cortam; o modal e' fixo e so' a tabela rola
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AbaContaCorrenteOC, casaNaBusca } from './AbaContaCorrenteOC';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi, RecebimentoVinculavel } from '@/hooks/useOcContaCorrente';

function cc(): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 26, valor_acordado: 750000, entregue: 750000, cab_entregue: 118, recebido: 0, programado: 750000,
    devolvido: 0, saldo: -750000, explicado: 0, saldo_a_explicar: -750000, falta_explicar: -750000, situacao: 'falta_receber',
    a_entregar: 0, ultima_entrega: '2026-06-20', recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'entrega', data: '2026-06-20', parte_id: 'e1', lote_ordem: 1, cab: 118, categoria: 'vaca', conta_ordem: 1130,
        conta: 'Venda de Fêmeas Adultas', mov_entrega: -750000, status: 'sem_caixa', no_saldo: true, saldo: -750000 },
    ],
    explicacoes: [],
  });
  if (!r) throw new Error('fixture');
  return r;
}

const ITENS: RecebimentoVinculavel[] = [
  { lancamentoId: 'a1', data: '2026-06-30', competencia: '2026-06-30', vencimento: '2026-06-30', pagamento: null, valor: 215000,
    descricao: 'Venda 118 Vacas - 1/3', subcentro: 'Venda de Fêmeas Adultas', favorecido: 'Comprador A', contaBancaria: 'Banco do Brasil',
    mesmoFavorecido: true, semContaBancaria: false, status: 'programado', conciliado: false, motivoExcluido: 'já está nesta operação (1/1)' },
  { lancamentoId: 'a2', data: '2026-07-30', competencia: '2026-06-30', vencimento: '2026-07-30', pagamento: null, valor: 375000,
    descricao: 'Venda 118 Vacas - 2/3', subcentro: 'Venda de Fêmeas Adultas', favorecido: 'Comprador A', contaBancaria: 'Banco do Brasil',
    mesmoFavorecido: true, semContaBancaria: false, status: 'programado', conciliado: false, motivoExcluido: 'já está nesta operação (1/1)' },
  { lancamentoId: 'o1', data: '2026-07-02', competencia: '2026-07-01', vencimento: '2026-07-02', pagamento: '2026-07-02', valor: 1234.5,
    descricao: 'Pix de terceiro', subcentro: 'Venda de Fêmeas Adultas', favorecido: 'Outra Pessoa', contaBancaria: 'Sicredi',
    mesmoFavorecido: false, semContaBancaria: false, status: 'realizado', conciliado: false, motivoExcluido: null },
];

function api(itens = ITENS): OcContaCorrenteApi {
  return {
    contaCorrente: cc(), loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null), listarVinculaveis: vi.fn(async () => ({ erro: null, itens })),
    vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null), desfazerExplicacao: vi.fn(async () => null),
    simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })), lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
    listarLotes: vi.fn(async () => []), listarContas: vi.fn(async () => []),
  };
}

async function abrir(a = api()) {
  render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Buscar recebimento no Financeiro' }));
  await waitFor(() => expect(screen.getByTestId('grupo-mesmo-favorecido')).toBeTruthy());
  return a;
}
const linha = (id: string) => document.querySelector(`tr[data-lancamento="${id}"]`) as HTMLElement;

describe('OC-CC-BUSCAR-01 — o Buscar recebimento no Financeiro', () => {
  it('B1 os avulsos do comprador aparecem em "Do comprador", com o motivo, e nao se escolhem', async () => {
    const a = await abrir();
    const ordem = [...screen.getByTestId('dialogo-buscar-recebimento').querySelectorAll('tbody tr')].map(tr => tr.getAttribute('data-testid') ?? tr.getAttribute('data-lancamento'));
    expect(ordem).toEqual(['grupo-mesmo-favorecido', 'a1', 'a2', 'grupo-outro-favorecido', 'o1']);
    for (const id of ['a1', 'a2']) {
      const st = within(linha(id)).getByTestId('status-buscar');
      expect(st.textContent).toBe('já está nesta operação (1/1)');
      expect(st.getAttribute('title')).toBe('já está nesta operação (1/1)');
      expect((within(linha(id)).getByRole('radio') as HTMLInputElement).disabled).toBe(true);
    }
    fireEvent.click(linha('a1'));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(a.vincularRecebimento).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Escolha o recebimento.');
    fireEvent.click(linha('o1'));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    await waitFor(() => expect(a.vincularRecebimento).toHaveBeenCalledWith('o1', 'x'));
  });

  it('B2 a busca livre: "118" acha os dois; favorecido e valor casam; sem nada, a frase', async () => {
    await abrir();
    const busca = screen.getByTestId('busca-recebimento');
    fireEvent.change(busca, { target: { value: '118' } });
    expect(linha('a1')).toBeTruthy(); expect(linha('a2')).toBeTruthy(); expect(linha('o1')).toBeNull();
    expect(screen.queryByTestId('grupo-outro-favorecido')).toBeNull();
    fireEvent.change(busca, { target: { value: 'zzz' } });
    expect(document.body.textContent).toContain('Nada com essa busca.');
    expect(casaNaBusca(ITENS[2], 'outra pessoa')).toBe(true);
    expect(casaNaBusca(ITENS[2], '1.234,50')).toBe(true);
    expect(casaNaBusca(ITENS[1], '375.000')).toBe(true);
    expect(casaNaBusca(ITENS[2], '375')).toBe(false);
  });

  it('B3 nove colunas na ordem; datas inteiras e valor sem corte; modal fixo, a tabela rola', async () => {
    await abrir();
    const ths = [...screen.getByTestId('dialogo-buscar-recebimento').querySelectorAll('thead th')].map(th => th.textContent);
    expect(ths).toEqual(['', 'Competência', 'Vencimento', 'Pagamento', 'Descrição', 'Favorecido', 'Conta (classificação)',
      'Conta bancária', 'Status', 'Valor']);
    const tds = linha('o1').querySelectorAll('td');
    expect([...tds].slice(1, 4).map(td => td.textContent)).toEqual(['01/07/2026', '02/07/2026', '02/07/2026']);
    for (const td of [...[...tds].slice(1, 4), tds[9]]) {
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).not.toContain('truncate');
    }
    expect(tds[4].className).toContain('truncate');
    expect(tds[4].getAttribute('title')).toBe('Pix de terceiro');
    expect(screen.getByTestId('dialogo-buscar-recebimento').className).toMatch(/h-\[560px\]/);
    expect(screen.getByTestId('tabela-buscar-rola').className).toContain('overflow-auto');
  });
});
