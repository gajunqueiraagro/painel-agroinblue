/**
 * PR-CONC-SALDO-UMA-REGUA-02b — o painel do mês, o lápis e o "Conciliar o mês" leem o DONO.
 *
 * ⚠ O BANCO FALSO SERVE OS DOIS LADOS: o resumo do dono (`fn_conciliacao_resumo_mes`, a linha real do Emerson do
 *   `resumoMes.fixture.json`) E os lançamentos do mês a VALOR CHEIO (`financeiro_lancamentos_v2`, o `sistema_completo` do
 *   mesmo fixture). Assim a mutação "voltar à régua antiga" (o `useSaldoSistemaNaPosicao` do HEAD, que lê aquela tabela e
 *   soma no front) cai pela razão certa: 158.533,89 no lugar de 155.972,29 — medido no relatório.
 * T1 painel do dono · T2 lápis lê o saldo corrido da data · T4 "…" carregando · T5 ninguém importa a régua antiga.
 *
 * PR-CONC-INTERNA-SEPARADA-01b — CONTRATO NOVO: o painel e o lápis leem o saldo PRÓPRIO da conta (`proprio`,
 * `saldo_apos_proprio`, `posicao.saldo_sistema_proprio_na_data`). O T3/T6 antigo (conta-mãe consolidada com "⊕", lápis sem
 * diferença) virou o seu contrário: T3 painel da mãe com os três PRÓPRIOS e sem "⊕" · T6 lápis da mãe e da interna calculam
 * a diferença (o caso do Gabriel, abr/24: digitado −55.734,67 × sistema próprio −55.719,49 → −15,18; nunca −55.738,69) ·
 * T9 conta de par com posição no meio do mês: a diferença é "—" com o motivo · T8 ninguém cita `useContasConsolidadasEm`.
 * Os fixtures de conta sem par passam por `comProprio` (o `proprio` = topo que o dono manda).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { comProprio } from '@/lib/conciliacao/resumoDoDono.fixture';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const CASO = FIX.nj_sicredi_lavoura_2026_09;
const CONTA = CASO.conta as string;

const B = vi.hoisted(() => ({
  resumo: null as unknown,
  /** Segura o resumo até o teste soltar (T4). */
  segurar: null as null | Promise<void>,
  internas: [] as Array<{ nome_conta: string; nome_exibicao: string | null }>,
  lancamentos: [] as unknown[],
  rpcs: [] as string[],
  gerencial: { saldo: 155972.29 as number | null, saldoInicial: 30150.7, saldoData: '2026-09-30' as string | null },
}));

vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'gte', 'lte', 'is', 'not', 'order', 'in', 'limit']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({
      data: nome === 'financeiro_contas_bancarias' ? B.internas : nome === 'financeiro_lancamentos_v2' ? B.lancamentos : [],
      error: null,
    }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: async (fn: string) => {
        B.rpcs.push(fn);
        if (fn === 'fn_conciliacao_resumo_mes') { if (B.segurar) await B.segurar; return { data: B.resumo, error: null }; }
        return { data: null, error: null };
      },
      from: (nome: string) => tabela(nome),
    },
  };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {} }));
