import { useState, useMemo } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useMovimentacoesMensais } from '@/hooks/useMovimentacoesMensais';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { Lancamento, SaldoInicial, Categoria } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DollarSign, AlertTriangle } from 'lucide-react';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import type { SubAba } from './FinanceiroTab';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { FLUXO_LINHAS } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { validarEquacaoTotal } from '@/lib/calculos/validacaoZootecnica';
import { MesAnteriorAvisoIcon } from '@/components/MesAnteriorAvisoIcon';
import { FluxoFechamentoFooter } from '@/components/FluxoFechamentoFooter';

const QB = new Set(['04', '07', '10']);
const qb = (key: string) => QB.has(key) ? 'border-l border-border/60' : '';

const fmtNum = (v: number | string | undefined): string => {
  if (v == null) return '–';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!n && n !== 0) return '–';
  return n.toLocaleString('pt-BR');
};

const fmtDec = (v: number | null | undefined, decimals: number): string => {
  if (v == null) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba, opts?: { ano?: string; mes?: string; label?: string; status?: string }) => void;
  onNavigateToValorRebanho?: () => void;
  onNavigateToFechamentoPastos?: () => void;
  onSetSaldo?: (ano: number, mes: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number, precoKg?: number) => void;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

export function FluxoAnualTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao, onNavigateToValorRebanho, onNavigateToFechamentoPastos, onSetSaldo, onNavigateToReclass }: Props) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);

  // FONTE OFICIAL: anos reais do banco
  const { data: anosDisponiveis = [String(new Date().getFullYear())] } = useAnosDisponiveis();

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'meta'>('realizado');

  // FONTE OFICIAL: useRebanhoOficial — saldos agregados da vw_zoot_categoria_mensal
  const cenarioView = statusFiltro === 'realizado' ? 'realizado' : 'meta';
  const rebanhoOf = useRebanhoOficial({ ano: Number(anoFiltro), cenario: cenarioView as 'realizado' | 'meta' });
  console.log('[FLUXO DEBUG]', { anoFiltro, cenarioView, fazendaAtualId: fazendaAtual?.id, fazendaAtualNome: fazendaAtual?.nome });
  // Verificar se o mês tem dados oficiais de fechamento
  const temFechamento = (mesKey: string): boolean => {
    const z = fazendaByMes[mesKey];
    return z?.fonte_oficial_mes === 'fechamento';
  };

  // UNIFICAÇÃO: saldos da fazenda = soma das categorias (totaisPorMes)
  // Isso garante paridade absoluta entre quadro anual e visão por categoria.
  const totaisPorMes = rebanhoOf.totaisPorMes;

  // Validação automática da equação antes de renderizar
  const errosEquacao = useMemo(() => {
    if (!rebanhoOf.rawCategorias || rebanhoOf.rawCategorias.length === 0) return [];
    return validarEquacaoTotal(rebanhoOf.rawCategorias).filter(r => !r.ok);
  }, [rebanhoOf.rawCategorias]);

  // Para indicadores (GMD, lotação, peso médio), ainda usa fazendaByMes
  const fazendaByMes = rebanhoOf.fazendaByMes;

  // FONTE OFICIAL: query direta ao banco com paginação completa para movimentações
  const { data: movData } = useMovimentacoesMensais(Number(anoFiltro), cenarioView as 'realizado' | 'meta');
  const porMesTipo = movData?.porMesTipo ?? {};
  const totalAno = movData?.totalAno ?? ({} as Record<string, number>);

  if (drilldownMonth) {
    const mesLabel = MESES_COLS.find(m => m.key === drilldownMonth)?.label || drilldownMonth;
    return (
      <div className="animate-fade-in pb-20">
        <div className="px-3 py-1.5 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDrilldownMonth(null)} className="gap-1 h-7 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
          <h2 className="text-sm font-bold text-foreground">
            Evolução de Categorias
          </h2>
        </div>
        <EvolucaoCategoriaTab
          initialAno={anoFiltro}
          initialMes={drilldownMonth}
          initialCenario={statusFiltro}
          onNavigateToReclass={onNavigateToReclass}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      {/* Filtros - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="h-7 text-xs font-bold w-20">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
            {([
              { value: 'realizado' as const, label: 'Realizado' },
              { value: 'meta' as const, label: 'Meta' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFiltro(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  statusFiltro === opt.value
                    ? opt.value === 'realizado'
                      ? 'bg-green-700 text-white shadow-sm'
                      : 'bg-orange-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">Toque em um mês para ver por categoria</span>

          {onNavigateToValorRebanho && (
            <button
              onClick={onNavigateToValorRebanho}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted/50 text-[10px] font-bold text-foreground transition-colors shrink-0"
            >
              <DollarSign className="h-3 w-3 text-primary" />
              Valor Rebanho
            </button>
          )}
        </div>
      </div>

      {/* Saldo Inicial — only on base year */}
      {onSetSaldo && (
        <SaldoInicialForm
          saldosIniciais={saldosIniciais}
          onSetSaldo={onSetSaldo}
          anoBase={Number(anoFiltro)}
          totalLancamentos={lancamentos.length}
        />
      )}

      {/* Alerta de inconsistência de cálculo */}
      {errosEquacao.length > 0 && !isGlobal && (
        <div className="mx-4 mb-2 p-2 rounded-md border border-destructive/50 bg-destructive/10 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-destructive">Inconsistência de cálculo detectada</p>
            <p className="text-muted-foreground">
              Meses com divergência: {errosEquacao.map(e => `${e.mesLabel} (Δ${e.diferenca})`).join(', ')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Equação: SI + Ent.Ext + Evol.E − Saí.Ext − Evol.S ≠ SF
            </p>
          </div>
        </div>
      )}

      <div className="p-3 pt-2 flex justify-center">

      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto w-[70%] max-w-[1200px] min-w-[900px]">
        <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="border-b bg-primary/25">
              <th className="text-left px-1.5 py-1.5 font-bold text-primary-foreground sticky left-0 bg-primary/25 w-[110px]">
                Movimentação
              </th>
              {MESES_COLS.map(m => (
                <th
                  key={m.key}
                  className={`px-1 py-1.5 font-bold text-foreground text-center cursor-pointer hover:bg-primary/30 transition-colors ${qb(m.key)}`}
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  <div className="flex items-center justify-center gap-0.5">
                    <span>{m.label}</span>
                    <MesAnteriorAvisoIcon
                      fazendaId={fazendaAtual?.id}
                      anoMes={`${anoFiltro}-${m.key}`}
                      size={11}
                    />
                  </div>
                </th>
              ))}
              <th className="px-1.5 py-1.5 font-bold text-primary-foreground text-center w-[60px] bg-primary/25 border-l border-border/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Saldo Início — FONTE OFICIAL: Σ categorias (totaisPorMes) */}
            <tr className="bg-primary/15 border-b">
              <td className="px-1.5 py-1 font-bold text-foreground sticky left-0 bg-primary/15">Saldo Início</td>
              {MESES_COLS.map(m => {
                const mes = Number(m.key);
                const t = totaisPorMes[mes];
                const valor = t?.saldo_inicial;
                const isNeg = valor != null && valor < 0;
                return (
                  <td
                    key={m.key}
                    className={`px-1 py-1 text-center font-extrabold tabular-nums cursor-pointer hover:bg-accent/50 transition-colors ${qb(m.key)} ${isNeg ? 'text-destructive' : 'text-foreground'}`}
                    onClick={() => setDrilldownMonth(m.key)}
                    title={isNeg ? '⚠ Saldo inicial negativo — verificar consistência' : undefined}
                  >
                    {valor != null ? fmtNum(valor) : '–'}
                    {isNeg && <span className="text-[7px] ml-0.5">⚠</span>}
                  </td>
                );
              })}
              <td className="px-1.5 py-1 text-center font-extrabold text-foreground tabular-nums bg-primary/15 border-l border-border/60">
                {fmtNum(totaisPorMes[1]?.saldo_inicial)}
              </td>
            </tr>

            {/* Linhas de movimentação — FONTE: query direta ao banco */}
            {FLUXO_LINHAS.map((li) => {
              const corPositiva = statusFiltro === 'meta' ? 'text-orange-500' : 'text-success';
              const corNegativa = statusFiltro === 'meta' ? 'text-orange-400' : 'text-destructive';
              const rowBg = li.sinal === '+' ? 'bg-emerald-50/40' : 'bg-red-50/30';
              const colFirstBg = li.sinal === '+' ? 'bg-emerald-50/60' : 'bg-red-50/50';
              return (
              <tr
                key={li.tipo}
                className={`${rowBg} ${onNavigateToMovimentacao ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                onClick={() => onNavigateToMovimentacao?.(li.tipo as SubAba, {
                  ano: anoFiltro,
                  label: `${li.label} | ${anoFiltro}`,
                  status: statusFiltro,
                })}
              >
                <td className={`px-1.5 py-0.5 font-medium text-foreground sticky left-0 ${colFirstBg}`}>
                  <span className="text-[8px] opacity-60">{li.sinal === '+' ? '+' : '−'}</span> {li.label}
                </td>
                {MESES_COLS.map(m => {
                  const val = porMesTipo[m.key]?.[li.tipo] ?? 0;
                  return (
                    <td
                      key={m.key}
                      className={`px-1 py-0.5 text-center font-semibold tabular-nums ${qb(m.key)} ${val > 0 ? (li.sinal === '+' ? corPositiva : corNegativa) : 'text-transparent'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigateToMovimentacao?.(li.tipo as SubAba, {
                          ano: anoFiltro,
                          mes: m.key,
                          label: `${li.label} | ${m.label}/${anoFiltro}`,
                          status: statusFiltro,
                        });
                      }}
                    >
                      {val ? fmtNum(val) : '–'}
                    </td>
                  );
                })}
                <td className={`px-1.5 py-0.5 text-center font-bold tabular-nums bg-muted/80 border-l border-border/60 ${(totalAno[li.tipo] ?? 0) > 0 ? (li.sinal === '+' ? corPositiva : corNegativa) : 'text-transparent'}`}>
                  {totalAno[li.tipo] ? fmtNum(totalAno[li.tipo]) : '–'}
                </td>
              </tr>
              );
            })}

            {/* Saldo Final — FONTE OFICIAL: Σ categorias (totaisPorMes) */}
            <tr className="border-t-2 bg-primary/20">
              <td className="px-1.5 py-1 font-extrabold text-foreground sticky left-0 bg-primary/20">Saldo Final</td>
              {MESES_COLS.map((m) => {
                const mes = Number(m.key);
                const t = totaisPorMes[mes];
                const saldoFim = t?.saldo_final;
                const isNeg = saldoFim != null && saldoFim < 0;
                return (
                  <td key={m.key} className={`px-1 py-1 text-center font-extrabold tabular-nums ${qb(m.key)} ${isNeg ? 'text-destructive' : 'text-foreground'}`}
                      title={isNeg ? '⚠ Saldo final negativo — verificar saídas vs entradas' : undefined}>
                    {saldoFim != null ? fmtNum(saldoFim) : '–'}
                    {isNeg && <span className="text-[7px] ml-0.5">⚠</span>}
                  </td>
                );
              })}
              <td className={`px-1.5 py-1 text-center font-extrabold tabular-nums bg-primary/20 border-l border-border/60 ${(totaisPorMes[12]?.saldo_final ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                {fmtNum(totaisPorMes[12]?.saldo_final)}
              </td>
            </tr>

            {/* Indicadores zootécnicos — fonte única: vw_zoot_fazenda_mensal */}
            {(() => {
              const now = new Date();
              const mesAtualKey = String(now.getMonth() + 1).padStart(2, '0');
              const anoAtual = now.getFullYear();
              const isFuturo = (mKey: string) =>
                statusFiltro === 'realizado' && (Number(anoFiltro) > anoAtual || (Number(anoFiltro) === anoAtual && mKey > mesAtualKey));

              const isCenarioMeta = statusFiltro === 'meta';
              const temDado = (mKey: string) => temFechamento(mKey) || isCenarioMeta;

              return (
                <>
                  <tr className="border-t bg-muted/40">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/50 text-[8px]">Peso médio (kg)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = fazendaByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {temDado(m.key) && z?.peso_medio_final_kg != null ? fmtDec(z.peso_medio_final_kg, 2) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/50 border-l border-border/60">–</td>
                  </tr>

                  <tr className="bg-muted/30">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/40 text-[8px]">GMD (kg/cab/dia)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = fazendaByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {temDado(m.key) && z?.gmd_kg_cab_dia != null ? fmtDec(z.gmd_kg_cab_dia, 3) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/40 border-l border-border/60">
                      {(() => {
                        const vals = MESES_COLS.filter(m => !isFuturo(m.key) && temDado(m.key)).map(m => fazendaByMes[m.key]?.gmd_kg_cab_dia).filter((v): v is number => v != null && v !== 0);
                        return vals.length > 0 ? fmtDec(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : '–';
                      })()}
                    </td>
                  </tr>

                  <tr className="bg-muted/40 border-b">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/50 text-[8px]">Lot. média (UA/ha)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = fazendaByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {temDado(m.key) && z?.lotacao_ua_ha != null ? fmtDec(z.lotacao_ua_ha, 2) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/50 border-l border-border/60">
                      {(() => {
                        const vals = MESES_COLS.filter(m => !isFuturo(m.key) && temDado(m.key)).map(m => fazendaByMes[m.key]?.lotacao_ua_ha).filter((v): v is number => v != null && v > 0);
                        return vals.length > 0 ? fmtDec(vals.reduce((a, b) => a + b, 0) / vals.length, 2) : '–';
                      })()}
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
      </div>

      {/* Footer de atalhos do fluxo de fechamento */}
      {(onNavigateToFechamentoPastos || onNavigateToValorRebanho) && (
        <FluxoFechamentoFooter
          current="movimentacoes"
          onNext={onNavigateToFechamentoPastos}
        />
      )}
    </div>
  );
}
