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
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useSistemaNaoExplicado, type LancamentoNaoExplicado } from '@/v2/hooks/useSistemaNaoExplicado';
import { useComposicaoSugerida, type ComposicaoSugerida } from '@/v2/hooks/useComposicaoSugerida';
import { useSplitSubstituir } from '@/v2/hooks/useSplitSubstituir';

const TOL = 0.005;
const MOTIVO_SPLIT: Record<string, string> = {
  soma_divergente: 'A soma das linhas não bate com o valor do lançamento.',
  staging_invalido: 'Alguma linha não está elegível (já aplicada, com match, ou fora da sessão).',
  ja_referenciado: 'Este lançamento já é referenciado por alguma linha — não é "não explicado".',
  sem_vinculo_ofx: 'Lançamento sem vínculo OFX — split não disponível aqui.',
  multi_extrato_nao_suportado: 'Lançamento com múltiplos extratos — não suportado neste fluxo.',
  extrato_divergente: 'O valor do movimento bancário diverge do lançamento.',
  conta_incompativel: 'Alguma linha é de conta incompatível com o lançamento.',
  poucos_itens: 'A composição precisa de ao menos 2 linhas.',
  ids_duplicados: 'Há linhas repetidas na composição.',
  lancamento_inexistente_ou_cancelado: 'Lançamento não encontrado ou cancelado.',
  sem_permissao: 'Sem permissão para este cliente.',
};

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

// Bloco de composição de UM lançamento (fn 2). O botão "Substituir" aparece só quando
// diferença = 0 — e executa EXATAMENTE a composição exibida (staging_ids da fn 2, sem
// recálculo/seleção livre no front). PR-MESA-SPLIT-01.
function ComposicaoBloco({ lanc, sessaoId }: { lanc: LancamentoNaoExplicado; sessaoId: string | null }) {
  const { data: comps, isLoading, error } = useComposicaoSugerida(lanc.lanc_id, sessaoId);
  const split = useSplitSubstituir(sessaoId);
  const [confirmComp, setConfirmComp] = useState<ComposicaoSugerida | null>(null);

  async function executar() {
    if (!confirmComp) return;
    const comp = confirmComp;
    setConfirmComp(null);
    try {
      // FIDELIDADE: passa os staging_ids da composição exibida — sem recalcular.
      const res: any = await split.mutateAsync({ lancamentoId: lanc.lanc_id, stagingIds: comp.staging_ids });
      if (res?.ok) {
        toast.success(`Substituído: ${res.lancamentos_criados?.length ?? comp.linhas.length} lançamentos · OFX ${res.status_extrato_final}.`);
      } else {
        toast.error(res?.mensagem ?? MOTIVO_SPLIT[res?.motivo] ?? `Não substituído (${res?.motivo ?? 'erro'}).`);
      }
    } catch (e) {
      toast.error(`Erro ao substituir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (isLoading) return <div className="text-[10px] text-muted-foreground py-1">Buscando composição…</div>;
  if (error) return <div className="text-[10px] text-rose-700 py-1">Erro ao buscar composição.</div>;
  if (!comps || comps.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-1 italic">Nenhuma composição encontrada.</div>;
  }
  return (
    <div className="space-y-2 pt-1">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700">Possível composição encontrada</div>
      <div className="text-[10px] text-muted-foreground">Estas linhas do Excel somam o valor deste lançamento.</div>
      {comps.map((c) => {
        const exato = Math.abs(c.diferenca ?? 1) <= TOL;
        return (
          <div key={c.composicao_n} className="rounded-md border bg-muted/30 p-2 space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Composição {c.composicao_n} · {c.linhas.length} linhas</span>
              <span className="font-mono tabular-nums font-semibold">{formatMoeda(c.soma ?? 0)}</span>
            </div>
            <div className="text-[10px] font-mono">Linhas Excel: {c.linhas.join(' + ')}</div>
            <div className="text-[10px] text-muted-foreground">
              diferença {(c.diferenca ?? 0) >= 0 ? '+' : ''}{formatMoeda(c.diferenca ?? 0)}
            </div>
            {exato && (
              <Button size="sm" className="h-6 text-[11px] mt-1" disabled={split.isPending} onClick={() => setConfirmComp(c)}>
                Substituir por estes detalhes ({c.linhas.length})
              </Button>
            )}
          </div>
        );
      })}

      <AlertDialog open={!!confirmComp} onOpenChange={(o) => { if (!o) setConfirmComp(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir consolidado pelos detalhes?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmComp && (
                <>
                  {confirmComp.linhas.length} linhas do Excel (nºs {confirmComp.linhas.join(', ')}) virarão {confirmComp.linhas.length} lançamentos classificados;
                  o lançamento consolidado <strong>{lanc.descricao ?? '(sem descrição)'}</strong> ({lanc.valor != null ? formatMoeda(lanc.valor) : '-'}) será cancelado;
                  o movimento bancário será reconciliado com os {confirmComp.linhas.length} novos.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void executar(); }} disabled={split.isPending}>
              {split.isPending ? 'Executando…' : 'Substituir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                    {aberto && <ComposicaoBloco lanc={l} sessaoId={sessaoId} />}
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
