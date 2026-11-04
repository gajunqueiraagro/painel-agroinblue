/* VISAO-GERAL-02 — banco SINTÉTICO da bancada para o cenário `visao-geral-02` do gate (nenhum nome nem número de cliente):
   3 fazendas de exemplo (EXS pecuária + lavoura, EXN pecuária com o fechamento de out pendente, EXM eucalipto), out/2026. */
export const FAZENDAS_VG = [
  { id: 'fA', nome: 'Faz. Exemplo Sul', codigo: 'EXS', cliente_id: 'cli', tem_pecuaria: true, status_operacional: 'ativa' },
  { id: 'fB', nome: 'Faz. Exemplo Norte', codigo: 'EXN', cliente_id: 'cli', tem_pecuaria: true, status_operacional: 'ativa' },
  { id: 'fC', nome: 'Faz. Exemplo Mata', codigo: 'EXM', cliente_id: 'cli', tem_pecuaria: false, status_operacional: 'ativa' },
];

type Reg = Record<string, unknown>;
type Estado = { eq: Record<string, unknown>; in: Record<string, unknown[]>; is: Record<string, unknown>; range: [number, number] | null; um: boolean };

const ANO = 2026;
const MES_ATUAL = 10; // a home abre no mês anterior ao de hoje (03/11/2026)
const CLI = 'cli';
const pad = (m: number) => String(m).padStart(2, '0');
const mesesAte = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const arred = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/* filtro genérico: eq/in/is só valem quando a coluna existe na linha (colunas aninhadas e de outro escopo passam) */
function filtrar(linhas: Reg[], e: Estado): Reg[] {
  return linhas.filter((l) => {
    for (const [k, v] of Object.entries(e.eq)) if (k in l && l[k] !== v) return false;
    for (const [k, v] of Object.entries(e.in)) if (k in l && !v.includes(l[k])) return false;
    for (const [k, v] of Object.entries(e.is)) if (k in l && l[k] !== v) return false;
    return true;
  });
}

/* ── pastos (cadastro) ─────────────────────────────────────────────────────────── */
interface PastoSint { id: string; fazenda_id: string; nome: string; tipo_uso: string; area: number }
const PASTOS: PastoSint[] = [
  { id: 'pA1', fazenda_id: 'fA', nome: 'Pasto Cria 1', tipo_uso: 'cria', area: 1000 },
  { id: 'pA2', fazenda_id: 'fA', nome: 'Pasto Recria 1', tipo_uso: 'recria', area: 900 },
  { id: 'pA3', fazenda_id: 'fA', nome: 'Pasto Engorda 1', tipo_uso: 'engorda', area: 800 },
  { id: 'pA4', fazenda_id: 'fA', nome: 'Pasto Vedado', tipo_uso: 'vedado', area: 100 },
  { id: 'pA5', fazenda_id: 'fA', nome: 'Pasto em Reforma', tipo_uso: 'reforma_pecuaria', area: 200 },
  { id: 'pA6', fazenda_id: 'fA', nome: 'Talhão 1', tipo_uso: 'agricultura', area: 100 },
  { id: 'pA7', fazenda_id: 'fA', nome: 'Talhão 2', tipo_uso: 'agricultura', area: 90 },
  { id: 'pA8', fazenda_id: 'fA', nome: 'Talhão 3', tipo_uso: 'agricultura', area: 90 },
  { id: 'pA9', fazenda_id: 'fA', nome: 'Reserva Legal', tipo_uso: 'reserva', area: 600 },
  { id: 'pA10', fazenda_id: 'fA', nome: 'APP Ribeirão', tipo_uso: 'app', area: 350 },
  { id: 'pA11', fazenda_id: 'fA', nome: 'Sede e Currais', tipo_uso: 'benfeitorias', area: 120 },
  { id: 'pB1', fazenda_id: 'fB', nome: 'Pasto Cria 1', tipo_uso: 'cria', area: 400 },
  { id: 'pB2', fazenda_id: 'fB', nome: 'Pasto Recria 1', tipo_uso: 'recria', area: 500 },
  { id: 'pB3', fazenda_id: 'fB', nome: 'Pasto Engorda 1', tipo_uso: 'engorda', area: 400 },
  { id: 'pB4', fazenda_id: 'fB', nome: 'Reserva Legal', tipo_uso: 'reserva', area: 250 },
  { id: 'pB5', fazenda_id: 'fB', nome: 'APP Córrego', tipo_uso: 'app', area: 150 },
  { id: 'pB6', fazenda_id: 'fB', nome: 'Sede e Currais', tipo_uso: 'benfeitorias', area: 60 },
  { id: 'pC1', fazenda_id: 'fC', nome: 'Eucalipto Talhão A', tipo_uso: 'eucalipto', area: 820 },
  { id: 'pC2', fazenda_id: 'fC', nome: 'Reserva Legal', tipo_uso: 'reserva', area: 130 },
  { id: 'pC3', fazenda_id: 'fC', nome: 'APP', tipo_uso: 'app', area: 70 },
  { id: 'pC4', fazenda_id: 'fC', nome: 'Aceiros e Estradas', tipo_uso: 'benfeitorias', area: 20 },
];

