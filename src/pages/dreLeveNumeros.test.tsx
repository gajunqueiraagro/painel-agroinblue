/**
 * DRE-LEVE-01 (Gabriel 31/10/2026) — A PROVA DE QUE NENHUM NÚMERO MUDA: a tela ficou mais leve (régua, negrito, % em coluna), e os números
 * de cada linha têm de ser os de antes.
 * - O MESMO FIXTURE (a Vera, jan–set/26 × jan–set/25, com os números do mock) renderizado nas combinações da tela: Pecuária Detalhado e Resumido
 *   × Comparação com 1, 2 e 3 anos, com a Meta e os Δ, e Por fazenda × R$ / R$+R$/ha / as quatro unidades × rateio nos grupos; Lavoura
 *   × R$ / R$+R$/ha / as três × rateio nos centros. Tudo aberto.
 * - Cada linha é lida POR RÓTULO (sem "= ", setas e selos) e comparada com `dreLeveNumeros.antes.json`, gravado do código de ANTES da
 *   mudança (`DRE_LEVE_GRAVAR=1`). As linhas de apoio de antes ("% do VBP", "% da receita líquida") viraram COLUNA: o que elas mostravam
 *   tem de aparecer na coluna de % da linha de cima (`data-pct`), na mesma ordem.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PecDrePanel, colunasDaVisao, type EntradaVisoes } from '@/pages/PecDrePanel';
import { Grade } from '@/pages/AgriDreLavouraTab';
import { LINHAS_DO_MODO, type ModoDre, type UnidadePec } from '@/components/agri/drePecRegua';
import type { DrePecuaria, DrePecLinhas, CentroPec } from '@/hooks/useDrePecuaria';
import type { DreLavoura, DreCultura, DreCentro, DreValor, DreLinhas } from '@/hooks/useDreLavoura';

const ARQUIVO = `${process.cwd()}/src/pages/dreLeveNumeros.antes.json`;
const GRAVAR = process.env.DRE_LEVE_GRAVAR === '1';

/* ─────────────── o fixture da pecuária: a Vera do mock (jan–set) ─────────────── */
const patrimonio = { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 1800, cab_fim: 2100, cab_media: 1950 };
const producao = { ha_medio: 1500, at_produzida: 9800, at_desfrutada: 11200, cab_desfrutada: 900, at_comprada: 1300, cab_comprada: 150 };
const CV: readonly (readonly [string, number])[] = [['Comercial', 945], ['Identificação', 3457], ['Nutrição', 154089.6], ['Pastagem', 50210],
  ['Reprodução', 41725], ['Sanidade', 27612.34], ['Transferências', 48037.36]];

