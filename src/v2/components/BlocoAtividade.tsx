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
  const celulas = metricas.map(m => {
    const temDelta = m.delta != null && !isNaN(m.delta);
    /* Positivo e BOM por padrao; com `inverseDelta`, positivo e ruim.
       Zero nao e nem um nem outro — fica neutro. */
    const bom = !temDelta ? false
      : m.inverseDelta ? (m.delta as number) < 0 : (m.delta as number) > 0;
    return (
      <div key={m.rotulo} className="min-w-0">
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

        {acelerador ? (
          /* O arco fica DENTRO do mesmo card e do mesmo alvo de clique — nao e'
             um controle proprio. O grid das metricas segue grid-cols-4. */
          <div className="flex items-center gap-3">
            <Acelerador pctAno={acelerador.pctAno} pctRitmo={acelerador.pctRitmo}
              rotuloMarca={acelerador.rotuloMarca} />
            <div className="grid grid-cols-4 gap-2 flex-1 min-w-0">{celulas}</div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">{celulas}</div>
        )}
      </CardContent>
    </Card>
  );
}
