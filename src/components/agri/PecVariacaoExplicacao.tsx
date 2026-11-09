/**
 * A ABA "EXPLICAÇÃO" DO MODAL DA VARIAÇÃO — DRE-VARIACAO-EXPLICA-01 fatia 1b (mock `variacao-estoque-mock.html`, 05/11).
 *
 * V1 ponte em R$ · V2 os três cards da Produção · V6 o rebanho de dez × variação · V3 por categoria · V4 mês a mês · V5 a frase.
 * ⚠ NENHUM NÚMERO NASCE AQUI: tudo vem de `variacaoExplica.ts` (a regra) sobre o payload da `fn_dre_pecuaria_patrimonio`.
 * ⚠ TEXTO DA TELA CURTO (uma linha); o longo mora no ⓘ (`InfoDaVariacao`).
 */
import { Fragment, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import {
  cardsDaProducao, fimPeloCadastro, fraseDaVariacao, linhaV6, ponteEmReais, reais, reaisComSinal, serieV4,
  type LinhaDoRebanho, type PassoEmReais, type PontoV4, type TotaisDaVariacao,
} from '@/components/agri/variacaoExplica';
import { InfoDaVariacao, textosDoInfo } from '@/components/agri/InfoDaVariacao';
import type { MesDoPatrimonio } from '@/hooks/useDrePecuaria';

export interface CategoriaDaExplicacao extends LinhaDoRebanho {
  cod: string;
  /** Jovens = mamotes e desmama (`ehJovem` do modal, a regra única). */
  jovem: boolean;
  cabIn: number | null; cabOut: number | null; atIn: number | null; atOut: number | null;
  agioSemPreco: boolean;
}

const AZUL = '#3B6FB0';
const ROXO = '#6B5CA5';
const AMBAR = '#C27A2C';
const VERM = '#B4483C';
const VERDE = '#2E7D4F';
const CINZA = '#6B7280';
const NAVY = '#0C447C';
const COR_PASSO: Record<PassoEmReais['chave'], string> = {
  inicio: CINZA, producao: AZUL, evolucao: ROXO, mercado: AMBAR, fim: '#374151', reposicao: VERM, linha: NAVY,
};
const corDoSinal = (v: number | null) => (v == null || Math.round(v) === 0 ? undefined : v > 0 ? 'text-emerald-700' : 'text-destructive');
const n0 = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const n1 = (v: number | null) => (v == null ? '—' : formatNum(v, 1));
const n2 = (v: number | null) => (v == null ? '—' : formatNum(v, 2));
const sinal = (v: number | null, casas: number) =>
  (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNum(Math.abs(v), casas)}`);
const sinalPct = (v: number | null) => (v == null ? '—' : `${sinal(v, 1)}%`);

function Cartao({ titulo, info, children, testid }: { titulo: string; info?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="rounded-md border bg-card" data-testid={testid}>
      <div className="flex h-[20px] items-center gap-1 px-2 text-[11px] font-semibold leading-none">
        <span className="whitespace-nowrap">{titulo}</span>{info}
      </div>
      {children}
    </section>
  );
}

/* ─── V1 — a ponte em R$ (cascata) ─── */
function Ponte({ passos }: { passos: PassoEmReais[] }) {
  const W = 728, H = 128, T = 22, B = 30, L = 6;
  /* o acumulado de cada passo: ponta/linha desenham do chão; delta flutua */
  let acc = 0;
  const barras = passos.map(p => {
    const v = p.valor ?? 0;
    if (p.tipo !== 'delta') { acc = v; return { p, a: 0, b: v }; }
    const a = acc; acc += v; return { p, a, b: acc };
  });
  const todos = barras.flatMap(x => [x.a, x.b]);
  const temPonta = passos.some(p => p.tipo === 'ponta');
  /* com as pontas (milhões) a base não começa no zero, senão as parcelas somem; sem pontas (Resumido), o zero entra */
  const mn0 = Math.min(...todos); const mx0 = Math.max(...todos);
  const folga = (mx0 - mn0) * 0.12 || 1;
  const mn = temPonta ? mn0 - folga : Math.min(0, mn0) - folga; const mx = mx0 + folga;
  const Y = (v: number) => T + (mx - v) * ((H - T - B) / (mx - mn));
  const cw = (W - 2 * L) / passos.length; const bw = cw * 0.5;
  const chao = temPonta ? H - B : Y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} data-testid="variacao-ponte">
      {!temPonta && <line x1={L} x2={W - L} y1={Y(0)} y2={Y(0)} stroke="#D1D5DB" />}
      {barras.map(({ p, a, b }, i) => {
        const x = L + i * cw + (cw - bw) / 2;
        const y1 = p.tipo === 'delta' ? Y(Math.max(a, b)) : Math.min(Y(b), chao);
        const y2 = p.tipo === 'delta' ? Y(Math.min(a, b)) : Math.max(Y(b), chao);
        const rotulo = p.valor == null ? '—' : p.tipo === 'delta' ? reaisComSinal(p.valor) : reais(p.valor);
        const corRot = p.valor == null ? CINZA : p.tipo === 'delta' ? (p.valor >= 0 ? VERDE : VERM) : '#1F2937';
        return (
          <g key={p.chave} data-passo={p.chave}>
            {p.valor != null && <rect x={x} y={y1} width={bw} height={Math.max(2, y2 - y1)} rx={2} fill={COR_PASSO[p.chave]} />}
            {i < barras.length - 1 && p.valor != null && (
              <line x1={x + bw} x2={x + cw} y1={Y(b)} y2={Y(b)} stroke="#9CA3AF" strokeDasharray="2 2" />
            )}
            <text x={x + bw / 2} y={(p.valor == null ? chao : y1) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={corRot}>{rotulo}</text>
            <text x={x + bw / 2} y={H - B + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#374151">{p.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── V4 — linha mês a mês (o mesmo desenho para @ e R$/@) ─── */
function Linha({ pontos, series, fmt, testid }: {
  pontos: PontoV4[]; series: { cor: string; v: (p: PontoV4) => number | null }[]; fmt: (v: number) => string; testid: string;
}) {
  const W = 236, H = 96, L = 34, R = 6, T = 10, B = 16;
  const vals = series.flatMap(s => pontos.map(s.v)).filter((v): v is number => v != null);
  if (vals.length === 0 || pontos.length === 0) {
    return <div className="flex h-[96px] items-center justify-center text-[10px] text-muted-foreground" data-testid={testid}>—</div>;
  }
  const mn0 = Math.min(...vals); const mx0 = Math.max(...vals); const pad = (mx0 - mn0) * 0.15 || Math.abs(mx0) * 0.05 || 1;
  const lo = mn0 - pad; const hi = mx0 + pad;
  const Y = (v: number) => H - B - (v - lo) * ((H - T - B) / (hi - lo));
  const X = (i: number) => (pontos.length === 1 ? (L + W - R) / 2 : L + i * ((W - L - R) / (pontos.length - 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} data-testid={testid}>
      {[lo + pad, hi - pad].map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#EEF0F2" />
          <text x={L - 3} y={Y(v) + 3} fontSize={9.5} fill="#9CA3AF" textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
      {series.map((s, k) => {
        /* ⚠ PONTO SEM VALOR ("—") QUEBRA A LINHA: nunca liga o vizinho por cima do mês que não tem preço */
        const trechos: string[][] = [[]];
        pontos.forEach((p, i) => { const v = s.v(p); if (v == null) trechos.push([]); else trechos[trechos.length - 1].push(`${X(i)},${Y(v)}`); });
        return (
          <g key={k}>
            {trechos.filter(t => t.length > 1).map((t, j) => <polyline key={j} fill="none" stroke={s.cor} strokeWidth={1.8} points={t.join(' ')} />)}
            {pontos.map((p, i) => { const v = s.v(p); return v == null ? null : <circle key={i} cx={X(i)} cy={Y(v)} r={2} fill="#fff" stroke={s.cor} strokeWidth={1.4} />; })}
          </g>
        );
      })}
      {pontos.map((p, i) => (i === 0 || i === pontos.length - 1 || pontos.length <= 7) && (
        /* ⚠ AS PONTAS ANCORAM PARA DENTRO: centrado, o 1º e o último mês passam da borda do gráfico (o gate de cortes pegou) */
        <text key={i} x={X(i)} y={H - 4} fontSize={9.5} fill="#6B7280"
          textAnchor={pontos.length > 1 && i === 0 ? 'start' : pontos.length > 1 && i === pontos.length - 1 ? 'end' : 'middle'}>{p.ano_mes.slice(5)}/{p.ano_mes.slice(2, 4)}</text>
      ))}
    </svg>
  );
}

export function PecVariacaoExplicacao({ totais, total, jovens, adultos, cats, meses, p0, p1, resumido, reposicao }: {
  totais: TotaisDaVariacao;
  total: LinhaDoRebanho; jovens: LinhaDoRebanho | null; adultos: LinhaDoRebanho | null;
  cats: CategoriaDaExplicacao[];
  meses: MesDoPatrimonio[];
  /** "dez/25", "set/26". */
  p0: string; p1: string;
  /** D2: aberta pela linha do Resumido ("Variação do estoque"). */
  resumido: boolean;
  reposicao: number | null;
}) {
  const info = textosDoInfo(p0);
  const rot = { p0, p1 };
  const passos = ponteEmReais(totais, rot, { resumido, reposicao });
  const c = cardsDaProducao(totais);
  const cadastro = fimPeloCadastro(totais);
  const pontos = serieV4(meses);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const linhaConta = (rotulo: string, valor: string, cor?: string, tt?: boolean) => (
    <Fragment key={rotulo}>
      {/* ⚠ FORA DE TABELA NADA DE "…" (regra de corte): o rótulo da conta quebra a linha */}
      <div className={cn('min-w-0 leading-[13px] text-muted-foreground', tt && 'border-t pt-0.5 font-semibold text-foreground')}>{rotulo}</div>
      <div className={cn('text-right tabular-nums', tt && 'border-t pt-0.5 font-semibold', cor)}>{valor}</div>
    </Fragment>
  );
  const card = (nro: string, titulo: string, valor: number | null, corBorda: string, conta: ReactNode, i: ReactNode, testid: string) => (
    <section className="rounded-md border bg-card px-2 pb-1.5 pt-1" style={{ borderTop: `3px solid ${corBorda}` }} data-testid={testid}>
      <div className="flex items-center gap-1 text-[10px] font-semibold leading-[14px] text-muted-foreground">
        <span className="whitespace-nowrap">{nro} · {titulo}</span>{i}
      </div>
      <div className={cn('text-[16px] font-bold leading-[20px] tabular-nums', corDoSinal(valor))}>{reaisComSinal(valor)}</div>
      <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-[10px] leading-[13px]">{conta}</div>
    </section>
  );

  /* V6: jovens (abre as categorias), adultos, total */
  const v6Linha = (l: LinhaDoRebanho, cls: string, chave: string, grupo?: { lista: CategoriaDaExplicacao[] }) => {
    const r = linhaV6(l, total);
    const ab = aberto[chave] ?? false;
    return (
      <Fragment key={chave}>
        <tr className={cls} onClick={grupo ? () => setAberto(x => ({ ...x, [chave]: !ab })) : undefined}
          style={{ height: 16, cursor: grupo ? 'pointer' : undefined }}>
          {/* ⚠ A SETA É DESENHO (CSS), NÃO TEXTO: o `title` tem de ter o texto inteiro da célula (regra de corte) */}
          <td className={cn('truncate px-1 text-left', grupo && 'before:mr-0.5 before:content-[attr(data-seta)]')} data-seta={grupo ? (ab ? '▾' : '▸') : undefined}
            title={r.nome}>{r.nome}</td>
          <td className="border-l px-1">{n0(r.cab0)}</td><td className="px-1">{n0(r.at0)}</td><td className="px-1">{n1(r.atPorCab)}</td>
          <td className="px-1">{n2(r.pk0)}</td><td className="px-1">{n0(r.v0)}</td>
          <td className={cn('border-l px-1', corDoSinal(r.dCab))}>{sinal(r.dCab, 0)}</td><td className={cn('px-1', corDoSinal(r.dCab))}>{sinalPct(r.dCabPct)}</td>
          <td className={cn('px-1', corDoSinal(r.dAt))}>{sinal(r.dAt, 0)}</td><td className={cn('px-1', corDoSinal(r.dAt))}>{sinalPct(r.dAtPct)}</td>
          <td className="border-l px-1">{r.part0 == null ? '—' : `${n1(r.part0)}%`}</td><td className="px-1">{r.part1 == null ? '—' : `${n1(r.part1)}%`}</td>
          <td className={cn('px-1', corDoSinal(r.dPart))}>{sinal(r.dPart, 1)}</td>
        </tr>
        {grupo && ab && grupo.lista.map(x => v6Linha(x, 'text-muted-foreground', `${chave}:${x.cod}`))}
      </Fragment>
    );
  };
  const COLS_V6 = [110, 46, 52, 40, 50, 76, 44, 46, 50, 46, 44, 44, 40];
  const COLS_V3 = [110, 44, 44, 50, 50, 50, 50, 76, 76, 76, 76];

  return (
    <div className="flex flex-col gap-1.5" data-testid="variacao-explicacao">
      {/* V1 */}
      <Cartao testid="variacao-v1" titulo={resumido ? 'Da produção à linha do DRE' : 'De onde veio a variação'}
        info={<>
          <span className="whitespace-nowrap text-[10px] font-normal text-muted-foreground">R$ · R$/@ de {p0}</span>
          <InfoDaVariacao texto={info.ponte} testid="info-ponte" />
          {cadastro && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-medium leading-[14px] text-amber-800" data-testid="selo-fim-cadastro">
              fim pelo cadastro<InfoDaVariacao texto={info.cadastro} />
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 text-[10px] font-normal text-muted-foreground">
            {passos.filter(p => p.tipo === 'delta').map(p => (
              <span key={p.chave} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                <i className="inline-block h-2 w-2 rounded-sm" style={{ background: COR_PASSO[p.chave] }} />{p.rotulo.replace('(−) ', '')}
                <InfoDaVariacao texto={p.chave === 'producao' ? info.producao : p.chave === 'evolucao' ? info.evolucao : p.chave === 'mercado' ? info.mercado : info.reposicao}
                  testid={`info-${p.chave}`} />
              </span>
            ))}
          </span>
        </>}>
        <div className="px-1 pb-1"><Ponte passos={passos} /></div>
      </Cartao>

      {/* V2 */}
      <div className="grid grid-cols-3 gap-1.5">
        {card('1', 'Quantidade', c.quantidade, AZUL, <>
          {linhaConta(`@ em ${p0}`, n0(totais.at0))}
          {linhaConta(`@ em ${p1}`, n0(totais.at1))}
          {linhaConta(`× R$/@ médio de ${p0}`, n2(c.pkMedio0))}
          {linhaConta('= Δ @ × preço', reaisComSinal(c.quantidade), corDoSinal(c.quantidade), true)}
        </>, <InfoDaVariacao texto={info.quantidade} testid="info-quantidade" />, 'variacao-card-quantidade')}
        {card('2', 'Composição', c.composicao, ROXO, <>
          {linhaConta('Produção', reaisComSinal(totais.vpb - (totais.agio ?? 0)))}
          {linhaConta('− Quantidade', reaisComSinal(c.quantidade == null ? null : -c.quantidade))}
          {linhaConta(`R$/@ médio ${p1} (preço ${p0})`, n2(c.pkFimRef))}
          {linhaConta('= Composição', reaisComSinal(c.composicao), corDoSinal(c.composicao), true)}
        </>, <InfoDaVariacao texto={info.composicao} testid="info-composicao" />, 'variacao-card-composicao')}
        {card('3', 'Mercado', c.mercado, AMBAR, <>
          {linhaConta(`R$/@ ${p1} a preço de ${p0}`, n2(c.pkFimRef))}
          {linhaConta(`R$/@ ${p1} a preço de ${p1}`, n2(c.pkFimMes))}
          {linhaConta(`× @ em ${p1}`, n0(totais.at1))}
          {linhaConta('= efeito de mercado', reaisComSinal(c.mercado), corDoSinal(c.mercado), true)}
        </>, <InfoDaVariacao texto={info.mercado} testid="info-card-mercado" />, 'variacao-card-mercado')}
      </div>

      {/* V6 */}
      <Cartao testid="variacao-v6" titulo={`Rebanho em ${p0} e o que mudou até ${p1}`} info={<InfoDaVariacao texto={info.v6} testid="info-v6" />}>
        <div className="px-1 pb-1">
          <table className="border-collapse text-right text-[10px] tabular-nums" style={{ tableLayout: 'fixed', width: COLS_V6.reduce((a, w) => a + w, 0) }}>
            <colgroup>{COLS_V6.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead className="text-[9.5px] text-muted-foreground">
              <tr style={{ height: 14 }}><th /><th colSpan={5} className="border-l text-center font-semibold">{p0}</th>
                <th colSpan={4} className="border-l text-center font-semibold">Variação até {p1}</th>
                <th colSpan={3} className="border-l text-center font-semibold">Participação em @</th></tr>
              <tr style={{ height: 14 }} className="border-b">
                <th className="px-1 text-left font-semibold">Grupo</th>
                {['Cab.', '@', '@/cab', 'R$/@', 'Valor'].map((x, i) => <th key={x} className={cn('px-1 font-semibold', i === 0 && 'border-l')}>{x}</th>)}
                {['Cab.', '%', '@', '%'].map((x, i) => <th key={`v${i}`} className={cn('px-1 font-semibold', i === 0 && 'border-l')}>{x}</th>)}
                {[p0, p1, 'Δ p.p.'].map((x, i) => <th key={`p${i}`} className={cn('px-1 font-semibold', i === 0 && 'border-l')}>{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {jovens && v6Linha(jovens, 'font-medium', 'jovens', { lista: cats.filter(x => x.jovem) })}
              {adultos && v6Linha(adultos, 'font-medium', 'adultos', { lista: cats.filter(x => !x.jovem) })}
              {v6Linha(total, 'border-t font-semibold', 'total')}
            </tbody>
          </table>
        </div>
      </Cartao>

      {/* V3 */}
      <Cartao testid="variacao-v3" titulo="Por categoria" info={<>
        <span className="whitespace-nowrap text-[10px] font-normal text-muted-foreground">R$ · R$/@ de {p0}</span>
        <InfoDaVariacao texto={info.v3} testid="info-v3" />
      </>}>
        <div className="px-1 pb-1">
          <table className="border-collapse text-right text-[10px] tabular-nums" style={{ tableLayout: 'fixed', width: COLS_V3.reduce((a, w) => a + w, 0) }}>
            <colgroup>{COLS_V3.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead className="text-[9.5px] text-muted-foreground">
              <tr style={{ height: 14 }} className="border-b">
                <th className="px-1 text-left font-semibold">Categoria</th>
                <th className="border-l px-1 font-semibold">Cab. {p0}</th><th className="px-1 font-semibold">Cab. {p1}</th>
                <th className="border-l px-1 font-semibold">@ {p0}</th><th className="px-1 font-semibold">@ {p1}</th><th className="px-1 font-semibold">Δ @</th>
                <th className="border-l px-1 font-semibold">R$/@ {p0}</th>
                <th className="border-l px-1 font-semibold">Produção</th><th className="px-1 font-semibold">Evol. categ.</th>
                <th className="px-1 font-semibold">Sem mercado</th><th className="border-l px-1 font-semibold">Mercado</th>
              </tr>
            </thead>
            <tbody>
              {[...cats, { ...total, cod: '__total', jovem: false, cabIn: null, cabOut: null, atIn: null, atOut: null, agioSemPreco: false }].map(x => {
                const tot = x.cod === '__total';
                const prod = x.vpb - (x.agio ?? 0);
                const merc = cadastro ? null : x.efeito;
                const pk0 = x.at0 === 0 ? (x.at1 === 0 ? null : x.v1p0 / x.at1) : x.v0 / x.at0;
                const ttEvol = tot ? undefined
                  : `entraram ${n0(x.cabIn)} cab (${n0(x.atIn)} @) · saíram ${n0(x.cabOut)} cab (${n0(x.atOut)} @)${x.agioSemPreco ? ' · sem preço de referência' : ''}`;
                return (
                  <tr key={x.cod} style={{ height: 16 }} className={cn(tot && 'border-t font-semibold')}>
                    <td className="truncate px-1 text-left" title={x.nome}>{x.nome}</td>
                    <td className="border-l px-1">{n0(x.q0)}</td><td className="px-1">{n0(x.q1)}</td>
                    <td className="border-l px-1">{n0(x.at0)}</td><td className="px-1">{n0(x.at1)}</td>
                    <td className={cn('px-1', corDoSinal(x.at1 - x.at0))}>{sinal(x.at1 - x.at0, 0)}</td>
                    <td className="border-l px-1">{n2(pk0)}</td>
                    <td className={cn('border-l px-1', corDoSinal(prod))}>{sinal(x.agio == null ? null : prod, 0)}</td>
                    <td className={cn('px-1', corDoSinal(x.agio))} title={ttEvol}>{sinal(x.agio, 0)}</td>
                    <td className={cn('px-1', corDoSinal(x.vpb))}>{sinal(x.vpb, 0)}</td>
                    <td className={cn('border-l px-1', corDoSinal(merc))}>{sinal(merc, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      {/* V4 */}
      <div className="grid grid-cols-3 gap-1.5" data-testid="variacao-v4">
        <Cartao titulo="Arrobas no fim do mês" info={<InfoDaVariacao texto={info.v4} testid="info-v4" />}>
          <div className="px-1 pb-1"><Linha testid="v4-arrobas" pontos={pontos} fmt={v => `${formatNum(v / 1000, 1)} mil`}
            series={[{ cor: AZUL, v: p => p.arrobas }]} /></div>
        </Cartao>
        <Cartao titulo="R$/@ médio" info={<span className="flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
          <span className="whitespace-nowrap"><i className="mr-0.5 inline-block h-[2px] w-2.5 align-middle" style={{ background: ROXO }} />{p0}</span>
          <span className="whitespace-nowrap"><i className="mr-0.5 inline-block h-[2px] w-2.5 align-middle" style={{ background: AMBAR }} />do mês</span>
        </span>}>
          <div className="px-1 pb-1"><Linha testid="v4-preco" pontos={pontos} fmt={v => formatNum(v, 0)}
            series={[{ cor: ROXO, v: p => p.pkRef }, { cor: AMBAR, v: p => p.pkMes }]} /></div>
        </Cartao>
        <Cartao titulo={`Composição em @ · ${p0} × ${p1}`}>
          <div className="px-2 pb-1.5 pt-0.5" data-testid="v4-composicao">
            {PONTAS.map(k => {
              const tot = total[k];
              return (
                <div key={k} className="mb-1">
                  <div className="text-[10px] leading-[13px] text-muted-foreground">{k === 'at0' ? p0 : p1} · {n0(tot)} @</div>
                  <div className="flex h-[14px] w-full overflow-hidden rounded-sm bg-muted">
                    {tot > 0 && cats.filter(x => x[k] > 0).map((x, i) => (
                      <div key={x.cod} title={`${x.nome} · ${n0(x[k])} @ (${n1((x[k] / tot) * 100)}%)`}
                        style={{ width: `${(x[k] / tot) * 100}%`, background: PALETA_COMP[i % PALETA_COMP.length] }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Cartao>
      </div>

      {/* V5 */}
      <Cartao testid="variacao-v5" titulo="Em uma frase">
        <p className="m-0 px-2 pb-1.5 text-[11px] leading-[16px]" data-testid="variacao-frase">{fraseDaVariacao(totais, rot)}</p>
      </Cartao>
    </div>
  );
}

const PALETA_COMP = ['#5B9BD5', '#3B6FB0', '#24476F', '#C27A2C', '#8A5A2C', '#6B5CA5', '#9CA3AF', '#2E7D4F', '#B4483C', '#7F8C9D'];
const PONTAS: readonly ('at0' | 'at1')[] = ['at0', 'at1'];
