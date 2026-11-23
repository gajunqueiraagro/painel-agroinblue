/**
 * DRE-PAINEL-01 + DRE-MENSAL-01 · PR-A — os casos do Art. 19, item 10, do briefing:
 * limiar 20%/R$ 10 mil · "+ N itens" · a ponte fecha ao centavo · média e desvio-padrão · ordem por efeito ·
 * "—" não dispara; e o fixture real (NJ out/26 × out/25, a Meta de out/26, Vera out/26 × out/25), com a prova
 * dos números contra a grade do DRE (a linha do grupo, o custeio do Resumido, o R$/ha).
 *
 * O fixture é a `fn_dre_pecuaria` do proto em 20/11 10:45, DEPOIS dos lotes 115600 (ágio provisório) e
 * 115610 (at_vendida, fora_do_dre, p1_fonte): os números de out/26 NÃO são os do mock de 19/11 (a Variação
 * por produção do NJ passou de −1,22 mi para +2,04 mi com o ágio fora dela).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerForaDoDre, lerLinhas, type DrePecLinhas } from '@/hooks/useDrePecuaria';
import { centrosDoBloco } from '@/components/agri/drePecRegua';
import {
  colunaMedia, composicaoEMercado, contorno, CONTORNO_MIN_LINHA, CONTORNO_MIN_SUBLINHA, curto, custoPorArrobaProduzida,
  custoTotal, desvio, desvioPadrao, leituraDoAno, leituraDoMes, media, mesesDaMedia12, noMes, oQueMudou, pctCurto,
  deltaDaLinha, horizonteDe, linhasDaPonte, ponteDoLucroOperacional, rsPorArrobaVendida, seloDeConfianca, type EntradaSelo, type MesDoAno,
} from './leitura';

const BRUTO: Record<string, unknown> = JSON.parse(readFileSync(`${process.cwd()}/src/lib/dre/leitura.fixture.json`, 'utf-8'));
const F = (k: string): DrePecLinhas => {
  if (!(k in BRUTO)) throw new Error(`fixture sem ${k}`);
  return lerLinhas(BRUTO[k]);
};
/** O recorte do fixture com campos trocados — para os casos sintéticos sobre um número real. */
const com = (k: string, troca: Record<string, unknown>): DrePecLinhas => {
  const o: Record<string, unknown> = {};
  const v = BRUTO[k];
  if (v && typeof v === 'object') for (const [c, x] of Object.entries(v)) o[c] = x;
  return lerLinhas({ ...o, ...troca });
};
const NJ25 = F('nj-2025-10');
const NJ26 = F('nj-2026-10');
const META = F('nj-2026-10-meta');
const VERA25 = F('vera-2025-10');
const VERA26 = F('vera-2026-10');
const MESES_NJ = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const centavos = (v: number) => Math.round(v * 100);

describe('o fixture é a cascata da RPC (prova da transcrição e da identidade da ponte)', () => {
  it('em todo recorte: lucro operacional = RL + VPB − reposição − CV − CF − rateio, e VBP/margem, ao centavo', () => {
    const chaves = Object.keys(BRUTO).filter(k => !k.startsWith('_'));
    expect(chaves.length).toBe(16);
    let provados = 0;
    for (const k of chaves) {
      const l = F(k);
      if (l.vpb_operacional == null || l.resultado_operacional == null || l.vbp == null || l.margem == null) continue;
      expect(centavos(l.receita_liquida + l.vpb_operacional - l.reposicao), `${k} vbp`).toBe(centavos(l.vbp));
      expect(centavos(l.vbp - l.custo_variavel), `${k} margem`).toBe(centavos(l.margem));
      expect(centavos(l.margem - l.custo_fixo - l.rateio_adm), `${k} lucro op`).toBe(centavos(l.resultado_operacional));
      provados += 1;
    }
    expect(provados).toBe(15); // só a Meta (vpb null) fica fora
  });

  it('o leitor traz os campos do lote 115610: @ vendidas, fora do DRE (null na Meta e nas linhas sem ele)', () => {
    expect(NJ26.producao.at_vendida).toBe(1701.07);
    expect(NJ26.producao.cab_vendida).toBe(99);
    expect(NJ26.fora_do_dre).toEqual({ n: 2, valor: 399785.89, por_origem: [{ n: 2, valor: 399785.89, origem_tipo: 'oc:obrigacao:principal:recebimento', origem_lancamento: 'operacao_comercial' }] });
    expect(META.fora_do_dre).toBeNull();
    expect(F('nj-2026-05').fora_do_dre).toBeNull(); // o mês sem a chave no fixture
    expect(lerForaDoDre({ n: 'x', valor: 1 })).toBeNull();
    expect(lerForaDoDre([1])).toBeNull();
    expect(lerLinhas({}).producao.at_vendida).toBeNull();
  });
});

