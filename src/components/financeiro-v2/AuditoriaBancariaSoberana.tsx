// ============================================================================
// P0-H1 — Auditoria Bancária Soberana (render-only / diagnóstico).
// Consome o read-model fn_conciliacao_soberana (SOBERANA-01.3, vínculo governa)
// e exibe, orientado por exceção: Resumo → problemas primeiro → Corretos recolhido.
//
// READ-ONLY: nenhuma ação grava/altera dado. Botões = deep-link/atalho operacional
// (navegação + toast de contexto). Gravação (aceitar agrupamento, criar lançamento)
// fica para o P0-H2. Frente separada da Conciliação Bancária atual.
//
// RPC não tipado nos types gerados -> (supabase as any).rpc (idioma do projeto).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  initialAno: string | number;
  initialMes?: number;
  onNavigateToLancamentos?: (ano: number, mes: number) => void;
}

interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
}

// ── Contrato do JSON 01.3 ──────────────────────────────────────────────────
interface DivItem {
  link_id: string; motivo: string;
  extrato_id: string; data_ofx: string | null; valor: number; descricao: string | null;
  lancamento_id: string | null; data_lancamento: string | null; valor_lancamento: number | null;
  origem_lancamento: string | null; dias: number | null;
}
interface SistemaItem {
  lancamento_id: string; data: string | null; valor_assinado: number;
  sinal: string | null; descricao: string | null; origem_lancamento: string | null;
}
interface ExtratoItem {
  extrato_id: string; data: string | null; valor: number; tipo: string | null; descricao: string | null;
}
interface DesconItem {
  extrato_id: string; data: string | null; valor: number; tipo: string | null;
  descricao: string | null; lancamento_id: string | null;
}
interface AgrItem {
  extrato_id: string; valor: number;
  lancamentos: { lancamento_id: string; valor_assinado: number }[];
}
interface DiagnosticoSoberano {
  versao: string;
  resumo: {
    ofx: { movimentos: number; entradas: number; saidas: number; saldo_inicial: number | null; saldo_final: number | null };
    lv2: { lancamentos: number; entradas: number; saidas: number };
    corretos: { qtd: number; valor: number };
    desconsiderados: { movimentos: number; entradas: number; saidas: number };
  };
  veredito: { conciliado: boolean; bloqueios: { tipo: string; count: number }[] };
  buckets: {
    divergencias_vinculo: DivItem[];
    sistema_sem_extrato: SistemaItem[];
    extrato_sem_sistema: ExtratoItem[];
    desconsiderados: DesconItem[];
    agrupamentos: AgrItem[];
  };
}

// ── Rótulos legíveis (nunca campo técnico) ─────────────────────────────────
const LABEL_ORIGEM: Record<string, string> = {
  movimentacao_rebanho: 'Movimentação Rebanho', mesa_excel: 'Mesa Excel', manual: 'Manual',
  ofx: 'OFX', importacao: 'Importação', migracao: 'Migração',
  parcela_financiamento: 'Financiamento', contrato: 'Contrato',
  referencia_operacional: 'Referência', extrato: 'Extrato', boitel: 'Boitel',
};
const LABEL_MOTIVO: Record<string, string> = {
  cancelado: 'Cancelado', sinal_cruzado: 'Sinal cruzado', conta_divergente: 'Conta divergente',
  valor_divergente: 'Valor divergente', data_divergente: 'Data divergente', sem_lancamento: 'Sem lançamento',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};
const labelOrigem = (o: string | null) => (o ? LABEL_ORIGEM[o] ?? o : '—');
const labelMotivo = (m: string) => LABEL_MOTIVO[m] ?? m;

