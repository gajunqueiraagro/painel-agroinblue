/**
 * OC-CONTA-CORRENTE-TODOS-01a — a COMPRA no modelo conta corrente (mock oc_conta_corrente_compra_abate_mock_v1, parte compra), com
 * os numeros da OC de homologacao 1337bb2d (Agnaldo, 121 desmama machos, 25/03/2026): entrada 307.460,00, pago -307.460,00 em
 * 25/04, saldo zero, e as quatro despesas pagas a terceiros (frete 1.800, comissoes 1.000 e 500, ICMS 5.236).
 *
 * ⚠ A REGRA MORA NO BANCO (`oc_conta_corrente` vira o sinal na saida da compra; `oc_explicar_saldo` recusa desconto comercial e outra
 *   receita na compra) e foi provada em rollback — cabecalho da migration 20261027172000. Este arquivo trava o que a TELA faz com o
 *   lado: rotulos, sinais dos totais, situacao, os tres tipos de explicacao, o cancelar e a entrega com "entrada".
 * ⚠ E A VENDA NAO MUDA: os tres snapshots da venda (aba, entrega e cancelar) foram gerados contra o codigo de ANTES deste PR (HEAD
 *   741cd800) e conferidos byte a byte com o de depois; daqui para frente eles falham se a venda mudar por carona da compra.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AbaContaCorrenteOC } from './AbaContaCorrenteOC';
import { CancelarContaCorrenteDialog } from './CancelarContaCorrenteDialog';
import { EntregasVendaTabela } from './EntregasVendaTabela';
import {
  efeitoNoSaldo, lerContaCorrente, rotuloDoSaldo, rotuloRecebimento, totalDoRascunho, type ContaCorrente,
} from '@/lib/oc/contaCorrente';
import { lerRol, type OcContaCorrenteApi, type RolCancelamento } from '@/hooks/useOcContaCorrente';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import type { RecebimentoApi, LoteRecebimento } from '@/hooks/useOperacaoRecebimento';

function compra(extra: Record<string, unknown> = {}): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 26, valor_acordado: 307460, entregue: 307460, cab_entregue: 121,
    recebido: 307460, programado: 0, devolvido: 0, saldo: 0, explicado: 0, saldo_a_explicar: 0, falta_explicar: 0,
    situacao: 'quitado', a_entregar: 0, ultima_entrega: '2026-03-25', recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'entrega', data: '2026-03-25', parte_id: 'e1', lote_ordem: 1, cab: 121, categoria: 'desmama_m', conta_ordem: 15020,
        conta: 'Investimento Compra Bovinos Machos', descricao: 'Compra 121 DM', mov_entrega: 307460, status: 'sem_caixa', no_saldo: true, saldo: 307460 },
      { tipo: 'recebimento', data: '2026-04-25', parte_id: 'p1', conta_ordem: 5005, conta: 'Adiantamento a Fornecedores',
        descricao: 'Compra 121 DM', banco: 'Sicredi', mov_recebido: -307460, status: 'realizado', no_saldo: true, saldo: 0 },
    ],
    explicacoes: [],
    despesas: [
      { parte_id: 'd1', componente: 'frete', competencia: '2026-03-25', pagamento: '2026-03-25', descricao: 'Compra 121 DM-Frete',
        favorecido: 'Transportadora', conta_ordem: 15030, conta: 'Investimento Frete/Comissão Compra Bovinos', valor: -1800, status: 'realizado' },
      { parte_id: 'd2', componente: 'comissao', competencia: '2026-03-25', pagamento: '2026-03-25', descricao: 'Compra 121 DM-Comissão',
        favorecido: 'Corretor 1', conta_ordem: 15030, conta: 'Investimento Frete/Comissão Compra Bovinos', valor: -1000, status: 'realizado' },
      { parte_id: 'd3', componente: 'comissao', competencia: '2026-03-25', pagamento: '2026-03-25', descricao: 'Compra 121 DM-Comissão',
        favorecido: 'Corretor 2', conta_ordem: 15030, conta: 'Investimento Frete/Comissão Compra Bovinos', valor: -500, status: 'realizado' },
      { parte_id: 'd4', componente: 'taxa_aquisicao', competencia: '2026-03-25', pagamento: '2026-04-16', descricao: 'Compra 121 DM-ICMS',
        favorecido: 'Sefaz', conta_ordem: 15030, conta: 'Investimento Frete/Comissão Compra Bovinos', valor: -5236, status: 'realizado' },
    ],
    ...extra,
  });
  if (!r) throw new Error('fixture');
  return r;
}

/* A venda da 232c05aa (Santa Rita, desmama M): o mesmo fixture de abaContaCorrente.test.tsx. */
function venda(): ContaCorrente {
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
      { tipo: 'recebimento', data: '2025-04-17', parte_id: 'r1', conta_ordem: 3015, conta: 'Adiantamento de Clientes',
        mov_recebido: 992138.24, status: 'sem_conta_bancaria', no_saldo: true, saldo: -1357.89 },
    ],
    explicacoes: [],
  });
  if (!r) throw new Error('fixture');
  return r;
}

