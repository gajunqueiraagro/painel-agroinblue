/**
 * OC-VENDA-ENTREGAS-01b/01c — a aba Financeiro da venda em conta corrente (mock v7) e o cancelar com o rol. A regra mora no banco
 * (`oc_conta_corrente`, `oc_explicar_saldo`, `oc_cancelar_rol`); aqui se trava o que a TELA faz: o extrato pelo caixa da fazenda
 * (entrega negativa vermelha, recebimento positivo verde, saldo corrido pelo sinal), o status do dado (D6: "sem conta"), a barra
 * da diferenca, o dialogo "Explicar diferenca" (combinacao ate zerar, motivo obrigatorio, desfazer), o programar recebimento, o
 * cancelar listando tudo, e o resumo lateral lido da FONTE (o shell da venda nao se monta em teste).
 */
import { describe, it, expect, vi } from 'vitest';
import { createPortal } from 'react-dom';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { AbaContaCorrenteOC, DialogoProgramarRecebimento, acoesDaLinha, itemDoRascunho, motivoSomenteLeitura, type Rascunho } from './AbaContaCorrenteOC';
import { CancelarContaCorrenteDialog } from './CancelarContaCorrenteDialog';
import { lerContaCorrente, type ContaCorrente, type LinhaContaCorrente } from '@/lib/oc/contaCorrente';
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
    simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })),
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
    expect(r1[6].textContent).toBe('s/ conta'); // fix2: texto gerado curto e numa linha
    expect(r1[4].textContent).toBe('Receb. 1/1');
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
    /* OC-CC-ACOES-LINHA-02 — o botao do topo saiu (uso medido: zero); o dialogo fica e volta pelo "Parcelar" da linha. Aqui ele e'
       montado direto, com o sugerido que a aba calculava (o que falta receber). */
    const a = api(cc());
    render(<DialogoProgramarRecebimento api={a} lado="venda" sugerido={1357.89} onFechar={() => {}} />);
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
    for (const nome of ['Atualizar entregas', '+ Buscar recebimento no Financeiro', 'Explicar diferença']) {
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
    const { rerender } = render(<AbaContaCorrenteOC api={api(comComissao)} somenteLeitura={false} totaisDespesas={{ lancadas: 2625, pagas: 2625 }}
      despesas={<div data-testid="slot-despesas" />} subAba="conta" />);
    expect(screen.getByTestId('conta-corrente-tabela').textContent).not.toContain('Venda 025 DM - Comissão');
    expect(screen.queryByTestId('slot-despesas')).toBeNull();
    rerender(<AbaContaCorrenteOC api={api(comComissao)} somenteLeitura={false} totaisDespesas={{ lancadas: 2625, pagas: 2625 }}
      despesas={<div data-testid="slot-despesas" />} subAba="despesas" />);
    expect(screen.getByTestId('slot-despesas')).toBeInTheDocument();
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

/* ─── OC-CC-VOLTA-01b — ajuste de preco em todos os lotes, dois sentidos, previa e volta ─────────────────────────────────────── */
/* A NJ af334f9c: 3 lotes de novilhas somando 1.015.000,00, recebido 2.550.000,00 (o comprador adiantou 1.535.000,00). */
function ccAf(extra: Record<string, unknown> = {}): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 14, valor_acordado: 1015000, entregue: 1015000, cab_entregue: 507,
    recebido: 2550000, programado: 0, devolvido: 0, saldo: 1535000, explicado: 0, saldo_a_explicar: 1535000,
    falta_explicar: 1535000, situacao: 'adiantado', a_entregar: 0, ultima_entrega: '2021-06-02',
    recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'recebimento', data: '2021-03-08', parte_id: 'r1', mov_recebido: 500000, status: 'realizado', no_saldo: true, saldo: 500000 },
      { tipo: 'entrega', data: '2021-04-06', parte_id: 'e1', lote_ordem: 1, cab: 307, categoria: 'novilhas', mov_entrega: -610990.2,
        status: 'sem_caixa', no_saldo: true, saldo: -110990.2 },
      { tipo: 'entrega', data: '2021-04-21', parte_id: 'e2', lote_ordem: 2, cab: 131, categoria: 'novilhas', mov_entrega: -260715.69,
        status: 'sem_caixa', no_saldo: true, saldo: -371705.89 },
      { tipo: 'entrega', data: '2021-06-02', parte_id: 'e3', lote_ordem: 3, cab: 69, categoria: 'novilhas', mov_entrega: -143294.11,
        status: 'sem_caixa', no_saldo: true, saldo: -515000 },
      { tipo: 'recebimento', data: '2021-06-15', parte_id: 'r2', mov_recebido: 2050000, status: 'realizado', no_saldo: true, saldo: 1535000 },
    ],
    explicacoes: [],
    ...extra,
  });
  if (!r) throw new Error('fixture');
  return r;
}
const LOTES_AF = [
  { id: 'l1', ordem: 1, categoria: 'novilhas', cab: 307, total: 610990.2 },
  { id: 'l2', ordem: 2, categoria: 'novilhas', cab: 131, total: 260715.69 },
  { id: 'l3', ordem: 3, categoria: 'novilhas', cab: 69, total: 143294.11 },
];
const loteP = (id: string, ordem: number, kg: number, total: number) => ({ lote_id: id, ordem, categoria: 'novilhas', kg, total });
const PREVIA_AF = {
  criterio: 'todos_por_kg', total_antes: 1015000, total_novo: 2550000,
  lotes_antes: [loteP('l1', 1, 132010, 610990.2), loteP('l2', 2, 56330, 260715.69), loteP('l3', 3, 29670, 143294.11)],
  lotes_depois: [loteP('l1', 1, 132010, 1544082.84), loteP('l2', 2, 56330, 658875.74), loteP('l3', 3, 29670, 347041.42)],
  entregas_antes: [], entregas_depois: [
    { parte_id: 'e1', lote_id: 'l1', data: '2021-04-06', kg: 132010, valor: 1544082.84 },
    { parte_id: 'e2', lote_id: 'l2', data: '2021-04-21', kg: 56330, valor: 658875.74 },
    { parte_id: 'e3', lote_id: 'l3', data: '2021-06-02', kg: 29670, valor: 347041.42 },
  ],
};