function linhasPec(f: number, ano: 25 | 26): DrePecLinhas {
  const k = (x25: number, x26: number) => Math.round((ano === 25 ? x25 : x26) * f * 100) / 100;
  const centros: CentroPec[] = [
    ...CV.map(([centro, v]) => ({ bloco: 'variavel', centro, valor: k(v * 1.1, v), a_pagar: 0 })),
    { bloco: 'fixo', centro: 'Mão de obra', valor: k(250000, 300000), a_pagar: 0 },
    { bloco: 'fixo', centro: 'Manutenção', valor: k(125593.17, 153457.07), a_pagar: 0 },
    { bloco: 'venda', centro: 'Venda de bois', valor: k(2448497.33, 3324128.54), a_pagar: 0 },
    { bloco: 'deducao', centro: 'Funrural', valor: k(56647.65, 60572), a_pagar: 0 },
    { bloco: 'investimento', centro: 'Cercas', valor: k(74555.15, 202189.64), a_pagar: 0 },
  ];
  return {
    vendas: k(2448497.33, 3324128.54), outras_receitas: 0, receita_bruta: k(2448497.33, 3324128.54), deducoes: k(56647.65, 60572),
    receita_liquida: k(2391849.68, 3263556.54), vpb_operacional: k(59524.1, -724441.57), reposicao: k(398125.2, 0),
    vbp: k(2053248.58, 2539114.97), custo_variavel: k(375480.12, 322619.3), margem: k(1677768.46, 2216495.67),
    custo_fixo: k(375593.17, 453457.07), rateio_adm: k(187822.22, 194233.71), resultado_operacional: k(1114353.08, 1568804.89),
    juros: f === 1 ? k(36283.62, 47287.73) : null, resultado_periodo: k(1078069.46, 1521517.16), efeito_mercado: k(343571.64, 504678.82),
    resultado_com_mercado: k(1421641.1, 2026195.98), investimento: k(74555.15, 202189.64), a_pagar: 0,
    lucro_liquido: k(1003514.31, 1319327.52), juros_proprio: 0, juros_rateado: 0,
    patrimonio, producao, p0_fonte: ano === 25 ? 'cadastro' : 'fechamento', p1_fonte: 'fechamento',
    centros, centros_juros: f === 1 ? [{ bloco: 'juros', centro: 'Juros de custeio', valor: k(36283.62, 47287.73), a_pagar: 0 }] : [],
  };
}
const drePec = (ano: 25 | 26, de: string, ate: string): DrePecuaria => ({
  periodo: { de, ate, p0: de, meses: 9 },
  rateio_adm: { pool: 400000, bruto: 1600000, criterio: 'cabecas medias no periodo' },
  fazendas: [
    { fazenda_id: 'f1', nome: 'Faz. Sta. Luzia', linhas: linhasPec(0.6, ano) },
    { fazenda_id: 'f2', nome: 'Faz. Sto. Expedito', linhas: linhasPec(0.4, ano) },
  ],
  total: linhasPec(1, ano),
});
const REAL = drePec(26, '2026-01', '2026-09');
const ANOS = [
  { de: '2025-01', ate: '2025-09', dre: drePec(25, '2025-01', '2025-09'), carregando: false },
  { de: '2024-01', ate: '2024-09', dre: drePec(25, '2024-01', '2024-09'), carregando: false },
  { de: '2023-01', ate: '2023-09', dre: drePec(25, '2023-01', '2023-09'), carregando: false },
];
const META = drePec(26, '2026-01', '2026-09');

const entrada = (e: Partial<EntradaVisoes>): EntradaVisoes => ({
  visao: 'comparacao', de: '2026-01', ate: '2026-09', real: REAL, meta: META, carregandoMeta: false, anos: ANOS, ...e,
});
const abertosDoModo = (m: ModoDre) =>
  Object.fromEntries(LINHAS_DO_MODO(m).filter(d => d.expande || d.agrupa).map(d => [d.id ?? d.chave, true]));

