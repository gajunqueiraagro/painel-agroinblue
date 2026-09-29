/**
 * OC-VENDA-FINANCEIRO-COMPLETO-01a — as DESPESAS DA OPERACAO vivas na OC em conta corrente (mock v4): a lista de compromissos no
 * modo so' despesas (`AbaCompromissosOC soDespesas`), com banco, status e o menu "⋯" de sempre.
 *
 * ⚠ OS NUMEROS SAO DA VERA 7d1f8590 (venda 025 DM): a comissao 2.625,00 da Elo MS Leilões Rurais Eireli, conta Impostos e Despesas
 *   de Abates e Vendas, Itaú Personalite, realizado em 14/05/26 — mais uma despesa de teste (Fundersul 1.600,00, SEFAZ MS) ainda
 *   sem programacao, e o principal cancelado que a compra 1337bb2d tambem tem (nao aparece).
 * ⚠ O SNAPSHOT DO MODO TITULO FOI GERADO CONTRA O CODIGO DE ANTES DESTE PR (AbaCompromissosOC.tsx do HEAD c7303f42, md5
 *   bed71a50...), numa copia temporaria, e conferido contra o de depois: a OC no modelo por titulo nao muda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CompromissoResumo, OcCompromissosApi, ParcelaMaterializacao, ResumoOperacaoCompromissos } from '@/hooks/useOcCompromissos';

/* `type`, e nao `interface`: so' o literal de tipo e' atribuivel a `Record<string, unknown>` (as linhas do banco falso). */
type TituloFake = {
  id: string; descricao: string | null; plano_conta_id: string | null; cancelado: boolean; favorecido_id: string | null;
  conta_bancaria_id: string | null; status_transacao: string | null; data_pagamento: string | null; data_competencia: string | null;
  conciliado_em: string | null;
};
type Linha = Record<string, unknown>;
interface Dados { titulos: TituloFake[]; cbi: Array<{ lancamento_id: string; desfeito_em: string | null }>; busca: Linha[]; partes: Linha[] }
const dados = vi.hoisted(() => {
  const d: Dados = { titulos: [], cbi: [], busca: [], partes: [] };
  return d;
});

/* O banco falso APLICA os filtros (`eq`/`in`/`is`/`gte`/`lte`) sobre as linhas de cada tabela: "a linha de meta nao aparece" prova
   o filtro da CONSULTA, nao um mock que ja' devolve a lista filtrada. E' thenable — serve ao `.then` do codigo de antes (snapshot)
   e ao `await` do de depois. */