const pastosCadastro = (): Reg[] => PASTOS.map((p, i) => ({
  id: p.id, fazenda_id: p.fazenda_id, cliente_id: CLI, nome: p.nome, lote_padrao: null, area_produtiva_ha: p.area, tipo_uso: p.tipo_uso,
  qualidade: 3, entra_conciliacao: true, ativo: true, observacoes: null, ordem_exibicao: i, data_inicio: '2020-01-01', data_fim: null,
  grupo_id: null, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
}));

/* VISAO-GERAL-03 — as cabeças e o peso de cada pasto com gado no mês (o "Mapa das fazendas" do card Área produtiva lê a lotação por
   pasto: um ideal, um sublotado e um com carga alta em cada fazenda). O EXN não fecha out (o status do fechamento já diz isso). */
const GADO_NO_PASTO: Record<string, { cab: number; peso: number }> = {
  pA1: { cab: 1000, peso: 330 }, pA2: { cab: 400, peso: 300 }, pA3: { cab: 1100, peso: 450 },
  pB1: { cab: 420, peso: 380 }, pB2: { cab: 150, peso: 290 }, pB3: { cab: 520, peso: 420 },
};
const fechamentoPastos = (): Reg[] => {
  const out: Reg[] = [];
  /* mais recente primeiro: a abertura da tela lê "o último mês fechado" com order desc + limit 1, e a bancada ignora order */
  for (const m of mesesAte(MES_ATUAL).reverse()) for (const p of PASTOS) {
    const id = `fp-${p.id}-${m}`;
    const gado = GADO_NO_PASTO[p.id];
    out.push({ id, pasto_id: p.id, fazenda_id: p.fazenda_id, cliente_id: CLI, ano_mes: `${ANO}-${pad(m)}`, status: 'fechado', tipo_uso_mes: null, lote_mes: null,
      pasto: { area_produtiva_ha: p.area, tipo_uso: p.tipo_uso },
      fechamento_pasto_itens: gado ? [{ id: `${id}-1`, fechamento_id: id, quantidade: gado.cab, peso_medio_kg: gado.peso, categoria_id: 'c1' }] : [] });
  }
  return out;
};

/* VISAO-GERAL-03 — o desenho das fazendas com pecuária: cada pasto um quadrado de lado proporcional à área, em fila (sintético) */
const fazendaGeometrias = (): Reg[] => {
  const out: Reg[] = [];
  for (const [fi, fid] of ['fA', 'fB'].entries()) {
    let x = -54.03 + fi * 0.2;
    PASTOS.filter((p) => p.fazenda_id === fid).forEach((p, i) => {
      const lado = Math.sqrt(p.area) * 0.0009;
      const y = -19.63 - (i % 2) * 0.03;
      out.push({ id: `g-${p.id}`, fazenda_id: fid, cliente_id: CLI, pasto_id: p.id, tipo: 'pasto',
        geojson: { type: 'Polygon', coordinates: [[[x, y], [x + lado, y], [x + lado, y - lado], [x, y - lado], [x, y]]] } });
      if (i % 2 === 1) x += lado;
    });
  }
  return out;
};