async function abrirExplicar(a: OcContaCorrenteApi, botao = 'Explicar diferença') {
  render(<AbaContaCorrenteOC api={a} somenteLeitura={false} />);
  fireEvent.click(screen.getByRole('button', { name: botao }));
  const dlg = await screen.findByTestId('dialogo-explicar');
  await waitFor(() => expect(a.listarLotes).toHaveBeenCalled());
  await act(async () => {});
  return dlg;
}

describe('explicar diferenca — ajuste de preco em todos os lotes (OC-CC-VOLTA-01b)', () => {
  it('af334f9c: nasce em "Todos os lotes (rateio por kg)", SOBE e com o que falta; a previa e a RPC em simulacao; salva o que previu', async () => {
    const simularExplicacao = vi.fn<OcContaCorrenteApi['simularExplicacao']>(async () => ({ previa: PREVIA_AF, erro: null }));
    const a = api(ccAf(), { listarLotes: vi.fn(async () => LOTES_AF), simularExplicacao });
    const dlg = await abrirExplicar(a);
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Ajuste de preço' }));
    expect(within(dlg).getByLabelText('Lote do ajuste').textContent).toBe('Todos os lotes (rateio por kg)');
    expect(within(dlg).getByLabelText('Sentido do ajuste').textContent).toBe('Sobe o preço');
    expect(within(dlg).getByLabelText('Valor')).toHaveProperty('value', '1.535.000,00');
    expect(within(dlg).getByTestId('card-falta-explicar').textContent).toContain('0,00');
    expect(within(dlg).getByTestId('card-falta-explicar').textContent).not.toContain('-');
    /* a previa: a propria RPC, com o sinal de SUBIR (negativo) e o lote NULO (todos) */
    await waitFor(() => expect(simularExplicacao).toHaveBeenCalled());
    expect(vi.mocked(simularExplicacao).mock.calls[0][0]).toMatchObject({ tipo: 'ajuste_preco', valor: -1535000, loteId: null });
    const previa = await within(dlg).findByTestId('previa-ajuste');
    expect(txt(within(previa).getByTestId('previa-rotulo'))).toBe('Sobe o preço dos lotes em R$ 1.535.000,00');
    const linhas = within(previa).getAllByRole('row').filter(r => r.getAttribute('data-previa'));
    expect(linhas.map(r => r.getAttribute('data-previa'))).toEqual(['lote', 'lote', 'lote', 'total']);
    expect(Array.from(linhas[0].querySelectorAll('td')).map(td => txt(td))).toEqual(
      ['1 · Novilhas', '06/04/21', '132.010', '610.990,20', '1.544.082,84', '11,70']);
    expect(Array.from(linhas[3].querySelectorAll('td')).map(td => txt(td))).toEqual(
      ['Total', '', '218.010', '1.015.000,00', '2.550.000,00', '11,70']);
    /* salvar manda o mesmo item que a previa simulou */
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'juros entram no preço' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar explicação' }));
    await waitFor(() => expect(a.explicarSaldo).toHaveBeenCalledTimes(1));
    const [itens] = vi.mocked(a.explicarSaldo).mock.calls[0];
    expect(itens).toEqual([{ tipo: 'ajuste_preco', valor: -1535000, loteId: null, planoContaId: null, motivo: 'juros entram no preço', vencimento: null }]);
  });

  it('o outro sentido: recebeu a menos -> BAIXA, positivo na RPC; com um lote so, ele ja vem escolhido', async () => {
    const simularExplicacao = vi.fn<OcContaCorrenteApi['simularExplicacao']>(async () => ({ previa: null, erro: null }));
    const a = api(cc(), { listarLotes: vi.fn(async () => [LOTES_AF[0]]), simularExplicacao });
    const dlg = await abrirExplicar(a);
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Ajuste de preço' }));
    expect(within(dlg).getByLabelText('Sentido do ajuste').textContent).toBe('Baixa o preço');
    expect(within(dlg).getByLabelText('Lote do ajuste').textContent).toBe('1 · Novilhas');
    await waitFor(() => expect(simularExplicacao).toHaveBeenCalled());
    expect(vi.mocked(simularExplicacao).mock.calls[0][0]).toMatchObject({ tipo: 'ajuste_preco', valor: 1357.89, loteId: 'l1' });
    expect(txt(await within(dlg).findByTestId('previa-rotulo'))).toBe('Baixa o preço do lote em R$ 1.357,89');
  });

  it('a recusa da simulacao aparece na previa, e nao grava nada', async () => {
    const simularExplicacao = vi.fn<OcContaCorrenteApi['simularExplicacao']>(async () => ({ previa: null, erro: 'Lote 2 sem entrega no financeiro' }));
    const a = api(ccAf(), { listarLotes: vi.fn(async () => LOTES_AF), simularExplicacao });
    const dlg = await abrirExplicar(a);
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Ajuste de preço' }));
    const previa = await within(dlg).findByTestId('previa-ajuste');
    await waitFor(() => expect(within(previa).getByRole('alert').textContent).toBe('Lote 2 sem entrega no financeiro'));
    expect(a.explicarSaldo).not.toHaveBeenCalled();
  });

  it('VOLTA: o ajuste de todos aparece como "todos"; remover chama o desfazer, e a recusa do banco (lote mudado) fica ao lado', async () => {
    const recusa = 'Não dá para desfazer este ajuste de preço: lote 2 (valor 658.875,74 → 700.000,00) mudou depois dele.';
    const a = api(ccAf({ saldo: 0, explicado: -1535000, falta_explicar: 0, situacao: 'quitado',
      explicacoes: [{ parte_id: 'aj1', tipo: 'ajuste_preco', lote_ordem: null, conta_ordem: 1070, conta: 'Venda de Novilhas',
        motivo: 'juros entram no preço', valor: -1535000, status: 'ajuste' }] }),
      { desfazerExplicacao: vi.fn(async () => recusa) });
    const dlg = await abrirExplicar(a, 'Ver explicação');
    const linha = within(dlg).getAllByRole('row').find(r => r.getAttribute('data-explicacao') === 'ajuste_preco');
    expect(linha?.querySelectorAll('td')[1].textContent).toBe('todos');
    fireEvent.click(within(dlg).getByRole('button', { name: 'remover' }));
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'preço combinado mudou' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remover explicação' }));
    await waitFor(() => expect(a.desfazerExplicacao).toHaveBeenCalledWith('aj1', 'preço combinado mudou'));
    await waitFor(() => expect(within(dlg).getByRole('alert').textContent).toBe(recusa));
  });

  it('outra receita e permuta: na DATA DO FATO, que nasce com a do ultimo recebimento; o rodape diz a regra nova', async () => {
    const a = api(ccAf(), { listarLotes: vi.fn(async () => LOTES_AF) });
    const dlg = await abrirExplicar(a);
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Outra receita' }));
    const linha = within(dlg).getAllByRole('row').find(r => r.getAttribute('data-rascunho') === 'outra_receita');
    expect((linha?.querySelector('input[value="15/06/2021"]'))).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: '+ Desconto comercial' }));
    const desc = within(dlg).getAllByRole('row').find(r => r.getAttribute('data-rascunho') === 'desconto_comercial');
    expect(desc?.textContent).toContain('por entrega');
    expect(dlg.textContent).not.toContain('última entrega');
    expect(dlg.textContent).toContain('na data da saída dela');
  });
});

