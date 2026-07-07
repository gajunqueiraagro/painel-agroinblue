/**
 * EnriquecimentoCandidatosDrawer — drawer da Mesa nova para resolver uma linha
 * 'candidatos_proximos' ou 'sem_match'. Lista candidatos de GRUPO (±10d ∩ ano_mes,
 * ABS(valor) <= excel — membros somam), com DISTÂNCIA EM DIAS destacada, ordenados
 * pelo ranking do banco. Fonte única = fn_classificacao_candidatos_grupo (a UI NÃO
 * re-declara a janela).
 *
 * Duas decisões humanas, nunca automáticas:
 *   · 1 selecionado → "Escolher candidato" (1:1, fn_classificacao_resolver_proximos —
 *     só p/ linha 'candidatos_proximos' e valor casando).
 *   · 2+ selecionados → "Agrupar selecionados" (N:1, fn_classificacao_resolver_grupo),
 *     habilitado só quando a SOMA = valor Excel (±0,005).
 * Agrupamento (2+) é o PR-MESA-GRUPO-01; o 1:1 fica intacto.
 */
import { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useClassificacaoCandidatosGrupo } from '@/v2/hooks/useClassificacaoCandidatosGrupo';

export interface ContextoExcelProx {
  linha: number | null;
  data: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  fornecedor: string | null;
}

interface Props {
  stagingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextoExcel: ContextoExcelProx | null;
  excelValor: number | null;
  statusLinha: string | null;
  /** 1:1 (resolver_proximos). O pai trata toast/guard e fecha o drawer. */
  onEscolher: (lancId: string) => void;
  /** N:1 (resolver_grupo). O pai trata toast/guard e fecha o drawer. */
  onAgrupar: (lancIds: string[]) => void;
  isResolvendo?: boolean;
  isAgrupando?: boolean;
  /** Lançamentos já usados por OUTRAS linhas da sessão (singular OU grupo) — ocultados. */
  lancIdsUsados?: Set<string>;
}

const TOL = 0.005;