vi.mock('@/integrations/supabase/client', () => {
  const linhasDe = (tabela: string): Linha[] => (tabela === 'financeiro_lancamentos_v2' ? [...dados.titulos, ...dados.busca]
    : tabela === 'conciliacao_bancaria_itens' ? dados.cbi : tabela === 'zoo_operacao_partes' ? dados.partes : []);
  const construtor = (tabela: string) => {
    const filtros: Array<(r: Linha) => boolean> = [];
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return b; },
      in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return b; },
      is: (c: string, v: unknown) => { filtros.push(r => (r[c] ?? null) === v); return b; },
      gte: (c: string, v: string) => { filtros.push(r => String(r[c]) >= v); return b; },
      lte: (c: string, v: string) => { filtros.push(r => String(r[c]) <= v); return b; },
      order: () => b,
      limit: () => b,
      then: (ok: (x: { data: Linha[]; error: null }) => unknown, falha?: (e: unknown) => unknown) =>
        Promise.resolve({ data: linhasDe(tabela).filter(r => filtros.every(f => f(r))), error: null }).then(ok, falha),
    };
    return b;
  };
  return { supabase: { from: (tabela: string) => construtor(tabela) } };
});
vi.mock('@/hooks/usePlanoContasOC', () => ({
  usePlanoContasOC: () => ({ rows: [
    { id: 'pl-imp', tipo_operacao: '2-Saídas', subcentro: 'Impostos e Despesas de Abates e Vendas', centro_custo: 'Despesas Comerciais', grupo_custo: 'Comercialização' },
    { id: 'pl-venda', tipo_operacao: '1-Entradas', subcentro: 'Venda de Desmama Machos', centro_custo: 'Vendas', grupo_custo: 'Receitas' },
  ] }),
}));
vi.mock('@/hooks/useComponentesFinanceiros', () => {
  const rows = [
    { id: 'k1', natureza: 'obrigacao', codigo: 'comissao', nome: 'Comissão', categoria: 'x', ativo: true, ordem_exibicao: 1 },
    { id: 'k2', natureza: 'obrigacao', codigo: 'taxas_impostos', nome: 'Taxas e impostos', categoria: 'x', ativo: true, ordem_exibicao: 2 },
    { id: 'k3', natureza: 'principal', codigo: 'principal', nome: 'Principal', categoria: 'x', ativo: true, ordem_exibicao: 0 },
  ];
  return { useComponentesFinanceiros: () => ({ rows, loading: false, porNatureza: (n: string) => rows.filter(r => r.natureza === n) }) };
});
vi.mock('@/hooks/useContasBancariasLeves', () => ({
  useContasBancariasLeves: () => ({ contas: [{ id: 'cb1', nome_conta: 'Itau 1234', nome_exibicao: 'Itaú Personalite', banco: 'Itaú',
    agencia: null, numero_conta: null, tipo_conta: null }] }),
}));
vi.mock('@/hooks/useOperacaoEstornoFinanceiro', () => ({
  useOperacaoEstornoFinanceiro: () => ({ estornarMaterializacao: vi.fn(), cancelarProgramacao: vi.fn(), cancelarCompromisso: vi.fn(), saving: false }),
}));
vi.mock('@/hooks/useReprogramarCompromissoLote', () => ({ useReprogramarCompromissoLote: () => ({ simulando: false, reprogramando: false }) }));

import { AbaCompromissosOC } from './AbaCompromissosOC';
import {
  linhasDeDespesa, recusaNaContaCorrente, statusDaDespesa, totaisDeDespesa, type TituloDaDespesa,
} from '@/lib/oc/despesasDaOperacao';
import { BuscarDespesaOCDialog, janelaDaBusca } from './BuscarDespesaOCDialog';
import { REGUA_DESPESAS } from './TabelaDespesasOC';
import { AbaContaCorrenteOC, REGUA_EXTRATO } from '@/components/venda/AbaContaCorrenteOC';
import { lerContaCorrente } from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi } from '@/hooks/useOcContaCorrente';
import { rotuloCurtoDaConta, rotuloDaConta } from '@/lib/financeiro/rotuloConta';

const OC = '7d1f8590-0000-0000-0000-000000000000';

const comp = (o: Partial<CompromissoResumo>): CompromissoResumo => ({
  compromissoId: 'c1', operacaoId: OC, clienteId: 'cli', natureza: 'obrigacao', componente: 'comissao', favorecidoId: 'f-elo',
  planoContaId: 'pl-imp', loteId: null, descricao: 'Venda 025 DM - Comissão', status: 'programado', valorCompromisso: 2625,
  totalProgramado: 2625, saldoAProgramar: 0, totalMaterializado: 2625, saldoAMaterializar: 0, totalLiquidadoMonetario: 2625,
  totalLiquidadoNaoMonetario: 0, totalLiquidado: 2625, saldoFinanceiro: 0, programacaoAtivaId: 'pr1', temProgramacaoAtiva: true,
  temDivergencia: false, ...o,
});
const parc = (o: Partial<ParcelaMaterializacao>): ParcelaMaterializacao => ({
  parcelaId: 'pa1', operacaoId: OC, clienteId: 'cli', compromissoId: 'c1', compromissoStatus: 'programado', programacaoId: 'pr1',
  programacaoStatus: 'ativa', sequencia: 1, valor: 2625, vencimento: '2026-05-14', contaBancariaId: 'cb1', forma: 'PIX',
  status: 'materializada', parteId: 'pt1', tituloId: 't1', tituloStatusTransacao: 'realizado', tituloValor: 2625,
  totalLiquidadoTitulo: 2625, saldoTitulo: 0, materializada: true, vinculoIntegro: true, temDivergencia: false, ...o,
});
const TITULO_T1: TituloFake = {
  id: 't1', descricao: 'Venda 025 DM - Comissão', plano_conta_id: 'pl-imp', cancelado: false, favorecido_id: 'f-elo',
  conta_bancaria_id: 'cb1', status_transacao: 'realizado', data_pagamento: '2026-05-14', data_competencia: '2026-05-04', conciliado_em: null,
};

