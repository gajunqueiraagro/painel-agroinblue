/**
 * RESUMO-ATIVIDADE-01b — a aba Pecuária (mock `docs/mocks/mock-resumo-atividade-01b-v3.html`, aprovado em 16/10/2026).
 *
 * De cima para baixo: a linha de numeros · dois cards (Área por fase · Cabeças por fase, donut + colunas Ini..dez) · a tabela
 * "Por fase" e a "Rebanho do mês · realizado × meta" com os numeros rapidos.
 * A TELA NAO FAZ CONTA: tudo vem de `src/lib/fechamento/resumoPecuaria.ts` (e da 01a); aqui so' se formata e desenha.
 */
import { formatNum } from '@/lib/calculos/formatters';
import type { ColunaDoMes } from '@/lib/fechamento/resumoPorAtividade';
import type { ColunaDeCabecas, LinhaDoRebanho, NumerosRapidos, PorFase, TomDaDif } from '@/lib/fechamento/resumoPecuaria';

export const COR_FASE_01B: Record<string, string> = {
  cria: '#c0582b', recria: '#2f7a52', engorda: '#1d4f86', reforma_pecuaria: '#9a8f7a', vedado: '#c9ced6',
};
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const AZUL = 'text-[#1d4f86]';
const COR_TOM: Record<TomDaDif, string> = { bom: 'text-[#15803d]', ruim: 'text-[#b91c1c]', neutro: 'text-[#94a3b8]' };
const VAZIO = <span className="text-[#94a3b8]">—</span>;

/* numero com a unidade (R$ antes; o resto depois); negativo com "−" colado */
const sinal = (v: number, txt: string) => (v < 0 ? `−${txt}` : txt);
const num = (v: number | null | undefined, dec: number, un?: string) =>
  v == null ? null : sinal(v, `${formatNum(Math.abs(v), dec)}${un ? ` ${un}` : ''}`);
const rs = (v: number | null | undefined, dec = 2) => (v == null ? null : sinal(v, `R$ ${formatNum(Math.abs(v), dec)}`));
const comSinal = (v: number | null, dec = 0, prefixo = '') =>
  v == null ? null : v === 0 ? '0' : `${v > 0 ? '+' : '−'}${prefixo}${formatNum(Math.abs(v), dec)}`;
const mostra = (t: string | null, cls = '') => (t == null ? VAZIO : <span className={cls}>{t}</span>);

export interface AbaPecuariaProps {
  rotuloMes: string;
  anoMes: string;
  areaPecuariaHa: number;
  porFase: PorFase;
  areaPorFase: Array<{ chave: string; rotulo: string; valor: number }>;
  /** o total da area da pecuaria no mes (o centro do donut), da 01a */
  areaPorFaseTotal: number;
  colunasArea: ColunaDoMes[];
  colunasCabecas: ColunaDeCabecas[];
  linhasRebanho: LinhaDoRebanho[];
  naoFecha: { realizado: number; meta: number };
  foraVendaGeral: number;
  rapidos: NumerosRapidos;
  erroReceitas: string | null;
}

