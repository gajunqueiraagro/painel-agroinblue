/**
 * VINCULAR-LANC-OC-01 — "Vincular à operação" no detalhe do lançamento do Financeiro V2.
 *
 * ⚠ OS NUMEROS SAO DOS CASOS PROVADOS EM ROLLBACK NO PROTO (FASE 1b):
 *   (b) Vera 57f5ce96 "Fundersul/Iagro - Rota" 2.165,49 x OC 02be1a41 — o compromisso da OC tem o
 *       MESMO valor ao centavo e titulo programado; ela vem em 1o e ja' selecionada;
 *   (c) SR c76720c3 x OC bb51bb9a — titulo da OC realizado e conciliado: linha nao selecionavel;
 *   (e) Vera 010db5b2 106.069,30 x OC 2d39d7e9 — rebanho em dobro e principal acima da base.
 * ⚠ A RPC E' MOCKADA: a regra mora no banco e foi provada la'. Aqui se trava o que a TELA faz com
 *   a resposta — ordem, selecao, escolha, avisos, motivo, e a lista avisada no sucesso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
const notificar = vi.fn();
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: (id: string) => notificar(id) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VincularOperacaoDialog } from '@/components/financeiro-v2/VincularOperacaoDialog';
import {
  podeOferecerVinculo, situacaoDaCandidata, candidataInicial, linhaDaCandidata, rotuloOC,
  type OperacaoCandidata, type CompromissoCandidato, type RespostaCandidatas, type VinculoFeito,
} from '@/lib/oc/vincularLancamento';

const LANC = '57f5ce96-64ae-4ae6-bd7e-1f7e6c74a196';
const CLIENTE = 'cli-vera';

const compromisso = (o: Partial<CompromissoCandidato>): CompromissoCandidato => ({
  id: 'cb81fe80', componente: 'taxa_aquisicao', descricao: 'Abate 070 V - Fundersul', valor_total: 2165.49,
  status: 'programado', lote_id: null, diferenca: 0, valor_exato: true, acao_prevista: 'substituir',
  parcelas: [{ parcela_id: 'p1', sequencia: 1, valor: 2165.49, status: 'materializada', titulo_id: '18b04569',
    titulo_status: 'programado', titulo_cancelado: false, titulo_conciliado: false, titulo_liquidado: false }],
  ...o,
});
const candidata = (o: Partial<OperacaoCandidata>): OperacaoCandidata => ({
  operacao_id: '02be1a41', tipo_operacao: 'abate', numero_documento: '070', status_comercial: 'fechada', versao: 11,
  data_operacao: '2026-09-02', data_referencia: '2026-09-02', distancia_dias: 28, fazenda_id: 'f1', fazenda_nome: 'Baía',
  mesma_fazenda: true, contraparte_id: 'c1', contraparte_nome: 'Frigorífico', valor_acordado: 367783.4,
  compromissos: [compromisso({})], acao_prevista: 'escolher_compromisso', tem_titulo_vivo_do_componente: false,
  valor_exato: true, competencia_nova: '2026-09-02', competencia_muda_de_mes: true, movimento_duplicado: null, ...o,
});
const respCandidatas = (cands: OperacaoCandidata[]): RespostaCandidatas => ({
  elegivel: true,
  lancamento: { id: LANC, descricao: 'Fundersul/Iagro - Rota', valor: 2165.49, tipo_operacao: '2-Saídas',
    subcentro: 'Impostos e Despesas de Abates e Vendas', data_competencia: '2026-07-01', data_pagamento: '2026-08-05',
    status_transacao: 'realizado', fazenda_nome: 'Baía', favorecido_nome: 'Sefaz', conciliado: true,
    origem_lancamento: 'manual', importado: false, movimentacao_rebanho_id: null },
  regra: { natureza: 'obrigacao', componentes: ['taxas_impostos', 'frete', 'comissao', 'taxa_aquisicao'], tipos_oc: ['venda', 'abate'] },
  componente_sugerido: { codigo: 'taxa_aquisicao', rotulo: null, fonte: 'descricao' },
  candidatas: cands,
});
const simOk = (o: Partial<VinculoFeito> = {}): VinculoFeito => ({
  ok: true, acao: 'simulado', simulado: true, operacao_versao: 11, titulos_vivos_do_compromisso: 1, conciliado: true,
  compromisso: { id: 'cb81fe80', acao: 'mantido', valor_anterior: 2165.49, valor_total: 2165.49 },
  parcela: { id: 'p1', acao: 'substituida' },
  titulo_substituido: { titulo_id: '18b04569', valor: 2165.49, status_transacao: 'programado', ja_estava_cancelado: false },
  lancamento: { id: LANC, competencia_anterior: '2026-07-01', competencia_nova: '2026-09-02', hash_preservado: true, movimentacao_rebanho_id_solto: null },
  avisos: [{ codigo: 'competencia_mudou_de_mes', de: '2026-07-01', para: '2026-09-02' }],
  ...o,
});

/** A RPC falsa: candidatas numa chamada; `oc_vincular_lancamento` responde por `p_simular`. */
function responder(cands: OperacaoCandidata[], simular: (args: Record<string, unknown>) => unknown, gravar?: (args: Record<string, unknown>) => unknown) {
  rpc.mockImplementation(async (nome: string, args: Record<string, unknown>) => {
    if (nome === 'oc_candidatas_vinculo') return { data: respCandidatas(cands), error: null };
    if (nome === 'oc_vincular_lancamento') {
      return { data: args.p_simular ? simular(args) : (gravar ?? simular)(args), error: null };
    }
    return { data: null, error: null };
  });
}

