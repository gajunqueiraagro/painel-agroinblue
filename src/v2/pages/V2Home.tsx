import { useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useFinanciamentosPainel } from '@/hooks/useFinanciamentosPainel';

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
}

function MetricTile({ label, value, unit, loading, pending, tone = 'default' }: MetricTileProps) {
  const valColor =
    tone === 'positive' ? 'text-emerald-700' :
    tone === 'negative' ? 'text-red-700' :
    tone === 'blue'     ? 'text-primary' :
    'text-foreground';
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={`text-[1.4rem] font-black leading-none tabular-nums ${pending ? 'text-muted-foreground/30' : valColor}`}>
        {loading
          ? <span className="inline-block w-20 h-6 bg-muted/50 rounded animate-pulse align-middle" />
          : <>{value ?? '—'}{unit && value ? <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span> : null}</>
        }
      </p>
      <div className="mt-1 space-y-px">
        <p className="text-[10px] text-muted-foreground/60">↕ vs mês</p>
        <p className="text-[10px] text-muted-foreground/60">↕ vs ano ant.</p>
        <p className="text-[10px] text-muted-foreground/60">↕ vs META</p>
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

export function V2Home({ ano, mes }: { ano: string; mes: string }) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const mesNum = mes === '0' ? 0 : parseInt(mes);
  const anoNum = parseInt(ano);

  const ml = mes === '0'
    ? 'Jan–Dez ' + ano
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const {
    cabecas, pesoMedio, gmd, arrobas, desfrute,
    receita, desembolso, resultado, valorRebanhoMes: valorReb,
    areaProdutivaMes, lotUaHa, arrHa,
    loading: loadingPainel,
  } = usePainelConsultorData({ ano: anoNum, mes: mesNum });

  const { lancamentos: lancFin, rateioADM } = useFinanceiro();
  const mesAte = mesNum === 0 ? 12 : mesNum;
  const { meses: mesesFluxo, loading: loadingFluxo } = useFluxoCaixa(lancFin, rateioADM, anoNum, mesAte);
  const caixaValor = useMemo(() => {
    if (loadingFluxo || !mesesFluxo.length) return null;
    const sorted = [...mesesFluxo].sort((a, b) => a.mes - b.mes);
    return mesNum === 0
      ? sorted[sorted.length - 1]?.saldoFinal ?? null
      : sorted.find(m => m.mes === mesNum)?.saldoFinal ?? null;
  }, [mesesFluxo, mesNum, loadingFluxo]);

  const { kpis: finKpis, loading: loadingDivida } = useFinanciamentosPainel(
    anoNum, 'todos', mesNum === 0 ? 'todos' : mesNum,
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <SectionBlock title="Produção" subtitle="o que a fazenda entregou">
          <MetricTile label="Cabeças" value={fmtN(cabecas)} unit="cab" loading={loadingPainel} />
          <MetricTile label="Peso médio final" value={fmtN(pesoMedio, 1)} unit="kg" loading={loadingPainel} />
          <MetricTile label="@ produzidas" value={fmtN(arrobas, 1)} unit="@" loading={loadingPainel} />
          <MetricTile label="Desfrute cab." value={fmtN(desfrute)} unit="cab" loading={loadingPainel} />
          <MetricTile label="GMD" value={fmtN(gmd, 3)} unit="kg/dia" loading={loadingPainel} />
          <MetricTile label="Valor rebanho" value={fmtR(valorReb)} loading={loadingPainel} />
        </SectionBlock>

        <SectionBlock title="Eficiência" subtitle="do uso da área">
          <MetricTile label="Área produtiva" value={fmtN(areaProdutivaMes, 0)} unit="ha" loading={loadingPainel} />
          <MetricTile label="UA/ha" value={fmtN(lotUaHa, 2)} loading={loadingPainel} />
          <MetricTile label="kg/ha" value={null} pending />
          <MetricTile label="@/ha" value={fmtN(arrHa, 2)} loading={loadingPainel} />
        </SectionBlock>

        <SectionBlock title="Financeiro Produtivo" subtitle="receita × custo por @">
          <MetricTile label="Receita pecuária" value={fmtR(receita)} loading={loadingPainel} />
          <MetricTile label="Desembolso total" value={fmtR(desembolso)} loading={loadingPainel} />
          <MetricTile label="Resultado operacional" value={fmtR(resultado)} loading={loadingPainel} tone={resultadoTone} />
          <MetricTile label="Preço de Venda R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Custo Produtivo R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Margem por @" value={null} unit="R$/@" pending />
        </SectionBlock>

        <SectionBlock title="Estrutura Financeira" subtitle="posição patrimonial">
          <MetricTile label="Caixa disponível" value={fmtR(caixaValor)} loading={loadingFluxo} tone="blue" />
          <MetricTile label="Endividamento" value={fmtR(endividamentoValor)} loading={loadingDivida} tone={endividamentoValor != null && endividamentoValor > 0 ? 'negative' : 'default'} />
          <MetricTile label="Dívida / rebanho" value={null} pending />
          <MetricTile label="Curto vs longo prazo" value={null} pending />
        </SectionBlock>

      </div>
    </div>
  );
}
