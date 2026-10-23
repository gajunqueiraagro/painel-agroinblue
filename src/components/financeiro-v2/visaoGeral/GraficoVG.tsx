/**
 * FIN-VISAO-GERAL-01 PR 3 — o GRÁFICO da Visão Geral (SPEC §3.4 e §6), SVG em pixels reais do quadro (ResizeObserver):
 *   · colunas por mês: realizado cheio, previsto claro hachurado, fundo cinza na faixa prevista;
 *   · Entradas × saídas: duas colunas por mês + a LINHA DO SALDO FINAL (mesmo eixo);
 *   · Saídas | Entradas: uma coluna + a MÉDIA ACUMULADA (curva) + a META (pontilhado laranja), com os valores na ponta direita;
 *   · P90 (Gabriel 23/10 11h05): o valor da coluna na HORIZONTAL, pequeno, EM CIMA da própria coluna; um eixo só; com negativo, o eixo
 *     desce com os mesmos intervalos;
 *   · clicar numa coluna seleciona o mês.
 *   · P83 (Gabriel 23/10): Entradas × saídas abre com a coluna "i" = o SALDO INICIAL do período (barra única, cor do sinal), antes do 1º
 *     mês. P90: a linha do saldo COMEÇA no ponto "i" e é CURVA (suave); no realizado, AZUL acima de zero e VERMELHA abaixo — a cor troca
 *     EXATAMENTE no cruzamento (a mesma curva desenhada duas vezes, cada uma recortada de um lado do zero); no PREVISTO, sempre LARANJA e
 *     pontilhado fino, qualquer que seja o sinal. O valor do saldo fica EM CIMA do próprio ponto. Nenhum rótulo encosta noutro: entram
 *     por prioridade (o mês escolhido primeiro) e o que cruzaria um já posto não entra (coluna estreita: só os que cabem).
 * Os números desenhados vêm do banco (`fn_vg_tela`: valores, saldo final, média acumulada, meta). Aqui só há a ESCALA do desenho.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { COR, brl, corSinal, mes0De, anoDe, MESES_ABR, mil1, n0, rotuloMes, type ModoVG, type TelaVG } from '@/lib/financeiro/visaoGeral';

const passoBonito = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
/** P90 — curva MONÓTONA (Fritsch–Carlson, a `curveMonotoneX` do d3): suave, mas nunca passa além dos pontos — entre dois saldos
    positivos a linha não mergulha abaixo de zero (a Catmull-Rom de antes "inventava" um negativo entre ago e set) */
