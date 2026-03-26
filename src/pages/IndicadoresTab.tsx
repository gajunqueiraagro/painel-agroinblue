/**
 * Indicadores Zootécnicos v1 — leitura executiva.
 * Consome exclusivamente useIndicadoresZootecnicos (base oficial consolidada).
 * NÃO faz nenhum cálculo próprio, exceto peso total = cab × peso médio.
 */

import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Info } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';


interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoInicial?: string;
  mesInicial?: string;
  onNavigateSubTab?: (tab: string) => void;
}

export function IndicadoresTab({ lancamentos, saldosIniciais, anoInicial, mesInicial, onNavigateSubTab }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const globalFazendaIds = useMemo(() => {
    if (fazendaId !== '__global__') return undefined;
    return fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id);
  }, [fazendaId, fazendas]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useStickyState(anoInicial || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useStickyState(mesInicial || String(new Date().getMonth() + 1).padStart(2, '0'));

  const ind = useIndicadoresZootecnicos(
    fazendaId, Number(anoFiltro), Number(mesFiltro),
    lancamentos, saldosIniciais, pastos, categorias, globalFazendaIds,
  );

  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  // Derivação simples: peso total = cab × peso médio
  const pesoTotalKg = ind.saldoFinalMes > 0 && ind.pesoMedioRebanhoKg !== null
    ? ind.saldoFinalMes * ind.pesoMedioRebanhoKg
    : null;

  // Alertas relevantes (max 3)
  const alertas: string[] = [];
  if (ind.qualidade.pesoMedioEstimado)
    alertas.push('Peso médio estimado — realize fechamento de pastos para maior precisão');
  if (ind.qualidade.areaProdutivaEstimativa)
    alertas.push('Área produtiva usando fallback — cadastre pastos ativos com área');
  if (!ind.qualidade.valorRebanhoFechado && ind.valorRebanho !== null)
    alertas.push('Valor do rebanho em aberto — feche o mês para oficializar');
  const alertasVisiveis = alertas.slice(0, 3);

  return (
    <div className="p-4 max-w-lg mx-auto animate-fade-in pb-20 space-y-4">
      {/* Seletores */}
      <div className="flex gap-2">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-24 touch-target text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-28 touch-target text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES_COLS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* BLOCO 1 — Estoque */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Estoque</h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Cabeças"
              valor={formatNum(ind.saldoFinalMes)}
              unidade="cab"
              comparacao={ind.comparacoes.saldoFinalMes}
            />
            <KpiCard
              label="Peso Total"
              valor={pesoTotalKg !== null ? formatNum(pesoTotalKg, 0) : '—'}
              unidade="kg"
              semBase={pesoTotalKg === null}
            />
            <KpiCard
              label="Peso Médio"
              valor={ind.pesoMedioRebanhoKg !== null ? formatNum(ind.pesoMedioRebanhoKg, 1) : '—'}
              unidade="kg"
              estimado={ind.qualidade.pesoMedioEstimado}
              comparacao={ind.comparacoes.pesoMedioRebanhoKg}
              semBase={ind.pesoMedioRebanhoKg === null}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Valor Rebanho"
              valor={ind.valorRebanho !== null ? formatMoedaCompacto(ind.valorRebanho) : '—'}
              comparacao={ind.comparacoes.valorRebanho}
              semBase={ind.valorRebanho === null}
            />
            <KpiCard
              label="R$/cab"
              valor={ind.valorPorCabeca !== null ? formatMoeda(ind.valorPorCabeca) : '—'}
              small
              semBase={ind.valorPorCabeca === null}
            />
            <div className="flex flex-col justify-end">
              {ind.valorRebanho !== null && onNavigateSubTab && (
                <button
                  className="text-xs text-primary underline-offset-2 hover:underline text-left"
                  onClick={() => onNavigateSubTab('valor')}
                >
                  Ver fechamento →
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2 — Lotação */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Lotação</h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Área Prod." valor={formatNum(ind.areaProdutiva, 1)} unidade="ha"
              estimado={ind.qualidade.areaProdutivaEstimativa} />
            <KpiCard label="UA Total" valor={formatNum(ind.uaTotal, 1)} unidade="UA" />
            <KpiCard label="UA/ha" valor={ind.uaHa !== null ? formatNum(ind.uaHa, 2) : '—'}
              comparacao={ind.comparacoes.uaHa} semBase={ind.uaHa === null} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="UA/ha méd. ano"
              valor={ind.uaHaMediaAno !== null ? formatNum(ind.uaHaMediaAno, 2) : '—'}
              comparacao={ind.comparacoes.uaHaMediaAno}
              semBase={ind.uaHaMediaAno === null}
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 3 — Produção (arrobas produzidas) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Produção</h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="@ prod. mês"
              valor={ind.arrobasProduzidasMes !== null ? formatNum(ind.arrobasProduzidasMes, 1) : '—'}
              unidade="@"
              semBase={ind.arrobasProduzidasMes === null}
            />
            <KpiCard
              label="@ prod. acum."
              valor={ind.arrobasProduzidasAcumulado !== null ? formatNum(ind.arrobasProduzidasAcumulado, 1) : '—'}
              unidade="@"
              comparacao={ind.comparacoes.arrobasProduzidasAcumulado}
              semBase={ind.arrobasProduzidasAcumulado === null}
            />
            <KpiCard
              label="@/ha acum."
              valor={ind.arrobasHaAcumuladoAno !== null ? formatNum(ind.arrobasHaAcumuladoAno, 2) : '—'}
              comparacao={ind.comparacoes.arrobasHaAcumuladoAno}
              semBase={ind.arrobasHaAcumuladoAno === null}
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 4 — Desempenho (GMD) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Desempenho</h3>
          {ind.qualidade.gmdDisponivel ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="GMD mês"
                  valor={ind.gmdMes !== null ? formatNum(ind.gmdMes, 3) : '—'}
                  unidade="kg/dia"
                  comparacao={ind.comparacoes.gmdMes}
                />
                <KpiCard
                  label="GMD acumulado"
                  valor={ind.gmdAcumulado !== null ? formatNum(ind.gmdAcumulado, 3) : '—'}
                  unidade="kg/dia"
                  comparacao={ind.comparacoes.gmdAcumulado}
                />
              </div>
              <GmdDetalheSheet abertura={ind.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>Dados insuficientes para calcular GMD. Informe pesos nos lançamentos e saldos iniciais.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 5 — Desfrute (acumulado) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Desfrute — Acumulado {anoFiltro}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Desfrute cab."
              valor={ind.desfruteCabecasAcumulado !== null ? formatNum(ind.desfruteCabecasAcumulado, 1) : '—'}
              unidade="%"
              comparacao={ind.comparacoes.desfruteCabecasAcumulado}
              semBase={ind.desfruteCabecasAcumulado === null}
            />
            <KpiCard
              label="Desfrute @"
              valor={ind.desfruteArrobasAcumulado !== null ? formatNum(ind.desfruteArrobasAcumulado, 1) : '—'}
              unidade="%"
              comparacao={ind.comparacoes.desfruteArrobasAcumulado}
              semBase={ind.desfruteArrobasAcumulado === null}
            />
            <KpiCard
              label="@ desfrutadas"
              valor={formatNum(ind.arrobasSaidasAcumuladoAno, 1)}
              unidade="@"
              comparacao={ind.comparacoes.arrobasDesfrutadasAcum}
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 6 — Alertas */}
      {alertasVisiveis.length > 0 && (
        <div className="space-y-1.5">
          {alertasVisiveis.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* BLOCO 7 — Histórico Comparativo */}
      <HistoricoComparativo
        historico={ind.historico}
        comparacoesHistorico={ind.comparacoesHistorico}
        mesAtual={Number(mesFiltro)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useStickyState(initial: string): [string, (v: string) => void] {
  return useState(initial);
}

function formatMoedaCompacto(val: number): string {
  if (val >= 1_000_000) return `R$ ${formatNum(val / 1_000_000, 2)}M`;
  if (val >= 1_000) return `R$ ${formatNum(val / 1_000, 1)}mil`;
  return formatMoeda(val);
}
