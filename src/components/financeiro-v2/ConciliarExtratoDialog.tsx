/**
 * ConciliarExtratoDialog — vínculo manual extrato↔lançamentos.
 *
 * Recebe um movimento de extrato e busca candidatos em financeiro_lancamentos_v2:
 *   - mesmo cliente
 *   - mesma conta_bancaria_id (origem ou destino)
 *   - status_transacao = 'realizado'
 *   - cancelado = false
 *   - data_pagamento ±7 dias do data_movimento
 *
 * Usuário marca lançamentos e ajusta `valor_aplicado` por linha.
 * Insere em conciliacao_bancaria_itens via useConciliacaoBancariaItens.
 *
 * NÃO cria lançamento novo. NÃO altera lançamento existente.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useConciliacaoBancariaItens } from '@/hooks/useConciliacaoBancariaItens';
import { formatMoeda } from '@/lib/calculos/formatters';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

export interface ExtratoMovimentoRef {
  id: string;
  cliente_id: string;
  conta_bancaria_id: string;
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
  status: 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';
}

interface CandidatoLancamento {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  sinal: number;
  descricao: string | null;
  numero_documento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  movimento: ExtratoMovimentoRef | null;
  onConciliado?: () => void;
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  const r = new Date(d.getTime() + n * 86400000);
  return r.toISOString().slice(0, 10);
}

function fmtData(s: string | null): string {
  if (!s) return '-';
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ConciliarExtratoDialog({ open, onClose, movimento, onConciliado }: Props) {
  const { clienteAtual } = useCliente();
  const { insert } = useConciliacaoBancariaItens();
  const [candidatos, setCandidatos] = useState<CandidatoLancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!open || !movimento || !clienteAtual?.id) return;
    setLoading(true);
    setMarcados(new Map());
    const dataIni = addDays(movimento.data_movimento, -7);
    const dataFim = addDays(movimento.data_movimento, +7);

    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, data_competencia, data_pagamento, valor, sinal, descricao, numero_documento, conta_bancaria_id, conta_destino_id')
      .eq('cliente_id', clienteAtual.id)
      .eq('cancelado', false)
      .eq('status_transacao', 'realizado')
      .or(`conta_bancaria_id.eq.${movimento.conta_bancaria_id},conta_destino_id.eq.${movimento.conta_bancaria_id}`)
      .gte('data_pagamento', dataIni)
      .lte('data_pagamento', dataFim)
      .order('data_pagamento', { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao buscar candidatos: ' + error.message); setCandidatos([]); }
        else setCandidatos((data ?? []) as CandidatoLancamento[]);
        setLoading(false);
      });
  }, [open, movimento, clienteAtual?.id]);

  const valorMov = movimento ? Math.abs(movimento.valor) : 0;
  const totalSelecionado = useMemo(() => {
    let s = 0;
    for (const v of marcados.values()) s += Math.abs(Number(v) || 0);
    return s;
  }, [marcados]);
  const restante = Math.max(0, valorMov - totalSelecionado);

  const toggleMarcado = (l: CandidatoLancamento) => {
    setMarcados(prev => {
      const next = new Map(prev);
      if (next.has(l.id)) {
        next.delete(l.id);
      } else {
        // valor_aplicado default = valor signed do lançamento (módulo)
        next.set(l.id, Math.abs(Number(l.valor) || 0));
      }
      return next;
    });
  };

  const setValorAplicado = (id: string, raw: string) => {
    const n = Number(raw.replace(',', '.'));
    setMarcados(prev => {
      const next = new Map(prev);
      if (Number.isFinite(n) && n > 0) next.set(id, n);
      return next;
    });
  };

  const handleVincular = async () => {
    if (!movimento || !clienteAtual?.id) return;
    if (marcados.size === 0) { toast.error('Selecione ao menos um lançamento'); return; }
    if (totalSelecionado <= 0) { toast.error('Total aplicado deve ser maior que zero'); return; }
    if (totalSelecionado > valorMov + 0.01) {
      toast.error('Total aplicado excede o valor do movimento do extrato');
      return;
    }
    setSalvando(true);
    try {
      for (const [lancId, valorAplicado] of marcados.entries()) {
        await insert({
          extrato_id: movimento.id,
          lancamento_id: lancId,
          valor_aplicado: valorAplicado,
          cliente_id: clienteAtual.id,
        });
      }
      toast.success(`${marcados.size} vínculo(s) criado(s)`);
      onConciliado?.();
      onClose();
    } catch (e: any) {
      toast.error('Erro ao vincular: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Conciliar movimento do extrato</DialogTitle>
          <DialogDescription>
            Vincule este movimento a um ou mais lançamentos financeiros realizados.
            O extrato passa a 'parcial' ou 'conciliado' conforme a soma dos valores aplicados.
          </DialogDescription>
        </DialogHeader>

        {movimento && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between gap-4">
              <span><strong>Data:</strong> {fmtData(movimento.data_movimento)}</span>
              <span className={`font-semibold tabular-nums ${movimento.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {formatMoeda(movimento.valor)}
              </span>
            </div>
            <div><strong>Descrição:</strong> {movimento.descricao || '-'}</div>
            <div><strong>Documento:</strong> {movimento.documento || '-'}</div>
          </div>
        )}

        <div className="flex-1 overflow-auto border rounded min-h-[200px] max-h-[45vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-[10px]">Pgto</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                <TableHead className="text-[10px]">Doc.</TableHead>
                <TableHead className="text-[10px] text-right">Valor</TableHead>
                <TableHead className="text-[10px] text-right w-[110px]">Aplicar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : candidatos.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nenhum lançamento candidato (±7 dias, mesma conta, status realizado).</TableCell></TableRow>
              ) : candidatos.map(l => {
                const marcado = marcados.has(l.id);
                const valorSigned = (Number(l.valor) || 0) * (l.sinal >= 0 ? 1 : -1);
                return (
                  <TableRow key={l.id} className={marcado ? 'bg-blue-50/40' : ''}>
                    <TableCell><Checkbox checked={marcado} onCheckedChange={() => toggleMarcado(l)} /></TableCell>
                    <TableCell className="text-[11px] font-mono">{fmtData(l.data_pagamento)}</TableCell>
                    <TableCell className="text-[11px] max-w-[260px] truncate" title={l.descricao || ''}>{l.descricao || '-'}</TableCell>
                    <TableCell className="text-[11px] font-mono text-muted-foreground">{l.numero_documento || '-'}</TableCell>
                    <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${valorSigned < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatMoeda(valorSigned)}
                    </TableCell>
                    <TableCell className="text-[11px] text-right">
                      {marcado ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={marcados.get(l.id) ?? ''}
                          onChange={e => setValorAplicado(l.id, e.target.value)}
                          className="h-6 text-[11px] text-right tabular-nums"
                        />
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs gap-2 flex-wrap pt-2">
          <span><strong>Selecionados:</strong> {marcados.size}</span>
          <span><strong>Aplicado:</strong> <span className="tabular-nums">{formatMoeda(totalSelecionado)}</span></span>
          <span><strong>Movimento:</strong> <span className="tabular-nums">{formatMoeda(valorMov)}</span></span>
          <span className={restante > 0.005 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
            Restante: {formatMoeda(restante)}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
          <Button onClick={handleVincular} disabled={salvando || marcados.size === 0}>
            {salvando ? 'Vinculando...' : `Vincular (${marcados.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