describe('desvio: o limiar de 20% E R$ 10 mil', () => {
  it('nas bordas', () => {
    expect(desvio(100_000, 120_000).comDesvio).toBe(true);
    expect(desvio(100_000, 119_999.99).comDesvio).toBe(false);
    expect(desvio(100_000, 80_000).comDesvio).toBe(true);
    expect(desvio(40_000, 49_000).comDesvio).toBe(false); // 22,5% mas só R$ 9 mil
    expect(desvio(1_000_000, 1_150_000).comDesvio).toBe(false); // R$ 150 mil mas 15%
    expect(desvio(0.1 + 0.2, 10_000.3).comDesvio).toBe(true); // centavos, não ponto flutuante
  });
  it('base zero: o % é "—" e decide só o R$', () => {
    expect(desvio(0, 10_000)).toEqual({ delta: 10_000, pct: null, comDesvio: true });
    expect(desvio(0, 9_999.99).comDesvio).toBe(false);
  });
  it('"—" não dispara', () => {
    expect(desvio(null, 1_000_000)).toEqual({ delta: null, pct: null, comDesvio: false });
    expect(desvio(1_000_000, null).comDesvio).toBe(false);
  });
});

describe('"O que mudou" e "+ N itens sem desvio"', () => {
  it('NJ out/26 × out/25, Custo variável: abre 4 e junta 3 (os números do mock)', () => {
    const g = oQueMudou(NJ25, NJ26, 'variavel');
    expect(g.comDesvio.map(c => c.centro)).toEqual(['Nutrição', 'Pastagem', 'Reprodução', 'Sanidade']);
    expect(centavos(g.comDesvio[0].delta)).toBe(centavos(-283956.80));
    expect(g.semDesvio).toEqual({ n: 3, base: 3332, atual: 1341.13 });
  });
  it('NJ out/26 × out/25, Custo fixo: abre 4 e junta 2', () => {
    const g = oQueMudou(NJ25, NJ26, 'fixo');
    expect(g.comDesvio.map(c => `${c.centro} ${centavos(c.delta)}`)).toEqual([
      'Impostos 1094936', 'Manutenção Fazenda 1966634', 'Mão de Obra 3715781', 'Máquinas -1275718',
    ]);
    expect(g.semDesvio).toEqual({ n: 2, base: 30591.97, atual: 19582.53 });
  });
  it('prova contra a grade: as abertas + o "+ N" somam a linha do grupo nas duas colunas, ao centavo', () => {
    const pares: [DrePecLinhas, DrePecLinhas][] = [[NJ25, NJ26], [META, NJ26], [VERA25, VERA26]];
    const grupos: [string, 'custo_variavel' | 'custo_fixo' | 'vendas'][] = [['variavel', 'custo_variavel'], ['fixo', 'custo_fixo'], ['venda', 'vendas']];
    for (const [base, atual] of pares) {
      for (const [bloco, chave] of grupos) {
        const g = oQueMudou(base, atual, bloco);
        const sa = g.comDesvio.reduce((s, c) => s + c.atual, 0) + (g.semDesvio?.atual ?? 0);
        const sb = g.comDesvio.reduce((s, c) => s + c.base, 0) + (g.semDesvio?.base ?? 0);
        expect(centavos(sa), `${bloco} atual`).toBe(centavos(atual[chave]));
        expect(centavos(sb), `${bloco} base`).toBe(centavos(base[chave]));
        expect(centavos(sa)).toBe(centavos(centrosDoBloco(atual, bloco).reduce((s, c) => s + c.valor, 0)));
      }
    }
  });
  it('centro que só existe numa coluna vale zero na outra; sem comparação, nada abre', () => {
    const g = oQueMudou(VERA25, VERA26, 'venda');
    expect(g.comDesvio.map(c => `${c.centro} ${c.base}→${c.atual} ${c.pct}`)).toEqual(['Abates 0→215969.33 null']);
    expect(g.semDesvio).toEqual({ n: 1, base: 0, atual: 4290 });
    const sem = oQueMudou(null, NJ26, 'variavel');
    expect(sem.comDesvio).toEqual([]);
    expect(sem.semDesvio?.n).toBe(7); // os 7 centros variáveis do NJ em out/26
  });
});

