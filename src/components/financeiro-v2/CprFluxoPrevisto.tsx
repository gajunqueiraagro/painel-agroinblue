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
import { useMemo } from 'react';
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
function TickEixoX({ x, y, payload, mapa, mostrarDia }: {
  x?: number; y?: number; payload?: { value?: string | number };
  mapa: Map<string, PontoFluxo>; mostrarDia: boolean;
}) {
  const rotulo = String(payload?.value ?? '');
  const ponto = mapa.get(rotulo);
  const cx = x ?? 0;
  const cy = y ?? 0;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {mostrarDia && (
        <text x={0} y={0} dy={11} textAnchor="middle" fill={COR_TEXTO} fontSize={11}>
          {rotulo}
        </text>
      )}
      {ponto?.abreFaixa && ponto.faixa && (
        <>
          <line x1={0} y1={2} x2={0} y2={30} stroke={COR_TEXTO} strokeWidth={1} opacity={0.5} />
          <text x={4} y={0} dy={27} textAnchor="start" fill={COR_TEXTO} fontSize={12} fontWeight={700}>
            {ponto.faixa}
          </text>
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
  const { pontos, semVencimento, rebaixada } = fluxo;
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
  const marcos = useMemo(() => {
    if (pontos.length === 0) return new Set<string>();
    const saldos = pontos.map((p) => p.saldo);
    const maior = pontos[saldos.indexOf(Math.max(...saldos))];
    const menor = pontos[saldos.indexOf(Math.min(...saldos))];
    return new Set([
      pontos[0].chave, pontos[pontos.length - 1].chave,
      maior.chave, menor.chave, ...(negativo ? [negativo.chave] : []),
    ]);
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
    return (
      <div className="flex h-full items-center justify-center px-3 py-10">
        <p className="text-center text-[11px] text-muted-foreground">
          Nenhum compromisso neste período — não há fluxo a projetar.
        </p>
      </div>
    );
  }

  const inicial = pontos[0];
  const final = pontos[pontos.length - 1];
  /* ⚠ A ÁREA TROCA DE COR NO ZERO, e o offset é a posição do zero DENTRO do domínio — não 50%.
     Um gradiente fixo pintaria de vermelho um trecho positivo assim que a escala mudasse. */
  const offsetZero = escala.dominio[1] / (escala.dominio[1] - escala.dominio[0]);

  /* Um rótulo de dia a cada N, para não colarem. No mensal todos cabem. */
  const intervaloX = fluxo.granularidade === 'dia'
    ? Math.max(0, Math.ceil(pontos.length / 26) - 1)
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg" style={{ background: COR_CREME }}>
      <div className="shrink-0 px-4 pt-3">
        <h2 className="text-[17px] font-semibold leading-none" style={{ color: COR_TEXTO }}>
          Fluxo de caixa previsto
        </h2>
        {/* ⚠ O CAVEAT DO SALDO VEM INTEIRO, e ganha o seu próprio: o gráfico parte de um saldo
            conciliado até certa data E assume que todo compromisso cai no vencimento. */}
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {caveat ? `${caveat} · ` : ''}previsto: assume que tudo cai no vencimento
          {semVencimento > 0 && ` · ${semVencimento} sem vencimento, fora do gráfico`}
          {rebaixada && ' · período longo demais para o detalhe diário: agrupado por mês'}
        </p>
      </div>

      <div className="min-h-0 flex-1 px-1 pb-1 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 22, right: 96, bottom: 26, left: 8 }}>
            <defs>
              <linearGradient id="cpr-area-saldo" x1="0" y1="0" x2="0" y2="1">
                <stop offset={offsetZero} stopColor={COR_SALDO} stopOpacity={0.14} />
                <stop offset={offsetZero} stopColor={COR_SAIDA} stopOpacity={0.14} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#ded6c9" vertical={false} />
            <XAxis dataKey="rotulo" interval={intervaloX} height={34} tickLine={false}
              tick={<TickEixoX mapa={mapaPorRotulo} mostrarDia />} />
            <YAxis domain={escala.dominio} ticks={escala.ticks} width={56} tickLine={false}
              tick={{ fontSize: 12, fill: COR_TEXTO }} tickFormatter={fmtEixoY} />
            <Tooltip content={<TooltipFluxo />} cursor={{ fill: '#00000008' }} />
            <ReferenceLine y={0} stroke={COR_TEXTO} strokeWidth={1.2} />

            {/* ⚠ SEM `stackId`: entradas e saídas são barras INDEPENDENTES, uma para cima e
                outra para baixo do zero. Empilhadas, o out/26 da Vera mostrava a saída
                pendurada acima da entrada, cruzando o zero — dinheiro que sai desenhado como
                se entrasse. */}
            <Bar dataKey="entradas" name="Entradas" fill={COR_ENTRADA} maxBarSize={18} />
            <Bar dataKey="saidas" name="Saídas" fill={COR_SAIDA} maxBarSize={18} />

            {/* A área vai da linha até o ZERO — nunca o fundo inteiro do gráfico. */}
            <Area type="monotone" dataKey="saldo" baseValue={0} stroke="none"
              fill="url(#cpr-area-saldo)" isAnimationActive={false} />
            <Line type="monotone" dataKey="saldo" name="Saldo projetado"
              stroke={COR_SALDO} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: PontoFluxo; index?: number }) => {
                const p = props.payload;
                const marcado = !!p && marcos.has(p.chave);
                /* ⚠ `dot` TEM DE DEVOLVER UM ELEMENTO SVG, nunca `null`: o recharts monta a
                   lista de dots e um `null` no meio quebra a renderização. Um `<g/>` vazio é o
                   "nada" que ele aceita. */
                if (!marcado) return <g key={`v-${props.index}`} />;
                return (
                  <circle key={`m-${props.index}`} cx={props.cx} cy={props.cy} r={3.2}
                    fill={(p?.saldo ?? 0) < 0 ? COR_SAIDA : COR_SALDO} stroke="#fff" strokeWidth={1.2} />
                );
              }} />

            {/* ⚠ AS TAGS FICAM FORA DA LINHA. A de hoje sobe acima do ponto inicial; a do saldo
                final vai para a margem direita de 96px reservada no `margin` — é o "R$ 7,16"
                do painel de referência, que não disputa espaço com o traço. */}
            <ReferenceDot x={inicial.rotulo} y={inicial.saldo} r={0} isFront
              label={{ value: `hoje ${fmtTag(inicial.saldo)}`, position: 'top',
                fontSize: 11, fill: COR_TEXTO, offset: 12 }} />
            <ReferenceDot x={final.rotulo} y={final.saldo} r={3.6} isFront
              fill={final.saldo < 0 ? COR_SAIDA : COR_SALDO} stroke="#fff" strokeWidth={1.4}
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
