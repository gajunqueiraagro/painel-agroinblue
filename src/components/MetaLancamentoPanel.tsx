/**
 * MetaLancamentoPanel — Painel Inteligente META (Stepper Vertical)
 *
 * FONTES OFICIAIS:
 *   - Saldo/peso: useRebanhoOficial({ cenario: 'meta' })
 *   - GMD planejado: useMetaGmd(ano)
 *   - Faixas de peso: useCategoriaParametros(clienteId)
 *
 * SIMULAÇÃO: cálculo local em memória, NÃO persistido.
 *
 * REGRA DE OURO:
 *   - O sistema NUNCA altera automaticamente o GMD planejado
 *   - Movimentações NÃO reescrevem parâmetros
 *   - Toda correção estrutural deve ser explícita e auditável
 *
 * THRESHOLDS TEMPORÁRIOS (parametrizáveis no futuro):
 *   ALERTA_FAIXA_PCT = 10% do limite superior
 *   ALERTA_GMD_DESVIO_PCT = 20% de desvio GMD
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowRight, TrendingUp, ChevronDown, Lock } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useMetaGmd } from '@/hooks/useMetaGmd';
import {
  useCategoriaParametros,
  ALERTA_FAIXA_PCT,
  ALERTA_GMD_DESVIO_PCT,
  type CategoriaParametros,
} from '@/hooks/useCategoriaParametros';
import { CATEGORIAS, type Categoria, type TipoMovimentacao } from '@/types/cattle';
import { cn } from '@/lib/utils';

// ── Helpers de tipo ──

function isMovimentacaoSaida(tipo: TipoMovimentacao): boolean {
  return ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(tipo);
}

function isMovimentacaoEntrada(tipo: TipoMovimentacao): boolean {
  return ['nascimento', 'compra', 'transferencia_entrada'].includes(tipo);
}

function isNascimento(tipo: TipoMovimentacao): boolean {
  return tipo === 'nascimento';
}

function isReclassificacaoTipo(tipo: TipoMovimentacao): boolean {
  return tipo === 'reclassificacao';
}

// ── Types ──

interface Props {
  ano: number;
  mes: number;
  categoria: Categoria | '';
  tipo: TipoMovimentacao;
  quantidade: number;
  pesoKg: number;
  clienteId?: string;
  /** Callback informativo — não grava nada */
  onSugestaoEvolucao?: (info: EvolucaoSugestao) => void;
  /** State callback for parent coordination */
  onStepStateChange?: (state: MetaStepState) => void;
  /**
   * Lançamento sendo editado — quando setado, o efeito desse lançamento sobre
   * o saldo/peso da categoria é desfeito antes da validação. Evita falso
   * "saldo insuficiente" ao reabrir edição com mesmos valores.
   */
  lancamentoEmEdicao?: {
    id: string;
    categoria: Categoria;
    tipo: TipoMovimentacao;
    quantidade: number;
    pesoKg: number;
  } | null;
}

/**
 * Desfaz o efeito do lançamento original sobre saldo/pesoTotal da categoria,
 * para que a validação do edit considere o lançamento como inexistente.
 */
function ajustarPorLancamentoEmEdicao(
  saldoAtual: number,
  pesoTotalAtual: number,
  categoriaValidada: string,
  lanc: Props['lancamentoEmEdicao'],
): { saldoAtual: number; pesoTotalAtual: number } {
  if (!lanc || lanc.categoria !== categoriaValidada) {
    return { saldoAtual, pesoTotalAtual };
  }
  const wasSaida = isMovimentacaoSaida(lanc.tipo) || isReclassificacaoTipo(lanc.tipo);
  const wasEntrada = isMovimentacaoEntrada(lanc.tipo) || isNascimento(lanc.tipo);
  const peso = lanc.quantidade * lanc.pesoKg;
  if (wasSaida) {
    // Saída original consumiu — restaurar.
    return { saldoAtual: saldoAtual + lanc.quantidade, pesoTotalAtual: pesoTotalAtual + peso };
  }
  if (wasEntrada) {
    // Entrada original adicionou — descontar.
    return {
      saldoAtual: Math.max(0, saldoAtual - lanc.quantidade),
      pesoTotalAtual: Math.max(0, pesoTotalAtual - peso),
    };
  }
  return { saldoAtual, pesoTotalAtual };
}

