import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelGeralOficial } from '@/v2/hooks/usePainelGeralOficial';

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
        <p className="text-[10px] text-muted-foreground/60">— vs mês</p>
        <p className="text-[10px] text-muted-foreground/60">— vs ano ant.</p>
        <p className="text-[10px] text-muted-foreground/60">— vs META</p>
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
  const { fazendaAtual } = useFazenda();
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const mesNum = mes === '0' ? 0 : parseInt(mes);
  const anoNum = parseInt(ano);
  const fazendaId = fazendaAtual?.id ?? '__global__';
  const isGlobal = fazendaId === '__global__';

  const ml = mes === '0'
    ? 'Jan–Dez ' + ano
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const { caixaAtual, resultadoMes, rebanhoAtual, endividamento, avisos } = usePainelGeralOficial({
    clienteId: clienteAtual?.id ?? '',
    fazendaId,
    ano: anoNum,
    mes: mesNum,
  });

  const loadR = rebanhoAtual.loading;
  const loadF = resultadoMes.loading;
  const loadC = caixaAtual.loading;
  const loadD = endividamento.loading;

  const resultadoTone = resultadoMes.saldo == null ? 'default'
    : resultadoMes.saldo >= 0 ? 'positive' : 'negative';

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

      {avisos.length > 0 && (
        <div className="space-y-1">
          {avisos.map(a => (
            <div key={a} className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              <span className="shrink-0">⚠</span><span>{a}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <SectionBlock title="Produção" subtitle="o que a fazenda entregou">
          <MetricTile
            label="Cabeças"
            value={fmtN(rebanhoAtual.cabecas)}
            unit="cab"
            loading={loadR}
          />
          <MetricTile
            label="Peso médio final"
            value={fmtN(rebanhoAtual.pesoMedio, 1)}
            unit="kg"
            loading={loadR}
          />
          <MetricTile label="@ produzidas" value={null} unit="@" pending />
          <MetricTile label="Desfrute cab." value={null} unit="%" pending />
          <MetricTile
            label="GMD"
            value={fmtN(rebanhoAtual.gmd, 3)}
            unit="kg/dia"
            loading={loadR}
          />
          <MetricTile label="Valor rebanho" value={null} unit="R$" pending />
        </SectionBlock>

        <SectionBlock title="Eficiência" subtitle="do uso da área">
          <MetricTile label="Área produtiva" value={null} unit="ha" pending />
          <MetricTile label="UA/ha" value={null} pending />
          <MetricTile label="kg/ha" value={null} pending />
          <MetricTile label="@/ha" value={null} pending />
        </SectionBlock>

        <SectionBlock title="Financeiro Produtivo" subtitle="receita × custo por @">
          <MetricTile label="Preço de Venda R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Custo Produtivo R$/@" value={null} unit="R$/@" pending />
          <MetricTile label="Margem por @" value={null} unit="R$/@" pending />
          <MetricTile
            label="Desembolso total"
            value={fmtR(resultadoMes.saidas)}
            loading={loadF}
          />
          <MetricTile
            label="Resultado operacional"
            value={fmtR(resultadoMes.saldo)}
            loading={loadF}
            tone={resultadoTone}
          />
        </SectionBlock>

        <SectionBlock title="Estrutura Financeira" subtitle="posição patrimonial">
          <MetricTile
            label="Caixa disponível"
            value={fmtR(caixaAtual.valor)}
            loading={loadC}
            tone="blue"
          />
          <MetricTile
            label="Endividamento"
            value={fmtR(endividamento.valor)}
            loading={loadD}
            tone={endividamento.valor > 0 ? 'negative' : 'default'}
          />
          <MetricTile label="Dívida / rebanho" value={null} pending />
          <MetricTile label="Curto vs longo prazo" value={null} pending />
        </SectionBlock>

      </div>
    </div>
  );
}
