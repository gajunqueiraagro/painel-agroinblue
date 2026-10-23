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
  p_status?: string[] | null; p_incluir_vencidos?: boolean | null }) {
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
    const vals0 = serie(g, gi + 3);
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
const CENTROS: [string, number][] = [['Nutrição e suplementação mineral do rebanho de cria e recria', 0.5], ['Sanidade animal e reprodução assistida', 0.3],
  ['Manutenção de pastagens, cercas e aguadas', 0.2]];
const SUBS: [string, number][] = [['Sal mineral proteinado de seca', 0.4], ['Ração de creep-feeding para bezerros', 0.3], ['Vacinas e vermífugos', 0.2], ['Outros insumos', 0.1]];
const ROT_ATIV: Record<string, string> = { pecuaria: 'Pecuária', agricultura: 'Agricultura', administrativo: 'Administrativo' };
const DEN: Record<string, number> = { rs_cab: 7082.5, rs_ua: 5310.2, rs_arroba: 1840.4, rs_ha_prod: 2650, rs_ha_pec: 1980, rs_ha_agri: 670, rs_ha_plant: 540 };
const UNID: [string, string][] = [['rs', 'R$'], ['rs_cab', 'R$/cab/mês'], ['rs_ua', 'R$/UA/mês'], ['rs_arroba', 'R$/@'], ['rs_ha_prod', 'R$/ha produtiva'],
  ['rs_ha_pec', 'R$/ha pecuária'], ['rs_ha_agri', 'R$/ha agricultura'], ['rs_ha_plant', 'R$/ha plantado']];
const validas = (ativ: string | null | undefined) => ativ === 'pecuaria' ? ['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
  : ativ === 'agricultura' ? ['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant'] : ['rs', 'rs_ha_prod'];

export function analise(a: { p_de: string; p_ate: string; p_mes: string; p_lado: 'entrada' | 'saida'; p_aba?: string | null; p_foco?: (string | null)[];
  p_grafico?: (string | null)[] | null; p_criterio?: string; p_unidade?: string; p_contas?: string[] | null }) {
  const ms = meses(a.p_de, a.p_ate);
  const k = ms.indexOf(a.p_mes);
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
  const temMeta = (p: (string | null)[]) => p[0] === 'Custeio';
  const rotulo = (p: (string | null)[]) => p.length === 0 ? (a.p_lado === 'saida' ? 'Saídas' : 'Entradas') : p.length === 1 ? p[0]!
    : p.length === 2 ? (p[1] ? ROT_ATIV[p[1]] : 'Sem atividade') : p[p.length - 1]!;
  const linha = (p: (string | null)[]) => {
    const v = u(janela(p), p), mt = temMeta(p) && v != null ? r2(v * 0.92) : null;
    const razao = mt ? Math.round((v! / mt) * 10000) / 10000 : null;
    return { caminho: p, rotulo: rotulo(p), grupo: p[0] ?? null, valor: v, meta: mt, dif: mt == null || v == null ? null : r2(v - mt),
      pct: mt ? r1(((v! - mt) / mt) * 100) : null, razao, qtd: 12 + p.length * 7, unidade_valida: ok(p),
      faixa: razao == null ? null : razao < 0.9 ? 'boa' : razao < 1 ? 'ideal' : razao < 1.15 ? 'risco' : 'critica' };
  };
  const filhos = (p: (string | null)[]): (string | null)[][] => p.length === 0 ? grupos.map((g) => [g]) : p.length === 1 ? ATIV.map((x) => [...p, x[0]])
    : p.length === 2 ? CENTROS.map((x) => [...p, x[0]]) : p.length === 3 ? SUBS.map((x) => [...p, x[0]]) : [];
  const n = a.p_aba ? [a.p_aba] : [];
  const f = a.p_foco ?? [];
  const g = a.p_grafico ?? f;
  const pai = g.slice(0, Math.max(0, g.length - 1));
  const tot = janela(n);
  return {
    lado: a.p_lado, mes: a.p_mes, criterio: crit, unidade: uni, meses_janela: crit === 'mes' ? 1 : k + 1, periodo: { de: ms[0], ate_mes: a.p_mes },
    abas: grupos.map((x) => ({ grupo: x, rotulo: x })),
    unidades: UNID.map(([id, rot]) => ({ id, rotulo: rot, valida: validas(f[1] ?? null).includes(id) })),
    resumo: { ...linha(n), valor_rs: r2(tot), pct_da_raiz: n.length ? r1((tot / janela([])) * 100) : null,
      fatias: filhos(n).map((c) => ({ caminho: c, rotulo: rotulo(c), grupo: c[0], pct: r1((janela(c) / tot) * 100) })) },
    tabela: { total: linha(n), linhas: filhos(n).map(linha) },
    foco: { total: linha(f), linhas: filhos(f).map(linha) },
    grafico: {
      item: linha(g), caminho: [[], ...g.map((_, i) => g.slice(0, i + 1))].map((c) => ({ caminho: c, rotulo: rotulo(c) })),
      irmaos: g.length ? filhos(pai) : [],
      serie: !ok(g) ? [] : ms.map((x, i) => { const v = mesV(g, i); const ac = ms.slice(0, i + 1).reduce((s, _, j) => s + mesV(g, j), 0);
        return { am: x, realizado: x <= HOJE ? u(v, g) : 0, previsto: x > HOJE ? u(v, g) : 0, total: u(v, g), media: x <= HOJE ? u(ac / (i + 1), g) : null,
          meta: temMeta(g) ? u(v * 0.92, g) : null }; }),
      kpis: !ok(g) ? null : { mes: u(mesV(g, k), g), media: u(ms.slice(0, k + 1).reduce((s, _, j) => s + mesV(g, j), 0) / (k + 1), g),
        vs_meta: temMeta(g) ? 8.7 : null, tendencia: r1(((mesV(g, k) - mesV(g, 0)) / mesV(g, 0)) * 100) },
    },
  };
}
