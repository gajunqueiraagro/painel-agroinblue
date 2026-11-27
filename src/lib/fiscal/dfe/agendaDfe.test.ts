/**
 * NOTAS-RECEITA-AGENDA-01 · F2 — a rodada da agenda (sem rede, sem Receita, sem banco).
 *   G1 um titular por vez, na ordem dos devidos · G2 cadeia/certificado pausam até outro certificado · G3 "lambda: tempo" pausa 6 h
 *   G4 656 e 137 não pausam · G5 só começa titular novo nos primeiros 25 s · G6 a falha de um não para os outros · G7 devidos que não leem
 */
import { describe, expect, it } from 'vitest';
import { COMECAR_ATE_MS, PAUSA_LAMBDA_MS, pausaDaResposta, rodadaDaAgenda, type DevidoDaAgenda, type RespostaDaBusca }
  from '../../../../supabase/functions/_shared/dfe/agendaDfe';

const d = (n: number): DevidoDaAgenda => ({ titularId: `t${n}`, clienteId: `c${n}`, nuncaBuscou: false });
const ok137: RespostaDaBusca = { status: 200, corpo: { ok: true, cstat: '137' } };

function pecas(lista: DevidoDaAgenda[] | Error, respostas: Record<string, RespostaDaBusca | Error>, passo = 0) {
  const chamados: string[] = [];
  const pausas: { t: string; motivo: string; ate: string | null }[] = [];
  let t = 0;
  return {
    chamados, pausas,
    pecas: {
      devidos: async () => { if (lista instanceof Error) throw lista; return lista; },
      buscar: async (id: string) => { chamados.push(id); t += passo; const r = respostas[id] ?? ok137; if (r instanceof Error) throw r; return r; },
      pausar: async (x: DevidoDaAgenda, motivo: string, ate: string | null) => { pausas.push({ t: x.titularId, motivo, ate }); },
      agoraMs: () => t,
    },
  };
}

describe('rodadaDaAgenda', () => {
  it('G1 um por vez, na ordem dos devidos', async () => {
    const p = pecas([d(1), d(2), d(3)], {});
    const r = await rodadaDaAgenda(p.pecas);
    expect(p.chamados).toEqual(['t1', 't2', 't3']);
    expect(r.buscados.map((b) => b.cstat)).toEqual(['137', '137', '137']);
    expect(p.pausas).toEqual([]);
  });

  it('G2 cadeia e certificado pausam até subir outro certificado', async () => {
    const p = pecas([d(1), d(2), d(3)], {
      t1: { status: 422, corpo: { ok: false, recusa: 'cadeia' } },
      t2: { status: 422, corpo: { ok: false, recusa: 'impressao_diferente' } },
    });
    await rodadaDaAgenda(p.pecas);
    expect(p.pausas).toEqual([{ t: 't1', motivo: 'cadeia', ate: null }, { t: 't2', motivo: 'certificado', ate: null }]);
  });

  it('G3 "lambda: tempo" (502) pausa 6 h', () => {
    const r = pausaDaResposta({ status: 502, corpo: { ok: false, erro: 'FalhaDaLambda: lambda: tempo' } }, 1_000);
    expect(r?.motivo).toBe('lambda_tempo');
    expect(r?.ate).toBe(new Date(1_000 + PAUSA_LAMBDA_MS).toISOString());
    expect(pausaDaResposta({ status: 502, corpo: { ok: false, erro: 'outra coisa' } }, 0)).toBeNull();
  });

  it('G4 656 e 137/138 não pausam (a espera é da própria busca)', () => {
    expect(pausaDaResposta({ status: 200, corpo: { ok: false, cstat: '656' } }, 0)).toBeNull();
    expect(pausaDaResposta({ status: 200, corpo: { ok: true, cstat: '138' } }, 0)).toBeNull();
    expect(pausaDaResposta({ status: 409, corpo: { ok: false, recusa: 'espera' } }, 0)).toBeNull();
  });

  it('G5 só começa titular novo nos primeiros 25 s', async () => {
    const p = pecas([d(1), d(2), d(3)], {}, COMECAR_ATE_MS - 5_000);
    const r = await rodadaDaAgenda(p.pecas);
    expect(p.chamados).toEqual(['t1', 't2']);
    expect(r.deixados).toBe(1);
  });

  it('G6 a falha de rede de um não para os outros', async () => {
    const p = pecas([d(1), d(2)], { t1: new Error('rede') });
    const r = await rodadaDaAgenda(p.pecas);
    expect(p.chamados).toEqual(['t1', 't2']);
    expect(r.buscados[0].recusa).toBe('rede');
    expect(r.buscados[1].cstat).toBe('137');
  });

  it('G7 devidos que não leem = nada chamado', async () => {
    const p = pecas(new Error('x'), {});
    const r = await rodadaDaAgenda(p.pecas);
    expect(p.chamados).toEqual([]);
    expect(r.erro).toBe('devidos');
  });
});
