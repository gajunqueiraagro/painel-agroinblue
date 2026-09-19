/**
 * A visão Fluxo da CPR — PR-CPR-2B, redesenhada em PR-CPR-2B.1.
 *
 * ⚠ ELA NÃO TEM FONTE PRÓPRIA. Recebe as linhas que a Lista já carregou e o saldo que o card
 * já calculou; tudo o que faz é somar (`montarFluxoPrevisto`) e desenhar. Trocar horizonte,
 * segmento ou status muda o gráfico porque muda a Lista — não porque o gráfico escute algo.
 *
 * ⚠ recharts, NÃO SVG À MÃO: a lib já é dependência do projeto e tem 36 consumidores.
 *
 * ⚠ O TICK CUSTOMIZADO DO EIXO X É O PRIMEIRO DO REPO. O briefing supunha que o
 * `ExtratoAnaliseFluxo` já tivesse um a copiar; ele só passa `tick={{ fontSize: 9 }}`, que é
 * objeto de ESTILO. Uma varredura não achou nenhum renderizador de tick em `src/`. Este aqui
 * desenha duas linhas — o dia e a faixa do mês — e o traço vertical na virada.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  escalaSimetrica, montarFluxoPrevisto, primeiroNegativo,
  type Granularidade, type LinhaFluxoPrevisto, type PontoFluxo,
} from '@/lib/financeiro/fluxoPrevisto';

/* A paleta do painel do diesel — laranja no saldo, verde/vermelho nos movimentos. */
const COR_SALDO = '#e8952f';
const COR_ENTRADA = '#3f8f5e';
const COR_SAIDA = '#c0392b';
const COR_TEXTO = '#3a3a3a';
const COR_CREME = '#f7f3ec';
/* ⚠ AZUL NO POSITIVO, não âmbar: a área é contexto do saldo, e repetir o laranja da linha
   fazia os dois competirem. O vermelho fica reservado ao trecho abaixo do zero. */
const COR_AREA_POS = '#3b7ea1';
const COR_AREA_NEG = '#c0392b';

/** Largura mínima que um rótulo "dd/mm" ocupa sem colar no vizinho. */
const LARGURA_ROTULO_DIA = 34;

/** Eixo Y compacto: 1,2 mi · 400k · 0. */
function fmtEixoY(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sinal}${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `${sinal}${Math.round(abs / 1000)}k`;
  return String(Math.round(v));
}

/** Tag de valor: milhar sempre, milhão abreviado quando o número é grande. */
function fmtTag(v: number): string {
  if (Math.abs(v) >= 1_000_000) {
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  }
  return formatMoeda(v);
}

/**
 * O TICK DE DUAS LINHAS — dia em cima, faixa de mês embaixo.
 *
 * ⚠ O TRAÇO VERTICAL SÓ APARECE NA VIRADA (`abreFaixa`), e o nome do mês também: repetir
 * "set/26" sob cada dia encheria a base do gráfico com a mesma palavra trinta vezes. A faixa
 * é uma régua, não um rótulo por coluna.
 */
