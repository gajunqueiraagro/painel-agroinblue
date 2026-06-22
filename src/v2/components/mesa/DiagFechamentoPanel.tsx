// ============================================================================
// DIAG-01 — Painel Executivo de Fechamento (render-only).
// Consome o RPC unico fn_diag_fechamento_sessao(p_sessao_id) e exibe:
//   Cobertura → Problemas → Status → Origem → Entradas (recolhido).
// "Onde esta o problema?" — NAO lista lancamentos (isso e o EXTRATO-01).
// Sem clique/onClick nos cards: nenhuma acao deriva daqui.
// Tipos do Supabase nao regenerados p/ este RPC novo: cast `(supabase as any)`
// + `data as DiagFechamento`, padrao do projeto (ver useClassificacaoStaging).
// ============================================================================
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

interface Props {
  sessaoId: string;
}

type ProblemaFechamento = {
  tipo: string;
  label: string;
  count: number;
  valor: number;
  filtro: string;
};

type DiagFechamento = {
  ano_mes: string;
  cobertura: { ofx_validos: number; com_excel: number; sem_excel: number; promovidos: number; pendentes: number };
  problemas: ProblemaFechamento[];
  status: { ofx_saidas: number; sistema_saidas: number; divergencia: number };
  origem: { via_mesa: number; ofx_direto: number; manual: number; importacao: number; migracao: number; outras: number };
  entradas: { ofx: number; sistema: number; a_conciliar: number };
};

function fmtBRL(v: number): string {
  return Number(v ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Celula numerica simples (label em cima, valor embaixo). */
function Metric({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string | number;
  tone?: 'normal' | 'alerta' | 'ok';
}) {
  const cor =
    tone === 'alerta' ? 'text-rose-600' : tone === 'ok' ? 'text-emerald-600' : 'text-foreground';
  return (
    <div className="flex min-w-[88px] flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={'text-sm font-semibold ' + cor}>{value}</span>
    </div>
  );
}

export function DiagFechamentoPanel({ sessaoId }: Props) {
  const [entradasAberto, setEntradasAberto] = useState(false);

  const { data: diag, isLoading } = useQuery({
    queryKey: ['diag-fechamento', sessaoId],
    enabled: !!sessaoId,
    staleTime: 30_000,
    queryFn: async (): Promise<DiagFechamento | null> => {
      // RPC novo ainda nao tipado nos types gerados — cast padrao do projeto.
      const { data, error } = await (supabase as any).rpc('fn_diag_fechamento_sessao', {
        p_sessao_id: sessaoId,
      });
      if (error) throw error;
      // sessao inexistente → {} (sem chaves); tratado como "sem diagnostico".
      if (!data || !data.cobertura) return null;
      return data as DiagFechamento;
    },
  });

  if (isLoading) {
    return (
      <Card className="p-3 text-xs text-muted-foreground">Carregando diagnóstico…</Card>
    );
  }
  if (!diag) return null;

  const { cobertura, problemas, status, origem, entradas } = diag;

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Diagnóstico de fechamento</span>
        <span className="text-xs text-muted-foreground">{diag.ano_mes}</span>
      </div>

      {/* 1. COBERTURA */}
      <section>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">Cobertura OFX</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Metric label="OFX válidos" value={cobertura.ofx_validos} />
          <Metric label="Com Excel" value={cobertura.com_excel} tone="ok" />
          <Metric
            label="Sem Excel"
            value={cobertura.sem_excel}
            tone={cobertura.sem_excel > 0 ? 'alerta' : 'normal'}
          />
          <Metric label="Promovidos" value={cobertura.promovidos} />
          <Metric
            label="Pendentes"
            value={cobertura.pendentes}
            tone={cobertura.pendentes > 0 ? 'alerta' : 'normal'}
          />
        </div>
      </section>

      {/* 2. PROBLEMAS (render-only, sem onClick) */}
      <section>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">Problemas</h4>
        {problemas.length === 0 ? (
          <div className="text-xs text-emerald-600">Nenhum problema detectado.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {problemas.map((p) => (
              <div
                key={p.tipo}
                className="flex flex-col rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">{p.label}</span>
                <span className="text-sm font-semibold">{p.count}</span>
                <span className="text-[10px] text-muted-foreground">R$ {fmtBRL(p.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. STATUS (divergencia destacada) */}
      <section>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">Saídas (OFX × Sistema)</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Metric label="OFX saídas" value={`R$ ${fmtBRL(status.ofx_saidas)}`} />
          <Metric label="Sistema saídas" value={`R$ ${fmtBRL(status.sistema_saidas)}`} />
          <Metric
            label="Divergência"
            value={`R$ ${fmtBRL(status.divergencia)}`}
            tone={Math.abs(status.divergencia) >= 0.005 ? 'alerta' : 'ok'}
          />
        </div>
      </section>

      {/* 4. ORIGEM (via vinculo — ver invariante no RPC) */}
      <section>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">Origem dos lançamentos</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Metric label="Via Mesa" value={origem.via_mesa} />
          <Metric label="OFX direto" value={origem.ofx_direto} />
          <Metric label="Manual" value={origem.manual} />
          <Metric label="Importação" value={origem.importacao} />
          <Metric label="Migração" value={origem.migracao} />
          <Metric label="Outras" value={origem.outras} />
        </div>
      </section>

      {/* 5. ENTRADAS (recolhido por padrao) */}
      <section>
        <button
          type="button"
          onClick={() => setEntradasAberto((v) => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {entradasAberto ? '▾' : '▸'} Entradas (OFX × Sistema)
        </button>
        {entradasAberto && (
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
            <Metric label="OFX entradas" value={`R$ ${fmtBRL(entradas.ofx)}`} />
            <Metric label="Sistema entradas" value={`R$ ${fmtBRL(entradas.sistema)}`} />
            <Metric
              label="A conciliar"
              value={`R$ ${fmtBRL(entradas.a_conciliar)}`}
              tone={Math.abs(entradas.a_conciliar) >= 0.005 ? 'alerta' : 'ok'}
            />
          </div>
        )}
      </section>
    </Card>
  );
}