export interface EvolucaoSugestao {
  /** Categoria do lançamento atual (destino da evolução) */
  categoriaAtual: string;
  /** Categoria anterior que pode alimentar a atual */
  categoriaAnterior: string;
  /** Peso médio atual da categoria anterior */
  pesoMedioAnterior: number;
  /** Peso mínimo para evolução da categoria anterior */
  pesoEvolucao: number;
  /** Se a categoria anterior atingiu peso de evolução */
  elegivel: boolean;
  /** Saldo disponível na categoria anterior */
  saldoAnterior: number;
  /** Tipo de sugestão: consultiva (não bloqueia) ou obrigatória (bloqueia) */
  natureza: 'sugestao' | 'obrigatoria';
}

export interface MetaStepState {
  hasBloqueio: boolean;
  etapaEvolucaoValidada: boolean;
  etapaFinanceiroHabilitado: boolean;
  /** Evolução é obrigatória para sustentar o lançamento */
  evolucaoObrigatoria: boolean;
  /** Saldo atual da categoria do lançamento (destino da evolução) */
  saldoDestinoAtual: number;
}

interface Bloqueio {
  tipo: 'bloqueio';
  mensagem: string;
}

interface Alerta {
  tipo: 'alerta';
  mensagem: string;
}

type Validacao = Bloqueio | Alerta;

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getCategoriaLabel(codigo: string): string {
  return CATEGORIAS.find(c => c.value === codigo)?.label || codigo;
}

// ── Core validation logic (shared between panel and submit blocker) ──

export interface MetaValidacaoInput {
  categoria: Categoria | '';
  tipo: TipoMovimentacao;
  quantidade: number;
  pesoKg: number;
  saldoAtual: number;
  pesoTotalAtual: number;
  catParams?: CategoriaParametros;
}

/**
 * Calcula bloqueios e alertas para um lançamento META.
 * Regras diferenciadas por tipo de movimentação.
 */
