/**
 * OC-BOITEL-REALIZADO-UX-01c — o revalorar do realizado usa o lote DO BANCO, e nunca pula calado.
 *
 * ⚠ NASCE DA 77d963be (RRCC, 26/09/2026): OC nova, lote e realizado no MESMO Salvar; o id do lote
 *   vinha do estado do clique, que ainda nao o tinha, e o revalorar foi pulado com a tela dizendo
 *   "Realizado do abate lancado". Lote na projecao (628.569,35) com o acerto em 656.957,17.
 * ⚠ O BANCO FALSO SO' "CRIA" O LOTE QUANDO O SALVAR DOS LOTES RODA — o caso de OC nova: antes disso
 *   nao ha id em lugar nenhum, e e' exatamente o que o estado do clique via.
 */
import { describe, it, expect, vi } from 'vitest';
import { gravarRealizadoBoitel, type EscritasDoRealizado } from '@/lib/oc/gravarRealizadoBoitel';

const ACERTO = 656957.17;
const LOTE_NOVO = 'b0781eb6-e92c-44ca-aa45-d40fe043e8f1';

function escritas(over: Partial<EscritasDoRealizado> = {}) {
  const chamadas: string[] = [];
  const e: EscritasDoRealizado = {
    salvarBoitel: vi.fn(async (v: number) => { chamadas.push(`boitel@${v}`); return v + 1; }),
    idDoLote: vi.fn(async () => { chamadas.push('idDoLote'); return LOTE_NOVO; }),
    revalorar: vi.fn(async (v: number, lote: string, valor: number) => {
      chamadas.push(`revalorar@${v}:${lote}:${valor}`);
      return { versao: v + 1, lancamentosAfetados: 0, avisoPendente: null };
    }),
    depoisDeRevalorar: vi.fn(async () => { chamadas.push('depois'); }),
    ehConflitoDeVersao: (x: unknown) => x instanceof Error && x.message === '40001',
    ...over,
  };
  return { e, chamadas };
}

describe('gravarRealizadoBoitel — o lote vem do banco', () => {
  it('OC NOVA: o lote nasce no Salvar dos lotes e o revalorar recebe o id dele', async () => {
    /* o "banco": nenhum lote ate' o `oc_salvar_lotes` do mesmo Salvar rodar */
    let lotesNoBanco: string[] = [];
    const estadoDoClique: { id?: string }[] = [{}];     // o que `lotesApi.lotes` tinha: lote SEM id
    const salvarLotes = async () => { lotesNoBanco = [LOTE_NOVO]; return 7; };

    const versaoDosLotes = await salvarLotes();
    const { e } = escritas({ idDoLote: async () => lotesNoBanco[0] ?? null });
    const r = await gravarRealizadoBoitel(versaoDosLotes, ACERTO, e);

    expect(estadoDoClique[0].id).toBeUndefined();       // o caminho velho nao tinha o que mandar
    expect(e.revalorar).toHaveBeenCalledWith(8, LOTE_NOVO, ACERTO);
    expect(r).toEqual({ ok: true, versao: 9, sucesso: 'Realizado lançado. Lote revalorado.', avisoPendente: null });
  });

  it('OC com lote ja existente continua igual: mesma ordem, versoes encadeadas pelos retornos', async () => {
    const { e, chamadas } = escritas({
      revalorar: vi.fn(async (v: number) => ({ versao: v + 1, lancamentosAfetados: 2, avisoPendente: 'O compromisso programado ficou em R$ X.' })),
    });
    const r = await gravarRealizadoBoitel(3, ACERTO, e);
    expect(chamadas.slice(0, 2)).toEqual(['boitel@3', 'idDoLote']);
    expect(e.revalorar).toHaveBeenCalledWith(4, LOTE_NOVO, ACERTO);
    expect(e.depoisDeRevalorar).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      ok: true, versao: 5,
      sucesso: 'Realizado lançado. Lote revalorado e 2 lançamentos do rebanho corrigidos.',
      avisoPendente: 'O compromisso programado ficou em R$ X.',
    });
  });
});

describe('gravarRealizadoBoitel — nunca pula calado', () => {
  it('sem lote no banco: NAO diz lancado, volta erro e nao revalora', async () => {
    const { e } = escritas({ idDoLote: vi.fn(async () => null) });
    const r = await gravarRealizadoBoitel(3, ACERTO, e);
    expect(r.ok).toBe(false);
    expect('erro' in r && r.erro).toMatch(/não tem lote para revalorar/);
    expect(JSON.stringify(r)).not.toMatch(/lançado/);
    expect(e.revalorar).not.toHaveBeenCalled();
    expect(e.depoisDeRevalorar).not.toHaveBeenCalled();
  });

  it('falha ao ler o lote e falha no revalorar tambem voltam erro, com o realizado ja gravado dito', async () => {
    const semLeitura = escritas({ idDoLote: vi.fn(async () => { throw new Error('rede'); }) });
    const r1 = await gravarRealizadoBoitel(3, ACERTO, semLeitura.e);
    expect('erro' in r1 && r1.erro).toMatch(/^Realizado gravado, mas o lote não foi lido/);

    const semRevalorar = escritas({ revalorar: vi.fn(async () => { throw new Error('Novo valor deve ser maior que zero'); }) });
    const r2 = await gravarRealizadoBoitel(3, ACERTO, semRevalorar.e);
    expect('erro' in r2 && r2.erro).toMatch(/^Realizado gravado, mas o lote não foi revalorado: Novo valor/);
    expect(semRevalorar.e.depoisDeRevalorar).not.toHaveBeenCalled();
  });

  it('recusa do boitel para tudo antes de ler o lote; 40001 tem frase propria', async () => {
    const recusa = escritas({ salvarBoitel: vi.fn(async () => { throw new Error('Realizado do boitel incompleto. Falta Arrobas'); }) });
    const r1 = await gravarRealizadoBoitel(3, ACERTO, recusa.e);
    expect('erro' in r1 && r1.erro).toBe('Realizado não gravado: Realizado do boitel incompleto. Falta Arrobas');
    expect(recusa.e.idDoLote).not.toHaveBeenCalled();

    const conflito = escritas({ salvarBoitel: vi.fn(async () => { throw new Error('40001'); }) });
    const r2 = await gravarRealizadoBoitel(3, ACERTO, conflito.e);
    expect('erro' in r2 && r2.erro).toMatch(/mudou em outro lugar/);
  });

  it('sem liquido positivo, o comportamento de antes: grava o boitel e nao revalora', async () => {
    const { e } = escritas();
    expect(await gravarRealizadoBoitel(3, null, e)).toEqual({ ok: true, versao: 4, sucesso: 'Realizado do abate lançado.', avisoPendente: null });
    expect(e.idDoLote).not.toHaveBeenCalled();
    expect(e.revalorar).not.toHaveBeenCalled();
  });
});
