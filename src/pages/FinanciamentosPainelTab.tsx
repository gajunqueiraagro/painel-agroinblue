import { useState, useMemo } from 'react';
import { ArrowLeft, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';
import { format } from 'date-fns';
import { useFinanciamentosPainel, type TipoFin } from '@/hooks/useFinanciamentosPainel';

interface Props {
  onVoltar?: () => void;
  onAbrirFinanciamento?: (id: string) => void;
}

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtCompact = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return fmt(v);
};

export default function FinanciamentosPainelTab({ onVoltar, onAbrirFinanciamento }: Props = {}) {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [mes, setMes] = useState<number | 'todos'>('todos');
  const [tipo, setTipo] = useState<TipoFin>('todos');
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(null);

  const painel = useFinanciamentosPainel(ano, tipo, mes);
  const { kpis, barrasMensais, pizzaVencimentos, dividaPorCredor, alavancagem, proximasParcelas, parcelasEnriquecidas, evolucaoDivida, historicoAlavancagem } = painel;

  const parcelasDoMes = useMemo(() => {
    if (!mesSelecionado) return [];
    const mm = String(mesSelecionado).padStart(2, '0');
    const prefix = `${ano}-${mm}`;
    return parcelasEnriquecidas
      .filter(p => p.vencimento.startsWith(prefix))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [mesSelecionado, parcelasEnriquecidas, ano]);

  const statusBadgeClass = (status: string, vencimento: string) => {
    const hoje = new Date().toISOString().slice(0, 10);
    if (status === 'pago') return 'bg-emerald-100 text-emerald-800';
    if (status === 'pendente' && vencimento < hoje) return 'bg-red-100 text-red-800';
    return 'bg-amber-100 text-amber-800';
  };
  const statusLabel = (status: string, vencimento: string) => {
    const hoje = new Date().toISOString().slice(0, 10);
    if (status === 'pago') return 'pago';
    if (status === 'pendente' && vencimento < hoje) return 'vencido';
    return status;
  };

  const anosDisp = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const alavancagemColor =
    alavancagem.status === 'saudavel' ? 'text-emerald-600'
      : alavancagem.status === 'atencao' ? 'text-amber-600'
        : alavancagem.status === 'critico' ? 'text-red-600'
          : 'text-muted-foreground';
  const alavancagemBarColor =
    alavancagem.status === 'saudavel' ? 'bg-emerald-500'
      : alavancagem.status === 'atencao' ? 'bg-amber-500'
        : alavancagem.status === 'critico' ? 'bg-red-500'
          : 'bg-muted';

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col bg-background" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="shrink-0 border-b shadow-sm bg-background px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onVoltar && (
              <Button variant="ghost" size="icon" onClick={onVoltar}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-bold">Painel de Financiamentos</h1>
            {kpis.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 text-[10px] font-semibold px-2 py-0.5">
                <AlertTriangle className="h-3 w-3" />
                {kpis.overdueCount} vencida{kpis.overdueCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosDisp.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mes === 'todos' ? 'todos' : String(mes)} onValueChange={v => setMes(v === 'todos' ? 'todos' : Number(v))}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos meses</SelectItem>
                {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipo} onValueChange={v => setTipo(v as TipoFin)}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos tipos</SelectItem>
                <SelectItem value="pecuaria">Pecuária</SelectItem>
                <SelectItem value="agricultura">Agricultura</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {painel.loading ? (
        <div className="flex-1 flex items-center justify-center"><span className="text-3xl animate-pulse">💰</span></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* LINHA 1+2 — grid 4 cols (cards + BarChart span 2x2) */}
          <div className="grid grid-cols-4 gap-3 auto-rows-fr">
            <KpiCard
              label="Saldo devedor"
              total={fmt(kpis.saldoDevedor.total.total)}
              principal={fmt(kpis.saldoDevedor.total.principal)}
              juros={fmt(kpis.saldoDevedor.total.juros)}
              extra={`Pec: ${fmtCompact(kpis.saldoDevedor.pecuaria.total)} · Agri: ${fmtCompact(kpis.saldoDevedor.agricultura.total)}`}
            />
            <KpiCard
              label={`Amortizado em ${ano}`}
              total={fmt(kpis.amortizadoNoAno.total)}
              totalClass="text-emerald-600"
              principal={fmt(kpis.amortizadoNoAno.principal)}
              juros={fmt(kpis.amortizadoNoAno.juros)}
            />

            {/* BarChart — col-span-2 row-span-2 */}
            <Card className="col-span-2 row-span-2">
              <CardContent className="p-3 h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <p className="text-xs font-semibold">Parcelas por mês em {ano}</p>
                  <p className="text-[10px] text-muted-foreground">Clique em uma barra</p>
                </div>
                <div className="flex-1 min-h-0" style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={barrasMensais}
                      onClick={(e: any) => {
                        const idx = e?.activeTooltipIndex;
                        if (typeof idx === 'number' && idx >= 0 && idx < 12) {
                          setMesSelecionado(idx + 1);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => fmtCompact(Number(v)).replace('R$ ', '')} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt(Number(v))} contentStyle={{ fontSize: 11 }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="principalPago" stackId="a" fill="#1e3a8a" name="Principal (pago)" />
                      <Bar dataKey="principalPendente" stackId="a" fill="#1e3a8a" fillOpacity={0.45} name="Principal (pendente)" />
                      <Bar dataKey="jurosPago" stackId="a" fill="#f97316" name="Juros (pago)" />
                      <Bar dataKey="jurosPendente" stackId="a" fill="#f97316" fillOpacity={0.45} name="Juros (pendente)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <KpiCard
              label={`A amortizar em ${ano}`}
              total={fmt(kpis.aAmortizarNoAno.total)}
              totalClass="text-amber-600"
              principal={fmt(kpis.aAmortizarNoAno.principal)}
              juros={fmt(kpis.aAmortizarNoAno.juros)}
            />
            <KpiCard
              label="Anos seguintes"
              total={fmt(kpis.totalAnosSeguintes.total)}
              principal={fmt(kpis.totalAnosSeguintes.principal)}
              juros={fmt(kpis.totalAnosSeguintes.juros)}
            />
          </div>

          {/* LINHA 3 — grid 3 cols: Pizza | Evolução | Credor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold">Perfil de vencimentos (Principal)</p>
                <p className="text-[10px] text-muted-foreground mb-1">Apenas amortização do principal</p>
                {pizzaVencimentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem parcelas pendentes</p>
                ) : (
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pizzaVencimentos} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {pizzaVencimentos.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(Number(v))} contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="text-center text-[10px] text-muted-foreground">Principal pendente: <strong>{fmt(kpis.saldoDevedor.total.principal)}</strong></p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-1">Evolução da dívida (Principal)</p>
                <p className="text-[10px] text-muted-foreground mb-1">Ini = saldo atual | anos = parcelas pendentes</p>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={evolucaoDivida}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => fmtCompact(Number(v)).replace('R$ ', '')} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt(Number(v))} contentStyle={{ fontSize: 11 }} labelFormatter={(l: string, payload: any) => {
                        const row = payload?.[0]?.payload;
                        return row?.anoRef ? `Ano ${row.anoRef}` : l;
                      }} />
                      <Bar dataKey="valor" name="Principal">
                        {evolucaoDivida.map((b, i) => <Cell key={i} fill={b.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-2">Dívida por credor (top 8)</p>
                {dividaPorCredor.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem dados</p>
                ) : (
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <BarChart data={dividaPorCredor} layout="vertical" margin={{ left: 40, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tickFormatter={(v) => fmtCompact(Number(v)).replace('R$ ', '')} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="credor" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(v: number) => fmt(Number(v))} contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="valor" fill="#0ea5e9" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* LINHA 4 — grid 2 cols: Alavancagem card | Histórico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold">Alavancagem pecuária</p>
                  {alavancagem.status === 'indisponivel' ? (
                    <span className="text-[10px] text-muted-foreground">Sem rebanho cadastrado</span>
                  ) : (
                    <span className={`text-xs font-bold ${alavancagemColor}`}>
                      {alavancagem.percentual.toFixed(1)}%
                      <span className="ml-2 text-[10px] uppercase">
                        {alavancagem.status === 'saudavel' && 'saudável'}
                        {alavancagem.status === 'atencao' && 'atenção'}
                        {alavancagem.status === 'critico' && 'crítico'}
                      </span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Dívida pecuária</p>
                    <p className="text-sm font-semibold tabular-nums">{fmt(alavancagem.dividaPecuaria)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Valor do rebanho</p>
                    <p className="text-sm font-semibold tabular-nums">{fmt(alavancagem.valorRebanho)}</p>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${alavancagemBarColor} transition-all`} style={{ width: `${Math.min(100, alavancagem.percentual)}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>0%</span>
                    <span>30% (saudável)</span>
                    <span>50% (atenção)</span>
                    <span>100%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-1">Histórico de alavancagem</p>
                <p className="text-[10px] text-muted-foreground mb-1">Barras: amortização anual · Linha: % alavancagem</p>
                {historicoAlavancagem.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem histórico</p>
                ) : (
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={historicoAlavancagem}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tickFormatter={(v) => fmtCompact(Number(v)).replace('R$ ', '')} tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${Number(v).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number, name: string) => name === 'Alavancagem' ? `${Number(v).toFixed(1)}%` : fmt(Number(v))} contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar yAxisId="left" dataKey="amortizado" fill="#1e3a8a" name="Amortizado" />
                        <Bar yAxisId="left" dataKey="meta" fill="#f97316" name="Meta" />
                        <Line yAxisId="right" type="monotone" dataKey="alavancagem" stroke="#dc2626" strokeWidth={2} name="Alavancagem" dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* LINHA 5 — Cronograma próximas parcelas */}
          <Card>
            <CardContent className="p-0">
              <div className="p-3 border-b">
                <p className="text-xs font-semibold">Cronograma — Próximas Parcelas</p>
              </div>
              {proximasParcelas.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Nenhuma parcela pendente</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-1.5">Vencimento</TableHead>
                      <TableHead className="py-1.5">Financiamento</TableHead>
                      <TableHead className="py-1.5">Tipo</TableHead>
                      <TableHead className="py-1.5">Credor</TableHead>
                      <TableHead className="text-right py-1.5">Principal</TableHead>
                      <TableHead className="text-right py-1.5">Juros</TableHead>
                      <TableHead className="text-right py-1.5">Total</TableHead>
                      <TableHead className="py-1.5">Status</TableHead>
                      <TableHead className="py-1.5 w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proximasParcelas.map(p => (
                      <TableRow
                        key={p.parcela_id}
                        className={`text-xs ${p.vencida ? 'bg-red-50 dark:bg-red-950/20' : p.vencendo ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                      >
                        <TableCell className="py-1 tabular-nums">
                          {format(new Date(p.vencimento + 'T12:00:00'), 'dd/MM/yyyy')}
                          {p.vencida && <span className="ml-1 text-[10px] font-semibold text-red-600">VENCIDA</span>}
                        </TableCell>
                        <TableCell className="py-1 max-w-[160px] truncate">{p.descricao}</TableCell>
                        <TableCell className="py-1">
                          <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium text-white ${p.tipo === 'pecuaria' ? 'bg-green-700' : 'bg-blue-600'}`}>
                            {p.tipo === 'pecuaria' ? 'Pecuária' : 'Agricultura'}
                          </span>
                        </TableCell>
                        <TableCell className="py-1 max-w-[120px] truncate">{p.credor}</TableCell>
                        <TableCell className="text-right tabular-nums py-1">{fmt(p.principal)}</TableCell>
                        <TableCell className="text-right tabular-nums py-1">{fmt(p.juros)}</TableCell>
                        <TableCell className="text-right tabular-nums py-1 font-semibold">{fmt(p.total)}</TableCell>
                        <TableCell className="py-1">
                          <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-semibold ${p.vencida ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            {p.vencida ? 'vencida' : 'pendente'}
                          </span>
                        </TableCell>
                        <TableCell className="py-1">
                          {onAbrirFinanciamento && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAbrirFinanciamento(p.financiamento_id)} title="Ver contrato">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Drawer: parcelas do mês clicado */}
      <Sheet open={mesSelecionado !== null} onOpenChange={(v) => { if (!v) setMesSelecionado(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Parcelas — {mesSelecionado ? `${MESES_NOME[mesSelecionado - 1]} / ${ano}` : ''}
            </SheetTitle>
            <SheetDescription>
              {parcelasDoMes.length} parcela{parcelasDoMes.length !== 1 ? 's' : ''} encontrada{parcelasDoMes.length !== 1 ? 's' : ''} no filtro atual.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {parcelasDoMes.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Nenhuma parcela neste mês.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-1.5">Venc.</TableHead>
                    <TableHead className="py-1.5">Financiamento</TableHead>
                    <TableHead className="py-1.5">Tipo</TableHead>
                    <TableHead className="py-1.5">Credor</TableHead>
                    <TableHead className="text-right py-1.5">Principal</TableHead>
                    <TableHead className="text-right py-1.5">Juros</TableHead>
                    <TableHead className="text-right py-1.5">Total</TableHead>
                    <TableHead className="py-1.5">Status</TableHead>
                    <TableHead className="py-1.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parcelasDoMes.map(p => (
                    <TableRow key={p.parcela_id} className="text-xs">
                      <TableCell className="py-1 tabular-nums">{format(new Date(p.vencimento + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="py-1 max-w-[180px] truncate">{p.descricao}</TableCell>
                      <TableCell className="py-1">
                        <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium text-white ${p.tipo === 'pecuaria' ? 'bg-green-700' : 'bg-blue-600'}`}>
                          {p.tipo === 'pecuaria' ? 'Pecuária' : 'Agricultura'}
                        </span>
                      </TableCell>
                      <TableCell className="py-1 max-w-[120px] truncate">{p.credor}</TableCell>
                      <TableCell className="text-right tabular-nums py-1">{fmt(p.principal)}</TableCell>
                      <TableCell className="text-right tabular-nums py-1">{fmt(p.juros)}</TableCell>
                      <TableCell className="text-right tabular-nums py-1 font-semibold">{fmt(p.total)}</TableCell>
                      <TableCell className="py-1">
                        <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-semibold ${statusBadgeClass(p.status, p.vencimento)}`}>
                          {statusLabel(p.status, p.vencimento)}
                        </span>
                      </TableCell>
                      <TableCell className="py-1">
                        {onAbrirFinanciamento && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => { onAbrirFinanciamento(p.financiamento_id); setMesSelecionado(null); }}
                          >
                            Ver contrato <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({
  label, total, totalClass = '', principal, juros, extra,
}: {
  label: string;
  total: string;
  totalClass?: string;
  principal: string;
  juros: string;
  extra?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${totalClass}`}>{total}</p>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>Principal</span><span>{principal}</span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>Juros</span><span>{juros}</span>
        </div>
        {extra && (
          <p className="text-[10px] text-muted-foreground pt-0.5 border-t">{extra}</p>
        )}
      </CardContent>
    </Card>
  );
}
