import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { useOperacaoComercial } from '@/hooks/useOperacaoComercial';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { MoreVertical, Search, Eye, Filter, Ban, Undo2 } from 'lucide-react';

// Central de Operações Comerciais — PR-OC-CENTRAL-UX-01 (UX/operacional; sem backend novo).
//   Lê em LOTE (ZERO N+1): operações + 3 views soberanas + nomes, filtradas por cliente, mapeadas por
//   operacao_id. Eixos Financeiro/Recebimento/Liquidação vêm das views existentes (nunca somados no React);
//   quando a fonte não classifica um eixo com segurança → "—". Ações de escrita usam SÓ contratos vivos:
//   Abrir (CompraModalShell via onAbrirOperacao), Cancelar (oc_cancelar via useOperacaoComercial),
//   Reabrir recebimento (oc_reabrir_entrega — sem hook arg-based; chamada direta pelo mesmo idioma).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;   // idioma existente do projeto (tabelas/views zoo_* ainda não tipadas)

interface OpRow {
  id: string; versao: number;
  tipo_operacao: string; data_operacao: string;
  contraparte_id: string | null; fazenda_id: string | null;
  status_comercial: string; rascunho: boolean; entrega_encerrada: boolean;
  qtd_negociada: number | null; peso_total_negociado_kg: number | null;
  valor_acordado: number | null; valor_total: number | null;
}
interface FinRow {
  operacao_id: string; modo: string; n_compromissos: number;
  obrigacao_total: number; total_programado: number; total_materializado: number; total_liquidado: number;
  tem_compromissos: boolean; tem_partes_legadas: boolean;
}
interface LiqRow { operacao_id: string; estado_liquidacao: string | null; }
interface RecLoteRow { operacao_id: string; estado_recebimento: string; }

const TIPO_LABEL: Record<string, string> = { compra: 'Compra', venda: 'Venda em Pé', abate: 'Abate' };
const PAGE_SIZE = 25;
const fmtData = (iso: string): string => (iso ? iso.split('-').reverse().join('/') : '—');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const TH = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap';
const TD = 'px-1.5 py-1 text-[10px] align-middle';

// Rollup soberano do recebimento a partir do estado por lote (nunca soma quantidades). entrega_encerrada
//   tem precedência (estado terminal). Sem lotes e sem encerramento → null ("—").
function recStatus(estados: string[] | undefined, entregaEncerrada: boolean): string | null {
  if (entregaEncerrada) return 'Encerrado';
  if (!estados || estados.length === 0) return null;
  if (estados.some(e => e === 'excedente')) return 'Diferença';
  if (estados.every(e => e === 'completo')) return 'Concluído';
  if (estados.every(e => e === 'nao_iniciado')) return 'Não iniciado';
  return 'Parcial';
}
const REC_TONE: Record<string, string> = {
  'Não iniciado': 'bg-slate-100 text-slate-600',
  Parcial: 'bg-amber-100 text-amber-700',
  Concluído: 'bg-emerald-100 text-emerald-700',
  Diferença: 'bg-rose-100 text-rose-700',
  Encerrado: 'bg-blue-100 text-blue-700',
};

// Financeiro: figura soberana "mais avançada" da View 3 (nunca length de array). Sem modelo → null.
function finResumo(f: FinRow | undefined): { valor: number; rotulo: string; modo: string } | null {
  if (!f || (!f.tem_compromissos && !f.tem_partes_legadas)) return null;
  if (f.total_liquidado > 0) return { valor: f.total_liquidado, rotulo: 'liquidado', modo: f.modo };
  if (f.total_materializado > 0) return { valor: f.total_materializado, rotulo: 'materializado', modo: f.modo };
  if (f.total_programado > 0) return { valor: f.total_programado, rotulo: 'programado', modo: f.modo };
  if (f.obrigacao_total > 0) return { valor: f.obrigacao_total, rotulo: 'obrigação', modo: f.modo };
  return { valor: 0, rotulo: '', modo: f.modo };
}

