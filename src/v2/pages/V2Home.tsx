import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';
import { usePainelGeralOficial } from '@/v2/hooks/usePainelGeralOficial';

type S = 'ok' | 'atencao' | 'fora';
const SC: Record<S, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  atencao: 'text-amber-700 bg-amber-50 border-amber-200',
  fora: 'text-red-700 bg-red-50 border-red-200',
};
const SI: Record<S, string> = { ok: '✓', atencao: '⚠', fora: '✕' };

const fmt = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtCab = (v: number | null) =>
  v == null ? '—' : `${v.toLocaleString('pt-BR')} cab.`;

const fmtKg = (v: number | null) =>
  v == null ? '' : `${v.toFixed(0)} kg/cab`;

function KpiCard({ label, valor, sub, loading, cor }: {
  label: string; valor: string; sub?: string; loading?: boolean;
  cor?: 'green' | 'red' | 'blue' | 'default';
}) {
  const corClass = cor === 'green' ? 'text-emerald-700' : cor === 'red' ? 'text-red-700' : cor === 'blue' ? 'text-primary' : 'text-foreground';
  return (
    <div className={cn('flex flex-col gap-1 p-3 rounded-lg border bg-card min-w-0 flex-1')}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold leading-none', corClass)}>
        {loading ? <span className="inline-block w-20 h-5 bg-muted/50 rounded animate-pulse" /> : valor}
      </p>
      {sub && !loading && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Alert({ level, text }: { level: S; text: string }) {
  return (
    <div className={cn('flex items-start gap-2 px-3 py-2 rounded border text-xs', SC[level])}>
      <span className="shrink-0 mt-0.5">{SI[level]}</span>
      <span>{text}</span>
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

  const {
    caixaAtual,
    resultadoMes,
    rebanhoAtual,
    endividamento,
    avisos,
  } = usePainelGeralOficial({
    clienteId: clienteAtual?.id ?? '',
    fazendaId,
    ano: anoNum,
    mes: mesNum,
  });

  const ml = mes === '0'
    ? 'Jan–Dez ' + ano
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isGlobal ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
        </p>
      </div>

      {avisos.length > 0 && (
        <div className="space-y-1">
          {avisos.map(a => (
            <div key={a} className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">⚠ {a}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Caixa Atual"
          valor={fmt(caixaAtual.valor)}
          sub={caixaAtual.saldoInicialAno != null ? `Inicial: ${fmt(caixaAtual.saldoInicialAno)}` : undefined}
          loading={caixaAtual.loading}
          cor="blue"
        />
        <KpiCard
          label="Resultado"
          valor={fmt(resultadoMes.saldo)}
          sub={resultadoMes.entradas != null ? `E ${fmt(resultadoMes.entradas)} · S ${fmt(resultadoMes.saidas)}` : undefined}
          loading={resultadoMes.loading}
          cor={resultadoMes.saldo != null ? (resultadoMes.saldo >= 0 ? 'green' : 'red') : 'default'}
        />
        <KpiCard
          label="Rebanho"
          valor={fmtCab(rebanhoAtual.cabecas)}
          sub={fmtKg(rebanhoAtual.pesoMedio)}
          loading={rebanhoAtual.loading}
        />
        <KpiCard
          label="Endividamento"
          valor={fmt(endividamento.valor)}
          loading={endividamento.loading}
          cor={endividamento.valor > 0 ? 'red' : 'default'}
        />
      </div>

      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary">
        Ambiente /v2 — validação visual (Fase 1). App original em / sem alteração.
      </div>
    </div>
  );
}
