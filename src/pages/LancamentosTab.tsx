import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MetaLancamentoPanel, useMetaValidacaoBloqueios, type EvolucaoSugestao, type MetaStepState } from '@/components/MetaLancamentoPanel';
import { EvolucaoAssistidaDialog } from '@/components/EvolucaoAssistidaDialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  Lancamento,
  CATEGORIAS,
  TIPOS_ENTRADA,
  TIPOS_SAIDA,
  TODOS_TIPOS,
  TipoMovimentacao,
  Categoria,
  isEntrada,
  isReclassificacao,
  kgToArrobas,
} from '@/types/cattle';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { ReabrirP1Dialog } from '@/components/ReabrirP1Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, ArrowLeft, AlertTriangle, LogIn, LogOut, RefreshCw, Clock, Info, Edit, Calendar, Building2, X } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { ReclassificacaoFormFields, useReclassificacaoState } from '@/components/ReclassificacaoForm';
import { ReclassificacaoResumoPanel } from '@/components/ReclassificacaoResumoPanel';
import { CompraDetalhesDialog, CompraDetalhes, EMPTY_COMPRA_DETALHES } from '@/components/compra/CompraDetalhesDialog';
import { CompraResumoPanel } from '@/components/compra/CompraResumoPanel';
import { CompraModalShell } from '@/components/compra/CompraModalShell';
import { gerarFinanceiroCompra } from '@/components/compra/gerarFinanceiroCompra';
import { OcRpcError, useOperacaoComercial } from '@/hooks/useOperacaoComercial';
import { useCompraLotes } from '@/hooks/useCompraLotes';
import { useOperacaoRecebimento } from '@/hooks/useOperacaoRecebimento';
import { useOperacaoDocumentos } from '@/hooks/useOperacaoDocumentos';
import { useOperacaoEventos } from '@/hooks/useOperacaoEventos';
import { useOperacaoLiquidacao } from '@/hooks/useOperacaoLiquidacao';
import { AbateDetalhesDialog, AbateDetalhes, EMPTY_ABATE_DETALHES } from '@/components/abate/AbateDetalhesDialog';
import { AbateResumoPanel } from '@/components/abate/AbateResumoPanel';
import { TransferenciaDetalhesDialog, TransferenciaDetalhes, EMPTY_TRANSFERENCIA_DETALHES } from '@/components/transferencia/TransferenciaDetalhesDialog';
import { TransferenciaResumoPanel } from '@/components/transferencia/TransferenciaResumoPanel';
import { buildTransferenciaCalculation, buildTransferenciaSnapshot } from '@/lib/calculos/transferencia';
import { buildAbateCalculation, parseNumericValue, type AbateCalculation } from '@/lib/calculos/abate';
import { buildVendaCalculation, buildVendaSnapshot, type VendaCalculation } from '@/lib/calculos/venda';
import { VendaDetalhesDialog, VendaDetalhes, EMPTY_VENDA_DETALHES } from '@/components/venda/VendaDetalhesDialog';
import { VendaResumoPanel } from '@/components/venda/VendaResumoPanel';
import { AbateExportDialog } from '@/components/AbateExportMenu';
import { AbateFinanceiroPanel, AbateFinanceiroPanelRef } from '@/components/AbateFinanceiroPanel';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { supabase } from '@/integrations/supabase/client';
import { VendaFinanceiroPanel, VendaFinanceiroPanelRef } from '@/components/VendaFinanceiroPanel';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { ConfirmacaoRegistroDialog } from '@/components/ConfirmacaoRegistroDialog';
import { useFazenda, isFazendaPecuaria } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { toast } from 'sonner';
import { useMasterLock } from '@/hooks/useMasterLock';
import { MasterLockBanner } from '@/components/MasterLockBanner';
import { MorteLoteMetaDialog } from '@/components/MorteLoteMetaDialog';

interface Props {
  lancamentos: Lancamento[];
  onAdicionar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => Promise<boolean | void> | boolean | void;
  onRemover: (id: string) => void;
  onCountFinanceiros?: (id: string) => Promise<number>;
  abaInicial?: Aba;
  onBackToConciliacao?: () => void;
  dataInicial?: string;
  backLabel?: string;
  /** Abate para abrir em modo edição automaticamente */
  abateParaEditar?: Lancamento | null;
  /** Venda para abrir em modo edição automaticamente */
  vendaParaEditar?: Lancamento | null;
  /** Compra para abrir em modo edição automaticamente */
  compraParaEditar?: Lancamento | null;
  /** Transferência para abrir em modo edição automaticamente */
  transferenciaParaEditar?: Lancamento | null;
  /** Reclassificação para abrir em modo edição automaticamente */
  reclassParaEditar?: Lancamento | null;
  /** Morte para abrir em modo edição automaticamente */
  morteParaEditar?: Lancamento | null;
  /** Consumo para abrir em modo edição automaticamente */
  consumoParaEditar?: Lancamento | null;
  /** Callback to return to the origin tab after edit cancel/save */
  onReturnFromEdit?: () => Promise<void> | void;
  /** Initial year filter for historico view */
  initialAnoFiltro?: string;
  /** Initial month filter for historico view */
  initialMesFiltro?: string;
  /** Cenário inicial para reclassificação quando navegado da Evolução por Categoria */
  initialReclassCenario?: 'realizado' | 'meta';
  /**
   * Callback opcional acionado pelo card "Chuvas" (atalho de navegação).
   * Quando ausente, o card fica oculto. Não altera lógica de lançamento.
   */
  onNavegarChuvas?: () => void;
  /**
   * PR-OC-NAV-01 — fecho do modo Operação Comercial (Compra): o parent (V2Index) retorna à Central
   * e limpa os parâmetros ?oc_compra/?oc_id da URL. Acionado só quando o modal está em modo OC.
   */
  onFecharOperacaoOC?: () => void;
  /**
   * PR-OC-ENTRYPOINT-COMPRA-01 — abre uma nova Compra no fluxo OC canônico (CompraModalShell modo OC,
   * ?oc_compra=1 sem oc_id). O parent (V2Index) faz a navegação SPA. Ausente = comportamento anterior.
   */
  onNovaCompraOC?: () => void;
  /**
   * Cenário inicial padrão da tela: 'realizado' (default) ou 'meta'.
   * Usado APENAS como valor inicial do `statusOp`. O usuário pode trocar
   * manualmente depois — comportamento atual (resets pós-save voltam a
   * 'realizado') preservado.
   */
  cenarioInicial?: 'realizado' | 'meta';
  /**
   * Restringe quais cenários ficam clicáveis no seletor "Status" do form.
   * Quando ausente, todos ficam disponíveis (comportamento atual).
   * Ex.: ['meta'] → bloqueia Realizado/Programado para a rota Lançamentos META Zoo.
   */
  cenariosPermitidos?: Array<'realizado' | 'programado' | 'meta'>;
}

type Aba = 'entrada' | 'saida' | 'reclassificacao';
import { STATUS_LABEL, STATUS_OPTIONS_ZOOTECNICO, META_VISUAL, getStatusBadge, type StatusOperacional } from '@/lib/statusOperacional';
import { usePermissions } from '@/hooks/usePermissions';

const MOTIVOS_MORTE = [
  'Raio', 'Picada de cobra', 'Doença respiratória', 'Tristeza parasitária',
  'Clostridiose', 'Intoxicação por planta', 'Acidente', 'Desidratação',
  'Parto distócico', 'Ataque de animal', 'Causa desconhecida',
];

interface Parcela { data: string; valor: number; }

const ABA_CONFIG: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: 'entrada', label: 'Entradas', icon: <LogIn className="h-4 w-4" /> },
  { id: 'saida', label: 'Saídas', icon: <LogOut className="h-4 w-4" /> },
  { id: 'reclassificacao', label: 'Reclass.', icon: <RefreshCw className="h-4 w-4" /> },
];

interface TipoCardItem {
  /** Identificador. Para itens `navOnly`, qualquer string (ex: 'chuvas'). */
  value: TipoMovimentacao | 'chuvas';
  aba: Aba;
  label: string;
  icon: string;
  desc: string;
  /**
   * Quando true, o card é um atalho de navegação para outra seção do app
   * (ex.: Chuvas). NÃO altera tipo/aba/state interno e NÃO abre o modal de
   * lançamento. O parent decide para onde navegar via `onNavegarChuvas`.
   */
  navOnly?: boolean;
}
interface TipoCardGroup { grupo: 'entradas' | 'saidas' | 'outros'; label: string; items: TipoCardItem[]; }

// Grupos de tipos para o seletor de cards superiores.
// onClick replica EXATAMENTE a mesma transição de aba/tipo da navegação antiga.
const TIPO_CARDS_GROUPS: TipoCardGroup[] = [
  {
    grupo: 'entradas', label: 'Entradas', items: [
      { value: 'nascimento', aba: 'entrada', label: 'Nascimento',           icon: '🐄', desc: 'Crias nascidas no rebanho' },
      { value: 'compra',     aba: 'entrada', label: 'Compra',               icon: '🛒', desc: 'Aquisição de animais' },
    ],
  },
  {
    grupo: 'saidas', label: 'Saídas', items: [
      { value: 'abate',                aba: 'saida', label: 'Abate',                icon: '🔪', desc: 'Envio ao frigorífico' },
      { value: 'venda',                aba: 'saida', label: 'Venda em pé',          icon: '💰', desc: 'Venda direta de animais' },
      /* ⚠ O "(saída)" saiu do TITULO e desceu para o subtitulo. A informacao nao se
         perde — ela muda de lugar, para o titulo caber em caixa de frase sem parenteses
         carregando semantica. */
      { value: 'transferencia_saida',  aba: 'saida', label: 'Transferência',        icon: '📤', desc: 'Saída para outra fazenda' },
      /* "Animais consumidos internamente" quebrava em duas linhas em meia largura e
         desalinhava a lista; o sujeito ja esta no titulo. */
      { value: 'consumo',              aba: 'saida', label: 'Consumo',              icon: '🍖', desc: 'Consumidos internamente' },
      { value: 'morte',                aba: 'saida', label: 'Morte',                icon: '💀', desc: 'Perdas no rebanho' },
    ],
  },
  {
    grupo: 'outros', label: 'Outros', items: [
      { value: 'reclassificacao', aba: 'reclassificacao', label: 'Evoluir categoria', icon: '🔄', desc: 'Mudar a categoria do animal' },
      // Atalho de navegação — NÃO é um tipo de lançamento. Vai para a tela de Chuvas.
      { value: 'chuvas',          aba: 'reclassificacao', label: 'Chuvas',            icon: '🌧️', desc: 'Registro pluviométrico', navOnly: true },
    ],
  },
];

/* Par rotulo-valor do resumo lateral do Nascimento — mesmo idioma do `Linha` de
   ResumoLateralOC (A17): rotulo cinza a esquerda, valor a direita, traco no vazio.
   Copia deliberada: importar de la puxaria um componente de outra tela para dentro
   deste arquivo, e a unificacao dos resumos e' de PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02. */
function LinhaResumoNasc({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right truncate">{valor || '—'}</span>
    </div>
  );
}

/* A fazenda no resumo tem um estado que os outros pares nao tem: ela pode estar
   FALTANDO e bloquear o registro. Traco cinza diria "ausente, tudo bem"; aqui a
   ausencia e' erro a resolver, e a cor precisa dizer isso. */
function LinhaResumoNascFazenda({ valor, falta }: { valor: string | null; falta: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">Fazenda</span>
      <span className={`font-medium text-right truncate ${falta ? 'text-destructive' : ''}`}>{valor || '—'}</span>
    </div>
  );
}

const STATUS_DESCRIPTIONS_DEFAULT: Partial<Record<StatusOperacional | 'meta', string>> = {
  meta: META_VISUAL.description,
  programado: 'Operação definida, ainda não executada.',
  realizado: 'Operação concluída. Impacta rebanho e financeiro.',
};

const STATUS_DESCRIPTIONS_ABATE: Partial<Record<StatusOperacional | 'meta', string>> = {
  meta: META_VISUAL.description,
  programado: 'Venda fechada e animais escalados, mas o abate ainda não ocorreu. Os dados ainda são previsões operacionais e financeiras.',
  realizado: 'Abate concluído com dados reais de carcaça, bônus e descontos. Os valores refletem o resultado efetivo da operação.',
};

const STATUS_DESCRIPTIONS_MORTE_CONSUMO: Partial<Record<StatusOperacional | 'meta', string>> = {
  meta: META_VISUAL.description,
  programado: 'Operação definida, ainda não executada. Não gera lançamento financeiro.',
  realizado: 'Operação concluída. Impacta apenas o estoque de rebanho.',
};

function getStatusDescription(tipo: TipoMovimentacao, status: StatusOperacional | 'meta'): string {
  if (tipo === 'abate') return STATUS_DESCRIPTIONS_ABATE[status];
  if (tipo === 'morte' || tipo === 'consumo') return STATUS_DESCRIPTIONS_MORTE_CONSUMO[status];
  return STATUS_DESCRIPTIONS_DEFAULT[status];
}