const SNAP: Record<string, { total: number; pec: number; agri: number; silvi: number; reserva: number; app: number; benf: number; outras: number }> = {
  fA: { total: 4600, pec: 3000, agri: 280, silvi: 0, reserva: 600, app: 350, benf: 120, outras: 250 },
  fB: { total: 1800, pec: 1300, agri: 0, silvi: 0, reserva: 250, app: 150, benf: 60, outras: 40 },
  fC: { total: 1050, pec: 0, agri: 0, silvi: 820, reserva: 130, app: 70, benf: 20, outras: 10 },
};
const snapshotsArea = (): Reg[] => {
  const out: Reg[] = [];
  for (const m of mesesAte(MES_ATUAL)) for (const [fid, s] of Object.entries(SNAP)) {
    out.push({ fazenda_id: fid, cliente_id: CLI, ano_mes: `${ANO}-${pad(m)}-01`, area_total_ha: s.total, area_pecuaria_ha: s.pec,
      area_agricultura_ha: s.agri, area_produtiva_ha: s.pec + s.agri, area_silvicultura_ha: s.silvi, area_reserva_ha: s.reserva,
      area_app_ha: s.app, area_benfeitorias_ha: s.benf, area_outras_ha: s.outras });
  }
  return out;
};

/* ── rebanho ───────────────────────────────────────────────────────────────────── */
const CATEGORIAS_SINT = [
  { id: 'c1', codigo: 'vacas', nome: 'Vacas', ordem_exibicao: 1, pm: 460, gmd: 0.12 },
  { id: 'c2', codigo: 'novilhas', nome: 'Novilhas', ordem_exibicao: 2, pm: 330, gmd: 0.45 },
  { id: 'c3', codigo: 'desmama_m', nome: 'Desmama M', ordem_exibicao: 3, pm: 190, gmd: 0.6 },
  { id: 'c4', codigo: 'garrotes', nome: 'Garrotes', ordem_exibicao: 4, pm: 300, gmd: 0.7 },
  { id: 'c5', codigo: 'bois', nome: 'Bois', ordem_exibicao: 5, pm: 480, gmd: 0.8 },
];
const BASE_CAB: Record<string, number[]> = { fA: [1300, 600, 500, 800, 800], fB: [500, 250, 200, 300, 250] };
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/* sazonalidade do GMD: águas (nov-abr) acima, seca abaixo */
const SAZ = [1.05, 1.08, 1.05, 0.95, 0.8, 0.7, 0.65, 0.7, 0.85, 1.0, 1.1, 1.1];

function zootCache(): Reg[] {
  const out: Reg[] = [];
  for (const cenario of ['realizado', 'meta']) {
    const k = cenario === 'meta' ? 0.97 : 1;
    const gk = cenario === 'meta' ? 1.06 : 1;
    for (const fid of ['fA', 'fB']) {
      const fator = fid === 'fA' ? 1 : 0.38;
      CATEGORIAS_SINT.forEach((cat, ci) => {
        let saldo = BASE_CAB[fid][ci];
        let pesoTotal = saldo * cat.pm;
        for (const m of mesesAte(12)) {
          if (cenario === 'realizado' && m > MES_ATUAL) break;
          const dias = DIAS[m - 1];
          const nasc = ci === 2 && m >= 8 && m <= 11 ? Math.round(120 * fator * k) : 0;
          const compra = ci === 3 && m % 4 === 2 ? Math.round(60 * fator * k) : 0;
          const venda = ci === 4 ? Math.round((m % 3 === 0 ? 90 : 35) * fator * k) : ci === 3 && m % 5 === 4 ? Math.round(40 * fator) : 0;
          const morte = ci === 0 ? 2 : ci === 2 ? 3 : 1;
          const entradas = nasc + compra;
          const saidas = venda + morte;
          const final = saldo + entradas - saidas;
          const medias = (saldo + final) / 2;
          const gmd = arred(cat.gmd * SAZ[m - 1] * gk, 4);
          const prod = arred(gmd * medias * dias, 2);
          const pesoEnt = entradas * (ci === 2 ? 38 : cat.pm);
          const pesoSai = saidas * (cat.pm + 20);
          const pesoFinal = arred(pesoTotal + pesoEnt - pesoSai + prod, 2);
          out.push({
            fazenda_id: fid, cliente_id: CLI, ano: ANO, mes: m, cenario, ano_mes: `${ANO}-${pad(m)}`,
            categoria_id: cat.id, categoria_codigo: cat.codigo, categoria_nome: cat.nome, ordem_exibicao: cat.ordem_exibicao,
            saldo_inicial: saldo, entradas_externas: entradas, saidas_externas: saidas, evol_cat_entrada: 0, evol_cat_saida: 0, saldo_final: final,
            saldo_sistema: final, saldo_p1: final,
            peso_total_inicial: arred(pesoTotal, 2), peso_total_final: pesoFinal,
            peso_medio_inicial: saldo ? arred(pesoTotal / saldo, 2) : null, peso_medio_final: final ? arred(pesoFinal / final, 2) : null,
            peso_entradas_externas: pesoEnt, peso_saidas_externas: pesoSai, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0,
            dias_mes: dias, gmd, producao_biologica: prod,
            cab_nascimento: nasc, cab_compra: compra, cab_transf_entrada: 0, cab_abate: 0, cab_venda: venda, cab_venda_pe: 0,
            cab_transf_saida: 0, cab_consumo: 0, cab_morte: morte,
            peso_nascimento: nasc * 38, peso_compra: compra * cat.pm, peso_transf_entrada: 0, peso_abate: 0, peso_venda: venda * (cat.pm + 20),
            peso_venda_pe: 0, peso_transf_saida: 0, peso_consumo: 0, peso_morte: morte * (cat.pm + 20), peso_carcaca_abate: 0,
            fonte_oficial_mes: 'fechamento',
          });
          saldo = final;
          pesoTotal = pesoFinal;
        }
      });
    }
  }
  return out;
}