describe('a linha do rascunho como a RPC a recebe (salvar e previa mandam a mesma)', () => {
  const base: Rascunho = { chave: 1, tipo: 'ajuste_preco', valor: '1.535.000,00', loteId: '__todos__', contaId: '', motivo: 'm',
    vencimento: '', sentido: 'sobe', data: '' };
  it('ajuste: "todos" vai como lote NULO; sobe negativo, baixa positivo; um lote vai com o id', () => {
    expect(itemDoRascunho(base)).toMatchObject({ valor: -1535000, loteId: null, vencimento: null });
    expect(itemDoRascunho({ ...base, sentido: 'baixa', loteId: 'l2' })).toMatchObject({ valor: 1535000, loteId: 'l2' });
  });
  it('outra receita e permuta levam a DATA DO FATO; devolucao, o vencimento; desconto, nenhuma (e por entrega)', () => {
    expect(itemDoRascunho({ ...base, tipo: 'outra_receita', valor: '100,00', data: '2021-06-15', contaId: 'c1' }))
      .toMatchObject({ valor: 100, loteId: null, planoContaId: 'c1', vencimento: '2021-06-15' });
    expect(itemDoRascunho({ ...base, tipo: 'permuta_despesa', valor: '50,00', data: '2021-06-10' })).toMatchObject({ vencimento: '2021-06-10' });
    expect(itemDoRascunho({ ...base, tipo: 'devolucao_comprador', valor: '50,00', vencimento: '2021-07-01', data: '2021-06-10' }))
      .toMatchObject({ vencimento: '2021-07-01' });
    expect(itemDoRascunho({ ...base, tipo: 'desconto_comercial', valor: '1.000,00', data: '2021-06-10' })).toMatchObject({ valor: 1000, vencimento: null });
  });
});