const montar = (onClose = vi.fn(), onVinculado = vi.fn()) => {
  render(<VincularOperacaoDialog open lancamentoId={LANC} clienteId={CLIENTE} onClose={onClose} onVinculado={onVinculado} />);
  return { onClose, onVinculado };
};
const linha = (oc: string) => document.querySelector(`tr[data-oc="${oc}"]`);
/* Sem cast: o seletor precisa achar um HTMLElement, ou o teste falha dizendo qual. */
function el(raiz: ParentNode, seletor: string): HTMLElement {
  const e = raiz.querySelector(seletor);
  if (!(e instanceof HTMLElement)) throw new Error(`nao achei ${seletor}`);
  return e;
}

beforeEach(() => { rpc.mockReset(); notificar.mockReset(); });

describe('a acao so aparece onde o banco aceitaria', () => {
  const base = { lancamentoId: LANC, subcentro: 'Impostos e Despesas de Abates e Vendas', cancelado: false, temParte: false,
    subcentros: new Set(['Impostos e Despesas de Abates e Vendas', 'Abates de Fêmeas']) };
  it('subcentro no mapa, sem parte, nao cancelado: aparece', () => {
    expect(podeOferecerVinculo(base)).toBe(true);
  });
  it('some com parte de OC, cancelado, subcentro fora do mapa, sem id ou sem o mapa', () => {
    expect(podeOferecerVinculo({ ...base, temParte: true })).toBe(false);
    expect(podeOferecerVinculo({ ...base, cancelado: true })).toBe(false);
    expect(podeOferecerVinculo({ ...base, subcentro: 'Venda de Tropa' })).toBe(false);
    expect(podeOferecerVinculo({ ...base, lancamentoId: null })).toBe(false);
    expect(podeOferecerVinculo({ ...base, subcentros: null })).toBe(false);
  });
});

describe('ordem e pre-selecao', () => {
  it('(b) a OC de valor identico vem em 1o, na ordem do banco, e ja selecionada', async () => {
    const outra = candidata({ operacao_id: '581d075c', numero_documento: '050', distancia_dias: 21, valor_exato: false,
      compromissos: [compromisso({ id: 'k2', valor_total: 1880.43, valor_exato: false, componente: 'taxas_impostos' })] });
    responder([candidata({}), outra], () => simOk());
    montar();
    await waitFor(() => expect(linha('02be1a41')).not.toBeNull());
    const ocs = [...document.querySelectorAll('tr[data-oc]')].map(r => r.getAttribute('data-oc'));
    expect(ocs).toEqual(['02be1a41', '581d075c']);
    expect(within(el(document, 'tr[data-oc="02be1a41"]')).getByRole('radio').getAttribute('aria-checked')).toBe('true');
    expect(within(el(document, 'tr[data-oc="02be1a41"]')).getByText('= valor')).toBeTruthy();
  });

  it('sem valor exato na 1a, nenhuma vem selecionada', () => {
    const c = candidata({ valor_exato: false, compromissos: [compromisso({ valor_exato: false })] });
    expect(candidataInicial([c], 'taxa_aquisicao', 2165.49)).toBeNull();
    /* E a busca sabe achar: a mesma, com valor exato, e' escolhida. */
    expect(candidataInicial([candidata({})], 'taxa_aquisicao', 2165.49)).toBe('02be1a41');
  });
});