/* vw_zoot_fazenda_mensal: a linha do mês por fazenda, agregada do cache realizado */
function zootFazendaMensal(cache: Reg[]): Reg[] {
  const out: Reg[] = [];
  for (const fid of ['fA', 'fB']) for (const m of mesesAte(MES_ATUAL)) {
    const cats = cache.filter((r) => r.fazenda_id === fid && r.mes === m && r.cenario === 'realizado');
    const soma = (campo: string) => cats.reduce((s, r) => s + Number(r[campo]), 0);
    const ini = soma('saldo_inicial'); const fin = soma('saldo_final'); const medias = (ini + fin) / 2; const prod = soma('producao_biologica');
    const pesoFim = soma('peso_total_final');
    const dias = DIAS[m - 1];
    out.push({ fazenda_id: fid, cliente_id: CLI, ano: ANO, mes: m, cenario: 'realizado', cabecas_inicio: ini, cabecas_final: fin, dias_mes: dias,
      gmd_kg_cab_dia: arred(prod / medias / dias, 4), gmd_numerador_kg: prod, ua_media: arred((medias * (pesoFim / fin)) / 450, 2),
      peso_inicio_kg: soma('peso_total_inicial') });
  }
  return out;
}

/* ── caixa ─────────────────────────────────────────────────────────────────────── */
const CONTAS = [
  { id: 'cb1', cliente_id: CLI, tipo_conta: 'cc', nome_exibicao: 'Conta Corrente Principal', nome_conta: 'Conta Corrente Principal', ativa: true, ordem_exibicao: 1 },
  { id: 'cb2', cliente_id: CLI, tipo_conta: 'inv', nome_exibicao: 'Aplicação Automática', nome_conta: 'Aplicação Automática', ativa: true, ordem_exibicao: 2 },
];
function saldosBancarios(): Reg[] {
  const out: Reg[] = [];
  const ondas = [180, -240, 320, 90, -150, 410, 260, -120, 340, 150, 220, -60];
  const aplic = [900, 920, 940, 1000, 1010, 1040, 1080, 1100, 1120, 1160, 1180, 1200];
  let cc = 640;
  const anos = [2024, 2025, 2026];
  for (const a of anos) for (const m of mesesAte(12)) {
    if (a === ANO && m > MES_ATUAL) break;
    const ini = cc;
    cc = Math.max(150, cc + ondas[(m + a) % 12] * (a === 2024 ? 0.5 : 1));
    const base = { cliente_id: CLI, ano_mes: `${a}-${pad(m)}` };
    out.push({ ...base, conta_bancaria_id: 'cb1', saldo_inicial: Math.round(ini * 1000), saldo_final: Math.round(cc * 1000),
      financeiro_contas_bancarias: CONTAS[0] });
    const ap = aplic[m - 1] * (a === 2024 ? 0.7 : a === 2025 ? 0.85 : 1);
    out.push({ ...base, conta_bancaria_id: 'cb2', saldo_inicial: Math.round((ap - 20) * 1000), saldo_final: Math.round(ap * 1000),
      financeiro_contas_bancarias: CONTAS[1] });
  }
  return out;
}