const COMPROMISSOS: CompromissoResumo[] = [
  comp({}),
  comp({ compromissoId: 'c2', componente: 'taxas_impostos', favorecidoId: 'f-sefaz', descricao: 'Venda 025 DM - Fundersul', status: 'aberto',
    valorCompromisso: 1600, totalProgramado: 0, saldoAProgramar: 1600, totalMaterializado: 0, saldoAMaterializar: 0,
    totalLiquidadoMonetario: 0, totalLiquidado: 0, saldoFinanceiro: 1600, programacaoAtivaId: null, temProgramacaoAtiva: false }),
  comp({ compromissoId: 'c0', natureza: 'principal', componente: 'principal', planoContaId: 'pl-venda', descricao: 'Venda 025 DM',
    status: 'cancelado', valorCompromisso: 87500, totalLiquidado: 0, programacaoAtivaId: null, temProgramacaoAtiva: false }),
];
const PARCELAS: ParcelaMaterializacao[] = [parc({})];
const FORNECEDORES = [{ id: 'f-elo', nome: 'Elo MS Leilões Rurais Eireli' }, { id: 'f-sefaz', nome: 'Sefaz MS' }];

const resumo = (o: Partial<ResumoOperacaoCompromissos> = {}): ResumoOperacaoCompromissos => ({
  operacaoId: OC, clienteId: 'cli', nCompromissos: 3, obrigacaoTotal: 4225, totalProgramado: 2625, totalMaterializado: 2625,
  totalLiquidado: 2625, saldoFinanceiro: 1600, temCompromissos: true, temPartesLegadas: false, modo: 'novo_modelo', temDivergencia: false,
  entradaObrigacao: 0, saidaObrigacao: 4225, entradaLiquidado: 0, saidaLiquidado: 2625, entradaMaterializado: 0, saidaMaterializado: 2625,
  entradaProgramado: 0, saidaProgramado: 2625, ...o,
});
function ocApi(compromissos = COMPROMISSOS, parcelas = PARCELAS): OcCompromissosApi {
  return {
    resumoOperacao: resumo(), compromissos, parcelas, versao: 12, loading: false, saving: false,
    criarCompromisso: vi.fn(async () => ({ compromissoId: 'novo', operacaoVersao: 13 })),
    programarCompromisso: vi.fn(), acrescentarParcelas: vi.fn(), alterarParcela: vi.fn(async () => 13),
    materializarParcela: vi.fn(), ajustarValorCompromisso: vi.fn(), recarregar: vi.fn(async () => {}),
  };
}

let local = '';
function Onde() { local = useLocation().search; return null; }
function montar(soDespesas: boolean, api = ocApi(), tipo: 'venda' | 'compra' = 'venda') {
  return render(
    <MemoryRouter initialEntries={['/v2?oc_venda=1&oc_id=' + OC]}>
      <Onde />
      <AbaCompromissosOC ocApi={api} bloqueado={false} clienteId="cli" tipoOperacao={tipo} fornecedores={FORNECEDORES}
        valorAcordado={87500} lotes={[]} contraparteId={null} dataOperacao="2026-05-04" dataChegada={null} darkSelectClass=""
        soDespesas={soDespesas} />
    </MemoryRouter>,
  );
}
const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/ /g, ' ');
const linhaDe = (componente: string) => {
  const r = document.querySelector(`[data-testid="despesas-tabela"] tbody tr[data-despesa="${componente}"]`);
  if (!(r instanceof HTMLElement)) throw new Error(`nao achei a linha ${componente}`);
  return r;
};
function abrirMenu(linha: HTMLElement) {
  /* O Radix abre no `pointerdown`, que o jsdom nao entrega como ele espera; pelo teclado abre (a mesma nota de
     pecHistoricoLinhaModal.test.tsx). */
  const botao = within(linha).getByRole('button', { name: /^Ações de/ });
  fireEvent.keyDown(botao, { key: 'Enter' });
  return screen.getByRole('menu');
}
const itensDoMenu = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map(i => i.textContent);

