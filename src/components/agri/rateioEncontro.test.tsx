/**
 * DRE-RATEIO-MODAL-01 — a aba Rateio do administrativo: o total, para onde foi, a prova e o mês a mês.
 *
 * ⚠ O FIXTURE É REAL (`rateioEncontro.fixture.json`): `fn_painel_rateio_detalhe` e `fn_dre_pecuaria` lidos do proto
 *   em 06/10/2026, depois da migration 20261027193700 — NJ pecuária 2025, NJ lavoura safra 24/25 e Santa Rita 2021.
 *   Só os agregados; nenhum lançamento.
 * ⚠ A TELA NÃO FAZ CONTA, e isso se prova de dois jeitos: (1) lendo a FONTE (nenhuma soma, subtração ou
 *   `reduce` no componente nem no leitor — com o auto-teste do detector); (2) entregando um retorno em que a
 *   diferença, a soma ou uma parte NÃO fecham com o resto: a tela mostra o que o banco disse, não o que daria.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ModalValorDre, valorDaLavoura, valorDaPecuaria, type RateioDetalhe } from '@/components/agri/RateioDetalheModal';
import {
  FRASE_PARTE_MUDA, ROTULO_TODOS_OS_GRUPOS, TITULO_ARREDONDAMENTO, TITULO_TODOS_OS_GRUPOS,
} from '@/components/agri/RateioEncontro';
import { lerEncontroRateio, parteMudaNoPeriodo } from '@/lib/agri/encontroRateio';
import type { DrePecLinhas, DrePecuaria, RateioAdmPec, RecortePec } from '@/hooks/useDrePecuaria';
import fixture from '@/components/agri/rateioEncontro.fixture.json';

const txt = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const linhasPec = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0, vpb_operacional: 0, reposicao: 0,
  vbp: 0, custo_variavel: 0, margem: 0, custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null,
  resultado_periodo: 0, efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  lucro_liquido: 0, juros_proprio: 0, juros_rateado: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
  producao: { ha_medio: null, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  p0_fonte: 'fechamento', p1_fonte: 'fechamento', centros: [], centros_juros: [], ...o,
});
const pat = (cab: number) => ({ v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: cab });

/* O DRE da pecuária do NJ em 2025, como a tela o tem: `rateio_adm` e `cab_media` de cada fazenda e do total. */
const DRE_NJ: DrePecuaria = {
  periodo: { de: '2025-01', ate: '2025-12', p0: '2024-12', meses: 12 },
  rateio_adm: { pool: fixture.nj_dre_2025.rateio_adm.pool, bruto: fixture.nj_dre_2025.rateio_adm.bruto, criterio: 'cabecas medias no periodo' },
  fazendas: fixture.nj_dre_2025.fazendas.map((f, i) => ({
    fazenda_id: `f${i}`, nome: f.nome, linhas: linhasPec({ rateio_adm: f.rateio_adm, patrimonio: pat(f.cab_media) }),
  })),
  total: linhasPec({ rateio_adm: fixture.nj_dre_2025.total.rateio_adm, patrimonio: pat(fixture.nj_dre_2025.total.cab_media) }),
};
/* NJ 2023: a grade do DRE soma células arredondadas e mostra 844.162,50; o resumo (round do pool) mostra 844.162,49. */
const DRE_NJ_2023: DrePecuaria = {
  periodo: { de: '2023-01', ate: '2023-12', p0: '2022-12', meses: 12 },
  rateio_adm: { pool: fixture.nj_dre_2023.rateio_adm.pool, bruto: fixture.nj_dre_2023.rateio_adm.bruto, criterio: 'cabecas medias no periodo' },
  fazendas: fixture.nj_dre_2023.fazendas.map((f, i) => ({
    fazenda_id: `g${i}`, nome: f.nome,
    linhas: linhasPec({ rateio_adm: f.rateio_adm, patrimonio: pat(f.cab_media), rateio_adm_grupos: f.rateio_adm_grupos }),
  })),
  total: linhasPec({ rateio_adm: fixture.nj_dre_2023.total.rateio_adm, patrimonio: pat(fixture.nj_dre_2023.total.cab_media),
    rateio_adm_grupos: fixture.nj_dre_2023.total.rateio_adm_grupos }),
};
const rateioPec = (payload: unknown): RateioAdmPec => ({ lancamentos: [], grupos: [], naoAlocado: null, encontro: lerEncontroRateio(payload) });
const recorte = (fazendaId: string | null, rateio: number): RecortePec => ({
  fazendaId, fazendaNome: fazendaId ? 'Faz. Pureza' : 'Total', bloco: 'rateio_adm', centro: null, rotulo: 'Rateio administrativo',
  de: '2025-01', ate: '2025-12', cenario: 'realizado', soRateio: true,
  celula: { direto: null, rateio, grupo: null, cabMedia: 6497, meses: 12, comRateio: true },
});