/* movimento do caixa por mês: receita pecuária e custeio (fixo/variável), com o líquido igual à variação do saldo somado */
function lancamentosCaixa(saldos: Reg[]): Reg[] {
  const total = (ano: number, m: number) => saldos.filter((r) => r.ano_mes === `${ano}-${pad(m)}`).reduce((s, r) => s + Number(r.saldo_final), 0);
  const out: Reg[] = [];
  let n = 0;
  const linha = (m: number, entrada: boolean, grupo: string, centro: string, valor: number): Reg => {
    n++;
    const dia = pad(10 + (n % 15));
    return { id: `l${n}`, lancamento_id: `l${n}`, parte_ordem: 1, partes_total: 1, valor, valor_lancamento: valor, fazenda_id: 'fA', cliente_id: CLI,
      data_competencia: `${ANO}-${pad(m)}-${dia}`, data_pagamento: `${ANO}-${pad(m)}-${dia}`, ano_mes: `${ANO}-${pad(m)}`,
      status_transacao: 'realizado', cenario: 'realizado', sem_movimentacao_caixa: false, tipo_operacao: entrada ? '1-Entradas' : '2-Saídas', macro_custo: entrada ? 'Receitas' : 'Custeio Produtivo',
      grupo_custo: grupo, centro_custo: centro, subcentro: centro, escopo_negocio: 'pecuaria', sinal: entrada ? 1 : -1,
      conta_bancaria_id: 'cb1', conta_destino_id: null, cancelado: false, compoe_dre: true, descricao: centro, origem_lancamento: 'manual' };
  };
  for (const m of mesesAte(MES_ATUAL)) {
    const anterior = m === 1 ? total(ANO - 1, 12) : total(ANO, m - 1);
    const liquido = total(ANO, m) - anterior;
    const receita = 1700000 + (m % 4) * 90000;
    const custeio = receita - liquido;
    out.push(linha(m, true, 'Receita Pecuária', 'Venda de Gado', receita));
    out.push(linha(m, false, 'Custo Variável Pecuária', 'Nutrição', Math.round(custeio * 0.6)));
    out.push(linha(m, false, 'Custo Fixo Pecuária', 'Mão de Obra', Math.round(custeio * 0.4)));
  }
  return out;
}

/* ── status do fechamento ──────────────────────────────────────────────────────── */
type Pilar = 'oficial' | 'pendente' | 'nao_aplicavel' | 'nao_iniciado';
function statusPilares(fid: string, m: number): { p1: Pilar; p2: Pilar } {
  if (fid === 'fC') return { p1: 'nao_aplicavel', p2: 'nao_aplicavel' };
  if (m > MES_ATUAL) return { p1: 'nao_iniciado', p2: 'nao_iniciado' };
  if (fid === 'fB' && m === MES_ATUAL) return { p1: 'pendente', p2: 'pendente' };
  return { p1: 'oficial', p2: 'oficial' };
}
function statusAno(): Reg[] {
  const out: Reg[] = [];
  for (const f of FAZENDAS_VG) for (const m of mesesAte(12)) {
    const s = statusPilares(f.id, m);
    out.push({ fazenda_id: f.id, fazenda_nome: f.nome, ano_mes: `${ANO}-${pad(m)}`, p1: s.p1, p2: s.p2 });
  }
  return out;
}

/* ── chuvas ────────────────────────────────────────────────────────────────────── */
function chuvas(): Reg[] {
  const out: Reg[] = [];
  const mm = [210, 160, 190, 80, 35, 10, 5, 8, 45, 120, 190, 230];
  let n = 0;
  for (const f of FAZENDAS_VG) for (const m of mesesAte(MES_ATUAL)) {
    const total = mm[m - 1] * (f.id === 'fA' ? 1 : f.id === 'fB' ? 0.9 : 1.1);
    const eventos = total > 100 ? 6 : total > 30 ? 3 : 1;
    for (let i = 0; i < eventos; i++) {
      n++;
      out.push({ id: `ch${n}`, fazenda_id: f.id, cliente_id: CLI, data: `${ANO}-${pad(m)}-${pad(3 + i * 4)}`,
        milimetros: arred(total / eventos, 1), observacao: null });
    }
  }
  return out;
}

