/**
 * Bloco de ATIVIDADE na Home — quatro numeros e uma porta.
 *
 * O QUE RESPONDE (C2, Art. 19.1): "o zootecnico esta bem?" — estoque e
 * producao contra o planejado. Hoje o usuario varre dezoito tiles sem
 * agrupamento; aqui sao quatro numeros por assunto, com o detalhe a um
 * clique.
 *
 * O CARD INTEIRO e o alvo do clique. O icone sinaliza que ha detalhe; ele
 * nao e o unico ponto clicavel, porque alvo pequeno em card grande e
 * armadilha de mira.
 *
 * NAO CALCULA. Recebe metrica pronta — valor ja formatado e delta ja
 * calculado. A polaridade (PR-14) vem por metrica: onde subir e RUIM, o
 * delta positivo pinta VERMELHO. Dar direcao a um indicador e nao ao outro
 * cria tile verde e modal vermelho sobre o mesmo numero.
 *
 * DADO AUSENTE e travessao, nunca zero (Art. 19.8) — quem formata o valor e
 * o chamador, e `null` chega como '—'.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Acelerador de UMA metrica — o arco que fica a esquerda do numero.
 *
 * Os dois textos que o acompanham sao HTML, fora do SVG, entao o componente
 * recebe as duas linhas ja escritas.
 */
export interface AcelMetrica {
  /** Pode passar de 100 — e' informacao, nao transbordo. */
  pctAno: number;
  /** Onde o PROPRIO plano previa estar. Nunca mesNum/12. */
  pctRitmo: number;
  /** Linha de cima, ex.: "meta jul · 39,7%". */
  rotuloMeta: string;
  /** Linha de baixo, os numeros crus, ex.: "943 de 2.570". */
  legenda: string;
}

export interface MetricaBloco {
  rotulo: string;
  /** Ja formatado pelo chamador — o bloco nao formata nem arredonda. */
  valor: string;
  /** A comparacao MAIS relevante desta metrica. `null` = sem base. */
  delta: number | null;
  /** Rotulo curto do que o delta compara: "vs meta", "vs 2025". */
  deltaRotulo?: string;
  /** Onde subir e RUIM (PR-14). */
  inverseDelta?: boolean;
  /** Arco de progresso ANUAL a esquerda deste numero. Ausente: so o numero. */
  acel?: AcelMetrica | null;
  /** Barra de posicao contra a meta DO RECORTE. Exclusiva com `acel`. */
  barra?: BarraMetricaDados | null;
}

/**
 * Barra de UMA metrica — posicao contra a meta DO RECORTE da tela.
 *
 * POR QUE BARRA E NAO ARCO. Arco responde "quanto do ano ja andei", e so faz
 * sentido para acumulado. Rebanho medio de 6.182 nao e' "6.182 dos X do ano", e
 * GMD de 0,386 kg/dia nao vira outro numero em dezembro — sao estoque e taxa.
 * Para esses a pergunta e' "estou acima ou abaixo da meta DO RECORTE", que e' o
 * que a barra desenha.
 *
 * ⚠ ESCALA: META NO CENTRO. A marca e' FIXA em 50% do trilho e o preenchimento
 * representa o DESVIO contra ela — a mesma razao `(real - meta) / meta` que o
 * delta ao lado ja mostra, saturando em ±100%.
 *   meta exata -> 50% · +33% -> 66,5% · -33,7% -> 33,2% · dobro -> 100% · zero -> 0%
 *
 * A ESCALA ANTERIOR ERA `max(real, meta) * 1,25`, e foi trocada por um defeito
 * que so aparece na conta: quando o realizado supera a meta, a base E' o
 * realizado, entao o preenchido trava em 1/1,25 = 80% SEMPRE. Tres barras acima
 * da meta ficavam com preenchimento identico e a unica diferenca era a marca —
 * de 0,6px a 3px num trilho de 88px. Barra que nao varia nao informa.
 *
 * ⚠ `pctReal` e `pctMeta` chegam como dois numeros PROPORCIONAIS a real e meta;
 * o que este componente usa e' a RAZAO entre eles, e a base em que foram
 * calculados se cancela. Por isso a escala pode mudar aqui sem tocar em quem
 * monta o prop-bag.
 *
 * Saturado, o trilho para de crescer mas o numero real continua no delta ao
 * lado — nao ha indicador de estouro porque ele seria redundante.
 *
 * Tudo em HTML: sem SVG, nao ha unidade de viewBox e o texto nao encolhe junto
 * com a caixa (foi o que obrigou o ArcoMetrica a tirar os rotulos de dentro).
 */