function abrirPec(payload: unknown, o: { dre?: DrePecuaria | null; fazendaId?: string | null } = {}) {
  const dre = o.dre === undefined ? DRE_NJ : o.dre;
  return render(<ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio"
    valor={valorDaPecuaria({ recorte: recorte(o.fazendaId ?? null, 886574.04), lancamentos: [], rateio: rateioPec(payload), dre, periodoRotulo: 'Ano 2025' })} />);
}
/* O payload do banco chega ao modal da lavoura por cast do hospedeiro; aqui o fixture entra pelo mesmo tipo, lido do JSON. */
const comoDetalhe = (v: unknown): RateioDetalhe => JSON.parse(JSON.stringify(v));
function abrirLav(payload: unknown) {
  return render(<ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio"
    valor={valorDaLavoura(comoDetalhe(payload), 'admin', { rotulo: 'Administrativo', cultura: 'amendoim', safra: '24/25-Lav', area: 186.5, pool: false })} />);
}
const linhaDestino = (chave: string) => document.querySelector(`[data-linha="${chave}"]`);
const textoDaLinha = (chave: string) => txt(linhaDestino(chave)?.textContent);

/* ══════════════════════════ a fonte: a tela não faz conta ══════════════════════════ */

/** Tira comentários e textos (aspas, crases) — o que sobra é código; depois procura conta. */
function contasNaFonte(fonte: string): string[] {
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const semTexto = semComentario.replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const achados: string[] = [];
  for (const re of [/[\w)\]]\s+[+\-*]\s+[\w(]/g, /\.reduce\(/g, /[+\-*/]=(?!=)/g]) {
    for (const m of semTexto.matchAll(re)) achados.push(m[0]);
  }
  return achados;
}

describe('a tela do encontro de contas não soma nem subtrai', () => {
  it('o detector sabe achar: soma, subtração, reduce e acumulador', () => {
    expect(contasNaFonte('const x = a + b;')).toHaveLength(1);
    expect(contasNaFonte('const d = bruto - soma;')).toHaveLength(1);
    expect(contasNaFonte('xs.reduce((a, b) => a, 0)')).toHaveLength(1);
    expect(contasNaFonte('t += v;')).toHaveLength(1);
    /* e não acusa texto nem comentário */
    expect(contasNaFonte("const s = 'a + b'; /* c - d */ // e + f")).toHaveLength(0);
  });
  for (const arquivo of ['src/components/agri/RateioEncontro.tsx', 'src/lib/agri/encontroRateio.ts']) {
    it(`${arquivo}: nenhuma conta`, () => {
      expect(contasNaFonte(readFileSync(resolve(process.cwd(), arquivo), 'utf8'))).toEqual([]);
    });
  }
  it('os números da aba saem de `resumo` / `por_mes` / `por_mes_total`, pelo leitor', () => {
    const leitor = readFileSync(resolve(process.cwd(), 'src/lib/agri/encontroRateio.ts'), 'utf8');
    for (const chave of ['p?.resumo', 'p?.por_mes_total', 'p.por_mes', 'r.partes', 'r.soma', 'r.diferenca', 'r.bruto']) {
      expect(leitor).toContain(chave);
    }
  });
});

/* ══════════════════════════ o leitor ══════════════════════════ */

