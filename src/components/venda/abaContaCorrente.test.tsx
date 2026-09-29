/**
 * OC-VENDA-ENTREGAS-01b/01c — a aba Financeiro da venda em conta corrente (mock v7) e o cancelar com o rol. A regra mora no banco
 * (`oc_conta_corrente`, `oc_explicar_saldo`, `oc_cancelar_rol`); aqui se trava o que a TELA faz: o extrato pelo caixa da fazenda
 * (entrega negativa vermelha, recebimento positivo verde, saldo corrido pelo sinal), o status do dado (D6: "sem conta"), a barra
 * da diferenca, o dialogo "Explicar diferenca" (combinacao ate zerar, motivo obrigatorio, desfazer), o programar recebimento, o
 * cancelar listando tudo, e o resumo lateral lido da FONTE (o shell da venda nao se monta em teste).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AbaContaCorrenteOC } from './AbaContaCorrenteOC';
import { CancelarContaCorrenteDialog } from './CancelarContaCorrenteDialog';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi, RolCancelamento } from '@/hooks/useOcContaCorrente';

function cc(extra: Record<string, unknown> = {}): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 25, valor_acordado: 993496.13, entregue: 993496.13, cab_entregue: 317,
    recebido: 992138.24, programado: 0, devolvido: 0, saldo: -1357.89, explicado: 0, saldo_a_explicar: -1357.89,
    falta_explicar: -1357.89, situacao: 'falta_receber', a_entregar: 0, ultima_entrega: '2025-03-20',
    recebimentos_sem_conta_bancaria: 1, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'entrega', data: '2025-03-19', parte_id: 'e1', lote_ordem: 1, cab: 178, categoria: 'desmama_m', conta_ordem: 1120,
        conta: 'Venda de Desmama Machos', mov_entrega: -566879.55, status: 'sem_caixa', no_saldo: true, saldo: -566879.55 },
      { tipo: 'entrega', data: '2025-03-20', parte_id: 'e2', lote_ordem: 2, cab: 139, categoria: 'desmama_m', conta_ordem: 1120,
        conta: 'Venda de Desmama Machos', mov_entrega: -426616.58, status: 'sem_caixa', no_saldo: true, saldo: -993496.13 },
      { tipo: 'recebimento', data: '2025-04-17', parte_id: 'r1', conta_ordem: 1120, conta: 'Venda de Desmama Machos',
        mov_recebido: 992138.24, status: 'sem_conta_bancaria', no_saldo: true, saldo: -1357.89 },
    ],
    explicacoes: [],
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
    explicarSaldo: vi.fn(async () => null),
    desfazerExplicacao: vi.fn(async () => null),
    programarRecebimento: vi.fn(async () => null),
    lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
    listarLotes: vi.fn(async () => []),
    listarContas: vi.fn(async () => []),
    ...over,
  };
}

/* O Intl separa "R$" do numero com espaco NAO QUEBRAVEL; o teste compara texto normalizado. */
const txt = (el: Element) => (el.textContent ?? '').replace(/\u00a0/g, ' ');

const celulas = (tipo: string) => {
  const linhas = within(screen.getByTestId('conta-corrente-tabela')).getAllByRole('row').filter(r => r.getAttribute('data-tipo') === tipo);
  return linhas.map(r => Array.from(r.querySelectorAll('td')));
};

