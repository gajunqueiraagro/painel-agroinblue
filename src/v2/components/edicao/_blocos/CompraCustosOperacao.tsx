import type { Lancamento } from '@/types/cattle';
import type { FinRecord } from '../LancamentoZooModal';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  ScrollText, Wallet, Layers, Scale,
  AlertTriangle, Info,
} from 'lucide-react';

interface Props {
  lancamento: Lancamento;
  compraForm: Lancamento;
  records: FinRecord[];
  loading: boolean;
  error: string | null;
}

export function CompraCustosOperacao({
  lancamento, compraForm, records, loading, error,
}: Props) {
  const quantidade = Number(compraForm.quantidade) || 0;
  const pesoMedio = Number(compraForm.pesoMedioKg) || 0;
  const pesoTotalKg = quantidade * pesoMedio;
  const valorZootecnico = Number(compraForm.valorTotal ?? lancamento.valorTotal) || 0;

  // Camada 1 — Valor Zootécnico
  const zootRsCab = quantidade > 0 ? valorZootecnico / quantidade : 0;
  const zootRsKg = pesoTotalKg > 0 ? valorZootecnico / pesoTotalKg : 0;

  // Camada 2 — Desembolso Financeiro
  const valorVinculado = records.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const finRsCab = quantidade > 0 ? valorVinculado / quantidade : 0;
  const finRsKg = pesoTotalKg > 0 ? valorVinculado / pesoTotalKg : 0;
  const semVinculo = records.length === 0;

  // Camada 4 — Diferença detalhada
  const diferenca = valorZootecnico - valorVinculado;
  const percentDiferenca = valorZootecnico > 0 ? (diferenca / valorZootecnico) * 100 : 0;
  const diferencaSignificativa = !semVinculo && Math.abs(diferenca) >= 0.01;

  if (loading) {
    return <div className="text-xs text-muted-foreground">Carregando custos…</div>;
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {error && (
        <div className="flex items-start gap-2 p-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-xs leading-snug">{error}</div>
        </div>
      )}

      {/* Bloco 1 — Valor Zootécnico (Competência) */}
      <Card icon={ScrollText} title="Valor Zootécnico (Competência)" tone="neutral">
        <Grid3>
          <Metric label="Cabeças" value={quantidade > 0 ? quantidade.toLocaleString('pt-BR') : '—'} suffix="cab" />
          <Metric label="Peso Total" value={pesoTotalKg > 0 ? pesoTotalKg.toLocaleString('pt-BR') : '—'} suffix="kg" />
          <Metric label="Valor da Movimentação" value={valorZootecnico > 0 ? formatMoeda(valorZootecnico) : '—'} highlight />
        </Grid3>
        <Grid2>
          <Metric label="R$/cab direto" value={zootRsCab > 0 ? formatMoeda(zootRsCab) : '—'} />
          <Metric label="R$/kg direto" value={zootRsKg > 0 ? formatMoeda(zootRsKg) : '—'} />
        </Grid2>
      </Card>

      {/* Bloco 2 — Desembolso Financeiro (Caixa) */}
      <Card icon={Wallet} title="Desembolso Financeiro (Caixa)" tone="green">
        {semVinculo ? (
          <div className="text-xs text-muted-foreground italic">Sem desembolso financeiro vinculado.</div>
        ) : (
          <>
            <Grid3>
              <Metric label="Parcelas" value={`${records.length}`} suffix={records.length === 1 ? 'parcela' : 'parcelas'} />
              <Metric label="Valor Bruto Vinculado" value={formatMoeda(valorVinculado)} highlight tone="green" />
              <div /> {/* placeholder */}
            </Grid3>
            <Grid2>
              <Metric label="R$/cab total" value={finRsCab > 0 ? formatMoeda(finRsCab) : '—'} />
              <Metric label="R$/kg total" value={finRsKg > 0 ? formatMoeda(finRsKg) : '—'} />
            </Grid2>
          </>
        )}
      </Card>

      {/* Bloco 3 — Componentes do Desembolso (placeholder conceitual) */}
      <Card icon={Layers} title="Componentes do Desembolso" tone="muted">
        <div className="text-xs text-muted-foreground italic space-y-1.5">
          <p>Detalhamento de componentes — disponível em fase futura:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
            <li>Frete (R$)</li>
            <li>Comissão (R$)</li>
            <li>Taxas (R$)</li>
            <li>Outros custos (R$)</li>
            <li>Valor líquido (R$)</li>
          </ul>
          <p className="pt-1 text-[11px]">
            Despesas financeiras indiretas poderão ser vinculadas à movimentação
            via drawer de vínculo financeiro com ícone dedicado. Sem alteração
            de regra ou persistência nesta fase.
          </p>
        </div>
      </Card>

      {/* Bloco 4 — Diferença detalhada */}
      <Card icon={Scale} title="Diferença (Zootécnico ↔ Financeiro)" tone="neutral">
        {!diferencaSignificativa ? (
          <div className="text-xs text-muted-foreground italic">
            {semVinculo ? 'Sem desembolso vinculado para comparar.' : 'Sem diferença entre zootécnico e financeiro.'}
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Diferença</div>
                <div className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatMoeda(diferenca)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Percentual</div>
                <div className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {Math.abs(percentDiferenca).toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <div>
                <p className="mb-1">
                  Diferença informativa. Não bloqueia a operação e não altera o
                  financeiro conciliado.
                </p>
                <p className="text-[10px]">
                  Causas possíveis: desembolso parcial, permuta, frete, comissão,
                  taxas, arredondamento ou ajuste futuro do zootécnico/competência.
                </p>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────

function Card({
  icon: Icon, title, tone, children,
}: {
  icon: React.ElementType; title: string;
  tone: 'neutral' | 'green' | 'muted';
  children: React.ReactNode;
}) {
  const headerClass =
    tone === 'green' ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60' :
    tone === 'muted' ? 'bg-muted/40 border-muted-foreground/20' :
    'bg-card border-border';
  const iconClass =
    tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' :
    'text-muted-foreground';

  return (
    <section className="rounded-md border overflow-hidden">
      <header className={`flex items-center gap-2 px-3 py-1.5 border-b ${headerClass}`}>
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <h4 className="text-xs font-semibold uppercase tracking-wide">{title}</h4>
      </header>
      <div className="p-3 space-y-2 bg-card">{children}</div>
    </section>
  );
}

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{children}</div>;
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Metric({
  label, value, suffix, highlight, tone,
}: {
  label: string; value: string; suffix?: string;
  highlight?: boolean; tone?: 'green';
}) {
  const valueClass = highlight
    ? (tone === 'green'
      ? 'text-base text-emerald-700 dark:text-emerald-400 font-bold'
      : 'text-base text-foreground font-bold')
    : 'text-sm font-medium text-foreground';
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`tabular-nums ${valueClass}`}>
        {value}
        {suffix && <span className="text-[10px] text-muted-foreground font-normal ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