function api(c: ContaCorrente, over: Partial<OcContaCorrenteApi> = {}): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null), listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [] })),
    vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null),
    desfazerExplicacao: vi.fn(async () => null), programarRecebimento: vi.fn(async () => null),
    lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
    listarLotes: vi.fn(async () => [{ id: 'l1', ordem: 1, categoria: 'desmama_m', cab: 121, total: 307460 }]),
    listarContas: vi.fn(async () => []),
    ...over,
  };
}

/* O id automatico do Radix ("radix-:r9:") depende de quantos dialogos o arquivo ja' montou; o snapshot compara o resto. */
const semIdRadix = (html: string) => html.replace(/radix-:r[0-9a-z]+:/g, 'radix-:id:');
const txt = (el: Element | null) => (el?.textContent ?? '').replace(/ /g, ' ');
const linhasDoTipo = (tipo: string) =>
  within(screen.getByTestId('conta-corrente-tabela')).getAllByRole('row').filter(r => r.getAttribute('data-tipo') === tipo)
    .map(r => Array.from(r.querySelectorAll('td')));

describe('compra em conta corrente — extrato espelho da venda (mock v1)', () => {
  it('cards, cabecalhos e linhas pelo lado da compra: entrada positiva verde, pagamento negativo vermelho, saldo zero quitado', () => {
    render(<AbaContaCorrenteOC api={api(compra())} somenteLeitura={false} lado="compra" />);
    expect(txt(screen.getByTestId('card-entrega'))).toBe('Entrada do gado · custo no DRER$ 307.460,00');
    expect(txt(screen.getByTestId('card-dinheiro'))).toBe('Pago · caixa-R$ 307.460,00');
    expect(txt(screen.getByTestId('card-saldo'))).toContain('Saldo · quitado');
    const tabela = screen.getByTestId('conta-corrente-tabela');
    expect(tabela.textContent).toContain('Fornecedor');
    expect(tabela.textContent).toContain('Entrada (DRE)');
    expect(tabela.textContent).toContain('Pago (caixa)');
    expect(tabela.textContent).not.toContain('Comprador');
    const [e] = linhasDoTipo('entrega');
    expect(e[3].textContent).toBe('Entrada');
    expect(e[4].textContent).toBe('Compra Desmama M');
    expect(e[7].textContent).toBe('307.460,00');
    expect(e[7].className).toContain('text-[#15803d]');
    expect(e[9].textContent).toBe('307.460,00');
    const [p] = linhasDoTipo('recebimento');
    expect(p[3].textContent).toBe('Pagamento');
    expect(p[4].textContent).toBe('Pagamento 1 de 1');
    expect(p[5].textContent).toBe('Pagamento de compras');
    expect(p[6].textContent).toBe('Sicredi');
    expect(txt(p[8])).toBe('−307.460,00');
    expect(p[8].className).toContain('text-[#b91c1c]');
    expect(p[9].textContent).toBe('0,00');
    /* o total da compra: entrada positiva, pago negativo */
    const tfoot = tabela.querySelector('tfoot tr');
    const tds = Array.from(tfoot?.querySelectorAll('td') ?? []);
    expect(txt(tds[4])).toBe('307.460,00');
    expect(tds[4].className).toContain('text-[#15803d]');
    expect(txt(tds[5])).toBe('−307.460,00');
    expect(tds[5].className).toContain('text-[#b91c1c]');
    expect(screen.getByTestId('barra-quitado').textContent).toContain('Quitado.');
  });

  it('despesas da operacao num quadro separado, fora do saldo, com o valor negativo em vermelho', () => {
    render(<AbaContaCorrenteOC api={api(compra())} somenteLeitura={false} lado="compra" />);
    const q = screen.getByTestId('despesas-operacao');
    expect(q.textContent).toContain('Despesas da operação · pagas a terceiros, fora do saldo');
    const linhas = q.querySelectorAll('tbody tr');
    expect(linhas).toHaveLength(4);
    expect(Array.from(linhas).map(l => txt(l.querySelectorAll('td')[5]))).toEqual(['−1.800,00', '−1.000,00', '−500,00', '−5.236,00']);
    expect(linhas[3].querySelectorAll('td')[1].textContent).toBe('16/04/26');
    expect(linhas[0].querySelectorAll('td')[5].className).toContain('text-[#b91c1c]');
    /* a busca sabe achar: a venda NAO tem o quadro */
  });

  it('situacao da compra pelo sinal: positivo falta pagar, negativo adiantado ao fornecedor; a venda segue com as frases dela', () => {
    expect(rotuloDoSaldo(1000, 'compra')).toBe('Saldo · falta pagar');
    expect(rotuloDoSaldo(-1000, 'compra')).toBe('Saldo · adiantado ao fornecedor');
    expect(rotuloDoSaldo(0, 'compra')).toBe('Saldo · quitado');
    expect(rotuloDoSaldo(-1000)).toBe('Saldo · falta receber');
    expect(rotuloDoSaldo(1000)).toBe('Saldo · adiantado pelo comprador');
    expect(compra({ situacao: 'falta_pagar', saldo: 1000 }).situacao).toBe('falta_pagar');
    render(<AbaContaCorrenteOC api={api(compra({ saldo: 1000, falta_explicar: 1000, situacao: 'falta_pagar' }))} somenteLeitura={false} lado="compra" />);
    expect(txt(screen.getByTestId('card-saldo'))).toContain('Saldo · falta pagar');
    expect(screen.getByTestId('barra-diferenca').textContent).toContain('Pagou R$ 1.000,00 a menos do que o gado que entrou.');
    expect(rotuloRecebimento(compra().linhas, 'p1', 'compra')).toBe('Pagamento 1 de 1');
    expect(rotuloRecebimento(compra().linhas, 'p1')).toBe('Recebimento 1 de 1');
  });

  it('explicar na compra: so ajuste de preco, permuta e devolucao do fornecedor; o efeito e o espelho; motivo obrigatorio', async () => {
    const explicarSaldo = vi.fn(async () => null);
    render(<AbaContaCorrenteOC api={api(compra(), { explicarSaldo })} somenteLeitura={false} lado="compra" />);
    fireEvent.click(screen.getByRole('button', { name: 'Explicar diferença' }));
    const d = await screen.findByTestId('dialogo-explicar');
    const botoes = within(d).getAllByRole('button').map(b => b.textContent);
    expect(botoes).toContain('+ Ajuste de preço');
    expect(botoes).toContain('+ Permuta / outra despesa');
    expect(botoes).toContain('+ Devolução do fornecedor');
    expect(botoes).not.toContain('+ Desconto comercial');
    expect(botoes).not.toContain('+ Outra receita');
    fireEvent.click(within(d).getByRole('button', { name: '+ Ajuste de preço' }));
    fireEvent.change(within(d).getByLabelText('Valor'), { target: { value: '1.000,00' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Salvar explicação' }));
    expect(explicarSaldo).not.toHaveBeenCalled();
    expect(d.textContent).toContain('Complete cada linha: lote, motivo.');
    expect(efeitoNoSaldo('ajuste_preco', 1000, 'compra')).toBe(-1000);
    expect(efeitoNoSaldo('devolucao_comprador', 500, 'compra')).toBe(500);
    expect(efeitoNoSaldo('ajuste_preco', 1000)).toBe(1000);
    expect(totalDoRascunho([{ tipo: 'ajuste_preco', valor: 1000 }, { tipo: 'permuta_despesa', valor: 300 }], 'compra')).toBe(-1300);
  });

  it('cancelar a compra lista o rol com as palavras dela; sem motivo nao cancela', async () => {
    const rol: RolCancelamento = {
      entregas: [{ data: '2026-03-25', loteOrdem: 1, valor: 307460 }], explicacoes: [],
      recebimentos: [{ data: '2026-04-25', valor: 307460, contaAtual: 'Adiantamento a Fornecedores', contaOriginal: 'Investimento Compra Bovinos Machos', acao: 'volta_para_conta_original' }],
      saidas: [{ data: '2026-03-25', cab: 121, categoria: 'desmama_m', origem: 'registrada' }], compromissos: [],
      despesas: [
        { componente: 'frete', nome: 'Frete', favorecido: 'Manoel Marcelo Tavares Videira', valor: 1800, pago: 1800 },
        { componente: 'comissao', nome: 'Comissão', favorecido: null, valor: 1000, pago: 0 },
      ],
      bloqueios: [],
    };
    const onCancelar = vi.fn(async () => null);
    render(<CancelarContaCorrenteDialog api={api(compra(), { lerRolCancelamento: vi.fn(async () => ({ rol, erro: null })) })}
      lado="compra" onCancelar={onCancelar} onFechar={vi.fn()} />);
    const d = await screen.findByTestId('dialogo-cancelar-cc');
    await waitFor(() => expect(d.textContent).toContain('Entradas canceladas (saem do DRE)'));
    expect(d.textContent).toContain('Pagamentos que voltam à conta original');
    expect(d.textContent).toContain('Pagamento de compras');
    /* decisao 3: as despesas pagas a terceiros FICAM — a secao as lista, com o que ja' foi pago */
    const ficam = within(d).getByTestId('cc-cancelar-ficam');
    const txtFicam = (ficam.textContent ?? '').replace(/\u00a0/g, ' ');
    expect(txtFicam).toContain('Ficam (pagas a terceiros) (2)');
    expect(txtFicam).toContain('Frete · Manoel Marcelo Tavares Videira · R$ 1.800,00 · pago');
    expect(txtFicam).toContain('Comissão · R$ 1.000,00 · em aberto');
    expect(d.textContent).not.toContain('Compromissos cancelados');
    /* a entrada REGISTRADA nao se desvincula (e' o bloqueio do banco): o bloco das adotadas fica vazio */
    expect(d.textContent).toContain('Entradas adotadas desvinculadas (o gado continua no zootécnico) (0)');
    expect(d.textContent).not.toContain('121 cab');
    expect(d.textContent).not.toContain('Recebimentos');
    fireEvent.click(within(d).getByRole('button', { name: 'Cancelar operação' }));
    expect(onCancelar).not.toHaveBeenCalled();
    expect(d.textContent).toContain('Informe o motivo.');
  });

  it('a entrega da compra adota ENTRADA ja lancada, com o fornecedor no texto do seletor', async () => {
    const lote: LoteRecebimento = { loteId: 'l1', ordem: 1, categoria: 'desmama_m', qtdNegociada: 121, qtdRecebida: 0, diferenca: 121,
      estado: 'nao_iniciado', pesoMedioNegociadoKg: 160, criterioValor: 'total', valorInformado: 307460 };
    const r: RecebimentoApi = {
      lotes: [lote], movimentacoes: [], loading: false, saving: false,
      concluirNegociacao: vi.fn(), receberTodos: vi.fn(), registrar: vi.fn(), estornar: vi.fn(), encerrar: vi.fn(),
      reabrir: vi.fn(), estornarTudo: vi.fn(), recarregar: vi.fn(),
      listarAdotaveis: vi.fn(async () => ({ saidas: [], erro: null })), adotar: vi.fn(async () => null), desvincular: vi.fn(async () => null),
    };
    const { container } = render(<EntregasVendaTabela api={r} catLabel={() => 'Desmama M'} readOnly={false} fazendaNome="Faz. Sta. Tereza"
      contraparteNome="Vendedor X" onRegistrarNova={vi.fn()} onEstornar={vi.fn()} lado="compra" />);
    expect(container.textContent).toContain('Data da entrada');
    expect(container.textContent).toContain('Valor da entrada');
    expect(container.textContent).not.toContain('saída');
    fireEvent.click(screen.getByRole('button', { name: 'Adotar entrada já lançada' }));
    const s = await screen.findByTestId('seletor-adocao');
    expect(s.textContent).toContain('de Vendedor X ou sem fornecedor gravado');
    await waitFor(() => expect(s.textContent).toContain('Nenhuma entrada desta categoria disponível para adotar.'));
  });
});

describe('a VENDA nao muda', () => {
  it('aba conta corrente da 232c05aa: o HTML e o de antes do PR', () => {
    const { container } = render(<AbaContaCorrenteOC api={api(venda())} somenteLeitura={false} />);
    expect(semIdRadix(container.innerHTML)).toMatchSnapshot();
    expect(container.querySelector('[data-testid="despesas-operacao"]')).toBeNull();
    expect(container.querySelector('[data-testid="barra-quitado"]')).toBeNull();
  });

  it('entrega da venda e cancelar da venda: o HTML e o de antes do PR', async () => {
    const lote: LoteRecebimento = { loteId: 'l1', ordem: 1, categoria: 'desmama_m', qtdNegociada: 178, qtdRecebida: 0, diferenca: 178,
      estado: 'nao_iniciado', pesoMedioNegociadoKg: 248.21, criterioValor: 'kg', valorInformado: 12.8 };
    const r: RecebimentoApi = {
      lotes: [lote], movimentacoes: [], loading: false, saving: false,
      concluirNegociacao: vi.fn(), receberTodos: vi.fn(), registrar: vi.fn(), estornar: vi.fn(), encerrar: vi.fn(),
      reabrir: vi.fn(), estornarTudo: vi.fn(), recarregar: vi.fn(),
      listarAdotaveis: vi.fn(async () => ({ saidas: [], erro: null })), adotar: vi.fn(async () => null), desvincular: vi.fn(async () => null),
    };
    const ent = render(<EntregasVendaTabela api={r} catLabel={() => 'Desmama M'} readOnly={false} fazendaNome="Faz. Sta. Rita"
      contraparteNome="Helder Hofig" onRegistrarNova={vi.fn()} onEstornar={vi.fn()} />);
    expect(semIdRadix(ent.container.innerHTML)).toMatchSnapshot();
    ent.unmount();
    const rol: RolCancelamento = {
      entregas: [{ data: '2025-03-19', loteOrdem: 1, valor: 566879.55 }],
      explicacoes: [{ tipo: 'permuta_despesa', valor: 357.89, conta: 'Frete' }],
      recebimentos: [{ data: '2025-04-17', valor: 992138.24, contaAtual: 'Adiantamento de Clientes', contaOriginal: 'Venda de Desmama Machos', acao: 'volta_para_conta_original' }],
      saidas: [{ data: '2025-03-19', cab: 178, categoria: 'desmama_m', origem: 'adotada' }], compromissos: [], despesas: [], bloqueios: [],
    };
    render(<CancelarContaCorrenteDialog api={api(venda(), { lerRolCancelamento: vi.fn(async () => ({ rol, erro: null })) })}
      onCancelar={vi.fn(async () => null)} onFechar={vi.fn()} />);
    const d = await screen.findByTestId('dialogo-cancelar-cc');
    await waitFor(() => expect(d.textContent).toContain('Entregas canceladas'));
    expect(semIdRadix(d.innerHTML)).toMatchSnapshot();
  });

  it('o shell da compra monta a conta corrente uma vez so e a desce (lido da FONTE)', () => {
    const fonte = readFileSync('src/components/compra/CompraModalShell.tsx', 'utf8');
    expect(fonte.match(/useOcContaCorrente\(/g)).toHaveLength(1);
    expect(fonte).toContain('ccApiExterno={ccApi}');
    expect(fonte).toContain('contaCorrente={cc}');
    expect(fonte).toContain("lado: 'compra'");
    const fin = readFileSync('src/components/compra/AbaFinanceiroOC.tsx', 'utf8');
    expect(fin).toContain("(api.tipoOperacao === 'venda' || api.tipoOperacao === 'compra')");
  });
});

describe('decisoes do Gabriel sobre a 01a (devolucao em conta propria, cancelar com uma regra so)', () => {
  const sql = readFileSync('supabase/migrations/20261027172200_oc_conta_corrente_todos_01a_devolucao_cancelar.sql', 'utf8');

  it('a devolucao do fornecedor tem conta de ENTRADA propria (3016) e o tipo de operacao volta a ser o da conta', () => {
    expect(sql).toContain("values (null, '1-Entradas', 'Entrada Financeira', 'Outras Entradas', 'Movimentações Financeiras', 'Devolução de Adiantamento a Fornecedores',");
    expect(sql).toContain("null, 'pecuaria', true, 3016, false, null, null);");
    expect(sql).toContain("THEN 'Devolução de Adiantamento a Fornecedores' ELSE 'Devolução de Adiantamento de Clientes' END;");
    expect(sql).toContain('$b$    v_tipo_op := v_pc.tipo_operacao;$b$');
    expect(rotuloDaConta('Devolução de Adiantamento a Fornecedores')).toBe('Devolução do fornecedor');
    /* as outras duas seguem como estavam: a busca sabe achar */
    expect(rotuloDaConta('Adiantamento a Fornecedores')).toBe('Pagamento de compras');
    expect(rotuloDaConta('Devolução de Adiantamento de Clientes')).toBe('Devolução de Adiantamento de Clientes');
  });

  it('o cancelar so toca compromisso da conta corrente em TODO tipo, e as despesas nao travam', () => {
    expect(sql).toContain("$b$       AND c.componente = 'recebimento';$b$, '3'");
    expect(sql).toContain("$b$       AND componente = 'recebimento';$b$, '1'");
    expect(sql).not.toMatch(/\$b\$[^$]*tipo_operacao = 'venda' OR/);
    expect(sql).toContain("'compromissos', v_comps, 'despesas', v_desp, 'bloqueios', v_bloq");
    expect(sql).toContain("AND NOT (v_op.modelo_financeiro = 'conta_corrente' AND p.origem NOT IN ('entrega', 'explicacao')");
  });

  it('o rol le as despesas do banco; rol antigo sem a chave vira lista vazia, nunca erro', () => {
    const base = { modelo: 'conta_corrente', entregas: [], explicacoes: [], recebimentos: [], saidas: [], compromissos: [], bloqueios: [] };
    expect(lerRol(base)?.despesas).toEqual([]);
    const r = lerRol({ ...base, despesas: [{ compromisso_id: 'c1', componente: 'taxa_aquisicao', nome: 'Taxa de aquisição', favorecido: null,
      valor: '5236', pago: '5236', status: 'programado' }] });
    expect(r?.despesas).toEqual([{ componente: 'taxa_aquisicao', nome: 'Taxa de aquisição', favorecido: null, valor: 5236, pago: 5236 }]);
  });
});
