/**
 * RevisarMatchDialog — confirmação manual de match OFX↔lançamento.
 *
 * Modos:
 *   - 1 candidato: mostra side-by-side direto (movimento OFX × lançamento).
 *   - N candidatos: mostra lista; ao escolher, expande para side-by-side.
 *
 * Ações:
 *   - "Aprovar e marcar realizado" — para status agendado/programado.
 *   - "Aprovar e vincular"          — quando lançamento já é realizado (apenas vínculo).
 *
 * NÃO altera categoria, valor, classificação. Tudo confirmado pelo humano.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBaixaViaExtrato } from '@/hooks/useBaixaViaExtrato';
import type { CandidatoPossivel } from '@/hooks/useImportacaoExtrato';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface MovimentoOFX {
  data: string;
  descricao: string | null;
  valor: number;
  documento: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** id do extrato_bancario_v2 já persistido. */
  extratoId: string;
  /** Movimento OFX para comparação. */
  movimentoOFX: MovimentoOFX;
  /** Candidatos a aprovar (1 ou N). */
  candidatos: CandidatoPossivel[];
  /** Mensagem do contexto (ex.: "Provável match — revisar e aprovar"). */
  tituloCustom?: string;
  onConcluido?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  realizado:  'bg-emerald-100 text-emerald-700',
  agendado:   'bg-amber-100 text-amber-800',
  programado: 'bg-blue-100 text-blue-700',
};

function fmtData(s: string | null): string {
  if (!s) return '-';
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function RevisarMatchDialog({ open, onClose, extratoId, movimentoOFX, candidatos, tituloCustom, onConcluido }: Props) {
  const { baixarLancamentoViaExtrato } = useBaixaViaExtrato();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Auto-selecionar quando há apenas 1 candidato.
  useEffect(() => {
    if (!open) {
      setSelecionadoId(null);
      return;
    }
    if (candidatos.length === 1) setSelecionadoId(candidatos[0].id);
    else setSelecionadoId(null);
  }, [open, candidatos]);

  const selecionado = candidatos.find((c) => c.id === selecionadoId) ?? null;
  const statusSel = (selecionado?.statusTransacao || '').toLowerCase();
  const acaoLabel = statusSel === 'realizado' ? 'Aprovar e vincular' : 'Aprovar e marcar realizado';

  const handleAprovar = async () => {
    if (!selecionado) return;
    setSalvando(true);
    try {
      const r = await baixarLancamentoViaExtrato({
        lancamentoId: selecionado.id,
        extratoId,
        dataPagamentoReal: movimentoOFX.data,
        documentoBanco: movimentoOFX.documento ?? undefined,
      });
      const partes: string[] = [];
      if (r.convertido) partes.push('lançamento marcado realizado');
      if (r.vinculado) partes.push('vínculo criado com extrato');
      toast.success(partes.length > 0 ? partes.join(' · ') : 'Sem alteração necessária');
      onConcluido?.();
      onClose();
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{tituloCustom ?? 'Revisar e aprovar match'}</DialogTitle>
          <DialogDescription>
            Compare o movimento do extrato com o lançamento. Categoria, valor e classificação NÃO são alterados.
          </DialogDescription>
        </DialogHeader>

        {/* Lista (apenas se houver mais de 1 candidato e ainda nenhum selecionado) */}
        {candidatos.length > 1 && !selecionado && (
          <div className="border rounded overflow-auto max-h-[40vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-[10px]">Data</TableHead>
                  <TableHead className="text-[10px]">Fornecedor / descrição</TableHead>
                  <TableHead className="text-[10px] text-right">Valor</TableHead>
                  <TableHead className="text-[10px] text-right">Δ R$</TableHead>
                  <TableHead className="text-[10px] text-right">Δ dias</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatos.map((c) => {
                  const st = (c.statusTransacao || '').toLowerCase();
                  const cls = STATUS_BADGE[st] ?? 'bg-muted text-muted-foreground';
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-[11px] font-mono">{fmtData(c.data)}</TableCell>
                      <TableCell className="text-[11px] max-w-[220px] truncate" title={c.fornecedor || c.descricao || ''}>
                        {c.fornecedor || c.descricao || '-'}
                      </TableCell>
                      <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${c.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatMoeda(c.valor)}
                      </TableCell>
                      <TableCell className="text-[11px] text-right font-mono text-muted-foreground">
                        {c.diffValor === 0 ? '0' : formatMoeda(c.diffValor)}
                      </TableCell>
                      <TableCell className="text-[11px] text-right font-mono text-muted-foreground">{c.diffDias}</TableCell>
                      <TableCell className="text-[10px]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${cls}`}>
                          {st || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setSelecionadoId(c.id)}>
                          Escolher
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Side-by-side */}
        {selecionado && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Movimento do extrato</div>
              <div><strong>Data:</strong> {fmtData(movimentoOFX.data)}</div>
              <div><strong>Descrição:</strong> {movimentoOFX.descricao || '-'}</div>
              <div className={`font-semibold tabular-nums ${movimentoOFX.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                <strong className="text-foreground">Valor:</strong> {formatMoeda(movimentoOFX.valor)}
              </div>
              <div><strong>Documento:</strong> <code className="font-mono">{movimentoOFX.documento || '-'}</code></div>
            </div>

            <div className="rounded-md border bg-blue-50/40 p-3 text-xs space-y-1">
              <div className="font-bold text-[11px] uppercase tracking-wider text-blue-700 mb-1">Lançamento financeiro</div>
              <div><strong>Data pgto:</strong> {fmtData(selecionado.data)}</div>
              <div><strong>Fornecedor:</strong> {selecionado.fornecedor || '—'}</div>
              <div><strong>Descrição:</strong> {selecionado.descricao || '-'}</div>
              <div className={`font-semibold tabular-nums ${selecionado.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                <strong className="text-foreground">Valor:</strong> {formatMoeda(selecionado.valor)}
              </div>
              <div><strong>Doc.:</strong> <code className="font-mono">{selecionado.numeroDocumento || '-'}</code></div>
              <div>
                <strong>Status:</strong>{' '}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[statusSel] ?? 'bg-muted text-muted-foreground'}`}>
                  {statusSel || '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {selecionado && candidatos.length > 1 && (
            <Button variant="ghost" onClick={() => setSelecionadoId(null)} disabled={salvando}>
              ← Voltar à lista
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleAprovar} disabled={salvando || !selecionado}>
            {salvando ? 'Processando...' : acaoLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
