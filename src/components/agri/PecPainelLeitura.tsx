/**
 * O PAINEL DA DIREITA DO DRE DA PECUÁRIA — DRE-PAINEL-01 (mock `ui-validar/dre-painel-01-ref/mock-aprovado.html`).
 *
 * Três blocos sobre o MESMO par de colunas da grade (o período da tela × a comparação ativa): "No mês" (Lucro operacional, Resultado
 * econômico e Custo total em R$ · R$/ha · Δ % — DRE-PAINEL-03b), a PONTE do lucro operacional (da comparação ao mês, pelos seis Δ) e
 * a LEITURA DO MÊS (as cinco que mais pesaram, com o link que resolve). No cabeçalho, o selo de confiança (P9) e o que falta.
 *
 * ⚠ NENHUMA REGRA AQUI: os números, as frases, a ordem e o selo saem de `src/lib/dre/leitura.ts` (um módulo só para o painel e o
 *   mês a mês). Este arquivo só desenha.
 * ⚠ "—" É AUSÊNCIA: sem comparação não há Δ, nem ponte, nem leitura — o painel diz isso, nunca mostra zero.
 */
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import {
  leituraDoMes, noMes, ponteDoLucroOperacional, linhasDaPonte,
  type Comparacao, type DestinoLeitura, type DestinoFalta, type ItemLeitura, type Selo, type GrauConfianca, type Horizonte,
  type LinhaDaPonte, type TomDaPonte,
} from '@/lib/dre/leitura';
import type { DrePecLinhas } from '@/hooks/useDrePecuaria';
import { NAVY_TOTAL } from '@/components/agri/dreGrade';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Segmentado } from '@/components/ui/segmentado';
import { CascataDesenho, montarBarras } from '@/components/agri/PecCascataView';
import type { ColunaPec } from '@/components/agri/drePecRegua';

export type DestinoDoPainel = DestinoLeitura | { tipo: DestinoFalta };
type AbaDoPainel = 'cascata' | 'ponte';
/** A altura do corpo das duas abas: a mesma nas duas, para a Leitura abaixo nunca mudar de lugar ao trocar de aba. */
const ALTURA_DA_ABA = 160;
/** A margem do eixo no painel: "13 mi" cabe em 40 px; a janela usa 62. */
const MARGEM_DA_CASCATA = 40;
const MARGEM_DIREITA_DA_CASCATA = 14;
export const TITULO_SEM_COMPARACAO_PAINEL = 'Escolha com o que comparar (o "Comparar com" no topo)';

