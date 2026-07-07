/**
 * EnriquecimentoNaoExplicadoDrawer — visão INVERSA read-only (PR-MESA-INVERSO-01).
 * Lista os lançamentos vivos do mês/conta da sessão que NENHUMA linha do Excel
 * referencia (fn_classificacao_sistema_nao_explicado). Ao expandir um, mostra a
 * "Possível composição encontrada" (fn_classificacao_composicao_sugerida): linhas do
 * Excel que somam o valor do lançamento.
 *
 * READ-ONLY ABSOLUTO: nenhum botão de ação, nenhuma escrita. Split assistido = PR
 * futuro (SPLIT-01). Só inteligência de apoio à auditoria.
 */
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useSistemaNaoExplicado } from '@/v2/hooks/useSistemaNaoExplicado';
import { useComposicaoSugerida } from '@/v2/hooks/useComposicaoSugerida';

interface Props {
  sessaoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtData(s: string | null): string {
  if (!s) return '-';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

// Bloco de composição de UM lançamento (fn 2). Read-only, sem ação.
function ComposicaoBloco({ lancId, sessaoId }: { lancId: string; sessaoId: string | null }) {
  const { data: comps, isLoading, error } = useComposicaoSugerida(lancId, sessaoId);
  if (isLoading) return <div className="text-[10px] text-muted-foreground py-1">Buscando composição…</div>;
  if (error) return <div className="text-[10px] text-rose-700 py-1">Erro ao buscar composição.</div>;
  if (!comps || comps.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-1 italic">Nenhuma composição encontrada.</div>;
  }
  return (
    <div className="space-y-2 pt-1">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700">Possível composição encontrada</div>
      <div className="text-[10px] text-muted-foreground">Estas linhas do Excel somam o valor deste lançamento (apoio à auditoria — sem ação).</div>
      {comps.map((c) => (
        <div key={c.composicao_n} className="rounded-md border bg-muted/30 p-2 space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Composição {c.composicao_n} · {c.linhas.length} linhas</span>
            <span className="font-mono tabular-nums font-semibold">{formatMoeda(c.soma ?? 0)}</span>
          </div>
          <div className="text-[10px] font-mono">
            Linhas Excel: {c.linhas.join(' + ')}
          </div>
          <div className="text-[10px] text-muted-foreground">
            diferença {(c.diferenca ?? 0) >= 0 ? '+' : ''}{formatMoeda(c.diferenca ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EnriquecimentoNaoExplicadoDrawer({ sessaoId, open, onOpenChange }: Props) {
  const { data: lancs, isLoading, error } = useSistemaNaoExplicado(open ? sessaoId : null);
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Sistema não explicado</SheetTitle>
          <SheetDescription className="text-[11px]">
            Lançamentos realizados desta conta/mês que nenhuma linha do Excel referencia.
            Apoio à auditoria — visão de leitura, sem ação.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {isLoading && <div className="text-[11px] text-muted-foreground py-4 text-center">Carregando…</div>}
          {error && (
            <div className="text-[11px] text-red-700 py-3 px-2 rounded-md bg-red-50 border border-red-200">
              Erro: {error instanceof Error ? error.message : String(error)}
            </div>
          )}
          {!isLoading && !error && lancs && lancs.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-3 px-2 rounded-md bg-muted/40 border">
              Nenhum lançamento sem explicação nesta sessão.
            </div>
          )}
          {!isLoading && !error && lancs && lancs.length > 0 && (
            <div className="space-y-2">
              {lancs.map((l) => {
                const aberto = expandido === l.lanc_id;
                return (
                  <div key={l.lanc_id} className="p-3 border rounded-md bg-card space-y-1 text-[11px]">
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => setExpandido(aberto ? null : l.lanc_id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={l.descricao ?? ''}>
                          {l.descricao ?? '(sem descrição)'}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span className="font-mono">{fmtData(l.data_pagamento)}</span>
                          <span>{l.tipo_operacao ?? '-'}</span>
                          <span>{l.conta_nome ?? '-'}</span>
                          {l.documento && <span>doc {l.documento}</span>}
                        </div>
                        {l.favorecido_nome && (
                          <div className="text-[10px] text-muted-foreground truncate">{l.favorecido_nome}</div>
                        )}
                      </div>
                      <span className="font-mono tabular-nums font-semibold shrink-0">
                        {l.valor != null ? formatMoeda(l.valor) : '-'}
                      </span>
                    </div>
                    {aberto && <ComposicaoBloco lancId={l.lanc_id} sessaoId={sessaoId} />}
                    {!aberto && (
                      <div className="text-[9px] text-muted-foreground/70">Clique para ver composição possível</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SheetFooter className="mt-4">
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