describe('titulo da OC conciliado', () => {
  /* VINCULAR-FIX-01b — ESTE CASO ESPERAVA BLOQUEIO e mudou de contrato: o titulo conciliado da OC nao impede o
     vinculo, porque na pecuaria o mesmo componente se repete (outra guia, outro pagamento). A linha fica ambar,
     selecionavel, e o title diz o que ja' esta' pago. */
  it('(c) item todo pago: ambar "criar novo", selecionavel, e a simulacao segue', async () => {
    const conc = candidata({
      operacao_id: 'bb51bb9a', valor_exato: false, acao_prevista: 'usar_compromisso', todos_liquidados: true,
      compromissos: [compromisso({ id: '173a0046', componente: 'taxa_aquisicao', valor_total: 127858.12, valor_exato: false,
        acao_prevista: 'recusar', parcelas: [{ parcela_id: 'p9', sequencia: 1, valor: 127858.12, status: 'materializada',
          titulo_id: '321a1eee', titulo_status: 'realizado', titulo_cancelado: false, titulo_conciliado: true, titulo_liquidado: true }] })],
    });
    const sit = situacaoDaCandidata(conc, 'taxa_aquisicao', 2165.49);
    expect(sit).toMatchObject({ rotulo: 'criar novo', tom: 'ambar', selecionavel: true });
    expect(sit.title).toMatch(/Já existe Taxa de aquisição de R\$\s127\.858,12 liquidado nesta OC; este é outro pagamento/);

    const simular = vi.fn(() => simOk());
    responder([conc], simular);
    montar();
    await waitFor(() => expect(linha('bb51bb9a')).not.toBeNull());
    const tr = el(document, 'tr[data-oc="bb51bb9a"]');
    expect(tr.getAttribute('data-selecionavel')).toBe('sim');
    fireEvent.click(tr);
    await waitFor(() => expect(simular).toHaveBeenCalled());
  });
});

describe('escolher compromisso', () => {
  it('a RPC pede a escolha: a lista aparece sob a candidata, e a escolha vai para a simulacao', async () => {
    const simular = vi.fn((args: Record<string, unknown>) => args.p_compromisso_id
      ? simOk()
      : { ok: false, acao: 'recusado', motivo: 'escolher_compromisso', pode_criar_novo: true, operacao_versao: 11,
          compromissos: [{ id: 'cb81fe80', componente: 'taxa_aquisicao', descricao: 'Abate 070 V - Fundersul', valor_total: 2165.49, status: 'programado' }] });
    /* VINCULAR-FIX-01: sem compromisso de valor exato — com um exato, ele ja' vai escolhido e a RPC nao pergunta. */
    responder([candidata({ valor_exato: false, compromissos: [compromisso({ valor_total: 2000, valor_exato: false })] })], simular);
    montar();
    await waitFor(() => expect(linha('02be1a41')).not.toBeNull());
    fireEvent.click(el(document, 'tr[data-oc="02be1a41"]'));
    const escolha = await screen.findByTestId('vinc-escolha');
    expect(within(escolha).getByTestId('vinc-criar-novo')).toBeTruthy();
    fireEvent.click(within(escolha).getByText(/Abate 070 V - Fundersul/));
    await waitFor(() => expect(simular).toHaveBeenCalledWith(expect.objectContaining({ p_compromisso_id: 'cb81fe80', p_componente: null })));
    /* A lista continua na tela depois da escolha — o operador pode trocar. */
    expect(screen.getByTestId('vinc-escolha')).toBeTruthy();
    /* Criar novo so' por acao explicita. */
    expect(simular).not.toHaveBeenCalledWith(expect.objectContaining({ p_criar_novo: true }));
  });
});