export function calcularValidacoesMeta(input: MetaValidacaoInput): Validacao[] {
  const { categoria, tipo, quantidade, pesoKg, saldoAtual, pesoTotalAtual, catParams } = input;
  if (!categoria || quantidade <= 0) return [];

  const result: Validacao[] = [];
  const isSaida = isMovimentacaoSaida(tipo);
  const isEntrada = isMovimentacaoEntrada(tipo);
  const nascimento = isNascimento(tipo);
  const isReclass = isReclassificacaoTipo(tipo);

  let saldoFinalProjetado: number;
  let pesoTotalFinalProjetado: number;

  if (isSaida || isReclass) {
    saldoFinalProjetado = saldoAtual - quantidade;
    pesoTotalFinalProjetado = pesoTotalAtual - (quantidade * pesoKg);
  } else {
    saldoFinalProjetado = saldoAtual + quantidade;
    pesoTotalFinalProjetado = pesoTotalAtual + (quantidade * pesoKg);
  }

  // Zerou cabeças = zera peso
  if ((isSaida || isReclass) && saldoFinalProjetado === 0) {
    pesoTotalFinalProjetado = 0;
  }

  const pesoMedioFinalProjetado = saldoFinalProjetado > 0
    ? pesoTotalFinalProjetado / saldoFinalProjetado
    : null;

  // BLOQUEIOS
  if ((isSaida || isReclass) && saldoFinalProjetado < 0) {
    result.push({
      tipo: 'bloqueio',
      mensagem: `Quantidade (${quantidade}) maior que o saldo disponível (${saldoAtual})`,
    });
  }

  // Bloqueio de peso: saída não pode retirar mais peso do que o total disponível
  if ((isSaida || isReclass) && pesoTotalAtual > 0 && pesoTotalFinalProjetado < 0) {
    result.push({
      tipo: 'bloqueio',
      mensagem: `Peso de saída (${fmt(quantidade * pesoKg, 0)} kg) maior que o peso total disponível (${fmt(pesoTotalAtual, 0)} kg)`,
    });
  }

  if (catParams && pesoKg > 0) {
    if (pesoKg < catParams.pesoMinKg) {
      result.push({
        tipo: 'bloqueio',
        mensagem: `Peso ${fmt(pesoKg, 1)} kg abaixo do mínimo da categoria (${fmt(catParams.pesoMinKg, 0)} kg)`,
      });
    }
    if (pesoKg > catParams.pesoMaxKg) {
      result.push({
        tipo: 'bloqueio',
        mensagem: `Peso ${fmt(pesoKg, 1)} kg acima do máximo da categoria (${fmt(catParams.pesoMaxKg, 0)} kg)`,
      });
    }
  }

  if (saldoFinalProjetado > 0 && pesoMedioFinalProjetado != null) {
    if (pesoMedioFinalProjetado <= 0) {
      result.push({ tipo: 'bloqueio', mensagem: 'Peso médio final projetado é negativo ou zero' });
    }
    if (catParams && pesoMedioFinalProjetado > catParams.pesoMaxKg) {
      result.push({
        tipo: 'bloqueio',
        mensagem: `Peso médio final projetado (${fmt(pesoMedioFinalProjetado, 1)} kg) excede o máximo da categoria (${fmt(catParams.pesoMaxKg, 0)} kg)`,
      });
    }
    if (catParams && pesoMedioFinalProjetado < catParams.pesoMinKg) {
      result.push({
        tipo: 'bloqueio',
        mensagem: `Peso médio final projetado (${fmt(pesoMedioFinalProjetado, 1)} kg) abaixo do mínimo da categoria (${fmt(catParams.pesoMinKg, 0)} kg)`,
      });
    }
  }

  // ALERTAS
  if (catParams && pesoKg > 0 && !nascimento) {
    const limiar = catParams.pesoMaxKg * (1 - ALERTA_FAIXA_PCT);
    if (pesoKg >= limiar && pesoKg <= catParams.pesoMaxKg) {
      result.push({ tipo: 'alerta', mensagem: `Peso próximo ao limite superior da categoria (${fmt(catParams.pesoMaxKg, 0)} kg)` });
    }
  }

  if (catParams?.pesoEvolucaoKg && pesoMedioFinalProjetado != null && saldoFinalProjetado > 0) {
    if (pesoMedioFinalProjetado >= catParams.pesoEvolucaoKg) {
      result.push({
        tipo: 'alerta',
        mensagem: `Lote elegível para evolução de categoria (peso médio ${fmt(pesoMedioFinalProjetado, 1)} kg ≥ ${fmt(catParams.pesoEvolucaoKg, 0)} kg)`,
      });
    }
  }

  return result;
}

// ── Stepper Step Component ──

type StepStatus = 'active' | 'done' | 'pending' | 'disabled';

interface StepHeaderProps {
  step: number;
  label: string;
  status: StepStatus;
  expanded: boolean;
  onToggle: () => void;
  tooltip?: string;
  alwaysOpen?: boolean;
}

