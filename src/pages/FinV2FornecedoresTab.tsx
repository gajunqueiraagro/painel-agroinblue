import { buscarFornecedoresNoBanco } from '@/lib/fornecedores/buscaDeFornecedorBanco';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import {
  lerListaDoBanco, idsSemDocumento, textoDoIntervalo, paginasDe, dataDoUltimoUso, cidadeUf, lerPorPagina, guardarPorPagina, POR_PAGINA, porPaginaDoTexto, textoDoPorPagina,
  type SituacaoDaListaDeCadastros, type OrdemDaLista, type PorPagina, type PorPaginaTexto, type PaginaDaLista, type LinhaDaLista,
} from '@/lib/fornecedores/listaDeFornecedores';


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


/** FORN-MESCLAR-02d — a situação da linha: "Ativo", "Inativo" ou, no absorvido por mesclagem viva, "Mesclado em <nome>" (a data no
 *  `title`). O absorvido é sempre inativo (regra do banco), então nunca aparece em "Ativos". */
export function situacaoDaLinha(f: { ativo: boolean; fundido_em_id?: string | null; fundido_em?: string | null }, nomeDoDono: string | null):
  { rotulo: string; title: string | undefined; mesclado: boolean } {
  if (!f.fundido_em_id) return { rotulo: f.ativo ? 'Ativo' : 'Inativo', title: undefined, mesclado: false };
  const dono = nomeDoDono ?? 'outro cadastro';
  const quando = f.fundido_em ? new Date(f.fundido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  return { rotulo: `Mesclado em ${dono}`, title: `mesclado em ${dono}${quando ? ` em ${quando}` : ''} — desfaça a mesclagem para reativar`, mesclado: true };
}

/* FORN-LISTA-01 — a régua da tabela (px). Só a Razão social estica; abaixo de 900px de janela a Cidade/UF sai. */
const COL = { fantasia: 150, documento: 128, cidade: 130, lanc: 52, ultimo: 82, situacao: 112, acao: 28 } as const;
const COLUNAS: { chave: OrdemDaLista; rotulo: string; num?: boolean }[] = [
  { chave: 'razao_social', rotulo: 'Razão social' }, { chave: 'nome_fantasia', rotulo: 'Nome fantasia' },
  { chave: 'documento', rotulo: 'CNPJ/CPF' }, { chave: 'cidade', rotulo: 'Cidade/UF' },
  { chave: 'lancamentos', rotulo: 'Lanç.', num: true }, { chave: 'ultimo_uso', rotulo: 'Último uso', num: true },
  { chave: 'situacao', rotulo: 'Situação' },
];
const VAZIO = <span className="text-muted-foreground">—</span>;

export function FinV2FornecedoresTab() {
  const { clienteAtual } = useCliente();
  const [mesclarAberto, setMesclarAberto] = useState(false);
  /* o par que o "Mesclar" do cadastro pediu (FORN-CADASTRO-02): a ferramenta abre já com ele */
  const [mesclarPar, setMesclarPar] = useState<{ manter: string; absorver: string[] } | null>(null);
  const { fazendas } = useFazenda();
  const estreita = useLarguraDaJanela() < 900;
  const [pagina, setPaginaDaLista] = useState<PaginaDaLista | null>(null);
  const [semDocN, setSemDocN] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LinhaDaLista | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<SituacaoDaListaDeCadastros>('ativos');
  const [semDocumento, setSemDocumento] = useState(false);
  const [activeTab, setActiveTab] = useState('cadastro');
  const [page, setPage] = useState(1);
  const [ordem, setOrdem] = useState<{ chave: OrdemDaLista; desc: boolean }>({ chave: 'razao_social', desc: false });
  /* o "Por página" lembrado por usuário (neste navegador) */
  const [usuario, setUsuario] = useState<string | null>(null);
  const [porPagina, setPorPagina] = useState<PorPagina>(100);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const id = data?.user?.id ?? null;
        if (vivo) { setUsuario(id); setPorPagina(lerPorPagina(id)); }
      } catch { if (vivo) setPorPagina(lerPorPagina(null)); }
    })();
    return () => { vivo = false; };
  }, []);
  const escolherPorPagina = (v: PorPagina) => { setPorPagina(v); guardarPorPagina(usuario, v); setPage(1); };

  /* FORN-NOME-EXIBIDO-01 — inativos (não mesclados) que ainda têm lançamento vivo: somem daqui com "Ativos", mas aparecem no filtro
     e na grade de Lançamentos. Nulo = ainda lendo ou a leitura falhou (o aviso não diz zero sem saber). */
  const [inativosComLancamento, setInativosComLancamento] = useState<number | null>(null);

  /* FORN-SEM-CADASTRO-01 — o contador laranja da aba vem da própria aba (nulo = lendo) */
  const [semCadastroN, setSemCadastroN] = useState<number | null>(null);

  /* FORN-LISTA-01 — uma leitura do banco (`fn_fornecedor_lista`): busca única, situação, contagens, ordem e página. Com "Sem CPF/CNPJ"
     ligado, a primeira leitura traz os documentos do recorte, o validador único escolhe os ids e a segunda ordena e pagina só eles. */
  const geracao = useRef(0);
  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    const g = ++geracao.current;
    setLoading(true); setErro(null);
    const base = { clienteId: clienteAtual.id, busca: searchDebounced, situacao: statusFilter, ordem: ordem.chave, desc: ordem.desc, porPagina, pagina: page };
    try {
      let p = await lerListaDoBanco({ ...base, ids: null, ...(semDocumento ? { porPagina: 1, pagina: 1 } : {}) });
      const semDoc = idsSemDocumento(p.documentos);
      if (semDocumento) p = { ...(await lerListaDoBanco({ ...base, ids: semDoc })), documentos: p.documentos };
      if (g !== geracao.current) return;
      setPaginaDaLista(p); setSemDocN(semDoc.length);
    } catch (e) {
      if (g !== geracao.current) return;
      setPaginaDaLista(null); setSemDocN(null); setErro(e instanceof Error ? e.message : String(e));
    } finally {
      if (g === geracao.current) setLoading(false);
    }
  }, [clienteAtual?.id, statusFilter, searchDebounced, page, semDocumento, ordem, porPagina]);

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

  // Reset para página 1 a cada nova busca/filtro/ordem
  useEffect(() => { setPage(1); }, [searchDebounced, statusFilter, semDocumento, ordem]);

  useEffect(() => { void load(); }, [load]);

  const totalCount = pagina?.total ?? 0;
  const totalPages = paginasDe(totalCount, porPagina);
  const contagens = pagina?.contagens ?? null;
  const items = pagina?.itens ?? [];
  const n = (x: number | undefined | null) => (x == null ? '…' : x.toLocaleString('pt-BR'));

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (f: LinhaDaLista) => { setEditing(f); setDialogOpen(true); };
  const ordenarPor = (chave: OrdemDaLista) => setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: false }));
  const colunas = COLUNAS.filter((c) => !(estreita && c.chave === 'cidade'));

  return (
    <div className="flex h-[calc(100dvh-120px)] min-h-[360px] w-full flex-col gap-2 p-4 pb-3 animate-fade-in" data-testid="tela-fornecedores">
      <div className="flex h-[26px] shrink-0 items-center gap-2.5">
        {/* FORN-LISTA-01 — título 14px e o número de ativos do banco */}
        <h2 className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-[14px] font-semibold text-foreground">
          Fornecedores
          <span data-testid="fornecedores-contador" className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {contagens ? `${n(contagens.ativos)} ${contagens.ativos === 1 ? 'cadastro ativo' : 'cadastros ativos'}` : '…'}
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          {/* FORN-MESCLAR-01 — a ferramenta de mesclar (move TODAS as referências, numa transação, e pode ser desfeita) */}
          <Button size="sm" variant="outline" className="h-[26px] px-2.5 text-[11px]" onClick={() => setMesclarAberto(true)} disabled={!clienteAtual?.id} data-testid="abrir-mesclar-fornecedores">
            Mesclar fornecedores
          </Button>
          <Button size="sm" className="h-[26px] px-2.5 text-[11px] bg-cta font-semibold text-cta-foreground hover:bg-cta-hover" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Novo</Button>
        </div>
      </div>
      {mesclarAberto && clienteAtual?.id && (
        <MesclarFornecedoresDialog aberto clienteId={clienteAtual.id} aoFechar={() => { setMesclarAberto(false); void load(); void loadInativosComLancamento(); }} />
      )}
      {mesclarPar && clienteAtual?.id && (
        <MesclarFornecedoresDialog aberto clienteId={clienteAtual.id} inicial={mesclarPar} aoFechar={() => { setMesclarPar(null); void load(); void loadInativosComLancamento(); }} />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-8 shrink-0 self-start">
          <TabsTrigger value="cadastro" className="text-xs h-7" data-testid="aba-cadastro">Cadastro ({contagens ? n(contagens.ativos) : '…'})</TabsTrigger>
          <TabsTrigger value="sem-cadastro" className="text-xs h-7 gap-1" data-testid="aba-sem-cadastro">
            Sem cadastro {semCadastroN != null && semCadastroN > 0 && (
              <span className="ml-0.5 rounded-lg bg-[#fdf0dc] px-1.5 text-[10px] font-semibold text-[#b45309]" data-testid="contador-sem-cadastro">{semCadastroN}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden">
          {/* em janela estreita a busca fica com a linha inteira e os filtros descem (nada espremido) */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="relative min-w-[300px] flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar por razão social, nome fantasia ou CNPJ…"
                className="h-[26px] text-[11px] pl-7"
                data-testid="busca-fornecedores"
              />
            </div>
            <Segmentado<SituacaoDaListaDeCadastros>
              valor={statusFilter}
              onEscolher={setStatusFilter}
              altura={26}
              opcoes={[
                { valor: 'ativos', rotulo: `Ativos ${n(contagens?.ativos)}` },
                { valor: 'inativos', rotulo: `Inativos ${n(contagens?.inativos)}` },
                { valor: 'mesclados', rotulo: `Mesclados ${n(contagens?.mesclados)}` },
                { valor: 'todos', rotulo: `Todos ${n(contagens?.todos)}` },
              ]}
            />
            <button type="button" data-testid="filtro-sem-documento" aria-pressed={semDocumento}
              onClick={() => setSemDocumento(v => !v)}
              title="Campo vazio ou fora do padrão (só dígitos, outro formato, tamanho ou dígito verificador errado)"
              className={cn('h-[26px] shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[11px] tabular-nums',
                semDocumento ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted')}>
              Sem CPF/CNPJ {n(semDocN)}
            </button>
          </div>
          {/* FORN-NOME-EXIBIDO-01 — lugar reservado de 16px, sempre presente (vazio sem inativo com lançamento) */}
          <div className="h-4 shrink-0 flex items-center gap-2 text-[10px] leading-4 text-amber-700" data-testid="aviso-inativos-com-lancamento">
            {erro ? <span className="text-destructive" data-testid="lista-erro">Não foi possível ler a lista: {erro}</span>
              : avisoDeInativos(inativosComLancamento) && (
              <>
                <span className="min-w-0 uma-linha-que-rola">{avisoDeInativos(inativosComLancamento)}</span>
                {statusFilter !== 'inativos' && (
                  <button type="button" className="shrink-0 underline" onClick={() => { setStatusFilter('inativos'); setPage(1); }}>ver inativos</button>
                )}
              </>
            )}
          </div>
          {/* FORN-LISTA-01 — a tabela ocupa a altura que sobra; só o corpo rola; cabeçalho navy preso no topo do container que rola */}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" data-testid="lista-de-fornecedores">
            <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-[11px]">
              <colgroup>
                <col />
                <col style={{ width: COL.fantasia }} />
                <col style={{ width: COL.documento }} />
                {!estreita && <col style={{ width: COL.cidade }} />}
                <col style={{ width: COL.lanc }} />
                <col style={{ width: COL.ultimo }} />
                <col style={{ width: COL.situacao }} />
                <col style={{ width: COL.acao }} />
              </colgroup>
              <thead>
                <tr>
                  {colunas.map((c) => {
                    const ativa = ordem.chave === c.chave;
                    return (
                      <th key={c.chave} scope="col" aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
                        className={cn('sticky top-0 z-[2] h-[26px] cursor-pointer select-none whitespace-nowrap bg-primary px-2 text-[10.5px] font-semibold text-primary-foreground',
                          c.num ? 'text-right' : 'text-left')}
                        onClick={() => ordenarPor(c.chave)} data-testid={`ordem-${c.chave}`}>
                        {c.rotulo}<span className={cn('ml-1 text-[9px]', ativa ? 'opacity-90' : 'opacity-40')}>{ativa ? (ordem.desc ? '▼' : '▲') : '⇅'}</span>
                      </th>
                    );
                  })}
                  <th scope="col" className="sticky top-0 z-[2] h-[26px] bg-primary" aria-label="Editar" />
                </tr>
              </thead>
              <tbody>
                {loading && !pagina && <tr><td colSpan={colunas.length + 1} className="py-6 text-center text-muted-foreground">Carregando...</td></tr>}
                {!loading && pagina && items.length === 0 && <tr><td colSpan={colunas.length + 1} className="py-6 text-center text-muted-foreground">Nenhum fornecedor</td></tr>}
                {items.map((f) => {
                  const doc = situacaoDoGravado(f.cpf_cnpj);
                  const sit = situacaoDaLinha(f, f.dono_nome);
                  const cidade = cidadeUf(f.municipio, f.uf);
                  const ultimo = dataDoUltimoUso(f.ultimo_uso);
                  return (
                    <tr key={f.id} className="h-[25px] hover:bg-muted/40 [&>td]:border-b [&>td]:border-border/60 [&>td]:px-2 [&>td]:py-0 [&>td]:leading-[16px]" data-testid="linha-fornecedor">
                      <td className="font-medium"><span className="uma-linha-que-rola block">{f.nome}</span></td>
                      <td>{f.nome_fantasia ? <span className="uma-linha-que-rola block">{f.nome_fantasia}</span> : VAZIO}</td>
                      {/* FORN-LISTA-01 — o número nunca corta: inteiro, numa linha; fora do padrão em âmbar, com o motivo no `title` */}
                      <td className="whitespace-nowrap tabular-nums" title={doc.motivo ? `fora do padrão: ${doc.motivo}` : undefined}>
                        {doc.situacao === 'vazio' ? <span className="text-muted-foreground" data-testid="doc-sem-documento">sem documento</span>
                          : <span className={doc.situacao === 'fora_do_padrao' ? 'text-amber-700' : undefined}
                              data-testid={doc.situacao === 'fora_do_padrao' ? 'doc-fora-do-padrao' : undefined}>{f.cpf_cnpj}</span>}
                      </td>
                      {!estreita && <td>{cidade ? <span className="uma-linha-que-rola block">{cidade}</span> : VAZIO}</td>}
                      <td className="text-right tabular-nums">{f.lancamentos.toLocaleString('pt-BR')}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{ultimo ?? VAZIO}</td>
                      <td>
                        <span data-testid={sit.mesclado ? 'situacao-mesclado' : 'situacao'} title={sit.title}
                          className={cn('inline-block max-w-full rounded-full px-1.5 text-[10px] font-semibold leading-[16px] align-middle',
                            sit.mesclado ? 'bg-[#e0ecf8] text-[#1e3a5f]' : f.situacao === 'ativo' ? 'bg-[#e6f4ea] text-[#1e7a44]' : 'bg-muted text-muted-foreground')}>
                          <span className="uma-linha-que-rola">{sit.rotulo}</span>
                        </span>
                      </td>
                      <td className="text-center">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(f)} aria-label={`Editar ${f.nome}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* FORN-LISTA-01 — rodapé fixo: intervalo, "Por página" (lembrado por usuário) e a navegação */}
          <div className="flex min-h-[24px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap text-[11px] text-muted-foreground" data-testid="rodape-fornecedores">
            <span data-testid="intervalo-fornecedores" className="tabular-nums">{pagina ? textoDoIntervalo(totalCount, page, porPagina) : '…'}</span>
            <span className="flex items-center gap-1.5">Por página
              <Segmentado<PorPaginaTexto> valor={textoDoPorPagina(porPagina)} onEscolher={(v) => escolherPorPagina(porPaginaDoTexto(v))} altura={22}
                opcoes={POR_PAGINA.map((v) => ({ valor: textoDoPorPagina(v), rotulo: String(v) }))} />
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-[22px] text-[11px] px-2" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>
                ← Anterior
              </Button>
              <span className="tabular-nums">Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}</span>
              <Button size="sm" variant="outline" className="h-[22px] text-[11px] px-2" disabled={page >= totalPages || loading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                Próxima →
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* FORN-SEM-CADASTRO-01 — montada sempre (o contador da aba precisa da leitura); some da vista fora dela */}
        <div className={activeTab === 'sem-cadastro' ? 'mt-2 min-h-0 flex-1 overflow-auto' : 'hidden'}>
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
        onSaved={() => { void load(); }}
        onSelectExisting={(f) => { toast.info(`Fornecedor "${f.nome}" selecionado.`); }}
        onMesclar={(manter, absorver) => setMesclarPar({ manter, absorver: [absorver] })}
      />
    </div>
  );
}