beforeEach(() => { dados.titulos = [TITULO_T1]; dados.cbi = []; dados.busca = []; dados.partes = []; local = ''; });

describe('a lib das despesas (linhas, status, totais)', () => {
  const t = (o: Partial<TituloDaDespesa> = {}): TituloDaDespesa => ({ descricao: 'x', planoContaId: 'pl-imp', cancelado: false,
    favorecidoId: null, contaBancariaId: 'cb1', statusTransacao: 'realizado', dataPagamento: '2026-05-14', dataCompetencia: null,
    conciliado: false, ...o });
  it('status: sem titulo Previsto; com titulo o do lancamento; Conciliado por cima; titulo nao lido "—"; titulo morto "Sem título"', () => {
    expect(statusDaDespesa(null, undefined)).toBe('previsto');
    expect(statusDaDespesa(parc({ status: 'prevista', tituloId: null, materializada: false }), undefined)).toBe('previsto');
    expect(statusDaDespesa(parc({}), t())).toBe('realizado');
    expect(statusDaDespesa(parc({}), t({ statusTransacao: 'programado' }))).toBe('programado');
    expect(statusDaDespesa(parc({}), t({ statusTransacao: 'agendado' }))).toBe('agendado');
    expect(statusDaDespesa(parc({}), t({ conciliado: true }))).toBe('conciliado');
    expect(statusDaDespesa(parc({}), undefined)).toBeNull();
    expect(statusDaDespesa(parc({ materializada: false }), undefined)).toBe('sem_titulo');
    /* fix1: titulo LIDO e cancelado -> "Sem título"; titulo ainda nao lido -> "—" (null), nunca "Sem título" */
    expect(statusDaDespesa(parc({}), t({ cancelado: true }))).toBe('sem_titulo');
    expect(statusDaDespesa(parc({}), null)).toBeNull();
  });
  it('linhas: principal e cancelado ficam fora; o compromisso sem programacao e o saldo nao programado viram linha', () => {
    const titulos = new Map([['t1', t()]]);
    const l = linhasDeDespesa(COMPROMISSOS, PARCELAS, titulos);
    expect(l.map(x => [x.tipo, x.compromisso.compromissoId, x.valor, x.status])).toEqual([
      ['parcela', 'c1', 2625, 'realizado'], ['compromisso', 'c2', 1600, 'previsto'],
    ]);
    const parcial = [comp({ compromissoId: 'c3', valorCompromisso: 3000, saldoAProgramar: 375 })];
    const l2 = linhasDeDespesa(parcial, [parc({ compromissoId: 'c3' })], titulos);
    expect(l2.map(x => [x.tipo, x.valor])).toEqual([['parcela', 2625], ['saldo', 375]]);
    expect(l2.reduce((s, x) => s + x.valor, 0)).toBe(3000);
    /* titulos ainda nao lidos: a linha existe, o status fica em aberto */
    expect(linhasDeDespesa(COMPROMISSOS, PARCELAS, null)[0].status).toBeNull();
    /* fix1 — o caso da prova de tela: o mapa JA' EXISTE (leitura anterior) mas o titulo recem-lancado ainda nao esta' nele.
       Era "Sem título" por ~1s; e' "—". Com o titulo lido e cancelado no mapa, ai' sim "Sem título". */
    expect(linhasDeDespesa(COMPROMISSOS, PARCELAS, new Map())[0].status).toBeNull();
    expect(linhasDeDespesa(COMPROMISSOS, PARCELAS, new Map([['t1', t({ cancelado: true })]]))[0].status).toBe('sem_titulo');
    /* cada filtro sozinho: principal VIVO fica fora (natureza), obrigacao CANCELADA fica fora (status) */
    const soltos = [comp({ compromissoId: 'pv', natureza: 'principal', status: 'aberto', valorCompromisso: 87500, saldoAProgramar: 87500 }),
      comp({ compromissoId: 'oc', status: 'cancelado', valorCompromisso: 500, saldoAProgramar: 500 })];
    expect(linhasDeDespesa(soltos, [], titulos)).toEqual([]);
  });
  it('totais dos cards: so obrigacao viva — lancadas 4.225,00, pagas 2.625,00', () => {
    expect(totaisDeDespesa(COMPROMISSOS)).toEqual({ lancadas: 4225, pagas: 2625 });
    /* obrigacao cancelada e principal vivo nao somam */
    expect(totaisDeDespesa([...COMPROMISSOS, comp({ compromissoId: 'oc', status: 'cancelado', valorCompromisso: 500, totalLiquidado: 500 }),
      comp({ compromissoId: 'pv', natureza: 'principal', status: 'aberto', valorCompromisso: 87500, totalLiquidado: 0 })]))
      .toEqual({ lancadas: 4225, pagas: 2625 });
    expect(totaisDeDespesa([])).toEqual({ lancadas: 0, pagas: 0 });
  });
  it('nome curto so para as 5 contas medidas; o resto como no plano; rotuloDaConta nao muda', () => {
    expect(rotuloCurtoDaConta('Impostos e Despesas de Abates e Vendas')).toBe('Imp. e Desp. Abate e Venda');
    expect(rotuloCurtoDaConta('Investimento Frete/Comissão Compra Bovinos')).toBe('Frete/Comiss. Compra Bov.');
    expect(rotuloCurtoDaConta('Venda de Desmama Machos')).toBe('Venda de Desmama Machos');
    expect(rotuloCurtoDaConta(null)).toBeNull();
    expect(rotuloDaConta('Impostos e Despesas de Abates e Vendas')).toBe('Impostos e Despesas de Abates e Vendas');
  });
  it('janela do Buscar despesa: 60 dias para cada lado da data da OC', () => {
    expect(janelaDaBusca('2026-05-04')).toEqual({ de: '2026-03-05', ate: '2026-07-03' });
    expect(janelaDaBusca(null)).toBeNull();
  });
});

