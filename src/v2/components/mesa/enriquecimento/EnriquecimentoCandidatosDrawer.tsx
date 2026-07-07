/**
 * EnriquecimentoCandidatosDrawer — drawer da Mesa nova para RESOLVER uma linha
 * 'candidatos_proximos' (PR-MESA-RESOLUCAO-01). Lista os candidatos da janela ±3d
 * (fn_classificacao_candidatos_proximos), com DISTÂNCIA EM DIAS destacada, ordenados
 * pelo ranking do banco. O operador escolhe UM → fn_classificacao_resolver_proximos.
 *
 * SUPORTE FUTURO A GRUPOS: a seleção é plural por desenho (Set + checkbox); o ato
 * "Escolher" deste PR é SINGLE (habilita só com exatamente 1 marcado). Agrupamento é
 * PR-MESA-GRUPO-01 — não misturar aqui.
 */
import { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useClassificacaoCandidatosProximos } from '@/v2/hooks/useClassificacaoCandidatosProximos';

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
  /** Executa a escolha (resolver_proximos). O pai trata toast/guard e fecha o drawer. */
  onEscolher: (lancId: string) => void;
  isResolvendo?: boolean;
  /** Lançamentos já escolhidos por OUTRAS linhas da sessão — ocultados (guard server-side é a trava real). */
  lancIdsUsados?: Set<string>;
}

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

// Distância em dias → tom (0-1d ok, 2d atenção, 3d limite).
function distCls(d: number | null): string {
  if (d == null) return 'bg-muted text-muted-foreground';
  if (d <= 1) return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
  if (d === 2) return 'bg-amber-100 text-amber-800 border border-amber-300';
  return 'bg-orange-100 text-orange-800 border border-orange-300';
}

export function EnriquecimentoCandidatosDrawer({
  stagingId, open, onOpenChange, contextoExcel, onEscolher, isResolvendo, lancIdsUsados,
}: Props) {
  const { data: candidatos, isLoading, error } = useClassificacaoCandidatosProximos(open ? stagingId : null);

  // Seleção PLURAL por desenho (Set), ação SINGLE neste PR. Reset ao trocar de linha/fechar.
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
      // ato single deste PR: marcar um limpa os demais (estrutura plural pronta p/ grupos).
      if (n.has(lancId)) { n.delete(lancId); return n; }
      return new Set([lancId]);
    });
  };

  const podeEscolher = selecionados.size === 1 && !isResolvendo;
  const escolher = () => {
    if (selecionados.size !== 1) return;
    onEscolher([...selecionados][0]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Candidatos próximos — linha {contextoExcel?.linha ?? '-'}
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Lançamentos realizados a até 3 dias da data do Excel, mesmo valor/tipo/conta.
            Escolha UM candidato — o sistema nunca escolhe sozinho.
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
            Candidatos na janela ±3 dias (ordenados por distância)
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
              Todos os candidatos já foram escolhidos por outras linhas desta sessão ({ocultadosCount} oculto{ocultadosCount === 1 ? '' : 's'}).
            </div>
          )}

          {!isLoading && !error && candidatosVisiveis && candidatosVisiveis.length > 0 && (
            <div className="space-y-2">
              {ocultadosCount > 0 && (
                <div className="text-[10px] text-muted-foreground italic pb-1">
                  {ocultadosCount} candidato{ocultadosCount === 1 ? '' : 's'} oculto{ocultadosCount === 1 ? '' : 's'} (já escolhido{ocultadosCount === 1 ? '' : 's'} nesta sessão).
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
          <Button size="sm" className="w-full" disabled={!podeEscolher} onClick={escolher}>
            {isResolvendo ? 'Escolhendo…' : 'Escolher candidato'}
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
