/**
 * MovimentacaoHistoricoModal — modal Jan-Dez para os 9 cards de Movimentação
 * da tela Rebanho/Visão Geral.
 *
 * Marco "Modal Jan-Dez — Refinamentos UX" (Fase 5):
 *   - Toggle interno "Por mês / Acumulado" (state local; viewModeInicial vem da tela)
 *   - tipoAcumulado agora respeitado: 'media' para taxas/razões (desfrute cab,
 *     arroba_media, preco_arroba), 'soma' para fluxos (cab/@/R$ total)
 *   - Variações vs ano ant. e vs META, com semântica de cor (corPrincipal='vermelho'
 *     inverte interpretação — Mortes: queda=bom)
 *   - Layout dual: "Por mês" → tabela transposta 5 linhas × 12 meses (modal mais largo);
 *     "Acumulado" → 6 colunas linhas (mais estreito)
 *   - Gráfico ComposedChart reflete o viewMode interno (séries acumuladas ou não)
 *
 * Continua SEPARADO do IndicadorHistoricoModal (V2Home) — não toca aquele.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export interface MovimentacaoHistoricoModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  unidade?: string;
  formatoValor: 'inteiro' | 'decimal1' | 'decimal2' | 'moeda' | 'moedaAbreviada';
  /** Mês selecionado (1-12) — destaca coluna/linha; em "Acumulado" define janela Jan→mês. */
  mesAtual: number;
  anoAtual: number;
  /** Série de 13 posições: [0] = Dez ano-1 (zero placeholder), [1..12] = Jan..Dez. */
  serieAno: number[];
  serieAnoAnt?: number[];
  serieMeta?: number[];
  /** Semântica de agregação. Determina o cálculo em viewMode='periodo'. */
  tipoAcumulado?: 'soma' | 'media';
  /** Cor principal: 'azul' (default, entradas/desfrute) ou 'vermelho' (Mortes, custos)
   *  — 'vermelho' inverte interpretação das variações (queda=verde). */
  corPrincipal?: 'azul' | 'vermelho';
  /** viewMode inicial do toggle interno; mesmo do filtro global da tela. */
  viewModeInicial?: 'mes' | 'periodo';
}

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

// ─── Helpers numéricos ─────────────────────────────────────────────────────

/**
 * Aplica acumulado a uma série 13-posições ([0]=Dez ano-1, [1..12]=Jan..Dez).
 * Em viewMode='mes' devolve a série intacta. Em 'periodo' acumula Jan→mês:
 *  - tipo='soma': Σ valores
 *  - tipo='media': Σ valores / nº de meses com dado válido (média ponderada simples)
 * Posição [0] (Dez ano-1) é preservada — não entra no acumulado.
 */
function aplicarAcumulado(
  serie: (number | null)[],
  modo: 'mes' | 'periodo',
  tipo: 'soma' | 'media',
): (number | null)[] {
  if (modo === 'mes') return serie;
  const out: (number | null)[] = [];
  let acc = 0;
  let count = 0;
  for (let i = 0; i < serie.length; i++) {
    const v = serie[i];
    if (i === 0) {
      out.push(v); // Dez ano-1: não acumula
      continue;
    }
    if (v != null && !isNaN(v as number)) {
      acc += v as number;
      count += 1;
    }
    out.push(tipo === 'media' ? (count > 0 ? acc / count : null) : acc);
  }
  return out;
}

function calcVar(real: number | null, comparacao: number | null): number | null {
  if (real == null || comparacao == null || isNaN(real) || isNaN(comparacao) || comparacao === 0) return null;
  return ((real - comparacao) / Math.abs(comparacao)) * 100;
}

function fmtVar(v: number | null): string {
  if (v == null || isNaN(v)) return '—';
  const sinal = v > 0 ? '↑' : v < 0 ? '↓' : '';
  return `${sinal} ${Math.abs(v).toFixed(0)}%`;
}

