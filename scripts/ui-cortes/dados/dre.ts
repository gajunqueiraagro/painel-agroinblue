/* DRE-LEVE-01 — o DRE na bancada, com dado SINTÉTICO: a Pecuária com os números do mock (jan–set/26 × jan–set/25, duas fazendas de nome
   longo) e a Lavoura do teste da grade (duas culturas). `escala` multiplica todo valor (10 = o pior caso de largura, dezenas de milhões). */
type Centro = { bloco: string; centro: string; valor: number; a_pagar: number };

const CV: readonly (readonly [string, number])[] = [['Comercial', 945], ['Identificação', 3457], ['Nutrição', 154089.6], ['Pastagem', 50210],
  ['Reprodução', 41725], ['Sanidade', 27612.34], ['Transferências', 48037.36]];

function linhasPec(f: number, ano: 25 | 26) {
  const k = (x25: number, x26: number) => Math.round((ano === 25 ? x25 : x26) * f * 100) / 100;
  const centros: Centro[] = [
    ...CV.map(([centro, v]) => ({ bloco: 'variavel', centro, valor: k(v * 1.1, v), a_pagar: 0 })),
    { bloco: 'fixo', centro: 'Mão de obra', valor: k(250000, 300000), a_pagar: 0 },
    { bloco: 'fixo', centro: 'Manutenção de máquinas e implementos', valor: k(125593.17, 153457.07), a_pagar: 0 },
    { bloco: 'venda', centro: 'Venda de bois gordos', valor: k(2448497.33, 3324128.54), a_pagar: 0 },
    { bloco: 'deducao', centro: 'Funrural', valor: k(56647.65, 60572), a_pagar: 0 },
    { bloco: 'investimento', centro: 'Cercas', valor: k(74555.15, 202189.64), a_pagar: 0 },
  ];
  return {
    vendas: k(2448497.33, 3324128.54), outras_receitas: 0, receita_bruta: k(2448497.33, 3324128.54), deducoes: k(56647.65, 60572),
    receita_liquida: k(2391849.68, 3263556.54), vpb_operacional: k(59524.1, -724441.57), reposicao: k(398125.2, 0),
    vbp: k(2053248.58, 2539114.97), custo_variavel: k(375480.12, 322619.3), margem: k(1677768.46, 2216495.67),
    custo_fixo: k(375593.17, 453457.07), rateio_adm: k(187822.22, 194233.71), resultado_operacional: k(1114353.08, 1568804.89),
    juros: k(36283.62, 47287.73), resultado_periodo: k(1078069.46, 1521517.16), efeito_mercado: k(343571.64, 504678.82),
    resultado_com_mercado: k(1421641.1, 2026195.98), investimento: k(74555.15, 202189.64), a_pagar: 0,
    lucro_liquido: k(1003514.31, 1319327.52), juros_proprio: 0, juros_rateado: 0,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 1800, cab_fim: 2100, cab_media: 1950 },
    producao: { ha_medio: 1500, at_produzida: 9800, at_desfrutada: 11200, cab_desfrutada: 900, at_comprada: 1300, cab_comprada: 150 },
    p0_fonte: ano === 25 ? 'cadastro' : 'fechamento', p1_fonte: 'fechamento',
    centros, centros_juros: [{ bloco: 'juros', centro: 'Juros de custeio', valor: k(36283.62, 47287.73), a_pagar: 0 }],
  };
}

/** A resposta da `fn_dre_pecuaria` para (de, ate): 2026 = o período da tela; antes disso, os números de 2025. */
export function drePecuaria(a: { p_de?: string; p_ate?: string }, escala: number) {
  const ano = String(a.p_de ?? '').startsWith('2026') ? 26 : 25;
  return {
    periodo: { de: a.p_de, ate: a.p_ate, p0: a.p_de, meses: 9 },
    rateio_adm: { pool: 400000 * escala, bruto: 1600000 * escala, criterio: 'cabecas medias no periodo' },
    fazendas: [
      { fazenda_id: 'f1', nome: 'Fazenda Exemplo Nome Longo Retiro', linhas: linhasPec(0.6 * escala, ano) },
      { fazenda_id: 'f2', nome: 'Faz. Exemplo Dois', linhas: linhasPec(0.4 * escala, ano) },
    ],
    total: linhasPec(escala, ano),
  };
}