/* ─────────────── o fixture da lavoura (o NJ 25/26, como no teste da grade) ─────────────── */
const v = (valor: number, direto = valor, rateado = 0): DreValor => ({ valor, direto, rateado });
function linhasLav(receita: number, fixo: DreValor, inv: DreValor, op: number, caixa: number): DreLinhas {
  return {
    receita_bruta: v(receita), deducoes: v(33905.13), receita_liquida: v(receita - 33905.13), custeio: v(1172900.53, 1121599.85, 51300.68),
    pos_colheita: v(84210.4), rateio_compartilhado: v(532913.78), custo_variavel: v(1257110.93, 1205810.25, 51300.68),
    margem_contribuicao: v(receita - 33905.13 - 1257110.93), custo_fixo: fixo, rateio_admin: v(240352.82), resultado_operacional: v(op),
    juros: v(143707.14), resultado_caixa: v(caixa), investimento: inv, lucro_liquido: v(caixa - inv.valor), depreciacao: v(0),
  };
}
const AMENDOIM: DreCultura = {
  cultura: 'amendoim', area_ha: 185, peso_area: 78.8, producao: 43949.4, produtividade: 237.56,
  linhas: linhasLav(2925162.25, v(76544.3, 0, 76544.3), v(6360202.63, 6204906.69, 155295.94), 379499.54, 235792.4),
  a_pagar: { operacional: 136277.79, investimento: 0 }, custo_operacional: 2655464.72, pct_direto: 70,
  equilibrio: { preco_realizado: 66.56, preco_equilibrio: 60.42, produtividade_equilibrio: 215.7 },
};
const MANDIOCA: DreCultura = {
  cultura: 'mandioca', area_ha: 49.8, peso_area: 21.2, producao: 1290, produtividade: 25.9,
  linhas: linhasLav(7343.63, v(20604.9, 0, 20604.9), v(200858.09, 159054.1, 41803.99), -604398.44, -748105.58),
  a_pagar: { operacional: 0, investimento: 0 }, custo_operacional: 354043.97, pct_direto: 41,
  equilibrio: { preco_realizado: 5.69, preco_equilibrio: 280.1, produtividade_equilibrio: 1270 },
};
const CENTROS_LAV: DreCentro[] = [
  { bloco: 'custeio', centro: 'Insumos', por_cultura: { amendoim: { valor: 1172900.53, direto: 1121599.85, rateado: 51300.68, a_pagar: 0 },
    mandioca: { valor: 61255.32, direto: 47445.73, rateado: 13809.59, a_pagar: 0 } },
  total: { valor: 1234155.85, direto: 1169045.58, rateado: 65110.27, a_pagar: 136277.79 } },
  { bloco: 'investimento', centro: 'Solo', por_cultura: { amendoim: { valor: 351983.4, direto: 351983.4, rateado: 0, a_pagar: 0 },
    mandioca: { valor: 159054.1, direto: 159054.1, rateado: 0, a_pagar: 0 } },
  total: { valor: 511037.5, direto: 511037.5, rateado: 0, a_pagar: 0 } },
];
const DRE_LAV: DreLavoura = {
  versao: 'dre-lavoura-01',
  safra: { id: 's1', codigo: '25/26-Lav', data_inicio: '2025-07-01', data_fim: '2026-06-30' },
  culturas: [AMENDOIM, MANDIOCA],
  total: { area_ha: 234.8, linhas: linhasLav(2932505.88, v(97149.2, 0, 97149.2), v(6561060.72, 6363960.79, 197099.93), -224898.9, -512313.18),
    custo_operacional: 3009508.69, a_pagar: { operacional: 136277.79, investimento: 0 }, pct_direto: 66 },
  centros: CENTROS_LAV,
  rateio_admin: { admin_total: 961411.27, parcela_agricultura: 240352.82, declarado: true },
  pool_compartilhado: { custeio: 676368.4 },
  nao_apropriado: { por_bloco: {}, total: 0 },
  gerado_em: '2026-09-16',
};
/* a regra de `valorDaLinha` da tela (copiada, como no teste da grade) */
const valorDaLinhaComoNaTela = (rateioDentro: boolean) => (l: DreValor, def: { bloco?: string }) => {
  if (!def.bloco || rateioDentro || ['fixo', 'investimento'].includes(def.bloco)) return l.valor;
  return l.direto ?? l.valor;
};

/* ─────────────── a leitura: por rótulo ─────────────── */
const SELOS = ['só rateio adm.', 'c/ rateio', 'estimado', 'início', 'rateio', 'fim'];
const APOIO = /^(% do VBP|% da receita líquida|por hectare)$/;
const PCT = /^(% do VBP|% da receita líquida)$/;

export function rotuloLimpo(texto: string): string {
  let t = texto.replace(/[›⌄▸▾▲▼●]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^= /, '');
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const s of SELOS) {
      const r = t.replace(new RegExp(`\\s*·?\\s*${s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`), '').trim();
      if (r !== t) { t = r; mudou = true; }
    }
  }
  return t;
}
/* DRE-LAYOUT-04: o % do VBP abaixo do número (`data-pct-abaixo`) não é o número — sai do texto da célula e é lido à parte */
const textoDaCelula = (td: Element) => {
  const sub = td.querySelector('[data-pct-abaixo]')?.textContent ?? '';
  const t = (td.textContent ?? '');
  return (sub && t.endsWith(sub) ? t.slice(0, -sub.length) : t).replace(/[▲▼]/g, '').trim();
};
const pctAbaixo = (td: Element) => (td.querySelector('[data-pct-abaixo]')?.textContent ?? '').trim();

