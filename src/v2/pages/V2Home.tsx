import { useEffect, useMemo, useRef, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import type { StatusValidacaoArea } from '@/hooks/usePainelConsultorData';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useEndividamentoAtual } from '@/hooks/useEndividamentoAtual';
import { IndicadorHistoricoModal } from '@/v2/components/IndicadorHistoricoModal';
import { useHistoricoIndicador, type HistoricoIndicadorKey } from '@/hooks/useHistoricoIndicador';
import { supabase } from '@/integrations/supabase/client';

const fmtN = (v: number | null | undefined, dec = 0) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// R$ 22.300.000 → "R$ 22,3M". Para valores grandes onde a precisão centavos não importa.
const fmtRAbreviado = (v: number | null | undefined): string | null => {
  if (v == null || isNaN(v)) return null;
  const abs = Math.abs(v);
  const fmt = (n: number, suf: string) => `R$ ${n.toFixed(1).replace('.', ',')}${suf}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

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
    seriesMensais, seriesMeta, cabecasIndicador, pesoMedioIndicador, gmdIndicador, uaHaIndicador, kgHaIndicador, arrobasIndicador, desfruteIndicador, valorRebanhoIndicador,
    receitaPecIndicador, custeioPecIndicador, custoArrIndicador, precoArrIndicador, custoCabIndicador, margemArrIndicador,
    loading: loadingPainel,
  } = usePainelConsultorData({ ano: anoNum, mes: mesNum, viewMode, incluirComparativos: true, ...sharedLanc });

  // ── Histórico multi-ano (auxiliar legado, só dispara com modal aberto p/ indicador permitido) ──
  // Desfrute usa fonte oficial separada (lancamentos), via useHistoricoIndicador branch específico.
  // uaHa/kgHa: branch específico que cruza fechamento_area_snapshot + zoot_mensal_cache.
  const HIST_KEYS_PERMITIDAS: HistoricoIndicadorKey[] = ['cabecas', 'pesoMedio', 'arrobas', 'gmd', 'desfrute', 'valorRebanho', 'uaHa', 'kgHa', 'receitaPec', 'precoArr', 'custeioPec', 'custoArr', 'custoCab', 'margemArr'];
  const histAtivo = modalIndicador != null
    && (HIST_KEYS_PERMITIDAS as string[]).includes(modalIndicador);
  // Valor oficial do anoAtual e da meta — vêm do hook principal e são repassados
  // ao histórico p/ que a barra do anoAtual bata 100% com o topo do modal.
  const valorOficialAnoAtual: number | null = histAtivo
    ? (modalIndicador === 'cabecas'      ? (cabecasIndicador?.valor      ?? null)
     : modalIndicador === 'pesoMedio'    ? (pesoMedioIndicador?.valor    ?? null)
     : modalIndicador === 'gmd'          ? (gmdIndicador?.valor          ?? null)
     : modalIndicador === 'arrobas'      ? (arrobasIndicador?.valor      ?? null)
     : modalIndicador === 'desfrute'     ? (desfruteIndicador?.valor     ?? null)
     : modalIndicador === 'valorRebanho' ? (valorRebanhoIndicador?.valor ?? null)
     : modalIndicador === 'uaHa'         ? (uaHaIndicador?.valor         ?? null)
     : modalIndicador === 'kgHa'         ? (kgHaIndicador?.valor         ?? null)
     : modalIndicador === 'receitaPec'   ? (receitaPecIndicador?.valor   ?? null)
     : modalIndicador === 'precoArr'     ? (precoArrIndicador?.valor     ?? null)
     : modalIndicador === 'custeioPec'   ? (custeioPecIndicador?.valor   ?? null)
     : modalIndicador === 'custoArr'     ? (custoArrIndicador?.valor     ?? null)
     : modalIndicador === 'custoCab'     ? (custoCabIndicador?.valor     ?? null)
     : modalIndicador === 'margemArr'    ? (margemArrIndicador?.valor    ?? null)
     : null)
    : null;
  const valorOficialMetaAnoAtual: number | null = histAtivo
    ? (modalIndicador === 'cabecas'    ? (cabecasIndicador?.serieMetaIndicador?.[mesNum] ?? null)
     : modalIndicador === 'pesoMedio'  ? (pesoMedioIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'gmd'        ? (gmdIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'arrobas'    ? (arrobasIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'receitaPec' ? (receitaPecIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'precoArr'   ? (precoArrIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'custeioPec' ? (custeioPecIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'custoArr'   ? (custoArrIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'custoCab'   ? (custoCabIndicador?.serieMeta?.[mesNum] ?? null)
     : modalIndicador === 'margemArr'  ? (margemArrIndicador?.serieMeta?.[mesNum] ?? null)
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

  const {
    total: endividamentoTotal,
    alavancagem: finAlavancagem,
    pizzaVencimentos: finPizza,
    loading: loadingDivida,
  } = useEndividamentoAtual(anoNum);
  const endividamentoValor = loadingDivida ? null : endividamentoTotal;

  const resultadoTone = resultado == null ? 'default' : resultado >= 0 ? 'positive' : 'negative';

  return (
    <div className="px-4 pb-5 max-w-7xl">
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 shadow-sm mb-4">
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
      <div className="space-y-4">

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
          <MetricTile label={desfruteIndicador?.label ?? 'DESFRUTE (CAB.) NO MÊS'} value={fmtN(desfruteIndicador?.valor ?? null)} unit="cab" loading={loadingPainel}
            deltaMes={desfruteIndicador?.deltaMes ?? null}
            deltaAno={desfruteIndicador?.deltaAno ?? null}
            deltaMeta={desfruteIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('desfrute')} />
          <MetricTile label={gmdIndicador?.label ?? 'GMD'} value={fmtN(gmdIndicador?.valor ?? null, 3)} unit="kg/dia" loading={loadingPainel}
            deltaMes={gmdIndicador?.deltaMes ?? null}
            deltaAno={gmdIndicador?.deltaAno ?? null}
            deltaMeta={gmdIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('gmd')} />
          <MetricTile label={valorRebanhoIndicador?.label ?? 'VALOR DO REBANHO NO MÊS'} value={fmtRAbreviado(valorRebanhoIndicador?.valor ?? null)} loading={loadingPainel}
            deltaMes={valorRebanhoIndicador?.deltaMes ?? null}
            deltaAno={valorRebanhoIndicador?.deltaAno ?? null}
            deltaMeta={valorRebanhoIndicador?.deltaMeta ?? null}
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
          <MetricTile
            label={receitaPecIndicador?.label ?? 'RECEITAS PECUÁRIAS COMPETÊNCIA NO MÊS'}
            value={fmtR(receitaPecIndicador?.valor ?? null)}
            loading={loadingPainel}
            tone="blue"
            deltaMes={receitaPecIndicador?.deltaMes ?? null}
            deltaAno={receitaPecIndicador?.deltaAno ?? null}
            deltaMeta={receitaPecIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('receitaPec')} />
          <MetricTile
            label={custeioPecIndicador?.label ?? 'CUSTEIO PRODUÇÃO PECUÁRIA NO MÊS'}
            value={fmtR(custeioPecIndicador?.valor ?? null)}
            loading={loadingPainel}
            tone="negative"
            deltaMes={custeioPecIndicador?.deltaMes ?? null}
            deltaAno={custeioPecIndicador?.deltaAno ?? null}
            deltaMeta={custeioPecIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('custeioPec')} />
          <MetricTile
            label={custoArrIndicador?.label ?? 'CUSTO PRODUTIVO R$/@'}
            value={fmtR(custoArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone="negative"
            deltaMes={custoArrIndicador?.deltaMes ?? null}
            deltaAno={custoArrIndicador?.deltaAno ?? null}
            deltaMeta={custoArrIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('custoArr')} />
          <MetricTile
            label={precoArrIndicador?.label ?? 'PREÇO DE VENDA R$/@'}
            value={fmtR(precoArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone="blue"
            deltaMes={precoArrIndicador?.deltaMes ?? null}
            deltaAno={precoArrIndicador?.deltaAno ?? null}
            deltaMeta={precoArrIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('precoArr')} />
          <MetricTile
            label={custoCabIndicador?.label ?? 'CUSTO CAB. MÊS R$/CAB.'}
            value={fmtR(custoCabIndicador?.valor ?? null)}
            unit="R$/cab."
            loading={loadingPainel}
            tone="negative"
            deltaMes={custoCabIndicador?.deltaMes ?? null}
            deltaAno={custoCabIndicador?.deltaAno ?? null}
            deltaMeta={custoCabIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('custoCab')} />
          <MetricTile
            label={margemArrIndicador?.label ?? 'MARGEM POR @'}
            value={fmtR(margemArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone={margemArrIndicador?.valor == null ? 'default' : margemArrIndicador.valor >= 0 ? 'blue' : 'negative'}
            deltaMes={margemArrIndicador?.deltaMes ?? null}
            deltaAno={margemArrIndicador?.deltaAno ?? null}
            deltaMeta={margemArrIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('margemArr')} />
        </SectionBlock>

        <SectionBlock title="Estrutura Financeira" subtitle="posição patrimonial">
          <MetricTile label="Caixa disponível" value={fmtR(caixaValor)} loading={loadingFluxo} tone="blue" />
          <MetricTile label="Endividamento" value={fmtR(endividamentoValor)} loading={loadingDivida} tone={endividamentoValor != null && endividamentoValor > 0 ? 'negative' : 'default'} />
          <MetricTile
            label="Dívida / rebanho"
            value={loadingDivida ? null : fmtN(finAlavancagem?.percentual ?? null, 1)}
            unit="%"
            loading={loadingDivida}
            tone={
              finAlavancagem?.status === 'critico' ? 'negative'
              : finAlavancagem?.status === 'atencao' ? 'negative'
              : 'default'
            }
          />
          {(() => {
            const pizza = finPizza ?? [];
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
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
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
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'desfrute' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={desfruteIndicador?.titulo ?? ''}
          unidade="cab" formatoValor="inteiro"
          subtitulo={desfruteIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={desfruteIndicador?.serieAno ?? []}
          serieAnoAnt={desfruteIndicador?.serieAnoAnt}
          serieMeta={desfruteIndicador?.serieMeta}
          tipoAcumulado="soma"
          indicadorKey="desfrute"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={desfruteIndicador?.deltaMes ?? null}
          deltaAno={desfruteIndicador?.deltaAno ?? null}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'valorRebanho' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={valorRebanhoIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={valorRebanhoIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={valorRebanhoIndicador?.serieAno ?? []}
          serieAnoAnt={valorRebanhoIndicador?.serieAnoAnt}
          serieMeta={valorRebanhoIndicador?.serieMeta}
          tipoAcumulado="posicao"
          indicadorKey="valorRebanho"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={valorRebanhoIndicador?.deltaMes ?? null}
          deltaAno={valorRebanhoIndicador?.deltaAno ?? null}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'receitaPec' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={receitaPecIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={receitaPecIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={receitaPecIndicador?.serieAno ?? []}
          serieAnoAnt={receitaPecIndicador?.serieAnoAnt}
          serieMeta={receitaPecIndicador?.serieMeta}
          tipoAcumulado={isPeriodo ? 'soma' : 'posicao'}
          indicadorKey="receitaPec"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={receitaPecIndicador?.deltaMes ?? null}
          deltaAno={receitaPecIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal="azul"
        />
      )}
      {modalIndicador === 'custeioPec' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custeioPecIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={custeioPecIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custeioPecIndicador?.serieAno ?? []}
          serieAnoAnt={custeioPecIndicador?.serieAnoAnt}
          serieMeta={custeioPecIndicador?.serieMeta}
          tipoAcumulado={isPeriodo ? 'soma' : 'posicao'}
          indicadorKey="custeioPec"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={custeioPecIndicador?.deltaMes ?? null}
          deltaAno={custeioPecIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'custoArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custoArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={custoArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custoArrIndicador?.serieAno ?? []}
          serieAnoAnt={custoArrIndicador?.serieAnoAnt}
          serieMeta={custoArrIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="custoArr"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={custoArrIndicador?.deltaMes ?? null}
          deltaAno={custoArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'precoArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={precoArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={precoArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={precoArrIndicador?.serieAno ?? []}
          serieAnoAnt={precoArrIndicador?.serieAnoAnt}
          serieMeta={precoArrIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="precoArr"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={precoArrIndicador?.deltaMes ?? null}
          deltaAno={precoArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal="azul"
        />
      )}
      {modalIndicador === 'custoCab' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custoCabIndicador?.titulo ?? ''}
          unidade="R$/cab" formatoValor="decimal2"
          subtitulo={custoCabIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custoCabIndicador?.serieAno ?? []}
          serieAnoAnt={custoCabIndicador?.serieAnoAnt}
          serieMeta={custoCabIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="custoCab"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={custoCabIndicador?.deltaMes ?? null}
          deltaAno={custoCabIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'margemArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={margemArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={margemArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={margemArrIndicador?.serieAno ?? []}
          serieAnoAnt={margemArrIndicador?.serieAnoAnt}
          serieMeta={margemArrIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="margemArr"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 6}
          deltaMes={margemArrIndicador?.deltaMes ?? null}
          deltaAno={margemArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
          corPrincipal={(margemArrIndicador?.valor ?? 0) >= 0 ? 'azul' : 'vermelho'}
        />
      )}
    </div>
  );
}
