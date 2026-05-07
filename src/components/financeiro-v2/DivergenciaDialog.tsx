/**
 * DivergenciaDialog — auditoria da diferença remanescente da conciliação OFX.
 *
 * Lista cada movimento do preview que contribui para a diferença:
 *   - extratos com status='parcial' (vínculos < |valor extrato|)
 *   - extratos sem qualquer match (em DB mas sem vínculo)
 *   - extratos ainda não salvos (nada vinculado)
 *
 * Para cada item: Tipo · Sistema (soma vínculos) · Extrato (|valor|) · Diferença · Origem.
 *
 * NÃO altera nada — apenas leitura/visualização para o usuário entender a origem
 * da diferença e decidir como zerar manualmente. Categoria, valor, status,
 * fornecedor, fazenda nunca são tocados aqui.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import type { MovimentoPreview, PreviewResult } from '@/hooks/useImportacaoExtrato';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
  preview: PreviewResult | null;
  clienteId: string | null | undefined;
}

type Origem = 'parcial' | 'sem_match' | 'nao_salvo';

interface ItemDivergencia {
  movimento: MovimentoPreview;
  somaVinculos: number;
  diferenca: number;        // valorExtrato (abs) - somaVinculos
  origem: Origem;
}

const ROTULO_ORIGEM: Record<Origem, string> = {
  parcial: 'parcial — falta cobrir',
  sem_match: 'sem match em DB',
  nao_salvo: 'extrato ainda não salvo',
};

const CLS_ORIGEM: Record<Origem, string> = {
  parcial:    'bg-amber-100 text-amber-800',
  sem_match:  'bg-red-100 text-red-700',
  nao_salvo:  'bg-slate-100 text-slate-700',
};

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function DivergenciaDialog({ open, onClose, preview, clienteId }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [vinculosPorExtrato, setVinculosPorExtrato] = useState<Map<string, number>>(new Map());

  // Identifica movimentos que contribuem para a diferença.
  const movimentosDivergentes = useMemo(() => {
    if (!preview) return [] as MovimentoPreview[];
    return preview.movimentos.filter((m) => {
      // Conciliados/ignorados não contribuem.
      if (m.statusPersistido === 'conciliado' || m.statusPersistido === 'ignorado') return false;
      // Parciais e nao_conciliados (ainda não cobertos) entram.
      if (m.statusPersistido === 'parcial') return true;
      if (m.statusPersistido === 'nao_conciliado') return true;
      // Movimentos ainda não salvos no DB também entram (para visibilidade total).
      if (!m.existeNoDB) return true;
      return false;
    });
  }, [preview]);

  // Busca soma dos vínculos para cada extrato persistido divergente.
  useEffect(() => {
    if (!open || !preview || !clienteId) return;
    const ids = movimentosDivergentes
      .map((m) => m.extratoIdExistente)
      .filter((x): x is string => !!x);
    if (ids.length === 0) {
      setVinculosPorExtrato(new Map());
      return;
    }
    setCarregando(true);
    supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('extrato_id, valor_aplicado')
      .eq('cliente_id', clienteId)
      .in('extrato_id', ids)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const v of (data ?? []) as { extrato_id: string; valor_aplicado: number }[]) {
          map.set(v.extrato_id, (map.get(v.extrato_id) ?? 0) + Math.abs(Number(v.valor_aplicado) || 0));
        }
        setVinculosPorExtrato(map);
        setCarregando(false);
      });
  }, [open, preview, clienteId, movimentosDivergentes]);

  const itens: ItemDivergencia[] = useMemo(() => {
    return movimentosDivergentes.map((m) => {
      const valorAbs = Math.abs(m.valor);
      const somaVinculos = m.extratoIdExistente
        ? vinculosPorExtrato.get(m.extratoIdExistente) ?? 0
        : 0;
      const diferenca = Math.max(0, valorAbs - somaVinculos);
      let origem: Origem;
      if (!m.existeNoDB) origem = 'nao_salvo';
      else if (m.statusPersistido === 'parcial') origem = 'parcial';
      else origem = 'sem_match';
      return { movimento: m, somaVinculos, diferenca, origem };
    });
  }, [movimentosDivergentes, vinculosPorExtrato]);

  const totalDiferenca = itens.reduce((s, it) => s + it.diferenca, 0);
  const totalCreditos = itens
    .filter((it) => it.movimento.tipo === 'credito')
    .reduce((s, it) => s + it.diferenca, 0);
  const totalDebitos = itens
    .filter((it) => it.movimento.tipo === 'debito')
    .reduce((s, it) => s + it.diferenca, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[94vw] max-w-6xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 px-6 py-3 border-b">
          <DialogTitle className="text-base leading-none">Origem da diferença de conciliação</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            Lista os movimentos do preview que contribuem para a diferença residual.
            Nenhum dado financeiro é alterado por esta tela — é apenas auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-3">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="text-[10px]">Data</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                <TableHead className="text-[10px]">Doc.</TableHead>
                <TableHead className="text-[10px]">Tipo</TableHead>
                <TableHead className="text-[10px] text-right">Sistema (vínc.)</TableHead>
                <TableHead className="text-[10px] text-right">Extrato</TableHead>
                <TableHead className="text-[10px] text-right">Diferença</TableHead>
                <TableHead className="text-[10px]">Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                    Carregando vínculos...
                  </TableCell>
                </TableRow>
              )}
              {!carregando && itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                    Nenhuma divergência detectada — todos os movimentos estão conciliados.
                  </TableCell>
                </TableRow>
              )}
              {!carregando && itens.map((it, i) => {
                const { movimento: m, somaVinculos, diferenca, origem } = it;
                return (
                  <TableRow key={i}>
                    <TableCell className="text-[11px] font-mono">{fmtData(m.data)}</TableCell>
                    <TableCell className="text-[11px] max-w-[260px] truncate" title={m.descricao}>
                      {m.descricao || '-'}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {m.documento || '-'}
                    </TableCell>
                    <TableCell className="text-[10px]">{m.tipo === 'credito' ? '↑ Cred' : '↓ Déb'}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono text-muted-foreground tabular-nums">
                      {formatMoeda(somaVinculos)}
                    </TableCell>
                    <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatMoeda(m.valor)}
                    </TableCell>
                    <TableCell className="text-[11px] text-right font-bold tabular-nums text-amber-800">
                      {formatMoeda(diferenca)}
                    </TableCell>
                    <TableCell className="text-[10px]">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${CLS_ORIGEM[origem]}`}>
                        {ROTULO_ORIGEM[origem]}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 z-20">
          <div className="text-[11px] text-muted-foreground sm:mr-auto">
            <strong className="text-foreground">{itens.length}</strong> movimento(s) divergente(s) ·
            Total: <strong className="text-amber-800">{formatMoeda(totalDiferenca)}</strong>
            {totalCreditos > 0 && <> · <span className="text-emerald-700">↑ {formatMoeda(totalCreditos)}</span></>}
            {totalDebitos > 0 && <> · <span className="text-red-700">↓ {formatMoeda(totalDebitos)}</span></>}
          </div>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
