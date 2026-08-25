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
 * ⚠ NAO e' o mesmo shape do prop `acelerador` do card (que o Zootecnico usa):
 * la o rotulo da marca vai DENTRO do SVG; aqui os dois textos sao HTML, entao
 * o componente recebe as duas linhas ja escritas.
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
  /** Progresso contra a meta do ANO — SEMPRE anual, mesmo com o filtro da tela
      em "No mes". Ausente ou `null`: o card renderiza como sempre renderizou. */
  acelerador?: {
    /** Pode passar de 100. Superar a meta e' informacao, nao transbordo. */
    pctAno: number;
    /** Onde o PROPRIO plano previa estar neste mes. Nunca mesNum/12. */
    pctRitmo: number;
    /** Rotulo curto da marca, ex.: "meta Jul". */
    rotuloMarca: string;
  } | null;
}

/**
 * Arco de 180 graus: quanto do ANO ja andou, e onde o plano dizia que estaria
 * no mes selecionado.
 *
 * Mesma mecanica do bloco Area (V2Home:2201-2206): geometria em SVG puro com
 * strokeDasharray, sem recharts e sem componente em outro arquivo. A diferenca
 * e' o semicirculo — um <path> em vez de <circle>, porque meio arco nao se
 * descreve por raio.
 *
 * `strokeDashoffset` NAO entra: os dois tracos partem do mesmo ponto do path,
 * entao o offset seria zero — prop inerte.
 *
 * O ARCO satura em 100; o NUMERO nunca satura. Passar da meta e' informacao.
 */
function Acelerador({ pctAno, pctRitmo, rotuloMarca }: {
  pctAno: number; pctRitmo: number; rotuloMarca: string;
}) {
  /* Semicirculo de raio 38 centrado em (52,60). O `d` vai de (14,60) a (90,60)
     com sweep-flag 1, que em SVG — eixo y para BAIXO — desenha por CIMA. */
  const D = 'M14 60 A38 38 0 0 1 90 60';
  const ARCO = Math.PI * 38;
  const cheio = Math.min(Math.max(pctAno, 0), 100) / 100;
  /* Atraso NAO e' erro: warning, nunca destructive. */
  const cor = pctAno >= pctRitmo ? 'stroke-success' : 'stroke-warning';
  /* Marca por TRIGONOMETRIA, jamais coordenada fixa: pctRitmo muda por cliente
     e por mes. 0% fica em 180 graus (esquerda) e 100% em 0 grau (direita), logo
     1,8 grau por ponto percentual. O y subtrai porque o eixo cresce para baixo. */
  const fRitmo = Math.min(Math.max(pctRitmo, 0), 100);
  const rad = (180 - 1.8 * fRitmo) * Math.PI / 180;
  const mx = (r: number) => 52 + r * Math.cos(rad);
  const my = (r: number) => 60 - r * Math.sin(rad);
  return (
    <div className="shrink-0 flex flex-col items-center">
      <svg viewBox="0 0 104 74" className="w-[104px]">
        <path d={D} fill="none" strokeWidth="8" strokeLinecap="round"
          className="stroke-muted-foreground/30" />
        <path d={D} fill="none" strokeWidth="8" strokeLinecap="round"
          className={cor}
          strokeDasharray={`${ARCO * cheio} ${ARCO}`} />
        <line x1={mx(32)} y1={my(32)} x2={mx(44)} y2={my(44)}
          strokeWidth="2.4" strokeLinecap="round" className="stroke-foreground" />
        {/* Ancora troca de lado no meio do arco para o rotulo nao vazar da caixa. */}
        <text x={mx(44)} y={my(44) - 3} textAnchor={fRitmo < 50 ? 'start' : 'end'}
          className="fill-muted-foreground text-[8px]">
          {rotuloMarca}
        </text>
        {/* y=52, nao 56: nos extremos (ritmo 0 ou 100) a caixa do rotulo desce a
            y~57 e a do numero, com baseline em 56, subia so ate ~41 — as duas se
            cruzavam. Em 52 o numero termina antes de onde o rotulo comeca.
            O extremo de 100% nao e' hipotetico: `cumSumTo13` soma mes sem plano
            como zero, entao plano parcial produz metaAcum == metaAno. */}
        <text x="52" y="52" textAnchor="middle"
          className="fill-foreground text-[21px] font-medium">
          {pctAno.toFixed(0)}%
        </text>
      </svg>
      <p className="text-[9px] text-muted-foreground/70 leading-tight">do ano</p>
    </div>
  );
}

export function BlocoAtividade({ titulo, subtitulo, icone: Icone, metricas, onClick, loading, acelerador }: Props) {
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
  const temAcelPorMetrica = metricas.some(m => m.acel);
  const pares = metricas.map((m, i) => (
    <div key={m.rotulo} className="flex items-center gap-2 flex-1 min-w-0">
      {i > 0 && <div className="w-[0.5px] self-stretch bg-border shrink-0" />}
      {m.acel ? <ArcoMetrica {...m.acel} inverso={!!m.inverseDelta} /> : null}
      <div className="min-w-0">{corpo(m)}</div>
    </div>
  ));

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

        {acelerador ? (
          /* O arco fica DENTRO do mesmo card e do mesmo alvo de clique — nao e'
             um controle proprio. O grid das metricas segue grid-cols-4. */
          <div className="flex items-center gap-3">
            <Acelerador pctAno={acelerador.pctAno} pctRitmo={acelerador.pctRitmo}
              rotuloMarca={acelerador.rotuloMarca} />
            <div className="grid grid-cols-4 gap-2 flex-1 min-w-0">{celulas}</div>
          </div>
        ) : temAcelPorMetrica ? (
          <div className="flex items-stretch gap-2">{pares}</div>
        ) : (
          <div className="grid grid-cols-4 gap-2">{celulas}</div>
        )}
      </CardContent>
    </Card>
  );
}