describe('a OC em conta corrente nao tem caminho de principal', () => {
  it('a guarda do criar recusa principal so na conta corrente', () => {
    expect(recusaNaContaCorrente(['obrigacao'], true)).toBeNull();
    expect(recusaNaContaCorrente(['obrigacao', 'principal'], true)).toBe(
      'Nesta OC (conta corrente) só se lança despesa: a receita é a entrega e o recebimento.');
    expect(recusaNaContaCorrente(['principal'], false)).toBeNull();
  });

  it('sem Gerar compromissos, Gerar previsão, Novo compromisso nem Lançar realizado; "+ Nova despesa" abre travado em obrigacao', async () => {
    const api = ocApi([], []);
    montar(true, api);
    expect(screen.queryByRole('button', { name: 'Gerar compromissos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gerar previsão' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo compromisso' })).toBeNull();
    expect(document.body.textContent).not.toContain('Lançar realizado');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova despesa' }));
    const titulo = await screen.findByText('Nova despesa');
    const dlg = titulo.closest('[role="dialog"]');
    if (!(dlg instanceof HTMLElement)) throw new Error('sem dialogo');
    const natureza = within(dlg).getByRole('combobox', { name: 'Natureza' });
    expect(natureza.textContent).toBe('obrigacao');
    expect(natureza).toHaveProperty('disabled', true);
    /* a busca sabe achar: fora da conta corrente o mesmo dialogo nasce em principal e deixa trocar */
  });

  it('fora da conta corrente o dialogo de sempre: "Novo compromisso", natureza principal, trocavel', async () => {
    montar(false, ocApi([], []));
    fireEvent.click(screen.getByRole('button', { name: 'Novo compromisso' }));
    const titulo = await screen.findByText('Novo compromisso', { selector: 'h2' });
    const dlg = titulo.closest('[role="dialog"]');
    if (!(dlg instanceof HTMLElement)) throw new Error('sem dialogo');
    const natureza = within(dlg).getByRole('combobox', { name: 'Natureza' });
    expect(natureza.textContent).toBe('principal');
    expect(natureza).toHaveProperty('disabled', false);
  });
});

describe('as despesas vivas (mock v4)', () => {
  it('colunas Venc · Pgto · Descrição · Favorecido · Conta · Banco · Status · Valor R$ · ⋯, com os dados da Vera', async () => {
    montar(true);
    await waitFor(() => expect(within(linhaDe('comissao')).getByText('Realizado')).toBeTruthy());
    const ths = Array.from(document.querySelectorAll('[data-testid="despesas-tabela"] thead th')).map(t => t.textContent);
    expect(ths).toEqual(['Venc.', 'Pgto.', 'Descrição', 'Favorecido', 'Conta', 'Banco', 'Status', 'Valor R$', '']);
    const c = Array.from(linhaDe('comissao').querySelectorAll('td'));
    expect(c.slice(0, 6).map(td => txt(td))).toEqual(['14/05/26', '14/05/26', 'Venda 025 DM - Comissão', 'Elo MS Leilões Rurais Eireli',
      'Imp. e Desp. Abate e Venda', 'Itaú Personalite']);
    expect(c[4].getAttribute('title')).toBe('Impostos e Despesas de Abates e Vendas');
    expect(c[6].querySelector('[data-status]')?.getAttribute('data-status')).toBe('realizado');
    expect(txt(c[7])).toBe('2.625,00');
    expect(c[7].className).toContain('text-[#b91c1c]');
    const f = Array.from(linhaDe('taxas_impostos').querySelectorAll('td'));
    expect(f.slice(0, 2).map(td => txt(td))).toEqual(['—', '—']);
    expect(txt(f[5])).toBe('—');
    expect(f[6].querySelector('[data-status]')?.getAttribute('data-status')).toBe('previsto');
    /* o principal cancelado nao e' despesa */
    expect(document.querySelector('[data-despesa="principal"]')).toBeNull();
    expect(txt(document.querySelector('[data-testid="despesas-tabela"] tfoot td'))).toBe('2 despesas');
    expect(txt(screen.getByTestId('despesas-total'))).toBe('4.225,00');
    /* Descricao, Favorecido, Conta e Banco podem quebrar; datas, status e valor, nunca */
    expect(c[2].className).not.toContain('whitespace-nowrap');
    expect(c[7].className).toContain('whitespace-nowrap');
  });

  it('conciliado de verdade vem de conciliacao_bancaria_itens (conciliado_em esta nulo no proto inteiro)', async () => {
    dados.cbi = [{ lancamento_id: 't1', desfeito_em: null }];
    montar(true);
    await waitFor(() => expect(within(linhaDe('comissao')).getByText('Conciliado')).toBeTruthy());
  });

  it('clicar na linha com titulo abre o lancamento no Financeiro, com o endereco de volta para a OC', async () => {
    montar(true);
    await waitFor(() => expect(within(linhaDe('comissao')).getByText('Realizado')).toBeTruthy());
    fireEvent.click(within(linhaDe('comissao')).getByText('Venda 025 DM - Comissão'));
    const q = new URLSearchParams(local);
    expect(q.get('flancId')).toBe('t1');
    expect(q.get('returnOcId')).toBe(OC);
    expect(q.get('returnOcTipo')).toBe('venda');
    expect(q.get('oc_venda')).toBeNull();
  });

  it('o ⋯ so oferece o que vale para o estado da linha', async () => {
    montar(true);
    await waitFor(() => expect(within(linhaDe('comissao')).getByText('Realizado')).toBeTruthy());
    const m1 = abrirMenu(linhaDe('comissao'));
    expect(itensDoMenu(m1)).toEqual(['Abrir lançamento', 'Reclassificar', 'Cancelar programação', 'Estornar', 'Desvincular', 'Desfazer']);
    /* com titulo lancado, cancelar a programacao espera o estorno */
    expect(within(m1).getByText('Cancelar programação').closest('[role="menuitem"]')?.getAttribute('data-disabled')).toBe('');
    fireEvent.keyDown(m1, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const m2 = abrirMenu(linhaDe('taxas_impostos'));
    expect(itensDoMenu(m2)).toEqual(['Programar', 'Reclassificar', 'Desfazer']);
  });

  it('despesa Conciliada: o ⋯ nao oferece Estornar nem Desfazer, e diz por que (fix1)', async () => {
    dados.cbi = [{ lancamento_id: 't1', desfeito_em: null }];
    montar(true);
    await waitFor(() => expect(within(linhaDe('comissao')).getByText('Conciliado')).toBeTruthy());
    const m = abrirMenu(linhaDe('comissao'));
    expect(itensDoMenu(m)).toEqual(['Abrir lançamento', 'Reclassificar', 'Cancelar programação', 'Desvincular']);
    const motivo = within(m).getByTestId('motivo-conciliado');
    expect(motivo.getAttribute('title')).toBe('conciliado com o extrato; desfaça a conciliação primeiro');
    /* a busca sabe achar: a outra despesa, nao conciliada, segue com o Desfazer */
    fireEvent.keyDown(m, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(itensDoMenu(abrirMenu(linhaDe('taxas_impostos')))).toContain('Desfazer');
  });
});

describe('Buscar despesa no Financeiro', () => {
  const lanc = (o: Linha): Linha => ({ cliente_id: 'cli', tipo_operacao: '2-Saídas', cancelado: false, cenario: 'realizado',
    subcentro: 'Impostos e Despesas de Abates e Vendas', data_competencia: '2026-05-10', data_pagamento: null, favorecido_id: null,
    valor: -500, ...o });
  it('so saidas REALIZADAS, sem parte viva: a linha de meta (o caso do Agnaldo) nao aparece (fix1)', async () => {
    dados.busca = [
      lanc({ id: 'real', descricao: 'Fundersul 025' }),
      lanc({ id: 'meta', descricao: 'Prev. Frete - Compra 200 Desmama M', cenario: 'meta' }),
      lanc({ id: 'da-oc', descricao: 'Iagro ja vinculada' }),
    ];
    dados.partes = [{ financeiro_lancamento_id: 'da-oc', cancelada: false }];
    render(<BuscarDespesaOCDialog clienteId="cli" dataOperacao="2026-05-04" subcentros={['Impostos e Despesas de Abates e Vendas']}
      nomeFavorecido={() => null} onEscolher={vi.fn()} onFechar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('tr[data-lancamento="real"]')).not.toBeNull());
    expect(document.querySelector('tr[data-lancamento="meta"]')).toBeNull();
    expect(document.querySelector('tr[data-lancamento="da-oc"]')).toBeNull();
    expect(document.querySelectorAll('tr[data-lancamento]')).toHaveLength(1);
  });
});

/* fix1 — A REGUA SOMA A LARGURA INTERNA MEDIDA, nao a nominal. Na prova de tela da Vera o extrato somava 784 (o comentario dizia
   766) e rolava 20px; as despesas somavam 766 e vazavam 2px na borda. 764 e' o `clientWidth` medido da area que rola no modal real
   (offsetWidth 766 menos 1px de borda de cada lado). Soma-se o que a TELA desenha (os `col` renderizados), nao so' a constante. */
describe('a regua das duas tabelas soma 764 (largura interna medida)', () => {
  const LARGURA_INTERNA_MEDIDA = 764;
  const somaDosCols = (tabela: Element | null) =>
    Array.from(tabela?.querySelectorAll('colgroup col') ?? []).reduce((s, c) => s + parseFloat(c.getAttribute('style')?.match(/width:\s*([\d.]+)px/)?.[1] ?? 'NaN'), 0);
  it('constantes e colgroups renderizados', async () => {
    expect(REGUA_EXTRATO.reduce((a, b) => a + b, 0)).toBe(LARGURA_INTERNA_MEDIDA);
    expect(REGUA_DESPESAS.reduce((a, b) => a + b, 0)).toBe(LARGURA_INTERNA_MEDIDA);
    montar(true);
    await waitFor(() => expect(screen.getByTestId('despesas-tabela')).toBeInTheDocument());
    expect(somaDosCols(screen.getByTestId('despesas-tabela'))).toBe(LARGURA_INTERNA_MEDIDA);
    /* a celula do ⋯ (20px) nao pode ter padding horizontal: com o `px-[4px]` do TD a area util era 12 e o botao de 18 vazava 2px */
    const celulaMenu = screen.getAllByRole('button', { name: /^Ações de/ })[0].closest('td');
    expect(celulaMenu?.className ?? '').not.toMatch(/\bpx-/);
    expect(celulaMenu?.className ?? '').toContain('p-0');
    const cc = lerContaCorrente({ modelo: 'conta_corrente', versao: 1, valor_acordado: 0, entregue: 0, cab_entregue: 0, recebido: 0,
      programado: 0, devolvido: 0, saldo: 0, explicado: 0, saldo_a_explicar: 0, falta_explicar: 0, situacao: 'quitado', a_entregar: 0,
      ultima_entrega: null, recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0, linhas: [], explicacoes: [] });
    if (!cc) throw new Error('fixture');
    const api: OcContaCorrenteApi = {
      contaCorrente: cc, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
      sincronizarEntregas: vi.fn(async () => null), listarVinculaveis: vi.fn(async () => ({ erro: null, itens: [] })),
      vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null), desfazerExplicacao: vi.fn(async () => null),
      programarRecebimento: vi.fn(async () => null), lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
      listarLotes: vi.fn(async () => []), listarContas: vi.fn(async () => []),
    };
    const { container } = render(<AbaContaCorrenteOC api={api} somenteLeitura />);
    expect(container.querySelectorAll('[data-testid="conta-corrente-tabela"] colgroup col')).toHaveLength(10);
    expect(somaDosCols(container.querySelector('[data-testid="conta-corrente-tabela"]'))).toBe(LARGURA_INTERNA_MEDIDA);
  });
});

/* ⚠ O SNAPSHOT FOI GERADO CONTRA A COPIA DO HEAD c7303f42 (ver o cabecalho). Falha se a OC por titulo mudar de carona. */
describe('a OC no modelo por titulo nao muda', () => {
  it('o HTML da aba de compromissos e o de antes do PR', async () => {
    const { container } = montar(false, ocApi(), 'compra');
    await waitFor(() => expect(container.textContent).toContain('Venda 025 DM - Comissão'));
    await new Promise(r => setTimeout(r, 0));
    expect(container.innerHTML.replace(/radix-:r[0-9a-z]+:/g, 'radix-:id:')).toMatchSnapshot();
  });
});

describe('o roteador da aba (lido da FONTE)', () => {
  const fonte = readFileSync('src/components/compra/AbaFinanceiroOC.tsx', 'utf8');
  /* sem os comentarios: o do ramo NOMEIA as props proibidas para dizer que elas nao vao */
  const ramo = fonte.slice(fonte.indexOf("modelo === 'conta_corrente'"), fonte.indexOf("if ((api.tipoOperacao === 'venda'"))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  it('a conta corrente monta a lista so de despesas, sem nenhuma prop de principal', () => {
    expect(ramo.length).toBeGreaterThan(200);
    expect(ramo).toContain('<AbaCompromissosOC ocApi={ocApi} soDespesas');
    expect(ramo).toContain('totaisDespesas={despesasLidas ? totaisDeDespesa(ocApi.compromissos) : null}');
    for (const proibida of ['linhasPrevisao', 'propostasExtras', 'propostasDoMotor', 'abrirGerarAoMontar', 'bloqueioPrevisao', 'ehBoitel']) {
      expect(ramo).not.toContain(proibida);
    }
    /* a busca sabe achar: o ramo do modelo por titulo tem essas props */
    expect(fonte.slice(fonte.indexOf('// nova_vazia | novo_modelo'))).toContain('linhasPrevisao');
  });
});