const LIQ_LABEL: Record<string, string> = {
  quitada: 'Liquidada', parcial: 'Parcial', excedente: 'Excedente',
  nao_iniciada: '—', base_indefinida: 'Base indefinida', sem_base: 'Base indefinida', em_aberto: 'Em aberto',
};
function liqLabel(estado: string | null | undefined): string {
  if (!estado) return '—';
  return LIQ_LABEL[estado] ?? (estado.charAt(0).toUpperCase() + estado.slice(1).replace(/_/g, ' '));
}

function BadgeComercial({ status, rascunho }: { status: string; rascunho: boolean }) {
  const cor =
    status === 'fechada' ? 'bg-green-100 text-green-700'
    : status === 'cancelada' ? 'bg-muted text-muted-foreground'
    : 'bg-blue-100 text-blue-700';
  const label = status === 'fechada' ? 'Fechada' : status === 'cancelada' ? 'Cancelada' : 'Programada';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`rounded px-1.5 py-0.5 text-[9px] ${cor}`}>{label}</span>
      {rascunho && <span className="rounded bg-amber-100 text-amber-700 px-1 py-0.5 text-[9px]">Rascunho</span>}
    </span>
  );
}

interface CentralOperacoesComerciaisProps {
  /** FIN-MODAL-FECHO-01 item 2 — ao receber ?oc_id=, a Central localiza a operação do tenant e a abre. */
  initialOcId?: string;
  /** PR-OC-NAV-01 — abertura SPA soberana (sem reload) via parent (V2Index → Lançamentos/CompraModalShell). */
  onAbrirOperacao?: (ocId: string) => void;
}

