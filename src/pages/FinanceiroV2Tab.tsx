import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
// PR-FIN-STATUS-UX-03A-1 — domínio financeiro (dono único); statusOperacional (compartilhado) não é mais usado aqui.
import {
  STATUS_FINANCEIRO_OPCOES_FILTRO,
  STATUS_FILTRO_LABEL,
  STATUS_FILTRO_COR,
  isStatusFiltroFinanceiro,
  type StatusFiltroFinanceiro,
} from '@/lib/financeiro/statusFinanceiro';
import { isTransferenciaTipo } from '@/lib/financeiro/v2Transferencia';
import { sentidoNaConta, contaEmFoco, formatarValorLinha, type SentidoNaConta } from '@/lib/financeiro/sinalPorConta';
import { useLancamentosConciliados, desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import { iconeOrigemLancamento, LEGENDA_ICONES } from '@/v2/lib/origemLancamento';
import { MinimodalOrigemLancamento } from '@/components/financeiro-v2/MinimodalOrigemLancamento';
import { useCoberturaExtrato } from '@/hooks/useCoberturaExtrato';
import { useCliente } from '@/contexts/ClienteContext';
import { contaSimpleValid } from '@/components/financeiro-v2/lancamentoDialogTabs';
import { validarLancamento } from '@/lib/financeiro/validacaoLancamento';
import { formatDocumento } from '@/lib/financeiro/documentoHelper';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SearchableSelect, limparBuscasLembradas } from '@/components/ui/searchable-select';
import { apenasAtivos, guardarFiltros, lerFiltros, esquecerFiltros } from '@/lib/financeiro/filtrosPersistidos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Copy, MoreHorizontal, ChevronLeft, ChevronRight, Zap, List, ChevronsUpDown, FilterX, Download, ArrowUp, ArrowDown, ArrowUpDown, Trash2, X, SlidersHorizontal, Maximize2, Minimize2, ExternalLink, Beef, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, dataDaDimensao, type LancamentoV2, type FiltrosV2, type DimensaoDataFinanceiro } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { FinanceiroV2ExportMenu } from '@/components/financeiro-v2/FinanceiroV2ExportMenu';
import { CorrecaoTransferenciasBanner } from '@/components/financeiro-v2/CorrecaoTransferenciasBanner';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { normalizarAtividade, casaTipoOperacao } from '@/lib/financeiro/filtrosListaV2';
import { temFiltroLimitante, FRASE_SEM_FILTRO, SEM_SAFRA, SEM_CULTURA } from '@/lib/financeiro/filtroLimitante';
import { CULTURAS_LANCAMENTO } from '@/lib/agri/rateioLancamento';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
/* ⚠ A LISTA DE ATIVIDADES É A DO CARD DO MODAL — adendo do PR-FIN-SAFRA-ADM-01. Duplicá-la
   aqui é como o filtro ficou dois anos oferecendo Pecuária e Agricultura enquanto o resto do
   sistema já conhecia quatro: uma lista escrita à mão não sabe quando a outra cresce. */
import { ATIVIDADES } from '@/lib/financeiro/ultimaAtividade';
import { filtrosAplicadosDaLista, TAMANHO_PAGINA_LISTA } from '@/lib/financeiro/listaPaginadaV2';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { FinanceiroV2ControlesLista, BotaoAplicarFiltros } from '@/components/financeiro-v2/FinanceiroV2ControlesLista';
import {
  reduzirLista, ESTADO_INICIAL, temPendencias, calcularPaginacao,
  type EstadoLista, type FiltrosEditaveis,
} from '@/lib/financeiro/estadoFiltrosLista';

/**
 * A memória da busca dos comboboxes desta tela.
 *
 * ⚠ UMA CHAVE POR FILTRO, NAO POR MONTAGEM. Cada um destes campos aparece DUAS
 * vezes no arquivo (a barra larga e a compacta) e as duas já compartilham o mesmo
 * estado de filtro; duas memórias para um filtro só fariam a busca mudar conforme
 * a largura da janela.
 *
 * ⚠ O PREFIXO COMUM É O QUE FAZ O "LIMPAR" FUNCIONAR: `limparBuscasLembradas`
 * apaga por prefixo, então uma chamada esquece as cinco. Uma chave fora do padrão
 * sobreviveria ao Limpar em silêncio.
 */
const PREFIXO_BUSCA = 'fin-v2-';
const CHAVE_BUSCA_FORNECEDOR = `${PREFIXO_BUSCA}fornecedor`;
const CHAVE_BUSCA_MACRO      = `${PREFIXO_BUSCA}macro`;
const CHAVE_BUSCA_GRUPO      = `${PREFIXO_BUSCA}grupo`;
const CHAVE_BUSCA_CENTRO     = `${PREFIXO_BUSCA}centro`;
const CHAVE_BUSCA_SUBCENTRO  = `${PREFIXO_BUSCA}subcentro`;

// ── Sorting helpers ──

const CONTA_GROUP_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };

function sortContas<T extends { nome_conta: string; tipo_conta?: string | null; codigo_conta?: string | null }>(contas: T[]): T[] {
  return [...contas].sort((a, b) => {
    const tA = (a.tipo_conta || '').toLowerCase();
    const tB = (b.tipo_conta || '').toLowerCase();
    // Fallback: extract prefix from codigo_conta or nome_conta
    const prefA = tA || (a.codigo_conta || a.nome_conta).split('-')[0]?.toLowerCase() || '';
    const prefB = tB || (b.codigo_conta || b.nome_conta).split('-')[0]?.toLowerCase() || '';
    const gA = CONTA_GROUP_ORDER[prefA] ?? 99;
    const gB = CONTA_GROUP_ORDER[prefB] ?? 99;
    if (gA !== gB) return gA - gB;
    // Within same group, descending by numeric suffix from codigo_conta
    const codeA = a.codigo_conta || a.nome_conta;
    const codeB = b.codigo_conta || b.nome_conta;
    const numA = parseInt(codeA.split('-')[1] || '0', 10);
    const numB = parseInt(codeB.split('-')[1] || '0', 10);
    return numB - numA;
  });
}

/** Display name for a conta: prefer nome_exibicao, fallback to nome_conta */
function contaLabel(c: { nome_conta: string; nome_exibicao?: string | null; agencia?: string | null; numero_conta?: string | null; conta_digito?: string | null }): string {
  const nome = c.nome_exibicao || c.nome_conta;
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) {
    parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  }
  if (parts.length > 0) return `${nome} (${parts.join(' ')})`;
  return nome;
}

const MACRO_ORDER = [
  'Receita Operacional',
  'Deduções de Receitas',
  'Entrada Financeira',
  'Custeio Produção',
  'Investimento',
  'Investimentos em Bovinos',
  'Saída Financeira',
  'Dividendos',
];

function sortMacros(macros: string[]): string[] {
  return [...macros].sort((a, b) => {
    const iA = MACRO_ORDER.indexOf(a);
    const iB = MACRO_ORDER.indexOf(b);
    const oA = iA >= 0 ? iA : 999;
    const oB = iB >= 0 ? iB : 999;
    if (oA !== oB) return oA - oB;
    return a.localeCompare(b, 'pt-BR');
  });
}