function StepHeader({ step, label, status, expanded, onToggle, tooltip, alwaysOpen }: StepHeaderProps) {
  const isDisabled = status === 'disabled';

  const statusIcon = {
    done: <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
    pending: <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
    active: <div className="h-3.5 w-3.5 rounded-full border-2 border-primary bg-primary/20" />,
    disabled: <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />,
  };

  const content = (
    <button
      type="button"
      onClick={isDisabled ? undefined : onToggle}
      disabled={isDisabled}
      className={cn(
        'flex items-center gap-2 w-full text-left py-1.5 px-1 rounded transition-colors',
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer',
        expanded && !alwaysOpen && 'bg-muted/30',
      )}
    >
      <span className={cn(
        'flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-bold shrink-0',
        status === 'done' ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' :
        status === 'pending' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' :
        status === 'disabled' ? 'bg-muted text-muted-foreground/50' :
        'bg-primary/10 text-primary',
      )}>
        {step}
      </span>
      <span className={cn(
        'text-[10px] font-bold uppercase flex-1',
        isDisabled ? 'text-muted-foreground/50' : 'text-muted-foreground',
      )}>
        {label}
      </span>
      {statusIcon[status]}
      {!alwaysOpen && !isDisabled && (
        <ChevronDown className={cn(
          'h-3 w-3 text-muted-foreground transition-transform',
          expanded && 'rotate-180',
        )} />
      )}
    </button>
  );

  if (tooltip && isDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="left" className="text-[10px] max-w-[200px]">{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ── Component ──

export function MetaLancamentoPanel({ ano, mes, categoria, tipo, quantidade, pesoKg, clienteId, onSugestaoEvolucao, onStepStateChange, lancamentoEmEdicao }: Props) {
  const { getSaldoMap, getPesoMedioMap, getCategoriasDetalhe, loading: loadingRebanho } = useRebanhoOficial({ ano, cenario: 'meta' });
  const { rows: gmdRows } = useMetaGmd(String(ano));
  const { getParametros, getProximaCategoria, getCategoriasAnteriores, isLoading: loadingParams } = useCategoriaParametros(clienteId);

  const loading = loadingRebanho || loadingParams;

  // ── Stepper state ──
  // Etapas 1, 2 e 3 abertas por padrão (recolhíveis); etapa 4 (Financeiro) foi removida do painel.
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set([1, 2, 3]));
  const handleToggleOpen = useCallback((step: number) => {
    setOpenSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step); else next.add(step);
      return next;
    });
  }, []);

  // ── Dados da base oficial META ──
  const saldoMap = useMemo(() => getSaldoMap(mes), [getSaldoMap, mes]);
  const pesoMedioMap = useMemo(() => getPesoMedioMap(mes), [getPesoMedioMap, mes]);
  const categoriasDetalhe = useMemo(() => getCategoriasDetalhe(mes), [getCategoriasDetalhe, mes]);

  const catParams = categoria ? getParametros(categoria) : undefined;
  const categoriasAnteriores = useMemo(() => categoria ? getCategoriasAnteriores(categoria) : [], [categoria, getCategoriasAnteriores]);

  // ── BLOCO 1: Situação atual do lote ──
  // Em modo edição, desfazemos o efeito do lançamento original para que a
  // validação do edit não conte o próprio lançamento como consumo de saldo.
  const saldoAtualRaw = categoria ? (saldoMap.get(categoria) ?? 0) : 0;
  const pesoMedioAtual = categoria ? (pesoMedioMap.get(categoria) ?? null) : null;
  const pesoTotalAtualRaw = pesoMedioAtual != null ? saldoAtualRaw * pesoMedioAtual : 0;
  const { saldoAtual, pesoTotalAtual } = useMemo(
    () => ajustarPorLancamentoEmEdicao(saldoAtualRaw, pesoTotalAtualRaw, categoria || '', lancamentoEmEdicao),
    [saldoAtualRaw, pesoTotalAtualRaw, categoria, lancamentoEmEdicao],
  );
  const catDetalhe = categoria ? categoriasDetalhe.find(c => c.categoriaCodigo === categoria) : undefined;

  // ── BLOCO 2: Simulação do lançamento ──
  const simulacao = useMemo(() => {
    if (!categoria || quantidade <= 0) return null;

    const isSaida = isMovimentacaoSaida(tipo);
    const isReclass = isReclassificacaoTipo(tipo);

    let saldoFinalProjetado: number;
    let pesoTotalFinalProjetado: number;

    if (isSaida || isReclass) {
      saldoFinalProjetado = saldoAtual - quantidade;
      pesoTotalFinalProjetado = pesoTotalAtual - (quantidade * pesoKg);
    } else {
      saldoFinalProjetado = saldoAtual + quantidade;
      pesoTotalFinalProjetado = pesoTotalAtual + (quantidade * pesoKg);
    }

    // Zerou cabeças = zera peso (sem resíduo de "peso ganho no mês")
    if (saldoFinalProjetado === 0) {
      pesoTotalFinalProjetado = 0;
    }

    const pesoMedioFinalProjetado = saldoFinalProjetado > 0
      ? pesoTotalFinalProjetado / saldoFinalProjetado
      : null;

    return { saldoFinalProjetado, pesoTotalFinalProjetado, pesoMedioFinalProjetado };
  }, [categoria, quantidade, pesoKg, tipo, saldoAtual, pesoTotalAtual]);

  // ── BLOCO 3: Validações ──
  const validacoes = useMemo((): Validacao[] => {
    return calcularValidacoesMeta({ categoria, tipo, quantidade, pesoKg, saldoAtual, pesoTotalAtual, catParams });
  }, [categoria, tipo, quantidade, pesoKg, saldoAtual, pesoTotalAtual, catParams]);

  // ── GMD implícito ──
  const gmdInfo = useMemo(() => {
    if (!categoria) return null;
    const mesKey = String(mes).padStart(2, '0');
    const gmdRow = gmdRows.find(r => r.categoria === categoria);
    const gmdPlanejado = gmdRow?.meses[mesKey] ?? null;

    let gmdImplicito: number | null = null;

    if (catDetalhe && catDetalhe.diasMes > 0) {
      const cabMedias = (catDetalhe.saldoInicial + catDetalhe.saldoFinal) / 2;
      if (cabMedias > 0) {
        const pesoEntradas = catDetalhe.pesoEntradasExternas + catDetalhe.pesoEvolCatEntrada;
        const pesoSaidas = catDetalhe.pesoSaidasExternas + catDetalhe.pesoEvolCatSaida;
        const ganhoLiquido = catDetalhe.pesoTotalFinal - catDetalhe.pesoTotalInicial - pesoEntradas + pesoSaidas;
        gmdImplicito = ganhoLiquido / cabMedias / catDetalhe.diasMes;
      }
    }

    const desvio = gmdPlanejado && gmdImplicito != null && gmdPlanejado !== 0
      ? (gmdImplicito - gmdPlanejado) / gmdPlanejado
      : null;

    return { gmdPlanejado, gmdImplicito, desvio };
  }, [categoria, mes, gmdRows, catDetalhe]);

  const gmdAlerta = useMemo((): Alerta | null => {
    if (!gmdInfo?.desvio || Math.abs(gmdInfo.desvio) <= ALERTA_GMD_DESVIO_PCT) return null;
    const pct = (gmdInfo.desvio * 100).toFixed(0);
    return { tipo: 'alerta', mensagem: `Desvio de ${pct}% entre GMD implícito e GMD planejado` };
  }, [gmdInfo]);

  const allValidacoes = useMemo(() => {
    const all = [...validacoes];
    if (gmdAlerta) all.push(gmdAlerta);
    return all;
  }, [validacoes, gmdAlerta]);

  const bloqueios = allValidacoes.filter(v => v.tipo === 'bloqueio');
  const alertas = allValidacoes.filter(v => v.tipo === 'alerta');
  const hasBloqueio = bloqueios.length > 0;

  // ── Sugestão de evolução (categoria ANTERIOR que alimenta a atual) ──
  const evolucaoInfo = useMemo((): EvolucaoSugestao | null => {
    if (!categoria || categoriasAnteriores.length === 0) return null;

    // Pegar a primeira categoria anterior (prioridade por ordem hierárquica)
    const catAnt = categoriasAnteriores[0];
    if (!catAnt.pesoEvolucaoKg) return null;

    const saldoAnt = saldoMap.get(catAnt.categoriaCodigo) ?? 0;
    if (saldoAnt <= 0) return null;

    const pesoMedioAnt = pesoMedioMap.get(catAnt.categoriaCodigo) ?? null;
    if (pesoMedioAnt == null) return null;

    const elegivel = pesoMedioAnt >= catAnt.pesoEvolucaoKg;

    // Determinar natureza: obrigatória se saldo atual não suporta o lançamento
    const isSaida = isMovimentacaoSaida(tipo);
    const isReclass = isReclassificacaoTipo(tipo);
    const saldoInsuficiente = (isSaida || isReclass) && quantidade > 0 && saldoAtual < quantidade;
    const natureza: 'sugestao' | 'obrigatoria' = (saldoInsuficiente && elegivel) ? 'obrigatoria' : 'sugestao';

    return {
      categoriaAtual: categoria,
      categoriaAnterior: catAnt.categoriaCodigo,
      pesoMedioAnterior: pesoMedioAnt,
      pesoEvolucao: catAnt.pesoEvolucaoKg,
      elegivel,
      saldoAnterior: saldoAnt,
      natureza,
    };
  }, [categoria, categoriasAnteriores, saldoMap, pesoMedioMap, tipo, quantidade, saldoAtual]);

  // ── Step state derivation ──
  const hasEvolucao = evolucaoInfo != null;
  const evolucaoElegivel = evolucaoInfo?.elegivel ?? false;
  const evolucaoObrigatoria = evolucaoInfo?.natureza === 'obrigatoria';

  // Evolução validada: se não é obrigatória, está ok; se é obrigatória, bloqueia
  const etapaEvolucaoValidada = !evolucaoObrigatoria;
  const etapaFinanceiroHabilitado = !hasBloqueio && etapaEvolucaoValidada;

  // Notify parent of state changes
  useEffect(() => {
    onStepStateChange?.({ hasBloqueio, etapaEvolucaoValidada, etapaFinanceiroHabilitado, evolucaoObrigatoria, saldoDestinoAtual: saldoAtual });
  }, [hasBloqueio, etapaEvolucaoValidada, etapaFinanceiroHabilitado, evolucaoObrigatoria, saldoAtual, onStepStateChange]);

  // Step statuses
  const step1Status: StepStatus = 'done';
  const step2Status: StepStatus = simulacao ? (hasBloqueio ? 'pending' : 'done') : 'active';
  const step3Status: StepStatus = evolucaoObrigatoria ? 'pending' : 'done';
  const step4Status: StepStatus = etapaFinanceiroHabilitado ? 'active' : 'disabled';
  // Etapa 4 (Financeiro) suprimida — botão "Completar Abate" assume essa função.
  void step4Status;

  if (!categoria) {
    return (
      <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start">
        <h3 className="text-[13px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" /> Painel Inteligente META
        </h3>
        <Separator />
        <p className="text-[11px] text-muted-foreground italic">Selecione uma categoria para ver a análise.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-card rounded-md border shadow-sm p-2 space-y-1.5 self-start animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  const isOpen = (n: number) => openSteps.has(n);

  return (
    <div className="bg-card rounded-md border border-orange-200 dark:border-orange-800 shadow-sm self-start flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="px-2.5 pt-2 pb-1">
        <h3 className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" /> Painel Inteligente META
        </h3>
        <div className="flex flex-wrap gap-1 mt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium cursor-help">
                Saldo: META oficial
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
              Fonte: vw_zoot_categoria_mensal (cenario = meta)
            </TooltipContent>
          </Tooltip>
          <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            Simulação: local
          </span>
        </div>
      </div>

      <Separator />

      {/* Scrollable stepper area */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-0">

        {/* ═══ ETAPA 1: Situação do Lote (recolhível, aberta por padrão) ═══ */}
        <div>
          <StepHeader
            step={1}
            label="Situação do Lote"
            status={step1Status}
            expanded={isOpen(1)}
            onToggle={() => handleToggleOpen(1)}
          />
          {isOpen(1) && (
            <div className="pl-7 pb-1">
              <div className="space-y-0 text-[10px]">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Categoria</span>
                  <span className="font-semibold">{getCategoriaLabel(categoria)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Saldo atual</span>
                  <span className="font-semibold">{saldoAtual} cab</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Peso médio</span>
                  <span className="font-semibold">{pesoMedioAtual != null ? `${fmt(pesoMedioAtual, 1)} kg` : '-'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Peso total</span>
                  <span className="font-semibold">{pesoTotalAtual > 0 ? `${fmt(pesoTotalAtual, 0)} kg` : '-'}</span>
                </div>
                {catParams && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Faixa válida</span>
                    <span className="font-medium text-[10px]">{fmt(catParams.pesoMinKg, 0)} – {fmt(catParams.pesoMaxKg, 0)} kg</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Separator className="my-0.5" />

        {/* ═══ ETAPA 2: Simulação (recolhível, aberta por padrão) ═══ */}
        <div>
          <StepHeader
            step={2}
            label="Simulação"
            status={step2Status}
            expanded={isOpen(2)}
            onToggle={() => handleToggleOpen(2)}
          />
          {isOpen(2) && (
            <div className="pl-7 pb-1">
              {simulacao && quantidade > 0 ? (
                <div className="space-y-1">
                  <div className="space-y-0 text-[10px]">
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Saldo final projetado</span>
                      <span className={cn('font-semibold', simulacao.saldoFinalProjetado < 0 && 'text-destructive')}>
                        {simulacao.saldoFinalProjetado} cab
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Peso total remanescente</span>
                      <span className="font-semibold">{fmt(simulacao.pesoTotalFinalProjetado, 0)} kg</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Peso médio final</span>
                      <span className={cn('font-semibold', simulacao.pesoMedioFinalProjetado != null && simulacao.pesoMedioFinalProjetado <= 0 && 'text-destructive')}>
                        {simulacao.pesoMedioFinalProjetado != null ? `${fmt(simulacao.pesoMedioFinalProjetado, 1)} kg` : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Validações inline */}
                  {allValidacoes.length > 0 && (
                    <div className="space-y-1">
                      {bloqueios.map((v, i) => (
                        <div key={`b-${i}`} className="flex items-start gap-1.5 bg-destructive/10 text-destructive rounded p-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="text-[10px] font-medium leading-tight">{v.mensagem}</span>
                        </div>
                      ))}
                      {alertas.map((v, i) => (
                        <div key={`a-${i}`} className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded p-1">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="text-[10px] font-medium leading-tight">{v.mensagem}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {allValidacoes.length === 0 && pesoKg > 0 && (
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="text-[10px] font-medium">Lançamento válido</span>
                    </div>
                  )}

                  {/* GMD inline */}
                  {gmdInfo && (gmdInfo.gmdPlanejado != null || gmdInfo.gmdImplicito != null) && (
                    <div className="space-y-0 text-[10px] pt-1 border-t border-border/50">
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">GMD planejado</span>
                        <span className="font-semibold">{gmdInfo.gmdPlanejado != null ? `${fmt(gmdInfo.gmdPlanejado, 3)} kg` : '-'}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">GMD implícito</span>
                        <span className="font-semibold">{gmdInfo.gmdImplicito != null ? `${fmt(gmdInfo.gmdImplicito, 3)} kg` : '-'}</span>
                      </div>
                      {gmdInfo.desvio != null && (
                        <div className="flex justify-between py-0.5">
                          <span className="text-muted-foreground">Desvio</span>
                          <span className={cn('font-semibold', Math.abs(gmdInfo.desvio) > ALERTA_GMD_DESVIO_PCT && 'text-amber-600 dark:text-amber-400')}>
                            {gmdInfo.desvio > 0 ? '+' : ''}{(gmdInfo.desvio * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">Preencha quantidade e peso para simular.</p>
              )}
            </div>
          )}
        </div>

        <Separator className="my-0.5" />

        {/* ═══ ETAPA 3: Evolução de Categoria (recolhível, aberta por padrão) ═══ */}
        <div>
          <StepHeader
            step={3}
            label="Evolução de Categoria"
            status={step3Status}
            expanded={isOpen(3)}
            onToggle={() => handleToggleOpen(3)}
          />
          {isOpen(3) && (
            <div className="pl-7 pb-1">
              {!hasEvolucao ? (
                <p className="text-[10px] text-muted-foreground italic">
                  Sem categoria anterior configurada para alimentar {getCategoriaLabel(categoria)}.
                </p>
              ) : evolucaoObrigatoria ? (
                /* ── Estado B: Evolução OBRIGATÓRIA (saldo insuficiente + anterior elegível) ── */
                <div className="space-y-1">
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-1.5 space-y-1">
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      ⚠ Evolução necessária para este lançamento
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">
                      Saldo de {getCategoriaLabel(categoria)} ({saldoAtual} cab) não suporta a saída de {quantidade} cab.
                      Evolua {getCategoriaLabel(evolucaoInfo.categoriaAnterior)} ({evolucaoInfo.saldoAnterior} cab, {fmt(evolucaoInfo.pesoMedioAnterior, 1)} kg) para {getCategoriaLabel(categoria)} antes de continuar.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50"
                      onClick={() => onSugestaoEvolucao?.(evolucaoInfo)}
                    >
                      Fazer evolução agora
                    </Button>
                  </div>
                </div>
              ) : evolucaoInfo.elegivel ? (
                /* ── Estado A: Sugestão consultiva (elegível, mas saldo suporta) ── */
                <div className="space-y-1">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1.5 space-y-1">
                    <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                      💡 {getCategoriaLabel(evolucaoInfo.categoriaAnterior)} elegível para evoluir para {getCategoriaLabel(evolucaoInfo.categoriaAtual)}
                    </p>
                    <p className="text-[10px] text-green-600 dark:text-green-500">
                      Saldo: {evolucaoInfo.saldoAnterior} cab · Peso médio: {fmt(evolucaoInfo.pesoMedioAnterior, 1)} kg ≥ {fmt(evolucaoInfo.pesoEvolucao, 0)} kg
                    </p>
                    <p className="text-[9px] text-muted-foreground italic">
                      Sugestão consultiva — o saldo atual suporta este lançamento.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-[10px] border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/50"
                      onClick={() => onSugestaoEvolucao?.(evolucaoInfo)}
                    >
                      Abrir evolução da categoria
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Categoria anterior não elegível ainda ── */
                <div className="text-[10px] text-muted-foreground space-y-0">
                  <div className="flex items-center gap-1">
                    <span>{getCategoriaLabel(evolucaoInfo.categoriaAnterior)}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-semibold">{getCategoriaLabel(evolucaoInfo.categoriaAtual)}</span>
                  </div>
                  <p>
                    Peso médio: {fmt(evolucaoInfo.pesoMedioAnterior, 1)} kg / mín. {fmt(evolucaoInfo.pesoEvolucao, 0)} kg · Saldo: {evolucaoInfo.saldoAnterior} cab
                  </p>
                  <p className="text-[9px] italic">Categoria anterior ainda não atingiu peso de evolução.</p>
                </div>
              )}
            </div>
          )}
          {/* Compact info when collapsed */}
          {!isOpen(3) && hasEvolucao && (
            <div className="pl-7 pb-1">
              <span className={cn(
                'text-[9px]',
                evolucaoObrigatoria
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : evolucaoElegivel
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground',
              )}>
                {evolucaoObrigatoria
                  ? `⚠ Evolução necessária — ${getCategoriaLabel(evolucaoInfo!.categoriaAnterior)} → ${getCategoriaLabel(categoria)}`
                  : evolucaoElegivel
                    ? `💡 ${getCategoriaLabel(evolucaoInfo!.categoriaAnterior)} elegível (sugestão)`
                    : `✔ Sem evolução pendente`
                }
              </span>
            </div>
          )}
        </div>

        {/* ═══ ETAPA 4 (Financeiro) removida — substituída pelo botão "Completar Abate" abaixo do painel. ═══ */}
      </div>
    </div>
  );
}

/**
 * Hook que retorna true se há bloqueios para um lançamento META.
 * Usa exatamente a mesma lógica do painel (calcularValidacoesMeta).
 */
export function useMetaValidacaoBloqueios(
  ano: number, mes: number, categoria: Categoria | '',
  tipo: TipoMovimentacao, quantidade: number, pesoKg: number, clienteId?: string,
  lancamentoEmEdicao?: Props['lancamentoEmEdicao'],
): { hasBloqueio: boolean; primeiroBloqueio: string | null } {
  const { getSaldoMap, getPesoMedioMap } = useRebanhoOficial({ ano, cenario: 'meta' });
  const { getParametros } = useCategoriaParametros(clienteId);

  return useMemo(() => {
    if (!categoria || quantidade <= 0) return { hasBloqueio: false, primeiroBloqueio: null };

    const saldoRaw = getSaldoMap(mes).get(categoria) ?? 0;
    const pesoMedioAtual = getPesoMedioMap(mes).get(categoria) ?? null;
    const pesoTotalRaw = pesoMedioAtual != null ? saldoRaw * pesoMedioAtual : 0;
    const catParams = getParametros(categoria);
    const { saldoAtual, pesoTotalAtual } = ajustarPorLancamentoEmEdicao(
      saldoRaw, pesoTotalRaw, categoria, lancamentoEmEdicao,
    );

    const validacoes = calcularValidacoesMeta({
      categoria, tipo, quantidade, pesoKg,
      saldoAtual, pesoTotalAtual, catParams,
    });

    const bloqueios = validacoes.filter(v => v.tipo === 'bloqueio');
    return {
      hasBloqueio: bloqueios.length > 0,
      primeiroBloqueio: bloqueios.length > 0 ? bloqueios[0].mensagem : null,
    };
  }, [ano, mes, categoria, tipo, quantidade, pesoKg, clienteId, lancamentoEmEdicao, getSaldoMap, getPesoMedioMap, getParametros]);
}
