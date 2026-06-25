/**
 * LotesExcelTab — terceira aba do hub de conciliação ("Lotes Excel").
 * (Renomeada de ReferenciasOperacionaisTab em M1: o nome "Referências
 * Operacionais" passou a ser o conceito maior — a Mesa/Excel/Staging.)
 *
 * Lista linhas de excel_linhas_aux agrupadas por batch_id para a conta
 * + mês selecionados no header da página pai. Permite descartar linha
 * individual e apagar lote inteiro (só pendentes).
 *
 * NÃO faz matching, NÃO cria lançamento, NÃO toca OFX, NÃO filtra por
 * fazenda (texto Excel != fazenda_id oficial).
 *
 * PR2 futuro consumirá referências dentro de ConciliarExtratoDialog.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { useCliente } from '@/contexts/ClienteContext';
import {
  useExcelLinhasAux,
  type ExcelLinhaAux,
} from '@/hooks/useExcelLinhasAux';
import { formatMoeda } from '@/lib/calculos/formatters';
import { ExcelImportDialog } from './ExcelImportDialog';

interface Props {
  contaBancariaId: string | null;
  anoMes: string; // 'YYYY-MM'
}

const STATUS_BADGE: Record<ExcelLinhaAux['status'], { label: string; cls: string }> = {
  pendente:   { label: 'Pendente',   cls: 'bg-muted text-muted-foreground' },
  aplicada:   { label: 'Aplicada',   cls: 'bg-emerald-100 text-emerald-700' },
  descartada: { label: 'Descartada', cls: 'bg-rose-100 text-rose-700' },
};

function fmtData(s: string | null): string {
  if (!s) return '-';
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function LotesExcelTab({ contaBancariaId, anoMes }: Props) {
  const { clienteAtual } = useCliente();
  const { listarPorContaMes, apagarBatch, descartarLinha } = useExcelLinhasAux();

  const [linhas, setLinhas] = useState<ExcelLinhaAux[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);

  // PR2.1 — filtros básicos (status/origem/busca/ordenação) aplicados ANTES
  // do agrupamento por batch (grupos só mostra o que passou nos filtros).
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'aplicada' | 'descartada'>('todos');
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos');
  const [ordenacao, setOrdenacao] = useState<'data_asc' | 'data_desc' | 'valor_desc' | 'valor_asc'>('data_asc');

  const refetch = async (): Promise<void> => {
    if (!contaBancariaId || !clienteAtual?.id) {
      setLinhas([]);
      return;
    }
    setLoading(true);
    const data = await listarPorContaMes(contaBancariaId, anoMes, clienteAtual.id);
    setLinhas(data);
    setLoading(false);
  };

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaBancariaId, anoMes, clienteAtual?.id]);

  const contagens = useMemo(() => {
    let pendente = 0, aplicada = 0, descartada = 0;
    linhas.forEach((l) => {
      if (l.status === 'pendente') pendente++;
      else if (l.status === 'aplicada') aplicada++;
      else descartada++;
    });
    return { pendente, aplicada, descartada };
  }, [linhas]);

  // PR2.1 — origens disponíveis (derivadas) para o filtro de origem.
  const origensDisponiveis = useMemo(() => {
    const set = new Set<string>();
    linhas.forEach((l) => set.add(l.origem));
    return Array.from(set).sort();
  }, [linhas]);

  // PR2.1 — aplica filtros (status/origem/busca) e ordenação ANTES do
  // agrupamento. Contagens (acima) seguem sobre o universo total.
  const linhasFiltradas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    let res = linhas;

    if (filtroStatus !== 'todos') {
      res = res.filter((l) => l.status === filtroStatus);
    }
    if (filtroOrigem !== 'todos') {
      res = res.filter((l) => l.origem === filtroOrigem);
    }
    if (buscaNorm) {
      res = res.filter((l) => {
        const hay = [
          l.fornecedor_texto,
          l.fazenda_texto,
          l.plano_texto,
          l.centro_texto,
          l.produto_texto,
          l.observacao,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(buscaNorm);
      });
    }

    const sorted = [...res];
    switch (ordenacao) {
      case 'data_asc':
        sorted.sort((a, b) => (a.data_referencia ?? '').localeCompare(b.data_referencia ?? ''));
        break;
      case 'data_desc':
        sorted.sort((a, b) => (b.data_referencia ?? '').localeCompare(a.data_referencia ?? ''));
        break;
      case 'valor_desc':
        sorted.sort((a, b) => Math.abs(b.valor ?? 0) - Math.abs(a.valor ?? 0));
        break;
      case 'valor_asc':
        sorted.sort((a, b) => Math.abs(a.valor ?? 0) - Math.abs(b.valor ?? 0));
        break;
    }
    return sorted;
  }, [linhas, busca, filtroStatus, filtroOrigem, ordenacao]);

  // Agrupar por batch_id (já filtrado e ordenado).
  const grupos = useMemo(() => {
    const map = new Map<string, ExcelLinhaAux[]>();
    linhasFiltradas.forEach((l) => {
      const arr = map.get(l.batch_id) ?? [];
      arr.push(l);
      map.set(l.batch_id, arr);
    });
    return Array.from(map.entries());
  }, [linhasFiltradas]);

  if (!contaBancariaId) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        Selecione uma conta bancária no header para ver as referências operacionais.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-muted-foreground">
          {loading
            ? 'Carregando...'
            : (
              <>
                <strong>{contagens.pendente}</strong> pendente(s)
                {' · '}
                <strong>{contagens.aplicada}</strong> aplicada(s)
                {' · '}
                <strong>{contagens.descartada}</strong> descartada(s)
              </>
            )}
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          Importar Excel
        </Button>
      </div>

      {/* PR2.1 — barra de filtros (busca + status + ordenação + origem opcional) */}
      <div className="flex items-center gap-2 flex-wrap pb-1 border-b">
        <Input
          type="text"
          placeholder="Buscar fornecedor, fazenda, plano, observação..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-7 text-xs flex-1 min-w-[200px]"
        />
        <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as typeof filtroStatus)}>
          <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aplicada">Aplicadas</SelectItem>
            <SelectItem value="descartada">Descartadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as typeof ordenacao)}>
          <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="data_asc">Data ↑</SelectItem>
            <SelectItem value="data_desc">Data ↓</SelectItem>
            <SelectItem value="valor_desc">Valor (maior)</SelectItem>
            <SelectItem value="valor_asc">Valor (menor)</SelectItem>
          </SelectContent>
        </Select>
        {origensDisponiveis.length > 1 && (
          <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
            <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Toda origem</SelectItem>
              {origensDisponiveis.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!loading && grupos.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-12 border rounded">
          Nenhuma referência operacional importada para esta conta/mês.
          <br />
          Clique em "Importar Excel" para começar.
        </div>
      )}

      {grupos.map(([batchId, linhasDoBatch]) => {
        const primeira = linhasDoBatch[0];
        const importadoEm = primeira?.created_at ?? null;
        const temPendente = linhasDoBatch.some((l) => l.status === 'pendente');
        const apagando = acaoEmAndamento === `batch:${batchId}`;
        return (
          <div key={batchId} className="border rounded">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b">
              <div className="text-[11px]">
                <strong>Lote {shortId(batchId)}</strong>
                {' · '}
                <span className="uppercase text-[10px] text-muted-foreground">
                  {primeira?.origem ?? 'excel'}
                </span>
                {' · '}
                {linhasDoBatch.length} linha(s)
                {importadoEm && (
                  <>
                    {' · '}
                    <span className="text-muted-foreground">
                      importado {fmtData(importadoEm.slice(0, 10))}
                    </span>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2 text-rose-700"
                disabled={!temPendente || apagando}
                onClick={async () => {
                  if (!clienteAtual?.id) return;
                  if (!window.confirm(`Apagar lote ${shortId(batchId)}? Apenas linhas pendentes serão removidas.`)) return;
                  setAcaoEmAndamento(`batch:${batchId}`);
                  try {
                    await apagarBatch(batchId, clienteAtual.id);
                    await refetch();
                  } finally {
                    setAcaoEmAndamento(null);
                  }
                }}
              >
                {apagando ? 'Apagando…' : 'Apagar lote'}
              </Button>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Data</TableHead>
                    <TableHead className="text-[10px]">Fornecedor</TableHead>
                    <TableHead className="text-[10px]">Fazenda</TableHead>
                    <TableHead className="text-[10px]">Plano</TableHead>
                    <TableHead className="text-[10px] text-right">Valor</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px] w-[90px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasDoBatch.map((l) => {
                    const badge = STATUS_BADGE[l.status];
                    const isDescartada = l.status === 'descartada';
                    const descartando = acaoEmAndamento === `linha:${l.id}`;
                    return (
                      <TableRow
                        key={l.id}
                        className={isDescartada ? 'opacity-40' : ''}
                      >
                        <TableCell className="text-[11px] font-mono">{fmtData(l.data_referencia)}</TableCell>
                        <TableCell className="text-[11px] max-w-[200px] truncate" title={l.fornecedor_texto ?? ''}>
                          {l.fornecedor_texto || '-'}
                        </TableCell>
                        <TableCell className="text-[11px] truncate" title={l.fazenda_texto ?? ''}>
                          {l.fazenda_texto || '-'}
                        </TableCell>
                        <TableCell className="text-[11px] truncate" title={l.plano_texto ?? ''}>
                          {l.plano_texto || '-'}
                        </TableCell>
                        <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${(l.valor ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {l.valor != null ? formatMoeda(l.valor) : '-'}
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          {l.status === 'pendente' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] px-2 text-muted-foreground"
                              disabled={descartando}
                              onClick={async () => {
                                setAcaoEmAndamento(`linha:${l.id}`);
                                try {
                                  await descartarLinha(l.id);
                                  await refetch();
                                } finally {
                                  setAcaoEmAndamento(null);
                                }
                              }}
                            >
                              {descartando ? '...' : 'Descartar'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}

      <ExcelImportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onImportado={() => { void refetch(); }}
        defaultContaBancariaId={contaBancariaId ?? undefined}
      />
    </div>
  );
}