describe('o resumo com os avisos', () => {
  it('(e) rebanho em dobro em vermelho; principal acima da base em ambar, com a diferenca', async () => {
    responder([candidata({})], () => simOk({
      compromisso: { id: '8281ba66', acao: 'ajustado', valor_anterior: 103006.06, valor_total: 106069.3 },
      titulo_substituido: { titulo_id: '2299214e', valor: 103006.06, status_transacao: 'agendado', ja_estava_cancelado: false },
      lancamento: { id: LANC, competencia_anterior: '2026-08-06', competencia_nova: '2026-09-02', hash_preservado: true,
        movimentacao_rebanho_id_solto: 'fca1f798' },
      avisos: [
        { codigo: 'movimento_duplicado', movimento_antigo: 'fca1f798', movimentos_da_oc: ['93603beb'] },
        { codigo: 'principal_diverge_da_base', base: 103006.06, soma_principal: 106069.3 },
      ],
    }));
    montar();
    const resumo = await screen.findByTestId('vinc-resumo');
    await waitFor(() => expect(within(resumo).getByText(/103\.006,06 → R\$\s106\.069,30/)).toBeTruthy());
    expect(within(resumo).getByText(/agendado · R\$\s103\.006,06 — será cancelado/)).toBeTruthy();
    expect(within(resumo).getByText(/elo solto/)).toBeTruthy();
    expect(within(resumo).getByText('mantida')).toBeTruthy();
    expect(within(resumo).getByText('1 vez')).toBeTruthy();
    const dobro = el(resumo, '[data-aviso="movimento_duplicado"]');
    expect(dobro.className).toMatch(/red/);
    expect(dobro.textContent).toMatch(/não mexe no rebanho/);
    const base = el(resumo, '[data-aviso="principal_diverge_da_base"]');
    expect(base.className).toMatch(/amber/);
    expect(base.textContent).toMatch(/3\.063,24/);
  });
});

describe('motivo e gravacao', () => {
  it('motivo vazio bloqueia; com motivo grava, avisa a lista e fecha', async () => {
    const gravar = vi.fn(() => simOk({ acao: 'vinculado', simulado: false, operacao_versao: 12 }));
    responder([candidata({})], () => simOk(), gravar);
    const { onClose, onVinculado } = montar();
    const botao = await screen.findByTestId('vinc-confirmar');
    await waitFor(() => expect(screen.getByTestId('vinc-resumo').textContent).toMatch(/Compromisso/));
    expect(botao.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByTestId('vinc-motivo'), { target: { value: '   ' } });
    expect(botao.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByTestId('vinc-motivo'), { target: { value: 'Fundersul do abate 070 pago antes da OC' } });
    expect(botao.hasAttribute('disabled')).toBe(false);
    fireEvent.click(botao);
    await waitFor(() => expect(gravar).toHaveBeenCalledWith(expect.objectContaining({
      p_simular: false, p_motivo: 'Fundersul do abate 070 pago antes da OC', p_versao_esperada: 11, p_operacao_id: '02be1a41' })));
    await waitFor(() => expect(notificar).toHaveBeenCalledWith(CLIENTE));
    expect(onClose).toHaveBeenCalled();
    expect(onVinculado).toHaveBeenCalled();
  });

  it('se a gravacao falhar, a lista NAO e avisada', async () => {
    rpc.mockImplementation(async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'oc_candidatas_vinculo') return { data: respCandidatas([candidata({})]), error: null };
      if (args.p_simular) return { data: simOk(), error: null };
      return { data: null, error: { message: 'Conflito de versao (esperada 11, atual 12)' } };
    });
    montar();
    await waitFor(() => expect(screen.getByTestId('vinc-resumo').textContent).toMatch(/Compromisso/));
    fireEvent.change(screen.getByTestId('vinc-motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('vinc-confirmar'));
    await waitFor(() => expect(rpc.mock.calls.some(c => c[1]?.p_simular === false)).toBe(true));
    expect(notificar).not.toHaveBeenCalled();
  });
});

/* ─── VINCULAR-FIX-01 ─────────────────────────────────────────────────────────────────────────────
 * Os numeros sao do proto, medidos em 25/09/2026: o Iagro 2a8562dd x OC f93f1a2b (abate, 04/08/2024,
 * Faz Baia Grande, 48 cab, BMG Foods) e a Graxaria c80ebe9e (5.056 a receber gravado como
 * `adiantamento_devolvido` no plano "Abates de Femeas", ao lado do principal ja' recebido).
 * A direcao, a janela do boitel e o hash preservado sao regra de BANCO — provados em rollback no
 * cabecalho da migration 20261027152000. Aqui se trava o que a tela faz com a resposta. */
