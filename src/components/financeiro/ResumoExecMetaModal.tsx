/**
 * ResumoExecMetaModal — Modal Executivo do Cenário META para aprovação.
 *
 * Consome useResumoExecMeta para garantir isolamento dos dados.
 * Renderiza: header com status, alertas, 9 KPIs, zootécnico, DRE e 4 gráficos.
 *
 * TODO (produção): RLS de meta_aprovacoes ainda é FOR ALL TO public — restringir
 * por (cliente_id, role) antes do deploy real.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, ClipboardCheck, Download, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RechartsTooltip, Legend, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useResumoExecMeta, type StatusAprovacao } from '@/hooks/useResumoExecMeta';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clienteId: string;
  fazendaId: string;
  ano: number;
  fazendaNome: string;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const PIE_COLORS = ['#1D9E75', '#378ADD', '#BA7517', '#7C3AED', '#DC2626', '#0891B2', '#F59E0B', '#6B7280'];

function fmtBRL(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '–';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNum(v: number | null | undefined, dec = 0): string {
  if (v == null || isNaN(v)) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '–';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}
function fmtDateBR(s: string | null | undefined): string {
  if (!s) return '–';
  try { return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return '–'; }
}

function statusBadge(status: StatusAprovacao | null) {
  if (status === 'aprovado') return { label: 'Aprovado ✓', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (status === 'reprovado') return { label: 'Reprovado', cls: 'bg-rose-100 text-rose-800 border-rose-300' };
  if (status === 'substituido') return { label: 'Substituído', cls: 'bg-muted text-muted-foreground border-border' };
  return { label: 'Em Revisão', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
}

export function ResumoExecMetaModal({ open, onOpenChange, clienteId, fazendaId, ano, fazendaNome }: Props) {
  const r = useResumoExecMeta(clienteId, fazendaId, ano);
  const [confirmAprovarOpen, setConfirmAprovarOpen] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const status = r.statusAprovacao;
  const badge = statusBadge(status);

  const handleAprovar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await r.aprovar(observacao);
      toast.success('META aprovada');
      setObservacao('');
      setConfirmAprovarOpen(false);
    } catch (e: any) {
      toast.error('Erro ao aprovar: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const aprovarDisabled = r.temAlertaCritico || status === 'aprovado' || saving || r.loading;

  // Gráfico 1: dados mensais
  const dadosMensais = useMemo(() => {
    const ent = r.financMetaMensal.get('1-Entradas') ?? new Array(12).fill(0);
    const sai = r.financMetaMensal.get('2-Saídas') ?? new Array(12).fill(0);
    return MESES_CURTOS.map((m, i) => ({
      mes: m, Receita: ent[i] || 0, Desembolso: sai[i] || 0, Resultado: (ent[i] || 0) - (sai[i] || 0),
    }));
  }, [r.financMetaMensal]);

  // Gráfico 2: fluxo acumulado
  const dadosFluxo = useMemo(
    () => MESES_CURTOS.map((m, i) => ({ mes: m, saldo: r.fluxoMensalAcumulado[i] ?? 0 })),
    [r.fluxoMensalAcumulado],
  );

  // Gráfico 3: composição custos top 7
  const dadosPizza = useMemo(() => {
    const grupos = r.financGrupoPorMacro.get('2-Saídas');
    if (!grupos || grupos.size === 0) return [];
    const arr = Array.from(grupos.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .filter(g => g.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    if (arr.length <= 7) return arr;
    const top = arr.slice(0, 7);
    const outros = arr.slice(7).reduce((s, g) => s + g.valor, 0);
    return [...top, { nome: 'Outros', valor: outros }];
  }, [r.financGrupoPorMacro]);

  // Gráfico 4: abates mensais
  const dadosAbates = useMemo(
    () => MESES_CURTOS.map((m, i) => ({ mes: m, cab: r.abatesMensaisMeta[i] ?? 0 })),
    [r.abatesMensaisMeta],
  );

  // DRE: linhas por macro com grupos aninhados
  const dreLinhas = useMemo(() => {
    const macros = Array.from(r.financMetaPorMacro.keys()).sort();
    return macros.map(macro => {
      const total = r.financMetaPorMacro.get(macro) || 0;
      const real = r.financRealAnoAnterior?.get(macro) ?? null;
      const delta = real != null ? total - real : null;
      const deltaPct = real != null && real !== 0 ? (delta! / Math.abs(real)) * 100 : null;
      const grupos = r.financGrupoPorMacro.get(macro);
      const grupoLinhas = grupos
        ? Array.from(grupos.entries()).sort((a, b) => b[1] - a[1])
        : [];
      return { macro, total, real, delta, deltaPct, grupoLinhas };
    });
  }, [r.financMetaPorMacro, r.financRealAnoAnterior, r.financGrupoPorMacro]);

  // Zootécnico
  const zootLinhas: { label: string; meta: number | null; real: number | null; fmt: (v: number) => string }[] = [
    { label: 'Rebanho Inicial', meta: r.rebanhoInicialMeta, real: r.rebanhoInicialReal, fmt: v => `${fmtNum(v)} cab.` },
    { label: 'Rebanho Final', meta: r.rebanhoFinalMeta, real: r.rebanhoFinalReal, fmt: v => `${fmtNum(v)} cab.` },
    { label: 'Abates (cab)', meta: r.abatesMeta, real: r.abatesReal, fmt: v => fmtNum(v) },
    { label: 'Vendas (cab)', meta: r.vendasMeta, real: r.vendasReal, fmt: v => fmtNum(v) },
    { label: 'Preço Médio (R$/@)', meta: r.precoMedioArroba, real: null, fmt: v => fmtBRL(v) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] p-0 gap-0 flex flex-col">
        {/* HEADER */}
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Cenário META {ano} — Resumo Executivo
                <Badge variant="outline" className={cn('text-[10px]', badge.cls)}>{badge.label}</Badge>
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                <strong>{fazendaNome}</strong>
                {r.aprovacaoAtual?.status === 'aprovado' && (
                  <> · Aprovado por {r.aprovacaoAtual.aprovado_email || '—'} em {fmtDateBR(r.aprovacaoAtual.aprovado_em)}</>
                )}
                {r.ultimaVersao && (
                  <> · Última versão: {r.ultimaVersao.nome || '—'} ({fmtDateBR(r.ultimaVersao.created_at)})</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={aprovarDisabled}
                onClick={() => setConfirmAprovarOpen(true)}
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Aprovar META
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* CONTEÚDO */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-5">
            {r.loading ? (
              <div className="space-y-2">
                <div className="h-12 w-full bg-muted animate-pulse rounded" />
                <div className="h-12 w-full bg-muted animate-pulse rounded" />
                <div className="h-12 w-full bg-muted animate-pulse rounded" />
              </div>
            ) : (
              <>
                {/* ALERTAS */}
                {(() => {
                  const criticos = r.alertas.filter(a => a.tipo === 'critico');
                  const avisos = r.alertas.filter(a => a.tipo === 'aviso');
                  if (criticos.length === 0 && avisos.length === 0) {
                    return (
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                          ✓ Nenhuma pendência crítica encontrada.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {criticos.length > 0 && (
                        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/20 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                            <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                              Pendências críticas — bloqueiam aprovação
                            </p>
                          </div>
                          <ul className="space-y-0.5 ml-6 list-disc text-xs text-rose-800 dark:text-rose-300">
                            {criticos.map((a, i) => <li key={i}>{a.mensagem}</li>)}
                          </ul>
                        </div>
                      )}
                      {avisos.length > 0 && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Info className="h-4 w-4 text-amber-600 shrink-0" />
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Avisos</p>
                          </div>
                          <ul className="space-y-0.5 ml-6 list-disc text-xs text-amber-800 dark:text-amber-300">
                            {avisos.map((a, i) => <li key={i}>{a.mensagem}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CARDS EXECUTIVOS */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Indicadores Executivos
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <KpiCard label="Receita Prevista" valor={fmtBRL(r.receitaMeta)} delta={r.variacaoReceita} positivoBom histRef={r.financRealAnoAnterior} />
                    <KpiCard label="Desembolso Previsto" valor={fmtBRL(r.desembolsoMeta)} delta={r.variacaoDesembolso} positivoBom={false} histRef={r.financRealAnoAnterior} />
                    <KpiCard
                      label="Resultado Operacional"
                      valor={fmtBRL(r.resultadoMeta)}
                      delta={r.variacaoResultado}
                      positivoBom
                      histRef={r.financRealAnoAnterior}
                      destaque={r.resultadoMeta < 0 ? 'red' : 'green'}
                    />
                    <KpiCard label="Margem Operacional (%)" valor={`${r.margemMeta.toFixed(1)}%`} delta={null} histRef={null} destaque={r.margemMeta < 0 ? 'red' : 'green'} />
                    <KpiCard label="Saldo Inicial de Caixa" valor={fmtBRL(r.saldoInicial)} delta={null} histRef={null} />
                    <KpiCard label="Saldo Final Projetado" valor={fmtBRL(r.saldoFinalProjetado)} delta={null} histRef={null} destaque={r.saldoFinalProjetado < 0 ? 'red' : 'blue'} />
                    <KpiCard label="Dívida Inicial" valor={fmtBRL(r.dividaInicial)} delta={null} histRef={null} />
                    <KpiCard label="Amortizações Previstas" valor={fmtBRL(r.amortizacoesMeta)} delta={null} histRef={null} />
                    <KpiCard label="Dívida Final Projetada" valor={fmtBRL(r.dividaFinalProjetada)} delta={null} histRef={null} destaque={r.dividaFinalProjetada > r.dividaInicial ? 'red' : 'blue'} />
                  </div>
                </div>

                {/* ZOOTÉCNICO */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Zootécnico — META vs Ano Anterior
                  </p>
                  <div className="rounded-lg border border-border bg-card overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Indicador</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">META</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Ano Anterior</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground w-20">Δ%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zootLinhas.map(row => {
                          const delta = row.meta != null && row.real != null && row.real !== 0
                            ? ((row.meta - row.real) / Math.abs(row.real)) * 100
                            : null;
                          return (
                            <tr key={row.label} className="border-b border-border/50">
                              <td className="py-1.5 px-3">{row.label}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{row.meta != null ? row.fmt(row.meta) : '–'}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{row.real != null ? row.fmt(row.real) : '–'}</td>
                              <td className={cn('py-1.5 px-3 text-right tabular-nums font-semibold',
                                delta == null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                {delta == null ? '–' : fmtPct(delta)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DRE */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    DRE Resumida — META vs Ano Anterior
                  </p>
                  <div className="rounded-lg border border-border bg-card overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Macro / Grupo</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">META Anual</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Ano Anterior</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Δ R$</th>
                          <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground w-20">Δ%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dreLinhas.length === 0 && (
                          <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sem dados de planejamento META.</td></tr>
                        )}
                        {dreLinhas.map(linha => (
                          <>
                            <tr key={`m-${linha.macro}`} className="border-b bg-muted/20 font-bold">
                              <td className="py-1.5 px-3">{linha.macro}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{fmtBRL(linha.total)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{linha.real != null ? fmtBRL(linha.real) : '–'}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{linha.delta != null ? fmtBRL(linha.delta) : '–'}</td>
                              <td className={cn('py-1.5 px-3 text-right tabular-nums',
                                linha.deltaPct == null ? 'text-muted-foreground' : linha.deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                {linha.deltaPct == null ? '–' : fmtPct(linha.deltaPct)}
                              </td>
                            </tr>
                            {linha.grupoLinhas.map(([gnome, gval]) => (
                              <tr key={`g-${linha.macro}-${gnome}`} className="border-b border-border/40">
                                <td className="py-1 px-3 pl-8 text-muted-foreground">↳ {gnome}</td>
                                <td className="py-1 px-3 text-right tabular-nums">{fmtBRL(gval)}</td>
                                <td className="py-1 px-3 text-right tabular-nums text-muted-foreground">–</td>
                                <td className="py-1 px-3 text-right tabular-nums text-muted-foreground">–</td>
                                <td className="py-1 px-3 text-right tabular-nums text-muted-foreground">–</td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GRÁFICOS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ChartCard title="Receita × Desembolso × Resultado Mensal">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={dadosMensais}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={48} />
                        <RechartsTooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ fontSize: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="Receita" fill="#16A34A" />
                        <Bar dataKey="Desembolso" fill="#E11D48" />
                        <Bar dataKey="Resultado" fill="#2563EB" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Fluxo de Caixa Projetado (acumulado)">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={dadosFluxo}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={56} />
                        <ReferenceLine y={0} stroke="#E11D48" strokeDasharray="3 3" />
                        <RechartsTooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="saldo" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Composição dos Custos">
                    {dadosPizza.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-12">Sem dados de saídas.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={dadosPizza} dataKey="valor" nameKey="nome" cx="40%" cy="50%" outerRadius={90} innerRadius={35}
                            label={(p: any) => `${((p.percent || 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                            {dadosPizza.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ fontSize: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} layout="vertical" verticalAlign="middle" align="right" />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Abates Mensais (cabeças)">
                    {r.abatesMeta === 0 && r.abatesMensaisMeta.every(v => v === 0) ? (
                      <p className="text-xs text-muted-foreground text-center py-12">Dados zootécnicos indisponíveis.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dadosAbates}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={40} />
                          <RechartsTooltip formatter={(v: any) => `${fmtNum(Number(v))} cab.`} contentStyle={{ fontSize: 10 }} />
                          <Bar dataKey="cab" fill="#1D9E75" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Confirmar aprovação */}
      <AlertDialog open={confirmAprovarOpen} onOpenChange={setConfirmAprovarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Cenário META {ano}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Aprovará a versão <strong>{r.ultimaVersao?.nome || '—'}</strong> ({fmtDateBR(r.ultimaVersao?.created_at)}).
              </span>
              <span className="block text-[11px]">
                Aprovações anteriores serão marcadas como <em>substituidas</em> automaticamente.
              </span>
              <Textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder="Observação (opcional)"
                rows={3}
                className="text-xs mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleAprovar(); }}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Aprovando…' : 'Confirmar Aprovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────
function KpiCard({
  label, valor, delta, positivoBom = true, histRef, destaque,
}: {
  label: string;
  valor: string;
  delta: number | null;
  positivoBom?: boolean;
  histRef: any;
  destaque?: 'green' | 'red' | 'blue';
}) {
  const bordaCls = destaque === 'red' ? 'border-l-rose-500' : destaque === 'blue' ? 'border-l-blue-500' : destaque === 'green' ? 'border-l-emerald-500' : 'border-l-border';
  let deltaCls = 'text-muted-foreground';
  if (delta != null) {
    const positivo = delta >= 0;
    deltaCls = (positivo === positivoBom) ? 'text-emerald-600' : 'text-rose-600';
  }
  return (
    <div className={cn('rounded-lg border border-border bg-card p-3 border-l-[3px]', bordaCls)}>
      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight mt-0.5">{valor}</div>
      <div className="text-[10px] mt-0.5">
        {histRef === null ? (
          <span className="text-muted-foreground italic">— sem histórico</span>
        ) : delta != null ? (
          <span className={cn('font-semibold', deltaCls)}>{fmtPct(delta)} vs ano anterior</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// ─── ChartCard ───────────────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}