export interface BarraMetricaDados {
  /** Proporcional ao REALIZADO. Só a razao com `pctMeta` e' usada. */
  pctReal: number;
  /** Proporcional a META, na MESMA base. Divisor da escala: <= 0 nao desenha. */
  pctMeta: number;
  /** Ex.: "meta 6.026" — ja formatado pelo chamador, como o valor. */
  rotuloMeta: string;
  /** "no mes" ou "no periodo": declara que a barra segue o filtro da tela. */
  rotuloRecorte: string;
  /** Realizado abaixo da meta. Nos tres, mais e' melhor — nenhum inverte. */
  abaixo: boolean;
}

function BarraMetrica({ pctReal, pctMeta, rotuloMeta, rotuloRecorte, abaixo }: BarraMetricaDados) {
  /* A meta e' o DIVISOR da escala: sem ela nao ha contra o que medir, e a razao
     abaixo estouraria. Barra some, o par vira so a metrica. */
  if (!(pctMeta > 0) || !Number.isFinite(pctReal)) return null;
  const desvio = pctReal / pctMeta - 1;
  const pos = 50 + Math.max(-1, Math.min(1, desvio)) * 50;
  return (
    <div className="shrink-0 w-[88px] flex flex-col items-center gap-1">
      <p className="text-[8px] text-muted-foreground leading-tight whitespace-nowrap">{rotuloMeta}</p>
      <div className="relative w-full h-[9px] rounded-full bg-muted-foreground/30">
        <div className={`absolute inset-y-0 left-0 rounded-full ${abaixo ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${pos}%` }} />
        {/* Marca FIXA no meio — e' a meta, e a meta e' o centro da escala. Ela
            transborda o trilho em 3px para cima e para baixo: dentro dele, sobre
            o preenchido, sumiria. */}
        <div className="absolute w-[2px] -top-[3px] -bottom-[3px] bg-foreground left-1/2" />
      </div>
      <p className="text-[8px] text-muted-foreground/70 leading-tight whitespace-nowrap">{rotuloRecorte}</p>
    </div>
  );
}

/**
 * Arco de UMA metrica: quanto do ANO ja andou contra a meta anual.
 *
 * ⚠ TODO texto fora do SVG, em HTML — este e' o ponto do desenho. `font-size`
 * dentro de SVG e' unidade de viewBox, entao encolher a caixa renderizada
 * encolheria a fonte junto e furaria o piso de 8px do A12. So o percentual e
 * "no ano" ficam dentro, e os dois sao grandes o bastante para aguentar.
 *
 * "no ano" e' OBRIGATORIO: distingue o arco (anual) da metrica ao lado (do
 * recorte da tela). Sem ele o card afirmaria duas coisas sem dizer qual e qual.
 *
 * A polaridade vem de `inverso`, que o chamador liga ao MESMO `inverseDelta`
 * da metrica — assim arco e delta nao tem como se contradizer.
 */
function ArcoMetrica({ pctAno, pctRitmo, rotuloMeta, legenda, inverso }: AcelMetrica & { inverso: boolean }) {
  const D = 'M14 54 A38 38 0 0 1 90 54';
  const ARCO = Math.PI * 38;
  const cheio = Math.min(Math.max(pctAno, 0), 100) / 100;
  /* Atraso ou excesso NAO sao erro: warning, nunca destructive. */
  const noRitmo = inverso ? pctAno <= pctRitmo : pctAno >= pctRitmo;
  const cor = noRitmo ? 'stroke-success' : 'stroke-warning';
  /* Acima de 999% o numero deixa de caber E deixa de ser leitura de progresso:
     vira multiplo. Abaixo disso fica em %, porque dois formatos convivendo na
     mesma faixa confundiriam mais do que resolvem. Os numeros crus da linha de
     baixo nao mudam — sao eles que sustentam o "×". */
  const numero = pctAno > 999
    ? `${(pctAno / 100).toFixed(1).replace('.', ',')}×`
    : `${Math.round(pctAno)}%`;
  /* Marca por TRIGONOMETRIA, jamais coordenada fixa: pctRitmo varia por tipo,
     cliente e mes. 0% em 180 graus, 100% em 0 grau — 1,8 grau por ponto. */
  const fRitmo = Math.min(Math.max(pctRitmo, 0), 100);
  const rad = (180 - 1.8 * fRitmo) * Math.PI / 180;
  const mx = (r: number) => 52 + r * Math.cos(rad);
  const my = (r: number) => 54 - r * Math.sin(rad);
  return (
    <div className="shrink-0 flex flex-col items-center">
      <p className="text-[8px] text-muted-foreground leading-tight whitespace-nowrap">{rotuloMeta}</p>
      <svg viewBox="0 0 104 58" className="w-[88px]">
        <path d={D} fill="none" strokeWidth="9" strokeLinecap="round"
          className="stroke-muted-foreground/30" />
        <path d={D} fill="none" strokeWidth="9" strokeLinecap="round"
          className={cor}
          strokeDasharray={`${ARCO * cheio} ${ARCO}`} />
        <line x1={mx(32)} y1={my(32)} x2={mx(44)} y2={my(44)}
          strokeWidth="2.6" strokeLinecap="round" className="stroke-foreground" />
        <text x="52" y="46" textAnchor="middle"
          className="fill-foreground text-[23px] font-medium">{numero}</text>
        <text x="52" y="56" textAnchor="middle"
          className="fill-muted-foreground text-[9px]">no ano</text>
      </svg>
      <p className="text-[8px] text-muted-foreground/70 leading-tight whitespace-nowrap">{legenda}</p>
    </div>
  );
}

