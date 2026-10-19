import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Search, Link2, AlertTriangle } from 'lucide-react';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { MesclarFornecedoresDialog } from '@/components/financeiro-v2/MesclarFornecedoresDialog';
import { toast } from 'sonner';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';
import { situacaoDoGravado } from '@/lib/fornecedores/documentoFiscal';

type FiltroStatus = 'ativos' | 'inativos' | 'todos';

/**
 * FORN-EDITAR-01 — "Sem CPF/CNPJ" = campo vazio OU fora do padrão (só dígitos, outro formato, tamanho ou dígito verificador
 * errado), pelo validador único (`situacaoDoGravado`). Combina com o status e com a busca. Como "fora do padrão" não se filtra
 * no banco (o gravado tem formatos misturados), com o filtro ligado a lista do recorte é lida INTEIRA e paginada aqui.
 */
/**
 * FORN-CADASTRO-02 — o filtro da busca (o `.or` do PostgREST): razão social, fantasia e documento; o documento com ou sem máscara
 * (os dígitos em ordem). Nulo = sem busca. UM dono: a lista e o aviso dos inativos filtram pelo MESMO texto (FORN-AVISO-BUSCA-01).
 */
export function filtroDaBusca(busca: string): string | null {
  const safe = busca.trim().replace(/[%,()]/g, ' ').trim();
  if (!safe) return null;
  const digitos = safe.replace(/\D/g, '');
  const porDigitos = digitos.length >= 3 && digitos.length === safe.replace(/[\s./-]/g, '').length ? `,cpf_cnpj.ilike.%${digitos.split('').join('%')}%` : '';
  return `nome_normalizado.ilike.%${safe}%,nome.ilike.%${safe}%,nome_fantasia.ilike.%${safe}%,cpf_cnpj.ilike.%${safe}%${porDigitos}`;
}

/** FORN-NOME-EXIBIDO-01 — quantos fornecedores DISTINTOS aparecem nas linhas (uma linha por lançamento). */
export function contarFornecedoresDistintos(linhas: readonly { favorecido_id: string | null }[]): number {
  return new Set(linhas.map((l) => l.favorecido_id).filter((id): id is string => !!id)).size;
}

/** FORN-NOME-EXIBIDO-01 — a frase do aviso; nula sem nada a dizer (zero, ou leitura que não chegou). */
export function avisoDeInativos(n: number | null): string | null {
  if (n === null || n <= 0) return null;
  return `${n} ${n === 1 ? 'fornecedor inativo ainda tem' : 'fornecedores inativos ainda têm'} lançamentos e aparece${n === 1 ? '' : 'm'} em Lançamentos Financeiros. Una ao cadastro certo pelo Mesclar.`;
}

export function precisaDeDocumento(cpfCnpj: string | null | undefined): boolean {
  return situacaoDoGravado(cpfCnpj).situacao !== 'ok';
}

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
}

interface PendingItem {
  descricao: string;
  count: number;
  ids: string[];
  suggestions: Fornecedor[];
}

function normalize(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  const words = na.split(' ');
  const matches = words.filter(w => nb.includes(w)).length;
  return matches / Math.max(words.length, 1);
}

const PAGE_SIZE = 100;

