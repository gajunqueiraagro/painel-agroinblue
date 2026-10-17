/**
 * FIN-FINANC-28 · PASSO 4c — "O que falta pagar" v2 (mock `docs/mocks/mock-grafico-a-pagar-v2.html`, md5 cb2c0e01…). Aberto pelo card
 * "A pagar" de Compras parceladas (MENSAL) e pelo card "Parcelas a pagar" da aba Financiamentos (ANUAL). Fechar não mexe na lista.
 *
 * ⚠ ESTA PEÇA SÓ DESENHA: os números são de `graficoDeSaidas.ts` (o dono, em centavos, sobre o MESMO lote dos cards, com o MESMO
 *   recorte de vencimento). Nenhuma soma aqui.
 * ⚠ AS CORES SÃO AS DE SAÍDA (`COR_SAIDA`): laranja a pagar · violeta juros · vermelho vencido · cinza já pago. Azul é de entrada.
 * ⚠ SVG EM PIXELS REAIS (a regra do `preserveAspectRatio`): o modal tem largura fixa e o gráfico também (728px), então o viewBox é a
 *   própria medida — nenhuma fonte escala.
 * ⚠ CADA COLUNA TEM O TOTAL EM CIMA (pago + vencido + a pagar [+ juros]), 7,5px na cor do texto, com espaço reservado no topo; a
 *   linha de hoje (mensal) tem o rótulo ABAIXO do eixo, longe dos números das colunas.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { COR_SAIDA } from '@/lib/graficos/coresDeSaida';
import {
  aindaAPagarEmJaneiroDoGrafico, escalaDoEixo, graficoAnual, graficoMensal, maiorTotal, parcelasDoGrafico, pilhaDaColuna, rotuloCurto, tooltipDaColuna,
  type BaseDoPeriodo, type TipoDoSegmento, type GraficoDeSaidas, type IntervaloDeVencimento,
} from '@/lib/financiamentos/graficoDeSaidas';
import type { SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COR_DO_SEGMENTO: Record<TipoDoSegmento, string> = {
  pago: COR_SAIDA.pago, vencido: COR_SAIDA.vencido, aPagar: COR_SAIDA.aPagar, principal: COR_SAIDA.aPagar, juros: COR_SAIDA.juros,
};

export const LARGURA_DO_GRAFICO = 728;
export const ALTURA_DO_GRAFICO = 270;
/* margens: eixo Y à esquerda; em cima o lugar do número da coluna mais alta; embaixo letra do mês, ano e o "hoje" */
const M = { esq: 40, dir: 8, topo: 16, base: 36 };

function Numero({ rotulo, valor, tom, testid }: { rotulo: string; valor: string; tom?: string; testid: string }) {
  return (
    <div className="flex flex-col" data-testid={testid}>
      <span className="text-[10px] leading-[14px] text-muted-foreground">{rotulo}</span>
      <span className={`whitespace-nowrap text-[14px] font-semibold leading-[18px] tabular-nums ${tom ?? ''}`}>{valor}</span>
    </div>
  );
}