const v = (valor: number, direto = valor, rateado = 0, por_ha: number | null = null) => ({ valor, direto, rateado, por_ha });
function linhasLav(e: number, receita: number, fixo: number, inv: number, op: number, caixa: number, area: number) {
  const x = (n: number) => Math.round(n * e * 100) / 100;
  return {
    receita_bruta: v(x(receita)), deducoes: v(x(33905.13)), receita_liquida: v(x(receita - 33905.13)),
    custeio: v(x(1172900.53), x(1121599.85), x(51300.68)), pos_colheita: v(x(84210.4)), rateio_compartilhado: v(x(532913.78)),
    custo_variavel: v(x(1257110.93), x(1205810.25), x(51300.68)), margem_contribuicao: v(x(receita - 33905.13 - 1257110.93)),
    custo_fixo: v(x(fixo), 0, x(fixo)), rateio_admin: v(x(240352.82)), resultado_operacional: v(x(op), x(op), 0, x(op / area)),
    juros: v(x(143707.14)), resultado_caixa: v(x(caixa), x(caixa), 0, x(caixa / area)), investimento: v(x(inv), x(inv * 0.97), x(inv * 0.03)),
    lucro_liquido: v(x(caixa - inv)), depreciacao: v(0),
  };
}
/** A resposta da `fn_dre_lavoura` (a safra 25/26 do teste da grade, duas culturas). */
export function dreLavoura(escala: number) {
  const centro = (bloco: string, nome: string, a: number, m: number) => ({ bloco, centro: nome,
    por_cultura: { amendoim: { valor: a * escala, direto: a * escala, rateado: 0, a_pagar: 0 },
      mandioca: { valor: m * escala, direto: m * escala, rateado: 0, a_pagar: 0 } },
    total: { valor: (a + m) * escala, direto: (a + m) * escala, rateado: 0, a_pagar: 0 } });
  return {
    versao: 'dre-lavoura-01', safra: { id: 's1', codigo: '25/26-Lav', data_inicio: '2025-07-01', data_fim: '2026-06-30' },
    culturas: [
      { cultura: 'amendoim', area_ha: 185, peso_area: 78.8, producao: 43949.4, produtividade: 237.56,
        linhas: linhasLav(escala, 2925162.25, 76544.3, 6360202.63, 379499.54, 235792.4, 185),
        a_pagar: { operacional: 136277.79, investimento: 0 }, custo_operacional: 2655464.72 * escala, pct_direto: 70,
        equilibrio: { preco_realizado: 66.56, preco_equilibrio: 60.42, produtividade_equilibrio: 215.7 } },
      { cultura: 'mandioca', area_ha: 49.8, peso_area: 21.2, producao: 1290, produtividade: 25.9,
        linhas: linhasLav(escala, 7343.63, 20604.9, 200858.09, -604398.44, -748105.58, 49.8),
        a_pagar: { operacional: 0, investimento: 0 }, custo_operacional: 354043.97 * escala, pct_direto: 41,
        equilibrio: { preco_realizado: 5.69, preco_equilibrio: 280.1, produtividade_equilibrio: 1270 } },
    ],
    total: { area_ha: 234.8, linhas: linhasLav(escala, 2932505.88, 97149.2, 6561060.72, -224898.9, -512313.18, 234.8),
      custo_operacional: 3009508.69 * escala, a_pagar: { operacional: 136277.79, investimento: 0 }, pct_direto: 66 },
    centros: [centro('custeio', 'Insumos', 1172900.53, 61255.32), centro('fixo', 'Manutenção de máquinas e implementos', 0, 0),
      centro('investimento', 'Solo', 351983.4, 159054.1)],
    rateio_admin: { admin_total: 961411.27 * escala, parcela_agricultura: 240352.82 * escala, declarado: true },
    pool_compartilhado: { custeio: 676368.4 * escala }, nao_apropriado: { por_bloco: {}, total: 0 }, gerado_em: '2026-09-16',
  };
}
/* UI-PERIODO-01 — as safras da pecuária (jul–jun, sintéticas) para os atalhos "Esta safra / Última safra" do componente de período */
export const SAFRAS = [{ id: 's1', codigo: '25/26-Lav', nome: '25/26-Lav', data_inicio: '2025-07-01', data_fim: '2026-06-30', cliente_id: 'cli', ativo: true, ativa: true, escopo_negocio: 'agricultura' },
  { id: 'p27', codigo: '26/27-Pec', nome: '26/27-Pec', data_inicio: '2026-07-01', data_fim: '2027-06-30', cliente_id: 'cli', ativa: true, escopo_negocio: 'pecuaria' },
  { id: 'p26', codigo: '25/26-Pec', nome: '25/26-Pec', data_inicio: '2025-07-01', data_fim: '2026-06-30', cliente_id: 'cli', ativa: true, escopo_negocio: 'pecuaria' }];

