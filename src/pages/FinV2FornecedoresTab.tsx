import { buscarFornecedoresNoBanco } from '@/lib/fornecedores/buscaDeFornecedorBanco';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Search } from 'lucide-react';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { MesclarFornecedoresDialog } from '@/components/financeiro-v2/MesclarFornecedoresDialog';
import { FornecedoresSemCadastro } from '@/components/financeiro-v2/FornecedoresSemCadastro';
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
/* FORN-BUSCA-UNICA-01 — a lista e o aviso buscam pela RPC da busca única (`buscarFornecedoresNoBanco`, o espelho no banco). */
export type { SituacaoDaLista } from '@/lib/fornecedores/buscaDeFornecedorBanco';

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
  /* FORN-MESCLAR-02d — o cadastro em que este foi mesclado (mesclagem viva) e quando */
  fundido_em_id?: string | null;
  fundido_em?: string | null;
}

/** FORN-MESCLAR-02d — a situação da linha: "Ativo", "Inativo" ou, no absorvido por mesclagem viva, "Mesclado em <nome>" (a data no
 *  `title`). O absorvido é sempre inativo (regra do banco), então nunca aparece em "Ativos". */
export function situacaoDaLinha(f: { ativo: boolean; fundido_em_id?: string | null; fundido_em?: string | null }, nomeDoDono: string | null):
  { rotulo: string; title: string | undefined; mesclado: boolean } {
  if (!f.fundido_em_id) return { rotulo: f.ativo ? 'Ativo' : 'Inativo', title: undefined, mesclado: false };
  const dono = nomeDoDono ?? 'outro cadastro';
  const quando = f.fundido_em ? new Date(f.fundido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  return { rotulo: `Mesclado em ${dono}`, title: `mesclado em ${dono}${quando ? ` em ${quando}` : ''} — desfaça a mesclagem para reativar`, mesclado: true };
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<FiltroStatus>('ativos');
  const [semDocumento, setSemDocumento] = useState(false);
  const [activeTab, setActiveTab] = useState('cadastro');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  /* FORN-MESCLAR-02d — o nome de quem ficou, para "Mesclado em <nome>" (lido só para os absorvidos da página) */
  const [donos, setDonos] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const faltam = [...new Set(items.map((f) => f.fundido_em_id).filter((x): x is string => !!x && !donos.has(x)))];
    if (!faltam.length || !clienteAtual?.id) return;
    let vivo = true;
    void supabase.from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteAtual.id).in('id', faltam).then(({ data }) => {
      if (!vivo || !data) return;
      setDonos((m) => { const n = new Map(m); for (const d of data) n.set(d.id, d.nome); return n; });
    });
    return () => { vivo = false; };
  }, [items, donos, clienteAtual?.id]);

  /* FORN-NOME-EXIBIDO-01 — inativos (não mesclados) que ainda têm lançamento vivo: somem daqui com "Ativos", mas aparecem no filtro
     e na grade de Lançamentos. Nulo = ainda lendo ou a leitura falhou (o aviso não diz zero sem saber). */
  const [inativosComLancamento, setInativosComLancamento] = useState<number | null>(null);

  /* FORN-SEM-CADASTRO-01 — o contador laranja da aba vem da própria aba (nulo = lendo) */
  const [semCadastroN, setSemCadastroN] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const clienteId = clienteAtual.id;
    const from = (page - 1) * PAGE_SIZE;
    try {
      if (semDocumento) {
        /* FORN-EDITAR-01 — o recorte inteiro, filtrado pelo validador único, paginado aqui */
        const { itens } = await buscarFornecedoresNoBanco<Fornecedor>(clienteId, searchDebounced, statusFilter, null);
        const filtrados = itens.filter(f => precisaDeDocumento(f.cpf_cnpj));
        setItems(filtrados.slice(from, from + PAGE_SIZE));
        setTotalCount(filtrados.length);
        return;
      }
      const { itens, total } = await buscarFornecedoresNoBanco<Fornecedor>(clienteId, searchDebounced, statusFilter, PAGE_SIZE, from);
      setItems(itens);
      setTotalCount(total);
    } catch {
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
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
      /* FORN-AVISO-BUSCA-01 — com busca, conta só os inativos que batem com ela (a MESMA busca da lista, a RPC); sem busca, o total */
      const ids = [...new Set(linhas.map((l) => l.favorecido_id).filter((id): id is string => !!id))];
      if (!searchDebounced.trim() || ids.length === 0) { setInativosComLancamento(contarFornecedoresDistintos(linhas)); return; }
      const { itens } = await buscarFornecedoresNoBanco<{ id: string }>(clienteId, searchDebounced, 'inativos', null);
      const casam = new Set(itens.map((f) => f.id));
      setInativosComLancamento(ids.filter((id) => casam.has(id)).length);
    } catch {
      setInativosComLancamento(null);
    }
  }, [clienteAtual?.id, searchDebounced]);

  useEffect(() => { void loadInativosComLancamento(); }, [loadInativosComLancamento]);

  // Debounce: searchText → searchDebounced (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Reset para página 1 a cada nova busca/filtro
  useEffect(() => { setPage(1); }, [searchDebounced, statusFilter, semDocumento]);

  useEffect(() => { load(); }, [load]);

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
          <TabsTrigger value="sem-cadastro" className="text-xs h-7 gap-1" data-testid="aba-sem-cadastro">
            Sem cadastro {semCadastroN != null && semCadastroN > 0 && (
              <span className="ml-0.5 rounded-lg bg-[#fdf0dc] px-1.5 text-[10px] font-semibold text-[#b45309]" data-testid="contador-sem-cadastro">{semCadastroN}</span>
            )}
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
                <span className="min-w-0">{avisoDeInativos(inativosComLancamento)}</span>
                {statusFilter !== 'inativos' && (
                  <button type="button" className="shrink-0 underline" onClick={() => { setStatusFilter('inativos'); setPage(1); }}>ver inativos</button>
                )}
              </>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              {/* UI-SEM-CORTE-01 — nada corta: o nome longo quebra a linha; o corpo rola DENTRO do cartão e o cabeçalho (opaco) fica preso
                  no topo do container que rola, sem vão acima dele */}
              <Table className="table-fixed" wrapperClassName="max-h-[calc(100dvh-320px)] min-h-[120px] overflow-y-auto" data-testid="lista-de-fornecedores">
                <colgroup>
                  <col />
                  <col style={{ width: 230 }} />
                  {/* FORN-MESCLAR-02d — 150: "Mesclado em <nome>" quebra a linha dentro dela, nunca corta */}
                  <col style={{ width: 150 }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <TableHeader className="bg-muted">
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
                      <TableCell className="py-0.5 font-medium break-words">{f.nome}</TableCell>
                      <TableCell className="py-0.5 whitespace-nowrap text-muted-foreground" title={doc.motivo ?? undefined}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 tabular-nums">{f.cpf_cnpj || '-'}</span>
                          {doc.situacao === 'vazio' && (
                            <span data-testid="doc-vazio" className="shrink-0 text-[9.5px] text-amber-700">vazio</span>
                          )}
                          {doc.situacao === 'fora_do_padrao' && (
                            <span data-testid="doc-fora-do-padrao" className="shrink-0 rounded border border-amber-400 bg-amber-50 px-1 text-[9.5px] leading-[14px] text-amber-800">fora do padrão</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="py-0.5">
                        {(() => { const sit = situacaoDaLinha(f, f.fundido_em_id ? donos.get(f.fundido_em_id) ?? null : null); return (
                          <Badge variant={f.ativo ? 'default' : 'secondary'} title={sit.title} data-testid={sit.mesclado ? 'situacao-mesclado' : undefined}
                            className={`px-1 py-0 text-[9px] ${sit.mesclado ? 'whitespace-normal break-words text-left leading-[12px] bg-[#e0ecf8] text-[#1e3a5f]' : ''}`}>
                            {sit.rotulo}
                          </Badge>
                        ); })()}
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

        {/* FORN-SEM-CADASTRO-01 — montada sempre (o contador da aba precisa da leitura); some da vista fora dela */}
        <div className={activeTab === 'sem-cadastro' ? 'mt-2' : 'hidden'}>
          {clienteAtual?.id && (
            <FornecedoresSemCadastro clienteId={clienteAtual.id} fazendas={fazendas.filter((f) => f.id !== '__global__')} aoContar={setSemCadastroN} visivel={activeTab === 'sem-cadastro'} />
          )}
        </div>
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