export function CentralOperacoesComerciais({ initialOcId, onAbrirOperacao }: CentralOperacoesComerciaisProps = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';
  const rpc = useOperacaoComercial();

  const [rows, setRows] = useState<OpRow[]>([]);
  const [fazendas, setFazendas] = useState<Record<string, string>>({});
  const [contrapartes, setContrapartes] = useState<Record<string, string>>({});
  const [finMap, setFinMap] = useState<Record<string, FinRow>>({});
  const [liqMap, setLiqMap] = useState<Record<string, LiqRow>>({});
  const [recMap, setRecMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState('__all__');
  const [fComercial, setFComercial] = useState('__all__');
  const [fFazenda, setFFazenda] = useState('__all__');
  const [mostrarRascunhos, setMostrarRascunhos] = useState(false);
  const [page, setPage] = useState(1);

  // Ação de escrita (menu): cancelar/reabrir com motivo obrigatório e saving anti-duplo-clique.
  const [acao, setAcao] = useState<{ tipo: 'cancelar' | 'reabrir'; op: OpRow } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // ZERO N+1, BOUNDED pelo conjunto carregado: FASE 1 = lista de operações; FASE 2 = auxiliares em lote,
  //   filtradas pelos IDs da lista (nunca por cliente inteiro; nunca .in([]); nunca consulta no render/map).
  //   Requests FIXOS: 1 (lista) + até 5 (auxiliares) — independentes do nº de linhas.
  const carregar = useCallback(async () => {
    if (!clienteId) { setRows([]); setFazendas({}); setContrapartes({}); setFinMap({}); setLiqMap({}); setRecMap({}); return; }
    setLoading(true);
    try {
      // FASE 1 — lista de operações (bounded por cliente + limit).
      const ops = await sb.from('zoo_operacoes_comerciais')
        .select('id, versao, data_operacao, tipo_operacao, contraparte_id, fazenda_id, status_comercial, rascunho, entrega_encerrada, qtd_negociada, peso_total_negociado_kg, valor_acordado, valor_total')
        .eq('cliente_id', clienteId).order('data_operacao', { ascending: false }).limit(1000);
      if (ops?.error) throw new Error(ops.error.message);
      const operacoes = (ops.data as OpRow[] | null) ?? [];
      setRows(operacoes);

      const operacaoIds = operacoes.map(op => op.id);
      if (operacaoIds.length === 0) {
        setFazendas({}); setContrapartes({}); setFinMap({}); setLiqMap({}); setRecMap({});
        return;   // sem operações → mapas vazios, sem chamar as views com .in([])
      }
      const fazendaIds = Array.from(new Set(operacoes.map(o => o.fazenda_id).filter((v): v is string => !!v)));
      const contraparteIds = Array.from(new Set(operacoes.map(o => o.contraparte_id).filter((v): v is string => !!v)));

      // FASE 2 — auxiliares em lote, filtradas pelo CONJUNTO FECHADO de IDs da lista carregada.
      const [faz, forn, fin, liq, rec] = await Promise.all([
        fazendaIds.length ? sb.from('fazendas').select('id, nome').in('id', fazendaIds) : Promise.resolve({ data: [] }),
        contraparteIds.length ? sb.from('financeiro_fornecedores').select('id, nome').in('id', contraparteIds) : Promise.resolve({ data: [] }),
        sb.from('vw_oc_operacao_compromissos_resumo')
          .select('operacao_id, modo, n_compromissos, obrigacao_total, total_programado, total_materializado, total_liquidado, tem_compromissos, tem_partes_legadas')
          .eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
        sb.from('vw_oc_operacao_liquidacao').select('operacao_id, estado_liquidacao').eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
        sb.from('vw_oc_lotes_recebimento').select('operacao_id, estado_recebimento').eq('cliente_id', clienteId).in('operacao_id', operacaoIds),
      ]);

      const fmap: Record<string, string> = {};
      ((faz?.data as { id: string; nome: string }[] | null) ?? []).forEach(f => { fmap[f.id] = f.nome; });
      setFazendas(fmap);
      const cmap: Record<string, string> = {};
      ((forn?.data as { id: string; nome: string }[] | null) ?? []).forEach(c => { cmap[c.id] = c.nome; });
      setContrapartes(cmap);
      const finmap: Record<string, FinRow> = {};
      ((fin?.data as FinRow[] | null) ?? []).forEach(x => { finmap[x.operacao_id] = x; });
      setFinMap(finmap);
      const liqmap: Record<string, LiqRow> = {};
      ((liq?.data as LiqRow[] | null) ?? []).forEach(x => { liqmap[x.operacao_id] = x; });
      setLiqMap(liqmap);
      const recmap: Record<string, string[]> = {};
      ((rec?.data as RecLoteRow[] | null) ?? []).forEach(x => {
        if (!recmap[x.operacao_id]) recmap[x.operacao_id] = [];
        recmap[x.operacao_id].push(x.estado_recebimento);
      });
      setRecMap(recmap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar operações.');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const fazendaOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.fazenda_id).filter((v): v is string => !!v))),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter(r => {
      if (!mostrarRascunhos && r.rascunho) return false;
      // Canceladas ocultas da visão ativa padrão, salvo quando o filtro Situação pede 'cancelada'.
      if (r.status_comercial === 'cancelada' && fComercial !== 'cancelada') return false;
      if (fTipo !== '__all__' && r.tipo_operacao !== fTipo) return false;
      if (fComercial !== '__all__' && r.status_comercial !== fComercial) return false;
      if (fFazenda !== '__all__' && r.fazenda_id !== fFazenda) return false;
      if (q) {
        const nome = (r.contraparte_id ? contrapartes[r.contraparte_id] : '') ?? '';
        if (!nome.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, fTipo, fComercial, fFazenda, mostrarRascunhos, contrapartes]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtradas.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [busca, fTipo, fComercial, fFazenda, mostrarRascunhos]);

  const nomeContraparte = (r: OpRow) => (r.contraparte_id ? contrapartes[r.contraparte_id] ?? '—' : '—');
  const nomeFazenda = (r: OpRow) => (r.fazenda_id ? fazendas[r.fazenda_id] ?? '—' : '—');

  // Abertura soberana por tipo (Compra → SPA via parent; venda/abate ainda indisponíveis na Central).
  const abrirOperacaoPorTipo = (r: OpRow) => {
    if (r.tipo_operacao === 'compra') onAbrirOperacao?.(r.id);
  };

  const ocIdHandledRef = useRef(false);
  useEffect(() => {
    if (!initialOcId || loading || ocIdHandledRef.current) return;
    const r = rows.find(x => x.id === initialOcId);
    if (r) { ocIdHandledRef.current = true; abrirOperacaoPorTipo(r); }
  }, [initialOcId, loading, rows]);

  // Ações de escrita — SÓ contratos vivos; versão explícita; motivo obrigatório; recarrega a lista (mantém filtros).
  const confirmarAcao = async () => {
    if (!acao || saving) return;
    const m = motivo.trim();
    if (m === '') { toast.error('Informe o motivo.'); return; }
    setSaving(true);
    try {
      if (acao.tipo === 'cancelar') {
        await rpc.cancelar(acao.op.id, clienteId, acao.op.versao, m);   // oc_cancelar (hook existente)
        toast.success('Operação cancelada.');
      } else {
        const { data, error } = await sb.rpc('oc_reabrir_entrega', {
          p_operacao_id: acao.op.id, p_cliente_id: clienteId, p_versao_esperada: acao.op.versao, p_motivo: m,
        });
        if (error) throw new Error(error.message);
        void data;
        toast.success('Recebimento reaberto.');
      }
      setAcao(null); setMotivo('');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 w-full">
      {/* Cabeçalho compacto (sem banner, sem botão do fluxo legado) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold leading-none">Operações Comerciais</h2>
        <span className="text-[10px] text-muted-foreground">{filtradas.length} operação(ões)</span>
      </div>

      {/* Filtros em uma linha */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Contraparte…" className="h-8 w-44 pl-7 text-[11px]" />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="h-8 w-32 text-[11px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os tipos</SelectItem>
            <SelectItem value="compra">Compra</SelectItem>
            <SelectItem value="venda">Venda em Pé</SelectItem>
            <SelectItem value="abate">Abate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fComercial} onValueChange={setFComercial}>
          <SelectTrigger className="h-8 w-36 text-[11px]"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toda situação</SelectItem>
            <SelectItem value="programada">Programada</SelectItem>
            <SelectItem value="fechada">Fechada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fFazenda} onValueChange={setFFazenda}>
          <SelectTrigger className="h-8 w-40 text-[11px]"><SelectValue placeholder="Fazenda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as fazendas</SelectItem>
            {fazendaOptions.map(id => <SelectItem key={id} value={id}>{fazendas[id] ?? id}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={mostrarRascunhos ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1 text-[11px]"
          onClick={() => setMostrarRascunhos(v => !v)}>
          <Filter className="h-3 w-3" /> Rascunhos
        </Button>
      </div>

      {/* Tabela densa, largura total */}
      <div className="rounded-md border overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>OC</TableHead>
              <TableHead className={TH}>Data</TableHead>
              <TableHead className={TH}>Tipo</TableHead>
              <TableHead className={TH}>Contraparte</TableHead>
              <TableHead className={TH}>Fazenda</TableHead>
              <TableHead className={`${TH} text-right`}>Animais</TableHead>
              <TableHead className={`${TH} text-right`}>Valor</TableHead>
              <TableHead className={TH}>Comercial</TableHead>
              <TableHead className={TH}>Recebimento</TableHead>
              <TableHead className={TH}>Financeiro</TableHead>
              <TableHead className={TH}>Liquidação</TableHead>
              <TableHead className={`${TH} text-right`}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`}><TableCell colSpan={12} className={TD}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
            ))}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="py-6 text-center text-[11px] text-muted-foreground">
                Nenhuma operação comercial.
              </TableCell></TableRow>
            )}
            {!loading && pageRows.map(r => {
              const rec = recStatus(recMap[r.id], r.entrega_encerrada);
              const fin = finResumo(finMap[r.id]);
              const valorOp = r.valor_acordado ?? r.valor_total ?? 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className={`${TD} font-mono whitespace-nowrap`} title={r.id}>#{r.id.slice(0, 8)}</TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{fmtData(r.data_operacao)}</TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{TIPO_LABEL[r.tipo_operacao] ?? r.tipo_operacao}</TableCell>
                  <TableCell className={`${TD} max-w-[150px] truncate`} title={nomeContraparte(r)}>{nomeContraparte(r)}</TableCell>
                  <TableCell className={`${TD} max-w-[130px] truncate`} title={nomeFazenda(r)}>{nomeFazenda(r)}</TableCell>
                  <TableCell className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                    <div className="leading-tight">
                      <div>{r.qtd_negociada != null ? `${r.qtd_negociada} cab` : '—'}</div>
                      {r.peso_total_negociado_kg != null && r.peso_total_negociado_kg > 0 && (
                        <div className="text-[9px] text-muted-foreground">{kg(r.peso_total_negociado_kg)} kg</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={`${TD} text-right whitespace-nowrap tabular-nums font-medium`}>{valorOp > 0 ? brl(valorOp) : '—'}</TableCell>
                  <TableCell className={TD}><BadgeComercial status={r.status_comercial} rascunho={r.rascunho} /></TableCell>
                  <TableCell className={TD}>
                    {rec
                      ? <span className={`rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap ${REC_TONE[rec] ?? 'bg-slate-100 text-slate-600'}`}>{rec}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>
                    {fin && fin.valor > 0
                      ? (
                        <div className="leading-tight">
                          <div className="tabular-nums font-medium">{brl(fin.valor)}</div>
                          <div className="text-[9px] text-muted-foreground">{fin.rotulo} · {fin.modo}</div>
                        </div>
                      )
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`${TD} whitespace-nowrap`}>{liqLabel(liqMap[r.id]?.estado_liquidacao)}</TableCell>
                  <TableCell className={`${TD} text-right`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.tipo_operacao === 'compra'
                          ? <DropdownMenuItem onSelect={() => abrirOperacaoPorTipo(r)}><Eye className="h-3.5 w-3.5 mr-2" /> Abrir operação</DropdownMenuItem>
                          : <DropdownMenuItem disabled><Eye className="h-3.5 w-3.5 mr-2" /> Abrir (só Compra)</DropdownMenuItem>}
                        {r.entrega_encerrada && (
                          <DropdownMenuItem onSelect={() => { setMotivo(''); setAcao({ tipo: 'reabrir', op: r }); }}>
                            <Undo2 className="h-3.5 w-3.5 mr-2" /> Reabrir recebimento
                          </DropdownMenuItem>
                        )}
                        {r.status_comercial !== 'cancelada' && (
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onSelect={() => { setMotivo(''); setAcao({ tipo: 'cancelar', op: r }); }}>
                            <Ban className="h-3.5 w-3.5 mr-2" /> Cancelar operação
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filtradas.length} operação(ões)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
          <span>{pageSafe} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={pageSafe >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próximo ›</Button>
        </div>
      </div>

      {/* Dialog de ação (Cancelar / Reabrir recebimento) — motivo obrigatório, saving anti-duplo-clique */}
      <Dialog open={acao !== null} onOpenChange={o => { if (!o) { setAcao(null); setMotivo(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">{acao?.tipo === 'cancelar' ? 'Cancelar operação' : 'Reabrir recebimento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-[12px]">
            <div className="text-[11px] text-muted-foreground">
              {acao?.tipo === 'cancelar'
                ? 'A operação será cancelada (contrato oc_cancelar), sujeita às regras do backend.'
                : 'A entrega será reaberta (contrato oc_reabrir_entrega). Não altera a negociação.'}
              {acao && <> Operação <span className="font-mono">#{acao.op.id.slice(0, 8)}</span>.</>}
            </div>
            <div>
              <div className="text-[11px] font-medium">Motivo *</div>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} className="mt-0.5 text-[12px]" placeholder="Justifique a ação" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setAcao(null); setMotivo(''); }}>Voltar</Button>
            <Button size="sm" variant={acao?.tipo === 'cancelar' ? 'destructive' : 'default'}
              disabled={saving || motivo.trim() === ''} onClick={confirmarAcao}>
              {acao?.tipo === 'cancelar' ? 'Cancelar operação' : 'Reabrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