export function AbaPecuaria(p: AbaPecuariaProps) {
  const pf = p.porFase, pec = pf.pecuaria;
  const colCabMes = p.colunasCabecas.find(c => c.anoMes === p.anoMes);
  return (
    <div className="flex flex-col gap-2.5" data-testid="aba-pecuaria">
      {/* 1. linha de numeros */}
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 border-b border-[#dde3ea] pb-2" data-testid="linha-numeros">
        <Num rotulo="Cabeças" valor={formatNum(pec.cab)} un="cab" />
        <Num rotulo="Área pecuária" valor={formatNum(p.areaPecuariaHa, 1)} un="ha" />
        <Num rotulo="ocupada · vedada" valor={`${formatNum(pec.ocupadaHa, 1)} · ${formatNum(pec.vedadaHa, 1)}`} un="ha" />
        <Num rotulo="Peso médio" valor={pec.pesoMedio == null ? null : formatNum(pec.pesoMedio, 1)} un="kg" />
        <Num rotulo="GMD" valor={pec.gmd == null ? null : formatNum(pec.gmd, 3)} un="kg/dia" />
        <Num rotulo="Lotação global" valor={pec.global == null ? null : formatNum(pec.global, 2)} un="UA/ha" azul />
        <Num rotulo="Lotação efetiva" valor={pec.efetiva == null ? null : formatNum(pec.efetiva, 2)} un="UA/ha" azul />
        <Num rotulo="Vedado" valor={pec.pctVedado == null ? null : formatNum(pec.pctVedado, 1)} un="%" />
        <Num rotulo="@ em estoque" valor={pec.arrobasEstoque == null ? null : formatNum(pec.arrobasEstoque, 1)} un="@" />
        <Num rotulo="@ produzidas" valor={pec.arrobasProduzidas == null ? null : formatNum(pec.arrobasProduzidas, 1)} un="@" />
      </div>

      {/* 2. dois cards (empilham abaixo de ~1100px) */}
      <div className="grid grid-cols-1 gap-2.5 min-[1100px]:grid-cols-2">
        <Cartao titulo={`Área por fase · ${p.rotuloMes}`} testid="card-area-fase">
          <DonutELegenda partes={p.areaPorFase} total={p.areaPorFaseTotal} unidade="ha" casas={1} />
          <Colunas testid="colunas-area-fase" mesSel={p.anoMes} unidade="ha"
            colunas={p.colunasArea.map(c => ({ anoMes: c.anoMes, semFechamento: c.semFechamento,
              partes: c.partes.map(x => ({ chave: x.chave, rotulo: x.rotulo, valor: x.areaHa, pct: x.pct })) }))} />
        </Cartao>
        <Cartao titulo={`Cabeças por fase · ${p.rotuloMes}`} testid="card-cabecas-fase">
          <DonutELegenda partes={(colCabMes?.partes ?? []).map(x => ({ chave: x.chave, rotulo: x.rotulo, valor: x.valor }))}
            total={colCabMes?.total ?? 0} unidade="cab" casas={0} />
          <Colunas testid="colunas-cabecas-fase" mesSel={p.anoMes} unidade="cab" colunas={p.colunasCabecas} />
        </Cartao>
      </div>

      {/* 3. Por fase + Rebanho do mes */}
      <div className="grid grid-cols-1 items-start gap-2.5 min-[1100px]:grid-cols-[auto_1fr]">
        <Cartao titulo={`Por fase · ${p.rotuloMes}`} testid="card-por-fase">
          <TabelaPorFase pf={pf} />
        </Cartao>
        <Cartao titulo={`Rebanho do mês · ${p.rotuloMes}`} sub="realizado × meta" testid="card-rebanho">
          <TabelaRebanho linhas={p.linhasRebanho} naoFecha={p.naoFecha} foraVendaGeral={p.foraVendaGeral} erro={p.erroReceitas} />
          <Rapidos r={p.rapidos} />
        </Cartao>
      </div>
    </div>
  );
}

/* ── pecas ─────────────────────────────────────────────────────────────────────────────────────── */

function Num({ rotulo, valor, un, azul }: { rotulo: string; valor: string | null; un: string; azul?: boolean }) {
  return (
    <div className="flex flex-col whitespace-nowrap">
      <span className="text-[9px] text-[#64748b]">{rotulo}</span>
      <span className={`text-[13px] font-bold tabular-nums ${azul ? AZUL : ''}`}>
        {valor ?? '—'} {valor != null && <small className="text-[9px] font-medium text-[#64748b]">{un}</small>}
      </span>
    </div>
  );
}

function Cartao({ titulo, sub, testid, children }: { titulo: string; sub?: string; testid: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-[#dde3ea] bg-white px-2.5 py-2" data-testid={testid}>
      <h3 className="m-0 mb-1.5 whitespace-nowrap text-[11px] font-semibold">
        {titulo}{sub && <span className="font-normal text-[#64748b]"> {sub}</span>}
      </h3>
      {children}
    </div>
  );
}

interface Parte { chave: string; rotulo: string; valor: number }

function DonutELegenda({ partes, total, unidade, casas }: { partes: Parte[]; total: number; unidade: string; casas: number }) {
  const pct = (v: number) => (total > 0 ? `${formatNum((v / total) * 100, 1)}%` : '—');
  const C = 2 * Math.PI * 60;
  let acc = 0;
  return (
    <div className="flex items-center gap-2.5">
      <svg width={118} height={118} viewBox="0 0 170 170" className="flex-none" role="img"
        aria-label={partes.map(x => `${x.rotulo} ${pct(x.valor)}`).join(', ')}>
        <g transform="rotate(-90 85 85)">
          {total > 0 ? partes.filter(x => x.valor > 0).map(x => {
            const len = (x.valor / total) * C;
            const el = (
              <circle key={x.chave} cx={85} cy={85} r={60} fill="none" stroke={COR_FASE_01B[x.chave] ?? '#9aa4b1'} strokeWidth={28}
                strokeDasharray={`${len} ${C}`} strokeDashoffset={-acc}>
                <title>{`${x.rotulo} · ${formatNum(x.valor, casas)} ${unidade} · ${pct(x.valor)}`}</title>
              </circle>
            );
            acc += len;
            return el;
          }) : <circle cx={85} cy={85} r={60} fill="none" stroke="#e3e8ee" strokeWidth={28} />}
        </g>
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={700} fill="#1f2937">{formatNum(total, casas)}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={12} fill="#64748b">{unidade}</text>
      </svg>
      <div className="min-w-0 flex-1 text-[10px]" data-testid="legenda-fase">
        {partes.map(x => (
          <div key={x.chave} className="grid h-4 items-center gap-1.5 whitespace-nowrap tabular-nums" style={{ gridTemplateColumns: '10px minmax(0,1fr) 72px 44px' }}>
            <i className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: COR_FASE_01B[x.chave] }} />
            <span className="truncate">{x.rotulo}</span>
            <span className="text-right">{formatNum(x.valor, casas)} {unidade}</span>
            <span className="text-right font-semibold">{pct(x.valor)}</span>
          </div>
        ))}
        <div className="grid h-4 items-center gap-1.5 whitespace-nowrap border-t border-[#e5e7eb] font-semibold tabular-nums" style={{ gridTemplateColumns: '10px minmax(0,1fr) 72px 44px' }}>
          <span /><span>Pecuária</span>
          <span className="text-right">{formatNum(total, casas)} {unidade}</span>
          <span className="text-right">{total > 0 ? '100%' : '—'}</span>
        </div>
      </div>
    </div>
  );
}