/* ─── OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — sub-abas: uma tabela por vez, com a altura toda ────────────────────────────────── */
describe('sub-abas do Financeiro em conta corrente', () => {
  /* O slot de verdade (AbaCompromissosOC) poe os DOIS botoes das despesas no host da faixa por portal; aqui, o mesmo gesto. */
  const slot = ({ host }: { host: HTMLElement | null; topo: number }) => (
    <div data-testid="slot-despesas">
      lista viva
      {host && createPortal(<><button type="button">+ Buscar despesa no Financeiro</button><button type="button">+ Nova despesa</button></>, host)}
    </div>
  );

  it('abre no extrato do comprador; o contador diz quantas despesas ha sem clicar; os botoes sao os do recebimento', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} despesas={slot} qtdDespesas={8} />);
    const faixa = screen.getByTestId('faixa-subabas');
    expect(within(faixa).getByRole('button', { name: /Conta corrente do comprador/ }).className).toContain('bg-primary');
    expect(within(faixa).getByTestId('contador-despesas').textContent).toBe('8');
    expect(screen.getByTestId('conta-corrente-tabela')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-despesas')).toBeNull();
    expect(within(faixa).getByRole('button', { name: '+ Buscar recebimento no Financeiro' })).toBeTruthy();
    expect(within(faixa).queryByRole('button', { name: '+ Nova despesa' })).toBeNull();
    /* a faixa amarela da diferenca fica na sub-aba do comprador, embaixo do extrato */
    expect(screen.getByTestId('barra-diferenca')).toBeInTheDocument();
  });

  it('nas despesas: so a lista (o extrato sai), os botoes trocam para os da despesa, na MESMA faixa', () => {
    const onSubAba = vi.fn();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} despesas={slot} qtdDespesas={8} onSubAba={onSubAba} />);
    fireEvent.click(within(screen.getByTestId('faixa-subabas')).getByRole('button', { name: /Despesas da operação/ }));
    expect(onSubAba).toHaveBeenCalledWith('despesas');
    expect(screen.getByTestId('slot-despesas')).toBeInTheDocument();
    expect(screen.queryByTestId('conta-corrente-tabela')).toBeNull();
    expect(screen.queryByTestId('barra-diferenca')).toBeNull();
    const faixa = screen.getByTestId('faixa-subabas');
    expect(within(faixa).getByRole('button', { name: '+ Nova despesa' })).toBeTruthy();
    expect(within(faixa).getByRole('button', { name: '+ Buscar despesa no Financeiro' })).toBeTruthy();
    expect(within(faixa).queryByRole('button', { name: '+ Buscar recebimento no Financeiro' })).toBeNull();
    /* os cards ficam em cima nas duas */
    expect(screen.getByTestId('cards-conta-corrente')).toBeInTheDocument();
  });

  it('a SUB-ABA VEM DE FORA (a URL, para sobreviver ao lancamento): montada em "despesas", reabre nas despesas', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} despesas={slot} qtdDespesas={8} subAba="despesas" onSubAba={vi.fn()} />);
    expect(screen.getByTestId('slot-despesas')).toBeInTheDocument();
    expect(within(screen.getByTestId('faixa-subabas')).getByRole('button', { name: /Despesas da operação/ }).className).toContain('bg-primary');
  });

  it('despesas ainda nao lidas: sem contador (nunca um zero inventado); na compra, o fornecedor', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} despesas={slot} qtdDespesas={null} lado="compra" />);
    const faixa = screen.getByTestId('faixa-subabas');
    expect(within(faixa).queryByTestId('contador-despesas')).toBeNull();
    expect(within(faixa).getByRole('button', { name: /Conta corrente do fornecedor/ })).toBeTruthy();
  });

  it('UI-LINHA-UNICA-01: uma linha por registro — Conta e Banco longos CORTAM com o texto inteiro no title; data, cab, valor e saldo nunca', () => {
    const BANCO = 'Sicredi Cooperativa de Crédito Centro Sul do Mato Grosso do Sul';
    const c = cc();
    const linhas = c.linhas.map(l => l.tipo === 'recebimento' ? { ...l, banco: BANCO, conta: 'Impostos e Despesas de Abates e Vendas', contaOrdem: 5030 } : l);
    render(<AbaContaCorrenteOC api={api({ ...c, linhas })} somenteLeitura={false} />);
    const [r1] = celulas('recebimento');
    const corta = (td: Element) => td.className.includes('text-ellipsis') && td.className.includes('overflow-hidden');
    /* Data · Lote · Cab · Tipo · Descricao · Conta · Banco · Entrega · Recebido · Saldo · ⋯ */
    expect(r1.map(corta)).toEqual([false, false, false, false, false, true, true, false, false, false, false]);
    /* as dez celulas de DADO; a 11a e' o "⋯" (so' um botao, sem texto e sem padding horizontal) */
    expect(r1).toHaveLength(11);
    expect(r1[10].className).not.toMatch(/\bpx-/);
    for (const td of r1.slice(0, 10)) {
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).not.toContain('break-words');
    }
    expect(r1[5].getAttribute('title')).toContain('Impostos e Despesas de Abates e Vendas');     // o nome INTEIRO da conta (com o numero)
    expect(r1[6].getAttribute('title')).toBe(BANCO);
    expect(txt(r1[6])).toBe(BANCO);
    /* nas entregas nao ha banco: a celula e' a comum, sem title */
    const [e1] = celulas('entrega');
    expect(corta(e1[6])).toBe(false);
    expect(e1[6].getAttribute('title')).toBeNull();
  });

  it('nenhuma tabela rola por dentro: o extrato nao tem overflow proprio; o cabecalho gruda abaixo do bloco fixo', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} despesas={slot} qtdDespesas={8} />);
    expect(screen.getByTestId('conta-corrente-rolagem').className).not.toMatch(/overflow/);
    expect(screen.getByTestId('topo-fixo').className).toContain('sticky');
    const th = screen.getByTestId('conta-corrente-tabela').querySelector('thead tr:nth-child(2) th');
    expect(th?.getAttribute('style')).toMatch(/top: \d+px/);
  });

  it('rotulos GERADOS curtos e numa linha: "Receb. 1/1", "s/ conta", a categoria na entrega — sem a classe que quebra', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    const [e1] = celulas('entrega');
    const [r1] = celulas('recebimento');
    expect(e1[4].textContent).toBe('Desmama M');
    expect(r1[4].textContent).toBe('Receb. 1/1');
    for (const td of [e1[4], r1[4], r1[6]]) {
      expect(td.className).toContain('whitespace-nowrap');
      expect(td.className).not.toContain('break-words');
    }
  });
});

