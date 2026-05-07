/**
 * ExtratoListaTab — visualização tabular dos movimentos importados em
 * extrato_bancario_v2 para uma conta + mês.
 *
 * Filtros por props (controlados pela tela hospedeira):
 *   - contaBancariaId
 *   - anoMes ('YYYY-MM')
 *
 * Ações por linha:
 *   - "Conciliar"  → abre ConciliarExtratoDialog
 *   - "Ignorar"    → marca status='ignorado' no movimento
 *
 * NÃO altera lançamentos. NÃO cria lançamentos.
 */
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useExtratoBancario, type ExtratoMovimento } from '@/hooks/useExtratoBancario';
import { ConciliarExtratoDialog, type ExtratoMovimentoRef } from './ConciliarExtratoDialog';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  contaBancariaId: string | null;
  anoMes: string | null; // 'YYYY-MM' ou null = sem filtro
}

const STATUS_BADGE: Record<ExtratoMovimento['status'], { label: string; cls: string }> = {
  nao_conciliado: { label: 'Não conciliado', cls: 'bg-red-100 text-red-700' },
  parcial:        { label: 'Parcial',        cls: 'bg-amber-100 text-amber-700' },
  conciliado:     { label: 'Conciliado',     cls: 'bg-emerald-100 text-emerald-700' },
  ignorado:       { label: 'Ignorado',       cls: 'bg-muted text-muted-foreground' },
};

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoListaTab({ contaBancariaId, anoMes }: Props) {
  const dataInicio = anoMes ? `${anoMes}-01` : undefined;
  const dataFim = useMemo(() => {
    if (!anoMes) return undefined;
    const [y, m] = anoMes.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    return `${anoMes}-${String(ultimo).padStart(2, '0')}`;
  }, [anoMes]);

  const { movimentos, loading, refetch } = useExtratoBancario({
    contaBancariaId: contaBancariaId ?? undefined,
    dataInicio,
    dataFim,
    enabled: !!contaBancariaId,
  });

  const [conciliando, setConciliando] = useState<ExtratoMovimentoRef | null>(null);
  const [ignorandoId, setIgnorandoId] = useState<string | null>(null);

  const handleIgnorar = async (mov: ExtratoMovimento) => {
    setIgnorandoId(mov.id);
    const { error } = await supabase
      .from('extrato_bancario_v2' as any)
      .update({ status: 'ignorado' })
      .eq('id', mov.id);
    setIgnorandoId(null);
    if (error) {
      toast.error('Erro ao ignorar: ' + error.message);
      return;
    }
    toast.success('Movimento marcado como ignorado');
    refetch();
  };

  if (!contaBancariaId) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        Selecione uma conta para visualizar o extrato importado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        {loading ? 'Carregando...' : `${movimentos.length} movimento(s) no período.`}
      </div>

      <div className="border rounded overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="text-[10px]">Data</TableHead>
              <TableHead className="text-[10px]">Descrição</TableHead>
              <TableHead className="text-[10px]">Documento</TableHead>
              <TableHead className="text-[10px] text-right">Valor</TableHead>
              <TableHead className="text-[10px]">Status</TableHead>
              <TableHead className="text-[10px] w-[170px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  Nenhum movimento importado para esta conta/período.
                </TableCell>
              </TableRow>
            )}
            {movimentos.map(m => {
              const badge = STATUS_BADGE[m.status];
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-[11px] font-mono">{fmtData(m.data_movimento)}</TableCell>
                  <TableCell className="text-[11px] max-w-[260px] truncate" title={m.descricao || ''}>{m.descricao || '-'}</TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">{m.documento || '-'}</TableCell>
                  <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatMoeda(m.valor)}
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado'}
                        onClick={() => setConciliando({
                          id: m.id,
                          cliente_id: m.cliente_id,
                          conta_bancaria_id: m.conta_bancaria_id,
                          data_movimento: m.data_movimento,
                          descricao: m.descricao,
                          documento: m.documento,
                          valor: m.valor,
                          status: m.status,
                        })}
                      >
                        Conciliar
                      </Button>
                      {m.status !== 'ignorado' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-muted-foreground"
                          disabled={ignorandoId === m.id}
                          onClick={() => handleIgnorar(m)}
                        >
                          Ignorar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ConciliarExtratoDialog
        open={!!conciliando}
        onClose={() => setConciliando(null)}
        movimento={conciliando}
        onConciliado={() => { setConciliando(null); refetch(); }}
      />
    </div>
  );
}
