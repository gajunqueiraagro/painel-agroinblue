import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * FIN-IMPORT-EXCEL-STATUS-01a — o importador de planilha, de ponta a ponta: a PÁGINA real, o HOOK real e a prévia real;
 * mocados só o banco, os contextos, o leitor do arquivo e o gravador (`criarLancamentoComId`), que é onde se lê o payload.
 *
 * ⚠ O QUE ISTO PROTEGE: a planilha de previsões do NJ (05/10/2026) entrou com 226 linhas "realizadas" sem data de
 * pagamento. Linha sem data aparece na prévia com o motivo e NÃO CHEGA ao gravador; linha com data entra como sempre.
 */
const banco = vi.hoisted(() => ({
  planilha: [] as unknown[],
  criar: [] as Array<{ form: Record<string, unknown>; opts: Record<string, unknown> }>,
  editar: [] as Array<{ id: string; form: Record<string, unknown> }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  /* Toda consulta devolve vazio: nenhum lançamento existente, nenhum mês fechado, nenhum apelido. */
  const vazio = { data: [], error: null, count: 0 };
  const construtor = (): unknown => new Proxy(() => undefined, {
    get: (_t, p) => (p === 'then'
      ? (ok: (v: typeof vazio) => unknown) => Promise.resolve(vazio).then(ok)
      : () => construtor()),
  });
  return {
    supabase: {
      from: () => construtor(),
      rpc: (fn: string) => Promise.resolve(fn === 'fn_classificacao_depara_resolver'
        ? { data: {
            subcentro: { COMBUSTIVEL: { valor: 'Diesel', origem: 'alias', rotulo: 'Diesel' } },
            fazenda: { SR: { valor: 'faz-1', origem: 'cadastro', rotulo: 'Santa Rita' } },
          }, error: null }
        : { data: null, error: null }),
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'teste', nome: 'Teste' } }) }));
const fazendas = vi.hoisted(() => [{ id: 'faz-1', nome: 'Santa Rita' }]);
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas }) }));
/* ⚠ IDENTIDADES ESTÁVEIS: o hook tem efeitos que dependem destas funções e listas; criar novas a cada render giraria em laço. */
const fin = vi.hoisted(() => ({
  classificacoes: [{ subcentro: 'Diesel', macro_custo: 'Custeio Produção', grupo_custo: 'Custos', centro_custo: 'Máquinas' }],
  fornecedores: [], contasBancarias: [], safras: [],
  loadClassificacoes: () => {}, loadFornecedores: () => {}, loadContas: () => {}, loadSafras: () => {},
  criarFornecedor: async () => null,
}));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({
    ...fin,
    criarLancamentoComId: async (form: Record<string, unknown>, opts: Record<string, unknown>) => {
      banco.criar.push({ form, opts });
      return `novo-${banco.criar.length}`;
    },
    editarLancamento: async (id: string, form: Record<string, unknown>) => { banco.editar.push({ id, form }); return true; },
  }),
}));
vi.mock('@/v2/lib/excelPreview/parserLancamentos', async (original) => ({
  ...(await original<typeof import('@/v2/lib/excelPreview/parserLancamentos')>()),
  parseExcelLancamentos: async () => ({
    rows: banco.planilha, totalLinhas: banco.planilha.length, linhasValidas: banco.planilha.length, linhasComErro: 0,
    erros: [], nomeSheet: 'Plan1', colunaPlanoDetectada: 'Conta', linhaCabecalho: 1, linhasTestadas: 1,
  }),
}));
vi.mock('@/v2/lib/importLanc/persistirApelidos', () => ({
  persistirApelidos: async () => ({ subcentro: 0, fornecedor: 0, conta: 0, fazenda: 0, safra: 0, erros: [] }),
  mapaDeRepontamento: () => new Map(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { V2ImportLancamentosExcel } from './V2ImportLancamentosExcel';

const linha = (n: number, over: Partial<LancamentoExcelRow>): LancamentoExcelRow => ({
  linha: n, data_competencia: '2026-09-15', valor: 100 * n, tipo_operacao: '2-Saídas',
  conta_plano_texto: 'COMBUSTIVEL', fazenda_texto: 'SR', fornecedor_texto: null,
  conta_bancaria_texto: null, data_vencimento: '2026-09-20', data_pagamento: '2026-09-22',
  descricao: `Diesel ${n}`, numero_documento: `NF ${n}`, tipo_documento: null, forma_pagamento: 'PIX',
  observacao: null, status: null, safra_texto: null, id_lancamento: null,
  ...over,
} as LancamentoExcelRow);

/** O payload que o importador SEMPRE mandou para uma linha com data de pagamento (o do commit publicado). */
const payloadDeHoje = (n: number, status: string) => ({
  fazenda_id: 'faz-1', conta_bancaria_id: null, conta_destino_id: null,
  data_competencia: '2026-09-15', data_pagamento: '2026-09-22', data_vencimento: '2026-09-20',
  valor: 100 * n, tipo_operacao: '2-Saídas', status_transacao: status,
  descricao: `Diesel ${n}`, observacao: undefined, numero_documento: `NF ${n}`, tipo_documento: null,
  forma_pagamento: 'PIX', favorecido_id: null, subcentro: 'Diesel',
  macro_custo: 'Custeio Produção', grupo_custo: 'Custos', centro_custo: 'Máquinas', safra_id: null,
});

const arquivo = () => new File(['x'], 'previsoes.xlsx');
async function abrir(planilha: LancamentoExcelRow[]) {
  banco.planilha = planilha;
  render(<V2ImportLancamentosExcel arquivoInicial={arquivo()} />);
  /* a prévia só está pronta depois de o de-para do banco responder (subcentro e fazenda resolvidos) */
  await waitFor(() => expect(screen.getAllByTestId('linha-previa').length).toBe(planilha.length));
  await waitFor(() => expect(screen.queryByText(/Conta do plano ainda não mapeada/)).toBeNull());
}
const botao = () => screen.getByRole('button', { name: /^(Importar|Confirmar|Ver resultado|Gravando)/ });
async function importar() {
  fireEvent.click(botao());
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e criar' }));
  /* o modal de progresso abre por cima e esconde a página da árvore de acessibilidade: `hidden` a alcança */
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver resultado', hidden: true })).toBeTruthy());
}

beforeEach(() => {
  banco.criar = []; banco.editar = [];
  Element.prototype.scrollIntoView = () => {};
});

describe('planilha de 5 linhas: 3 com data de pagamento, 2 sem', () => {
  const PLANILHA = [
    linha(2, {}), linha(3, {}),
    linha(4, { data_pagamento: null }),
    linha(5, {}),
    linha(6, { data_pagamento: null, status: 'realizado' }),
  ];

  it('a prévia diz quantas não serão importadas, a soma, e marca cada uma com o motivo', async () => {
    await abrir(PLANILHA);
    const faixa = screen.getByTestId('fora-sem_data_pagamento');
    expect(faixa.textContent).toContain('2 linhas sem data de pagamento não serão importadas — previsão do mês ainda não entra por esta tela.');
    /* linhas 4 e 6: 400 + 600 */
    expect(faixa.textContent).toMatch(/2 · R\$\s1\.000,00/);
    expect(screen.getAllByText(/⚠ Sem data de pagamento/).length).toBe(2);
    /* cada linha diz o que vai acontecer com ela: três entram, duas ficam de fora com o motivo */
    expect(screen.getAllByTestId('linha-previa').map((tr) => /Sem data de pagamento/.test(tr.textContent ?? '')))
      .toEqual([false, false, true, false, true]);
  });

  it('o botão conta o que VAI ser gravado, de quantas', async () => {
    await abrir(PLANILHA);
    /* criações nascem desmarcadas: nada a gravar, botão apagado com o motivo ao lado */
    expect(botao().textContent).toContain('Importar 0 de 5');
    expect(botao()).toHaveProperty('disabled', true);
    expect(screen.getByText(/nenhuma criação aprovada/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Marcar todas'));
    expect(botao().textContent).toContain('Importar 3 de 5');
    expect(botao()).toHaveProperty('disabled', false);
  });

  it('grava 3, recusa 2, e o payload das 3 é o de sempre', async () => {
    await abrir(PLANILHA);
    fireEvent.click(screen.getByLabelText('Marcar todas'));
    await importar();
    expect(banco.criar.length).toBe(3);
    expect(banco.editar.length).toBe(0);
    expect(banco.criar.map((c) => c.form)).toEqual([payloadDeHoje(2, 'realizado'), payloadDeHoje(3, 'realizado'), payloadDeHoje(5, 'realizado')]);
    for (const c of banco.criar) expect(c.opts.origem).toBe('excel');
    /* NENHUM payload sem data de pagamento chegou ao gravador — e a busca sabe achar: há payloads */
    expect(banco.criar.filter((c) => !c.form.data_pagamento).length).toBe(0);
    expect(banco.criar.every((c) => c.form.status_transacao === 'realizado' && !!c.form.data_pagamento)).toBe(true);
  });
});

describe('planilha só de previsões: nenhuma linha com data de pagamento', () => {
  it('nada a importar: botão apagado, com o motivo da contenção escrito', async () => {
    await abrir([linha(2, { data_pagamento: null }), linha(3, { data_pagamento: null, status: 'realizado' })]);
    expect(botao().textContent).toContain('Importar 0 de 2');
    expect(botao()).toHaveProperty('disabled', true);
    expect(screen.getByText(/nenhuma linha com data de pagamento — previsão do mês ainda não entra por esta tela/)).toBeTruthy();
    /* não há criação a aprovar: a faixa de aprovação nem aparece */
    expect(screen.queryByLabelText('Marcar todas')).toBeNull();
    expect(banco.criar.length).toBe(0);
  });
});

describe('planilha só com datas (o fechamento do mês): tudo como antes', () => {
  const FECHAMENTO = [linha(2, {}), linha(3, { status: 'realizado' }), linha(4, {})];
  it('nenhuma recusada; grava as 3 com o payload de sempre', async () => {
    await abrir(FECHAMENTO);
    expect(screen.queryByTestId('fora-sem_data_pagamento')).toBeNull();
    fireEvent.click(screen.getByLabelText('Marcar todas'));
    expect(botao().textContent).toContain('Importar 3 de 3');
    await importar();
    expect(banco.criar.map((c) => c.form)).toEqual([payloadDeHoje(2, 'realizado'), payloadDeHoje(3, 'realizado'), payloadDeHoje(4, 'realizado')]);
  });
  it('linha "a pagar" com data: fica de fora com o motivo próprio, e as outras entram', async () => {
    await abrir([linha(2, {}), linha(3, { status: 'previsto' })]);
    const faixa = screen.getByTestId('fora-a_pagar_com_data');
    expect(within(faixa).getByText(/1 linha "a pagar" com data de pagamento não será importada/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Marcar todas'));
    expect(botao().textContent).toContain('Importar 1 de 2');
    await importar();
    expect(banco.criar.map((c) => c.form)).toEqual([payloadDeHoje(2, 'realizado')]);
  });
});

/* ⚠ O DEFAULT NÃO VOLTA. Com a prévia recusando, um `?? 'realizado'` de volta no gravador não derruba nenhum caso acima
   (a linha sem data nem chega lá) — por isso a fonte é lida: o status só pode vir de `statusAGravar`. */
describe('o gravador não tem default de status', () => {
  const fonte = readFileSync(resolve(__dirname, '../hooks/useImportLancamentosExcel.ts'), 'utf8');
  it("nenhum `?? 'realizado'` nem `|| 'realizado'` no hook", () => {
    expect(fonte).not.toMatch(/(\?\?|\|\|)\s*'realizado'/);
    /* a busca sabe achar: o mesmo padrão casa o texto do defeito */
    expect("status_transacao: l.row.status ?? 'realizado',").toMatch(/(\?\?|\|\|)\s*'realizado'/);
  });
  it('o status do payload vem do campo decidido pelo dono, e sem ele a linha não grava', () => {
    expect(fonte).toContain('status_transacao: l.statusAGravar,');
    expect(fonte).toContain('if (l.statusAGravar === null) continue;');
  });
});