const curva = (pts: [number, number][]) => {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]} ${pts[0][1]}` : '';
  const h = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (h[i] ? (p[1] - pts[i][1]) / h[i] : 0));
  const t = pts.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const s0 = m[i - 1], s1 = m[i], pp = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
    return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(pp)) || 0;
  });
  if (n > 2) { t[0] = (3 * m[0] - t[1]) / 2; t[n - 1] = (3 * m[n - 2] - t[n - 2]) / 2; } else { t[0] = m[0]; t[1] = m[0]; }
  /* as pontas também não passam além (a tangente da ponta fica no sentido do primeiro/último trecho e no máximo 3× a inclinação) */
  [0, n - 1].forEach((i) => { const s = m[i === 0 ? 0 : n - 2]; if (Math.sign(t[i]) !== Math.sign(s)) t[i] = 0; else if (Math.abs(t[i]) > 3 * Math.abs(s)) t[i] = 3 * s; });
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let j = 0; j < n - 1; j++) {
    const dx = h[j] / 3;
    d += ` C${pts[j][0] + dx} ${pts[j][1] + t[j] * dx},${pts[j + 1][0] - dx} ${pts[j + 1][1] - t[j + 1] * dx},${pts[j + 1][0]} ${pts[j + 1][1]}`;
  }
  return d;
};

export function GraficoVG({ tela, modo, sel, onSel }: { tela: TelaVG; modo: ModoVG; sel: string; onSel: (am: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setTam([el.clientWidth, el.clientHeight]);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [W0, H] = tam;
  const linha = (chave: string) => tela.linhas.find((l) => l.chave === chave);
  const total = (lado: 'entrada' | 'saida') => tela.linhas.find((l) => l.tipo === 'total' && l.lado === lado);
  const meses = tela.meses;
  const flx = modo === 'flx';
  const ladoUnico = modo === 'ent' ? 'entrada' : 'saida';
  const series = flx
    ? [{ nome: 'entradas', vals: total('entrada')?.valores ?? [], cor: COR.barraEnt, corP: COR.barraEntP, txt: COR.entrada },
       { nome: 'saídas', vals: total('saida')?.valores ?? [], cor: COR.barraSai, corP: COR.barraSaiP, txt: COR.mediaSai }]
    : [{ nome: ladoUnico === 'entrada' ? 'entradas' : 'saídas', vals: total(ladoUnico)?.valores ?? [],
         cor: ladoUnico === 'entrada' ? COR.barraEnt : COR.barraSai, corP: ladoUnico === 'entrada' ? COR.barraEntP : COR.barraSaiP,
         txt: ladoUnico === 'entrada' ? COR.entrada : COR.mediaSai }];
  /* P83 — sem contas no recorte (fazenda/atividade) o banco não manda saldo: nenhuma linha de saldo */
  const saldoBanco = linha('saldo_final')?.valores ?? null;
  const saldo = flx && !tela.sem_saldo && saldoBanco && saldoBanco.length ? saldoBanco : null;
  /* P83 — a coluna "i": o saldo inicial do PERÍODO (o do 1º mês, do banco) */
  const saldoIni = saldo ? (linha('saldo_inicial')?.valores[0] ?? null) : null;
  const temI = saldoIni != null;
  const media = flx ? null : tela.grafico?.[ladoUnico]?.media_acumulada ?? null;
  const meta = flx ? null : tela.grafico?.[ladoUnico]?.meta ?? null;
  const ks = meses.findIndex((m) => m.am === sel);
  const metaSel = meta ? meta[ks >= 0 ? ks : meta.length - 1] ?? null : null;

  const id = `vg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  let svg: JSX.Element | null = null;
  let defsSaldo: JSX.Element | null = null;
  if (W0 > 0 && H > 0 && meses.length) {
    const n = meses.length, ns = series.length;
    const dois = new Set(meses.map((m) => anoDe(m.am))).size > 1;
    const off = temI ? 1 : 0;
    const L = 40, Rm = flx ? 6 : 34, T = 16, B = dois ? 24 : 14, iw = W0 - L - Rm, ih = H - T - B;
    const nums = (a: (number | null)[] | null | undefined) => (a ?? []).filter((x): x is number => x != null);
    const todos = [...series.flatMap((s) => nums(s.vals)), ...nums(saldo), ...nums(media), ...nums(meta), ...(saldoIni != null ? [saldoIni] : []), 0];
    const mx = Math.max(...todos, 1), mn = Math.min(...todos);
    const useK = Math.max(mx, -mn) >= 2000;
    const pL = passoBonito(((mx - Math.min(mn, 0)) * 1.1) / 4);
    const up = Math.ceil((mx * 1.08) / pL), dn = mn < 0 ? Math.ceil((-mn * 1.08) / pL) : 0, tot = up + dn;
    const Y = (v: number) => T + (ih * (up - v / pL)) / tot, y0 = Y(0);
    const slot = iw / (n + off), X = (k: number) => L + (k + off + 0.5) * slot;
    const bw = Math.min(34, slot * (ns > 1 ? 0.38 : 0.62));
    const fmtL = (v: number) => (useK ? mil1(v) : n0(v));
    /* o rótulo curto da coluna: R$ mil inteiro (cabe em cima de uma coluna estreita) */
    const fmtC = (v: number) => (useK ? n0(v / 1000) : n0(v));
    /* os rótulos (colunas e saldo) disputam o mesmo espaço: cada um ocupa um retângulo; quem cruzaria um já posto não entra */
    type Rotulo = { chave: string; x: number; y: number; t: string; cor: string; forte: boolean; prio: number; testid?: string };
    const rotulos: Rotulo[] = [];
    const larg = (t: string) => t.length * 3.9 + 2;
    const fut = meses.findIndex((m) => m.previsto);
    const passoX = Math.max(1, Math.ceil(22 / slot));
    const els: JSX.Element[] = [];
    if (fut >= 0) {
      const x0 = L + (fut + off) * slot;
      els.push(<rect key="fut" x={x0} y={T} width={L + iw - x0} height={ih} fill="#f4f6f9" />);
      /* o rótulo só quando a faixa cabe a palavra (faixa de um mês estreito: só o fundo) */
      if (L + iw - x0 >= 40) els.push(<text key="futt" x={x0 + 3} y={T + 8} fontSize={7.5} fill="#8d9cad">previsto</text>);
    }
    if (dn > 0) els.push(<rect key="neg" x={L} y={y0} width={iw} height={T + ih - y0} fill="#fbf3f3" opacity={0.7} />);
    for (let k = -dn; k <= up; k++) {
      const y = T + (ih * (up - k)) / tot;
      els.push(<line key={`g${k}`} x1={L} x2={L + iw} y1={y} y2={y} stroke={k === 0 ? '#8a96a6' : '#eceff3'} strokeWidth={k === 0 ? 1.2 : 1} />,
        <text key={`gt${k}`} x={L - 4} y={y + 3} fontSize={7.5} textAnchor="end" fill={k < 0 ? COR.neg : '#6b7787'}>
          {k === 0 ? '0' : `${k < 0 ? '−' : ''}${useK ? (Math.abs(k * pL) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: (pL / 1000) % 1 ? 1 : 0 }) : n0(Math.abs(k * pL))}`}
        </text>);
    }
    els.push(<text key="un" x={2} y={T - 5} fontSize={7.5} fill="#6b7787">{useK ? 'R$ mil' : 'R$'}</text>,
      <line key="ax" x1={L} x2={L} y1={T} y2={T + ih} stroke="#b8c0cb" />);
    meses.forEach((m, k) => {
      series.forEach((se, si) => {
        const v = se.vals[k] ?? 0;
        const off = ns > 1 ? (si - 0.5) * (bw + 2) : 0, x = X(k) + off - bw / 2, yv = Y(v), y = Math.min(yv, y0), h = Math.abs(yv - y0);
        const real = !m.previsto;
        els.push(<rect key={`b${k}${si}`} x={x} y={y} width={bw} height={h} fill={real ? se.cor : se.corP}
          stroke={m.am === sel ? '#1b2430' : undefined} strokeWidth={m.am === sel ? 1.2 : undefined} data-testid={`barra-${se.nome}-${m.am}`}>
          <title>{`${rotuloMes(m.am)} · ${se.nome}: ${brl(v)}${real ? '' : ' (previsto)'}`}</title></rect>);
        if (!real) els.push(<rect key={`h${k}${si}`} x={x} y={y} width={bw} height={h} fill="url(#hachura-vg)" pointerEvents="none" />);
        if (v !== 0) rotulos.push({ chave: `l${k}${si}`, x: X(k) + off, y: Math.min(yv, y0) - 2.5, t: fmtC(v), cor: real ? se.txt : '#8d9cad',
          forte: m.am === sel, prio: m.am === sel ? 0 : 3, testid: `rotulo-coluna-${se.nome}-${m.am}` });
      });
    });
    const mostra = new Set(meses.map((m) => m.am).filter((am) => mes0De(am) % passoX === 0));
    if (passoX > 1) mostra.add(sel);
    const anoFeito = new Set<number>();
    meses.forEach((m, k) => {
      if (!mostra.has(m.am)) return;
      els.push(<text key={`x${k}`} x={X(k)} y={T + ih + 11} fontSize={8.5} textAnchor="middle" fill={m.am === sel ? '#1b2430' : '#5b6878'}
        fontWeight={m.am === sel ? 700 : 400}>{MESES_ABR[mes0De(m.am)]}</text>);
      if (dois && !anoFeito.has(anoDe(m.am))) {
        anoFeito.add(anoDe(m.am));
        els.push(<text key={`y${k}`} x={X(k)} y={T + ih + 21} fontSize={8} textAnchor="middle" fill="#1b2430" fontWeight={700}>{anoDe(m.am)}</text>);
      }
    });
    if (dois) meses.forEach((m, k) => { if (k > 0 && mes0De(m.am) === 0) els.push(<line key={`v${k}`} x1={L + (k + off) * slot} x2={L + (k + off) * slot} y1={T + ih} y2={T + ih + 22} stroke="#b8c0cb" />); });
    /* P83 — a coluna "i": o saldo inicial do período, barra única na cor do sinal */
    if (saldoIni != null) {
      const xi = L + 0.5 * slot, wi = Math.min(26, slot * 0.5), yi = Y(saldoIni);
      els.push(<rect key="ini" x={xi - wi / 2} y={Math.min(yi, y0)} width={wi} height={Math.abs(yi - y0)} fill={corSinal(saldoIni)} opacity={0.85} data-testid="barra-saldo-inicial">
        <title>{`saldo inicial do período (${rotuloMes(meses[0].am)}): ${brl(saldoIni)}`}</title></rect>,
        <text key="init" x={xi} y={T + ih + 11} fontSize={8.5} textAnchor="middle" fontWeight={700} fill={corSinal(saldoIni)}>i</text>);
    }
    /* meta: pontilhado laranja mês a mês (a meta é por mês) */
    let yMeta: number | null = null;
    if (meta) {
      const pts = meta.map((v, k) => (v == null ? null : [X(k), Y(v)] as [number, number]));
      pts.forEach((p, k) => { if (p) els.push(<line key={`mt${k}`} x1={p[0] - slot / 2} x2={p[0] + slot / 2} y1={p[1]} y2={p[1]} stroke={COR.meta} strokeWidth={1.6} strokeDasharray="2 3" />); });
      if (metaSel != null) yMeta = Y(metaSel);
    }
    let yMed: number | null = null, vMed: number | null = null;
    if (media) {
      const pts = media.map((v, k) => (v == null ? null : ([X(k), Y(v), v, k] as [number, number, number, number]))).filter(Boolean) as [number, number, number, number][];
      if (pts.length) {
        const cor = ladoUnico === 'entrada' ? COR.mediaEnt : COR.mediaSai;
        els.push(<path key="med" d={curva(pts.map((p) => [p[0], p[1]]))} fill="none" stroke={cor} strokeWidth={1.8} />);
        pts.forEach((p) => els.push(<circle key={`mc${p[3]}`} cx={p[0]} cy={p[1]} r={meses[p[3]].am === sel ? 3.4 : 2.4} fill={cor} stroke="#fff" strokeWidth={1}>
          <title>{`média acumulada até ${rotuloMes(meses[p[3]].am)}: ${brl(p[2])}`}</title></circle>));
        const alvo = pts.find((p) => meses[p[3]].am === sel) ?? pts[pts.length - 1];
        yMed = alvo[1]; vMed = alvo[2];
      }
    }
    if (yMeta !== null && yMed !== null && Math.abs(yMeta - yMed) < 10) yMed = yMed <= yMeta ? yMeta - 10 : yMeta + 10;
    if (yMeta !== null && metaSel != null) els.push(<text key="mtv" x={L + iw + 3} y={yMeta + 3} fontSize={7.5} fill="#a85a00">{fmtL(metaSel)}</text>);
    if (yMed !== null && vMed != null) els.push(<text key="mdv" x={L + iw + 3} y={yMed + 3} fontSize={7.5} fontWeight={700} fill={ladoUnico === 'entrada' ? COR.mediaEnt : COR.mediaSai}>{fmtL(vMed)}</text>);
    if (saldo) {
      const pts = saldo.map((v, k) => ({ x: X(k), y: Y(v ?? 0), v: v ?? 0, k }));
      /* a curva começa no "i" (o saldo inicial do período) e liga em jan */
      const linha: [number, number][] = [...(saldoIni != null ? [[L + 0.5 * slot, Y(saldoIni)] as [number, number]] : []), ...pts.map((p) => [p.x, p.y] as [number, number])];
      const ult = meses.reduce((u, m, k) => (m.previsto ? u : k), -1);
      const xr = ult >= 0 ? X(ult) : L + 0.5 * slot;
      const d = curva(linha);
      els.push(
        <g key="saldo-real" clipPath={`url(#${id}-real)`}>
          <path d={d} fill="none" stroke={COR.pos} strokeWidth={2} clipPath={`url(#${id}-acima)`} data-testid="linha-saldo-pos" />
          <path d={d} fill="none" stroke={COR.neg} strokeWidth={2} clipPath={`url(#${id}-abaixo)`} data-testid="linha-saldo-neg" />
        </g>,
        ult < meses.length - 1 ? (
          <g key="saldo-prev" clipPath={`url(#${id}-prev)`}>
            <path d={d} fill="none" stroke={COR.previsto} strokeWidth={1.4} strokeDasharray="1.2 2.6" strokeLinecap="round" data-testid="linha-saldo-previsto" />
          </g>
        ) : null);
      defsSaldo = (
        <>
          <clipPath id={`${id}-acima`}><rect x={0} y={0} width={W0} height={y0} /></clipPath>
          <clipPath id={`${id}-abaixo`}><rect x={0} y={y0} width={W0} height={Math.max(0, H - y0)} /></clipPath>
          <clipPath id={`${id}-real`}><rect x={0} y={0} width={xr} height={H} /></clipPath>
          <clipPath id={`${id}-prev`}><rect x={xr} y={0} width={Math.max(0, W0 - xr)} height={H} /></clipPath>
        </>
      );
      if (saldoIni != null) rotulos.push({ chave: 'svi', x: L + 0.5 * slot, y: Y(saldoIni) - 5, t: fmtL(saldoIni), cor: corSinal(saldoIni), forte: false, prio: 1, testid: 'rotulo-saldo-inicial' });
      pts.forEach((p) => {
        const am = meses[p.k].am, prev = !!meses[p.k].previsto;
        els.push(<circle key={`sc${p.k}`} cx={p.x} cy={p.y} r={am === sel ? 3.4 : 2.4} fill={prev ? COR.previsto : corSinal(p.v)} stroke="#fff" strokeWidth={1}>
          <title>{`saldo final de ${rotuloMes(am)}${prev ? ' (previsto)' : ''}: ${brl(p.v)}`}</title></circle>);
        rotulos.push({ chave: `sv${p.k}`, x: p.x, y: p.y - 5, t: fmtL(p.v), cor: prev ? COR.previsto : corSinal(p.v), forte: am === sel,
          prio: am === sel ? -1 : 2, testid: `rotulo-saldo-${am}` });
      });
    }
    /* os rótulos, por prioridade, dentro do desenho e sem encostar uns nos outros nem no "i"/eixo */
    const postos: { l: number; r: number; t: number; b: number }[] = [];
    [...rotulos].sort((a, b) => a.prio - b.prio || a.x - b.x).forEach((r) => {
      const w = larg(r.t), x = Math.min(Math.max(r.x, L + w / 2), L + iw - w / 2), y = Math.max(r.y, 8);
      const q = { l: x - w / 2 - 1, r: x + w / 2 + 1, t: y - 7, b: y + 1 };
      if (postos.some((o) => q.l < o.r && q.r > o.l && q.t < o.b && q.b > o.t)) return;
      postos.push(q);
      /* contorno branco por baixo da letra: legível mesmo em cima de uma coluna da mesma cor */
      els.push(<text key={r.chave} x={x} y={y} fontSize={7} textAnchor="middle" fill={r.cor} fontWeight={r.forte ? 700 : 400} pointerEvents="none"
        stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" paintOrder="stroke" data-testid={r.testid}>{r.t}</text>);
    });
    meses.forEach((m, k) => els.push(<rect key={`c${k}`} x={L + (k + off) * slot} y={T} width={slot} height={ih + B} fill="transparent" style={{ cursor: 'pointer' }}
      onClick={() => onSel(m.am)} data-testid={`coluna-${m.am}`}><title>{`Ver ${rotuloMes(m.am)}`}</title></rect>));
    svg = (
      <svg width={W0} height={H} style={{ display: 'block' }} aria-hidden="true">
        <defs><pattern id="hachura-vg" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke="#fff" strokeWidth={2} strokeOpacity={0.6} /></pattern>{defsSaldo}</defs>
        {els}
      </svg>
    );
  }
  return <div ref={ref} className="relative min-h-0 flex-1" data-testid="grafico-vg">{svg}</div>;
}
