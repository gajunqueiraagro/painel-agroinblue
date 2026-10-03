/**
 * PR-CONC-SALDO-UMA-REGUA-02b — o painel do mês, o lápis e o "Conciliar o mês" leem o DONO.
 *
 * ⚠ O BANCO FALSO SERVE OS DOIS LADOS: o resumo do dono (`fn_conciliacao_resumo_mes`, a linha real do Emerson do
 *   `resumoMes.fixture.json`) E os lançamentos do mês a VALOR CHEIO (`financeiro_lancamentos_v2`, o `sistema_completo` do
 *   mesmo fixture). Assim a mutação "voltar à régua antiga" (o `useSaldoSistemaNaPosicao` do HEAD, que lê aquela tabela e
 *   soma no front) cai pela razão certa: 158.533,89 no lugar de 155.972,29 — medido no relatório.
 * T1 painel do dono · T2 lápis lê o `saldo_apos` da data · T3 conta-mãe consolidada · T4 "…" carregando ·
 * T5 ninguém importa a régua antiga · T6 lápis em conta-mãe não compara.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

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
const linhaEmerson = (x: Record<string, unknown> = {}) => [{
  ...CASO.resumo, nivel: 'conta', conta_id: CONTA, conta_nome: 'Sicredi Lavoura', tem_extrato: true,
  saldo_extrato: 155972.29, saldo_extrato_data: '2026-09-30', diferenca: 0, posicao: null, ...x,
}];
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
const montarLapis = (dataAtual: string | null, saldoAtual: number | null = 155972.29) => render(
  <QueryClientProvider client={qcNovo()}>
    <SaldoRealDialog clienteId="nj" contaId={CONTA} contaNome="Sicredi Lavoura" ano={2026} mes={9}
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

describe('T3 / T6 — conta-mãe com interna consolidada', () => {
  beforeEach(() => {
    B.internas = [{ nome_conta: 'Bradesco-Invest. Facil', nome_exibicao: null }];
    B.gerencial = { saldo: 1, saldoInicial: 1, saldoData: '2026-09-30' };
    B.resumo = [{ nivel: 'conta', conta_id: CONTA, conta_nome: 'Bradesco', tem_extrato: true, saldo_inicial: 238791.26,
      saldo_sistema: 54738.55, saldo_extrato: 54738.55, saldo_extrato_data: '2026-09-30', diferenca: 0, posicao: null,
      linhas_sistema: [{ tipo: 'vinculo', data: '2026-09-30', valor: -184052.71, saldo_apos: 54738.55 }] }];
  });

  it('T3 painel: extrato, sistema e diferença são os TRÊS do dono, com ⊕ e "consolida X" — nunca o saldo próprio', async () => {
    montarPainel();
    await waitFor(() => expect(n('painel-saldo-extrato')).toContain('R$ 54.738,55'));
    expect(n('painel-saldo-extrato')).not.toContain('R$ 1,00');
    expect(n('painel-saldo-sistema')).toBe('R$ 54.738,55⊕');
    expect(n('painel-diferenca')).toBe('confere');
    expect(screen.getByTestId('painel-saldo-sistema').getAttribute('title')).toBe('consolida Bradesco-Invest. Facil (o saldo delas já está aqui)');
  });

  it('T6 lápis: o sistema do dono com "consolidado com X" e SEM diferença contra o digitado', async () => {
    montarLapis('2026-09-30', 1);
    await waitFor(() => expect(n('lapis-sistema')).toBe('R$ 54.738,55'));
    expect(n('lapis-consolidado')).toBe('· consolidado com Bradesco-Invest. Facil');
    expect(n('lapis-diferenca-consolidada')).toBe('conta consolidada: a diferença está no Resumo');
    expect(screen.queryByTestId('lapis-diferenca')).toBeNull();
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
  it('nenhum arquivo de src/ cita useSaldoSistemaNaPosicao ou somarAtePosicao fora de comentário', () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) { varrer(p); continue; }
        if (!/\.(ts|tsx)$/.test(nome) || p.endsWith('painelDono.test.tsx')) continue;
        const codigo = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (/\b(useSaldoSistemaNaPosicao|somarAtePosicao)\b/.test(codigo)) achados.push(p);
      }
    };
    varrer(resolve(process.cwd(), 'src'));
    expect(achados).toEqual([]);
    /* a busca sabe achar */
    expect(/\b(useSaldoSistemaNaPosicao|somarAtePosicao)\b/.test('const s = useSaldoSistemaNaPosicao(a, b);')).toBe(true);
  });
});
