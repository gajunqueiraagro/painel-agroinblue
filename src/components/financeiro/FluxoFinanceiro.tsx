/**
 * Fluxo de Caixa Global — tabela 12 linhas, jan-dez + coluna Total.
 * Duas visualizações: Resumido (executivo) e Amplo (analítico com sub-categorias + filtros).
 * Base: data_pagamento + Conciliado.
 * SEMPRE GLOBAL — independente da fazenda selecionada.
 */
import { useState, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFluxoCaixa, type FluxoMensal, type FluxoFiltros } from '@/hooks/useFluxoCaixa';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { isRealizado } from '@/lib/financeiro/classificacao';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FmtMode = 'compact' | 'full';

const fmtK = (v: number): string => {
  if (v === 0) return '-';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};

const fmtFull = (v: number): string => {
  if (v === 0) return '-';
  return Math.round(v).toLocaleString('pt-BR');
};

const fmtVal = (v: number, mode: FmtMode): string =>
  mode === 'compact' ? fmtK(v) : fmtFull(v);

// ---------------------------------------------------------------------------
// Row definitions
// ---------------------------------------------------------------------------

type VisaoFluxo = 'resumido' | 'amplo';

interface RowDef {
  label: string;
  key: keyof FluxoMensal;
  bold?: boolean;
  indent?: number;
  tipo?: 'entrada' | 'saida' | 'saldo';
  amploOnly?: boolean;
  nivel?: 1 | 2 | 3;
}

const ROWS: RowDef[] = [
  { label: 'Saldo Inicial', key: 'saldoInicial', tipo: 'saldo' },

  { label: 'Total Entradas', key: 'totalEntradas', bold: true, tipo: 'entrada', nivel: 1 },
  { label: 'Receitas', key: 'receitas', indent: 1, tipo: 'entrada', nivel: 2 },
  { label: 'Receitas Pecuárias', key: 'receitasPec', indent: 2, tipo: 'entrada', amploOnly: true },
  { label: 'Receitas Agricultura', key: 'receitasAgri', indent: 2, tipo: 'entrada', amploOnly: true },
  { label: 'Outras Receitas', key: 'receitasOutras', indent: 2, tipo: 'entrada', amploOnly: true },
  { label: 'Outras Entradas', key: 'outrasEntradas', indent: 1, tipo: 'entrada', nivel: 2 },
  { label: 'Captação Financ. Pec.', key: 'captacaoPec', indent: 2, tipo: 'entrada', amploOnly: true },
  { label: 'Captação Financ. Agri.', key: 'captacaoAgri', indent: 2, tipo: 'entrada', amploOnly: true },
  { label: 'Aportes Pessoais', key: 'aportes', indent: 2, tipo: 'entrada', amploOnly: true },

  { label: 'Total Saídas', key: 'totalSaidas', bold: true, tipo: 'saida', nivel: 1 },
  { label: 'Dedução de Receitas', key: 'deducaoReceitas', indent: 1, tipo: 'saida', nivel: 2 },
  { label: 'Desemb. Produtivo', key: 'desembolsoProdutivo', indent: 1, tipo: 'saida', nivel: 2 },
  { label: 'Desemb. Produtivo Pec.', key: 'desembolsoPec', indent: 2, tipo: 'saida', amploOnly: true },
  { label: 'Desemb. Produtivo Agri.', key: 'desembolsoAgri', indent: 2, tipo: 'saida', amploOnly: true },
  { label: 'Reposição Bovinos', key: 'reposicao', indent: 1, tipo: 'saida', nivel: 2 },
  { label: 'Amortizações', key: 'amortizacoes', indent: 1, tipo: 'saida', nivel: 2 },
  { label: 'Amortizações Fin. Pec.', key: 'amortizacoesPec', indent: 2, tipo: 'saida', amploOnly: true },
  { label: 'Amortizações Fin. Agri.', key: 'amortizacoesAgri', indent: 2, tipo: 'saida', amploOnly: true },
  { label: 'Dividendos', key: 'dividendos', indent: 1, tipo: 'saida', nivel: 2 },

  { label: 'Saldo Final', key: 'saldoFinal', tipo: 'saldo', bold: true, nivel: 1 },
  { label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true, tipo: 'saldo', nivel: 1 },
];

