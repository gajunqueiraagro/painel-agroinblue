import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Badge } from '@/components/ui/badge';
import {
  Wallet, ScrollText, Scale,
  AlertTriangle, Info,
  Calendar, Hash, Banknote, CheckCircle2, ExternalLink,
} from 'lucide-react';

interface FinRecord {
  id: string;
  valor: number;
  data_competencia: string | null;
  data_pagamento: string | null;
  status_transacao: string | null;
  conta_bancaria_id: string | null;
  conciliado_em: string | null;
}

interface Props {
  lancamentoId: string;
  /** Valor zootécnico (competência) — NUNCA derivado do financeiro. */
  valorZootecnico: number;
  /** Quantidade de cabeças — usado para R$/cab nas Camadas 1 e 2. */
  quantidade: number;
  /** Peso total em kg (qtd × pesoMedioKg) — usado para R$/kg. */
  pesoTotalKg: number;
  /** Incrementar para forçar refetch após geração/edição financeira. */
  refreshKey?: number;
  /** Callback opcional para o caller acompanhar quantidade de parcelas. */
  onCountChange?: (n: number) => void;
}

export function CompraVinculoFinanceiroDisplay({
  lancamentoId, valorZootecnico, quantidade, pesoTotalKg,
  refreshKey = 0, onCountChange,
}: Props) {
  const [records, setRecords] = useState<FinRecord[]>([]);
  const [contasMap, setContasMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Query 1 — parcelas (sem embed: não há FK física entre
      // financeiro_lancamentos_v2 e financeiro_contas_bancarias).
      const { data: parcelas, error: errP } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, valor, data_competencia, data_pagamento, status_transacao, conta_bancaria_id, conciliado_em')
        .eq('movimentacao_rebanho_id', lancamentoId)
        .eq('cancelado', false)
        .order('data_pagamento', { ascending: true });

      if (cancelled) return;
      if (errP) {
        setRecords([]);
        setContasMap(new Map());
        setError('Falha ao carregar vínculo financeiro. Tente reabrir o modal.');
        setLoading(false);
        return;
      }

      const recs: FinRecord[] = parcelas ?? [];

      // Query 2 — lookup de nomes de conta (só se houver alguma vinculada).
      const contasIds = Array.from(
        new Set(recs.map(r => r.conta_bancaria_id).filter((v): v is string => !!v))
      );

      let map = new Map<string, string>();
      if (contasIds.length > 0) {
        const { data: contas, error: errC } = await supabase
          .from('financeiro_contas_bancarias')
          .select('id, nome_exibicao')
          .in('id', contasIds);
        if (cancelled) return;
        if (!errC && contas) {
          map = new Map(contas.map(c => [c.id, c.nome_exibicao ?? '—']));
        }
        // errC silencioso aqui — display cai em '—' para a conta;
        // o erro principal (parcelas) já tem alerta visível.
      }

      setRecords(recs);
      setContasMap(map);
      setLoading(false);
      onCountChange?.(recs.length);
    })();

    return () => { cancelled = true; };
  }, [lancamentoId, refreshKey, onCountChange]);

  // ── Derivações ─────────────────────────────────────────────────────

  // Camada 1 — Valor Zootécnico (competência)
  const zootRsCab = quantidade > 0 ? valorZootecnico / quantidade : 0;
  const zootRsKg = pesoTotalKg > 0 ? valorZootecnico / pesoTotalKg : 0;

  // Camada 2 — Desembolso Financeiro Vinculado (caixa)
  const valorVinculado = records.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const finRsCab = quantidade > 0 ? valorVinculado / quantidade : 0;
  const finRsKg = pesoTotalKg > 0 ? valorVinculado / pesoTotalKg : 0;
  const semVinculo = records.length === 0;

  // Camada 3 — Diferença informativa
  const diferenca = valorZootecnico - valorVinculado;
  const percentDiferenca = valorZootecnico > 0 ? (diferenca / valorZootecnico) * 100 : 0;
  const diferencaSignificativa = !semVinculo && Math.abs(diferenca) >= 0.01;

  // Status financeiro derivado
  const status = (() => {
    if (semVinculo) return { label: 'NÃO VINCULADO', tone: 'muted' as const };
    const algumConciliado = records.some(r => r.conciliado_em != null);
    if (algumConciliado) return { label: 'REALIZADO (CONCILIADO)', tone: 'blue' as const };
    const todosRealizados = records.every(r => r.status_transacao === 'realizado');
    if (todosRealizados) return { label: 'REALIZADO', tone: 'red' as const };
    const algumAgendado = records.some(r => r.status_transacao === 'agendado');
    if (algumAgendado) return { label: 'AGENDADO', tone: 'amber' as const };
    return { label: 'PROGRAMADO', tone: 'amber' as const };
  })();

  const dataPrevista = records[0]?.data_pagamento ?? records[0]?.data_competencia ?? null;
  const primeiraConta = records[0]?.conta_bancaria_id ?? null;
  const contaPrevista = primeiraConta ? (contasMap.get(primeiraConta) ?? '—') : '—';
  const realizado = !semVinculo && records.every(r => r.status_transacao === 'realizado');

  if (loading) {
    return <div className="text-xs text-muted-foreground">Carregando vínculo financeiro…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Erro de query — alerta vermelho explícito (diferente de "não vinculado") */}
      {error && (
        <div className="flex items-start gap-2 p-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-xs leading-snug">{error}</div>
        </div>
      )}

      {/* CAMADA 1 — Valor Zootécnico (Competência) */}
      <Camada
        icon={ScrollText}
        label="Valor Zootécnico (Competência)"
        valor={valorZootecnico}
        rsCab={zootRsCab}
        rsKg={zootRsKg}
        tone="neutral"
        alertaSeZero
      />

      {/* CAMADA 2 — Desembolso Financeiro Vinculado (Caixa) */}
      <Camada
        icon={Wallet}
        label="Desembolso Financeiro Vinculado (Caixa)"
        valor={valorVinculado}
        rsCab={finRsCab}
        rsKg={finRsKg}
        tone="green"
        subtitle={semVinculo ? 'Financeiro não vinculado' : undefined}
        hideRatios={semVinculo}
      />

      {/* KVs do vínculo — só quando houver vínculo */}
      {!semVinculo && (
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <KV
            label="Status Financeiro"
            icon={CheckCircle2}
            value={
              <Badge variant="outline" className={
                status.tone === 'red' ? 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100' :
                status.tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100' :
                status.tone === 'blue' ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100' :
                'border-muted-foreground/30'
              }>
                {status.label}
              </Badge>
            }
          />
          <KV
            label="Parcelas"
            icon={Hash}
            value={`${records.length} parcela${records.length > 1 ? 's' : ''}`}
          />
          <KV
            label="Data Prevista"
            icon={Calendar}
            value={dataPrevista ? new Date(dataPrevista).toLocaleDateString('pt-BR') : '—'}
          />
          <KV label="Conta/Caixa Prevista" icon={Banknote} value={contaPrevista} />
          <KV
            label="Realizado"
            icon={realizado ? CheckCircle2 : AlertTriangle}
            value={realizado ? 'Sim' : 'Não'}
          />
        </div>
      )}

      {/* CAMADA 3 — Diferença Informativa */}
      {!semVinculo && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Diferença Informativa</span>
          </div>
          <div className={`text-xl font-bold tabular-nums ${
            diferencaSignificativa
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground'
          }`}>
            {diferencaSignificativa ? formatMoeda(diferenca) : 'Sem diferença'}
          </div>
          {diferencaSignificativa && valorZootecnico > 0 && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {Math.abs(percentDiferenca).toFixed(2)}% do valor zootécnico
            </div>
          )}
          {diferencaSignificativa && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Diferença informativa. Não bloqueia a operação e não altera
                o financeiro conciliado. Pode ser explicada por desembolso
                parcial, permuta, frete, comissão, taxas, arredondamento,
                ou ajuste futuro do zootécnico/competência.
              </span>
            </div>
          )}
        </div>
      )}

      {!semVinculo && (
        <div className="border-t pt-2">
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Ver detalhes do financeiro
          </span>
        </div>
      )}
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────