describe('lerEncontroRateio', () => {
  it('lê o retorno do banco como ele veio (NJ pecuária 2025)', () => {
    const e = lerEncontroRateio(fixture.nj_pec_2025);
    expect(e?.bruto).toBe(1266534.34);
    expect(e?.partes.map(p => [p.destino, p.valor, p.pct])).toEqual([
      ['pecuaria', 886574.04, 70], ['agricultura', 316633.59, 25], ['silvicultura', 63326.72, 5], ['nao_alocado', 0, 0],
    ]);
    /* fix1: cada parcela é o round do próprio cru — a soma delas passa 1 centavo do bruto, e o banco diz isso. */
    expect(e?.soma).toBe(1266534.35);
    expect(e?.arredondamento).toBe(-0.01);
    expect(e?.diferenca).toBe(0);
    expect(e?.porSafra).toBeNull();
    expect(e?.porMes).toHaveLength(12);
    expect(e?.total.pecuaria).toBe(886574.04);
  });
  it('fora do ramo admin (as três chaves nulas), payload antigo ou torto: null — nunca zeros', () => {
    expect(lerEncontroRateio({ pool: 10, resumo: null, por_mes: null, por_mes_total: null })).toBeNull();
    expect(lerEncontroRateio({ pool: 10 })).toBeNull();
    expect(lerEncontroRateio(null)).toBeNull();
    const torto = copia(fixture.nj_pec_2025);
    Reflect.deleteProperty(torto.resumo, 'diferenca');
    expect(lerEncontroRateio(torto)).toBeNull();
  });
  it('a parte muda no período só quando o % do banco muda entre meses com administrativo', () => {
    const e = lerEncontroRateio(fixture.nj_pec_2025);
    expect(e && parteMudaNoPeriodo(e, 'pecuaria')).toBe(false);
    const muda = copia(fixture.nj_pec_2025);
    muda.por_mes[3].pct_pecuaria = 95;
    const e2 = lerEncontroRateio(muda);
    expect(e2 && parteMudaNoPeriodo(e2, 'pecuaria')).toBe(true);
    expect(e2 && parteMudaNoPeriodo(e2, 'agricultura')).toBe(false);
  });
});

/* ══════════════════════════ pecuária — NJ 2025 ══════════════════════════ */

describe('Resumo · NJ pecuária 2025 (o que o banco devolveu)', () => {
  it('o total no centro, as partes com o %, a soma e a diferença zero com ✓', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(txt(screen.getByTestId('rateio-total-centro').textContent)).toBe('1.266.534,34');
    expect(textoDaLinha('bruto')).toContain('▼ 1.266.534,34');
    expect(textoDaLinha('pecuaria')).toContain('70,0%');
    expect(textoDaLinha('pecuaria')).toContain('▼ 886.574,04');
    expect(textoDaLinha('agricultura')).toContain('25,0%');
    expect(textoDaLinha('agricultura')).toContain('▼ 316.633,59');
    expect(textoDaLinha('silvicultura')).toContain('sem DRE');
    expect(textoDaLinha('silvicultura')).toContain('▼ 63.326,72');
    expect(textoDaLinha('soma')).toContain('▼ 1.266.534,35');
    /* o centavo que sobra aparece, com o sinal — e a prova da conta continua zero */
    expect(textoDaLinha('arredondamento')).toBe('Arredondamento−0,01');
    expect(linhaDestino('arredondamento')?.querySelector('td')?.getAttribute('title')).toBe(TITULO_ARREDONDAMENTO);
    expect(textoDaLinha('diferenca')).toContain('0,00 ✓');
    expect(screen.getByTestId('diferenca-zero')).toBeTruthy();
  });
  it('a atividade aberta em destaque, com o selo "este DRE" — e só ela', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(linhaDestino('pecuaria')?.getAttribute('data-destaque')).toBe('sim');
    expect(textoDaLinha('pecuaria')).toContain('este DRE');
    expect(linhaDestino('agricultura')?.getAttribute('data-destaque')).toBeNull();
    expect(document.querySelectorAll('[data-testid="rateio-bloco-destinos"] [data-destaque="sim"]')).toHaveLength(1);
    const negrito = [...screen.getByTestId('rateio-legenda').querySelectorAll('li')].filter(li => li.className.includes('font-bold'));
    expect(negrito.map(li => li.getAttribute('data-destino'))).toEqual(['pecuaria']);
  });
  it('"Não alocado" zero não aparece; a legenda só tem fatia com valor', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(linhaDestino('nao_alocado')).toBeNull();
    expect([...screen.getByTestId('rateio-legenda').querySelectorAll('li')].map(li => li.getAttribute('data-destino')))
      .toEqual(['pecuaria', 'agricultura', 'silvicultura']);
  });
  it('dentro da pecuária: as fazendas do DRE da tela, a da coluna em destaque, e o total = a parte da pecuária', () => {
    abrirPec(fixture.nj_pec_2025, { fazendaId: 'f1' });
    const bloco = screen.getByTestId('rateio-bloco-dentro');
    const linhas = [...bloco.querySelectorAll('[data-linha-dentro]')];
    /* a fazenda "Administrativo" (0 cabeças, 0 de rateio) não é linha */
    expect(linhas.map(l => txt(l.querySelector('td')?.textContent))).toEqual(['Faz. Pureza', 'Faz. Sto. Expedito']);
    expect(txt(linhas[0].textContent)).toContain('4.928');
    expect(txt(linhas[0].textContent)).toContain('▼ 672.469,89');
    expect(txt(linhas[1].textContent)).toContain('▼ 214.104,15');
    expect(linhas.map(l => l.getAttribute('data-destaque'))).toEqual(['sim', null]);
    const total = txt(screen.getByTestId('rateio-dentro-total').textContent);
    expect(total).toContain('6.497');
    expect(total).toContain('▼ 886.574,04');
    expect(within(bloco).getByTitle(/a fatia de cada fazenda muda com o período escolhido/)).toBeTruthy();
  });
  it('sem o DRE do período, a tabela de fazendas diz que não tem a divisão — e não a inventa', () => {
    abrirPec(fixture.nj_pec_2025, { dre: null });
    expect(screen.getByText('sem a divisão por fazenda neste recorte')).toBeTruthy();
    expect(txt(screen.getByTestId('rateio-dentro-total').textContent)).toContain('▼ 886.574,04');
  });
});

