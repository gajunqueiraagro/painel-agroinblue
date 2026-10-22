/**
 * FIN-VISAO-GERAL-01 PR 3 — o GRÁFICO da Visão Geral (SPEC §3.4 e §6), SVG em pixels reais do quadro (ResizeObserver):
 *   · colunas por mês: realizado cheio, previsto claro hachurado, fundo cinza na faixa prevista;
 *   · Entradas × saídas: duas colunas por mês + a LINHA DO SALDO FINAL (mesmo eixo);
 *   · Saídas | Entradas: uma coluna + a MÉDIA ACUMULADA (curva) + a META (pontilhado laranja), com os valores na ponta direita;
 *   · valor da coluna VERTICAL, pequeno, dentro da coluna junto à base; um eixo só; com negativo, o eixo desce com os mesmos intervalos;
 *   · clicar numa coluna seleciona o mês.
 * Os números desenhados vêm do banco (`fn_vg_tela`: valores, saldo final, média acumulada, meta). Aqui só há a ESCALA do desenho.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { COR, brl, mes0De, anoDe, MESES_ABR, mil1, n0, rotuloMes, type ModoVG, type TelaVG } from '@/lib/financeiro/visaoGeral';

const passoBonito = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
const curva = (pts: [number, number][]) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let j = 0; j < pts.length - 1; j++) {
    const p0 = pts[j - 1] ?? pts[j], p1 = pts[j], p2 = pts[j + 1], p3 = pts[j + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6},${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6},${p2[0]} ${p2[1]}`;
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
  const saldo = flx ? (linha('saldo_final')?.valores ?? []) : null;
  const media = flx ? null : tela.grafico?.[ladoUnico]?.media_acumulada ?? null;
  const meta = flx ? null : tela.grafico?.[ladoUnico]?.meta ?? null;
  const ks = meses.findIndex((m) => m.am === sel);
  const metaSel = meta ? meta[ks >= 0 ? ks : meta.length - 1] ?? null : null;

  let svg: JSX.Element | null = null;
  if (W0 > 0 && H > 0 && meses.length) {
    const n = meses.length, ns = series.length;
    const dois = new Set(meses.map((m) => anoDe(m.am))).size > 1;
    const L = 40, Rm = flx ? 6 : 34, T = 14, B = dois ? 24 : 14, iw = W0 - L - Rm, ih = H - T - B;
    const nums = (a: (number | null)[] | null | undefined) => (a ?? []).filter((x): x is number => x != null);
    const todos = [...series.flatMap((s) => nums(s.vals)), ...nums(saldo), ...nums(media), ...nums(meta), 0];
    const mx = Math.max(...todos, 1), mn = Math.min(...todos);
    const useK = Math.max(mx, -mn) >= 2000;
    const pL = passoBonito(((mx - Math.min(mn, 0)) * 1.1) / 4);
    const up = Math.ceil((mx * 1.08) / pL), dn = mn < 0 ? Math.ceil((-mn * 1.08) / pL) : 0, tot = up + dn;
    const Y = (v: number) => T + (ih * (up - v / pL)) / tot, y0 = Y(0);
    const slot = iw / n, X = (k: number) => L + (k + 0.5) * slot;
    const bw = Math.min(34, slot * (ns > 1 ? 0.38 : 0.62));
    const fmtL = (v: number) => (useK ? mil1(v) : n0(v));
    const fut = meses.findIndex((m) => m.previsto);
    const passoX = Math.max(1, Math.ceil(22 / slot));
    const els: JSX.Element[] = [];
    if (fut >= 0) {
      const x0 = L + fut * slot;
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
        const lab = fmtL(v), lw = lab.length * 4.4 + 6;
        if (bw >= 9 && h > lw) {
          els.push(<text key={`l${k}${si}`} transform={`translate(${X(k) + off},${v >= 0 ? y0 - 4 : y0 + 4}) rotate(-90)`} fontSize={7.5}
            textAnchor={v >= 0 ? 'start' : 'end'} dominantBaseline="central" fill={real ? '#fff' : '#5b6878'} fontWeight={m.am === sel ? 700 : 400}
            pointerEvents="none">{lab}</text>);
        }
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
    if (dois) meses.forEach((m, k) => { if (k > 0 && mes0De(m.am) === 0) els.push(<line key={`v${k}`} x1={L + k * slot} x2={L + k * slot} y1={T + ih} y2={T + ih + 22} stroke="#b8c0cb" />); });
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
      const pts = saldo.map((v, k) => [X(k), Y(v ?? 0), v ?? 0, k] as [number, number, number, number]);
      els.push(<path key="sal" d={curva(pts.map((p) => [p[0], p[1]]))} fill="none" stroke={COR.saldo} strokeWidth={2} />);
      pts.forEach((p) => els.push(<circle key={`sc${p[3]}`} cx={p[0]} cy={p[1]} r={meses[p[3]].am === sel ? 3.6 : 2.6} fill={p[2] < 0 ? COR.neg : COR.saldo} stroke="#fff" strokeWidth={1}>
        <title>{`saldo final de ${rotuloMes(meses[p[3]].am)}: ${brl(p[2])}`}</title></circle>));
    }
    meses.forEach((m, k) => els.push(<rect key={`c${k}`} x={L + k * slot} y={T} width={slot} height={ih + B} fill="transparent" style={{ cursor: 'pointer' }}
      onClick={() => onSel(m.am)} data-testid={`coluna-${m.am}`}><title>{`Ver ${rotuloMes(m.am)}`}</title></rect>));
    svg = (
      <svg width={W0} height={H} style={{ display: 'block' }} aria-hidden="true">
        <defs><pattern id="hachura-vg" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke="#fff" strokeWidth={2} strokeOpacity={0.6} /></pattern></defs>
        {els}
      </svg>
    );
  }
  return <div ref={ref} className="relative min-h-0 flex-1" data-testid="grafico-vg">{svg}</div>;
}