function sortFazendas<T extends { nome: string; id: string }>(fazendas: T[]): T[] {
  return [...fazendas].sort((a, b) => {
    const aIsAdmin = a.nome.toLowerCase().includes('administrativ');
    const bIsAdmin = b.nome.toLowerCase().includes('administrativ');
    if (aIsAdmin && !bIsAdmin) return 1;
    if (!aIsAdmin && bIsAdmin) return -1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

const MESES_LIST = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

// PR-FIN-STATUS-UX-03A-1 — labels/cores da coluna Status vêm do domínio único
//   (statusFinanceiro.ts): STATUS_FILTRO_LABEL / STATUS_FILTRO_COR. 'meta' legado exibe
//   "Meta (legado)" muted (valor persistido NÃO é mascarado nem agrupado em Previsto).

function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}
// Display compacto: só o número (tipo vai no tooltip)
function formatNF(l: LancamentoV2): string {
  return l.numero_documento?.trim() || '-';
}

// Tooltip mantém info completa (tipo + número formatado)
function formatDocCompleto(l: LancamentoV2): string {
  return formatDocumento((l as any).tipo_documento, l.numero_documento);
}

export interface FinV2DrillFilters {
  ano?: string;
  mes?: number;
  tipo?: string; // '1-Entradas' | '2-Saídas'
  macro?: string;
  grupo?: string;
  centro?: string;
  subcentro?: string;
  statusTransacao?: string;
}

interface Props {
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onIntensiveToggle?: (active: boolean) => void;
  drillFilters?: FinV2DrillFilters | null;
  onAbrirFinanciamento?: (id: string) => void;
  /** PR-VENDA-V2-FINVINC-ABRIR-POR-LANCAMENTO-B1: id alvo a ser aberto no
   *  LancamentoV2Dialog assim que a aba montar/receber o valor. Resolvido
   *  por hook.buscarLancamentoPorId (sem depender da lista paginada). */
  lancamentoIdAlvo?: string | null;
  /** Disparado depois que o alvo foi consumido (aberto ou não-encontrado)
   *  para o pai zerar o estado e evitar re-abertura. */
  onLancamentoAlvoConsumido?: () => void;
  /** PR-B1-R2 — notifica o pai (V2Index) que o LancamentoV2Dialog fechou
   *  (salvar OU cancelar OU ESC/X — todos convergem em onClose). O pai decide
   *  se há drill a retornar. FinanceiroV2Tab é agnóstico ao drill. */
  onCloseDialog?: () => void;
  /** PR-OC-FIN-EDIT-FIX-02 — quando o alvo (flancId) veio da ação "Editar" da Programação da OC,
   *  libera a edição de favorecido no título OC. Só true nesse fluxo; row-click direto = false. */
  ocEditFavorecido?: boolean;
  /** PR-OC-FIN-EDIT-FIX-02 — abre a OC vinculada na aba Financeiro (navegação SPA), preservando os
   *  filtros atuais do Financeiro V2 (salvos em sessionStorage para restauração no retorno). */
  onAbrirOperacaoOCFinanceiro?: (operacaoId: string) => void;
}


function getInitialPageSize() {
  if (typeof window === 'undefined') return 30;
  const width = window.innerWidth;
  if (width < 768) return 12;
  if (width < 1024) return 20;
  return 30;
}

export function FinanceiroV2Tab({ onBack, filtroAnoInicial, filtroMesInicial, onIntensiveToggle, drillFilters, onAbrirFinanciamento, lancamentoIdAlvo, onLancamentoAlvoConsumido, onCloseDialog, ocEditFavorecido, onAbrirOperacaoOCFinanceiro }: Props) {
  const { fazendas, fazendaAtual } = useFazenda();
  const [pageSize] = useState(getInitialPageSize);
  const [currentPage, setCurrentPage] = useState(0);
  const hook = useFinanceiroV2(pageSize);
  /* LANC-STATUS-CONCILIADO-01 — o mapa dos vínculos ativos, uma consulta por
     cliente. A lista carrega tudo em lote e pagina no cliente; um mapa completo
     é o que casa com ela, e trocar de página não repergunta nada. */
  const { clienteAtual } = useCliente();
  const { conciliados, recarregar: recarregarVinculos } = useLancamentosConciliados(clienteAtual?.id ?? null);

  const coberturaExtrato = useCoberturaExtrato(clienteAtual?.id);

  /**
   * PR-FORN-01 — as opções e a contagem saem do RECORTE CARREGADO, não do catálogo.
   *
   * ⚠ FILTRO OFERECE O QUE EXISTE. São 2.554 fornecedores ativos no NJ e 274 com
   * lançamento em julho/2026 — medido em 09/09/2026. Oferecer os 2.554 é oferecer
   * 2.280 escolhas que devolvem lista vazia: isso não filtra, só afasta quem
   * filtraria. Mostre o desvio, não o caminho.
   *
   * ⚠ SEM LÓGICA DE `ativo`: entra quem tem lançamento no recorte, e em julho/2026
   * cinco deles estão inativos. Desativar um fornecedor não apaga o que ele
   * movimentou — escondê-lo tornaria o lançamento inalcançável pelo filtro.
   *
   * ⚠ LISTA E CONTAGEM VÊM DO MESMO RECORTE: o `· N` diz quantos lançamentos aquele
   * fornecedor tem no que está na tela, e por isso nunca é zero nem contradiz a lista
   * que aparece ao escolhê-lo. Também separa os seis "Wilson" do NJ, que era a razão
   * de existir do número. Antes vinha de `fn_fornecedores_com_uso`, contando a base
   * inteira: uma chamada de 395 ms por abertura para responder outra pergunta.
   *
   * ⚠ A LISTA NÃO ENCOLHE AO SELECIONAR, e isso é estrutural: `fornecedorFiltro` é
   * filtro de memória (`filteredLancamentos`) e não entra no plano do servidor, então
   * `hook.lancamentos` continua sendo o recorte inteiro depois da escolha. Se um dia
   * esse filtro subir para a query, esta lista passa a ter uma opção só e vira
   * armadilha: não dá para trocar de fornecedor sem antes voltar para "Todos".
   *
   * O nome vem do catálogo porque o lançamento carrega só o id. Id sem nome é omitido:
   * órfão não existe no banco (medido: 0 em 09/09/2026), então o único caso é a corrida
   * de carga — e ela se resolve sozinha quando `fornecedores` chega.
   */
  const opcoesFornecedor = useMemo(() => {
    const nomePorId = new Map(hook.fornecedores.map((f) => [f.id, f.nome]));
    const noRecorte = new Map<string, number>();
    hook.lancamentos.forEach((l) => {
      if (l.favorecido_id) noRecorte.set(l.favorecido_id, (noRecorte.get(l.favorecido_id) ?? 0) + 1);
    });

    const opcoes: { value: string; label: string; hint: string }[] = [];
    noRecorte.forEach((usos, id) => {
      const nome = nomePorId.get(id);
      if (!nome) return;
      opcoes.push({ value: id, label: nome, hint: String(usos) });
    });
    return opcoes.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [hook.lancamentos, hook.fornecedores]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const [anos, setAnos] = useState<string[]>(() => {
    const arr: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(String(y));
    return arr;
  });

  // Load dynamic years from DB
  useEffect(() => {
    const saved = sessionStorage.getItem('financeiro_v2_state');
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      if (state.ano) setAnosSelecionados(state.ano === '__todos__' ? [] : [state.ano]);
      if (Array.isArray(state.mesesSelecionados)) setMesesSelecionados(state.mesesSelecionados);
      if (state.contaOrigem) setContaOrigem(state.contaOrigem);
      if (state.contaDestino) setContaDestino(state.contaDestino);
      sessionStorage.removeItem('financeiro_v2_state');
    } catch (e) {
      console.error('Erro ao restaurar estado do financeiro', e);
    }
  }, []);

  useEffect(() => {
    hook.loadAnosDisponiveis().then(setAnos);
  }, [hook.loadAnosDisponiveis]);

  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id || '__all__' : '__all__';

  const getDefaults = () => ({
    fazendaId: defaultFazendaId,
    /* ⚠ O PADRÃO É UM ANO SÓ, não "todos": abrir a lista com dez anos de lançamentos é a
       consulta mais cara do sistema, e ninguém pediu por ela. */
    anosSelecionados: [filtroAnoInicial || String(currentYear)],
    mesesSelecionados: filtroMesInicial ? [String(filtroMesInicial).padStart(2, '0')] : [] as string[],
    statusSelecionados: [],   // PR-FIN-STATUS-UX-03A-1 — multisseleção; vazio = Todos (never[] → StatusFiltroFinanceiro[])
    tipoOperacao: '__all__',
    contaOrigem: '__all__',
    contaDestino: '__all__',
    macroFiltro: '__all__',
    grupoFiltro: '__all__',
    centroFiltro: '__all__',
    subcentroFiltro: '__all__',
    produtoFiltro: '',
    documentoFiltro: '',
    fornecedorFiltro: '__all__',
    atividadeFiltro: '__all__',
    safraFiltro: '__all__',
    culturaFiltro: '__all__',
  });

  const defaults = getDefaults();
  const [fazendaId, setFazendaId] = useState(defaults.fazendaId);
  /**
   * ⚠ O ANO VIROU LISTA — FIN-LISTA-MULTIANO-01, e `ano` continua existindo como DERIVADO.
   * Ele alimenta a exportação e o guard "selecione uma fazenda e um ano"; trocá-los por array
   * num PR de filtro seria arrastar duas telas junto. Lista vazia = "Todos", que é o mesmo
   * que o `'__todos__'` sempre significou.
   */
  const [anosSelecionados, setAnosSelecionados] = useState<string[]>(defaults.anosSelecionados);
  const [anoPopoverOpen, setAnoPopoverOpen] = useState(false);
  const ano = anosSelecionados.length === 1 ? anosSelecionados[0] : (anosSelecionados.length === 0 ? '__todos__' : anosSelecionados[0]);
  const anoLabel = anosSelecionados.length === 0
    ? 'Todos'
    : anosSelecionados.length === 1
      ? anosSelecionados[0]
      : `${anosSelecionados.length} anos`;
  const toggleAno = (val: string) => setAnosSelecionados(prev =>
    prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val].sort());
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>(defaults.mesesSelecionados);
  const [statusSelecionados, setStatusSelecionados] = useState<StatusFiltroFinanceiro[]>(defaults.statusSelecionados);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [tipoOperacao, setTipoOperacao] = useState(defaults.tipoOperacao);
  const [contaOrigem, setContaOrigem] = useState(defaults.contaOrigem);
  const [contaDestino, setContaDestino] = useState(defaults.contaDestino);
  const [macroFiltro, setMacroFiltro] = useState(defaults.macroFiltro);
  const [grupoFiltro, setGrupoFiltro] = useState(defaults.grupoFiltro);
  const [centroFiltro, setCentroFiltro] = useState(defaults.centroFiltro);
  const [subcentroFiltro, setSubcentroFiltro] = useState(defaults.subcentroFiltro);
  const [produtoFiltro, setProdutoFiltro] = useState(defaults.produtoFiltro);
  const [documentoFiltro, setDocumentoFiltro] = useState(defaults.documentoFiltro);
  const [fornecedorFiltro, setFornecedorFiltro] = useState(defaults.fornecedorFiltro);
  const [atividadeFiltro, setAtividadeFiltro] = useState(defaults.atividadeFiltro);
  /**
   * O filtro de Safra — FIN-LISTA-FILTROS-01b.
   *
   * ⚠ A SENTINELA VEM DO MÓDULO DA REGRA, não de um `const` aqui dentro — FIN-LISTA-CRASH-
   * SAFRA-01. Ela era declarada NO CORPO do componente, depois do `useMemo` que a usava, e o
   * callback do `useMemo` RODA NO RENDER: a constante estava na zona morta temporal e a tela
   * inteira caía com `Cannot access 'SEM_SAFRA' before initialization`. Importada, não há
   * ordem a respeitar — e a sentinela passa a ter uma definição só, ao lado da regra que
   * decide se ela limita.
   * ⚠ TRÊS ESTADOS, NÃO DOIS: `__all__` (todas), `SEM_SAFRA` (só as linhas sem safra) e um
   * id. "Sem safra" precisa de sentinela própria porque `safra_id === null` não cabe num
   * `value` de `Select`, e reaproveitar `__all__` faria "todas" e "nenhuma" serem a mesma
   * escolha — que é exatamente o que se quer distinguir ao caçar financiamento e
   * administrativo, os dois grupos que NÃO devem ter safra.
   * ⚠ E ESCOLHER UMA SAFRA NÃO MEXE NA ATIVIDADE. No modal, a safra e o card falam da mesma
   * decisão e um segue o outro; aqui são dois filtros soltos, e amarrar um ao outro tiraria
   * do operador a pergunta que ele veio fazer — "o que de pecuária está na safra da lavoura?".
   */
  const [safraFiltro, setSafraFiltro] = useState(defaults.safraFiltro);
  /* FIN-AUDITORIA-CULTURA-01 — a pergunta "quais lançamentos são de mandioca", que antes só
     se respondia abrindo um por um. */
  const [culturaFiltro, setCulturaFiltro] = useState(defaults.culturaFiltro);
  // PR-FIN-GRADE-DATAS-03 — dimensão temporal soberana da grade. Estado dura só enquanto a tela está
  //   montada (sem localStorage/sessionStorage/URL/preferência persistida). Padrão 'financeira'.
  const [dataPor, setDataPor] = useState<DimensaoDataFinanceiro>('financeira');
  // Estreitamento por control-flow (sem cast): valida a string do Select contra a união.
  const handleDataPorChange = (v: string) => {
    if (v === 'financeira' || v === 'competencia' || v === 'vencimento' || v === 'pagamento') {
      setDataPor(v);
    }
  };

  /**
   * ⚠ O ANO GLOBAL PASSA A MOVER A LISTA — FIN-LISTA-FILTRO-FONTE-01 (defeito 3).
   *
   * `filtroAnoInicial` era lido SÓ no inicializador do `useState`, então trocar o ano na barra
   * global não movia esta tela — ela ficava no ano em que foi montada. Onze outras telas
   * (`FechamentoTab`, `MapaPastosTab`, `ConciliacaoTab`, `FinanceiroCaixaTab`, …) já têm
   * exatamente este efeito; esta era a exceção, e a exceção não estava escrita em lugar nenhum.
   * ⚠ SÓ A ROTA `/` PASSA A PROP. O `/v2` monta sem ela, e lá o período do cabeçalho
   * (`f_de`/`f_ate`) não comanda a lista — são modelos que não se tocam, e amarrá-los é
   * decisão de produto, não conserto.
   */
  useEffect(() => {
    if (filtroAnoInicial) setAnosSelecionados([filtroAnoInicial]);
  }, [filtroAnoInicial]);

  useEffect(() => {
    if (filtroMesInicial) setMesesSelecionados([String(filtroMesInicial).padStart(2, '0')]);
  }, [filtroMesInicial]);

  // ── Restauração de filtros ao voltar de FinanciamentoDetalhe ──
  useEffect(() => {
    /* ⚠ DUAS FONTES, UMA PRECEDÊNCIA — FIN-LISTA-FILTROS-01a. O `return_filters` é o
       instantâneo de uma ida e volta declarada (abrir a OC e voltar), e leva TUDO, inclusive
       o que está no padrão: ele restaura uma tela específica. Os filtros ATIVOS da sessão são
       a memória geral, e só guardam o que difere do padrão. Quando os dois existem, o
       instantâneo vence — ele descreve a tela de onde o operador saiu há dois cliques.
       ⚠ E É UM EFEITO SÓ, de propósito: dois efeitos de restauração competindo pela mesma
       montagem dependeriam da ordem de declaração para decidir quem escreve por último. */
    const raw = sessionStorage.getItem('financeirov2_return_filters') ?? (() => {
      const ativos = lerFiltros();
      return ativos ? JSON.stringify(ativos) : null;
    })();
    if (!raw) return;
    try {
      const f = JSON.parse(raw);
      if (f.fazendaId !== undefined) setFazendaId(f.fazendaId);
      /* Compatibilidade com o que foi guardado antes da multisseleção: um `ano` solto vira
         lista de um. Sem isto, quem tem sessão aberta volta com a lista vazia = "Todos". */
      if (Array.isArray(f.anosSelecionados)) setAnosSelecionados(f.anosSelecionados);
      else if (f.ano !== undefined) setAnosSelecionados(f.ano === '__todos__' ? [] : [f.ano]);
      if (Array.isArray(f.mesesSelecionados)) setMesesSelecionados(f.mesesSelecionados);
      if (Array.isArray(f.statusSelecionados)) setStatusSelecionados(f.statusSelecionados.filter(isStatusFiltroFinanceiro));
      if (f.tipoOperacao !== undefined) setTipoOperacao(f.tipoOperacao);
      if (f.contaOrigem !== undefined) setContaOrigem(f.contaOrigem);
      if (f.contaDestino !== undefined) setContaDestino(f.contaDestino);
      if (f.macroFiltro !== undefined) setMacroFiltro(f.macroFiltro);
      if (f.grupoFiltro !== undefined) setGrupoFiltro(f.grupoFiltro);
      if (f.centroFiltro !== undefined) setCentroFiltro(f.centroFiltro);
      if (f.subcentroFiltro !== undefined) setSubcentroFiltro(f.subcentroFiltro);
      if (f.produtoFiltro !== undefined) setProdutoFiltro(f.produtoFiltro);
      if (f.documentoFiltro !== undefined) setDocumentoFiltro(f.documentoFiltro);
      if (f.fornecedorFiltro !== undefined) setFornecedorFiltro(f.fornecedorFiltro);
      if (f.atividadeFiltro !== undefined) setAtividadeFiltro(f.atividadeFiltro);
      if (f.safraFiltro !== undefined) setSafraFiltro(f.safraFiltro);
      if (f.culturaFiltro !== undefined) setCulturaFiltro(f.culturaFiltro);
    } catch (e) {
      console.error('[FinanceiroV2Tab] erro ao restaurar filtros:', e);
    } finally {
      sessionStorage.removeItem('financeirov2_return_filters');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ⚠ GUARDA SÓ O QUE ESTÁ ATIVO, a cada mudança — FIN-LISTA-FILTROS-01a.
   *
   * ⚠ ESTE EFEITO PRECISA VIR DEPOIS DO DE RESTAURAÇÃO, e a ordem é a correção inteira: os
   * dois rodam na montagem, e efeitos disparam na ordem em que são DECLARADOS. Declarado
   * antes, este veria o estado ainda no padrão, gravaria `{}` — que é o mesmo que apagar — e
   * a restauração leria um storage que ele acabou de limpar. O filtro guardado sumiria
   * exatamente no momento de ser usado, e o sintoma seria "nunca lembra".
   */
  useEffect(() => {
    const p = getDefaults();
    guardarFiltros(apenasAtivos(
      {
        fazendaId, anosSelecionados, mesesSelecionados, statusSelecionados, tipoOperacao,
        contaOrigem, contaDestino, macroFiltro, grupoFiltro, centroFiltro,
        subcentroFiltro, produtoFiltro, documentoFiltro, fornecedorFiltro, atividadeFiltro,
        safraFiltro,
        culturaFiltro,
      },
      {
        fazendaId: p.fazendaId, anosSelecionados: p.anosSelecionados, mesesSelecionados: p.mesesSelecionados,
        statusSelecionados: p.statusSelecionados, tipoOperacao: p.tipoOperacao,
        contaOrigem: p.contaOrigem, contaDestino: p.contaDestino, macroFiltro: p.macroFiltro,
        grupoFiltro: p.grupoFiltro, centroFiltro: p.centroFiltro, subcentroFiltro: p.subcentroFiltro,
        produtoFiltro: p.produtoFiltro, documentoFiltro: p.documentoFiltro,
        fornecedorFiltro: p.fornecedorFiltro, atividadeFiltro: p.atividadeFiltro,
        safraFiltro: p.safraFiltro,
        culturaFiltro: p.culturaFiltro,
      },
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, anosSelecionados, mesesSelecionados, statusSelecionados, tipoOperacao, contaOrigem,
      contaDestino, macroFiltro, grupoFiltro, centroFiltro, subcentroFiltro, produtoFiltro,
      documentoFiltro, fornecedorFiltro, atividadeFiltro, safraFiltro, culturaFiltro]);

  const abrirFinanciamentoDaParcela = async (l: any) => {
    const salvarEstado = () => sessionStorage.setItem('financeiro_v2_state', JSON.stringify({
      ano, mesesSelecionados, contaOrigem, contaDestino,
    }));

    // Captação: financiamento_id direto no lançamento
    if (l.financiamento_id && (l.origem_tipo === 'financiamento_captacao' || l.origem_lancamento === 'financiamento')) {
      if (!onAbrirFinanciamento) {
        toast.info('Este lançamento vem de financiamento. Abra pelo módulo de Financiamentos.');
        return;
      }
      salvarEstado();
      onAbrirFinanciamento(l.financiamento_id);
      return;
    }

    // Parcelas de amortização/juros: buscar em financiamento_parcelas
    const { data: parcela } = await supabase
      .from('financiamento_parcelas')
      .select('financiamento_id')
      .or(`lancamento_id.eq.${l.id},lancamento_juros_id.eq.${l.id}`)
      .maybeSingle();

    if (parcela?.financiamento_id) {
      if (!onAbrirFinanciamento) {
        toast.info('Este lançamento vem de financiamento. Abra pelo módulo de Financiamentos.');
        return;
      }
      salvarEstado();
      onAbrirFinanciamento(parcela.financiamento_id);
      return;
    }

    // Fallback: buscar em financiamentos por lancamento_captacao_id
    const { data: fin } = await supabase
      .from('financiamentos')
      .select('id')
      .eq('lancamento_captacao_id', l.id)
      .maybeSingle();

    if (fin?.id) {
      if (!onAbrirFinanciamento) {
        toast.info('Este lançamento vem de financiamento. Abra pelo módulo de Financiamentos.');
        return;
      }
      salvarEstado();
      onAbrirFinanciamento(fin.id);
      return;
    }

    toast.error('Vínculo de origem não encontrado para este lançamento.');
  };
  const [mesPopoverOpen, setMesPopoverOpen] = useState(false);
  // Track if macro/centro were auto-filled by subcentro
  const [macroLocked, setMacroLocked] = useState(false);

  const [mode, setMode] = useState<'list' | 'rapido'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanc, setEditingLanc] = useState<LancamentoV2 | null>(null);
  // PR-OC-FIN-EDIT-FIX-02 — libera favorecido do título OC só nesta abertura (fluxo "Editar" da OC).
  const [favOCEdit, setFavOCEdit] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // PR-FIN-V2-AÇÕES-LOTE-01 — "Marcar realizado" em lote.
  const [confirmRealizarOpen, setConfirmRealizarOpen] = useState(false);
  const [bulkRealizando, setBulkRealizando] = useState(false);
  const [dataPagamentoModo, setDataPagamentoModo] = useState<'vencimento' | 'unica'>('vencimento');
  const [dataPagamentoUnica, setDataPagamentoUnica] = useState('');

  // Sorting state
   // PR-FIN-GRADE-DATAS-03 — 'data' = competência; 'venc' e 'pgto' são colunas independentes (nunca fundidas).
   type SortField = 'default' | 'data' | 'venc' | 'pgto' | 'valor' | 'produto' | 'fornecedor' | 'centro' | 'status' | 'doc' | 'safra';
  type SortDir = 'asc' | 'desc';
   const [sortField, setSortField] = useState<SortField>('default');
   const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fazOperacionais = useMemo(() => sortFazendas(fazendas.filter(f => f.id !== '__global__')), [fazendas]);

  const sortedContas = useMemo(() => sortContas(hook.contasBancarias), [hook.contasBancarias]);
  /* ⚠ A CONTA TEM DOIS NOMES no cadastro: `nome_exibicao` é o que o operador lê nas telas e
     `nome_conta` é o interno. A precedência é a mesma do resto do repo, e fica AQUI porque
     as duas montagens do menu de exportar precisam dela — inline nas duas, seria a chance de
     divergirem. */
  const contasParaExportar = useMemo(
    () => hook.contasBancarias.map(c => ({ id: c.id, nome: c.nome_exibicao || c.nome_conta })),
    [hook.contasBancarias]);

  const isEntrada = tipoOperacao === '1-Entradas';
  const isSaida = tipoOperacao === '2-Saídas';
  const isTransf = tipoOperacao === '3-Transferências';

  // === Cascading classification filters: Tipo → Macro → Grupo → Centro → Subcentro ===
  const filteredByTipo = useMemo(() => {
    if (tipoOperacao === '__all__') return hook.classificacoes;
    return hook.classificacoes.filter(c => c.tipo_operacao === tipoOperacao);
  }, [hook.classificacoes, tipoOperacao]);

  const macrosUnicos = useMemo(() => {
    const set = new Set(filteredByTipo.map(c => c.macro_custo).filter(Boolean));
    return sortMacros(Array.from(set));
  }, [filteredByTipo]);

  const filteredByMacro = useMemo(() => {
    if (macroFiltro === '__all__') return filteredByTipo;
    return filteredByTipo.filter(c => c.macro_custo === macroFiltro);
  }, [filteredByTipo, macroFiltro]);

  const gruposUnicos = useMemo(() => {
    const set = new Set(filteredByMacro.map(c => c.grupo_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByMacro]);

  const filteredByGrupo = useMemo(() => {
    if (grupoFiltro === '__all__') return filteredByMacro;
    return filteredByMacro.filter(c => c.grupo_custo === grupoFiltro);
  }, [filteredByMacro, grupoFiltro]);

  const centrosUnicos = useMemo(() => {
    const set = new Set(filteredByGrupo.map(c => c.centro_custo).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByGrupo]);

  const filteredByCentro = useMemo(() => {
    if (centroFiltro === '__all__') return filteredByGrupo;
    return filteredByGrupo.filter(c => c.centro_custo === centroFiltro);
  }, [filteredByGrupo, centroFiltro]);

  const subcentrosUnicos = useMemo(() => {
    const set = new Set(filteredByCentro.map(c => c.subcentro).filter(Boolean));
    return Array.from(set).sort();
  }, [filteredByCentro]);

  // Auto-clear invalid downstream filters when upstream changes
  useEffect(() => {
    if (macroFiltro !== '__all__' && !macrosUnicos.includes(macroFiltro)) {
      setMacroFiltro('__all__'); setMacroLocked(false);
    }
  }, [macrosUnicos, macroFiltro]);

  useEffect(() => {
    if (grupoFiltro !== '__all__' && !gruposUnicos.includes(grupoFiltro)) {
      setGrupoFiltro('__all__');
    }
  }, [gruposUnicos, grupoFiltro]);

  useEffect(() => {
    if (centroFiltro !== '__all__' && !centrosUnicos.includes(centroFiltro)) {
      setCentroFiltro('__all__');
    }
  }, [centrosUnicos, centroFiltro]);

  useEffect(() => {
    if (subcentroFiltro !== '__all__' && !subcentrosUnicos.includes(subcentroFiltro)) {
      setSubcentroFiltro('__all__');
    }
  }, [subcentrosUnicos, subcentroFiltro]);

  /**
   * O QUE DEVOLVER AOS PAIS QUANDO O SUBCENTRO SAIR — FIN-CABECALHO-CASCATA-01.
   *
   * ⚠ ESTA É A PEÇA QUE FALTAVA NO FIN-LISTA-FILTROS-01a, e o comentário de lá enunciou o
   * problema sem resolvê-lo: limpar o subcentro NÃO podia apagar Macro/Grupo/Centro às cegas,
   * porque eles podiam ter sido escolhidos à mão — mas também não podia deixá-los presos,
   * porque na maioria das vezes foi o próprio subcentro que os trouxe. Faltava saber QUEM
   * PREENCHEU QUEM.
   * ⚠ UM RETRATO, NÃO TRÊS FLAGS. Em vez de marcar cada campo como manual ou automático,
   * guarda-se o que os três valiam ANTES do auto-preenchimento: cancelar devolve o retrato.
   * Se não havia nada, os três voltam a "Todos" — que é o caso 1 da homologação; se o Macro
   * estava escolhido à mão, ele volta — que é o caso 2. Uma estrutura, dois comportamentos,
   * nenhum estado a manter sincronizado.
   * ⚠ O RETRATO SÓ SE TIRA UMA VEZ: trocar de subcentro A para B não o sobrescreve, senão o
   * segundo salvaria o auto-preenchimento do primeiro como se fosse escolha do operador.
   */
  const restaurarPlanoRef = useRef<{ macro: string; grupo: string; centro: string } | null>(null);

  // Subcentro selection: auto-fill macro + grupo + centro
  const handleSubcentroChange = (val: string) => {
    setSubcentroFiltro(val);
    if (val !== '__all__') {
      const match = hook.classificacoes.find(c => c.subcentro === val);
      if (match) {
        if (!restaurarPlanoRef.current) {
          restaurarPlanoRef.current = { macro: macroFiltro, grupo: grupoFiltro, centro: centroFiltro };
        }
        setMacroFiltro(match.macro_custo || '__all__');
        setGrupoFiltro(match.grupo_custo || '__all__');
        setCentroFiltro(match.centro_custo || '__all__');
        setMacroLocked(true);
      }
    } else {
      /* ⚠ CANCELAR REVERTE O QUE AQUELA ESCOLHA CAUSOU, e só isso: os pais voltam ao que
         eram antes do subcentro entrar. O que ele trouxe some com ele; o que o operador
         tinha fixado à mão fica. A cascata para baixo (o "x" do Macro limpa os filhos) não
         muda. */
      const anterior = restaurarPlanoRef.current;
      setMacroFiltro(anterior?.macro ?? '__all__');
      setGrupoFiltro(anterior?.grupo ?? '__all__');
      setCentroFiltro(anterior?.centro ?? '__all__');
      restaurarPlanoRef.current = null;
      setMacroLocked(false);
    }
  };

  // Apply drill filters from FluxoCaixa navigation
  useEffect(() => {
    if (!drillFilters) return;
    /* O drill do Fluxo de Caixa manda UM ano — vira lista de um. */
    if (drillFilters.ano) setAnosSelecionados([String(drillFilters.ano)]);
    if (drillFilters.mes) setMesesSelecionados([String(drillFilters.mes).padStart(2, '0')]);
    if (drillFilters.tipo) setTipoOperacao(drillFilters.tipo);
    if (drillFilters.statusTransacao && isStatusFiltroFinanceiro(drillFilters.statusTransacao)) setStatusSelecionados([drillFilters.statusTransacao]);
    if (drillFilters.macro) setMacroFiltro(drillFilters.macro);
    if (drillFilters.grupo) setGrupoFiltro(drillFilters.grupo);
    if (drillFilters.centro) setCentroFiltro(drillFilters.centro);
    if (drillFilters.subcentro) setSubcentroFiltro(drillFilters.subcentro);
    setFazendaId('__all__'); // Fluxo de Caixa is always global
  }, []); // Run once on mount

  // PR-VENDA-V2-FINVINC-ABRIR-POR-LANCAMENTO-B1: abre lançamento alvo recebido
  // por prop assim que o componente recebe um id válido. Resolve direto por
  // SELECT.eq(id) (sem depender de lista/paginação/filtros). null = silencioso,
  // mas ainda chama onLancamentoAlvoConsumido pra não prender o alvo no pai.
  useEffect(() => {
    if (!lancamentoIdAlvo) return;
    let cancelado = false;
    (async () => {
      const obj = await hook.buscarLancamentoPorId(lancamentoIdAlvo);
      if (cancelado) return;
      if (obj) openEdit(obj, ocEditFavorecido === true);   // PR-OC-FIN-EDIT-FIX-02 — libera favorecido só via "Editar" da OC
      onLancamentoAlvoConsumido?.();
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentoIdAlvo]);

  useEffect(() => {
    hook.loadContas();
    hook.loadClassificacoes();
    hook.loadFornecedores();
    hook.loadSafras();
  }, [hook.loadContas, hook.loadClassificacoes, hook.loadFornecedores, hook.loadSafras]);

  useEffect(() => {
    if (fazendaAtual && fazendaAtual.id !== '__global__') {
      setFazendaId(fazendaAtual.id);
    }
  }, [fazendaAtual]);

  /* A tradução para o banco: `conciliado_real` vira 'realizado', e o recorte
     fino fica para o cliente. `Set` porque marcar "Realizado" e "Conciliado"
     juntos não pode pedir 'realizado' duas vezes. */
  const statusParaBanco = useMemo(
    () => [...new Set(statusSelecionados.map(s => s === 'conciliado_real' ? 'realizado' : s))],
    [statusSelecionados],
  );
  
  const filtros: FiltrosV2 = useMemo(() => ({
    fazenda_id: fazendaId !== '__all__' ? fazendaId : undefined,
    ano,
    /* `anos` tem precedência no plano; `ano` segue indo para quem ainda o lê. */
    anos: anosSelecionados.length > 0 ? anosSelecionados : undefined,
    mes: mesesSelecionados.length === 0 ? 'todos' : undefined,
    meses: mesesSelecionados.length > 0 ? mesesSelecionados : undefined,
    conta_bancaria_id: contaOrigem !== '__all__' ? contaOrigem : undefined,
    conta_destino_id: contaDestino !== '__all__' ? contaDestino : undefined,
    tipo_operacao: tipoOperacao !== '__all__' ? tipoOperacao : undefined,
    /* ⚠ `conciliado_real` NÃO EXISTE NO BANCO — LANC-STATUS-LISTA-UNICA-01.
       Ele é derivado do vínculo, então a consulta pede 'realizado' e o
       recorte acontece depois, sobre o mapa. Mandá-lo cru devolveria zero
       linhas: o filtro pareceria funcionar e a lista viria vazia. */
    status_transacoes: statusParaBanco.length > 0 ? statusParaBanco : undefined,
    macro_custo: macroFiltro !== '__all__' ? macroFiltro : undefined,
    grupo_custo: grupoFiltro !== '__all__' ? grupoFiltro : undefined,
    centro_custo: centroFiltro !== '__all__' ? centroFiltro : undefined,
    subcentro: subcentroFiltro !== '__all__' ? subcentroFiltro : undefined,
    /* ⚠ TRÊS FILTROS QUE ERAM SÓ DE MEMÓRIA PASSAM A IR AO `WHERE` — FIN-LISTA-PERF-01. Sem
       isto, "Wilson + Todos os anos" lia as 30 mil linhas para mostrar trinta: o filtro
       parecia rápido porque a lista era curta, e o custo estava todo na ida.
       ⚠ OS SLOTS JÁ EXISTIAM (`lista_fornecedor_id`, `lista_produto`) e os dois builders já os
       aplicavam — eram dos "seis filtros" do caminho paginado. Faltava a tela preenchê-los.
       ⚠ `safra_id` SÓ QUANDO É UM ID: "sem safra" fica em memória, porque `safra_id IS NULL` é
       a maioria da base e mandá-lo não pouparia uma linha.
       ⚠ E OS TRÊS CONTINUAM SENDO RECONFERIDOS EM MEMÓRIA, como todos os outros — é a mesma
       simetria do `casaTipoOperacao`: o servidor recorta, a tela confere. */
    lista_fornecedor_id: fornecedorFiltro !== '__all__' ? fornecedorFiltro : undefined,
    lista_produto: produtoFiltro.trim() || undefined,
    safra_id: (safraFiltro !== '__all__' && safraFiltro !== SEM_SAFRA) ? safraFiltro : undefined,
    /* ⚠ MESMA REGRA DA SAFRA: só o valor vai ao servidor; "Sem cultura" (`IS NULL`) é a base
       inteira hoje e fica peneirado em memória. */
    cultura: (culturaFiltro !== '__all__' && culturaFiltro !== SEM_CULTURA) ? culturaFiltro : undefined,
    dimensao: dataPor,   // PR-FIN-GRADE-DATAS-03 — dimensão temporal soberana (default 'financeira')
  }), [fazendaId, ano, anosSelecionados, mesesSelecionados, contaOrigem, contaDestino, tipoOperacao, statusParaBanco, macroFiltro, grupoFiltro, centroFiltro, subcentroFiltro, fornecedorFiltro, produtoFiltro, safraFiltro, culturaFiltro, dataPor]);

  /**
   * ⚠ A CONSULTA QUE NINGUÉM PEDE NÃO ACONTECE — FIN-LISTA-PERF-01.
   *
   * Sem nenhum filtro que corte de verdade, a lista leria 30.065 linhas do NJ em 31
   * requisições em série. O operador nunca quer isso: ele cai nisso ao limpar o Ano para
   * procurar outra coisa, e a tela trava antes de ele chegar ao filtro seguinte.
   * ⚠ A REGRA MORA EM `filtroLimitante`, fora da tela, porque ela precisa concordar com o
   * `WHERE`: só conta o que vai ao servidor. Uma regra escrita aqui divergiria do predicado
   * no primeiro filtro novo, e a defesa viraria teatro.
   */
  const podeConsultar = useMemo(() => temFiltroLimitante({
    anos: anosSelecionados, meses: mesesSelecionados, safra: safraFiltro, cultura: culturaFiltro,
    fornecedor: fornecedorFiltro, produto: produtoFiltro,
    contaOrigem, contaDestino, centro: centroFiltro, subcentro: subcentroFiltro,
  }), [anosSelecionados, mesesSelecionados, safraFiltro, culturaFiltro, fornecedorFiltro, produtoFiltro,
       contaOrigem, contaDestino, centroFiltro, subcentroFiltro]);

  useEffect(() => {
    /* ⚠ NÃO CONSULTAR É UMA DECISÃO, e ela precisa LIMPAR a lista: deixar as linhas do filtro
       anterior na tela enquanto a frase pede um filtro novo seria a mesma mentira que o token
       monotônico acabou de matar — a tela dizendo uma coisa e mostrando outra. */
    if (!podeConsultar) { hook.limparLancamentos(); return; }
    hook.loadLancamentos(filtros, 0);
  }, [filtros, podeConsultar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
  }, [filtros, produtoFiltro, documentoFiltro, fornecedorFiltro, atividadeFiltro]);

  const handlePageChange = (p: number) => setCurrentPage(p);

  const handleSave = async (form: any, id?: string) => {
    // Validação obrigatória antes de salvar
    // Regra 4 (Aporte Pessoal) só se aplica em novos registros (sem id)
    const formParaValidar = id
      ? { ...form, origem_lancamento: undefined, origem: undefined }
      : form;
    const errosValidacao = validarLancamento(formParaValidar);
    if (errosValidacao.length > 0) {
      errosValidacao.forEach(e => {
        toast.error(e.mensagem);
      });
      return false;
    }

    /* ⚠ SALVAR NÃO RECARREGA MAIS A LISTA — PR-FIN-SAVE-LENTO-01. O `loadLancamentos` que
       morava aqui relia TUDO o que casa o filtro, em levas de 1.000: cinco idas em série
       para os 4.850 lançamentos de 2026 do NJ, e o modal só fechava depois da última. O
       UPDATE leva 20ms; o resto era espera pura.
       ⚠ E O `hook.lancamentos.find(...)` QUE HAVIA AQUI LIA O ESTADO VELHO. Ele rodava logo
       depois do `await loadLancamentos`, e `useState` não atualiza de forma síncrona — o
       log sempre mostrou o lançamento ANTERIOR, desde que foi escrito. Saiu com a recarga. */
    const salvo = id ? await hook.editarLancamento(id, form) : await hook.criarLancamento(form);
    if (!salvo) return false;

    /* ⚠ EDITAR NÃO RECARREGA NADA — e é o gesto de todo dia, o que motivou este PR. O
       `editarLancamento` já trocou a linha no estado com o que os TRIGGERS gravaram: o hook
       lê a linha de volta no mesmo `select` de verificação que sempre existiu ali, e aplica
       os campos sobre a linha da lista. Zero requisições além do save.
       ⚠ CRIAR CONTINUA RECARREGANDO, e de propósito. A linha nova pode ou não entrar no
       recorte, e quem sabe isso é o filtro — mas o `criarLancamento` não devolve o id, então
       não há o que perguntar. Recarregar é o certo aqui: criar é raro, o resultado tem de
       aparecer na posição certa da ordenação, e errar por omissão seria a linha sumir. */
    if (!id) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
    return true;
  };
  const handleDelete = async (id: string) => {
    const ok = await hook.excluirLancamento(id);
    if (ok) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
    return ok;
  };
  const handleDuplicate = async (lanc: LancamentoV2) => {
    const ok = await hook.duplicarLancamento(lanc);
    if (ok) {
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      await hook.loadLancamentos(filtros, hook.page);
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
  };

  // ── Bulk selection helpers (defined after sortedLancamentos via lazy refs) ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openNew = () => { setEditingLanc(null); setDialogOpen(true); };
  const openEdit = (l: LancamentoV2, permiteFavOC = false) => {
    console.log('[FinV2] reopen edit object', {
      id: l.id,
      tipo_operacao: l.tipo_operacao,
      conta_bancaria_id: l.conta_bancaria_id,
      conta_destino_id: l.conta_destino_id,
      status_transacao: l.status_transacao,
      origem_lida_de: 'conta_bancaria_id',
      destino_lido_de: 'conta_destino_id',
    });
    setFavOCEdit(permiteFavOC);   // PR-OC-FIN-EDIT-FIX-02 — só o fluxo "Editar" da OC passa true
    setEditingLanc(l);
    setDialogOpen(true);
  };

  // PR-OC-FIN-EDIT-FIX-02 — abre a OC vinculada na aba Financeiro preservando os filtros atuais
  //   (salvos no mesmo mecanismo já consumido pela restauração de retorno). Sem novo mecanismo.
  const abrirOCFinanceiro = (operacaoId: string) => {
    try {
      sessionStorage.setItem('financeirov2_return_filters', JSON.stringify({
        fazendaId, anosSelecionados, mesesSelecionados, statusSelecionados, tipoOperacao,
        contaOrigem, contaDestino, macroFiltro, grupoFiltro, centroFiltro,
        subcentroFiltro, produtoFiltro, documentoFiltro, fornecedorFiltro, atividadeFiltro, safraFiltro,
      }));
    } catch (e) {
      console.error('[FinanceiroV2Tab] erro ao salvar filtros de retorno:', e);
    }
    onAbrirOperacaoOCFinanceiro?.(operacaoId);
  };

  /* O código da safra por id, como a fazenda e o fornecedor: mapa dos catálogos já
     carregados, resolvido no RENDER. A linha carrega o id; o texto é da tela. */
  /* Nome curto da conta, para as duas colunas do modo Ampliado. Mesma via da fazenda: mapa
     do catálogo já carregado, resolvido no render. */
  const contaNomeMap = useMemo(
    () => new Map((hook.contasBancarias ?? []).map(c => [c.id, c.nome_exibicao || c.nome_conta])),
    [hook.contasBancarias],
  );

  /**
   * As safras que o filtro oferece — FIN-LISTA-LAYOUT-02 item 3.
   *
   * ⚠ O DROPDOWN SEGUE A ATIVIDADE, como a lista de subcentros do modal segue o card: com
   * "Pecuária" escolhida, uma safra de amendoim na lista é uma combinação que a tela sabe
   * que devolve zero. Mostrar o impossível é convidar a testá-lo.
   * ⚠ "Todas" NÃO FILTRA NADA, e é o estado em que se vê tudo — inclusive para caçar o
   * cruzado (safra de lavoura em lançamento de pecuária), que é um uso real.
   */
  const safrasDoFiltro = useMemo(() => {
    const todas = hook.safras ?? [];
    if (atividadeFiltro === '__all__') return todas;
    return todas.filter(sf => (sf.escopo_negocio || '') === atividadeFiltro);
  }, [hook.safras, atividadeFiltro]);

  /**
   * ⚠ TROCAR A ATIVIDADE LIMPA A SAFRA QUE DEIXOU DE PERTENCER. Um filtro ativo apontando
   * para uma opção que sumiu do dropdown é estado fantasma: a lista vem vazia e o motivo não
   * está em lugar nenhum da tela. É a mesma regra do card do modal, que apaga o subcentro de
   * outro escopo em vez de escondê-lo.
   * ⚠ "Sem safra" SOBREVIVE A QUALQUER ATIVIDADE: ele não é uma safra, é a ausência delas.
   */
  useEffect(() => {
    if (safraFiltro === '__all__' || safraFiltro === SEM_SAFRA) return;
    if (!safrasDoFiltro.some(sf => sf.id === safraFiltro)) setSafraFiltro('__all__');
  }, [safrasDoFiltro, safraFiltro]);

  /**
   * ⚠ A CULTURA SÓ EXISTE NA LAVOURA — FIN-AUDITORIA-CULTURA-01. Escolher "Pecuária" com
   * "Mandioca" ativo devolveria zero linhas e a tela não teria como explicar por quê: o campo
   * nem estaria visível para o operador desfazer. Mesma regra do subcentro de outro escopo no
   * modal — limpar é a única saída que não deixa estado fantasma.
   */
  const mostraCultura = atividadeFiltro === '__all__' || atividadeFiltro === 'agricultura';
  useEffect(() => {
    if (!mostraCultura && culturaFiltro !== '__all__') setCulturaFiltro('__all__');
  }, [mostraCultura, culturaFiltro]);

  const safraCodigoMap = useMemo(
    () => new Map((hook.safras ?? []).map(s => [s.id, s.codigo || s.nome])),
    [hook.safras],
  );

  const fornecedoresMap = useMemo(
    () => new Map(hook.fornecedores.map(f => [f.id, f.nome])),
    [hook.fornecedores],
  );

  const fazendaNameMap = useMemo(
    () => new Map(fazOperacionais.map(f => [f.id, f.nome])),
    [fazOperacionais],
  );
  const fazendaCodigoMap = useMemo(
    () => new Map(fazOperacionais.map(f => [f.id, f.codigo])),
    [fazOperacionais],
  );

  // Derive atividade from escopo_negocio (official field from plano de contas)
  // PR-FIN-LISTA-VENCIMENTO-03 · 2C-1 — regra unica, compartilhada com o modulo
  //   de filtros server-side, para que tela e servidor nao possam divergir.
  const getAtividade = (l: LancamentoV2): string => normalizarAtividade(l.escopo_negocio);

  // Build grupo_custo lookup from classificacoes (centro_custo → grupo_custo)
  const centroToGrupo = useMemo(() => {
    const map = new Map<string, string>();
    hook.classificacoes.forEach(c => {
      if (c.centro_custo && c.grupo_custo) map.set(c.centro_custo, c.grupo_custo);
    });
    return map;
  }, [hook.classificacoes]);

  const filteredLancamentos = useMemo(() => {
    let items = hook.lancamentos;

    // Directional conta filtering:
    const hasContaOrigem = contaOrigem && contaOrigem !== '__all__';
    const hasContaDestino = contaDestino && contaDestino !== '__all__';

    if (hasContaOrigem && !hasContaDestino) {
      items = items.filter(l => l.sinal < 0 || isTransferenciaTipo(l.tipo_operacao));
    } else if (hasContaDestino && !hasContaOrigem) {
      items = items.filter(l => l.sinal > 0 || isTransferenciaTipo(l.tipo_operacao));
    }

    if (produtoFiltro.trim()) {
      const q = produtoFiltro.toLowerCase();
      items = items.filter(l => l.descricao?.toLowerCase().includes(q));
    }
    if (documentoFiltro.trim()) {
      // Busca no número do documento (coluna DOC) e no documento formatado (tipo + número,
      // mesmo valor do tooltip via formatDocCompleto). Case-insensitive, substring.
      const q = documentoFiltro.toLowerCase();
      items = items.filter(l =>
        (l.numero_documento || '').toLowerCase().includes(q) ||
        formatDocCompleto(l).toLowerCase().includes(q));
    }
    if (fornecedorFiltro !== '__all__') {
      items = items.filter(l => l.favorecido_id === fornecedorFiltro);
    }
    /* ⚠ O TIPO PASSA A SER CONFERIDO AQUI TAMBÉM — FIN-LISTA-ORDENA-FILTRO-01. Ele era o
       ÚNICO filtro da barra aplicado só no servidor: conta, produto, documento, fornecedor,
       atividade, safra, grupo e status já eram reconferidos em memória. A assimetria era
       invisível até uma carga chegar sem o predicado — e aí a tela mostrava, sob "Tipo =
       Transferências", 9.366 linhas de dois anos inteiros, entre elas amortização e ajuste de
       caixa. Com a conferência dos dois lados, nenhum gesto da tela (ordenar, paginar,
       recarregar por notificação) consegue trazer de volta o que o filtro excluiu.
       ⚠ E A REGRA É A MESMA DO SERVIDOR, `casaTipoOperacao`, não uma segunda comparação: duas
       definições de "isto é transferência?" divergiriam na grafia legada. */
    if (tipoOperacao !== '__all__') {
      items = items.filter(l => casaTipoOperacao(tipoOperacao, l.tipo_operacao));
    }
    if (atividadeFiltro !== '__all__') {
      items = items.filter(l => getAtividade(l) === atividadeFiltro);
    }
    /* ⚠ "Sem safra" NÃO É "todas": é a pergunta oposta, e é a que acha o que está torto.
       Financiamento de investimento e administrativo não têm safra por regra (FIN-SAFRA-ADM-01,
       FIN-FINANCIAMENTO-SAFRA-01); quem aparecer AQUI com safra é candidato a correção. */
    if (safraFiltro === SEM_SAFRA) {
      items = items.filter(l => !l.safra_id);
    } else if (safraFiltro !== '__all__') {
      items = items.filter(l => l.safra_id === safraFiltro);
    }
    /* ⚠ O SERVIDOR RECORTA, A TELA CONFERE — a mesma simetria da safra e do `casaTipoOperacao`.
       "Sem cultura" é peneirado SÓ aqui, porque `cultura IS NULL` não vai ao `WHERE`. */
    if (culturaFiltro === SEM_CULTURA) {
      items = items.filter(l => !l.cultura);
    } else if (culturaFiltro !== '__all__') {
      items = items.filter(l => l.cultura === culturaFiltro);
    }
    // grupo_custo now is a DB column — filter directly
    if (grupoFiltro !== '__all__') {
      items = items.filter(l => (l as any).grupo_custo === grupoFiltro);
    }

    /* ⚠ REALIZADO E CONCILIADO SÃO PARTIÇÕES DO MESMO CONJUNTO —
       LANC-STATUS-LISTA-UNICA-01. O banco devolveu todos os 'realizado'; aqui
       eles se dividem pelo vínculo: sem vínculo fica em "Realizado", com
       vínculo em "Conciliado". Marcar os dois lista todos — e é isso que faz
       a soma fechar.
       ⚠ SÓ RECORTA QUANDO A ESCOLHA DISCRIMINA: marcados os dois (ou nenhum),
       não há o que separar, e filtrar seria trabalho para chegar ao mesmo
       lugar.
       ⚠ O LEGADO NÃO ENTRA EM NENHUM DOS DOIS: as 574 linhas com status
       'conciliado' sem vínculo não são conciliadas (não há vínculo) nem
       realizadas (o status não é 'realizado'). São um terceiro caso, e
       forçá-las num deles faria o filtro afirmar algo que ninguém verificou.
       Aparecem em "Todos", rotuladas como legado. */
    const querRealizado = statusSelecionados.includes('realizado');
    const querConciliado = statusSelecionados.includes('conciliado_real');
    if (querRealizado !== querConciliado) {
      items = items.filter(l => {
        if ((l.status_transacao || '').toLowerCase() !== 'realizado') return true;
        return querConciliado ? conciliados.has(l.id) : !conciliados.has(l.id);
      });
    }

    return items;
  }, [hook.lancamentos, contaOrigem, contaDestino, produtoFiltro, documentoFiltro, fornecedorFiltro, tipoOperacao, atividadeFiltro, safraFiltro, culturaFiltro, grupoFiltro, centroToGrupo, statusSelecionados, conciliados]);

  const compareDefaultOrder = useCallback((a: LancamentoV2, b: LancamentoV2) => {
    // PR-FIN-GRADE-DATAS-03 — a ordenação padrão acompanha a dimensão selecionada (Data por). Chave
    //   primária = data da dimensão (financeira = COALESCE(pagamento, vencimento)); linhas sem essa data
    //   vão para o fim ('9999-12-31'). Desempate estável e temporal: data_competencia → id (sem fornecedor/
    //   produto/valor, para garantir estabilidade determinística do contrato aprovado).
    const dataA = dataDaDimensao(a, dataPor) || '9999-12-31';
    const dataB = dataDaDimensao(b, dataPor) || '9999-12-31';
    const dataCmp = dataA.localeCompare(dataB);
    if (dataCmp !== 0) return dataCmp;

    const compCmp = (a.data_competencia || '').localeCompare(b.data_competencia || '');
    if (compCmp !== 0) return compCmp;

    return a.id.localeCompare(b.id);
  }, [dataPor]);

  // Sorted lancamentos
  const sortedLancamentos = useMemo(() => {
    const items = [...filteredLancamentos];
    items.sort((a, b) => {
      if (sortField === 'default') {
        return compareDefaultOrder(a, b);
      }

      const dir = sortDir === 'asc' ? 1 : -1;
      let primary = 0;

      switch (sortField) {
        case 'data':
          primary = dir * a.data_competencia.localeCompare(b.data_competencia);
          break;
        case 'venc':
          // PR-FIN-GRADE-DATAS-03 — coluna VENC. ordena SÓ por data_vencimento (nunca fundido com pagamento).
          primary = dir * ((a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
          break;
        case 'pgto':
          // PR-FIN-GRADE-DATAS-03 — coluna PGTO. ordena SÓ por data_pagamento (nunca fundido com vencimento).
          primary = dir * ((a.data_pagamento || '').localeCompare(b.data_pagamento || ''));
          break;
        case 'valor':
          primary = dir * ((a.valor * a.sinal) - (b.valor * b.sinal));
          break;
        case 'produto':
          primary = dir * (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
          break;
        case 'fornecedor': {
          const nA = fornecedoresMap.get(a.favorecido_id || '') || '';
          const nB = fornecedoresMap.get(b.favorecido_id || '') || '';
          primary = dir * nA.localeCompare(nB, 'pt-BR');
          break;
        }
        case 'safra': {
          /* ⚠ ORDENA PELO CÓDIGO EXIBIDO, não pelo id: "25/26-AMD" ordena como texto e
             agrupa por temporada, que é como o operador lê a coluna. Ordenar por uuid
             agruparia por nada.
             ⚠ E O "SEM SAFRA" VAI PARA O FIM nos dois sentidos, como o "(Sem X)" do
             drill-down: ele é o resto, não o primeiro nem o último alfabético. */
          const cA = a.safra_id ? (safraCodigoMap.get(a.safra_id) || '') : '';
          const cB = b.safra_id ? (safraCodigoMap.get(b.safra_id) || '') : '';
          if (!cA && !cB) primary = 0;
          else if (!cA) primary = 1;
          else if (!cB) primary = -1;
          else primary = dir * cA.localeCompare(cB, 'pt-BR');
          break;
        }
        case 'centro':
          primary = dir * (a.centro_custo || '').localeCompare(b.centro_custo || '', 'pt-BR');
          break;
        case 'status':
          primary = dir * (a.status_transacao || '').localeCompare(b.status_transacao || '', 'pt-BR');
          break;
        case 'doc':
          // Ordena pelo número do documento exibido na coluna DOC (mesmo valor de formatNF).
          primary = dir * (a.numero_documento || '').localeCompare(b.numero_documento || '', 'pt-BR');
          break;
        default:
          primary = 0;
      }

      if (primary !== 0) return primary;
      return compareDefaultOrder(a, b);
    });
    return items;
  }, [filteredLancamentos, sortField, sortDir, compareDefaultOrder, fornecedoresMap, safraCodigoMap]);

  const totalLancamentosFiltrados = sortedLancamentos.length;

  // ───────────────────────────────────────────────────────────────────────────
  // PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — rascunho x aplicado, atras da flag.
  //
  //   flag OFF  nada disto entra em cena: os campos continuam consultando a cada
  //             tecla e a grade continua pintando `sortedLancamentos`.
  //   flag ON   os campos alimentam o RASCUNHO; a lista, o count, os totais, a
  //             exportacao e o cancelamento leem o APLICADO, que so muda em
  //             "Aplicar filtros" ou "Limpar".
  // ───────────────────────────────────────────────────────────────────────────
  const LISTA_V2 = FEATURE_FLAGS.LISTA_PAGINADA_V2;
  const [estadoLista, despacharLista] = useReducer(reduzirLista, ESTADO_INICIAL);

  // O rascunho e alimentado pelos MESMOS campos da tela. Com a flag OFF este
  // efeito e inerte: ninguem le `estadoLista`.
  useEffect(() => {
    if (!LISTA_V2) return;
    const atual: FiltrosEditaveis = {
      contaOrigem, contaDestino,
      produto: produtoFiltro, documento: documentoFiltro,
      fornecedor: fornecedorFiltro, atividade: atividadeFiltro, grupo: grupoFiltro,
      incluirSemVencimento: estadoLista.rascunho.incluirSemVencimento,
    };
    (Object.keys(atual) as (keyof FiltrosEditaveis)[]).forEach((campo) => {
      if (estadoLista.rascunho[campo] !== atual[campo]) {
        despacharLista({ tipo: 'editar', campo, valor: atual[campo] });
      }
    });
  }, [LISTA_V2, contaOrigem, contaDestino, produtoFiltro, documentoFiltro,
      fornecedorFiltro, atividadeFiltro, grupoFiltro, estadoLista.rascunho]);

  // Filtros que a lista, os totais e a exportacao enxergam.
  //   flag ON  -> o APLICADO
  //   flag OFF -> o estado corrente, como sempre foi
  const filtrosAplicados = useMemo(() => filtrosAplicadosDaLista(
    filtros,
    LISTA_V2 ? estadoLista.aplicado : {
      contaOrigem, contaDestino,
      produto: produtoFiltro, documento: documentoFiltro,
      fornecedor: fornecedorFiltro, atividade: atividadeFiltro, grupo: grupoFiltro,
    },
  ), [filtros, LISTA_V2, estadoLista.aplicado, contaOrigem, contaDestino,
      produtoFiltro, documentoFiltro, fornecedorFiltro, atividadeFiltro, grupoFiltro]);

  const incluirSemVencimentoAplicado = LISTA_V2
    ? estadoLista.aplicado.incluirSemVencimento === true
    : false;

  // Consulta paginada: dispara SO quando o aplicado ou a pagina mudam.
  useEffect(() => {
    if (!LISTA_V2) return;
    hook.carregarPagina(filtrosAplicados, {
      pagina: estadoLista.pagina,
      incluirSemVencimento: incluirSemVencimentoAplicado,
    });
  }, [LISTA_V2, filtrosAplicados, estadoLista.pagina, incluirSemVencimentoAplicado]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendenteAplicar = LISTA_V2 && temPendencias(estadoLista);
  const paginacao = useMemo(
    () => calcularPaginacao(hook.listaTotal, estadoLista.pagina, TAMANHO_PAGINA_LISTA),
    [hook.listaTotal, estadoLista.pagina],
  );

  // Count encolheu e a pagina atual passou do fim: reposiciona na ultima real.
  useEffect(() => {
    if (!LISTA_V2) return;
    if (paginacao.pagina !== estadoLista.pagina) {
      despacharLista({ tipo: 'pagina', pagina: paginacao.pagina });
    }
  }, [LISTA_V2, paginacao.pagina, estadoLista.pagina]);

  const handleAplicarFiltros = useCallback(() => despacharLista({ tipo: 'aplicar' }), []);
  // `handleLimparFiltros` e declarado mais abaixo no componente; a ref evita a
  // dependencia circular sem duplicar a logica de limpeza dos campos.
  const limparCamposRef = useRef<() => void>(() => {});
  const handleLimparLista = useCallback(() => {
    limparCamposRef.current();
    despacharLista({ tipo: 'limpar' });
  }, []);
  const handleToggleSemVencimento = useCallback(() => {
    despacharLista({
      tipo: 'editar', campo: 'incluirSemVencimento',
      valor: !estadoLista.rascunho.incluirSemVencimento,
    });
  }, [estadoLista.rascunho.incluirSemVencimento]);

  // Linhas que a GRADE pinta. Com a flag ON sao no maximo 30, vindas do
  // servidor; com a flag OFF, o array completo de sempre.
  const linhasDaGrade = LISTA_V2 ? hook.listaPagina : sortedLancamentos;

  // Busca o conjunto inteiro SO no clique de exportar. Nunca na renderizacao.
  const carregarConjuntoExportacao = useCallback(
    () => hook.buscarConjuntoFiltrado(filtrosAplicados, {
      incluirSemVencimento: incluirSemVencimentoAplicado,
    }),
    [hook.buscarConjuntoFiltrado, filtrosAplicados, incluirSemVencimentoAplicado],
  );


  // ── Bulk selection (depends on sortedLancamentos) ──
  const allSelected = useMemo(() => selectedIds.size > 0 && sortedLancamentos.length > 0 && sortedLancamentos.every(l => selectedIds.has(l.id)), [selectedIds, sortedLancamentos]);
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedLancamentos.map(l => l.id)));
    }
  };

  const selectedLancamentos = useMemo(() => hook.lancamentos.filter(l => selectedIds.has(l.id)), [hook.lancamentos, selectedIds]);
  const bloqueadosInfo = useMemo(() => {
    // Fechamento mensal financeiro descontinuado: nenhum lançamento é bloqueado
    // por mês fechado. Todos os selecionados são deletáveis.
    const deletaveis = selectedLancamentos;
    const origens = new Set(selectedLancamentos.map(l => l.origem_lancamento));
    return { deletaveis, origens: Array.from(origens) };
  }, [selectedLancamentos]);

  // PR-FIN-V2-AÇÕES-LOTE-01 — elegibilidade para "Marcar realizado".
  //   Elegíveis: previsto/agendado/programado, não conciliado, não cancelado e com conta
  //   válida (mesma regra do modal: saída exige conta origem; transferência exige origem+destino;
  //   entrada exige destino). Demais são inelegíveis e não são alterados.
  const realizarInfo = useMemo(() => {
    const elegiveis: LancamentoV2[] = [];
    let jaRealizado = 0;
    let jaConciliado = 0;
    let semConta = 0;
    let outroStatus = 0;
    let semVencimento = 0;
    for (const l of selectedLancamentos) {
      if (l.cancelado) { outroStatus++; continue; }
      if (l.conciliado_em) { jaConciliado++; continue; }
      const st = (l.status_transacao || '').toLowerCase();
      if (st === 'realizado') { jaRealizado++; continue; }
      if (st !== 'previsto' && st !== 'agendado' && st !== 'programado') { outroStatus++; continue; }
      if (!contaSimpleValid(l.tipo_operacao, l.conta_bancaria_id ?? '', l.conta_destino_id ?? '')) { semConta++; continue; }
      if (!l.data_vencimento) semVencimento++;
      elegiveis.push(l);
    }
    const inelegiveis = jaRealizado + jaConciliado + semConta + outroStatus;
    const partes: string[] = [];
    if (jaRealizado > 0) partes.push(`${jaRealizado} já realizado${jaRealizado !== 1 ? 's' : ''}`);
    if (jaConciliado > 0) partes.push(`${jaConciliado} já conciliado${jaConciliado !== 1 ? 's' : ''}`);
    if (semConta > 0) partes.push(`${semConta} sem conta`);
    if (outroStatus > 0) partes.push(`${outroStatus} em outro status`);
    const mensagem = partes.length > 0
      ? `${selectedLancamentos.length} selecionado${selectedLancamentos.length !== 1 ? 's' : ''}. ${partes.join(', ')} — ${inelegiveis !== 1 ? 'não serão alterados' : 'não será alterado'}.`
      : '';
    return { elegiveis, jaRealizado, jaConciliado, semConta, outroStatus, semVencimento, inelegiveis, mensagem };
  }, [selectedLancamentos]);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = bloqueadosInfo.deletaveis.map(l => l.id);
      const result = await hook.excluirLancamentosEmLote(ids);
      if (result.excluidos > 0) {
        toast.success(`${result.excluidos} lançamento${result.excluidos !== 1 ? 's' : ''} excluído${result.excluidos !== 1 ? 's' : ''}`);
      }
      if (result.bloqueados.length > 0) {
        toast.error(`${result.bloqueados.length} importado(s) não puderam ser excluídos`);
      }
      setSelectedIds(new Set());
      await hook.loadLancamentos(filtros, hook.page);
    } finally {
      setBulkDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const handleBulkRealizar = async () => {
    setBulkRealizando(true);
    try {
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const itens = realizarInfo.elegiveis
        .map(l => ({
          id: l.id,
          data_pagamento: dataPagamentoModo === 'unica'
            ? dataPagamentoUnica
            : (l.data_vencimento || hoje),
        }))
        .filter(it => !!it.data_pagamento);
      if (itens.length === 0) {
        toast.error('Nenhuma data de pagamento válida para os itens selecionados.');
        return;
      }
      const result = await hook.marcarRealizadoEmLote(itens);
      if (result.atualizados > 0) {
        toast.success(`${result.atualizados} lançamento${result.atualizados !== 1 ? 's' : ''} marcado${result.atualizados !== 1 ? 's' : ''} como realizado`);
      }
      setSelectedIds(new Set());
      await hook.loadLancamentos(filtros, hook.page);
    } finally {
      setBulkRealizando(false);
      setConfirmRealizarOpen(false);
    }
  };


  const totalPages = Math.max(1, Math.ceil(totalLancamentosFiltrados / pageSize));


  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const paginatedLancamentos = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedLancamentos.slice(start, start + pageSize);
  }, [sortedLancamentos, currentPage, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'valor' ? 'desc' : 'asc');
    }
  };
  const SortIndicator = ({ field }: { field: Exclude<SortField, 'default'> }) => {
    if (sortField !== field) return <ArrowUpDown className="inline h-2.5 w-2.5 ml-0.5 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline h-2.5 w-2.5 ml-0.5" />
      : <ArrowDown className="inline h-2.5 w-2.5 ml-0.5" />;
  };

  /**
   * O PONTO DE VISTA DA LISTA — PR-V2-TRANSF-DESTINO-01.
   *
   * ⚠ ELE DECIDE O SINAL DE TODA TRANSFERÊNCIA DA TELA. Filtrando por "Conta Destino =
   * Bradesco", os resgates de LCA/CDB ENTRAM naquela conta e têm de aparecer positivos; a
   * coluna `sinal` do lançamento só conhece o lado da origem.
   */
  const foco = contaEmFoco(contaOrigem, contaDestino);

  /**
   * ⚠ TRÊS BALDES, NÃO DOIS — e é o que conserta o "Entradas 961.008,30 · Saídas 0" com os
   * cinco resgates sumidos. Os totais liam `l.sinal` e ainda ZERAVAM à força o lado oposto
   * ao filtro (`hasContaDestinoAtiva ? 0 : …`): a transferência, negativa por `sinal`, não
   * era contada como entrada — e a saída, forçada a zero, também não a contava. Ela caía
   * fora dos dois. Agora o balde sai do SENTIDO, e o sentido sai da conta em foco.
   * ⚠ O TERCEIRO SÓ EXISTE SEM FOCO: com uma conta escolhida, toda transferência é entrada
   * ou saída dela. Sem foco, somá-la a qualquer lado inflaria o mês com dinheiro que apenas
   * mudou de bolso — por isso ela fica à parte, e o rodapé a mostra à parte.
   */
  const totais = useMemo(() => {
    const acc = { entradas: 0, saidas: 0, transferencias: 0 };
    for (const l of sortedLancamentos) {
      const s: SentidoNaConta = sentidoNaConta(l, foco);
      const v = Math.abs(l.valor);
      if (s === 'entrada') acc.entradas += v;
      else if (s === 'saida') acc.saidas += v;
      else acc.transferencias += v;
    }
    return acc;
  }, [sortedLancamentos, foco]);
  /* O `foco` é o mesmo dos totais: a linha e o rodapé não podem discordar sobre o que é
     entrada. Uma função só, um foco só. */
  const valorDaLinha = (l: LancamentoV2) => formatarValorLinha(l, foco);

  const totalEntradas = totais.entradas;
  const totalSaidas = totais.saidas;
  const totalTransferencias = totais.transferencias;

  const toggleMes = (val: string) => {
    setMesesSelecionados(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
  };

  const mesLabel = mesesSelecionados.length === 0
    ? 'Todos'
    : mesesSelecionados.length <= 3
      ? mesesSelecionados.map(m => MESES_LIST.find(x => x.value === m)?.label).join(', ')
      : `${mesesSelecionados.length} meses`;

  // PR-FIN-STATUS-UX-03A-1 — filtro Status multisseleção (mesmo padrão inline do filtro de meses).
  const toggleStatus = (val: StatusFiltroFinanceiro) => {
    setStatusSelecionados(prev =>
      prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]
    );
  };

  const statusLabel = statusSelecionados.length === 0
    ? 'Todos'
    : statusSelecionados.length === 1
      ? STATUS_FILTRO_LABEL[statusSelecionados[0]]
      : `${statusSelecionados.length} selecionados`;

  const handleLimparFiltros = () => {
    const d = getDefaults();
    setAnosSelecionados(d.anosSelecionados);
    setMesesSelecionados([]);
    setStatusSelecionados([]);   // PR-FIN-STATUS-UX-03A-1 — Todos
    setFazendaId(d.fazendaId);
    setTipoOperacao('__all__');
    setContaOrigem('__all__');
    setContaDestino('__all__');
    setMacroFiltro('__all__');
    setGrupoFiltro('__all__');
    setCentroFiltro('__all__');
    setSubcentroFiltro('__all__');
    setProdutoFiltro('');
    setDocumentoFiltro('');
    setFornecedorFiltro('__all__');
    setAtividadeFiltro('__all__');
    setSafraFiltro('__all__');
    setCulturaFiltro('__all__');
    setAnosSelecionados([String(currentYear)]);
    setMacroLocked(false);
    /* ⚠ O RETRATO DOS PAIS TAMBÉM SE APAGA — FIN-CABECALHO-CASCATA-01. Sem isto, "Limpar"
       zeraria a tela e deixaria guardado o que os filtros valiam antes de um subcentro que
       não existe mais: o próximo cancelamento devolveria valores de outra sessão de filtro. */
    restaurarPlanoRef.current = null;
    setDataPor('financeira');   // PR-FIN-GRADE-DATAS-03 — volta à dimensão padrão ao limpar filtros
    setSortField('default');
    setSortDir('asc');
    setCurrentPage(0);
    /* ⚠ "Limpar" LIMPA A BUSCA TAMBEM. Zerar o fornecedor selecionado e deixar
       "wilson" digitado no combobox deixaria a tela dizendo "Todos" com uma lista
       de seis nomes — o filtro limpo e a busca suja. */
    limparBuscasLembradas(PREFIXO_BUSCA);
    /* ⚠ "Limpar" APAGA A MEMÓRIA, não só os campos. Zerar a tela e deixar o filtro guardado
       faria o próximo retorno ressuscitar exatamente o que o operador acabou de limpar. */
    esquecerFiltros();
  };

  // Determine which fazenda_id to pass to loadLancamentos

  // Liga a limpeza dos campos ao botao Limpar do 2C-4 (declarado acima).
  limparCamposRef.current = handleLimparFiltros;

  const queryFazendaId = fazendaId !== '__all__' ? fazendaId : undefined;

  /* ⚠ UMA LEITURA POR RENDER, não uma por linha: `new Date()` dentro do `map` de quatro mil
     linhas seria quatro mil objetos por render, e — pior — a lista poderia virar o dia no meio
     da varredura, com as primeiras linhas comparadas contra ontem e as últimas contra hoje. */
  const hojeISO = new Date().toISOString().slice(0, 10);

  const selCls = "h-6 text-[10px]";
  const itemCls = "text-[10px] py-0.5";
  const lblCls = "text-[9px] font-semibold leading-none mb-0.5 block text-[hsl(213_52%_24%)]";

  const isMobile = useIsMobile();
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // Count active advanced filters for badge
  const advancedFilterCount = [
    contaOrigem !== '__all__',
    contaDestino !== '__all__',
    macroFiltro !== '__all__',
    grupoFiltro !== '__all__',
    centroFiltro !== '__all__',
    subcentroFiltro !== '__all__',
    produtoFiltro !== '',
    documentoFiltro !== '',
    fornecedorFiltro !== '__all__',
    atividadeFiltro !== '__all__',
  ].filter(Boolean).length;

  const [modoIntensivo, setModoIntensivo] = useState(false);
  const toggleIntensivo = useCallback((val?: boolean) => {
    const next = val !== undefined ? val : !modoIntensivo;
    setModoIntensivo(next);
    onIntensiveToggle?.(next);
  }, [modoIntensivo, onIntensiveToggle]);

/* ⚠ ESTE BOTÃO EXISTE EM DOIS LUGARES, E A FLAG DECIDE QUAL APARECE — e é a TERCEIRA vez
   que o mount duplo morde (a primeira foi o menu de exportação, a segunda a coluna de
   atividade). `actionButtons = LISTA_V2 ? <FinanceiroV2ControlesLista/> : <div>…inline…</div>`,
   e `LISTA_V2` é `FEATURE_FLAGS.LISTA_PAGINADA_V2`, que vem de `VITE_LISTA_PAGINADA_V2` —
   uma variável que NÃO ESTÁ EM NENHUM `.env` do repo (medido em 11/09/2026). Logo:
     • o ramo que RENDERIZA hoje é o INLINE, aqui embaixo;
     • o ramo com TESTE é o `FinanceiroV2ControlesLista`, que ninguém vê.
   Quem mexer em um tem de mexer no outro, ou a tela e o teste passam a discordar em
   silêncio — foi exatamente assim que o menu de exportação ficou meio ligado. */
  const actionButtons = LISTA_V2 ? (
    <FinanceiroV2ControlesLista
      pendente={pendenteAplicar}
      onLimpar={handleLimparLista}
      onNovo={() => { setEditingLanc(null); setDialogOpen(true); }}
      exportar={(
        <FinanceiroV2ExportMenu
          carregarConjunto={carregarConjuntoExportacao}
          fornecedores={hook.fornecedores}
          ano={ano}
          fazendaNome={fazOperacionais.find(f => f.id === fazendaId)?.nome}
          totalCount={hook.listaTotal}
          dimensao={dataPor}
          /* ⚠ OS TRÊS CADASTROS QUE A TELA JÁ TEM. Nada é buscado por causa da exportação:
             `fazendas` desenha o seletor, `contasBancarias` a coluna de conta e `safras` o
             filtro de safra. O arquivo passa a nomear pelo MESMO cadastro que a tela usa —
             se um dia divergirem, divergem juntos, e não um contra o outro. */
          fazendas={fazendas}
          contas={contasParaExportar}
          safras={hook.safras}
        />
      )}
      modoIntensivo={modoIntensivo}
      onToggleIntensivo={() => toggleIntensivo()}
      onVoltar={onBack}
      excluidosSemVencimento={hook.listaExcluidosSemVencimento}
      incluirSemVencimento={estadoLista.rascunho.incluirSemVencimento === true}
      onToggleSemVencimento={handleToggleSemVencimento}
      paginacao={paginacao}
      total={hook.listaTotal}
      onPagina={(pg) => despacharLista({ tipo: 'pagina', pagina: pg })}
      carregandoLista={hook.carregandoLista}
    />
  ) : (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => { setEditingLanc(null); setDialogOpen(true); }} className="h-6 text-[10px] gap-0.5 px-1.5 bg-[#E7C873] text-foreground hover:bg-[#D9B95F]" title="Novo Lançamento">
          <Plus className="h-3 w-3" /> Novo
        </Button>
        <FinanceiroV2ExportMenu
          carregarConjunto={carregarConjuntoExportacao}
          fornecedores={hook.fornecedores}
          ano={ano}
          fazendaNome={fazOperacionais.find(f => f.id === fazendaId)?.nome}
          totalCount={totalLancamentosFiltrados}
          dimensao={dataPor}
          fazendas={fazendas}
          contas={contasParaExportar}
          safras={hook.safras}
        />
      </div>
      <div className="flex items-center gap-1">
        {onBack && (
          <Button size="sm" variant="outline" onClick={onBack} className="h-6 text-[10px] gap-0.5 px-1.5" title="Voltar">
            <ChevronLeft className="h-3 w-3" /> Voltar
          </Button>
        )}
        <Button
          size="sm"
          variant={modoIntensivo ? "default" : "outline"}
          onClick={() => toggleIntensivo()}
          /* ⚠ LARGURA FIXA — A23. "Ampliar" e "Retornar" não têm o mesmo comprimento, e sem
             `w-[84px]` o botão encolhe e cresce ao ser clicado, empurrando o que está à
             esquerda. O gesto de ampliar não pode mexer no lugar do botão que o fez. */
          className={cn("h-6 w-[84px] justify-center text-[10px] gap-0.5 px-1.5", modoIntensivo && "bg-primary text-primary-foreground")}
          title={modoIntensivo ? "Retornar à lista normal" : "Ampliar a lista (mais colunas)"}
        >
          {modoIntensivo ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {/* "Ampliar"/"Retornar" — FIN-LISTA-FILTROS-01b. "Intensivo" não dizia o que o
              botão faz; "Ampliar" diz, e o par com "Retornar" fecha o gesto. */}
          {modoIntensivo ? 'Retornar' : 'Ampliar'}
        </Button>
      </div>
    </div>
  );

  return (
    /* ⚠ O AFASTAMENTO MORA AQUI, NO RAIZ — FIN-LISTA-VISUAL-03. A seção do /v2 não tem
       padding lateral (`w-full min-w-0 pb-16`), então tudo encostava na borda da tela. Pôr
       `px-3` aqui empurra a barra de filtros, a tabela e o rodapé JUNTOS: os três alinham na
       mesma linha vertical por construção, e nenhum deles precisa conhecer a medida.
       ⚠ E O CARD RECUA COM A BORDA, que era o pedido: antes o padding estava dentro do
       scrollport, então o conteúdo recuava e o traço do card continuava colado.
       ⚠ 8px, E O MESMO DA `BarraSecao` — FIN-LISTA-VISUAL-05 (o VISUAL-04 fixou 12). O que
       não muda é a REGRA: o recuo da lista é o recuo da faixa azul do "Financeiro /
       Lançamentos", senão a página fica com dois recuos parecidos e diferentes, que é pior
       que um recuo errado. O que mudou foi o número dos DOIS, juntos, no mesmo PR.
       ⚠ 8 E NÃO 4: com `px-1` o traço do card fica a um fio da borda da tela e a sombra do
       card não tem onde cair. 8px é o menor recuo em que ainda se vê que é um card. */
    <div className={cn("relative px-2", modoIntensivo ? "flex flex-col h-[calc(100vh-8px)]" : "space-y-1 pb-20")}>
      {/* FILTERS */}
      {/* ⚠ CANTO RETO NOS DOIS CARDS — FIN-LISTA-VISUAL-05. O raio de 8px comia a largura
          justamente nas pontas, onde moram a primeira e a última coluna, e um card
          arredondado sobre uma tabela de cantos vivos parecia dois desenhos. Se um dia
          voltar o raio, volta nos dois — meio arredondado é a única saída errada. */}
      <Card className="rounded-none bg-white shrink-0" style={{ border: '1px solid #D6DEE8', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        {/* Padding interno pequeno: o afastamento da borda da tela é do container raiz. */}
        <CardContent className="p-2 space-y-1">
          {isMobile ? (
            <>
              {/* MOBILE: Row 1 — Ano | Mês | Data por | Tipo | Status */}
              <div className="grid grid-cols-5 gap-1 items-end">
                <div>
                  <label className={lblCls}>Ano</label>
                  {/* ⚠ MESMO PADRÃO DO MÊS — Popover + Checkbox, não um Select novo. Os dois
                      respondem a mesma pergunta ("quais?") e um Select multi seria um terceiro
                      idioma de multisseleção na mesma barra. */}
                  <Popover open={anoPopoverOpen} onOpenChange={setAnoPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 w-full justify-between truncate bg-white px-1.5 text-[10px] font-normal border-[#C9D4E2] hover:border-[#AFC2D8]">
                        {anoLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-32 p-1.5" align="start">
                      <div className="mb-0.5 flex justify-between">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setAnosSelecionados([])}>Todos</button>
                      </div>
                      <div className="grid grid-cols-2 gap-0.5">
                        {anos.map(a => (
                          <label key={a} className="flex cursor-pointer items-center gap-0.5 rounded px-0.5 py-0.5 text-[10px] hover:bg-muted">
                            <Checkbox checked={anosSelecionados.includes(a)} onCheckedChange={() => toggleAno(a)} className="h-2.5 w-2.5" />
                            {a}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className={lblCls}>Mês</label>
                  <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2]">
                        {mesLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-3 gap-0.5">
                        {MESES_LIST.map(m => (
                          <label key={m.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={mesesSelecionados.includes(m.value)} onCheckedChange={() => toggleMes(m.value)} className="h-2.5 w-2.5" />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                {/* PR-FIN-GRADE-DATAS-03 — Data por (mobile): mesma dimensão temporal soberana do desktop. */}
                <div>
                  <label className={lblCls}>Data por</label>
                  <Select value={dataPor} onValueChange={handleDataPorChange}>
                    <SelectTrigger className={`${selCls} w-full bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financeira" className={itemCls}>Financeira</SelectItem>
                      <SelectItem value="competencia" className={itemCls}>Competência</SelectItem>
                      <SelectItem value="vencimento" className={itemCls}>Vencimento</SelectItem>
                      <SelectItem value="pagamento" className={itemCls}>Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Tipo</label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); setMacroLocked(false); }}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="1-Entradas" className={itemCls}>Entradas</SelectItem>
                      <SelectItem value="2-Saídas" className={itemCls}>Saídas</SelectItem>
                      <SelectItem value="3-Transferências" className={itemCls}>Transf.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lblCls}>Status</label>
                  {/* PR-FIN-STATUS-UX-03A-1 — Status multisseleção (mesmo padrão do filtro de meses). */}
                  <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2]">
                        {statusLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setStatusSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setStatusSelecionados(STATUS_FINANCEIRO_OPCOES_FILTRO.map(o => o.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-1 gap-0.5">
                        {STATUS_FINANCEIRO_OPCOES_FILTRO.map(o => (
                          <label key={o.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={statusSelecionados.includes(o.value)} onCheckedChange={() => toggleStatus(o.value)} className="h-2.5 w-2.5" />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* MOBILE: Row 2 — Conta Origem | Conta Destino | Macro */}
              <div className="grid grid-cols-3 gap-1 items-end">
                <div>
                  <label className={lblCls}>Conta Origem</label>
                  {/* PR-H2 — ContaBancariaSelect compartilhado. */}
                  <ContaBancariaSelect
                    value={contaOrigem}
                    onValueChange={setContaOrigem}
                    contas={sortedContas}
                    placeholder="Todas"
                    disabled={isEntrada}
                    showBankDetails="agencia"
                    prependItems={[{ value: '__all__', label: 'Todas' }]}
                    className={`${selCls} bg-white border-[#C9D4E2] ${isEntrada ? 'opacity-40' : ''}`}
                  />
                </div>
                <div>
                  <label className={lblCls}>Conta Destino</label>
                  <ContaBancariaSelect
                    value={contaDestino}
                    onValueChange={setContaDestino}
                    contas={sortedContas}
                    placeholder="Todas"
                    disabled={isSaida}
                    showBankDetails="agencia"
                    prependItems={[{ value: '__all__', label: 'Todas' }]}
                    className={`${selCls} bg-white border-[#C9D4E2] ${isSaida ? 'opacity-40' : ''}`}
                  />
                </div>
                <div>
                  <label className={lblCls}>Macro</label>
                  <SearchableSelect
                    value={macroFiltro}
                    persistKey={CHAVE_BUSCA_MACRO}
                    onValueChange={v => { setMacroFiltro(v); setGrupoFiltro('__all__'); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                    options={macrosUnicos.map(m => ({ value: m, label: m }))}
                    disabled={macroLocked}
                    placeholder="Todos"
                  />
                </div>
              </div>

              {/* MOBILE: Row 3 — Produto | Fornecedor | Documento */}
              <div className="grid grid-cols-3 gap-1 items-end">
                <div>
                  <label className={lblCls}>Produto</label>
                  <Input
                    value={produtoFiltro}
                    onChange={e => setProdutoFiltro(e.target.value)}
                    placeholder="Buscar..."
                    className="h-6 !text-[9px] placeholder:!text-[9px] leading-tight px-1.5 bg-white border-[#C9D4E2]"
                    autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  />
                </div>
                <div>
                  <label className={lblCls}>Fornecedor</label>
                  <SearchableSelect
                    value={fornecedorFiltro}
                    onValueChange={setFornecedorFiltro}
                    options={opcoesFornecedor}
                    placeholder="Todos"
                    persistKey={CHAVE_BUSCA_FORNECEDOR}
                  />
                </div>
                <div>
                  <label className={lblCls}>Documento</label>
                  <Input
                    value={documentoFiltro}
                    onChange={e => setDocumentoFiltro(e.target.value)}
                    placeholder="NF, recibo..."
                    className="h-6 !text-[9px] placeholder:!text-[9px] leading-tight px-1.5 bg-white border-[#C9D4E2]"
                    autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  />
                </div>
              </div>

              {/* MOBILE: Collapsible advanced filters */}
              <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="h-5 text-[9px] gap-1 px-1 text-muted-foreground w-full justify-center">
                    <SlidersHorizontal className="h-2.5 w-2.5" />
                    Mais filtros
                    {advancedFilterCount > 0 && (
                      <Badge variant="secondary" className="h-3.5 px-1 text-[8px] ml-0.5">{advancedFilterCount}</Badge>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-1">
                  <div className="grid grid-cols-3 gap-1 items-end">
                    <div>
                      <label className={lblCls}>Grupo</label>
                      <SearchableSelect
                        value={grupoFiltro}
                        persistKey={CHAVE_BUSCA_GRUPO}
                        onValueChange={v => { setGrupoFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                        options={gruposUnicos.map(g => ({ value: g, label: g }))}
                        disabled={macroLocked}
                        placeholder="Todos"
                      />
                    </div>
                    <div>
                      <label className={lblCls}>Centro</label>
                      <SearchableSelect
                        value={centroFiltro}
                        persistKey={CHAVE_BUSCA_CENTRO}
                        onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                        options={centrosUnicos.map(c => ({ value: c, label: c }))}
                        disabled={macroLocked}
                        placeholder="Todos"
                      />
                    </div>
                    <div>
                      <label className={lblCls}>Subcentro</label>
                      <SearchableSelect
                        value={subcentroFiltro}
                        persistKey={CHAVE_BUSCA_SUBCENTRO}
                        onValueChange={handleSubcentroChange}
                        options={subcentrosUnicos.map(s => ({ value: s, label: s }))}
                        placeholder="Todos"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 items-end">
                    <div>
                      <label className={lblCls}>Fazenda</label>
                      <Select value={fazendaId} onValueChange={setFazendaId}>
                        <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                          {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className={itemCls}>{f.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={lblCls}>Atividade</label>
                      <Select value={atividadeFiltro} onValueChange={setAtividadeFiltro}>
                        <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                          {/* ⚠ O VALOR É O `escopo_negocio`, o texto é o do card. A comparação
                              em `getAtividade` é sempre pelo valor — rótulo é para ler. */}
                          {ATIVIDADES.map((a) => (
                            <SelectItem key={a.valor} value={a.valor} className={itemCls}>{a.rotulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={lblCls}>Safra</label>
                      <Select value={safraFiltro} onValueChange={setSafraFiltro}>
                        <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                          {/* ⚠ "Sem safra" NÃO é "Todas": é a pergunta oposta, e é a que acha o
                              torto — financiamento e administrativo não têm safra por regra. */}
                          <SelectItem value={SEM_SAFRA} className={itemCls}>Sem safra</SelectItem>
                          {safrasDoFiltro.map(sf => (
                            <SelectItem key={sf.id} value={sf.id} className={itemCls}>
                              {sf.codigo || sf.nome}
                              {sf.escopo_negocio && (
                                <span className="text-muted-foreground">
                                  {' · '}{ATIVIDADES.find(a => a.valor === sf.escopo_negocio)?.rotulo ?? sf.escopo_negocio}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* 2C-4 — Aplicar filtros junto de Atividade, dentro do painel. */}
                    {LISTA_V2 && (
                      <div className="flex items-end">
                        <BotaoAplicarFiltros pendente={pendenteAplicar} onAplicar={handleAplicarFiltros} className="w-full" />
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* MOBILE: Actions + Summary row */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex gap-1 items-center">
                  {actionButtons}
                  <Button size="sm" variant="ghost" onClick={handleLimparFiltros} className="h-6 text-[9px] gap-0.5 px-1 text-muted-foreground">
                    <FilterX className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-1.5 text-[9px] items-center">
                  <span className="text-success font-bold">{formatMoeda(totalEntradas)}</span>
                  <span className="text-destructive font-bold">{formatMoeda(totalSaidas)}</span>
                  {totalTransferencias > 0 && (
                    <span className="font-bold text-sky-700 dark:text-sky-400"
                      title="Transferências entre contas do próprio cliente — fora dos dois totais.">
                      {formatMoeda(totalTransferencias)}
                    </span>
                  )}
                  <span className="text-muted-foreground">{totalLancamentosFiltrados}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* PR-FIN-V2-HEADER-DENSIDADE-01 — cabeçalho desktop em duas colunas: FILTROS (flex-1 min-w-0)
                  | AÇÕES (shrink-0, não encolhe). Impede os filtros de comprimirem/quebrarem os botões. */}
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0 space-y-1">
              {/* ⚠ UMA GRADE SÓ, DOZE COLUNAS, QUATRO LINHAS — FIN-LISTA-LAYOUT-01.
                  Eram três grades independentes com faixas próprias (`62px 77px …`,
                  `minmax(150px,1.4fr) …`, `180px 260px 180px`), e por isso nada se alinhava
                  na vertical: cada linha decidia as suas colunas sozinha.
                  ⚠ E O `min-w-0` EM CADA CÉLULA É A CORREÇÃO DE FUNDO, não a grade. Item de
                  grid nasce com `min-width: auto`: um valor selecionado longo fazia a faixa
                  CRESCER além dos 62/106/120px e empurrava os vizinhos — a barra se mexia a
                  cada filtro. Com `min-w-0` a faixa manda e o texto trunca, que é o que o
                  `line-clamp-1` do `SelectTrigger` sempre quis fazer e não conseguia.
                  Distribuição (12 faixas por linha):
                    1: Ano 1 · Mês 2 · Data por 2 · Tipo 2 · Status 2 · Fazenda 3
                    2: Atividade 2 · Safra 3 · C. Origem 3 · C. Destino 4
                    3: Macro 3 · Grupo 3 · Centro 3 · Subcentro 3
                    4: Produto 4 · Fornecedor 4 · Documento 4 */}
              <div className="grid grid-cols-12 gap-1.5 items-end">
                  {/* ⚠ DUAS FAIXAS ERAM DEMAIS E UMA ERA DE MENOS, e a segunda tentativa é o
                      meio: o Ano mostra "2026" ou "2 anos" e o Mês mostra "12 meses" — os dois
                      são curtos, e o que quebrava era a faixa de ~55px, não o conteúdo. Com a
                      grade de 12 não há meia faixa, então os dois ficam com 2 e o Fazenda
                      devolve a que sobrava (de 3 para 2: ele trunca e tem `title`). */}
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Ano</label>
                  {/* ⚠ MESMO PADRÃO DO MÊS — Popover + Checkbox, não um Select novo. Os dois
                      respondem a mesma pergunta ("quais?") e um Select multi seria um terceiro
                      idioma de multisseleção na mesma barra. */}
                  <Popover open={anoPopoverOpen} onOpenChange={setAnoPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 w-full justify-between truncate bg-white px-1.5 text-[10px] font-normal border-[#C9D4E2] hover:border-[#AFC2D8]">
                        {anoLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-32 p-1.5" align="start">
                      <div className="mb-0.5 flex justify-between">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setAnosSelecionados([])}>Todos</button>
                      </div>
                      <div className="grid grid-cols-2 gap-0.5">
                        {anos.map(a => (
                          <label key={a} className="flex cursor-pointer items-center gap-0.5 rounded px-0.5 py-0.5 text-[10px] hover:bg-muted">
                            <Checkbox checked={anosSelecionados.includes(a)} onCheckedChange={() => toggleAno(a)} className="h-2.5 w-2.5" />
                            {a}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Mês</label>
                  <Popover open={mesPopoverOpen} onOpenChange={setMesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8]">
                        {mesLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setMesesSelecionados(MESES_LIST.map(m => m.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-3 gap-0.5">
                        {MESES_LIST.map(m => (
                          <label key={m.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={mesesSelecionados.includes(m.value)} onCheckedChange={() => toggleMes(m.value)} className="h-2.5 w-2.5" />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Data por</label>
                  <Select value={dataPor} onValueChange={handleDataPorChange}>
                    <SelectTrigger className={`${selCls} w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financeira" className={itemCls}>Financeira</SelectItem>
                      <SelectItem value="competencia" className={itemCls}>Competência</SelectItem>
                      <SelectItem value="vencimento" className={itemCls}>Vencimento</SelectItem>
                      <SelectItem value="pagamento" className={itemCls}>Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Tipo</label>
                  <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setContaOrigem('__all__'); setContaDestino('__all__'); setMacroLocked(false); }}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todos</SelectItem>
                      <SelectItem value="1-Entradas" className={itemCls}>Entradas</SelectItem>
                      <SelectItem value="2-Saídas" className={itemCls}>Saídas</SelectItem>
                      <SelectItem value="3-Transferências" className={itemCls}>Transferências</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Status</label>
                  {/* PR-FIN-STATUS-UX-03A-1 — Status multisseleção (mesmo padrão do filtro de meses). */}
                  <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-6 text-[10px] justify-between font-normal px-1.5 w-full bg-white border-[#C9D4E2] hover:border-[#AFC2D8]">
                        {statusLabel}
                        <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <div className="flex justify-between mb-0.5">
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setStatusSelecionados([])}>Todos</button>
                        <button className="text-[9px] text-primary hover:underline" onClick={() => setStatusSelecionados(STATUS_FINANCEIRO_OPCOES_FILTRO.map(o => o.value))}>Marcar todos</button>
                      </div>
                      <div className="grid grid-cols-1 gap-0.5">
                        {STATUS_FINANCEIRO_OPCOES_FILTRO.map(o => (
                          <label key={o.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer hover:bg-muted rounded px-0.5 py-0.5">
                            <Checkbox checked={statusSelecionados.includes(o.value)} onCheckedChange={() => toggleStatus(o.value)} className="h-2.5 w-2.5" />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Fazenda</label>
                  <Select value={fazendaId} onValueChange={setFazendaId}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {fazOperacionais.map(f => <SelectItem key={f.id} value={f.id} className={itemCls}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Atividade</label>
                  <Select value={atividadeFiltro} onValueChange={setAtividadeFiltro}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {/* Mesma fonte do painel mobile, dez linhas acima — e do card do modal. */}
                      {ATIVIDADES.map((a) => (
                        <SelectItem key={a.valor} value={a.valor} className={itemCls}>{a.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                  <div className="col-span-2 min-w-0">
                  <label className={lblCls}>Safra</label>
                  <Select value={safraFiltro} onValueChange={setSafraFiltro}>
                    <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                      {/* ⚠ "Sem safra" NÃO é "Todas": é a pergunta oposta, e é a que acha o
                          torto — financiamento e administrativo não têm safra por regra. */}
                      <SelectItem value={SEM_SAFRA} className={itemCls}>Sem safra</SelectItem>
                      {safrasDoFiltro.map(sf => (
                        <SelectItem key={sf.id} value={sf.id} className={itemCls}>
                          {sf.codigo || sf.nome}
                          {sf.escopo_negocio && (
                            <span className="text-muted-foreground">
                              {' · '}{ATIVIDADES.find(a => a.valor === sf.escopo_negocio)?.rotulo ?? sf.escopo_negocio}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mostraCultura && (
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Cultura</label>
                    <Select value={culturaFiltro} onValueChange={setCulturaFiltro}>
                      <SelectTrigger className={`${selCls} bg-white border-[#C9D4E2]`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__" className={itemCls}>Todas</SelectItem>
                        {/* ⚠ "Sem cultura" É A PERGUNTA DA AUDITORIA: são os compartilhados, os
                            que vão ratear — e, hoje, também todos os que ninguém classificou
                            ainda. Achá-los é o primeiro passo para classificar. */}
                        <SelectItem value={SEM_CULTURA} className={itemCls}>Sem cultura (rateia)</SelectItem>
                        {CULTURAS_LANCAMENTO.map(c => (
                          <SelectItem key={c.valor} value={c.valor} className={itemCls}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Conta Origem</label>
                    {/* PR-H2 — ContaBancariaSelect compartilhado. */}
                    <ContaBancariaSelect
                      value={contaOrigem}
                      onValueChange={setContaOrigem}
                      contas={sortedContas}
                      placeholder="Todas"
                      disabled={isEntrada}
                      showBankDetails="agencia"
                      prependItems={[{ value: '__all__', label: 'Todas' }]}
                      className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F] ${isEntrada ? 'opacity-40' : ''}`}
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Conta Destino</label>
                    <ContaBancariaSelect
                      value={contaDestino}
                      onValueChange={setContaDestino}
                      contas={sortedContas}
                      placeholder="Todas"
                      disabled={isSaida}
                      showBankDetails="agencia"
                      prependItems={[{ value: '__all__', label: 'Todas' }]}
                      className={`${selCls} bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus:border-[#1E3A5F] ${isSaida ? 'opacity-40' : ''}`}
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Documento</label>
                    <Input
                      value={documentoFiltro}
                      onChange={e => setDocumentoFiltro(e.target.value)}
                      placeholder="NF, recibo, rateio..."
                      className="h-6 !text-[8px] placeholder:!text-[8px] leading-tight px-1.5 bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus-visible:ring-[#1E3A5F]"
                      autoCorrect="off" autoCapitalize="none" spellCheck={false}
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Macro</label>
                    <SearchableSelect
                      value={macroFiltro}
                      persistKey={CHAVE_BUSCA_MACRO}
                      onValueChange={v => { setMacroFiltro(v); setGrupoFiltro('__all__'); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={macrosUnicos.map(m => ({ value: m, label: m }))}
                      disabled={macroLocked}
                      placeholder="Buscar macro..."
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Grupo</label>
                    <SearchableSelect
                      value={grupoFiltro}
                      persistKey={CHAVE_BUSCA_GRUPO}
                      onValueChange={v => { setGrupoFiltro(v); setCentroFiltro('__all__'); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={gruposUnicos.map(g => ({ value: g, label: g }))}
                      disabled={macroLocked}
                      placeholder="Buscar grupo..."
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Centro</label>
                    <SearchableSelect
                      value={centroFiltro}
                      persistKey={CHAVE_BUSCA_CENTRO}
                      onValueChange={v => { setCentroFiltro(v); setSubcentroFiltro('__all__'); setMacroLocked(false); }}
                      options={centrosUnicos.map(c => ({ value: c, label: c }))}
                      disabled={macroLocked}
                      placeholder="Buscar centro..."
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Subcentro</label>
                    <SearchableSelect
                      value={subcentroFiltro}
                      persistKey={CHAVE_BUSCA_SUBCENTRO}
                      onValueChange={handleSubcentroChange}
                      options={subcentrosUnicos.map(s => ({ value: s, label: s }))}
                      placeholder="Buscar subcentro..."
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Produto</label>
                    <Input
                      value={produtoFiltro}
                      onChange={e => setProdutoFiltro(e.target.value)}
                      placeholder="Buscar..."
                      className="h-6 !text-[8px] placeholder:!text-[8px] leading-tight px-1.5 bg-white border-[#C9D4E2] hover:border-[#AFC2D8] focus-visible:ring-[#1E3A5F]"
                      autoCorrect="off" autoCapitalize="none" spellCheck={false}
                    />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <label className={lblCls}>Fornecedor</label>
                    <SearchableSelect
                      value={fornecedorFiltro}
                      onValueChange={setFornecedorFiltro}
                      options={opcoesFornecedor}
                      placeholder="Buscar fornecedor..."
                      persistKey={CHAVE_BUSCA_FORNECEDOR}
                    />
                  </div>
                  
              </div>

              {/* O "Aplicar" só existe com a lista paginada; fora dela a barra filtra ao vivo. */}
              {LISTA_V2 && (
                <div className="flex items-end pt-1">
                  <BotaoAplicarFiltros pendente={pendenteAplicar} onAplicar={handleAplicarFiltros} />
                </div>
              )}
                </div>
                {/* ⚠ AÇÕES E TOTAIS NA MESMA COLUNA À DIREITA — FIN-LISTA-LAYOUT-01. Os totais
                    moravam no fim da terceira linha de filtros, então mudavam de lugar toda vez
                    que uma linha de filtro crescia. Aqui, ao lado dos botões e fora da grade,
                    eles ficam onde o olho aprendeu a procurá-los.
                    ⚠ `shrink-0` E LARGURA FIXA: sem os dois, "Entradas: R$ 12.345.678,90"
                    empurraria a grade de filtros para a esquerda — o mesmo reflow, por outra
                    porta. */}
                <div className="flex w-[190px] shrink-0 flex-col items-end gap-1 pb-[1px]">
                  {actionButtons}
                  <Button size="sm" variant="ghost" onClick={handleLimparFiltros}
                    className="h-6 gap-0.5 px-1.5 text-[10px] text-muted-foreground">
                    <FilterX className="h-3 w-3" /> Limpar
                  </Button>
                  <div className="flex w-full flex-col items-end gap-0 text-right tabular-nums">
                    <span className="text-[10px] font-bold text-success">Entradas: {formatMoeda(totalEntradas)}</span>
                    <span className="text-[10px] font-bold text-destructive">Saídas: {formatMoeda(totalSaidas)}</span>
                    {/* ⚠ O TERCEIRO TOTAL SÓ APARECE QUANDO EXISTE — PR-V2-TRANSF-DESTINO-01.
                        Com uma conta em foco não há transferência solta: ela é entrada ou
                        saída daquela conta, o balde fica zerado e um "Transf.: R$ 0,00"
                        permanente ensinaria a ignorar a linha. */}
                    {totalTransferencias > 0 && (
                      <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400"
                        title="Transferências entre contas do próprio cliente: não são entrada nem saída do caixa, por isso ficam fora dos dois totais.">
                        Transf.: {formatMoeda(totalTransferencias)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{totalLancamentosFiltrados} lanç.</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {(!queryFazendaId && fazendaId !== '__all__') && (
        <div className="text-center text-muted-foreground py-6 text-[10px]">
          Selecione uma fazenda e um ano para carregar os lançamentos.
        </div>
      )}

      {/* ⚠ ESTADO VAZIO QUE PEDE, EM VEZ DE TRAVAR — FIN-LISTA-PERF-01. Sem filtro limitante a
          consulta leria 30.065 linhas do NJ em 31 idas em série, e a tela ficava presa até o
          fim de uma busca que ninguém pediu. Agora ela não sai, e diz o que falta.
          ⚠ A FRASE NOMEIA QUATRO DOS NOVE CAMINHOS, de propósito: listar os nove viraria um
          parágrafo que ninguém lê. Período, safra, fornecedor e conta são os que o operador
          usa; produto, centro e subcentro também destravam, e quem os usa já sabe. */}
      {mode === 'list' && podeConsultar === false && (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <div className="text-[12px] font-medium text-foreground">{FRASE_SEM_FILTRO}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Sem nenhum recorte, a lista precisaria ler a base inteira — e o que se procura
            quase nunca está nela toda.
          </div>
        </div>
      )}

      {hook.loading && (
        <div className="text-center text-muted-foreground py-4 text-[10px] animate-pulse">Carregando...</div>
      )}

      {mode === 'rapido' && (fazendaId === '__all__' || fazendaId) && (
        <ModoRapidoGrid
          fazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
          contas={hook.contasBancarias}
          classificacoes={hook.classificacoes}
          onSaveBatch={hook.criarLancamentosEmLote}
          onDone={() => hook.loadLancamentos(filtros, 0)}
        />
      )}

      {mode === 'list' && !hook.loading && podeConsultar && (
        <>
          {!modoIntensivo && (
            <CorrecaoTransferenciasBanner
              contas={hook.contasBancarias}
              onFixed={() => hook.loadLancamentos(filtros, hook.page)}
            />
          )}
           {/* ⚠ `rolagem-fina rolagem-sem-tampar` — FIN-LISTA-SCROLLBAR-01. A barra desenhava
                POR CIMA da última linha e da coluna de ações, e clicar no lançamento de baixo
                virava clicar na barra. As duas classes resolvem coisas diferentes: a fina é a
                estética (A24), a "sem tampar" reserva o gutter E faz o conteúdo terminar antes
                da borda — que é o único jeito de escapar da barra em overlay do macOS, que não
                obedece a `scrollbar-gutter`. Ver o bloco no `index.css`.
                ⚠ VALE NOS DOIS MODOS: é o mesmo container no normal e no Ampliado. */}
           {/* ⚠ `bg-card` — FIN-LISTA-VISUAL-IGUAL-FINANCAS-01, e a ausência dele era a causa do
                "as linhas perderam o fundo branco". No Finanças a tabela vive dentro de um
                `<Card>` (`bg-card`), e aqui o container não tinha fundo nenhum: herdava a
                `--background` da página. Medido, os dois repos têm os MESMOS tokens —
                `--background: 220 17% 97%` (cinza) e `--card: 0 0% 100%` (branco) —, então a
                diferença não era de tema, era o card que faltava. */}
           <div ref={scrollContainerRef} className={cn("rounded-none border border-[hsl(var(--border))] bg-card overflow-auto relative rolagem-fina rolagem-sem-tampar respiro-lista", modoIntensivo && "flex-1")} style={modoIntensivo ? undefined : { maxHeight: 'calc(100vh - 240px)' }}>
            <table className="table-financeiro w-full caption-bottom text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
              {/*
                Larguras das colunas:
                - Modo normal: Produto (col 4) usa flex (sem width); Doc 100; demais mantidas.
                - Modo intensivo: Produto fixo em 280 (deixa de dominar com truncate);
                  Doc sobe para 110 para caber NF/série completa.
              */}
              <colgroup>
                <col style={{ width: 28 }} />
                {/* PR-CONC-B-1 — ícone de origem. 22px fixos; as demais larguras ficam
                    intactas e a tabela apenas cresce 22px dentro do container que rola. */}
                {/* 18→14: a coluna do marcador de origem carrega UM ícone; o checkbox tem
                    coluna própria, de 28px. */}
                <col style={{ width: 14 }} />
                {/* PR-FIN-GRADE-DATAS-03 — COMP. | VENC. | PGTO. (3 colunas de data).
                    45→40 no VISUAL-06 e 40→34 no FIN-TABELA-GEOMETRIA-01, acompanhando a
                    fonte que desceu a 7px: "31/12/26" pede ~28px ali, e 34 deixa 3px de cada
                    lado. Mais estreito que isso encosta o texto na borda da célula.
                    A data renderiza com
                    `letter-spacing: -0.4px` (regra `.celula-data` do index.css), e "31/12/26"
                    pede ~32px — 40 ainda sobra para o padding de 1px de cada lado. */}
                <col style={{ width: 34 }} />
                <col style={{ width: 34 }} />
                <col style={{ width: 34 }} />
                {/* Produto 175→150 na lista normal — FIN-LISTA-LAYOUT-01. É a coluna mais
                    larga e a que mais tolera truncar: o texto inteiro está no `title`. */}
                <col style={{ width: modoIntensivo ? 170 : 150 }} />
                {/* Fornecedor 140→120 — FIN-LISTA-VISUAL-06. Trunca com o nome inteiro no `title`. */}
                <col style={{ width: 120 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                {/* Fazenda 50→44→38→30: a célula mostra o CÓDIGO (PUR, RET, ADM), nunca o
                    nome — três letras a 9px pedem ~20px, e o `title` guarda o nome inteiro.
                    O rótulo "FAZ." do cabeçalho, a 8px, é o que fixa o piso aqui. */}
                <col style={{ width: 30 }} />
                {/* Safra 56→66 — FIN-LISTA-VISUAL-06, a ÚNICA coluna que CRESCE neste corte.
                    ⚠ NO AMPLIADO NÃO HÁ ESTICAMENTO: a tabela transborda o container, então
                    cada faixa vale exatamente o que está escrito aqui — e "25/26-MAND", o
                    código mais longo do cadastro (medido: 10 caracteres, os demais têm 9),
                    não cabia nos 56 e saía "25/26-M…". Na lista normal a diferença é nenhuma,
                    porque lá as faixas esticam. */}
                <col style={{ width: 66 }} />
                {/* As duas contas só no Ampliado: 130→105→78 cada (FIN-TABELA-GEOMETRIA-01).
                    ⚠ AQUI O TRUNCAR É A DECISÃO, não o efeito colateral: a coluna responde
                    QUAL conta, e o banco já se reconhece nas primeiras letras ("Bradesco…",
                    "Cartão…"). O nome inteiro fica no `title`, e os 54px que sobram das duas
                    somados é o que tira o Ampliado da rolagem horizontal.
                    ⚠ O COMENTÁRIO ANTIGO DIZIA 150 E A LARGURA ERA 130 — o texto ficou para
                    trás de um corte anterior. Agora são 105, e o nome longo ("Cartão Banco do
                    Brasil - Pecuária") passa a truncar mais cedo; o nome inteiro está no
                    `title`, e o que a coluna precisa responder é QUAL conta, não o nome todo. */}
                {modoIntensivo && <col style={{ width: 78 }} />}
                {modoIntensivo && <col style={{ width: 78 }} />}
                <col style={{ width: 90 }} />
                {/* Doc: 55 na normal, 90→60 no Ampliado — FIN-LISTA-VISUAL-06.
                    ⚠ A FONTE NÃO MUDA, e o briefing pedia 10px: a célula JÁ renderiza a 9px,
                    porque `.celula-doc` no index.css tem `font-size: 9px !important` e vence
                    o `text-[10px]` do JSX. Subir para 10 seria AUMENTAR a fonte dentro de uma
                    coluna que está encolhendo 30px — o contrário do pedido. */}
                <col style={{ width: modoIntensivo ? 60 : 55 }} />
                {/* 58→64: a pílula ganhou borda e padding lateral; sem os 6px "Realizado"
                    truncaria dentro dela — que é pior que não ter pílula. */}
                <col style={{ width: 64 }} />
                {/* Ações 36→28: um botão "…" em vez de dois ícones. */}
                <col style={{ width: 28 }} />
              </colgroup>
              <thead className="[&_tr]:border-b sticky top-0 z-20 bg-primary">
                <tr className="border-b !h-auto">
                  <th className="px-1 py-[3px] text-center align-middle bg-primary sticky left-0 z-30">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} className="h-3 w-3 border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                  </th>
                  {/* PR-CONC-B-1 — sem rótulo: o cabeçalho de 8px não caberia e a legenda do
                      rodapé é quem explica os cinco símbolos. */}
                  <th className="px-0 py-[3px] text-center align-middle sticky left-[28px] z-30 bg-primary" aria-label="Origem" />
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[42px] z-30 bg-primary" onClick={() => toggleSort('data')}>Comp.<SortIndicator field="data" /></th>
                  {/* ⚠ A CADEIA DE `sticky left` É A SOMA DAS COLUNAS ANTERIORES, e agora bate —
                      FIN-LISTA-VISUAL-06: 0 (check 28) → 28 (origem 14) → 42 (comp. 40) →
                      82 (venc. 40) → 122. Estava 0/28/50/95/140 contra colunas de 28+14+45+45:
                      8px de sobra na primeira data e 5 e 10 nas outras, herdados de um corte
                      anterior que mexeu na largura e não na cadeia.
                      ⚠ ISSO SÓ APARECE NO AMPLIADO, que é o único modo que rola na horizontal:
                      cada folga vira uma fresta por onde passa o conteúdo que está rolando por
                      baixo das colunas congeladas. Na lista normal não há rolagem lateral, e por
                      isso o defeito viveu escondido.
                      ⚠ QUEM MEXER NA LARGURA DE UMA DESTAS CINCO refaz a conta aqui. São quatro
                      números em oito lugares (th + td). */}
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[82px] z-30 bg-primary" onClick={() => toggleSort('venc')}>Venc.<SortIndicator field="venc" /></th>
                  <th className="px-0.5 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none sticky left-[122px] z-30 bg-primary" onClick={() => toggleSort('pgto')}>Pgto.<SortIndicator field="pgto" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('produto')}>Produto<SortIndicator field="produto" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('fornecedor')}>Fornecedor<SortIndicator field="fornecedor" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">Macro</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('centro')}>Centro<SortIndicator field="centro" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground" title="Fazenda">Faz.</th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('safra')}>Safra<SortIndicator field="safra" /></th>
                  {modoIntensivo && (
                    <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">C. Origem</th>
                  )}
                  {modoIntensivo && (
                    <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground">C. Destino</th>
                  )}
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('valor')}>Valor<SortIndicator field="valor" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('doc')}>Doc.<SortIndicator field="doc" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground cursor-pointer select-none" onClick={() => toggleSort('status')}>Status<SortIndicator field="status" /></th>
                  <th className="px-1 py-[3px] text-center align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground"></th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {linhasDaGrade.length === 0 ? (
                  <tr className="border-b">
                    <td colSpan={14} className="text-center text-muted-foreground py-4 text-[10px]">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  linhasDaGrade.map(l => {
                    const fornNome = fornecedoresMap.get(l.favorecido_id || '');
                    // PR-OC-FIN-EDIT-FIX-01 — apresentação: título de OC não exibe o fornecedor no Produto.
                    //   Só display (histórico intacto). Remove o sufixo " — <contraparte>" do formato de
                    //   compromisso legado; NÃO mexe no formato por-parcela ("… — Parc. x/y") nem nos novos.
                    const descExibida = (l.origem_lancamento === 'operacao_comercial' && l.descricao
                        && !l.descricao.includes('Parc.') && l.descricao.includes(' — '))
                      ? l.descricao.slice(0, l.descricao.indexOf(' — '))
                      : l.descricao;
                    /* ⚠ CONCILIADO É DERIVADO, e é por isso que a chave se
                       calcula aqui em vez de vir do banco: existe vínculo ativo →
                       conciliado; não existe → o status persistido, intocado. A
                       coluna `status_transacao` continua guardando o que sempre
                       guardou, e nenhum writer muda por causa disto.
                       ⚠ SÓ REALIZADO VIRA CONCILIADO. Previsto com vínculo seria
                       contradição — dinheiro que ainda não andou não se concilia
                       —, e mascarar o previsto esconderia o defeito em vez de
                       mostrá-lo. */
                    const stCru = (l.status_transacao || '').toLowerCase();
                    const vinculo = conciliados.get(l.id);
                    /* ⚠ A PÍLULA AZUL VEM DO VÍNCULO, e o `stCru === 'conciliado'`
                       NÃO a herda: 574 linhas têm esse status gravado sem vínculo
                       nenhum — legado de 10/04/2026. Elas caem no rótulo
                       "Conciliado (legado)", muted, distinguível do fato. */
                    const stKey = vinculo && stCru === 'realizado' ? 'conciliado_real' : stCru;
                    const stLabel = STATUS_FILTRO_LABEL[stKey] || l.status_transacao || '-';
                    const stColor = STATUS_FILTRO_COR[stKey] || 'text-muted-foreground';
                    /* Vencido é fato de duas colunas: venceu no passado E não foi pago. */
                    const vencido = !!l.data_vencimento && !l.data_pagamento && l.data_vencimento < hojeISO;
                    /* A EVIDÊNCIA, sem UUID: o operador confere pelo que
                       reconhece — a data e o histórico do extrato. */
                    const stTitle = vinculo
                      ? `Vinculado a ${vinculo.dataMovimento ? vinculo.dataMovimento.slice(0, 10).split('-').reverse().join('/') : '—'}`
                        + ` · ${vinculo.descricaoMovimento ?? 'movimento sem histórico'}`
                        + ` · aplicado ${formatMoeda(vinculo.valorAplicado)}`
                      : undefined;
                    /* PR-CONC-B-1 — o mesmo `vinculo` que decide a pílula de status decide o
                       ícone; nenhuma consulta a mais por linha. */
                    const icone = iconeOrigemLancamento(l, vinculo, coberturaExtrato);
                    const isHistoricoReadOnly = l.origem_lancamento === 'importacao_historica';
                    const isParcelaFinanciamento = l.origem_lancamento === 'parcela_financiamento' || (l as any).origem_tipo === 'financiamento_captacao' || (l.origem_lancamento === 'financiamento' && !!(l as any).financiamento_id);
                    const isImported = !!l.lote_importacao_id;
                    const canEditRow = !isHistoricoReadOnly && !isParcelaFinanciamento;

                    /* ⚠ A LINHA INTEIRA ABRE O LANÇAMENTO — FIN-LISTA-VISUAL-01. O alvo de
                       clique era um ícone de 20px no fim de uma linha de 21px de altura, e
                       errar a mira custava uma rolagem para reencontrar a linha.
                       ⚠ O CHECKBOX E O MENU PARAM O CLIQUE (`stopPropagation` nas células
                       deles): marcar para excluir em lote e abrir para editar são gestos
                       opostos, e um não pode disparar o outro por vizinhança.
                       ⚠ E A LINHA QUE NÃO PODE SER EDITADA NÃO VIRA BOTÃO: parcela de
                       financiamento e histórico antigo ficam sem cursor e sem `onClick` —
                       um clique que não faz nada ensina a desconfiar do resto da tela. */
                    return (
                      <tr key={l.id}
                        className={`border-b italic !h-auto hover:bg-muted/50 transition-colors${canEditRow ? ' cursor-pointer' : ''} ${selectedIds.has(l.id) ? 'bg-primary/5' : ''}`}
                        onClick={canEditRow ? () => openEdit(l) : undefined}>
                        {/* ⚠ A FAIXA CINZA COMEÇA NA BORDA — FIN-LISTA-DENSIDADE-01, e isto
                            DESFAZ o `bg-card` que estas duas células ganharam no c9cefcf3.
                            Lá o objetivo era não ter cinza avulso sobre o card branco; aqui o
                            cinza passa a ser uma FAIXA CONTÍNUA, da borda esquerda até o fim
                            das datas — checkbox, ícone de origem e as três datas no mesmo tom.
                            Faixa inteira se lê como bloco; retalho se lê como defeito. */}
                        <td className="px-1 py-1 align-middle text-center sticky left-0 z-10 bg-background"
                          onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(l.id)} onCheckedChange={() => toggleSelect(l.id)} disabled={isParcelaFinanciamento} className="h-3 w-3" />
                        </td>
                        <td className="px-0 py-1 align-middle text-center sticky left-[28px] z-10 bg-background">
                          {icone && (
                            <MinimodalOrigemLancamento
                              lancamento={l}
                              icone={icone}
                              nomeFavorecido={(id) => fornecedoresMap.get(id || '')}
                              onAbrirLancamento={() => openEdit(l)}
                              onVinculoDesfeito={recarregarVinculos}
                            >
                              <button
                                type="button"
                                className={cn('text-[11px] font-semibold leading-none not-italic cursor-pointer', icone.cor)}
                                title={icone.significado}
                                aria-label={icone.significado}
                              >
                                {icone.simbolo}
                              </button>
                            </MinimodalOrigemLancamento>
                          )}
                        </td>
                        {/* ⚠ DATA CINZA POR PADRÃO, VENCIDA EM VERMELHO — e só a data, não a
                            linha: pintar a linha inteira faria o atraso competir com o valor e
                            o status, que são o que se lê primeiro. Vencido = tem vencimento no
                            passado E não tem pagamento; um lançamento pago ontem com
                            vencimento anteontem não está atrasado, está resolvido. */}
                        <td className="celula-data font-mono px-0.5 py-1 align-middle leading-tight sticky left-[42px] z-10 bg-background text-center text-muted-foreground">{fmtDate(l.data_competencia)}</td>
                        {/* PR-FIN-GRADE-DATAS-03 — VENC. e PGTO. em colunas separadas, cada uma a sua coluna real
                            (nunca fundidas, nunca a data financeira derivada). fmtDate(null) já rende o sentinela '-'.
                            VENC. permanece visível mesmo quando há PGTO. */}
                        <td className={`celula-data font-mono px-0.5 py-1 align-middle leading-tight sticky left-[82px] z-10 bg-background text-center ${vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                          title={vencido ? 'Vencido e não pago' : undefined}>{fmtDate(l.data_vencimento)}</td>
                        <td className="celula-data font-mono px-0.5 py-1 align-middle leading-tight sticky left-[122px] z-10 bg-background text-center text-muted-foreground">{fmtDate(l.data_pagamento)}</td>
                        <td className="truncate px-1 py-1 align-middle text-[12px] font-medium leading-tight" title={isParcelaFinanciamento ? `Parcela de financiamento (origem automática) — ${descExibida || ''}` : (descExibida || '')}>
                          {isParcelaFinanciamento && <span className="mr-1" title="Parcela de financiamento">🏦</span>}
                          {descExibida || '-'}
                          {l.movimentacao_rebanho_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Beef className="inline h-3 w-3 text-muted-foreground ml-1 shrink-0 align-middle" />
                              </TooltipTrigger>
                              <TooltipContent>Gerado a partir de lançamento zootécnico</TooltipContent>
                            </Tooltip>
                          )}
                          {l.origem_lancamento === 'operacao_comercial' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Beef className="inline h-3 w-3 text-amber-600 dark:text-amber-400 ml-1 shrink-0 align-middle" />
                              </TooltipTrigger>
                              <TooltipContent>Origem: Operação Comercial de Compra de Animais</TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                        <td className="truncate px-1 py-1 align-middle text-[12px] leading-tight text-muted-foreground" title={fornNome || ''}>
                          {fornNome || (!l.favorecido_id ? '-' : <span className="text-warning">n/c</span>)}
                        </td>
                        <td className="truncate px-1 py-1 align-middle text-[11px] font-medium leading-tight text-muted-foreground" title={l.macro_custo || ''}>{l.macro_custo || '-'}</td>
                        <td className="truncate px-1 py-1 align-middle text-[11px] leading-tight text-muted-foreground" title={l.centro_custo || ''}>{l.centro_custo || '-'}</td>
                        <td className="truncate px-1 py-1 align-middle text-[11px] font-medium leading-tight text-muted-foreground" title={fazendaNameMap.get(l.fazenda_id) || ''}>{fazendaCodigoMap.get(l.fazenda_id) || '-'}</td>
                        {/* ⚠ "—" É AUSÊNCIA, e aqui ela é informação: financiamento de
                            investimento e administrativo NÃO têm safra por regra. Um traço
                            nessas linhas é o esperado; um código é o que se veio caçar. */}
                        {/* ⚠ A CULTURA MORA NA COLUNA DA SAFRA — FIN-AUDITORIA-CULTURA-01, e não
                            numa coluna nova: medida a grade, o Ampliado já soma 1.168px contra
                            1.194 disponíveis em 1440, e uma faixa de 60px o faria rolar de novo
                            (o FIN-LISTA-VISUAL-06 acabou de tirá-lo de lá). Safra e cultura são
                            o mesmo assunto em dois níveis — o ciclo e o que se plantou nele.
                            ⚠ A SEGUNDA LINHA SÓ EXISTE QUANDO HÁ CULTURA. Reservá-la sempre
                            somaria ~8px em TODA linha de uma lista de 21px — 38% de altura para
                            um dado que hoje quase nenhuma linha tem. O preço é a linha com
                            cultura ficar mais alta que as vizinhas; é o menor dos dois. */}
                        <td className="truncate px-1 py-1 align-middle text-[10px] font-medium leading-tight text-muted-foreground"
                          title={[
                            l.safra_id ? (safraCodigoMap.get(l.safra_id) || '') : 'Sem safra',
                            l.cultura ? labelDaCultura(l.cultura) : null,
                          ].filter(Boolean).join(' · ')}>
                          <span className="block truncate">
                            {l.safra_id ? (safraCodigoMap.get(l.safra_id) || '—') : '—'}
                          </span>
                          {l.cultura && (
                            <span className="block truncate text-[8px] font-normal leading-none text-muted-foreground/80">
                              {labelDaCultura(l.cultura)}
                            </span>
                          )}
                        </td>
                        {modoIntensivo && (
                          <td className="truncate px-1 py-1 align-middle text-[10px] leading-tight text-muted-foreground"
                            title={l.conta_bancaria_id ? (contaNomeMap.get(l.conta_bancaria_id) || '') : ''}>
                            {l.conta_bancaria_id ? (contaNomeMap.get(l.conta_bancaria_id) || '—') : '—'}
                          </td>
                        )}
                        {modoIntensivo && (
                          <td className="truncate px-1 py-1 align-middle text-[10px] leading-tight text-muted-foreground"
                            title={l.conta_destino_id ? (contaNomeMap.get(l.conta_destino_id) || '') : ''}>
                            {l.conta_destino_id ? (contaNomeMap.get(l.conta_destino_id) || '—') : '—'}
                          </td>
                        )}
                        {/* ⚠ O SINAL É O DA CONTA EM FOCO, não o da coluna `sinal` — que só
                            conhece o lado da origem. Ver `sentidoNaConta`.
                            ⚠ E TEXTO E COR VÊM DA MESMA CHAMADA — FIN-LISTA-TRANSF-SINAL-01.
                            Eram duas expressões, cada uma reavaliando `sentidoNaConta`, e
                            entre elas cabia o estado impossível: valor em módulo pintado de
                            vermelho. Uma chamada, uma decisão. */}
                        {/* ⚠ A ÚNICA DIFERENÇA DELIBERADA EM RELAÇÃO AO FINANÇAS: a coluna Valor
                            ganha o MESMO fundo das colunas de data — `bg-background`, medido no
                            `LancamentosTabela.tsx` da referência, que é o cinza
                            `--background: 220 17% 97%` sobre o branco do card. */}
                        <td className={`celula-valor text-right font-semibold whitespace-nowrap px-1 py-1 align-middle text-[12px] leading-tight bg-background ${valorDaLinha(l).classe}`}>
                          {valorDaLinha(l).texto}
                        </td>
                        {/* Doc. à direita: é número, e número se lê alinhado pela unidade. */}
                        <td className="celula-doc font-mono text-muted-foreground text-right px-1 py-1 align-middle text-[10px] leading-tight truncate" title={formatDocCompleto(l)}>{formatNF(l)}</td>
                        {/* `truncate` também aqui: a tabela é `tableLayout: fixed`, então a
                            faixa não cede — sem truncar, "Realizado" transbordaria a célula em
                            vez de a alargar. É o mesmo raciocínio do `min-w-0` da barra, do
                            outro lado da mesma regra. */}
                        {/* ⚠ A PÍLULA COM BORDA FOI REVERTIDA — FIN-LISTA-VISUAL-01. Ela durou
                            um PR: a caixa em toda linha competia com o valor numa lista densa,
                            e o que se quer da coluna é reconhecer o estado de relance, não lê-lo
                            emoldurado. Volta a ser TEXTO colorido, que é o que era antes.
                            ⚠ O QUE NÃO VOLTA É A COLISÃO DE COR: `programado` continua âmbar e
                            o azul segue reservado ao conciliado com vínculo. Aquela correção era
                            de bug, não de estilo — e sobrevive à reversão do estilo. */}
                        <td className={`truncate px-1 py-1 text-center align-middle text-[10px] leading-tight ${stColor}`}
                          title={stTitle}>{stLabel}</td>
                        {/* ⚠ UM BOTÃO "…" NO LUGAR DE DOIS ÍCONES — FIN-LISTA-LAYOUT-01. Dois
                            botões de 20px numa coluna de 36 disputavam espaço com a tabela
                            inteira, e o que eles faziam só se descobria no `title`. O menu diz
                            o nome de cada ação e devolve 8px à largura.
                            ⚠ TRÊS OPÇÕES, NÃO DUAS: parcela de financiamento troca "Editar" por
                            "Ver contrato" — ela não se edita aqui, edita-se no contrato. E
                            "Duplicar" continua desabilitado nela, com o motivo escrito no item,
                            que é a regra da casa para botão cinza. */}
                        <td className="!py-0 px-0 align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm" title="Ações">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[150px]">
                                {isParcelaFinanciamento ? (
                                  <DropdownMenuItem className="text-[11px]"
                                    onClick={() => abrirFinanciamentoDaParcela(l)}>
                                    <ExternalLink className="mr-1.5 h-3 w-3" /> Ver contrato
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem className="text-[11px]" disabled={!canEditRow}
                                    title={isHistoricoReadOnly ? 'Histórico antigo: somente leitura' : undefined}
                                    onClick={() => openEdit(l)}>
                                    <Pencil className="mr-1.5 h-3 w-3" /> Editar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-[11px]" disabled={isParcelaFinanciamento}
                                  title={isParcelaFinanciamento ? 'Parcela de financiamento — não duplicável' : undefined}
                                  onClick={() => handleDuplicate(l)}>
                                  <Copy className="mr-1.5 h-3 w-3" /> Duplicar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-muted border border-border rounded-lg">
              <span className="text-[11px] font-semibold">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
              <Button
                size="sm"
                variant="default"
                className="h-6 text-[10px] gap-1 px-2"
                disabled={realizarInfo.elegiveis.length === 0}
                onClick={() => { setDataPagamentoModo('vencimento'); setDataPagamentoUnica(''); setConfirmRealizarOpen(true); }}
              >
                <CheckCircle2 className="h-3 w-3" /> Marcar realizado{realizarInfo.elegiveis.length > 0 ? ` (${realizarInfo.elegiveis.length})` : ''}
              </Button>
              <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1 px-2" onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" /> Excluir selecionados
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3 w-3" /> Cancelar seleção
              </Button>
              {realizarInfo.mensagem && (
                <span className="text-[10px] text-muted-foreground">{realizarInfo.mensagem}</span>
              )}
            </div>
          )}

          {/* Total count + legenda dos ícones de origem (PR-CONC-B-1).
              ⚠ FORA DA ÁREA QUE ROLA, de propósito: dentro da tabela a legenda custaria uma
              linha de lista em cada tela, e some justamente quando o operador rola até o
              lançamento que não entendeu. */}
          {/* 8px = o padding interno do scrollport, para o rodapé alinhar com a PRIMEIRA
              COLUNA da tabela, não com a borda do card. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
            <span className="text-[10px] text-muted-foreground">
              {totalLancamentosFiltrados} lançamento{totalLancamentosFiltrados !== 1 ? 's' : ''} encontrado{totalLancamentosFiltrados !== 1 ? 's' : ''}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
              {LEGENDA_ICONES.map((ic, i) => (
                <span key={ic.simbolo} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-2 text-muted-foreground/60">·</span>}
                  <span className={cn('font-semibold not-italic', ic.cor)}>{ic.simbolo}</span>{' '}{ic.curto}
                </span>
              ))}
            </span>
          </div>
        </>
      )}

      <LancamentoV2Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingLanc(null); onCloseDialog?.(); }}
        onSave={handleSave}
        onDelete={handleDelete}
        lancamento={editingLanc}
        fazendas={fazendas}
        contas={hook.contasBancarias}
        classificacoes={hook.classificacoes}
        fornecedores={hook.fornecedores}
        safras={hook.safras}
        defaultFazendaId={fazendaId !== '__all__' ? fazendaId : fazOperacionais[0]?.id || ''}
        onCriarFornecedor={hook.criarFornecedor}
        permiteEditarFavorecidoOC={favOCEdit}
        onAbrirOperacaoOC={abrirOCFinanceiro}
      />


      {/* Bulk delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamentos em lote</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p><strong>{selectedIds.size}</strong> lançamento{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}.</p>
                <p><strong>{bloqueadosInfo.deletaveis.length}</strong> lançamento{bloqueadosInfo.deletaveis.length !== 1 ? 's serão' : ' será'} cancelado{bloqueadosInfo.deletaveis.length !== 1 ? 's' : ''} (exclusão lógica).</p>
                <p className="text-[11px] text-muted-foreground">Origens: {bloqueadosInfo.origens.join(', ')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting || bloqueadosInfo.deletaveis.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Excluindo...' : `Excluir ${bloqueadosInfo.deletaveis.length} lançamento${bloqueadosInfo.deletaveis.length !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk "marcar realizado" confirmation */}
      <AlertDialog open={confirmRealizarOpen} onOpenChange={setConfirmRealizarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como realizado em lote</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  <strong>{realizarInfo.elegiveis.length}</strong> lançamento{realizarInfo.elegiveis.length !== 1 ? 's' : ''} elegí{realizarInfo.elegiveis.length !== 1 ? 'veis serão' : 'vel será'} marcado{realizarInfo.elegiveis.length !== 1 ? 's' : ''} como <strong>realizado</strong>.
                </p>
                {realizarInfo.inelegiveis > 0 && (
                  <p className="text-[11px] text-muted-foreground">{realizarInfo.mensagem}</p>
                )}
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Data de pagamento</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dtpgto-modo"
                      checked={dataPagamentoModo === 'vencimento'}
                      onChange={() => setDataPagamentoModo('vencimento')}
                    />
                    <span>Usar o vencimento de cada lançamento <span className="text-muted-foreground">(recomendado)</span></span>
                  </label>
                  {dataPagamentoModo === 'vencimento' && realizarInfo.semVencimento > 0 && (
                    <p className="pl-6 text-[11px] text-amber-600 dark:text-amber-500">
                      {realizarInfo.semVencimento} sem vencimento — {realizarInfo.semVencimento !== 1 ? 'usarão' : 'usará'} a data de hoje.
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dtpgto-modo"
                      checked={dataPagamentoModo === 'unica'}
                      onChange={() => setDataPagamentoModo('unica')}
                    />
                    <span>Informar uma data única para todos</span>
                  </label>
                  {dataPagamentoModo === 'unica' && (
                    <DatePicker
                      value={dataPagamentoUnica}
                      onChange={setDataPagamentoUnica}
                      className="ml-6 h-8 w-44 text-xs"
                    />
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRealizando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkRealizar}
              disabled={bulkRealizando || realizarInfo.elegiveis.length === 0 || (dataPagamentoModo === 'unica' && !dataPagamentoUnica)}
            >
              {bulkRealizando ? 'Aplicando...' : `Marcar ${realizarInfo.elegiveis.length} como realizado`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
