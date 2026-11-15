/**
 * OPENFINANCE-PILOTO-01 — a fonte do Open Finance passa pela MESMA prévia do arquivo e grava pela MESMA porta.
 *
 * ⚠ O HOOK É O REAL (`useImportacaoExtrato`): o hash, a dedupe e o casamento rodam de verdade. Só o banco é falso (nada já
 *   importado, nenhum candidato) e a Pluggy não existe aqui — a resposta vem do fixture sintético.
 * ⚠ A PROVA DE "MESMA PRÉVIA": o mesmo conteúdo escrito como OFX (FITID = providerId, MEMO = descrição) e entregue pela
 *   fonte do Open Finance dá movimentos IGUAIS, hash inclusive. Se a fonte nova ganhar um caminho próprio, isto cai.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in', 'or', 'range', 'limit', 'neq', 'filter', 'match']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return { supabase: { from: () => vazio(), rpc: (...a: unknown[]) => rpc(...a) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cliente-teste' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));

import { useImportacaoExtrato } from './useImportacaoExtrato';
import fixture from '@/lib/financeiro/parser/openFinance.sandbox.json';
import { fonteDoOpenFinance, type TransacaoOpenFinance } from '@/lib/financeiro/parser/openFinance';
import type { FonteDoExtrato } from '@/lib/financeiro/parser/fonteDoExtrato';

const OPC = { de: '2026-10-01', ate: '2026-11-12', buscadoEm: '2026-11-13', desde: '2026-11-01' };
function fonteDoFixture(t: TransacaoOpenFinance[] = fixture.transacoes): FonteDoExtrato {
  const r = fonteDoOpenFinance(fixture.conta, t, OPC);
  if (r.ok === false) throw new Error(r.motivo);
  return r.fonte;
}

/* O mesmo conteúdo como OFX: um STMTTRN por movimento, na mesma ordem. */
function comoOFX(f: FonteDoExtrato): string {
  const linhas = f.movimentos.map((m) => `<STMTTRN><TRNTYPE>${m.tipo === 'credito' ? 'CREDIT' : 'DEBIT'}<DTPOSTED>${m.data.replace(/-/g, '')}`
    + `<TRNAMT>${m.valor.toFixed(2)}${m.documento ? `<FITID>${m.documento}` : ''}<MEMO>${m.descricao}</STMTTRN>`);
  return `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<BANKTRANLIST>\n${linhas.join('\n')}\n</BANKTRANLIST>\n</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

/* O Blob do jsdom não tem `arrayBuffer()`: o FileReader dele faz (o mesmo apoio do importarLinhaSaldo.test). */
beforeEach(() => {
  rpc.mockReset();
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result instanceof ArrayBuffer ? r.result : new ArrayBuffer(0));
        r.readAsArrayBuffer(this);
      });
    };
  }
});

const essencia = (ms: { data: string; valor: number; tipo: string; descricao: string; documento: string | null; hash: string }[]) =>
  ms.map((m) => ({ data: m.data, valor: m.valor, tipo: m.tipo, descricao: m.descricao, documento: m.documento, hash: m.hash }));

describe('a fonte do Open Finance na prévia de sempre', () => {
  it('a prévia nasce com formato OPEN_FINANCE, os 7 movimentos, o saldo e o período que a fonte declara', async () => {
    const { result } = renderHook(() => useImportacaoExtrato());
    let p: Awaited<ReturnType<typeof result.current.gerarPreviewDaFonte>> | undefined;
    await act(async () => { p = await result.current.gerarPreviewDaFonte({ fonte: fonteDoFixture(), contaBancariaId: 'conta-1' }); });
    expect(p?.formato).toBe('OPEN_FINANCE');
    expect(p?.totalLinhas).toBe(7);
    expect(p?.novosParaSalvar).toBe(7);
    expect(p?.linhasInformativas).toBe(1);
    expect([p?.saldoDeclarado, p?.saldoDeclaradoData]).toEqual([15234.56, '2026-11-13']);
    expect([p?.periodoDeclaradoInicio, p?.periodoDeclaradoFim]).toEqual(['2026-11-01', '2026-11-12']);
    /* os dois "RENDIMENTO 0,13" iguais no mesmo dia são dois movimentos, cada um com hash próprio (a ocorrência) */
    const rend = (p?.movimentos ?? []).filter((m) => m.descricao === 'RENDIMENTO POUPANCA AUT');
    expect(rend).toHaveLength(2);
    expect(rend[0].hash).not.toBe(rend[1].hash);
  });

  it('o MESMO conteúdo por OFX e pelo Open Finance dá a MESMA prévia — hash inclusive', async () => {
    const fonte = fonteDoFixture();
    const { result } = renderHook(() => useImportacaoExtrato());
    let doOF: Awaited<ReturnType<typeof result.current.gerarPreviewDaFonte>> | undefined;
    let doOFX: Awaited<ReturnType<typeof result.current.gerarPreview>> | undefined;
    await act(async () => { doOF = await result.current.gerarPreviewDaFonte({ fonte, contaBancariaId: 'conta-1' }); });
    await act(async () => {
      doOFX = await result.current.gerarPreview({ arquivo: new File([comoOFX(fonte)], 'mesmo.ofx'), contaBancariaId: 'conta-1' });
    });
    expect(doOFX?.formato).toBe('OFX');
    expect(essencia(doOF?.movimentos ?? [])).toEqual(essencia(doOFX?.movimentos ?? []));
    expect(doOF?.movimentos.length).toBe(7);
  });

  it('o banco sem movimento lançado no período: a frase é do Open Finance, não "verifique o arquivo"', async () => {
    const { result } = renderHook(() => useImportacaoExtrato());
    const soPendente = fixture.transacoes.filter((t) => t.status === 'PENDING');
    let erro: unknown;
    await act(async () => {
      try { await result.current.gerarPreviewDaFonte({ fonte: fonteDoFixture(soPendente), contaBancariaId: 'conta-1' }); } catch (e) { erro = e; }
    });
    expect(String((erro as Error)?.message)).toBe('O banco não devolveu nenhum movimento lançado neste período pelo Open Finance. Nada para importar.');
    expect(result.current.error).toMatch(/Open Finance/);
  });

  it('o Confirmar grava pela MESMA porta (fn_extrato_importar_arquivo), com tipo OPEN_FINANCE e o saldo declarado', async () => {
    rpc.mockResolvedValue({ data: { ok: true, importacao_id: 'imp-1', inseridos: 7, pulados: [], ids: [] }, error: null });
    const { result } = renderHook(() => useImportacaoExtrato());
    await act(async () => { await result.current.gerarPreviewDaFonte({ fonte: fonteDoFixture(), contaBancariaId: 'conta-1' }); });
    await act(async () => {
      await result.current.confirmarImportacao({ contaBancariaId: 'conta-1', nomeArquivo: 'Open Finance · Conta Corrente · 01/11 a 12/11/2026', formato: 'OPEN_FINANCE' });
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nome, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe('fn_extrato_importar_arquivo');
    expect(args).toMatchObject({ p_tipo_arquivo: 'OPEN_FINANCE', p_saldo_declarado: 15234.56, p_saldo_declarado_data: '2026-11-13', p_total_linhas: 7 });
    const movs = args.p_movimentos as { documento: string | null }[];
    expect(movs).toHaveLength(7);
    expect(movs[0].documento).toBe('OF-BB-20261103-0001');
  });

  it('o arquivo segue como sempre: formato desconhecido é recusado com a frase de antes', async () => {
    const { result } = renderHook(() => useImportacaoExtrato());
    let erro: unknown;
    await act(async () => {
      try { await result.current.gerarPreview({ arquivo: new File(['x'], 'extrato.xls'), contaBancariaId: 'conta-1' }); } catch (e) { erro = e; }
    });
    expect(String((erro as Error)?.message)).toBe('Formato não reconhecido (espera-se .ofx, .csv ou .pdf)');
  });
});