const iagro = candidata({
  operacao_id: 'f93f1a2b', tipo_operacao: 'abate', numero_documento: null, data_operacao: '2024-08-04',
  data_referencia: '2024-08-04', fazenda_nome: 'Faz Baia Grande', qtd: 48,
  contraparte_nome: 'BMG Foods Importação e Exportação Ltda',
});
const principalRecebido = compromisso({ id: '0119442b', componente: 'principal', descricao: 'Abate 020 V', valor_total: 102311.46,
  valor_exato: false, acao_prevista: 'recusar', parcelas: [{ parcela_id: 'pp', sequencia: 1, valor: 102311.46, status: 'materializada',
    titulo_id: '3e05fd75', titulo_status: 'realizado', titulo_cancelado: false, titulo_conciliado: true, titulo_liquidado: true }] });
const graxaria = compromisso({ id: '73a183eb', componente: 'adiantamento_devolvido', descricao: 'Abate 020 V - Graxaria',
  valor_total: 5056, valor_exato: true, acao_prevista: 'preencher', mesmo_subcentro: true, parcelas: [] });

describe('VINCULAR-FIX-01 — a linha da candidata', () => {
  it('data · tipo · fazenda pelo nome · cab · contraparte, sem "OC de"', async () => {
    expect(linhaDaCandidata(iagro)).toBe('04/08/2024 · Abate · Faz Baia Grande · 48 cab · BMG Foods Importação e Exportação Ltda');
    responder([iagro], () => simOk());
    montar();
    const cel = await screen.findByTestId('vinc-linha');
    expect(cel.textContent).toBe(linhaDaCandidata(iagro));
    expect(cel.textContent).not.toMatch(/OC de/);
    /* O rotulo antigo continua valendo onde o briefing mandou mantê-lo (botao, toast, Desvincular). */
    expect(rotuloOC(iagro)).toBe('OC de 04/08/2024');
  });

  it('venda em boitel diz Boitel; ausencia vira "—", nunca some', () => {
    expect(linhaDaCandidata({ ...iagro, tipo_operacao: 'venda', eh_boitel: true, qtd: null, fazenda_nome: null }))
      .toBe('04/08/2024 · Boitel · — · — · BMG Foods Importação e Exportação Ltda');
  });
});

describe('VINCULAR-FIX-01 — compromisso a compromisso', () => {
  it('Graxaria: o exato de OUTRO componente no mesmo subcentro vence, vai escolhido e segue para a simulacao', async () => {
    const oc = candidata({ operacao_id: 'c80ebe9e', valor_exato: true, todos_liquidados: false,
      compromissos: [graxaria, principalRecebido] });
    /* o item e' 'principal' (o unico do subcentro no mapa) — e ele esta' pago */
    expect(situacaoDaCandidata(oc, 'principal', 5056)).toMatchObject({ rotulo: '= valor', tom: 'verde', selecionavel: true });
    const simular = vi.fn(() => simOk());
    responder([oc], simular);
    montar();
    await waitFor(() => expect(simular).toHaveBeenCalledWith(expect.objectContaining({ p_compromisso_id: '73a183eb', p_componente: null })));
    expect(el(document, 'tr[data-oc="c80ebe9e"]').textContent).toMatch(/Abate 020 V - Graxaria/);
  });

  /* VINCULAR-FIX-01b — ESTE CASO ESPERAVA BLOQUEIO quando TODOS os compromissos estavam pagos; agora nada bloqueia. */
  it('pago nunca bloqueia: com outro livre ou com todos pagos, a candidata e\' ambar "criar novo" e selecionavel', () => {
    const livre = compromisso({ id: 'k2', componente: 'adiantamento_devolvido', valor_total: 4000, valor_exato: false, acao_prevista: 'preencher' });
    const umPago = candidata({ valor_exato: false, todos_liquidados: false, compromissos: [principalRecebido, livre] });
    expect(situacaoDaCandidata(umPago, 'principal', 5056)).toMatchObject({ rotulo: 'criar novo', tom: 'ambar', selecionavel: true });
    const todosPagos = candidata({ valor_exato: false, todos_liquidados: true, compromissos: [principalRecebido] });
    expect(situacaoDaCandidata(todosPagos, 'principal', 5056)).toMatchObject({ rotulo: 'criar novo', tom: 'ambar', selecionavel: true });
  });
});

