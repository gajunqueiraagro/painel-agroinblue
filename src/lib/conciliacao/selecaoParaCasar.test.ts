/**
 * CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36) — a conta do rodapé ("Selecionados N · soma · extrato · diferença"), o motivo curto da
 * coluna Motivo, a leitura do complemento (Pgto., Faz., NF pelos ids) e os levados do "Casar selecionados" (o `CasarComBancoModal` de hoje).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { motivoCurto, resumoDaSelecao } from '@/lib/conciliacao/selecaoParaCasar';
import type { TipoSugestao } from '@/lib/conciliacao/sugestoesCasamento';

const B = vi.hoisted(() => {
  const b: { tabelas: Record<string, unknown[]>; erro: unknown; pedidos: string[] } = { tabelas: {}, erro: null, pedidos: [] };
  return b;
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => {
      B.pedidos.push(t);
      const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: B.erro ? null : (B.tabelas[t] ?? []), error: B.erro }) };
      return q;
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));

import { lerComplementoDasLinhas } from '@/lib/conciliacao/complementoDasLinhas';
import { levadosDosMarcados } from '@/components/financeiro-v2/EspelhoConciliacaoTab';

beforeEach(() => { B.tabelas = {}; B.erro = null; B.pedidos = []; });

describe('o rodapé', () => {
  it('N, a soma assinada, o extrato e a diferença (soma − extrato, a conta do Casar); nada marcado = 0', () => {
    expect(resumoDaSelecao([-632.61, -632.61], -1265.22)).toEqual({ n: 2, soma: -1265.22, extrato: -1265.22, diferenca: 0 });
    expect(resumoDaSelecao([-1300], -1265.22)).toEqual({ n: 1, soma: -1300, extrato: -1265.22, diferenca: -34.78 });
    expect(resumoDaSelecao([], -1265.22)).toEqual({ n: 0, soma: 0, extrato: -1265.22, diferenca: 1265.22 });
    /* sem lixo de ponto flutuante: 0,1 + 0,2 */
    expect(resumoDaSelecao([0.1, 0.2], 0.3).diferenca).toBe(0);
  });
});

describe('o motivo curto', () => {
  it('cada tipo tem o seu (o inteiro vai no title); a soma diz quantos', () => {
    const l = (n: number) => Array.from({ length: n }, () => ({ lancamento_id: 'x', data_vencimento: null, competencia: null, valor_assinado: 1,
      descricao: null, fornecedor: null, favorecido_id: null, status_transacao: null }));
    const m = (tipo: TipoSugestao, n = 1) => motivoCurto({ tipo, lancamentos: l(n) });
    expect(m('mesmo_valor_nome')).toBe('mesmo valor · nome');
    expect(m('mesmo_valor')).toBe('mesmo valor');
    expect(m('soma', 3)).toBe('soma de 3');
    expect(m('mesmo_fornecedor')).toBe('mesmo forn. · valor ≠');
    expect(m('nome_valor')).toBe('nome · valor ≠');
    expect(m('nome_soma', 2)).toBe('nome · soma de 2');
    expect(m('soma_mista', 2)).toBe('soma de 2 · vários');
  });
});

