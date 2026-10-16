/**
 * RESUMO-ATIVIDADE-01a — a tela "Resumo por Atividade" (mock aprovado pelo Gabriel em 15/10/2026).
 *
 * Este PR entrega: cabecalho, linha de periodo (so' "No mes" funciona; "Acumulado" e "Safra" visiveis e desabilitados),
 * as seis abas, a aba Fazenda inteira (uso da area + por atividade), a aba Pecuaria (area por fase + por fase) e o
 * donut das abas Agricultura e Nao produtiva. Mes a mes, Pecuaria do mes, conferencia por categoria e exportar ficam
 * para o 01b / 01c (os dois botoes de exportar ficam desenhados e desabilitados, com o lugar reservado).
 *
 * A TELA NAO FAZ CONTA: tudo sai de `src/lib/fechamento/resumoPorAtividade.ts` (puro, testado) — a tela formata e desenha.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { FechamentoFitaMeses, type StatusDoMesNaFita } from '@/components/FechamentoFitaMeses';
import { formatNum } from '@/lib/calculos/formatters';
import { calcUA } from '@/lib/calculos/zootecnicos';
import type { Pasto } from '@/hooks/usePastos';
import type { FechamentoPasto, FechamentoItem } from '@/hooks/useFechamento';
import { useResumoPorAtividade } from '@/hooks/useResumoPorAtividade';
import { AbaPecuaria } from '@/components/resumoAtividade/AbaPecuaria';
import { montarPorFase, colunasDeCabecas, rebanhoDoPeriodo, linhasDoRebanho, numerosRapidos } from '@/lib/fechamento/resumoPecuaria';
import {
  montarResumoDoMes, totalDaPecuariaDoCache, divergenciaDasFases, indicadoresDaParte, colunasDaArea,
  FASES_PECUARIA, ROTULO_FASE, ROTULO_GRUPO, GRUPOS_ATIVIDADE,
  type ColunaDoMes, type GrupoAtividade, type ParteDoResumo, type ItemDoResumo, type CardDoResumo,
} from '@/lib/fechamento/resumoPorAtividade';

/* ── Cores do mock ──────────────────────────────────────────────────────────────────────────────── */
const COR_GRUPO: Record<GrupoAtividade, string> = {
  pecuaria: '#1d4f86', agricultura: '#b8860b', silvicultura: '#4d7c0f', cana: '#7a9a3a', nao_produtiva: '#5f6b78',
};
const COR_NAO_PRODUTIVA: Record<string, string> = { reserva: '#5f6b78', app: '#8a96a3', benfeitorias: '#3f4955' };
const CORES_CULTURA = ['#b8860b', '#d4a937', '#8c6a12', '#e3c46a', '#6f5410'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const LETRA_MES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const mesAno = (anoMes: string) => { const [a, m] = anoMes.split('-'); return `${MESES_CURTOS[Number(m) - 1]}/${a}`; };
const ha = (v: number | null | undefined) => (v == null ? '—' : `${formatNum(v, 1)} ha`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${formatNum(v, 1)} %`);

type Aba = 'fazenda' | 'pecuaria' | 'agricultura' | 'silvicultura' | 'cana' | 'nao_produtiva';

export interface ResumoPorAtividadeProps {
  fazenda: { id: string; nome: string; codigo?: string | null };
  clienteNome: string;
  /** RESUMO-ATIVIDADE-01b: o R$ do Rebanho do mes vem do DRE do cliente */
  clienteId?: string | null;
  pastos: readonly Pasto[];
  fechamentos: readonly FechamentoPasto[];
  itensMap: ReadonlyMap<string, readonly FechamentoItem[]>;
  culturasPorPasto: ReadonlyMap<string, { culturas: string[] }>;
  anoMes: string;
  anoFiltro: string;
  setAnoFiltro: (ano: string) => void;
  anosDisp: string[];
  mesFiltro: number;
  setMesFiltro: (mes: number) => void;
  statusPorMes: Partial<Record<number, StatusDoMesNaFita>>;
  onBack: () => void;
}

export function ResumoPorAtividade(props: ResumoPorAtividadeProps) {
  const { fazenda, anoMes } = props;
  const ano = Number(props.anoFiltro);
  const [aba, setAba] = useState<Aba>('fazenda');
  const dados = useResumoPorAtividade(fazenda.id, ano, anoMes, props.clienteId ?? null);

  const culturas = useMemo(() => new Map([...props.culturasPorPasto].map(([k, v]) => [k, v.culturas])), [props.culturasPorPasto]);
  const cardsDoMes: CardDoResumo[] = useMemo(() => props.fechamentos.map(f => ({
    id: f.id, pasto_id: f.pasto_id, ano_mes: f.ano_mes, status: f.status, tipo_uso_mes: f.tipo_uso_mes,
  })), [props.fechamentos]);
  const itens: ItemDoResumo[] = useMemo(() => [...props.itensMap].flatMap(([fid, lista]) => lista.map(i => ({
    fechamento_id: fid, quantidade: i.quantidade, peso_medio_kg: i.peso_medio_kg,
  }))), [props.itensMap]);

  const resumo = useMemo(() => montarResumoDoMes({ anoMes, pastos: props.pastos, cards: cardsDoMes, itens, culturasPorPasto: culturas }),
    [anoMes, props.pastos, cardsDoMes, itens, culturas]);
  const total = useMemo(() => totalDaPecuariaDoCache(dados.cacheDoAno.filter(l => l.mes === props.mesFiltro), dados.areaPecuariaHa),
    [dados.cacheDoAno, dados.areaPecuariaHa, props.mesFiltro]);
  const divergencia = divergenciaDasFases(total, resumo);
  const colFazenda = useMemo(() => colunasDaArea({ meses: dados.meses, modo: 'fazenda', pastos: props.pastos, cards: dados.cardsDoAno }),
    [dados.meses, props.pastos, dados.cardsDoAno]);
  const colPecuaria = useMemo(() => colunasDaArea({ meses: dados.meses, modo: 'pecuaria', pastos: props.pastos, cards: dados.cardsDoAno }),
    [dados.meses, props.pastos, dados.cardsDoAno]);

  /* 01b — aba Pecuaria: tudo pronto da lib */
  const porFase = useMemo(() => montarPorFase({ anoMes, pastos: props.pastos, cards: cardsDoMes, resumo, total, areaPecuariaHa: dados.areaPecuariaHa }),
    [anoMes, props.pastos, cardsDoMes, resumo, total, dados.areaPecuariaHa]);
  const colCabecas = useMemo(() => colunasDeCabecas({ meses: dados.meses, pastos: props.pastos, cards: dados.cardsDoAno, itens: dados.itensDoAno }),
    [dados.meses, props.pastos, dados.cardsDoAno, dados.itensDoAno]);
  const rebanho = useMemo(() => rebanhoDoPeriodo([anoMes], dados.movimentosDoAno, dados.receitasDoMes),
    [anoMes, dados.movimentosDoAno, dados.receitasDoMes]);

  const g = resumo.grupos;
  const mesFechado = props.statusPorMes[props.mesFiltro] === 'fechado';
  const nCulturas = g.agricultura.filhas.filter(f => f.areas > 0).length;

  const abas: Array<{ id: Aba; rotulo: string; cor?: string; valor: string; sub: string; desabilitada: boolean }> = [
    { id: 'fazenda', rotulo: 'Fazenda inteira', valor: ha(resumo.totalAreaHa), sub: `${resumo.totalAreas} áreas`, desabilitada: false },
    { id: 'pecuaria', rotulo: 'Pecuária', cor: COR_GRUPO.pecuaria, valor: ha(g.pecuaria.areaHa),
      sub: total.cab != null ? `${formatNum(total.cab)} cab` : '— cab', desabilitada: g.pecuaria.areaHa <= 0 },
    { id: 'agricultura', rotulo: 'Agricultura', cor: COR_GRUPO.agricultura, valor: ha(g.agricultura.areaHa),
      sub: `${nCulturas} ${nCulturas === 1 ? 'cultura' : 'culturas'}`, desabilitada: g.agricultura.areaHa <= 0 },
    { id: 'silvicultura', rotulo: 'Silvicultura', cor: COR_GRUPO.silvicultura, valor: g.silvicultura.areaHa > 0 ? ha(g.silvicultura.areaHa) : '— ha',
      sub: g.silvicultura.areas > 0 ? `${g.silvicultura.areas} áreas` : 'sem talhão', desabilitada: g.silvicultura.areaHa <= 0 },
    { id: 'cana', rotulo: 'Cana-de-açúcar', cor: COR_GRUPO.cana, valor: '— ha', sub: 'sem talhão', desabilitada: true },
    { id: 'nao_produtiva', rotulo: 'Não produtiva', cor: COR_GRUPO.nao_produtiva, valor: ha(g.nao_produtiva.areaHa),
      sub: 'reserva · APP · benf.', desabilitada: g.nao_produtiva.areaHa <= 0 },
  ];

  return (
    <div className="flex flex-col gap-3 p-4 tabular-nums text-[#1b2533]" data-testid="resumo-por-atividade">
      {/* 1. Cabecalho */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={props.onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
          <div>
            <h1 className="m-0 whitespace-nowrap text-[15px] font-semibold">
              Resumo por Atividade · {fazenda.nome}{fazenda.codigo ? ` (${fazenda.codigo})` : ''}
            </h1>
            <div className="whitespace-nowrap text-[11px] text-[#5b6676]" data-testid="resumo-subtitulo">
              {props.clienteNome} · {mesAno(anoMes)} · {mesFechado ? 'mês fechado' : 'mês aberto'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" disabled title="Exportar: em breve">Exportar PDF</Button>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" disabled title="Exportar: em breve">Exportar Excel</Button>
        </div>
      </div>

      {/* 2. Periodo */}
      <div className="flex flex-wrap items-center gap-3.5">
        <FechamentoFitaMeses anoFiltro={props.anoFiltro} setAnoFiltro={props.setAnoFiltro} anosDisp={props.anosDisp}
          mesFiltro={props.mesFiltro} setMesFiltro={props.setMesFiltro} statusPorMes={props.statusPorMes} />
        <Segmentado<'mes' | 'acumulado'> valor="mes" onEscolher={() => undefined}
          opcoes={[{ valor: 'mes', rotulo: 'No mês' }, { valor: 'acumulado', rotulo: 'Acumulado', desabilitada: true, title: 'em breve' }]} />
        <Segmentado<'civil' | 'safra'> valor="civil" onEscolher={() => undefined}
          opcoes={[{ valor: 'civil', rotulo: 'Ano civil' }, { valor: 'safra', rotulo: 'Safra', desabilitada: true, title: 'em breve' }]} />
      </div>

      {/* 3. Abas */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {abas.map(a => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} disabled={a.desabilitada}
            data-testid={`aba-${a.id}`} onClick={() => !a.desabilitada && setAba(a.id)}
            className={`flex w-[146px] flex-none flex-col gap-px rounded-[7px] border bg-white px-2.5 py-[7px] text-left
              ${aba === a.id ? 'border-[#1d3a5f] bg-[#f3f6fa] shadow-[inset_0_0_0_1px_#1d3a5f]' : 'border-[#dfe4ea]'}
              ${a.desabilitada ? 'cursor-default opacity-50' : 'cursor-pointer'}`}>
            <span className="flex items-center gap-[5px] whitespace-nowrap text-[10px] text-[#5b6676]">
              {a.cor && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: a.cor }} />}{a.rotulo}
            </span>
            <span className="whitespace-nowrap text-[15px] font-semibold">{a.valor}</span>
            <span className="whitespace-nowrap text-[10px] text-[#5b6676]">{a.sub}</span>
          </button>
        ))}
      </div>

      {dados.erro && <div className="text-[11px] text-[#b42318]">{dados.erro}</div>}

      {aba === 'fazenda' && (
        <>
          <Card titulo="Uso da área" nota={`donut: ${mesAno(anoMes)} · colunas: % da área mês a mês`}>
            <UsoDaArea
              partes={GRUPOS_ATIVIDADE.filter(k => k !== 'cana' && (k !== 'silvicultura' || g.silvicultura.areaHa > 0))
                .map(k => ({ chave: k, rotulo: ROTULO_GRUPO[k], areaHa: g[k].areaHa, cor: COR_GRUPO[k] }))}
              colunas={colFazenda} cores={COR_GRUPO} mesSel={anoMes} rotuloDonut={`Uso da área ${mesAno(anoMes)}`} />
          </Card>
          <Card titulo="Por atividade" nota="vedado conta na pecuária">
            <TabelaPorAtividade resumo={resumo} totalCab={total.cab} totalPeso={total.pesoMedio} totalLotacao={total.lotacao} />
            <LinhaDivergencia divergencia={divergencia} somaFases={g.pecuaria.cab} totalCab={total.cab} />
          </Card>
        </>
      )}

      {aba === 'pecuaria' && (
        <AbaPecuaria
          rotuloMes={mesAno(anoMes).replace(/\/20(\d\d)$/, '/$1')} anoMes={anoMes}
          areaPecuariaHa={g.pecuaria.areaHa} porFase={porFase}
          areaPorFase={FASES_PECUARIA.map(f => ({ chave: f, rotulo: ROTULO_FASE[f], valor: g.pecuaria.filhas.find(x => x.chave === f)?.areaHa ?? 0 }))}
          areaPorFaseTotal={g.pecuaria.areaHa}
          colunasArea={colPecuaria} colunasCabecas={colCabecas}
          linhasRebanho={linhasDoRebanho(rebanho)} naoFecha={rebanho.naoFecha} foraVendaGeral={rebanho.foraVendaGeral}
          rapidos={numerosRapidos(rebanho)} erroReceitas={dados.erroReceitas} />
      )}

      {aba === 'agricultura' && (
        <Card titulo="Área da agricultura por cultura" nota={mesAno(anoMes)}>
          <UsoDaArea partes={g.agricultura.filhas.filter(f => f.areas > 0).map((f, i) => ({ chave: f.chave, rotulo: f.rotulo, areaHa: f.areaHa, cor: CORES_CULTURA[i % CORES_CULTURA.length] }))}
            rotuloDonut={`Agricultura ${mesAno(anoMes)}`} />
        </Card>
      )}

      {aba === 'nao_produtiva' && (
        <Card titulo="Área não produtiva por tipo" nota={mesAno(anoMes)}>
          <UsoDaArea partes={g.nao_produtiva.filhas.map(f => ({ chave: f.chave, rotulo: f.rotulo, areaHa: f.areaHa, cor: COR_NAO_PRODUTIVA[f.chave] ?? '#5f6b78' }))}
            rotuloDonut={`Não produtiva ${mesAno(anoMes)}`} />
        </Card>
      )}
    </div>
  );
}

/* ── Pecas ──────────────────────────────────────────────────────────────────────────────────────── */

function Card({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#dfe4ea] bg-white px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="m-0 whitespace-nowrap text-[12px] font-semibold">{titulo}</h2>
        {nota && <span className="whitespace-nowrap text-[10px] text-[#5b6676]">{nota}</span>}
      </div>
      {children}
    </div>
  );
}

interface FatiaDonut { chave: string; rotulo: string; areaHa: number; cor: string }

/** Donut + legenda (+ divisor + colunas, quando vierem). Linha so': o grafico desce para baixo do donut se nao couber. */
function UsoDaArea({ partes, colunas, cores, mesSel, rotuloDonut }: {
  partes: FatiaDonut[]; colunas?: ColunaDoMes[]; cores?: Record<string, string>; mesSel?: string; rotuloDonut: string;
}) {
  const totalHa = partes.reduce((s, p) => s + p.areaHa, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Donut partes={partes} totalHa={totalHa} rotulo={rotuloDonut} />
      <div className="flex flex-none flex-col gap-1.5 text-[11px]" data-testid="legenda-donut">
        {partes.map(p => (
          <div key={p.chave} className="grid items-center whitespace-nowrap" style={{ gridTemplateColumns: '12px 92px 72px 54px' }}>
            <i className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: p.cor }} />
            <span>{p.rotulo}</span>
            <span className="text-right text-[#5b6676]">{ha(p.areaHa)}</span>
            <span className="text-right text-[13px] font-bold">{pct(totalHa > 0 ? (p.areaHa / totalHa) * 100 : 0)}</span>
          </div>
        ))}
      </div>
      {colunas && cores && mesSel && (
        <>
          {/* o divisor e' a borda do proprio grafico: quando ele desce para baixo do donut, nao sobra um filete solto */}
          <div className="flex-none border-l border-[#e3e8ee] pl-4"><ColunasEmpilhadas colunas={colunas} cores={cores} mesSel={mesSel} /></div>
        </>
      )}
    </div>
  );
}

function Donut({ partes, totalHa, rotulo }: { partes: FatiaDonut[]; totalHa: number; rotulo: string }) {
  const C = 2 * Math.PI * 60;
  let acc = 0;
  return (
    <svg width={128} height={128} viewBox="0 0 170 170" className="flex-none" role="img"
      aria-label={`${rotulo}: ${partes.map(p => `${p.rotulo} ${pct(totalHa > 0 ? (p.areaHa / totalHa) * 100 : 0)}`).join(', ')}`}>
      <g transform="rotate(-90 85 85)">
        {totalHa > 0 ? partes.filter(p => p.areaHa > 0).map(p => {
          const len = (p.areaHa / totalHa) * C;
          const el = (
            <circle key={p.chave} cx={85} cy={85} r={60} fill="none" stroke={p.cor} strokeWidth={28}
              strokeDasharray={`${len} ${C}`} strokeDashoffset={-acc} className="cursor-pointer">
              <title>{`${p.rotulo} · ${formatNum(p.areaHa, 1)} ha · ${formatNum((p.areaHa / totalHa) * 100, 1)} %`}</title>
            </circle>
          );
          acc += len;
          return el;
        }) : <circle cx={85} cy={85} r={60} fill="none" stroke="#e3e8ee" strokeWidth={28} />}
      </g>
      <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={700} fill="#1b2533">{formatNum(totalHa, 1)}</text>
      <text x={85} y={102} textAnchor="middle" fontSize={11} fill="#5b6676">ha</text>
    </svg>
  );
}

/** 100% empilhadas, Ini + 12 meses, 414 x 140 fixos (o mock). % dentro da coluna so' se couber; senao, so' o title. */
function ColunasEmpilhadas({ colunas, cores, mesSel }: { colunas: ColunaDoMes[]; cores: Record<string, string>; mesSel: string }) {
  const TOPO = 4, ALT = 114, LARG = 22, PASSO = 32;
  return (
    <svg width={414} height={140} viewBox="0 0 414 140" className="block flex-none" role="img" aria-label="% da área mês a mês"
      data-testid="colunas-area">
      {colunas.map((c, i) => {
        const x = 4 + i * PASSO;
        const rotuloMes = i === 0 ? `dez/${c.anoMes.slice(2, 4)}` : MESES_CURTOS[Number(c.anoMes.slice(5, 7)) - 1];
        if (c.semFechamento) {
          return (
            <rect key={c.anoMes} x={x + 0.5} y={TOPO + 0.5} width={LARG - 1} height={ALT - 1} fill="none" stroke="#c3cad3" strokeDasharray="3 2">
              <title>{`${rotuloMes} · sem fechamento`}</title>
            </rect>
          );
        }
        let base = TOPO + ALT;
        return (
          <g key={c.anoMes}>
            {c.partes.filter(p => p.areaHa > 0).map(p => {
              const h = (p.pct / 100) * ALT;
              base -= h;
              const cabe = h >= 10;
              return (
                <g key={p.chave}>
                  <rect x={x} y={base} width={LARG} height={h} fill={cores[p.chave] ?? '#9aa4b1'}>
                    <title>{`${p.rotulo} · ${rotuloMes} · ${formatNum(p.areaHa, 1)} ha · ${formatNum(p.pct, 1)} %`}</title>
                  </rect>
                  {cabe && (
                    <text x={x + LARG / 2} y={base + h / 2 + 2.6} fontSize={7.5} textAnchor="middle"
                      fill={p.chave === 'vedado' ? '#1b2533' : '#fff'} pointerEvents="none">{Math.round(p.pct)}</text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      <g fontSize={9} textAnchor="middle">
        {colunas.map((c, i) => {
          const sel = c.anoMes === mesSel;
          return (
            <text key={c.anoMes} x={4 + i * PASSO + LARG / 2} y={132} fill={sel ? '#1d3a5f' : '#5b6676'} fontWeight={sel ? 700 : 400}>
              {i === 0 ? 'Ini' : LETRA_MES[Number(c.anoMes.slice(5, 7)) - 1]}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

/* ⚠ O ALINHAMENTO E O RECUO MORAM SO' NA CONSTANTE: `text-left` depois de um `text-right` na mesma classe NAO vence (a ordem
   que vale e' a do CSS do Tailwind, nao a do atributo) — a primeira coluna saiu a' direita na primeira medida. */
const TH0 = 'whitespace-nowrap border-b border-[#dfe4ea] bg-[#f7f9fb] px-2 py-[3px] text-[9px] font-semibold text-[#5b6676]';
const TH = `${TH0} text-right`;
const TH_L = `${TH0} text-left`;
const TD0 = 'whitespace-nowrap border-b border-[#eef1f4] py-[3px] text-[10px]';
const TD = `${TD0} px-2 text-right`;
const TD_L = `${TD0} px-2 text-left`;
const TD_RECUO = `${TD0} pl-[22px] pr-2 text-left`;
const VAZIO = <span className="text-[#b0b8c2]">—</span>;

function TabelaPorAtividade({ resumo, totalCab, totalPeso, totalLotacao }: {
  resumo: ReturnType<typeof montarResumoDoMes>; totalCab: number | null; totalPeso: number | null; totalLotacao: number | null;
}) {
  const t = resumo.totalAreaHa;
  const p = (a: number) => pct(t > 0 ? (a / t) * 100 : 0);
  const filha = (f: ParteDoResumo, gado: boolean) => {
    const i = indicadoresDaParte(f);
    return (
      <tr key={f.chave} className="text-[#6b7684]">
        <td className={`${TD_RECUO}`}>{f.chave === 'vedado' ? 'Vedado · pousio' : f.rotulo}</td>
        <td className={TD}>{f.areas}</td><td className={TD}>{formatNum(f.areaHa, 1)}</td><td className={TD}>{p(f.areaHa)}</td>
        <td className={TD}>{gado ? formatNum(f.cab) : VAZIO}</td>
        <td className={TD}>{gado && i.pesoMedio != null ? formatNum(i.pesoMedio, 1) : VAZIO}</td>
        <td className={TD}>{gado && i.lotacao != null ? formatNum(i.lotacao, 2) : VAZIO}</td>
      </tr>
    );
  };
  const grupo = (k: GrupoAtividade, gado: boolean) => {
    const gr = resumo.grupos[k];
    if (gr.areas === 0) return null;
    const G = 'border-b border-[#d3dce7] bg-[#e8eef5] py-1.5 text-[13px] font-semibold text-[#1b2533]';
    return [
      <tr key={k}>
        <td className={`${TD_L} ${G}`}>{ROTULO_GRUPO[k]}</td>
        <td className={`${TD} ${G}`}>{gr.areas}</td><td className={`${TD} ${G}`}>{formatNum(gr.areaHa, 1)}</td><td className={`${TD} ${G}`}>{p(gr.areaHa)}</td>
        <td className={`${TD} ${G}`}>{gado && totalCab != null ? formatNum(totalCab) : VAZIO}</td>
        <td className={`${TD} ${G}`}>{gado && totalPeso != null ? formatNum(totalPeso, 1) : VAZIO}</td>
        <td className={`${TD} ${G}`}>{gado && totalLotacao != null ? formatNum(totalLotacao, 2) : VAZIO}</td>
      </tr>,
      ...gr.filhas.filter(f => f.areas > 0).map(f => filha(f, gado)),
    ];
  };
  const np = resumo.grupos.nao_produtiva;
  const NP = 'bg-[#5f6b78] py-1.5 text-[12px] font-medium text-white';
  const NPC = 'bg-[#eceff2] text-[#6b7684]';
  const TOT = 'border-t border-[#cfd6df] bg-[#f7f9fb] py-1.5 text-[13px] font-bold text-[#1b2533]';
  const uaHaFazenda = totalCab != null && totalPeso != null && t > 0 ? calcUA(totalCab, totalPeso) / t : null;
  return (
    <table className="w-full border-collapse" data-testid="tabela-por-atividade">
      <thead><tr>
        <th className={TH_L}>Atividade</th><th className={TH}>Áreas</th><th className={TH}>Área ha</th>
        <th className={TH}>% área</th><th className={TH}>Cab</th><th className={TH}>Peso kg</th><th className={TH}>UA/ha</th>
      </tr></thead>
      <tbody>
        {grupo('pecuaria', true)}
        {grupo('agricultura', false)}
        {grupo('silvicultura', false)}
        {np.areas > 0 && [
          <tr key="np">
            <td className={`${TD_L} ${NP}`}>Não produtiva</td><td className={`${TD} ${NP}`}>{np.areas}</td>
            <td className={`${TD} ${NP}`}>{formatNum(np.areaHa, 1)}</td><td className={`${TD} ${NP}`}>{p(np.areaHa)}</td>
            <td className={`${TD} ${NP}`} /><td className={`${TD} ${NP}`} /><td className={`${TD} ${NP}`} />
          </tr>,
          ...np.filhas.filter(f => f.areas > 0).map(f => (
            <tr key={`np-${f.chave}`}>
              <td className={`${TD_RECUO} ${NPC}`}>{f.rotulo}</td><td className={`${TD} ${NPC}`}>{f.areas}</td>
              <td className={`${TD} ${NPC}`}>{formatNum(f.areaHa, 1)}</td><td className={`${TD} ${NPC}`}>{p(f.areaHa)}</td>
              <td className={`${TD} ${NPC}`} /><td className={`${TD} ${NPC}`} /><td className={`${TD} ${NPC}`} />
            </tr>
          )),
        ]}
        {resumo.semFechamento.areas > 0 && (
          <tr className="text-[#8a5a00]" data-testid="linha-sem-fechamento">
            <td className={TD_L}>Sem fechamento no mês</td><td className={TD}>{resumo.semFechamento.areas}</td>
            <td className={TD}>{formatNum(resumo.semFechamento.areaHa, 1)}</td><td className={TD}>fora do total</td>
            <td className={TD} /><td className={TD} /><td className={TD} />
          </tr>
        )}
        <tr>
          <td className={`${TD_L} ${TOT}`}>Fazenda</td><td className={`${TD} ${TOT}`}>{resumo.totalAreas}</td>
          <td className={`${TD} ${TOT}`}>{formatNum(t, 1)}</td><td className={`${TD} ${TOT}`}>{pct(t > 0 ? 100 : null)}</td>
          <td className={`${TD} ${TOT}`}>{totalCab != null ? formatNum(totalCab) : VAZIO}</td>
          <td className={`${TD} ${TOT}`}>{totalPeso != null ? formatNum(totalPeso, 1) : VAZIO}</td>
          <td className={`${TD} ${TOT}`}>{uaHaFazenda != null ? formatNum(uaHaFazenda, 2) : VAZIO}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** A soma das fases contra o total do cache. Nunca ajustada: so' dita, numa linha discreta. */
function LinhaDivergencia({ divergencia, somaFases, totalCab }: { divergencia: number | null; somaFases: number; totalCab: number | null }) {
  if (divergencia == null || divergencia === 0 || totalCab == null) return null;
  return (
    <div className="mt-1.5 whitespace-nowrap text-[10px] text-[#8a5a00]" data-testid="linha-divergencia"
      title="Gado lançado em card de pasto sem atividade (ex.: pasto de divergência, 0 ha) — não é ajustado">
      divergência: soma das fases {formatNum(somaFases)} cab · total do rebanho {formatNum(totalCab)} cab ·
      {' '}<span className={divergencia < 0 ? 'text-[#b42318]' : ''}>{divergencia > 0 ? '+' : '−'}{formatNum(Math.abs(divergencia))} cab</span>
    </div>
  );
}
