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
  ajusteVencidoPorDia, combinarComPassado, escalaSimetrica, faixasSemColisao,
  larguraEstimada, montarFluxoPrevisto, primeiroNegativo,
  type Granularidade, type LinhaFluxoPrevisto, type PontoLinha, type PontoPassadoEntrada,
  type ZonaFluxo,
} from '@/lib/financeiro/fluxoPrevisto';

/* A paleta do painel do diesel — laranja no saldo, verde/vermelho nos movimentos. */
const COR_SALDO = '#e8952f';
/* As três zonas de tempo — PR-CPR-2B.3. */
const COR_CONCILIADO = '#3f8f5e';
const COR_REALIZADO = '#3b7ea1';

function corDaZona(zona: ZonaFluxo): string {
  if (zona === 'conciliado') return COR_CONCILIADO;
  /* Vencido e realizado partilham a cor: são o mesmo tempo, com certezas diferentes. */
  if (zona === 'realizado' || zona === 'vencido') return COR_REALIZADO;
  return COR_SALDO;
}
const COR_ENTRADA = '#3f8f5e';
const COR_SAIDA = '#c0392b';
const COR_TEXTO = '#3a3a3a';
const COR_CREME = '#f7f3ec';
/* ⚠ AZUL NO POSITIVO, não âmbar: a área é contexto do saldo, e repetir o laranja da linha
   fazia os dois competirem. O vermelho fica reservado ao trecho abaixo do zero. */
const COR_AREA_POS = '#3b7ea1';
const COR_AREA_NEG = '#c0392b';

/**
 * A régua vertical dos rótulos do topo — PR-CPR-FLUXO-LABEL-ANTICOLISAO-01.
 *
 * `OFFSET_ROTULO` é onde um rótulo fica quando não disputa espaço com ninguém; `ALTURA_FAIXA`
 * é o degrau que ele sobe a cada colisão. 18px cabe uma linha de 12px com respiro — menos que
 * isso e o rótulo de cima encosta no de baixo, que é o problema que se está resolvendo.
 */
const OFFSET_ROTULO = 15;
const ALTURA_FAIXA = 18;

/** Largura mínima que um rótulo "dd/mm" ocupa sem colar no vizinho. */
const LARGURA_ROTULO_DIA = 34;

/**
 * Escala curta — "1,83 mi", "462 mil", "0".
 *
 * ⚠ NUNCA O NÚMERO CHEIO NO EIXO: "1.832.544,83" repetido em sete linhas de grade rouba a
 * largura do gráfico e não acrescenta precisão nenhuma — quem quer o centavo lê a tag ou o
 * tooltip. E "mil" por extenso em vez de "k": o painel é para o produtor, não para o mercado.
 */
function fmtCurto(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sinal}${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  }
  if (abs >= 1000) return `${sinal}${Math.round(abs / 1000)} mil`;
  return String(Math.round(v));
}