/* ── DRE da pecuária ───────────────────────────────────────────────────────────── */
function linhasDre(k: number, f: number, meses: number, fazenda: string) {
  const a = (k * meses) / 12;
  const rec = (v: number) => Math.round(v * a * f);
  const vendas = rec(9600000); const outras = rec(150000); const bruta = vendas + outras; const deducoes = rec(180000);
  const liquida = bruta - deducoes; const reposicao = rec(3100000); const variavel = rec(1900000);
  const margem = liquida - reposicao - variavel; const fixo = rec(1250000); const adm = rec(380000);
  const oper = margem - fixo - adm; const juros = rec(210000); const periodo = oper - juros; const invest = rec(520000);
  const cab = fazenda === 'fA' ? 4000 : fazenda === 'fB' ? 1500 : 5500;
  return {
    vendas, outras_receitas: outras, receita_bruta: bruta, deducoes, receita_liquida: liquida,
    vpb_operacional: Math.round(liquida - reposicao + rec(900000)), reposicao, vbp: Math.round(liquida - reposicao + rec(900000)),
    custo_variavel: variavel, margem, custo_fixo: fixo, rateio_adm: adm, resultado_operacional: oper, juros, resultado_periodo: periodo,
    efeito_mercado: rec(240000), resultado_com_mercado: periodo + rec(240000), investimento: invest, lucro_liquido: periodo - invest,
    juros_proprio: Math.round(juros * 0.6), juros_rateado: Math.round(juros * 0.4), a_pagar: rec(310000),
    patrimonio: { v_ini_p0: rec(21000000), v_fim_p0: rec(21800000), v_fim_p1: rec(22900000), cab_ini: cab, cab_fim: cab + 60, cab_media: cab + 30 },
    producao: {
      ha_medio: fazenda === 'fA' ? 3000 : fazenda === 'fB' ? 1300 : 4300,
      at_produzida: Math.round(28500 * a * f), at_desfrutada: Math.round(21000 * a * f), cab_desfrutada: Math.round(1650 * a * f),
      at_comprada: Math.round(5200 * a * f), cab_comprada: Math.round(780 * a * f),
    },
    p0_fonte: 'fechamento', p1_fonte: 'fechamento',
    centros: [
      { bloco: 'variavel', centro: 'Nutrição', valor: Math.round(variavel * 0.6), a_pagar: 0 },
      { bloco: 'variavel', centro: 'Sanidade', valor: Math.round(variavel * 0.4), a_pagar: 0 },
    ],
    centros_juros: [],
  };
}
function drePecuaria(args: Reg): Reg {
  const meta = args.p_cenario === 'meta';
  const de = typeof args.p_de === 'string' ? args.p_de : `${ANO}-01-01`;
  const ate = typeof args.p_ate === 'string' ? args.p_ate : `${ANO}-${pad(MES_ATUAL)}-30`;
  const meses = Math.max(1, (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) + 1);
  const k = meta ? 1.07 : 1;
  const anoAnt = Number(de.slice(0, 4)) < ANO;
  const kk = anoAnt ? 0.88 : k;
  return {
    periodo: { de, ate, p0: `${Number(de.slice(0, 4)) - 1}-12`, meses },
    rateio_adm: { pool: Math.round(380000 * meses / 12 * 1.4), bruto: Math.round(380000 * meses / 12 * 1.5), criterio: 'área', grupos: [] },
    fazendas: [
      { fazenda_id: 'fA', nome: 'Faz. Exemplo Sul', linhas: linhasDre(kk, 1, meses, 'fA') },
      { fazenda_id: 'fB', nome: 'Faz. Exemplo Norte', linhas: linhasDre(kk, 0.38, meses, 'fB') },
    ],
    total: linhasDre(kk, 1.38, meses, 'total'),
  };
}

/* ── conciliação ───────────────────────────────────────────────────────────────── */
function resumoConciliacao(): Reg[] {
  const zero = { qtde: 0, valor: 0 };
  const base = { tem_extrato: true, saldo_inicial_origem: 'informado', banco: { entradas: 0, saidas: 0 }, retido_em_depositos: zero,
    motivos: [], avisos: [], posicao: null, sem_conta: null, linhas_sistema: null, proprio: null, internas: [] };
  return [
    { ...base, nivel: 'conta', conta_id: 'cb1', conta_nome: 'Conta Corrente Principal', tipo_conta: 'cc', saldo_inicial: 640000, entradas: 1850000, saidas: 1620000,
      saldo_sistema: 870000, saldo_extrato: 866300, saldo_extrato_data: `${ANO}-${pad(MES_ATUAL)}-31`, diferenca: 3700,
      extratos_sem_par: { qtde: 3, valor: 3700 }, lancamentos_sem_par: { qtde: 2, valor: 2150 }, status: 'nao_conciliado' },
    { ...base, nivel: 'conta', conta_id: 'cb2', conta_nome: 'Aplicação Automática', tipo_conta: 'inv', saldo_inicial: 1160000, entradas: 25000, saidas: 5000,
      saldo_sistema: 1180000, saldo_extrato: 1180000, saldo_extrato_data: `${ANO}-${pad(MES_ATUAL)}-31`, diferenca: 0,
      extratos_sem_par: { qtde: 1, valor: 920 }, lancamentos_sem_par: { qtde: 1, valor: 1480 }, status: 'conciliado' },
    { ...base, nivel: 'total', conta_id: null, conta_nome: 'Total', tipo_conta: null, saldo_inicial: 1800000, entradas: 1875000, saidas: 1625000,
      saldo_sistema: 2050000, saldo_extrato: 2046300, saldo_extrato_data: null, diferenca: 3700,
      extratos_sem_par: { qtde: 4, valor: 4620 }, lancamentos_sem_par: { qtde: 3, valor: 3630 }, status: 'nao_conciliado' },
  ];
}

