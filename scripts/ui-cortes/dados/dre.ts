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