describe('a tela mostra o que o banco disse, não o que daria a conta', () => {
  it('diferença que o banco devolveu aparece, mesmo com bruto = soma', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.diferenca = 0.03;
    abrirPec(p);
    expect(screen.queryByTestId('diferenca-zero')).toBeNull();
    expect(txt(screen.getByTestId('diferenca-aberta').textContent)).toBe('+0,03');
    expect(screen.getByTestId('diferenca-aberta').className).toContain('text-[#b91c1c]');
  });
  it('diferença negativa: com o "−" tipográfico', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.diferenca = -1.5;
    abrirPec(p);
    expect(txt(screen.getByTestId('diferenca-aberta').textContent)).toBe('−1,50');
  });
  it('a soma é a do banco: mexer numa parte não a muda na tela', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.partes[1].valor = 1;
    abrirPec(p);
    expect(textoDaLinha('agricultura')).toContain('▼ 1,00');
    expect(textoDaLinha('soma')).toContain('▼ 1.266.534,35');
    expect(txt(screen.getByTestId('rateio-total-centro').textContent)).toBe('1.266.534,34');
  });
  it('o centro do donut é o BRUTO do banco, e a linha da soma é a SOMA do banco — dois campos, não um', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.soma = 9;
    abrirPec(p);
    expect(txt(screen.getByTestId('rateio-total-centro').textContent)).toBe('1.266.534,34');
    expect(textoDaLinha('soma')).toContain('▼ 9,00');
  });
  it('o % é o do banco: não é recalculado do valor', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.partes[0].pct = 12.3;
    abrirPec(p);
    expect(textoDaLinha('pecuaria')).toContain('12,3%');
  });
  it('estorno (parte negativa): ▲ verde com o sinal', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.partes[2].valor = -10;
    abrirPec(p);
    expect(textoDaLinha('silvicultura')).toContain('▲ −10,00');
  });
});

/* ══════════════════════════ mês a mês ══════════════════════════ */

