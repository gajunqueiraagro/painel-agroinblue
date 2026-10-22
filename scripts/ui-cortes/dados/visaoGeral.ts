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
    { id: 'c4', nome: 'Cartão Exemplo', tipo: 'cartao', ativa: true, no_caixa: false },
  ],
  atividades: ['pecuaria', 'agricultura', 'silvicultura', 'administrativo'],
  safras: [{ id: 's1', nome: 'Safra 2026/27' }, { id: 's2', nome: 'Safra 2025/26' }],
};

export function tela(a: { p_de: string; p_ate: string; p_contas?: string[] | null; p_atividade?: string | null; p_safra?: string | null }) {
  const ms = meses(a.p_de, a.p_ate);
  const peso = a.p_contas ? Math.max(0.2, a.p_contas.length / 3) : 1;
  const ativ = a.p_atividade ?? null;
  const sai = GRUPOS_SAI.filter((g) => !(ativ === 'agricultura' && (g === 'Reposição de bovinos' || g === 'Dividendos')) && !(ativ === 'administrativo' && g === 'Custeio'));
  const ent = GRUPOS_ENT.filter((g) => !(ativ && g === 'Entradas de capital e financiamento'));
  const serie = (g: string, gi: number) => ms.map((x, i) => r2((BASE[g] ?? 50000) * peso * (a.p_safra ? 0.6 : 1) * (1 + 0.12 * Math.sin(i * 1.3 + gi)) * (ativ ? 0.55 : 1)));
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
    const vals = serie(g, gi + 3);
    const vv = ms.map((x, i) => (x === HOJE && g === 'Custeio' ? r2(vals[i] * 0.18) : 0));
    add('saida', g, vals, 'grupo', '', vv);
  });
  if (!ativ) add('saida', 'Outras saídas', ms.map((_, i) => r2(31773.11 * peso + i * 250)), 'transf', 'Transferências para outras contas');
  add('saida', 'Sem classificação', ms.map((x) => (x <= HOJE ? r2(8900 * peso) : 0)));
  const ladoTotal = (lado: string) => tot[lado].reduce((x, y) => x + y, 0);
  const real = ms.map((x) => x <= HOJE);
  const linha = (lado: string, tipo: string, grupo: string, rotulo: string, vals: number[], vv: number[]) => {
    const t = vals.reduce((x, y) => x + y, 0);
    const vr = vals.filter((_, i) => real[i]);
    const md = vr.length ? vr.reduce((x, y) => x + y, 0) / vr.length : 0;
    return {
      chave: `${lado}:${tipo}:${grupo}`, tipo, lado, grupo: tipo === 'total' ? null : grupo, rotulo, valores: vals.map(r2), vencidos: vv.map(r2),
      pct_mes: vals.map((v, i) => (tot[lado][i] ? r1((v / tot[lado][i]) * 100) : null)),
      vs_media: vals.map((v) => (md ? r1(((v - md) / Math.abs(md)) * 100) : null)),
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
  const resT = res.reduce((x, y) => x + y, 0);
  const mediaAcc = (lado: string) => { let acc = 0, q = 0; return ms.map((_, i) => { if (!real[i]) return null; acc += tot[lado][i]; q++; return r2(acc / q); }); };
  return {
    mes_atual: HOJE,
    meses: ms.map((x) => ({ am: x, previsto: x > HOJE, vigente: x === HOJE })),
    linhas: [{ chave: 'saldo_inicial', tipo: 'saldo', rotulo: 'SALDO INICIAL', valores: saldoIni }, ...linhas,
      { chave: 'resultado', tipo: 'resultado', rotulo: 'RESULTADO', valores: res, total: r2(resT), media: r2(resT / ms.length) },
      { chave: 'saldo_final', tipo: 'saldo', rotulo: 'SALDO FINAL', valores: saldoFim }],
    grafico: {
      entrada: { media_acumulada: mediaAcc('entrada'), meta: ms.map(() => r2(1700000 * peso)) },
      saida: { media_acumulada: mediaAcc('saida'), meta: ms.map((x) => (x.startsWith('2026') ? r2(2300000 * peso) : null)) },
    },
    conciliado_ate: '2026-10-15',
    contas_sem_ancora: a.p_contas?.includes('c4') ? ['Cartão Exemplo'] : [],
  };
}
