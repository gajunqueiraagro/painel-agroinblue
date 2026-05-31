/**
 * MesaClassificacaoCandidatosDrawer — drawer lateral que lista
 * candidatos de match para uma staging row marcada como 'ambiguo'
 * (PR-M4). Sem ação de vincular — apenas exibe para o operador
 * decidir manualmente via tela Lançamentos Financeiros e re-rodar
 * populate.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useClassificacaoCandidatos } from '@/v2/hooks/useClassificacaoCandidatos';

interface ContextoExcel {
  linha: number | null;
  data: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  conta_origem: string | null;
  conta_destino: string | null;
  subcentro: string | null;
  fornecedor: string | null;
  produto: string | null;
}

interface Props {
  stagingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextoExcel: ContextoExcel | null;
  onEditCandidato?: (lancId: string) => void;
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

export function MesaClassificacaoCandidatosDrawer({
  stagingId,
  open,
  onOpenChange,
  contextoExcel,
  onEditCandidato,
}: Props) {
  const { data: candidatos, isLoading, error } = useClassificacaoCandidatos(open ? stagingId : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Candidatos para linha {contextoExcel?.linha ?? '-'}
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Reproduz o mesmo critério da RPC populate. Para vincular um
            candidato manualmente, ajuste o lançamento na tela
            Lançamentos Financeiros e re-rode o populate para converter
            ambíguo em exato.
          </SheetDescription>
        </SheetHeader>

        {/* Contexto Excel */}
        {contextoExcel && (
          <div className="mt-4 p-3 rounded-md bg-muted/50 border space-y-1 text-[11px]">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
              Contexto Excel
            </div>
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
              <span className="text-muted-foreground">Conta origem:</span>
              <span className="truncate text-right max-w-[260px]" title={contextoExcel.conta_origem ?? ''}>
                {contextoExcel.conta_origem ?? '-'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Conta destino:</span>
              <span className="truncate text-right max-w-[260px]" title={contextoExcel.conta_destino ?? ''}>
                {contextoExcel.conta_destino ?? '-'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Subcentro Excel:</span>
              <span className="truncate text-right max-w-[260px]" title={contextoExcel.subcentro ?? ''}>
                {contextoExcel.subcentro ?? '-'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Fornecedor Excel:</span>
              <span className="truncate text-right max-w-[260px]" title={contextoExcel.fornecedor ?? ''}>
                {contextoExcel.fornecedor ?? '-'}
              </span>
            </div>
            {contextoExcel.produto && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Produto:</span>
                <span className="truncate text-right max-w-[260px]" title={contextoExcel.produto}>
                  {contextoExcel.produto}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Candidatos */}
        <div className="mt-4">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Candidatos no banco
          </div>

          {isLoading && (
            <div className="text-[11px] text-muted-foreground py-4 text-center">
              Carregando candidatos…
            </div>
          )}

          {error && (
            <div className="text-[11px] text-red-700 py-3 px-2 rounded-md bg-red-50 border border-red-200">
              Erro ao buscar candidatos: {error instanceof Error ? error.message : String(error)}
            </div>
          )}

          {!isLoading && !error && candidatos && candidatos.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-3 px-2 rounded-md bg-muted/40 border">
              Nenhum candidato encontrado. Pode ter sido reconciliado ou
              removido após o populate. Re-rode o populate para refletir
              o estado atual do banco.
            </div>
          )}

          {!isLoading && !error && candidatos && candidatos.length > 0 && (
            <div className="space-y-2">
              {candidatos.map((c) => (
                <div
                  key={c.lanc_id}
                  className="p-3 border rounded-md bg-card space-y-1 text-[11px] cursor-pointer hover:bg-accent/40"
                  onClick={() => onEditCandidato?.(c.lanc_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={c.descricao ?? ''}>
                        {c.descricao ?? '(sem descrição)'}
                      </div>
                      {c.observacao && (
                        <div className="text-muted-foreground text-[10px] truncate" title={c.observacao}>
                          {c.observacao}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[9px] text-muted-foreground font-mono shrink-0"
                      title={c.lanc_id}
                    >
                      {truncUuid(c.lanc_id)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                    <span className="font-mono">{fmtData(c.data_pagamento)}</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {c.valor != null ? formatMoeda(c.valor) : '-'}
                    </span>
                    <span>{c.tipo_operacao ?? '-'}</span>
                  </div>
                  <div className="text-[10px] flex flex-col gap-0.5">
                    <span>
                      <span className="text-muted-foreground">Conta:</span>{' '}
                      {c.conta_bancaria_nome ?? c.conta_destino_nome ?? '-'}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Sub atual:</span>{' '}
                      {c.subcentro_atual ?? <span className="italic text-muted-foreground">∅ vazio</span>}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Forn atual:</span>{' '}
                      {c.favorecido_nome ?? <span className="italic text-muted-foreground">∅ vazio</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="mt-4">
          <p className="text-[10px] text-muted-foreground">
            Para vincular um candidato manualmente, ajuste o lançamento
            na tela <strong>Lançamentos Financeiros</strong> e re-rode
            o populate.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