export interface Leitura { linhas: Record<string, string[]>; pct: Record<string, string[]>; abaixo?: Record<string, string[]> }
export function lerGrade(raiz: ParentNode): Leitura {
  const linhas: Record<string, string[]> = {};
  const pct: Record<string, string[]> = {};
  const abaixo: Record<string, string[]> = {};
  let pai = '';
  for (const tr of raiz.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length === 0) continue;
    const rot = rotuloLimpo(tds[0].textContent ?? '');
    let chave = APOIO.test(rot) ? `${pai} › ${rot}` : rot;
    if (!APOIO.test(rot)) pai = rot;
    for (let n = 2; chave in linhas; n++) chave = `${APOIO.test(rot) ? `${pai} › ${rot}` : rot} #${n}`;
    const resto = tds.slice(1);
    linhas[chave] = resto.filter(td => !td.hasAttribute('data-pct')).map(textoDaCelula);
    if (resto.some(td => td.querySelector('[data-pct-abaixo]'))) abaixo[chave] = resto.filter(td => !td.hasAttribute('data-pct')).map(pctAbaixo);
    const daPct = resto.filter(td => td.hasAttribute('data-pct')).map(textoDaCelula).filter(Boolean);
    if (daPct.length) pct[chave] = daPct;
  }
  return { linhas, pct, abaixo };
}

/* ─────────────── os casos ─────────────── */
const UNIDADES_PEC: UnidadePec[][] = [['rs'], ['rs', 'ha'], ['rs', 'ha', 'cab', 'arroba']];
const VISOES: [string, Partial<EntradaVisoes>][] = [
  ['1 ano com Δ', { referencia: 1, deltas: ['rs', 'pct'] }],
  ['2 anos', { referencia: 2 }],
  ['3 anos', { referencia: 3 }],
  ['meta com Δ', { referencia: 'meta', deltas: ['rs', 'pct'] }],
  ['por fazenda', { visao: 'fazenda' }],
];
const CASOS: { nome: string; montar: () => void }[] = [];
const MODOS: ModoDre[] = ['detalhado', 'resumido'];
const UNIDADES_LAV: ('rs' | 'ha' | 'un')[][] = [['rs'], ['rs', 'ha'], ['rs', 'ha', 'un']];
for (const modo of MODOS) {
  for (const unidades of UNIDADES_PEC) {
    for (const [nomeVisao, e] of VISOES) {
      for (const rateioNosGrupos of modo === 'detalhado' ? [false, true] : [false]) {
        CASOS.push({
          nome: `Pecuária ${modo} · ${unidades.join('+')} · ${nomeVisao}${rateioNosGrupos ? ' · rateio nos grupos' : ''}`,
          montar: () => render(<PecDrePanel colunas={colunasDaVisao(entrada(e))} alturaCartao={null} cartaoRef={{ current: null }}
            unidades={unidades} modo={modo} abertos={abertosDoModo(modo)} onAbertos={vi.fn()} rateioNosGrupos={rateioNosGrupos} />),
        });
      }
    }
  }
}
for (const unidades of UNIDADES_LAV) {
  for (const rateioDentro of [false, true]) {
    CASOS.push({
      nome: `Lavoura · ${unidades.join('+')}${rateioDentro ? ' · rateio nos centros' : ''}`,
      montar: () => render(<Grade dre={DRE_LAV} culturas={DRE_LAV.culturas}
        abertos={{ custeio: true, investimento: true, fixo: true, pos_colheita: true, 'g:custo_variavel': true, 'g:g_custo_fixo': true }}
        setAbertos={vi.fn()} rateioDentro={rateioDentro} unidades={unidades} colsPorCultura={unidades.length}
        centrosDoBloco={b => DRE_LAV.centros.filter(c => c.bloco === b)} valorDaLinha={valorDaLinhaComoNaTela(rateioDentro)}
        abrir={vi.fn()} onDrill={vi.fn()} onAbrirCultura={vi.fn()} />),
    });
  }
}