function TickEixoX({ x, y, payload, index, pontos, passoRotulo, faixaCabe }: {
  x?: number; y?: number; payload?: { value?: string | number }; index?: number;
  pontos: readonly PontoFluxo[]; passoRotulo: number;
  faixaCabe: (faixa: string) => boolean;
}) {
  const i = index ?? 0;
  const ponto = pontos[i];
  const ultimo = pontos.length - 1;
  const cx = x ?? 0;
  const cy = y ?? 0;

  /**
   * ⚠ QUEM DECIDE SE O RÓTULO APARECE É A POSIÇÃO, não o `interval` do recharts — e essa é a
   * correção do PR. Com `interval={K}` o recharts não renderiza o tick inteiro dos índices
   * pulados, e junto com o rótulo sumia a FAIXA DE MÊS daquele ponto: era por isso que só
   * aparecia "nov", o único mês cuja virada calhava de cair num múltiplo do intervalo. Agora
   * `interval={0}` renderiza todos os ticks e este componente decide o que desenhar em cada
   * um — o dia pula, a faixa nunca.
   * ⚠ O PRIMEIRO E O ÚLTIMO SEMPRE SAEM: o primeiro é "Hoje" (a âncora da tag de partida) e o
   * último ancora a tag do saldo final. O penúltimo candidato some se estiver perto demais do
   * último, senão os dois colam.
   */
  const perigoDeColar = ultimo - i < passoRotulo * 0.6;
  const mostraDia = i === 0 || i === ultimo || (i % passoRotulo === 0 && !perigoDeColar);

  return (
    <g transform={`translate(${cx},${cy})`}>
      {mostraDia && (
        <text x={0} y={0} dy={11} textAnchor={i === 0 ? 'start' : 'middle'}
          fill={COR_TEXTO} fontSize={11}>
          {ponto?.rotulo ?? String(payload?.value ?? '')}
        </text>
      )}
      {/* ⚠ O TRAÇO DA VIRADA COMEÇA ABAIXO DA LINHA DOS DIAS (y=17), nunca em y=2: subindo até
          o topo ele cruzava o rótulo do dia que calhasse de cair no primeiro do mês. A faixa é
          uma segunda régua, e mora na sua própria faixa horizontal. */}
      {ponto?.abreFaixa && ponto.faixa && (
        <>
          <line x1={0} y1={17} x2={0} y2={32} stroke={COR_TEXTO} strokeWidth={1} opacity={0.45} />
          {faixaCabe(ponto.faixa) && (
            <text x={4} y={0} dy={29} textAnchor="start"
              fill={COR_TEXTO} fontSize={12} fontWeight={700}>
              {ponto.faixa}
            </text>
          )}
        </>
      )}
    </g>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string }[];
}

