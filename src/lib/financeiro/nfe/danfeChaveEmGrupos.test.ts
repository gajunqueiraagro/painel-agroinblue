/**
 * DANFE-CHAVE-EM-GRUPOS-01 (P95) — o leiaute que escreve cada pedaco num item (JasperReports + iText): a chave em 11 itens de 4 digitos
 * na MESMA linha (com itens " " entre eles), o "N°." e a "SÉRIE" num item e o valor no item ao lado, o rotulo curto do protocolo.
 * Sobre o DANFE SINTETICO (as posicoes de um real, dados de teste; a chave sintetica com o DV certo). O PDF real do caso fica fora do repo.
 *   G1 a chave em grupos: lida inteira, o amarelo cobre os 11 · G2 DV trocado = sem chave (nunca adivinha) · G3 grupos em linhas diferentes
 *   nao se juntam · G4 numero e serie com o valor ao lado · G5 o rotulo curto do protocolo · G6 o item unico continua valendo
 */
import { describe, it, expect } from 'vitest';
import { FRASE_NOTA_SEM_CHAVE, chaveEmGrupos, notaDoDanfe, type ItemDoDanfe, type ResultadoDoDanfe } from './danfe';
import { PAGINAS_DANFE_SINTETICO } from './__fixtures__/danfeSintetico';

const CHAVE = '50260911222333000424550100000009371217538298';
const ITEM_CHAVE = '5026 0911 2223 3300 0424 5501 0000 0009 3712 1753 8298';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}
/** A chave do fixture picada em 11 itens de 4 (18pt entre eles, como o caso real) e itens " " no meio; `dy` desce a partir do 6o. */
function picada(opcoes: { chave?: string; dy?: number } = {}): ItemDoDanfe[][] {
  const chave = opcoes.chave ?? CHAVE;
  return PAGINAS_DANFE_SINTETICO.map((p) => p.flatMap((it) => {
    if (it.str !== ITEM_CHAVE) return [it];
    const grupos = chave.match(/\d{4}/g) ?? [];
    return grupos.flatMap((g, i) => {
      const y = it.y - (i >= 5 ? opcoes.dy ?? 0 : 0);
      const grupo: ItemDoDanfe = { str: g, x: it.x + i * 18, y, w: 14, h: it.h };
      return i < grupos.length - 1 ? [grupo, { str: ' ', x: it.x + i * 18 + 14, y, w: 4, h: it.h }] : [grupo];
    });
  }));
}
const comDvTrocado = (c: string) => `${c.slice(0, 43)}${(Number(c[43]) + 1) % 10}`;

describe('DANFE-CHAVE-EM-GRUPOS-01 — a chave em 11 itens de 4 digitos', () => {
  it('G1 lida inteira; confere com o resto da nota; o amarelo marca os 11 itens', () => {
    const r = lida(notaDoDanfe(picada()));
    expect(r.nota.chave).toBe(CHAVE);
    expect(r.divergencias).toEqual([]);
    expect(r.marcas.filter((m) => m.campo === 'chave')).toHaveLength(11);
    expect(r.nota.numero).toBe('937');
  });
  it('G2 os mesmos grupos com o digito verificador trocado: sem chave (a juncao nunca adivinha)', () => {
    const r = notaDoDanfe(picada({ chave: comDvTrocado(CHAVE) }));
    expect(r).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE });
  });
  it('G3 grupos em linhas diferentes (Δy > 2) nao se juntam; ate 2 de diferenca, sim', () => {
    expect(notaDoDanfe(picada({ dy: 3 }))).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE });
    expect(lida(notaDoDanfe(picada({ dy: 1.5 }))).nota.chave).toBe(CHAVE);
  });
  it('a juncao direta: os itens de outra linha e o lixo de digitos fora da linha nao entram', () => {
    const itens = [
      { str: '0469', x: 486, y: 434, w: 14, h: 6, pagina: 1 },
      ...(CHAVE.match(/\d{4}/g) ?? []).map((g, i) => ({ str: g, x: 360 + i * 18, y: 736, w: 14, h: 6, pagina: 1 })),
    ];
    const r = chaveEmGrupos(itens);
    expect(r?.chave).toBe(CHAVE);
    expect(r?.itens.map((o) => o.y)).toEqual(Array(11).fill(736));
  });
});

describe('DANFE-CHAVE-EM-GRUPOS-01 — o rotulo num item e o valor no item ao lado', () => {
  /* "Nº 000.000.937" -> "N°." | "000.000.937"; "SÉRIE 10" -> "SÉRIE" | "10" (os dois quadros: o do DANFE e o do canhoto) */
  const separado = (pgs: ItemDoDanfe[][]) => pgs.map((p) => p.flatMap((it) => {
    const m = /^(Nº|SÉRIE) (.+)$/.exec(it.str);
    if (!m) return [it];
    const rot = m[1] === 'Nº' ? 'N°.' : 'SÉRIE';
    return [{ ...it, str: rot, w: 14 }, { ...it, str: m[2], x: it.x + 22, w: it.w - 22 }];
  }));
  it('G4 numero e serie lidos com o valor ao lado (e a chave em grupos ao mesmo tempo)', () => {
    const r = lida(notaDoDanfe(separado(picada())));
    expect([r.nota.numero, r.nota.serie]).toEqual(['937', '10']);
    expect(r.divergencias).toEqual([]);
  });
  it('G5 o protocolo com o rotulo curto ("PROTOCOLO DE AUTORIZAÇÃO", sem o "DE USO")', () => {
    const curto = PAGINAS_DANFE_SINTETICO.map((p) => p.map((it) => (it.str === 'PROTOCOLO DE AUTORIZAÇÃO DE USO' ? { ...it, str: 'PROTOCOLO DE AUTORIZAÇÃO' } : it)));
    const r = lida(notaDoDanfe(curto));
    expect(r.nota.protocolo).toEqual({ cStat: '100', numero: '150260000000001' });
    expect(r.avisos).not.toContain('sem_protocolo');
  });
  it('G6 o item unico da chave continua valendo', () => {
    expect(lida(notaDoDanfe(PAGINAS_DANFE_SINTETICO)).nota.chave).toBe(CHAVE);
  });
});
