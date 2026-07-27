import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { MoreVertical, Search, Eye, Filter, Sparkles, Info } from 'lucide-react';
import { ModalOperacaoComercial } from '@/components/operacao-comercial/modal/ModalOperacaoComercial';

// Central de Operações Comerciais — SOMENTE LEITURA (PR-OC-UX-02/02A).
//   Lê direto zoo_operacoes_comerciais + nomes (fazendas/fornecedores) para exibição.
//   NÃO deriva os eixos Animais/Liquidação (sem lógica dos três eixos, sem RPC nova):
//   esses badges são placeholders até o PR da camada de dados (oc_derivar_status).
//   "Abrir" e "Nova operação" usam o MESMO modal existente (fluxo atual) — sem tela
//   intermediária. Demais ações do menu são placeholders desabilitados.

interface OpRow {
  id: string;
  tipo_operacao: string;
  data_operacao: string;
  contraparte_id: string | null;
  fazenda_id: string | null;
  status_comercial: string;
  rascunho: boolean;
}

const TIPO_LABEL: Record<string, string> = { compra: 'Compra', venda: 'Venda em Pé', abate: 'Abate' };
const PAGE_SIZE = 25;
const fmtData = (iso: string): string => (iso ? iso.split('-').reverse().join('/') : '—');

