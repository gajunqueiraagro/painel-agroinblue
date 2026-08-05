/**
 * VisaoConsolidadaTab — Visão Financeira Consolidada por cliente (read-only).
 * PR-FIN-V2-CONSOLIDADO-01 · FASE 1 (MVP). "Quanto o cliente tem hoje e onde está".
 *
 * POSIÇÃO ATUAL (não histórico): para cada conta ativa, usa o saldo_final do ano_mes
 * MAIS RECENTE persistido em financeiro_saldos_bancarios_v2. Não recalcula lançamentos,
 * não cria regra de saldo — apenas soma/agrupa o dado já persistido.
 *   Liquidez Disponível = Contas Correntes (cc) + Investimentos (inv).
 *   Cartões (cartao) = Obrigações, em bloco separado (nunca somam na Liquidez).
 */
import { Fragment, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ContaRow {
  id: string;
  nome_exibicao: string | null;
  banco: string | null;
  numero_conta: string | null;
  agencia: string | null;
  tipo_conta: string | null;
  ordem_exibicao: number | null;
}
interface SaldoRow { conta_bancaria_id: string; ano_mes: string; saldo_final: number | null; }

const TIPO_LABEL: Record<string, string> = { cc: 'Conta Corrente', inv: 'Investimento', cartao: 'Cartão' };
// Ordem/rotulagem dos grupos da tabela.
const GRUPOS: { tipo: string; titulo: string }[] = [
  { tipo: 'cc', titulo: 'Contas Correntes' },
  { tipo: 'inv', titulo: 'Investimentos' },
  { tipo: 'cartao', titulo: 'Cartões' },
];

// Rótulo de conta que NÃO depende só do nome_exibicao (cliente grande tem várias contas no mesmo
// banco): nome + número mascarado (****1234). Nunca vazio.
function rotuloConta(c: ContaRow): string {
  const nome = (c.nome_exibicao ?? '').trim();
  const num = (c.numero_conta ?? '').replace(/\D/g, '');
  const masc = num ? `****${num.slice(-4)}` : '';
  return [nome, masc].filter(Boolean).join(' ') || '—';
}

export function VisaoConsolidadaTab({ clienteId }: { clienteId: string | null }) {
  const { data: contas = [] } = useQuery({
    queryKey: ['consolidado-contas', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<ContaRow[]> => {
      const { data } = await (supabase as any).from('financeiro_contas_bancarias')
        .select('id, nome_exibicao, banco, numero_conta, agencia, tipo_conta, ordem_exibicao')
        .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao');
      return data ?? [];
    },
  });

  const contaIds = useMemo(() => contas.map((c) => c.id), [contas]);

  const { data: saldos = [] } = useQuery({
    queryKey: ['consolidado-saldos', clienteId, contaIds],
    enabled: !!clienteId && contaIds.length > 0,
    queryFn: async (): Promise<SaldoRow[]> => {
      const { data } = await (supabase as any).from('financeiro_saldos_bancarios_v2')
        .select('conta_bancaria_id, ano_mes, saldo_final')
        .eq('cliente_id', clienteId).in('conta_bancaria_id', contaIds)
        .order('ano_mes', { ascending: false });
      return data ?? [];
    },
  });

  // saldo_final do ano_mes MAIS RECENTE por conta (linhas já ordenadas desc → 1ª ocorrência).
  const saldoPorConta = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of saldos) {
      if (!m.has(s.conta_bancaria_id) && typeof s.saldo_final === 'number') m.set(s.conta_bancaria_id, s.saldo_final);
    }
    return m;
  }, [saldos]);

  const totalPorTipo = useMemo(() => {
    const t: Record<string, number> = { cc: 0, inv: 0, cartao: 0 };
    for (const c of contas) {
      const key = c.tipo_conta ?? '';
      const v = saldoPorConta.get(c.id);
      if (typeof v === 'number' && key in t) t[key] += v;
    }
    return t;
  }, [contas, saldoPorConta]);

  const liquidez = totalPorTipo.cc + totalPorTipo.inv;

  const card = (label: string, valor: number, opts?: { destaque?: boolean; cls?: string }) => (
    <div className={`rounded-md border px-2.5 py-1.5 flex-1 min-w-0 ${opts?.destaque ? 'bg-primary/10 border-primary/40' : 'bg-white'}`}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold tabular-nums leading-tight ${opts?.destaque ? 'text-primary text-[15px]' : 'text-[13px]'} ${opts?.cls ?? ''}`}>{formatMoeda(valor)}</div>
    </div>
  );

  if (!clienteId) {
    return <div className="p-4 text-[11px] text-muted-foreground">Selecione um cliente para ver a posição consolidada.</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-2 h-full min-h-0">
      {/* Cabeçalho */}
      <div className="shrink-0">
        <h2 className="text-[14px] font-semibold leading-tight">Visão Financeira Consolidada</h2>
        <p className="text-[10px] text-muted-foreground">Posição financeira atual — saldo final mais recente por conta (não histórico).</p>
      </div>

      {/* Cards — prioridade: onde está o dinheiro */}
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {card('Liquidez Disponível', liquidez, { destaque: true })}
        {card('Contas Correntes', totalPorTipo.cc)}
        {card('Investimentos', totalPorTipo.inv)}
        {card('Cartões / Obrigações', totalPorTipo.cartao, { cls: 'text-rose-700' })}
      </div>

      {/* Tabela agrupada */}
      <div className="rounded-lg border overflow-auto flex-1 min-h-0">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary text-primary-foreground">
              {['Instituição', 'Tipo', 'Conta', 'Saldo'].map((h, i) => (
                <th key={h} className={`px-2 py-1 text-[9px] uppercase font-semibold ${i === 3 ? 'text-right whitespace-nowrap' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contas.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-[10px] text-muted-foreground py-6">Nenhuma conta ativa para este cliente.</td></tr>
            ) : GRUPOS.map((g) => {
              const linhas = contas.filter((c) => (c.tipo_conta ?? '') === g.tipo);
              if (linhas.length === 0) return null;
              const subtotal = linhas.reduce((s, c) => s + (saldoPorConta.get(c.id) ?? 0), 0);
              return (
                <Fragment key={g.tipo}>
                  <tr className="bg-muted/40 border-y">
                    <td colSpan={3} className="px-2 py-0.5 text-[10px] font-semibold">{g.titulo} <span className="text-muted-foreground font-normal">· {linhas.length}</span></td>
                    <td className="px-2 py-0.5 text-right text-[10px] font-bold tabular-nums">{formatMoeda(subtotal)}</td>
                  </tr>
                  {linhas.map((c) => {
                    const v = saldoPorConta.get(c.id);
                    return (
                      <tr key={c.id} className="border-b text-[10px] hover:bg-muted/30">
                        <td className="px-2 py-0.5 truncate max-w-[160px]" title={c.banco ?? ''}>{c.banco || '—'}</td>
                        <td className="px-2 py-0.5 text-muted-foreground whitespace-nowrap">{TIPO_LABEL[c.tipo_conta ?? ''] ?? (c.tipo_conta || '—')}</td>
                        <td className="px-2 py-0.5 truncate max-w-[200px]" title={rotuloConta(c)}>{rotuloConta(c)}</td>
                        <td className={`px-2 py-0.5 text-right tabular-nums whitespace-nowrap ${v == null ? 'text-muted-foreground' : v < 0 ? 'text-rose-700' : ''}`}>{v == null ? '—' : formatMoeda(v)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