describe('a ponte do lucro operacional fecha ao centavo', () => {
  it('NJ out/25 → out/26', () => {
    const p = ponteDoLucroOperacional(NJ25, NJ26);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.degraus.map(d => d.efeito)).toEqual([-202109.87, 2110704.6, 0, 450339.14, -44006.89, 14015.33]);
    expect(p.fecha).toBe(true);
    expect(p.semExplicacao).toBe(0);
    expect(centavos(p.inicio + p.degraus.reduce((s, d) => s + (d.efeito ?? 0), 0))).toBe(centavos(p.fim));
  });
  it('Vera (valores de 3 casas, VALOR-3-CASAS): o resto do arredondamento vai para o maior degrau e fecha', () => {
    const p = ponteDoLucroOperacional(VERA25, VERA26);
    if (!p) throw new Error('sem ponte');
    expect(p.fecha).toBe(true);
    expect(centavos(p.inicio + p.degraus.reduce((s, d) => s + (d.efeito ?? 0), 0))).toBe(centavos(p.fim));
  });
  it('contra a Média 12 meses (média de 12 chamadas) também fecha', () => {
    const cols = MESES_NJ.slice(0, 12).map(m => F(`nj-${m}`));
    const med = colunaMedia(cols);
    if (!med) throw new Error('sem média');
    expect(med.n).toBe(12);
    const p = ponteDoLucroOperacional(med.linhas, NJ26);
    expect(p?.fecha).toBe(true);
  });
  it('D-B3: na média, o mês SEM venda (jan/26, @ nula da RPC) conta 0 @ — R$/@ = vendas somadas ÷ @ somadas; @ nula COM venda segue "—"', () => {
    const cols = MESES_NJ.slice(0, 12).map(m => F(`nj-${m}`));
    expect(cols.some(c => c.vendas === 0 && c.producao.at_vendida == null)).toBe(true);
    const med = colunaMedia(cols);
    expect(rsPorArrobaVendida(med?.linhas ?? null)).toBeCloseTo(15444725.73 / 44342.81, 6);
    expect(Math.round((rsPorArrobaVendida(med?.linhas ?? null) ?? 0) * 100) / 100).toBe(348.3);
    const nov = BRUTO['nj-2025-11'];
    const prodNov = nov && typeof nov === 'object' && 'producao' in nov ? nov.producao : null;
    const semArroba = com('nj-2025-11', { producao: { ...(prodNov && typeof prodNov === 'object' ? prodNov : {}), at_vendida: null } });
    expect(semArroba.vendas).toBeGreaterThan(0);
    const comVendaSemArroba = cols.map((c, i) => (i === 1 ? semArroba : c));
    expect(colunaMedia(comVendaSemArroba)?.linhas.producao.at_vendida).toBeNull();
  });
  it('contra a Meta (D2): a Variação por produção é "—" (null, não zero), não fecha e o resto é o degrau "sem meta"', () => {
    const p = ponteDoLucroOperacional(META, NJ26);
    if (!p) throw new Error('sem ponte');
    const vpb = p.degraus.find(d => d.chave === 'vpb_operacional');
    expect(vpb?.efeito).toBeNull();
    expect(p.fecha).toBe(false);
    expect(p.semExplicacao).toBe(-878730.82);
  });
  it('sem lucro operacional numa ponta, não há ponte', () => {
    expect(ponteDoLucroOperacional(lerLinhas({ resultado_operacional: null }), NJ26)).toBeNull();
    expect(ponteDoLucroOperacional(null, NJ26)).toBeNull();
  });
  it('resto maior que arredondamento não se esconde: fecha = false', () => {
    const torta = com('nj-2026-10', { resultado_operacional: 2098905.63 });
    const p = ponteDoLucroOperacional(NJ25, torta);
    expect(p?.fecha).toBe(false);
    expect(p?.semExplicacao).toBe(100);
  });
});