/* DRE-VARIACAO-EXPLICA-01 fatia 1b — a resposta SINTÉTICA da `fn_dre_pecuaria_patrimonio` (com a 115300: ágio, reclassificações e a
   série da V4), coerente por construção: v0 = q0 × kg0 × R$/kg0; v1_p0 = q1 × kg1 × R$/kg de referência; v1_p1 = q1 × kg1 × R$/kg1.
   `escala` multiplica as cabeças (10 = o pior caso de largura); `fimCadastro` = o fim sem fechamento validado (D3: mercado "—"). */
const CATS_PAT: readonly (readonly [string, number, number, number, number, number, number, number, number, number])[] = [
  /* categoria,   q0,  kg0, R$/kg0,  q1,  kg1, R$/kg1, ágio,      entrou, saiu */
  ['mamotes_m',   420, 120, 15.2,    380, 130, 15.8,   0,         0,      400],
  ['mamotes_f',   410, 115, 14.1,    390, 125, 14.6,   0,         0,      395],
  ['desmama_m',   300, 210, 14.0,    340, 220, 14.5,   -12400.5,  400,    310],
  ['desmama_f',   290, 200, 13.2,    300, 205, 13.6,   2210.0,    395,    280],
  ['garrotes',    260, 330, 11.0,    250, 345, 11.6,   -98250.4,  310,    0],
  ['novilhas',    310, 320, 10.6,    290, 330, 11.1,   -41820.3,  280,    120],
  ['vacas',       640, 420, 9.2,     690, 425, 9.7,    -62100.0,  120,    0],
  ['bois',        0,   0,   0,       0,   0,   0,      -300.0,    1,      1],
];
export function patrimonio(a: { p_de?: string; p_ate?: string }, escala: number, fimCadastro: boolean) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const categorias = CATS_PAT.map(([categoria, q0b, kg0, pk0, q1b, kg1, pk1, agio, ent, sai]) => {
    const q0 = q0b * escala; const q1 = q1b * escala;
    const ref = pk0 || pk1;
    const v0 = r2(q0 * kg0 * pk0); const v1_p0 = r2(q1 * kg1 * ref); const v1_p1 = fimCadastro ? v1_p0 : r2(q1 * kg1 * pk1);
    return { categoria, q0, pm0: q0 ? kg0 : null, pk0: q0 ? pk0 : null, v0, q1, pm1: q1 ? kg1 : null, pk1: q1 && !fimCadastro ? pk1 : null,
      v1_p0, v1_p1, vpb: r2(v1_p0 - v0), efeito: r2(v1_p1 - v1_p0),
      agio: r2(agio * escala), agio_sem_preco: false, cab_reclass_entrada: ent * escala, cab_reclass_saida: sai * escala,
      at_reclass_entrada: r2((ent * escala * (kg1 || 300)) / 30), at_reclass_saida: r2((sai * escala * (kg0 || 300)) / 30) };
  });
  const s = (f: (c: (typeof categorias)[number]) => number) => r2(categorias.reduce((x, c) => x + f(c), 0));
  const at0 = categorias.reduce((x, c) => x + c.q0 * (c.pm0 ?? 0), 0) / 30;
  const at1 = categorias.reduce((x, c) => x + c.q1 * (c.pm1 ?? 0), 0) / 30;
  const total = { q0: s(c => c.q0), v0: s(c => c.v0), q1: s(c => c.q1), v1_p0: s(c => c.v1_p0), v1_p1: s(c => c.v1_p1),
    vpb: s(c => c.vpb), efeito: s(c => c.efeito), agio: s(c => c.agio), agio_sem_preco: false };
  /* DRE-VARIACAO-SIMPLES-01: os meses são os do período PEDIDO (P0 = o mês anterior ao início) — com o comparar 1 ano a 1ª coluna é o ano
     anterior, e um P0 fixo em dez/25 dava "01/01/2026 a 30/09/2025" no cabeçalho do modal */
  const ate = String(a.p_ate ?? '2026-09').slice(0, 7);
  const de = String(a.p_de ?? `${ate.slice(0, 4)}-01`).slice(0, 7);
  const somaMes = (am: string, k: number) => { const t = Number(am.slice(0, 4)) * 12 + Number(am.slice(5, 7)) - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const MESES: string[] = []; for (let m = somaMes(de, -1); m <= ate; m = somaMes(m, 1)) MESES.push(m);
  const meses = MESES.map((ano_mes, i) => {
    const t = i / (MESES.length - 1);
    const arrobas = r2(at0 + (at1 - at0) * t + Math.sin(i * 1.3) * at0 * 0.015);
    const pRef = (total.v0 + (total.v1_p0 - total.v0) * t) / (at0 + (at1 - at0) * t);
    const pMes = (total.v0 + (total.v1_p1 - total.v0) * t) / (at0 + (at1 - at0) * t);
    /* ago/26 sem fechamento validado (o cadastro); no D3, set/26 também */
    const cadastro = ano_mes === somaMes(ate, -1) || (fimCadastro && ano_mes === ate);
    return { ano_mes, fonte: cadastro ? 'cadastro' : 'fechamento', arrobas, v_ref: r2(arrobas * pRef), v_mes: cadastro ? null : r2(arrobas * pMes) };
  });
  const z = { cabecas: 0, arrobas: 0, valor: 0 };
  return {
    p0: MESES[0], p1: ate, p0_fonte: 'fechamento', p1_fonte: fimCadastro ? 'cadastro' : 'fechamento',
    categorias, total, meses,
    movimentos: { inicio: { cabecas: total.q0, arrobas: r2(at0), valor: total.v0 }, fim: { cabecas: total.q1, arrobas: r2(at1), valor: total.v1_p1 },
      /* DRE-VARIACAO-SIMPLES-01 (P5): um extrato com nascimento, venda e morte — o ganho de peso fecha a diferença na tela */
      produzidas: { cabecas: 0, arrobas: r2(at1 - at0), valor: total.vpb }, nascimentos: { cabecas: 60, arrobas: r2(at0 * 0.04), valor: 0 },
      compradas: z, transf_entrada: z, vendas_abates: { cabecas: 180, arrobas: r2(at0 * 0.3), valor: 0 }, mortes: { cabecas: 5, arrobas: r2(at0 * 0.01), valor: 0 },
      transf_saida: z, ajustes: z },
  };
}