describe('Mês a mês · NJ pecuária 2025', () => {
  it('"Resumo | Mês a mês" mora na barra, só na aba Rateio; trocar mostra os 12 meses e o Total do banco', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(screen.getByTestId('rateio-resumo')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('visao-rateio')).getByRole('button', { name: 'Mês a mês' }));
    expect(screen.queryByTestId('rateio-resumo')).toBeNull();
    expect(document.querySelectorAll('[data-mes]')).toHaveLength(12);
    const jan = txt(document.querySelector('[data-mes="2025-01"]')?.textContent);
    expect(jan).toContain('jan/25');
    expect(jan).toContain('▼ 147.007,22');
    expect(jan).toContain('▼ 102.905,05');
    expect(jan).toContain('70,0%');
    expect(jan).toContain('▼ 36.751,81');
    expect(jan).toContain('▼ 7.350,36');
    expect(jan).toContain('0,00 ✓');
    const total = txt(screen.getByTestId('rateio-mes-total').textContent);
    expect(total).toContain('▼ 1.266.534,34');
    expect(total).toContain('▼ 886.574,04');
    expect(total).toContain('▼ 316.633,59');
    expect(total).toContain('▼ 63.326,72');
    /* o arredondamento do total não ganha coluna: vai no `title` da linha */
    expect(screen.getByTestId('rateio-mes-total').getAttribute('title')).toBe(`arredondamento −0,01 · ${TITULO_ARREDONDAMENTO}`);
    /* a atividade aberta: as duas colunas da pecuária, e só elas */
    expect([...document.querySelectorAll('th[data-aberta="sim"]')].map(th => th.textContent)).toEqual(['Pec. %', 'Pecuária']);
    fireEvent.click(screen.getByRole('button', { name: 'Lançamentos' }));
    expect(screen.queryByTestId('visao-rateio')).toBeNull();
  });
  it('o Total é o `por_mes_total` do banco, não a soma das linhas', () => {
    const p = copia(fixture.nj_pec_2025);
    p.por_mes_total.pecuaria = 5;
    abrirPec(p);
    fireEvent.click(within(screen.getByTestId('visao-rateio')).getByRole('button', { name: 'Mês a mês' }));
    expect(txt(screen.getByTestId('rateio-mes-total').textContent)).toContain('▼ 5,00');
  });
  it('o slot do aviso existe sempre: vazio quando a parte não muda, com a frase quando muda', () => {
    const r = abrirPec(fixture.nj_pec_2025);
    fireEvent.click(within(screen.getByTestId('visao-rateio')).getByRole('button', { name: 'Mês a mês' }));
    expect(screen.getByTestId('rateio-mes-aviso').textContent).toBe('');
    expect(screen.getByTestId('rateio-mes-aviso').className).toContain('h-[14px]');
    r.unmount();
    const p = copia(fixture.nj_pec_2025);
    p.por_mes[5].pct_pecuaria = 95;
    abrirPec(p);
    fireEvent.click(within(screen.getByTestId('visao-rateio')).getByRole('button', { name: 'Mês a mês' }));
    expect(screen.getByTestId('rateio-mes-aviso').textContent).toBe(FRASE_PARTE_MUDA);
  });
});

/* ══════════════════════════ lavoura — NJ safra 24/25 ══════════════════════════ */

describe('NJ lavoura · safra 24/25', () => {
  it('a safra aberta vem recuada sob a agricultura, em destaque e com o selo; o total do resumo é o do banco', () => {
    abrirLav(fixture.nj_lav_2425);
    expect(txt(screen.getByTestId('rateio-total-centro').textContent)).toBe('1.228.990,13');
    expect(textoDaLinha('agricultura')).toContain('▼ 307.247,53');
    expect(textoDaLinha('agricultura')).not.toContain('este DRE');
    expect(linhaDestino('agricultura')?.getAttribute('data-destaque')).toBe('sim');
    const safra = `safra-${fixture.nj_lav_2425.resumo.agricultura_por_safra[0].safra_id}`;
    expect(textoDaLinha(safra)).toContain('Safra 24/25 Lavoura');
    expect(textoDaLinha(safra)).toContain('este DRE');
    expect(textoDaLinha(safra)).toContain('25,0%');
    expect(textoDaLinha(safra)).toContain('▼ 307.247,53');
    expect(linhaDestino(safra)?.getAttribute('data-destaque')).toBe('sim');
    /* fix1: a pecuária e a silvicultura vistas pela porta da lavoura são as do DRE da pecuária no mesmo período */
    expect(textoDaLinha('pecuaria')).toContain('▼ 860.293,09');
    expect(textoDaLinha('silvicultura')).toContain('▼ 61.449,51');
    expect(textoDaLinha('arredondamento')).toBe('Arredondamento0,00');
    expect(screen.getByTestId('arredondamento-zero')).toBeTruthy();
    expect(linhaDestino('pecuaria')?.getAttribute('data-destaque')).toBeNull();
    expect(textoDaLinha('diferenca')).toContain('0,00 ✓');
  });
  it('dentro da lavoura: as culturas das `fatias`, a aberta em destaque, e o total = a parte da safra', () => {
    abrirLav(fixture.nj_lav_2425);
    const linhas = [...screen.getByTestId('rateio-bloco-dentro').querySelectorAll('[data-linha-dentro]')];
    expect(linhas.map(l => l.getAttribute('data-linha-dentro'))).toEqual(['amendoim', 'mandioca']);
    expect(txt(linhas[0].textContent)).toContain('186,50');
    expect(txt(linhas[0].textContent)).toContain('78,9%');
    expect(txt(linhas[0].textContent)).toContain('▼ 242.495,41');
    expect(txt(linhas[1].textContent)).toContain('▼ 64.752,12');
    expect(linhas.map(l => l.getAttribute('data-destaque'))).toEqual(['sim', null]);
    expect(txt(screen.getByTestId('rateio-dentro-total').textContent)).toContain('▼ 307.247,53');
  });
  it('"outras safras" aparece quando o banco a devolve, sem selo', () => {
    const p = copia(fixture.nj_lav_2425);
    p.resumo.agricultura_por_safra.push(JSON.parse('{"safra":"outras safras","safra_id":null,"valor":100,"pct":3.4}'));
    abrirLav(p);
    expect(textoDaLinha('safra-outras')).toContain('▼ 100,00');
    /* o % é o do banco — "outras safras" inclusive */
    expect(textoDaLinha('safra-outras')).toContain('3,4%');
    expect(textoDaLinha('safra-outras')).not.toContain('este DRE');
  });
  it('mês a mês: 12 meses da safra, com a coluna "Esta safra" — e é ela a aberta', () => {
    abrirLav(fixture.nj_lav_2425);
    fireEvent.click(within(screen.getByTestId('visao-rateio')).getByRole('button', { name: 'Mês a mês' }));
    expect(document.querySelectorAll('[data-mes]')).toHaveLength(12);
    expect(txt(document.querySelector('[data-mes="2024-07"]')?.textContent)).toContain('jul/24');
    expect([...document.querySelectorAll('th[data-aberta="sim"]')].map(th => th.textContent)).toEqual(['Esta safra']);
    const total = txt(screen.getByTestId('rateio-mes-total').textContent);
    expect(total).toContain('▼ 1.228.990,13');
    expect(total).toContain('▼ 860.293,09');
    expect(total).toContain('▼ 61.449,51');
    expect(screen.getByTestId('rateio-mes-total').getAttribute('title')).toBeNull();
  });
});