describe('média, desvio-padrão e contorno', () => {
  it('média com N; um "—" faz a média "—"', () => {
    expect(media([1, 2, 3, 6])).toEqual({ valor: 3, n: 4 });
    expect(media([1, null, 3])).toEqual({ valor: null, n: 3 });
    expect(media([])).toEqual({ valor: null, n: 0 });
  });
  it('desvio-padrão populacional', () => {
    expect(desvioPadrao([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(desvioPadrao([])).toBeNull();
  });
  it('NJ 2026, Custo variável: julho (R$ 978 mil) foge da média dos outros (R$ 427 mil); agosto não', () => {
    const jan = MESES_NJ.indexOf('2026-01');
    const cv = MESES_NJ.slice(jan).map(m => F(`nj-${m}`).custo_variavel);
    const jul = contorno(cv, 6, CONTORNO_MIN_LINHA);
    expect(jul.foraDoPadrao).toBe(true);
    expect(Math.round(jul.mediaOutros ?? 0)).toBe(426601);
    expect(contorno(cv, 7, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false);
  });
  it('as três condições são E: o mínimo segura, o 60% segura, os 2 desvios seguram', () => {
    expect(contorno([10, 10, 10, 100], 3, CONTORNO_MIN_SUBLINHA).foraDoPadrao).toBe(false); // mínimo
    expect(contorno([1e6, 1e6, 1e6, 1.5e6], 3, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false); // 50% < 60%
    expect(contorno([0, 2e6, 0, 2e6, 2e6], 4, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false); // < 2 desvios
    expect(contorno([1e5, 1e5, 1e5, 9e5], 3, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(true);
  });
  it('"—" não dispara, nem com 1 outro mês só', () => {
    expect(contorno([1e5, null, 1e5, 9e5], 3, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false);
    expect(contorno([1e5, 1e5, null], 2, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false);
    expect(contorno([1e5, 9e5], 1, CONTORNO_MIN_LINHA).foraDoPadrao).toBe(false);
  });
  it('os 12 meses da média são os 12 antes do mês (virando o ano)', () => {
    expect(mesesDaMedia12('2026-10')).toEqual(MESES_NJ.slice(0, 12));
    expect(mesesDaMedia12('2026-01')[0]).toBe('2025-01');
    expect(mesesDaMedia12('2026-01')[11]).toBe('2025-12');
  });
  it('a coluna média: a Meta (vpb "—") num dos meses faz a VPB média "—"; o custo segue', () => {
    const med = colunaMedia([NJ26, META]);
    expect(med?.linhas.vpb_operacional).toBeNull();
    expect(med?.linhas.custo_variavel).toBeCloseTo((266770.83 + 366547.95) / 2, 6);
    expect(colunaMedia([])).toBeNull();
  });
});

describe('razões (Art. 15) e "No mês"', () => {
  it('NJ out/26: R$/@ vendida, custo por @ produzida, custo total/ha', () => {
    expect(rsPorArrobaVendida(NJ26)?.toFixed(2)).toBe('361.08');
    expect(custoTotal(NJ26)).toBeCloseTo(553193.79, 6);
    expect(custoPorArrobaProduzida(NJ26)?.toFixed(2)).toBe('151.13');
    const n = noMes(NJ25, NJ26);
    expect(n.custoTotalHa.valor?.toFixed(2)).toBe('113.42');
    expect(n.lucroOpHa.valor?.toFixed(2)).toBe((2098805.63 / 4877.6).toFixed(2));
    expect(n.lucroOpHa.delta?.toFixed(2)).toBe((2098805.63 / 4877.6 - -230136.68 / 4999.9).toFixed(2));
  });
  it('"—" e não zero: Meta sem @ produzida, Vera out/25 sem vendas, sem área', () => {
    expect(custoPorArrobaProduzida(META)).toBeNull();
    expect(rsPorArrobaVendida(VERA25)).toBeNull();
    expect(noMes(null, lerLinhas({ resultado_operacional: 10 })).lucroOpHa).toEqual({ valor: null, delta: null, total: 10, pct: null });
  });
  it('composição e mercado pela fonte (D3)', () => {
    const cm = composicaoEMercado(NJ26);
    expect(cm.composicao?.toFixed(4)).toBe('0.0753');
    expect(cm.mercado?.toFixed(4)).toBe('0.0758');
  });
  it('formato curto das frases', () => {
    expect(curto(1_156_673.7)).toBe('1,16 mi');
    expect(curto(-450_339.14)).toBe('450 mil');
    expect(curto(999.4)).toBe('999');
    expect(curto(999_996)).toBe('1,00 mi');
    expect(pctCurto(-0.25)).toBe('25%');
    expect(pctCurto(0.2347)).toBe('23,5%');
  });
});

describe('leitura do mês', () => {
  const nj = () => leituraDoMes({ base: NJ25, atual: NJ26, comparacao: 'ano_anterior', rotuloBase: 'out/25', notasALancar: 91 });

  it('NJ out/26 × out/25: as 5 pelo |efeito|, os "!" com vaga garantida (o Rateio fica fora)', () => {
    const l = nj();
    expect(l.map(i => `${i.anomalia ? '!' : '·'}${i.id}`)).toEqual(['!vpb_operacional', '·custo_variavel', '·vendas', '·custo_fixo', '!juros']);
    expect(l.map(i => i.titulo)).toEqual([
      'Variação por produção subiu R$ 2,11 mi',
      'Custo variável R$ 450 mil menor',
      'Vendas 25% menores',
      'Custo fixo 23,5% maior',
      'Despesas financeiras zeradas',
    ]);
    expect(l[1].frase).toBe('Nutrição −284 mil e Reprodução −136 mil. 91 notas em A lançar (das Notas da Receita).');
    expect(l[1].destino).toEqual({ tipo: 'notas_a_lancar' });
    expect(l[2].frase).toBe('R$ 614 mil contra R$ 819 mil em out/25. 1.701 @ vendidas a R$ 361,08/@, contra 3.315 @ a R$ 246,93/@.');
    expect(l[0].frase).toBe('R$ 2,04 mi contra R$ −67 mil em out/25. Composição +7,5% e mercado +7,6% no mês.');
    expect(l[3].frase).toBe('Mão de Obra +37 mil, Manutenção Fazenda +20 mil e Máquinas −13 mil.');
    expect(l[4].frase).toBe('Era R$ 30 mil em out/25. Estimativa sem base neste mês?');
  });

  it('mesmos fatos, mesma resposta (duas leituras iguais; a ordem dos centros na entrada não muda nada)', () => {
    expect(nj()).toEqual(nj());
    const embaralhado: DrePecLinhas = { ...NJ26, centros: NJ26.centros.slice().reverse() };
    const a = leituraDoMes({ base: NJ25, atual: embaralhado, comparacao: 'ano_anterior', rotuloBase: 'out/25', notasALancar: 91 });
    expect(a.map(i => [i.id, i.titulo, i.frase])).toEqual(nj().map(i => [i.id, i.titulo, i.frase]));
  });

  it('contra a Meta (D2): sem Variação por produção e sem a regra dos juros', () => {
    const l = leituraDoMes({ base: META, atual: NJ26, comparacao: 'meta', rotuloBase: 'a Meta' });
    expect(l.find(i => i.id === 'vpb_operacional')).toBeUndefined();
    expect(l.find(i => i.id === 'juros')).toBeUndefined();
    expect(l.map(i => i.id)).toEqual(['vendas', 'custo_variavel', 'custo_fixo', 'rateio_adm']); // −179 · +100 · −47 · +36 mil
    /* a guarda é a COMPARAÇÃO, não o nulo: uma Meta que trouxesse VPB e juros continua fora das duas regras */
    const metaCheia = com('nj-2026-10-meta', { vpb_operacional: -500000, juros: 30159 });
    const l2 = leituraDoMes({ base: metaCheia, atual: NJ26, comparacao: 'meta', rotuloBase: 'a Meta' });
    expect(l2.map(i => i.id)).toEqual(['vendas', 'custo_variavel', 'custo_fixo', 'rateio_adm']);
  });

  it('Vera: vendas que nasceram no mês (base zero) — o lado sem venda diz "sem venda" (D-B3), nunca "— a R$ —/@"', () => {
    const l = leituraDoMes({ base: VERA25, atual: VERA26, comparacao: 'ano_anterior', rotuloBase: 'out/25' });
    const v = l.find(i => i.id === 'vendas');
    expect(v?.titulo).toBe('Vendas +R$ 220 mil');
    expect(v?.frase).toBe('R$ 220 mil contra R$ 0 em out/25. 645 @ vendidas a R$ 341,39/@; out/25 sem venda.');
    const inversa = leituraDoMes({ base: VERA26, atual: VERA25, comparacao: 'ano_anterior', rotuloBase: 'out/26' }).find(i => i.id === 'vendas');
    expect(inversa?.frase).toBe('R$ 0 contra R$ 220 mil em out/26. Nenhuma venda no mês, contra 645 @ a R$ 341,39/@.');
  });

  it('"—" não dispara e sem comparação não há leitura', () => {
    expect(leituraDoMes({ base: null, atual: NJ26, comparacao: 'ano_anterior', rotuloBase: '' })).toEqual([]);
    const semVpb = com('nj-2025-10', { vpb_operacional: null, juros: null });
    const l = leituraDoMes({ base: semVpb, atual: NJ26, comparacao: 'ano_anterior', rotuloBase: 'out/25' });
    expect(l.find(i => i.id === 'vpb_operacional' || i.id === 'juros')).toBeUndefined();
  });
});

describe('leitura do ano', () => {
  const ROT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const ano = (conciliados: Record<string, boolean>): MesDoAno[] => ROT.map((rotulo, i) => {
    const anoMes = `2026-${String(i + 1).padStart(2, '0')}`;
    return { anoMes, rotulo, linhas: i < 10 ? F(`nj-${anoMes}`) : null, conciliado: i < 10 ? (conciliados[anoMes] ?? true) : null };
  });

  it('NJ 2026: até 6, fora do padrão pelo |efeito|, e os não conciliados com vaga no fim; o futuro fica fora', () => {
    const l = leituraDoAno(ano({ '2026-07': false, '2026-10': false }));
    expect(l.length).toBeLessThanOrEqual(6);
    expect(l[l.length - 1]).toMatchObject({ id: 'nao-conciliados', titulo: 'Jul e Out ainda não conciliados' });
    expect(l.find(i => i.id === 'custo_variavel@2026-07')?.titulo).toBe('Jul · Custo variável R$ 978 mil');
    expect(l.find(i => i.id === 'custo_variavel@2026-07')?.frase).toBe('Média dos outros meses: R$ 427 mil.');
    const efeitos = l.filter(i => i.id.includes('@')).map(i => Math.abs(i.efeito));
    expect(efeitos).toEqual(efeitos.slice().sort((a, b) => b - a));
    expect(l.some(i => i.id.endsWith('@2026-11'))).toBe(false);
    expect(leituraDoAno(ano({}))).toEqual(leituraDoAno(ano({})));
  });

  it('"Mercado só aparece em …" só quando há meses sem mercado (pós-115600, o NJ tem mercado todo mês: a nota não sai)', () => {
    expect(leituraDoAno(ano({})).find(i => i.id === 'mercado-meses')).toBeUndefined();
    const sint: MesDoAno[] = ['Jan', 'Fev', 'Mar'].map((rotulo, i) => ({
      anoMes: `2026-0${i + 1}`, rotulo, linhas: lerLinhas({ efeito_mercado: i === 1 ? 0 : 1000 }),
    }));
    expect(leituraDoAno(sint).find(i => i.id === 'mercado-meses')?.titulo).toBe('Mercado só aparece em jan e mar');
    const comTraco = sint.map((m, i) => (i === 1 ? { ...m, linhas: lerLinhas({ efeito_mercado: null }) } : m));
    expect(leituraDoAno(comTraco).find(i => i.id === 'mercado-meses')).toBeUndefined();
  });
});

describe('selo de confiança (P9)', () => {
  const tudo: EntradaSelo = { conciliado: true, pastosFechados: true, valorRebanhoFechado: true, precoMudou: true, p1_fonte: 'fechamento' };
  it('alta, média, baixa', () => {
    expect(seloDeConfianca(tudo)).toEqual({ grau: 'alta', falta: [] });
    expect(seloDeConfianca({ ...tudo, precoMudou: false }).grau).toBe('media');
    expect(seloDeConfianca({ ...tudo, p1_fonte: 'zero' }).falta).toEqual([{ motivo: 'Rebanho do fim do mês pelo zero (sem gado), não pelo fechamento', destino: 'valor_rebanho' }]);
    expect(seloDeConfianca({ ...tudo, conciliado: false }).grau).toBe('baixa');
  });
  it('o que não se verifica não sobe o grau; sem status de conciliação o selo é "—"', () => {
    expect(seloDeConfianca({ ...tudo, pastosFechados: null })).toEqual({ grau: 'media', falta: [{ motivo: 'Não consegui verificar o fechamento de pastos', destino: 'fechamento_pastos' }] });
    expect(seloDeConfianca({ ...tudo, conciliado: null }).grau).toBeNull();
  });
  it('NJ out/26 depois do 115610: p1_fonte "fechamento" no total (antes era "zero" todo mês)', () => {
    expect(NJ26.p1_fonte).toBe('fechamento');
    expect(seloDeConfianca({ ...tudo, p1_fonte: NJ26.p1_fonte }).grau).toBe('alta');
  });
});

/* ══════════════ DRE-PAINEL-02 (Gabriel 23/11 07:41) ══════════════ */

describe('DRE-PAINEL-02 (2): a ponte em lista — o fato da linha, o efeito no lucro com sinal e a cor do lucro', () => {
  const linhas = (b: DrePecLinhas, a: DrePecLinhas) => {
    const p = ponteDoLucroOperacional(b, a);
    if (!p) throw new Error('sem ponte');
    return linhasDaPonte(b, a, p, 'out/25', 'out/26');
  };
  it('NJ out/25 → out/26: 1ª e última = "Lucro operacional <período>" em R$ mi; cada passo diz o fato e o efeito com sinal', () => {
    expect(linhas(NJ25, NJ26).map(l => [l.rotulo, l.texto, l.tom])).toEqual([
      ['Lucro operacional out/25', '−0,23', 'total'],
      ['Receita menor (−25%)', '−0,20', 'tira'],
      ['Produção maior (+3.168,9%)', '+2,11', 'ajuda'],
      ['Reposição igual', '0,00', 'neutro'],
      ['Custo variável menor (−62,8%)', '+0,45', 'ajuda'],
      ['Custo fixo maior (+23,5%)', '−0,04', 'tira'],
      ['Rateio menor (−20,3%)', '+0,01', 'ajuda'],
      ['Lucro operacional out/26', '2,10', 'total'],
    ]);
  });
  it('a cor é do LUCRO, não da linha: custo menor = verde (ajuda), receita menor = vermelho (tira); o número inteiro vai no title', () => {
    const l = linhas(NJ25, NJ26);
    const cv = l.find(x => x.chave === 'custo_variavel');
    const rl = l.find(x => x.chave === 'receita_liquida');
    expect(cv?.rotulo.includes('menor') && cv.tom).toBe('ajuda');
    expect(rl?.rotulo.includes('menor') && rl.tom).toBe('tira');
    expect(cv?.titulo).toBe('Efeito no lucro operacional: +R$ 450.339,14');
    expect(l[0].titulo).toMatch(/^R\$ −2\d{2}\.\d{3},\d{2}$/); // o lucro de out/25 inteiro, negativo
  });
  it('os passos somam a diferença das pontas ao centavo (os números são os da ponte)', () => {
    const l = linhas(VERA25, VERA26);
    const passos = l.slice(1, -1).reduce((s, x) => s + (x.valor ?? 0), 0);
    expect(centavos((l[0].valor ?? 0) + passos)).toBe(centavos(l[l.length - 1].valor ?? 0));
    /* base zero (Vera out/25 sem receita): o fato sem percentual */
    expect(l.find(x => x.chave === 'receita_liquida')?.rotulo).toBe('Receita maior');
  });
  it('DRE-PAINEL-03: contra a Meta — "Lucro da meta" → "Lucro realizado", passos "acima/abaixo da meta"; a produção (sem meta, "—" na grade) carrega o resto, cinza', () => {
    const p = ponteDoLucroOperacional(META, NJ26);
    if (!p) throw new Error('sem ponte');
    expect(linhasDaPonte(META, NJ26, p, 'Meta', 'out/26', 'meta').map(l => [l.rotulo, l.texto, l.tom])).toEqual([
      ['Lucro da meta', '3,07', 'total'],
      ['Receita abaixo da meta (−22,9%)', '−0,18', 'tira'],
      ['Produção: sem meta', '−0,88', 'sem'],
      ['Reposição igual à meta', '0,00', 'neutro'],
      ['Custo variável abaixo da meta (−27,2%)', '+0,10', 'ajuda'],
      ['Custo fixo acima da meta (+25,8%)', '−0,05', 'tira'],
      ['Rateio abaixo da meta (−39,7%)', '+0,04', 'ajuda'],
      ['Lucro realizado', '2,10', 'total'],
    ]);
  });
});

describe('DRE-PAINEL-02 (3): "no mês" vira "no período" quando a tela tem mais de um mês', () => {
  it('horizonteDe: um mês = mês; dois ou mais = período', () => {
    expect(horizonteDe('2026-10', '2026-10')).toBe('mes');
    expect(horizonteDe('2026-01', '2026-10')).toBe('periodo');
  });
  it('as frases da leitura usam a palavra do horizonte (o padrão segue o mês)', () => {
    const vendas = (h?: 'mes' | 'periodo') => leituraDoMes({ base: VERA26, atual: VERA25, comparacao: 'ano_anterior', rotuloBase: 'out/26',
      ...(h ? { horizonte: h } : {}) }).find(i => i.id === 'vendas')?.frase ?? '';
    expect(vendas()).toContain('Nenhuma venda no mês');
    expect(vendas('periodo')).toContain('Nenhuma venda no período');
    expect(vendas('periodo')).not.toContain('no mês');
    const vpb = leituraDoMes({ base: NJ25, atual: NJ26, comparacao: 'ano_anterior', rotuloBase: 'jan–out/25', horizonte: 'periodo' })
      .find(i => i.id === 'vpb_operacional')?.frase ?? '';
    expect(vpb).toMatch(/no período\.$/);
  });
});

describe('DRE-PAINEL-03 (Gabriel 23/11 09:34): a ponte segue o "Comparar com" e cada passo é a diferença da MESMA linha da tabela', () => {
  const somaFecha = (base: DrePecLinhas, comparacao: 'ano_anterior' | 'meta' | 'media12') => {
    const p = ponteDoLucroOperacional(base, NJ26);
    if (!p) throw new Error('sem ponte');
    const l = linhasDaPonte(base, NJ26, p, 'base', 'out/26', comparacao);
    const passos = l.slice(1, -1).reduce((s, x) => s + centavos(x.valor ?? 0), 0);
    return [passos, centavos(l[l.length - 1].valor ?? 0) - centavos(l[0].valor ?? 0)];
  };
  it('a soma dos passos = lucro do período − lucro comparado, ao centavo, nas TRÊS comparações (ano anterior, Meta, Média 12 meses)', () => {
    const [a1, b1] = somaFecha(NJ25, 'ano_anterior');
    expect(a1).toBe(b1);
    const [a2, b2] = somaFecha(META, 'meta');
    expect(a2).toBe(b2);
    const med = colunaMedia(MESES_NJ.slice(0, 12).map(m => F(`nj-${m}`)));
    if (!med) throw new Error('sem média');
    const [a3, b3] = somaFecha(med.linhas, 'media12');
    expect(a3).toBe(b3);
  });
  it('o passo é a diferença da linha da grade (`deltaDaLinha`, a mesma da coluna Δ) com o sinal do lucro', () => {
    expect(deltaDaLinha(10, 4)).toBe(6);
    expect(deltaDaLinha(null, 4)).toBeNull();
    expect(deltaDaLinha(10, undefined)).toBeNull();
    const p = ponteDoLucroOperacional(NJ25, NJ26);
    const efeito = (c: string) => p?.degraus.find(d => d.chave === c)?.efeito;
    expect(efeito('receita_liquida')).toBe(Math.round((deltaDaLinha(NJ26.receita_liquida, NJ25.receita_liquida) ?? 0) * 100) / 100);
    expect(efeito('custo_variavel')).toBe(Math.round(-(deltaDaLinha(NJ26.custo_variavel, NJ25.custo_variavel) ?? 0) * 100) / 100);
  });
});
