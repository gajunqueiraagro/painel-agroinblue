/**
 * NOTAS-RECEITA · CIÊNCIA AUTOMÁTICA (210210) — a ordem do envio no fim da busca (regra do produto 18/11). Sem rede, sem Receita, sem banco.
 *   A1 desligada (o parâmetro do produto) = nada enviado · A2 o limite por busca · A3 a recusa de UMA nota segue; a mesma recusa 2× seguidas
 *   para (a do sistema; a 596 é da nota, A8) · A4 a recusa do LOTE para · A5 certificado e conexão param · A6 o orçamento de tempo · A7 as pendentes que não se leem = nada enviado
 */
import { describe, expect, it } from 'vitest';
import { cienciaAutomatica, type PendentesDaCiencia, type RespostaDaCiencia } from '../../../../supabase/functions/_shared/dfe/cienciaAutomatica';

const ch = (n: number) => String(n).padStart(44, '5');
const aceita: RespostaDaCiencia = { status: 200, corpo: { ok: true, cstat_lote: '128', cstat: '135', com_ciencia: true } };
const recusa = (cstat: string): RespostaDaCiencia => ({ status: 200, corpo: { ok: false, cstat_lote: '128', cstat, com_ciencia: false } });

function pecas(p: PendentesDaCiencia | Error, respostas: (RespostaDaCiencia | Error)[], relogio: number[] = []) {
  const enviadas: string[] = [];
  let i = 0;
  let t = 0;
  return {
    enviadas,
    pecas: {
      pendentes: async () => { if (p instanceof Error) throw p; return p; },
      enviar: async (chave: string) => { enviadas.push(chave); const r = respostas[i++] ?? aceita; if (r instanceof Error) throw r; return r; },
      agoraMs: () => relogio[t++] ?? 0,
    },
  };
}

describe('cienciaAutomatica — o fim da busca', () => {
  it('A1 desligada pelo parâmetro do produto: nada enviado', async () => {
    const x = pecas({ ligada: false, limite: 0, chaves: [], motivo: 'desligada' }, []);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([]);
    expect(c).toMatchObject({ ligada: false, enviadas: 0, motivo: 'desligada' });
  });
  it('A2 o limite por busca: 3 pendentes, limite 2 = 2 enviadas, 2 aceitas, na ordem do banco', async () => {
    const x = pecas({ ligada: true, limite: 2, chaves: [ch(1), ch(2), ch(3)] }, [aceita, aceita]);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([ch(1), ch(2)]);
    expect(c).toMatchObject({ pendentes: 3, enviadas: 2, aceitas: 2, recusadas: 0, parou: null, cstats: ['135', '135'] });
  });
  /* CONSERTO 27/11: o exemplo era a 596 (fora do prazo), que agora é da NOTA e não para (A8); a repetida do SISTEMA é a 296 (certificado/LCR) */
  it('A3 a recusa de UMA nota segue para a próxima; a MESMA recusa 2× seguidas para', async () => {
    const x = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2), ch(3), ch(4), ch(5)] }, [recusa('296'), aceita, recusa('296'), recusa('296'), aceita]);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([ch(1), ch(2), ch(3), ch(4)]);
    expect(c).toMatchObject({ enviadas: 4, aceitas: 1, recusadas: 3, parou: 'recusa_repetida' });
  });
  it('A4 a Receita recusa o LOTE (sem cStat do evento): para na hora', async () => {
    const x = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2)] }, [{ status: 200, corpo: { ok: false, cstat_lote: '215', cstat: null } }]);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([ch(1)]);
    expect(c).toMatchObject({ recusadas: 1, parou: 'recusa_do_lote', cstats: ['lote 215'] });
  });
  it('A5 o certificado (422) e a conexão (502 ou exceção) param sem mandar a próxima', async () => {
    const a = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2)] }, [{ status: 422, corpo: { ok: false, recusa: 'certificado' } }]);
    expect(await cienciaAutomatica(0, a.pecas)).toMatchObject({ falhas: 1, parou: 'certificado' });
    expect(a.enviadas).toEqual([ch(1)]);
    const b = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2)] }, [{ status: 502, corpo: { ok: false, recusa: 'conexao' } }]);
    expect(await cienciaAutomatica(0, b.pecas)).toMatchObject({ falhas: 1, parou: 'conexao' });
    const d = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2)] }, [new Error('rede')]);
    expect(await cienciaAutomatica(0, d.pecas)).toMatchObject({ falhas: 1, enviadas: 0, parou: 'conexao' });
    expect(d.enviadas).toEqual([ch(1)]);
  });
  it('A6 o orçamento de tempo: passou dos 60 s antes da 2ª = para com 1 enviada', async () => {
    const x = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2)] }, [aceita, aceita], [10_000, 61_000]);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([ch(1)]);
    expect(c).toMatchObject({ enviadas: 1, aceitas: 1, parou: 'tempo' });
  });
  it('A7 as pendentes que não se leem: nada enviado, parada "interno"', async () => {
    const x = pecas(new Error('banco'), []);
    const c = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([]);
    expect(c).toMatchObject({ enviadas: 0, parou: 'interno', motivo: 'pendentes' });
  });

  it('A8 CONSERTO 27/11: a 596 (fora do prazo) é da NOTA — segue para as próximas e nunca para a rodada; a repetida do sistema ainda para', async () => {
    const x = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2), ch(3), ch(4)] }, [recusa('596'), recusa('596'), recusa('596'), aceita]);
    const r = await cienciaAutomatica(0, x.pecas);
    expect(x.enviadas).toEqual([ch(1), ch(2), ch(3), ch(4)]);
    expect(r).toMatchObject({ enviadas: 4, aceitas: 1, recusadas: 3, parou: null });
    const y = pecas({ ligada: true, limite: 10, chaves: [ch(1), ch(2), ch(3)] }, [recusa('296'), recusa('296'), aceita]);
    expect((await cienciaAutomatica(0, y.pecas)).parou).toBe('recusa_repetida');
  });
});