function Camada({
  icon: Icon, label, valor, rsCab, rsKg,
  tone, subtitle, alertaSeZero, hideRatios,
}: {
  icon: React.ElementType;
  label: string;
  valor: number;
  rsCab: number;
  rsKg: number;
  tone: 'neutral' | 'green';
  subtitle?: string;
  alertaSeZero?: boolean;
  hideRatios?: boolean;
}) {
  const valorClass =
    tone === 'green' ? 'text-emerald-700 dark:text-emerald-400' :
    'text-foreground';
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${valorClass}`}>
        {formatMoeda(valor)}
      </div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      )}
      {alertaSeZero && valor === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
          <AlertTriangle className="h-3 w-3" />
          <span>Valor zootécnico não informado — preencha no bloco azul.</span>
        </div>
      )}
      {!hideRatios && valor > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px]">
          <div className="flex items-baseline justify-between rounded bg-muted/30 px-2 py-1">
            <span className="text-muted-foreground">R$/cab</span>
            <span className="font-medium tabular-nums">{formatMoeda(rsCab)}</span>
          </div>
          <div className="flex items-baseline justify-between rounded bg-muted/30 px-2 py-1">
            <span className="text-muted-foreground">R$/kg</span>
            <span className="font-medium tabular-nums">{formatMoeda(rsKg)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function KV({
  icon: Icon, label, value,
}: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
