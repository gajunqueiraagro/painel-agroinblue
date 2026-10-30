/* FIN-VISAO-GERAL-01 PR 3 — o banco SINTÉTICO da Visão Geral na bancada (`tela=visao-geral`). Faz o papel da `fn_vg_tela`: monta o
 * jsonb que o banco devolve — vários grupos, "Sem classificação", transferência de/para outras contas, previsto (depois de out/2026) e
 * previsto VENCIDO no mês corrente. É a bancada que soma aqui (ela é o banco); a tela só desenha.
 * As contas e a atividade escolhidas MUDAM a lista de grupos (o pior caso para o `check:ui-desloca`: o conteúdo muda, os blocos não). */
const HOJE = '2026-10';
const GRUPOS_SAI = ['Custeio', 'Reposição de bovinos', 'Investimentos', 'Amortizações', 'Juros', 'Impostos e deduções', 'Dividendos', 'Outras saídas'];
const GRUPOS_ENT = ['Receitas operacionais', 'Entradas de capital e financiamento', 'Outras entradas'];
const BASE: Record<string, number> = {
  Custeio: 1085767.57, 'Reposição de bovinos': 412000, Investimentos: 294752.16, Amortizações: 522719.29, Juros: 69241.15,
  'Impostos e deduções': 15495.2, Dividendos: 193845.55, 'Outras saídas': 74215.11, 'Receitas operacionais': 907903.99,
  'Entradas de capital e financiamento': 760036.82, 'Outras entradas': 35506,
};
const am = (a: number, m: number) => `${a}-${String(m + 1).padStart(2, '0')}`;
const meses = (de: string, ate: string) => {
  const o: string[] = [];
  for (let a = +de.slice(0, 4), m = +de.slice(5, 7) - 1; am(a, m) <= ate.slice(0, 7); m === 11 ? (a++, m = 0) : m++) o.push(am(a, m));
  return o;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

export const FILTROS = {
  contas: [
    { id: 'c1', nome: 'Banco Exemplo Conta Movimento Principal', tipo: 'cc', ativa: true, no_caixa: true },
    { id: 'c2', nome: 'Cooperativa Exemplo', tipo: 'cc', ativa: true, no_caixa: true },
    { id: 'c3', nome: 'Aplicação Exemplo CDB', tipo: 'inv', ativa: true, no_caixa: true },
    { id: 'c4', nome: 'Cartão Exemplo', tipo: 'cartao', ativa: true, no_caixa: true },
  ],
  atividades: ['pecuaria', 'agricultura', 'silvicultura', 'administrativo'],
  safras: [{ id: 's1', nome: 'Safra 2026/27' }, { id: 's2', nome: 'Safra 2025/26' }],
};

export function tela(a: { p_de: string; p_ate: string; p_contas?: string[] | null; p_atividade?: string | null; p_safra?: string | null; p_fazendas?: string[] | null;
  p_status?: string[] | null; p_incluir_vencidos?: boolean | null; varia?: boolean }) {
  const ms = meses(a.p_de, a.p_ate);
  /* P79 — os chips: o previsto (meses depois de hoje) na proporção dos status ligados; o vencido sai com o chip desligado */
  const st = a.p_status ?? ['previsto', 'programado', 'agendado'];
  const incl = a.p_incluir_vencidos ?? true;
  const fs = st.length / 3;
  const semSaldo = !!(a.p_fazendas?.length || a.p_atividade || a.p_safra);
  const peso = a.p_contas ? Math.max(0.2, a.p_contas.length / 3) : 1;
  const ativ = a.p_atividade ?? null;
  const sai = GRUPOS_SAI.filter((g) => !(ativ === 'agricultura' && (g === 'Reposição de bovinos' || g === 'Dividendos')) && !(ativ === 'administrativo' && g === 'Custeio'));
  const ent = GRUPOS_ENT.filter((g) => !(ativ && g === 'Entradas de capital e financiamento'));
  const serie = (g: string, gi: number) => ms.map((x, i) => r2((BASE[g] ?? 50000) * peso * (a.p_safra ? 0.6 : 1) * (1 + 0.12 * Math.sin(i * 1.3 + gi)) * (ativ ? 0.55 : 1)
    * (x > HOJE ? fs : 1)));
  const linhas: any[] = [];
  const tot: Record<string, number[]> = { entrada: ms.map(() => 0), saida: ms.map(() => 0) };
  const venc: Record<string, number[]> = { entrada: ms.map(() => 0), saida: ms.map(() => 0) };
  const grupos: any[] = [];
  const add = (lado: 'entrada' | 'saida', g: string, vals: number[], tipo = 'grupo', centro = '', vv: number[] = ms.map(() => 0)) => {
    if (tipo === 'grupo') vals.forEach((v, i) => { tot[lado][i] += v; venc[lado][i] += vv[i]; });
    grupos.push({ lado, g, vals, tipo, centro, vv });
  };
  ent.forEach((g, gi) => add('entrada', g, serie(g, gi)));
  if (!ativ) add('entrada', 'Outras entradas', ms.map((_, i) => r2(12000 * peso + i * 300)), 'transf', 'Transferências de outras contas');
  add('entrada', 'Sem classificação', ms.map((x) => (x <= HOJE ? r2(4200 * peso) : 0)));
  sai.forEach((g, gi) => {
    /* P100 item 8 — `varia` (`&vg_grupos=varia`): o nº de grupos de saída com valor muda com o mês (jan 1 … ago 8): o card com 1 e
       com 8 grupos, para o gate de deslocamento */
    const vals0 = serie(g, gi + 3).map((v, i) => (!a.varia || gi < (+ms[i].slice(5, 7) - 1) % 8 + 1 ? v : 0));
    const vv0 = ms.map((x, i) => (x === HOJE && g === 'Custeio' ? r2(vals0[i] * 0.18 * fs) : 0));
    const vals = incl ? vals0 : vals0.map((v, i) => r2(v - vv0[i]));
    add('saida', g, vals, 'grupo', '', incl ? vv0 : ms.map(() => 0));
  });
  if (!ativ) add('saida', 'Outras saídas', ms.map((_, i) => r2(31773.11 * peso + i * 250)), 'transf', 'Transferências para outras contas');
  add('saida', 'Sem classificação', ms.map((x) => (x <= HOJE ? r2(8900 * peso) : 0)));
  const ladoTotal = (lado: string) => tot[lado].reduce((x, y) => x + y, 0);
  const real = ms.map((x) => x <= HOJE);
  /* P90 — as séries do critério (o banco sintético faz o papel da fn_vg_tela: soma e média do início do período até o mês) */
  const acum = (vals: number[]) => { let a2 = 0; return vals.map((v) => r2((a2 += v))); };
  const media = (vals: number[]) => acum(vals).map((v, i) => r2(v / (i + 1)));
  const linha = (lado: string, tipo: string, grupo: string, rotulo: string, vals: number[], vv: number[]) => {
    const t = vals.reduce((x, y) => x + y, 0);
    const vr = vals.filter((_, i) => real[i]);
    const md = vr.length ? vr.reduce((x, y) => x + y, 0) / vr.length : 0;
    return {
      chave: `${lado}:${tipo}:${grupo}`, tipo, lado, grupo: tipo === 'total' ? null : grupo, rotulo, valores: vals.map(r2), vencidos: vv.map(r2),
      pct_mes: vals.map((v, i) => (tot[lado][i] ? r1((v / tot[lado][i]) * 100) : null)),
      vs_media: vals.map((v) => (md ? r1(((v - md) / Math.abs(md)) * 100) : null)),
      valores_acum: acum(vals), valores_media: media(vals),
      pct_acum: acum(vals).map((v, i) => { const tt = acum(tot[lado])[i]; return tt ? r1((v / tt) * 100) : null; }),
      total: r2(t), media: r2(t / ms.length), pct: tipo === 'total' ? null : ladoTotal(lado) ? r1((t / ladoTotal(lado)) * 100) : null,
    };
  };
  const saldoIni: number[] = [];
  let s = 1833644.67 * peso;
  ms.forEach((_, i) => { saldoIni.push(r2(s)); s += tot.entrada[i] - tot.saida[i]; });
  const saldoFim = ms.map((_, i) => r2(saldoIni[i] + tot.entrada[i] - tot.saida[i]));
  for (const lado of ['entrada', 'saida'] as const) {
    linhas.push(linha(lado, 'total', '', lado === 'entrada' ? 'ENTRADAS' : 'SAÍDAS TOTAIS', tot[lado], venc[lado]));
    grupos.filter((x) => x.lado === lado).forEach((x) => linhas.push(linha(lado, x.tipo, x.tipo === 'transf' ? `${x.g}:${x.centro}` : x.g, x.tipo === 'transf' ? x.centro : x.g, x.vals, x.vv)));
  }
  const ordem = (l: any) => (l.tipo === 'total' ? 0 : l.grupo === 'Sem classificação' ? 99 : (l.lado === 'saida' ? GRUPOS_SAI : GRUPOS_ENT).indexOf(String(l.grupo).split(':')[0]) + (l.tipo === 'transf' ? 1.5 : 1));
  linhas.sort((x, y) => (x.lado === y.lado ? ordem(x) - ordem(y) : x.lado < y.lado ? -1 : 1));
  const res = ms.map((_, i) => r2(tot.entrada[i] - tot.saida[i]));
  /* P82 — contas escolhidas SEM o cartão: o pagamento da fatura vem numa linha própria (transferência, nunca saída) */
  const semCartao = !semSaldo && !!a.p_contas && !a.p_contas.includes('c4');
  const cartaoVals = ms.map((x) => (semCartao && x <= HOJE ? r2(31773.11 * peso) : 0));
  const resT = res.reduce((x, y) => x + y, 0);
  const mediaAcc = (lado: string) => { let acc = 0, q = 0; return ms.map((_, i) => { if (!real[i]) return null; acc += tot[lado][i]; q++; return r2(acc / q); }); };
  return {
    mes_atual: HOJE,
    meses: ms.map((x) => ({ am: x, previsto: x > HOJE, vigente: x === HOJE })),
    /* P83 — saldo só por conta: com fazenda ou atividade, nenhuma linha de saldo (o banco diz `sem_saldo`) */
    linhas: [...(semSaldo ? [] : [{ chave: 'saldo_inicial', tipo: 'saldo', rotulo: 'Saldo inicial', valores: saldoIni, total: saldoIni[0] }]), ...linhas,
      ...(semCartao ? [{ chave: 'cartao', tipo: 'cartao', rotulo: 'PAGAMENTO DE CARTÃO (transferência)', valores: cartaoVals,
        total: r2(cartaoVals.reduce((x, y) => x + y, 0)), media: r2(cartaoVals.reduce((x, y) => x + y, 0) / ms.length) }] : []),
      { chave: 'resultado', tipo: 'resultado', rotulo: 'Resultado no mês', valores: res, total: r2(resT), media: r2(resT / ms.length),
        valores_acum: acum(res), valores_media: media(res) },
      ...(semSaldo ? [] : [{ chave: 'saldo_final', tipo: 'saldo', rotulo: 'Saldo final · fluxo de caixa', valores: saldoFim, total: saldoFim[saldoFim.length - 1] }])],
    grafico: {
      entrada: { media_acumulada: mediaAcc('entrada'), meta: ms.map(() => r2(1700000 * peso)) },
      saida: { media_acumulada: mediaAcc('saida'), meta: ms.map((x) => (x.startsWith('2026') ? r2(2300000 * peso) : null)) },
    },
    conciliado_ate: semSaldo ? null : '2026-10-15', conciliado_saldo: semSaldo ? null : 9_876_543.21, sem_saldo: semSaldo,
    status: st, incluir_vencidos: incl,
    contas_sem_ancora: a.p_contas?.includes('c4') ? ['Cartão Exemplo'] : [],
  };
}

/* PR 4 — o banco SINTÉTICO do MODAL DE ANÁLISE (`fn_vg_analise`). A árvore: grupo › atividade › centro › subcentro, com os nomes
 * MAIS LONGOS que os reais (o pior caso de largura) e valores na casa dos milhões; a parte de cada filho fecha com o pai. Meta só no
 * Custeio (a régua e o "—" do resto). Unidade: R$/cab, R$/UA, R$/@ e R$/ha com denominadores fixos; só onde vale (pecuária, etc.). */
const ATIV: [string | null, number][] = [['pecuaria', 0.62], ['agricultura', 0.23], ['administrativo', 0.1], [null, 0.05]];
/* VG-CUSTEIO-FIXO-VARIAVEL-01 — o 3o campo: o bloco do centro (o `grupo_custo` do Plano de Contas) */
const CENTROS_3: [string, number, 'variavel' | 'fixo'][] = [['Nutrição e suplementação mineral do rebanho de cria e recria', 0.5, 'variavel'],
  ['Sanidade animal e reprodução assistida', 0.3, 'variavel'], ['Manutenção de pastagens, cercas e aguadas', 0.2, 'fixo']];
/* VG-CUSTEIO-FIXO-VARIAVEL-01 — `&vg_centros=13`: o molde do caso de out/26 (7 variáveis + 6 fixos, nomes longos), o card mais alto */
const CENTROS_13: [string, number, 'variavel' | 'fixo'][] = [
  ['Nutrição e suplementação mineral do rebanho de cria e recria', 0.14, 'variavel'], ['Sanidade animal e reprodução assistida', 0.06, 'variavel'],
  ['Reprodução, inseminação e protocolos de IATF', 0.05, 'variavel'], ['Combustíveis e lubrificantes das máquinas', 0.04, 'variavel'],
  ['Fretes de animais e de insumos', 0.03, 'variavel'], ['Comissões e taxas de comercialização', 0.02, 'variavel'], ['Outros insumos da pecuária', 0.02, 'variavel'],
  ['Mão de obra fixa, encargos e benefícios', 0.24, 'fixo'], ['Manutenção de pastagens, cercas e aguadas', 0.15, 'fixo'],
  ['Manutenção de máquinas, veículos e benfeitorias', 0.11, 'fixo'], ['Energia elétrica e comunicação', 0.06, 'fixo'],
  ['Arrendamentos de pastagem', 0.05, 'fixo'], ['Seguros e licenças', 0.03, 'fixo']];
const SUBS: [string, number][] = [['Sal mineral proteinado de seca', 0.4], ['Ração de creep-feeding para bezerros', 0.3], ['Vacinas e vermífugos', 0.2], ['Outros insumos', 0.1]];
const ROT_ATIV: Record<string, string> = { pecuaria: 'Pecuária', agricultura: 'Agricultura', administrativo: 'Administrativo' };
const DEN: Record<string, number> = { rs_cab: 7082.5, rs_ua: 5310.2, rs_arroba: 1840.4, rs_ha_prod: 2650, rs_ha_pec: 1980, rs_ha_agri: 670, rs_ha_plant: 540 };
const UNID: [string, string][] = [['rs', 'R$'], ['rs_cab', 'R$/cab/mês'], ['rs_ua', 'R$/UA/mês'], ['rs_arroba', 'R$/@'], ['rs_ha_prod', 'R$/ha produtiva'],
  ['rs_ha_pec', 'R$/ha pecuária'], ['rs_ha_agri', 'R$/ha agricultura'], ['rs_ha_plant', 'R$/ha plantado']];
const validas = (ativ: string | null | undefined) => ativ === 'pecuaria' ? ['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
  : ativ === 'agricultura' ? ['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant'] : ['rs', 'rs_ha_prod'];

export function analise(a: { p_de: string; p_ate: string; p_mes: string; p_lado: 'entrada' | 'saida'; p_aba?: string | null; p_foco?: (string | null)[];
  p_grafico?: (string | null)[] | null; p_criterio?: string; p_unidade?: string; p_contas?: string[] | null; grande?: boolean; centros13?: boolean }) {
  const ms = meses(a.p_de, a.p_ate);
  const k = ms.indexOf(a.p_mes);
  const CENTROS = a.centros13 ? CENTROS_13 : CENTROS_3;
  const crit = a.p_criterio ?? 'mes', uni = a.p_unidade ?? 'rs';
  const peso = a.p_contas ? Math.max(0.2, a.p_contas.length / 3) : 1;
  const grupos = a.p_lado === 'saida' ? GRUPOS_SAI : GRUPOS_ENT;
  const parte = (p: (string | null)[]) => (p.length > 1 ? ATIV.find((x) => x[0] === p[1])?.[1] ?? 0 : 1)
    * (p.length > 2 ? CENTROS.find((x) => x[0] === p[2])?.[1] ?? 0 : 1) * (p.length > 3 ? SUBS.find((x) => x[0] === p[3])?.[1] ?? 0 : 1);
  const base = (p: (string | null)[]) => (p.length === 0 ? grupos.reduce((s, g) => s + (BASE[g] ?? 50000), 0) : (BASE[p[0]!] ?? 50000) * parte(p));
  const mesV = (p: (string | null)[], i: number) => r2(base(p) * 3 * peso * (1 + 0.15 * Math.sin(i * 1.1 + p.length)));
  const janela = (p: (string | null)[]) => { const vs = ms.slice(0, k + 1).map((_, i) => mesV(p, i)); const s = vs.reduce((x, y) => x + y, 0);
    return crit === 'mes' ? mesV(p, k) : crit === 'media' ? s / (k + 1) : s; };
  const ok = (p: (string | null)[]) => validas(p[1] ?? null).includes(uni);
  const u = (v: number, p: (string | null)[]) => (!ok(p) ? null : r2(uni === 'rs' ? v : v / DEN[uni]));
  /* P103 — meta também nas Receitas operacionais (a 125% do valor: razão 0,8 → faixa "crítico" da ENTRADA — a régua de entradas com a
     marca na faixa mais estreita do fim) */
  const temMeta = (p: (string | null)[]) => p[0] === 'Custeio' || p[0] === 'Receitas operacionais';
  const fatorMeta = (p: (string | null)[]) => (p[0] === 'Receitas operacionais' ? 1.25 : 0.92);
  const rotulo = (p: (string | null)[]) => p.length === 0 ? (a.p_lado === 'saida' ? 'Saídas' : 'Entradas') : p.length === 1 ? p[0]!
    : p.length === 2 ? (p[1] ? ROT_ATIV[p[1]] : 'Sem atividade') : p[p.length - 1]!;
  const linha = (p: (string | null)[]) => {
    /* P100 item 5 — `grande` (o NJ do pior caso: `&vg_grande=1`): a meta a 1/11 do valor (≈ +999,9%) e 5 dígitos de lançamentos */
    const v = u(janela(p), p), mt = temMeta(p) && v != null ? r2(v * (a.grande ? 1 / 10.999 : fatorMeta(p))) : null;
    const razao = mt ? Math.round((v! / mt) * 10000) / 10000 : null;
    return { caminho: p, rotulo: rotulo(p), grupo: p[0] ?? null, valor: v, meta: mt, dif: mt == null || v == null ? null : r2(v - mt),
      pct: mt ? r1(((v! - mt) / mt) * 100) : null, razao, qtd: a.grande ? 99999 - p.length * 13 : 12 + p.length * 7, unidade_valida: ok(p),
      faixa: razao == null ? null : razao < 0.9 ? 'boa' : razao < 1 ? 'ideal' : razao < 1.15 ? 'risco' : 'critica',
      ...(p.length === 3 ? { bloco: CENTROS.find((x) => x[0] === p[2])?.[2] ?? 'sem' } : {}) };
  };
  /* VG-CUSTEIO-FIXO-VARIAVEL-01 (115510) — os blocos no nível de uma atividade de produção: a soma CRUA dos centros do bloco e só depois a
     unidade e o arredondamento (a conta do banco); fora disso, nulo */
  const blocosDe = (p: (string | null)[]) => {
    if (p.length !== 2 || !['pecuaria', 'agricultura', 'silvicultura'].includes(p[1] ?? '')) return null;
    return (['variavel', 'fixo'] as const).map((b) => {
      const cs = CENTROS.filter((x) => x[2] === b).map((x) => [...p, x[0]]);
      const v = u(cs.reduce((soma, c) => soma + janela(c), 0), p);
      const mt = temMeta(p) && v != null ? r2(v * (a.grande ? 1 / 10.999 : fatorMeta(p))) : null;
      return { bloco: b, rotulo: b === 'variavel' ? 'Custo variável' : 'Custo fixo', centros: cs.length, valor: v, meta: mt,
        dif: mt == null || v == null ? null : r2(v - mt), pct: mt ? r1(((v! - mt) / mt) * 100) : null, razao: mt ? Math.round((v! / mt) * 10000) / 10000 : null,
        qtd: 12 + 3 * 7, unidade_valida: ok(p) };
    });
  };
  const filhos = (p: (string | null)[]): (string | null)[][] => p.length === 0 ? grupos.map((g) => [g]) : p.length === 1 ? ATIV.map((x) => [...p, x[0]])
    : p.length === 2 ? CENTROS.map((x) => [...p, x[0]]) : p.length === 3 ? SUBS.map((x) => [...p, x[0]]) : [];
  const n = a.p_aba ? [a.p_aba] : [];
  const f = a.p_foco ?? [];
  const g = a.p_grafico ?? f;
  const pai = g.slice(0, Math.max(0, g.length - 1));
  /* P100 (111951) — a tabela da direita: TODOS os subcentros abaixo do foco, com o centro, maior valor primeiro (Custeio · total: 48) */
  const subcentros = (p: (string | null)[]): (string | null)[][] => (p.length >= 4 ? [] : p.length === 3 ? filhos(p) : filhos(p).flatMap(subcentros));
  const niv = f.length >= 3 ? f.slice(0, 2) : f;
  const subs = subcentros(f).map((c) => ({ ...linha(c), centro: c[2] ?? 'Sem centro' })).sort((x, y) => (y.valor ?? 0) - (x.valor ?? 0));
  const tot = janela(n);
  return {
    lado: a.p_lado, mes: a.p_mes, criterio: crit, unidade: uni, meses_janela: crit === 'mes' ? 1 : k + 1, periodo: { de: ms[0], ate_mes: a.p_mes },
    abas: grupos.map((x) => ({ grupo: x, rotulo: x })),
    unidades: UNID.map(([id, rot]) => ({ id, rotulo: rot, valida: validas(f[1] ?? null).includes(id) })),
    resumo: { ...linha(n), valor_rs: r2(tot), pct_da_raiz: n.length ? r1((tot / janela([])) * 100) : null,
      fatias: filhos(n).map((c) => ({ caminho: c, rotulo: rotulo(c), grupo: c[0], pct: r1((janela(c) / tot) * 100) })) },
    /* P100 v4 (111952): a esquerda navega — o nível é a seleção (aba ou atividade) ou a atividade do centro escolhido */
    tabela: { total: linha(niv), linhas: filhos(niv).map(linha), nivel: niv, blocos: blocosDe(niv) },
    foco: { total: linha(f), linhas: subs },
    grafico: {
      item: linha(g), caminho: [[], ...g.map((_, i) => g.slice(0, i + 1))].map((c) => ({ caminho: c, rotulo: rotulo(c) })),
      irmaos: !g.length ? [] : g.length === 4 && g.length > f.length ? subs.map((x) => x.caminho) : filhos(pai),
      /* P103 (111954) — no ACUMULADO a coluna de cada mês é a soma do início até ele (realizado e previsto, cada um), a meta também;
         sem a média. KPIs: `mes` = o acumulado, `meta` = a meta acumulada (no mês/média: a do mês), sem média nem tendência */
      serie: !ok(g) ? [] : ms.map((x, i) => { const v = mesV(g, i); const ac = ms.slice(0, i + 1).reduce((s, _, j) => s + mesV(g, j), 0);
        if (crit === 'acumulado') {
          const re = ms.slice(0, i + 1).reduce((s, y, j) => s + (y <= HOJE ? mesV(g, j) : 0), 0);
          return { am: x, realizado: u(re, g), previsto: u(ac - re, g), total: u(ac, g), media: null, meta: temMeta(g) ? u(ac * fatorMeta(g), g) : null };
        }
        return { am: x, realizado: x <= HOJE ? u(v, g) : 0, previsto: x > HOJE ? u(v, g) : 0, total: u(v, g), media: x <= HOJE ? u(ac / (i + 1), g) : null,
          meta: temMeta(g) ? u(v * fatorMeta(g), g) : null }; }),
      kpis: !ok(g) ? null : crit === 'acumulado'
        ? { mes: linha(g).valor, meta: linha(g).meta, media: null, vs_meta: linha(g).pct, tendencia: null }
        : { mes: u(mesV(g, k), g), meta: temMeta(g) ? u(mesV(g, k) * fatorMeta(g), g) : null, media: u(ms.slice(0, k + 1).reduce((s, _, j) => s + mesV(g, j), 0) / (k + 1), g),
          vs_meta: temMeta(g) ? 8.7 : null, tendencia: r1(((mesV(g, k) - mesV(g, 0)) / mesV(g, 0)) * 100) },
    },
  };
}

/* PR 5 — o banco SINTÉTICO da GAVETA (`fn_vg_gaveta`), na mesma árvore do modal. Os piores casos de largura e de volume: no
 * subcentro "Sal mineral…" 523 lançamentos (paginam: 500 + 23); no "Ração…" o favorecido de 60 letras, a descrição longa e uma parte
 * 2/2 da classificação dividida; o "Outros insumos" vem VAZIO (a frase dentro do quadro). O `lista` (111947, o aviso do rodapé): o
 * "Sal…" tem vencidos de antes da janela; o "Ração…" leva a frase MAIS LONGA (transferências entre as contas escolhidas — no banco
 * ela só vem no nó de transferências; aqui fica no subcentro do pior caso de largura); os outros, nenhuma diferença. */
const FAV_LONGO = 'Cooperativa Agroindustrial dos Produtores Rurais do Centro-Oeste'.slice(0, 60);
export function gaveta(a: { p_de: string; p_ate: string; p_mes: string; p_lado: 'entrada' | 'saida'; p_caminho?: (string | null)[]; p_criterio?: string;
  p_contas?: string[] | null; p_pagina?: number; p_por_pagina?: number; p_status?: string[] | null; p_incluir_vencidos?: boolean;
  p_ordem?: string | null; p_sentido?: string }) {
  const c = a.p_caminho ?? [];
  const crit = a.p_criterio ?? 'mes';
  const an = analise({ ...a, p_aba: c[0] ?? null, p_foco: c.slice(0, Math.min(c.length, 3)).length >= 1 ? c.slice(0, Math.min(c.length, 3)) : [],
    p_grafico: c.length === 4 ? c : null, p_criterio: crit === 'media' ? 'acumulado' : crit, p_unidade: 'rs' });
  const rot = (p: (string | null)[]) => p.length === 0 ? (a.p_lado === 'saida' ? 'Saídas' : 'Entradas') : p.length === 1 ? p[0]!
    : p.length === 2 ? (p[1] ? ROT_ATIV[p[1]] : 'Sem atividade') : p[p.length - 1]!;
  const no = c.length === 4 ? an.grafico.item : an.foco.total;
  const total = c.length === 4 && c[3] === 'Outros insumos' ? 0 : (no?.valor ?? 0);
  /* P103 — os FILHOS diretos do nó (desde o P100 `foco.linhas` são TODOS os subcentros do item: a gaveta pulava do grupo direto
     para um subcentro, e os cenários de descida não chegavam ao nó pretendido). A tabela da esquerda (111952) tem os filhos do nível:
     o grupo e a atividade são o nível; no centro, os filhos são os subcentros dele (`foco.linhas`) */
  const filhos = c.length === 3 ? an.foco.linhas : c.length < 3 ? an.tabela.linhas : [];
  const irmaos = c.length === 0 ? [] : c.length === 4 ? an.grafico.irmaos : c.length === 1 ? an.abas.map((x) => [x.grupo])
    : c.length === 2 ? analise({ ...a, p_aba: c[0], p_foco: [c[0]], p_grafico: null, p_criterio: crit === 'media' ? 'acumulado' : crit, p_unidade: 'rs' }).tabela.linhas.map((l) => l.caminho)
    : an.tabela.linhas.map((l) => l.caminho);
  const ms = meses(a.p_de, a.p_ate);
  const ini = crit === 'mes' ? a.p_mes : ms[0];
  const nLanc = c.length < 4 ? 0 : c[3] === 'Outros insumos' ? 0 : c[3] === 'Sal mineral proteinado de seca' ? 523 : c[3] === 'Ração de creep-feeding para bezerros' ? 8 : 12;
  const longo = c[3] === 'Ração de creep-feeding para bezerros';
  /* P103 — cada lançamento com as três datas, o status e o conciliado (111953). No "Ração…" (o pior caso de largura) TODOS os status
     da casa (realizado, conciliado, agendado, programado, previsto, vencido) e um valor de R$ 99.999.999,99 (o total do nó é a soma) */
  const ST_LONGO = ['realizado', 'conciliado', 'agendado', 'programado', 'previsto', 'vencido', 'realizado', 'previsto'];
  const geradas = Array.from({ length: nLanc }, (_, i) => {
    const am = crit === 'mes' ? a.p_mes : ms[Math.min(ms.indexOf(a.p_mes), i % (ms.indexOf(a.p_mes) + 1))];
    const v = longo && i === 0 ? 99999999.99 : i < nLanc - 1 ? r2(total / nLanc) : r2(total - r2(total / nLanc) * (nLanc - 1));
    const parte = longo && i === 2;
    const st = longo ? ST_LONGO[i % ST_LONGO.length] : am > HOJE ? 'previsto' : 'realizado';
    const pago = st === 'realizado' || st === 'conciliado';
    const dia = `${am}-${String(1 + (i * 7) % 28).padStart(2, '0')}`;
    return { chave: parte ? `lanc-${i}#2` : `lanc-${i}`, lancamento_id: `lanc-${i}`, parte_ordem: parte ? 2 : 1, partes_total: parte ? 2 : 1,
      data: dia, competencia: `${am}-01`, vencimento: dia, pagamento: pago ? dia : null,
      favorecido: longo && i % 2 === 0 ? FAV_LONGO : ['Agropecuária Boa Vista Ltda', 'Casa do Produtor', 'Posto Rodoviário Central'][i % 3],
      descricao: longo ? 'Compra de ração de creep-feeding para bezerros do lote de cria — nota fiscal e frete incluídos' : `NF ${1000 + i}`,
      conta: i % 4 === 3 ? 'Cartão de crédito corporativo da fazenda' : 'Banco do Brasil · conta movimento', valor: v, valor_lancamento: parte ? r2(v * 2.5) : v,
      status: st === 'conciliado' ? 'realizado' : st === 'vencido' ? 'previsto' : st, previsto: !pago, vencido: st === 'vencido', conciliado: st === 'conciliado' };
  });
  /* no "Ração…" os CHIPS da tela valem (como na fn_vg_partes): o não pago só entra com o chip do status dele ligado; o vencido, com o
     "Vencidos" — o gate de deslocamento liga e desliga os chips com a gaveta aberta */
  const todas = !longo ? geradas : geradas.filter((l) => !l.previsto
    || (l.vencido ? a.p_incluir_vencidos !== false : (a.p_status ?? ['previsto', 'programado', 'agendado']).includes(l.status)));
  /* P119 — a ORDEM escolhida, como o banco (`fn_vg_gaveta_ordenada`): antes da página; desempate pela data e pelo id */
  if (a.p_ordem) {
    const chaveDe = (l: (typeof todas)[number]): string | number | null => a.p_ordem === 'valor' ? l.valor : a.p_ordem === 'competencia' ? l.competencia
      : a.p_ordem === 'vencimento' ? l.vencimento : a.p_ordem === 'pagamento' ? l.pagamento : a.p_ordem === 'favorecido' ? l.favorecido.toLowerCase()
      : a.p_ordem === 'descricao' ? (l.descricao || null) : a.p_ordem === 'conta' ? l.conta.toLowerCase()
      : l.vencido ? '0' : l.conciliado ? '5' : String(['', 'previsto', 'programado', 'agendado', 'realizado'].indexOf(l.status));
    const sinal = a.p_sentido === 'desc' ? -1 : 1;
    todas.sort((x, y) => {
      const kx = chaveDe(x), ky = chaveDe(y);
      if (kx !== ky) { if (kx === null) return 1; if (ky === null) return -1; return (kx < ky ? -1 : 1) * sinal; }
      return x.data < y.data ? -1 : x.data > y.data ? 1 : x.lancamento_id < y.lancamento_id ? -1 : x.lancamento_id > y.lancamento_id ? 1 : 0;
    });
  }
  const totalNo = longo ? r2(todas.reduce((s, l) => s + l.valor, 0)) : total;
  const pagoNo = r2(todas.filter((l) => !l.previsto).reduce((s, l) => s + l.valor, 0));
  const pp = a.p_por_pagina ?? 500, pg = a.p_pagina ?? 1;
  const porFav = new Map<string, { q: number; v: number }>();
  for (const l of todas) { const x = porFav.get(l.favorecido) ?? { q: 0, v: 0 }; x.q += 1; x.v = r2(x.v + l.valor); porFav.set(l.favorecido, x); }
  return {
    lado: a.p_lado, mes: a.p_mes, criterio: crit, janela: { de: `${ini}-01`, ate: `${a.p_mes}-28` }, folha: c.length === 4,
    caminho: [[], ...c.map((_, i) => c.slice(0, i + 1))].map((p) => ({ caminho: p, rotulo: rot(p) })),
    irmaos: irmaos.map((p) => ({ caminho: p, rotulo: rot(p), valor: 0 })),
    qtd: c.length === 4 ? todas.length : 37 + c.length * 11, total: totalNo, medio: todas.length ? r2(totalNo / todas.length) : total ? r2(total / 40) : null,
    pago: c.length === 4 ? pagoNo : null, aberto: c.length === 4 ? r2(totalNo - pagoNo) : null,
    resumo: c.length === 4
      ? { tipo: 'favorecido', linhas: [...porFav.entries()].sort((x, y) => y[1].v - x[1].v).slice(0, 4).map(([rotulo, x]) => ({ rotulo, qtd: x.q, valor: x.v })) }
      : { tipo: 'filhos', linhas: [...filhos].sort((x, y) => (y.valor ?? 0) - (x.valor ?? 0)).slice(0, 4)
          .map((l) => ({ rotulo: l.rotulo, qtd: l.qtd, valor: l.valor ?? 0, pct: total ? r1(((l.valor ?? 0) / total) * 100) : null })) },
    linhas: c.length === 4 ? todas.slice((pg - 1) * pp, pg * pp)
      : filhos.map((l) => ({ caminho: l.caminho, rotulo: l.rotulo, qtd: l.qtd, valor: l.valor ?? 0, pct: total ? r1(((l.valor ?? 0) / total) * 100) : null })),
    total_linhas: c.length === 4 ? todas.length : filhos.length, pagina: pg, por_pagina: pp, paginas: c.length === 4 ? Math.max(1, Math.ceil(todas.length / pp)) : 1,
    lista: c.length === 4 ? { vencidos_fora: c[3] === 'Sal mineral proteinado de seca' ? 4 : 0, transf_internas: longo ? 3 : 0 } : null,
  };
}
