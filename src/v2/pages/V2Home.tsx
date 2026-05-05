import { useEffect, useMemo, useRef, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import type { StatusValidacaoArea } from '@/hooks/usePainelConsultorData';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useFinanciamentosPainel } from '@/hooks/useFinanciamentosPainel';
import { IndicadorHistoricoModal } from '@/v2/components/IndicadorHistoricoModal';
import { useHistoricoIndicador, type HistoricoIndicadorKey } from '@/hooks/useHistoricoIndicador';
import { supabase } from '@/integrations/supabase/client';

const fmtN = (v: number | null | undefined, dec = 0) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface MetricTileProps {
  label: string;
  value: string | null;
  unit?: string;
  loading?: boolean;
  pending?: boolean;
  tone?: 'default' | 'positive' | 'negative' | 'blue';
  status?: string | null;
  deltaMes?: number | null;
  deltaAno?: number | null;
  deltaMeta?: number | null;
  onClick?: () => void;
}

function MetricTile({ label, value, unit, loading, pending, tone = 'default', status, deltaMes, deltaAno, deltaMeta, onClick }: MetricTileProps) {
  const valColor =
    tone === 'positive' ? 'text-emerald-700' :
    tone === 'negative' ? 'text-red-700' :
    tone === 'blue'     ? 'text-primary' :
    'text-foreground';
  return (
    <div
      onClick={onClick}
      className={`min-w-0${onClick ? ' cursor-pointer' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={`text-[1.4rem] font-black leading-none tabular-nums ${pending ? 'text-muted-foreground/30' : valColor}`}>
        {loading
          ? <span className="inline-block w-20 h-6 bg-muted/50 rounded animate-pulse align-middle" />
          : status
            ? <span className="text-[0.75rem] font-semibold text-amber-600">{status}</span>
            : <>{value ?? '—'}{unit && value ? <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span> : null}</>
        }
      </p>
      <div className="mt-1 space-y-px">
        {deltaMes != null
          ? <p className={`text-[10px] font-medium ${deltaMes >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {deltaMes >= 0 ? '↑' : '↓'} {Math.abs(deltaMes).toFixed(1)}% vs mês
            </p>
          : <p className="text-[10px] text-muted-foreground/40">— vs mês</p>
        }
        {deltaAno != null
          ? <p className={`text-[10px] font-medium ${deltaAno >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {deltaAno >= 0 ? '↑' : '↓'} {Math.abs(deltaAno).toFixed(1)}% vs ano ant.
            </p>
          : <p className="text-[10px] text-muted-foreground/40">— vs ano ant.</p>
        }
        {deltaMeta != null
          ? <p className={`text-[10px] font-medium ${deltaMeta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {deltaMeta >= 0 ? '↑' : '↓'} {Math.abs(deltaMeta).toFixed(1)}% vs META
            </p>
          : <p className="text-[10px] text-muted-foreground/40">— vs META</p>
        }
      </div>
    </div>
  );
}

function SectionBlock({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground">({subtitle})</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {children}
      </div>
    </div>
  );
}

export function V2Home({ ano, mes, viewMode = 'mes', onViewModeChange }: {
  ano: string;
  mes: string;
  viewMode?: 'mes' | 'periodo';
  onViewModeChange?: (v: 'mes' | 'periodo') => void;
}) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal, fazendasComPecuaria } = useFazenda();
  const fazendaIdsPecuaria = useMemo(
    () => fazendasComPecuaria.map(f => f.id),
    [fazendasComPecuaria],
  );
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const mesNum = parseInt(mes);
  const anoNum = parseInt(ano);
  const isPeriodo = viewMode === 'periodo';

  const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const ml = isPeriodo
    ? `Jan–${MES_ABREV[mesNum - 1]} ${ano}`
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const [modalIndicador, setModalIndicador] = useState<string | null>(null);

  const [globalParcial, setGlobalParcial] = useState(false);
  const gapCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isGlobal || !clienteAtual?.id) {
      setGlobalParcial(false);
      gapCheckedRef.current = null;
      return;
    }
    const key = `${clienteAtual.id}-${anoNum}`;
    if (gapCheckedRef.current === key) return;
    gapCheckedRef.current = key;

    let cancelled = false;
    supabase.rpc('fn_zoot_cache_has_gap' as any, {
      p_cliente_id: clienteAtual.id,
      p_ano: anoNum,
    }).then(({ data }) => {
      if (!cancelled) setGlobalParcial(!!data);
    });
    return () => { cancelled = true; };
  }, [isGlobal, clienteAtual?.id, anoNum]);

  // Lançamentos compartilhados — carregados uma única vez, reutilizados pelas 3 chamadas de usePainelConsultorData abaixo.
  const { lancamentos: lancPecShared } = useLancamentos({ ano: anoNum });
  const { lancamentos: lancFinShared, rateioADM } = useFinanceiro({ ano: anoNum });
  // Não passar externo enquanto ainda está carregando (length = 0)
  // Undefined = hook interno roda; array com dados = hook interno desligado
  const sharedLanc = {
    lancPecExterno: lancPecShared.length > 0 ? lancPecShared : undefined,
    lancFinExterno: lancFinShared.length > 0 ? lancFinShared : undefined,
  };

  const {
    cabecas, pesoMedio, gmd, arrobas, desfrute,
    receita, desembolso, resultado, valorRebanhoMes: valorReb,
    areaProdutivaMes, lotUaHa, kgHa, statusArea, faltandoCount,
    dadosCompletos,
    seriesMensais, seriesMeta, cabecasIndicador, pesoMedioIndicador, gmdIndicador, uaHaIndicador, kgHaIndicador, arrobasIndicador,
    loading: loadingPainel,
  } = usePainelConsultorData({ ano: anoNum, mes: mesNum, viewMode, incluirComparativos: true, ...sharedLanc });

  // ── Histórico multi-ano (auxiliar legado, só dispara com modal aberto p/ indicador permitido) ──
  const HIST_KEYS_PERMITIDAS: HistoricoIndicadorKey[] = ['cabecas', 'pesoMedio', 'arrobas', 'gmd', 'desfrute'];
  const histAtivo = modalIndicador != null
    && (HIST_KEYS_PERMITIDAS as string[]).includes(modalIndicador);
  // Valor oficial do anoAtual e da meta — vêm do hook principal e são repassados
  // ao histórico p/ que a barra do anoAtual bata 100% com o topo do modal.
  const valorOficialAnoAtual: number | null = histAtivo
    ? (modalIndicador === 'cabecas'   ? (cabecasIndicador?.valor   ?? null)
     : modalIndicador === 'pesoMedio' ? (pesoMedioIndicador?.valor ?? null)
     : modalIndicador === 'gmd'       ? (gmdIndicador?.valor       ?? null)
     : modalIndicador === 'arrobas'   ? (arrobasIndicador?.valor   ?? null)
     : modalIndicador === 'desfrute'  ? desfrute
     : null)
    : null;
  const valorOficialMetaAnoAtual: number | null = histAtivo
    ? (modalIndicador === 'cabecas'   ? (cabecasIndicador?.serieMetaIndicador?.[mesNum] ?? null)
     : modalIndicador === 'pesoMedio' ? (pesoMedioIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'gmd'       ? (gmdIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'arrobas'   ? (arrobasIndicador?.serieMeta?.[mesNum] ?? null)
     : null)
    : null;
  const {
    historico: historicoAno,
    historicoMeta: historicoAnoMeta,
    loading: loadingHistorico,
  } = useHistoricoIndicador({
    enabled: histAtivo,
    clienteId: clienteAtual?.id,
    fazendaId: isGlobal ? null : fazendaAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    indicadorKey: (histAtivo ? modalIndicador : 'cabecas') as HistoricoIndicadorKey,
    mesAtual: mesNum,
    viewMode,
    anoAtual: anoNum,
    anoInicio: anoNum - 6,
    valorOficialAnoAtual,
    valorOficialMetaAnoAtual,
  });

  // Comparativos — sempre modo 'mes', nunca 'periodo'
  const mesAntNum = mesNum > 1 ? mesNum - 1 : null;
  const dadosMesAnt = usePainelConsultorData({
    ano: anoNum,
    mes: mesAntNum ?? mesNum,
    viewMode,
    ...sharedLanc,
  });
  const dadosAnoAnt = usePainelConsultorData({
    ano: anoNum - 1,
    mes: mesNum,
    viewMode,
    ...sharedLanc,
  });

  const calcVar = (atual: number | null, base: number | null): number | null => {
    if (atual == null || base == null || base === 0) return null;
    return ((atual - base) / base) * 100;
  };

  const calcDeltaV = (atual: number | null | undefined, base: number | null | undefined): number | null => {
    if (atual == null || base == null || isNaN(atual) || isNaN(base) || base === 0) return null;
    return ((atual - base) / base) * 100;
  };

  // Só usar comparativo de mês anterior se existir mês anterior real
  // E só exibir comparativos zootécnicos se dados atuais estiverem completos
  const dadosZootCompletos = !loadingPainel && cabecas != null && cabecas > 0;

  const vsMes = (campo: number | null, baseCampo: number | null) =>
    dadosZootCompletos && mesAntNum != null ? calcVar(campo, baseCampo) : null;

  const vsAno = (campo: number | null, baseCampo: number | null) =>
    dadosZootCompletos ? calcVar(campo, baseCampo) : null;

  const msgArea = (s: StatusValidacaoArea): string | null => {
    if (s === 'ok' || s === 'carregando') return null;
    if (s === 'incompleto')          return `⚠ ${faltandoCount} fazenda${faltandoCount !== 1 ? 's' : ''} sem snapshot`;
    if (s === 'p1_aberto')           return '⚠ P1 não fechado';
    if (s === 'p1_fechado_sem_snap') return '⚠ P1 fechado sem snapshot';
    if (s === 'sem_snapshot')        return '⚠ Snapshot não gerado';
    if (s === 'sem_area')            return '⚠ Área não cadastrada';
    return null;
  };

  const mesAte = isPeriodo ? 12 : mesNum;
  const { meses: mesesFluxo, loading: loadingFluxo } = useFluxoCaixa(lancFinShared, rateioADM, anoNum, mesAte);
  const caixaValor = useMemo(() => {
    if (loadingFluxo || !mesesFluxo.length) return null;
    const sorted = [...mesesFluxo].sort((a, b) => a.mes - b.mes);
    return isPeriodo
      ? sorted[sorted.length - 1]?.saldoFinal ?? null
      : sorted.find(m => m.mes === mesNum)?.saldoFinal ?? null;
  }, [mesesFluxo, mesNum, isPeriodo, loadingFluxo]);

  const { kpis: finKpis, loading: loadingDivida } = useFinanciamentosPainel(
    anoNum, 'todos', isPeriodo ? 'todos' : mesNum,
  );
  const endividamentoValor = loadingDivida ? null : (finKpis?.saldoDevedor?.total?.total ?? 0);

  const resultadoTone = resultado == null ? 'default' : resultado >= 0 ? 'positive' : 'negative';

  return (
    <div className="px-4 py-5 space-y-4 max-w-7xl">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isGlobal ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
        </p>
        {onViewModeChange && (
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => onViewModeChange('mes')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                !isPeriodo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              No mês
            </button>
            <button
              onClick={() => onViewModeChange('periodo')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                isPeriodo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              No período
            </button>
          </div>
        )}
      </div>

      {!dadosCompletos && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
          ⚠️ Dados zootécnicos incompletos no Global. Reprocesse o cache/fechamento das fazendas antes de analisar.
        </div>
      )}

      {globalParcial && isGlobal && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-yellow-400/60 bg-yellow-50/80 px-4 py-2.5 text-sm text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-900/20 dark:text-yellow-300">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>
            Dados globais podem estar incompletos — existem fazendas pecuárias sem
            fechamento ou cache zootécnico no ano {anoNum}.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <SectionBlock title="Produção" subtitle="o que a fazenda entregou">
          <MetricTile label={cabecasIndicador?.label ?? 'CABEÇAS'} value={fmtN(cabecasIndicador?.valor ?? null)} unit="cab" loading={loadingPainel}
            deltaMes={cabecasIndicador?.deltaMes ?? null}
            deltaAno={cabecasIndicador?.deltaAno ?? null}
            deltaMeta={cabecasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('cabecas')} />
          <MetricTile label={pesoMedioIndicador?.label ?? 'PESO MÉDIO FINAL'} value={fmtN(pesoMedioIndicador?.valor ?? null, 1)} unit="kg" loading={loadingPainel}
            deltaMes={pesoMedioIndicador?.deltaMes ?? null}
            deltaAno={pesoMedioIndicador?.deltaAno ?? null}
            deltaMeta={pesoMedioIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('pesoMedio')} />
          <MetricTile label={arrobasIndicador?.label ?? '@ PRODUZIDAS NO MÊS'} value={fmtN(arrobasIndicador?.valor ?? null, 1)} unit="@" loading={loadingPainel}
            deltaMes={arrobasIndicador?.deltaMes ?? null}
            deltaAno={arrobasIndicador?.deltaAno ?? null}
            deltaMeta={arrobasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('arrobas')} />
          <MetricTile label="Desfrute cab." value={fmtN(desfrute)} unit="cab" loading={loadingPainel}
            deltaMes={vsMes(desfrute, dadosMesAnt.desfrute)}
            deltaAno={vsAno(desfrute, dadosAnoAnt.desfrute)}
            onClick={() => setModalIndicador('desfrute')} />
          <MetricTile label={gmdIndicador?.label ?? 'GMD'} value={fmtN(gmdIndicador?.valor ?? null, 3)} unit="kg/dia" loading={loadingPainel}
            deltaMes={gmdIndicador?.deltaMes ?? null}
            deltaAno={gmdIndicador?.deltaAno ?? null}
            deltaMeta={gmdIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('gmd')} />
          <MetricTile label="Valor rebanho" value={fmtR(valorReb)} loading={loadingPainel}
            onClick={() => setModalIndicador('valorRebanho')} />
        </SectionBlock>

        <SectionBlock title="Eficiência" subtitle="do uso da área">
          <MetricTile label="Área produtiva" value={fmtN(areaProdutivaMes, 0)} unit="ha"
            loading={statusArea === 'carregando'} status={msgArea(statusArea)}
            deltaMes={vsMes(areaProdutivaMes, dadosMesAnt.areaProdutivaMes)}
            deltaAno={vsAno(areaProdutivaMes, dadosAnoAnt.areaProdutivaMes)} />
          <MetricTile label={uaHaIndicador?.label ?? 'UA/HA NO MÊS'} value={fmtN(uaHaIndicador?.valor ?? null, 2)} loading={statusArea === 'carregando'} status={statusArea !== 'ok' ? msgArea(statusArea) : null}
            deltaMes={uaHaIndicador?.deltaMes ?? null}
            deltaAno={uaHaIndicador?.deltaAno ?? null}
            deltaMeta={uaHaIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('uaHa')} />
          <MetricTile label={kgHaIndicador?.label ?? 'KG VIVO/HA NO MÊS'} value={fmtN(kgHaIndicador?.valor ?? null, 1)} unit="kg/ha" loading={statusArea === 'carregando'} status={statusArea !== 'ok' ? msgArea(statusArea) : null}
            deltaMes={kgHaIndicador?.deltaMes ?? null}
            deltaAno={kgHaIndicador?.deltaAno ?? null}
            deltaMeta={kgHaIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('kgHa')} />
        </SectionBlock>

        <SectionBlock title="Financeiro Produtivo" subtitle="receita × custo por @">
          <MetricTile label="Receita pecuária" value={fmtR(receita)} loading={loadingPainel}
            deltaMes={vsMes(receita, dadosMesAnt.receita)}
            deltaAno={vsAno(receita, dadosAnoAnt.receita)} />
          <MetricTile label="Desembolso total" value={fmtR(desembolso)} loading={loadingPainel} />
          <MetricTile label="Resultado operacional" value={fmtR(resultado)} loading={loadingPainel} tone={resultadoTone}
            deltaMes={vsMes(resultado, dadosMesAnt.resultado)}
            deltaAno={vsAno(resultado, dadosAnoAnt.resultado)} />
          <MetricTile label="Preço de Venda R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Custo Produtivo R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Margem por @" value={null} unit="R$/@" pending />
        </SectionBlock>

        <SectionBlock title="Estrutura Financeira" subtitle="posição patrimonial">
          <MetricTile label="Caixa disponível" value={fmtR(caixaValor)} loading={loadingFluxo} tone="blue" />
          <MetricTile label="Endividamento" value={fmtR(endividamentoValor)} loading={loadingDivida} tone={endividamentoValor != null && endividamentoValor > 0 ? 'negative' : 'default'} />
          <MetricTile
            label="Dívida / rebanho"
            value={loadingDivida ? null : fmtN(finKpis?.alavancagem?.percentual ?? null, 1)}
            unit="%"
            loading={loadingDivida}
            tone={
              finKpis?.alavancagem?.status === 'critico' ? 'negative'
              : finKpis?.alavancagem?.status === 'atencao' ? 'negative'
              : 'default'
            }
          />
          {(() => {
            const pizza = finKpis?.pizzaVencimentos ?? [];
            const curto = pizza.find(p => p.nome?.toLowerCase().includes('curto'));
            const longo = pizza.find(p => p.nome?.toLowerCase().includes('longo'));
            const total = (curto?.valor ?? 0) + (longo?.valor ?? 0);
            const pctCurto = total > 0 ? (curto?.valor ?? 0) / total * 100 : null;
            return (
              <MetricTile
                label="Curto vs longo prazo"
                value={pctCurto != null
                  ? `${fmtN(pctCurto, 0)}% curto / ${fmtN(100 - pctCurto, 0)}% longo`
                  : null}
                loading={loadingDivida}
              />
            );
          })()}
        </SectionBlock>

      </div>

      {modalIndicador === 'cabecas' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={cabecasIndicador?.titulo ?? ''}
          unidade="cab" formatoValor="inteiro"
          subtitulo={cabecasIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={cabecasIndicador?.serieAno ?? []}
          serieAnoAnt={cabecasIndicador?.serieAnoAnt}
          serieMeta={cabecasIndicador?.serieMetaIndicador}
          tipoAcumulado="posicao"
          indicadorKey="cabecas"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={cabecasIndicador?.deltaMes ?? null}
          deltaAno={cabecasIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'pesoMedio' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={pesoMedioIndicador?.titulo ?? ''}
          unidade="kg" formatoValor="decimal1"
          subtitulo={pesoMedioIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={pesoMedioIndicador?.serieAno ?? []}
          serieAnoAnt={pesoMedioIndicador?.serieAnoAnt}
          serieMeta={pesoMedioIndicador?.serieMeta}
          tipoAcumulado="posicao"
          indicadorKey="pesoMedio"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={pesoMedioIndicador?.deltaMes ?? null}
          deltaAno={pesoMedioIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'arrobas' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={arrobasIndicador?.titulo ?? ''}
          unidade="@" formatoValor="decimal1"
          subtitulo={arrobasIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={arrobasIndicador?.serieAno ?? []}
          serieAnoAnt={arrobasIndicador?.serieAnoAnt}
          serieMeta={arrobasIndicador?.serieMeta}
          tipoAcumulado="soma"
          indicadorKey="arrobas"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={arrobasIndicador?.deltaMes ?? null}
          deltaAno={arrobasIndicador?.deltaAno ?? null}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'gmd' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={gmdIndicador?.titulo ?? ''}
          unidade="kg/dia" formatoValor="decimal3"
          subtitulo={gmdIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={gmdIndicador?.serieAno ?? []}
          serieAnoAnt={gmdIndicador?.serieAnoAnt}
          serieMeta={gmdIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="gmd"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={gmdIndicador?.deltaMes ?? null}
          deltaAno={gmdIndicador?.deltaAno ?? null}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'uaHa' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={uaHaIndicador?.titulo ?? ''}
          unidade="UA/ha" formatoValor="decimal2"
          subtitulo={uaHaIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={uaHaIndicador?.serieAno ?? []}
          serieAnoAnt={uaHaIndicador?.serieAnoAnt}
          serieMeta={uaHaIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="uaHa"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={uaHaIndicador?.deltaMes ?? null}
          deltaAno={uaHaIndicador?.deltaAno ?? null}
        />
      )}
      {modalIndicador === 'kgHa' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={kgHaIndicador?.titulo ?? ''}
          unidade="kg/ha" formatoValor="decimal1"
          subtitulo={kgHaIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={kgHaIndicador?.serieAno ?? []}
          serieAnoAnt={kgHaIndicador?.serieAnoAnt}
          serieMeta={kgHaIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="kgHa"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={kgHaIndicador?.deltaMes ?? null}
          deltaAno={kgHaIndicador?.deltaAno ?? null}
        />
      )}
      {modalIndicador === 'desfrute' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Desfrute cab." unidade="cab" formatoValor="inteiro"
          subtitulo="Cabeças vendidas/saídas no mês"
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={seriesMensais?.desfruteCab ?? []}
          serieAnoAnt={dadosAnoAnt.seriesMensais?.desfruteCab}
          tipoAcumulado="soma"
          indicadorKey="desfrute"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={calcDeltaV(desfrute, dadosMesAnt.desfrute)}
          deltaAno={calcDeltaV(desfrute, dadosAnoAnt.desfrute)}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'valorRebanho' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Valor Rebanho" formatoValor="moeda"
          subtitulo="Valor financeiro estimado do rebanho"
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={seriesMensais?.valorRebFin ?? []}
          serieAnoAnt={dadosAnoAnt.seriesMensais?.valorRebFin}
          tipoAcumulado="posicao"
          indicadorKey="valorRebanho"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          deltaMes={calcDeltaV(seriesMensais?.valorRebFin?.[mesNum], seriesMensais?.valorRebFin?.[mesNum === 1 ? 0 : mesNum - 1])}
          deltaAno={calcDeltaV(seriesMensais?.valorRebFin?.[mesNum], dadosAnoAnt.seriesMensais?.valorRebFin?.[mesNum])}
        />
      )}
    </div>
  );
}
