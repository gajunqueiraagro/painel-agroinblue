/**
 * MovimentacaoHistoricoModal — modal Jan-Dez para os 9 cards de Movimentação.
 *
 * Recebe CardData inteiro (com todas as 5 lentes pré-calculadas pelo hook).
 * Modal tem state local de lente + viewMode — independente da tela. Tela
 * passa lenteInicial + viewModeInicial como ponto de partida; usuário pode
 * navegar entre lentes/modos dentro do modal sem afetar os 9 cards.
 *
 * Conceito:
 *  - "Por mês": gráfico de BARRAS (valores discretos mensais)
 *  - "Acumulado": gráfico de LINHA (curva crescente)
 *  - Tabela: sempre vertical (linhas=meses, colunas=séries+variações)
 *  - Acumulado correto: hook entrega seriesAcumulada já com taxa/média via
 *    Σ numerador / Σ denominador (não "média de médias")
 *
 * Continua SEPARADO do IndicadorHistoricoModal (V2Home).
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { CardData, Lente, TipoMov } from '@/v2/hooks/useMovimentacoesAgregadas';

export interface MovimentacaoHistoricoModalProps {
  open: boolean;
  onClose: () => void;
  /** Label do card (ex: 'Abates', 'Vendas'). */
  titulo: string;
  /** TipoMov — usado para escolher formato de número adequado à lente. */
  tipo: TipoMov;
  /** CardData completo com todas as 5 lentes pré-calculadas. */
  data: CardData;
  /** Lente atual da tela — modal inicia nela mas pode mudar internamente. */
  lenteInicial: Lente;
  /** Lentes aplicáveis ao card — define quais botões aparecem no filtro. */
  lentesAplicaveis: Lente[];
  mesAtual: number;
  anoAtual: number;
  viewModeInicial?: 'mes' | 'periodo';
  /** Cor principal — 'vermelho' (ex: Mortes) inverte interpretação das variações. */
  corPrincipal?: 'azul' | 'vermelho';
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const LENTES_LABELS: Record<Lente, string> = {
  cab:          'Cabeças',
  arroba_total: '@ Totais',
  arroba_media: '@ Média',
  preco_arroba: 'R$/@',
  valor_total:  'R$ Total',
};

// ─── Helpers de lente (locais ao modal — dependem do state de lente) ────────

function getUnidade(tipo: TipoMov, lente: Lente): string {
  // 'desfrute_pct' sempre %, independente da lente.
  // 'desfrute' agora segue lente normal (cab = Σ cabeças desfrutadas).
  if (tipo === 'desfrute_pct') return '%';
  switch (lente) {
    case 'cab':          return 'cab';
    case 'arroba_total': return '@';
    case 'arroba_media': return '@/cab';
    case 'preco_arroba': return 'R$/@';
    case 'valor_total':  return 'R$';
  }
}

function getFormato(tipo: TipoMov, lente: Lente): 'inteiro' | 'decimal1' | 'decimal2' | 'moeda' | 'moedaAbreviada' {
  if (tipo === 'desfrute_pct') return 'decimal1'; // %
  switch (lente) {
    case 'cab':          return 'inteiro';
    case 'arroba_total': return 'inteiro';
    case 'arroba_media': return 'decimal1';
    case 'preco_arroba': return 'moeda';
    case 'valor_total':  return 'moedaAbreviada';
  }
}