/* ══════════════════════════ Santa Rita 2021 ══════════════════════════ */

describe('Santa Rita · pecuária 2021 — os 8.082,73 são silvicultura, parte própria', () => {
  it('a conta fecha em 161.654,67 com a silvicultura à vista e sem linha de "Não alocado"', () => {
    abrirPec(fixture.sr_pec_2021, { dre: null });
    expect(textoDaLinha('bruto')).toContain('▼ 161.654,67');
    expect(textoDaLinha('pecuaria')).toContain('95,0%');
    expect(textoDaLinha('pecuaria')).toContain('▼ 153.571,94');
    expect(textoDaLinha('agricultura')).toContain('0,00');
    expect(textoDaLinha('agricultura')).not.toContain('▼');
    expect(textoDaLinha('silvicultura')).toContain('▼ 8.082,73');
    expect(linhaDestino('nao_alocado')).toBeNull();
    expect(textoDaLinha('soma')).toContain('▼ 161.654,67');
    expect(textoDaLinha('diferenca')).toContain('0,00 ✓');
  });
  it('"Não alocado" com valor: a linha aparece com o motivo que a RPC escreveu (sem o da silvicultura)', () => {
    const p = copia(fixture.sr_pec_2021);
    p.resumo.partes[3].valor = 50; p.resumo.partes[3].pct = 0.1;
    const r: RateioAdmPec = { ...rateioPec(p),
      naoAlocado: { valor: 8132.73, motivos: [{ motivo: 'silvicultura sem DRE', valor: 8082.73 }, { motivo: 'mes sem chave', valor: 50 }] } };
    render(<ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio"
      valor={valorDaPecuaria({ recorte: recorte(null, 153571.94), lancamentos: [], rateio: r, dre: null, periodoRotulo: 'Ano 2021' })} />);
    expect(textoDaLinha('nao_alocado')).toContain('mes sem chave');
    expect(textoDaLinha('nao_alocado')).not.toContain('silvicultura');
    expect(textoDaLinha('nao_alocado')).toContain('▼ 50,00');
  });
});

/* ══════════════════════════ fix1 — o centavo à vista ══════════════════════════ */