interface Props {
  titulo: string;
  /** Em linguagem comum, nao em jargao de indicador. */
  subtitulo: string;
  icone: LucideIcon;
  metricas: MetricaBloco[];
  onClick: () => void;
  loading?: boolean;
}

export function BlocoAtividade({ titulo, subtitulo, icone: Icone, metricas, onClick, loading }: Props) {
  /* O corpo da metrica — rotulo, numero e delta — e' o MESMO nos dois layouts.
     Sai daqui uma vez so para que acrescentar o arco ao lado nao possa mudar,
     por descuido, nem a fonte nem a cor do numero que ja estava na tela. */
  const corpo = (m: MetricaBloco) => {
    const temDelta = m.delta != null && !isNaN(m.delta);
    /* Positivo e BOM por padrao; com `inverseDelta`, positivo e ruim.
       Zero nao e nem um nem outro — fica neutro. */
    const bom = !temDelta ? false
      : m.inverseDelta ? (m.delta as number) < 0 : (m.delta as number) > 0;
    return (
      <>
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70 leading-tight truncate">
          {m.rotulo}
        </p>
        <p className="text-sm font-bold text-foreground leading-tight tabular-nums truncate">
          {loading ? '…' : m.valor}
        </p>
        {temDelta ? (
          <p className={`text-[9px] leading-tight ${bom ? 'text-emerald-600' : 'text-red-600'}`}>
            {(m.delta as number) > 0 ? '+' : ''}{(m.delta as number).toFixed(1)}%
            {m.deltaRotulo ? <span className="text-muted-foreground/60"> {m.deltaRotulo}</span> : null}
          </p>
        ) : (
          <p className="text-[9px] leading-tight text-muted-foreground/50">—</p>
        )}
      </>
    );
  };
  const celulas = metricas.map(m => (
    <div key={m.rotulo} className="min-w-0">{corpo(m)}</div>
  ));
  /* Um arco por metrica: o fio fica DENTRO do par, na borda esquerda, para
     nunca sobrar fio no fim da linha. */
  const temDesenho = metricas.some(m => m.acel || m.barra);
  const pares = metricas.map((m, i) => {
    /* Arco e barra respondem perguntas diferentes sobre o MESMO numero; as duas
       ao lado dele diriam que ha duas verdades. O arco vence por ser o mais
       especifico, e o aviso existe para o defeito nao passar calado. */
    if (m.acel && m.barra) {
      console.warn(`BlocoAtividade: metrica "${m.rotulo}" trouxe acel E barra; renderizando o arco.`);
    }
    return (
      <div key={m.rotulo} className="flex items-center gap-2 flex-1 min-w-0">
        {i > 0 && <div className="w-[0.5px] self-stretch bg-border shrink-0" />}
        {m.acel ? <ArcoMetrica {...m.acel} inverso={!!m.inverseDelta} />
          : m.barra ? <BarraMetrica {...m.barra} /> : null}
        <div className="min-w-0">{corpo(m)}</div>
      </div>
    );
  });

  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">{titulo}</p>
            <p className="text-[10px] text-muted-foreground/70 leading-snug">{subtitulo}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 text-muted-foreground/60">
            <Icone className="w-4 h-4" />
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {temDesenho ? (
          <div className="flex items-stretch gap-2">{pares}</div>
        ) : (
          <div className="grid grid-cols-4 gap-2">{celulas}</div>
        )}
      </CardContent>
    </Card>
  );
}