afterEach(cleanup);

describe('DRE-LEVE-01: os números de cada linha são os de antes', () => {
  const lidas: Record<string, Leitura> = {};
  it.each(CASOS)('$nome', (caso) => {
    caso.montar();
    const l = lerGrade(document.body);
    expect(Object.keys(l.linhas).length).toBeGreaterThan(10);
    lidas[caso.nome] = l;
    if (GRAVAR) return;
    const antes: Record<string, Leitura> = JSON.parse(readFileSync(ARQUIVO, 'utf-8'));
    const a = antes[caso.nome];
    expect(a, 'o caso existe no arquivo de antes').toBeDefined();
    /* ⚠ DRE-LAYOUT-04 (Gabriel 09/11 + ajuste do Chat 10:25): NA PECUÁRIA o % do VBP fica ABAIXO DO NÚMERO, na mesma célula (a coluna
       saiu) — então a grade é a de ANTES do DRE-LEVE-01 linha por linha, com os mesmos números, e o que cada linha "› % do VBP" de antes
       mostrava está agora abaixo do número da linha de cima, célula por célula; o do Lucro líquido é novo. */
    if (caso.nome.startsWith('Pecuária')) {
      const ehPct = (k: string) => PCT.test(k.split(' › ')[1]?.replace(/ #\d+$/, '') ?? '');
      const semPct = Object.keys(a.linhas).filter(k => !ehPct(k));
      expect(Object.keys(l.linhas)).toEqual(semPct);
      for (const k of semPct) expect(l.linhas[k], k).toEqual(a.linhas[k]);
      for (const k of Object.keys(a.linhas).filter(ehPct)) {
        const pai = k.split(' › ')[0];
        expect(l.abaixo?.[pai], `${pai} · %`).toEqual(a.linhas[k]);
      }
      expect(Object.keys(l.abaixo ?? {}).filter(k => !Object.keys(a.linhas).includes(`${k} › % do VBP`))).toEqual(
        Object.keys(l.abaixo ?? {}).filter(k => k.startsWith('Lucro líquido')));
      expect(Object.keys(l.pct)).toHaveLength(0);
      return;
    }
    const chavesAntes = Object.keys(a.linhas).filter(k => !PCT.test(k.split(' › ')[1] ?? ''));
    /* a linha extra de % não existe mais: o % é só coluna */
    expect(Object.keys(l.linhas).some(k => PCT.test(k.split(' › ')[1] ?? ''))).toBe(false);
    /* toda linha de antes (menos as de %, que viraram coluna) existe e tem os MESMOS números, na mesma ordem */
    expect(Object.keys(l.linhas).filter(k => !PCT.test(k.split(' › ')[1] ?? ''))).toEqual(chavesAntes);
    for (const k of chavesAntes) expect(l.linhas[k], k).toEqual(a.linhas[k]);
    /* o que a linha de % mostrava está na coluna de % da linha de cima */
    for (const k of Object.keys(a.linhas).filter(x => PCT.test(x.split(' › ')[1] ?? ''))) {
      const pai = k.split(' › ')[0];
      expect(l.pct[pai], `${pai} · %`).toEqual(a.linhas[k].filter(Boolean));
    }
  });

  it('grava o arquivo de antes (só com DRE_LEVE_GRAVAR=1)', () => {
    if (!GRAVAR) { expect(existsSync(ARQUIVO)).toBe(true); return; }
    writeFileSync(ARQUIVO, `${JSON.stringify(lidas, null, 1)}\n`);
  });
});