/** Tag de valor: mesma escala curta, com o cifrão. */
function fmtTag(v: number): string {
  return `R$ ${fmtCurto(v)}`;
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
  pontos: readonly PontoLinha[]; passoRotulo: number;
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
      {/* ⚠ SÓ O DIA, SEM O MÊS: o mês já está na faixa logo abaixo, e "01/08" repetido em
          vinte colunas polui sem informar. "Hoje" continua escrito por extenso. */}
      {mostraDia && (
        <text x={0} y={0} dy={11} textAnchor={i === 0 ? 'start' : 'middle'}
          fill={COR_TEXTO} fontSize={9.5}>
          {ponto?.rotulo === 'Hoje' ? 'Hoje' : (ponto?.rotulo ?? '').slice(0, 2)}
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

/**
 * UM RÓTULO DO TOPO, COM O TRAÇO QUE O LIGA AO PONTO.
 *
 * ⚠ O TRAÇO SÓ APARECE QUANDO O RÓTULO SOBE. Na posição natural ele estaria colado ao ponto e
 * seria ruído; deslocado, sem o traço, o número perde o dono — num gráfico de oitenta pontos,
 * um valor solto no ar não diz a que dia pertence.
 * ⚠ E ELE TEM A COR DA SÉRIE daquele ponto (verde no conciliado, azul no realizado, laranja no
 * previsto): é o mesmo recurso que faz o rótulo pertencer a um trecho, e não ao gráfico inteiro.
 * ⚠ `label` COMO FUNÇÃO É O QUE O RECHARTS 2.15.4 OFERECE — `ImplicitLabelType` aceita
 * `(props) => ReactElement<SVGElement>` e entrega o `viewBox` do ponto ancorado. Nenhuma camada
 * SVG por cima do gráfico: o traço e o texto são filhos do próprio `ReferenceDot`.
 */
function RotuloDoTopo({ viewBox, texto, cor, tamanho, peso, faixa }: {
  viewBox?: { x?: number; y?: number };
  texto: string; cor: string; tamanho: number; peso?: number; faixa: number;
}) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const yTexto = y - OFFSET_ROTULO - faixa * ALTURA_FAIXA;
  return (
    <g>
      {faixa > 0 && (
        <line x1={x} y1={y - 5} x2={x} y2={yTexto + 4}
          stroke={cor} strokeWidth={1} opacity={0.5} />
      )}
      <text x={x} y={yTexto} textAnchor="middle" fill={cor}
        fontSize={tamanho} fontWeight={peso}>
        {texto}
      </text>
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
  /**
   * ⚠ O SALDO VEM DA SÉRIE ATIVA, por coalescência — PR-CPR-2B.3.2. Ler um `dataKey` fixo
   * mostrava "R$ 0,00" em toda zona onde aquela série é NULA, que é a maioria dos pontos: o
   * tooltip afirmava zero sobre uma linha que estava a um milhão. Agora ele pega a primeira
   * série que tem valor naquele ponto.
   */
  const saldo = ['saldoConciliado', 'saldoRealizado', 'saldoVencido', 'saldoPrevisto', 'saldo']
    .map((k) => payload.find((x) => x.dataKey === k)?.value)
    .find((v) => typeof v === 'number') ?? 0;
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
        saldo {formatMoeda(Number(saldo))}
      </div>
    </div>
  );
}

export function CprFluxoPrevisto({
  linhas, saldoInicial, caveat, granularidade, hoje, passado, conciliadoAte,
}: {
  linhas: readonly LinhaFluxoPrevisto[];
  /** O mesmo "Saldo em caixa (estimado)" do card. `null` quando não há âncora. */
  saldoInicial: number | null;
  /** O rótulo de conciliação do card, herdado inteiro. */
  caveat: string | null;
  /** 'dia' nos horizontes curtos, 'mes' no "Tudo". A lib rebaixa sozinha se o span for grande. */
  granularidade: Granularidade;
  /** Hoje em ISO local — a série diária precisa dele para começar no dia certo. */
  hoje: string;
  /**
   * O passado, vindo de `serieDoSaldoPassado` — a MESMA cadeia que o card usa.
   * ⚠ Ele fecha no total do card por construção (há teste). Um degrau visível em "hoje" é
   * furo de conciliação no dado, nunca defeito de desenho.
   */
  passado: readonly PontoPassadoEntrada[];
  /**
   * Até onde a conciliação chegou — a mesma data do rótulo do card.
   * ⚠ Ela decide DUAS coisas: até onde a linha é verde, e a partir de quando um vencido-não-pago
   * passa a contar. Antes dela, o saldo conferido com o banco é soberano.
   */
  conciliadoAte: string | null;
}) {
  /**
   * ⚠ AS DUAS VERDADES, E CADA UMA NO SEU LUGAR — PR-CPR-2B.3.2, ajustado em 2B.3.5.
   *
   * O CARD, no topo da tela, diz quanto TEM na conta: só conciliado e realizado. A LINHA diz
   * onde o caixa estaria se tudo tivesse caído no vencimento — o card MENOS o que venceu e não
   * foi pago. As duas continuam sendo calculadas assim, e o `ajusteTotal` é o que separa uma
   * da outra.
   * ⚠ MAS O GRÁFICO NÃO DESENHA MAIS AS DUAS. Até a 2B.3.4 o ponto de hoje trazia também um
   * marcador "na conta R$ X" com o valor do card, e o efeito foi o oposto do pretendido: dois
   * números a centímetros um do outro, no mesmo ponto, convidando a uma comparação que o
   * gráfico não existe para fazer. O card já está no topo, a três centímetros dali. Aqui fica
   * um ponto só, com o valor da LINHA — que é a pergunta desta visão.
   */
  const inicioDesenho = useMemo(() => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  }, [hoje]);

  const vencidoPorDia = useMemo(
    () => ajusteVencidoPorDia(linhas, inicioDesenho, hoje, conciliadoAte),
    [linhas, inicioDesenho, hoje, conciliadoAte]);
  const ajusteTotal = useMemo(
    () => Array.from(vencidoPorDia.values()).reduce((s, v) => s + v, 0), [vencidoPorDia]);

  /* A projeção parte de onde a LINHA está em hoje — card mais o vencido —, senão haveria um
     salto artificial na junção que nada explicaria. */
  const fluxo = useMemo(
    () => montarFluxoPrevisto(linhas, (saldoInicial ?? 0) + ajusteTotal, { granularidade, hoje }),
    [linhas, saldoInicial, ajusteTotal, granularidade, hoje]);
  const { semVencimento, rebaixada, anteriores } = fluxo;
  const pontos = useMemo(
    () => combinarComPassado(fluxo, passado, hoje, vencidoPorDia),
    [fluxo, passado, hoje, vencidoPorDia]);

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
  const marcos = useMemo((): PontoLinha[] => {
    if (pontos.length === 0) return [];
    const saldos = pontos.map((p) => p.saldo);
    /* ⚠ AS VIRADAS DE ZONA SÃO MARCOS, e as mais importantes: o fim do conciliado e o "hoje"
       são os dois pontos que o operador confere contra o card e contra a Conciliação. */
    const fimConciliado = [...pontos].reverse().find((p) => p.zona === 'conciliado');
    const emHoje = pontos.find((p) => p.rotulo === 'Hoje');
    const candidatos = [
      pontos[0], pontos[pontos.length - 1],
      pontos[saldos.indexOf(Math.max(...saldos))],
      pontos[saldos.indexOf(Math.min(...saldos))],
      ...(fimConciliado ? [fimConciliado] : []),
      ...(emHoje ? [emHoje] : []),
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

  const final = pontos[pontos.length - 1];
  const emHoje = pontos.find((p) => p.rotulo === 'Hoje') ?? pontos[0];
  /* O fim do conciliado ganha o próprio valor escrito: é o número que bate com a Conciliação. */
  const fimConciliado = [...pontos].reverse().find((p) => p.zona === 'conciliado') ?? null;

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

  /**
   * ONDE CADA RÓTULO DO TOPO FICA — a regra anti-colisão aplicada à geometria real.
   *
   * ⚠ A POSIÇÃO X SAI DO ÍNDICE DO PONTO, não de medição: `índice × larguraPorPonto` é a mesma
   * conta que o recharts usa para distribuir a série num eixo categórico. Serve para decidir se
   * dois rótulos se encostam, que é tudo o que se precisa.
   * ⚠ A PRIORIDADE É PRODUTO, NÃO TÉCNICA: o "hoje" é o número que o operador veio ver, então
   * ele fica onde está e quem cede é o resto. O saldo final é FIXO — ele já é um par empilhado
   * (valor e data) dentro da margem, e subi-lo desmancharia esse arranjo para consertar outro.
   */
  const indiceDe = (chave: string) => pontos.findIndex((p) => p.chave === chave);
  /**
   * ⚠ SEM `useMemo`, E NÃO É DESCUIDO — PR-CPR-FLUXO-HOOK-310. Ele estava aqui, DEPOIS dos dois
   * early returns acima (`saldoInicial === null` e `pontos.length <= 1`), e por isso era um hook
   * CONDICIONAL: o componente chamava um número de hooks quando o gráfico tinha pontos e outro
   * quando não tinha. O React aborta essa transição com o erro #310 — tela branca ao filtrar por
   * "Vencidos" e voltar, por exemplo. O `eslint` apontava a linha exata, com a regra
   * `react-hooks/rules-of-hooks`; faltava rodá-lo.
   * ⚠ A SAÍDA FOI TIRAR O MEMO, não subir o cálculo. Subi-lo exigiria mover junto `larguraPorPonto`
   * e as quatro constantes de margem, que moram abaixo dos returns e que o briefing da anti-colisão
   * marcou como risco explícito — elas alimentam o passo do eixo X e o nome do mês.
   * ⚠ E O MEMO NÃO PROTEGIA NADA: `faixasSemColisao` ordena NO MÁXIMO QUATRO itens (`MAX_FAIXAS`),
   * sobre uma lista de no máximo três rótulos. Memoizar isso custa mais do que recalcular.
   * O corpo abaixo é o mesmo, byte a byte; só o envelope mudou.
   */
  const faixasDosRotulos = ((): ReturnType<typeof faixasSemColisao> => {
    const lista: Parameters<typeof faixasSemColisao>[0][number][] = [];
    const emHojeLocal = pontos.find((p) => p.rotulo === 'Hoje');
    const fimConcLocal = [...pontos].reverse().find((p) => p.zona === 'conciliado');
    const ultimo = pontos[pontos.length - 1];

    if (ultimo) {
      /* Ancorado à esquerda e crescendo para a margem — daí a largura toda de um lado só. */
      const t = fmtTag(ultimo.saldo);
      lista.push({
        id: 'final', x: indiceDe(ultimo.chave) * larguraPorPonto,
        paraEsquerda: 0, paraDireita: larguraEstimada(t, 13), prioridade: 2, fixo: true,
      });
    }
    if (emHojeLocal) {
      const t = `${fmtTag(emHojeLocal.saldo)} *`;
      const meia = larguraEstimada(t, 12) / 2;
      lista.push({
        id: 'hoje', x: indiceDe(emHojeLocal.chave) * larguraPorPonto,
        paraEsquerda: meia, paraDireita: meia, prioridade: 0,
      });
    }
    if (fimConcLocal && emHojeLocal && fimConcLocal.chave !== emHojeLocal.chave) {
      const t = fmtTag(fimConcLocal.saldo);
      const meia = larguraEstimada(t, 11) / 2;
      lista.push({
        id: 'conciliado', x: indiceDe(fimConcLocal.chave) * larguraPorPonto,
        paraEsquerda: meia, paraDireita: meia, prioridade: 1,
      });
    }
    return faixasSemColisao(lista);
  })();

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg" style={{ background: COR_CREME }}>
      <div className="shrink-0 px-4 pt-3">
        <h2 className="text-[17px] font-semibold leading-none" style={{ color: COR_TEXTO }}>
          Fluxo de caixa previsto
        </h2>
        {/* ⚠ O CAVEAT DO SALDO VEM INTEIRO, e ganha o seu próprio: o gráfico parte de um saldo
            conciliado até certa data E assume que todo compromisso cai no vencimento. */}
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {caveat ? `${caveat} · ` : ''}* de hoje em diante, assumindo que tudo cai no vencimento
          {anteriores > 0 && ` · ${anteriores} já vencido${anteriores > 1 ? 's' : ''}, fora da projeção`}
          {semVencimento > 0 && ` · ${semVencimento} sem vencimento, fora do gráfico`}
          {rebaixada && ' · período longo demais para o detalhe diário: agrupado por mês'}
        </p>
      </div>

      {/* ⚠ LEGENDA PRÓPRIA, não a do recharts: ela precisa mostrar o TRACEJADO do previsto, e
          o `<Legend>` desenha só um retângulo cheio por série — as três zonas sairiam iguais,
          que é justamente o que a legenda existe para distinguir. */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 pt-2">
        {([
          { cor: COR_CONCILIADO, rotulo: 'Conciliado', tracejado: false },
          { cor: COR_REALIZADO, rotulo: 'Realizado, a conferir', tracejado: false },
          { cor: COR_REALIZADO, rotulo: 'Venceu e não foi pago', tracejado: true },
          { cor: COR_SALDO, rotulo: 'Previsto', tracejado: true },
        ] as const).map((z) => (
          <span key={z.rotulo} className="flex items-center gap-1.5 text-[11px]"
            style={{ color: COR_TEXTO }}>
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={z.cor} strokeWidth="2.2"
                strokeLinecap="round" strokeDasharray={z.tracejado ? '4 3' : undefined} />
            </svg>
            {z.rotulo}
          </span>
        ))}
      </div>

      <div ref={refPlot} className="min-h-0 flex-1 px-1 pb-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos}
            margin={{ top: 22, right: MARGEM_DIR, bottom: 30, left: MARGEM_ESQ }}>

            <CartesianGrid strokeDasharray="3 3" stroke="#ded6c9" vertical={false} />
            {/* ⚠ `interval={0}` — todos os ticks são RENDERIZADOS e o tick decide o que
                desenhar. Ver a nota em `TickEixoX`: era o `interval` numérico que apagava a
                faixa de mês junto com o rótulo do dia. */}
            {/* ⚠ `tickLine` LIGADO nos dois eixos — a marca de escala do `ExtratoAnaliseFluxo`.
                Sem ela o rótulo flutua e o olho não sabe a que altura exata ele pertence. */}
            <XAxis dataKey="rotulo" interval={0} height={38}
              tickLine={{ stroke: COR_TEXTO, opacity: 0.4 }} axisLine={{ stroke: '#ded6c9' }}
              tick={<TickEixoX pontos={pontos} passoRotulo={passoRotulo} faixaCabe={faixaCabe} />} />
            <YAxis domain={escala.dominio} ticks={escala.ticks} width={LARGURA_EIXO_Y}
              tickLine={{ stroke: COR_TEXTO, opacity: 0.4 }} axisLine={false}
              tick={{ fontSize: 10, fill: COR_TEXTO }} tickFormatter={fmtCurto} />
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
            {/* ⚠ TRÊS SÉRIES, UMA POR ZONA DE TEMPO, cada uma nula fora da sua (ver
                `combinarComPassado`). `connectNulls={false}` é o que impede o recharts de ligar
                o fim de uma zona ao começo da seguinte por cima do vão — e a repetição do ponto
                de virada é o que faz os trechos SE TOCAREM em vez de deixar um buraco.
                ⚠ O PREVISTO É TRACEJADO porque não aconteceu: o traço contínuo é o que já é
                fato, e a diferença tem de ser legível sem consultar a legenda. */}
            <Line type="monotone" dataKey="saldoConciliado" name="Conciliado"
              stroke={COR_CONCILIADO} strokeWidth={2.2} strokeLinecap="round"
              strokeLinejoin="round" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="saldoRealizado" name="Realizado, a conferir"
              stroke={COR_REALIZADO} strokeWidth={2.2} strokeLinecap="round"
              strokeLinejoin="round" dot={false} connectNulls={false} isAnimationActive={false} />
            {/* ⚠ MESMA COR DO REALIZADO, TRAÇO DIFERENTE: os dois são o mesmo tempo (passado
                não conciliado); o que muda é se aconteceu. Cor para o tempo, traço para a
                certeza — trocar a cor aqui faria o operador procurar um terceiro período. */}
            <Line type="monotone" dataKey="saldoVencido" name="Venceu e não foi pago"
              stroke={COR_REALIZADO} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4"
              strokeLinejoin="round" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="saldoPrevisto" name="Previsto"
              stroke={COR_SALDO} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4"
              strokeLinejoin="round" dot={false} connectNulls={false} isAnimationActive={false} />

            {marcos.map((m) => (
              <ReferenceDot key={`marco-${m.chave}`} x={m.rotulo} y={m.saldo} r={3.4} isFront
                fill={m.saldo < 0 ? COR_SAIDA : corDaZona(m.zona)}
                stroke="#fff" strokeWidth={1.3} />
            ))}

            {/* ⚠ AS TAGS FICAM FORA DA LINHA. A de hoje sobe acima do ponto inicial; a do saldo
                final vai para a margem direita reservada no `margin` — é o valor do painel de
                referência, que não disputa espaço com o traço. */}
            {/* ⚠ A TAG ANCORA EM "HOJE", NÃO NO PRIMEIRO PONTO — PR-CPR-2B.3: com o passado
                desenhado, o primeiro ponto passou a ser o começo do mês conciliado, e o valor
                que o operador confere contra o card é o de hoje.
                ⚠ E O TEXTO VAI PARA A ESQUERDA DO PONTO (`dx` negativo) quando "hoje" está
                perto da borda: colado no eixo Y ele ficava por cima dos números da escala. */}
            {emHoje && (
              <>
                {/* ⚠ DUAS LINHAS, "hoje" ACIMA do valor: numa linha só o rótulo empurrava o
                    número para cima da curva. Separados, o valor fica logo acima do ponto e a
                    palavra acima dele, sem encostar em nada.
                    ⚠ LARANJA E COM ASTERISCO — PR-CPR-2B.3.5, e é o mesmo token da linha
                    tracejada do futuro (`COR_SALDO`), não uma cor nova. Este número NÃO é o
                    dinheiro que está na conta: é a projeção, o caixa que haveria se tudo o que
                    venceu tivesse sido pago no vencimento. O dinheiro real está no card do
                    topo. Pintá-lo da cor do texto o fazia passar por fato; na cor do previsto,
                    ele se declara estimativa antes de ser lido.
                    ⚠ E O ASTERISCO É RESOLVIDO NO SUBTÍTULO, não numa legenda nova: a frase
                    que explica a premissa já está lá em cima, e ganhou o `*` na frente. Um
                    rodapé só para essa estrela acrescentaria uma linha ao gráfico para repetir
                    o que já estava escrito. */}
                {/* ⚠ A PALAVRA ACOMPANHA O VALOR: ela sobe junto quando o valor sobe, senão o
                    par se separaria e o "hoje" ficaria explicando um número que saiu de baixo
                    dele. Por isso as duas leem a MESMA faixa. */}
                <ReferenceDot x={emHoje.rotulo} y={emHoje.saldo} r={0} isFront
                  label={(props) => (
                    <RotuloDoTopo {...props} texto="hoje" cor={COR_SALDO} tamanho={10}
                      faixa={(faixasDosRotulos.get('hoje') ?? 0) + 0.85} />
                  )} />
                <ReferenceDot x={emHoje.rotulo} y={emHoje.saldo} r={0} isFront
                  label={(props) => (
                    <RotuloDoTopo {...props} texto={`${fmtTag(emHoje.saldo)} *`} cor={COR_SALDO}
                      tamanho={12} peso={600} faixa={faixasDosRotulos.get('hoje') ?? 0} />
                  )} />
              </>
            )}
            {fimConciliado && fimConciliado.chave !== emHoje.chave && (
              <ReferenceDot x={fimConciliado.rotulo} y={fimConciliado.saldo} r={0} isFront
                label={(props) => (
                  <RotuloDoTopo {...props} texto={fmtTag(fimConciliado.saldo)}
                    cor={COR_CONCILIADO} tamanho={11}
                    faixa={faixasDosRotulos.get('conciliado') ?? 0} />
                )} />
            )}
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
