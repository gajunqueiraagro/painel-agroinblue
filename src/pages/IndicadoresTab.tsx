/**
 * Tela de Indicadores Zootécnicos — leitura executiva.
 *
 * Esta tela NÃO faz nenhum cálculo. Apenas exibe o que o hook retorna.
 */

import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useIndicadoresZootecnicos, type Comparacao, type GmdAbertura } from '@/hooks/useIndicadoresZootecnicos';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function IndicadoresTab({ lancamentos, saldosIniciais }: Props) {
  const { fazendaAtual } = useFazenda();
  const { pastos } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));

  const ind = useIndicadoresZootecnicos(
    fazendaId,
    Number(anoFiltro),
    Number(mesFiltro),
    lancamentos,
    saldosIniciais,
    pastos,
  );

  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  return (
    <div className="p-4 max-w-lg mx-auto animate-fade-in pb-20 space-y-4">
      {/* Seletores */}
      <div className="flex gap-2">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-24 touch-target text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-28 touch-target text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES_COLS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* BLOCO 1 — Estoque */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Estoque</h3>
          <div className="grid grid-cols-2 gap-3">
            <IndicadorCard
              label="Rebanho"
              valor={formatNum(ind.saldoFinalMes)}
              unidade="cab"
              comparacao={ind.comparacoes.saldoFinalMes}
            />
            <IndicadorCard
              label="Peso Médio"
              valor={ind.pesoMedioRebanhoKg !== null ? formatNum(ind.pesoMedioRebanhoKg, 1) : '—'}
              unidade="kg"
              estimado={ind.qualidade.pesoMedioEstimado}
              comparacao={ind.comparacoes.pesoMedioRebanhoKg}
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2 — Lotação */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Lotação</h3>
          <div className="grid grid-cols-3 gap-3">
            <IndicadorCard label="UA Total" valor={formatNum(ind.uaTotal, 1)} unidade="UA" />
            <IndicadorCard
              label="UA/ha"
              valor={ind.uaHa !== null ? formatNum(ind.uaHa, 2) : '—'}
              unidade=""
              comparacao={ind.comparacoes.uaHa}
            />
            <IndicadorCard
              label="Área Prod."
              valor={formatNum(ind.areaProdutiva, 1)}
              unidade="ha"
              estimado={ind.qualidade.areaProdutivaEstimativa}
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 3 — Produção do Mês */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Produção — {mesLabel}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <IndicadorCard
              label="Arrobas"
              valor={formatNum(ind.arrobasSaidasMes, 1)}
              unidade="@"
              comparacao={ind.comparacoes.arrobasSaidasMes}
            />
            <IndicadorCard
              label="@/ha"
              valor={ind.arrobasHaMes !== null ? formatNum(ind.arrobasHaMes, 2) : '—'}
              unidade=""
              comparacao={ind.comparacoes.arrobasHaMes}
            />
            <IndicadorCard
              label="Desfrute"
              valor={ind.desfruteCabecasMes !== null ? formatNum(ind.desfruteCabecasMes, 1) : '—'}
              unidade="%"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 4 — Acumulado do Ano */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Acumulado — {anoFiltro}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <IndicadorCard
              label="Arrobas"
              valor={formatNum(ind.arrobasSaidasAcumuladoAno, 1)}
              unidade="@"
              comparacao={ind.comparacoes.arrobasSaidasAcumuladoAno}
            />
            <IndicadorCard
              label="@/ha"
              valor={ind.arrobasHaAcumuladoAno !== null ? formatNum(ind.arrobasHaAcumuladoAno, 2) : '—'}
              unidade=""
              comparacao={ind.comparacoes.arrobasHaAcumuladoAno}
            />
            <IndicadorCard
              label="Desfrute"
              valor={ind.desfruteCabecasAcumulado !== null ? formatNum(ind.desfruteCabecasAcumulado, 1) : '—'}
              unidade="%"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <IndicadorCard
              label="Desfrute @"
              valor={ind.desfruteArrobasAcumulado !== null ? formatNum(ind.desfruteArrobasAcumulado, 1) : '—'}
              unidade="%"
            />
            <IndicadorCard
              label="Desfrute @ mês"
              valor={ind.desfruteArrobasMes !== null ? formatNum(ind.desfruteArrobasMes, 1) : '—'}
              unidade="%"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 5 — Desempenho (GMD) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Desempenho</h3>
          {ind.qualidade.gmdDisponivel ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <IndicadorCard
                  label="GMD mês"
                  valor={ind.gmdMes !== null ? formatNum(ind.gmdMes, 2) : '—'}
                  unidade="kg/dia"
                />
                <IndicadorCard
                  label="GMD acumulado"
                  valor={ind.gmdAcumulado !== null ? formatNum(ind.gmdAcumulado, 2) : '—'}
                  unidade="kg/dia"
                />
              </div>
              <GmdDetalheSheet abertura={ind.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>Dados insuficientes para calcular GMD. Informe pesos nos lançamentos e saldos iniciais.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 6 — Valor Patrimonial */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Valor do Rebanho</h3>
            {ind.qualidade.valorRebanhoFechado && (
              <Badge variant="outline" className="text-xs">Fechado</Badge>
            )}
          </div>
          {ind.valorRebanho !== null ? (
            <div className="grid grid-cols-3 gap-3">
              <IndicadorCard
                label="Total"
                valor={formatMoedaCompacto(ind.valorRebanho)}
                unidade=""
                comparacao={ind.comparacoes.valorRebanho}
              />
              <IndicadorCard
                label="R$/cab"
                valor={ind.valorPorCabeca !== null ? formatMoeda(ind.valorPorCabeca) : '—'}
                unidade=""
                small
              />
              <IndicadorCard
                label="R$/ha"
                valor={ind.valorPorHa !== null ? formatMoeda(ind.valorPorHa) : '—'}
                unidade=""
                small
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Info className="h-4 w-4 shrink-0" />
              <span>Fechamento de valor não realizado para {mesLabel}/{anoFiltro}.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas */}
      {(ind.qualidade.pesoMedioEstimado || ind.qualidade.areaProdutivaEstimativa || !ind.qualidade.valorRebanhoFechado) && (
        <div className="space-y-1.5">
          {ind.qualidade.pesoMedioEstimado && (
            <AlertRow>Peso médio estimado — realize fechamento de pastos para maior precisão</AlertRow>
          )}
          {ind.qualidade.areaProdutivaEstimativa && (
            <AlertRow>Área produtiva usando fallback — cadastre pastos ativos com área</AlertRow>
          )}
          {!ind.qualidade.valorRebanhoFechado && ind.valorRebanho !== null && (
            <AlertRow>Valor do rebanho em aberto — feche o mês para oficializar</AlertRow>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes — Indicador Card
// ---------------------------------------------------------------------------

function IndicadorCard({
  label, valor, unidade, comparacao, estimado, small,
}: {
  label: string;
  valor: string;
  unidade: string;
  comparacao?: Comparacao | null;
  estimado?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`${small ? 'text-base' : 'text-xl'} font-bold text-foreground leading-tight`}>
          {valor}
        </span>
        {unidade && <span className="text-xs text-muted-foreground">{unidade}</span>}
        {estimado && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-amber-500 cursor-help">*</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Valor estimado — sem fechamento oficial</TooltipContent>
          </Tooltip>
        )}
      </div>
      {comparacao && comparacao.disponivel && <ComparacaoChip comp={comparacao} />}
    </div>
  );
}

function ComparacaoChip({ comp }: { comp: Comparacao }) {
  const isPositive = comp.diferencaAbsoluta > 0;
  const isZero = comp.diferencaAbsoluta === 0;

  const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
  const colorClass = isZero
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';

  const diffStr = isPositive
    ? `+${formatNum(comp.diferencaAbsoluta, 1)}`
    : formatNum(comp.diferencaAbsoluta, 1);

  const pctStr = comp.diferencaPercentual !== null
    ? ` | ${isPositive ? '+' : ''}${formatNum(comp.diferencaPercentual, 1)}%`
    : '';

  const labelTipo = comp.tipo === 'yoy'
    ? 'vs ano ant.'
    : comp.tipo === 'acumulado_yoy'
      ? 'vs acum. ant.'
      : 'vs mês ant.';

  return (
    <div className={`flex items-center gap-0.5 mt-0.5 ${colorClass}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-medium">{diffStr}{pctStr}</span>
      <span className="text-[9px] text-muted-foreground ml-0.5">{labelTipo}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes — GMD Detail Sheet
// ---------------------------------------------------------------------------

function GmdDetalheSheet({ abertura, mesLabel, anoLabel }: { abertura: GmdAbertura; mesLabel: string; anoLabel: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="text-xs text-primary underline-offset-2 hover:underline mt-1 text-left">
          Explicando o GMD →
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Explicando o GMD — {mesLabel}/{anoLabel}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Resultado */}
          <div className="text-center py-3 border rounded-lg bg-muted/30">
            <span className="text-3xl font-bold text-foreground">
              {abertura.gmd !== null ? formatNum(abertura.gmd, 2) : '—'}
            </span>
            <span className="text-sm text-muted-foreground ml-1">kg/dia</span>
            {!abertura.baseCompleta && (
              <p className="text-xs text-amber-500 mt-1">⚠ Base incompleta — faltam dados de peso</p>
            )}
          </div>

          {/* Conta aberta */}
          <div className="space-y-1.5 text-sm">
            <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider mb-2">Conta aberta</h4>
            <LinhaCalculo label="Peso final do estoque" valor={abertura.pesoFinalEstoque} />
            <LinhaCalculo label="(-) Peso inicial do estoque" valor={abertura.pesoInicialEstoque} negativo />
            <LinhaCalculo label="(-) Peso das entradas" valor={abertura.pesoEntradas} negativo />
            <LinhaCalculo label="(+) Peso das saídas" valor={abertura.pesoSaidas} />
            <div className="border-t pt-1.5 mt-1.5">
              <LinhaCalculo label="= Ganho líquido" valor={abertura.ganhoLiquido} destaque />
            </div>
            <div className="border-t pt-1.5 mt-1.5 space-y-1">
              <LinhaCalculo label="Dias no mês" valor={abertura.dias} isInt />
              <LinhaCalculo label="Cabeças médias" valor={abertura.cabMedia} decimals={1} />
            </div>
            <div className="border-t pt-1.5 mt-1.5 bg-muted/20 rounded px-2 py-1.5">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-foreground">GMD = ganho / (dias × cab)</span>
                <span className="font-bold text-foreground">
                  {abertura.gmd !== null ? formatNum(abertura.gmd, 3) : '—'} kg/dia
                </span>
              </div>
            </div>
          </div>

          {/* Detalhamento Entradas */}
          {abertura.entradasDetalhe.length > 0 && (
            <GmdMovSection title="Detalhamento das Entradas" itens={abertura.entradasDetalhe} />
          )}

          {/* Detalhamento Saídas */}
          {abertura.saidasDetalhe.length > 0 && (
            <GmdMovSection title="Detalhamento das Saídas" itens={abertura.saidasDetalhe} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LinhaCalculo({
  label, valor, negativo, destaque, isInt, decimals = 0,
}: {
  label: string;
  valor: number;
  negativo?: boolean;
  destaque?: boolean;
  isInt?: boolean;
  decimals?: number;
}) {
  const formatted = isInt
    ? String(valor)
    : formatNum(valor, decimals || (valor >= 1000 ? 0 : 1)) + ' kg';
  return (
    <div className={`flex justify-between items-baseline ${destaque ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <span className={negativo ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={destaque ? 'text-foreground' : ''}>{formatted}</span>
    </div>
  );
}

function GmdMovSection({ title, itens }: { title: string; itens: { label: string; quantidade: number; pesoTotalKg: number }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1.5 hover:text-foreground transition-colors">
          <span>{title}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 text-sm pl-1">
          {itens.map(item => (
            <div key={item.tipo} className="flex justify-between text-muted-foreground">
              <span>{item.label}</span>
              <span>{item.quantidade} cab · {formatNum(item.pesoTotalKg, 0)} kg</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes — Alertas e helpers
// ---------------------------------------------------------------------------

function AlertRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function formatMoedaCompacto(val: number): string {
  if (val >= 1_000_000) return `R$ ${formatNum(val / 1_000_000, 2)}M`;
  if (val >= 1_000) return `R$ ${formatNum(val / 1_000, 1)}mil`;
  return formatMoeda(val);
}