const QUARTER_END = new Set([3, 6, 9]);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  fazendaAtualNome?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({ lancamentos, rateioADM, ano, mesAte, fazendaAtualNome }: Props) {
  const isMobile = useIsMobile();
  const [visao, setVisao] = useState<VisaoFluxo>('resumido');
  const [fmtMode, setFmtMode] = useState<FmtMode>('compact');

  // Hierarchical filters (Amplo mode)
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);
  const [filtroCentro, setFiltroCentro] = useState<string | null>(null);
  const [filtroSubcentro, setFiltroSubcentro] = useState<string | null>(null);

  const filtros: FluxoFiltros | undefined = (visao === 'amplo' && (filtroGrupo || filtroCentro || filtroSubcentro))
    ? { grupo: filtroGrupo, centro: filtroCentro, subcentro: filtroSubcentro }
    : undefined;

  const { meses, loading, saldoInicialAusente, saldoInicialAudit, lancamentosGlobais } =
    useFluxoCaixa(lancamentos, rateioADM, ano, mesAte, filtros);

  // Compute distinct values for hierarchical filters from raw realizados
  const { grupos, centros, subcentros } = useMemo(() => {
    const realizados = lancamentosGlobais.filter(l => isRealizado(l));
    const grupoSet = new Set<string>();
    const centroSet = new Set<string>();
    const subcentroSet = new Set<string>();

    for (const l of realizados) {
      const g = (l as any).grupo_custo || '';
      const c = (l as any).centro_custo || '';
      const s = (l as any).subcentro || '';
      if (g) grupoSet.add(g);
      if (filtroGrupo && g !== filtroGrupo) continue;
      if (c) centroSet.add(c);
      if (filtroCentro && c !== filtroCentro) continue;
      if (s) subcentroSet.add(s);
    }

    return {
      grupos: [...grupoSet].sort(),
      centros: [...centroSet].sort(),
      subcentros: [...subcentroSet].sort(),
    };
  }, [lancamentosGlobais, filtroGrupo, filtroCentro]);

  const clearFilters = () => {
    setFiltroGrupo(null);
    setFiltroCentro(null);
    setFiltroSubcentro(null);
  };

  const hasFilters = !!(filtroGrupo || filtroCentro || filtroSubcentro);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-2 max-w-full mx-auto space-y-2 animate-fade-in">
      {fazendaAtualNome && (
        <div className="flex items-start gap-2 text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">
            Fluxo de Caixa = <strong>caixa global consolidado</strong>.
          </span>
        </div>
      )}

      {saldoInicialAusente && (
        <div className="text-[9px] text-muted-foreground bg-muted rounded-md px-2 py-1">
          ⓘ Saldo inicial zerado — sem registros SALDO em Dez/{ano - 1}
        </div>
      )}

      {saldoInicialAudit && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-3 w-3" />
            Auditoria Saldo Inicial
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 text-[9px] bg-muted rounded-md px-2 py-1.5 space-y-0.5">
            <p><strong>Fonte:</strong> {saldoInicialAudit.fonte}</p>
            <p><strong>Período:</strong> {saldoInicialAudit.periodo}</p>
            <p><strong>Registros:</strong> {saldoInicialAudit.qtdRegistros}</p>
            {saldoInicialAudit.contas.length > 0 && (
              <p><strong>Contas:</strong> {saldoInicialAudit.contas.join(', ')}</p>
            )}
            <p><strong>Soma:</strong> R$ {saldoInicialAudit.somaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Card>
        <CardContent className="pt-2 pb-1">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <h3 className="text-xs font-bold text-card-foreground">
              Fluxo de Caixa Global
            </h3>
            <div className="flex items-center gap-1.5">
              {/* Toggle formato valores */}
              <div className="flex rounded border border-border overflow-hidden">
                <button
                  onClick={() => setFmtMode('compact')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    fmtMode === 'compact'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  k
                </button>
                <button
                  onClick={() => setFmtMode('full')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    fmtMode === 'full'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  123
                </button>
              </div>
              {/* Toggle Resumido / Amplo */}
              <div className="flex rounded border border-border overflow-hidden">
                <button
                  onClick={() => { setVisao('resumido'); clearFilters(); }}
                  className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    visao === 'resumido'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Resumido
                </button>
                <button
                  onClick={() => setVisao('amplo')}
                  className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    visao === 'amplo'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Amplo
                </button>
              </div>
            </div>
          </div>

          {/* Hierarchical filters — only in Amplo mode */}
          {visao === 'amplo' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <FilterSelect
                label="Grupo"
                value={filtroGrupo}
                options={grupos}
                onChange={(v) => { setFiltroGrupo(v); setFiltroCentro(null); setFiltroSubcentro(null); }}
              />
              {filtroGrupo && centros.length > 0 && (
                <FilterSelect
                  label="Centro"
                  value={filtroCentro}
                  options={centros}
                  onChange={(v) => { setFiltroCentro(v); setFiltroSubcentro(null); }}
                />
              )}
              {filtroCentro && subcentros.length > 0 && (
                <FilterSelect
                  label="Subcentro"
                  value={filtroSubcentro}
                  options={subcentros}
                  onChange={setFiltroSubcentro}
                />
              )}
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border bg-background transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                  Limpar
                </button>
              )}
            </div>
          )}

          <FluxoTable meses={meses} mesAte={mesAte} isMobile={isMobile} visao={visao} fmtMode={fmtMode} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterSelect — compact cascading dropdown
// ---------------------------------------------------------------------------

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-semibold text-muted-foreground">{label}:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-[9px] bg-background border border-border rounded px-1 py-0.5 max-w-[180px] truncate text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Todos</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

function getValueColor(val: number, row: RowDef, isAfter: boolean): string {
  if (isAfter) return 'text-muted-foreground/30';
  if (val === 0) return 'text-muted-foreground';
  if (row.tipo === 'entrada') return 'text-green-600 dark:text-green-400';
  if (row.tipo === 'saida') return 'text-red-600 dark:text-red-400';
  return val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

function FluxoTable({ meses, mesAte, isMobile, visao, fmtMode }: { meses: FluxoMensal[]; mesAte: number; isMobile: boolean; visao: VisaoFluxo; fmtMode: FmtMode }) {
  const visibleRows = useMemo(
    () => ROWS.filter(r => visao === 'amplo' || !r.amploOnly),
    [visao],
  );

  const totals = useMemo(() => {
    const upTo = meses.filter(m => m.mes <= mesAte);
    const result: Record<string, number> = {};
    for (const row of visibleRows) {
      if (row.key === 'saldoInicial') {
        result[row.key] = meses.length > 0 ? meses[0].saldoInicial : 0;
      } else if (row.key === 'saldoFinal') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoFinal : 0;
      } else if (row.key === 'saldoAcumulado') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoAcumulado : 0;
      } else {
        result[row.key] = upTo.reduce((s, m) => s + (m[row.key] as number), 0);
      }
    }
    return result;
  }, [meses, mesAte, visibleRows]);

  const getIndentClass = (row: RowDef) => {
    if (!row.indent) return '';
    if (row.indent === 2) return 'pl-5';
    return 'pl-3';
  };

  return (
    <div className="overflow-auto -mx-1 max-h-[60vh]">
      <table className="w-full min-w-[700px] text-[10px] tabular-nums" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: isMobile ? 100 : 150 }} />
          {meses.map(m => (
            <col key={m.mes} style={{ width: 62 }} />
          ))}
          <col style={{ width: 70 }} />
        </colgroup>
        <thead className="sticky top-0 z-20" style={{ background: 'hsl(var(--card))' }}>
          <tr className="border-b border-border">
            <th
              className="px-1 py-0.5 text-left text-[10px] font-bold text-muted-foreground sticky left-0 z-30"
              style={{ background: 'hsl(var(--card))' }}
            >
              
            </th>
            {meses.map(m => (
              <th
                key={m.mes}
                className={`px-1 py-0.5 text-right text-[10px] font-bold ${
                  m.mes > mesAte ? 'text-muted-foreground/40' : 'text-muted-foreground'
                } ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
                style={{ background: 'hsl(var(--card))' }}
              >
                {m.label}
              </th>
            ))}
            <th
              className="px-1 py-0.5 text-right text-[10px] font-extrabold text-foreground border-l-2 border-border"
              style={{ background: 'hsl(var(--muted))' }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => {
            const isSubSub = row.indent === 2;
            const nivel = row.nivel ?? 3;

            const rowBg =
              nivel === 1 ? 'bg-muted/60' :
              nivel === 2 ? 'bg-muted/20' :
              '';

            const rowFont =
              nivel === 1 ? 'font-bold text-[10px]' :
              nivel === 2 ? 'font-semibold text-[9px]' :
              'font-normal text-[9px]';

            return (
              <tr key={row.key} className={`border-b border-border/40 ${rowBg}`}>
                <td
                  className={`px-1 py-px text-left leading-tight ${rowFont} ${getIndentClass(row)} ${
                    isSubSub ? 'text-muted-foreground' : 'text-card-foreground'
                  } sticky left-0 ${nivel === 1 ? 'bg-muted/60' : nivel === 2 ? 'bg-muted/20' : 'bg-card'} z-10 truncate`}
                >
                  {row.label}
                </td>
                {meses.map(m => {
                  const val = m[row.key] as number;
                  const isAfter = m.mes > mesAte;
                  const colorClass = isSubSub && val === 0
                    ? 'text-muted-foreground/40'
                    : getValueColor(val, row, isAfter);

                  return (
                    <td
                      key={m.mes}
                      className={`px-1 py-px text-right leading-tight ${rowFont} ${colorClass} ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
                    >
                      {isAfter ? '-' : fmtVal(val, fmtMode)}
                    </td>
                  );
                })}
                <td className={`px-1 py-px text-right leading-tight ${rowFont} bg-muted border-l-2 border-border ${getValueColor(totals[row.key] || 0, row, false)}`}>
                  {fmtVal(totals[row.key] || 0, fmtMode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