function fmtData(s: string | null): string {
  if (!s) return '-';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

function truncUuid(uuid: string | null): string {
  if (!uuid) return '-';
  return uuid.slice(0, 8);
}

// Distância em dias → tom (0-1d ok, 2-3d atenção, 4+ limite).
function distCls(d: number | null): string {
  if (d == null) return 'bg-muted text-muted-foreground';
  if (d <= 1) return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
  if (d <= 3) return 'bg-amber-100 text-amber-800 border border-amber-300';
  return 'bg-orange-100 text-orange-800 border border-orange-300';
}

export function EnriquecimentoCandidatosDrawer({
  stagingId, open, onOpenChange, contextoExcel, excelValor, statusLinha,
  onEscolher, onAgrupar, isResolvendo, isAgrupando, lancIdsUsados,
}: Props) {
  const { data: candidatos, isLoading, error } = useClassificacaoCandidatosGrupo(open ? stagingId : null);

  // Seleção PLURAL (grupos). Reset ao trocar de linha/fechar.
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  useEffect(() => { setSelecionados(new Set()); }, [stagingId, open]);

  const candidatosVisiveis = useMemo(() => {
    if (!candidatos) return candidatos;
    if (!lancIdsUsados || lancIdsUsados.size === 0) return candidatos;
    return candidatos.filter((c) => !lancIdsUsados.has(c.lanc_id));
  }, [candidatos, lancIdsUsados]);
  const ocultadosCount = (candidatos?.length ?? 0) - (candidatosVisiveis?.length ?? 0);

  const toggle = (lancId: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(lancId)) n.delete(lancId); else n.add(lancId);
      return n;
    });
  };

  // Soma dos selecionados (ABS) e diferença vs valor Excel — ao vivo.
  const soma = useMemo(() => {
    if (!candidatos) return 0;
    return candidatos
      .filter((c) => selecionados.has(c.lanc_id))
      .reduce((s, c) => s + Math.abs(Number(c.valor) || 0), 0);
  }, [candidatos, selecionados]);
  const diff = soma - (excelValor ?? 0);
  const diffOk = Math.abs(diff) <= TOL;
  const n = selecionados.size;

  const podeEscolher = n === 1 && statusLinha === 'candidatos_proximos' && diffOk && !isResolvendo;
  const podeAgrupar = n >= 2 && diffOk && !isAgrupando;

  const escolher = () => { if (n === 1) onEscolher([...selecionados][0]); };
  const agrupar = () => { if (n >= 2) onAgrupar([...selecionados]); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Candidatos — linha {contextoExcel?.linha ?? '-'}
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Lançamentos realizados a até 10 dias da data do Excel, mesmo tipo/conta.
            Escolha UM (valor igual) ou marque VÁRIOS que somem o valor do Excel — o sistema nunca decide sozinho.
          </SheetDescription>
        </SheetHeader>

        {contextoExcel && (
          <div className="mt-4 p-3 rounded-md bg-muted/50 border space-y-1 text-[11px]">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-1">Contexto Excel</div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Data:</span>
              <span className="font-mono">{fmtData(contextoExcel.data)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-mono tabular-nums font-semibold">
                {contextoExcel.valor != null ? formatMoeda(contextoExcel.valor) : '-'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Tipo:</span>
              <span>{contextoExcel.tipo_operacao ?? '-'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Fornecedor Excel:</span>
              <span className="truncate text-right max-w-[260px]" title={contextoExcel.fornecedor ?? ''}>
                {contextoExcel.fornecedor ?? '-'}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Candidatos na janela ±10 dias (ordenados por distância)
          </div>

          {isLoading && (
            <div className="text-[11px] text-muted-foreground py-4 text-center">Carregando candidatos…</div>
          )}

          {error && (
            <div className="text-[11px] text-red-700 py-3 px-2 rounded-md bg-red-50 border border-red-200">
              Erro ao buscar candidatos: {error instanceof Error ? error.message : String(error)}
            </div>
          )}

          {!isLoading && !error && candidatos && candidatos.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-3 px-2 rounded-md bg-muted/40 border">
              Nenhum candidato na janela. Pode ter sido reconciliado ou removido após o populate.
            </div>
          )}

          {!isLoading && !error && candidatos && candidatos.length > 0 && candidatosVisiveis && candidatosVisiveis.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-3 px-2 rounded-md bg-muted/40 border">
              Todos os candidatos já foram usados por outras linhas desta sessão ({ocultadosCount} oculto{ocultadosCount === 1 ? '' : 's'}).
            </div>
          )}

          {!isLoading && !error && candidatosVisiveis && candidatosVisiveis.length > 0 && (
            <div className="space-y-2">
              {ocultadosCount > 0 && (
                <div className="text-[10px] text-muted-foreground italic pb-1">
                  {ocultadosCount} candidato{ocultadosCount === 1 ? '' : 's'} oculto{ocultadosCount === 1 ? '' : 's'} (já usado{ocultadosCount === 1 ? '' : 's'} nesta sessão).
                </div>
              )}
              {candidatosVisiveis.map((c) => {
                const marcado = selecionados.has(c.lanc_id);
                return (
                  <div
                    key={c.lanc_id}
                    className={`p-3 border rounded-md space-y-1 text-[11px] cursor-pointer transition-colors ${marcado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-accent/40'}`}
                    onClick={() => toggle(c.lanc_id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Checkbox checked={marcado} onCheckedChange={() => toggle(c.lanc_id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate" title={c.descricao ?? ''}>
                            {c.descricao ?? '(sem descrição)'}
                          </div>
                          {c.observacao && (
                            <div className="text-muted-foreground text-[10px] truncate" title={c.observacao}>{c.observacao}</div>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${distCls(c.distancia_dias)}`}
                        title="Distância em dias entre a data do Excel e a do lançamento">
                        {c.distancia_dias != null ? `${c.distancia_dias}d` : '—'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] pl-6">
                      <span className="font-mono">{fmtData(c.data_pagamento)}</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {c.valor != null ? formatMoeda(c.valor) : '-'}
                      </span>
                      <span>{c.tipo_operacao ?? '-'}</span>
                      <span className="text-muted-foreground font-mono" title={c.lanc_id}>{truncUuid(c.lanc_id)}</span>
                    </div>
                    <div className="text-[10px] flex flex-col gap-0.5 pl-6">
                      <span>
                        <span className="text-muted-foreground">Conta:</span>{' '}
                        {c.conta_bancaria_nome ?? c.conta_destino_nome ?? '-'}
                      </span>
                      <span>
                        <span className="text-muted-foreground">Fornecedor:</span>{' '}
                        {c.favorecido_nome ?? <span className="italic text-muted-foreground">∅ vazio</span>}
                      </span>
                      {c.documento && (
                        <span><span className="text-muted-foreground">Documento:</span> {c.documento}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col sm:space-x-0">
          {/* Soma selecionada + diferença ao vivo (o gate do "Agrupar" é diferença = 0). */}
          {n >= 1 && (
            <div className="w-full rounded-md border px-2 py-1 text-[11px] flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{n} selecionado{n === 1 ? '' : 's'} · soma</span>
              <span className="font-mono tabular-nums font-semibold">{formatMoeda(soma)}</span>
              <span className={`font-mono tabular-nums ${diffOk ? 'text-emerald-700' : 'text-rose-700'}`}>
                dif {diff >= 0 ? '+' : ''}{formatMoeda(diff)}
              </span>
            </div>
          )}
          {n === 1 && statusLinha !== 'candidatos_proximos' && (
            <div className="text-[10px] text-muted-foreground">
              Linha sem match direto — marque 2+ lançamentos que somem o valor para agrupar.
            </div>
          )}
          {n <= 1 ? (
            <Button size="sm" className="w-full" disabled={!podeEscolher} onClick={escolher}>
              {isResolvendo ? 'Escolhendo…' : 'Escolher candidato'}
            </Button>
          ) : (
            <Button size="sm" className="w-full" disabled={!podeAgrupar} onClick={agrupar}>
              {isAgrupando ? 'Agrupando…' : `Agrupar selecionados (${n})`}
            </Button>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