/** O gráfico, em SVG de pixels reais: barras compactas empilhadas, eixo com escala, grade clara, ano marcado, linha de hoje. */
export function GraficoDeSaidasSvg({ grafico, anual, hoje }: { grafico: GraficoDeSaidas; anual: boolean; hoje: string }) {
  const cols = grafico.colunas;
  const W = LARGURA_DO_GRAFICO; const H = ALTURA_DO_GRAFICO;
  const plotW = W - M.esq - M.dir; const plotH = H - M.topo - M.base; const baseY = M.topo + plotH;
  const marcas = escalaDoEixo(maiorTotal(grafico)); const topo = marcas[marcas.length - 1] || 1;
  const y = (cent: number) => baseY - (plotH * cent) / topo;
  const n = Math.max(cols.length, 1); const slot = plotW / n;
  const barra = Math.max(4, Math.min(anual ? 26 : 16, slot * 0.64));
  const x0 = (i: number) => M.esq + i * slot;
  /* hoje: dentro do mês de hoje, na proporção do dia */
  const iHoje = anual ? -1 : cols.findIndex((c) => c.chave === hoje.slice(0, 7));
  const dia = Number(hoje.slice(8, 10)); const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
  const xHoje = iHoje >= 0 ? x0(iHoje) + (slot * (dia - 0.5)) / diasNoMes : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fontFamily="Inter, sans-serif" role="img" aria-label={anual ? 'Parcelas por ano' : 'Parcelas por mês'} data-testid="grafico-svg">
      {marcas.map((m) => (
        <g key={m}>
          <line x1={M.esq} x2={W - M.dir} y1={y(m)} y2={y(m)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={M.esq - 4} y={y(m) + 3} fontSize={8} textAnchor="end" className="fill-muted-foreground">{m === 0 ? '0' : rotuloCurto(m)}</text>
        </g>
      ))}
      {/* hoje ATRÁS das colunas: a linha não risca o número da coluna (o rótulo dela fica embaixo do eixo) */}
      {xHoje !== null && (
        <g data-testid="linha-de-hoje">
          <line x1={xHoje} x2={xHoje} y1={M.topo} y2={baseY} stroke="#334155" strokeWidth={1} strokeDasharray="3 2" />
          <text x={xHoje + 3} y={baseY + 32} fontSize={8} className="fill-foreground">hoje {hoje.slice(8, 10)}/{hoje.slice(5, 7)}</text>
        </g>
      )}
      {cols.map((c, i) => {
        const cx = x0(i) + slot / 2; const xb = cx - barra / 2;
        return (
          <g key={c.chave} data-testid="coluna-grafico" data-total={c.totalCent}>
            <title>{tooltipDaColuna(c, anual)}</title>
            <rect x={x0(i)} y={M.topo} width={slot} height={plotH} fill="transparent" />
            {pilhaDaColuna(c, anual).map((s) => (
              <rect key={s.tipo} x={xb} y={y(s.baseCent + s.valorCent)} width={barra} height={Math.max(y(s.baseCent) - y(s.baseCent + s.valorCent), 0.5)}
                fill={COR_DO_SEGMENTO[s.tipo]} data-segmento={s.tipo} data-valor={s.valorCent} />
            ))}
            {c.totalCent > 0 && (
              <text x={cx} y={y(c.totalCent) - 3} fontSize={7.5} textAnchor="middle" className="fill-foreground stroke-card" strokeWidth={3} paintOrder="stroke" data-testid="rotulo-coluna">{rotuloCurto(c.totalCent)}</text>
            )}
            {c.marcaAno && <line x1={x0(i)} x2={x0(i)} y1={M.topo} y2={baseY} stroke="#94a3b8" strokeDasharray="2 2" />}
            <text x={cx} y={baseY + 11} fontSize={8} textAnchor="middle" className="fill-muted-foreground">{c.rotulo}</text>
            {c.marcaAno && <text x={x0(i) + 2} y={baseY + 22} fontSize={8} fontWeight={600} className="fill-muted-foreground">{c.marcaAno}</text>}
          </g>
        );
      })}
      <line x1={M.esq} x2={W - M.dir} y1={baseY} y2={baseY} stroke="#94a3b8" strokeWidth={1} />
    </svg>
  );
}

