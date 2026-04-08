/**
 * MetaLancamentoPanel — Painel Inteligente para Lançamentos META
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
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowRight, TrendingUp } from 'lucide-react';
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
import { CATEGORIAS, type Categoria, type TipoMovimentacao, isEntrada } from '@/types/cattle';

// ── Thresholds documentados como regra temporária ──
// ALERTA_FAIXA_PCT = 10% do limite superior
// ALERTA_GMD_DESVIO_PCT = 20% de desvio GMD

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
}

export interface EvolucaoSugestao {
  categoriaAtual: string;
  categoriaDestino: string;
  pesoMedioAtual: number;
  pesoEvolucao: number;
  elegivel: boolean;
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

function isMovimentacaoSaida(tipo: TipoMovimentacao): boolean {
  return ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(tipo);
}

function isMovimentacaoEntrada(tipo: TipoMovimentacao): boolean {
  return isEntrada(tipo);
}

export function MetaLancamentoPanel({ ano, mes, categoria, tipo, quantidade, pesoKg, clienteId, onSugestaoEvolucao }: Props) {
  const { getSaldoMap, getPesoMedioMap, getCategoriasDetalhe, loading: loadingRebanho } = useRebanhoOficial({ ano, cenario: 'meta' });
  const { rows: gmdRows } = useMetaGmd(String(ano));
  const { getParametros, getProximaCategoria, isLoading: loadingParams } = useCategoriaParametros(clienteId);

  const loading = loadingRebanho || loadingParams;

  // ── Dados da base oficial META ──
  const saldoMap = useMemo(() => getSaldoMap(mes), [getSaldoMap, mes]);
  const pesoMedioMap = useMemo(() => getPesoMedioMap(mes), [getPesoMedioMap, mes]);
  const categoriasDetalhe = useMemo(() => getCategoriasDetalhe(mes), [getCategoriasDetalhe, mes]);

  const catParams = categoria ? getParametros(categoria) : undefined;
  const proximaCat = categoria ? getProximaCategoria(categoria) : undefined;

  // ── BLOCO 1: Situação atual do lote ──
  const saldoAtual = categoria ? (saldoMap.get(categoria) ?? 0) : 0;
  const pesoMedioAtual = categoria ? (pesoMedioMap.get(categoria) ?? null) : null;
  const pesoTotalAtual = pesoMedioAtual != null ? saldoAtual * pesoMedioAtual : 0;
  const catDetalhe = categoria ? categoriasDetalhe.find(c => c.categoriaCodigo === categoria) : undefined;

  // ── BLOCO 2: Simulação do lançamento ──
  const simulacao = useMemo(() => {
    if (!categoria || quantidade <= 0) return null;

    const isSaida = isMovimentacaoSaida(tipo);
    const isEntradaTipo = isMovimentacaoEntrada(tipo);

    let saldoFinalProjetado: number;
    let pesoTotalFinalProjetado: number;

    if (isSaida) {
      saldoFinalProjetado = saldoAtual - quantidade;
      pesoTotalFinalProjetado = pesoTotalAtual - (quantidade * pesoKg);
    } else if (isEntradaTipo) {
      saldoFinalProjetado = saldoAtual + quantidade;
      pesoTotalFinalProjetado = pesoTotalAtual + (quantidade * pesoKg);
    } else {
      // Reclassificação — saída da categoria
      saldoFinalProjetado = saldoAtual - quantidade;
      pesoTotalFinalProjetado = pesoTotalAtual - (quantidade * pesoKg);
    }

    const pesoMedioFinalProjetado = saldoFinalProjetado > 0
      ? pesoTotalFinalProjetado / saldoFinalProjetado
      : saldoFinalProjetado === 0
        ? null
        : undefined; // negativo = incoerente

    return {
      saldoFinalProjetado,
      pesoTotalFinalProjetado,
      pesoMedioFinalProjetado,
    };
  }, [categoria, quantidade, pesoKg, tipo, saldoAtual, pesoTotalAtual]);

  // ── BLOCO 3: Validações ──
  const validacoes = useMemo((): Validacao[] => {
    if (!categoria || quantidade <= 0) return [];
    const result: Validacao[] = [];
    const isSaida = isMovimentacaoSaida(tipo);
    const isEntradaTipo = isMovimentacaoEntrada(tipo);

    // ── BLOQUEIOS ──
    // Saldo negativo (apenas para saídas)
    if (isSaida && simulacao && simulacao.saldoFinalProjetado < 0) {
      result.push({
        tipo: 'bloqueio',
        mensagem: `Quantidade (${quantidade}) maior que o saldo disponível (${saldoAtual})`,
      });
    }

    // Peso fora da faixa da categoria
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

    // Peso médio final incoerente (apenas se saldo > 0 após operação)
    if (simulacao && simulacao.saldoFinalProjetado > 0 && simulacao.pesoMedioFinalProjetado != null) {
      if (simulacao.pesoMedioFinalProjetado <= 0) {
        result.push({ tipo: 'bloqueio', mensagem: 'Peso médio final projetado é negativo ou zero' });
      }
      if (catParams && simulacao.pesoMedioFinalProjetado > catParams.pesoMaxKg) {
        result.push({ tipo: 'bloqueio', mensagem: `Peso médio final projetado (${fmt(simulacao.pesoMedioFinalProjetado, 1)} kg) excede o máximo da categoria (${fmt(catParams.pesoMaxKg, 0)} kg)` });
      }
    }

    // ── ALERTAS ──
    // Peso próximo do limite superior
    if (catParams && pesoKg > 0) {
      const limiar = catParams.pesoMaxKg * (1 - ALERTA_FAIXA_PCT);
      if (pesoKg >= limiar && pesoKg <= catParams.pesoMaxKg) {
        result.push({ tipo: 'alerta', mensagem: `Peso próximo ao limite superior da categoria (${fmt(catParams.pesoMaxKg, 0)} kg)` });
      }
    }

    // Elegível para evolução (apenas entradas e quando saldo > 0)
    if (catParams?.pesoEvolucaoKg && simulacao?.pesoMedioFinalProjetado != null && simulacao.saldoFinalProjetado > 0) {
      if (simulacao.pesoMedioFinalProjetado >= catParams.pesoEvolucaoKg) {
        result.push({
          tipo: 'alerta',
          mensagem: `Lote elegível para evolução de categoria (peso médio ${fmt(simulacao.pesoMedioFinalProjetado, 1)} kg ≥ ${fmt(catParams.pesoEvolucaoKg, 0)} kg)`,
        });
      }
    }

    return result;
  }, [categoria, quantidade, pesoKg, tipo, saldoAtual, catParams, simulacao]);

  // ── BLOCO 5: GMD ──
  const gmdInfo = useMemo(() => {
    if (!categoria) return null;
    const mesKey = String(mes).padStart(2, '0');
    const gmdRow = gmdRows.find(r => r.categoria === categoria);
    const gmdPlanejado = gmdRow?.meses[mesKey] ?? null;

    // GMD implícito: produção biológica / cabecas médias / dias
    const detalhe = catDetalhe;
    let gmdImplicito: number | null = null;
    if (detalhe && detalhe.diasMes > 0) {
      const cabMedias = (detalhe.saldoInicial + detalhe.saldoFinal) / 2;
      if (cabMedias > 0 && detalhe.producaoBiologica !== 0) {
        gmdImplicito = detalhe.producaoBiologica / cabMedias / detalhe.diasMes;
      }
    }

    const desvio = gmdPlanejado && gmdImplicito && gmdPlanejado !== 0
      ? (gmdImplicito - gmdPlanejado) / gmdPlanejado
      : null;

    return { gmdPlanejado, gmdImplicito, desvio };
  }, [categoria, mes, gmdRows, catDetalhe]);

  // GMD desvio alert
  const gmdAlerta = useMemo((): Alerta | null => {
    if (!gmdInfo?.desvio || Math.abs(gmdInfo.desvio) <= ALERTA_GMD_DESVIO_PCT) return null;
    const pct = (gmdInfo.desvio * 100).toFixed(0);
    return {
      tipo: 'alerta',
      mensagem: `Desvio de ${pct}% entre GMD implícito e GMD planejado`,
    };
  }, [gmdInfo]);

  const allValidacoes = useMemo(() => {
    const all = [...validacoes];
    if (gmdAlerta) all.push(gmdAlerta);
    return all;
  }, [validacoes, gmdAlerta]);

  const bloqueios = allValidacoes.filter(v => v.tipo === 'bloqueio');
  const alertas = allValidacoes.filter(v => v.tipo === 'alerta');
  const hasBloqueio = bloqueios.length > 0;

  // ── Sugestão de evolução ──
  const evolucaoInfo = useMemo((): EvolucaoSugestao | null => {
    if (!categoria || !catParams?.categoriaProxima || !catParams.pesoEvolucaoKg) return null;
    const pesoRef = simulacao?.pesoMedioFinalProjetado ?? pesoMedioAtual;
    if (pesoRef == null) return null;

    return {
      categoriaAtual: categoria,
      categoriaDestino: catParams.categoriaProxima,
      pesoMedioAtual: pesoRef,
      pesoEvolucao: catParams.pesoEvolucaoKg,
      elegivel: pesoRef >= catParams.pesoEvolucaoKg,
    };
  }, [categoria, catParams, simulacao, pesoMedioAtual]);

  if (!categoria) {
    return (
      <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
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
      <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border border-orange-200 dark:border-orange-800 shadow-sm p-3 space-y-2.5 self-start max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <h3 className="text-[13px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4" /> Painel Inteligente META
      </h3>

      {/* Fontes */}
      <div className="flex flex-wrap gap-1">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[9px] bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium cursor-help">
              GMD: Meta planejada
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
            Fonte: meta_gmd_mensal
          </TooltipContent>
        </Tooltip>
        <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
          Simulação: local
        </span>
      </div>

      <Separator />

      {/* BLOCO 1: Situação Atual */}
      <div>
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Situação Atual do Lote</h4>
        <div className="space-y-0.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Categoria</span>
            <span className="font-semibold">{getCategoriaLabel(categoria)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo atual</span>
            <span className="font-semibold">{saldoAtual} cab</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Peso médio</span>
            <span className="font-semibold">{pesoMedioAtual != null ? `${fmt(pesoMedioAtual, 1)} kg` : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Peso total</span>
            <span className="font-semibold">{pesoTotalAtual > 0 ? `${fmt(pesoTotalAtual, 0)} kg` : '-'}</span>
          </div>
          {catParams && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Faixa válida</span>
              <span className="font-medium text-[10px]">{fmt(catParams.pesoMinKg, 0)} – {fmt(catParams.pesoMaxKg, 0)} kg</span>
            </div>
          )}
        </div>
      </div>

      {/* BLOCO 2: Simulação */}
      {simulacao && quantidade > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Simulação do Lançamento</h4>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo final projetado</span>
                <span className={`font-semibold ${simulacao.saldoFinalProjetado < 0 ? 'text-destructive' : ''}`}>
                  {simulacao.saldoFinalProjetado} cab
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso total remanescente</span>
                <span className="font-semibold">{fmt(simulacao.pesoTotalFinalProjetado, 0)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso médio final</span>
                <span className={`font-semibold ${simulacao.pesoMedioFinalProjetado != null && simulacao.pesoMedioFinalProjetado <= 0 ? 'text-destructive' : ''}`}>
                  {simulacao.pesoMedioFinalProjetado != null ? `${fmt(simulacao.pesoMedioFinalProjetado, 1)} kg` : '-'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* BLOCO 3: Validações */}
      {allValidacoes.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Validações</h4>
            <div className="space-y-1">
              {bloqueios.map((v, i) => (
                <div key={`b-${i}`} className="flex items-start gap-1.5 bg-destructive/10 text-destructive rounded p-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="text-[10px] font-medium leading-tight">{v.mensagem}</span>
                </div>
              ))}
              {alertas.map((v, i) => (
                <div key={`a-${i}`} className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded p-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="text-[10px] font-medium leading-tight">{v.mensagem}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {allValidacoes.length === 0 && quantidade > 0 && pesoKg > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium">Lançamento válido</span>
          </div>
        </>
      )}

      {/* BLOCO 4: Categoria Adjacente */}
      {proximaCat && (
        <>
          <Separator />
          <div>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Categoria Adjacente</h4>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{getCategoriaLabel(categoria)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold">{getCategoriaLabel(proximaCat.categoriaCodigo)}</span>
              </div>
              {catParams?.pesoEvolucaoKg && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peso mín. evolução</span>
                  <span className="font-medium">{fmt(catParams.pesoEvolucaoKg, 0)} kg</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* BLOCO 5: GMD */}
      {gmdInfo && (gmdInfo.gmdPlanejado != null || gmdInfo.gmdImplicito != null) && (
        <>
          <Separator />
          <div>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
              GMD
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] max-w-[220px]">
                  O GMD implícito é apenas informativo. Ele NÃO altera o GMD planejado da META automaticamente.
                </TooltipContent>
              </Tooltip>
            </h4>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">GMD planejado</span>
                <span className="font-semibold">{gmdInfo.gmdPlanejado != null ? `${fmt(gmdInfo.gmdPlanejado, 3)} kg` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GMD implícito</span>
                <span className="font-semibold">{gmdInfo.gmdImplicito != null ? `${fmt(gmdInfo.gmdImplicito, 3)} kg` : '-'}</span>
              </div>
              {gmdInfo.desvio != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desvio</span>
                  <span className={`font-semibold ${Math.abs(gmdInfo.desvio) > ALERTA_GMD_DESVIO_PCT ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {gmdInfo.desvio > 0 ? '+' : ''}{(gmdInfo.desvio * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Botão Sugerir Evolução */}
      {evolucaoInfo && (
        <>
          <Separator />
          {evolucaoInfo.elegivel ? (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2 space-y-1">
              <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                ✅ Lote elegível para evolução
              </p>
              <p className="text-[10px] text-green-600 dark:text-green-500">
                Peso médio ({fmt(evolucaoInfo.pesoMedioAtual, 1)} kg) ≥ peso de evolução ({fmt(evolucaoInfo.pesoEvolucao, 0)} kg)
              </p>
              <p className="text-[10px] text-green-600 dark:text-green-500">
                Destino: <strong>{getCategoriaLabel(evolucaoInfo.categoriaDestino)}</strong>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-7 text-[10px] border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/50"
                onClick={() => onSugestaoEvolucao?.(evolucaoInfo)}
              >
                Sugerir Evolução
              </Button>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              <span>Evolução para <strong>{getCategoriaLabel(evolucaoInfo.categoriaDestino)}</strong>: </span>
              <span>peso atual {fmt(evolucaoInfo.pesoMedioAtual, 1)} kg / mín. {fmt(evolucaoInfo.pesoEvolucao, 0)} kg</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Retorna true se há bloqueios no painel */
export function useMetaValidacaoBloqueios(
  ano: number, mes: number, categoria: Categoria | '',
  tipo: TipoMovimentacao, quantidade: number, pesoKg: number, clienteId?: string,
): boolean {
  const { getSaldoMap, getPesoMedioMap } = useRebanhoOficial({ ano, cenario: 'meta' });
  const { getParametros } = useCategoriaParametros(clienteId);

  return useMemo(() => {
    if (!categoria || quantidade <= 0) return false;

    const saldoAtual = getSaldoMap(mes).get(categoria) ?? 0;
    const pesoMedioAtual = getPesoMedioMap(mes).get(categoria) ?? null;
    const pesoTotalAtual = pesoMedioAtual != null ? saldoAtual * pesoMedioAtual : 0;
    const catParams = getParametros(categoria);
    const isSaida = isMovimentacaoSaida(tipo);

    // Saldo negativo
    if (isSaida && (saldoAtual - quantidade) < 0) return true;

    // Peso fora da faixa
    if (catParams && pesoKg > 0) {
      if (pesoKg < catParams.pesoMinKg || pesoKg > catParams.pesoMaxKg) return true;
    }

    // Peso médio final incoerente
    if (isSaida) {
      const saldoFinal = saldoAtual - quantidade;
      if (saldoFinal > 0) {
        const pesoFinal = (pesoTotalAtual - quantidade * pesoKg) / saldoFinal;
        if (pesoFinal <= 0) return true;
        if (catParams && pesoFinal > catParams.pesoMaxKg) return true;
      }
    }

    return false;
  }, [ano, mes, categoria, tipo, quantidade, pesoKg, clienteId, getSaldoMap, getPesoMedioMap, getParametros]);
}