/* VINCULAR-FIX-01b — a regra da pecuaria: mesmo nome, mesmo valor e mesmo dia e' NORMAL. */
const iagroPago = compromisso({ id: 'f8cd2eb1', componente: 'taxas_impostos', descricao: 'Abate 048 vacas - Fundersul', valor_total: 541.84,
  valor_exato: false, acao_prevista: 'recusar', parcelas: [{ parcela_id: 'pf', sequencia: 1, valor: 541.84, status: 'materializada',
    titulo_id: 'tf', titulo_status: 'realizado', titulo_cancelado: false, titulo_conciliado: true, titulo_liquidado: true }] });

describe('VINCULAR-FIX-01b — regra (c): criar compromisso novo, com aviso e sem bloqueio', () => {
  it('Iagro 2a8562dd x f93f1a2b: Fundersul 541,84 pago -> ambar, simula criando, o resumo avisa e o Vincular grava', async () => {
    const oc = candidata({ ...iagro, valor_exato: false, todos_liquidados: true, compromissos: [iagroPago] });
    expect(situacaoDaCandidata(oc, 'taxas_impostos', 277.68)).toMatchObject({ rotulo: 'criar novo', tom: 'ambar', selecionavel: true });
    const aviso = { codigo: 'componente_ja_liquidado' as const, componente: 'taxas_impostos',
      compromissos: [{ id: 'f8cd2eb1', valor_total: 541.84, descricao: 'Abate 048 vacas - Fundersul' }] };
    const simular = vi.fn(() => simOk({ compromisso: { id: 'novo', acao: 'criado', valor_anterior: 0, valor_total: 277.68 }, avisos: [aviso] }));
    const gravar = vi.fn(() => simOk({ compromisso: { id: 'novo', acao: 'criado', valor_anterior: 0, valor_total: 277.68 }, avisos: [aviso] }));
    responder([oc], simular, gravar);
    const { onVinculado } = montar();
    await waitFor(() => expect(linha('f93f1a2b')).not.toBeNull());
    fireEvent.click(el(document, 'tr[data-oc="f93f1a2b"]'));
    const resumo = await screen.findByTestId('vinc-resumo');
    const a = await waitFor(() => el(resumo, '[data-aviso="componente_ja_liquidado"]'));
    expect(a.className).toMatch(/amber/);
    expect(a.textContent).toMatch(/Já existe Taxas e Impostos de R\$\s541,84 liquidado nesta OC; este é outro pagamento/);
    fireEvent.change(screen.getByTestId('vinc-motivo'), { target: { value: 'outra guia do Iagro' } });
    fireEvent.click(screen.getByTestId('vinc-confirmar'));
    await waitFor(() => expect(gravar).toHaveBeenCalled());
    await waitFor(() => expect(onVinculado).toHaveBeenCalled());
  });

  it('tres iguais: os tres titulos do mesmo valor e dia no mesmo item nao viram "repetição" — o proximo e\' outro pagamento', () => {
    const igual = (id: string) => compromisso({ id, componente: 'taxas_impostos', valor_total: 277.68, valor_exato: true, acao_prevista: 'recusar' });
    /* dois iguais ja' pagos: o terceiro, de mesmo valor, nao e' exato "livre" nem bloqueado — cria */
    const oc = candidata({ ...iagro, valor_exato: false, compromissos: [igual('a'), igual('b')] });
    const sit = situacaoDaCandidata(oc, 'taxas_impostos', 277.68);
    expect(sit).toMatchObject({ rotulo: 'criar novo', tom: 'ambar', selecionavel: true });
    expect(sit.title).toMatch(/277,68 \+ R\$\s277,68/);
    /* e com um livre do mesmo valor, ele vai primeiro */
    const comLivre = candidata({ ...iagro, compromissos: [igual('a'), compromisso({ id: 'c', componente: 'taxas_impostos', valor_total: 277.68,
      valor_exato: true, acao_prevista: 'preencher', parcelas: [] })] });
    expect(situacaoDaCandidata(comLivre, 'taxas_impostos', 277.68)).toMatchObject({ rotulo: '= valor', tom: 'verde' });
  });
});