function getCamposFazenda(tipo: TipoMovimentacao, nomeFazenda: string) {
  switch (tipo) {
    case 'nascimento':
      return { origem: { show: false }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'compra':
      return { origem: { show: true, auto: false, label: 'Fornecedor / Fazenda Origem' }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'transferencia_entrada':
      return { origem: { show: true, auto: false, label: 'Origem', useSelect: true }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
    case 'abate':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Frigorífico' } };
    case 'venda':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Destino' } };
    case 'transferencia_saida':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Destino', useSelect: true } };
    case 'consumo':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: true, auto: false, label: 'Motivo', placeholder: 'Ex: Consumo interno' } };
    case 'morte':
      return { origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' }, destino: { show: false } };
    default:
      return { origem: { show: true, auto: false, label: 'Origem' }, destino: { show: true, auto: false, label: 'Destino' } };
  }
}

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

type FornecedorOption = {
  id: string;
  nome: string;
  nomeNormalizado?: string | null;
  aliases?: string[] | null;
  /* PR-OC-UX-LOTE-C1-01 — documento (CNPJ/CPF) exibido sob o nome na aba Compra.
     Coluna REAL conferida no schema: `cpf_cnpj` (existe tambem `cpf_cnpj_pagamento`,
     que e' outro campo e nao serve). Uma coluna a mais numa consulta ja paginada. */
  cpfCnpj?: string | null;
};

function normalizeFornecedorText(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchFornecedor(options: FornecedorOption[], params: { id?: string | null; nome?: string | null }) {
  if (!options.length) return undefined;

  if (params.id) {
    const byId = options.find(option => option.id === params.id);
    if (byId) return byId;
  }

  const normalizedNome = normalizeFornecedorText(params.nome);
  if (!normalizedNome) return undefined;

  return options.find(option => {
    const optionNome = normalizeFornecedorText(option.nome);
    const optionNormalizado = normalizeFornecedorText(option.nomeNormalizado);
    const aliases = (option.aliases || []).map(alias => normalizeFornecedorText(alias));

    return (
      optionNome === normalizedNome ||
      optionNormalizado === normalizedNome ||
      aliases.includes(normalizedNome) ||
      optionNome.includes(normalizedNome) ||
      normalizedNome.includes(optionNome) ||
      (optionNormalizado && optionNormalizado.includes(normalizedNome)) ||
      (optionNormalizado && normalizedNome.includes(optionNormalizado))
    );
  });
}

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover, onCountFinanceiros, abaInicial, onBackToConciliacao, dataInicial, backLabel, abateParaEditar, vendaParaEditar, compraParaEditar, transferenciaParaEditar, reclassParaEditar, morteParaEditar, consumoParaEditar, onReturnFromEdit, initialAnoFiltro, initialMesFiltro, initialReclassCenario, onNavegarChuvas, onFecharOperacaoOC, onNovaCompraOC, cenarioInicial, cenariosPermitidos }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const nomeFazenda = fazendaAtual?.nome || '';
  const isAdministrativo = fazendaAtual?.tem_pecuaria === false;
  const bloqueado = isGlobal || isAdministrativo;

  // ─── Master lock: bloqueia submit em meses completamente fechados ───
  const masterLock = useMasterLock();

  // ── Ponte Compra→OC (modo OC ISOLADO; NÃO é o fluxo principal) ──
  //   Opt-in explícito por ?oc_compra=1 (teste); OFF por padrão (comportamento legado intacto).
  //   Em modo OC, "Registrar Compra" cria/atualiza a operação comercial (zoo_operacoes_comerciais)
  //   via oc_salvar_rascunho e guarda operacao_id/versao; NUNCA executa onAdicionar nem
  //   gerarFinanceiroCompra (sem dupla escrita). Lotes/físico/financeiro ficam para PRs seguintes.
  const ocRpc = useOperacaoComercial();
  // PR-FIX-OC-OPEN-01 — fonte REATIVA da URL. O useMemo(…, []) anterior congelava
  //   window.location.search do 1º render; em mount com URL transitória, modoOCCompra/ocIdParam
  //   ficavam false/null para sempre — desligando a hidratação E o enabled das 4 subabas OC.
  const [ocSearchParams] = useSearchParams();
  const modoOCCompra = ocSearchParams.get('oc_compra') === '1';
  const [ocOperacaoId, setOcOperacaoId] = useState<string | null>(null);
  const [ocVersao, setOcVersao] = useState<number | null>(null);
  // Fazenda destino selecionada dentro do modal OC (default = fazenda do filtro atual).
  const [ocFazendaDestinoId, setOcFazendaDestinoId] = useState<string>(fazendaAtual?.id ?? '__atual__');
  // Estado comercial/entrega da operação OC (para gate do Recebimento — RECEB-01).
  const [ocStatusComercial, setOcStatusComercial] = useState<string | null>(null);
  const [ocEntregaEncerrada, setOcEntregaEncerrada] = useState<boolean>(false);
  // Abrir/hidratar operação EXISTENTE pela Central (PR-OC-COMPRA-OPEN-01). oc_id na URL =>
  //   abertura (não criação). ocAberturaExistente => cabeçalho SOMENTE LEITURA (writer não
  //   atualiza numero_documento/cenario; edição de programada é PR posterior).
  const ocIdParam = ocSearchParams.get('oc_id');
  const [ocAberturaExistente, setOcAberturaExistente] = useState<boolean>(false);

  /* PR-OC-EDICAO-POS-FECHAMENTO-02 (dirty tracking) — retrato dos DADOS DA OPERACAO
     como vieram do banco. Serve para responder duas perguntas que antes ninguem fazia:
     "mudou alguma coisa?" e "o que exatamente mudou?".
     ⚠ E' ref, nao state, de proposito: ninguem re-renderiza por causa dele, e ele
     precisa estar atualizado DENTRO da mesma funcao que acabou de gravar — state
     nao reflete na closure (a armadilha que mordeu na fatia 2).
     ⚠ Sem isto o salvamento automatico gravaria a cada navegacao, subindo `versao` e
     enchendo a auditoria de eventos que nao mudaram nada. */
  const ocSnapshotRef = useRef({ contraparte_id: '', data_operacao: '', observacoes: '', numero_documento: '' });
  // PR-OC-EDIT-01A — existe título financeiro materializado nesta operação? (parte ativa com
  //   financeiro_lancamento_id). Bloqueia a edição da base econômica (ADR Soberania Financeira).
  const [ocTemTitulo, setOcTemTitulo] = useState<boolean>(false);
  // PR-OC-EDIT-01B — flag real de rascunho técnico (cadastro incompleto). Desabilita "Confirmar".
  const [ocRascunho, setOcRascunho] = useState<boolean>(false);
  // PR-OC-EDIT-01B — ação de ciclo em andamento (impede clique duplo e desabilita conflitantes).
  const [acaoOcLoading, setAcaoOcLoading] = useState<null | 'confirmar' | 'cancelar' | 'reabrir'>(null);
  const [ocHidratando, setOcHidratando] = useState<boolean>(false);
  const [ocHidratacaoErro, setOcHidratacaoErro] = useState<string | null>(null);
  const ocHidratadoRef = useRef<boolean>(false);
  // COM-3: estado/handlers dos lotes comerciais (só em modo OC; fonte única = camada OC).
  const lotesApi = useCompraLotes({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    versao: ocVersao,
    onVersaoChange: setOcVersao,
    enabled: modoOCCompra,
  });
  const recebimentoApi = useOperacaoRecebimento({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    versao: ocVersao,
    onVersaoChange: setOcVersao,
    onStatusChange: setOcStatusComercial,
    onEntregaChange: setOcEntregaEncerrada,
    enabled: modoOCCompra,
  });
  const documentosApi = useOperacaoDocumentos({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    enabled: modoOCCompra,
  });
  const liquidacaoApi = useOperacaoLiquidacao({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    enabled: modoOCCompra,
  });
  /* Trilha de auditoria — mesma vizinhanca dos demais eixos da OC, uma api por aba.
     Nao recebe `clienteId`: a RLS de `zoo_operacao_eventos` ja recorta por tenant, e
     repassar o cliente aqui sugeriria um filtro que o hook nao faz. */
  const eventosApi = useOperacaoEventos({
    operacaoId: ocOperacaoId,
    enabled: modoOCCompra,
  });

  const outrasFazendas = useMemo(() => {
    return fazendas.filter(f => f.id !== fazendaAtual?.id && f.id !== '__global__' && f.tem_pecuaria !== false);
  }, [fazendas, fazendaAtual]);

  // PR-NAV-CONTEXTO-FAZENDA-01A — seletor de Fazenda do envelope OC (CompraModalShell): critério ÚNICO
  //   do domínio pecuário (isFazendaPecuaria) — sem Global, sem administrativas, apenas aptas. Inclui a
  //   fazenda atual quando ela própria é válida; a atual gravada só permanece se continuar no domínio.
  const fazendasOC = useMemo(() => fazendas.filter(isFazendaPecuaria), [fazendas]);

  const [aba, setAba] = useState<Aba>(abaInicial || 'entrada');
  // Etapa 1 — modal envolve o formulário; aberto por clique nos cards de tipo.
  const [lancModalOpen, setLancModalOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoMovimentacao>('nascimento');
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fazendaOrigem, setFazendaOrigem] = useState('');
  const [fazendaDestino, setFazendaDestino] = useState('');
  const [pesoKg, setPesoKg] = useState(abaInicial === 'entrada' || !abaInicial ? '30' : '');
  const [observacao, setObservacao] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [lastSavedLancamentoId, setLastSavedLancamentoId] = useState<string | null>(null);
  const [editingAbateId, setEditingAbateId] = useState<string | null>(null);
  const [editingFazendaId, setEditingFazendaId] = useState<string | null>(null);
  const [editingReclassId, setEditingReclassId] = useState<string | null>(null);
  /** Lancamento original antes da edição — para detectar alterações estruturais */
  const editOriginalRef = useRef<Lancamento | null>(null);
  const [p1BloqueioMsg, setP1BloqueioMsg] = useState<string | null>(null);
  const abateFinanceiroRef = useRef<AbateFinanceiroPanelRef>(null);
  const vendaFinanceiroRef = useRef<VendaFinanceiroPanelRef>(null);
  const [abateFinanceiroMissing, setAbateFinanceiroMissing] = useState(false);
  const [gerandoFinanceiroFallback, setGerandoFinanceiroFallback] = useState(false);
  const [anoFiltro, setAnoFiltro] = useState(initialAnoFiltro || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(initialMesFiltro || 'todos');

  // ─── P1 governance: derive anoMes from form date ───
  const formAnoMes = useMemo(() => {
    if (!data) return undefined;
    return data.slice(0, 7);
  }, [data]);
  const { status: statusPilaresForm, refetch: refetchPilares } = useStatusPilares(fazendaAtual?.id, formAnoMes);
  const p1Oficial = statusPilaresForm.p1_mapa_pastos.status === 'oficial';
  const [showReabrirP1, setShowReabrirP1] = useState(false);

  // Snapshot completo do contexto operacional ao abrir uma edição. Restaurado
  // ao salvar/cancelar para que o usuário retorne EXATAMENTE ao grid original
  // (cenário, tipo e filtros preservados — sem voltar para 'realizado'/data de hoje).
  const internalEditOrigin = useRef<{
    aba: Aba;
    anoFiltro: string;
    mesFiltro: string;
    statusOp: StatusOperacional | 'meta';
    tipo: TipoMovimentacao;
  } | null>(null);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  // Default 'realizado'. Quando `cenarioInicial='meta'` (Planejamento → Lançamentos
  // META Zoo), abre já em META. Usuário pode trocar manualmente depois.
  const [statusOp, setStatusOp] = useState<StatusOperacional | 'meta'>(
    cenarioInicial === 'meta' ? 'meta' : 'realizado',
  );
  // Cenário usado nos resets pós-save. Quando `cenariosPermitidos` está restrito,
  // não voltar a 'realizado' (botão estaria desabilitado) — usar o primeiro permitido.
  const defaultCenario: StatusOperacional | 'meta' =
    cenariosPermitidos && cenariosPermitidos.length > 0 ? cenariosPermitidos[0] : 'realizado';
  const [morteLoteOpen, setMorteLoteOpen] = useState(false);
  const { canEditMeta } = usePermissions();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reclassState = useReclassificacaoState({ onAdicionar, dataInicial, lancamentos, ano: Number(anoFiltro) });
  // Pré-seleciona cenário da Reclassificação quando navegado da Evolução por Categoria
  useEffect(() => {
    if (initialReclassCenario && abaInicial === 'reclassificacao') {
      reclassState.setStatusOp(initialReclassCenario);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReclassCenario, abaInicial]);

  // Sincronizar filtros de ano/mês com o filtro global do V2Index
  useEffect(() => {
    if (initialAnoFiltro) setAnoFiltro(String(initialAnoFiltro));
  }, [initialAnoFiltro]);

  useEffect(() => {
    if (initialMesFiltro) setMesFiltro(String(initialMesFiltro));
  }, [initialMesFiltro]);
  const [compraDetalhes, setCompraDetalhes] = useState<CompraDetalhes | null>(null);
  const [compraDialogOpen, setCompraDialogOpen] = useState(false);
  const [abateDetalhes, setAbateDetalhes] = useState<AbateDetalhes | null>(null);
  const [abateDialogOpen, setAbateDialogOpen] = useState(false);
   const [vendaDetalhes, setVendaDetalhes] = useState<VendaDetalhes | null>(null);
   const [vendaDialogOpen, setVendaDialogOpen] = useState(false);
   const [transferenciaDetalhes, setTransferenciaDetalhes] = useState<TransferenciaDetalhes | null>(null);
   const [transferenciaDialogOpen, setTransferenciaDialogOpen] = useState(false);
  const [evolucaoDialogOpen, setEvolucaoDialogOpen] = useState(false);
  const [evolucaoSugestao, setEvolucaoSugestao] = useState<EvolucaoSugestao | null>(null);
  const [metaStepState, setMetaStepState] = useState<MetaStepState | null>(null);

  const [motivoMorte, setMotivoMorte] = useState('');
  const [motivoMorteCustom, setMotivoMorteCustom] = useState('');

  const [pesoCarcacaKg, setPesoCarcacaKg] = useState('');
  const [precoArroba, setPrecoArroba] = useState('');
  const [precoKg, setPrecoKg] = useState('');
  const [bonusPrecoce, setBonusPrecoce] = useState('');
  const [bonusQualidade, setBonusQualidade] = useState('');
  const [bonusListaTrace, setBonusListaTrace] = useState('');
  const [descontoQualidade, setDescontoQualidade] = useState('');
  const [descontoFunrural, setDescontoFunrural] = useState('');
  const [outrosDescontos, setOutrosDescontos] = useState('');
  const [bonus, setBonus] = useState('');
  const [descontos, setDescontos] = useState('');
  const [comissaoPct, setComissaoPct] = useState('');
  const [frete, setFrete] = useState('');
  const [outrasDespesas, setOutrasDespesas] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [tipoPeso, setTipoPeso] = useState<string>('vivo');
  const [vendaTipoPreco, setVendaTipoPreco] = useState<string>('por_kg');
  const [vendaPrecoInput, setVendaPrecoInput] = useState('');
  const [boitelDataForResumo, setBoitelDataForResumo] = useState<import('@/components/BoitelPlanningDialog').BoitelData | null>(null);
  const [rendCarcaca, setRendCarcaca] = useState('');
  const [funruralPct, setFunruralPct] = useState('');
  const [funruralReais, setFunruralReais] = useState('');

  const [dataVenda, setDataVenda] = useState('');
  const [dataEmbarque, setDataEmbarque] = useState('');
  const [dataAbate, setDataAbate] = useState('');
  const [tipoVenda, setTipoVenda] = useState('');

  // Abate fornecedor (frigorífico) state
  const [abateFornecedorId, setAbateFornecedorId] = useState('');
  const [abateFornecedores, setAbateFornecedores] = useState<FornecedorOption[]>([]);
  const [novoFornecedorAbateOpen, setNovoFornecedorAbateOpen] = useState(false);
  const [abateFrigorificoNome, setAbateFrigorificoNome] = useState('');

  // Ref to store pending fornecedor match params — survives across renders
  const pendingFornecedorMatch = useRef<{ tipo: 'abate' | 'venda' | 'compra'; id?: string | null; nome?: string | null; lancamentoId?: string } | null>(null);

  // Compra fornecedor state
  const [compraFornecedorId, setCompraFornecedorId] = useState('');
  const [novoFornecedorCompraOpen, setNovoFornecedorCompraOpen] = useState(false);

  // Reset ÚNICO e completo do contexto OC (PR-OC-COMPRA-OPEN-01): evita vazamento de estado
  //   entre operações (A→B) e ao alternar criação/abertura. Não toca banco, não chama RPC.
  const resetContextoOC = useCallback(() => {
    setOcOperacaoId(null); setOcVersao(null); setOcStatusComercial(null); setOcEntregaEncerrada(false);
    setOcFazendaDestinoId(fazendaAtual?.id ?? '__atual__');
    setData(format(new Date(), 'yyyy-MM-dd')); setCompraFornecedorId(''); setObservacao('');
    setStatusOp('realizado'); setCompraDetalhes(null); setNotaFiscal(''); setFazendaOrigem('');
    setOcAberturaExistente(false); setOcTemTitulo(false); setOcRascunho(false); setOcHidratacaoErro(null);
  }, [fazendaAtual?.id]);

  // Hidratação de operação de Compra EXISTENTE a partir de ?oc_id (abertura pela Central).
  //   Roda UMA vez (ref-guard). Reset preventivo → carregarOperacao (RLS isola por cliente) →
  //   valida pertencimento/tipo → hidrata cabeçalho + ocOperacaoId/ocVersao/status → abre o modal.
  //   As 4 subabas re-hidratam sozinhas por operacaoId (não duplicar leitura aqui).
  useEffect(() => {
    if (!modoOCCompra || !ocIdParam || !clienteAtual?.id) return;
    if (ocHidratadoRef.current) return;
    ocHidratadoRef.current = true;
    let cancelado = false;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    (async () => {
      resetContextoOC();
      if (!UUID_RE.test(ocIdParam)) {
        setOcHidratacaoErro('Identificador de operação malformado.');
        toast.error('Identificador de operação malformado.');
        return;
      }
      setOcHidratando(true);
      try {
        const estado = await ocRpc.carregarOperacao(ocIdParam, clienteAtual.id);
        if (cancelado) return;
        if (!estado) throw new Error('Operação não encontrada ou inacessível a este cliente.');
        const op = estado.operacao;
        if (op.tipo_operacao !== 'compra') throw new Error('Esta operação não é uma Compra e não pode ser aberta aqui.');
        setData(op.data_operacao ?? format(new Date(), 'yyyy-MM-dd'));
        setCompraFornecedorId(op.contraparte_id ?? '');
        setOcFazendaDestinoId(op.fazenda_id ?? (fazendaAtual?.id ?? '__atual__'));
        setObservacao(op.observacoes ?? '');
        setStatusOp(op.cenario === 'meta' ? 'meta' : 'realizado');
        setNotaFiscal(op.numero_documento ?? '');   // PR-OC-EDIT-01A — hidrata sempre (evita valor legado no salvar).
        ocSnapshotRef.current = {
          contraparte_id: op.contraparte_id ?? '', data_operacao: op.data_operacao ?? '',
          observacoes: op.observacoes ?? '', numero_documento: op.numero_documento ?? '',
        };
        setOcOperacaoId(op.id);
        setOcVersao(op.versao);
        setOcStatusComercial(op.status_comercial);
        setOcEntregaEncerrada(!!op.entrega_encerrada);   // PR-HOTFIX-P0 — hidrata entrega soberana (habilita Reabrir)
        /* TITULO MATERIALIZADO — vem RESOLVIDO de `carregarOperacao`.
           ⚠ A flag da PARTE nao basta, e era esse o defeito: a parte guarda o
           vinculo e o proprio cancelamento, mas nao sabe se o LANCAMENTO foi
           cancelado. Com lancamento cancelado e parte ativa, a derivacao antiga
           concluia que havia titulo vivo e trancava a operacao INTEIRA —
           negociacao em somente-leitura e Reabrir, Cancelar e Salvar sumindo do
           rodape. A operacao ficava sem saida pela interface, protegida contra
           um titulo que nao existe mais.
           ⚠ A resolucao e FAIL-CLOSED: na duvida conta como ativo. O porque
           esta no comentario de `carregarOperacao`. */
        setOcTemTitulo((estado.titulosAtivos ?? 0) > 0);
        setOcRascunho(op.rascunho);
        setOcAberturaExistente(true);
        setTipo('compra');            // abre o CompraModalShell (isCompra), não o modal default.
        setLancModalOpen(true);
      } catch (e) {
        if (cancelado) return;
        resetContextoOC();
        const msg = e instanceof Error ? e.message : 'Falha ao abrir a operação.';
        setOcHidratacaoErro(msg);
        toast.error(msg);
      } finally {
        if (!cancelado) setOcHidratando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoOCCompra, ocIdParam, clienteAtual?.id]);

  // Venda destino fornecedor state
  const [vendaDestinoFornecedorId, setVendaDestinoFornecedorId] = useState('');
  const [novoFornecedorVendaOpen, setNovoFornecedorVendaOpen] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('1');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const isCenarioMeta = statusOp === 'meta';
  /** StatusOperacional efetivo — preserva 'meta' para modais financeiros */
  const effectiveStatusOp: StatusOperacional | 'meta' = isCenarioMeta ? 'meta' : statusOp as StatusOperacional;
  const isMeta = isCenarioMeta; // Meta usa estilo laranja

  // Lançamento sendo editado — desfaz seu efeito sobre saldo na validação meta.
  const metaLancamentoEmEdicao = useMemo(() => {
    if (!editingAbateId) return null;
    const orig = editOriginalRef.current;
    if (!orig) return null;
    return {
      id: orig.id,
      categoria: orig.categoria as Categoria,
      tipo: orig.tipo,
      quantidade: orig.quantidade,
      pesoKg: orig.pesoMedioKg || 0,
    };
  }, [editingAbateId]);

  // ── Bloqueio META: mesma lógica do painel inteligente ──
  const metaBloqueio = useMetaValidacaoBloqueios(
    data ? Number(data.slice(0, 4)) : new Date().getFullYear(),
    data ? Number(data.slice(5, 7)) : new Date().getMonth() + 1,
    (categoria || '') as Categoria | '',
    tipo,
    parseNumericValue(quantidade) || 0,
    parseNumericValue(pesoKg) || 0,
    clienteAtual?.id,
    metaLancamentoEmEdicao,
  );
  const isConfirmado = statusOp === 'programado';
  const isConciliado = statusOp === 'realizado';
  const isAbate = tipo === 'abate';
  const isNascimento = tipo === 'nascimento';
  /* ── RESUMO DO NASCIMENTO (PR-UI-NASCIMENTO-SHELL-02) ────────────────────────
     ⚠ AUSENCIA E' TRACO. `nascPesoTotal` e' NULL quando falta quantidade ou peso —
     nao zero. "Peso total: 0,00 kg" afirmaria que se multiplicou e deu zero, quando o
     que ha e' um formulario pela metade. Nenhum `?? 0` no caminho. */
  /* ── FAZENDA DO NASCIMENTO (PR-UI-NASCIMENTO-PARIDADE-03) ────────────────────
     Ate aqui a fazenda era heranca SILENCIOSA do contexto, e em Global o lancamento
     era recusado sem aviso — `adicionarLancamento` devolvia `undefined` e nada
     aparecia. Agora e' escolha: nasce com a do contexto quando ha uma, e o operador
     pode trocar. Em Global nasce vazia, e a tela diz isso ANTES de tentar gravar.
     ⚠ `fazendasOC` e' a mesma lista da aba Compra — dominio pecuario, sem Global e sem
     administrativas (criterio unico `isFazendaPecuaria`). */
  const [nascFazendaId, setNascFazendaId] = useState<string>('');
  useEffect(() => {
    if (!isNascimento) return;
    setNascFazendaId(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : '');
  }, [isNascimento, fazendaAtual?.id]);
  const nascFazendaNome = fazendasOC.find(f => f.id === nascFazendaId)?.nome ?? null;
  const nascFazendaFalta = isNascimento && !nascFazendaId;

  const nascQtd = parseNumericValue(quantidade) || 0;
  const nascPeso = parseDecimalInput(pesoKg) ?? 0;
  const nascPesoTotal = nascQtd > 0 && nascPeso > 0 ? nascQtd * nascPeso : null;
  const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isMorte = tipo === 'morte';
  const isCompra = tipo === 'compra';
  const isVenda = tipo === 'venda';
  const isConsumo = tipo === 'consumo';
  const isTransferencia = tipo === 'transferencia_entrada' || tipo === 'transferencia_saida';
  const isTransferenciaSaida = tipo === 'transferencia_saida';
  const hasFinancialImpact = !isNascimento && !isMorte && !isTransferencia;

  const usaPrecoArroba = isAbate;
  const usaPrecoKg = !isAbate && !isNascimento;

  const categoriasDisponiveis = useMemo(() => {
    if (isNascimento) return CATEGORIAS.filter(c => c.value === 'mamotes_m' || c.value === 'mamotes_f');
    return CATEGORIAS;
  }, [isNascimento]);

  // Import buildAbateCalculation for the abate-specific unified calc
  const abateCalc = useMemo((): AbateCalculation | null => {
    if (!isAbate || !abateDetalhes) return null;
    return buildAbateCalculation({
      quantidade: parseNumericValue(quantidade) || 0,
      pesoKg: parseNumericValue(pesoKg) || 0,
      pesoCarcacaKg: abateDetalhes.pesoCarcacaKgManual || undefined,
      rendCarcaca: abateDetalhes.rendCarcaca || undefined,
      precoArroba: abateDetalhes.precoArroba || undefined,
      funruralPct: abateDetalhes.funruralPct || undefined,
      funruralReais: abateDetalhes.funruralReais || undefined,
      bonusPrecoce: abateDetalhes.bonusPrecoce || undefined,
      bonusPrecoceReais: abateDetalhes.bonusPrecoceReais || undefined,
      bonusQualidade: abateDetalhes.bonusQualidade || undefined,
      bonusQualidadeReais: abateDetalhes.bonusQualidadeReais || undefined,
      bonusListaTrace: abateDetalhes.bonusListaTrace || undefined,
      bonusListaTraceReais: abateDetalhes.bonusListaTraceReais || undefined,
      descontoQualidade: abateDetalhes.descontoQualidade || undefined,
      descontoQualidadeReais: abateDetalhes.descontoQualidadeReais || undefined,
      outrosDescontos: abateDetalhes.outrosDescontos || undefined,
      outrosDescontosArroba: abateDetalhes.outrosDescontosArroba || undefined,
      formaReceb: abateDetalhes.formaReceb,
      qtdParcelas: abateDetalhes.qtdParcelas || undefined,
      parcelas: abateDetalhes.parcelas,
      valorBaseOverride: abateDetalhes.valorBrutoOverride
        ? parseNumericValue(abateDetalhes.valorBrutoOverride) || undefined
        : undefined,
    });
  }, [isAbate, abateDetalhes, quantidade, pesoKg]);

  // Transferência Saída — unified calc (single source of truth)
  const transferenciaCalc = useMemo(() => {
    if (!isTransferenciaSaida) return null;
    return buildTransferenciaCalculation({
      quantidade: parseNumericValue(quantidade) || 0,
      pesoKg: parseNumericValue(pesoKg) || 0,
      categoria,
      fazendaOrigem: nomeFazenda || fazendaOrigem,
      fazendaDestino,
      data,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp as StatusOperacional,
      observacao,
      precoReferenciaArroba: transferenciaDetalhes?.precoReferenciaArroba || undefined,
      precoReferenciaCabeca: transferenciaDetalhes?.precoReferenciaCabeca || undefined,
    });
  }, [isTransferenciaSaida, quantidade, pesoKg, categoria, fazendaOrigem, fazendaDestino, data, statusOp, observacao, transferenciaDetalhes, nomeFazenda]);

  // Venda em Pé — unified calc (single source of truth)
  const vendaCalc = useMemo((): VendaCalculation | null => {
    if (!isVenda || !vendaDetalhes) return null;
    const tipoPrecoEngine = vendaDetalhes.tipoPreco === 'por_total' ? 'por_cab' as const
      : vendaDetalhes.tipoPreco === 'por_cab' ? 'por_cab' as const
      : vendaDetalhes.tipoPreco === 'por_kg' ? 'por_kg' as const
      : 'por_kg' as const;
    return buildVendaCalculation({
      quantidade: parseNumericValue(quantidade) || 0,
      pesoKg: parseNumericValue(pesoKg) || 0,
      categoria,
      fazendaOrigem: nomeFazenda || fazendaOrigem,
      compradorNome: abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || '',
      data,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp as StatusOperacional,
      observacao,
      tipoPreco: tipoPrecoEngine,
      precoInput: vendaDetalhes.precoInput || vendaPrecoInput,
      tipoVenda: vendaDetalhes.tipoVenda,
      frete: vendaDetalhes.frete,
      comissaoPct: vendaDetalhes.comissaoPct,
      outrosCustos: vendaDetalhes.outrosCustos,
      funruralPct: vendaDetalhes.funruralPct,
      funruralReais: vendaDetalhes.funruralReais,
      notaFiscal: vendaDetalhes.notaFiscal,
      formaReceb: vendaDetalhes.formaReceb,
      qtdParcelas: vendaDetalhes.qtdParcelas,
      parcelas: vendaDetalhes.parcelas,
    });
  }, [isVenda, vendaDetalhes, quantidade, pesoKg, categoria, fazendaOrigem, data, statusOp, observacao, vendaPrecoInput, nomeFazenda, abateFornecedores, vendaDestinoFornecedorId]);

  const calc = useMemo(() => {
    const qtd = parseNumericValue(quantidade) || 0;
    const peso = parseNumericValue(pesoKg) || 0;

    // For abate, use the official abateCalc
    if (isAbate && abateCalc) {
      return {
        pesoArroba: abateCalc.pesoArrobaCab,
        totalArrobas: abateCalc.totalArrobas,
        totalKg: abateCalc.totalKg,
        valorBruto: abateCalc.valorBase,
        totalBonus: abateCalc.totalBonus,
        totalDescontos: abateCalc.funruralTotal + abateCalc.totalDescontos,
        comissaoVal: 0, freteVal: 0, outrasDespVal: 0,
        valorLiquido: abateCalc.valorLiquido,
        liqArroba: abateCalc.liqArroba,
        liqCabeca: abateCalc.liqCabeca,
        liqKg: abateCalc.liqKg,
        carcacaCalc: abateCalc.carcacaCalc,
        bonusPrecoceTotal: abateCalc.bonusPrecoceTotal,
        bonusQualidadeTotal: abateCalc.bonusQualidadeTotal,
        bonusListaTraceTotal: abateCalc.bonusListaTraceTotal,
        descQualidadeTotal: abateCalc.descQualidadeTotal,
        descFunruralTotal: abateCalc.funruralTotal,
        descOutrosTotal: abateCalc.descOutrosTotal,
      };
    }

    // Non-abate path (unchanged)
    const abRendCarcaca = Number(rendCarcaca) || 0;
    const abPrecoArroba = Number(precoArroba) || 0;
    const abBonusPrecoce = parseNumericValue(bonusPrecoce) || 0;
    const abBonusQualidade = parseNumericValue(bonusQualidade) || 0;
    const abBonusListaTrace = parseNumericValue(bonusListaTrace) || 0;
    const abDescQualidade = parseNumericValue(descontoQualidade) || 0;
    const abFunruralPct = parseNumericValue(funruralPct) || 0;
    const abFunruralReais = parseNumericValue(funruralReais) || 0;
    const abOutrosDescontos = parseNumericValue(outrosDescontos) || 0;

    // For venda with modal detalhes (normal venda only), source from vendaDetalhes
    const isVendaNormal = isVenda && vendaDetalhes && (vendaDetalhes.tipoVenda === 'desmama' || vendaDetalhes.tipoVenda === 'gado_adulto');

    const rend = abRendCarcaca;
    const carcacaCalc = rend > 0 ? peso * rend / 100 : parseNumericValue(pesoCarcacaKg) || 0;
    let pesoArroba = peso > 0 ? peso / 30 : 0;
    const totalArrobas = pesoArroba * qtd;
    const totalKg = peso * qtd;
    let valorBruto = 0;
    if (isVenda) {
      const vi = parseNumericValue(vendaPrecoInput) || 0;
      if (vendaTipoPreco === 'por_kg') { valorBruto = totalKg * vi; }
      else if (vendaTipoPreco === 'por_cab') { valorBruto = qtd * vi; }
      else if (vendaTipoPreco === 'por_total') { valorBruto = vi; }
    }
    else if (usaPrecoKg) { valorBruto = totalKg * (parseNumericValue(precoKg) || 0); }
    const bonusPrecoceTotal = 0;
    const bonusQualidadeTotal = 0;
    const bonusListaTraceTotal = 0;
    const descQualidadeTotal = parseNumericValue(descontoQualidade) || 0;
    const funruralReaisVal = abFunruralReais;
    const descFunruralTotal = isVenda
      ? (funruralReaisVal > 0 ? funruralReaisVal : valorBruto * abFunruralPct / 100)
      : 0;
    const descOutrosTotal = isVenda ? abOutrosDescontos : 0;
    const totalBonus = parseNumericValue(bonus) || 0;
    const totalDescontos = isVenda
      ? descQualidadeTotal + descFunruralTotal + descOutrosTotal
      : (parseNumericValue(descontos) || 0);
    const comissaoVal = valorBruto * (parseNumericValue(comissaoPct) || 0) / 100;
    const freteVal = parseNumericValue(frete) || 0;
    const outrasDespVal = parseNumericValue(outrasDespesas) || 0;
    const valorLiquido = valorBruto + totalBonus - totalDescontos - comissaoVal - freteVal - outrasDespVal;
    const liqArroba = totalArrobas > 0 ? valorLiquido / totalArrobas : 0;
    const liqCabeca = qtd > 0 ? valorLiquido / qtd : 0;
    const liqKg = totalKg > 0 ? valorLiquido / totalKg : 0;
    return {
      pesoArroba, totalArrobas, totalKg, valorBruto, totalBonus, totalDescontos,
      comissaoVal, freteVal, outrasDespVal, valorLiquido, liqArroba, liqCabeca, liqKg,
      carcacaCalc, bonusPrecoceTotal, bonusQualidadeTotal, bonusListaTraceTotal,
      descQualidadeTotal, descFunruralTotal, descOutrosTotal,
    };
  }, [quantidade, pesoKg, pesoCarcacaKg, rendCarcaca, precoArroba, precoKg, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, funruralPct, funruralReais, outrosDescontos, bonus, descontos, comissaoPct, frete, outrasDespesas, isAbate, isVenda, usaPrecoArroba, usaPrecoKg, vendaTipoPreco, vendaPrecoInput, vendaDetalhes, abateDetalhes, abateCalc]);

  const gerarParcelas = useCallback((numParcelas: number, baseDate: string, valorTotal: number) => {
    const p: Parcela[] = [];
    const valorParcela = valorTotal / numParcelas;
    for (let i = 0; i < numParcelas; i++) {
      const d = addDays(parseISO(baseDate || data), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(valorParcela * 100) / 100 });
    }
    if (p.length > 0) {
      const sumOthers = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((valorTotal - sumOthers) * 100) / 100;
    }
    return p;
  }, [data]);

  const handleQtdParcelasChange = (v: string) => {
    setQtdParcelas(v);
    const n = Number(v);
    if (n > 0 && calc.valorBruto > 0) {
      setParcelas(gerarParcelas(n, dataVenda || data, calc.valorBruto));
    }
  };

  // FONTE OFICIAL: anos reais do banco
  const { data: anosDisponiveis = [String(new Date().getFullYear())] } = useAnosDisponiveis();

  const MESES = [
    { value: 'todos', label: 'Todos' },
    { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
    { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
    { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
    { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
    { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
  ];

  const historicoFiltrado = useMemo(() => {
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  const lancamentoDetalhe = detalheId ? lancamentos.find(l => l.id === detalheId) : null;
  const campos = useMemo(() => getCamposFazenda(tipo, nomeFazenda), [tipo, nomeFazenda]);

  const numOrUndef = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };

  const resetFinancialFields = () => {
    setPesoCarcacaKg(''); setPrecoArroba(''); setPrecoKg('');
    setBonusPrecoce(''); setBonusQualidade(''); setBonusListaTrace('');
    setDescontoQualidade(''); setDescontoFunrural(''); setOutrosDescontos('');
    setBonus(''); setDescontos(''); setComissaoPct(''); setFrete(''); setOutrasDespesas('');
    setNotaFiscal(''); setTipoPeso('vivo'); setObservacao('');
    setVendaTipoPreco('por_kg'); setVendaPrecoInput('');
    setDataVenda(''); setDataEmbarque(''); setDataAbate(''); setTipoVenda('');
    setAbateFornecedorId('');
    setAbateFrigorificoNome('');
    setCompraFornecedorId('');
    setVendaDestinoFornecedorId('');
    setFormaPagamento('avista'); setParcelas([]); setQtdParcelas('1');
    setMotivoMorte(''); setMotivoMorteCustom('');
    setRendCarcaca(''); setFunruralPct(''); setFunruralReais('');
    setVendaDetalhes(null);
    setBoitelDataForResumo(null);
    pendingFornecedorMatch.current = null;
  };

  const resetAllFields = () => {
    setQuantidade('');
    setCategoria('');
    setPesoKg('');
    setFazendaOrigem('');
    setFazendaDestino('');
    setData('');
    setStatusOp(defaultCenario);
    setLastSavedLancamentoId(null);
    setEditingAbateId(null);
    setDetalheId(null);
    setFinanceiroOpen(false);
    setCompraDetalhes(null);
    setCompraDialogOpen(false);
    setAbateDetalhes(null);
    setAbateDialogOpen(false);
    setTransferenciaDetalhes(null);
    setTransferenciaDialogOpen(false);
    resetFinancialFields();
    vendaFinanceiroRef.current?.resetForm();
  };

  // Check if financeiro records exist for current editing abate
  useEffect(() => {
    if (!editingAbateId || tipo !== 'abate' || statusOp !== 'realizado') {
      setAbateFinanceiroMissing(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('financeiro_lancamentos_v2')
      .select('id')
      .eq('movimentacao_rebanho_id', editingAbateId)
      .eq('cancelado', false)
      .limit(1)
      .then(({ data: rows }) => {
        if (!cancelled) setAbateFinanceiroMissing(!rows || rows.length === 0);
      });
    return () => { cancelled = true; };
  }, [editingAbateId, tipo, statusOp]);

  const handleGerarFinanceiroFallback = async () => {
    if (!editingAbateId || !abateFinanceiroRef.current) return;
    setGerandoFinanceiroFallback(true);
    try {
      const ok = await abateFinanceiroRef.current.generateFinanceiro(editingAbateId, {
        valorLiquido: calc.valorLiquido,
        totalDescontos: calc.totalDescontos,
        formaReceb: abateDetalhes?.formaReceb || 'avista',
        parcelas: abateDetalhes?.parcelas || [],
      });
      if (ok) {
        setAbateFinanceiroMissing(false);
        toast.success('Financeiro gerado com sucesso!');
      }
    } finally {
      setGerandoFinanceiroFallback(false);
    }
  };

  const handleCancelEdit = useCallback(() => {
    editOriginalRef.current = null;
    setP1BloqueioMsg(null);
    setEditingAbateId(null);
    setEditingFazendaId(null);
    setQuantidade(''); setCategoria(''); setPesoKg('');
    setFazendaOrigem(''); setFazendaDestino('');
    setData(format(new Date(), 'yyyy-MM-dd'));
    setObservacao(''); setStatusOp(defaultCenario);
    resetFinancialFields();
    // Restaurar contexto operacional original (cenário/tipo/aba/filtros) —
    // SOBRESCREVE os defaults que o reset acima aplicou (setStatusOp(defaultCenario)).
    const ctx = internalEditOrigin.current;
    if (ctx) {
      setAba(ctx.aba);
      setAnoFiltro(ctx.anoFiltro);
      setMesFiltro(ctx.mesFiltro);
      setStatusOp(ctx.statusOp);
      setTipo(ctx.tipo);
      internalEditOrigin.current = null;
    }
    if (onReturnFromEdit) onReturnFromEdit();
  }, [onReturnFromEdit]);

  // Helper: restore edit origin context (internal or external).
  // SEMPRE chamado APÓS o reset de campos no handleSubmit — restaura
  // statusOp/tipo/aba/filtros para o que estavam no momento da abertura
  // do modal, sobrescrevendo os defaults aplicados pelo reset.
  const restoreEditOrigin = useCallback(() => {
    const ctx = internalEditOrigin.current;
    if (ctx) {
      setAba(ctx.aba);
      setAnoFiltro(ctx.anoFiltro);
      setMesFiltro(ctx.mesFiltro);
      setStatusOp(ctx.statusOp);
      setTipo(ctx.tipo);
      internalEditOrigin.current = null;
    }
    setEditingFazendaId(null);
    onReturnFromEdit?.();
  }, [onReturnFromEdit]);

  const loadAbateForEdit = useCallback((l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    // 1. Set tab & type
    setAba('saida');
    setTipo('abate');

    // 2. Zootechnical data
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    // Fallback: if pesoMedioKg is missing, try to recover from snapshot calculation
    const snapCalc = l.detalhesSnapshot?.calculation;
    const pesoFallback = l.pesoMedioKg || (snapCalc?.pesoKg) || 0;
    setPesoKg(pesoFallback ? String(pesoFallback) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    if (l.tipo === 'morte') {
      const motivo = l.fazendaDestino || l.observacao || '';
      const isPreset = MOTIVOS_MORTE.includes(motivo);
      setMotivoMorte(isPreset ? motivo : motivo ? '__custom__' : '');
      setMotivoMorteCustom(isPreset ? '' : motivo);
    }
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // 3. Check for snapshot first (PRIORITY 1)
    const snap = l.detalhesSnapshot;
    const abateFrigorifico = l.frigorifico ?? '';
    setAbateFrigorificoNome(abateFrigorifico);
    if (snap && snap.type === 'abate') {
      // Direct restore from snapshot
      setTipoPeso(snap.tipoPeso || 'vivo');
      setDataVenda(snap.dataVenda || '');
      setDataEmbarque(snap.dataEmbarque || '');
      setDataAbate(snap.dataAbate || l.data || '');
      setTipoVenda(snap.tipoVenda || '');
      setPrecoArroba(snap.precoArroba || '');
      setRendCarcaca(snap.rendCarcaca || '');
      setBonusPrecoce(snap.bonusPrecoce || '');
      setBonusQualidade(snap.bonusQualidade || '');
      setBonusListaTrace(snap.bonusListaTrace || '');
      setDescontoQualidade(snap.descontoQualidade || '');
      setFunruralPct(snap.funruralPct || '');
      setFunruralReais(snap.funruralReais || '');
      setOutrosDescontos(snap.outrosDescontos || '');

      setAbateDetalhes({
        dataVenda: snap.dataVenda || '',
        dataEmbarque: snap.dataEmbarque || '',
        dataAbate: snap.dataAbate || l.data || '',
        tipoVenda: snap.tipoVenda || '',
        tipoPeso: snap.tipoPeso || 'vivo',
        rendCarcaca: snap.rendCarcaca || '',
        precoArroba: snap.precoArroba || '',
        bonusPrecoce: snap.bonusPrecoce || '',
        bonusQualidade: snap.bonusQualidade || '',
        bonusListaTrace: snap.bonusListaTrace || '',
        descontoQualidade: snap.descontoQualidade || '',
        funruralPct: snap.funruralPct || '',
        funruralReais: snap.funruralReais || '',
        outrosDescontos: snap.outrosDescontos || '',
        notaFiscal: snap.notaFiscal || '',
        formaReceb: snap.formaReceb || 'avista',
        qtdParcelas: snap.qtdParcelas || '1',
        parcelas: snap.parcelas || [],
        frigorifico: snap.frigorifico || l.frigorifico || '',
        pedido: snap.pedido || l.pedido || '',
        instrucao: snap.instrucao || l.instrucao || '',
        docAcerto: snap.docAcerto || l.docAcerto || '',
        pesoTotalKgNF: snap.pesoTotalKgNF || '',
        valorBrutoOverride: snap.valorBrutoOverride || '',
        anexoNfUrl: snap.anexoNfUrl || l.anexoNfUrl || '',
        anexoAcertoUrl: snap.anexoAcertoUrl || l.anexoAcertoUrl || '',
        // Restore missing bidirectional fields
        pesoCarcacaKgManual: snap.pesoCarcacaKgManual || '',
        bonusPrecoceReais: snap.bonusPrecoceReais || '',
        bonusQualidadeReais: snap.bonusQualidadeReais || '',
        bonusListaTraceReais: snap.bonusListaTraceReais || '',
        descontoQualidadeReais: snap.descontoQualidadeReais || '',
        outrosDescontosArroba: snap.outrosDescontosArroba || '',
        observacoesInternas: snap.observacoesInternas || '',
      });
    } else {
      // FALLBACK: reconstruct from lancamento fields
      setTipoPeso(l.tipoPeso || 'vivo');
      setDataVenda(l.dataVenda || '');
      setDataEmbarque(l.dataEmbarque || '');
      setDataAbate(l.dataAbate || l.data || '');
      setTipoVenda(l.tipoVenda || '');
      setPrecoArroba(l.precoArroba ? String(l.precoArroba) : '');
      setPesoCarcacaKg(l.pesoCarcacaKg ? String(l.pesoCarcacaKg) : '');

      if (l.pesoCarcacaKg && l.pesoMedioKg && l.pesoMedioKg > 0) {
        setRendCarcaca(String(((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(2)));
      } else {
        setRendCarcaca('');
      }

      const rend = l.pesoCarcacaKg && l.pesoMedioKg ? l.pesoCarcacaKg / l.pesoMedioKg : 0;
      const arrobasCab = (l.pesoMedioKg ?? 0) * rend / 15;
      const totalArrobas = arrobasCab * l.quantidade;
      const toArroba = (total: number | undefined) => {
        if (!total || totalArrobas <= 0) return '';
        return String((total / totalArrobas).toFixed(2));
      };
      setBonusPrecoce(toArroba(l.bonusPrecoce));
      setBonusQualidade(toArroba(l.bonusQualidade));
      setBonusListaTrace(toArroba(l.bonusListaTrace));
      setDescontoQualidade(toArroba(l.descontoQualidade));
      setOutrosDescontos(l.outrosDescontos ? String(l.outrosDescontos) : '');

      if (l.descontoFunrural && l.descontoFunrural > 0 && totalArrobas > 0 && l.precoArroba) {
        const valorBruto = totalArrobas * l.precoArroba;
        if (valorBruto > 0) {
          setFunruralPct(String(((l.descontoFunrural / valorBruto) * 100).toFixed(2)));
        } else {
          setFunruralPct('');
        }
      } else {
        setFunruralPct('');
      }

      const rendCalc = l.pesoCarcacaKg && l.pesoMedioKg && l.pesoMedioKg > 0
        ? String(((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(2)) : '';
      const funruralPctCalc = (() => {
        if (l.descontoFunrural && l.descontoFunrural > 0 && totalArrobas > 0 && l.precoArroba) {
          const vb = totalArrobas * l.precoArroba;
          return vb > 0 ? String(((l.descontoFunrural / vb) * 100).toFixed(2)) : '';
        }
        return '';
      })();

      setAbateDetalhes({
        dataVenda: l.dataVenda || '',
        dataEmbarque: l.dataEmbarque || '',
        dataAbate: l.dataAbate || l.data || '',
        tipoVenda: l.tipoVenda || '',
        tipoPeso: l.tipoPeso || 'vivo',
        rendCarcaca: rendCalc,
        precoArroba: l.precoArroba ? String(l.precoArroba) : '',
        bonusPrecoce: toArroba(l.bonusPrecoce),
        bonusQualidade: toArroba(l.bonusQualidade),
        bonusListaTrace: toArroba(l.bonusListaTrace),
        descontoQualidade: toArroba(l.descontoQualidade),
        funruralPct: funruralPctCalc,
        funruralReais: l.descontoFunrural ? String(l.descontoFunrural) : '',
        outrosDescontos: l.outrosDescontos ? String(l.outrosDescontos) : '',
        notaFiscal: l.notaFiscal || '',
        formaReceb: 'avista',
        qtdParcelas: '1',
        parcelas: [],
        frigorifico: l.frigorifico || '',
        pedido: l.pedido || '',
        instrucao: l.instrucao || '',
        docAcerto: l.docAcerto || '',
        // Path B (fallback sem detalhesSnapshot): popular campos que antes ficavam undefined,
        // causando initialData.pesoCarcacaKgManual=undefined → dialog abrir com 4 campos de
        // carcaça em branco → user salvar sobrescrevendo banco com NULL. Espelha campos
        // disponíveis no Lancamento (cattle.ts).
        pesoCarcacaKgManual: l.pesoCarcacaKg ? String(l.pesoCarcacaKg) : '',
        bonusPrecoceReais: l.bonusPrecoce ? String(l.bonusPrecoce) : '',
        bonusQualidadeReais: l.bonusQualidade ? String(l.bonusQualidade) : '',
        bonusListaTraceReais: l.bonusListaTrace ? String(l.bonusListaTrace) : '',
        descontoQualidadeReais: l.descontoQualidade ? String(l.descontoQualidade) : '',
        outrosDescontosArroba: '',
        pesoTotalKgNF: l.pesoTotal ? String(l.pesoTotal) : '',
        valorBrutoOverride: '',
        anexoNfUrl: l.anexoNfUrl || '',
        anexoAcertoUrl: l.anexoAcertoUrl || '',
        observacoesInternas: l.observacao || '',
      });
    }

    // Store pending fornecedor match in ref (will be applied by effect when list is ready)
    pendingFornecedorMatch.current = {
      tipo: 'abate',
      id: snap?.fornecedorId,
      nome: snap?.fornecedorNome || l.fazendaDestino,
      lancamentoId: l.id,
    };

    // Try immediate match if fornecedores already loaded
    const matchedFornecedor = matchFornecedor(abateFornecedores, {
      id: snap?.fornecedorId,
      nome: snap?.fornecedorNome || l.compradorFornecedor || l.fazendaDestino,
    });

    if (matchedFornecedor) {
      setAbateFornecedorId(matchedFornecedor.id);
      pendingFornecedorMatch.current = null;
    }

    // 8. Set editing mode
    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load abate for editing when navigated from another tab
  useEffect(() => {
    if (abateParaEditar) {
      loadAbateForEdit(abateParaEditar);
      setLancModalOpen(true); // Abre o modal de form/financial automaticamente
    }
  }, [abateParaEditar, abateFornecedores]);

  // Auto-load reclassificação for editing when navigated from another tab
  useEffect(() => {
    if (reclassParaEditar) {
      setAba('reclassificacao');
      setEditingReclassId(reclassParaEditar.id);
      reclassState.setCategoriaOrigem(reclassParaEditar.categoria as any);
      reclassState.setCategoriaDestino((reclassParaEditar.categoriaDestino || 'bois') as any);
      reclassState.setData(reclassParaEditar.data);
      reclassState.setQuantidade(String(reclassParaEditar.quantidade));
      reclassState.setPesoKg(reclassParaEditar.pesoMedioKg ? String(reclassParaEditar.pesoMedioKg) : '');
      reclassState.setPesoAutoFilled(true);
      const isMeta = reclassParaEditar.cenario === 'meta' || reclassParaEditar.statusOperacional === 'previsto';
      reclassState.setStatusOp(isMeta ? 'meta' : 'realizado');
    }
  }, [reclassParaEditar]);

  // CRITICAL: Apply pending fornecedor match whenever fornecedores list changes
  useEffect(() => {
    if (abateFornecedores.length === 0) return;

    const pending = pendingFornecedorMatch.current;
    if (!pending) return;

    const matched = matchFornecedor(abateFornecedores, { id: pending.id, nome: pending.nome });
    if (matched) {
      if (pending.tipo === 'abate') setAbateFornecedorId(matched.id);
      else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(matched.id);
      else if (pending.tipo === 'compra') setCompraFornecedorId(matched.id);
      pendingFornecedorMatch.current = null;
      return;
    }

    // If no match in cached list, try direct DB lookup
    if (pending.id) {
      supabase
        .from('financeiro_fornecedores')
        .select('id, nome, nome_normalizado, aliases, cpf_cnpj')
        .eq('id', pending.id)
        .maybeSingle()
        .then(({ data: forn }) => {
          if (forn) {
            setAbateFornecedores(prev => {
              if (prev.some(f => f.id === forn.id)) return prev;
              return [...prev, { id: forn.id, nome: forn.nome, nomeNormalizado: forn.nome_normalizado, aliases: forn.aliases as string[] | null, cpfCnpj: forn.cpf_cnpj }].sort((a, b) => a.nome.localeCompare(b.nome));
            });
            if (pending.tipo === 'abate') setAbateFornecedorId(forn.id);
            else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(forn.id);
            else if (pending.tipo === 'compra') setCompraFornecedorId(forn.id);
            pendingFornecedorMatch.current = null;
          }
        });
    }

    // Also try via financeiro vinculado
    if (pending.lancamentoId) {
      supabase
        .from('financeiro_lancamentos_v2')
        .select('favorecido_id')
        .eq('movimentacao_rebanho_id', pending.lancamentoId)
        .not('favorecido_id', 'is', null)
        .limit(1)
        .then(({ data: finRecs }) => {
          if (!finRecs?.[0]?.favorecido_id) return;
          const favId = finRecs[0].favorecido_id;
          const matchedFin = matchFornecedor(abateFornecedores, { id: favId, nome: pending.nome });
          if (matchedFin) {
            if (pending.tipo === 'abate') setAbateFornecedorId(matchedFin.id);
            else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(matchedFin.id);
            else if (pending.tipo === 'compra') setCompraFornecedorId(matchedFin.id);
            pendingFornecedorMatch.current = null;
          } else {
            supabase
              .from('financeiro_fornecedores')
              .select('id, nome, nome_normalizado, aliases, cpf_cnpj')
              .eq('id', favId)
              .maybeSingle()
              .then(({ data: forn }) => {
                if (forn) {
                  setAbateFornecedores(prev => {
                    if (prev.some(f => f.id === forn.id)) return prev;
                    return [...prev, { id: forn.id, nome: forn.nome, nomeNormalizado: forn.nome_normalizado, aliases: forn.aliases as string[] | null, cpfCnpj: forn.cpf_cnpj }].sort((a, b) => a.nome.localeCompare(b.nome));
                  });
                  if (pending.tipo === 'abate') setAbateFornecedorId(forn.id);
                  else if (pending.tipo === 'venda') setVendaDestinoFornecedorId(forn.id);
                  else if (pending.tipo === 'compra') setCompraFornecedorId(forn.id);
                  pendingFornecedorMatch.current = null;
                }
              });
          }
        });
    }
  }, [abateFornecedores]);

  // Load venda into form for editing
  const loadVendaForEdit = useCallback(async (l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    // 1. Set tab & type
    setAba('saida');
    setTipo('venda');

    // 2. Zootechnical data
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    if (l.tipo === 'morte') {
      const motivo = l.fazendaDestino || l.observacao || '';
      const isPreset = MOTIVOS_MORTE.includes(motivo);
      setMotivoMorte(isPreset ? motivo : motivo ? '__custom__' : '');
      setMotivoMorteCustom(isPreset ? '' : motivo);
    }
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // 3. Fornecedor: use pendingFornecedorMatch ref for robust loading
    const snap = l.detalhesSnapshot;
    const isBoitelSnap = snap?.type === 'venda_boitel';
    const snapVendaFornId = (snap?.type === 'venda' || isBoitelSnap) ? snap.fornecedorId : undefined;
    const snapVendaFornNome = (snap?.type === 'venda' || isBoitelSnap) ? snap.fornecedorNome : undefined;

    pendingFornecedorMatch.current = {
      tipo: 'venda',
      id: snapVendaFornId,
      nome: snapVendaFornNome || l.fazendaDestino,
      lancamentoId: l.id,
    };

    const matchedVendaForn = matchFornecedor(abateFornecedores, {
      id: snapVendaFornId,
      nome: snapVendaFornNome || l.fazendaDestino,
    });
    if (matchedVendaForn) {
      setVendaDestinoFornecedorId(matchedVendaForn.id);
      pendingFornecedorMatch.current = null;
    }

    // 4. Check for snapshot first (PRIORITY 1)
    const vendaSnap = l.detalhesSnapshot;
    if (vendaSnap && vendaSnap.type === 'venda_boitel') {
      setTipoPeso('boitel');
      // Store snapshot boitelData for rehydration via initialBoitelData prop
      if (vendaSnap.boitelSnapshot) {
        setBoitelDataForResumo(vendaSnap.boitelSnapshot as any);
      }
      console.log('[Venda Edit] Rehydrating Boitel from snapshot', vendaSnap);
    } else if (vendaSnap && vendaSnap.type === 'venda') {
      const tv = vendaSnap.tipoVenda || l.tipoVenda || 'gado_adulto';
      setTipoPeso(tv);

      const vendaDet: VendaDetalhes = {
        tipoVenda: (tv === 'desmama' || tv === 'gado_adulto') ? tv as 'desmama' | 'gado_adulto' : 'gado_adulto',
        tipoPreco: vendaSnap.tipoPreco ?? vendaSnap.tipo_preco ?? 'por_kg',
        precoInput: vendaSnap.precoInput ?? vendaSnap.preco_input ?? '',
        frete: vendaSnap.frete || '',
        comissaoPct: vendaSnap.comissaoPct || '',
        outrosCustos: vendaSnap.outrosCustos || '',
        funruralPct: vendaSnap.funruralPct || '',
        funruralReais: vendaSnap.funruralReais || '',
        notaFiscal: vendaSnap.notaFiscal || '',
        formaReceb: vendaSnap.formaReceb || 'avista',
        qtdParcelas: vendaSnap.qtdParcelas || '1',
        parcelas: vendaSnap.parcelas || [],
      };

      setVendaDetalhes(vendaDet);
      setVendaTipoPreco(vendaDet.tipoPreco);
      setVendaPrecoInput(vendaDet.precoInput);
      setFunruralPct(vendaDet.funruralPct);
      setFunruralReais(vendaDet.funruralReais);
      setFrete(vendaDet.frete);
      setComissaoPct(vendaDet.comissaoPct);
      setOutrosDescontos(vendaDet.outrosCustos);
    } else {
      // FALLBACK: reconstruct from lancamento + financial records
      const tv = l.tipoVenda || 'gado_adulto';
      setTipoPeso(tv);

      let tipoPreco: 'por_kg' | 'por_cab' | 'por_total' = 'por_kg';
      if (l.tipoPeso === 'por_kg' || l.tipoPeso === 'por_cab' || l.tipoPeso === 'por_total') {
        tipoPreco = l.tipoPeso as 'por_kg' | 'por_cab' | 'por_total';
      }
      const precoInput = l.precoArroba ? String(l.precoArroba) : '';

      let freteVal = '';
      let comissaoVal = '';
      let formaReceb: 'avista' | 'prazo' = 'avista';
      let parcelasArr: { data: string; valor: number }[] = [];

      try {
        const { data: finRecs } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('origem_tipo, valor, data_pagamento, descricao, sinal')
          .eq('movimentacao_rebanho_id', l.id)
          .eq('cancelado', false)
          .order('data_pagamento', { ascending: true });

        if (finRecs && finRecs.length > 0) {
          const freteRec = finRecs.find(r => r.origem_tipo === 'venda:frete');
          if (freteRec) freteVal = String(freteRec.valor);

          const comissaoRec = finRecs.find(r => r.origem_tipo === 'venda:comissao');
          const parcelaRecs = finRecs.filter(r => r.origem_tipo === 'venda:parcela');
          if (parcelaRecs.length > 1) {
            formaReceb = 'prazo';
            parcelasArr = parcelaRecs.map(p => ({ data: p.data_pagamento || l.data, valor: p.valor }));
          } else if (parcelaRecs.length === 1) {
            const p = parcelaRecs[0];
            if (p.data_pagamento && p.data_pagamento !== l.data) {
              formaReceb = 'prazo';
              parcelasArr = [{ data: p.data_pagamento, valor: p.valor }];
            }
          }
          if (comissaoRec) {
            const totalBruto = parcelaRecs.reduce((s, r) => s + r.valor, 0);
            if (totalBruto > 0) comissaoVal = String(((comissaoRec.valor / totalBruto) * 100).toFixed(2));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar financeiro da venda para edição:', err);
      }

      const vendaDet: VendaDetalhes = {
        tipoVenda: (tv === 'desmama' || tv === 'gado_adulto') ? tv as 'desmama' | 'gado_adulto' : 'gado_adulto',
        tipoPreco,
        precoInput,
        frete: freteVal,
        comissaoPct: comissaoVal,
        outrosCustos: l.outrosDescontos ? String(l.outrosDescontos) : '',
        funruralPct: '',
        funruralReais: '',
        notaFiscal: l.notaFiscal || '',
        formaReceb,
        qtdParcelas: parcelasArr.length > 0 ? String(parcelasArr.length) : '1',
        parcelas: parcelasArr,
      };

      // Reverse-calc funrural
      if (l.descontoFunrural && l.descontoFunrural > 0) {
        const qtd = l.quantidade || 0;
        const peso = l.pesoMedioKg || 0;
        const totalKgCalc = qtd * peso;
        const storedPreco = l.precoArroba || 0;
        let estimatedBruto = 0;
        if (tipoPreco === 'por_kg') estimatedBruto = totalKgCalc * storedPreco;
        else if (tipoPreco === 'por_cab') estimatedBruto = qtd * storedPreco;
        else if (tipoPreco === 'por_total') estimatedBruto = storedPreco;
        if (estimatedBruto > 0) {
          const pct = (l.descontoFunrural / estimatedBruto) * 100;
          if (pct > 0.5 && pct < 10) vendaDet.funruralPct = String(pct.toFixed(2));
          else vendaDet.funruralReais = String(l.descontoFunrural);
        } else {
          vendaDet.funruralReais = String(l.descontoFunrural);
        }
      }

      setVendaDetalhes(vendaDet);
      setVendaTipoPreco(vendaDet.tipoPreco);
      setVendaPrecoInput(vendaDet.precoInput);
      setFunruralPct(vendaDet.funruralPct);
      setFunruralReais(vendaDet.funruralReais);
      setFrete(vendaDet.frete);
      setComissaoPct(vendaDet.comissaoPct);
      setOutrosDescontos(vendaDet.outrosCustos);
      setDescontoQualidade(l.descontoQualidade ? String(l.descontoQualidade) : '');
    }

    // 10. Set editing mode
    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, clienteAtual, fazendaAtual, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load venda for editing when navigated from another tab
  useEffect(() => {
    if (vendaParaEditar) {
      loadVendaForEdit(vendaParaEditar);
      setLancModalOpen(true);
    }
  }, [vendaParaEditar, abateFornecedores]);

  // Load compra into form for editing
  const loadCompraForEdit = useCallback(async (l: Lancamento) => {
    // Save current context before switching to edit mode
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    setAba('entrada');
    setTipo('compra');
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    if (l.tipo === 'morte') {
      const motivo = l.fazendaDestino || l.observacao || '';
      const isPreset = MOTIVOS_MORTE.includes(motivo);
      setMotivoMorte(isPreset ? motivo : motivo ? '__custom__' : '');
      setMotivoMorteCustom(isPreset ? '' : motivo);
    }
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    setNotaFiscal(l.notaFiscal || '');

    // Fornecedor: use pendingFornecedorMatch ref for robust loading
    const compraSnap = l.detalhesSnapshot;
    const snapCompraFornId = compraSnap?.type === 'compra' ? compraSnap.fornecedorId : undefined;
    const snapCompraFornNome = compraSnap?.type === 'compra' ? compraSnap.fornecedorNome : undefined;

    pendingFornecedorMatch.current = {
      tipo: 'compra',
      id: snapCompraFornId,
      nome: snapCompraFornNome || l.fazendaOrigem,
      lancamentoId: l.id,
    };

    const matchedCompraForn = matchFornecedor(abateFornecedores, {
      id: snapCompraFornId,
      nome: snapCompraFornNome || l.fazendaOrigem,
    });
    if (matchedCompraForn) {
      setCompraFornecedorId(matchedCompraForn.id);
      pendingFornecedorMatch.current = null;
    }

    // PRIORITY 1: snapshot
    if (compraSnap && compraSnap.type === 'compra') {
      const det: CompraDetalhes = {
        tipoPreco: compraSnap.tipoPreco || 'por_kg',
        precoKg: compraSnap.precoKg || '',
        precoCab: compraSnap.precoCab || '',
        valorTotal: compraSnap.valorTotal || '',
        frete: compraSnap.frete || '',
        comissaoPct: compraSnap.comissaoPct || '',
        formaPag: compraSnap.formaPag || 'avista',
        qtdParcelas: compraSnap.qtdParcelas || '1',
        parcelas: compraSnap.parcelas || [],
        notaFiscal: compraSnap.notaFiscal || '',
      };
      setCompraDetalhes(det);
    } else {
      // FALLBACK: reconstruct from lancamento + financeiros
      let tipoPreco: 'por_kg' | 'por_cab' | 'por_total' = 'por_kg';
      let precoKgVal = '';
      let precoCabVal = '';
      let valorTotalVal = '';
      let freteVal = '';
      let comissaoVal = '';
      let formaPag: 'avista' | 'prazo' = 'avista';
      let parcelasArr: { data: string; valor: number }[] = [];

      // Infer price type from stored data
      if (l.precoArroba) {
        // Try to infer
        const qtd = l.quantidade || 0;
        const peso = l.pesoMedioKg || 0;
        const totalKg = qtd * peso;
        const stored = l.precoArroba;
        // If close to per-kg value
        if (totalKg > 0 && l.valorTotal && Math.abs(totalKg * stored - (l.valorTotal || 0)) < 1) {
          tipoPreco = 'por_kg';
          precoKgVal = String(stored);
        } else if (qtd > 0 && l.valorTotal && Math.abs(qtd * stored - (l.valorTotal || 0)) < 1) {
          tipoPreco = 'por_cab';
          precoCabVal = String(stored);
        } else {
          tipoPreco = 'por_kg';
          precoKgVal = String(stored);
        }
      }

      try {
        const { data: finRecs } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('origem_tipo, valor, data_pagamento')
          .eq('movimentacao_rebanho_id', l.id)
          .eq('cancelado', false)
          .order('data_pagamento', { ascending: true });

        if (finRecs && finRecs.length > 0) {
          const freteRec = finRecs.find(r => r.origem_tipo === 'compra:frete');
          if (freteRec) freteVal = String(freteRec.valor);

          const comissaoRec = finRecs.find(r => r.origem_tipo === 'compra:comissao');
          const parcelaRecs = finRecs.filter(r => r.origem_tipo === 'compra:parcela');
          if (parcelaRecs.length > 1) {
            formaPag = 'prazo';
            parcelasArr = parcelaRecs.map(p => ({ data: p.data_pagamento || l.data, valor: p.valor }));
          }
          if (comissaoRec) {
            const totalBruto = parcelaRecs.reduce((s, r) => s + r.valor, 0);
            if (totalBruto > 0) comissaoVal = String(((comissaoRec.valor / totalBruto) * 100).toFixed(2));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar financeiro da compra para edição:', err);
      }

      setCompraDetalhes({
        tipoPreco,
        precoKg: precoKgVal,
        precoCab: precoCabVal,
        valorTotal: valorTotalVal,
        frete: freteVal,
        comissaoPct: comissaoVal,
        formaPag,
        qtdParcelas: parcelasArr.length > 0 ? String(parcelasArr.length) : '1',
        parcelas: parcelasArr,
        notaFiscal: l.notaFiscal || '',
      });
    }

    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [abateFornecedores, aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // ── Transferência Saída — load for edit ──
  const loadTransferenciaForEdit = useCallback((l: Lancamento) => {
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    setAba('saida');
    setTipo('transferencia_saida');

    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    if (l.tipo === 'morte') {
      const motivo = l.fazendaDestino || l.observacao || '';
      const isPreset = MOTIVOS_MORTE.includes(motivo);
      setMotivoMorte(isPreset ? motivo : motivo ? '__custom__' : '');
      setMotivoMorteCustom(isPreset ? '' : motivo);
    }
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));

    // Hydrate from snapshot
    const snap = l.detalhesSnapshot;
    if (snap && (snap._tipo === 'transferencia_saida' || snap.type === 'transferencia_saida')) {
      setTransferenciaDetalhes({
        precoReferenciaArroba: snap.precoReferenciaArroba ? String(snap.precoReferenciaArroba) : '',
        precoReferenciaCabeca: snap.precoReferenciaCabeca ? String(snap.precoReferenciaCabeca) : '',
        observacaoEconomica: snap.observacaoEconomica || '',
      });
    } else {
      setTransferenciaDetalhes(null);
    }

    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  // Auto-load compra for editing when navigated from another tab
  useEffect(() => {
    if (compraParaEditar) {
      loadCompraForEdit(compraParaEditar);
    }
  }, [compraParaEditar, abateFornecedores]);

  // Auto-load transferência for editing when navigated from another tab
  useEffect(() => {
    if (transferenciaParaEditar) {
      loadTransferenciaForEdit(transferenciaParaEditar);
    }
  }, [transferenciaParaEditar]);

  // ── Morte: load into form for editing ──
  const loadMorteForEdit = useCallback((l: Lancamento) => {
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    setAba('saida');
    setTipo('morte');
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    const motivo = l.fazendaDestino || l.observacao || '';
    const isPreset = MOTIVOS_MORTE.includes(motivo);
    setMotivoMorte(isPreset ? motivo : motivo ? '__custom__' : '');
    setMotivoMorteCustom(isPreset ? '' : motivo);
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  useEffect(() => {
    if (morteParaEditar) {
      loadMorteForEdit(morteParaEditar);
    }
  }, [morteParaEditar]);

  // ── Consumo: load into form for editing ──
  const loadConsumoForEdit = useCallback((l: Lancamento) => {
    if (!onReturnFromEdit) {
      internalEditOrigin.current = { aba, anoFiltro, mesFiltro, statusOp, tipo };
    }
    setAba('saida');
    setTipo('consumo');
    setData(l.data);
    setCategoria(l.categoria);
    setQuantidade(String(l.quantidade));
    setPesoKg(l.pesoMedioKg ? String(l.pesoMedioKg) : '');
    setFazendaOrigem(l.fazendaOrigem || '');
    setFazendaDestino(l.fazendaDestino || '');
    setObservacao(l.observacao || '');
    setNotaFiscal(l.notaFiscal || '');
    setStatusOp(l.cenario === 'meta' ? 'meta' : ((l.statusOperacional as StatusOperacional) || 'realizado'));
    editOriginalRef.current = l;
    setP1BloqueioMsg(null);
    setEditingAbateId(l.id);
    setEditingFazendaId(l.fazendaId ?? null);
    setDetalheId(null);
    setLastSavedLancamentoId(null);
  }, [aba, anoFiltro, mesFiltro, onReturnFromEdit]);

  useEffect(() => {
    if (consumoParaEditar) {
      loadConsumoForEdit(consumoParaEditar);
    }
  }, [consumoParaEditar]);

  useEffect(() => {
    if (!clienteAtual?.id) {
      setAbateFornecedores([]);
      return;
    }

    let cancelled = false;

    // Paginação obrigatória: sem .range(), o PostgREST aplica teto default de
    // 1000 linhas e clientes com mais contrapartes ativas (ex.: NJ, 6.6k) têm
    // a lista truncada — fornecedores após o corte alfabético ficam
    // inselecionáveis no dropdown. Tiebreaker por id garante ordenação estável
    // entre páginas quando há nomes duplicados; dedup por id como salvaguarda.
    const FORNECEDORES_PAGE_SIZE = 1000;

    (async () => {
      const acumulado: { id: string; nome: string; nome_normalizado: string | null; aliases: string[] | null; cpf_cnpj: string | null }[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('financeiro_fornecedores')
          .select('id, nome, nome_normalizado, aliases, cpf_cnpj')
          .eq('cliente_id', clienteAtual.id)
          .eq('ativo', true)
          .order('nome')
          .order('id')
          .range(from, from + FORNECEDORES_PAGE_SIZE - 1);

        if (cancelled) return;
        if (error) {
          console.error('Erro ao carregar fornecedores ativos', error);
          setAbateFornecedores([]);
          return;
        }

        const page = (data as any[]) || [];
        acumulado.push(...page);
        if (page.length < FORNECEDORES_PAGE_SIZE) break;
        from += FORNECEDORES_PAGE_SIZE;
      }

      if (cancelled) return;

      const vistos = new Set<string>();
      setAbateFornecedores(acumulado
        .filter(item => (vistos.has(item.id) ? false : (vistos.add(item.id), true)))
        .map(item => ({
          id: item.id,
          nome: item.nome,
          nomeNormalizado: item.nome_normalizado ?? null,
          aliases: item.aliases ?? null,
          cpfCnpj: item.cpf_cnpj ?? null,
        })));
    })();

    return () => {
      cancelled = true;
    };
  }, [clienteAtual?.id]);

  // Validate form and open confirmation dialog
  // Reset da ponte OC ao fechar o modal (higiene de estado).
  useEffect(() => {
    if (!lancModalOpen) {
      // Modo OC: reset completo (evita vazamento de estado entre operações A→B). Legado: só a ponte OC.
      if (modoOCCompra) resetContextoOC();
      else { setOcOperacaoId(null); setOcVersao(null); }
    }
  }, [lancModalOpen, modoOCCompra, resetContextoOC]);

  // PR-NAV-CONTEXTO-FAZENDA-01A — fazenda REAL da OC (nunca '__global__'/'__atual__'). Null => a fazenda
  //   precisa ser escolhida no modal antes de persistir (em Global não há fazenda implícita válida).
  const ocFazendaId: string | null = (
    ocFazendaDestinoId && ocFazendaDestinoId !== '__atual__' && ocFazendaDestinoId !== '__global__'
  )
    ? ocFazendaDestinoId
    : (fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null);

  // PR-OC-AUTOSAVE-01 (fatia 1) — PONTO UNICO DE FECHAMENTO do modal.
  //   Antes o mesmo corpo estava escrito duas vezes: no `onOpenChange` do Dialog
  //   (Esc) e no `onClose` passado ao shell (X do cabecalho e botao Fechar).
  //   `setLancModalOpen(false)` NAO dispara `onOpenChange`, entao os dois
  //   caminhos eram mesmo independentes — regra duplicada, do tipo que ja custou
  //   duas correcoes falhas esta semana.
  //   Comportamento INALTERADO; e' preparo para o autosave no fechamento, que
  //   precisa de um lugar so onde entrar.
  //   ⚠ Clique fora NAO fecha este modal e nunca fechou: o DialogContent
  //   previne `onPointerDownOutside`/`onInteractOutside`. Os gatilhos reais sao
  //   Esc, o X e o botao Fechar.
  const fecharModalOC = useCallback(() => {
    setLancModalOpen(false);
    if (modoOCCompra) onFecharOperacaoOC?.();
  }, [modoOCCompra, onFecharOperacaoOC]);


  // Modo OC: cria/atualiza a operação comercial (só identificação) e guarda operacao_id/versao.
  //   Sem lotes (COM-3), sem físico (onAdicionar) e sem financeiro (gerarFinanceiroCompra).
  /* DIRTY TRACKING — o que dos DADOS DA OPERACAO mudou desde o que foi carregado.
     Chave AUSENTE do objeto significa "nao mudou", e a RPC preserva o valor atual;
     por isso o payload sai enxuto por construcao, sem lista de campos duplicada.
     Recalculado a cada render de proposito: sao quatro comparacoes de string, e
     memorizar traria o risco de dependencia esquecida — caro justamente aqui, onde
     errar significa gravar (ou nao gravar) sem o usuario perceber. */
  const camposSujosOC = (): Record<string, string | null> => {
    const snap = ocSnapshotRef.current;
    const sujo: Record<string, string | null> = {};
    if ((compraFornecedorId || '') !== snap.contraparte_id)   sujo.contraparte_id   = compraFornecedorId || null;
    if ((data || '')               !== snap.data_operacao)    sujo.data_operacao    = data || null;
    if ((observacao || '')         !== snap.observacoes)      sujo.observacoes      = observacao || null;
    if ((notaFiscal || '')         !== snap.numero_documento) sujo.numero_documento = notaFiscal || null;
    return sujo;
  };
  const ocDadosSujos = Object.keys(camposSujosOC()).length > 0;

  const marcarSnapshotOCComoSalvo = () => {
    ocSnapshotRef.current = {
      contraparte_id: compraFornecedorId || '', data_operacao: data || '',
      observacoes: observacao || '', numero_documento: notaFiscal || '',
    };
  };

  /* Gravacao dos DADOS DA OPERACAO com a operacao FECHADA, via `oc_editar_dados_operacao`
     (PR-OC-EDICAO-POS-FECHAMENTO-01). Nao reabre nada: a RPC aceita 'fechada' e recusa
     nominalmente qualquer chave fora da lista branca.
     ⚠ A versao nova vem do RETORNO, nunca de `ocVersao` — setState nao reflete na
     closure de quem chamou, e ja custou um bug nesta mesma tela. */
  const salvarDadosOperacaoOC = async (): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId || ocVersao == null) return false;
    const sujo = camposSujosOC();
    // Nada mudou => nao chama a RPC. E' o que impede a versao de subir e a auditoria
    // de encher de evento vazio a cada navegacao.
    if (Object.keys(sujo).length === 0) { toast.info('Nenhuma alteração pendente.'); return true; }
    // Mesmos obrigatorios do outro caminho — a regra de produto nao muda com o status.
    if ('data_operacao' in sujo && !sujo.data_operacao) { toast.error('Informe a data da compra.'); return false; }
    if ('contraparte_id' in sujo && !sujo.contraparte_id) { toast.error('Selecione o fornecedor.'); return false; }
    setSubmitting(true);
    try {
      const env = await ocRpc.editarDadosOperacao(ocOperacaoId, clienteId, ocVersao, sujo);
      setOcVersao(env.versao);
      if (env.status_comercial) setOcStatusComercial(env.status_comercial);
      marcarSnapshotOCComoSalvo();
      /* PR-OC-AUTOSAVE-01 (fatia 5) — SEM toast de sucesso. Com o autosave, "Alteracoes
         salvas." apareceria a cada troca de aba e viraria ruido; e aviso que aparece
         sempre deixa de ser aviso. O ponto ambar sumindo da aba ja diz que gravou.
         Erro continua aparecendo — falha silenciosa e' outra coisa. */
      return true;
    } catch (e) {
      // 40001: outra acao mexeu na operacao. Recarregar e' obrigatorio — insistir com a
      // versao velha so repetiria o erro, e o usuario precisa ver o estado real.
      if (e instanceof OcRpcError && e.code === '40001') {
        toast.error('Esta operação mudou em outro lugar. Recarregamos os dados — confira e salve de novo.');
        await recarregarOperacaoOC();
      } else {
        // P0001 e demais: a mensagem da RPC e' escrita para ser lida, inclusive a que
        // NOMEIA a chave recusada. Exibir integral.
        toast.error(e instanceof Error ? e.message : 'Falha ao salvar os dados da operação.');
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  //   PR-OC-AUTOSAVE-01 (fatia 2) — DEVOLVE o estado oficial pos-gravacao, ou null se
  //   nao gravou (validacao barrou ou a RPC falhou).
  //   ⚠ Devolver e' o que torna "confirmar salvando antes" possivel: `setOcVersao`
  //   e' setState do React e NAO reflete na closure de quem chamou — quem lesse
  //   `ocVersao` logo apos o await pegaria a versao ANTIGA e o oc_confirmar
  //   estouraria 40001 (conflito de versao). A RPC ja devolve a versao nova; nada
  //   muda no banco.
  /* PR-OC-AUTOSAVE-01 (fatia 4) — as obrigatorias em UM lugar. O autosave precisa
     PERGUNTAR se a gravacao passaria, sem tentar e sem disparar toast: ao fechar o
     modal ele decide entre gravar e avisar, e para isso precisa do MOTIVO antes.
     ⚠ Devolve o motivo, nao um booleano: quem avisa precisa dizer o que falta.
     ⚠ Fornecedor entrou aqui em debb6091 — a coluna e' NULLABLE no banco e nao havia
     gate no front; a regra e' de produto. */
  const motivoImpedeSalvarOC = (): string | null => {
    if (!clienteAtual?.id) return 'Cliente não selecionado.';
    if (!data) return 'Informe a data da compra.';
    // PR-NAV-CONTEXTO-FAZENDA-01A — exige fazenda real; nunca envia '__global__'/'__atual__' como UUID.
    if (!ocFazendaId) return 'Selecione a fazenda da operação antes de salvar.';
    if (!compraFornecedorId) return 'Selecione o fornecedor.';
    return null;
  };

  const salvarOperacaoOC = async (): Promise<{ operacaoId: string; versao: number } | null> => {
    const clienteId = clienteAtual?.id;
    const impedimento = motivoImpedeSalvarOC();
    if (impedimento || !clienteId) { toast.error(impedimento ?? 'Cliente não selecionado.'); return null; }
    const criandoOperacao = !ocOperacaoId;
    setSubmitting(true);
    try {
      const env = await ocRpc.salvarRascunho(ocOperacaoId, clienteId, ocVersao, {
        tipo_operacao: 'compra',
        data_operacao: data,
        cenario: isCenarioMeta ? 'meta' : 'realizado',
        // PR-NAV-CONTEXTO-FAZENDA-01A — fazenda REAL resolvida (nunca '__global__'/'__atual__').
        fazenda_id: ocFazendaId,
        contraparte_id: compraFornecedorId || null,
        // PR-FIX-OC-OPEN-01 — notaFiscal (estado do input) é soberano: hidratado de compraDetalhes
        //   quando este chega e captura edições posteriores. compraDetalhes?.notaFiscal só como fallback.
        numero_documento: notaFiscal || compraDetalhes?.notaFiscal || null,
        observacoes: observacao || null,
        movimentacoes: [],
        partes: [],
      });
      setOcOperacaoId(env.operacao_id);
      setOcVersao(env.versao);
      if (env.status_comercial) setOcStatusComercial(env.status_comercial);
      marcarSnapshotOCComoSalvo();
      /* A mensagem de CRIACAO sobrevive: ela orienta o proximo passo, e criar operacao
         e' gesto raro. O que sai e' so o "Alteracoes salvas." repetitivo. */
      if (criandoOperacao) toast.success('Operação criada. Agora informe os lotes negociados.');
      return { operacaoId: env.operacao_id, versao: env.versao };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a operação comercial.');
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  /* ── PR-OC-AUTOSAVE-01 (fatia 4) · GRAVAR SOZINHO ─────────────────────────
     Dispara ao TROCAR DE ABA e ao FECHAR. Nao substitui o botao Salvar: quem quiser
     gravar sem sair continua podendo.
     ⚠ NAO BLOQUEIA NAVEGACAO. Se uma obrigatoria falta, avisa e deixa passar — o
     ponto ambar continua marcando a pendencia. Salvar nunca deve prender o usuario
     onde ele nao quer ficar.
     ⚠ NAO ESPERA a gravacao terminar (`void`): a aba troca na hora. Erro e conflito
     chegam por toast depois, que e' o comportamento certo para algo que o usuario
     nao pediu — inclusive o 40001, que recarrega e avisa dentro de
     `salvarDadosOperacaoOC`.
     ⚠ Nada sujo => nao chama nada. E' o que impede a versao de subir e a auditoria
     de encher de evento vazio a cada navegacao.
     ⚠ RECEBIMENTO segue VETADO e nao passa por aqui: o estado local daquela aba e'
     COMANDO, nao rascunho — um numero digitado por engano viraria entrada de animais. */
  const autoSalvarOC = useCallback(() => {
    if (!modoOCCompra || !ocDadosSujos) return;
    const impedimento = motivoImpedeSalvarOC();
    if (impedimento) { toast.error(impedimento); return; }
    if (ocStatusComercial === 'cancelada') return;
    void (ocStatusComercial === 'fechada' ? salvarDadosOperacaoOC() : salvarOperacaoOC());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoOCCompra, ocDadosSujos, ocStatusComercial, data, ocFazendaId, compraFornecedorId, clienteAtual?.id]);

  /* FECHAR e' diferente de trocar de aba: fechar PERDE a edicao (o estado da OC e'
     resetado no efeito de `lancModalOpen`). Entao aqui nao da para "avisar e seguir":
     seria descartar trabalho do usuario com um toast de consolo. Tambem nao da para
     travar — o modal precisa poder fechar. Fica a terceira via: PERGUNTAR, dizendo o
     que falta e o que se perde. So aparece no caso raro de haver pendencia que NAO
     pode ser gravada; com tudo valido, grava e fecha sem interromper. */
  const [fecharPendente, setFecharPendente] = useState<string | null>(null);
  const fecharModalOCComAutosave = useCallback(() => {
    if (modoOCCompra && ocDadosSujos && ocStatusComercial !== 'cancelada') {
      const impedimento = motivoImpedeSalvarOC();
      if (impedimento) { setFecharPendente(impedimento); return; }
      void (ocStatusComercial === 'fechada' ? salvarDadosOperacaoOC() : salvarOperacaoOC());
    }
    fecharModalOC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoOCCompra, ocDadosSujos, ocStatusComercial, fecharModalOC, data, ocFazendaId, compraFornecedorId, clienteAtual?.id]);

  // PR-OC-EDIT-01B — recarrega a OP aberta pelo backend (SOBERANO) após uma ação de ciclo, sem fechar
  //   o modal. Re-hidrata status/versão/título → a editabilidade volta a ser derivada pelas regras do 01A.
  const recarregarOperacaoOC = async () => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId) return;
    const estado = await ocRpc.carregarOperacao(ocOperacaoId, clienteId);
    if (!estado) return;
    const op = estado.operacao;
    setData(op.data_operacao ?? format(new Date(), 'yyyy-MM-dd'));
    setCompraFornecedorId(op.contraparte_id ?? '');
    setOcFazendaDestinoId(op.fazenda_id ?? (fazendaAtual?.id ?? '__atual__'));
    setObservacao(op.observacoes ?? '');
    setStatusOp(op.cenario === 'meta' ? 'meta' : 'realizado');
    setNotaFiscal(op.numero_documento ?? '');
    ocSnapshotRef.current = {
      contraparte_id: op.contraparte_id ?? '', data_operacao: op.data_operacao ?? '',
      observacoes: op.observacoes ?? '', numero_documento: op.numero_documento ?? '',
    };
    setOcVersao(op.versao);
    setOcStatusComercial(op.status_comercial);
    setOcEntregaEncerrada(!!op.entrega_encerrada);   // PR-HOTFIX-P0 — reidrata entrega soberana no refetch
    setOcRascunho(op.rascunho);
    /* ⚠ SEGUNDA COPIA DA DERIVACAO ANTIGA, corrigida aqui. Ler so `p.cancelada`
       ve o vinculo da PARTE e nao sabe se o LANCAMENTO foi cancelado: apos
       Confirmar, o recarregar recalculava titulo vivo a partir de titulo morto e
       o rodape escondia Reabrir. Fechar e reabrir o modal "consertava" porque a
       hidratacao usa o campo resolvido. Agora as duas usam a MESMA fonte, que ja
       vem fail-closed de `carregarOperacao`. */
    setOcTemTitulo((estado.titulosAtivos ?? 0) > 0);
    // PR-OC-FIN-REFRESH-01 — propaga os dados persistidos da OC (lotes/valor_acordado/contraparte) ao
    //   Financeiro no FLUXO CONTÍNUO. useOperacaoLiquidacao só busca por operacaoId (não por versão): sem
    //   este refetch soberano, após Confirmar os defaults do "Novo compromisso" (subcentro/valor/descrição)
    //   ficariam vazios. Reaberto pela Central já funciona (operacaoId nasce com a OC completa).
    liquidacaoApi.recarregar();
  };

  // PR-OC-EDIT-01B — ações de ciclo (RPCs oficiais; backend soberano). Erro real do backend é exibido
  //   e o modal permanece aberto; nunca há atualização otimista. Sem escrita direta em tabela/FINV2.
  //   PR-OC-AUTOSAVE-01 (fatia 2) — CONFIRMAR GRAVA ANTES, SEMPRE.
  //   Antes ia direto ao `oc_confirmar` com a versao carregada, enquanto as edicoes
  //   da aba Compra seguiam so no React: quem editasse e clicasse em Confirmar
  //   PERDIA a edicao sem aviso nenhum — a RPC nem falhava, porque nada havia sido
  //   gravado e a versao continuava a mesma.
  //   ⚠ Falha de validacao ABORTA. `salvarOperacaoOC` avisa por toast e devolve
  //   null; confirmar por cima seria fechar a operacao com a edicao perdida.
  //   Devolve `true` so quando fechou de verdade — o shell usa isso para "seguir".
  const confirmarOperacaoOC = async (): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId || ocVersao == null || acaoOcLoading) return false;
    setAcaoOcLoading('confirmar');
    try {
      const salvo = await salvarOperacaoOC();
      if (!salvo) return false;
      // Versao NOVA, vinda da propria gravacao — nunca `ocVersao`, que aqui ja e stale.
      await ocRpc.confirmar(salvo.operacaoId, clienteId, salvo.versao);
      await recarregarOperacaoOC();
      toast.success('Negociação confirmada — operação fechada.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao confirmar a negociação.');
      return false;
    } finally {
      setAcaoOcLoading(null);
    }
  };
  const cancelarOperacaoOC = async (motivo: string) => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId || ocVersao == null || acaoOcLoading) return;
    setAcaoOcLoading('cancelar');
    try {
      await ocRpc.cancelar(ocOperacaoId, clienteId, ocVersao, motivo);
      await recarregarOperacaoOC();
      toast.success('Operação cancelada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar a operação.');
    } finally {
      setAcaoOcLoading(null);
    }
  };
  const reabrirOperacaoOC = async (motivo: string) => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId || ocVersao == null || acaoOcLoading) return;
    setAcaoOcLoading('reabrir');
    try {
      await ocRpc.reabrir(ocOperacaoId, clienteId, ocVersao, motivo);
      await recarregarOperacaoOC();
      toast.success('Operação reaberta — voltou para programada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reabrir a operação.');
    } finally {
      setAcaoOcLoading(null);
    }
  };

  const handleRequestRegister = () => {
    // ── Ponte Compra→OC (modo OC isolado): salva a operação e RETORNA antes de qualquer
    //    caminho legado — não abre o confirm dialog, então handleSubmit (onAdicionar +
    //    gerarFinanceiroCompra) nunca roda. Sem dupla escrita. ──
    if (modoOCCompra && isCompra) {
      /* SALVAR UNICO — o status escolhe o caminho, o botao e' um so.
           cancelada -> nada grava; e' imutavel nos dois contratos.
           fechada   -> `oc_editar_dados_operacao`, so os campos sujos (PR-...-01).
           demais    -> `oc_salvar_rascunho`, comportamento de sempre.
         Ate aqui 'fechada' caia no mesmo balde de 'cancelada' e devolvia "somente
         leitura" — era o que obrigava a REABRIR a operacao para corrigir um texto. */
      if (ocStatusComercial === 'cancelada') {
        toast.info('Operação cancelada — somente leitura.'); return;
      }
      if (ocStatusComercial === 'fechada') { void salvarDadosOperacaoOC(); return; }
      void salvarOperacaoOC(); return;
    }
    // ── P1 governance: selective block (NÃO se aplica ao cenário META) ──
    if (p1Oficial && !isCenarioMeta) {
      const isEditing = !!editingAbateId;
      if (!isEditing) {
        // New entries are always blocked when P1 is closed
        setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos (P1 oficial). Novos lançamentos não podem ser registrados. Reabra o período para continuar.');
        return;
      }
      // Editing: check if structural fields changed
      const orig = editOriginalRef.current;
      if (orig) {
        const estruturalChanged =
          String(orig.data) !== String(data) ||
          String(orig.tipo) !== String(tipo) ||
          Number(orig.quantidade) !== parseNumericValue(quantidade) ||
          String(orig.categoria) !== String(categoria) ||
          (String(orig.fazendaOrigem || '') !== String(fazendaOrigem || '')) ||
          (String(orig.fazendaDestino || '') !== String(fazendaDestino || ''));
        if (estruturalChanged) {
          setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos que afetam conciliação (data, quantidade, categoria, fazenda) não podem ser alterados após o fechamento. Campos financeiros/comerciais (valor, preço, bônus, descontos, notas, observações) podem ser editados.');
          return;
        }
      }
      setP1BloqueioMsg(null);
    }
    if (!quantidade || parseNumericValue(quantidade) <= 0) { toast.error('Informe a quantidade'); return; }
    if (!categoria) { toast.error('Selecione a categoria'); return; }
    if (!data) { toast.error('Informe a data'); return; }

    // ── META: bloqueio via painel inteligente (mesma lógica exata) ──
    if (isCenarioMeta && metaBloqueio.hasBloqueio) {
      toast.error(metaBloqueio.primeiroBloqueio || 'Bloqueio detectado pelo painel inteligente META.');
      return;
    }
    // ── META: bloqueio por evolução obrigatória pendente ──
    if (isCenarioMeta && metaStepState?.evolucaoObrigatoria) {
      toast.error('Finalize a evolução necessária para liberar o registro deste lançamento.');
      return;
    }

    if (isAbate) {
      if (!abateFornecedorId) { toast.error('Selecione o Frigorífico (Fornecedor) para continuar'); return; }
      if (!abateDetalhes) { toast.error('Clique em "Completar Abate" para preencher os detalhes financeiros'); return; }
    }
    if (aba === 'saida' && !isAbate && !isMorte) {
      if (campos.destino?.show && !campos.destino.auto && !fazendaDestino) { toast.error('Informe o Destino'); return; }
    }
    if (!pesoKg || parseNumericValue(pesoKg) <= 0) { toast.error('Informe o Peso (kg)'); return; }

    if (isCompra) {
      if (!compraFornecedorId) { toast.error('Selecione o fornecedor para continuar'); return; }
      if (!compraDetalhes) { toast.error('Clique em "Completar Compra" para preencher os detalhes financeiros'); return; }
      const valorBase = (() => {
        const totalKg = (parseNumericValue(quantidade) || 0) * (parseNumericValue(pesoKg) || 0);
        if (compraDetalhes.tipoPreco === 'por_kg') return totalKg * (Number(compraDetalhes.precoKg) || 0);
        if (compraDetalhes.tipoPreco === 'por_cab') return (parseNumericValue(quantidade) || 0) * (Number(compraDetalhes.precoCab) || 0);
        return Number(compraDetalhes.valorTotal) || 0;
      })();
      if ((statusOp === 'programado' || statusOp === 'realizado') && valorBase <= 0) {
        toast.error('Preencha o preço base antes de registrar a compra.');
        return;
      }
    }

    setConfirmDialogOpen(true);
  };

  const triggerZootCacheRefresh = (dateStr: string, includeReclassificacao = false, mes?: number) => {
    const fazendaId = editingFazendaId ?? fazendaAtual?.id;
    if (!fazendaId || !dateStr) return;
    const p_ano = Number(dateStr.slice(0, 4));
    const args = mes ? { p_fazenda_id: fazendaId, p_ano, p_mes: mes } : { p_fazenda_id: fazendaId, p_ano };
    // CONTENÇÃO TEMPORÁRIA (follow-up aberto: FUP-CACHE-RPC-REFRESH decide o
    // destino deste refresh). O PostgrestBuilder é thenable mas NÃO implementa
    // .catch — a chamada abaixo lança TypeError síncrono, que antes abortava o
    // restante do bloco pós-save dos chamadores (modal ficava aberto/resetado,
    // contexto de origem não era restaurado). O try/catch preserva o
    // comportamento de rede atual (o builder é lazy: sem .then, o RPC nunca é
    // despachado). NÃO converter .catch em .then/await sem homologar a
    // ativação do RPC refresh_zoot_cache — isso mudaria o mecanismo de
    // sustentação do cache sem investigação.
    try {
      supabase.rpc('refresh_zoot_cache' as any, args).catch(() => {});
    } catch (e) { console.warn('[LancamentosTab] refresh_zoot_cache não despachado — contenção temporária FUP-CACHE-RPC-REFRESH:', e); }
    if (includeReclassificacao) {
      try {
        supabase.rpc('refresh_zoot_cache_reclassificacao' as any, { p_fazenda_id: fazendaId, p_ano }).catch(() => {});
      } catch (e) { console.warn('[LancamentosTab] refresh_zoot_cache_reclassificacao não despachado — contenção temporária FUP-CACHE-RPC-REFRESH:', e); }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // ─── Gate de master lock: bloqueia se o mês da data está fechado ───
    // Meta (cenario='meta') é permitido em qualquer mês — trigger trg_guard_lancamento_mes_fechado_p1
    // no banco também tem bypass equivalente.
    //
    // PR-I — mês fechado NÃO deve bloquear ajustes puramente FINANCEIROS
    // (conta, data_pagamento, status_transacao, fornecedor, valor financeiro,
    // descontos, forma de pagamento, documento). Só bloqueia se houve mudança
    // em campo ZOOTÉCNICO que afeta saldo físico/peso/rebanho. O critério
    // espelha o gate P1 em handleRequestRegister para manter coerência.
    // Edição comercial-only sob P1 fechado: quando o gate abaixo confirma que
    // nenhum campo zootécnico mudou, o payload do update envia apenas campos
    // comerciais/financeiros (ver poda após lancamentoDados) para não colidir
    // com o guard seletivo do banco (trg_guard_lancamento_mes_fechado_p1).
    let p1ComercialOnly = false;
    if (data && !isCenarioMeta && !masterLock.isMaster) {
      const anoMesData = data.slice(0, 7); // 'YYYY-MM'
      if (!masterLock.isUnlocked(anoMesData)) {
        const locked = await masterLock.checkLockNow(anoMesData);
        if (locked) {
          const isEditing = !!editingAbateId;
          const orig = editOriginalRef.current;
          // CREATE em mês fechado: bloqueio total (lançamento novo é
          // zootécnico por definição). EDIT: comparar campos zoo.
          // Peso médio entra no conjunto porque é dado físico — P1 fechado
          // protege o snapshot oficial e peso afeta saldo de rebanho. (O
          // gate P1 paralelo em handleRequestRegister hoje não compara peso;
          // isso é omissão histórica — não replicar.)
          const zooChanged = !isEditing || !orig
            ? true
            : (
              String(orig.data) !== String(data) ||
              String(orig.tipo) !== String(tipo) ||
              Number(orig.quantidade) !== parseNumericValue(quantidade) ||
              Number(orig.pesoMedioKg || 0) !== parseNumericValue(pesoKg) ||
              String(orig.categoria) !== String(categoria) ||
              String(orig.fazendaOrigem || '') !== String(fazendaOrigem || '') ||
              String(orig.fazendaDestino || '') !== String(fazendaDestino || '')
            );
          if (zooChanged) {
            toast.error(
              `🔒 Mês ${anoMesData} fechado — alterações zootécnicas exigem autorização master.`
            );
            return;
          }
          // Apenas financeiro mudou: deixa o save seguir para o resto do
          // handleSubmit (snapshot zoo e P1 permanecem intactos). O payload
          // será podado para conter somente campos comerciais.
          p1ComercialOnly = true;
        }
      }
    }

    const origemFinal = campos.origem.show
      ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) || undefined
      : undefined;
    let destinoFinal = campos.destino?.show
      ? (campos.destino.auto ? campos.destino.value : fazendaDestino) || undefined
      : undefined;

    // For abate, use fornecedor name as destino. Fallback to frigorifico free-text
    // name (abateDetalhes.frigorifico or abateFrigorificoNome) when no fornecedor matched,
    // so fazendaDestino never becomes undefined and the list/detail keeps the name visible.
    if (isAbate) {
      const forn = abateFornecedorId ? abateFornecedores.find(f => f.id === abateFornecedorId) : null;
      destinoFinal = forn?.nome
        || abateDetalhes?.frigorifico
        || abateFrigorificoNome
        || destinoFinal;
    }

    if (isMorte) {
      destinoFinal = motivoMorte === '__custom__' ? motivoMorteCustom : motivoMorte || undefined;
    }

    // Boitel venda: valor total da movimentação = LUCRO LÍQUIDO do produtor.
    // (NÃO usar `_saldoReceber` — é o saldo a receber/acerto com boitel,
    // semântica diferente do valor total da venda.)
    const isBoitelVenda = isVenda && tipoPeso === 'boitel';
    const boitelLucroLiquido = boitelDataForResumo?._lucroTotal || 0;
    const compraValorTotal = (isCompra && compraDetalhes)
      ? (() => {
          const qtd = parseNumericValue(quantidade) || 0;
          const totalKg = qtd * (parseNumericValue(pesoKg) || 0);
          if (compraDetalhes.tipoPreco === 'por_kg') return totalKg * (Number(compraDetalhes.precoKg) || 0);
          if (compraDetalhes.tipoPreco === 'por_cab') return qtd * (Number(compraDetalhes.precoCab) || 0);
          return Number(compraDetalhes.valorTotal) || 0;
        })()
      : 0;
    // PR-VENDA-COMP-01: regra oficial de valor_total no zoo é VALOR BRUTO (venda
     // = calc.valorBruto; abate = calc.valorBruto + calc.totalBonus). Deduções
     // permanecem em colunas próprias. Fallback final preserva legado.
    const valorTotalFinal = isBoitelVenda
      ? (boitelLucroLiquido > 0 ? boitelLucroLiquido : undefined)
      : isCompra
        ? (compraValorTotal > 0 ? compraValorTotal : undefined)
        : isAbate
          ? ((calc.valorBruto + calc.totalBonus) > 0 ? calc.valorBruto + calc.totalBonus : undefined)
          : isVenda
            ? (calc.valorBruto > 0 ? calc.valorBruto : undefined)
            : (calc.valorLiquido > 0 ? calc.valorLiquido : undefined);

    const abateDataVenda = isAbate ? (abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd')) : (dataVenda || undefined);
    const abateDataEmbarque = isAbate && data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : (dataEmbarque || undefined);
    const abateDataAbate = isAbate ? data : (dataAbate || undefined);
    const abTipoPeso = isAbate && abateDetalhes ? abateDetalhes.tipoPeso : tipoPeso;
    const abTipoVenda = isAbate && abateDetalhes ? abateDetalhes.tipoVenda : tipoVenda;
    const abNotaFiscal = isAbate && abateDetalhes ? abateDetalhes.notaFiscal : notaFiscal;

    // For venda: save precoInput to precoArroba, tipoPreco to tipoPeso, tipoVenda to tipoVenda
    const vendaPrecoArrobaFinal = isBoitelVenda && boitelDataForResumo
      ? (boitelDataForResumo.precoVendaArroba || undefined)
      : isVenda && vendaDetalhes
        ? (parseNumericValue(vendaPrecoInput) || undefined)
        : (isAbate && abateDetalhes ? (parseNumericValue(abateDetalhes.precoArroba) || undefined) : (numOrUndef(precoArroba) || undefined));
    const tipoPesoFinal = isVenda ? vendaTipoPreco : abTipoPeso;
    const tipoVendaFinal = isVenda ? tipoPeso : abTipoVenda; // tipoPeso state holds desmama/gado_adulto/boitel for venda

    // Em EDIÇÃO em modo Global, preserva a fazenda real do lançamento;
    // em CRIAÇÃO, cai pro fazendaAtual.id (criação em Global está bloqueada).
    const effectiveFazendaId = editingFazendaId ?? fazendaAtual?.id;

    const lancamentoDados: Partial<Omit<Lancamento, 'id'>> = {
      data, tipo, quantidade: parseNumericValue(quantidade), categoria: categoria as Categoria,
      /* ⚠ SO O NASCIMENTO ESCOLHE FAZENDA (PR-UI-NASCIMENTO-PARIDADE-03). Os demais
         tipos nao tem seletor e mandam `undefined`, entao `adicionarLancamento` cai na
         fazenda do contexto — exatamente o comportamento de sempre. Mandar
         `nascFazendaId` para todos aplicaria a escolha de uma tela em cinco que nao a
         oferecem. */
      fazendaId: isNascimento ? (nascFazendaId || undefined) : undefined,
      fazendaOrigem: origemFinal, fazendaDestino: destinoFinal,
      pesoMedioKg: pesoKg ? parseNumericValue(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(parseNumericValue(pesoKg)) : undefined,
      observacao: observacao || undefined,
      pesoCarcacaKg: isAbate ? (calc.carcacaCalc > 0 ? calc.carcacaCalc : undefined) : numOrUndef(pesoCarcacaKg),
      precoArroba: vendaPrecoArrobaFinal,
      bonusPrecoce: isAbate ? (calc.bonusPrecoceTotal > 0 ? calc.bonusPrecoceTotal : undefined) : numOrUndef(bonusPrecoce),
      bonusQualidade: isAbate ? (calc.bonusQualidadeTotal > 0 ? calc.bonusQualidadeTotal : undefined) : numOrUndef(bonusQualidade),
      bonusListaTrace: isAbate ? (calc.bonusListaTraceTotal > 0 ? calc.bonusListaTraceTotal : undefined) : numOrUndef(bonusListaTrace),
      descontoQualidade: (isAbate || isVenda) ? (calc.descQualidadeTotal > 0 ? calc.descQualidadeTotal : undefined) : numOrUndef(descontoQualidade),
      descontoFunrural: (isAbate || isVenda) ? (calc.descFunruralTotal > 0 ? calc.descFunruralTotal : undefined) : numOrUndef(descontoFunrural),
      outrosDescontos: (isAbate || isVenda) ? (calc.descOutrosTotal > 0 ? calc.descOutrosTotal : undefined) : numOrUndef(outrosDescontos),
      acrescimos: numOrUndef(bonus),
      deducoes: numOrUndef(descontos),
      valorTotal: valorTotalFinal,
      pesoTotal: (() => {
        const qtd = parseNumericValue(quantidade) || 0;
        const peso = parseNumericValue(pesoKg) || 0;
        return qtd > 0 && peso > 0 ? Math.round(qtd * peso * 100) / 100 : undefined;
      })(),
      precoUnitario: (() => {
        const qtd = parseNumericValue(quantidade) || 0;
        const vt = valorTotalFinal || 0;
        return qtd > 0 && vt > 0 ? Math.round((vt / qtd) * 100) / 100 : undefined;
      })(),
      notaFiscal: abNotaFiscal || undefined,
      tipoPeso: tipoPesoFinal,
      statusOperacional: isCenarioMeta ? null : effectiveStatusOp as StatusOperacional,
      dataVenda: abateDataVenda || undefined,
      dataEmbarque: abateDataEmbarque || undefined,
      dataAbate: abateDataAbate || undefined,
      tipoVenda: tipoVendaFinal || undefined,
      frigorifico: isAbate && abateDetalhes?.frigorifico ? abateDetalhes.frigorifico : undefined,
      pedido: isAbate && abateDetalhes?.pedido ? abateDetalhes.pedido : undefined,
      instrucao: isAbate && abateDetalhes?.instrucao ? abateDetalhes.instrucao : undefined,
      docAcerto: isAbate && abateDetalhes?.docAcerto ? abateDetalhes.docAcerto : undefined,
      anexoNfUrl: isAbate && abateDetalhes?.anexoNfUrl ? abateDetalhes.anexoNfUrl : undefined,
      anexoAcertoUrl: isAbate && abateDetalhes?.anexoAcertoUrl ? abateDetalhes.anexoAcertoUrl : undefined,
      detalhesSnapshot: (() => {
        if (isCompra && compraDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === compraFornecedorId)?.nome;
          return { type: 'compra', ...compraDetalhes, valorTotal: String(compraValorTotal), fornecedorId: compraFornecedorId || undefined, fornecedorNome: fornNome || undefined };
        }
        if (isAbate && abateDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === abateFornecedorId)?.nome;
          return {
            type: 'abate', ...abateDetalhes,
            fornecedorId: abateFornecedorId || undefined,
            fornecedorNome: fornNome || undefined,
            calculation: abateCalc || abateDetalhes.calculation || undefined,
          };
        }
        if (isVenda && tipoPeso === 'boitel') {
          // Boitel: full snapshot including ALL boitelData fields for rehydration
          const recebSnap = vendaFinanceiroRef.current?.getRecebimentoSnapshot?.();
          const bd = vendaFinanceiroRef.current?.getBoitelData?.();
          return {
            type: 'venda_boitel',
            tipoVenda: 'boitel',
            quantidade: parseNumericValue(quantidade) || 0,
            pesoKg: parseNumericValue(pesoKg) || 0,
            categoria,
            data,
            statusOperacional: isCenarioMeta ? null : effectiveStatusOp,
            formaReceb: recebSnap?.formaReceb || 'avista',
            parcelas: recebSnap?.parcelas || [],
            fornecedorId: vendaDestinoFornecedorId || undefined,
            fornecedorNome: abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || undefined,
            // Full boitel data for rehydration
            boitelSnapshot: bd ? {
              qtdCabecas: bd.qtdCabecas,
              pesoInicial: bd.pesoInicial,
              fazendaOrigem: bd.fazendaOrigem,
              nomeBoitel: bd.nomeBoitel,
              lote: bd.lote,
              numeroContrato: bd.numeroContrato,
              dataEnvio: bd.dataEnvio,
              quebraViagem: bd.quebraViagem,
              custoOportunidade: bd.custoOportunidade,
              dias: bd.dias,
              gmd: bd.gmd,
              rendimentoEntrada: bd.rendimentoEntrada,
              rendimento: bd.rendimento,
              modalidadeCusto: bd.modalidadeCusto,
              custoDiaria: bd.custoDiaria,
              custoArroba: bd.custoArroba,
              percentualParceria: bd.percentualParceria,
              custosExtrasParceria: bd.custosExtrasParceria,
              custoFrete: bd.custoFrete,
              outrosCustos: bd.outrosCustos,
              custoNutricao: bd.custoNutricao,
              custoSanidade: bd.custoSanidade,
              custoNfAbate: bd.custoNfAbate,
              precoVendaArroba: bd.precoVendaArroba,
              despesasAbate: bd.despesasAbate,
              formaReceb: bd.formaReceb,
              qtdParcelas: bd.qtdParcelas,
              parcelas: bd.parcelas,
              possuiAdiantamento: bd.possuiAdiantamento,
              dataAdiantamento: bd.dataAdiantamento,
              pctAdiantamentoDiarias: bd.pctAdiantamentoDiarias,
              valorAdiantamentoDiarias: bd.valorAdiantamentoDiarias,
              valorAdiantamentoSanitario: bd.valorAdiantamentoSanitario,
              valorAdiantamentoOutros: bd.valorAdiantamentoOutros,
              valorTotalAntecipado: bd.valorTotalAntecipado,
              adiantamentoObservacao: bd.adiantamentoObservacao,
              _faturamentoBruto: bd._faturamentoBruto,
              _faturamentoLiquido: bd._faturamentoLiquido,
              _receitaProdutor: bd._receitaProdutor,
              _custoTotal: bd._custoTotal,
              _lucroTotal: bd._lucroTotal,
              _boitelId: bd._boitelId,
            } : undefined,
          };
        }
        if (isVenda && vendaDetalhes) {
          const fornNome = abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome;
          const vc = vendaCalc || vendaDetalhes.calculation;
          return {
            ...buildVendaSnapshot(vc || buildVendaCalculation({
              quantidade: parseNumericValue(quantidade) || 0, pesoKg: parseNumericValue(pesoKg) || 0, categoria,
              fazendaOrigem: nomeFazenda || fazendaOrigem, compradorNome: fornNome || '',
              data, statusOperacional: isCenarioMeta ? null : effectiveStatusOp as StatusOperacional, tipoPreco: 'por_kg', precoInput: vendaPrecoInput,
            })),
            type: 'venda',
            ...vendaDetalhes,
            tipoPreco: vendaTipoPreco, precoInput: vendaPrecoInput,
            fornecedorId: vendaDestinoFornecedorId || undefined, fornecedorNome: fornNome || undefined,
          };
        }
        if (isTransferenciaSaida && transferenciaCalc) {
          return {
            type: 'transferencia_saida',
            ...buildTransferenciaSnapshot(transferenciaCalc),
            ...(transferenciaDetalhes ? { observacaoEconomica: transferenciaDetalhes.observacaoEconomica } : {}),
          };
        }
        return undefined;
      })(),
    };

    // Edição comercial-only sob P1 fechado: remove do payload os campos
    // estruturais vigiados pelo guard do banco (data, tipo, quantidade,
    // categoria, categoria_destino, fazendas) e derivados físicos. Em
    // particular, fazenda_destino: no abate ela carrega o NOME do frigorífico
    // (derivado do fornecedor selecionado) — reenviá-la ao trocar a
    // contraparte dispara o guard como se fosse mudança estrutural. O vínculo
    // comercial novo segue por fornecedor_id, frigorifico (texto) e
    // detalhes_snapshot, todos livres no guard; o snapshot fazenda_destino
    // permanece com o valor histórico até reabertura do período.
    if (p1ComercialOnly) {
      delete lancamentoDados.data;
      delete lancamentoDados.tipo;
      delete lancamentoDados.quantidade;
      delete lancamentoDados.categoria;
      delete lancamentoDados.categoriaDestino;
      delete lancamentoDados.fazendaOrigem;
      delete lancamentoDados.fazendaDestino;
      delete lancamentoDados.pesoMedioKg;
      delete lancamentoDados.pesoMedioArrobas;
      delete lancamentoDados.pesoTotal;
    }

    // Contraparte soberana por tipo — usada tanto no update quanto no create,
    // para que a edição também persista fornecedor_id/snapshot na coluna
    // (antes o update gravava o vínculo apenas dentro de detalhes_snapshot).
    const fornecedorIdPorTipo = isCompra ? compraFornecedorId
      : isAbate ? abateFornecedorId
      : isVenda ? vendaDestinoFornecedorId
      : null;
    const fornecedorNomePorTipo = fornecedorIdPorTipo
      ? (abateFornecedores.find(f => f.id === fornecedorIdPorTipo)?.nome ?? null)
      : null;
    const lancamentoDadosComForn = fornecedorIdPorTipo
      ? { ...lancamentoDados, fornecedorId: fornecedorIdPorTipo, fornecedorNomeSnapshot: fornecedorNomePorTipo }
      : lancamentoDados;

    // HOTFIX-Z6: diff zootécnico da edição, calculado SEMPRE (mês aberto ou
    // fechado). Alimenta a contenção de duplicação financeira. Sem snapshot
    // original (orig=null) => false (fail-safe: não é tratada como comercial).
    const origZ6 = editOriginalRef.current;
    const edicaoSomenteComercial = !!editingAbateId && !!origZ6 && !(
      String(origZ6.data) !== String(data) ||
      String(origZ6.tipo) !== String(tipo) ||
      Number(origZ6.quantidade) !== parseNumericValue(quantidade) ||
      Number(origZ6.pesoMedioKg || 0) !== parseNumericValue(pesoKg) ||
      String(origZ6.categoria) !== String(categoria) ||
      String(origZ6.fazendaOrigem || '') !== String(fazendaOrigem || '') ||
      String(origZ6.fazendaDestino || '') !== String(fazendaDestino || '')
    );

    setSubmitting(true);
    try {
      if (editingAbateId) {
        setP1BloqueioMsg(null);
        try {
          const editOk = await onEditar(editingAbateId, lancamentoDadosComForn);
          if (editOk === false) { setSubmitting(false); return; }
        } catch (e: any) {
          console.error('[LancamentosTab] falha ao salvar venda (zoo) — abortando', e);
          toast.error('Não foi possível salvar a venda. Nenhuma alteração foi aplicada.');
          setSubmitting(false);
          return;
        }
        // Só descarta o snapshot original após sucesso: zerá-lo antes do save
        // fazia retentativas pós-erro caírem em zooChanged=true (orig=null) e
        // serem bloqueadas como "alteração zootécnica" mesmo sem mudança zoo.
        editOriginalRef.current = null;

        // CONTENÇÃO TEMPORÁRIA HOTFIX-Z6 — remoção prevista na arquitetura de
        // operação comercial (vínculo soberano + idempotência).
        const { count: finAtivos, error: finAtivosError } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id', { count: 'exact', head: true })
          .eq('movimentacao_rebanho_id', editingAbateId)
          .eq('cancelado', false);

        let pularRegeneracaoFinanceira = false;
        if (finAtivosError) {
          // Fail-safe: na dúvida, não regenerar — regenerar sem saber se já existe
          // financeiro pode duplicar registros.
          console.error('[HOTFIX-Z6] falha ao verificar financeiro vinculado', finAtivosError);
          toast.error(`Movimentação atualizada, mas não foi possível verificar o financeiro vinculado: ${finAtivosError.message}`);
          pularRegeneracaoFinanceira = true;
        } else if (edicaoSomenteComercial && (finAtivos ?? 0) > 0) {
          toast.info('Movimentação atualizada. O financeiro existente não foi recriado para evitar duplicidade. Ajustes no financeiro devem ser feitos pelo Financeiro Oficial.');
          pularRegeneracaoFinanceira = true;
        }

        if (isAbate) {
          // Delegação total: o painel decide se gera (guards internos de formaReceb/parcelas).
          if (!pularRegeneracaoFinanceira && abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(editingAbateId, {
              valorLiquido: calc.valorLiquido,
              totalDescontos: calc.totalDescontos,
              formaReceb: abateDetalhes?.formaReceb || 'avista',
              parcelas: abateDetalhes?.parcelas || [],
            });
          } else if (!pularRegeneracaoFinanceira) {
            console.warn('[LancamentosTab] AbateFinanceiroPanel ref ausente na edição de abate');
          }
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Abate atualizado com financeiro!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isVenda && (calc.valorLiquido > 0 || tipoPeso === 'boitel')) {
          // Zoo já salvo (M1). Financeiro é processo SEPARADO e best-effort:
          // nunca bloqueia o finalize do zoo. O VendaFinanceiroPanel emite os
          // próprios erros/avisos (desde PR-STAB-01A) — não duplicar mensagem aqui.
          try {
            if (!pularRegeneracaoFinanceira && vendaFinanceiroRef.current) {
              await vendaFinanceiroRef.current.generateFinanceiro(editingAbateId);
            }
          } catch (e: any) {
            console.error('[LancamentosTab] financeiro da venda falhou (venda permanece salva)', e);
          }
          vendaFinanceiroRef.current?.resetForm();
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Venda salva com sucesso.');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isCompra && compraDetalhes && fazendaAtual && clienteAtual) {
          // Re-generate financeiro for compra edit
          await gerarFinanceiroCompra({
            compraDetalhes,
            lancamentoId: editingAbateId,
            clienteId: clienteAtual.id,
            fazendaId: effectiveFazendaId,
            quantidade: parseNumericValue(quantidade) || 0,
            pesoKg: parseNumericValue(pesoKg) || 0,
            data,
            categoria,
            statusOp: effectiveStatusOp,
            fazendaOrigem,
            fornecedorId: compraFornecedorId,
          });
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          setCompraDetalhes(null);
          toast.success('Compra atualizada com financeiro!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else {
          setEditingAbateId(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Registro atualizado com sucesso!');
          triggerZootCacheRefresh(data, tipo === 'reclassificacao');
          setLancModalOpen(false);
          restoreEditOrigin();
        }
      } else {
        // Z5a: enriquece payload com fornecedor capturado no form, soberano por tipo.
        // abateFornecedores é a lista ÚNICA do componente (apesar do nome legacy
        // "abate", é populada sem filtro de tipo via query em financeiro_fornecedores
        // WHERE cliente_id=X AND ativo=true) — segura para resolver nome de
        // compra/abate/venda. Confirmado em Z5a audit Task 0.
        const returnedId = await onAdicionar(lancamentoDadosComForn as Omit<Lancamento, 'id'>);

        if (isCompra && returnedId) {
          if (compraDetalhes && fazendaAtual && clienteAtual) {
            await gerarFinanceiroCompra({
              compraDetalhes,
              lancamentoId: returnedId,
              clienteId: clienteAtual.id,
              fazendaId: effectiveFazendaId,
              quantidade: parseNumericValue(quantidade) || 0,
              pesoKg: parseNumericValue(pesoKg) || 0,
              data,
              categoria,
              statusOp: effectiveStatusOp,
              fazendaOrigem,
              fornecedorId: compraFornecedorId,
            });
          }
          setCompraDetalhes(null);
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Compra registrada com sucesso!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isAbate && returnedId) {
          // Delegação total: o painel decide se gera (guards internos de formaReceb/parcelas).
          if (abateFinanceiroRef.current) {
            await abateFinanceiroRef.current.generateFinanceiro(returnedId, {
              valorLiquido: calc.valorLiquido,
              totalDescontos: calc.totalDescontos,
              formaReceb: abateDetalhes?.formaReceb || 'avista',
              parcelas: abateDetalhes?.parcelas || [],
            });
          } else {
            console.warn('[LancamentosTab] AbateFinanceiroPanel ref ausente na criação de abate');
          }
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          // Preserva STATUS = Meta após salvar abate em cenário Meta (não força volta para 'realizado')
          setObservacao(''); setStatusOp(isMeta ? 'meta' : 'realizado');
          resetFinancialFields();
          toast.success('Abate registrado com financeiro!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isVenda && returnedId) {
          const isBoitel = tipoPeso === 'boitel';
          try {
            if (vendaFinanceiroRef.current && (calc.valorLiquido > 0 || isBoitel)) {
              await vendaFinanceiroRef.current.generateFinanceiro(returnedId);
            }
          } catch (e: any) {
            console.error('[LancamentosTab] financeiro da venda (create) falhou (venda permanece salva)', e);
          }
          vendaFinanceiroRef.current?.resetForm();
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Venda registrada com sucesso!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isConsumo && returnedId) {
          // Consumo NÃO gera lançamento financeiro — fluxo só zootécnico.
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Consumo registrado com sucesso!');
          triggerZootCacheRefresh(data);
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (returnedId) {
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria('');
          setPesoKg(tipo === 'nascimento' ? '30,00' : '');   // A15 — peso com duas casas
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Lançamento registrado!');
          triggerZootCacheRefresh(data, tipo === 'reclassificacao');
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (!returnedId) {
          toast.error('Erro ao salvar lançamento. Verifique os dados e tente novamente.');
        }
      }
    } finally {
      setSubmitting(false);
      setConfirmDialogOpen(false);
    }
  };

  // Build confirmation dialog data
  const getOperationLabel = () => {
    if (isCompra) return 'Compra';
    if (isAbate) return 'Abate';
    if (isVenda) return 'Venda em Pé';
    const cfg = [...TIPOS_ENTRADA, ...TIPOS_SAIDA].find(t => t.value === tipo);
    return cfg?.label || tipo;
  };

  const getConfirmacaoFinanceiros = () => {
    const label = getOperationLabel();
    const result: any = { tipoOperacao: label };
    
    if (isAbate) {
      const forn = abateFornecedores.find(f => f.id === abateFornecedorId);
      result.fornecedorOuFrigorifico = forn?.nome || '';
      result.comercializacao = abateDetalhes?.tipoVenda || tipoVenda;
      result.tipoAbate = abateDetalhes?.tipoPeso || tipoPeso;
      // Use official abateCalc — single source of truth
      const ac = abateCalc;
      if (ac) {
        result.rendCarcaca = ac.rendCalc;
        result.totalArrobas = ac.totalArrobas;
        result.precoBase = ac.precoArroba;
        result.precoBaseLabel = 'R$/@';
        result.totalBruto = ac.valorBruto;
        result.totalBonus = ac.totalBonus;
        result.totalDescontos = ac.totalDescontos;
        result.valorLiquido = ac.valorLiquido;
        result.funruralTotal = ac.funruralTotal;
        result.valorBase = ac.valorBase;
        result.liqArroba = ac.liqArroba;
        result.liqCabeca = ac.liqCabeca;
        result.liqKg = ac.liqKg;
      } else {
        result.rendCarcaca = Number(rendCarcaca) || 0;
        result.totalArrobas = calc.totalArrobas;
        result.precoBase = Number(precoArroba) || 0;
        result.precoBaseLabel = 'R$/@';
        result.totalBruto = calc.valorBruto;
        result.totalBonus = calc.totalBonus;
        result.totalDescontos = calc.totalDescontos;
        result.valorLiquido = calc.valorLiquido;
      }
      result.dataVenda = abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd');
      // Use parcelas from abateDetalhes (official source)
      if (abateDetalhes?.formaReceb === 'prazo' && abateDetalhes.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${abateDetalhes.parcelas.length}x)`;
        result.parcelas = abateDetalhes.parcelas;
      } else if (formaPagamento === 'parcelado' && parcelas.length > 0) {
        result.formaPagamento = `A prazo (${parcelas.length}x)`;
        result.parcelas = parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else if (isCompra && compraDetalhes) {
      const totalKgC = (parseNumericValue(quantidade) || 0) * (parseNumericValue(pesoKg) || 0);
      let valorBase = 0;
      if (compraDetalhes.tipoPreco === 'por_kg') valorBase = totalKgC * (Number(compraDetalhes.precoKg) || 0);
      else if (compraDetalhes.tipoPreco === 'por_cab') valorBase = (parseNumericValue(quantidade) || 0) * (Number(compraDetalhes.precoCab) || 0);
      else valorBase = Number(compraDetalhes.valorTotal) || 0;
      const tipoPrecoLabel = compraDetalhes.tipoPreco === 'por_kg' ? 'R$/kg' : compraDetalhes.tipoPreco === 'por_cab' ? 'R$/cab' : 'Total';
      result.precoBase = valorBase;
      result.precoBaseLabel = tipoPrecoLabel;
      result.totalBruto = valorBase;
      result.valorLiquido = valorBase;
      result.fornecedorOuFrigorifico = abateFornecedores.find(f => f.id === compraFornecedorId)?.nome || '';
      if (compraDetalhes.formaPag === 'prazo' && compraDetalhes.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${compraDetalhes.parcelas.length}x)`;
        result.parcelas = compraDetalhes.parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else if (isVenda && tipoPeso === 'boitel' && boitelDataForResumo) {
      // ── BOITEL-specific confirmation ──
      const bd = boitelDataForResumo;
      const saldoReceber = bd._saldoReceber || 0;
      result.tipoOperacao = 'Boitel';
      result.fornecedorOuFrigorifico = bd.nomeBoitel || '';
      result.totalBruto = bd._faturamentoBruto || 0;
      result.totalDescontos = bd._custoTotal || 0;
      result.valorLiquido = saldoReceber; // Financial: what actually enters cash
      result.formaPagamento = bd.formaReceb === 'prazo' ? `A prazo (${bd.qtdParcelas}x)` : 'À vista';
      if (bd.formaReceb === 'prazo' && bd.parcelas?.length > 0) {
        result.parcelas = bd.parcelas;
      }
      // Boitel-specific extras for the dialog
      result.boitelDias = bd.dias;
      result.boitelGmd = bd.gmd;
      result.boitelReceitaProdutor = bd._receitaProdutor || 0;
      result.boitelAdiantamento = bd.possuiAdiantamento ? bd.valorTotalAntecipado : 0;
      result.boitelFrete = bd.custoFrete || 0;
      result.boitelResultadoLiquido = bd._lucroTotal || 0; // Economic result (informational)
      result.liqCabeca = bd.qtdCabecas > 0 ? saldoReceber / bd.qtdCabecas : 0;
      result.liqKg = bd.pesoInicial > 0 && bd.qtdCabecas > 0 ? (saldoReceber / bd.qtdCabecas) / bd.pesoInicial : 0;
    } else if (isVenda && vendaCalc) {
      const vc = vendaCalc;
      const tipoPrecoLabel = vendaDetalhes?.tipoPreco === 'por_kg' ? 'R$/kg' : vendaDetalhes?.tipoPreco === 'por_cab' ? 'R$/cab' : 'R$/@';
      result.precoBase = vc.precoInput;
      result.precoBaseLabel = tipoPrecoLabel;
      result.totalBruto = vc.valorBruto;
      result.totalArrobas = vc.totalArrobas;
      result.totalDescontos = vc.totalDespesas + vc.totalDeducoes;
      result.valorLiquido = vc.valorLiquido;
      result.fornecedorOuFrigorifico = vc.compradorNome;
      if (vc.formaReceb === 'prazo' && vc.parcelas.length > 0) {
        result.formaPagamento = `A prazo (${vc.parcelas.length}x)`;
        result.parcelas = vc.parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    } else if (isTransferenciaSaida) {
      const tc = transferenciaCalc;
      if (tc && tc.temPrecoReferencia) {
        result.precoBase = tc.precoReferenciaArroba;
        result.precoBaseLabel = 'R$/@ (ref. econômica)';
        result.totalBruto = tc.valorEconomicoLote;
        result.valorLiquido = tc.valorEconomicoLote;
        result.totalArrobas = tc.totalArrobas;
      }
    } else {
      result.precoBase = Number(precoKg) || 0;
      result.precoBaseLabel = 'R$/kg';
      result.totalBruto = calc.valorBruto;
      result.totalBonus = Number(bonus) || 0;
      result.totalDescontos = Number(descontos) || 0;
      result.valorLiquido = calc.valorLiquido;
      if (formaPagamento === 'parcelado' && parcelas.length > 0) {
        result.formaPagamento = `A prazo (${parcelas.length}x)`;
        result.parcelas = parcelas;
      } else {
        result.formaPagamento = 'À vista';
      }
    }
    return result;
  };

  const metaInputClass = isCenarioMeta ? 'border-orange-400 text-orange-800 dark:text-orange-300' : '';
  const metaLabelClass = isCenarioMeta ? 'text-orange-700 dark:text-orange-400' : '';

  const showExtraDates = !isAbate && (isConfirmado || isConciliado) && (isVenda || isTransferencia);
  const showFormaPagamento = !isAbate && (isConfirmado || isConciliado) && (isVenda || isCompra || isTransferencia);
  const showComissaoFreteDespesas = !isAbate && isConciliado && (isVenda || isCompra || isTransferencia);
  const showComissaoPrevConf = (isConfirmado) && (isCompra);

  // Auto-computed dates for abate
  const abateDataVendaAuto = dataVenda || format(new Date(), 'yyyy-MM-dd');
  const abateDataEmbarqueAuto = data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : '';
  const abateDataAbateAuto = data;

  // ===== TOP TYPE-CARDS NAVIGATION =====
  // Substitui o sidebar lateral antigo. Onclick replica a mesma transição de
  // aba/tipo + resetAllFields que existia na navegação anterior.
  // Declarado ANTES do BLOCKED VIEW porque ambos os returns usam renderTipoCards
  // (TDZ: const não é hoisted — se chamado antes da declaração, runtime quebra).
  const isEditing = !!editingAbateId;
  const renderTipoCards = () => {
    const handleClick = (it: TipoCardItem) => {
      // Atalho de navegação (ex.: Chuvas) — não muda state nem abre modal.
      if (it.navOnly) {
        if (it.value === 'chuvas') onNavegarChuvas?.();
        return;
      }
      if (isEditing) return; // Bloqueia troca de tipo durante edição
      // PR-OC-ENTRYPOINT-COMPRA-01 — SOMENTE Compra migra para o fluxo OC canônico. onNovaCompraOC seta
      //   ?oc_compra=1 (modoOCCompra=true, batched); resetContextoOC dá uma OC nova limpa COM a fazenda do
      //   contexto atual (ocFazendaDestinoId = fazendaAtual); e abrimos o modal aqui (o efeito de hidratação
      //   só abre quando há oc_id — nova Compra não tem). Demais movimentos seguem o fluxo atual.
      if (it.value === 'compra' && onNovaCompraOC) {
        onNovaCompraOC();
        resetContextoOC();
        setTipo('compra');
        setLancModalOpen(true);
        return;
      }
      setAba(it.aba);
      setTipo(it.value as TipoMovimentacao);
      resetAllFields();
      /* ⚠ PESO SUGERIDO DO NASCIMENTO — 30,00 kg, e SO em lancamento novo. Ja existia
         no reset pos-salvamento; faltava na abertura, entao o primeiro nascimento do
         dia comecava vazio e o segundo nao.
         ⚠ FORA de `resetAllFields`, e de proposito: `setTipo` acima e' assincrono, e la
         dentro `tipo` ainda seria o ANTERIOR. Aqui o valor vem de `it`, que e' o que o
         operador acabou de clicar — sem depender de estado que ainda nao chegou.
         ⚠ EDICAO NAO PASSA POR AQUI: os loaders de registro existente tem caminho
         proprio e escrevem o peso gravado. O padrao nunca sobrescreve o que foi salvo. */
      if (it.value === 'nascimento') setPesoKg('30,00');
      setLancModalOpen(true);
    };
    const isItemActive = (it: TipoCardItem) =>
      !it.navOnly && it.aba === aba && (it.aba === 'reclassificacao' || tipo === it.value);

    /* Os dois filtros de visibilidade que ja existiam, agora num lugar so porque tres
       chamadas de `cartaoGrupo` os repetiriam.
         · Chuvas some sem callback de navegacao;
         · Compra so aparece onde existe o fluxo OC — sem ele (contexto meta/Planejamento)
           o item e' OCULTADO, nunca abre o shell em modo legado. */
    const itensVisiveis = (g: TipoCardGroup) => g.items
      .filter(it => !it.navOnly || (it.value === 'chuvas' && !!onNavegarChuvas))
      .filter(it => !(it.value === 'compra' && !onNovaCompraOC));

    /* ── UM CARTAO POR GRUPO (PR-UI-LANCAR-CARDS-02) ───────────────────────────
       Eram NOVE cartoes com borda de 2px cada, sob cabecalhos soltos: nove molduras
       competindo viravam grade visual, e o olho nao achava onde comecar. Agora e' uma
       borda por grupo, o cabecalho DENTRO dela e cada item como linha separada por
       filete.
       ⚠ O EMOJI SAIU e nao foi trocado por icone nenhum. Emoji tem desenho e cor
       proprios de cada sistema operacional — nunca parece desenhado junto com o resto
       da interface. A hierarquia passa a ser so tipografica.
       ⚠ O DESTAQUE MUDOU DE PECA, nao de regra: sem borda por item, o estado ativo
       passa a ser o fundo da LINHA. As tres classes sao as mesmas de antes. */
    const cartaoGrupo = (g: TipoCardGroup, classePos: string) => (
      <div key={g.grupo} role="group" aria-label={g.label}
        className={`rounded-lg border border-border/60 bg-card ${classePos}`}>
        {/* Caixa alta por ESTILO, nao por texto: o rotulo no dado ja e' "Entradas". */}
        <div className="border-b border-border/60 px-3.5 py-[9px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {g.label}
        </div>
        <div className="divide-y divide-border/60">
          {itensVisiveis(g).map(it => {
            const active = isItemActive(it);
            // navOnly nunca é "disabled" durante edição — atalho continua acessível
            const disabled = !it.navOnly && isEditing && !active;
            return (
              <button
                key={it.value}
                type="button"
                onClick={() => handleClick(it)}
                disabled={disabled}
                aria-label={`Lançar ${it.label} — ${it.desc}`}
                title={it.desc}
                className={`group flex w-full cursor-pointer items-baseline gap-2 px-3.5 py-2 text-left transition-colors ${
                  active
                    ? 'bg-primary/10'
                    : disabled
                      ? 'opacity-25 pointer-events-none'
                      : 'hover:bg-primary/5'
                }`}
              >
                <span className="shrink-0 text-[13px] font-medium text-foreground">{it.label}</span>
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">{it.desc}</span>
                {/* ⚠ A SETA DEVOLVE UM SINAL QUE A BORDA DAVA. Enquanto cada item era
                    cartao com borda de 2px, a moldura dizia "isto se clica"; virando linha
                    dentro de um cartao unico (PR-UI-LANCAR-CARDS-02), o sinal se perdeu e
                    a lista passou a parecer texto. A seta repoe a affordance sem trazer
                    de volta as nove molduras.
                    ⚠ DECORATIVA: `aria-hidden`. Quem usa leitor de tela ja recebe o
                    `aria-label` da linha dizendo o que ela lanca; a seta so repetiria
                    ruido. `self-center` porque o resto da linha alinha pela base. */}
                <ChevronRight aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    );

    const grupo = (id: TipoCardGroup['grupo']) => TIPO_CARDS_GROUPS.find(g => g.grupo === id);
    const gEntradas = grupo('entradas'); const gSaidas = grupo('saidas'); const gOutros = grupo('outros');

    return (
      /* ⚠ COLOCACAO EXPLICITA NA GRADE, e nao duas colunas aninhadas. A ORDEM DO DOM e'
         Entradas, Saidas, Outros — que e' a ordem correta no mobile, em coluna unica.
         No desktop, `col-start`/`row-start` levam Saidas para a esquerda ocupando as
         duas fileiras, e Entradas e Outros empilham a direita. Colunas aninhadas dariam
         o desktop certo e o mobile na ordem errada (Saidas primeiro).
         As alturas fecham parecidas por construcao: Saidas tem 5 itens, Entradas e
         Outros somam 4 mais um cabecalho a mais. */
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px] items-start mb-2">
        {/* PR-OC-ENTRYPOINT-COMPRA-01 — o wizard legado de operação comercial foi desconectado
            daqui e, em PR-OC-LIMPAR-MODAL-ORFAO-01, removido do repositório. O fluxo oficial de
            Compra é o CompraModalShell (card Compra → modo OC). */}
        {gEntradas && cartaoGrupo(gEntradas, 'md:col-start-2 md:row-start-1')}
        {gSaidas   && cartaoGrupo(gSaidas,   'md:col-start-1 md:row-start-1 md:row-span-2')}
        {gOutros   && cartaoGrupo(gOutros,   'md:col-start-2 md:row-start-2')}
      </div>
    );
  };

  // ===== BLOCKED VIEW =====
  // editingAbateId é state GENÉRICO usado pelos 6 loaders zoot
  // (Abate/Venda/Compra/Transferência/Consumo/Morte/Nascimento).
  // editingReclassId é o state da reclassificação.
  // Em edição com lançamento carregado, liberar UI APENAS quando em Global.
  // Administrativo NUNCA libera (nem edição), por design conceitual.
  // PR-NAV-CONTEXTO-FAZENDA-01A — Global deixa de substituir a tela por "Lançamento bloqueado":
  //   a fazenda passa a ser exigida na PERSISTÊNCIA (formulário/save), não na abertura. Fazendas
  //   administrativas (tem_pecuaria=false) seguem bloqueadas por design (não fazem zootécnico).
  if (
    isAdministrativo &&
    (aba === 'entrada' || aba === 'saida' || aba === 'reclassificacao')
  ) {
    return (
      <div className="p-4 animate-fade-in pb-20 max-w-7xl mx-auto">
        {onBackToConciliacao && (
          <button onClick={onBackToConciliacao} className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-md py-2 transition-colors hover:bg-primary/20 mb-3">
            <ArrowLeft className="h-4 w-4" /> {backLabel || 'Retornar à Conciliação de Categoria'}
          </button>
        )}
        {renderTipoCards()}
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 mb-0.5">
            <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
            <h3 className="font-semibold text-foreground text-sm">Lançamento bloqueado</h3>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Fazendas administrativas não permitem lançamentos zootécnicos.
          </p>
        </div>
      </div>
    );
  }


  // ===== FINANCIAL DETAILS PANEL (right column — non-abate) =====
  const renderFinancialPanel = () => {

    // Transferência entrada: simple info panel (no economic layer)
    if (tipo === 'transferencia_entrada') {
      return (
        <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
           <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
          <Separator />
          <div className="flex gap-2 items-start py-1">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold mb-1">Transferência não gera lançamento financeiro.</p>
              <ul className="space-y-0.5 list-disc list-inside text-[10px]">
                <li>Movimentação interna entre fazendas</li>
                <li>Não impacta fluxo de caixa</li>
              </ul>
            </div>
          </div>
          <Separator />
          <Button type="button" className="w-full h-10 text-[13px] font-bold" onClick={handleRequestRegister} disabled={submitting}>
            Registrar Transferência
          </Button>
        </div>
      );
    }

    // Morte: no financial impact
    if (isMorte) {
      return (
        <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
           <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
          <Separator />
          <div className="flex gap-2 items-start py-1">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold mb-1">Morte não gera lançamento financeiro.</p>
              <ul className="space-y-0.5 list-disc list-inside text-[10px]">
                <li>Impacta apenas o estoque de rebanho</li>
                <li>Não possui valor monetário associado</li>
              </ul>
            </div>
          </div>
          <Separator />
          <Button type="button" className="w-full h-10 text-[13px] font-bold" onClick={handleRequestRegister} disabled={submitting}>
            {editingAbateId ? 'Salvar Alterações da Morte' : 'Registrar Morte'}
          </Button>
          {isCenarioMeta && !editingAbateId && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-9 text-[12px] font-semibold border-orange-300 text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              onClick={() => setMorteLoteOpen(true)}
            >
              📋 Lançar em lote (META)
            </Button>
          )}
        </div>
      );
    }

    // Venda: use dedicated VendaFinanceiroPanel
    if (isVenda) {
      console.log('[VendaDetalhes]', {
        formaReceb: vendaDetalhes?.formaReceb,
        parcelas: vendaDetalhes?.parcelas,
        vendaDetalhesCompleto: vendaDetalhes,
      });
      return (
        <VendaFinanceiroPanel
          key={`venda-${tipo}`}
          quantidade={parseNumericValue(quantidade) || 0}
          pesoKg={parseNumericValue(pesoKg) || 0}
          categoria={categoria}
          data={data}
          destino={fazendaDestino}
          // PR-G — fazenda/cliente do LANÇAMENTO prevalecem sobre o contexto da
          // tela (modo Global tem fazendaAtual.id === '__global__').
          fazendaIdLancamento={editingFazendaId ?? undefined}
          clienteIdLancamento={clienteAtual?.id}
          fornecedorId={vendaDestinoFornecedorId}
          onFornecedorIdChange={(id) => {
            setVendaDestinoFornecedorId(id);
            const nome = abateFornecedores.find(f => f.id === id)?.nome || '';
            setFazendaDestino(nome);
          }}
          fornecedores={abateFornecedores}
          onCreateFornecedor={async (nome, cpfCnpj) => {
            if (!clienteAtual || !fazendaAtual) return;
            const { data: rec, error } = await supabase
              .from('financeiro_fornecedores')
              .insert({ cliente_id: clienteAtual.id, fazenda_id: (fazendaAtual?.id && fazendaAtual.id !== '__global__') ? fazendaAtual.id : null, nome, cpf_cnpj: cpfCnpj || null })
              .select('id, nome')
              .single();
            if (error) { toast.error('Erro ao salvar fornecedor'); return; }
            if (rec) {
              setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
              setVendaDestinoFornecedorId(rec.id);
              setFazendaDestino(rec.nome);
              toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
            }
          }}
          notaFiscal={notaFiscal}
          onNotaFiscalChange={setNotaFiscal}
          statusOp={effectiveStatusOp}
          // editingAbateId é o ID genérico de edição (Abate/Venda/etc).
          // Em edit, lastSavedLancamentoId é null — passar editingAbateId
          // permite o painel buscar boitel_lote_id no DB como fallback.
          lancamentoId={editingAbateId || lastSavedLancamentoId || undefined}
          mode={editingAbateId ? 'update' : 'create'}
          tipoPeso={tipoPeso}
          onTipoPesoChange={setTipoPeso}
          vendaTipoPreco={vendaTipoPreco}
          onVendaTipoPrecoChange={setVendaTipoPreco}
          vendaPrecoInput={vendaPrecoInput}
          onVendaPrecoInputChange={setVendaPrecoInput}
          valorBruto={calc.valorBruto}
          totalBonus={calc.totalBonus}
          totalDescontos={calc.totalDescontos}
          valorLiquido={calc.valorLiquido}
          funruralPct={funruralPct}
          onFunruralPctChange={setFunruralPct}
          descontoQualidade={descontoQualidade}
          onDescontoQualidadeChange={setDescontoQualidade}
          outrosDescontos={outrosDescontos}
          onOutrosDescontosChange={setOutrosDescontos}
          descFunruralTotal={calc.descFunruralTotal}
          descQualidadeTotal={calc.descQualidadeTotal}
          frete={frete}
          onFreteChange={setFrete}
          comissao={comissaoPct}
          onComissaoChange={setComissaoPct}
          funruralReais={funruralReais}
          onFunruralReaisChange={setFunruralReais}
          comissaoVal={calc.comissaoVal}
          freteVal={calc.freteVal}
          onRequestRegister={handleRequestRegister}
          registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Venda'}
          submitting={submitting}
          onBoitelDataChange={setBoitelDataForResumo}
           initialBoitelData={boitelDataForResumo}
           initialFormaReceb={vendaDetalhes?.formaReceb}
           initialParcelas={vendaDetalhes?.parcelas}
         />
      );
    }

    // Consumo: NÃO gera lançamento financeiro. Painel apenas informativo + botão.
    if (isConsumo) {
      return (
        <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
          <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
          <Separator />
          <div className="flex gap-2 items-start py-1">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold mb-1">Consumo não gera lançamento financeiro.</p>
              <ul className="space-y-0.5 list-disc list-inside text-[10px]">
                <li>Movimentação interna do rebanho</li>
                <li>Não impacta fluxo de caixa</li>
              </ul>
            </div>
          </div>
          <Separator />
          <Button type="button" className="w-full h-10 text-[13px] font-bold" onClick={handleRequestRegister} disabled={submitting}>
            {editingAbateId ? 'Salvar Alterações do Consumo' : 'Registrar Consumo'}
          </Button>
        </div>
      );
    }

    return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <h3 className="text-[14px] font-semibold text-foreground">Detalhes Financeiros</h3>
      <Separator />

      {/* Nascimento: sem impacto financeiro */}
      {aba === 'entrada' && tipo === 'nascimento' ? (
        <div className="flex gap-2 items-start py-1">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-semibold mb-1">Nascimento não possui impacto financeiro direto.</p>
            <ul className="space-y-0.5 list-disc list-inside text-[10px]">
              <li>Não gera entrada ou saída de caixa</li>
              <li>Não utiliza nota fiscal</li>
              <li>Não possui valor da operação</li>
              <li>Não possui ajustes financeiros</li>
            </ul>
          </div>
        </div>
      ) : (
      <>

      {/* Extra dates */}
      {showExtraDates && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Datas da Operação</h4>
          <div className="space-y-1.5">
            <div>
              <Label className="text-[11px]">Data da Venda</Label>
              <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Data Embarque</Label>
              <Input type="date" value={dataEmbarque} onChange={e => setDataEmbarque(e.target.value)} className="h-8 text-[12px]" />
            </div>
          </div>
          <Separator />
        </div>
      )}

      {!isVenda && (
        <div>
          <Label className="text-[11px]">{isMorte || isConsumo ? 'Identificação (brinco)' : 'Nota Fiscal'}</Label>
          <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder={isMorte || isConsumo ? 'Ex: brinco 1234' : 'Nº da nota'} className="h-8 text-[12px]" />
        </div>
      )}

      {!isVenda && (
      <>
      <Separator />
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Valor da Operação</h4>

      {usaPrecoKg && (
        <div>
          <Label className={`text-[11px] ${metaLabelClass}`}>R$/kg (preço base)</Label>
          <Input type="number" value={precoKg} onChange={e => setPrecoKg(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] ${metaInputClass}`} />
        </div>
      )}

      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 text-[12px] ${isMeta ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-muted/30'}`}>
          <div className="flex justify-between">
            <span className={isMeta ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground'}>Valor total bruto</span>
            <strong className={isMeta ? 'text-orange-800 dark:text-orange-300' : ''}>{formatMoeda(calc.valorBruto)}</strong>
          </div>
        </div>
      )}

      {/* Forma de Pagamento */}
      {showFormaPagamento && calc.valorBruto > 0 && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">
            {isCompra ? 'Forma de Pagamento' : 'Forma de Recebimento'}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { setFormaPagamento('avista'); setParcelas([]); }}
              className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPagamento === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              À vista
            </button>
            <button type="button" onClick={() => { setFormaPagamento('parcelado'); handleQtdParcelasChange(qtdParcelas); }}
              className={`h-8 rounded text-[12px] font-bold border-2 transition-all ${formaPagamento === 'parcelado' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
              A prazo
            </button>
          </div>
          {formaPagamento === 'parcelado' && (
            <div className="space-y-1.5">
              <div>
                <Label className="text-[11px]">Quantidade de parcelas</Label>
                <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcelasChange(e.target.value)} className="h-8 text-[12px]" />
              </div>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5 bg-muted/30 rounded p-1.5">
                  <div>
                    <Label className="text-[10px]">Parcela {i + 1} - Data</Label>
                    <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Valor (R$)</Label>
                    <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); }} className="h-7 text-[11px]" />
                  </div>
                </div>
              ))}
              {parcelas.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-right">
                  Soma parcelas: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bonus/Descontos — only for non-Venda (Venda descontos are in VendaFinanceiroPanel) */}
      {!isVenda && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Ajustes (R$)</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Bônus</Label><Input type="number" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Descontos</Label><Input type="number" value={descontos} onChange={e => setDescontos(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
          </div>
        </>
      )}

      {/* Valor líquido override */}
      <Separator />
      <div>
        <Label className={`text-[11px] font-semibold ${metaLabelClass || 'text-foreground'}`}>Valor total líquido (R$)</Label>
        <Input
          type="number"
          value={calc.valorLiquido > 0 ? String(Math.round(calc.valorLiquido * 100) / 100) : ''}
          onChange={e => {
            const vt = parseFloat(e.target.value);
            if (!isNaN(vt)) {
              const totalBon = (parseNumericValue(bonus) || 0);
              const totalDesc = (parseNumericValue(descontos) || 0);
              const freteVal = parseNumericValue(frete) || 0;
              const outVal = parseNumericValue(outrasDespesas) || 0;
              const brutoNecessario = vt - totalBon + totalDesc + freteVal + outVal;
              if (usaPrecoKg && calc.totalKg > 0) { setPrecoKg(String((brutoNecessario / calc.totalKg).toFixed(4))); }
            }
          }}
          placeholder="Informe o valor total líquido"
          className={`h-8 text-[12px] font-bold ${metaInputClass}`}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">Retro-calcula o preço base automaticamente</p>
      </div>

      {/* Comissão/Frete/Despesas */}
      {(showComissaoFreteDespesas || showComissaoPrevConf) && (
        <>
          <Separator />
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Despesas Operacionais</h4>
          <div className="space-y-1.5">
            <div><Label className="text-[11px]">Comissão (%)</Label><Input type="number" value={comissaoPct} onChange={e => setComissaoPct(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Frete (R$)</Label><Input type="number" value={frete} onChange={e => setFrete(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
            <div><Label className="text-[11px]">Outras (R$)</Label><Input type="number" value={outrasDespesas} onChange={e => setOutrasDespesas(e.target.value)} placeholder="0" className={`h-8 text-[12px] ${metaInputClass}`} /></div>
          </div>
        </>
      )}

      {/* Final value */}
      {calc.valorBruto > 0 && (
        <div className={`rounded-md p-2 ${isMeta ? 'bg-orange-200/50 dark:bg-orange-950/50' : 'bg-primary/10'}`}>
          <div className="flex justify-between text-[12px] font-bold">
            <span className={isMeta ? 'text-orange-800 dark:text-orange-300' : ''}>Valor líquido final</span>
            <span className={isMeta ? 'text-orange-800 dark:text-orange-300' : 'text-primary'}>{formatMoeda(calc.valorLiquido)}</span>
          </div>
          {calc.liqCabeca > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">Líq/Cabeça</span>
              <strong>{formatMoeda(calc.liqCabeca)}</strong>
            </div>
          )}
          {calc.liqKg > 0 && (
            <div className="flex justify-between text-[11px] mt-0.5">
              <span className="text-muted-foreground">R$/Kg líq</span>
              <strong>{formatMoeda(calc.liqKg)}</strong>
            </div>
          )}
        </div>
      )}
      </>
      )}
      </>
      )}

      {/* Unified register button for non-abate operations */}
      {!(aba === 'entrada' && tipo === 'nascimento') && (
        <>
          <Separator />
          <Button
            type="button"
            className="w-full h-10 text-[13px] font-bold"
            onClick={handleRequestRegister}
            disabled={submitting}
          >
            {editingAbateId ? 'Salvar Alterações' : `Registrar ${getOperationLabel()}`}
          </Button>
        </>
      )}
      {/* Nascimento — simpler, still needs a button */}
      {aba === 'entrada' && tipo === 'nascimento' && (
        <>
          <Separator />
          <Button
            type="button"
            className="w-full h-10 text-[13px] font-bold"
            onClick={handleRequestRegister}
            disabled={submitting}
          >
            Registrar Nascimento
          </Button>
        </>
      )}
    </div>
    );
  };

  const currentTipoConfig = [...TIPOS_ENTRADA, ...TIPOS_SAIDA].find(t => t.value === tipo);
  const currentTipoLabel = currentTipoConfig?.label || tipo;
  const currentTipoIcon = currentTipoConfig?.icon || '';

  // ===== MAIN FORM (center) =====
  const renderForm = () => (
    <div className={`flex-1 bg-card rounded-md p-3 shadow-sm border space-y-2 self-start overflow-visible ${editingAbateId ? 'ring-2 ring-primary' : ''}`}>

      {/* Editing banner */}
      {editingAbateId && (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-1.5 text-[11px] font-bold text-primary">
          Editando {tipo === 'venda' ? 'venda' : tipo === 'abate' ? 'abate' : 'registro'} #{editingAbateId.slice(0, 8)}
        </div>
      )}

      {/* Título grande do tipo de lançamento ativo */}
      <div className="flex items-center gap-3 pb-1">
        <span className="text-3xl leading-none">{currentTipoIcon}</span>
        <h2 className="text-2xl font-bold text-foreground leading-tight">
          {editingAbateId ? (tipo === 'venda' ? 'Editar Venda' : tipo === 'abate' ? 'Editar Abate' : 'Editar Registro') : currentTipoLabel}
        </h2>
      </div>

      {/* STATUS — destaque forte: Realizado / META (programado removido no PR-0C) */}
      {/* ⚠ NASCIMENTO NAO ESCOLHE CENARIO (PR-UI-NASCIMENTO-PADRAO-01). Este caminho
          registra apenas realizado; meta tem caminho proprio. O que sai e' a
          POSSIBILIDADE DE ESCOLHER — o payload segue enviando o mesmo valor de sempre.
          ⚠ Esconder e' seguro porque este bloco NAO inicializa estado: `statusOp` nasce
          de `defaultCenario` no `useState` e e' resetado nos handlers de salvar,
          montado o seletor ou nao. Conferido antes de esconder.
          Condicao LOCAL, no mesmo padrao do `isNascimento` que ja restringe as
          categorias — os demais tipos seguem com o seletor como esta. */}
      {!isNascimento && (
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Status</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'realizado' as const, label: STATUS_LABEL.realizado, dot: 'bg-green-600', activeBorder: 'border-green-500', activeBg: 'bg-green-50 dark:bg-green-950/30', activeText: 'text-green-800 dark:text-green-300' },
            { value: 'meta' as const, label: META_VISUAL.label, dot: META_VISUAL.dot, activeBorder: META_VISUAL.activeBorder, activeBg: META_VISUAL.activeBg, activeText: 'text-orange-800 dark:text-orange-300' },
          ]).map(s => {
            const selected = statusOp === s.value;
            const blockedByCenarios = cenariosPermitidos ? !cenariosPermitidos.includes(s.value) : false;
            const blockedByPermission = s.value === 'meta' && !canEditMeta;
            const disabled = blockedByCenarios || blockedByPermission;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => !disabled && setStatusOp(s.value)}
                disabled={disabled}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg border-2 transition-all font-bold text-sm ${
                  disabled ? 'opacity-40 cursor-not-allowed border-border bg-muted/10 text-muted-foreground' :
                  selected ? `${s.activeBg} ${s.activeBorder} ${s.activeText} shadow-sm` : 'border-border bg-muted/10 text-muted-foreground hover:bg-muted/30'
                }`}
                title={blockedByCenarios ? 'Cenário indisponível neste caminho' : blockedByPermission ? 'Somente consultores podem criar registros META' : undefined}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className={`rounded-md border-2 px-3 py-2 text-xs leading-relaxed ${
          statusOp === 'realizado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : statusOp === 'meta' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
          : 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
           {getStatusDescription(tipo, statusOp)}
        </div>
      </div>
      )}

      <Separator />

      {/* ══ GRADE BIFURCADA POR TIPO (PR-UI-NASCIMENTO-PADRAO-01) ═══════════════
          Esta grade servia SEIS tipos de lancamento com uma linha so de campos. O
          Nascimento precisava de outra ordem, outros rotulos e outra tipografia, e
          mexer na grade unica mudaria Morte, Consumo, Venda, Abate e Transferencia por
          efeito colateral. A bifurcacao acontece no CONTAINER: o ramo de baixo entrou
          byte a byte, sem uma alteracao — nem de indentacao.
          ⚠ A DUPLICACAO E' TEMPORARIA e tem dono: PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02
          leva os demais tipos ao mesmo padrao e reunifica a grade. Ate la, alterar
          campo comum exige mexer NOS DOIS ramos — foi o preco de nao mudar cinco telas
          sem mandato. */}
      {isNascimento ? (
        /* ⚠ ROTULOS 10px SEM NEGRITO: o mesmo defeito ja corrigido na aba Compra em
           PR-OC-UX-LOTE-C1-01 — negrito a 11px pesa mais que 10 regular, e era esse o
           pulo de tamanho ao trocar de tela.
           ⚠ SEM FAZENDA nesta grade. Ela segue read-only fora daqui, com o rotulo
           "Fazenda Destino" intacto: o nome atual avisa que o valor e' DERIVADO do
           contexto, e trocar para "Fazenda" num campo que nao se escolhe pareceria
           seletor quebrado. O rotulo muda quando o campo virar seletor de verdade,
           com payload — PR-UI-LANCAMENTOS-SIMPLES-PADRAO-02. */
        <div className="grid grid-cols-[1.2fr_1.5fr_0.8fr_1fr_2.5fr] gap-2 items-end">
          <div>
            <Label className="text-[10px] text-muted-foreground">Data</Label>
            <Input tabIndex={1} type="date" value={data} onChange={e => setData(e.target.value)} className="mt-0.5 h-7 text-[11px]" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Categoria</Label>
            <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
              <SelectTrigger tabIndex={2} className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent className="max-h-52 overflow-y-auto">
                {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1.5">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] whitespace-nowrap text-muted-foreground">Qtd. cabeças</Label>
            <Input tabIndex={3} type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className="mt-0.5 h-7 text-[11px] text-right font-bold tabular-nums" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Peso médio</Label>
            <Input tabIndex={4} type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className="mt-0.5 h-7 text-[11px] text-right tabular-nums" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
            <Input tabIndex={5} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-7 text-[11px]" />
          </div>
        </div>
      ) : (
      <>
      {/* Row 1: Data | Qtd | Peso | Categoria | Obs */}
      <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1.5fr_2.5fr] gap-2 items-end">
        <div>
          <Label className={`font-bold text-[11px] ${metaLabelClass}`}>{isAbate ? 'Data Abate' : 'Data'}</Label>
          <Input tabIndex={1} type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-7 text-[11px] ${metaInputClass}`} />
        </div>
        <div>
          <Label className={`font-bold text-[11px] whitespace-nowrap ${metaLabelClass}`}>Qtd. Cab.</Label>
          <Input tabIndex={2} type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`mt-0.5 h-7 text-[11px] text-right font-bold tabular-nums ${metaInputClass}`} />
        </div>
        <div>
          <Label className={`font-bold text-[11px] ${metaLabelClass}`}>Peso (kg)</Label>
          <Input tabIndex={3} type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className={`mt-0.5 h-7 text-[11px] text-right tabular-nums ${metaInputClass}`} />
        </div>
        <div>
          <Label className="font-bold text-[11px]">Categoria</Label>
          <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
            <SelectTrigger tabIndex={4} className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-bold text-[11px]">Obs.</Label>
          <Input tabIndex={5} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-7 text-[11px]" />
        </div>
      </div>
      </>
      )}

      {/* Motivo da Morte */}
      {isMorte && (
        <div>
          <Label className="font-bold text-[11px]">Motivo da Morte</Label>
          <Select value={motivoMorte} onValueChange={setMotivoMorte}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
            <SelectContent>
              {MOTIVOS_MORTE.map(m => <SelectItem key={m} value={m} className="text-[12px]">{m}</SelectItem>)}
              <SelectItem value="__custom__" className="text-[12px]">Outro (digitar)</SelectItem>
            </SelectContent>
          </Select>
          {motivoMorte === '__custom__' && (
            <Input value={motivoMorteCustom} onChange={e => setMotivoMorteCustom(e.target.value)} placeholder="Digite o motivo" className="mt-1 h-8 text-[12px]" />
          )}
        </div>
      )}

      {/* Row 2: Origem + Fornecedor/Destino principal (prioridade visual) + extras */}
      {(campos.origem.show || campos.destino?.show) && (
        <div className={`grid gap-2 ${
          isVenda ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)_8rem]' :
          campos.origem.show ? 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' :
          'grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
        }`}>
          {campos.origem.show && (
            <div>
              <Label className="font-bold text-[11px]">{campos.origem.label}</Label>
              {campos.origem.auto ? (
                <Input value={campos.origem.value} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
              ) : (campos.origem as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaOrigem} onValueChange={setFazendaOrigem}>
                  <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[11px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaOrigem} onChange={e => setFazendaOrigem(e.target.value)} placeholder="Ex: Faz. Boa Vista" className="mt-0.5 h-7 text-[11px]" />
              )}
            </div>
          )}
          {/* Abate: Frigorífico (Fornecedor) — campo principal */}
          {isAbate && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Frigorífico (Fornecedor) *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1" id="abate-fornecedor-select">
                  <SearchableSelect
                    value={abateFornecedorId || '__all__'}
                    onValueChange={(v) => setAbateFornecedorId(v === '__all__' ? '' : v)}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione ou cadastre o frigorífico"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button type="button" variant="outline" size="icon" className="relative z-10 h-7 w-7 shrink-0" aria-label="Novo frigorífico" onClick={() => setNovoFornecedorAbateOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {abateFrigorificoNome && (!abateFornecedorId || !abateFornecedores.find(f => f.id === abateFornecedorId)) && (
                <div className="mt-1 p-1.5 rounded border border-dashed border-muted-foreground/30 bg-muted/20">
                  <p className="text-[10px] italic text-muted-foreground leading-tight">
                    Nome importado do caderno: <span className="font-medium">"{abateFrigorificoNome}"</span> — não vinculado ao cadastro.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setNovoFornecedorAbateOpen(true)}
                    >
                      📋 Registrar como novo fornecedor
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const trigger = document.querySelector<HTMLButtonElement>('#abate-fornecedor-select button');
                        trigger?.click();
                      }}
                    >
                      🔍 Buscar fornecedor cadastrado
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Compra: Fornecedor — campo principal */}
          {isCompra && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Fornecedor *</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1" id="compra-fornecedor-select">
                  <SearchableSelect
                    value={compraFornecedorId || '__all__'}
                    onValueChange={(v) => setCompraFornecedorId(v === '__all__' ? '' : v)}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione ou cadastre o fornecedor"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => setNovoFornecedorCompraOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {fazendaOrigem && (!compraFornecedorId || !abateFornecedores.find(f => f.id === compraFornecedorId)) && (
                <div className="mt-1 p-1.5 rounded border border-dashed border-muted-foreground/30 bg-muted/20">
                  <p className="text-[10px] italic text-muted-foreground leading-tight">
                    Nome importado do caderno: <span className="font-medium">"{fazendaOrigem}"</span> — não vinculado ao cadastro.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setNovoFornecedorCompraOpen(true)}
                    >
                      📋 Registrar como novo fornecedor
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const trigger = document.querySelector<HTMLButtonElement>('#compra-fornecedor-select button');
                        trigger?.click();
                      }}
                    >
                      🔍 Buscar fornecedor cadastrado
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Venda: Destino (Comprador) — campo principal */}
          {isVenda && campos.destino?.show && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">Destino (Comprador)</Label>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="min-w-0 flex-1">
                  <SearchableSelect
                    value={vendaDestinoFornecedorId || '__all__'}
                    onValueChange={(v) => {
                      const id = v === '__all__' ? '' : v;
                      setVendaDestinoFornecedorId(id);
                      const nome = abateFornecedores.find(f => f.id === id)?.nome || '';
                      setFazendaDestino(nome);
                    }}
                    options={abateFornecedores.map(f => ({ value: f.id, label: f.nome }))}
                    placeholder="Selecione o comprador"
                    allLabel="Nenhum selecionado"
                    allValue="__all__"
                    className="[&_button]:h-7 [&_button]:text-[11px] [&_button]:px-2"
                  />
                </div>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => setNovoFornecedorVendaOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          {/* Venda: Tipo de Venda */}
          {isVenda && (
            <div>
              <Label className="font-bold text-[11px]">Tipo Venda</Label>
              <Select
                value={tipoPeso}
                onValueChange={(v) => {
                  setTipoPeso(v);
                  if (v === 'desmama' || v === 'gado_adulto') {
                    setVendaDetalhes(prev => prev ? { ...prev, tipoVenda: v as 'desmama' | 'gado_adulto' } : prev);
                  }
                }}
              >
                <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desmama" className="text-[11px]">Desmama</SelectItem>
                  <SelectItem value="gado_adulto" className="text-[11px]">Gado Adulto</SelectItem>
                  <SelectItem value="boitel" className="text-[11px]">Boitel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Outros tipos: campo destino genérico */}
          {!isAbate && !isCompra && !isVenda && campos.destino?.show && (
            <div className="min-w-0">
              <Label className="font-bold text-[11px]">{campos.destino.label}</Label>
              {campos.destino.auto ? (
                <Input value={campos.destino.value} readOnly className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed" />
              ) : (campos.destino as any).useSelect && outrasFazendas.length > 0 ? (
                <Select value={fazendaDestino} onValueChange={setFazendaDestino}>
                  <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{outrasFazendas.map(f => <SelectItem key={f.id} value={f.nome} className="text-[11px]">{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={fazendaDestino} onChange={e => setFazendaDestino(e.target.value)} placeholder={campos.destino.placeholder || 'Ex: Faz. Santa Cruz'} className="mt-0.5 h-7 text-[11px]" />
              )}
            </div>
          )}
        </div>
      )}

      {isAbate && (
        <div className="flex items-center gap-2 pt-3 border-t mt-3">
          {editingAbateId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEdit}
              disabled={submitting}
            >
              Cancelar
            </Button>
          )}
          {abateDetalhes && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAbateDialogOpen(true)}
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar Financeiro
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="font-bold"
            onClick={handleRequestRegister}
            disabled={submitting || !abateDetalhes}
          >
            {submitting
              ? 'Registrando...'
              : editingAbateId ? 'Salvar Alterações do Abate' : 'Registrar Abate'}
          </Button>
        </div>
      )}

      {isCompra && (
        <div className="flex items-center gap-2 pt-3 border-t mt-3">
          {editingAbateId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEdit}
              disabled={submitting}
            >
              Cancelar
            </Button>
          )}
          {compraDetalhes && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompraDialogOpen(true)}
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar Financeiro
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="font-bold"
            onClick={handleRequestRegister}
            disabled={submitting || !compraDetalhes}
          >
            {submitting
              ? 'Registrando...'
              : editingAbateId ? 'Salvar Alterações' : 'Registrar Compra'}
          </Button>
        </div>
      )}

      {isTransferencia && (
        <div className="flex items-center gap-2 pt-3 border-t mt-3">
          {editingAbateId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEdit}
              disabled={submitting}
            >
              Cancelar
            </Button>
          )}
          {transferenciaDetalhes && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferenciaDialogOpen(true)}
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar Financeiro
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="font-bold"
            onClick={handleRequestRegister}
            disabled={submitting}
          >
            {submitting
              ? 'Registrando...'
              : editingAbateId ? 'Salvar Alterações' : 'Registrar Transferência'}
          </Button>
        </div>
      )}

      {isVenda && (
        <div className="flex items-center gap-2 pt-3 border-t mt-3">
          {editingAbateId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEdit}
              disabled={submitting}
            >
              Cancelar
            </Button>
          )}
          {(vendaDetalhes || (tipoPeso === 'boitel' && boitelDataForResumo)) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (tipoPeso === 'boitel') {
                  vendaFinanceiroRef.current?.openBoitelDialog();
                } else {
                  setVendaDialogOpen(true);
                }
              }}
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-1" />
              {tipoPeso === 'boitel' ? 'Editar Planejamento' : 'Editar Financeiro'}
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="font-bold"
            onClick={handleRequestRegister}
            disabled={submitting || !(vendaDetalhes || (tipoPeso === 'boitel' && boitelDataForResumo))}
          >
            {submitting
              ? 'Registrando...'
              : editingAbateId ? 'Salvar Alterações' : 'Registrar Venda'}
          </Button>
        </div>
      )}

    </div>
  );

  // ===== HISTORICO VIEW =====
  const renderHistorico = () => (
    <div className="flex-1 self-start">
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 rounded-t-md">
        <div className="flex gap-1.5">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="h-8 text-[12px] font-bold w-24"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>{anosDisponiveis.map(a => <SelectItem key={a} value={a} className="text-[12px]">{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-8 text-[12px] font-bold flex-1"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>{MESES.map(m => <SelectItem key={m.value} value={m.value} className="text-[12px]">{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5 pt-1.5">
        {historicoFiltrado.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-[12px]">Nenhum lançamento no período</p>
        ) : (
          historicoFiltrado.slice(0, 50).map(l => {
            if (l.tipo === 'morte') {
              console.log('[MORTE DEBUG]', { id: l.id, obs: l.observacao, dest: l.fazendaDestino });
            }
            const entrada = isEntrada(l.tipo);
            const reclass = isReclassificacao(l.tipo);
            const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label;
            const catDestinoLabel = l.categoriaDestino ? CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label : null;
            const tipoLabel = TODOS_TIPOS.find(t => t.value === l.tipo);
            return (
              <button key={l.id} onClick={() => setDetalheId(l.id)}
                className="w-full bg-card rounded-md p-2 border shadow-sm flex items-center gap-2 text-left hover:bg-muted/50 transition-colors">
                <div className="text-lg">{tipoLabel?.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${entrada ? 'bg-success/20 text-success' : reclass ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/20 text-destructive'}`}>
                      {entrada ? '+' : reclass ? '↔' : '-'}{l.quantidade}
                    </span>
                    <span className="text-[12px] font-bold text-foreground truncate">{tipoLabel?.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {catLabel}{catDestinoLabel ? ` → ${catDestinoLabel}` : ''} • {l.data ? format(parseISO(l.data), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    {l.pesoMedioKg ? ` • ${l.pesoMedioKg}kg` : ''}
                    {l.valorTotal ? ` • ${formatMoeda(l.valorTotal)}` : ''}
                  </p>
                  {l.tipo === 'compra' && (l.compradorFornecedor || l.fazendaOrigem) && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[200px] block">
                      🏪 Fornecedor: {l.compradorFornecedor || l.fazendaOrigem}
                    </span>
                  )}
                  {(l.fazendaOrigem || l.fazendaDestino || l.compradorFornecedor || l.observacao) && (
                    <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px] block">
                      📝 {l.tipo === 'compra' ? (l.fazendaOrigem || l.compradorFornecedor || l.observacao) : (l.fazendaDestino || l.compradorFornecedor || l.observacao)}
                    </span>
                  )}
                  {/* Rastreabilidade de origem */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[8px] px-1 py-0.5 rounded ${
                      l.origemRegistro === 'importacao_historica' ? 'bg-blue-100 text-blue-700' :
                      l.origemRegistro === 'manual' ? 'bg-muted text-muted-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {l.origemRegistro === 'importacao_historica' ? '📥 Importação' : l.origemRegistro || 'manual'}
                    </span>
                    {l.cenario === 'meta' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-orange-100 text-orange-700">META</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {l.tipo === 'abate' && (l.statusOperacional === 'programado' || l.statusOperacional === 'realizado') && (
                    <AbateExportDialog lancamento={l} fazendaNome={nomeFazenda} />
                  )}
                  {(() => {
                    const cfg = getStatusBadge(l);
                    return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>;
                  })()}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // formApi — referências dos estados/setters/handlers existentes para a casca de Compra
  // (PR-COMPRA-SHELL-01). Sem estado novo; apenas display-derivations (statusDescription,
  // quantidadeNum, pesoKgNum) e o wrapper de setCategoria (mesmo idioma do Select legado).
  // PR-HOTFIX-P0 — nome SOBERANO da fazenda para o cabeçalho/resumo da OP aberta. Operação existente com
  //   fazenda própria exibe a fazenda da OC (não o contexto global); OC sem fazenda → contexto atual/"Global";
  //   fazenda_id presente mas nome ainda não resolvido → texto neutro (nunca "Global", que seria falso).
  //   NÃO altera fazendaAtualId, a fazenda gravada, o SELECT da aba Compra, filtros ou regras de negócio.
  const ocTemFazendaPropria = !!ocOperacaoId && !!ocFazendaDestinoId
    && ocFazendaDestinoId !== '__atual__' && ocFazendaDestinoId !== '__global__';
  const ocHeaderFazendaNome = ocTemFazendaPropria
    ? (fazendas.find(f => f.id === ocFazendaDestinoId)?.nome ?? 'Fazenda da operação')
    : nomeFazenda;

  const compraFormApi = {
    abaInicial: ocSearchParams.get('oc_aba') ?? undefined,   // PR-OC-FIN-EDIT-FIX-02 — aba inicial do modal OC
    statusOp, setStatusOp,
    statusDescription: getStatusDescription(tipo, statusOp),
    cenariosPermitidos: cenariosPermitidos ?? null,
    canEditMeta,
    data, setData,
    qtdInput, pesoInput,
    categoria, setCategoria: (v: string) => setCategoria(v as Categoria),
    categoriasDisponiveis,
    observacao, setObservacao,
    fazendaOrigem, setFazendaOrigem,
    fazendaAtualNome: ocHeaderFazendaNome,
    fazendaAtualId: fazendaAtual?.id ?? null,
    fazendas: fazendasOC,
    fazendaDestinoId: ocFazendaDestinoId,
    setFazendaDestinoId: setOcFazendaDestinoId,
    compraFornecedorId, setCompraFornecedorId,
    fornecedores: abateFornecedores,
    setNovoFornecedorCompraOpen,
    compraDetalhes, setCompraDetalhes, setNotaFiscal,
    compraDialogOpen, setCompraDialogOpen,
    quantidadeNum: parseNumericValue(quantidade) || 0,
    pesoKgNum: parseNumericValue(pesoKg) || 0,
    handleRequestRegister, handleCancelEdit,
    submitting,
    editingId: editingAbateId,
    mesFechadoMsg: p1BloqueioMsg,
    modoOC: modoOCCompra,
    ocOperacaoId,
    lotesApi,
    recebimentoApi,
    documentosApi,
    eventosApi,
    liquidacaoApi,
    ocStatusComercial,
    ocDataOperacao: data,   // FIX-01 item 6 — data da compra p/ contexto da aba Financeiro nova
    ocEntregaEncerrada,
    // PR-OC-EDIT-01A — editabilidade por estado real (ADR Soberania Financeira):
    //   somenteLeitura TOTAL em: fechada, cancelada OU programada/rascunho COM título materializado.
    //   Havendo título, a OC fica integralmente somente leitura (inclusive Observação): sem salvamento
    //   parcial, nenhuma alteração econômica possível e o FINV2 soberano é preservado.
    //   programada/rascunho SEM título abrem editáveis (cabeçalho + Negociação/Lotes).
    //   aberturaExistente sinaliza edição de operação existente (01A não expõe Confirmar/Cancelar/
    //     Reabrir nem os writes de Recebimento/Documentos/Financeiro — ficam para PRs próprios).
    somenteLeitura: ocAberturaExistente
      && (ocStatusComercial === 'fechada' || ocStatusComercial === 'cancelada' || ocTemTitulo),
    aberturaExistente: ocAberturaExistente,
    // PR-OC-EDICAO-POS-FECHAMENTO-02 — ha edicao nao gravada nos dados da operacao?
    ocDadosSujos,
    // PR-NAV-CONTEXTO-FAZENDA-01A — há fazenda real para persistir a OC? (Global exige escolha no modal).
    ocFazendaValida: !!ocFazendaId,
    // PR-OC-EDIT-01B — ações de ciclo (RPCs oficiais) + título materializado (explicação/gating).
    ocTemTitulo,
    ocRascunho,
    acaoOcLoading,
    onConfirmarOC: confirmarOperacaoOC,
    onCancelarOC: cancelarOperacaoOC,
    onReabrirOC: reabrirOperacaoOC,
    // PR-OC-NAV-01 — fechar em modo OC retorna à Central e limpa a URL; fora do modo OC, apenas fecha.
    onClose: fecharModalOCComAutosave,
    // Troca de aba dentro do modal: a casca chama antes de trocar.
    onAutoSalvarOC: autoSalvarOC,
  };

  return (
    <div className="p-4 animate-fade-in pb-20 max-w-7xl mx-auto">
      {onBackToConciliacao && aba !== 'reclassificacao' && (
        <button onClick={onBackToConciliacao} className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-md py-2 transition-colors hover:bg-primary/20 mb-3">
          <ArrowLeft className="h-4 w-4" /> {backLabel || 'Retornar à Conciliação de Categoria'}
        </button>
      )}

      {/* Master lock banner — derivado da data atual do form */}
      {data && <MasterLockBanner anoMes={data.slice(0, 7)} className="mb-2" />}

      {/* ── P1 governance banner ── */}
      {p1Oficial && !isCenarioMeta && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="text-[11px]">
              <span className="font-bold text-destructive">Mês fechado (P1 oficial).</span>{' '}
              <span className="text-muted-foreground">
                {editingAbateId
                  ? 'Campos zootécnicos estruturais estão bloqueados. Campos financeiros/comerciais podem ser editados.'
                  : 'Reabra o período para alterar campos estruturais ou registrar novos lançamentos.'}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-[10px] h-6 shrink-0 ml-2" onClick={() => setShowReabrirP1(true)}>
            Reabrir
          </Button>
        </div>
      )}

      {/* ── P1 selective block inline message ── */}
      {p1BloqueioMsg && (
        <div className="bg-destructive/10 border-2 border-destructive/40 rounded-md px-3 py-2.5 mb-2">
          <p className="text-[11px] text-destructive font-bold mb-0.5">⚠️ Alteração não salva</p>
          <p className="text-[10px] text-destructive/90">{p1BloqueioMsg}</p>
        </div>
      )}

      {/* ── Cards superiores de tipo (substitui sidebar e strip mobile) ── */}
      {renderTipoCards()}

      {/*
        ── Modal de lançamento (Etapa 1) ──
        Envolve o formulário + painel financeiro. Renderiza somente quando aberto
        para preservar o comportamento original de mount/unmount dos blocos internos.
        - Fechamento manual: ESC e botão X (no header do DialogContent).
        - Clique fora: bloqueado (onPointerDownOutside.preventDefault) para não
          perder dados preenchidos sem confirmação explícita.
        - Submit: handlers continuam idênticos; modal NÃO fecha após salvar
          (auto-close será endereçado na Etapa 2).
      */}
      {/* PR-OC-AUTOSAVE-01 (fatia 4) — so aparece quando ha edicao pendente que NAO
          pode ser gravada. Com tudo valido, grava e fecha sem interromper ninguem. */}
      <Dialog open={fecharPendente !== null} onOpenChange={(o) => { if (!o) setFecharPendente(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Alterações não salvas</DialogTitle>
            <DialogDescription className="text-[12px]">
              {fecharPendente} Se fechar agora, a alteração será perdida.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFecharPendente(null)}>Voltar e corrigir</Button>
            <Button variant="destructive" size="sm"
              onClick={() => { setFecharPendente(null); fecharModalOC(); }}>Fechar e descartar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lancModalOpen} onOpenChange={(open) => { if (open) setLancModalOpen(true); else fecharModalOCComAutosave(); }}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        /* Nascimento usa o MESMO envelope da Compra: sem padding proprio, sem gap e
           com o botao de fechar nativo escondido — quem fecha e' o X do cabecalho azul. */
        className={isCompra || isNascimento
          /* ⚠ MESMO TETO DO MODAL SIMPLES, na linha de baixo (PR-OC-MODAL-TAMANHO-01).
             Eram 1152px contra 1024px, e a diferenca fazia os dois lerem como sistemas
             diferentes ao alternar entre eles. O shell nao declara largura: ele preenche
             o que este DialogContent lhe da. */
          ? 'max-w-5xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden'
          : 'max-w-full sm:max-w-5xl w-full h-screen sm:h-auto sm:max-h-[92vh] overflow-y-auto p-4 sm:p-5'}
      >
      {isCompra ? (
        <CompraModalShell {...compraFormApi} />
      ) : isNascimento ? (
        /* ══ NASCIMENTO NO SHELL DA OC (PR-UI-NASCIMENTO-SHELL-02) ═══════════════
           Mesmo modal da Compra, sem as abas: mesma largura, mesma altura, mesmo
           cabecalho azul, mesmo resumo lateral, mesmo rodape. So o miolo e' outro.
           Duas telas do mesmo sistema tem de parecer duas telas do mesmo sistema.
           ⚠ SEM FAIXA DE ABAS. Nascimento nao tem contraparte, documento, recebimento
           nem financeiro — nao ha o que preencher seis abas.
           ⚠ MEDIDAS COPIADAS DE CompraModalShell, nao inventadas: `h-[69vh]`,
           `px-6 py-2.5` no cabecalho, `px-6 py-2` no rodape, `lg:grid-cols-[1fr_280px]`
           com `gap-3 p-4`, e as duas colunas com rolagem propria (`min-h-0`).
           ⚠ A BIFURCACAO acontece aqui, no container: o ramo dos outros cinco tipos
           entrou intocado no `else`, byte a byte. Morte, Consumo, Venda, Abate e
           Transferencia nao mudam — inclusive as descricoes de status deles. */
        <div className="flex flex-col">
          <div className="bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">Nascimento</h2>
                {/* ⚠ ROTULO, NAO CONTROLE. Este caminho registra apenas realizado; meta
                    tem caminho proprio. O seletor de cenario saiu em 056054e7. */}
                <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">Realizado</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {data ? data.split('-').reverse().join('/') : '—'}</span>
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {nomeFazenda || '—'}</span>
              </div>
            </div>
            <button type="button" onClick={fecharModalOCComAutosave} className="text-white/80 hover:text-white shrink-0"
              title="Fechar" aria-label="Fechar"><X className="h-5 w-5" /></button>
          </div>

          {/* ⚠ `+38px` E' A FAIXA DE ABAS QUE ESTA TELA NAO TEM. O corpo da Compra e'
              `h-[69vh]` e ela ainda carrega 38px de abas; sem absorver isso, o modal do
              Nascimento fecharia 38px mais baixo e os dois nunca pareceriam o mesmo.
              Em `calc` e nao num vh novo porque o que falta e' uma altura FIXA — vh
              acertaria numa janela e erraria em todas as outras. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 h-[calc(69vh_+_38px)] overflow-y-auto lg:overflow-hidden bg-muted/30">
            <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">
              <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
                {/* Titulo no idioma da "Identificação da compra": 15px, peso 500, cor padrao. */}
                <div className="text-[15px] font-medium text-foreground">Identificação do nascimento</div>

                {/* FAIXA DE TOPO — o que se le de relance, no idioma da Compra.
                    ⚠ Fazenda sem valor sai em `text-destructive`, e nao com o traco
                    cinza de dado ausente: aqui a ausencia BLOQUEIA o registro, entao ela
                    e' erro a resolver, nao informacao a aceitar. */}
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda</div>
                    <div className={`mt-1 text-[20px] font-medium leading-none truncate ${nascFazendaFalta ? 'text-destructive' : ''}`}>
                      {nascFazendaNome ?? '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-normal text-muted-foreground leading-none">Data do nascimento</div>
                    <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                      {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
                  {/* ⚠ FAZENDA E' ESCOLHA, e o payload a carrega — `Lancamento.fazendaId`
                      vence a do contexto em `adicionarLancamento`. Antes o seletor nao
                      existia e a fazenda era heranca silenciosa; em Global o lancamento
                      era recusado sem que a tela dissesse nada. */}
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Fazenda <span className="text-destructive">*</span></Label>
                    <Select value={nascFazendaId} onValueChange={setNascFazendaId}>
                      <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${nascFazendaFalta ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Selecione a fazenda" />
                      </SelectTrigger>
                      <SelectContent>
                        {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {nascFazendaFalta && (
                      <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda do lançamento.</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Data do nascimento <span className="text-destructive">*</span></Label>
                    {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                    <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Quantidade <span className="text-destructive">*</span></Label>
                    <Input inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus}
                      placeholder="0" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Categoria <span className="text-destructive">*</span></Label>
                    <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
                      <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-52 overflow-y-auto">
                        {categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Peso médio <span className="text-destructive">*</span></Label>
                    <Input inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus}
                      placeholder="0,00" className="mt-[3px] h-8 px-2.5 text-[12px] text-right tabular-nums" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
                    <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
                      className="mt-[3px] h-8 px-2.5 text-[12px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* RESUMO LATERAL — idioma do ResumoLateralOC: faixa de titulo, blocos com
                faixa, pares rotulo-valor alinhados a direita, traco no vazio. */}
            <div className="lg:min-h-0 lg:overflow-y-auto">
              <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
                <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Resumo do lançamento
                </div>
                {/* ⚠ FAIXA DE BLOCO EM 10px, e NAO nos 9px do ResumoLateralOC. O piso de
                    leitura do A21 e' 10px, e copiar o idioma nao pode significar copiar
                    uma violacao — ela se espalharia por cada tela nova. A divergencia de
                    1px contra a OC esta declarada; quem unificar decide o lado. */}
                <div className="pb-1">
                  <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
                  </div>
                  <div className="px-3 space-y-0.5">
                    <LinhaResumoNasc rotulo="Tipo" valor="Nascimento" />
                    <LinhaResumoNasc rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                    <LinhaResumoNascFazenda valor={nascFazendaNome} falta={nascFazendaFalta} />
                    <LinhaResumoNasc rotulo="Categoria" valor={categoriasDisponiveis.find(c => c.value === categoria)?.label ?? null} />
                  </div>

                  <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Rebanho</span>
                  </div>
                  {/* ⚠ AUSENCIA E' TRACO, NUNCA ZERO. Sem quantidade ou sem peso nao ha
                      peso total — nao ha "peso total de zero". `LinhaResumoNasc` imprime
                      "—" para null, e nenhum `?? 0` tapa buraco no caminho.
                      ⚠ ARROBA POR PESO VIVO: peso total / 30. A divisao por 15 e' de
                      CARCACA e vale so no abate; usa-la aqui dobraria o numero. */}
                  <div className="px-3 space-y-0.5">
                    <LinhaResumoNasc rotulo="Cabeças" valor={nascQtd > 0 ? `${nascQtd} cab` : null} />
                    <LinhaResumoNasc rotulo="Peso médio" valor={nascPeso > 0 ? `${fmtNum2(nascPeso)} kg` : null} />
                    <LinhaResumoNasc rotulo="Peso total" valor={nascPesoTotal != null ? `${fmtNum2(nascPesoTotal)} kg` : null} />
                    <LinhaResumoNasc rotulo="Arrobas" valor={nascPesoTotal != null ? `${fmtNum2(nascPesoTotal / 30)} @` : null} />
                  </div>

                  <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
                  </div>
                  <div className="px-3 text-muted-foreground leading-tight">
                    Nascimento não tem impacto financeiro.
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <div className="bg-primary px-6 py-2 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={fecharModalOCComAutosave}
              className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem registrar" aria-label="Fechar">
              Fechar
            </Button>
            <Button type="button" onClick={handleRequestRegister} disabled={submitting || nascFazendaFalta}
              className="bg-white text-primary hover:bg-white/90 font-bold disabled:opacity-60"
              title={nascFazendaFalta ? 'Selecione a fazenda do lançamento' : 'Registrar o nascimento'}
              aria-label="Registrar nascimento">
              {submitting ? 'Registrando…' : 'Registrar nascimento'}
            </Button>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start overflow-visible">
        {/* Center: Form or Historico */}
        {aba === 'reclassificacao' ? (
          <>
            <ReclassificacaoFormFields
              state={reclassState}
            />
            <ReclassificacaoResumoPanel
              quantidade={Number(reclassState.quantidade) || 0}
              pesoKg={parseDecimalInput(reclassState.pesoKg) || 0}
              origemLabel={reclassState.origemLabel}
              destinoLabel={reclassState.destinoLabel}
              pesoMedioOrigem={reclassState.origemInfo?.pesoMedioKg ?? null}
              statusOp={reclassState.statusOp}
              onRequestRegister={editingReclassId ? async () => {
                if (submitting) return;
                setSubmitting(true);
                try {
                  const isMeta = reclassState.statusOp === 'meta';
                  const pesoMedioKg = parseDecimalInput(reclassState.pesoKg);
                  const payload = {
                    data: reclassState.data,
                    categoria: reclassState.categoriaOrigem,
                    categoriaDestino: reclassState.categoriaDestino,
                    quantidade: Number(reclassState.quantidade),
                    pesoMedioKg: pesoMedioKg ?? null,
                    pesoMedioArrobas: pesoMedioKg !== undefined ? kgToArrobas(pesoMedioKg) : null,
                    cenario: isMeta ? 'meta' as const : 'realizado' as const,
                    statusOperacional: isMeta ? 'previsto' as const : 'realizado' as const,
                  };
                  await onEditar(editingReclassId, payload);
                  toast.success('Reclassificação atualizada com sucesso.');
                  triggerZootCacheRefresh(reclassState.data, true, new Date(reclassState.data).getMonth() + 1);
                  setEditingReclassId(null);
                  reclassState.setQuantidade('');
                  reclassState.setPesoKg('');
                  reclassState.setPesoAutoFilled(false);
                  setLancModalOpen(false);
          restoreEditOrigin();
                } finally {
                  setSubmitting(false);
                }
              } : async () => {
                if (submitting) return;
                setSubmitting(true);
                try {
                  await reclassState.handleSubmit();
                  triggerZootCacheRefresh(reclassState.data, true, new Date(reclassState.data).getMonth() + 1);
                } finally {
                  setSubmitting(false);
                }
              }}
              submitting={submitting}
              canRegister={!!(Number(reclassState.quantidade) > 0 && reclassState.categoriaOrigem !== reclassState.categoriaDestino)}
              onBack={editingReclassId ? undefined : onBackToConciliacao}
              backLabel={backLabel}
              isEditing={!!editingReclassId}
              onCancelEdit={() => {
                setEditingReclassId(null);
                reclassState.setQuantidade('');
                reclassState.setPesoKg('');
                reclassState.setPesoAutoFilled(false);
                if (onReturnFromEdit) onReturnFromEdit();
              }}
              onDelete={editingReclassId ? async () => {
                await onRemover(editingReclassId);
                setEditingReclassId(null);
                reclassState.setQuantidade('');
                reclassState.setPesoKg('');
                reclassState.setPesoAutoFilled(false);
                toast.success('Reclassificação removida.');
                triggerZootCacheRefresh(reclassState.data, true, new Date(reclassState.data).getMonth() + 1);
                if (onReturnFromEdit) await onReturnFromEdit();
              } : undefined}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                triggerZootCacheRefresh(reclassState.data, true, new Date(reclassState.data).getMonth() + 1);
                toast.info('Atualizando rebanho... aguarde ~15s e recarregue a tela.');
              }}
            >
              🔄 Atualizar Rebanho
            </Button>
          </>
        ) : (
          <>
             {renderForm()}
            <div className="space-y-3">
              {/* META Intelligent Panel */}
              {isCenarioMeta && (
                <MetaLancamentoPanel
                  ano={data ? Number(data.slice(0, 4)) : new Date().getFullYear()}
                  mes={data ? Number(data.slice(5, 7)) : new Date().getMonth() + 1}
                  categoria={categoria as any}
                  tipo={tipo}
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  clienteId={clienteAtual?.id}
                  lancamentoEmEdicao={metaLancamentoEmEdicao}
                  onSugestaoEvolucao={(info: EvolucaoSugestao) => {
                    setEvolucaoSugestao(info);
                    setEvolucaoDialogOpen(true);
                  }}
                  onStepStateChange={setMetaStepState}
                />
              )}
              {/* Existing right panel */}
              {isCompra ? (
              <>
                <CompraResumoPanel
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  fornecedorNome={abateFornecedores.find(f => f.id === compraFornecedorId)?.nome || ''}
                  detalhes={compraDetalhes}
                  detalhesPreenchidos={!!compraDetalhes}
                  canOpenModal={!!(data && quantidade && parseNumericValue(quantidade) > 0 && pesoKg && parseNumericValue(pesoKg) > 0 && categoria)}
                  onOpenModal={() => setCompraDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Compra'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                />
                <CompraDetalhesDialog
                  open={compraDialogOpen}
                  onClose={() => setCompraDialogOpen(false)}
                  onSave={(det) => {
                    setCompraDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setCompraDialogOpen(false);
                  }}
                  initialData={compraDetalhes || EMPTY_COMPRA_DETALHES}
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  dataCompra={data}
                />
              </>
            ) : isAbate ? (
              <>
                <AbateResumoPanel
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  frigorificoNome={abateDetalhes?.frigorifico || abateFrigorificoNome || abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || ''}
                  detalhes={abateDetalhes}
                  detalhesPreenchidos={!!abateDetalhes}
                  canOpenModal={!!(data && quantidade && parseNumericValue(quantidade) > 0 && pesoKg && parseNumericValue(pesoKg) > 0 && categoria && abateFornecedorId)}
                  onOpenModal={() => setAbateDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações do Abate' : 'Registrar Abate'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={abateCalc}
                />
                <AbateDetalhesDialog
                  open={abateDialogOpen}
                  onClose={() => setAbateDialogOpen(false)}
                  onSave={(det) => {
                    setAbateDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setPrecoArroba(det.precoArroba);
                    setRendCarcaca(det.rendCarcaca);
                    setTipoPeso(det.tipoPeso);
                    setTipoVenda(det.tipoVenda);
                    setBonusPrecoce(det.bonusPrecoce);
                    setBonusQualidade(det.bonusQualidade);
                    setBonusListaTrace(det.bonusListaTrace);
                    setDescontoQualidade(det.descontoQualidade);
                    setFunruralPct(det.funruralPct);
                    setFunruralReais(det.funruralReais);
                    setOutrosDescontos(det.outrosDescontos);
                    setDataVenda(det.dataVenda);
                    // Sync pesoKg from pesoTotalKgNF (total NF weight → per head)
                    if (det.pesoTotalKgNF && Number(det.pesoTotalKgNF) > 0) {
                      const qtd = parseNumericValue(quantidade) || 1;
                      setPesoKg(String(Math.round((Number(det.pesoTotalKgNF) / qtd) * 100) / 100));
                    }
                    setAbateDialogOpen(false);
                  }}
                  initialData={{
                    ...(abateDetalhes || EMPTY_ABATE_DETALHES),
                    frigorifico: abateDetalhes?.frigorifico || abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || '',
                  }}
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  dataAbate={data}
                  statusOp={effectiveStatusOp}
                />
                {/* Hidden panel for financeiro generation */}
                <div className="hidden">
                  <AbateFinanceiroPanel
                    ref={abateFinanceiroRef}
                    quantidade={parseNumericValue(quantidade) || 0}
                    categoria={categoria}
                    data={data}
                    valorLiquido={calc.valorLiquido}
                    totalDescontos={calc.totalDescontos}
                    frigorifico={abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || ''}
                    fornecedorId={abateFornecedorId || undefined}
                    notaFiscal={notaFiscal}
                    onNotaFiscalChange={setNotaFiscal}
                    lancamentoId={editingAbateId || lastSavedLancamentoId || undefined}
                    mode={editingAbateId ? 'update' : 'create'}
                    onFinanceiroUpdated={() => {}}
                    statusOperacional={effectiveStatusOp}
                    // PR-G — fazenda/cliente do LANÇAMENTO prevalecem sobre o
                    // contexto da tela (modo Global tem fazendaAtual.id === '__global__').
                    fazendaIdLancamento={editingFazendaId ?? undefined}
                    clienteIdLancamento={clienteAtual?.id}
                  />
                </div>
                {/* Fallback: gerar financeiro quando não foi gerado automaticamente */}
                {editingAbateId && isConciliado && abateFinanceiroMissing && calc.valorLiquido > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded text-[11px]">
                    <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                    <span className="text-orange-700 dark:text-orange-300 flex-1">Financeiro não gerado para este abate.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900"
                      disabled={gerandoFinanceiroFallback}
                      onClick={handleGerarFinanceiroFallback}
                    >
                      {gerandoFinanceiroFallback ? 'Gerando...' : 'Gerar Financeiro'}
                    </Button>
                  </div>
                )}
              </>
            ) : isVenda ? (
              <>
                <VendaResumoPanel
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  compradorNome={abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || ''}
                  detalhes={vendaDetalhes}
                  detalhesPreenchidos={!!vendaDetalhes || (tipoPeso === 'boitel' && !!boitelDataForResumo)}
                  canOpenModal={!!(data && quantidade && parseNumericValue(quantidade) > 0 && pesoKg && parseNumericValue(pesoKg) > 0 && categoria && vendaDestinoFornecedorId)}
                  onOpenModal={() => {
                    if (tipoPeso === 'boitel') {
                      vendaFinanceiroRef.current?.openBoitelDialog();
                    } else {
                      setVendaDialogOpen(true);
                    }
                  }}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Venda'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={vendaCalc}
                  isBoitel={tipoPeso === 'boitel'}
                  boitelData={boitelDataForResumo}
                />
                <VendaDetalhesDialog
                  open={vendaDialogOpen}
                  onClose={() => setVendaDialogOpen(false)}
                  onSave={(det) => {
                    setVendaDetalhes(det);
                    setNotaFiscal(det.notaFiscal);
                    setVendaTipoPreco(det.tipoPreco);
                    setVendaPrecoInput(det.precoInput);
                    setTipoPeso(det.tipoVenda);
                    setFrete(det.frete);
                    setComissaoPct(det.comissaoPct);
                    setOutrosDescontos(det.outrosCustos);
                    setFunruralPct(det.funruralPct);
                    setFunruralReais(det.funruralReais);
                    setVendaDialogOpen(false);
                  }}
                  initialData={vendaDetalhes || EMPTY_VENDA_DETALHES}
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  dataVenda={data}
                  compradorNome={abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome || ''}
                  statusOperacional={effectiveStatusOp}
                />
                {/* Hidden panel for financeiro generation */}
                <div className="hidden">
                  <VendaFinanceiroPanel
                    key={`venda-hidden-${tipo}`}
                    ref={vendaFinanceiroRef}
                    quantidade={parseNumericValue(quantidade) || 0}
                    pesoKg={parseNumericValue(pesoKg) || 0}
                    categoria={categoria}
                    data={data}
                    destino={fazendaDestino}
                    fornecedorId={vendaDestinoFornecedorId}
                    onFornecedorIdChange={() => {}}
                    fornecedores={abateFornecedores}
                    onCreateFornecedor={async () => {}}
                    notaFiscal={notaFiscal}
                    onNotaFiscalChange={setNotaFiscal}
                    statusOp={effectiveStatusOp}
                    lancamentoId={editingAbateId || lastSavedLancamentoId || undefined}
                    mode="update"
                    tipoPeso={tipoPeso}
                    onTipoPesoChange={() => {}}
                    vendaTipoPreco={vendaTipoPreco}
                    onVendaTipoPrecoChange={() => {}}
                    vendaPrecoInput={vendaPrecoInput}
                    onVendaPrecoInputChange={() => {}}
                    valorBruto={calc.valorBruto}
                    totalBonus={calc.totalBonus}
                    totalDescontos={calc.totalDescontos}
                    valorLiquido={calc.valorLiquido}
                    funruralPct={funruralPct}
                    onFunruralPctChange={() => {}}
                    descontoQualidade={descontoQualidade}
                    onDescontoQualidadeChange={() => {}}
                    outrosDescontos={outrosDescontos}
                    onOutrosDescontosChange={() => {}}
                    descFunruralTotal={calc.descFunruralTotal}
                    descQualidadeTotal={calc.descQualidadeTotal}
                    frete={frete}
                    onFreteChange={() => {}}
                    comissao={comissaoPct}
                    onComissaoChange={() => {}}
                    funruralReais={funruralReais}
                    onFunruralReaisChange={() => {}}
                    comissaoVal={calc.comissaoVal}
                    freteVal={calc.freteVal}
                    onRequestRegister={() => {}}
                    submitting={false}
                    onBoitelDataChange={setBoitelDataForResumo}
                     initialBoitelData={boitelDataForResumo}
                     initialFormaReceb={vendaDetalhes?.formaReceb}
                     initialParcelas={vendaDetalhes?.parcelas}
                     fazendaIdLancamento={editingFazendaId ?? undefined}
                     clienteIdLancamento={clienteAtual?.id}
                   />
                </div>
              </>
            ) : isTransferenciaSaida ? (
              <>
                <TransferenciaResumoPanel
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  fazendaOrigem={nomeFazenda || fazendaOrigem}
                  fazendaDestino={fazendaDestino}
                  detalhes={transferenciaDetalhes}
                  detalhesPreenchidos={!!transferenciaDetalhes}
                  canOpenModal={!!(data && quantidade && parseNumericValue(quantidade) > 0 && pesoKg && parseNumericValue(pesoKg) > 0 && categoria && fazendaDestino)}
                  onOpenModal={() => setTransferenciaDialogOpen(true)}
                  onRequestRegister={handleRequestRegister}
                  submitting={submitting}
                  registerLabel={editingAbateId ? 'Salvar Alterações' : 'Registrar Transferência'}
                  onCancelEdit={editingAbateId ? handleCancelEdit : undefined}
                  calculation={transferenciaCalc}
                />
                <TransferenciaDetalhesDialog
                  open={transferenciaDialogOpen}
                  onClose={() => setTransferenciaDialogOpen(false)}
                  onSave={(det) => {
                    setTransferenciaDetalhes(det);
                    setTransferenciaDialogOpen(false);
                  }}
                  initialData={transferenciaDetalhes || EMPTY_TRANSFERENCIA_DETALHES}
                  quantidade={parseNumericValue(quantidade) || 0}
                  pesoKg={parseNumericValue(pesoKg) || 0}
                  categoria={categoria}
                  fazendaOrigem={nomeFazenda || fazendaOrigem}
                  fazendaDestino={fazendaDestino}
                  data={data}
                  statusOp={effectiveStatusOp}
                  observacao={observacao}
                />
              </>
            ) : (
              renderFinancialPanel()
            )}
            </div>
          </>
        )}
      </div>
      )}
      </DialogContent>
      </Dialog>

      {lancamentoDetalhe && (
        <LancamentoDetalhe
          lancamento={lancamentoDetalhe}
          open={!!detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={onEditar}
          onRemover={onRemover}
          onCountFinanceiros={onCountFinanceiros}
          onEditarAbate={loadAbateForEdit}
          onEditarVenda={loadVendaForEdit}
          onEditarCompra={loadCompraForEdit}
          onEditarTransferencia={loadTransferenciaForEdit}
          onEditarMorte={loadMorteForEdit}
          onEditarConsumo={loadConsumoForEdit}
          fazendaId={fazendaAtual?.id}
        />
      )}

      {/* Lançamento em lote de Mortes META */}
      <MorteLoteMetaDialog
        open={morteLoteOpen}
        onClose={() => setMorteLoteOpen(false)}
        onAdicionar={onAdicionar}
        dataInicial={data}
      />

      {/* Confirmation dialog */}
      <ConfirmacaoRegistroDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => handleSubmit()}
        submitting={submitting}
        operacionais={{
          status: isCenarioMeta ? 'meta' : effectiveStatusOp,
          data,
          quantidade: parseNumericValue(quantidade) || 0,
          categoria,
          pesoKg: parseNumericValue(pesoKg) || 0,
          fazendaOrigem: campos.origem.show ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) : undefined,
          fazendaDestino: isAbate ? (abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || '') : (campos.destino?.show ? (campos.destino?.auto ? campos.destino?.value : fazendaDestino) : undefined),
          observacao,
        }}
        financeiros={getConfirmacaoFinanceiros()}
      />

      {/* Novo Fornecedor (Frigorífico) dialog for abate */}
      <NovoFornecedorDialog
        open={novoFornecedorAbateOpen}
        onClose={() => setNovoFornecedorAbateOpen(false)}
        defaultNome={!abateFornecedorId && abateFrigorificoNome ? abateFrigorificoNome : undefined}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: (fazendaAtual?.id && fazendaAtual.id !== '__global__') ? fazendaAtual.id : null, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setAbateFornecedorId(rec.id);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorAbateOpen(false);
        }}
      />

      {/* Novo Fornecedor dialog for compra */}
      <NovoFornecedorDialog
        open={novoFornecedorCompraOpen}
        onClose={() => setNovoFornecedorCompraOpen(false)}
        defaultNome={!compraFornecedorId && fazendaOrigem ? fazendaOrigem : undefined}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: (fazendaAtual?.id && fazendaAtual.id !== '__global__') ? fazendaAtual.id : null, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setCompraFornecedorId(rec.id);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorCompraOpen(false);
        }}
      />

      {/* Novo Fornecedor dialog for venda destino */}
      <NovoFornecedorDialog
        open={novoFornecedorVendaOpen}
        onClose={() => setNovoFornecedorVendaOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!clienteAtual || !fazendaAtual) return;
          const { data: rec, error } = await supabase
            .from('financeiro_fornecedores')
            .insert({ cliente_id: clienteAtual.id, fazenda_id: (fazendaAtual?.id && fazendaAtual.id !== '__global__') ? fazendaAtual.id : null, nome, cpf_cnpj: cpfCnpj || null })
            .select('id, nome')
            .single();
          if (error) { toast.error('Erro ao salvar fornecedor'); return; }
          if (rec) {
            setAbateFornecedores(prev => [...prev, rec].sort((a, b) => a.nome.localeCompare(b.nome)));
            setVendaDestinoFornecedorId(rec.id);
            setFazendaDestino(rec.nome);
            toast.success(`Fornecedor "${rec.nome}" criado e selecionado`);
          }
          setNovoFornecedorVendaOpen(false);
        }}
      />

      {/* Reabertura P1 dialog */}
      {fazendaAtual?.id && formAnoMes && (
        <ReabrirP1Dialog
          open={showReabrirP1}
          onOpenChange={setShowReabrirP1}
          fazendaId={fazendaAtual.id}
          anoMes={formAnoMes}
          onReaberto={refetchPilares}
        />
      )}
      {evolucaoSugestao && (
        <EvolucaoAssistidaDialog
          open={evolucaoDialogOpen}
          onOpenChange={setEvolucaoDialogOpen}
          sugestao={evolucaoSugestao}
          dataLancamento={data}
          quantidadeLancamento={parseNumericValue(quantidade) || 0}
          saldoDestinoAtual={metaStepState?.saldoDestinoAtual ?? 0}
          onRegistrar={onAdicionar}
          onSucesso={() => {
            setEvolucaoSugestao(null);
          }}
        />
      )}
    </div>
  );
}
