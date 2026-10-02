/**
 * PR-CONC-ENRIQ-AGRUP-2b-TELA — a forma da seleção no Extrato da planilha; o bloco e o casar 1×1 no PR-CONC-ENRIQ-BLOCO-NM-B.
 *
 * ⚠ OS CASOS REAIS SÃO OS DO NJ (Sicredi Lavoura, set/26):
 *   - o cru Terra Forte −63.716,00 (10/09) contra as linhas "sem par" da planilha — 16.150,00 + 15.963,00 + 15.816,80 +
 *     15.786,20 = 63.716,00 fecha ao centavo; tirar a última não fecha;
 *   - o bloco do Emerson (6 linhas × 20 lançamentos classificados, −59.539,20 dos dois lados) e o do T Cortez, que difere em
 *     10.764,11 (o Pix de 25/09 sem lançamento) e por isso não confere.
 */
import { describe, it, expect } from 'vitest';
import { gestoDaSelecao, MOTIVO_CRU_NO_BLOCO } from './agruparNoExtrato';
import { textoSomaDifere } from './desmembrar';

const p = (...vs: number[]) => vs.map((valor, i) => ({ id: `p${i}`, valor }));
/** lançamentos CLASSIFICADOS */
const s = (...vs: number[]) => vs.map((valor, i) => ({ id: `s${i}`, valor, cru: false }));
/** lançamentos CRUS (do extrato, sem classificação) */
const c = (...vs: number[]) => vs.map((valor, i) => ({ id: `c${i}`, valor, cru: true }));