describe('o arredondamento é do banco, e a linha existe sempre', () => {
  it('a linha vem depois da soma e antes da diferença, com ou sem centavo', () => {
    abrirPec(fixture.sr_pec_2021, { dre: null });
    const ordem = [...document.querySelectorAll('[data-linha]')].map(l => l.getAttribute('data-linha'));
    expect(ordem.slice(-3)).toEqual(['soma', 'arredondamento', 'diferenca']);
    expect(textoDaLinha('arredondamento')).toBe('Arredondamento0,00');
  });
  it('não é calculado na tela: bruto e soma iguais, e o banco dizendo +0,02 — aparece +0,02', () => {
    const p = copia(fixture.sr_pec_2021);
    p.resumo.arredondamento = 0.02;
    abrirPec(p, { dre: null });
    expect(txt(screen.getByTestId('arredondamento-aberto').textContent)).toBe('+0,02');
    expect(textoDaLinha('soma')).toContain('▼ 161.654,67');
    expect(textoDaLinha('bruto')).toContain('▼ 161.654,67');
  });
  it('e o contrário: bruto e soma diferentes, e o banco dizendo zero — fica "0,00"', () => {
    const p = copia(fixture.nj_pec_2025);
    p.resumo.arredondamento = 0;
    abrirPec(p);
    expect(screen.getByTestId('arredondamento-zero')).toBeTruthy();
    expect(screen.queryByTestId('arredondamento-aberto')).toBeNull();
  });
  it('retorno sem a chave `arredondamento` (banco de antes do fix1): não se desenha meio encontro', () => {
    const p = copia(fixture.nj_pec_2025);
    Reflect.deleteProperty(p.resumo, 'arredondamento');
    expect(lerEncontroRateio(p)).toBeNull();
  });
});

describe('a grade do DRE × o resumo — NJ 2023 (dívida DRE-RATEIO-TOTAL-CENTAVO-01)', () => {
  const abrir2023 = (payload: unknown, dre: DrePecuaria | null = DRE_NJ_2023) => render(
    <ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio"
      valor={valorDaPecuaria({ recorte: { ...recorte(null, 844162.5), de: '2023-01', ate: '2023-12' }, lancamentos: [],
        rateio: rateioPec(payload), dre, periodoRotulo: 'Ano 2023' })} />);
  it('os dois números diferem: o slot escreve os dois, lado a lado, em âmbar — sem diferença calculada', () => {
    abrir2023(fixture.nj_pec_2023);
    expect(textoDaLinha('pecuaria')).toContain('▼ 844.162,49');
    const aviso = screen.getByTestId('rateio-aviso-grade');
    expect(txt(aviso.textContent)).toBe('grade do DRE: R$ 844.162,50 · resumo: R$ 844.162,49');
    expect(aviso.className).toContain('text-amber-700');
    expect(aviso.getAttribute('title')).toContain('soma células já arredondadas');
    expect(txt(aviso.textContent)).not.toContain('0,01');
  });
  it('iguais (NJ 2025): o slot existe, vazio, com a mesma altura', () => {
    abrirPec(fixture.nj_pec_2025);
    const aviso = screen.getByTestId('rateio-aviso-grade');
    expect(aviso.textContent).toBe('');
    expect(aviso.getAttribute('title')).toBeNull();
    expect(aviso.className).toContain('h-[14px]');
  });
  it('sem o DRE do período não há número da grade: slot vazio', () => {
    abrir2023(fixture.nj_pec_2023, null);
    expect(screen.getByTestId('rateio-aviso-grade').textContent).toBe('');
  });
  it('na lavoura a grade e a safra do resumo são o mesmo número: slot vazio', () => {
    abrirLav(fixture.nj_lav_2425);
    expect(screen.getByTestId('rateio-aviso-grade').textContent).toBe('');
  });
});