/** A largura do corpo da aba, medida (o desenho da cascata é em pixels reais e acompanha o painel). Sem medida (jsdom), 0. */
function useLarguraDe(el: HTMLElement | null): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const medir = () => setW(el.clientWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

const MENOS = '−';
const comSinal = (v: number, casas: number) => `${v < 0 ? MENOS : '+'}${formatNum(Math.abs(v), casas)}`;
const rs2 = (v: number | null) => (v == null ? '—' : `R$ ${v < 0 ? MENOS : ''}${formatNum(Math.abs(v), 2)}`);
/** "5.943.384,77" · "−230.136,68" — o R$ das colunas (o "R$" está no cabeçalho). */
const num2 = (v: number | null) => (v == null ? '—' : `${v < 0 ? MENOS : ''}${formatNum(Math.abs(v), 2)}`);
/** "+29,4 %" · "−16,1 %" · "—" (comparada zero ou ausente). */
const pctDoPainel = (p: number | null) => (p == null ? '—' : `${p > 0 ? '+' : p < 0 ? MENOS : ''}${formatNum(Math.abs(p) * 100, 1)} %`);
/* DRE-PAINEL-03b: as 3 colunas de número em px (régua fixa; o Indicador fica com o resto do painel — a 1126, ~166px). O gate dre-pec
   (cortes) prova que nenhum número vaza a célula de 1126 a 1920. */
const COL_RS = 82;
const COL_HA = 62;
const COL_PCT = 58;
const corDoNumero = (v: number | null, custo = false) =>
  (v == null || v === 0 ? 'text-muted-foreground' : (custo ? v > 0 : v < 0) ? 'text-red-600' : 'text-green-700');

const ROTULO_DO_SELO: Record<GrauConfianca, string> = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Confiança baixa' };
const COR_DO_SELO: Record<GrauConfianca, string> = {
  alta: 'bg-green-100 text-green-800', media: 'bg-amber-100 text-amber-800', baixa: 'bg-red-100 text-red-700',
};

const TEXTO_DO_LINK: Record<DestinoDoPainel['tipo'], string> = {
  valor_rebanho: 'Ver variação do rebanho →',
  notas_a_lancar: 'Ver notas →',
  abates: 'Ver abates →',
  linha_dre: 'Ver lançamentos →',
  conciliacao: 'Abrir Conciliação →',
  fechamento_pastos: 'Abrir fechamento →',
};

export function PecPainelLeitura({
  atual, base, comparacao, rotuloAtual, rotuloBase, rotuloBaseFrase, carregandoBase, notasALancar, selo, altura, onDestino,
  horizonte = 'mes', colunaCascata = null,
}: {
  /** O total do período da tela (a coluna "Total"/"Atual" da grade). */
  atual: DrePecLinhas;
  /** O total da comparação ativa — o ano anterior, a Meta ou a Média 12m. `null` = sem comparação. */
  base: DrePecLinhas | null;
  comparacao: Comparacao;
  /** "out/26" — o cabeçalho e a ponte. */
  rotuloAtual: string;
  /** "out/25" · "Meta" · "Média 12m" — o cabeçalho e a ponte. */
  rotuloBase: string;
  /** "out/25" · "a Meta" · "a média de 12 meses" — dentro das frases. */
  rotuloBaseFrase: string;
  carregandoBase: boolean;
  /** As Notas da Receita em "A lançar" emitidas no período (D5) — `null` enquanto não carregou ou se falhou. */
  notasALancar: number | null;
  selo: Selo;
  /** A altura do cartão da grade: o painel termina no mesmo y e rola por dentro. */
  altura: number | null;
  onDestino: (d: DestinoDoPainel) => void;
  /** DRE-PAINEL-02 (3): um mês só na tela = "No mês"; mais de um = "No período" (o título e a leitura). */
  horizonte?: Horizonte;
  /** DRE-PAINEL-03b: a coluna do período na grade — a MESMA que a "Cascata do ano" da janela do Gráfico abre (`colunaPadraoDaCascata`). */
  colunaCascata?: ColunaPec | null;
}) {
  const indicadores = noMes(base, atual);
  const ponte = base ? ponteDoLucroOperacional(base, atual) : null;
  const linhas = base && ponte ? linhasDaPonte(base, atual, ponte, rotuloBase, rotuloAtual, comparacao) : null;
  const itens = base
    ? leituraDoMes({ base, atual, comparacao, rotuloBase: rotuloBaseFrase, notasALancar, horizonte })
    : [];
  const palavra = horizonte === 'periodo' ? 'período' : 'mês';
  /* DRE-PAINEL-03b (Gabriel 23/11): o painel ABRE NA CASCATA (até o Lucro operacional); "O que mudou" (a ponte) é a aba ao lado e segue o
     "Comparar com" — sem comparação ela fica apagada e o painel volta à Cascata */
  const [aba, setAba] = useState<AbaDoPainel>('cascata');
  useEffect(() => { if (!base && aba === 'ponte') setAba('cascata'); }, [base, aba]);
  const [caixaCascata, setCaixaCascata] = useState<HTMLDivElement | null>(null);
  const largura = useLarguraDe(caixaCascata);
  const grafico = montarBarras(colunaCascata, 'resultado_operacional');
  const tituloDaAba = aba === 'ponte'
    ? `Do lucro operacional de ${rotuloBase} ao de ${rotuloAtual}`
    : `Da receita bruta ao lucro operacional de ${rotuloAtual}`;
  const semBase = carregandoBase ? 'Carregando a comparação…' : `Sem comparação: escolha "Comparar com" para ler o ${palavra}.`;

  return (
    <aside data-testid="dre-painel-leitura" data-desloca-livre=""
      className="flex min-w-0 flex-col gap-2 overflow-auto rounded-lg border border-border/60 bg-card px-3 py-2"
      style={altura ? { height: altura } : undefined}>

      {/* ── cabeçalho: o horizonte e o selo (P9) ── */}
      <div className="flex h-[22px] shrink-0 items-center gap-2">
        <span className="text-[11px] font-semibold" data-testid="dre-painel-titulo">No {palavra}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={`contra ${rotuloBase}`}>contra {rotuloBase}</span>
        <span data-testid="dre-selo-confianca"
          className={cn('shrink-0 rounded px-1.5 py-[1px] text-[10px] font-medium',
            selo.grau ? COR_DO_SELO[selo.grau] : 'bg-muted text-muted-foreground')}
          title={selo.falta.length > 0 ? `Para subir de grau:\n${selo.falta.map(f => `• ${f.motivo}`).join('\n')}` : `Nada a resolver neste ${palavra}`}>
          {selo.grau ? ROTULO_DO_SELO[selo.grau] : 'Confiança —'}
        </span>
      </div>
      {selo.falta.length > 0 && (
        <ul className="-mt-1 flex shrink-0 flex-col gap-[2px]" data-testid="dre-selo-falta">
          {selo.falta.map(f => (
            <li key={f.motivo} className="flex items-baseline gap-1 text-[10px] leading-[13px] text-muted-foreground">
              <span className="min-w-0 flex-1">{f.motivo}</span>
              <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => onDestino({ tipo: f.destino })}>
                {TEXTO_DO_LINK[f.destino]}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── No mês / No período — DRE-PAINEL-03b (Gabriel 16:30): 4 colunas de LARGURA FIXA (Indicador | R$ | R$/ha | Δ %), da mesma
            fonte da grade (`noMes`, leitura.ts). Cor: lucro/resultado pelo sinal, custo vermelho; o Δ % verde = melhorou, vermelho = piorou
            pelo sentido da linha (custo que sobe piorou). ── */}
      <table className="w-full shrink-0 border-collapse text-[10px]" style={{ tableLayout: 'fixed' }} data-testid="dre-painel-indicadores">
        <colgroup><col /><col style={{ width: COL_RS }} /><col style={{ width: COL_HA }} /><col style={{ width: COL_PCT }} /></colgroup>
        <thead>
          <tr className="h-[16px] text-[9.5px] text-muted-foreground">
            <th className="text-left font-normal">Indicador</th>
            <th className="text-right font-normal" title={`R$ no ${palavra} (${rotuloAtual})`}>R$</th>
            <th className="text-right font-normal" title="R$ ÷ ha da coluna">R$/ha</th>
            <th className="text-right font-normal" title={`Δ % do R$ contra ${rotuloBase}`}>Δ %</th>
          </tr>
        </thead>
        <tbody>
          {[
            { rotulo: 'Lucro operacional', ind: indicadores.lucroOpHa, custo: false },
            { rotulo: 'Resultado econômico', ind: indicadores.resEconHa, custo: false },
            { rotulo: 'Custo total', ind: indicadores.custoTotalHa, custo: true },
          ].map(({ rotulo, ind, custo }) => (
            <tr key={rotulo} className="h-[18px] border-t border-border/40" data-indicador={rotulo}>
              <td className="truncate" title={custo ? 'Custo variável + fixo + rateio administrativo, sem juros' : rotulo}>{rotulo}</td>
              <td className={cn('text-right tabular-nums', corDoNumero(ind.total, custo))} title={rs2(ind.total)}>{num2(ind.total)}</td>
              <td className={cn('text-right tabular-nums', corDoNumero(ind.valor, custo))}
                title={ind.delta == null ? undefined : `Δ contra ${rotuloBase}: ${comSinal(ind.delta, 2)}/ha`}>{num2(ind.valor)}</td>
              <td className={cn('text-right tabular-nums', corDoNumero(ind.pct, custo))}>{pctDoPainel(ind.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── a cascata do período (o padrão) | "O que mudou" (a ponte do lucro operacional) — DRE-PAINEL-03b ── */}
      <div className="shrink-0" data-testid="dre-painel-abas">
        <div className="flex h-[22px] items-center gap-2">
          <Segmentado valor={aba} onEscolher={setAba} altura={22} opcoes={[
            { valor: 'cascata', rotulo: 'Cascata' },
            { valor: 'ponte', rotulo: 'O que mudou', desabilitada: !base, title: base ? undefined : TITULO_SEM_COMPARACAO_PAINEL },
          ]} />
          <span className="min-w-0 flex-1" />
          <span className="shrink-0 text-[10px] text-muted-foreground">{aba === 'ponte' ? 'R$ mi' : 'R$'}</span>
        </div>
        {/* o título numa linha SÓ dele (gate 23/11: ao lado das abas, a 1126 px, cortava em "…"); a cascata cedeu os 16 px (176 → 160) e a
            Leitura abaixo não se move */}
        <div className="mt-[2px] h-[14px] truncate text-[10px] font-medium leading-[14px]" title={tituloDaAba} data-testid="dre-painel-aba-titulo">{tituloDaAba}</div>
        <div ref={setCaixaCascata} style={{ height: ALTURA_DA_ABA }} className="mt-1" data-testid={`dre-painel-aba-${aba}`}>
          {aba === 'cascata' ? (
            !colunaCascata ? (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Sem a coluna do período: não há cascata.</div>
            ) : largura > 0 ? (
              <CascataDesenho grafico={grafico} largura={largura} altura={ALTURA_DA_ABA} margemEsquerda={MARGEM_DA_CASCATA} margemDireita={MARGEM_DIREITA_DA_CASCATA} rotulosCurtos />
            ) : null
          ) : ponte && linhas ? <Ponte linhas={linhas} fecha={ponte.fecha} /> : (
            <div className="flex h-[128px] items-center justify-center text-[10px] text-muted-foreground">
              {base ? 'Sem lucro operacional numa das pontas: não há ponte.' : semBase}
            </div>
          )}
        </div>
      </div>

      {/* ── a leitura do mês (ou do período) ── */}
      <div className="flex min-h-0 flex-col">
        <div className="flex h-[16px] shrink-0 items-baseline gap-2 text-[10px]">
          <span className="font-medium" data-testid="dre-leitura-titulo">Leitura do {palavra}</span>
          <span className="text-muted-foreground">o que mais pesou no lucro operacional</span>
        </div>
        {!base ? (
          <p className="py-2 text-[10px] text-muted-foreground">{semBase}</p>
        ) : itens.length === 0 ? (
          <p className="py-2 text-[10px] text-muted-foreground">Nenhuma linha com desvio (≥ 20% e ≥ R$ 10 mil) contra {rotuloBaseFrase}.</p>
        ) : (
          <ol className="flex flex-col" data-testid="dre-leitura-mes">
            {itens.map((it, i) => <ItemDaLeitura key={it.id} item={it} n={i + 1} onDestino={onDestino} />)}
          </ol>
        )}
      </div>
    </aside>
  );
}

function ItemDaLeitura({ item, n, onDestino }: { item: ItemLeitura; n: number; onDestino: (d: DestinoDoPainel) => void }) {
  return (
    <li className="grid gap-x-2 border-t border-border/40 py-1" style={{ gridTemplateColumns: '16px minmax(0,1fr) 84px' }}>
      <span className={cn('mt-[1px] flex h-[14px] w-[14px] items-center justify-center rounded-full text-[9.5px] font-semibold',
        item.anomalia ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground')}
        title={item.anomalia ? 'Sinal trocado ou zerado contra a comparação' : undefined}>
        {item.anomalia ? '!' : n}
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-medium leading-[14px]">{item.titulo}</div>
        <div className="text-[10px] leading-[13px] text-muted-foreground">{item.frase}</div>
        <button type="button" className="text-[10px] leading-[14px] text-primary hover:underline" onClick={() => onDestino(item.destino)}>
          {TEXTO_DO_LINK[item.destino.tipo]}
        </button>
      </div>
      <span className={cn('text-right text-[10px] tabular-nums leading-[14px]', corDoNumero(item.efeito))}
        title="Efeito no lucro operacional (R$)">
        {item.efeito === 0 ? '0' : comSinal(item.efeito, 0)}
      </span>
    </li>
  );
}

/**
 * A PONTE EM LISTA — DRE-PAINEL-02 (2), Gabriel 23/11 07:41: uma linha por passo (rótulo · barra · valor), o lucro de cada ponta na 1ª e
 * na última. O fato, o sinal, a cor e o texto vêm de `linhasDaPonte` (leitura.ts); aqui só se desenha.
 * ⚠ BARRA E NÚMERO NA MESMA COR (verde = ajuda o lucro, vermelho = tira). ⚠ UMA ESCALA SÓ para as 8 linhas (o maior |valor|), e a barra
 *   nunca fica abaixo de `BARRA_MINIMA` px: o passo pequeno é um bloco visível, nunca um risco. ⚠ Linha de 16px fixos, colunas em px.
 */
const BARRA_MINIMA = 6;
const COR_DA_BARRA: Record<TomDaPonte, string> = {
  total: '', ajuda: 'bg-green-600', tira: 'bg-red-500', neutro: 'bg-muted-foreground/40',
  sem: 'border border-dashed border-muted-foreground bg-muted',
};
const COR_DO_VALOR: Record<TomDaPonte, string> = {
  total: 'text-foreground font-medium', ajuda: 'text-green-700', tira: 'text-red-600', neutro: 'text-muted-foreground', sem: 'text-muted-foreground',
};
/** DRE-PAINEL-03: a ponte inteira (título + lista) a partir da coluna comparada — a mesma peça no painel e na aba "O que mudou" do Gráfico. */
export function PonteDoLucro({ atual, base, comparacao, rotuloBase, rotuloAtual }: {
  atual: DrePecLinhas; base: DrePecLinhas; comparacao: Comparacao; rotuloBase: string; rotuloAtual: string;
}) {
  const ponte = ponteDoLucroOperacional(base, atual);
  if (!ponte) return <p className="py-2 text-[10px] text-muted-foreground">Sem lucro operacional numa das pontas: não há ponte.</p>;
  return <Ponte linhas={linhasDaPonte(base, atual, ponte, rotuloBase, rotuloAtual, comparacao)} fecha={ponte.fecha} />;
}

function Ponte({ linhas, fecha }: { linhas: readonly LinhaDaPonte[]; fecha: boolean }) {
  const maior = Math.max(...linhas.map(l => Math.abs(l.valor ?? 0))) || 1;
  return (
    <table data-testid="dre-ponte" className="w-full border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}
      title={fecha ? 'Os passos somam a diferença ao centavo' : 'Sem a produção da Meta, os passos não explicam tudo: a diferença está no passo "sem meta"'}>
      <colgroup><col style={{ width: 196 }} /><col /><col style={{ width: 50 }} /></colgroup>
      <tbody>
        {linhas.map(l => (
          <tr key={l.chave} data-ponte-linha={l.chave} data-tom={l.tom}
            className={cn('h-[16px]', (l.chave === 'fim' || l.chave === 'inicio') ? '' : 'border-t border-border/30', l.chave === 'fim' && 'border-t border-border')}>
            <td className={cn('truncate pr-1 leading-[16px]', l.tom === 'total' && 'font-medium')} title={l.rotulo}>{l.rotulo}</td>
            <td className="px-1">
              <div data-ponte-barra="" className={cn('h-[9px] rounded-[1px]', COR_DA_BARRA[l.tom])}
                style={{
                  width: l.valor == null ? 24 : `${(Math.abs(l.valor) / maior) * 100}%`, minWidth: BARRA_MINIMA,
                  ...(l.tom === 'total' ? { backgroundColor: NAVY_TOTAL } : {}),
                }} />
            </td>
            <td className={cn('text-right tabular-nums leading-[16px]', COR_DO_VALOR[l.tom])} title={l.titulo}>{l.texto}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