/* ═══ OC-CC-ACOES-LINHA-02 — toda linha do extrato e' clicavel e tem "⋯"; item que nao vale fica apagado com o motivo ═══ */
describe('OC-CC-ACOES-LINHA-02 — clique e menu "⋯" em toda linha do extrato', () => {
  const linha = (o: Partial<LinhaContaCorrente>): LinhaContaCorrente => ({
    tipo: 'recebimento', subtipo: null, data: '2025-04-17', parteId: 'r1', lancamentoId: 'L1', loteOrdem: null, categoria: null, cab: null,
    descricao: null, contaOrdem: 1120, conta: 'Venda de Desmama Machos', banco: 'Bradesco', movEntrega: null, movRecebido: 100,
    status: 'realizado', noSaldo: true, saldo: 0, motivo: null, ...o,
  });
  const par = (l: LinhaContaCorrente, lado: 'venda' | 'compra' = 'venda', fechada = false) =>
    acoesDaLinha(l, lado, fechada).map(a => [a.texto, a.motivo]);

  it('RECEBIMENTO: os quatro itens na ordem; motivo por status (realizado, conciliado, programado) e sem lancamento', () => {
    expect(par(linha({ status: 'realizado' }))).toEqual([
      ['Abrir lançamento', null],
      ['Parcelar este recebimento', 'já recebido · só se parcela o que está programado'],
      ['Desvincular da operação', 'disponível em breve'],
      ['Cancelar recebimento programado', 'só para recebimento programado'],
    ]);
    expect(par(linha({ status: 'conciliado' }))).toEqual([
      ['Abrir lançamento', null],
      ['Parcelar este recebimento', 'já recebido · só se parcela o que está programado'],
      ['Desvincular da operação', 'conciliado · desfaça a conciliação primeiro'],
      ['Cancelar recebimento programado', 'só para recebimento programado'],
    ]);
    expect(par(linha({ status: 'programado', noSaldo: false }))).toEqual([
      ['Abrir lançamento', null],
      ['Parcelar este recebimento', 'disponível em breve'],
      ['Desvincular da operação', 'disponível em breve'],
      ['Cancelar recebimento programado', 'disponível em breve'],
    ]);
    expect(par(linha({ lancamentoId: null }))[0]).toEqual(['Abrir lançamento', 'esta linha não tem lançamento']);
    /* so' o cancelar e' vermelho */
    expect(acoesDaLinha(linha({}), 'venda', false).map(a => !!a.perigo)).toEqual([false, false, false, true]);
  });

  it('RECEBIMENTO na compra: os textos espelhados (pagamento)', () => {
    expect(par(linha({ status: 'realizado' }), 'compra')).toEqual([
      ['Abrir lançamento', null],
      ['Parcelar este pagamento', 'já pago · só se parcela o que está programado'],
      ['Desvincular da operação', 'disponível em breve'],
      ['Cancelar pagamento programado', 'só para pagamento programado'],
    ]);
  });

  it('ENTREGA: ir para a entrega vale; abrir so leitura e desvincular ficam apagados com o motivo', () => {
    const e = linha({ tipo: 'entrega', status: 'sem_caixa', movEntrega: -100, movRecebido: null, banco: null });
    expect(par(e)).toEqual([
      ['Ir para a entrega', null],
      ['Abrir lançamento (só leitura)', 'disponível em breve'],
      ['Desvincular da operação', 'a entrega é da operação · corrija na aba Entrega'],
    ]);
    expect(par({ ...e, lancamentoId: null })[1]).toEqual(['Abrir lançamento (só leitura)', 'esta linha não tem lançamento']);
    expect(par(e, 'compra')).toEqual([
      ['Ir para a entrada', null],
      ['Abrir lançamento (só leitura)', 'disponível em breve'],
      ['Desvincular da operação', 'a entrada é da operação · corrija na aba Recebimento'],
    ]);
    /* operacao fechada nao muda a entrega: ir para a entrega continua valendo */
    expect(par(e, 'venda', true)).toEqual(par(e));
  });

  it('EXPLICACAO: abrir explicacoes vale; abrir lancamento so com lancamento; desfazer apaga no conciliado', () => {
    const x = linha({ tipo: 'explicacao', subtipo: 'permuta_despesa', status: 'sem_caixa', lancamentoId: null });
    expect(par(x)).toEqual([
      ['Abrir explicações', null],
      ['Abrir lançamento', 'esta explicação não gera lançamento'],
      ['Desfazer explicação', null],
    ]);
    expect(par({ ...x, lancamentoId: 'L9' })[1]).toEqual(['Abrir lançamento', null]);
    expect(par({ ...x, status: 'conciliado' })[2]).toEqual(['Desfazer explicação', 'conciliado · desfaça a conciliação primeiro']);
    expect(acoesDaLinha(x, 'venda', false)[2].perigo).toBe(true);
  });

  it('SOMENTE LEITURA: os itens de gravar dizem "operação cancelada · somente leitura" (compra: rascunho ou cancelada); abrir continua valendo', () => {
    const LEITURA = 'operação cancelada · somente leitura';
    expect(motivoSomenteLeitura('venda')).toBe(LEITURA);
    expect(motivoSomenteLeitura('compra')).toBe('operação em rascunho ou cancelada · somente leitura');
    expect(par(linha({ status: 'programado' }), 'compra', true).slice(1).map(x => x[1]))
      .toEqual(Array(3).fill('operação em rascunho ou cancelada · somente leitura'));
    expect(par(linha({ status: 'programado' }), 'venda', true)).toEqual([
      ['Abrir lançamento', null],
      ['Parcelar este recebimento', LEITURA],
      ['Desvincular da operação', LEITURA],
      ['Cancelar recebimento programado', LEITURA],
    ]);
    const x = linha({ tipo: 'explicacao', subtipo: 'permuta_despesa', status: 'sem_caixa', lancamentoId: 'L9' });
    expect(par(x, 'venda', true)).toEqual([
      ['Abrir explicações', null], ['Abrir lançamento', null], ['Desfazer explicação', LEITURA],
    ]);
  });

  /* ── na tela ── */
  const comLanc = () => {
    const c = cc();
    return { ...c, linhas: c.linhas.map(l => (l.tipo === 'recebimento' ? { ...l, lancamentoId: 'L-receb' } : { ...l, lancamentoId: 'L-' + l.parteId })) };
  };
  const linhaTr = (tipo: string, i = 0) => within(screen.getByTestId('conta-corrente-tabela')).getAllByRole('row')
    .filter(r => r.getAttribute('data-tipo') === tipo)[i];
  const abrirMenu = (tr: HTMLElement) => {
    fireEvent.keyDown(within(tr).getByRole('button', { name: /^Ações de/ }), { key: 'Enter' });
    return screen.getByRole('menu');
  };
  const itens = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map(i => ({
    texto: i.querySelector('span')?.textContent ?? '', apagado: i.getAttribute('data-disabled') !== null,
    motivo: i.querySelector('[data-testid="motivo-do-item"]')?.textContent ?? null, title: i.getAttribute('title'),
  }));

  it('TODA linha tem o "⋯"; clicar no RECEBIMENTO abre o lancamento dele (o primeiro item); clicar no "⋯" NAO abre', () => {
    const abrir = vi.fn();
    render(<AbaContaCorrenteOC api={api(comLanc())} somenteLeitura={false} onAbrirLancamento={abrir} onIrParaEntrega={vi.fn()} />);
    const linhas = within(screen.getByTestId('conta-corrente-tabela')).getAllByRole('row').filter(r => r.getAttribute('data-tipo'));
    expect(linhas).toHaveLength(3);
    for (const tr of linhas) expect(within(tr).getAllByRole('button', { name: /^Ações de/ })).toHaveLength(1);
    const botao = within(linhaTr('recebimento')).getByRole('button', { name: /^Ações de/ });
    fireEvent.click(botao);
    expect(abrir).not.toHaveBeenCalled();
    fireEvent.click(linhaTr('recebimento').querySelector('td')!);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith('L-receb');
    /* teclado: Enter com o foco NA LINHA abre; Enter no botao do menu nao */
    fireEvent.keyDown(linhaTr('recebimento'), { key: 'Enter' });
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(linhaTr('recebimento').getAttribute('tabindex')).toBe('0');
    expect(linhaTr('recebimento').className).toContain('cursor-pointer');
  });

  it('clicar na ENTREGA vai para a aba Entrega; recebimento SEM lancamento nao e clicavel, e o menu diz por que', () => {
    const abrir = vi.fn(); const ir = vi.fn();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} onAbrirLancamento={abrir} onIrParaEntrega={ir} />);
    fireEvent.click(linhaTr('entrega').querySelector('td')!);
    expect(ir).toHaveBeenCalledTimes(1);
    const r = linhaTr('recebimento');                 // o fixture nao tem lancamento_id
    expect(r.getAttribute('data-clicavel')).toBe('nao');
    fireEvent.click(r.querySelector('td')!);
    expect(abrir).not.toHaveBeenCalled();
    const m = itens(abrirMenu(r));
    expect(m.map(i => i.texto)).toEqual(['Abrir lançamento', 'Parcelar este recebimento', 'Desvincular da operação', 'Cancelar recebimento programado']);
    /* nenhum item some: os quatro estao la', apagados, cada um com o motivo no item E no title */
    expect(m.every(i => i.apagado)).toBe(true);
    expect(m[0].motivo).toBe('esta linha não tem lançamento');
    for (const i of m) expect(i.title).toBe(i.motivo);
  });

  it('item do menu que vale dispara; apagado nao; e o clique no item nao dispara o clique da linha por tabela', () => {
    const abrir = vi.fn(); const ir = vi.fn();
    render(<AbaContaCorrenteOC api={api(comLanc())} somenteLeitura={false} onAbrirLancamento={abrir} onIrParaEntrega={ir} />);
    const m = abrirMenu(linhaTr('entrega'));
    fireEvent.click(within(m).getByTestId('acao-abrir_leitura'));
    fireEvent.click(within(m).getByTestId('acao-desvincular'));
    expect(abrir).not.toHaveBeenCalled();
    expect(ir).not.toHaveBeenCalled();
    fireEvent.click(within(m).getByTestId('acao-ir_entrega'));
    expect(ir).toHaveBeenCalledTimes(1);               // uma vez: o item; a linha por baixo nao repetiu
  });

  it('EXPLICACAO: clicar na linha abre o dialogo; "Desfazer explicação" abre o dialogo JA no passo de remocao, e nada sai sem o motivo', async () => {
    const c = cc({ saldo: 0, falta_explicar: 0, explicado: 1357.89, situacao: 'quitado',
      linhas: [
        { tipo: 'entrega', data: '2025-03-19', parte_id: 'e1', lote_ordem: 1, cab: 178, categoria: 'desmama_m', conta_ordem: 1120,
          conta: 'Venda de Desmama Machos', mov_entrega: -566879.55, status: 'sem_caixa', no_saldo: true, saldo: -566879.55 },
        { tipo: 'explicacao', subtipo: 'permuta_despesa', data: '2025-04-17', parte_id: 'p9', conta_ordem: 8045, conta: 'Frete',
          mov_entrega: 1357.89, status: 'sem_caixa', no_saldo: true, saldo: 0, motivo: 'frete do comprador' },
      ],
      explicacoes: [{ parte_id: 'p9', tipo: 'permuta_despesa', conta_ordem: 8045, conta: 'Frete', motivo: 'frete do comprador',
        valor: 1357.89, status: 'sem_caixa' }] });
    const a = api(c);
    render(<AbaContaCorrenteOC api={a} somenteLeitura={false} onAbrirLancamento={vi.fn()} onIrParaEntrega={vi.fn()} />);
    /* clique na linha = "Abrir explicações": o dialogo inteiro, sem passo de remocao */
    fireEvent.click(linhaTr('explicacao').querySelector('td')!);
    let dlg = await screen.findByTestId('dialogo-explicar');
    expect(within(dlg).queryByRole('button', { name: 'Remover explicação' })).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByTestId('dialogo-explicar')).toBeNull());
    /* "Desfazer explicação": o mesmo dialogo, ja' no passo de remocao DAQUELA linha */
    fireEvent.click(within(abrirMenu(linhaTr('explicacao'))).getByTestId('acao-desfazer_explicacao'));
    dlg = await screen.findByTestId('dialogo-explicar');
    expect(dlg.querySelector('[data-removendo="sim"]')?.getAttribute('data-explicacao')).toBe('permuta_despesa');
    expect(a.desfazerExplicacao).not.toHaveBeenCalled();           // abrir nao remove
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remover explicação' }));
    expect(a.desfazerExplicacao).not.toHaveBeenCalled();           // sem motivo nao remove
    expect(within(dlg).getByText('Informe o motivo.')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Motivo *'), { target: { value: 'lancado errado' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remover explicação' }));
    await waitFor(() => expect(a.desfazerExplicacao).toHaveBeenCalledWith('p9', 'lancado errado'));
  });

  it('o botao "+ Programar … futuro" saiu do topo nos DOIS lados; o "+ Buscar" fica', () => {
    const { unmount } = render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    expect(screen.getByRole('button', { name: '+ Buscar recebimento no Financeiro' })).toBeTruthy();   // a busca sabe achar
    expect(screen.queryByRole('button', { name: /Programar recebimento futuro/ })).toBeNull();
    unmount();
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} lado="compra" />);
    expect(screen.getByRole('button', { name: '+ Buscar pagamento no Financeiro' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Programar pagamento futuro/ })).toBeNull();
    expect(screen.queryByText(/Programar .* futuro/)).toBeNull();
  });

  it('a regua tem 11 colunas, o "⋯" com 22px, somando 764; cabecalho e Total cobrem a coluna nova', () => {
    render(<AbaContaCorrenteOC api={api(cc())} somenteLeitura={false} />);
    const tab = screen.getByTestId('conta-corrente-tabela');
    const cols = Array.from(tab.querySelectorAll('colgroup col')).map(c => parseFloat(c.getAttribute('style')?.match(/width:\s*([\d.]+)px/)?.[1] ?? 'NaN'));
    expect(cols).toHaveLength(11);
    expect(cols[10]).toBe(22);
    expect(cols.reduce((x, y) => x + y, 0)).toBe(764);
    /* data, lote, cab, selo, os tres valores: nenhum cedeu largura */
    expect([cols[0], cols[1], cols[2], cols[3], cols[7], cols[8], cols[9]]).toEqual([53, 26, 26, 80, 81, 81, 81]);
    const [grupos, colunas] = Array.from(tab.querySelectorAll('thead tr'));
    expect(Array.from(grupos.querySelectorAll('th')).reduce((n, th) => n + (th.colSpan || 1), 0)).toBe(11);
    expect(colunas.querySelectorAll('th')).toHaveLength(11);
    expect(Array.from(tab.querySelectorAll('tfoot td')).reduce((n, td) => n + ((td as HTMLTableCellElement).colSpan || 1), 0)).toBe(11);
    for (const tr of Array.from(tab.querySelectorAll('tbody tr'))) expect(tr.querySelectorAll('td')).toHaveLength(11);
  });
});
