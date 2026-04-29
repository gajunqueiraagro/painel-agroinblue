import { ArrowLeft, Plus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { backfillParcelasPendentes } from '@/lib/financiamentos/backfillParcelas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';

/* ── Types ── */
interface FinanciamentoRow {
  id: string;
  descricao: string;
  numero_contrato: string | null;
  data_contrato: string | null;
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

  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroDescricao, setFiltroDescricao] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroCredor, setFiltroCredor] = useState('todos');
  const [filtroDataContratoDe, setFiltroDataContratoDe] = useState('');
  const [filtroDataContratoAte, setFiltroDataContratoAte] = useState('');
  const [filtroVencDe, setFiltroVencDe] = useState('');
  const [filtroVencAte, setFiltroVencAte] = useState('');

  // dd/mm/aaaa → yyyy-mm-dd; retorna '' se incompleto/inválido
  const brToISO = (v: string): string => {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    const [, d, mo, y] = m;
    const dt = new Date(`${y}-${mo}-${d}`);
    if (isNaN(dt.getTime())) return '';
    return `${y}-${mo}-${d}`;
  };
  // Máscara automática: insere '/' ao digitar (dd/mm/aaaa)
  const maskDate = (v: string): string => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
    return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
  };

  // Backfill de mirrors de parcelas: roda uma vez por cliente via flag em localStorage.
  useEffect(() => {
    if (!clienteId) return;
    const flagKey = `backfill_parcelas_done:${clienteId}`;
    if (localStorage.getItem(flagKey) === '1') return;
    (async () => {
      const r = await backfillParcelasPendentes(clienteId);
      localStorage.setItem(flagKey, '1');
      if (r.criadas > 0) console.info(`[FinanciamentosLista] backfill: ${r.criadas} parcelas espelhadas`);
    })();
  }, [clienteId]);

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
          data_contrato: f.data_contrato ?? null,
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

  /* ── Credores únicos para o select ── */
  const credores = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of financiamentos) {
      if (f.credor_nome && f.credor_nome !== '—' && !seen.has(f.credor_nome)) {
        seen.add(f.credor_nome);
        result.push(f.credor_nome);
      }
    }
    return result.sort();
  }, [financiamentos]);

  /* ── Filtros (client-side, sobre dados já carregados) ── */
  const filtered = useMemo(() => {
    const descQ = filtroDescricao.trim().toLowerCase();
    const contQ = filtroContrato.trim().toLowerCase();
    return financiamentos.filter(f => {
      if (filtroStatus !== 'todos' && f.status !== filtroStatus) return false;
      if (filtroTipo !== 'todos' && f.tipo_financiamento !== filtroTipo) return false;
      if (descQ && !f.descricao.toLowerCase().includes(descQ)) return false;
      if (contQ && !(f.numero_contrato ?? '').toLowerCase().includes(contQ)) return false;
      if (filtroCredor !== 'todos' && f.credor_nome !== filtroCredor) return false;
      const isoContratoDe = brToISO(filtroDataContratoDe);
      const isoContratoAte = brToISO(filtroDataContratoAte);
      const isoVencDe      = brToISO(filtroVencDe);
      const isoVencAte     = brToISO(filtroVencAte);
      if (isoContratoDe && (f.data_contrato ?? '') < isoContratoDe) return false;
      if (isoContratoAte && (f.data_contrato ?? '') > isoContratoAte) return false;
      if (isoVencDe && (f.prox_vencimento ?? '') < isoVencDe) return false;
      if (isoVencAte && (f.prox_vencimento ?? '') > isoVencAte) return false;
      return true;
    });
  }, [financiamentos, filtroStatus, filtroTipo, filtroDescricao, filtroContrato, filtroCredor,
      filtroDataContratoDe, filtroDataContratoAte, filtroVencDe, filtroVencAte]);

  /* ── Totalizadores (baseado na lista filtrada) ── */
  const totais = useMemo(() => ({
    financiado: filtered.reduce((s, f) => s + f.valor_total, 0),
    aPagar: filtered.reduce((s, f) => s + f.total_pendente, 0),
  }), [filtered]);

  const fmtCompact = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return fmt(v);
  };

  const hasExtraFilters = !!(filtroDescricao || filtroContrato || filtroCredor !== 'todos' ||
    filtroDataContratoDe || filtroDataContratoAte || filtroVencDe || filtroVencAte);

  const clearExtraFilters = () => {
    setFiltroDescricao('');
    setFiltroContrato('');
    setFiltroCredor('todos');
    setFiltroDataContratoDe('');
    setFiltroDataContratoAte('');
    setFiltroVencDe('');
    setFiltroVencAte('');
  };

  if (!clienteId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Selecione um cliente para ver os financiamentos.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col bg-background" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Cabeçalho fixo: título + filtros + totalizadores inline */}
      <div className="shrink-0 bg-background border-b shadow-sm px-4 pt-4 pb-2 space-y-2">
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

        <div className="flex items-center gap-3 flex-wrap">
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

          <div className="flex-1" />

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground uppercase text-[10px]">Total financiado:</span>
              <span className="font-bold tabular-nums text-foreground">{fmtCompact(totais.financiado)}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground uppercase text-[10px]">A pagar:</span>
              <span className="font-bold tabular-nums text-foreground">{fmtCompact(totais.aPagar)}</span>
            </div>
          </div>
        </div>

        {/* Filtros linha 1: texto + credor | linha 2: datas em grid 2 colunas */}
        <div className="space-y-2">
          {/* Linha 1 */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Buscar descrição..."
              value={filtroDescricao}
              onChange={e => setFiltroDescricao(e.target.value)}
              className="h-8 text-xs w-44"
            />
            <Input
              placeholder="Nº contrato..."
              value={filtroContrato}
              onChange={e => setFiltroContrato(e.target.value)}
              className="h-8 text-xs w-36"
            />
            <Select value={filtroCredor} onValueChange={setFiltroCredor}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Credor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos credores</SelectItem>
                {credores.map(cr => <SelectItem key={cr} value={cr}>{cr}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasExtraFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearExtraFilters}>
                Limpar
              </Button>
            )}
          </div>
          {/* Linha 2: grid 2×2 para datas */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-fit">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Contrato de:</span>
              <input
                type="text"
                value={filtroDataContratoDe}
                onChange={e => setFiltroDataContratoDe(maskDate(e.target.value))}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                className="h-8 text-xs border rounded-md px-2 bg-background w-28 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Contrato até:</span>
              <input
                type="text"
                value={filtroDataContratoAte}
                onChange={e => setFiltroDataContratoAte(maskDate(e.target.value))}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                className="h-8 text-xs border rounded-md px-2 bg-background w-28 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Venc. de:</span>
              <input
                type="text"
                value={filtroVencDe}
                onChange={e => setFiltroVencDe(maskDate(e.target.value))}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                className="h-8 text-xs border rounded-md px-2 bg-background w-28 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Venc. até:</span>
              <input
                type="text"
                value={filtroVencAte}
                onChange={e => setFiltroVencAte(maskDate(e.target.value))}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                className="h-8 text-xs border rounded-md px-2 bg-background w-28 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Área de rolagem com tabela — thead sticky DENTRO deste container */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum financiamento encontrado.</p>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-background">
                <TableHead className="bg-background">Descrição</TableHead>
                <TableHead className="bg-background">Contrato</TableHead>
                <TableHead className="bg-background">Data Contrato</TableHead>
                <TableHead className="bg-background">Tipo</TableHead>
                <TableHead className="bg-background">Credor</TableHead>
                <TableHead className="bg-background text-right">Valor total</TableHead>
                <TableHead className="bg-background text-center">Parcelas</TableHead>
                <TableHead className="bg-background">Próx. venc.</TableHead>
                <TableHead className="bg-background">Status</TableHead>
                <TableHead className="bg-background" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} className="text-xs">
                  <TableCell className="max-w-[180px] truncate py-1">{f.descricao}</TableCell>
                  <TableCell className="text-xs text-muted-foreground py-1">{f.numero_contrato || '—'}</TableCell>
                  <TableCell className="tabular-nums py-1">
                    {f.data_contrato
                      ? format(new Date(f.data_contrato + 'T12:00:00'), 'dd/MM/yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium text-white ${f.tipo_financiamento === 'pecuaria' ? 'bg-green-700' : 'bg-blue-600'}`}>
                      {f.tipo_financiamento === 'pecuaria' ? 'Pecuária' : 'Agricultura'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate py-1">{f.credor_nome}</TableCell>
                  <TableCell className="text-right tabular-nums py-1">{fmt(f.valor_total)}</TableCell>
                  <TableCell className="text-center tabular-nums py-1">
                    {f.parcelas_pagas}/{f.total_parcelas}
                  </TableCell>
                  <TableCell className="tabular-nums py-1">
                    {f.prox_vencimento
                      ? format(new Date(f.prox_vencimento + 'T12:00:00'), 'dd/MM/yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-semibold ${statusColor[f.status] ?? ''}`}>
                      {f.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onDetalhe?.(f.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