vi.mock('@/hooks/useExtratoDaConta', async (orig) => {
  const real = await orig<typeof import('@/hooks/useExtratoDaConta')>();
  return {
    ...real,
    useSaldoGerencialDoMes: () => ({
      saldo: B.gerencial.saldo, origem: null, anoMes: '2026-09', saldoInicial: B.gerencial.saldoInicial,
      saldoData: B.gerencial.saldoData, posicaoEm: B.gerencial.saldoData ?? '2026-09-30',
      posicaoDeclarada: B.gerencial.saldoData !== null, recarregarSaldo: () => {},
    }),
    useImportacoesDaConta: () => ({ importacoes: [], loading: false, recarregar: () => {} }),
    useSaldoDeclaradoOfx: () => ({ ofx: null, loading: false }),
    useSaldoDocumentos: () => ({ documentos: [], recarregar: async () => {} }),
    useExtratoFimDoMes: () => null,
  };
});
vi.mock('@/hooks/useConciliacaoDoMes', async (orig) => {
  const real = await orig<typeof import('@/hooks/useConciliacaoDoMes')>();
  return {
    ...real,
    useConciliacaoDoMes: () => ({ movimentos: [], recarregar: () => {} }),
    useSugestoesDoMes: () => ({ sugestoes: null, carregando: false, calcular: async () => {} }),
  };
});
vi.mock('@/components/conciliacao/ImportacoesDialog', () => ({ ImportacoesDialog: () => null }));
vi.mock('@/components/conciliacao/TabelaExtratoDoMes', () => ({ ExtratoDoMesModal: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { PainelExtratoMes } from './PainelExtratoMes';
import { SaldoRealDialog } from './SaldoRealDialog';

/* A linha do dono do Emerson: o fixture real (01c), com o que o painel lê. */
const linhaEmerson = (x: Record<string, unknown> = {}) => [comProprio({
  ...CASO.resumo, proprio: undefined, nivel: 'conta', conta_id: CONTA, conta_nome: 'Sicredi Lavoura', tem_extrato: true,
  saldo_extrato: 155972.29, saldo_extrato_data: '2026-09-30', diferenca: 0, posicao: null, ...x,
})];
/* Os lançamentos do mês a valor cheio, como a régua antiga os leria (o `sistema_completo` do mesmo snapshot). */
const lancamentosValorCheio = () => (CASO.esp.sistema_completo as Array<{ valor_assinado: number; data: string }>).map((s) => ({
  valor: Math.abs(s.valor_assinado), sinal: s.valor_assinado < 0 ? -1 : 1, tipo_operacao: s.valor_assinado < 0 ? '2-Saídas' : '1-Entradas',
  data_pagamento: s.data, conta_bancaria_id: CONTA, conta_destino_id: null,
}));

beforeEach(() => {
  B.resumo = linhaEmerson();
  B.segurar = null;
  B.internas = [];
  B.lancamentos = lancamentosValorCheio();
  B.rpcs = [];
  B.gerencial = { saldo: 155972.29, saldoInicial: 30150.7, saldoData: '2026-09-30' };
});

const qcNovo = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const montarPainel = (qc = qcNovo()) => render(
  <QueryClientProvider client={qc}>
    <PainelExtratoMes clienteId="nj" contaId={CONTA} ano={2026} mes={9} contaNome="Sicredi Lavoura" />
  </QueryClientProvider>,
);
const montarLapis = (dataAtual: string | null, saldoAtual: number | null = 155972.29, ano = 2026, mes = 9) => render(
  <QueryClientProvider client={qcNovo()}>
    <SaldoRealDialog clienteId="nj" contaId={CONTA} contaNome="Sicredi Lavoura" ano={ano} mes={mes}
      saldoAtual={saldoAtual} saldoDataAtual={dataAtual} aoFechar={() => {}} aoSalvar={() => {}} />
  </QueryClientProvider>,
);
const n = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s/g, ' ');
/* O valor de um campo do painel pelo RÓTULO (o `Campo` desenha rótulo e valor irmãos) — a mutação "régua antiga" não tem os
   testids novos, e é pelo número que ela tem de cair. */
const campo = (rotulo: RegExp) => (screen.getByText(rotulo).nextElementSibling?.textContent ?? '').replace(/\s/g, ' ');

describe('T1 — o painel do mês desenha o DONO', () => {
  it('o Emerson: saldo no sistema 155.972,29 (não os 158.533,89 a valor cheio) e a diferença do dono', async () => {
    montarPainel();
    await waitFor(() => expect(campo(/^Saldo no sistema/)).toBe('R$ 155.972,29'));
    expect(campo(/^Diferença de saldo/)).toBe('confere');
    expect(screen.queryByTestId('painel-realizados-apos')).toBeNull();
    expect(B.rpcs).toEqual(['fn_conciliacao_resumo_mes']);
  });

  it('posição no meio do mês: saldo, diferença e "realizados após" são os da `posicao` do dono', async () => {
    B.gerencial = { saldo: 100000, saldoInicial: 30150.7, saldoData: '2026-09-10' };
    B.resumo = linhaEmerson({ saldo_extrato_data: '2026-09-10',
      posicao: { data: '2026-09-10', saldo_sistema_na_data: 100010, diferenca_na_data: -10, realizados_apos: { qtde: 7, valor: 1 } } });
    montarPainel();
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('R$ 100.010,00'));
    expect(n('painel-diferenca')).toBe('-R$ 10,00');
    expect(n('painel-realizados-apos')).toMatch(/^7 realizados após 10\/09 não conferidos/);
  });

  it('a mesma chave do Casar: com o resumo da conta já no cache, abrir o painel não chama o dono de novo', async () => {
    const qc = qcNovo();
    qc.setQueryData(['conciliacao-resumo-mes', 'nj', '2026-09', [CONTA]], linhaEmerson());
    /* sem `staleTime` global: quem segura a releitura é o `servirDoCache` do painel */
    montarPainel(qc);
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('R$ 155.972,29'));
    expect(B.rpcs).toEqual([]);
  });
});