describe('o complemento das linhas', () => {
  it('pagamento, fazenda (código e nome) e documento de cada id; a fazenda numa segunda leitura', async () => {
    B.tabelas = {
      financeiro_lancamentos_v2: [{ id: 'a', data_pagamento: '2026-09-16', fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.120.001' },
        { id: 'b', data_pagamento: null, fazenda_id: null, tipo_documento: null, numero_documento: null }],
      fazendas: [{ id: 'fz1', nome: 'Fazenda Exemplo Retiro', codigo: 'RET' }],
    };
    const m = await lerComplementoDasLinhas('cli', ['a', 'b', 'a']);
    expect(m?.get('a')).toEqual({ dataPagamento: '2026-09-16', fazendaId: 'fz1', fazendaCodigo: 'RET', fazendaNome: 'Fazenda Exemplo Retiro',
      tipoDocumento: 'Nota Fiscal', numeroDocumento: '000.120.001' });
    expect(m?.get('b')).toEqual({ dataPagamento: null, fazendaId: null, fazendaCodigo: null, fazendaNome: null, tipoDocumento: null, numeroDocumento: null });
    expect(B.pedidos).toEqual(['financeiro_lancamentos_v2', 'fazendas']);
  });
  it('sem ids, nada vai ao banco; a leitura que falha devolve null (nunca "sem documento" calado)', async () => {
    expect((await lerComplementoDasLinhas('cli', []))?.size).toBe(0);
    expect(B.pedidos).toEqual([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    B.erro = { message: 'boom' };
    expect(await lerComplementoDasLinhas('cli', ['a'])).toBeNull();
  });
});

describe('os levados do "Casar selecionados"', () => {
  const EXT = { extrato_id: 'e', data: '2026-10-16', historico: 'PAGAMENTO DE BOLETO - FORNECEDOR RURAL', valor: -1265.22 };
  const c = (id: string, v: number) => ({ lancamento_id: id, data_vencimento: '2026-10-15', competencia: '2026-10-01', valor_assinado: v,
    descricao: `d ${id}`, fornecedor: 'Fornecedor Rural Sintético Ltda', favorecido_id: 'fr', status_transacao: 'programado' });
  const a = { lancamentoId: 'h1', dataPagamento: null, dataVencimento: '2026-10-18', dataCompetencia: '2026-10-01', status: 'programado',
    conciliado: false, banco: null, descricao: 'h', fornecedorId: 'fr', fornecedor: 'F', planoContaId: null, centro: null, subcentro: null,
    fazendaId: null, fazenda: null, fazendaCodigo: null, contaId: 'itau', conta: 'Itaú', valor: -632.61, onde: [] };
  it('vários: cada um com o SEU valor (o ajuste é no Casar); o do histórico de outra conta leva a troca', () => {
    const l = levadosDosMarcados([{ de: 'sugestao', c: c('r2', -632.61) }, { de: 'historico', a, trocar: true }], EXT, 'Banco do Brasil');
    expect(l.map((x) => [x.lancamento_id, x.valor_assinado, !!x.usarValorDoBanco])).toEqual([['r2', -632.61, false], ['h1', -632.61, false]]);
    expect(l[1].trocarConta).toEqual({ de: 'Itaú', para: 'Banco do Brasil' });
  });
  it('um só com valor diferente do extrato: abre com o valor do banco no campo (o caminho de hoje)', () => {
    expect(levadosDosMarcados([{ de: 'sugestao', c: c('r1', -1300) }], EXT, 'Banco do Brasil')[0].usarValorDoBanco).toBe(true);
    expect(levadosDosMarcados([{ de: 'sugestao', c: c('r1', -1265.22) }], EXT, 'Banco do Brasil')[0].usarValorDoBanco).toBe(false);
  });
});

describe('o tamanho grande da tabela (ajustes 07:55 e 08:1x) é só das listas da Conciliação', () => {
  it('a classe e o CSS dela (12px, linha de 26px, cabeçalho SEM caixa alta); o Financeiro não a passa', async () => {
    const { readFileSync } = await import('node:fs');
    const peca = readFileSync('src/components/financeiro-v2/TabelaDaLista.tsx', 'utf8');
    const css = readFileSync('src/components/financeiro-v2/TabelaDaLista.css', 'utf8');
    const tela = readFileSync('src/pages/FinanceiroV2Tab.tsx', 'utf8');
    expect(peca).toContain("grande ? 'table-financeiro tabela-da-lista-grande w-full caption-bottom text-sm border-collapse' : 'table-financeiro w-full caption-bottom text-sm border-collapse'");
    expect(css).toMatch(/\.table-financeiro\.tabela-da-lista-grande td,\s*\.table-financeiro\.tabela-da-lista-grande td \* \{\s*font-size: 12px !important;/);
    expect(css).toMatch(/\.table-financeiro\.tabela-da-lista-grande th \{\s*font-size: 11px !important;\s*text-transform: none !important;/);
    expect(css).toMatch(/\.table-financeiro\.tabela-da-lista-grande tr\.linha-da-lista \{ height: 26px !important; \}/);
    expect(tela).not.toMatch(/<TabelaDaLista[^>]*\bgrande\b/);
    for (const f of ['src/components/financeiro-v2/SugestoesCasarModal.tsx', 'src/components/conciliacao/ProcurarNoHistorico.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/<TabelaDaLista larguras=\{COLUNAS_PARA_CASAR\}[^\n]*\bgrande\b/);
    }
  });
});