describe('gestoDaSelecao — as formas, na ordem do NM-B', () => {
  it('nada marcado: sem forma e sem motivo', () => {
    expect(gestoDaSelecao({ planilha: [], sistema: [] })).toMatchObject({ forma: null, habilitado: false, motivo: null });
  });

  it('só um lado: "marque também o outro lado"', () => {
    for (const sel of [{ planilha: p(-10), sistema: [] }, { planilha: [], sistema: s(-10) }, { planilha: [], sistema: c(-10) }]) {
      expect(gestoDaSelecao(sel)).toMatchObject({ forma: null, habilitado: false, motivo: 'marque também o outro lado' });
    }
  });

  /* ── todos classificados: o bloco ─────────────────────────────────────────────────────────────────────────────── */
  it('bloco N × M que fecha: "Conferir bloco 6×20", habilitado (Emerson, −59.539,20 dos dois lados)', () => {
    /* 6 linhas da planilha e 20 lançamentos que somam o mesmo — os valores são sintéticos, a forma é a do caso */
    const linhas = p(-10000, -10000, -10000, -10000, -10000, -9539.2);
    const lancs = s(...Array.from({ length: 19 }, () => -3000), -2539.2);
    const g = gestoDaSelecao({ planilha: linhas, sistema: lancs });
    expect(g).toMatchObject({ forma: 'bloco', rotulo: 'Conferir bloco 6×20', habilitado: true, motivo: null, diferenca: 0 });
    expect(g.somaPlanilha).toBe(-59539.2);
    expect(g.somaSistema).toBe(-59539.2);
  });

  it('bloco que NÃO fecha fica apagado com a diferença escrita (T Cortez, 10.764,11)', () => {
    const g = gestoDaSelecao({ planilha: p(293368.95), sistema: s(282604.84) });
    expect(g.forma).toBe('bloco');
    expect(g.rotulo).toBe('Conferir bloco 1×1');
    expect(g.habilitado).toBe(false);
    expect(g.diferenca).toBe(10764.11);
    expect(g.motivo).toBe('as somas diferem em R$ 10.764,11 — o bloco só confere quando fecha');
  });

  it('1 × 1 classificado é bloco 1×1 (o mesmo caminho do casar manual no banco), e N × 1 classificado também', () => {
    expect(gestoDaSelecao({ planilha: p(-982), sistema: s(-982) }))
      .toMatchObject({ forma: 'bloco', rotulo: 'Conferir bloco 1×1', habilitado: true });
    expect(gestoDaSelecao({ planilha: p(-300, -206.51), sistema: s(-506.51) }))
      .toMatchObject({ forma: 'bloco', rotulo: 'Conferir bloco 2×1', habilitado: true });
    expect(gestoDaSelecao({ planilha: p(-506.51), sistema: s(-300, -206.51) }))
      .toMatchObject({ forma: 'bloco', rotulo: 'Conferir bloco 1×2', habilitado: true });
  });

  it('bloco aceita sinais opostos e confere pela soma com sinal (venda + retenção − contra o depósito líquido)', () => {
    const g = gestoDaSelecao({ planilha: p(9836.9), sistema: s(10000, -163.1) });
    expect(g).toMatchObject({ forma: 'bloco', habilitado: true, diferenca: 0 });
  });

  /* ── há cru ───────────────────────────────────────────────────────────────────────────────────────────────────── */
  it('1 × 1 cru com o mesmo valor: "Casar", habilitado (TOKIO MARINE 1.690,71)', () => {
    expect(gestoDaSelecao({ planilha: p(-1690.71), sistema: c(-1690.71) }))
      .toMatchObject({ forma: 'casar', rotulo: 'Casar', habilitado: true, motivo: null, diferenca: 0 });
  });

  it('1 × 1 cru com valor diferente: "Casar" APAGADO, com a diferença', () => {
    const g = gestoDaSelecao({ planilha: p(-339), sistema: c(-1099) });
    expect(g).toMatchObject({ forma: 'casar', habilitado: false, diferenca: 760 });
    expect(g.motivo).toBe('os valores diferem em R$ 760,00 — o casar 1×1 é ao centavo');
  });

  it('N × 1 cru que fecha ao centavo: "Desmembrar em 4", habilitado (Terra Forte −63.716,00)', () => {
    const g = gestoDaSelecao({ planilha: p(-16150, -15963, -15816.8, -15786.2), sistema: c(-63716) });
    expect(g).toMatchObject({ forma: 'desmembrar', rotulo: 'Desmembrar em 4', habilitado: true, motivo: null });
    expect(g.somaPlanilha).toBe(-63716);
    expect(g.diferenca).toBe(0);
  });

  it('N × 1 cru que NÃO fecha: desabilitado, com a frase do motivoDoDesmembrar (a mesma da RPC)', () => {
    const g = gestoDaSelecao({ planilha: p(-16150, -15963, -15816.8), sistema: c(-63716) });
    expect(g.forma).toBe('desmembrar');
    expect(g.rotulo).toBe('Desmembrar em 3');
    expect(g.habilitado).toBe(false);
    expect(g.diferenca).toBe(15786.2);
    expect(g.motivo).toBe(textoSomaDifere(1578620));
  });

  it('1 × N todos crus: "Juntar 2 nesta linha"', () => {
    expect(gestoDaSelecao({ planilha: p(-107521.6), sistema: c(-63716, -43805.6) }))
      .toMatchObject({ forma: 'juntar', rotulo: 'Juntar 2 nesta linha', habilitado: true, diferenca: 0 });
  });

  it('cru misturado num bloco (1 × N misto, N × M com cru): desabilitado, "desmembre ou case 1×1"', () => {
    const misto = [...c(-63716), ...s(-43805.6)];
    for (const sel of [
      { planilha: p(-107521.6), sistema: misto },
      { planilha: p(-63716, -43805.6), sistema: misto },
      { planilha: p(-1, -2), sistema: c(-1, -2) },
    ]) {
      expect(gestoDaSelecao(sel)).toMatchObject({ forma: null, habilitado: false, motivo: MOTIVO_CRU_NO_BLOCO });
    }
    expect(MOTIVO_CRU_NO_BLOCO).toBe('há lançamento sem classificação no bloco: desmembre ou case 1×1');
  });

  /* MUTAÇÃO: o bloco que fecha só é bloco porque TODOS são classificados — trocar UM por cru derruba o caso pela razão
     certa (deixa de ser bloco e passa a ser "desmembre ou case 1×1"), provando que o teste mede o `cru` e não a soma. */
  it('mutação: o mesmo bloco que fecha, com UM lançamento cru, deixa de ser bloco', () => {
    const lancs = s(-3000, -2000);
    expect(gestoDaSelecao({ planilha: p(-2500, -2500), sistema: lancs }).forma).toBe('bloco');
    const comCru = [lancs[0], { ...lancs[1], cru: true }];
    expect(gestoDaSelecao({ planilha: p(-2500, -2500), sistema: comCru }))
      .toMatchObject({ forma: null, habilitado: false, motivo: MOTIVO_CRU_NO_BLOCO });
  });

  it('a soma é com sinal e ao centavo (sem resíduo de ponto flutuante)', () => {
    const g = gestoDaSelecao({ planilha: p(-0.1, -0.2), sistema: c(-0.3) });
    expect(g.somaPlanilha).toBe(-0.3);
    expect(g.diferenca).toBe(0);
    expect(g.habilitado).toBe(true);
    expect(gestoDaSelecao({ planilha: p(-0.1, -0.2), sistema: s(-0.3) })).toMatchObject({ forma: 'bloco', habilitado: true });
  });

  it('nenhuma frase diz que a forma não grava (a frase do 2b-tela saiu)', () => {
    for (const sel of [
      { planilha: p(-1), sistema: s(-1) }, { planilha: p(-1), sistema: c(-1) }, { planilha: p(-1, -2), sistema: s(-1, -2) },
      { planilha: p(-1, -2), sistema: s(-9) }, { planilha: p(-1), sistema: c(-1, -9) },
    ]) {
      expect(gestoDaSelecao(sel).motivo ?? '').not.toMatch(/sem gravação|tem gravação/);
    }
  });
});