describe('T2 — o lápis LÊ o `saldo_apos` da data digitada', () => {
  const linhas = () => (CASO.resumo.linhas_sistema as Array<{ data: string; saldo_apos: number }>);
  it('no meio do mês, o saldo_apos da última linha até a data; antes da 1ª linha, o saldo inicial', async () => {
    const ate15 = linhas().filter((l) => l.data <= '2026-09-15');
    const esperado15 = ate15[ate15.length - 1].saldo_apos;
    montarLapis('2026-09-15');
    await waitFor(() => expect(n('lapis-sistema')).toBe(`R$ ${esperado15.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`.replace(/\s/g, ' ')));
    /* antes da 1ª linha (a 1ª é 01/09): uma conta com a 1ª linha em 05/09 e a data 03/09 */
    B.resumo = linhaEmerson({ linhas_sistema: [{ tipo: 'sem_par', data: '2026-09-05', valor: -10, saldo_apos: 30140.7 }] });
    montarLapis('2026-09-03');
    await waitFor(() => expect(screen.getAllByTestId('lapis-sistema')[1].textContent?.replace(/\s/g, ' ')).toBe('R$ 30.150,70'));
  });

  it('fim do mês: 155.972,29 e a diferença contra o digitado pela régua única (confere)', async () => {
    montarLapis('2026-09-30');
    await waitFor(() => expect(n('lapis-sistema')).toBe('R$ 155.972,29'));
    expect(n('lapis-diferenca')).toBe('confere');
  });
});

/* Agnaldo abr/24, o caso do Gabriel: o topo da mãe é o CONSOLIDADO do par (extrato −55.738,69 = −55.734,67 + −4,02 da
   interna); o `proprio` é só dela. A última linha da lista traz os dois saldos corridos. */
const MAE = { nivel: 'conta', conta_id: CONTA, conta_nome: 'Bradesco', tem_extrato: true,
  saldo_inicial: -40000, saldo_sistema: -55723.51, saldo_extrato: -55738.69, saldo_extrato_data: '2024-04-30', diferenca: -15.18, posicao: null,
  status: 'nao_conciliado', motivos: [{ motivo: 'saldo_diverge', valor: -15.18 }],
  internas: [{ conta_id: 'if', conta_nome: 'Bradesco-Invest. Facil' }], par_conta_id: null, par_status: null,
  proprio: { saldo_inicial: -39997.27, entradas: 100, saidas: -15822.22, saldo_sistema: -55719.49, saldo_extrato: -55734.67, diferenca: -15.18,
    entradas_terceiros: 100, entradas_transferencias: 0, saidas_terceiros: -15822.22, saidas_transferencias: 0 },
  linhas_sistema: [
    { tipo: 'vinculo', data: '2024-04-10', valor: -15722.22, saldo_apos: -55722.22, saldo_apos_proprio: -55719.49 },
    { tipo: 'transferencia_interna', data: '2024-04-20', valor: -1.29, saldo_apos: -55722.22, saldo_apos_proprio: -55720.78 },
    { tipo: 'transferencia_interna', data: '2024-04-28', valor: 1.29, saldo_apos: -55723.51, saldo_apos_proprio: -55719.49 },
  ] };
