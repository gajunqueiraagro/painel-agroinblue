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
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import { usePastos } from '@/hooks/usePastos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { formatMoeda, formatNum, formatPercent, formatArroba, formatCabecas } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';
import { useFechamentoCompetencia } from '@/hooks/useFechamentoCompetencia';


interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoInicial?: string;
  mesInicial?: string;
  onNavigateSubTab?: (tab: string) => void;
}

export function IndicadoresTab({ lancamentos, saldosIniciais, anoInicial, mesInicial, onNavigateSubTab }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { bloqueado } = useRedirecionarPecuaria();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

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

  // Status de fechamento (apresentação apenas)
  const { mesFechado, temMesAberto } = useFechamentoCompetencia(fazendaId, Number(anoFiltro));
  const mesSelecionadoFechado = mesFechado(Number(mesFiltro));

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

  const c = ind.comparacoes;

  return (
    <div className="p-4 w-full animate-fade-in pb-20 space-y-4">
      {/* Seletores */}
      <div className="flex gap-2 items-center">
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
        {!mesSelecionadoFechado && (
          <span className="text-amber-500 text-xs" title="Mês não fechado — dados estimados por lançamentos">⚠️</span>
        )}
      </div>

      {/* BLOCO 1 — Indicadores Zootécnicos */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Indicadores Zootécnicos</h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Cabeças"
              valor={formatNum(ind.saldoFinalMes)}
              unidade="cab"
              compMensal={c.saldoFinalMes.mensal}
              compAnual={c.saldoFinalMes.anual}
              info={`Saldo final de cabeças no mês.\n\nMês: saldo inicial + entradas − saídas do mês.\nAcumulado: mesmo valor (posição final do mês selecionado).`}
            />
            <KpiCard
              label="Peso Total"
              valor={pesoTotalKg !== null ? formatNum(pesoTotalKg, 0) : '—'}
              unidade="kg"
              semBase={pesoTotalKg === null}
              info={`Peso total do rebanho.\n\nFórmula: Cabeças × Peso Médio Final.\nBase: dados de fechamento de pastos do mês.`}
            />
            <KpiCard
              label="Peso Médio"
              valor={ind.pesoMedioRebanhoKg !== null ? formatNum(ind.pesoMedioRebanhoKg, 1) : '—'}
              unidade="kg"
              estimado={ind.qualidade.pesoMedioEstimado}
              compMensal={c.pesoMedioRebanhoKg.mensal}
              compAnual={c.pesoMedioRebanhoKg.anual}
              semBase={ind.pesoMedioRebanhoKg === null}
              info={`Peso médio por cabeça no final do mês.\n\nBase: peso informado no fechamento de pastos (média ponderada por categoria).\nSe não houver fechamento, valor é estimado (*).`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="R$/cab"
              valor={ind.valorPorCabeca !== null ? formatMoeda(ind.valorPorCabeca) : '—'}
              small
              compMensal={c.valorPorCabeca.mensal}
              compAnual={c.valorPorCabeca.anual}
              semBase={ind.valorPorCabeca === null}
              info={`Valor médio por cabeça.\n\nFórmula: Valor do Rebanho ÷ Cabeças.\nReflete o ticket médio por animal.`}
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
              estimado={ind.qualidade.areaProdutivaEstimativa}
              info={`Área produtiva total em hectares.\n\nBase: soma da área dos pastos ativos cadastrados.\nSe não houver cadastro, usa fallback estimado (*).`} />
            <KpiCard label="UA Total" valor={formatNum(ind.uaTotal, 1)} unidade="UA"
              info={`Unidade Animal total.\n\nFórmula: Peso Total do rebanho ÷ 450 kg.\n1 UA = 450 kg de peso vivo.`} />
            <KpiCard label="UA/ha" valor={ind.uaHa !== null ? formatNum(ind.uaHa, 2) : '—'}
              compMensal={c.uaHa.mensal} compAnual={c.uaHa.anual}
              semBase={ind.uaHa === null}
              info={`Lotação no mês.\n\nFórmula: UA Total ÷ Área Produtiva.\nMede a pressão de pastejo no mês selecionado.`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="UA/ha méd. ano"
              valor={ind.uaHaMediaAno !== null ? formatNum(ind.uaHaMediaAno, 2) : '—'}
              compMensal={c.uaHaMediaAno.mensal}
              compAnual={c.uaHaMediaAno.anual}
              semBase={ind.uaHaMediaAno === null}
              info={`Lotação média acumulada no ano.\n\nFórmula: média aritmética dos valores de UA/ha de Janeiro até o mês selecionado.\nReflete a pressão de pastejo ao longo da safra.`}
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
              info={`Arrobas produzidas no mês (ganho biológico).\n\nFórmula: (Peso final − Peso inicial − Peso entradas + Peso saídas) ÷ 30.\nNÃO é o somatório das saídas.`}
            />
            <KpiCard
              label="@ prod. acum."
              valor={ind.arrobasProduzidasAcumulado !== null ? formatNum(ind.arrobasProduzidasAcumulado, 1) : '—'}
              unidade="@"
              compAnual={c.arrobasProduzidasAcumulado.anual}
              semBase={ind.arrobasProduzidasAcumulado === null}
              info={`Arrobas produzidas acumuladas (ganho biológico).\n\nFórmula: (Peso final − Peso inicial ano − Peso entradas acum. + Peso saídas acum.) ÷ 30.\nDe Janeiro até o mês selecionado.`}
            />
            <KpiCard
              label="@/ha acum."
              valor={ind.arrobasHaAcumuladoAno !== null ? formatNum(ind.arrobasHaAcumuladoAno, 2) : '—'}
              compAnual={c.arrobasHaAcumuladoAno.anual}
              semBase={ind.arrobasHaAcumuladoAno === null}
              info={`Produtividade acumulada por hectare (biológico).\n\nFórmula: @ produzidas (biológico) ÷ Área Produtiva.\nMede a eficiência da terra no período.`}
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
                  compMensal={c.gmdMes.mensal}
                  compAnual={c.gmdMes.anual}
                  info={`Ganho Médio Diário no mês.\n\nFórmula: (Peso final − Peso inicial − Peso entradas + Peso saídas) ÷ Rebanho médio ÷ Dias do mês.\nIsola o ganho biológico real.`}
                />
                <KpiCard
                  label="GMD acumulado"
                  valor={ind.gmdAcumulado !== null ? formatNum(ind.gmdAcumulado, 3) : '—'}
                  unidade="kg/dia"
                  compAnual={c.gmdAcumulado.anual}
                  info={`GMD médio acumulado no ano.\n\nMédia aritmética dos GMDs mensais de Janeiro até o mês selecionado.`}
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
              compAnual={c.desfruteCabecasAcumulado.anual}
              semBase={ind.desfruteCabecasAcumulado === null}
              info={`Desfrute em cabeças acumulado no ano.\n\nFórmula: (Saídas em cabeças no período ÷ Saldo inicial do ano) × 100.\nMede a taxa de extração do rebanho.`}
            />
            <KpiCard
              label="Desfrute @"
              valor={ind.desfruteArrobasAcumulado !== null ? formatNum(ind.desfruteArrobasAcumulado, 1) : '—'}
              unidade="%"
              compAnual={c.desfruteArrobasAcumulado.anual}
              semBase={ind.desfruteArrobasAcumulado === null}
              info={`Desfrute em arrobas acumulado no ano.\n\nFórmula: (@ desfrutadas ÷ @ do saldo inicial) × 100.\nBase de realização (saídas), não produção biológica.`}
            />
            <KpiCard
              label="@ desfrutadas"
              valor={formatNum(ind.arrobasSaidasAcumuladoAno, 1)}
              unidade="@"
              compAnual={c.arrobasDesfrutadasAcum.anual}
              info={`Total de arrobas desfrutadas (realizadas) no ano.\n\nSomatório de arrobas das saídas (vendas, abates, consumo, transf. saída) de Jan até o mês selecionado.\nBase comercial, não produção biológica.`}
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

      {/* Banner de mês não fechado */}
      {!mesSelecionadoFechado && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
          <span>⚠️</span>
          <span>
            Meses sem fechamento de pasto exibem dados estimados por lançamentos.
            Para dados oficiais, feche os pastos do mês em <strong>Lanç. Zoo.</strong>
          </span>
        </div>
      )}

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