export function FinV2FornecedoresTab() {
  const { clienteAtual } = useCliente();
  const [mesclarAberto, setMesclarAberto] = useState(false);
  /* o par que o "Mesclar" do cadastro pediu (FORN-CADASTRO-02): a ferramenta abre já com ele */
  const [mesclarPar, setMesclarPar] = useState<{ manter: string; absorver: string[] } | null>(null);
  const { fazendas } = useFazenda();
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingPendingId, setCreatingPendingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<FiltroStatus>('ativos');
  const [semDocumento, setSemDocumento] = useState(false);
  const [activeTab, setActiveTab] = useState('cadastro');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  /* FORN-NOME-EXIBIDO-01 — inativos (não mesclados) que ainda têm lançamento vivo: somem daqui com "Ativos", mas aparecem no filtro
     e na grade de Lançamentos. Nulo = ainda lendo ou a leitura falhou (o aviso não diz zero sem saber). */
  const [inativosComLancamento, setInativosComLancamento] = useState<number | null>(null);

  // Pending items
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const clienteId = clienteAtual.id;
    const consulta = (contar: boolean) => {
      let query = supabase
        .from('financeiro_fornecedores')
        .select('*', { count: contar ? 'exact' : undefined })
        .eq('cliente_id', clienteId);

      if (statusFilter === 'ativos') query = query.eq('ativo', true);
      else if (statusFilter === 'inativos') query = query.eq('ativo', false);

      const filtro = filtroDaBusca(searchDebounced);
      if (filtro) query = query.or(filtro);
      return query.order('nome').order('id');
    };

    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;
    if (semDocumento) {
      /* FORN-EDITAR-01 — o recorte inteiro, filtrado pelo validador único, paginado aqui */
      const todos = await lerTodasAsPaginas<Fornecedor>(async (de, ate, contar) => {
        const { data, error, count } = await consulta(contar).range(de, ate);
        if (error) throw new Error(error.message);
        return { data: (data as Fornecedor[]) ?? [], count: typeof count === 'number' ? count : null };
      }).catch(() => [] as Fornecedor[]);
      const filtrados = todos.filter(f => precisaDeDocumento(f.cpf_cnpj));
      setItems(filtrados.slice(from, to + 1));
      setTotalCount(filtrados.length);
      setLoading(false);
      return;
    }
    const { data, count } = await consulta(true).range(from, to);

    setItems((data as Fornecedor[]) || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [clienteAtual?.id, statusFilter, searchDebounced, page, semDocumento]);

  const loadInativosComLancamento = useCallback(async () => {
    if (!clienteAtual?.id) return;
    const clienteId = clienteAtual.id;
    setInativosComLancamento(null);
    try {
      const linhas = await lerTodasAsPaginas<{ favorecido_id: string | null }>(async (de, ate, contar) => {
        const { data, error, count } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('favorecido_id, financeiro_fornecedores!fk_flv2_favorecido_tenant!inner(ativo, fundido_em_id)', { count: contar ? 'exact' : undefined })
          .eq('cliente_id', clienteId)
          .not('cancelado', 'is', true)
          .eq('financeiro_fornecedores.ativo', false)
          .is('financeiro_fornecedores.fundido_em_id', null)
          .order('id')
          .range(de, ate);
        if (error) throw new Error(error.message);
        return { data: (data ?? []).map((r) => ({ favorecido_id: r.favorecido_id })), count: typeof count === 'number' ? count : null };
      });
      /* FORN-AVISO-BUSCA-01 — com busca, conta só os inativos que batem com ela (o mesmo filtro da lista); sem busca, o total do cliente */
      const filtro = filtroDaBusca(searchDebounced);
      const ids = [...new Set(linhas.map((l) => l.favorecido_id).filter((id): id is string => !!id))];
      if (!filtro || ids.length === 0) { setInativosComLancamento(contarFornecedoresDistintos(linhas)); return; }
      const { data, error } = await supabase.from('financeiro_fornecedores').select('id').eq('cliente_id', clienteId).in('id', ids).or(filtro);
      if (error) throw new Error(error.message);
      setInativosComLancamento((data ?? []).length);
    } catch {
      setInativosComLancamento(null);
    }
  }, [clienteAtual?.id, searchDebounced]);

  useEffect(() => { void loadInativosComLancamento(); }, [loadInativosComLancamento]);

  const loadPending = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoadingPending(true);
    // Get lancamentos without favorecido_id that have a descricao
    const { data } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao')
      .eq('cliente_id', clienteAtual.id)
      .is('favorecido_id', null)
      .not('descricao', 'is', null)
      .order('descricao');

    if (!data || data.length === 0) {
      setPendingItems([]);
      setLoadingPending(false);
      return;
    }

    // Group by descricao
    const groups: Record<string, { count: number; ids: string[] }> = {};
    for (const row of data) {
      const desc = (row.descricao || '').trim();
      if (!desc) continue;
      if (!groups[desc]) groups[desc] = { count: 0, ids: [] };
      groups[desc].count++;
      if (groups[desc].ids.length < 50) groups[desc].ids.push(row.id);
    }

    // Build pending items with suggestions
    const pending: PendingItem[] = Object.entries(groups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([desc, g]) => {
        const suggestions = items
          .filter(f => f.ativo && similarity(desc, f.nome) > 0.3)
          .sort((a, b) => similarity(desc, b.nome) - similarity(desc, a.nome))
          .slice(0, 3);
        return { descricao: desc, count: g.count, ids: g.ids, suggestions };
      });

    setPendingItems(pending);
    setLoadingPending(false);
  }, [clienteAtual?.id, items]);

  // Debounce: searchText → searchDebounced (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Reset para página 1 a cada nova busca/filtro
  useEffect(() => { setPage(1); }, [searchDebounced, statusFilter, semDocumento]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'pendentes') loadPending(); }, [activeTab, loadPending]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (f: Fornecedor) => {
    setEditing(f);
    setDialogOpen(true);
  };

  // Link pending lancamentos to an existing fornecedor
  const linkToFornecedor = async (pending: PendingItem, fornecedorId: string) => {
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ favorecido_id: fornecedorId })
      .in('id', pending.ids);
    if (error) {
      toast.error('Erro ao vincular');
      return;
    }
    toast.success(`${pending.count} lançamentos vinculados`);
    loadPending();
  };

  // Create new fornecedor from pending and link
  const createAndLink = async (pending: PendingItem) => {
    if (creatingPendingId) return;
    if (!clienteAtual?.id) return;
    const faz = fazendas.find(f => f.id !== '__global__');
    if (!faz) return;

    setCreatingPendingId(pending.descricao);
    try {
      const { data, error } = await supabase
        .from('financeiro_fornecedores')
        .insert({ cliente_id: clienteAtual.id, fazenda_id: faz.id, nome: pending.descricao })
        .select('id')
        .single();
      if (error || !data) {
        toast.error('Erro ao criar fornecedor');
        return;
      }
      notificarFornecedoresMudaram(clienteAtual.id);
      await linkToFornecedor(pending, data.id);
      load();
    } finally {
      setCreatingPendingId(null);
    }
  };

  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';
  const pendingCount = pendingItems.length;

  return (
    <div className="w-full p-4 pb-20 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        {/* FORN-EDITAR-01 — título contido, com o total do recorte filtrado ao lado */}
        <h2 className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-[16px] font-semibold text-foreground">
          Fornecedores
          <span data-testid="fornecedores-contador" className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {loading ? '…' : `${totalCount.toLocaleString('pt-BR')} ${totalCount === 1 ? 'fornecedor' : 'fornecedores'}`}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {/* FORN-MESCLAR-01 — a ferramenta de mesclar (move TODAS as referências, numa transação, e pode ser desfeita) */}
          <Button size="sm" variant="outline" onClick={() => setMesclarAberto(true)} disabled={!clienteAtual?.id} data-testid="abrir-mesclar-fornecedores">
            Mesclar fornecedores
          </Button>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>
      </div>
      {mesclarAberto && clienteAtual?.id && (
        <MesclarFornecedoresDialog aberto clienteId={clienteAtual.id} aoFechar={() => { setMesclarAberto(false); void load(); void loadInativosComLancamento(); }} />
      )}
      {mesclarPar && clienteAtual?.id && (
        <MesclarFornecedoresDialog aberto clienteId={clienteAtual.id} inicial={mesclarPar} aoFechar={() => { setMesclarPar(null); void load(); void loadInativosComLancamento(); }} />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="cadastro" className="text-xs h-7">Cadastro ({totalCount})</TabsTrigger>
          <TabsTrigger value="pendentes" className="text-xs h-7 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Pendentes {pendingCount > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-0.5">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar fornecedor..."
                className="h-8 text-xs pl-7"
              />
            </div>
            <Segmentado<FiltroStatus>
              valor={statusFilter}
              onEscolher={setStatusFilter}
              altura={26}
              opcoes={[
                { valor: 'ativos', rotulo: 'Ativos' },
                { valor: 'inativos', rotulo: 'Inativos' },
                { valor: 'todos', rotulo: 'Todos' },
              ]}
            />
            <button type="button" data-testid="filtro-sem-documento" aria-pressed={semDocumento}
              onClick={() => setSemDocumento(v => !v)}
              title="Campo vazio ou fora do padrão (só dígitos, outro formato, tamanho ou dígito verificador errado)"
              className={cn('h-[26px] shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[11px]',
                semDocumento ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted')}>
              Sem CPF/CNPJ
            </button>
          </div>
          {/* FORN-NOME-EXIBIDO-01 — lugar reservado de 16px, sempre presente (vazio sem inativo com lançamento) */}
          <div className="h-4 flex items-center gap-2 text-[10px] leading-4 text-amber-700" data-testid="aviso-inativos-com-lancamento">
            {avisoDeInativos(inativosComLancamento) && (
              <>
                <span className="truncate" title={avisoDeInativos(inativosComLancamento) ?? ''}>{avisoDeInativos(inativosComLancamento)}</span>
                {statusFilter !== 'inativos' && (
                  <button type="button" className="shrink-0 underline" onClick={() => { setStatusFilter('inativos'); setPage(1); }}>ver inativos</button>
                )}
              </>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              {/* FORN-EDITAR-01 — uma linha por registro: só o nome corta (inteiro no `title`); documento e status não quebram */}
              <Table className="table-fixed">
                <colgroup>
                  <col />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="h-7">
                    <TableHead className="text-[10px]">Nome</TableHead>
                    <TableHead className="text-[10px]">CPF/CNPJ</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">Carregando...</TableCell></TableRow>}
                  {!loading && items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">Nenhum fornecedor</TableCell></TableRow>}
                  {items.map(f => {
                    const doc = situacaoDoGravado(f.cpf_cnpj);
                    return (
                    <TableRow key={f.id} className="h-7 text-[11px]">
                      <TableCell className="py-0.5 font-medium truncate whitespace-nowrap" title={f.nome}>{f.nome}</TableCell>
                      <TableCell className="py-0.5 whitespace-nowrap text-muted-foreground" title={doc.motivo ?? undefined}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate tabular-nums">{f.cpf_cnpj || '-'}</span>
                          {doc.situacao === 'vazio' && (
                            <span data-testid="doc-vazio" className="shrink-0 text-[9.5px] text-amber-700">vazio</span>
                          )}
                          {doc.situacao === 'fora_do_padrao' && (
                            <span data-testid="doc-fora-do-padrao" className="shrink-0 rounded border border-amber-400 bg-amber-50 px-1 text-[9.5px] leading-[14px] text-amber-800">fora do padrão</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="py-0.5 whitespace-nowrap">
                        <Badge variant={f.ativo ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
                          {f.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(f)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {totalCount === 0
                ? 'Nenhum fornecedor'
                : `Mostrando ${rangeStart}–${rangeEnd} de ${totalCount} fornecedores`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] px-2"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Anterior
              </Button>
              <span>Página {page} de {totalPages}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] px-2"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Próxima →
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pendentes" className="space-y-2 mt-2">
          <p className="text-[10px] text-muted-foreground">
            Lançamentos sem fornecedor vinculado. Vincule a um existente ou crie novo.
          </p>
          {loadingPending && <div className="text-center text-muted-foreground py-6 text-xs animate-pulse">Carregando...</div>}
          {!loadingPending && pendingItems.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-xs">
              ✅ Todos os lançamentos estão vinculados!
            </div>
          )}
          {!loadingPending && pendingItems.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-[10px]">Descrição Original</TableHead>
                      <TableHead className="text-[10px] w-12">Qtd</TableHead>
                      <TableHead className="text-[10px]">Sugestão</TableHead>
                      <TableHead className="text-[10px] w-28">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems.slice(0, 100).map((p, i) => (
                      <TableRow key={i} className="text-[10px] h-8">
                        <TableCell className="py-0.5 font-medium max-w-[200px] truncate" title={p.descricao}>
                          {p.descricao}
                        </TableCell>
                        <TableCell className="py-0.5 text-muted-foreground">{p.count}</TableCell>
                        <TableCell className="py-0.5">
                          {p.suggestions.length > 0 ? (
                            <Select onValueChange={(fornId) => linkToFornecedor(p, fornId)}>
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue placeholder={p.suggestions[0]?.nome || 'Selecione'} />
                              </SelectTrigger>
                              <SelectContent>
                                {p.suggestions.map(s => (
                                  <SelectItem key={s.id} value={s.id} className="py-0.5">{s.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground italic">Sem sugestão</span>
                          )}
                        </TableCell>
                        <TableCell className="py-0.5">
                          <div className="flex gap-0.5">
                            {p.suggestions.length > 0 && (
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => linkToFornecedor(p, p.suggestions[0].id)}>
                                <Link2 className="h-2.5 w-2.5 mr-0.5" />Vincular
                              </Button>
                            )}
                            <Button size="sm" variant="default" className="h-5 text-[9px] px-1.5" onClick={() => createAndLink(p)} disabled={creatingPendingId === p.descricao}>
                              <Plus className="h-2.5 w-2.5 mr-0.5" />{creatingPendingId === p.descricao ? '...' : 'Criar'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <FornecedorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        allFornecedores={items}
        fazendas={fazendas}
        clienteId={clienteAtual?.id || ''}
        onSaved={load}
        onSelectExisting={(f) => { toast.info(`Fornecedor "${f.nome}" selecionado.`); }}
        onMesclar={(manter, absorver) => setMesclarPar({ manter, absorver: [absorver] })}
      />
    </div>
  );
}