const INTERNA = { nivel: 'conta', conta_id: CONTA, conta_nome: 'Bradesco-Invest. Facil', tem_extrato: false,
  saldo_inicial: -2.73, saldo_sistema: -4.02, saldo_extrato: -4.02, saldo_extrato_data: '2024-04-30', diferenca: 0, posicao: null,
  status: 'nao_conciliado', par_status: 'nao_conciliado', par_conta_id: 'brad', internas: null,
  motivos: [{ motivo: 'conferida_com', conta_id: 'brad', conta_nome: 'Bradesco' }],
  linhas_sistema: [{ tipo: 'sem_par', data: '2024-04-20', valor: -1.29, saldo_apos: -4.02, saldo_apos_proprio: -4.02 }] };

describe('T3 / T6 — conta de par: o painel e o lápis mostram o saldo PRÓPRIO', () => {
  beforeEach(() => {
    B.gerencial = { saldo: -55734.67, saldoInicial: -39997.27, saldoData: '2024-04-30' };
    B.resumo = [MAE];
  });

  it('T3 painel da mãe: extrato, sistema e diferença são os TRÊS próprios; sem "⊕" e sem o consolidado', async () => {
    montarPainel();
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('-R$ 55.719,49'));
    expect(n('painel-saldo-extrato')).toBe('-R$ 55.734,67');
    expect(n('painel-diferenca')).toBe('-R$ 15,18');
    const tudo = document.body.textContent ?? '';
    expect(tudo).not.toContain('⊕');
    expect(tudo).not.toContain('55.738,69');   // o extrato consolidado do par
    expect(tudo).not.toContain('55.723,51');   // o sistema consolidado do par
    expect(screen.getByTestId('painel-saldo-sistema').getAttribute('title')).toBeNull();
  });

  it('T6 lápis da mãe: digitado −55.734,67 × sistema próprio −55.719,49 → −15,18; nunca −55.738,69', async () => {
    montarLapis('2024-04-30', -55734.67, 2024, 4);
    await waitFor(() => expect(n('lapis-sistema')).toBe('-R$ 55.719,49'));
    expect(n('lapis-diferenca')).toBe('-R$ 15,18');
    expect(screen.queryByTestId('lapis-consolidado')).toBeNull();
    expect(screen.queryByTestId('lapis-diferenca-consolidada')).toBeNull();
    const tudo = document.body.textContent ?? '';
    expect(tudo).not.toContain('55.738,69');
    expect(tudo).not.toContain('consolidad');
  });

  it('T6 lápis da mãe numa data no meio do mês: o saldo corrido PRÓPRIO da última linha até a data (com a transferência interna)', async () => {
    montarLapis('2024-04-22', -55720.78, 2024, 4);
    await waitFor(() => expect(n('lapis-sistema')).toBe('-R$ 55.720,78'));
    expect(n('lapis-diferenca')).toBe('confere');
  });

  it('T6 lápis da interna: funciona como o de qualquer conta — sistema próprio −4,02, e a diferença contra o digitado', async () => {
    B.resumo = [comProprio(INTERNA)];
    montarLapis('2024-04-30', -4.02, 2024, 4);
    await waitFor(() => expect(n('lapis-sistema')).toBe('-R$ 4,02'));
    expect(n('lapis-diferenca')).toBe('confere');
    B.resumo = [comProprio(INTERNA)];
    montarLapis('2024-04-10', -2.73, 2024, 4);
    /* antes da 1ª linha: o saldo inicial próprio */
    await waitFor(() => expect(screen.getAllByTestId('lapis-sistema')[1].textContent?.replace(/\s/g, ' ')).toBe('-R$ 2,73'));
  });
});

