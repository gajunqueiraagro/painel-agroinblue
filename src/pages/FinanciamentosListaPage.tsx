import { ArrowLeft, Plus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';

/* ── Types ── */
interface FinanciamentoRow {
  id: string;
  descricao: string;
  numero_contrato: string | null;
  tipo_financiamento: string;
  credor_id: string | null;
  valor_total: number;
  total_parcelas: number;
  status: string;
  created_at: string;
  credor_nome?: string;
  parcelas_pagas: number;
  prox_vencimento?: string;
  total_pendente: number;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusColor: Record<string, string> = {
  ativo: 'bg-emerald-100 text-emerald-800',
  quitado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-red-100 text-red-800',
};

interface FinanciamentosListaProps {
  onNovo?: () => void;
  onDetalhe?: (id: string) => void;
  onVoltar?: () => void;
}

export default function FinanciamentosListaPage({ onNovo, onDetalhe, onVoltar }: FinanciamentosListaProps = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  /* ── Query principal ── */
  const { data: financiamentos = [], isLoading } = useQuery({
    queryKey: ['financiamentos-lista', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      // 1) financiamentos + credor
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)')
        .eq('cliente_id', clienteId!)
        .order('created_at', { ascending: false });
      if (e1) throw e1;

      // 2) parcelas
      const { data: parcelas, error: e2 } = await supabase
        .from('financiamento_parcelas')
        .select('financiamento_id, status, data_vencimento, valor_principal, valor_juros')
        .eq('cliente_id', clienteId!);
      if (e2) throw e2;

      // Agrupar parcelas por financiamento
      const parcelaMap = new Map<string, typeof parcelas>();
      for (const p of parcelas ?? []) {
        const arr = parcelaMap.get(p.financiamento_id) ?? [];
        arr.push(p);
        parcelaMap.set(p.financiamento_id, arr);
      }

      return (fins ?? []).map((f: any): FinanciamentoRow => {
        const ps = parcelaMap.get(f.id) ?? [];
        const pagas = ps.filter(p => p.status === 'pago').length;
        const pendentes = ps.filter(p => p.status === 'pendente');
        const proxVenc = pendentes
          .map(p => p.data_vencimento)
          .sort()
          .at(0);
        const totalPendente = pendentes.reduce(
          (s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0
        );

        return {
          id: f.id,
          descricao: f.descricao,
          numero_contrato: f.numero_contrato ?? null,
          tipo_financiamento: f.tipo_financiamento,
          credor_id: f.credor_id,
          valor_total: Number(f.valor_total),
          total_parcelas: f.total_parcelas,
          status: f.status,
          created_at: f.created_at,
          credor_nome: f.financeiro_fornecedores?.nome ?? '—',
          parcelas_pagas: pagas,
          prox_vencimento: proxVenc ?? undefined,
          total_pendente: totalPendente,
        };
      });
    },
  });

  /* ── Filtros ── */
  const filtered = useMemo(() => {
    return financiamentos.filter(f => {
      if (filtroStatus !== 'todos' && f.status !== filtroStatus) return false;
      if (filtroTipo !== 'todos' && f.tipo_financiamento !== filtroTipo) return false;
      return true;
    });
  }, [financiamentos, filtroStatus, filtroTipo]);

  /* ── Totalizadores ── */
  const totais = useMemo(() => {
    const ativos = financiamentos.filter(f => f.status === 'ativo');
    return {
      financiado: ativos.reduce((s, f) => s + f.valor_total, 0),
      aPagar: ativos.reduce((s, f) => s + f.total_pendente, 0),
    };
  }, [financiamentos]);

  if (!clienteId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Selecione um cliente para ver os financiamentos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onVoltar && (
            <Button variant="ghost" size="icon" onClick={onVoltar}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-lg font-bold text-foreground">Financiamentos</h1>
        </div>
        <Button size="sm" className="gap-1" onClick={onNovo}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="quitado">Quitado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="pecuaria">Pecuária</SelectItem>
            <SelectItem value="agricultura">Agricultura</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-4">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nenhum financiamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Credor</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead className="text-center">Parcelas</TableHead>
                    <TableHead>Próx. venc.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-[180px] truncate">{f.descricao}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.numero_contrato || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {f.tipo_financiamento === 'pecuaria' ? 'Pecuária' : 'Agricultura'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">{f.credor_nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(f.valor_total)}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {f.parcelas_pagas}/{f.total_parcelas}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {f.prox_vencimento
                          ? format(new Date(f.prox_vencimento + 'T12:00:00'), 'dd/MM/yyyy')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[f.status] ?? ''}`}>
                          {f.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDetalhe?.(f.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totalizadores */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total financiado (ativos)</p>
            <p className="text-base font-bold tabular-nums">{fmt(totais.financiado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total a pagar</p>
            <p className="text-base font-bold tabular-nums">{fmt(totais.aPagar)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