function TooltipFluxo({ active, label, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const achar = (k: string) => {
    const p = payload.find((x) => x.dataKey === k);
    return typeof p?.value === 'number' ? p.value : 0;
  };
  const entradas = achar('entradas');
  const saidas = achar('saidas');
  const saldo = achar('saldo');
  return (
    <div className="rounded-md border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
      <div className="text-[10px] font-medium text-foreground">{label}</div>
      {entradas > 0 && (
        <div className="text-[10px] tabular-nums" style={{ color: COR_ENTRADA }}>
          entra {formatMoeda(entradas)}
        </div>
      )}
      {saidas < 0 && (
        <div className="text-[10px] tabular-nums" style={{ color: COR_SAIDA }}>
          sai {formatMoeda(Math.abs(saidas))}
        </div>
      )}
      <div className="mt-0.5 text-[11px] font-medium tabular-nums" style={{ color: COR_SALDO }}>
        saldo {formatMoeda(saldo)}
      </div>
    </div>
  );
}

export function CprFluxoPrevisto({ linhas, saldoInicial, caveat, granularidade, hoje }: {
  linhas: readonly LinhaFluxoPrevisto[];
  /** O mesmo "Saldo em caixa (estimado)" do card. `null` quando não há âncora. */
  saldoInicial: number | null;
  /** O rótulo de conciliação do card, herdado inteiro. */
  caveat: string | null;
  /** 'dia' nos horizontes curtos, 'mes' no "Tudo". A lib rebaixa sozinha se o span for grande. */
  granularidade: Granularidade;
  /** Hoje em ISO local — a série diária precisa dele para começar no dia certo. */
  hoje: string;
}) {
  const fluxo = useMemo(
    () => montarFluxoPrevisto(linhas, saldoInicial ?? 0, { granularidade, hoje }),
    [linhas, saldoInicial, granularidade, hoje]);
  const { pontos, semVencimento, rebaixada, anteriores } = fluxo;

  /**
   * A largura medida do gráfico — é dela que sai o espaçamento dos rótulos.
   *
   * ⚠ MEDIR É O ÚNICO CAMINHO HONESTO. O `interval` do recharts é um número de índices, e
   * quantos rótulos cabem depende de PIXELS: 90 dias num painel estreito e num largo pedem
   * saltos diferentes. Um `interval` fixo acerta numa largura e cola os rótulos em todas as
   * outras. O `ResizeObserver` dá a largura real e o salto se recalcula sozinho.
   */
  const refPlot = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = refPlot.current;
    if (!el) return;
    const obs = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width ?? 0;
      setLargura(w);
    });
    obs.observe(el);
    setLargura(el.clientWidth);
    return () => obs.disconnect();
  }, []);
  const negativo = useMemo(() => primeiroNegativo(pontos), [pontos]);
  const escala = useMemo(() => escalaSimetrica(pontos), [pontos]);
  const mapaPorRotulo = useMemo(
    () => new Map(pontos.map((p) => [p.rotulo, p])), [pontos]);

  /**
   * OS MARCOS — os únicos pontos que ganham bolinha.
   *
   * ⚠ UM PONTO POR DIA numa série de 90 dias vira um colar, e o olho perde exatamente o que a
   * bolinha deveria destacar. Marcam-se o início, o fim, o maior, o menor e a virada de sinal.
   */
  const marcos = useMemo((): PontoFluxo[] => {
    if (pontos.length === 0) return [];
    const saldos = pontos.map((p) => p.saldo);
    const candidatos = [
      pontos[0], pontos[pontos.length - 1],
      pontos[saldos.indexOf(Math.max(...saldos))],
      pontos[saldos.indexOf(Math.min(...saldos))],
      ...(negativo ? [negativo] : []),
    ];
    /* Um ponto pode ser dois marcos ao mesmo tempo (o fim costuma ser o menor); dedup pela
       chave para não desenhar a bolinha duas vezes no mesmo lugar. */
    const vistos = new Set<string>();
    return candidatos.filter((p) => !vistos.has(p.chave) && vistos.add(p.chave));
  }, [pontos, negativo]);

  if (saldoInicial === null) {
    return (
      <div className="flex h-full items-center justify-center px-3 py-10">
        <p className="text-center text-[11px] text-muted-foreground">
          Sem saldo conciliado de partida — o fluxo previsto não tem de onde começar.
        </p>
      </div>
    );
  }
  if (pontos.length <= 1) {
    /* ⚠ "SÓ VENCIDOS" É UM VAZIO DIFERENTE de "nada a pagar", e dizer qual é dos dois evita que
       o operador ache que o gráfico quebrou ao clicar em Vencidos. */
    return (
      <div className="flex h-full items-center justify-center px-3 py-10">
        <p className="max-w-sm text-center text-[11px] text-muted-foreground">
          {anteriores > 0
            ? `Nada a vencer daqui em diante. ${anteriores} compromisso${anteriores > 1 ? 's' : ''} já vencido${anteriores > 1 ? 's' : ''} ${anteriores > 1 ? 'aparecem' : 'aparece'} na Lista.`
            : 'Nenhum compromisso neste período — não há fluxo a projetar.'}
        </p>
      </div>
    );
  }

  const inicial = pontos[0];
  const final = pontos[pontos.length - 1];

  const MARGEM_ESQ = 8;
  const MARGEM_DIR = 96;
  const LARGURA_EIXO_Y = 56;
  const larguraPlot = Math.max(0, largura - MARGEM_ESQ - MARGEM_DIR - LARGURA_EIXO_Y);
  const cabemRotulos = Math.max(2, Math.floor(larguraPlot / LARGURA_ROTULO_DIA));
  const passoRotulo = Math.max(1, Math.ceil(pontos.length / cabemRotulos));

  /* Quantos pontos cada faixa tem — um mês estreito demais ganha só o traço, sem o nome. */
  const larguraPorPonto = pontos.length > 1 ? larguraPlot / (pontos.length - 1) : larguraPlot;
  const pontosPorFaixa = new Map<string, number>();
  for (const p of pontos) {
    if (!p.faixa) continue;
    pontosPorFaixa.set(p.faixa, (pontosPorFaixa.get(p.faixa) ?? 0) + 1);
  }
  const faixaCabe = (faixa: string) =>
    (pontosPorFaixa.get(faixa) ?? 0) * larguraPorPonto >= 30;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg" style={{ background: COR_CREME }}>
      <div className="shrink-0 px-4 pt-3">
        <h2 className="text-[17px] font-semibold leading-none" style={{ color: COR_TEXTO }}>
          Fluxo de caixa previsto
        </h2>
        {/* ⚠ O CAVEAT DO SALDO VEM INTEIRO, e ganha o seu próprio: o gráfico parte de um saldo
            conciliado até certa data E assume que todo compromisso cai no vencimento. */}
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {caveat ? `${caveat} · ` : ''}de hoje em diante, assumindo que tudo cai no vencimento
          {anteriores > 0 && ` · ${anteriores} já vencido${anteriores > 1 ? 's' : ''}, fora da projeção`}
          {semVencimento > 0 && ` · ${semVencimento} sem vencimento, fora do gráfico`}
          {rebaixada && ' · período longo demais para o detalhe diário: agrupado por mês'}
        </p>
      </div>

      <div ref={refPlot} className="min-h-0 flex-1 px-1 pb-1 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos}
            margin={{ top: 22, right: MARGEM_DIR, bottom: 30, left: MARGEM_ESQ }}>

            <CartesianGrid strokeDasharray="3 3" stroke="#ded6c9" vertical={false} />
            {/* ⚠ `interval={0}` — todos os ticks são RENDERIZADOS e o tick decide o que
                desenhar. Ver a nota em `TickEixoX`: era o `interval` numérico que apagava a
                faixa de mês junto com o rótulo do dia. */}
            <XAxis dataKey="rotulo" interval={0} height={38} tickLine={false}
              tick={<TickEixoX pontos={pontos} passoRotulo={passoRotulo} faixaCabe={faixaCabe} />} />
            <YAxis domain={escala.dominio} ticks={escala.ticks} width={LARGURA_EIXO_Y}
              tickLine={false} tick={{ fontSize: 12, fill: COR_TEXTO }} tickFormatter={fmtEixoY} />
            <Tooltip content={<TooltipFluxo />} cursor={{ fill: '#00000008' }} />
            <ReferenceLine y={0} stroke={COR_TEXTO} strokeWidth={1.2} />

            {/* ⚠ SEM `stackId`: entradas e saídas são barras INDEPENDENTES, uma para cima e
                outra para baixo do zero. Empilhadas, o out/26 da Vera mostrava a saída
                pendurada acima da entrada, cruzando o zero — dinheiro que sai desenhado como
                se entrasse. */}
            <Bar dataKey="entradas" name="Entradas" fill={COR_ENTRADA} maxBarSize={18} />
            <Bar dataKey="saidas" name="Saídas" fill={COR_SAIDA} maxBarSize={18} />

            {/* ⚠ DUAS ÁREAS, UMA POR SINAL — e nenhum gradiente. Cada uma vai da sua metade do
                saldo até o zero, então onde a linha é positiva só a azul tem altura e onde é
                negativa só a vermelha. No cruzamento as duas valem zero e a cor troca no
                ponto, por construção. A técnica anterior (uma área com gradiente cortado na
                altura do zero) pintava por REGIÃO do plot e não pela linha — ver a nota em
                `PontoFluxo.saldoPos`. */}
            <Area type="monotone" dataKey="saldoPos" baseValue={0} stroke="none"
              fill={COR_AREA_POS} fillOpacity={0.1} isAnimationActive={false} legendType="none" />
            <Area type="monotone" dataKey="saldoNeg" baseValue={0} stroke="none"
              fill={COR_AREA_NEG} fillOpacity={0.12} isAnimationActive={false} legendType="none" />

            {/* ⚠ `dot={false}` E OS MARCOS COMO `ReferenceDot`: a função em `dot` precisa
                devolver um elemento para TODOS os pontos, e nos 90 dias isso são 90 nós só
                para esconder 85. Com `isFront` os cinco marcos ainda ficam por cima da área e
                da linha, que é onde têm de estar. */}
            <Line type="monotone" dataKey="saldo" name="Saldo projetado"
              stroke={COR_SALDO} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              dot={false} isAnimationActive={false} />

            {marcos.map((m) => (
              <ReferenceDot key={`marco-${m.chave}`} x={m.rotulo} y={m.saldo} r={3.2} isFront
                fill={m.saldo < 0 ? COR_SAIDA : COR_SALDO} stroke="#fff" strokeWidth={1.2} />
            ))}

            {/* ⚠ AS TAGS FICAM FORA DA LINHA. A de hoje sobe acima do ponto inicial; a do saldo
                final vai para a margem direita reservada no `margin` — é o valor do painel de
                referência, que não disputa espaço com o traço. */}
            <ReferenceDot x={inicial.rotulo} y={inicial.saldo} r={0} isFront
              label={{ value: `hoje ${fmtTag(inicial.saldo)}`, position: 'top',
                fontSize: 11, fill: COR_TEXTO, offset: 12 }} />
            <ReferenceDot x={final.rotulo} y={final.saldo} r={0} isFront
              label={{ value: fmtTag(final.saldo), position: 'right', offset: 10,
                fontSize: 13, fontWeight: 600,
                fill: final.saldo < 0 ? COR_SAIDA : COR_TEXTO }} />
            <ReferenceDot x={final.rotulo} y={final.saldo} r={0} isFront
              label={{ value: final.rotulo, position: 'right', offset: 10, dy: 15,
                fontSize: 11, fill: COR_TEXTO }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