describe('T9 — conta de par com posição declarada no meio do mês: a diferença é "—" com o motivo', () => {
  const POSICAO = { data: '2024-04-15', saldo_sistema_na_data: -55722.22, saldo_sistema_proprio_na_data: -55719.49,
    diferenca_na_data: -16.47, realizados_apos: { qtde: 2, valor: 0 } };
  const TITULO = 'diferença na posição ainda não disponível para conta conferida em par — veja a diferença do fim do mês';

  it('mãe: o sistema é o PRÓPRIO na data, a diferença é "—" (nem a consolidada na data, nem uma subtração)', async () => {
    B.gerencial = { saldo: -55734.67, saldoInicial: -39997.27, saldoData: '2024-04-15' };
    B.resumo = [{ ...MAE, saldo_extrato_data: '2024-04-15', posicao: POSICAO }];
    montarPainel();
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('-R$ 55.719,49'));
    expect(n('painel-diferenca')).toBe('—');
    expect(screen.getByTestId('painel-diferenca').getAttribute('title')).toBe(TITULO);
    expect(document.body.textContent ?? '').not.toContain('16,47');
    expect(n('painel-realizados-apos')).toMatch(/^2 realizados após 15\/04/);
  });

  it('interna: o mesmo "—"', async () => {
    B.gerencial = { saldo: -4.02, saldoInicial: -2.73, saldoData: '2024-04-15' };
    B.resumo = [comProprio({ ...INTERNA, saldo_extrato_data: '2024-04-15',
      posicao: { data: '2024-04-15', saldo_sistema_na_data: -2.73, saldo_sistema_proprio_na_data: -2.73, diferenca_na_data: -1.29, realizados_apos: { qtde: 1, valor: -1.29 } } })];
    montarPainel();
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('-R$ 2,73'));
    expect(n('painel-diferenca')).toBe('—');
    expect(screen.getByTestId('painel-diferenca').getAttribute('title')).toBe(TITULO);
  });

  it('conta SEM par com posição: segue lendo `posicao.diferenca_na_data`, sem title', async () => {
    B.gerencial = { saldo: 100000, saldoInicial: 30150.7, saldoData: '2026-09-10' };
    B.resumo = linhaEmerson({ saldo_extrato_data: '2026-09-10',
      posicao: { data: '2026-09-10', saldo_sistema_na_data: 100010, diferenca_na_data: -10, realizados_apos: { qtde: 7, valor: 1 } } });
    montarPainel();
    await waitFor(() => expect(n('painel-diferenca')).toBe('-R$ 10,00'));
    expect(screen.getByTestId('painel-diferenca').getAttribute('title')).toBeNull();
  });
});

describe('T4 — carregando é "…", nunca o número antigo nem 0,00', () => {
  it('o painel e o lápis dizem "…" até o dono responder', async () => {
    let soltar: () => void = () => {};
    B.segurar = new Promise<void>((r) => { soltar = r; });
    montarPainel();
    expect(n('painel-saldo-sistema')).toBe('…');
    expect(n('painel-diferenca')).toBe('…');
    soltar();
    await waitFor(() => expect(n('painel-saldo-sistema')).toBe('R$ 155.972,29'));
  });
  it('o lápis', async () => {
    let soltar: () => void = () => {};
    B.segurar = new Promise<void>((r) => { soltar = r; });
    montarLapis('2026-09-30');
    expect(n('lapis-sistema')).toBe('…');
    soltar();
    await waitFor(() => expect(n('lapis-sistema')).toBe('R$ 155.972,29'));
  });
});

describe('T5 — ninguém mais importa a régua antiga', () => {
  it('nenhum arquivo de src/ cita useSaldoSistemaNaPosicao, somarAtePosicao ou useContasConsolidadasEm (T8 do 01b) fora de comentário', () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) { varrer(p); continue; }
        if (!/\.(ts|tsx)$/.test(nome) || p.endsWith('painelDono.test.tsx')) continue;
        const codigo = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (/\b(useSaldoSistemaNaPosicao|somarAtePosicao|useContasConsolidadasEm)\b/.test(codigo)) achados.push(p);
      }
    };
    varrer(resolve(process.cwd(), 'src'));
    expect(achados).toEqual([]);
    /* a busca sabe achar */
    expect(/\b(useSaldoSistemaNaPosicao|somarAtePosicao|useContasConsolidadasEm)\b/.test('const s = useContasConsolidadasEm(a, b);')).toBe(true);
  });
});
