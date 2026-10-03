/**
 * PR-CONC-ENRIQ-IMPORT-ATOMICA-01 — a importação tem dono no banco, e a tela LÊ dele.
 *
 * ⚠ O CASO DO NJ (set/26): quatro importações paradas em 400 de 470 (53ff65d5, 05f22626, eae81dda, 6d08260f) contavam como
 *   "Imp 05…09", e a 6d08260f era "a mais recente". Agora só a COMPLETA é numerada, é a mais recente e abre por padrão;
 *   a incompleta aparece "incompleta · 400 de 470" e a Mesa não trabalha nela.
 * ⚠ A REGRA DOS 10 MINUTOS MORA NA VIEW (`vw_classificacao_sessoes`, provada no teste SQL S6): a tela recebe 'importando'
 *   ou 'incompleta' e só a respeita — aqui se prova que as duas ficam fora do ranking e com a marca certa.
 * ⚠ A FALHA DE LOTE passa pelo `populate` DE VERDADE (os lotes de 100 de `useClassificacaoStaging`), com o banco falso:
 *   o lote 5 de 5 falha, a sessão fica, o "Tentar de novo" reenvia SÓ o lote 5 na MESMA sessão, e o banco a conclui.
 * ⚠ A ABA (`MesaEnriquecimentoTab`) NÃO TEM HARNESS DE RENDER no repo (acabamentos01.test): o bloqueio se prova pelo
 *   CONTRATO DA FONTE, como lá.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SessaoClassificacaoResumo } from '@/v2/hooks/useClassificacaoStaging';
import type { ClassificacaoExcelRow, ClassificacaoParseResult } from '@/v2/lib/excelPreview/parserClassificacao';

/* ── o banco falso: abrir / populate (lotes) / concluir, e o staging por sessão ── */
const BANCO = vi.hoisted(() => ({
  sessoes: new Map<string, { esperadas: number; status: string }>(),
  linhas: new Map<string, Set<number>>(),
  chamadasPopulate: [] as Array<{ sessao: string; linhas: number[] }>,
  falharNaChamada: -1,
}));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = () => {
    let sessao = '';
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'update', 'in', 'order']) b[m] = () => b;
    b.eq = (_c: string, v: string) => { sessao = v; return b; };
    b.range = () => Promise.resolve({ data: [...(BANCO.linhas.get(sessao) ?? [])].map((n) => ({ excel_linha_origem: n })), error: null });
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => tabela(),
      rpc: (fn: string, a: Record<string, unknown>) => {
        const sessao = String(a.p_sessao_id);
        if (fn === 'fn_classificacao_sessao_abrir') {
          const s = BANCO.sessoes.get(sessao);
          if (!s) BANCO.sessoes.set(sessao, { esperadas: Number(a.p_linhas_esperadas), status: 'importando' });
          else if (s.status !== 'completa') s.status = 'importando';
          return Promise.resolve({ data: { ok: true, status: 'importando', linhas_esperadas: Number(a.p_linhas_esperadas),
            linhas_recebidas: BANCO.linhas.get(sessao)?.size ?? 0 }, error: null });
        }
        if (fn === 'fn_classificacao_populate_staging') {
          const linhas = (Array.isArray(a.p_rows) ? a.p_rows : []).map((r: { linha: number }) => r.linha);
          BANCO.chamadasPopulate.push({ sessao, linhas });
          if (BANCO.chamadasPopulate.length - 1 === BANCO.falharNaChamada) {
            return Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
          }
          const set = BANCO.linhas.get(sessao) ?? new Set<number>();
          for (const n of linhas) set.add(n);
          BANCO.linhas.set(sessao, set);
          return Promise.resolve({ data: { sessao_id: sessao, total_linhas: linhas.length, inseridas: linhas.length, counts_por_status: {} }, error: null });
        }
        if (fn === 'fn_classificacao_sessao_concluir') {
          const s = BANCO.sessoes.get(sessao);
          const recebidas = BANCO.linhas.get(sessao)?.size ?? 0;
          const status = s && recebidas === s.esperadas ? 'completa' : 'incompleta';
          if (s) s.status = status;
          return Promise.resolve({ data: { ok: status === 'completa', status, linhas_esperadas: s?.esperadas ?? null, linhas_recebidas: recebidas,
            mensagem: status === 'completa' ? null : `${recebidas} de ${s?.esperadas} linhas chegaram.` }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});
const PARSE = vi.hoisted(() => ({ resultado: null as unknown }));
vi.mock('@/v2/lib/excelPreview/parserClassificacao', () => ({ parseExcelClassificacao: async () => PARSE.resultado }));

import {
  toSessoesVM, sessaoMaisNovaQueAberta, sessoesDoMes, maisRecenteDoMes, escolherMelhorSessaoId, sessaoMaisRecenteCompleta,
} from '@/v2/lib/mesa/enriquecimentoView';
import { useImportarClassificacao } from '@/v2/hooks/useImportarClassificacao';

/* ═══ O seletor do NJ set/26 — o estado depois do backfill (a tabela aprovada no PARE 2) ═══ */
const S = (sessao_id: string, criada_em: string, total: number, status?: SessaoClassificacaoResumo['status'], esperadas?: number):
  SessaoClassificacaoResumo => ({
  sessao_id, criada_em, excel_ano_mes: '2026-09', total, exatos: 0, ambiguos: 0, sem_match: 0, aplicados: 0,
  ...(status ? { status, linhas_esperadas: esperadas ?? null, linhas_recebidas: total } : {}),
});
const NJ_SET = [
  S('b6955356', '2026-09-30T10:38:38Z', 509, 'completa'), S('32c52f5c', '2026-09-30T21:15:26Z', 509, 'completa'),
  S('8d6efeb7', '2026-10-01T08:09:11Z', 509, 'completa'), S('dfd0f02c', '2026-10-02T18:28:12Z', 456, 'completa'),
  S('53ff65d5', '2026-10-02T21:28:56Z', 400, 'incompleta', 470), S('05f22626', '2026-10-02T21:29:39Z', 400, 'incompleta', 470),
  S('eae81dda', '2026-10-02T21:30:27Z', 400, 'incompleta', 470), S('e6849efd', '2026-10-02T21:32:06Z', 470, 'completa'),
  S('6d08260f', '2026-10-02T21:32:38Z', 400, 'incompleta', 470),
];

describe('o seletor do NJ set/26 — só a completa é numerada e é a mais recente', () => {
  it('Imp 01–04 iguais, e6849efd = Imp 05, as quatro incompletas sem número com "incompleta · 400 de 470"', () => {
    const vm = toSessoesVM(NJ_SET);
    const por = new Map(vm.map((v) => [v.id, v]));
    expect(['b6955356', '32c52f5c', '8d6efeb7', 'dfd0f02c', 'e6849efd'].map((id) => por.get(id)?.imp))
      .toEqual(['Imp 01', 'Imp 02', 'Imp 03', 'Imp 04', 'Imp 05']);
    for (const id of ['53ff65d5', '05f22626', 'eae81dda', '6d08260f']) {
      expect(por.get(id)?.imp).toBe('');
      expect(por.get(id)?.completa).toBe(false);
      expect(por.get(id)?.label).toMatch(/^Set\/2026 · incompleta · 400 de 470 · \d\d\/10 \d\d:\d\d$/);
    }
  });

  it('a mais recente do mês é a e6849efd, e não a 6d08260f (mais nova no relógio)', () => {
    const doMes = sessoesDoMes(toSessoesVM(NJ_SET), '2026-09');
    expect(doMes[0].id).toBe('6d08260f');               // a lista continua por data…
    expect(maisRecenteDoMes(doMes)?.id).toBe('e6849efd'); // …mas a mais recente é a completa
    /* o aviso "importação antiga" passa a aparecer na dfd0f02c (a de trabalho), apontando a Imp 05 */
    expect(sessaoMaisNovaQueAberta(NJ_SET, '2026-09', 'dfd0f02c')).toMatchObject({ id: 'e6849efd', imp: 'Imp 05' });
    expect(sessaoMaisNovaQueAberta(NJ_SET, '2026-09', 'e6849efd')).toBeNull();
  });

  it('a sessão que abre por padrão NUNCA é uma incompleta — nem com todas as incompletas mais novas', () => {
    expect(escolherMelhorSessaoId(NJ_SET)).toBe('e6849efd');
    expect(sessaoMaisRecenteCompleta(NJ_SET, '2026-09')?.sessao_id).toBe('e6849efd');
    const soIncompletas = NJ_SET.filter((s) => s.status === 'incompleta');
    expect(escolherMelhorSessaoId(soIncompletas)).toBeNull();
    expect(sessaoMaisRecenteCompleta(soIncompletas, '2026-09')).toBeNull();
    /* a busca sabe achar: com a mesma lista toda completa, a mais nova no relógio é a escolhida */
    expect(escolherMelhorSessaoId(NJ_SET.map((s) => ({ ...s, status: 'completa' as const })))).toBe('6d08260f');
  });

  it('legado sem registro (sem status) continua completo: rótulo e número de antes', () => {
    const legado = NJ_SET.slice(0, 4).map(({ status: _s, linhas_esperadas: _e, linhas_recebidas: _r, ...resto }) => resto);
    expect(toSessoesVM(legado).map((v) => v.imp).reverse()).toEqual(['Imp 01', 'Imp 02', 'Imp 03', 'Imp 04']);
    expect(toSessoesVM(legado)[0].label).toMatch(/^Set\/2026 · Imp 04 · 02\/10 \d\d:\d\d · 456 linhas$/);
  });
});

describe('a regra dos 10 minutos — a view decide, a tela respeita', () => {
  it('"importando" (dentro dos 10 min) fica fora do ranking e marcada "importando · N de M"', () => {
    const lista = [...NJ_SET, S('nova', '2026-10-03T14:00:00Z', 120, 'importando', 470)];
    const v = toSessoesVM(lista).find((x) => x.id === 'nova');
    expect(v?.label).toMatch(/· importando · 120 de 470 ·/);
    expect(v?.imp).toBe('');
    expect(maisRecenteDoMes(sessoesDoMes(toSessoesVM(lista), '2026-09'))?.id).toBe('e6849efd');
    expect(escolherMelhorSessaoId(lista)).toBe('e6849efd');
  });
  it('a mesma sessão, quando a view a lê "incompleta" (parada há mais de 10 min), vira "incompleta · 120 de 470"', () => {
    const v = toSessoesVM([S('nova', '2026-10-03T14:00:00Z', 120, 'incompleta', 470)])[0];
    expect(v.label).toMatch(/· incompleta · 120 de 470 ·/);
  });
});

/* ═══ A falha no lote 5 de 5 — o fluxo inteiro, pelo hook ═══ */
function linha(n: number): ClassificacaoExcelRow {
  return {
    linha: n, subcentro: 'Folha', fornecedor: null, produto: null, conta_origem: null, conta_destino: null,
    ano_mes: '2026-09', data: '2026-09-01', data_pagamento: null, data_vencimento: null, valor: n,
    tipo_operacao: '2-Saídas', fazenda_codigo: null, observacao: null, documento: null,
    safra: null, tipo_documento: null, forma_pagamento: null, status: null,
  };
}
const LOTE_470: ClassificacaoParseResult = {
  rows: Array.from({ length: 470 }, (_, i) => linha(i + 2)), totalLinhas: 470, linhasValidas: 470, linhasComErro: 0, erros: [],
};
function envoltorio({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  BANCO.sessoes.clear(); BANCO.linhas.clear(); BANCO.chamadasPopulate = []; BANCO.falharNaChamada = -1;
  PARSE.resultado = LOTE_470;
});

describe('falha no lote 5 de 5 → a mesma sessão, "Tentar de novo" reenvia só o que falta', () => {
  it('fica incompleta 400 de 470 com "linha 401 de 470 · …"; o reenvio é só o lote 5, na MESMA sessão; conclui completa', async () => {
    const h = renderHook(() => useImportarClassificacao('nj'), { wrapper: envoltorio });
    await act(async () => { await h.result.current.selecionarArquivo(new File(['x'], 'nj-set26.xlsx')); });
    BANCO.falharNaChamada = 4; // a 5ª chamada do populate (linhas 401..470)
    let erro: unknown = null;
    await act(async () => { try { await h.result.current.popular(); } catch (e) { erro = e; } });
    expect(erro).toBeInstanceOf(Error);
    expect(BANCO.chamadasPopulate).toHaveLength(5);
    const sessao = BANCO.chamadasPopulate[0].sessao;
    expect(BANCO.linhas.get(sessao)?.size).toBe(400);
    expect(h.result.current.falha).toMatchObject({ sessaoId: sessao, inicio: 400, total: 470 });
    expect(h.result.current.textoFalha).toMatch(/^linha 401 de 470 · /);

    /* "Tentar de novo" = o mesmo gesto: NÃO gera uuid novo e manda só as linhas 402..471 (o lote que falhou) */
    let res: Awaited<ReturnType<typeof h.result.current.popular>> = null;
    await act(async () => { res = await h.result.current.popular(); });
    expect(BANCO.chamadasPopulate).toHaveLength(6);
    expect(BANCO.chamadasPopulate[5].sessao).toBe(sessao);
    expect(BANCO.chamadasPopulate[5].linhas).toEqual(Array.from({ length: 70 }, (_, i) => 402 + i));
    expect(res).toMatchObject({ sessaoId: sessao });
    expect(BANCO.sessoes.get(sessao)?.status).toBe('completa');
    expect(BANCO.linhas.get(sessao)?.size).toBe(470);
    expect(h.result.current.falha).toBeNull();
    expect(BANCO.sessoes.size).toBe(1); // uma importação só — a de antes criava outra a cada clique
  });

  it('retomar uma incompleta (outro dia, sem a falha em memória): mesma sessão, só as linhas que faltam', async () => {
    BANCO.sessoes.set('inc', { esperadas: 470, status: 'incompleta' });
    BANCO.linhas.set('inc', new Set(Array.from({ length: 400 }, (_, i) => i + 2)));
    const h = renderHook(() => useImportarClassificacao('nj'), { wrapper: envoltorio });
    await act(async () => { await h.result.current.selecionarArquivo(new File(['x'], 'nj-set26.xlsx')); });
    await act(async () => { await h.result.current.popular({ sessaoRetomar: 'inc' }); });
    expect(BANCO.chamadasPopulate).toHaveLength(1);
    expect(BANCO.chamadasPopulate[0]).toMatchObject({ sessao: 'inc' });
    expect(BANCO.chamadasPopulate[0].linhas).toHaveLength(70);
    expect(BANCO.sessoes.get('inc')?.status).toBe('completa');
  });
});

/* ═══ A Mesa bloqueada em incompleta — o contrato da fonte (sem harness de render da aba) ═══ */
describe('a Mesa não trabalha em importação incompleta', () => {
  const fonte = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
  it('o painel fica sem contas, Recasar e "Mesa · todas as contas" se apagam, e o slot oferece retomar ou excluir', () => {
    expect(fonte).toMatch(/const sessaoBloqueada = !!sessaoAbertaVM && sessaoAbertaVM\.completa === false;/);
    expect(fonte).toMatch(/\(sessaoBloqueada \? \[\] : montarPainelContas\(/);
    expect(fonte).toMatch(/'↻ Recasar', desabilitado: isCasando \|\| !sessaoId \|\| sessaoBloqueada/);
    expect(fonte).toMatch(/'Mesa · todas as contas', desabilitado: rowsNaTela\.length === 0 \|\| sessaoBloqueada/);
    expect(fonte).toMatch(/data-testid="retomar-importacao"/);
    /* o "Gravar N prontas" se apaga e o gesto recusa, e o slot é só da incompleta */
    expect(fonte).toMatch(/gravarN=\{sessaoBloqueada \? 0 : linhasDoLote\.length\}/);
    expect(fonte).toMatch(/if \(linhasDoLote\.length === 0 \|\| sessaoBloqueada\) return;/);
    expect(fonte).toMatch(/if \(sessaoMaisNova && !sessaoBloqueada\)/);
    expect(fonte).toMatch(/if \(linhasSemConta > 0 && !sessaoBloqueada\)/);
    expect(fonte).toMatch(/data-testid="excluir-incompleta"/);
  });
  it('a recusa da exclusão vai escrita no slot (o motivo do banco), não em toast', () => {
    expect(fonte).toMatch(/id: 'recusa-exclusao'/);
    expect(fonte).not.toMatch(/toast\.error\(r\.motivo === 'sessao_com_linhas_gravadas'/);
  });
});