// ─── Formatadores ───────────────────────────────────────────────────────────

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtRAbreviado = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const fmt = (n: number, suf: string) => `R$ ${n.toFixed(1).replace('.', ',')}${suf}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

// ─── Helpers de variação ────────────────────────────────────────────────────

function calcVar(real: number | null, comparacao: number | null): number | null {
  if (real == null || comparacao == null || isNaN(real) || isNaN(comparacao) || comparacao === 0) return null;
  return ((real - comparacao) / Math.abs(comparacao)) * 100;
}

function fmtVar(v: number | null): string {
  if (v == null || isNaN(v)) return '—';
  const sinal = v > 0 ? '↑' : v < 0 ? '↓' : '';
  return `${sinal} ${Math.abs(v).toFixed(0)}%`;
}

/** Cor da variação na tabela (icon ↑↓ + texto pequeno). */
function corVar(v: number | null, cor: 'azul' | 'vermelho'): string {
  if (v == null || isNaN(v) || Math.abs(v) < 0.5) return 'text-muted-foreground/50';
  const subiu = v > 0;
  const eBom = cor === 'vermelho' ? !subiu : subiu;
  return eBom ? 'text-emerald-600' : 'text-red-600';
}

/** Cor das variações do header (↗/↙ + percentagem). Padrão IndicadorHistoricoModal. */
function corDelta(d: number | null, cor: 'azul' | 'vermelho'): string {
  if (d == null || isNaN(d) || Math.abs(d) < 0.05) return 'text-muted-foreground';
  const subiu = d > 0;
  const eBom = cor === 'vermelho' ? !subiu : subiu;
  return eBom ? 'text-green-600' : 'text-red-500';
}

function normalize(s: number[] | undefined): (number | null)[] {
  if (!s) return Array(13).fill(null);
  return s.map(v => (v != null && !isNaN(v)) ? v : null);
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function MovimentacaoHistoricoModal({
  open, onClose,
  titulo, tipo,
  data,
  lenteInicial,
  lentesAplicaveis,
  mesAtual, anoAtual,
  viewModeInicial = 'mes',
  corPrincipal = 'azul',
}: MovimentacaoHistoricoModalProps) {
  const [lente, setLente] = useState<Lente>(lenteInicial);
  const [viewMode, setViewMode] = useState<'mes' | 'periodo'>(viewModeInicial);

  if (!open) return null;

  const COR_ATUAL = corPrincipal === 'vermelho'
    ? { stroke: '#DC2626', dotLight: '#FCA5A5', text: 'text-red-700' }
    : { stroke: '#185FA5', dotLight: '#B5D4F4', text: 'text-primary' };

  const unidade = getUnidade(tipo, lente);
  const formatoValor = getFormato(tipo, lente);

  const fmtValor = (v: number | null | undefined): string => {
    if (formatoValor === 'inteiro')        return fmtN(v, 0) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal1')       return fmtN(v, 1) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'decimal2')       return fmtN(v, 2) + (unidade ? ' ' + unidade : '');
    if (formatoValor === 'moeda')          return fmtR(v);
    if (formatoValor === 'moedaAbreviada') return fmtRAbreviado(v);
    return String(v ?? '—');
  };

  const fmtAxis = (v: number | null | undefined): string => {
    if (v == null || isNaN(v)) return '';
    if (formatoValor === 'decimal1')       return fmtN(v, 1);
    if (formatoValor === 'decimal2')       return fmtN(v, 2);
    if (formatoValor === 'moedaAbreviada') {
      const abs = Math.abs(v);
      if (abs >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + 'B';
      if (abs >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
      if (abs >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + 'K';
      return fmtN(v, 0);
    }
    return fmtN(v, 0);
  };

  // Escolhe conjunto de séries conforme viewMode (vêm prontas do hook).
  const seriesPorMes = data.seriesJanDez[lente];
  const seriesAcum   = data.seriesAcumulada[lente];

  const sAno    = viewMode === 'periodo' ? normalize(seriesAcum.real)   : normalize(seriesPorMes.real);
  const sAnoAnt = viewMode === 'periodo' ? normalize(seriesAcum.anoAnt) : normalize(seriesPorMes.anoAnt);
  const sMeta   = viewMode === 'periodo' ? normalize(seriesAcum.meta)   : normalize(seriesPorMes.meta);

  const get = (s: (number | null)[], mes: number): number | null => {
    if (mes < 1 || mes > 12) return null;
    return s[mes];
  };

  const valorAtual = get(sAno, mesAtual);

  // Variações vs mês ant / ano ant / META. Séries já refletem viewMode:
  //   - "Por mês":   compara valor mensal isolado
  //   - "Acumulado": compara Jan→m vs Jan→(m-1) / vs ano-1 Jan→m / vs Meta Jan→m
  const valorMesAnt = mesAtual > 1 ? get(sAno, mesAtual - 1) : null;
  const valorAnoAnt = get(sAnoAnt, mesAtual);
  const valorMeta   = get(sMeta, mesAtual);

  const deltaMes  = calcVar(valorAtual, valorMesAnt);
  const deltaAno  = calcVar(valorAtual, valorAnoAnt);
  const deltaMeta = calcVar(valorAtual, valorMeta);

  const hasAnoAnt = sAnoAnt.some(v => v != null);
  const hasMeta   = sMeta.some(v => v != null);

  const dadosGrafico = MESES_LABELS.map((mes, idx) => {
    const m = idx + 1;
    const atual       = m <= mesAtual ? get(sAno, m) : null;
    const anoAnterior = get(sAnoAnt, m);
    const meta        = get(sMeta, m);
    return {
      mes, atual, anoAnterior, meta,
      atualArea: atual,
      anoAnteriorArea: anoAnterior,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const order = ['atual', 'anoAnterior', 'meta'];
    const allowedKeys = new Set(order);
    const displayName = (key: string): string => {
      if (key === 'atual')        return String(anoAtual);
      if (key === 'anoAnterior')  return String(anoAtual - 1);
      if (key === 'meta')         return `Meta ${anoAtual}`;
      return key;
    };
    const entries = payload
      .filter((e: any) => allowedKeys.has(String(e.dataKey)) && e.value != null)
      .sort((a: any, b: any) => order.indexOf(a.dataKey) - order.indexOf(b.dataKey));
    return (
      <div className="rounded-sm border border-border/20 bg-background/60 backdrop-blur-[2px] px-2 py-1 text-[11px] leading-tight">
        <p className="font-medium text-foreground/85 text-[10px] mb-0.5">{label}</p>
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: entry.color }} />
            <span className="text-foreground/90">{fmtValor(entry.value)}</span>
            <span className="text-muted-foreground/80 text-[10px]">{displayName(entry.dataKey)}</span>
          </div>
        ))}
      </div>
    );
  };

  const subtitleInfo = `${LENTES_LABELS[lente]} · ${
    viewMode === 'mes' ? 'Por mês' : `Acumulado Jan→${MESES_LABELS[mesAtual - 1]}`
  }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col max-h-[94vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground leading-tight">{titulo}</h2>
            <p className="text-[11px] font-light text-muted-foreground/85 mt-0.5">{subtitleInfo}</p>

            {/* Filtro de lente — só aparece se card tem mais de uma lente aplicável */}
            {lentesAplicaveis.length > 1 && (
              <div className="mt-2 inline-flex bg-muted rounded-md p-0.5 gap-0.5 flex-wrap">
                {lentesAplicaveis.map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLente(l)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                      lente === l ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {LENTES_LABELS[l]}
                  </button>
                ))}
              </div>
            )}

            {/* Toggle Por mês / Acumulado */}
            <div className="mt-2 inline-flex bg-muted rounded-md p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('mes')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  viewMode === 'mes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Por mês
              </button>
              <button
                type="button"
                onClick={() => setViewMode('periodo')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  viewMode === 'periodo' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Acumulado
              </button>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-1.5 justify-end">
              <span className={`text-3xl font-bold ${COR_ATUAL.text}`}>{fmtValor(valorAtual)}</span>
              <span className="text-sm text-muted-foreground">
                {MESES_LABELS[mesAtual - 1]} {anoAtual}
              </span>
            </div>
            {deltaMes != null && (
              <div className={`text-[10px] font-normal leading-[1.2] flex items-center justify-end gap-0.5 ${corDelta(deltaMes, corPrincipal)}`}>
                <span>{deltaMes >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMes >= 0 ? '+' : ''}{deltaMes.toFixed(1)}% vs mês</span>
              </div>
            )}
            {deltaAno != null && (
              <div className={`text-[10px] font-normal leading-[1.2] flex items-center justify-end gap-0.5 ${corDelta(deltaAno, corPrincipal)}`}>
                <span>{deltaAno >= 0 ? '↗' : '↙'}</span>
                <span>{deltaAno >= 0 ? '+' : ''}{deltaAno.toFixed(1)}% vs ano ant.</span>
              </div>
            )}
            {deltaMeta != null && (
              <div className={`text-[10px] font-normal leading-[1.2] flex items-center justify-end gap-0.5 ${corDelta(deltaMeta, corPrincipal)}`}>
                <span>{deltaMeta >= 0 ? '↗' : '↙'}</span>
                <span>{deltaMeta >= 0 ? '+' : ''}{deltaMeta.toFixed(1)}% vs META</span>
              </div>
            )}
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Gráfico Jan-Dez — barras em 'mes', linha em 'periodo' */}
          <div className="px-3 pb-2 pt-3">
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#888780' }} stroke="#E8E6DF" />
                <YAxis tick={{ fontSize: 10, fill: '#888780' }} tickFormatter={fmtAxis} stroke="#E8E6DF" width={48} />
                <Tooltip content={<CustomTooltip />} />

                {viewMode === 'periodo' && hasAnoAnt && (
                  <Area
                    type="monotone" dataKey="anoAnteriorArea" stroke="none"
                    fill="#000000" fillOpacity={0.04}
                    isAnimationActive={false} connectNulls={false}
                    legendType="none" activeDot={false}
                  />
                )}
                {viewMode === 'periodo' && (
                  <Area
                    type="monotone" dataKey="atualArea" stroke="none"
                    fill="#000000" fillOpacity={0.09}
                    isAnimationActive={false} connectNulls={false}
                    legendType="none" activeDot={false}
                  />
                )}

                {hasAnoAnt && (
                  <Line
                    type="monotone" dataKey="anoAnterior"
                    stroke="#B4B2A9" strokeWidth={1.5} strokeDasharray="4 4"
                    dot={{ r: 2, fill: '#B4B2A9' }}
                    connectNulls={false} isAnimationActive={false}
                  />
                )}
                {hasMeta && (
                  <Line
                    type="monotone" dataKey="meta"
                    stroke="#F97316" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={{ r: 2, fill: '#F97316' }}
                    connectNulls={false} isAnimationActive={false}
                  />
                )}

                {viewMode === 'mes' ? (
                  <Bar
                    dataKey="atual"
                    fill={COR_ATUAL.stroke}
                    fillOpacity={0.85}
                    isAnimationActive={false}
                    radius={[2, 2, 0, 0]}
                  />
                ) : (
                  <Line
                    type="monotone"
                    dataKey="atual"
                    stroke={COR_ATUAL.stroke}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const isSel = props.index === mesAtual - 1;
                      return isSel
                        ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                        : <circle key={props.index} cx={props.cx} cy={props.cy} r={2} fill={COR_ATUAL.dotLight} />;
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            <div className="flex gap-5 px-1 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {viewMode === 'mes'
                  ? <div className="w-3 h-3 rounded-sm" style={{ background: COR_ATUAL.stroke, opacity: 0.85 }} />
                  : <div className="w-6 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />}
                <span className="text-xs text-muted-foreground">{anoAtual}</span>
              </div>
              {hasAnoAnt && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#B4B2A9" strokeWidth="2" strokeDasharray="4 3" /></svg>
                  <span className="text-xs text-muted-foreground">{anoAtual - 1}</span>
                </div>
              )}
              {hasMeta && (
                <div className="flex items-center gap-1.5">
                  <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#F97316" strokeWidth="2" strokeDasharray="6 3" /></svg>
                  <span className="text-xs text-muted-foreground">Meta {anoAtual}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabela sempre vertical */}
          <div className="px-5 pt-3 pb-2">
            <div className="border-t border-border/30 pt-3 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Detalhe mensal</p>
            </div>
            <TabelaVertical
              sAno={sAno} sAnoAnt={sAnoAnt} sMeta={sMeta}
              hasAnoAnt={hasAnoAnt} hasMeta={hasMeta}
              mesAtual={mesAtual} anoAtual={anoAtual}
              corPrincipal={corPrincipal}
              fmtValor={fmtValor}
            />
          </div>

          <div className="px-5 pb-3 pt-2 text-[11px] text-muted-foreground text-center">
            Clique fora para fechar
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tabela vertical (linhas = meses, colunas = séries + variações) ────────

interface TabelaProps {
  sAno: (number | null)[];
  sAnoAnt: (number | null)[];
  sMeta: (number | null)[];
  hasAnoAnt: boolean;
  hasMeta: boolean;
  mesAtual: number;
  anoAtual: number;
  corPrincipal: 'azul' | 'vermelho';
  fmtValor: (v: number | null | undefined) => string;
}

function TabelaVertical({ sAno, sAnoAnt, sMeta, hasAnoAnt, hasMeta, mesAtual, anoAtual, corPrincipal, fmtValor }: TabelaProps) {
  const cellBase = 'py-1.5 text-right tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-1.5 font-medium text-muted-foreground">Mês</th>
            <th className="text-right py-1.5 font-medium" style={{ color: corPrincipal === 'vermelho' ? '#DC2626' : '#185FA5' }}>{anoAtual}</th>
            {hasAnoAnt && <th className="text-right py-1.5 font-medium text-muted-foreground">{anoAtual - 1}</th>}
            {hasMeta   && <th className="text-right py-1.5 font-medium text-orange-600">Meta {anoAtual}</th>}
            {hasAnoAnt && <th className="text-right py-1.5 font-medium text-muted-foreground">Δ vs {anoAtual - 1}</th>}
            {hasMeta   && <th className="text-right py-1.5 font-medium text-muted-foreground">Δ vs Meta</th>}
          </tr>
        </thead>
        <tbody>
          {MESES_LABELS.map((mes, idx) => {
            const m = idx + 1;
            const real = m <= mesAtual ? sAno[m] : null;
            const aAnt = sAnoAnt[m];
            const aMeta = sMeta[m];
            const dVsAnt  = calcVar(real, aAnt);
            const dVsMeta = calcVar(real, aMeta);
            const sel = m === mesAtual;
            return (
              <tr key={mes} className={cn('border-b border-border/20', sel && 'bg-muted/30 font-medium')}>
                <td className="py-1.5 text-muted-foreground">{mes}</td>
                <td className={cellBase}>
                  {real != null ? fmtValor(real) : <span className="text-muted-foreground/50">—</span>}
                </td>
                {hasAnoAnt && (
                  <td className={cn(cellBase, 'text-muted-foreground')}>
                    {aAnt != null ? fmtValor(aAnt) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                )}
                {hasMeta && (
                  <td className={cn(cellBase, 'text-orange-600')}>
                    {aMeta != null ? fmtValor(aMeta) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                )}
                {hasAnoAnt && (
                  <td className={cn(cellBase, corVar(dVsAnt, corPrincipal))}>
                    {dVsAnt != null ? fmtVar(dVsAnt) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                )}
                {hasMeta && (
                  <td className={cn(cellBase, corVar(dVsMeta, corPrincipal))}>
                    {dVsMeta != null ? fmtVar(dVsMeta) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