/* ── agricultura ───────────────────────────────────────────────────────────────── */
const SAFRAS = [
  { id: 's2526', nome: 'Safra 25/26', codigo: '25/26', ciclo: 'verao', data_inicio: '2025-07-01', data_fim: '2026-06-30', escopo_negocio: 'agricultura', ativa: true, cliente_id: CLI, ordem_exibicao: 1 },
  { id: 's2627', nome: 'Safra 26/27', codigo: '26/27', ciclo: 'verao', data_inicio: '2026-07-01', data_fim: '2027-06-30', escopo_negocio: 'agricultura', ativa: true, cliente_id: CLI, ordem_exibicao: 2 },
];
function areasSafra(): Reg[] {
  const talhoes: [string, number][] = [['pA6', 100], ['pA7', 90], ['pA8', 90]];
  const out: Reg[] = [];
  for (const s of SAFRAS) talhoes.forEach(([pid, ha], i) => {
    const nova = s.id === 's2627';
    out.push({ id: `${s.id}-${pid}`, safra_id: s.id, pasto_id: pid, cliente_id: CLI, cultura: 'amendoim', variedade: i === 2 ? 'Runner IAC 886' : 'Granoleico',
      status: nova ? 'abertura' : 'plantada', area_plantada_ha: ha, ativo: true,
      data_plantio: nova ? null : `2025-1${i}-1${i + 2}`, data_colheita_prevista: nova ? null : `2026-03-1${i}`, data_colheita_real: nova ? null : `2026-03-2${i}`, observacoes: null });
  });
  return out;
}
function dv(valor: number, receita: number, area: number) {
  return { valor, por_ha: Math.round(valor / area), pct_receita: receita ? arred((valor / receita) * 100, 1) : 0 };
}
function linhasLavoura(rb: number, custeio: number, area: number) {
  const ded = Math.round(rb * 0.02); const liq = rb - ded; const pos = Math.round(rb * 0.07); const rat = Math.round(rb * 0.013);
  const var_ = custeio + pos + rat; const mc = liq - var_; const fixo = Math.round(rb * 0.06); const adm = Math.round(rb * 0.03);
  const oper = mc - fixo - adm; const juros = Math.round(rb * 0.024); const caixa = oper - juros; const inv = Math.round(rb * 0.04);
  return {
    receita_bruta: dv(rb, rb, area), deducoes: dv(ded, rb, area), receita_liquida: dv(liq, rb, area), custeio: dv(custeio, rb, area),
    pos_colheita: dv(pos, rb, area), rateio_compartilhado: dv(rat, rb, area), custo_variavel: dv(var_, rb, area),
    margem_contribuicao: dv(mc, rb, area), custo_fixo: dv(fixo, rb, area), rateio_admin: dv(adm, rb, area),
    resultado_operacional: dv(oper, rb, area), juros: dv(juros, rb, area), resultado_caixa: dv(caixa, rb, area),
    investimento: dv(inv, rb, area), lucro_liquido: dv(caixa - inv, rb, area), depreciacao: dv(Math.round(rb * 0.02), rb, area),
  };
}
function dreLavoura(safraId: string): Reg {
  const s = SAFRAS.find((x) => x.id === safraId) ?? SAFRAS[0];
  const fechada = s.id === 's2526';
  const rb = fechada ? 2940000 : 0; const custeio = fechada ? 1350000 : 310000;
  const linhas = linhasLavoura(rb, custeio, 280);
  return {
    versao: 'sint', safra: { id: s.id, codigo: s.codigo, data_inicio: s.data_inicio, data_fim: s.data_fim },
    culturas: [{ cultura: 'amendoim', area_ha: 280, peso_area: 1, producao: fechada ? 21000 : 0, produtividade: fechada ? 75 : 0, linhas,
      a_pagar: { operacional: fechada ? 120000 : 40000, investimento: 0 }, custo_operacional: custeio, pct_direto: 0.92,
      equilibrio: { preco_realizado: fechada ? 140 : null, preco_equilibrio: fechada ? 98 : null, produtividade_equilibrio: fechada ? 52 : null } }],
    total: { area_ha: 280, linhas, custo_operacional: custeio, a_pagar: { operacional: fechada ? 120000 : 40000, investimento: 0 }, pct_direto: 0.92 },
    centros: [
      { bloco: 'custeio', centro: 'Insumos', por_cultura: { amendoim: { valor: Math.round(custeio * 0.6), direto: Math.round(custeio * 0.6), rateado: 0, a_pagar: 0 } },
        total: { valor: Math.round(custeio * 0.6), direto: Math.round(custeio * 0.6), rateado: 0, a_pagar: 0 } },
    ],
    rateio_admin: { admin_total: 380000, parcela_agricultura: fechada ? 88000 : 12000, declarado: true },
    pool_compartilhado: {}, nao_apropriado: { por_bloco: {}, total: 0 }, gerado_em: `${ANO}-${pad(MES_ATUAL)}-30T12:00:00Z`,
  };
}