function BadgeComercial({ status, rascunho }: { status: string; rascunho: boolean }) {
  const cor =
    status === 'fechada' ? 'bg-green-100 text-green-700'
    : status === 'cancelada' ? 'bg-muted text-muted-foreground'
    : 'bg-blue-100 text-blue-700';
  const label = status === 'fechada' ? 'Fechada' : status === 'cancelada' ? 'Cancelada' : 'Programada';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs ${cor}`}>{label}</span>
      {rascunho && <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px]">Rascunho</span>}
    </span>
  );
}

function BadgeDerivadoPlaceholder({ dica }: { dica: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span className="text-muted-foreground text-xs cursor-help">—</span></TooltipTrigger>
        <TooltipContent>{dica}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CentralOperacoesComerciaisProps {
  /** FIN-MODAL-FECHO-01 item 2 — contrato genérico: ao receber um oc_id (via ?oc_id=),
   *  a Central localiza a operação (do próprio tenant) e a abre pela rotina soberana por tipo. */
  initialOcId?: string;
}

export function CentralOperacoesComerciais({ initialOcId }: CentralOperacoesComerciaisProps = {}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';

  const [rows, setRows] = useState<OpRow[]>([]);
  const [fazendas, setFazendas] = useState<Record<string, string>>({});
  const [contrapartes, setContrapartes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState('__all__');
  const [fComercial, setFComercial] = useState('__all__');
  const [fFazenda, setFFazenda] = useState('__all__');
  const [mostrarRascunhos, setMostrarRascunhos] = useState(false);
  const [page, setPage] = useState(1);

  // Mesmo modal existente para "Nova operação" e "Abrir" (sem tela intermediária).
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!clienteId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      (supabase as any).from('zoo_operacoes_comerciais')
        .select('id, tipo_operacao, data_operacao, contraparte_id, fazenda_id, status_comercial, rascunho')
        .eq('cliente_id', clienteId).order('data_operacao', { ascending: false }).limit(1000),
      (supabase as any).from('fazendas').select('id, nome').eq('cliente_id', clienteId),
      (supabase as any).from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId),
    ]).then(([ops, faz, forn]: { data: unknown[] | null }[]) => {
      if (cancelled) return;
      setLoading(false);
      setRows((ops.data as OpRow[] | null) ?? []);
      const fmap: Record<string, string> = {};
      ((faz.data as { id: string; nome: string }[] | null) ?? []).forEach(f => { fmap[f.id] = f.nome; });
      setFazendas(fmap);
      const cmap: Record<string, string> = {};
      ((forn.data as { id: string; nome: string }[] | null) ?? []).forEach(c => { cmap[c.id] = c.nome; });
      setContrapartes(cmap);
    });
    return () => { cancelled = true; };
  }, [clienteId]);

  const fazendaOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.fazenda_id).filter((v): v is string => !!v))),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter(r => {
      if (!mostrarRascunhos && r.rascunho) return false;
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
  const abrir = () => setModalOpen(true);

  // FIN-MODAL-FECHO-01 item 2 — rotina soberana de abertura por tipo (reutilizada pelo menu e pelo ?oc_id).
  //   Compra: reabre no fluxo existente (?oc_compra=1&oc_id). Venda/abate: abertura ainda indisponível
  //   na Central → permanece estável (sem navegação); a operação continua visível na lista.
  const abrirOperacaoPorTipo = (r: OpRow) => {
    if (r.tipo_operacao === 'compra') {
      try { sessionStorage.setItem('v2:autoSection', 'lancamentos-zoot'); } catch { /* sessionStorage indisponível */ }
      window.location.assign(`/v2?oc_compra=1&oc_id=${encodeURIComponent(r.id)}`);
    }
  };

  // Contrato genérico ?oc_id=<id>: age só após as linhas do tenant carregarem. Operação inexistente
  //   ou inacessível ao tenant (fora de `rows`, que já filtra por cliente_id + RLS) → Central estável.
  const ocIdHandledRef = useRef(false);
  useEffect(() => {
    if (!initialOcId || loading || ocIdHandledRef.current) return;
    const r = rows.find(x => x.id === initialOcId);
    if (r) { ocIdHandledRef.current = true; abrirOperacaoPorTipo(r); }
  }, [initialOcId, loading, rows]);

  return (
    <div className="space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Operações Comerciais</h2>
          <p className="text-xs text-muted-foreground">Compras, vendas e abates — negociação, animais e pagamento.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={abrir}>
          <Sparkles className="h-4 w-4" /> Nova Operação Comercial
        </Button>
      </div>

      {/* Banner discreto */}
      <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Nova Central de Operações Comerciais em implantação — criação disponível; edição, Animais e Liquidação chegam nos próximos passos.
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Contraparte…" className="h-9 w-52 pl-7" />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os tipos</SelectItem>
            <SelectItem value="compra">Compra</SelectItem>
            <SelectItem value="venda">Venda em Pé</SelectItem>
            <SelectItem value="abate">Abate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fComercial} onValueChange={setFComercial}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toda situação</SelectItem>
            <SelectItem value="programada">Programada</SelectItem>
            <SelectItem value="fechada">Fechada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fFazenda} onValueChange={setFFazenda}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Fazenda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as fazendas</SelectItem>
            {fazendaOptions.map(id => <SelectItem key={id} value={id}>{fazendas[id] ?? id}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={mostrarRascunhos ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1"
          onClick={() => setMostrarRascunhos(v => !v)}>
          <Filter className="h-3.5 w-3.5" /> Mostrar rascunhos
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead>Fazenda</TableHead>
              <TableHead>Comercial</TableHead>
              <TableHead>Animais</TableHead>
              <TableHead>Liquidação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`sk-${i}`}><TableCell colSpan={8}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
            ))}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma operação comercial.
              </TableCell></TableRow>
            )}
            {!loading && pageRows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmtData(r.data_operacao)}</TableCell>
                <TableCell>{TIPO_LABEL[r.tipo_operacao] ?? r.tipo_operacao}</TableCell>
                <TableCell className="max-w-[200px] truncate">{nomeContraparte(r)}</TableCell>
                <TableCell className="max-w-[160px] truncate">{nomeFazenda(r)}</TableCell>
                <TableCell><BadgeComercial status={r.status_comercial} rascunho={r.rascunho} /></TableCell>
                <TableCell><BadgeDerivadoPlaceholder dica="Status de animais é derivado — chega no PR da camada de dados." /></TableCell>
                <TableCell><BadgeDerivadoPlaceholder dica="Status de liquidação é derivado — chega no PR da camada de dados." /></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* OPEN-01: "Abrir" leva ao CompraModalShell (fluxo ?oc_compra=1&oc_id) — só Compra. */}
                      {r.tipo_operacao === 'compra' ? (
                        <DropdownMenuItem onSelect={() => abrirOperacaoPorTipo(r)}><Eye className="h-4 w-4 mr-2" /> Abrir</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled><Eye className="h-4 w-4 mr-2" /> Abrir (disponível só para Compra)</DropdownMenuItem>
                      )}
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground">Em breve</DropdownMenuLabel>
                      <DropdownMenuItem disabled>Registrar movimentação</DropdownMenuItem>
                      <DropdownMenuItem disabled>Registrar liquidação</DropdownMenuItem>
                      <DropdownMenuItem disabled>Marcar fechado</DropdownMenuItem>
                      <DropdownMenuItem disabled>Sincronizar financeiro</DropdownMenuItem>
                      <DropdownMenuItem disabled>Reabrir</DropdownMenuItem>
                      <DropdownMenuItem disabled>Cancelar operação</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtradas.length} operação(ões)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
          <span>{pageSafe} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7" disabled={pageSafe >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próximo ›</Button>
        </div>
      </div>

      {/* Modal existente (mesmo fluxo para Nova operação e Abrir) */}
      <ModalOperacaoComercial open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