export function CronogramaEmAbertoDialog({ aberto, aoFechar, modo, situacoes, hoje, recorte, intervalo }: {
  aberto: boolean;
  aoFechar: () => void;
  modo: 'mensal' | 'anual';
  /** as situações do lote das linhas do recorte (as mesmas dos cards) */
  situacoes: readonly (SituacaoDoContrato | null | undefined)[];
  /** a data local da tela (a mesma que o lote usou) */
  hoje: string;
  /** o que os filtros deixaram, escrito no cabeçalho ("42 compras · filtro Ativo") */
  recorte: string;
  /** o filtro de vencimento da aba: só as parcelas no intervalo */
  intervalo?: IntervaloDeVencimento | null;
}) {
  const [base, setBase] = useState<BaseDoPeriodo>('civil');
  const anual = modo === 'anual';
  const ps = useMemo(() => parcelasDoGrafico(situacoes, hoje, intervalo), [situacoes, hoje, intervalo]);
  const g = useMemo(() => (anual ? graficoAnual(ps, base) : graficoMensal(ps, base)), [ps, anual, base]);
  const jan = aindaAPagarEmJaneiroDoGrafico(g, hoje);
  /* mês 'AAAA-MM' (o hífen o diferencia da safra 'AAAA/AA'), ano ou safra como vieram */
  const ultima = g.ultima ? (g.ultima.includes('-') ? `${MESES[Number(g.ultima.slice(5, 7)) - 1]}/${g.ultima.slice(2, 4)}` : g.ultima) : '—';
  const periodo = g.colunas.length === 0 ? '' : anual ? `${g.colunas[0].rotuloLongo} a ${g.colunas[g.colunas.length - 1].rotuloLongo}`
    : `${g.colunas[0].rotuloLongo} a ${g.colunas[g.colunas.length - 1].rotuloLongo} · ${base === 'civil' ? 'anos completos' : 'safras completas'}`;
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[440px] w-[760px] max-w-[760px] flex-col gap-0 overflow-hidden p-0" data-testid="cronograma-em-aberto">
        <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[12px] font-semibold">O que falta pagar</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 truncate text-[10px] text-primary-foreground/80" title={recorte}>
            {anual ? 'ano a ano' : 'mês a mês'} · {recorte}
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3">
          <div className="flex h-[34px] shrink-0 items-start gap-7" data-testid="numeros-do-cronograma">
            {anual ? (<>
              <Numero testid="num-principal" rotulo="Principal a pagar" valor={reais(g.principalCent)} />
              <Numero testid="num-juros" rotulo="Juros previstos" valor={reais(g.jurosCent)} />
              <Numero testid="num-vencidos" rotulo="Vencidos" valor={reais(g.vencidoCent)} tom="text-[#b91c1c]" />
              <Numero testid="num-ultima" rotulo="Último vencimento" valor={ultima} />
            </>) : (<>
              <Numero testid="num-a-pagar" rotulo="A pagar hoje" valor={reais(g.aPagarHojeCent)} />
              <Numero testid="num-vencidas" rotulo="Vencidas" valor={reais(g.vencidoCent)} tom={g.vencidoCent > 0 ? 'text-[#b91c1c]' : undefined} />
              <Numero testid="num-janeiro" rotulo={`Ainda a pagar em ${jan.rotulo}`} valor={reais(jan.cent)} />
              <Numero testid="num-ultima" rotulo="Última parcela" valor={ultima} />
            </>)}
          </div>
          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <Segmentado valor={base} onEscolher={setBase} altura={22} fonte={10}
              opcoes={[{ valor: 'civil', rotulo: anual ? 'Ano civil' : 'Ano civil (jan–dez)' }, { valor: 'safra', rotulo: anual ? 'Safra' : 'Safra (jul–jun)' }]} />
            <span className="text-[10px] text-muted-foreground" data-testid="periodo-do-grafico">{periodo}</span>
          </div>
          <div className="min-h-0 flex-1" data-testid="grafico-do-cronograma">
            {g.colunas.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Nenhuma parcela no recorte.</div>
            ) : <GraficoDeSaidasSvg grafico={g} anual={anual} hoje={hoje} />}
          </div>
          <div className="flex h-[16px] shrink-0 items-center gap-3 text-[10px] text-muted-foreground" data-testid="legenda-do-grafico">
            <Legenda cor={COR_SAIDA.pago} texto={anual ? 'já pago no ano' : 'já pago'} />
            <Legenda cor={COR_SAIDA.vencido} texto="vencido e não pago" />
            <Legenda cor={COR_SAIDA.aPagar} texto={anual ? 'principal a pagar' : 'a pagar'} />
            {anual && <Legenda cor={COR_SAIDA.juros} texto="juros previstos" />}
            <span className="ml-auto">passe o mouse na coluna: pago · vencido · a pagar{anual ? ' · juros' : ''}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm" style={{ background: cor }} />{texto}</span>;
}