interface ColunaGenerica { anoMes: string; semFechamento: boolean; partes: Array<{ chave: string; rotulo: string; valor: number; pct: number }> }

/** 100% empilhadas, Ini + 12 meses, colunas de largura igual; o mes escolhido contornado; sem fechamento tracejado. */
function Colunas({ colunas, mesSel, unidade, testid }: { colunas: ColunaGenerica[]; mesSel: string; unidade: string; testid: string }) {
  const W = 560, H = 132, TOPO = 4, BASE = 16, ALT = H - TOPO - BASE, CW = 30, GAP = (W - 13 * CW) / 13;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 block h-auto w-full max-w-[560px]" role="img" aria-label={`% por fase mês a mês (${unidade})`} data-testid={testid}>
      {colunas.map((c, i) => {
        const x = GAP / 2 + i * (CW + GAP);
        const mesN = Number(c.anoMes.slice(5, 7));
        const rotulo = i === 0 ? 'Ini' : MESES_CURTOS[mesN - 1];
        const sel = c.anoMes === mesSel;
        let y = TOPO + ALT;
        return (
          <g key={c.anoMes} data-mes={c.anoMes}>
            {c.semFechamento ? (
              <rect x={x} y={TOPO} width={CW} height={ALT} fill="none" stroke="#c4ccd6" strokeDasharray="3 2">
                <title>{`${rotulo} · sem fechamento`}</title>
              </rect>
            ) : c.partes.filter(pt => pt.valor > 0).map(pt => {
              const hh = (pt.pct / 100) * ALT;
              y -= hh;
              return (
                <g key={pt.chave}>
                  <rect x={x} y={y} width={CW} height={hh} fill={COR_FASE_01B[pt.chave] ?? '#9aa4b1'}>
                    <title>{`${pt.rotulo} · ${rotulo} · ${formatNum(pt.valor, unidade === 'cab' ? 0 : 1)} ${unidade} · ${formatNum(pt.pct, 1)}%`}</title>
                  </rect>
                  {hh > 11 && (
                    <text x={x + CW / 2} y={y + hh / 2 + 3} textAnchor="middle" fontSize={7.5} pointerEvents="none"
                      fill={pt.chave === 'vedado' ? '#334155' : '#fff'}>{Math.round(pt.pct)}</text>
                  )}
                </g>
              );
            })}
            {sel && <rect x={x - 2} y={TOPO - 2} width={CW + 4} height={ALT + 4} fill="none" stroke="#1d3a5d" strokeWidth={1.5} rx={2} data-testid="coluna-selecionada" />}
            <text x={x + CW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill={sel ? '#1d3a5d' : '#64748b'} fontWeight={sel ? 700 : 400}>{rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* tabelas: corpo 10px, cabecalho 9px, linha de ~19px; numeros a' direita, uma linha por registro */
const TH = 'h-5 whitespace-nowrap bg-[#1d3a5d] px-1.5 text-right text-[9px] font-semibold text-white';
const TH_L = 'h-5 whitespace-nowrap bg-[#1d3a5d] px-1.5 text-left text-[9px] font-semibold text-white';
const TD = 'h-[19px] whitespace-nowrap border-b border-[#eef0f3] px-1.5 py-0 text-right text-[10px] tabular-nums';
const TD_L = 'h-[19px] whitespace-nowrap border-b border-[#eef0f3] px-1.5 py-0 text-left text-[10px] text-[#475569]';
const PEC = 'bg-[#dfe4ea] font-semibold';
const SEP = '[&>td]:border-t [&>td]:border-t-[#b9c3cf]';
const RODAPE = 'whitespace-normal bg-[#eef2f6] px-1.5 py-[3px] text-left text-[9px] leading-[1.35] text-[#64748b]';

function TabelaPorFase({ pf }: { pf: PorFase }) {
  const cols = [pf.fases.cria, pf.fases.recria, pf.fases.engorda, pf.pecuaria];
  const linha = (rotulo: string, val: (c: typeof cols[number], i: number) => string | null, opts?: { sep?: boolean; azul?: boolean; soPec?: boolean }) => (
    <tr key={rotulo} className={opts?.sep ? SEP : ''}>
      <td className={`${TD_L} ${opts?.azul ? `${AZUL} font-semibold` : ''}`}>{rotulo}</td>
      {cols.map((c, i) => {
        const pecCol = i === 3;
        const t = opts?.soPec && !pecCol ? null : val(c, i);
        return <td key={i} className={`${TD} ${pecCol ? PEC : ''} ${opts?.azul ? `${AZUL} font-semibold` : ''}`}>{mostra(t)}</td>;
      })}
    </tr>
  );
  const fase = pf.pecuaria;
  return (
    <table className="table-fixed border-collapse" style={{ width: 538 }} data-testid="tabela-por-fase">
      <colgroup><col style={{ width: 196 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 90 }} /></colgroup>
      <thead><tr>
        <th className={TH_L}>Indicador</th><th className={TH}>Cria</th><th className={TH}>Recria</th><th className={TH}>Engorda</th><th className={TH}>Pecuária</th>
      </tr></thead>
      <tbody>
        {linha('Cabeças', c => formatNum(c.cab))}
        {linha('Peso médio', c => num(c.pesoMedio, 1, 'kg'))}
        {linha('Área ocupada', c => num(c.ocupadaHa, 1, 'ha'), { sep: true })}
        {linha('Área vedada (atividade do cadastro)', c => num(c.vedadaHa, 1, 'ha'))}
        {linha('% vedado', c => num(c.pctVedado, 1, '%'))}
        {linha('Lotação efetiva (só ocupada)', c => num(c.efetiva, 2, 'UA/ha'), { sep: true, azul: true })}
        {linha('Lotação global (ocupada + vedada)', c => num(c.global, 2, 'UA/ha'))}
        {linha('@ em estoque', c => num(c.arrobasEstoque, 1, '@'), { sep: true })}
        {linha('@ produzidas', () => num(fase.arrobasProduzidas, 1, '@'), { soPec: true })}
        {linha('GMD', () => num(fase.gmd, 3, 'kg'), { soPec: true })}
        <tr>
          <td className={TD_L}>Custo por @ produzida</td>
          {cols.map((_c, i) => <td key={i} className={`${TD} text-[#94a3b8] ${i === 3 ? PEC : ''}`}>R$ —</td>)}
        </tr>
        <tr><td colSpan={5} className={RODAPE} data-testid="rodape-por-fase">
          {pf.divergenciaCab
            ? <>divergência: Σ fases {formatNum(pf.divergenciaCab.fases)} × cache {formatNum(pf.divergenciaCab.cache)} cab</>
            : <>cabeças: Σ fases = cache</>}
          {pf.divergenciaPeso && <> · peso: Σ fases {formatNum(pf.divergenciaPeso.fases / 1000, 1)} mil kg × cache {formatNum(pf.divergenciaPeso.cache / 1000, 1)} mil kg</>}
          {' '}· não ajustado
          {pf.vedadaForaDasFases > 0 && <> · {formatNum(pf.vedadaForaDasFases, 1)} ha vedados com cadastro fora de cria/recria/engorda (só na Pecuária)</>}
        </td></tr>
      </tbody>
    </table>
  );
}

function TabelaRebanho({ linhas, naoFecha, foraVendaGeral, erro }: {
  linhas: LinhaDoRebanho[]; naoFecha: { realizado: number; meta: number }; foraVendaGeral: number; erro: string | null;
}) {
  return (
    <table className="w-full table-fixed border-collapse" data-testid="tabela-rebanho">
      <colgroup><col style={{ width: 112 }} /><col /><col /><col /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /></colgroup>
      <thead><tr>
        <th className={TH_L}>Movimento</th><th className={TH}>Realiz. cab</th><th className={TH}>Meta cab</th><th className={TH}>Dif. cab</th>
        <th className={TH}>Realiz. R$</th><th className={TH}>Meta R$</th><th className={TH}>Dif. R$</th>
      </tr></thead>
      <tbody>
        {linhas.map(l => {
          const fim = l.chave === 'fim';
          const c = fim ? PEC : '';
          return (
            <tr key={l.chave} className={fim ? SEP : ''} data-testid={`rebanho-${l.chave}`}>
              <td className={`${TD_L} ${fim ? 'font-semibold text-[#1f2937]' : ''}`}>{l.rotulo}</td>
              <td className={`${TD} ${c}`}>{mostra(l.realizado == null ? null : formatNum(l.realizado))}</td>
              <td className={`${TD} ${c}`}>{mostra(l.meta == null ? null : formatNum(l.meta))}</td>
              <td className={`${TD} ${c}`} data-tom={l.tom}>{mostra(l.dif === 0 ? null : comSinal(l.dif), COR_TOM[l.tom])}</td>
              <td className={`${TD} ${c}`}>{l.temRs ? mostra(rs(l.rsRealizado)) : VAZIO}</td>
              <td className={`${TD} ${c}`}>{l.temRs ? mostra(rs(l.rsMeta)) : VAZIO}</td>
              <td className={`${TD} ${c}`} data-tom={l.rsTom}>{l.temRs ? mostra(l.rsDif === 0 ? null : comSinal(l.rsDif, 2, 'R$ '), COR_TOM[l.rsTom]) : VAZIO}</td>
            </tr>
          );
        })}
        <tr><td colSpan={7} className={RODAPE} data-testid="rodape-rebanho">
          cab = rebanho do mês (cache, realizado e meta) · R$ = DRE da fazenda no mês, realizado e meta: Abates e Venda Peso Vivo
          {foraVendaGeral !== 0 && <> · Venda Geral fora ({rs(foraVendaGeral)})</>}
          {naoFecha.realizado !== 0 && <span className="text-[#b91c1c]"> · realizado não fecha: {comSinal(naoFecha.realizado)} cab</span>}
          {naoFecha.meta !== 0 && <span className="text-[#b91c1c]"> · meta não fecha: {comSinal(naoFecha.meta)} cab</span>}
          {erro && <span className="text-[#b91c1c]"> · {erro}</span>}
        </td></tr>
      </tbody>
    </table>
  );
}

function Rapidos({ r }: { r: NumerosRapidos }) {
  const itens: Array<{ rotulo: string; valor: string | null; cls?: string }> = [
    { rotulo: 'Mortalidade', valor: num(r.mortalidade, 2, '%') },
    { rotulo: 'Desfrute (abate + venda)', valor: num(r.desfrute, 1, '%') },
    { rotulo: 'R$/cab abate', valor: rs(r.rsCabAbate) },
    { rotulo: 'R$/cab venda', valor: rs(r.rsCabVenda) },
    { rotulo: 'R$/@ venda', valor: rs(r.rsArrobaVenda) },
    { rotulo: 'Nascimentos × meta', valor: r.nascimentosXMeta == null ? null : `${comSinal(Math.round(r.nascimentosXMeta))} %`,
      cls: r.nascimentosXMeta == null || Math.round(r.nascimentosXMeta) === 0 ? '' : r.nascimentosXMeta > 0 ? COR_TOM.bom : COR_TOM.ruim },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[#eef0f3] pt-1.5" data-testid="numeros-rapidos">
      {itens.map(i => (
        <div key={i.rotulo} className="flex flex-col whitespace-nowrap">
          <span className="text-[9px] text-[#64748b]">{i.rotulo}</span>
          <span className={`text-[12px] font-bold tabular-nums ${i.cls ?? ''}`}>{i.valor ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