/* ── o banco ───────────────────────────────────────────────────────────────────── */
const CACHE_ZOOT = zootCache();
const SALDOS = saldosBancarios();
const TABELAS: Record<string, Reg[]> = {
  fazendas: FAZENDAS_VG.map((f) => ({ ...f })),
  categorias_rebanho: CATEGORIAS_SINT.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, ordem_exibicao: c.ordem_exibicao })),
  pastos: pastosCadastro(),
  fechamento_pastos: fechamentoPastos(),
  fazenda_geometrias: fazendaGeometrias(),
  fechamento_area_snapshot: snapshotsArea(),
  zoot_mensal_cache: CACHE_ZOOT,
  vw_zoot_fazenda_mensal: zootFazendaMensal(CACHE_ZOOT),
  saldos_iniciais: ['fA', 'fB'].flatMap((fid) => CATEGORIAS_SINT.map((c, i) => ({ fazenda_id: fid, cliente_id: CLI, ano: ANO, mes: 1, categoria_id: c.id, quantidade: BASE_CAB[fid][i] }))),
  financeiro_contas_bancarias: CONTAS.map((c) => ({ ...c })),
  financeiro_saldos_bancarios_v2: SALDOS,
  vw_fin_classificacao_por_parte: lancamentosCaixa(SALDOS),
  chuvas: chuvas(),
  financeiro_safras: SAFRAS.map((s) => ({ ...s })),
  agri_safra_area: areasSafra(),
};

export const bancoVG02 = {
  from: (tabela: string, e: Estado): Reg[] => filtrar(TABELAS[tabela] ?? [], e),
  rpc: (fn: string, a: Reg): unknown => {
    switch (fn) {
      case 'get_status_pilares_ano': return statusAno();
      case 'get_status_pilares_fechamento': {
        const fid = String(a._fazenda_id ?? '');
        const m = Number(String(a._ano_mes ?? '').slice(5, 7));
        const s = statusPilares(fid, m);
        return { p1_mapa_pastos: { status: s.p1 }, p2_valor_rebanho: { status: s.p2 } };
      }
      case 'fn_dre_pecuaria': return drePecuaria(a);
      case 'fn_cliente_atividades_liberadas': return { cadastrado: true, atividades: [
        { id: 'a1', nome: 'Pecuária de corte', familia: 'pecuaria', grupo_menu: 'pecuaria', ordem: 1, ativo: true },
        { id: 'a2', nome: 'Lavoura', familia: 'lavoura_anual', grupo_menu: 'agricultura', ordem: 2, ativo: true },
        { id: 'a3', nome: 'Eucalipto', familia: 'silvicultura', grupo_menu: 'silvicultura', ordem: 3, ativo: true },
      ] };
      case 'fn_conciliacao_resumo_mes': return resumoConciliacao();
      case 'fn_estoque_graos_resumo': return [{ cultura: 'amendoim', saldo: 5400, valor: 756000, colhido: 21000, entregue: 15600, recebido: 0 }];
      case 'fn_dre_lavoura': return dreLavoura(String(a.p_safra_id ?? ''));
      default: return null;
    }
  },
};