describe('aba conta corrente da OC — extrato pelo caixa da fazenda', () => {
  it('entrega NEGATIVA vermelha na coluna do DRE, recebimento POSITIVO verde no caixa, saldo corrido pelo sinal; D6 "sem conta"', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    const [e1] = celulas('entrega');
    expect(e1[0].textContent).toBe('19/03/25');
    /* a conta vai sem o numero (largura medida: com ele a linha nao cabe nos 766px da tabela); o numero fica no title */
    expect(e1[5].textContent).toBe('Venda de Desmama Machos');
    expect(e1[5].getAttribute('title')).toBe('1120 Venda de Desmama Machos');
    expect(txt(e1[7])).toBe('\u2212566.879,55');
    expect(e1[7].className).toContain('text-[#b91c1c]');
    expect(e1[8].textContent).toBe('');
    const [r1] = celulas('recebimento');
    expect(r1[7].textContent).toBe('');
    expect(r1[8].textContent).toContain('992.138,24');
    expect(r1[8].className).toContain('text-[#15803d]');
    expect(txt(r1[9])).toBe('\u22121.357,89');
    expect(r1[9].className).toContain('text-[#b91c1c]');
    expect(r1[6].textContent).toBe('sem conta');
    expect(r1[4].textContent).toBe('Recebimento 1 de 1');
    expect(screen.getByTestId('conta-corrente-tabela').textContent).not.toContain('conciliado');
  });

  it('SINAL DO SALDO: card e Total seguem o sinal — falta receber vermelho, adiantado verde, quitado sem cor', () => {
    const { rerender } = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByTestId('card-saldo').textContent).toContain('Saldo · falta receber');
    expect(screen.getByTestId('total-saldo').className).toContain('text-[#b91c1c]');
    rerender(<AbaContaCorrenteOC api={api(cc({ saldo: 2.75, situacao: 'adiantado' }))} somenteLeitura={false} />);
    expect(screen.getByTestId('card-saldo').textContent).toContain('Saldo · adiantado pelo comprador');
    expect(screen.getByTestId('total-saldo').className).toContain('text-[#15803d]');
    rerender(<AbaContaCorrenteOC api={api(cc({ saldo: 0, situacao: 'quitado', falta_explicar: 0 }))} somenteLeitura={false} />);
    expect(screen.getByTestId('card-saldo').textContent).toContain('Saldo · quitado');
    expect(screen.getByTestId('total-saldo').className).not.toMatch(/b91c1c|15803d/);
  });

  it("barra da diferenca so' com as entregas concluidas; com gado a entregar nao ha barra", () => {
    const { rerender } = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByTestId('barra-diferenca').textContent).toContain('Recebeu R$ 1.357,89 a menos do que entregou.');
    rerender(<AbaContaCorrenteOC api={api(cc({ a_entregar: 1374463.02 }))} somenteLeitura={false} />);
    expect(screen.queryByTestId('barra-diferenca')).toBeNull();
  });

  it('COMBINACAO ATE ZERAR: dois descontos (1.000 digitado + o que falta sugerido) zeram; sem motivo nao grava e fica vermelho', async () => {
    const a = api(cc());
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Explicar diferença' }));
    const dlg = await screen.findByTestId('dialogo-explicar');
    expect(txt(within(dlg).getByTestId('card-falta-explicar'))).toContain('-R$ 1.357,89');
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Desconto comercial' }));
    const valores = () => within(dlg).getAllByLabelText('Valor');
    expect(valores()[0]).toHaveProperty('value', '1.357,89');
    fireEvent.change(valores()[0], { target: { value: '1.000,00' } });
    expect(txt(within(dlg).getByTestId('card-falta-explicar'))).toContain('-R$ 357,89');
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Desconto comercial' }));
    expect(valores()[1]).toHaveProperty('value', '357,89');
    expect(within(dlg).getByTestId('card-falta-explicar').textContent).toContain('0,00');
    expect(within(dlg).getByTestId('card-falta-explicar').textContent).not.toContain('-');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar explicação' }));
    expect(a.explicarSaldo).not.toHaveBeenCalled();
    expect(within(dlg).getByText(/Complete cada linha: motivo, motivo/)).toBeTruthy();
    within(dlg).getAllByLabelText('Motivo *').forEach(m => {
      expect(m.className).toContain('border-destructive');
      fireEvent.change(m, { target: { value: 'desconto do contrato' } });
    });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar explicação' }));
    await waitFor(() => expect(a.explicarSaldo).toHaveBeenCalledTimes(1));
    const [itens] = vi.mocked(a.explicarSaldo).mock.calls[0];
    expect(itens.map(i => [i.tipo, i.valor, i.motivo])).toEqual([
      ['desconto_comercial', 1000, 'desconto do contrato'], ['desconto_comercial', 357.89, 'desconto do contrato'],
    ]);
  });

  it('a recusa do banco aparece ao lado do botao do dialogo, e o rascunho fica', async () => {
    const a = api(cc(), { explicarSaldo: vi.fn(async () => 'Conflito de versao (esperada 24, atual 25)') });
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Explicar diferença' }));
    const dlg = await screen.findByTestId('dialogo-explicar');
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Desconto comercial' }));
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'x' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar explicação' }));
    await waitFor(() => expect(within(dlg).getByRole('alert').textContent).toContain('Conflito de versao'));
    expect(within(dlg).getAllByLabelText('Valor')).toHaveLength(1);
  });

  it('DESFAZER: explicacao salva sai pelo "remover", com motivo obrigatorio', async () => {
    const a = api(cc({ saldo: 0, explicado: 1357.89, falta_explicar: 0, situacao: 'quitado',
      explicacoes: [{ parte_id: 'p9', tipo: 'permuta_despesa', conta_ordem: 8045, conta: 'Frete', motivo: 'frete do comprador',
        valor: 1357.89, status: 'sem_caixa' }] }));
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    expect(screen.queryByTestId('barra-diferenca')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver explicação' }));
    const dlg = await screen.findByTestId('dialogo-explicar');
    expect(within(dlg).getByText('8045 Frete')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'remover' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remover explicação' }));
    expect(a.desfazerExplicacao).not.toHaveBeenCalled();
    expect(within(dlg).getByText('Informe o motivo.')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'lancado errado' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remover explicação' }));
    await waitFor(() => expect(a.desfazerExplicacao).toHaveBeenCalledWith('p9', 'lancado errado'));
  });

  it('PROGRAMAR RECEBIMENTO: nasce com o que falta receber; sem vencimento nao grava; com ele, grava valor e data', async () => {
    const a = api(cc());
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Programar recebimento futuro' }));
    const valor = await screen.findByLabelText('Valor *');
    expect(valor).toHaveProperty('value', '1.357,89');
    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));
    expect(screen.getByText('Informe o vencimento.')).toBeTruthy();
    expect(a.programarRecebimento).not.toHaveBeenCalled();
    const data = screen.getByPlaceholderText('dd/mm/aaaa');
    fireEvent.change(data, { target: { value: '25/10/2025' } });
    fireEvent.keyDown(data, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Programar' }));
    await waitFor(() => expect(a.programarRecebimento).toHaveBeenCalledWith(1357.89, '2025-10-25'));
  });

  it('saida sem entrega pede "Atualizar entregas", e a recusa do banco aparece ao lado, sem toast', async () => {
    const a = api(cc({ saidas_sem_entrega: 2 }), { sincronizarEntregas: vi.fn(async () => 'Conflito de versao (esperada 22, atual 23)') });
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    expect(screen.getByText('2 saídas ainda não viraram entrega no financeiro.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar entregas' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Conflito de versao'));
  });

  it('buscar recebimento: sem motivo nao grava e o campo fica vermelho; com motivo grava o escolhido', async () => {
    const a = api(cc());
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Buscar recebimento no Financeiro' }));
    await waitFor(() => expect(screen.getByText('Helder Hofig')).toBeTruthy());
    fireEvent.click(screen.getByText('Helder Hofig'));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(screen.getByText('Informe o motivo.')).toBeTruthy();
    expect(a.vincularRecebimento).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'recebimento do contrato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    await waitFor(() => expect(a.vincularRecebimento).toHaveBeenCalledWith('x1', 'recebimento do contrato'));
  });

  it('somente leitura (OC cancelada) desliga todas as escritas', () => {
    render(<AbaContaCorrenteOC api={api(cc({ saidas_sem_entrega: 1 }))} somenteLeitura />);
    for (const nome of ['Atualizar entregas', '+ Buscar recebimento no Financeiro', '+ Programar recebimento futuro', 'Explicar diferença']) {
      expect(screen.getByRole('button', { name: nome })).toHaveProperty('disabled', true);
    }
  });
});

const ROL: RolCancelamento = {
  entregas: [{ data: '2025-03-19', loteOrdem: 1, valor: 566879.55 }],
  explicacoes: [{ tipo: 'permuta_despesa', valor: 357.89, conta: 'Frete' }],
  recebimentos: [{ data: '2025-04-17', valor: 992138.24, contaAtual: 'Venda de Desmama Machos', contaOriginal: 'Venda de Desmama Machos', acao: 'volta_para_conta_original' }],
  saidas: [{ data: '2025-03-19', cab: 178, categoria: 'desmama_m', origem: 'adotada' }],
  compromissos: [],
  despesas: [],
  bloqueios: [],
};

describe('cancelar a venda em conta corrente', () => {
  it('lista tudo antes de confirmar; sem motivo nao cancela; a recusa aparece ao lado; o sucesso recarrega e fecha', async () => {
    const a = api(cc(), { lerRolCancelamento: vi.fn(async () => ({ rol: ROL, erro: null })) });
    const onCancelar = vi.fn(async () => 'Conflito de versao');
    const onFechar = vi.fn();
    const { rerender } = render(<CancelarContaCorrenteDialog api={a} onCancelar={onCancelar} onFechar={onFechar} />);
    const dlg = await screen.findByTestId('dialogo-cancelar-cc');
    await waitFor(() => expect(dlg.textContent).toContain('Recebimentos que saem da OC (voltam a compor o DRE como venda) (1)'));
    /* OC-CC-CLASSIFICACAO-01: o recebimento ja' esta' na conta da venda — sem seta, e o rodape diz que ele volta ao DRE */
    expect((dlg.textContent ?? '').replace(/\u00a0/g, ' ')).toContain('R$ 992.138,24 · Venda de Desmama Machos');
    expect(dlg.textContent).not.toContain('→');
    expect(dlg.textContent).toContain('volta a ser uma venda comum no DRE');
    expect(dlg.textContent).toContain('Entregas canceladas (saem do DRE) (1)');
    expect(dlg.textContent).toContain('Permuta / outra despesa · Frete');
    expect(dlg.textContent).toContain('178 cab · Desmama M');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar operação' }));
    expect(onCancelar).not.toHaveBeenCalled();
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'venda desfeita' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar operação' }));
    await waitFor(() => expect(within(dlg).getByRole('alert').textContent).toContain('Conflito de versao'));
    expect(onFechar).not.toHaveBeenCalled();
    const ok = vi.fn(async () => null);
    rerender(<CancelarContaCorrenteDialog api={a} onCancelar={ok} onFechar={onFechar} />);
    fireEvent.click(within(screen.getByTestId('dialogo-cancelar-cc')).getByRole('button', { name: 'Cancelar operação' }));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(ok).toHaveBeenCalledWith('venda desfeita');
    expect(a.recarregar).toHaveBeenCalled();
  });

  it('bloqueio do banco trava o botao e diz por que', async () => {
    const a = api(cc(), { lerRolCancelamento: vi.fn(async () => ({ rol: { ...ROL, bloqueios: ['Recebimento conciliado com liquidação ativa.'] }, erro: null })) });
    render(<CancelarContaCorrenteDialog api={a} onCancelar={vi.fn(async () => null)} onFechar={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('liquidação ativa'));
    expect(screen.getByRole('button', { name: 'Cancelar operação' })).toHaveProperty('disabled', true);
  });
});

describe('resumo lateral da venda em conta corrente (lido da FONTE)', () => {
  const fonte = readFileSync('src/components/venda/VendaModalShell.tsx', 'utf8');
  it('uma instancia so: o shell monta useOcContaCorrente e a desce para a aba; o resumo le Entregue/Recebido/Saldo pelo sinal', () => {
    expect(fonte.match(/useOcContaCorrente\(/g)).toHaveLength(1);
    expect(fonte).toContain('ccApiExterno={ccApi}');
    expect(fonte).toContain('data-testid="resumo-conta-corrente"');
    expect(fonte).toMatch(/corDoSaldo\(cc\.saldo\) === 'neg' \? 'Saldo · falta receber'/);
    expect(fonte).toContain('<CancelarContaCorrenteDialog');
  });
});

/* OC-CRIAR-DO-LEGADO-01b — a comissao do modal antigo ligada a' OC de venda aparece nas despesas, fora do saldo, com o MESMO
   componente da compra. OC-VENDA-FINANCEIRO-COMPLETO-01a: as despesas passaram a ser a lista viva (slot `despesas`, montada pelo
   roteador com a lista de compromissos no modo so' despesas — despesasContaCorrente.test.tsx); o extrato nao as desenha mais. */
describe('venda: despesas da operacao', () => {
  it('a comissao fica fora do saldo e fora do extrato; os cards mostram o total que vem de fora', () => {
    const comComissao = cc({ despesas: [{ parte_id: 'pc1', lancamento_id: '9bcf8f46', componente: 'comissao', competencia: '2026-05-04',
      pagamento: '2026-05-14', vencimento: '2026-05-14', descricao: 'Venda 025 DM - Comissão', favorecido: 'Elo MS Leilões Rurais Eireli',
      conta_ordem: 5030, conta: 'Impostos e Despesas de Abates e Vendas', valor: -2625, status: 'realizado' }] });
    render(<AbaContaCorrenteOC api={api(comComissao)} somenteLeitura={false} totaisDespesas={{ lancadas: 2625, pagas: 2625 }}
      despesas={<div data-testid="slot-despesas" />} />);
    expect(screen.getByTestId('slot-despesas')).toBeInTheDocument();
    expect(screen.getByTestId('conta-corrente-tabela').textContent).not.toContain('Venda 025 DM - Comissão');
    expect((screen.getByTestId('card-despesas-pagas').textContent ?? '')).toBe('Despesas pagas2.625,00');
    expect(screen.getByTestId('card-despesas-pagas').lastElementChild?.className).toContain('text-[#b91c1c]');
    /* o saldo e' o do banco, que nao conta a despesa: o mesmo -1.357,89 da fixture sem comissao */
    expect(comComissao.saldo).toBe(cc().saldo);
  });

  it('sem despesa, sem quadro (a busca sabe achar: a tabela do extrato esta la)', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByTestId('conta-corrente-tabela')).toBeInTheDocument();
    expect(screen.queryByTestId('despesas-operacao')).toBeNull();
  });
});