function corVar(v: number | null, cor: 'azul' | 'vermelho'): string {
  if (v == null || isNaN(v) || Math.abs(v) < 0.5) return 'text-muted-foreground/50';
  const subiu = v > 0;
  // cor='vermelho' (ex: Mortes): queda = bom → inverte
  const eBom = cor === 'vermelho' ? !subiu : subiu;
  return eBom ? 'text-emerald-600' : 'text-red-600';
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function MovimentacaoHistoricoModal({
  open, onClose,
  titulo, subtitulo, unidade,
  formatoValor,
  mesAtual, anoAtual,
  serieAno, serieAnoAnt, serieMeta,
  tipoAcumulado = 'soma',
  corPrincipal = 'azul',
  viewModeInicial = 'mes',
}: MovimentacaoHistoricoModalProps) {
  const [viewMode, setViewMode] = useState<'mes' | 'periodo'>(viewModeInicial);

  if (!open) return null;

  const COR_ATUAL = corPrincipal === 'vermelho'
    ? { stroke: '#DC2626', dotLight: '#FCA5A5', text: 'text-red-700' }
    : { stroke: '#185FA5', dotLight: '#B5D4F4', text: 'text-primary' };

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

  // Normaliza séries 13-pos (1-based) — null em vez de NaN.
  const normalize = (s?: number[]): (number | null)[] => {
    if (!s) return Array(13).fill(null);
    return s.map(v => v != null && !isNaN(v) ? v : null);
  };

  const baseAno    = normalize(serieAno);
  const baseAnoAnt = normalize(serieAnoAnt);
  const baseMeta   = normalize(serieMeta);

  // Aplica acumulado conforme viewMode + tipoAcumulado (idêntico p/ as 3 séries).
  const sAno    = aplicarAcumulado(baseAno,    viewMode, tipoAcumulado);
  const sAnoAnt = aplicarAcumulado(baseAnoAnt, viewMode, tipoAcumulado);
  const sMeta   = aplicarAcumulado(baseMeta,   viewMode, tipoAcumulado);

  const get = (s: (number | null)[], mes: number): number | null => {
    if (mes < 1 || mes > 12) return null;
    return s[mes];
  };

  const valorAtual = get(sAno, mesAtual);

  // Detecta presença de meta/anoAnt p/ render condicional.
  const hasAnoAnt = baseAnoAnt.some(v => v != null);
  const hasMeta   = baseMeta.some(v => v != null);

  // Dados do gráfico (Jan-Dez).
  const dadosGrafico = MESES_LABELS.map((mes, idx) => {
    const m = idx + 1;
    // Real: corta no mesAtual (Jan→mesAtual)
    const atual       = m <= mesAtual ? get(sAno, m) : null;
    const anoAnterior = get(sAnoAnt, m);
    const meta        = get(sMeta, m);
    return {
      mes,
      atual,
      anoAnterior,
      meta,
      atualArea: atual,
      anoAnteriorArea: anoAnterior,
    };
  });

  // Tooltip
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

  // Subtitle informativo
  const subtitleInfo = viewMode === 'mes'
    ? `Valores mensais — ${MESES_LABELS[mesAtual - 1]} ${anoAtual} destacado`
    : `Acumulado Jan→${MESES_LABELS[mesAtual - 1]} ${anoAtual}`;

  // Largura do modal: "Por mês" precisa de mais espaço (tabela 12 colunas).
  const larguraModal = viewMode === 'mes' ? 'max-w-5xl' : 'max-w-2xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col max-h-[94vh]',
          larguraModal,
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground leading-tight">{titulo}</h2>
            {subtitulo && (
              <p className="text-[11px] font-light text-muted-foreground/70 leading-snug mt-0.5">{subtitulo}</p>
            )}
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitleInfo}</p>

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
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Gráfico Jan-Dez */}
          <div className="px-3 pb-2 pt-3">
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#888780' }} stroke="#E8E6DF" />
                <YAxis tick={{ fontSize: 10, fill: '#888780' }} tickFormatter={fmtAxis} stroke="#E8E6DF" width={48} />
                <Tooltip content={<CustomTooltip />} />
                {hasAnoAnt && (
                  <Area
                    type="monotone" dataKey="anoAnteriorArea" stroke="none"
                    fill="#000000" fillOpacity={0.04}
                    isAnimationActive={false} connectNulls={false}
                    legendType="none" activeDot={false}
                  />
                )}
                <Area
                  type="monotone" dataKey="atualArea" stroke="none"
                  fill="#000000" fillOpacity={0.09}
                  isAnimationActive={false} connectNulls={false}
                  legendType="none" activeDot={false}
                />
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
                <Line
                  type="monotone" dataKey="atual"
                  stroke={COR_ATUAL.stroke} strokeWidth={2}
                  connectNulls={false} isAnimationActive={false}
                  dot={(props: any) => {
                    const isSel = props.index === mesAtual - 1;
                    return isSel
                      ? <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={COR_ATUAL.stroke} />
                      : <circle key={props.index} cx={props.cx} cy={props.cy} r={2} fill={COR_ATUAL.dotLight} />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            <div className="flex gap-5 px-1 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-[2px] rounded" style={{ background: COR_ATUAL.stroke }} />
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

          {/* Tabela: layout muda conforme viewMode */}
          <div className="px-5 pt-3 pb-2">
            <div className="border-t border-border/30 pt-3 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Detalhe mensal</p>
            </div>
            {viewMode === 'mes'
              ? <TabelaPorMes
                  sAno={sAno} sAnoAnt={sAnoAnt} sMeta={sMeta}
                  hasAnoAnt={hasAnoAnt} hasMeta={hasMeta}
                  mesAtual={mesAtual} anoAtual={anoAtual}
                  corPrincipal={corPrincipal}
                  fmtValor={fmtValor}
                />
              : <TabelaAcumulado
                  sAno={sAno} sAnoAnt={sAnoAnt} sMeta={sMeta}
                  hasAnoAnt={hasAnoAnt} hasMeta={hasMeta}
                  mesAtual={mesAtual} anoAtual={anoAtual}
                  corPrincipal={corPrincipal}
                  fmtValor={fmtValor}
                />
            }
          </div>

          <div className="px-5 pb-3 pt-2 text-[11px] text-muted-foreground text-center">
            Clique fora para fechar
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tabela "Por mês": 5 linhas × 12 meses (transposta) ────────────────────

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

function TabelaPorMes({ sAno, sAnoAnt, sMeta, hasAnoAnt, hasMeta, mesAtual, anoAtual, corPrincipal, fmtValor }: TabelaProps) {
  // Cada linha = série/variação. Cada coluna = mês.
  // Render só para [1..12]; ignora [0] (Dez ano-1).
  const cellBase = 'text-right py-1 px-1.5 tabular-nums';
  const headerCellBase = 'text-right py-1 px-1.5 font-medium';

  const renderCellMes = (m: number, valor: number | null, classe?: string) => {
    const sel = m === mesAtual;
    return (
      <td
        key={m}
        className={cn(cellBase, classe, sel && 'bg-muted/30 font-medium')}
      >
        {valor != null ? fmtValor(valor) : <span className="text-muted-foreground/40">—</span>}
      </td>
    );
  };

  const renderCellVar = (m: number, valor: number | null) => {
    const sel = m === mesAtual;
    return (
      <td
        key={m}
        className={cn(cellBase, corVar(valor, corPrincipal), sel && 'bg-muted/30 font-medium')}
      >
        {valor != null ? fmtVar(valor) : <span className="text-muted-foreground/40">—</span>}
      </td>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-1 px-1.5 font-medium text-muted-foreground sticky left-0 bg-background">
              {/* canto */}
            </th>
            {MESES_LABELS.map((label, idx) => {
              const sel = idx + 1 === mesAtual;
              return (
                <th
                  key={label}
                  className={cn(headerCellBase, 'text-muted-foreground', sel && 'bg-muted/30 text-foreground')}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Linha 1: Real ano atual */}
          <tr className="border-b border-border/20">
            <td className="text-left py-1 px-1.5 font-medium sticky left-0 bg-background" style={{ color: corPrincipal === 'vermelho' ? '#DC2626' : '#185FA5' }}>
              {anoAtual}
            </td>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const v = m <= mesAtual ? sAno[m] : null;
              return renderCellMes(m, v);
            })}
          </tr>

          {/* Linha 2: Δ vs ano anterior */}
          {hasAnoAnt && (
            <tr className="border-b border-border/20">
              <td className="text-left py-1 px-1.5 text-muted-foreground sticky left-0 bg-background">
                Δ vs {anoAtual - 1}
              </td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const real = m <= mesAtual ? sAno[m] : null;
                return renderCellVar(m, calcVar(real, sAnoAnt[m]));
              })}
            </tr>
          )}

          {/* Linha 3: Δ vs META */}
          {hasMeta && (
            <tr className="border-b border-border/20">
              <td className="text-left py-1 px-1.5 text-muted-foreground sticky left-0 bg-background">
                Δ vs Meta
              </td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const real = m <= mesAtual ? sAno[m] : null;
                return renderCellVar(m, calcVar(real, sMeta[m]));
              })}
            </tr>
          )}

          {/* Linha 4: Real ano anterior */}
          {hasAnoAnt && (
            <tr className="border-b border-border/20">
              <td className="text-left py-1 px-1.5 text-muted-foreground sticky left-0 bg-background">
                {anoAtual - 1}
              </td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => renderCellMes(m, sAnoAnt[m], 'text-muted-foreground'))}
            </tr>
          )}

          {/* Linha 5: META */}
          {hasMeta && (
            <tr>
              <td className="text-left py-1 px-1.5 text-orange-600 sticky left-0 bg-background">
                Meta {anoAtual}
              </td>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => renderCellMes(m, sMeta[m], 'text-orange-600'))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tabela "Acumulado": 6 colunas × 12 meses (linhas) ─────────────────────

function TabelaAcumulado({ sAno, sAnoAnt, sMeta, hasAnoAnt, hasMeta, mesAtual, anoAtual, corPrincipal, fmtValor }: TabelaProps) {
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