function StatusBadge({ texto, tom }: { texto: string; tom: 'rose' | 'amber' | 'violet' | 'emerald' | 'muted' }) {
  const cor = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    muted: 'bg-muted text-muted-foreground border-border',
  }[tom];
  return <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${cor}`}>{texto}</span>;
}

function BlocoProblema({
  titulo, count, children,
}: { titulo: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <Card className="p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

export function AuditoriaBancariaSoberana({ initialAno, initialMes, onNavigateToLancamentos }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [contaId, setContaId] = useState<string | null>(null);
  const [ano, setAno] = useState<number>(Number(initialAno) || new Date().getFullYear());
  const [mes, setMes] = useState<number>(initialMes ?? new Date().getMonth() + 1);
  const [corretosAberto, setCorretosAberto] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    supabase.from('financeiro_contas_bancarias')
      .select('id,nome_conta,nome_exibicao')
      .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao')
      .then(({ data }) => {
        const cs = (data as ContaRef[]) || [];
        setContas(cs);
        setContaId((prev) => prev ?? cs[0]?.id ?? null);
      });
  }, [clienteId]);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  const { data: diag, isLoading, error } = useQuery({
    queryKey: ['auditoria-soberana', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    staleTime: 30_000,
    queryFn: async (): Promise<DiagnosticoSoberano | null> => {
      const { data, error: e } = await (supabase as any).rpc('fn_conciliacao_soberana', {
        p_cliente: clienteId, p_conta: contaId, p_mes: anoMes,
      });
      if (e) throw e;
      if (!data || !data.buckets) return null;
      return data as DiagnosticoSoberano;
    },
  });

  const nomeConta = useMemo(() => {
    const c = contas.find((x) => x.id === contaId);
    return c ? (c.nome_exibicao ?? c.nome_conta) : '';
  }, [contas, contaId]);

  // H1 read-only: botão = navegação/atalho + toast de contexto. Nunca grava.
  const irLancamentos = (ctx: string) => {
    toast.info(ctx);
    onNavigateToLancamentos?.(ano, mes);
  };

  const anos = [ano - 1, ano, ano + 1].filter((a, i, arr) => arr.indexOf(a) === i);

  return (
    <div className="space-y-3 p-2 overflow-auto h-full">
      {/* Cabeçalho: conta + mês + veredito */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Auditoria Bancária Soberana</span>
        <select
          className="text-xs border rounded px-2 py-1 bg-background"
          value={contaId ?? ''}
          onChange={(e) => setContaId(e.target.value || null)}
        >
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome_exibicao ?? c.nome_conta}</option>
          ))}
        </select>
        <select className="text-xs border rounded px-2 py-1 bg-background" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1 bg-background" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {diag && (
          diag.veredito.conciliado
            ? <StatusBadge texto="Conciliado" tom="emerald" />
            : <StatusBadge texto="Não fecha" tom="rose" />
        )}
      </div>

      {isLoading && <Card className="p-3 text-xs text-muted-foreground">Carregando diagnóstico…</Card>}
      {error && <Card className="p-3 text-xs text-rose-600">Falha ao carregar o diagnóstico.</Card>}

      {diag && (() => {
        const b = diag.buckets;
        const difEnt = diag.resumo.ofx.entradas - diag.resumo.lv2.entradas;
        const difSai = diag.resumo.ofx.saidas - diag.resumo.lv2.saidas;
        return (
          <>
            {/* BLOCO 1 — RESUMO (Extrato × Sistema × Diferença) */}
            <Card className="p-3">
              <div className="text-xs font-semibold mb-1.5">Resumo da auditoria — {nomeConta}</div>
              <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground" />
                <span className="text-right font-medium text-muted-foreground">Extrato</span>
                <span className="text-right font-medium text-muted-foreground">Sistema</span>
                <span className="text-right font-medium text-muted-foreground">Diferença</span>

                <span className="text-muted-foreground">Saldo Inicial</span>
                <span className="text-right tabular-nums">{diag.resumo.ofx.saldo_inicial == null ? 'não disp.' : fmtBRL(diag.resumo.ofx.saldo_inicial)}</span>
                <span className="text-right tabular-nums text-muted-foreground">—</span>
                <span className="text-right tabular-nums text-muted-foreground">—</span>

                <span className="text-muted-foreground">Entradas</span>
                <span className="text-right tabular-nums">{fmtBRL(diag.resumo.ofx.entradas)}</span>
                <span className="text-right tabular-nums">{fmtBRL(diag.resumo.lv2.entradas)}</span>
                <span className={`text-right tabular-nums ${Math.abs(difEnt) >= 0.005 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>{fmtBRL(difEnt)}</span>

                <span className="text-muted-foreground">Saídas</span>
                <span className="text-right tabular-nums">{fmtBRL(diag.resumo.ofx.saidas)}</span>
                <span className="text-right tabular-nums">{fmtBRL(diag.resumo.lv2.saidas)}</span>
                <span className={`text-right tabular-nums ${Math.abs(difSai) >= 0.005 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>{fmtBRL(difSai)}</span>

                <span className="text-muted-foreground">Saldo Final</span>
                <span className="text-right tabular-nums">{diag.resumo.ofx.saldo_final == null ? 'não disp.' : fmtBRL(diag.resumo.ofx.saldo_final)}</span>
                <span className="text-right tabular-nums text-muted-foreground">—</span>
                <span className="text-right tabular-nums text-muted-foreground">—</span>
              </div>
            </Card>

            {/* Tira compacta de contadores (blocos vazios não ocupam a tela) */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
              <span>Divergências: <b className="tabular-nums text-foreground">{b.divergencias_vinculo.length}</b></span>
              <span>Sistema sem Extrato: <b className="tabular-nums text-foreground">{b.sistema_sem_extrato.length}</b></span>
              <span>Extrato sem Sistema: <b className="tabular-nums text-foreground">{b.extrato_sem_sistema.length}</b></span>
              <span>Agrupamentos: <b className="tabular-nums text-foreground">{b.agrupamentos.length}</b></span>
              <span>Desconsiderados: <b className="tabular-nums text-foreground">{b.desconsiderados.length}</b></span>
              <span>Corretos: <b className="tabular-nums text-foreground">{diag.resumo.corretos.qtd}</b></span>
            </div>

            {/* PROBLEMAS PRIMEIRO — só renderiza não-vazio */}
            <BlocoProblema titulo="Divergências de Vínculo" count={b.divergencias_vinculo.length}>
              {b.divergencias_vinculo.map((it) => (
                <div key={it.link_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <StatusBadge texto={labelMotivo(it.motivo)} tom="rose" />
                  <span className="w-12 shrink-0 text-muted-foreground">{fmtData(it.data_ofx)}</span>
                  <span className="w-24 text-right tabular-nums shrink-0">{fmtBRL(it.valor)}</span>
                  <span className="flex-1 truncate">{it.descricao ?? '—'}</span>
                  <span className="w-24 shrink-0 truncate text-muted-foreground">{labelOrigem(it.origem_lancamento)}</span>
                  <span className="w-16 shrink-0 text-[10px] text-muted-foreground text-right">{it.dias != null ? `${it.dias}d` : ''}</span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0"
                    onClick={() => irLancamentos(`Corrigir vínculo (${labelMotivo(it.motivo)}) · R$ ${fmtBRL(it.valor)}`)}>Corrigir</Button>
                </div>
              ))}
            </BlocoProblema>

            <BlocoProblema titulo="Sistema sem Extrato" count={b.sistema_sem_extrato.length}>
              {b.sistema_sem_extrato.map((it) => (
                <div key={it.lancamento_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <StatusBadge texto="Sem Extrato" tom="amber" />
                  <span className="w-12 shrink-0 text-muted-foreground">{fmtData(it.data)}</span>
                  <span className="w-24 text-right tabular-nums shrink-0">{fmtBRL(Math.abs(it.valor_assinado))}</span>
                  <span className="flex-1 truncate">{it.descricao ?? '—'}</span>
                  <span className="w-28 shrink-0 truncate text-muted-foreground">{labelOrigem(it.origem_lancamento)}</span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0"
                    onClick={() => irLancamentos(`Verificar lançamento sem extrato · R$ ${fmtBRL(Math.abs(it.valor_assinado))}`)}>Verificar</Button>
                </div>
              ))}
            </BlocoProblema>

            <BlocoProblema titulo="Extrato sem Sistema" count={b.extrato_sem_sistema.length}>
              {b.extrato_sem_sistema.map((it) => (
                <div key={it.extrato_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <StatusBadge texto="Sem Sistema" tom="amber" />
                  <span className="w-12 shrink-0 text-muted-foreground">{fmtData(it.data)}</span>
                  <span className="w-24 text-right tabular-nums shrink-0">{fmtBRL(Math.abs(it.valor))}</span>
                  <span className="flex-1 truncate">{it.descricao ?? '—'}</span>
                  <span className="w-20 shrink-0 truncate text-muted-foreground">{it.tipo ?? '—'}</span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0"
                    onClick={() => irLancamentos(`Criar lançamento p/ extrato · R$ ${fmtBRL(Math.abs(it.valor))} (${fmtData(it.data)})`)}>Criar</Button>
                </div>
              ))}
            </BlocoProblema>

            <BlocoProblema titulo="Agrupamentos (sugestão)" count={b.agrupamentos.length}>
              {b.agrupamentos.map((it) => (
                <div key={it.extrato_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <StatusBadge texto="Agrupado" tom="violet" />
                  <span className="w-24 text-right tabular-nums shrink-0">{fmtBRL(it.valor)}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    = {it.lancamentos.map((l) => fmtBRL(Math.abs(l.valor_assinado))).join(' + ')}
                  </span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0"
                    onClick={() => toast.info(`Candidato de agrupamento: R$ ${fmtBRL(it.valor)} = ${it.lancamentos.map((l) => fmtBRL(Math.abs(l.valor_assinado))).join(' + ')} (sugestão; gravação no H2)`)}>Agrupar</Button>
                </div>
              ))}
            </BlocoProblema>

            {/* Desconsiderados (fora do fechamento) */}
            <BlocoProblema titulo="Movimentos Desconsiderados" count={b.desconsiderados.length}>
              {b.desconsiderados.map((it) => (
                <div key={it.extrato_id} className="py-1.5 flex items-center gap-2 text-xs">
                  <StatusBadge texto="Desconsiderado" tom="muted" />
                  <span className="w-12 shrink-0 text-muted-foreground">{fmtData(it.data)}</span>
                  <span className="w-24 text-right tabular-nums shrink-0">{fmtBRL(Math.abs(it.valor))}</span>
                  <span className="flex-1 truncate">{it.descricao ?? '—'}</span>
                  <span className="w-20 shrink-0 truncate text-muted-foreground">{it.tipo ?? '—'}</span>
                </div>
              ))}
            </BlocoProblema>

            {/* Corretos — recolhido (só qtd + valor; sem lista) */}
            <Card className="p-3">
              <button type="button" onClick={() => setCorretosAberto((v) => !v)}
                className="w-full flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-700">{corretosAberto ? '▾' : '▸'} Corretos</span>
                <span className="text-muted-foreground tabular-nums">
                  {diag.resumo.corretos.qtd} · R$ {fmtBRL(diag.resumo.corretos.valor)}
                </span>
              </button>
              {corretosAberto && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {diag.resumo.corretos.qtd} movimento(s) com vínculo válido. Lista detalhada fora do escopo do H1.
                </div>
              )}
            </Card>
          </>
        );
      })()}
    </div>
  );
}
