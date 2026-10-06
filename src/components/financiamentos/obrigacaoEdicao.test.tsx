import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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
}));

vi.mock('@/integrations/supabase/client', () => {
  const tabela = (t: string, op: { tipo: 'select' | 'update' | 'insert'; payload?: Record<string, unknown> }) => {
    if (op.tipo === 'update') {
      banco.updates.push({ tabela: t, payload: op.payload ?? {} });
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
      rpc: (fn: string, args: Record<string, unknown>) => { banco.rpcs.push({ fn, args }); return Promise.resolve({ data: 'novo-id', error: null }); },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
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

let qc: QueryClient;
const novoQc = (staleTime: number) => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
const montarDetalhe = () => render(<QueryClientProvider client={qc}><FinanciamentoDetalhe id="ctr-1" /></QueryClientProvider>);
const abrirEdicao = async () => {
  /* o botão dos Dados do contrato é o primeiro; as linhas da grade de parcelas têm o seu */
  await screen.findByText('Dados do contrato');
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
  banco.updates = []; banco.rpcs = []; banco.leituras = []; banco.toasts = [];
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
  const ler = (id: string) => screen.getByTestId(id) as HTMLInputElement;
  it('iguais em todas as parcelas: mostra o valor; campo desabilitado; motivo no DOM', async () => {
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await waitFor(() => expect(ler('forma-das-parcelas').value).toBe('Boleto'));
    expect(ler('forma-das-parcelas').disabled).toBe(true);
    expect(screen.getByTestId('motivo-forma').textContent)
      .toBe('Forma de pagamento: Vale por parcela. A alteração em todas as parcelas chega na próxima etapa.');
    await irParaAba('Classificação');
    expect(ler('safra-das-parcelas').value).toBe('Safra 26/27 Pecuária');
    expect(ler('fase-das-parcelas').value).toBe('Cria');
    expect(ler('safra-das-parcelas').disabled && ler('fase-das-parcelas').disabled).toBe(true);
    expect(screen.queryByTestId('cultura-das-parcelas')).toBeNull();   // pecuária: o eixo é a fase
    expect(screen.getByTestId('motivo-safra').textContent)
      .toBe('Vale por parcela. A alteração em todas as parcelas chega na próxima etapa.');
    /* o seletor editável de safra do cluster NÃO está na tela */
    expect(screen.queryByText('Sem safra')).toBeNull();
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
describe('2A — parcelamento não passa pelo editor de parcela nem pelo deslocamento do contrato', () => {
  const lapis = () => screen.getAllByRole('button', { name: 'Editar parcela' }) as HTMLButtonElement[];
  const MOTIVO = 'Parcela de parcelamento: o pagamento é pelo lançamento, no Financeiro; data e valor se editam na grade de parcelas.';

  it('parcelamento: o lápis de cada parcela fica APAGADO com o motivo (não some), no detalhe e no diálogo', async () => {
    montarDetalhe();
    await screen.findByText('Dados do contrato');
    await waitFor(() => expect(lapis().length).toBe(2));
    expect(lapis().map((b) => [b.disabled, b.title])).toEqual([[true, MOTIVO], [true, MOTIVO]]);
    await abrirEdicao(); await pronto();
    await irParaAba('Parcelas');
    /* com o diálogo aberto o fundo fica fora da árvore acessível: estes são os dois lápis DO DIÁLOGO */
    const todos = lapis();
    expect(todos.length).toBe(2);
    expect(todos.every((b) => b.disabled && b.title === MOTIVO)).toBe(true);
    expect(screen.getByText('No parcelamento a data de cada parcela se edita na grade de parcelas.')).toBeTruthy();
  });

  it('financiamento com juros: o lápis segue ACESO, com o título de sempre', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    montarDetalhe();
    await screen.findByText('Dados do contrato');
    await waitFor(() => expect(lapis().length).toBe(2));
    expect(lapis().map((b) => [b.disabled, b.title])).toEqual([[false, 'Editar parcela'], [false, 'Editar parcela']]);
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
    expect(fonte).toContain("...(form.natureza === 'parcelamento' ? {} : { data_primeira_parcela: form.data_primeira_parcela || null }),");
  });

  it('financiamento: o gravador do contrato continua levando `data_primeira_parcela`', async () => {
    banco.contrato = FINANCIAMENTO('financiamento');
    montarDetalhe();
    await abrirEdicao(); await pronto();
    await salvar();
    expect('data_primeira_parcela' in updatesDoContrato()[0].payload).toBe(true);
  });
});
