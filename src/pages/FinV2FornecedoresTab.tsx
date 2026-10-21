import { buscarFornecedoresNoBanco } from '@/lib/fornecedores/buscaDeFornecedorBanco';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
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
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM, SECUNDARIA_REGUA, QUADRO_REGUA, RODAPE_REGUA, TextoReservado, reservaDeNumero } from '@/components/ui/regua-tabela';
import { brl } from '@/lib/calculos/numeroBR';
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

/** FORN-01b — um inativo (não mesclado) que ainda tem lançamento vivo: quem, quantos e quanto. */
export interface InativoComLancamento { id: string; nome: string; lancamentos: number; valor: number }

/** FORN-01b — junta as linhas (uma por lançamento) por fornecedor; o de maior valor primeiro. */
export function inativosDasLinhas(linhas: readonly { favorecido_id: string | null; valor: number | null; nome: string | null }[]): InativoComLancamento[] {
  const por = new Map<string, InativoComLancamento>();
  for (const l of linhas) {
    if (!l.favorecido_id) continue;
    const x = por.get(l.favorecido_id) ?? { id: l.favorecido_id, nome: l.nome ?? 'cadastro sem nome', lancamentos: 0, valor: 0 };
    x.lancamentos += 1; x.valor += Math.abs(l.valor ?? 0);
    por.set(l.favorecido_id, x);
  }
  return [...por.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** FORN-01b — a frase da faixa NOMEIA o inativo: "<nome> (inativo) · N lançamentos · R$ X"; com mais de um, "· e mais N". Nula sem nada
 *  a dizer (nenhum, ou a leitura que não chegou). */
export function faixaDoInativo(itens: readonly InativoComLancamento[] | null): { texto: string; primeiro: InativoComLancamento } | null {
  if (!itens || itens.length === 0) return null;
  const [p, ...resto] = itens;
  const mais = resto.length ? ` · e mais ${resto.length} ${resto.length === 1 ? 'inativo' : 'inativos'} com lançamentos` : '';
  return { primeiro: p, texto: `${p.nome} (inativo) · ${p.lancamentos.toLocaleString('pt-BR')} ${p.lancamentos === 1 ? 'lançamento' : 'lançamentos'} · ${brl(p.valor)}${mais}` };
}

export function precisaDeDocumento(cpfCnpj: string | null | undefined): boolean {
  return situacaoDoGravado(cpfCnpj).situacao !== 'ok';
}


/** FORN-MESCLAR-02d — a situação da linha: "Ativo", "Inativo" ou, no absorvido por mesclagem viva, "Mesclado em <nome>" (a data no
 *  `title`). O absorvido é sempre inativo (regra do banco), então nunca aparece em "Ativos". FORN-01b: na tela vai o `selo` curto. */
export function situacaoDaLinha(f: { ativo: boolean; fundido_em_id?: string | null; fundido_em?: string | null }, nomeDoDono: string | null):
  { rotulo: string; selo: string; title: string | undefined; mesclado: boolean } {
  if (!f.fundido_em_id) return { rotulo: f.ativo ? 'Ativo' : 'Inativo', selo: f.ativo ? 'Ativo' : 'Inativo', title: undefined, mesclado: false };
  const dono = nomeDoDono ?? 'outro cadastro';
  const quando = f.fundido_em ? new Date(f.fundido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  /* FORN-01b — a coluna é estreita: o selo diz "Mesclado"; em quem e quando vão no `title` */
  return { rotulo: `Mesclado em ${dono}`, selo: 'Mesclado', title: `Mesclado em ${dono}${quando ? ` em ${quando}` : ''} — desfaça a mesclagem para reativar`, mesclado: true };
}

/* FORN-LISTA-01 / FORN-01b — a régua da tabela (px, `table-layout: fixed`), a de Recorrências (`regua-tabela`). As fixas pelo pior texto a
   9,5px + padding (CNPJ "12.345.678/0001-90", "99.999", "21/10/2026", o selo "Mesclado") — o `check:ui-cortes` reprova número cortado;
   Razão social e Nome fantasia dividem o resto 58/42, em px calculado da largura real. Abaixo de 900px de janela a Cidade/UF sai. */
export const COL = { documento: 108, cidade: 112, lanc: 44, ultimo: 64, situacao: 60, acao: 24 } as const;
export const FATIA_RAZAO = 0.58;
const COLUNAS: { chave: OrdemDaLista; rotulo: string; num?: boolean }[] = [
  { chave: 'razao_social', rotulo: 'Razão social' }, { chave: 'nome_fantasia', rotulo: 'Nome fantasia' },
  { chave: 'documento', rotulo: 'CNPJ/CPF' }, { chave: 'cidade', rotulo: 'Cidade/UF' },
  { chave: 'lancamentos', rotulo: 'Lanç.', num: true }, { chave: 'ultimo_uso', rotulo: 'Último uso', num: true },
  { chave: 'situacao', rotulo: 'Situação' },
];
/* FORN-01b — as reservas: o maior valor possível de cada texto que muda com a seleção (algarismos tabulares). O maior possível é o do
   CLIENTE: o total de cadastros ("Todos" sem busca — o maior já lido, a busca só diminui); páginas pelo menor "Por página" (50). */
export function reservasDaLista(maiorTotal: number): { numero: string; intervalo: string; pagina: string } {
  const numero = reservaDeNumero(String(Math.max(1, Math.trunc(maiorTotal))).length);
  const pag = reservaDeNumero(String(paginasDe(Math.max(1, maiorTotal), POR_PAGINA[0])).length);
  return { numero, intervalo: `Mostrando ${numero}–${numero} de ${numero}`, pagina: `Página ${pag} de ${pag}` };
}
const R_ABA = reservaDeNumero(3);
const VAZIO = <span className="text-muted-foreground">—</span>;
/** o número do contador, com o lugar do maior valor */
const Num = ({ v, reserva }: { v: string; reserva: string }) => <TextoReservado texto={v} reserva={reserva} />;

export function FinV2FornecedoresTab() {
  const { clienteAtual } = useCliente();
  const [mesclarAberto, setMesclarAberto] = useState(false);
  /* o par que o "Mesclar" do cadastro pediu (FORN-CADASTRO-02): a ferramenta abre já com ele */
  /* FORN-01b — a faixa do inativo abre a ferramenta só com ele (quem fica, a pessoa escolhe) */
  const [mesclarPar, setMesclarPar] = useState<{ manter?: string; absorver: string[] } | null>(null);
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
  const [inativosComLancamento, setInativosComLancamento] = useState<InativoComLancamento[] | null>(null);

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
      const linhas = await lerTodasAsPaginas<{ favorecido_id: string | null; valor: number | null; nome: string | null }>(async (de, ate, contar) => {
        const { data, error, count } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('favorecido_id, valor, financeiro_fornecedores!fk_flv2_favorecido_tenant!inner(nome, ativo, fundido_em_id)', { count: contar ? 'exact' : undefined })
          .eq('cliente_id', clienteId)
          .not('cancelado', 'is', true)
          .eq('financeiro_fornecedores.ativo', false)
          .is('financeiro_fornecedores.fundido_em_id', null)
          .order('id')
          .range(de, ate);
        if (error) throw new Error(error.message);
        return { data: (data ?? []).map((r) => ({ favorecido_id: r.favorecido_id, valor: typeof r.valor === 'number' ? r.valor : Number(r.valor ?? 0),
          nome: r.financeiro_fornecedores?.nome ?? null })), count: typeof count === 'number' ? count : null };
      });
      /* FORN-AVISO-BUSCA-01 — com busca, só os inativos que batem com ela (a MESMA busca da lista, a RPC); sem busca, todos */
      const todosOsInativos = inativosDasLinhas(linhas);
      if (!searchDebounced.trim() || todosOsInativos.length === 0) { setInativosComLancamento(todosOsInativos); return; }
      const { itens } = await buscarFornecedoresNoBanco<{ id: string }>(clienteId, searchDebounced, 'inativos', null);
      const casam = new Set(itens.map((f) => f.id));
      setInativosComLancamento(todosOsInativos.filter((x) => casam.has(x.id)));
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
  const faixa = faixaDoInativo(inativosComLancamento);
  /* o maior total já lido deste cliente (sem busca é o "Todos"; a busca só diminui): é ele que dá o tamanho das reservas */
  const [maiorTotal, setMaiorTotal] = useState(0);
  useEffect(() => { setMaiorTotal(0); }, [clienteAtual?.id]);
  useEffect(() => { if (contagens) setMaiorTotal((m) => Math.max(m, contagens.todos)); }, [contagens]);
  const reservas = reservasDaLista(maiorTotal || 9999);
  const numero = (v: number | undefined | null) => <Num v={n(v)} reserva={reservas.numero} />;

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (f: LinhaDaLista) => { setEditing(f); setDialogOpen(true); };
  const ordenarPor = (chave: OrdemDaLista) => setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: false }));
  const colunas = COLUNAS.filter((c) => !(estreita && c.chave === 'cidade'));

  /* FORN-01b — Razão social e Nome fantasia em px, da largura real do quadro (as fixas são escritas em `COL`) */
  const refTabela = useRef<HTMLDivElement>(null);
  const [larguraUtil, setLarguraUtil] = useState<number | null>(null);
  useEffect(() => {
    const el = refTabela.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    /* escondida (a outra aba aberta) a largura é 0: não mede — a régua continua a de quando estava à vista */
    const medir = () => { if (el.clientWidth > 0) setLarguraUtil(el.clientWidth); };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fixas = COL.documento + (estreita ? 0 : COL.cidade) + COL.lanc + COL.ultimo + COL.situacao + COL.acao;
  const resto = larguraUtil ? Math.max(240, larguraUtil - fixas) : null;
  const larguraRazao = resto ? Math.round(resto * FATIA_RAZAO) : undefined;
  const larguraFantasia = resto && larguraRazao ? resto - larguraRazao : undefined;

  return (
    /* FORN-01b — a tela mede contra o pai (`fornecedores` entrou em `SECOES_APP_SHELL`): a tabela vai até o fim da janela */
    <div className="flex h-full min-h-[360px] w-full min-w-0 flex-col gap-2 px-4 pb-1 pt-2 animate-fade-in" data-testid="tela-fornecedores">
      <div className="flex h-[26px] shrink-0 items-center gap-2.5">
        {/* FORN-LISTA-01 — título 14px e o número de ativos do banco */}
        <h2 className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-[14px] font-semibold text-foreground">
          Fornecedores
          <span data-testid="fornecedores-contador" className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {numero(contagens?.ativos)} {contagens?.ativos === 1 ? 'cadastro ativo' : 'cadastros ativos'}
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
          <TabsTrigger value="cadastro" className="text-xs h-7" data-testid="aba-cadastro">Cadastro ({numero(contagens?.ativos)})</TabsTrigger>
          <TabsTrigger value="sem-cadastro" className="text-xs h-7 gap-1" data-testid="aba-sem-cadastro">
            {/* FORN-01b — o lugar do contador existe sempre (a aba não muda de largura quando ele aparece) */}
            Sem cadastro <span className={cn('ml-0.5 rounded-lg px-1.5 text-[10px] font-semibold', semCadastroN != null && semCadastroN > 0 ? 'bg-[#fdf0dc] text-[#b45309]' : 'invisible')}
              data-testid="contador-sem-cadastro"><TextoReservado texto={semCadastroN != null && semCadastroN > 0 ? String(semCadastroN) : ''} reserva={R_ABA} alinhar="direita" /></span>
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
                { valor: 'ativos', rotulo: <>Ativos {numero(contagens?.ativos)}</> },
                { valor: 'inativos', rotulo: <>Inativos {numero(contagens?.inativos)}</> },
                { valor: 'mesclados', rotulo: <>Mesclados {numero(contagens?.mesclados)}</> },
                { valor: 'todos', rotulo: <>Todos {numero(contagens?.todos)}</> },
              ]}
            />
            <button type="button" data-testid="filtro-sem-documento" aria-pressed={semDocumento}
              onClick={() => setSemDocumento(v => !v)}
              title="Campo vazio ou fora do padrão (só dígitos, outro formato, tamanho ou dígito verificador errado)"
              className={cn('h-[26px] shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[11px] tabular-nums',
                semDocumento ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted')}>
              Sem CPF/CNPJ {numero(semDocN)}
            </button>
          </div>
          {/* FORN-NOME-EXIBIDO-01 / FORN-01b — lugar reservado de 16px, sempre presente: a faixa NOMEIA o inativo que ainda tem lançamentos
              e une pelo Mesclar já com ele; some sozinha quando resolvido (vazia, o lugar fica) */}
          <div className="h-4 shrink-0 flex items-center gap-2 text-[10px] leading-4 text-amber-700" data-testid="aviso-inativos-com-lancamento">
            {erro ? <span className="text-destructive" data-testid="lista-erro">Não foi possível ler a lista: {erro}</span>
              : faixa && (
              <>
                <span className="min-w-0 uma-linha-que-rola" data-testid="faixa-inativo">{faixa.texto}</span>
                <button type="button" className="shrink-0 underline" data-testid="unir-pelo-mesclar"
                  onClick={() => setMesclarPar({ absorver: [faixa.primeiro.id] })}>Unir pelo Mesclar</button>
              </>
            )}
          </div>
          {/* FORN-01b — O QUADRO na régua de Recorrências: só o corpo rola (cabeçalho navy preso no topo dele); a paginação mora na barra
              navy do pé do quadro, nada solto abaixo */}
          <div className={cn(QUADRO_REGUA, 'flex-1')} data-testid="quadro-fornecedores">
            <div ref={refTabela} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rolagem-fina" data-testid="lista-de-fornecedores">
              <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col style={larguraRazao ? { width: larguraRazao } : undefined} />
                  <col style={larguraFantasia ? { width: larguraFantasia } : undefined} />
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
                      const Seta = !ativa ? ChevronsUpDown : ordem.desc ? ChevronDown : ChevronUp;
                      return (
                        <th key={c.chave} scope="col" aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
                          className={cn(TH_REGUA, 'sticky top-0 z-[2] cursor-pointer select-none bg-primary', c.num ? 'text-right' : 'text-left')}
                          onClick={() => ordenarPor(c.chave)} data-testid={`ordem-${c.chave}`}>
                          <span className={cn('inline-flex items-center gap-0.5', c.num && 'flex-row-reverse')}>
                            {c.rotulo}<Seta className={cn('h-2.5 w-2.5 shrink-0', !ativa && 'text-primary-foreground/70')} aria-hidden />
                          </span>
                        </th>
                      );
                    })}
                    <th scope="col" className={cn(TH_REGUA, 'sticky top-0 z-[2] bg-primary')} aria-label="Editar" />
                  </tr>
                </thead>
                <tbody>
                  {loading && !pagina && <tr><td colSpan={colunas.length + 1} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Carregando…</td></tr>}
                  {!loading && pagina && items.length === 0 && <tr><td colSpan={colunas.length + 1} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Nenhum fornecedor</td></tr>}
                  {items.map((f) => {
                    const doc = situacaoDoGravado(f.cpf_cnpj);
                    const sit = situacaoDaLinha(f, f.dono_nome);
                    const cidade = cidadeUf(f.municipio, f.uf);
                    const ultimo = dataDoUltimoUso(f.ultimo_uso);
                    return (
                      <tr key={f.id} className="h-[19px] hover:bg-muted/40 [&>td]:border-b [&>td]:border-border/60" data-testid="linha-fornecedor">
                        {/* FORN-01b — nome e texto: UMA linha, "…" quando não cabe, o texto inteiro no `title` */}
                        <td className={cn(TD_REGUA_TEXTO, 'font-medium')} title={f.nome}>{f.nome}</td>
                        <td className={TD_REGUA_TEXTO} title={f.nome_fantasia ?? undefined}>{f.nome_fantasia || VAZIO}</td>
                        {/* FORN-LISTA-01 — o número nunca corta: inteiro, numa linha; fora do padrão em âmbar, com o motivo no `title` */}
                        <td className={cn(TD_REGUA, SECUNDARIA_REGUA, 'whitespace-nowrap tabular-nums')} title={doc.motivo ? `fora do padrão: ${doc.motivo}` : undefined}>
                          {doc.situacao === 'vazio' ? <span className="text-muted-foreground" data-testid="doc-sem-documento">sem documento</span>
                            : <span className={doc.situacao === 'fora_do_padrao' ? 'text-amber-700' : undefined}
                                data-testid={doc.situacao === 'fora_do_padrao' ? 'doc-fora-do-padrao' : undefined}>{f.cpf_cnpj}</span>}
                        </td>
                        {!estreita && <td className={cn(TD_REGUA_TEXTO, SECUNDARIA_REGUA)} title={cidade ?? undefined}>{cidade ?? VAZIO}</td>}
                        <td className={cn(TD_REGUA_NUM, SECUNDARIA_REGUA)}>{f.lancamentos.toLocaleString('pt-BR')}</td>
                        <td className={cn(TD_REGUA_NUM, SECUNDARIA_REGUA)}>{ultimo ?? VAZIO}</td>
                        <td className={cn(TD_REGUA, 'whitespace-nowrap')}>
                          <span data-testid={sit.mesclado ? 'situacao-mesclado' : 'situacao'} title={sit.title}
                            className={cn('inline-block rounded-full px-1.5 text-[9.5px] font-semibold leading-[14px] align-middle',
                              sit.mesclado ? 'bg-[#e0ecf8] text-[#1e3a5f]' : f.situacao === 'ativo' ? 'bg-[#e6f4ea] text-[#1e7a44]' : 'bg-muted text-muted-foreground')}>
                            {sit.selo}
                          </span>
                        </td>
                        <td className={cn(TD_REGUA, 'px-0 text-center')}>
                          <Button variant="ghost" size="icon" className="h-[17px] w-5 p-0" onClick={() => openEdit(f)} aria-label={`Editar ${f.nome}`}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* FORN-01b — a barra navy do pé do quadro (a do Total de Recorrências): intervalo, "Por página" (lembrado por usuário) e a
                navegação; todo texto que muda tem o lugar do maior valor (`TextoReservado`) — nada se desloca */}
            <div className={cn(RODAPE_REGUA, 'flex h-[23px] items-center gap-2 whitespace-nowrap px-1.5')} data-testid="rodape-fornecedores">
              <TextoReservado testid="intervalo-fornecedores" texto={pagina ? textoDoIntervalo(totalCount, page, porPagina) : '…'} reserva={reservas.intervalo} />
              <span className="flex items-center gap-1.5">Por página
                <Segmentado<PorPaginaTexto> valor={textoDoPorPagina(porPagina)} onEscolher={(v) => escolherPorPagina(porPaginaDoTexto(v))} altura={20} fonte={10} className="bg-card"
                  opcoes={POR_PAGINA.map((v) => ({ valor: textoDoPorPagina(v), rotulo: String(v) }))} />
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" className="h-[18px] rounded px-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent" disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>← Anterior</button>
                <TextoReservado testid="pagina-fornecedores" texto={`Página ${page.toLocaleString('pt-BR')} de ${totalPages.toLocaleString('pt-BR')}`} reserva={reservas.pagina} alinhar="direita" />
                <button type="button" className="h-[18px] rounded px-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent" disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima →</button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* FORN-SEM-CADASTRO-01 — montada sempre (o contador da aba precisa da leitura); some da vista fora dela */}
        <div className={activeTab === 'sem-cadastro' ? 'mt-2 flex min-h-0 flex-1 flex-col' : 'hidden'}>
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
