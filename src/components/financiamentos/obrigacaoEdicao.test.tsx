import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * PARC-OBRIGACAO-EDICAO-01a — "Editar obrigação" mostra o que salvou e não descarta em silêncio.
 *
 * A PÁGINA de detalhe (com o `saveEdit` real) e o DIÁLOGO real; mocados o banco, os contextos e as peças vizinhas que não
 * são deste PR (credor, destinações, baixa de parcela).
 * ⚠ NASCE DO CASO DA VERA (contrato 4f53db54, 05/10/2026): editou, salvou, reabriu e viu o valor antigo — o diálogo lia
 * uma cópia velha do cache, e salvar de novo regravava o velho por cima.
 */
type Linha = Record<string, unknown>;
const banco = vi.hoisted(() => ({
  contrato: {} as Record<string, unknown>,
  parcelas: [] as Array<Record<string, unknown>>,
  lancs: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ tabela: string; payload: Record<string, unknown> }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  leituras: [] as string[],
  /** `true` = o UPDATE do contrato não altera o que a leitura devolve (para isolar o que a tela faz com o cache). */
  toasts: [] as string[],
  /** o que `fn_financiamento_situacao` devolve (a leitura do detalhe do contrato) */
  situacao: null as unknown,
  /** a recusa que a RPC devolve (nulo = aceita) */
  erroRpc: null as string | null,
  /** a ordem das escritas: 'rpc:<fn>' e 'update:<tabela>' */
  ordem: [] as string[],
  /** PARC-CONTRATO-01 item 2 — o que a prévia de `fn_parcelamento_propagar` devolve, e as prévias pedidas (não são escrita) */
  propagar: null as unknown,
  previas: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const tabela = (t: string, op: { tipo: 'select' | 'update' | 'insert'; payload?: Record<string, unknown> }) => {
    if (op.tipo === 'update') {
      banco.updates.push({ tabela: t, payload: op.payload ?? {} }); banco.ordem.push(`update:${t}`);
      if (t === 'financiamentos') banco.contrato = { ...banco.contrato, ...(op.payload ?? {}) };
      return null;
    }
    if (op.tipo === 'insert') return null;
    banco.leituras.push(t);
    switch (t) {
      case 'financiamentos': return { ...banco.contrato };
      case 'financiamento_parcelas': return banco.parcelas.map((p) => ({ ...p }));
      case 'financeiro_lancamentos_v2': return banco.lancs.map((l) => ({ ...l }));
      case 'financeiro_safras': return [
        { id: 'safra-pec', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', ativa: true, escopo_negocio: 'pecuaria' },
        { id: 'safra-pec-25', nome: 'Safra 25/26 Pecuária', codigo: '25/26-Pec', ativa: true, escopo_negocio: 'pecuaria' },
      ];
      case 'financeiro_contas_bancarias': return [{ id: 'conta-1', nome_conta: 'Banco A', nome_exibicao: 'Banco A', banco: 'A', tipo_conta: 'cc', ativa: true }];
      case 'fazendas': return { id: 'faz-adm' };
      case 'financeiro_plano_contas': return [
        { id: 'plano-amort-pec', subcentro: 'Amortização Financiamento Pecuária', centro_custo: 'Financiamentos', macro_custo: 'Saída Financeira' },
        { id: 'plano-capt', subcentro: 'Captação Pecuária', centro_custo: 'Captação', macro_custo: 'Entrada Financeira' },
        { id: 'plano-semen', subcentro: 'Sêmen e IATF', centro_custo: 'Reprodução', macro_custo: 'Custeio Produção' },
      ];
      default: return [];
    }
  };
  const construtor = (t: string) => {
    const op: { tipo: 'select' | 'update' | 'insert'; payload?: Record<string, unknown> } = { tipo: 'select' };
    let um = false;
    const p: unknown = new Proxy(() => undefined, {
      get: (_alvo, nome) => {
        if (nome === 'then') {
          return (ok: (v: { data: unknown; error: null; count: number }) => unknown) => {
            const r = tabela(t, op);
            const data = um && Array.isArray(r) ? (r[0] ?? null) : r;
            return Promise.resolve({ data, error: null, count: Array.isArray(r) ? r.length : 0 }).then(ok);
          };
        }
        return (...args: unknown[]) => {
          if (nome === 'update') { op.tipo = 'update'; op.payload = args[0] as Record<string, unknown>; }
          if (nome === 'insert') { op.tipo = 'insert'; op.payload = args[0] as Record<string, unknown>; }
          if (nome === 'single' || nome === 'maybeSingle') um = true;
          return p;
        };
      },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn === 'fn_financiamento_situacao') return Promise.resolve({ data: banco.situacao, error: null });
        if (fn === 'fn_parcelamento_propagar' && args.p_simular === true) {
          banco.previas.push(args);
          return Promise.resolve({ data: banco.propagar, error: null });
        }
        banco.rpcs.push({ fn, args }); banco.ordem.push(`rpc:${fn}`);
        if (fn === 'fn_parcelamento_propagar') return Promise.resolve(banco.erroRpc ? { data: null, error: { message: banco.erroRpc } } : { data: { ...(banco.propagar as object), gravadas: 3 }, error: null });
        return Promise.resolve(banco.erroRpc ? { data: null, error: { message: banco.erroRpc } } : { data: 'novo-id', error: null });
      },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
/* o modal do Financeiro é outro mundo (catálogos, hooks): aqui só interessa QUAL lançamento a tela mandou abrir */
vi.mock('@/components/financiamentos/LancamentoDaParcelaDialog', () => ({
  LancamentoDaParcelaDialog: ({ lancamentoId }: { lancamentoId: string | null }) => (lancamentoId ? <div data-testid="modal-do-financeiro">{lancamentoId}</div> : null),
}));
const ctxFazenda = vi.hoisted(() => ({
  fazendas: [{ id: 'faz-1', nome: 'Faz. 3 Muchachas' }, { id: 'faz-adm', nome: 'Administrativo' }],
  fazendaAtual: { id: 'faz-1', nome: 'Faz. 3 Muchachas' },
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ctxFazenda }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
const culturas = vi.hoisted(() => [] as string[]);
vi.mock('@/hooks/useAreaPlantada', () => ({ useCulturasDaSafra: () => culturas }));
const CLASSIFICACOES = vi.hoisted(() => [
  { id: 'plano-semen', subcentro: 'Sêmen e IATF', macro_custo: 'Custeio Produção', grupo_custo: 'Custos Variáveis', centro_custo: 'Reprodução', escopo_negocio: 'pecuaria', tipo_operacao: '2-Saídas' },
  { id: 'plano-sal', subcentro: 'Sal Mineral', macro_custo: 'Custeio Produção', grupo_custo: 'Custos Variáveis', centro_custo: 'Nutrição', escopo_negocio: 'pecuaria', tipo_operacao: '2-Saídas' },
]);
vi.mock('@/lib/financeiro/planoContasBuilder', () => ({
  loadPlanoContasCompleto: async () => [],
  planoToClassificacoes: () => CLASSIFICACOES,
}));
vi.mock('@/components/financiamentos/CredorAutocomplete', () => ({ CredorAutocomplete: () => <div data-testid="credor" /> }));
vi.mock('@/components/financiamentos/DestinacoesForm', () => ({ DestinacoesForm: () => <div data-testid="destinacoes" /> }));
vi.mock('@/components/financiamentos/ModalBaixaParcela', () => ({ default: () => null }));
vi.mock('@/components/financiamentos/DialogVerLancamentosOficiais', () => ({ default: () => null }));
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => { banco.toasts.push(m); }, error: (m: string) => { banco.toasts.push(`ERRO ${m}`); },
    info: (m: string) => { banco.toasts.push(m); },
  },
}));

import FinanciamentoDetalhe from '@/pages/FinanciamentoDetalhe';
import { ObrigacaoDialog } from './ObrigacaoDialog';

const PARCELAMENTO = () => ({
  id: 'ctr-1', cliente_id: 'cli', natureza: 'parcelamento', descricao: 'Protocolo IATF', numero_contrato: null,
  tipo_financiamento: 'pecuaria', credor_id: 'forn-1', conta_bancaria_id: 'conta-1', valor_total: 16238, valor_entrada: 0,
  taxa_juros_mensal: 0, data_contrato: '2026-09-10', data_primeira_parcela: '2026-10-10', total_parcelas: 2,
  observacao: null, status: 'ativo', gerar_lancamento_captacao: false, plano_conta_captacao_id: null,
  plano_conta_parcela_id: 'plano-semen', fazenda_id: 'faz-1', lancamento_captacao_id: null,
});
const FINANCIAMENTO = (natureza: 'financiamento' | 'emprestimo') => ({
  ...PARCELAMENTO(), natureza, descricao: natureza === 'financiamento' ? 'Trator' : 'Capital de giro',
  taxa_juros_mensal: 1, plano_conta_parcela_id: 'plano-amort-pec', plano_conta_captacao_id: 'plano-capt',
  gerar_lancamento_captacao: false, fazenda_id: 'faz-adm', numero_contrato: 'C-9',
});
const PARCELAS = () => [1, 2].map((n) => ({
  id: `par-${n}`, financiamento_id: 'ctr-1', numero_parcela: n, data_vencimento: `2026-1${n - 1}-10`,
  valor_principal: 8119, valor_juros: 0, status: 'pendente', data_pagamento: null, observacao: null,
  lancamento_id: `lanc-${n}`, lancamento_juros_id: null,
}));
const LANCS = (over: Array<Record<string, unknown>> = [{}, {}]) => over.map((o, i) => ({
  id: `lanc-${i + 1}`, financiamento_id: 'ctr-1', cancelado: false, safra_id: 'safra-pec', cultura: null, fase: 'cria',
  forma_pagamento: 'Boleto', ...o,
}));

/** A leitura do banco para o contrato de teste: duas parcelas, nenhuma paga (o formato de `fn_financiamento_situacao`). */
const SITUACAO = (over: Array<Record<string, unknown>> = [{}, {}], cartoes: Record<string, unknown> = {}) => ({
  financiamento_id: 'ctr-1', natureza: 'parcelamento', hoje: '2026-10-06',
  parcelas: over.map((o, i) => ({
    id: `par-${i + 1}`, numero: i + 1, data_vencimento: `2026-1${i}-10`, valor_principal: 8119, valor_juros: 0, valor_total: 8119,
    situacao: 'pendente', pago_em: null, valor_pago: 0, lancamento_id: `lanc-${i + 1}`, lancamento_juros_id: null,
    lancamento_status: 'programado', juros_status: null, fonte: 'lancamento', diverge: false, ...o,
  })),
  cartoes: { valor_contrato: 16238, pago: 0, a_vencer: 16238, vencido: 0, pagas: 0, parcelas: over.length, juros_previstos: 0,
    soma_principal: 16238, soma_total: 16238, divergentes: 0, ...cartoes },
});

/** a prévia do banco: por padrão NADA muda nas parcelas (o diálogo de escopo não abre) */
const PREVIA = (o: Record<string, unknown> = {}) => ({
  ok: true, escopo: 'todos', simulado: true, parcelas: { nao_pagas: 2, pagas: 0 }, nome_proprio: { nao_pagas: 0, pagas: 0 },
  campos: [], alteradas: { futuros: 0, todos: 0 }, gravadas: 0, ...o,
});

let qc: QueryClient;
const novoQc = (staleTime: number) => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
const montarDetalhe = () => render(<QueryClientProvider client={qc}><FinanciamentoDetalhe id="ctr-1" /></QueryClientProvider>);
const abrirEdicao = async () => {
  /* o botão dos Dados do contrato é o primeiro; as linhas da grade de parcelas têm o seu */
  await screen.findByTestId('dados-do-contrato');
  fireEvent.click(screen.getAllByRole('button', { name: /^Editar$/ })[0]);
  await screen.findByText('Editar obrigação');
};
const campoDescricao = () => screen.getByPlaceholderText('Ex: Custeio safra 2025') as HTMLInputElement;
const irParaAba = async (nome: string) => {
  const aba = screen.getByRole('tab', { name: new RegExp(nome) });
  fireEvent.mouseDown(aba); fireEvent.click(aba);
  await waitFor(() => expect(aba.getAttribute('data-state')).toBe('active'));
};
const updatesDoContrato = () => banco.updates.filter((u) => u.tabela === 'financiamentos');

beforeEach(() => {
  cleanup();
  banco.contrato = PARCELAMENTO(); banco.parcelas = PARCELAS(); banco.lancs = LANCS();
  banco.propagar = PREVIA(); banco.previas = [];
  banco.updates = []; banco.rpcs = []; banco.leituras = []; banco.toasts = []; banco.erroRpc = null; banco.ordem = [];
  banco.situacao = SITUACAO();
  qc = novoQc(0);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

/* ── A FOTO DO DIÁLOGO — provas 6 e 7 ────────────────────────────────────────────────────────────────────────────────────
   `OBRIG_FOTO=gravar` escreve o HTML do diálogo (rodado no commit publicado); sem a variável, o teste COMPARA com o gravado.
   Financiamento e empréstimo, em criação e em edição, não podem mudar um byte; a criação de parcelamento também não. */
const ARQ_FOTOS = resolve(__dirname, 'obrigacaoDialog.fotos.json');
const limpar = (html: string) => html.replace(/radix-:r[0-9a-z]+:/g, 'radix-ID').replace(/:r[0-9a-z]+:/g, ':ID:');
/** A foto guardada é o md5 e o tamanho do HTML (o HTML inteiro pesaria ~270 KB no repositório). */
async function conferirFoto(nome: string) {
  /* ⚠ A FOTO É DO DIÁLOGO ASSENTADO: com a suíte inteira rodando, uma resposta de catálogo ainda chegava depois do
     `isFetching === 0` e a foto saía um render antes. Espera-se o React terminar o que tem na fila. */
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  const html = limpar(document.body.innerHTML);
  const foto = { md5: createHash('md5').update(Buffer.from(html, 'utf8')).digest('hex'), bytes: Buffer.byteLength(html, 'utf8') };
  const todas: Record<string, { md5: string; bytes: number }> = existsSync(ARQ_FOTOS) ? JSON.parse(readFileSync(ARQ_FOTOS, 'utf8')) : {};
  if (process.env.OBRIG_FOTO === 'gravar') { todas[nome] = foto; writeFileSync(ARQ_FOTOS, JSON.stringify(todas, null, 1)); return; }
  expect(foto.bytes).toBeGreaterThan(2000);
  expect(foto).toEqual(todas[nome]);
}
const montarCriacao = () => render(<QueryClientProvider client={qc}><ObrigacaoDialog open onOpenChange={() => {}} /></QueryClientProvider>);
const escolherNatureza = async (rotulo: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${rotulo}`) }));
};

describe('foto do diálogo — o que NÃO pode mudar', () => {
  for (const natureza of ['financiamento', 'emprestimo'] as const) {
    it(`edição de ${natureza}: as três abas idênticas ao commit publicado`, async () => {
      banco.contrato = FINANCIAMENTO(natureza); banco.lancs = [];
      montarDetalhe();
      await abrirEdicao();
      await waitFor(() => expect(campoDescricao().value).toBe(natureza === 'financiamento' ? 'Trator' : 'Capital de giro'));
      await waitFor(() => expect(screen.queryByText(/Pendência:/)).toBeNull());
      await conferirFoto(`edicao-${natureza}-contrato`);
      await irParaAba('Parcelas'); await conferirFoto(`edicao-${natureza}-parcelas`);
      await irParaAba('Classificação'); await conferirFoto(`edicao-${natureza}-classificacao`);
    });
  }
  for (const [natureza, rotulo] of [['parcelamento', 'Parcelamento'], ['financiamento', 'Financiamento'], ['emprestimo', 'Empréstimo']] as const) {
    it(`criação de ${natureza}: as três abas idênticas ao commit publicado`, async () => {
      montarCriacao();
      await screen.findByText('Nova obrigação');
      await escolherNatureza(rotulo);
      await waitFor(() => expect(qc.isFetching()).toBe(0));
      await conferirFoto(`criacao-${natureza}-contrato`);
      await irParaAba('Parcelas'); await conferirFoto(`criacao-${natureza}-parcelas`);
      await irParaAba('Classificação'); await conferirFoto(`criacao-${natureza}-classificacao`);
    });
  }
});

const salvar = async () => {
  const b = screen.getByRole('button', { name: 'Salvar alterações' });
  await waitFor(() => expect(b).toHaveProperty('disabled', false));
  fireEvent.click(b);
  /* o salvar fecha o diálogo (`onSalvo`) */
  await waitFor(() => expect(screen.queryByText('Editar obrigação')).toBeNull());
};
const pronto = async () => {
  await waitFor(() => expect(campoDescricao().value).not.toBe(''));
  await waitFor(() => expect(qc.isFetching()).toBe(0));
};

describe('prova 1 — salvar, fechar e reabrir mostra o que foi salvo', () => {
  /* ⚠ `staleTime: Infinity` ISOLA A INVALIDAÇÃO: com ele o react-query não refaz a busca ao remontar; só a invalidação do
     `saveEdit` tira a cópia velha do caminho. É o cenário do defeito com o cache antigo presente. */
  it('com o cache antigo no QueryClient, a reabertura mostra a descrição NOVA', async () => {
    qc = novoQc(Infinity);
    montarDetalhe();
    await abrirEdicao(); await pronto();
    expect(campoDescricao().value).toBe('Protocolo IATF');
    fireEvent.change(campoDescricao(), { target: { value: 'Protocolo IATF 2026' } });
    await salvar();
    expect(updatesDoContrato().at(-1)?.payload.descricao).toBe('Protocolo IATF 2026');
    await abrirEdicao(); await pronto();
    expect(campoDescricao().value).toBe('Protocolo IATF 2026');
    /* e salvar de novo, sem tocar, NÃO regrava o valor velho por cima */
    await salvar();
    expect(updatesDoContrato().at(-1)?.payload.descricao).toBe('Protocolo IATF 2026');
  });

  /* A outra metade: mesmo SEM invalidação de ninguém (gravação por outra tela), o form não é semeado com a cópia do cache
     enquanto a busca nova corre. */
  it('cópia velha no cache e banco novo: o form espera a busca e nasce com o valor do banco', async () => {
    qc.setQueryData(['obrigacao-edicao', 'ctr-1'], { ...PARCELAMENTO(), descricao: 'COPIA VELHA DO CACHE' });
    montarDetalhe();
    await abrirEdicao(); await pronto();
    expect(campoDescricao().value).toBe('Protocolo IATF');
  });
});

describe('prova 2 — abrir um parcelamento não zera a classificação', () => {
  it('a conta do contrato fica no form, a pendência não acende, e o cluster mostra conta e atividade', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(screen.queryByText(/Pendência:/)).toBeNull());
    expect(screen.queryByText(/Escolha a classificação da parcela/)).toBeNull();
    expect(screen.queryByText(/pendência/)).toBeNull();
    await irParaAba('Classificação');
    expect(screen.getByRole('button', { name: 'Pecuária' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText(/Sêmen e IATF/).length).toBeGreaterThan(0);
    expect(screen.getByText('Reprodução')).toBeTruthy();   // Centro, no resumo dos derivados do cluster
    await salvar();
    expect(updatesDoContrato().at(-1)?.payload.plano_conta_parcela_id).toBe('plano-semen');
  });
});

describe('prova 2b — conta do contrato que não está no plano carregado (inativa)', () => {
  /* O cluster não tem como mostrá-la, e por isso NÃO manda no form: a conta gravada fica, sem pendência, e volta igual. */
  it('não zera, não acende pendência, e o Salvar regrava o MESMO id', async () => {
    banco.contrato = { ...PARCELAMENTO(), plano_conta_parcela_id: 'plano-inativo' };
    montarDetalhe();
    await abrirEdicao(); await pronto();
    expect(screen.queryByText(/Escolha a classificação da parcela/)).toBeNull();
    await salvar();
    expect(updatesDoContrato().at(-1)?.payload.plano_conta_parcela_id).toBe('plano-inativo');
  });
});

describe('prova 3 — salvar sem tocar em nada grava o que foi lido', () => {
  it('o payload do UPDATE é o contrato lido, campo a campo', async () => {
    const lido = PARCELAMENTO();
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    const ups = updatesDoContrato();
    expect(ups.length).toBe(1);
    const { updated_at, ...payload } = ups[0].payload;
    expect(typeof updated_at).toBe('string');
    expect(payload).toEqual({
      natureza: lido.natureza, descricao: lido.descricao, numero_contrato: lido.numero_contrato,
      tipo_financiamento: lido.tipo_financiamento, credor_id: lido.credor_id, conta_bancaria_id: lido.conta_bancaria_id,
      valor_total: lido.valor_total, valor_entrada: lido.valor_entrada, taxa_juros_mensal: lido.taxa_juros_mensal,
      /* PARC-LIVRES-01 2A — no PARCELAMENTO o gravador do contrato não leva `data_primeira_parcela`: a data de cada parcela é da
         grade de parcelas (parcela e lançamento juntos). */
      data_contrato: lido.data_contrato, observacao: lido.observacao,
      /* PARC-CONTRATO-01 item 2 — a fazenda do parcelamento passou a ser gravada (era editável e o Salvar a jogava fora) */
      fazenda_id: lido.fazenda_id,
      status: lido.status, gerar_lancamento_captacao: lido.gerar_lancamento_captacao,
      plano_conta_captacao_id: lido.plano_conta_captacao_id, plano_conta_parcela_id: lido.plano_conta_parcela_id,
    });
    /* nenhum campo virou nulo/vazio que não fosse nulo no contrato — e a busca sabe achar: há campos preenchidos */
    const zerados = Object.entries(payload).filter(([k, v]) => (v === null || v === '') && (lido as Record<string, unknown>)[k] != null);
    expect(zerados).toEqual([]);
    expect(Object.values(payload).filter((v) => v !== null && v !== '').length).toBeGreaterThan(8);
    /* e nenhuma outra tabela foi escrita */
    expect(banco.updates.every((u) => u.tabela === 'financiamentos')).toBe(true);
  });
});

describe('prova 4 — safra, fase e forma de pagamento vêm das parcelas, em leitura', () => {
  /* PARC-CONTRATO-01 item 2: os campos das parcelas viraram SELETORES (editáveis); o que se lê é o texto do gatilho */
  const ler = (id: string) => { const el = screen.getByTestId(id) as HTMLButtonElement; return { value: el.textContent ?? '', disabled: el.disabled }; };
  it('iguais em todas as parcelas: mostra o valor; o campo é EDITÁVEL (PARC-CONTRATO-01) e o motivo diz que o Salvar pergunta o alcance', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(ler('forma-das-parcelas').value).toBe('Boleto'));
    expect(ler('forma-das-parcelas').disabled).toBe(false);
    expect(screen.getByTestId('forma-das-parcelas').getAttribute('data-escolhido')).toBe('nao');
    expect(screen.getByTestId('motivo-forma').textContent)
      .toBe('Forma de pagamento: Vale por parcela. Ao salvar você escolhe quais parcelas a alteração alcança.');
    await irParaAba('Classificação');
    expect(ler('safra-das-parcelas').value).toBe('Safra 26/27 Pecuária');
    expect(ler('fase-das-parcelas').value).toBe('Cria');
    expect(ler('safra-das-parcelas').disabled || ler('fase-das-parcelas').disabled).toBe(false);
    expect(screen.queryByTestId('cultura-das-parcelas')).toBeNull();   // pecuária: o eixo é a fase
    expect(screen.getByTestId('motivo-safra').textContent)
      .toBe('Vale por parcela. Ao salvar você escolhe quais parcelas a alteração alcança.');
    /* o seletor de safra do CLUSTER (o que sugere pela data) segue fora da tela: quem está ali é o seletor das parcelas */
    expect(screen.queryByText('sugerida')).toBeNull();
  });
  it('divergentes: "varia entre as parcelas" nos três', async () => {
    banco.lancs = LANCS([{}, { safra_id: 'safra-pec-25', fase: 'engorda', forma_pagamento: 'PIX' }]);
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(ler('forma-das-parcelas').value).toBe('varia entre as parcelas'));
    await irParaAba('Classificação');
    expect(ler('safra-das-parcelas').value).toBe('varia entre as parcelas');
    expect(ler('fase-das-parcelas').value).toBe('varia entre as parcelas');
  });
  it('todas sem o dado: a palavra da casa, não "—"; sem parcela lançada: "—"', async () => {
    banco.lancs = LANCS([{ safra_id: null, fase: null, forma_pagamento: null }, { safra_id: null, fase: '', forma_pagamento: '' }]);
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(ler('forma-das-parcelas').value).toBe('Nenhuma'));
    await irParaAba('Classificação');
    expect(ler('safra-das-parcelas').value).toBe('Sem safra');
    expect(ler('fase-das-parcelas').value).toBe('Todas (rateia)');
    cleanup();
    banco.lancs = []; qc = novoQc(0);
    montarDetalhe();
    await abrirEdicao(); await pronto();
    expect(ler('forma-das-parcelas').value).toBe('—');
  });
  it('lançamento do contrato que NÃO é de parcela (a captação) não entra na leitura', async () => {
    banco.lancs = [...LANCS(), { id: 'lanc-captacao', financiamento_id: 'ctr-1', cancelado: false, safra_id: null, cultura: null, fase: null, forma_pagamento: 'TED' }];
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(ler('forma-das-parcelas').value).toBe('Boleto'));
  });
  it('o payload do Salvar não leva forma de pagamento, safra, cultura nem fase', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    const chaves = Object.keys(updatesDoContrato()[0].payload);
    expect(chaves.length).toBeGreaterThan(10);
    for (const k of ['forma_pagamento', 'safra_id', 'safra', 'cultura', 'fase']) expect(chaves).not.toContain(k);
    expect(banco.rpcs).toEqual([]);
  });
});

describe('prova 5 — a edição em curso não é sobrescrita por uma busca que chega depois', () => {
  it('digitado fica; o valor novo do banco não entra por cima', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    fireEvent.change(campoDescricao(), { target: { value: 'estou digitando' } });
    banco.contrato = { ...banco.contrato, descricao: 'MUDOU NO BANCO' };
    await act(async () => { await qc.invalidateQueries({ queryKey: ['obrigacao-edicao', 'ctr-1'] }); });
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    /* a busca chegou de verdade (o cache tem o valor novo)… */
    await waitFor(() => expect((qc.getQueryData(['obrigacao-edicao', 'ctr-1']) as Linha).descricao).toBe('MUDOU NO BANCO'));
    /* …e o React já desenhou com ela: um efeito que re-semeasse teria tido a vez dele */
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(campoDescricao().value).toBe('estou digitando');
  });
});

describe('o aviso do que o Salvar não alcança', () => {
  it('descrição mudou e há parcelas: "As parcelas já lançadas não foram alteradas."', async () => {
    const toast = await import('sonner');
    const espia = vi.spyOn(toast.toast, 'success');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    fireEvent.change(campoDescricao(), { target: { value: 'Outra descrição' } });
    await salvar();
    expect(espia).toHaveBeenLastCalledWith('Obrigação atualizada', { description: 'As parcelas já lançadas não foram alteradas.' });
    espia.mockRestore();
  });
  it('nada que as parcelas copiam mudou: só "Obrigação atualizada"', async () => {
    const toast = await import('sonner');
    const espia = vi.spyOn(toast.toast, 'success');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    expect(espia).toHaveBeenLastCalledWith('Obrigação atualizada');
    espia.mockRestore();
  });
  it('mudou, mas o contrato não tem parcela: sem a frase', async () => {
    const toast = await import('sonner');
    const espia = vi.spyOn(toast.toast, 'success');
    banco.parcelas = []; banco.lancs = [];
    montarDetalhe();
    await abrirEdicao(); await pronto();
    fireEvent.change(campoDescricao(), { target: { value: 'Outra descrição' } });
    await salvar();
    expect(espia).toHaveBeenLastCalledWith('Obrigação atualizada');
    espia.mockRestore();
  });
});

/* ── PARC-LIVRES-01 passo 2A — o editor de parcela do financiamento não vale no parcelamento ──────────────────────────────── */
/* ── PARC-CONTRATO-01 item 2 — a edição do contrato chega às parcelas pelo diálogo de escopo ─────────────────────────── */
describe('PARC-CONTRATO-01 item 2 — propagar a edição do contrato às parcelas', () => {
  const COM_MUDANCA = () => PREVIA({
    parcelas: { nao_pagas: 1, pagas: 1 }, nome_proprio: { nao_pagas: 0, pagas: 1 },
    campos: [{ campo: 'descricao', de: 'Compra parcelada', para: 'Nome novo', nao_pagas: 1, pagas: 1, nas_pagas: true }],
    alteradas: { futuros: 1, todos: 2 },
  });
  const clicarSalvarDoEditar = async () => {
    const botoes = screen.getAllByRole('button', { name: /^Salvar/ });
    fireEvent.click(botoes[0]);
  };
  const mudarNomeESalvar = async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    fireEvent.change(campoDescricao(), { target: { value: 'Nome novo' } });
    await clicarSalvarDoEditar();
  };

  it('nada muda nas parcelas (a prévia do banco diz zero): o diálogo de escopo NÃO abre e o Salvar é o de sempre', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    expect(banco.previas.length).toBe(1);
    expect(banco.previas[0]).toMatchObject({ p_escopo: 'todos', p_simular: true, p_campos: { descricao: PARCELAMENTO().descricao } });
    expect(screen.queryByTestId('propagar-contrato')).toBeNull();
    expect(banco.rpcs.filter((r) => r.fn === 'fn_parcelamento_propagar')).toEqual([]);
    expect(updatesDoContrato().length).toBe(1);
  });

  it('mudou o nome: abre o diálogo com a tabela do banco e NADA foi gravado; "Voltar" fecha sem gravar', async () => {
    banco.propagar = COM_MUDANCA();
    await mudarNomeESalvar();
    const dlg = await screen.findByTestId('propagar-contrato');
    expect(banco.previas[0].p_campos).toEqual({ descricao: 'Nome novo' });
    expect(updatesDoContrato().length).toBe(0);
    expect(banco.rpcs).toEqual([]);
    expect(dlg.textContent).toContain('nada foi gravado ainda');
    expect(Array.from(screen.getByTestId('propagar-campo-descricao').querySelectorAll('td')).map((td) => td.textContent))
      .toEqual(['Descrição', 'Compra parcelada → Nome novo', '1', '1']);
    expect([screen.getByTestId('propagar-nao-pagas').textContent, screen.getByTestId('propagar-pagas').textContent]).toEqual(['1', '1']);
    /* padrão "Só os futuros": o número é o do banco para esse escopo, e o nome próprio das PAGAS não aparece */
    expect(screen.getByTestId('propagar-recado').textContent).toBe('1 lançamento será alterado, junto com o contrato.');
    expect(screen.getByTestId('propagar-nome-proprio').textContent).toBe('');
    fireEvent.click(screen.getByText('Futuros e passados'));
    expect(screen.getByTestId('propagar-recado').textContent).toBe('2 lançamentos serão alterados, junto com o contrato.');
    expect(screen.getByTestId('propagar-nome-proprio').textContent).toBe('Com nome próprio, ficam como estão: 1 paga.');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByTestId('propagar-contrato')).toBeNull());
    expect(screen.getByText('Editar obrigação')).toBeTruthy();          // o Editar continua aberto, com o digitado
    expect(campoDescricao().value).toBe('Nome novo');
    expect(updatesDoContrato().length).toBe(0);
    expect(banco.rpcs).toEqual([]);
  });

  it('"Só os futuros" e Salvar: a RPC grava com o escopo ANTES do gravador do contrato, e o diálogo fecha', async () => {
    banco.propagar = COM_MUDANCA();
    await mudarNomeESalvar();
    await screen.findByTestId('propagar-contrato');
    fireEvent.click(within(screen.getByTestId('propagar-contrato')).getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(updatesDoContrato().length).toBe(1));
    expect(banco.rpcs).toEqual([{ fn: 'fn_parcelamento_propagar', args: { p_financiamento_id: 'ctr-1', p_campos: { descricao: 'Nome novo' }, p_escopo: 'futuros', p_simular: false } }]);
    expect(banco.ordem).toEqual(['rpc:fn_parcelamento_propagar', 'update:financiamentos']);
    await waitFor(() => expect(screen.queryByTestId('propagar-contrato')).toBeNull());
  });

  it('"Não propagar": grava SÓ o contrato — nenhuma RPC de escrita', async () => {
    banco.propagar = COM_MUDANCA();
    await mudarNomeESalvar();
    await screen.findByTestId('propagar-contrato');
    fireEvent.click(screen.getByText('Não propagar'));
    expect(screen.getByTestId('propagar-recado').textContent).toBe('Só o contrato será gravado.');
    fireEvent.click(within(screen.getByTestId('propagar-contrato')).getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(updatesDoContrato().length).toBe(1));
    expect(banco.rpcs).toEqual([]);
    expect(banco.toasts).toContain('Obrigação atualizada');
  });

  it('o banco recusa: a frase fica ESCRITA ao lado do botão, o diálogo fica e o contrato NÃO é gravado', async () => {
    banco.propagar = COM_MUDANCA();
    await mudarNomeESalvar();
    await screen.findByTestId('propagar-contrato');
    banco.erroRpc = 'Data e valor de parcela não se propagam pelo contrato: edite na grade de parcelas.';
    fireEvent.click(within(screen.getByTestId('propagar-contrato')).getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('propagar-recado').textContent).toBe('Data e valor de parcela não se propagam pelo contrato: edite na grade de parcelas.'));
    expect(screen.getByTestId('propagar-recado').className).toContain('text-destructive');
    expect(updatesDoContrato().length).toBe(0);
    expect(banco.toasts.filter((t) => t.startsWith('ERRO'))).toEqual([]);
  });

  it('financiamento com juros: fora — nenhuma prévia é pedida e o Salvar é o de sempre', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    expect(banco.previas).toEqual([]);
    expect(screen.queryByTestId('propagar-contrato')).toBeNull();
  });
});

describe('2A — parcelamento não passa pelo editor de parcela nem pelo deslocamento do contrato', () => {
  it('parcelamento: no diálogo de edição não há lápis de parcela — as parcelas se editam na GRADE (passo 2B)', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await irParaAba('Parcelas');
    expect(screen.queryAllByRole('button', { name: 'Editar parcela' })).toEqual([]);
    expect(screen.getByTestId('grade-de-parcelas')).toBeTruthy();
    expect(screen.getByText('A da lista: edite na grade.').getAttribute('title')).toBe('No parcelamento a data de cada parcela se edita na grade de parcelas.');
  });

  it('salvar um parcelamento não escreve em `financiamento_parcelas` nem leva `data_primeira_parcela` (a fonte prende o desvio)', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    fireEvent.change(campoDescricao(), { target: { value: 'Outra descrição' } });
    await salvar();
    expect(banco.updates.filter((u) => u.tabela === 'financiamento_parcelas')).toEqual([]);
    expect('data_primeira_parcela' in updatesDoContrato()[0].payload).toBe(false);
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
    expect(fonte).toContain("if (form.natureza !== 'parcelamento' && dataAntiga && dataNova && dataAntiga !== dataNova) {");
expect(fonte).toContain("...(form.natureza === 'parcelamento' ? (form.fazenda_id ? { fazenda_id: form.fazenda_id } : {}) : { data_primeira_parcela: form.data_primeira_parcela || null }),");
  });

  it('financiamento: o gravador do contrato continua levando `data_primeira_parcela`', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    expect('data_primeira_parcela' in updatesDoContrato()[0].payload).toBe(true);
  });
});

/* ── PARC-LIVRES-01 passo 2B — editar as parcelas gravadas, na mesma grade, por UMA RPC ───────────────────────────────────── */
describe('2B — a grade sobre as parcelas gravadas do parcelamento', () => {
  const valores = () => screen.getAllByTestId('valor-da-parcela') as HTMLInputElement[];
  const digitar = (i: number, texto: string) => { fireEvent.change(valores()[i], { target: { value: texto } }); fireEvent.blur(valores()[i]); };
  const botaoSalvar = () => screen.getByRole('button', { name: 'Salvar alterações' }) as HTMLButtonElement;
  const abrirGrade = async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await irParaAba('Parcelas');
    await waitFor(() => expect(screen.getAllByTestId('linha-da-parcela').length).toBeGreaterThan(0));
  };
  const rpcsDeEdicao = () => banco.rpcs.filter((r) => r.fn === 'fn_parcelamento_editar_parcelas');

  it('abre com as parcelas gravadas: a PAGA (pelo lançamento realizado) apagada, sem campo e sem ✕, com o motivo — e na soma', async () => {
    banco.lancs = LANCS([{ status_transacao: 'realizado', data_pagamento: '2026-10-09' }, { status_transacao: 'programado' }]);
    await abrirGrade();
    const linhas = screen.getAllByTestId('linha-da-parcela');
    expect(linhas.length).toBe(2);
    expect(linhas[0].getAttribute('data-paga')).toBe('sim');
    expect(linhas[0].getAttribute('title')).toBe('paga em 09/10/26: data e valor não mudam');
    expect(linhas[0].querySelector('input')).toBeNull();
    expect(valores().map((v) => v.value)).toEqual(['8.119,00']);
    expect(screen.getAllByTestId('tirar-parcela').length).toBe(1);
    expect(screen.getByTestId('rodape-soma').textContent).toBe('16.238,00');
    expect(screen.getByTestId('rodape-compra').textContent).toBe('16.238,00');
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.queryByText('Igual todo mês')).toBeNull();
  });

  it('paga também pela parcela marcada "pago"; a cancelada não entra na grade', async () => {
    banco.parcelas = [...PARCELAS().map((p, i) => (i === 0 ? { ...p, status: 'pago', data_pagamento: '2026-10-10' } : p)),
      { ...PARCELAS()[1], id: 'par-3', numero_parcela: 3, status: 'cancelado', lancamento_id: 'lanc-3' }];
    await abrirGrade();
    const linhas = screen.getAllByTestId('linha-da-parcela');
    expect(linhas.length).toBe(2);
    expect(linhas[0].getAttribute('title')).toBe('paga em 10/10/26: data e valor não mudam');
  });

  it('sem mexer na grade, salvar NÃO chama a RPC das parcelas', async () => {
    await abrirGrade();
    await salvar();
    expect(rpcsDeEdicao()).toEqual([]);
    expect(updatesDoContrato().length).toBe(1);
  });

  it('mudar um valor abre diferença: Salvar APAGADO com o motivo; "O contrato vale" fecha, e o Salvar grava parcelas ANTES do contrato', async () => {
    await abrirGrade();
    digitar(1, '8.000,00');
    expect(screen.getByTestId('diferenca').textContent).toBe('▼\u00a0−119,00');
    expect(screen.getByTestId('frase-nao-fecha').textContent).toBe('A soma das parcelas não fecha com o contrato.');
    expect(botaoSalvar().disabled).toBe(true);
    expect(botaoSalvar().title).toBe('A soma das parcelas não fecha com o contrato.');
    expect(screen.getByTestId('por-na-ultima').textContent).toBe('Pôr +119,00 na parcela 2');
    fireEvent.click(screen.getByTestId('compra-vale'));
    await waitFor(() => expect(screen.getByTestId('rodape-compra').textContent).toBe('16.119,00'));
    await salvar();
    expect(rpcsDeEdicao()).toEqual([{ fn: 'fn_parcelamento_editar_parcelas', args: {
      p_financiamento_id: 'ctr-1',
      p_parcelas: [{ id: 'par-1', data_vencimento: '2026-10-10', valor: 8119 }, { id: 'par-2', data_vencimento: '2026-11-10', valor: 8000 }],
      p_valor_total: 16119,
    } }]);
    expect(banco.ordem.indexOf('rpc:fn_parcelamento_editar_parcelas')).toBeLessThan(banco.ordem.indexOf('update:financiamentos'));
    expect(updatesDoContrato()[0].payload.valor_total).toBe(16119);
    expect(banco.updates.filter((u) => u.tabela === 'financiamento_parcelas' || u.tabela === 'financeiro_lancamentos_v2')).toEqual([]);
  });

  it('"+ Parcela" e ✕: a acrescentada viaja SEM id, a retirada sai da lista; "Desfazer alterações" volta às gravadas', async () => {
    await abrirGrade();
    fireEvent.click(screen.getAllByTestId('tirar-parcela')[1]);
    fireEvent.click(screen.getByTestId('mais-parcela'));
    expect(screen.getByTestId('rodape-n').textContent).toBe('2 parcelas');
    expect(botaoSalvar().title).toBe('Parcela 2 sem vencimento.');
    fireEvent.click(screen.getByTestId('voltar-a-base'));
    expect(valores().map((v) => v.value)).toEqual(['8.119,00', '8.119,00']);
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.getByTestId('voltar-a-base').textContent).toBe('Desfazer alterações');
  });

  it('a RPC recusou: a frase fica ESCRITA ao lado do botão, o diálogo não fecha e o contrato NÃO é gravado', async () => {
    banco.erroRpc = 'A parcela 1 já está paga: data e valor não mudam, e ela não pode ser retirada. Nada foi gravado.';
    await abrirGrade();
    digitar(0, '8.000,00'); digitar(1, '8.238,00');
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.getByTestId('erro-da-grade').textContent).toBe(banco.erroRpc));
    expect(screen.getByText('Editar obrigação')).toBeTruthy();
    expect(updatesDoContrato()).toEqual([]);
  });

  it('financiamento com juros: a aba Parcelas segue com a tabela de sempre (sem a grade)', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await irParaAba('Parcelas');
    expect(screen.queryByTestId('grade-de-parcelas')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Editar parcela' }).length).toBe(2);
  });
});

/* ── PARC-LIVRES-01 passo 4 — o contrato LÊ a situação do banco (o dono é o lançamento) ──────────────────────────────────── */
describe('4 — a tela do contrato mostra o que o banco derivou do lançamento', () => {
  const cartao = (rotulo: string) => screen.getByTestId(`cartao-${rotulo}`).textContent;
  const linhasDoContrato = () => screen.getAllByTestId('linha-do-contrato');
  const abrirDetalhe = async () => { montarDetalhe(); await screen.findByTestId('dados-do-contrato'); await waitFor(() => expect(linhasDoContrato().length).toBeGreaterThan(0)); };

  it('parcela paga pelo Financeiro: "Paga", "Pago em" e os cartões são os do banco (a coluna da parcela diz "pendente")', async () => {
    banco.situacao = SITUACAO([{ situacao: 'paga', pago_em: '2026-10-09', valor_pago: 8119, lancamento_status: 'conciliado', diverge: true }, { situacao: 'vencida' }],
      { pago: 8119, a_vencer: 0, vencido: 8119, pagas: 1, divergentes: 1 });
    await abrirDetalhe();
    expect(linhasDoContrato().map((l) => l.getAttribute('data-situacao'))).toEqual(['paga', 'vencida']);
    expect(screen.getAllByTestId('situacao-da-parcela').map((s) => s.textContent)).toEqual(['Paga', 'Vencida']);
    expect(screen.getAllByTestId('pago-em').map((s) => s.textContent)).toEqual(['09/10/26', '—']);
    expect(cartao('Pago')).toContain('8.119,00');
    expect(cartao('A vencer')).toContain('0,00');
    expect(cartao('Vencido')).toContain('8.119,00');
    expect(cartao('Progresso')).toContain('1 de 2 pagas');
    expect(screen.getByTestId('total-das-parcelas').textContent).toContain('16.238,00');
    expect(screen.getByTestId('total-pagas').textContent).toBe('1 de 2');
    expect(screen.getByTestId('total-pago').textContent).toBe('pago 8.119,00');
  });

  it('a parcela CANCELADA não entra: a lista e o total são os do banco, não os de `financiamento_parcelas`', async () => {
    /* a tabela tem TRÊS linhas (uma cancelada, que somaria 79,00); o banco devolve as duas vivas e 320,00 */
    banco.parcelas = [...PARCELAS(), { ...PARCELAS()[1], id: 'par-3', numero_parcela: 3, status: 'cancelado', valor_principal: 79 }];
    banco.situacao = SITUACAO([{ valor_principal: 200, valor_total: 200 }, { valor_principal: 120, valor_total: 120 }],
      { valor_contrato: 320, a_vencer: 320, soma_principal: 320, soma_total: 320 });
    await abrirDetalhe();
    expect(linhasDoContrato().length).toBe(2);
    expect(screen.getByTestId('total-das-parcelas').textContent).toContain('320,00');
    expect(screen.getByTestId('rodape-das-parcelas').textContent).toContain('Total · 2 parcelas');
    expect(screen.queryByText('Cancelada')).toBeNull();
  });

  it('o lápis e o CLIQUE NA LINHA abrem o lançamento DAQUELA parcela no modal do Financeiro; a coluna "Ver" saiu; com juros, a linha oferece o dos juros', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    banco.situacao = SITUACAO([{}, { lancamento_juros_id: 'lanc-juros-2', valor_juros: 100, valor_total: 8219 }]);
    await abrirDetalhe();
    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir o lançamento da parcela' })[0]);
    expect(screen.getByTestId('modal-do-financeiro').textContent).toBe('lanc-1');
    fireEvent.click(linhasDoContrato()[1]);
    expect(screen.getByTestId('modal-do-financeiro').textContent).toBe('lanc-2');
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull();
    expect(screen.getByTestId('dica-da-linha').textContent).toBe('clique na linha para abrir o lançamento no Financeiro');
    expect(screen.getAllByTestId('ver-juros').length).toBe(1);
    fireEvent.click(screen.getByTestId('ver-juros'));
    expect(screen.getByTestId('modal-do-financeiro').textContent).toBe('lanc-juros-2');
  });

  it('parcela SEM lançamento: o lápis fica APAGADO com o motivo e o clique na linha não abre nada', async () => {
    banco.situacao = SITUACAO([{ lancamento_id: null, fonte: 'parcela', situacao: 'paga', pago_em: '2026-10-10', valor_pago: 8119 }, {}], { pago: 8119, pagas: 1 });
    await abrirDetalhe();
    const lapis = screen.getAllByRole('button', { name: 'Abrir o lançamento da parcela' }) as HTMLButtonElement[];
    expect([lapis[0].disabled, lapis[0].title]).toEqual([true, 'Parcela sem lançamento no Financeiro.']);
    expect(lapis[1].disabled).toBe(false);
    fireEvent.click(linhasDoContrato()[0]);
    expect(screen.queryByTestId('modal-do-financeiro')).toBeNull();
    expect(linhasDoContrato()[0].getAttribute('title')).toBe('Parcela sem lançamento no Financeiro.');
    expect(screen.getAllByTestId('situacao-da-parcela')[0].getAttribute('title')).toBe('parcela sem lançamento: a situação é a registrada na parcela');
  });

  it('enquanto o banco não responde (ou responde torto) os cartões dizem "…", nunca R$ 0,00', async () => {
    banco.situacao = { parcelas: [{ id: 'par-1' }], cartoes: {} };
    montarDetalhe();
    await screen.findByTestId('dados-do-contrato');
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(cartao('Pago')).toBe('Pago…');
    expect(cartao('Progresso')).toBe('Progresso…');
    expect(screen.queryAllByTestId('linha-do-contrato')).toEqual([]);
  });

  it('PARC-FECHA-02 item 5: o Total é o rodapé padrão da casa, preso no fim da lista, e toda linha tem 19px (contrato)', async () => {
    banco.situacao = SITUACAO([{}, {}]);
    await abrirDetalhe();
    const rodape = screen.getByTestId('rodape-das-parcelas');
    expect(rodape.tagName).toBe('TFOOT');
    expect(rodape.className).toContain('sticky');
    expect(rodape.className).toContain('bottom-0');
    const celulas = Array.from(rodape.querySelectorAll('td'));
    expect(celulas.length).toBeGreaterThan(5);
    /* todas as células do Total, as vazias inclusive: fundo, negrito e o filete de 2px */
    for (const td of celulas) {
      expect(td.className).toContain('bg-[#E8E6DF]');
      expect(td.className).toContain('font-bold');
      expect(td.className).toContain('shadow-[inset_0_2px_0_#9aa7b6]');
    }
    const cabecalho = rodape.closest('table')!.querySelector('thead')!;
    expect(cabecalho.className).toContain('sticky');
    expect(cabecalho.className).toContain('top-0');
    /* a rolagem mora no wrapper da tabela: só as parcelas rolam */
    expect(rodape.closest('table')!.parentElement!.className).toContain('overflow-y-auto');
    for (const linha of [...linhasDoContrato(), rodape.querySelector('tr')!]) {
      expect(linha.className).toContain('h-[19px]');
      expect(linha.className).toContain('[&>td]:leading-[18px]');
    }
    /* nada dentro da linha passa de 16px, e nenhum valor fica abaixo de 10px */
    expect(screen.getAllByRole('button', { name: 'Abrir o lançamento da parcela' })[0].className).toContain('h-4');
    expect(document.body.innerHTML).not.toContain('text-[9px] font-semibold');
    /* o Total continua vindo da leitura do contrato */
    expect(screen.getByTestId('total-das-parcelas').textContent).toBe('16.238,00');
  });

  /* ── PARC-CONTRATO-01 item 1 — a tela conforme o mock: o detalhe vem PRONTO do banco ─────────────────────────────── */
  const DET = (o: Record<string, unknown> = {}) => ({
    competencia: '2026-06-02', conta_id: 'cta-1', conta_nome: 'Banco do Brasil', tipo_documento: null, numero_documento: null,
    prazo: null, documentos: [{ id: 'nf-1', especie: 'nf', numero: '5510', valor: 16238 }], boletos: 0, ...o,
  });
  const CART = (o: Record<string, unknown> = {}) => ({ a_vencer_qtde: 0, vencido_qtde: 1, notas_qtde: 1, notas_valor: 16238, notas_diferenca: 0, boletos: 1, ...o });

  it('PARC-CONTRATO-01: prazo, conta, competência, nota e boleto são os do banco; o rodapé e os cartões também (parcelamento)', async () => {
    banco.situacao = SITUACAO([
      { situacao: 'paga', pago_em: '2026-10-07', valor_pago: 8119, data_vencimento: '2026-10-10', ...DET({ prazo: { tipo: 'antes', dias: 3 }, boletos: 1 }) },
      { situacao: 'vencida', data_vencimento: '2026-10-05', ...DET({ prazo: { tipo: 'vencida', dias: 2 } }) },
    ], { pago: 8119, a_vencer: 0, vencido: 8119, pagas: 1, ...CART() });
    await abrirDetalhe();
    const celulas = (i: number) => Array.from(linhasDoContrato()[i].querySelectorAll('td')).map((td) => td.textContent);
    expect(celulas(0).slice(0, 9)).toEqual(['1/2', '02/06/26', '10/10/26', '07/10/26', '3 dias antes', 'Banco do Brasil', '8.119,00', 'Paga', 'NF 000.005.510']);
    expect(celulas(1).slice(0, 9)).toEqual(['2/2', '02/06/26', '05/10/26', '—', 'vencida há 2 dias', 'Banco do Brasil', '8.119,00', 'Vencida', 'NF 000.005.510']);
    const prazos = screen.getAllByTestId('prazo');
    expect(prazos[0].className).toContain('text-[#15803d]');
    expect(prazos[1].className).toContain('text-[#b91c1c]');
    /* o boleto: clipe só onde o banco contou boleto */
    const boletos = screen.getAllByTestId('boleto-da-parcela');
    expect(boletos[0].querySelector('[aria-label="tem boleto"]')).not.toBeNull();
    expect(boletos[1].textContent).toBe('—');
    /* cabeçalho na ordem do mock, sem "Lançamento" */
    const cab = Array.from(screen.getByTestId('rodape-das-parcelas').closest('table')!.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(cab).toEqual(['Nº', 'Comp.', 'Venc.', 'Pgto.', 'Prazo', 'Conta', 'Valor (R$)', 'Situação', 'Nota fiscal', 'Boleto', '']);
    /* rodapé: tudo lido */
    expect(Array.from(screen.getByTestId('rodape-das-parcelas').querySelectorAll('td')).map((td) => td.textContent))
      .toEqual(['Total · 2 parcelas', 'pago 8.119,00', '16.238,00', '1 de 2', '1 nota · confere', '1', '']);
    /* cartões com a contagem do banco; "Juros previstos" não existe no parcelamento */
    expect(cartao('Pago')).toBe('Pago · 1 parcelaR$ 8.119,00');
    expect(cartao('A vencer')).toBe('A vencer · 0 parcelasR$ 0,00');
    expect(cartao('Vencido')).toBe('Vencido · 1 parcelaR$ 8.119,00');
    expect(screen.queryByTestId('cartao-Juros previstos')).toBeNull();
  });

  it('PARC-CONTRATO-01: a nota que NÃO confere escreve a diferença do banco; sem detalhe (banco antigo) a tela diz "—", nunca inventa', async () => {
    banco.situacao = SITUACAO([{ ...DET() }, { ...DET() }], CART({ notas_valor: 33000, notas_diferenca: -77000 }));
    await abrirDetalhe();
    expect(screen.getByTestId('total-notas').textContent).toBe('1 nota · −77.000,00');
    expect(screen.getByTestId('total-notas').className).toContain('text-[#b91c1c]');
    cleanup();
    qc = novoQc(0);
    banco.situacao = SITUACAO([{}, {}]);
    await abrirDetalhe();
    expect(screen.getAllByTestId('prazo').map((p) => p.textContent)).toEqual(['—', '—']);
    expect(screen.getAllByTestId('conta-da-parcela').map((p) => p.textContent)).toEqual(['—', '—']);
    expect(screen.getByTestId('total-notas').textContent).toBe('—');
    expect(screen.getByTestId('total-boletos').textContent).toBe('…');
    expect(cartao('A vencer')).toBe('A vencerR$ 16.238,00');
  });

  it('PARC-CONTRATO-01: título CONTIDO numa linha (corta com title, botões com lugar reservado); Documentos e Editar parcelas abrem o diálogo na aba certa', async () => {
    banco.contrato = { ...PARCELAMENTO(), descricao: 'Contrato de teste com um nome bem comprido de sessenta letras xx' };
    banco.situacao = SITUACAO([{ ...DET() }, { ...DET() }], CART());
    await abrirDetalhe();
    const titulo = screen.getByTestId('titulo-do-contrato');
    expect(titulo.className).toContain('truncate');
    expect(titulo.className).toContain('min-w-0');
    expect(titulo.className).toContain('text-[15px]');
    expect(titulo.getAttribute('title')).toBe('Contrato de teste com um nome bem comprido de sessenta letras xx');
    expect(screen.getByTestId('linha-do-titulo').className).toContain('h-[26px]');
    const botoes = screen.getByTestId('botoes-do-contrato');
    expect(botoes.className).toContain('shrink-0');
    expect(Array.from(botoes.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Editar', 'Documentos', 'Excluir']);
    /* o bloco de dados não tem mais o título "Dados do contrato", e nada de fonte mono na tela */
    expect(screen.queryByText('Dados do contrato')).toBeNull();
    expect(document.body.innerHTML).not.toContain('font-mono');
    fireEvent.click(screen.getByRole('button', { name: /Documentos/ }));
    await screen.findByText('Editar obrigação');
    expect((await screen.findByRole('tab', { name: /Documentos/ })).getAttribute('aria-selected')).toBe('true');
    cleanup();
    qc = novoQc(0);
    await abrirDetalhe();
    fireEvent.click(screen.getByRole('button', { name: /Editar parcelas/ }));
    await screen.findByText('Editar obrigação');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Parcelas/ }).getAttribute('aria-selected')).toBe('true'));
  });

  it('PARC-CONTRATO-01: financiamento com juros — Principal, Juros e Total no lugar de Nota e Boleto; "Documentos" apagado com o motivo; "Juros previstos" aparece', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    banco.situacao = { ...SITUACAO([{ valor_juros: 100, valor_total: 8219, lancamento_juros_id: 'lj-1', ...DET({ documentos: [] }) }], { juros_previstos: 100, ...CART({ notas_qtde: 0, notas_valor: null, notas_diferenca: null, boletos: 0 }) }), natureza: 'financiamento' };
    await abrirDetalhe();
    const cab = Array.from(screen.getByTestId('rodape-das-parcelas').closest('table')!.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(cab).toEqual(['Nº', 'Comp.', 'Venc.', 'Pgto.', 'Prazo', 'Conta', 'Principal', 'Juros', 'Total (R$)', 'Situação', '', '']);
    expect(Array.from(linhasDoContrato()[0].querySelectorAll('td')).map((td) => td.textContent).slice(6, 9)).toEqual(['8.119,00', '100,00', '8.219,00']);
    expect(screen.queryByTestId('total-notas')).toBeNull();
    const documentos = screen.getByRole('button', { name: /Documentos/ }) as HTMLButtonElement;
    expect([documentos.disabled, documentos.title]).toEqual([true, 'Documentos no contrato: só em parcelamento. No financiamento com juros a nota e o boleto ficam no lançamento.']);
    expect(cartao('Juros previstos')).toContain('100,00');
  });

  it('a tela não soma nem decide quem está pago, e não abre mais o editor antigo de parcela (a fonte prende)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const soma = (t: string) => /\.reduce\(|status === 'pago'|status === 'pendente'/.test(t);
    expect(soma("parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + 1, 0)")).toBe(true);
    expect(soma(fonte)).toBe(false);
    expect(fonte).not.toContain('ModalBaixaParcela');
    expect(fonte).not.toContain('DialogVerLancamentosOficiais');
    expect(fonte).toContain('useSituacaoDoContrato(id, clienteId, hj, { detalhe: true })');
    /* o prazo, a conta, a nota e as contagens vêm do banco: a tela não faz conta de data */
    expect(/differenceIn|getTime\(\)|Date\.parse/.test('const d = a.getTime() - b.getTime()')).toBe(true);
    /* da linha do título em diante é o que a tela DESENHA (o `saveEdit`, acima, desloca parcelas do financiamento e tem conta de data) */
    const desenho = fonte.slice(fonte.indexOf('linha-do-titulo'));
    expect(desenho.length).toBeGreaterThan(5000);
    expect(/differenceIn|getTime\(\)|Date\.parse|\.reduce\(/.test(desenho)).toBe(false);
    expect(fonte).toContain("const hj = hojeLocal();");
  });
});