describe('com grupo de custo escolhido', () => {
  const abrirGrupo = () => render(
    <ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio"
      valor={valorDaPecuaria({
        recorte: { ...recorte('g0', 164696.77), de: '2023-01', ate: '2023-12', bloco: 'fixo', centro: 'Mão de Obra', rotulo: 'Mão de Obra', soRateio: true,
          celula: { direto: null, rateio: 164696.77, grupo: 'Mão de Obra', cabMedia: 4826, meses: 12, comRateio: true } },
        lancamentos: [], rateio: rateioPec(fixture.nj_pec_2023), dre: DRE_NJ_2023, periodoRotulo: 'Ano 2023' })} />);
  it('os dois blocos de cima dizem "administrativo inteiro · todos os grupos", com o porquê no `title`', () => {
    abrirGrupo();
    const marcas = screen.getAllByTestId('marca-todos-os-grupos');
    expect(marcas).toHaveLength(2);
    expect(marcas.map(m => m.textContent)).toEqual([ROTULO_TODOS_OS_GRUPOS, ROTULO_TODOS_OS_GRUPOS]);
    expect(marcas[0].getAttribute('title')).toContain(TITULO_TODOS_OS_GRUPOS);
    expect(marcas.every(m => screen.getByTestId('rateio-bloco-dentro').contains(m) === false)).toBe(true);
    /* os blocos de cima seguem com o administrativo inteiro */
    expect(textoDaLinha('bruto')).toContain('▼ 970.178,23');
  });
  it('a tabela por fazenda diz o grupo no título e mostra o rateio DELE; a grade não é comparada (não há par)', () => {
    abrirGrupo();
    const bloco = screen.getByTestId('rateio-bloco-dentro');
    expect(txt(bloco.textContent)).toContain('Dentro da pecuária · Mão de Obra adm. · por fazenda');
    const linhas = [...bloco.querySelectorAll('[data-linha-dentro]')];
    expect(txt(linhas[0].textContent)).toContain('▼ 164.696,77');
    expect(linhas[0].getAttribute('data-destaque')).toBe('sim');
    expect(txt(screen.getByTestId('rateio-dentro-total').textContent)).toContain('▼ 237.216,58');
    expect(screen.getByTestId('rateio-aviso-grade').textContent).toBe('');
  });
  it('sem grupo, nenhuma das duas marcas', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(screen.queryByTestId('marca-todos-os-grupos')).toBeNull();
  });
});

/* ══════════════════════════ o que não mudou ══════════════════════════ */

describe('o que fica como estava', () => {
  it('quem rola é a tabela de dentro, com piso de duas linhas; na aba Lançamentos, a rolagem de sempre', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(screen.getByTestId('corpo-do-modal').className).toContain('flex-col');
    expect(screen.getByTestId('rateio-dentro-rolagem').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('rateio-bloco-dentro').className).toContain('min-h-[92px]');
    expect(screen.getByTestId('rateio-bloco-dentro').className).not.toContain('min-h-0');
    fireEvent.click(screen.getByRole('button', { name: 'Lançamentos' }));
    expect(screen.getByTestId('corpo-do-modal').className).toContain('overflow-y-auto');
  });
  it('o rodapé da aba Rateio é o de antes: a frase e o rateio da célula', () => {
    abrirPec(fixture.nj_pec_2025);
    expect(screen.getByText(/Mesma conta do DRE/)).toBeTruthy();
    expect(txt(document.querySelector('b.text-\\[12px\\]')?.textContent)).toBe('R$ 886.574,04');
  });
  it('rateio COMPARTILHADO da lavoura (fora do admin): segue a tabela de etapas, sem "Resumo | Mês a mês"', () => {
    const pool: RateioDetalhe = {
      pool: 1000, direto_cultura: 0, pct_agricultura: null, fatias_atividade: null,
      fatias: [{ cultura: 'amendoim', area_ha: 80, peso: 80, valor: 800, atual: true }, { cultura: 'mandioca', area_ha: 20, peso: 20, valor: 200, atual: false }],
      lancamentos: [{ id: 'x', data: '2026-01-01', descricao: 'Diesel', favorecido: 'Posto', valor: 1000, compartilhado: true }],
    };
    const v = valorDaLavoura(pool, 'natureza', { rotulo: 'Insumos', cultura: 'amendoim', safra: '25/26', area: 80, pool: true });
    expect(v.encontro).toBeNull();
    expect(v.etapas.map(e => e.chave)).toEqual(['pool', 'c-amendoim', 'c-mandioca']);
    render(<ModalValorDre aberto onFechar={vi.fn()} comRateioInicial abaInicial="rateio" valor={v} />);
    expect(screen.getByText('Custo compartilhado a ratear')).toBeTruthy();
    expect(screen.queryByTestId('visao-rateio')).toBeNull();
    expect(screen.queryByTestId('rateio-resumo')).toBeNull();
  });
  it('administrativo da lavoura não monta mais etapas', () => {
    const v = valorDaLavoura(comoDetalhe(fixture.nj_lav_2425), 'admin', { rotulo: 'Administrativo', cultura: 'amendoim', safra: null, area: 186.5, pool: false });
    expect(v.etapas).toHaveLength(0);
    expect(v.encontro?.atividade).toBe('agricultura');
  });
});
