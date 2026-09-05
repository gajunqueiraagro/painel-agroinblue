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
  type BasePrecoVenda,
  type TipoPesoAbate,
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
import { NascimentoModalShell } from '@/components/nascimento/NascimentoModalShell';
import { MorteModalShell } from '@/components/morte/MorteModalShell';
import { CompraMetaModalShell } from '@/components/compra/CompraMetaModalShell';
import { VendaMetaModalShell } from '@/components/venda/VendaMetaModalShell';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { boitelVazio, payloadBoitel, boitelDeLinha, type BoitelEdicao } from '@/components/venda/BoitelBlocosModais';
import { liquidoDaVendaBoitel } from '@/components/venda/BoitelNegociacaoDerivado';
import { ReclassificacaoFormFields, useReclassificacaoState } from '@/components/ReclassificacaoForm';
import { ReclassificacaoResumoPanel } from '@/components/ReclassificacaoResumoPanel';
import { CompraDetalhesDialog, CompraDetalhes, EMPTY_COMPRA_DETALHES } from '@/components/compra/CompraDetalhesDialog';
import { CompraResumoPanel } from '@/components/compra/CompraResumoPanel';
import { CompraModalShell } from '@/components/compra/CompraModalShell';
import { gerarFinanceiroCompra } from '@/components/compra/gerarFinanceiroCompra';
import { OcRpcError, useOperacaoComercial } from '@/hooks/useOperacaoComercial';
import { useCompraLotes, pesoMedioPorCabeca } from '@/hooks/useCompraLotes';
import { useOperacaoRecebimento } from '@/hooks/useOperacaoRecebimento';
import { useOperacaoDocumentos } from '@/hooks/useOperacaoDocumentos';
import { useOperacaoAbate, type LinhaAbate } from '@/hooks/useOperacaoAbate';
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
  /* ⚠ INVALIDA O CACHE ZOOTECNICO depois que o realizado do abate revalora o lote —
     PR-OC-VENDA-REALIZADO-02. Quem a passa e' o dono do `useLancamentos` (V2Index), que
     e' quem sabe quais chaves existem. Esta tela recebe as escritas por prop e nao tem o
     hook; decidir as chaves aqui seria a segunda copia dessa lista. */
  onRealizadoAplicado?: () => void | Promise<void>;
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
  onNovaVendaOC?: () => void;
  onNovoAbateOC?: () => void;
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

/* ⚠ QUEM ESCOLHE A PROPRIA FAZENDA. Em contexto Global, so' estes podem lancar: os
   demais herdam a fazenda do contexto, que em Global nao existe.
   ⚠ E' LISTA, E NAO UMA CONDICAO NO FUNIL, de proposito. A guarda nasceu como
   `isGlobal && !isNascimento` (PR-OC-FIX-NASC-FAZENDA-NAO-SALVA-01), quando o
   Nascimento era o unico com seletor. A Morte ganhou o mesmo seletor e o mesmo
   payload em PR-ZOO-MORTE-NO-SHELL-01 e continuou barrada — a guarda estava
   escondida num funil de 90 linhas e ninguem lembrou dela.
   Migrar um tipo novo passa a ser ACRESCENTAR UMA LINHA AQUI. Se esquecer, o tipo
   nao lanca em Global e a mensagem diz o que fazer — em vez de uma negacao
   encadeada a mais. */
const TIPOS_COM_SELETOR_DE_FAZENDA: TipoMovimentacao[] = ['nascimento', 'morte', 'compra'];
/* ⚠ A COMPRA ENTROU EM PR-ZOO-META-COMPRA-FAZENDA-01, e so' alcanca a compra em META.
   A compra REALIZADA sai do funil antes da guarda: `if (modoOCCompra && isCompra)`
   termina em `return` (linha ~2259), e ela sempre roda em modo OC — o card so' aparece
   no realizado quando o entrypoint da OC esta ligado, e clicar nele seta `oc_compra=1`.
   A fazenda da compra realizada continua sendo a da Operacao Comercial
   (`ocFazendaDestinoId`), por outro caminho. */

/* ⚠ QUEM USA O ENVELOPE SEM PADDING (LancamentoModalEnvelope e CompraModalShell).
   Lista SEPARADA da de cima porque diz outra coisa: aqui e' "quem desenha a propria
   casca". Hoje os membros coincidem com a lista acima mais a Compra; conflatar as
   duas faria um tipo herdar largura por ter seletor de fazenda, que nao tem relacao.
   ⚠ A MORTE FALTAVA AQUI e foi o que fez o rodape rolar: sem esta classe, o
   DialogContent generico entra com `overflow-y-auto p-4`, e ai' o modal INTEIRO —
   cabecalho, corpo e rodape — rola dentro dele, anulando a estrutura do envelope. */
const TIPOS_NO_ENVELOPE_PROPRIO: TipoMovimentacao[] = ['compra', 'nascimento', 'morte'];

/* ⚠ O QUE NAO SE PROJETA. Nem tudo que se lanca tem versao planejada: chuva e' FATO
   MEDIDO — o produtor registra o que caiu, nao o que espera que caia. Oferecer o card
   na rota de planejamento convida a um lancamento que nao existe.
   ⚠ LISTA, e nao uma condicao por tipo, para que o proximo caso entre acrescentando uma
   linha. Reclassificacao NAO entra: evoluir categoria e' planejamento legitimo.
   ⚠ O tipo aceita 'chuvas' porque os cards incluem atalhos de navegacao, que nao sao
   tipos de lancamento. */
const TIPOS_QUE_NAO_SE_PROJETAM: Array<TipoMovimentacao | 'chuvas'> = ['chuvas'];

/* ⚠ QUEM NAO MOVIMENTA CAIXA NEM COMPOE DRE. A confirmacao desses tipos nao mostra
   bloco financeiro — mostrar colunas de dinheiro num lancamento que a propria tela
   declara sem impacto e' contradizer a tela na ultima parada antes de gravar.
   ⚠ CONSUMO NAO ENTRA: ele movimenta caixa e compoe DRE (decisao do Gabriel).
   ⚠ ESTA E' A UNICA DEFINICAO. Havia um `hasFinancialImpact` no corpo do componente
   nomeando o MESMO conceito com uma composicao DIFERENTE — incluia transferencia — e
   sem consumidor nenhum. Duas definicoes de "impacto financeiro" convivendo, uma delas
   morta, e' armadilha: quem procurasse a regra acharia a errada primeiro. Removido em
   PR-ZOO-LIMPAR-MORTOS-01. */
const TIPOS_SEM_IMPACTO_FINANCEIRO: TipoMovimentacao[] = ['nascimento', 'morte'];

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
      return { origem: { show: true, auto: false, label: 'Fornecedor / Origem' }, destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' } };
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

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover, onCountFinanceiros, abaInicial, onBackToConciliacao, dataInicial, backLabel, abateParaEditar, vendaParaEditar, compraParaEditar, transferenciaParaEditar, reclassParaEditar, morteParaEditar, consumoParaEditar, onReturnFromEdit, initialAnoFiltro, initialMesFiltro, initialReclassCenario, onNavegarChuvas, onFecharOperacaoOC, onNovaCompraOC, onNovaVendaOC, onNovoAbateOC, cenarioInicial, cenariosPermitidos, onRealizadoAplicado }: Props) {
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
  const [ocSearchParams, setOcSearchParams] = useSearchParams();

  /* ⚠ PARAMETRO PRESO REABRE SOZINHO — PR-OC-VENDA-REABRIR-01D. Quando a hidratacao
     recusa a operacao (id malformado, nao encontrada, tipo divergente), a URL continuava
     com `oc_compra`/`oc_venda` e `oc_id`: o modal nunca abriu, entao nao ha o que fechar,
     e `fecharOperacaoOC` — que e' quem limpa — nunca roda. O usuario voltava a Central,
     clicava noutra linha, e o parametro velho disparava a mesma recusa. Era o "nao abre
     mais" da homologacao.
     ⚠ APAGA OS CINCO, como o `fecharOperacaoOC`. `oc_return` inclusive: `abrirOperacaoOC`
     PRESERVA um `oc_return` existente, entao um resto daqui carimbaria o retorno da
     proxima abertura.
     ⚠ E LIBERA O REF-GUARD: a tentativa falhou, entao "ja hidratou" e' falso. Nao ha
     laco — sem os parametros, os dois effects saem na primeira linha. */
  const limparParamsOC = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    p.delete('oc_compra'); p.delete('oc_venda'); p.delete('oc_id');
    p.delete('oc_aba'); p.delete('oc_return');
    setOcSearchParams(p, { replace: true });
    ocHidratadoRef.current = false;
  }, [setOcSearchParams]);
  const modoOCCompra = ocSearchParams.get('oc_compra') === '1';
  /* ⚠ SO O PARAMETRO, aqui em cima. O `modoOCVenda` completo mora la' embaixo porque
     depende de `isCenarioMeta`, que nasce depois — e o hook de lotes precisa saber
     antes disso. Um lugar so' le a URL; o refinamento de cenario fica onde esta'
     documentado. */
  const ocVendaParam = ocSearchParams.get('oc_venda') === '1';
  /* ⚠ A PORTA DO ABATE — OC-ABATE-01 T1. Mesmo desenho da venda: um parametro de URL
     abre o shell da OC no lugar do formulario antigo. O diagolo legado continua sendo o
     caminho de quem NAO tem o parametro — e' assim que os 829 abates historicos seguem
     editaveis sem migracao (decisao do ENVELOPE 66). */
  const ocAbateParam = ocSearchParams.get('oc_abate') === '1';
  /* PR-OC-VENDA-ABA-01 — espelho de `modoOCCompra`. Os dois nunca coexistem: quem abre
     um apaga o outro, nos dois sentidos (ver `abrirNovaVendaOC` / `abrirNovaCompraOC`). */
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
  /* ⚠ PRIMEIRA CAUSA DO DEFEITO 1 (PR-OC-FIX-VENDA-NEGOCIACAO-NAO-GRAVA-01): estava
     `enabled: modoOCCompra`, entao numa VENDA o `carregar` do hook saia pela guarda
     `if (!enabled || !operacaoId)` e a grade nunca lia o que havia no banco. A venda usa a
     MESMA aba e o MESMO hook desde PR-OC-VENDA-ABA-NEGOCIACAO-01 — o que faltava era ligar.
     ⚠ Sem `!isCenarioMeta`: em meta o shell da OC nao e' montado, entao o hook nao tem
     consumidor. Quem decide RENDER continua sendo `modoOCVenda`. */
  const lotesApi = useCompraLotes({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    versao: ocVersao,
    onVersaoChange: setOcVersao,
    enabled: modoOCCompra || ocVendaParam || ocAbateParam,
  });
  const recebimentoApi = useOperacaoRecebimento({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    versao: ocVersao,
    onVersaoChange: setOcVersao,
    onStatusChange: setOcStatusComercial,
    onEntregaChange: setOcEntregaEncerrada,
    /* ⚠ SERVE OS DOIS MODOS — PR-OC-VENDA-ENTREGA-01. O hook e' generico da operacao e as
       RPCs que ele chama JA se chamam entrega (`oc_encerrar_entrega`, `oc_reabrir_entrega`)
       e JA tratam venda: `oc_registrar_movimentacao` mapeia `venda -> venda` e grava o
       valor vindo do lote. O que faltava era ligar — os callbacks sao os mesmos porque o
       estado da OC e' o mesmo. */
    enabled: modoOCCompra || ocVendaParam || ocAbateParam,
  });
  /* ⚠ OS TRES SERVEM OS DOIS MODOS — PR-OC-VENDA-ABAS-01. Sao chaveados por
     `ocOperacaoId`, que a hidratacao da venda ja seta: o que faltava era ligar. Sem
     `!isCenarioMeta` pelo mesmo motivo do `lotesApi` — em meta o shell da OC nao e'
     montado, entao os hooks nao tem consumidor. */
  /* ⚠ O CENARIO VIVE AQUI, e nao dentro do hook: os dois mundos do abate (projetado e
     realizado) sao a MESMA operacao vista de dois jeitos, e quem alterna e' a tela. */
  /* ⚠ NASCE EM 'realizado', o cenario DA OPERACAO — e nao ha o que derivar: `modoOCAbate`
     exige `!isCenarioMeta`, entao a OC de abate so' existe em realizado. Comecar em
     'projetado' abria o modal num cenario vazio e o operador via "a negociar" num lote
     que ele acabara de negociar. Ele continua podendo trocar pelo chip. */
  const [cenarioAbate, setCenarioAbate] = useState<'projetado' | 'realizado'>('realizado');
  /* ⚠ AS EDICOES DO ABATE VIVEM AQUI, EM MEMORIA — mesmo desenho do `boitelDaVenda`. A
     aba edita, o rodape persiste, e quem grava e' uma chamada so'. Guardar no hook faria
     o `recarregar` de qualquer motivo apagar o que o operador digitou e nao salvou. */
  const [abateLinhas, setAbateLinhas] = useState<Map<string, LinhaAbate>>(new Map());
  const abateApi = useOperacaoAbate({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    cenario: cenarioAbate,
    versao: ocVersao,
    onVersaoChange: setOcVersao,
    enabled: ocAbateParam,
  });
  const documentosApi = useOperacaoDocumentos({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    enabled: modoOCCompra || ocVendaParam || ocAbateParam,
  });
  const liquidacaoApi = useOperacaoLiquidacao({
    operacaoId: ocOperacaoId,
    clienteId: clienteAtual?.id ?? null,
    enabled: modoOCCompra || ocVendaParam || ocAbateParam,
  });
  /* Trilha de auditoria — mesma vizinhanca dos demais eixos da OC, uma api por aba.
     Nao recebe `clienteId`: a RLS de `zoo_operacao_eventos` ja recorta por tenant, e
     repassar o cliente aqui sugeriria um filtro que o hook nao faz. */
  const eventosApi = useOperacaoEventos({
    operacaoId: ocOperacaoId,
    enabled: modoOCCompra || ocVendaParam || ocAbateParam,
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
  /* ⚠ FAZENDA DA MORTE E' ESCOLHA, no mesmo desenho do Nascimento
     (PR-UI-NASCIMENTO-PARIDADE-03): nasce com a do contexto quando ha uma, em Global
     nasce vazia e a tela diz isso ANTES de tentar gravar. */
  const [morteFazendaId, setMorteFazendaId] = useState<string>('');
  /* ⚠ VALOR DA MORTE — campo NOVO na tela. Ate aqui `valor_total` da morte vinha do
     ramo generico de `valorTotalFinal` (`calc.valorLiquido`), e era isso que explicava
     894 das 1.678 mortes com valor gravado sem que existisse campo. Com o campo, a
     morte ganha ramo proprio no payload; sem ele o generico continuaria vencendo.
     NULL = nao informado, e nao zero. */
  const [valorMorte, setValorMorte] = useState<number | null>(null);

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
  /* ⚠ `tipoPeso` E' DO ABATE. Ate PR-ZOO-VENDA-DESATAR-TIPO-01 este mesmo estado
     carregava, na VENDA, o TIPO DE VENDA (desmama/gado_adulto/boitel) — e o payload
     fazia a troca na hora de gravar. O banco sempre esteve certo; o preco era que todo
     leitor precisava saber da inversao. Agora sao dois estados. */
  const [tipoPeso, setTipoPeso] = useState<TipoPesoAbate>('vivo');
  /* O TIPO DE VENDA, no seu proprio estado e com o seu proprio nome.
     ⚠ SEM UNIAO DE TIPO por enquanto: `lancamentos.tipo_venda` guarda tambem 'escala'
     em 89 abates, que e' modalidade comercial. Tipar exigiria juntar dois dominios —
     ver o comentario em types/cattle.ts e PR-ZOO-ABATE-MODALIDADE-COLUNA-01. */
  const [vendaTipoVenda, setVendaTipoVenda] = useState<string>('');
  const [vendaTipoPreco, setVendaTipoPreco] = useState<BasePrecoVenda>('por_kg');
  const [vendaPrecoInput, setVendaPrecoInput] = useState('');
  const [boitelDataForResumo, setBoitelDataForResumo] = useState<import('@/components/BoitelPlanningDialog').BoitelData | null>(null);
  /* PR-OC-VENDA-BOITEL-01B — o planejamento do boitel DA OC, em memoria.
     ⚠ ESTADO PROPRIO, e nao o `boitelDataForResumo` acima. Aquele e' do formulario
     antigo, que continua ao lado para conferencia; se os dois compartilhassem o objeto,
     editar na OC mexeria no que o formulario antigo mostra. */
  const [ocBoitel, setOcBoitel] = useState<BoitelEdicao | null>(null);
  /* PR-OC-VENDA-REALIZADO-02 — a linha `cenario='realizado'`, em memoria. `null` enquanto
     o abate nao aconteceu, e e' esse null que mantem o cartao tracejado. Estado SEPARADO
     do projetado de proposito: as duas linhas coexistem no banco (chave do upsert inclui
     `cenario`) e a existencia das duas E' o comparativo. */
  const [ocBoitelReal, setOcBoitelReal] = useState<BoitelEdicao | null>(null);
  /* PR-OC-VENDA-REABRIR-01E — A ASSINATURA DO QUE FOI GRAVADO NA ULTIMA VEZ.
     ⚠ O botao da venda ficava aceso para sempre: nao havia estado de sujo/pristino, entao
     "Salvar alteracoes" parecia prometer que havia algo a salvar mesmo logo depois de
     salvar. E' a mesma mentira do "Salvar e Gerar Financeiro" que ja corrigimos.
     ⚠ ASSINATURA DE CONTEUDO, e nao de identidade: `lotesApi.salvar` recarrega os lotes do
     banco e os objetos trocam de referencia com o mesmo conteudo. Comparar por JSON e' o
     que faz o botao apagar em vez de reacender sozinho no render seguinte.
     ⚠ `null` = NADA FOI SALVO NESTE MODAL AINDA, e ai o botao fica aceso — inclusive logo
     apos reabrir. E' o estado de hoje, e nao e' mentira: o operador ainda nao gravou nada
     nesta sessao. So' a gravacao bem-sucedida apaga o botao. */
  const [ocVendaAssinaturaSalva, setOcVendaAssinaturaSalva] = useState<string | null>(null);
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
        limparParamsOC();
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
        limparParamsOC();
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
  /* ⚠ E' PRECISO OLHAR O CENARIO, e nao so o parametro. `oc_venda=1` fica na URL e
     SOBREVIVE a troca de secao — quem abre a OC no realizado e navega para
     "Lançamentos META Zoo" sem fechar leva o parametro junto, e la a Venda abria a
     Operacao Comercial azul em vez do formulario de projecao.
     ⚠ A OPERACAO COMERCIAL SO' EXISTE EM REALIZADO. Uma projecao nao tem contraparte
     real, documento nem entrega; o caminho dela e' o VendaMetaModalShell.
     ⚠ A COMPRA NAO TINHA ESTE DEFEITO, e nao por cuidado: o ternario do container testa
     `isCompra && isCenarioMeta` ANTES de `isCompra`, entao a ordem a protegia. A venda
     entrou como primeiro ramo da cadeia e passou na frente do teste de cenario. */
  const modoOCVenda = ocVendaParam && !isCenarioMeta;
  /* ⚠ SO' EM REALIZADO, como a venda: uma projecao de abate nao tem frigorifico real,
     documento nem entrega — e a OC de abate exige contraparte. */
  const modoOCAbate = ocAbateParam && !isCenarioMeta;

  /* Hidratacao de operacao de VENDA existente a partir de ?oc_id — PR-OC-VENDA-REABRIR-01.
     ESPELHO do effect da compra logo acima: mesma guarda, mesmo ref-guard de uma execucao,
     mesmo reset preventivo, mesma validacao de pertencimento e de tipo, e o modal so' abre
     no fim.
     ⚠ ATE AQUI NAO HAVIA PORTA DE REABERTURA DE VENDA em lugar nenhum: a Central mandava
     tudo para o modal de compra e `oc_venda=1` so' sabia criar. E o modelo do produto
     DEPENDE de reabrir — o realizado do boitel nasce por reabertura no abate.
     ⚠ O REF-GUARD E COMPARTILHADO com a compra (`ocHidratadoRef`), e pode ser: os dois
     booleanos nunca coexistem, entao no maximo um dos dois effects roda por abertura. */
  useEffect(() => {
    if (!modoOCVenda || !ocIdParam || !clienteAtual?.id) return;
    if (ocHidratadoRef.current) return;
    ocHidratadoRef.current = true;
    let cancelado = false;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    (async () => {
      resetContextoVendaOC();
      if (!UUID_RE.test(ocIdParam)) {
        setOcHidratacaoErro('Identificador de operação malformado.');
        toast.error('Identificador de operação malformado.');
        limparParamsOC();
        return;
      }
      setOcHidratando(true);
      try {
        const estado = await ocRpc.carregarOperacao(ocIdParam, clienteAtual.id);
        if (cancelado) return;
        if (!estado) throw new Error('Operação não encontrada ou inacessível a este cliente.');
        const op = estado.operacao;
        if (op.tipo_operacao !== 'venda') throw new Error('Esta operação não é uma Venda e não pode ser aberta aqui.');

        setData(op.data_operacao ?? format(new Date(), 'yyyy-MM-dd'));
        setVendaDestinoFornecedorId(op.contraparte_id ?? '');
        setVendaFazendaId(op.fazenda_id ?? '');
        setObservacao(op.observacoes ?? '');
        setNotaFiscal(op.numero_documento ?? '');
        setStatusOp(op.cenario === 'meta' ? 'meta' : 'realizado');
        setOcOperacaoId(op.id);
        setOcVersao(op.versao);
        setOcStatusComercial(op.status_comercial);
        setOcEntregaEncerrada(!!op.entrega_encerrada);
        setOcRascunho(op.rascunho);
        setOcAberturaExistente(true);

        /* ⚠ O TIPO DE VENDA VEM DA EXISTENCIA DO PLANEJAMENTO, e nao de uma coluna: a OC
           nao guarda `tipo_venda` (conferido nas 53 colunas em PR-OC-VENDA-BOITEL-RPC-01).
           Uma venda E' boitel se e somente se tem linha em `zoo_operacao_boitel`.
           ⚠ LEITURA POR PostgREST, e nao por RPC: a tabela tem policy de SELECT e a
           leitura funciona. A ESCRITA continua exclusiva de `oc_salvar_boitel`.
           ⚠ 'projetado': o realizado nasce no abate e e' outra linha. */
        const { data: linhaBoitel } = await (supabase as any)
          .from('zoo_operacao_boitel').select('*')
          .eq('operacao_id', op.id).eq('cenario', 'projetado').maybeSingle();
        if (cancelado) return;
        const bd = boitelDeLinha(linhaBoitel);
        /* ⚠ VENDA COMUM REABRE SEM TIPO, e isso e' honestidade, nao esquecimento: a OC
           nao guarda `tipo_venda`, entao escolher um por ela seria inventar dado. O botao
           dira' "Informe comprador, data, fazenda e tipo de venda" ate' o operador marcar.
           Ver PR-OC-VENDA-TIPO-NA-OC-01, registrado. */
        if (bd) { setVendaTipoVenda('boitel'); setOcBoitel(bd); }
        else { setVendaTipoVenda(''); setOcBoitel(null); }

        /* ⚠ A SEGUNDA LINHA, quando existir — PR-OC-VENDA-REALIZADO-02. Mesma leitura por
           PostgREST do projetado; `maybeSingle` porque ela e' opcional por natureza. */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
        const { data: linhaReal } = await (supabase as any)
          .from('zoo_operacao_boitel').select('*')
          .eq('operacao_id', op.id).eq('cenario', 'realizado').maybeSingle();
        if (cancelado) return;
        setOcBoitelReal(boitelDeLinha(linhaReal));

        setTipo('venda');
        setLancModalOpen(true);
      } catch (e) {
        if (cancelado) return;
        resetContextoVendaOC();
        const msg = e instanceof Error ? e.message : 'Falha ao abrir a operação.';
        setOcHidratacaoErro(msg);
        toast.error(msg);
        limparParamsOC();
      } finally {
        if (!cancelado) setOcHidratando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoOCVenda, ocIdParam, clienteAtual?.id]);

  /* ⚠ CENARIO, NAO TIPO. Realizado e programado registram um fato economico e exigem o
     detalhe financeiro; meta e' projecao e nao exige. Nomeada porque a mesma pergunta
     e' feita em dois pontos do funil da compra, e eles se contradiziam. */
  const exigeDetalheFinanceiro = statusOp === 'programado' || statusOp === 'realizado';
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
  const isMorte = tipo === 'morte';
  const isCompra = tipo === 'compra';
  const isVenda = tipo === 'venda';
  const isConsumo = tipo === 'consumo';

  /* ── A VENDA EM META NO ENVELOPE (PR-ZOO-VENDA-META-01) ──────────────────────
     ⚠ PREDICADO, E NAO LISTA. A pergunta tem TRES dimensoes — tipo, cenario e subtipo —
     e uma lista de tipos so' responde a primeira: ela nao consegue excluir o boitel nem
     distinguir meta de realizado. Uma segunda lista seria um nome sem funcao.
     ⚠ FALSO PARA A VENDA REALIZADA em qualquer caso, e falso para boitel em qualquer
     cenario. E' isso que mantem os dois intocados. */
  const vendaMetaNoEnvelope = isVenda && isCenarioMeta && vendaTipoVenda !== 'boitel';

  /* ⚠ UMA FONTE PARA O ROTEAMENTO E PARA A LARGURA DO MODAL. Ate aqui o container e o
     `className` do DialogContent eram DUAS expressoes independentes que concordavam por
     acaso — e foi a discordancia entre elas que fez o rodape da Morte rolar em
     PR-ZOO-FIX-MORTE-GUARDA-GLOBAL-01: o tipo estava numa e faltava na outra. Com o
     mesmo predicado nos dois, nao ha como discordarem. */
  /* ⚠ A VENDA COMO OC E' O UNICO MODAL LARGO — PR-OC-VENDA-LAYOUT-NEG-01B. Predicado
     PROPRIO, e nao um `||` reaproveitado, porque ele responde outra pergunta: o
     `usaEnvelopeProprio` diz QUE ENVELOPE usar (padding, gap, botao de fechar), e este diz
     QUE LARGURA. Compartilhar um so' faria a compra herdar a largura da venda no primeiro
     ajuste de qualquer um dos dois. */
  const vendaOCNoEnvelope = isVenda && modoOCVenda;
  /* ⚠ O ABATE ESTAVA NO ENVELOPE ERRADO, e era a causa do rodape que rolava. Ele nao esta'
     em `TIPOS_NO_ENVELOPE_PROPRIO` (compra, nascimento, morte), entao caia no ramo de baixo
     — `overflow-y-auto p-4` —, e o proprio comentario daquele ramo ja' avisava: com ele o
     modal inteiro vira uma area de rolagem so' e o rodape desce junto com o conteudo.
     ⚠ PREDICADO, como o da venda, e nao uma quarta entrada na lista: `tipo === 'abate'`
     sozinho arrastaria o `AbateDetalhesDialog` legado — os 829 abates historicos — para um
     envelope sem padding e sem botao de fechar, e ele nao tem cabecalho proprio. */
  const abateOCNoEnvelope = isAbate && modoOCAbate;
  const usaEnvelopeProprio = TIPOS_NO_ENVELOPE_PROPRIO.includes(tipo) || vendaMetaNoEnvelope || vendaOCNoEnvelope || abateOCNoEnvelope;
  /** Quem escolhe a propria fazenda — governa os cinco pontos: a guarda de Global, os
   *  dois escritores de texto, o `fazendaId` do payload e a confirmacao. */
  const escolheFazenda = TIPOS_COM_SELETOR_DE_FAZENDA.includes(tipo) || vendaMetaNoEnvelope;

  const isTransferencia = tipo === 'transferencia_entrada' || tipo === 'transferencia_saida';
  const isTransferenciaSaida = tipo === 'transferencia_saida';

  /* ── FAZENDA DA MORTE (PR-ZOO-MORTE-NO-SHELL-01) ─────────────────────────────
     Mesmo desenho do Nascimento acima, e pelo mesmo motivo: sem seletor, em Global o
     lancamento era recusado sem que a tela dissesse nada. */
  useEffect(() => {
    if (!isMorte) return;
    setMorteFazendaId(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : '');
  }, [isMorte, fazendaAtual?.id]);
  const morteFazendaNome = fazendasOC.find(f => f.id === morteFazendaId)?.nome ?? null;
  /* ── FAZENDA DA COMPRA EM META (PR-ZOO-META-COMPRA-FAZENDA-01) ───────────────
     Mesmo desenho do Nascimento e da Morte. A compra nunca teve seletor — origem e'
     texto livre e destino era heranca silenciosa do contexto —, e isso a deixava
     inlancavel em Global enquanto os outros dois ja podiam. */
  const [compraFazendaId, setCompraFazendaId] = useState<string>('');
  /* Fazenda da venda em META. ⚠ Na venda a fazenda e' ORIGEM — o gado SAI dela. */
  const [vendaFazendaId, setVendaFazendaId] = useState<string>('');
  /* Propriedade de destino da venda na OC — texto livre, a propriedade de quem compra. */
  const [vendaPropriedadeDestino, setVendaPropriedadeDestino] = useState<string>('');

  /* ─── A IDENTIFICACAO DO ABATE NA OC — OC-ABATE-01 T1 ────────────────────────
     Quatro estados proprios, e nao reuso dos da venda: um abate e uma venda podem
     estar abertos em momentos diferentes, e compartilhar o campo faria o valor de
     um aparecer no formulario do outro.
     ⚠ O FRIGORIFICO E OBRIGATORIO (decisao do ENVELOPE 66). Nao e' capricho de
     formulario: medido em 04/09/2026, 84% dos 829 abates legados nao tem contraparte
     nenhuma e os 16% restantes a tem como texto livre. A OC exige o vinculo real. */
  const [abateFrigorificoId, setAbateFrigorificoId] = useState<string>('');
  /* ⚠ ORIGEM, como na venda: o gado SAI da fazenda para o frigorifico. */
  const [abateFazendaId, setAbateFazendaId] = useState<string>('');
  /* ⚠ SEMEIA A FAZENDA SO' NUMA VENDA NOVA — PR-OC-VENDA-REABRIR-01E. Ele existe para
     poupar um clique: com uma fazenda no filtro, a venda ja' nasce com ela.
     Numa REABERTURA ele apagava o que o banco tinha: a hidratacao faz
     `setVendaFazendaId(op.fazenda_id)` e, na ultima linha, `setTipo('venda')` — que vira
     `isVenda` de falso para verdadeiro e DISPARA este efeito, sobrescrevendo. Com o filtro
     em Global o valor semeado e' string vazia, e o campo aparecia pedindo selecao apesar de
     a operacao ter fazenda gravada.
     ⚠ A COMPRA NAO TINHA O DEFEITO por acidente de nomes: a OC dela guarda a fazenda em
     `ocFazendaDestinoId`, outro estado, enquanto a venda usa `vendaFazendaId` para a meta E
     para a OC. */
  useEffect(() => {
    if (!isVenda || ocAberturaExistente) return;
    setVendaFazendaId(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : '');
  }, [isVenda, ocAberturaExistente, fazendaAtual?.id]);
  useEffect(() => {
    if (!isCompra) return;
    setCompraFazendaId(fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : '');
  }, [isCompra, fazendaAtual?.id]);
  const compraFazendaNome = fazendasOC.find(f => f.id === compraFazendaId)?.nome ?? null;
  const vendaFazendaNome = fazendasOC.find(f => f.id === vendaFazendaId)?.nome ?? null;
  const vendaFazendaFalta = vendaMetaNoEnvelope && !vendaFazendaId;
  /* ⚠ O SENTINEL SERVE A VENDA IGUAL. '[META] Planejamento' e' a contraparte de
     PROJECAO — nao importa se ela compra ou vende. So' preenche se o campo estiver
     vazio, e nunca cria cadastro pelo front. */
  useEffect(() => {
    if (!vendaMetaNoEnvelope || vendaDestinoFornecedorId) return;
    const sentinel = abateFornecedores.find(f => f.nome === SENTINEL_META_NOME);
    if (sentinel) setVendaDestinoFornecedorId(sentinel.id);
  }, [vendaMetaNoEnvelope, vendaDestinoFornecedorId, abateFornecedores]);
  const compraFazendaFalta = isCompra && isCenarioMeta && !compraFazendaId;

  /* ⚠ FORNECEDOR DA COMPRA EM META — abre com o sentinel do cliente e continua editavel.
     Uma projecao nao tem fornecedor real, e o fluxo antigo resolvia CRIANDO um cadastro
     novo a cada vez: sao 30 registros chamados "Meta" espalhados pelos clientes. O
     sentinel '[META] Planejamento' (PR-ZOO-META-FORNECEDOR-SENTINEL-01) e' um so' por
     cliente e distinguivel dos antigos.
     ⚠ SO' PREENCHE SE O CAMPO ESTIVER VAZIO — nunca sobrescreve escolha do operador.
     ⚠ CLIENTE SEM SENTINEL NAO GANHA UM PELO FRONT: o efeito nao faz nada e o campo
     fica vazio, com a guarda do funil pedindo o fornecedor. Criar cadastro pela tela e'
     o que produziu os 30. */
  const SENTINEL_META_NOME = '[META] Planejamento';
  useEffect(() => {
    if (!isCompra || !isCenarioMeta || compraFornecedorId) return;
    const sentinel = abateFornecedores.find(f => f.nome === SENTINEL_META_NOME);
    if (sentinel) setCompraFornecedorId(sentinel.id);
  }, [isCompra, isCenarioMeta, compraFornecedorId, abateFornecedores]);
  /* ⚠ A FAZENDA ESCOLHIDA, num lugar so'. O modal ja lia de uma fonte por tipo — o
     cabecalho, a faixa de topo, o seletor e o resumo lateral usam todos o mesmo
     `nascFazendaNome`/`morteFazendaNome`. Quem estava fora era a CONFIRMACAO, que
     perguntava `isNascimento ?` e por isso nao mostrava fazenda nenhuma na morte:
     ela caia no ramo `campos.destino`, que para a morte e' `{show:false}`.
     ⚠ A entrada e' governada por TIPOS_COM_SELETOR_DE_FAZENDA — "tem fazenda propria a
     exibir" e "escolhe a propria fazenda" sao a mesma coisa, entao nao ha lista nova.
     ⚠ O payload (`fazendaId`, ~2417) mantem a sua propria cadeia. Ela e' caminho de
     ESCRITA e este PR e' de exibicao; unifica-las e' barato e fica anotado. */
  /* ⚠ UMA CADEIA SO'. Havia DUAS listas de ternarios dizendo a mesma coisa — uma para o
     nome (exibicao) e outra para o id (payload, `fazendaId:`) — e cada tipo novo obrigava
     a lembrar das duas. Agora o id e' a fonte e o nome deriva dele; um tipo que entre em
     TIPOS_COM_SELETOR_DE_FAZENDA precisa de UMA linha aqui, e o resto acompanha. */
  const fazendaEscolhidaId = escolheFazenda
    ? (isNascimento ? nascFazendaId : isMorte ? morteFazendaId
       : isVenda ? vendaFazendaId : compraFazendaId)
    : '';
  const fazendaEscolhidaNome = fazendasOC.find(f => f.id === fazendaEscolhidaId)?.nome ?? null;
  const morteFazendaFalta = isMorte && !morteFazendaId;
  const morteQtd = parseNumericValue(quantidade) || 0;
  const mortePeso = parseDecimalInput(pesoKg) ?? 0;

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

  /* Restaura o contexto do modal — statusOp/tipo/aba/filtros como estavam na abertura,
     sobrescrevendo os defaults do reset. SEMPRE chamado APOS o reset de campos.
     ⚠ NAO devolve o usuario a outra secao: quem faz isso e' `restoreEditOrigin`. */
  const restaurarContextoDoModal = useCallback(() => {
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
  }, []);

  /* Fim de uma EDICAO: restaura o contexto E devolve o usuario a secao de onde a edicao
     partiu (`onReturnFromEdit`, que no realizado leva a Conferencia).
     ⚠ SO NO RAMO DE EDICAO. Ate PR-ZOO-FIX-RETORNO-APOS-REGISTRAR-01 esta funcao era
     chamada tambem no fim de um REGISTRO NOVO, e ai' quem abria por "Lançar > Pecuária"
     caia na lista a cada lancamento. Eram dois eventos diferentes tratados como um so —
     "voltei de uma edicao externa" e "acabei de registrar" — e o proprio nome denunciava,
     porque fala de edit origin e rodava no fim de um registro.
     A rota de META ja acertava, mas por ACIDENTE: ela nao passa `onReturnFromEdit`, entao
     a chamada era no-op. Agora o realizado faz o mesmo por decisao. */
  const restoreEditOrigin = useCallback(() => {
    restaurarContextoDoModal();
    onReturnFromEdit?.();
  }, [restaurarContextoDoModal, onReturnFromEdit]);

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
      setTipoPeso(snap.tipoPeso === 'morto' ? 'morto' : 'vivo');
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
      setTipoPeso(l.tipoPeso === 'morto' ? 'morto' : 'vivo');
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
      setVendaTipoVenda('boitel');
      // Store snapshot boitelData for rehydration via initialBoitelData prop
      if (vendaSnap.boitelSnapshot) {
        setBoitelDataForResumo(vendaSnap.boitelSnapshot as any);
      }
      console.log('[Venda Edit] Rehydrating Boitel from snapshot', vendaSnap);
    } else if (vendaSnap && vendaSnap.type === 'venda') {
      const tv = vendaSnap.tipoVenda || l.tipoVenda || 'gado_adulto';
      setVendaTipoVenda(tv);

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
      setVendaTipoVenda(tv);

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

  /* PR-OC-FIX-VENDA-NOVA-HERDA-ESTADO-01 — IRMA de `resetContextoOC`.
     ⚠ O DEFEITO ERA UMA LINHA: a venda caia no `else` do efeito abaixo, que zerava so'
     `ocOperacaoId` e `ocVersao`. Todo o resto sobrevivia, e uma venda NOVA nascia com o
     comprador, o tipo e os quatro blocos do boitel da anterior. Chegou ao banco: duas OCs
     de venda nasceram com a contraparte herdada.
     ⚠ O `ocOperacaoId` NUNCA sobreviveu — o `else` ja o zerava —, e por isso nenhuma
     operacao foi gravada por cima de outra. Conferido no banco: a OC editada antes ficou
     com `versao 1` e `updated_at` igual ao `created_at`.
     ⚠ `setOcBoitel(null)` COBRE OS 37 CAMPOS DO BOITEL de uma vez, e cobrira' os que
     vierem: ele e' um objeto so'. E' a unica peca desta funcao que se corrige sozinha.
     Os quatro campos soltos da venda sao divida declarada — ver
     PR-OC-ESTADO-DA-OPERACAO-01, que poe o estado da OC num objeto tipado e faz o
     COMPILADOR exigir o valor inicial de todo campo novo.
     ⚠ `key` para forcar remontagem NAO serve aqui: este estado mora no `LancamentosTab`,
     e remonta-lo derrubaria a tela inteira junto. */
  const resetContextoVendaOC = useCallback(() => {
    // A ponte OC — os mesmos quatro da compra.
    setOcOperacaoId(null); setOcVersao(null); setOcStatusComercial(null); setOcEntregaEncerrada(false);
    // Os compartilhados que a compra ja' zerava e a venda nao.
    setData(format(new Date(), 'yyyy-MM-dd')); setObservacao(''); setNotaFiscal('');
    setStatusOp('realizado'); setFazendaOrigem('');
    // Os quatro proprios da venda.
    setVendaDestinoFornecedorId(''); setVendaTipoVenda('');
    setVendaFazendaId(''); setVendaPropriedadeDestino('');
    // O planejamento do boitel, inteiro, num setter so'.
    setOcBoitel(null);
    setOcBoitelReal(null);
    // As flags da OC — mesmas quatro da compra.
    setOcAberturaExistente(false); setOcTemTitulo(false); setOcRascunho(false); setOcHidratacaoErro(null);
  }, []);

  // Validate form and open confirmation dialog
  // Reset da ponte OC ao fechar o modal (higiene de estado).
  useEffect(() => {
    if (!lancModalOpen) {
      // Modo OC: reset completo (evita vazamento de estado entre operações A→B). Legado: só a ponte OC.
      if (modoOCCompra) resetContextoOC();
      else if (modoOCVenda) resetContextoVendaOC();
      else { setOcOperacaoId(null); setOcVersao(null); }
    }
  }, [lancModalOpen, modoOCCompra, modoOCVenda, resetContextoOC, resetContextoVendaOC]);

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
  /* ⚠ A VENDA USA O MESMO FECHO — PR-OC-VENDA-REABRIR-01E. `onFecharOperacaoOC` e' o
     `fecharOperacaoOC` do V2Index: apaga os cinco parametros e devolve a secao de origem.
     Sem ele, fechar a venda largava o usuario em Lancamentos com `oc_venda=1&oc_id=...`
     presos — e a Central seguinte abria ja' com o modal por cima da lista, porque os
     parametros continuavam mandando abrir. Um fecho, nao dois. */
  const fecharModalOC = useCallback(() => {
    setLancModalOpen(false);
    if (modoOCCompra || modoOCVenda) onFecharOperacaoOC?.();
  }, [modoOCCompra, modoOCVenda, onFecharOperacaoOC]);


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

  /* PR-OC-VENDA-ABA-01 — a venda na OC. Nao reusa `salvarOperacaoOC` porque aquele crava
     `tipo_operacao: 'compra'` e monta o payload com campos da compra; parametriza-lo
     tocaria o caminho da compra, que este PR nao pode tocar.
     ⚠ SEM `modalidade_comercial`: medido que os 89 registros com escala/a_termo/spot sao
     TODOS abate, e nenhuma venda tem modalidade. A coluna nasceu para o abate. */
  /* PR-OC-VENDA-BOITEL-CABECAS-DOS-LOTES-01 — O BOITEL LE OS LOTES, e nao os campos da
     venda. Antes era `boitelVazio(parseNumericValue(quantidade), parseNumericValue(pesoKg))`,
     que sao os campos do formulario simples: numa OC eles ficam vazios, e o modal abria com
     "cabeças —" enquanto o lote tinha 110. A diaria saia zero (`0 cab. x 110 dias x 18,85`)
     e o custo total, errado.
     ⚠ DERIVADOS A CADA RENDER, e NAO semeados uma vez. Semear corrigiria so' a primeira
     abertura: na primeira tecla `ocBoitel` deixa de ser nulo, `boitelVazio` nunca mais e'
     chamado, e o zero congelaria. Cabeças e peso nao sao digitados em lugar nenhum — nao
     pertencem ao estado editavel.
     ⚠ MEDIA PONDERADA, e nao media das medias: `totais.pesoTotal` ja e' a soma de
     `quantidade x pesoMedio` de cada lote, entao dividir por `animais` da o peso medio real
     do embarque. Com um lote de 100 cab a 400 kg e outro de 10 a 200 kg, da 381,8 kg — e
     nao 300, que e' o que a media das medias daria.
     ⚠ A DIVISAO NAO E ESCRITA AQUI: `pesoMedioPorCabeca` ja existe em `useCompraLotes`, e
     o comentario dela diz por que — "em vez de repetir a divisao nos dois lugares, que e'
     exatamente como dois numeros para a mesma pergunta comecam a divergir". Esta era a
     terceira copia. O `?? 0` traduz o sentinela: a funcao devolve `null` quando nao ha
     denominador, porque a aba imprime "—"; aqui o zero e' o que faz o painel dizer, em
     ambar, que falta o lote.
     ⚠ O NUMERO POR CABECA E MEDIA DO EMBARQUE, e nao descreve nenhum animal: com lotes de
     pesos muito diferentes, "arrobas produzidas por cabeça" e' media ponderada. E' inerente
     a haver UM planejamento por operacao, que e' o modelo fixado pela `zoo_operacao_boitel`
     (uma linha por cenario, nao uma por lote). Quem ler este numero precisa saber disso.
     ⚠ `qtdCabecas` NAO VAI NO PAYLOAD: a OC ja o guarda em `qtd_negociada`, escrito pelo
     proprio `oc_salvar_lotes`. Uma fonte, sem copia. So' o peso desce, como
     `peso_saida_fazenda_kg`. */
  const boitelDaVenda = useMemo<BoitelEdicao | null>(() => {
    if (vendaTipoVenda !== 'boitel') return null;
    return {
      ...(ocBoitel ?? boitelVazio()),
      qtdCabecas: lotesApi.totais.animais,
      pesoInicial: pesoMedioPorCabeca(lotesApi.totais) ?? 0,
    };
  }, [vendaTipoVenda, ocBoitel, lotesApi.totais]);

  /* ⚠ O REALIZADO PRECISA DO MESMO ENXERTO — B-05, achado A. `boitelDeLinha` devolve a
     linha SEM cabecas e SEM peso (a propria funcao avisa: "sao sobrescritos pelos lotes
     depois disto"), e ate' aqui so' a PROJECAO recebia o enxerto. O `ocBoitelReal`
     hidratado do banco ia cru para a tela, com `qtdCabecas` em ZERO.
     ⚠ O ESTRAGO ERA MUITO MAIOR QUE OS DOIS CAMPOS QUE O DENUNCIARAM. Com zero cabecas,
     `sairam` e' zero, e no motor TUDO que multiplica por `sairam` colapsa: arrobas de
     saida, faturamento, diarias derivadas. So' os FATOS CRUS sobreviviam — dias e o total
     das diarias, que nao passam por `sairam`. Era exatamente a assimetria do print: 104
     dias e 214.590,48 firmes, peso e arrobas em zero.
     ⚠ E 02G TROCOU "MOSTRA ZERO" POR "DESCARTA O FATO": a guarda `sairam > 0` dos dois
     novos campos os fazia cair no derivado quando as cabecas sumiam. O dado ESTAVA no
     banco o tempo todo (medido: 62.075,5 kg e 2.251,67 @ gravados) — quem o perdia era o
     caminho da tela.
     ⚠ MEMO E NAO SEMEADURA NO `set`: gravar as cabecas dentro do `setOcBoitelReal` da
     hidratacao congelaria o valor da primeira leitura, e um lote editado depois nao
     chegaria ao realizado. E' a mesma razao que `boitelVazio` documenta para nao semear
     cabecas la'. */
  const boitelRealDaVenda = useMemo<BoitelEdicao | null>(() => {
    if (vendaTipoVenda !== 'boitel' || !ocBoitelReal) return null;
    return {
      ...ocBoitelReal,
      qtdCabecas: lotesApi.totais.animais,
      pesoInicial: pesoMedioPorCabeca(lotesApi.totais) ?? 0,
    };
  }, [vendaTipoVenda, ocBoitelReal, lotesApi.totais]);

  /* A assinatura do que esta' na tela AGORA. Recalculada a cada render de proposito — sao
     dois JSON pequenos, e memorizar traria o risco de dependencia esquecida, caro justamente
     aqui, onde errar significa o botao mentir num dos dois sentidos. */
  const ocVendaAssinaturaAtual = JSON.stringify({
    comprador: vendaDestinoFornecedorId, data, fazenda: vendaFazendaId,
    tipo: vendaTipoVenda, destino: vendaPropriedadeDestino,
    observacao, notaFiscal,
    lotes: lotesApi.lotes.map(l => [l.ordem, l.categoria, l.quantidade, l.pesoMedioKg, l.criterioValor, l.valorInformado]),
    boitel: ocBoitel ? payloadBoitel(ocBoitel) : null,
  });
  const ocVendaSemAlteracoes = ocVendaAssinaturaSalva !== null && ocVendaAssinaturaSalva === ocVendaAssinaturaAtual;

  /* ═══ O REALIZADO DO ABATE ════════════════════════════════════════════════════
     PR-OC-VENDA-REALIZADO-02.

     ⚠ NASCE SABENDO DO GUARD. `oc_salvar_boitel` recusa operacao `fechada` DE PROPOSITO —
     o fluxo oficial e' reabrir, lancar, concluir, e a reabertura e' o gesto que registra
     que os numeros mudaram. Por isso a reabertura acontece ANTES de o dialogo abrir: quem
     preenche sete campos e leva erro no fim perde o trabalho e a confianca.
     ⚠ A LINHA REALIZADA NASCE COPIANDO A PROJECAO, e nao vazia: o operador veio conferir
     o que mudou, nao redigitar dias, rendimentos e precos que continuam valendo. O que
     ele nao tocar fica igual ao previsto — e o "previsto: X" sob cada campo mostra de
     onde cada numero veio. */
  const iniciarRealizadoBoitel = async (): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!clienteId || !ocOperacaoId) { toast.error('Salve a venda antes de lançar o realizado.'); return false; }
    if (ocStatusComercial === 'cancelada') { toast.error('Operação cancelada não aceita lançamento.'); return false; }
    try {
      if (ocStatusComercial === 'fechada') {
        const env = await ocRpc.reabrir(ocOperacaoId, clienteId, ocVersao, 'reaberta para lançar o realizado do abate');
        setOcVersao(env.versao);
        if (env.status_comercial) setOcStatusComercial(env.status_comercial);
        toast.info('Operação reaberta para o lançamento do realizado.');
      }
      if (!ocBoitelReal && boitelDaVenda) setOcBoitelReal({ ...boitelDaVenda });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível reabrir a operação.');
      return false;
    }
  };

  /* ⚠ DUAS ESCRITAS ENCADEADAS PELOS RETORNOS, e nunca pelo `ocVersao` do render: cada
     RPC incrementa a versao, e reusar a do state faria a segunda falhar com 40001.
     ⚠ A ORDEM IMPORTA: grava o boitel primeiro (e' ele que define o liquido real) e so'
     entao revalora o lote com esse liquido. O inverso revaloraria pelo numero velho.
     ⚠ `oc_revalorar_lote` CORRIGE O REBANHO JUNTO — foi a metade que a FASE 0 achou
     faltando: `oc_salvar_lotes` revaloraria o lote e deixaria o lancamento zootecnico com
     o valor da projecao.
     ⚠ FALHA NO MEIO NAO FAZ ROLLBACK: cada RPC e' sua propria transacao. O boitel gravado
     sem o lote revalorado e' estado VISIVEL (o cartao Realizado preenchido, o lote com o
     valor antigo), e o operador refaz — desfazer em silencio apagaria o que ele digitou. */
  const aplicarRealizadoBoitel = async (proximo: BoitelEdicao) => {
    const clienteId = clienteAtual?.id;
    if (!clienteId || !ocOperacaoId) return;
    setOcBoitelReal(proximo);
    try {
      let v = ocVersao;
      const envB = await ocRpc.salvarBoitel(ocOperacaoId, clienteId, v, 'realizado', payloadBoitel(proximo));
      v = envB.versao;
      setOcVersao(v);

      /* ⚠ A DOUTRINA DOS DOIS MUNDOS, O LADO QUE ESCREVE — B-04 (o outro lado esta' em
         `bolsoDaVendaBoitel`). Esta chamada grava o liquido REAL em
         `zoo_operacao_lotes.valor_informado`, e e' ela que torna aquele slot
         REALIZADO-SOBERANO. Isso e' DESEJADO e foi decidido pelo Gabriel em 858ee073: o
         valor oficial da operacao passa a ser o do abate, e o rebanho se corrige sozinho.
         O card do lote e o resumo lateral leem esse slot e mostram o real — certo.
         ⚠ E POR ISSO A PROJECAO NAO PODE LER DAQUI. O lote e' UM SO' para os dois
         cenarios (`zoo_operacao_lotes` nao tem coluna de cenario, medido), entao esta
         escrita apaga a promessa do slot dela. A promessa nao se guarda em segundo lugar
         — ela se DERIVA da linha `projetado`, que esta escrita e intacta. Enquanto o topo
         ambar lia este slot, um rascunho de realizado fazia a tela anunciar 595.071,81
         como projecao; corrigido em B-04 mudando o ENDERECO DE LEITURA, nao esta escrita.
         ⚠ NENHUM CAMPO DA LINHA REALIZADO ENTRA EM CONTA DE PROJECAO: a projecao e'
         historica e imutavel depois do abate — o realizado compara COM ela, nunca a
         reescreve. */
      const liquidoReal = liquidoDaVendaBoitel(proximo);
      const loteId = lotesApi.lotes[0]?.id;
      if (liquidoReal != null && liquidoReal > 0 && loteId) {
        const envL = await ocRpc.revalorarLote(ocOperacaoId, clienteId, v, loteId, liquidoReal,
          'realizado do abate');
        v = envL.operacao_versao;
        setOcVersao(v);
        /* ⚠ O ESTADO LOCAL DOS LOTES FICOU VELHO — B-12. `oc_revalorar_lote` gravou o valor
           real DIRETO no banco, por fora do `useCompraLotes`; sem reler, o proximo "Salvar
           negociacao" mandaria de volta o valor que a tela ainda tem em memoria — que e' o
           projetado. Era metade da regressao que o produtor pegou em 31/08.
           ⚠ A OUTRA METADE E A MURALHA, e ela nao depende deste await: `oc_salvar_lotes`
           passou a RECUSAR o rebaixamento quando ha realizado completo (migration
           20260831140238). Esta linha conserta o fluxo feliz — estado fresco na tela —, e a
           RPC protege o caso da tela aberta ANTES do abate, que nenhuma releitura alcanca.
           ⚠ ANTES do `onRealizadoAplicado`: aquele invalida o cache zootecnico e pode
           disparar re-render; chegar la' com os lotes ja frescos evita a tela mostrar por um
           instante o valor velho ao lado do novo. */
        await lotesApi.recarregar();
        /* ⚠ O CACHE ZOOTECNICO PRECISA SABER. `oc_revalorar_lote` corrige
           `lancamentos.valor_total` no BANCO, fora do `useLancamentos` — sem invalidar, a
           tela seguiria com o retrato antigo, que e' pior que dado errado nos dois lados.
           A prop vem do dono do hook; decidir as chaves aqui seria a segunda copia da
           lista. Nao ha rebuild manual: o trigger do banco cuida da derivacao. */
        await onRealizadoAplicado?.();
        toast.success(envL.lancamentos_afetados > 0
          ? `Realizado lançado. Lote revalorado e ${envL.lancamentos_afetados} lançamento${envL.lancamentos_afetados > 1 ? 's' : ''} do rebanho corrigido${envL.lancamentos_afetados > 1 ? 's' : ''}.`
          : 'Realizado lançado. Lote revalorado.');
      } else {
        toast.success('Realizado do abate lançado.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao lançar o realizado.');
    }
  };

  /* ─── A OPERACAO DE ABATE — OC-ABATE-01 T1 ───────────────────────────────────
     Clone do `salvarOperacaoVendaOC` com tres diferencas, e so' tres:
       · `tipo_operacao: 'abate'` — o CHECK da tabela ja o aceita (conferido no banco);
       · o frigorifico e' OBRIGATORIO, e a recusa acontece AQUI, antes de ir ao servidor:
         a OC exige `contraparte_id` e uma ida para receber "nao" e' ida perdida;
       · o vocabulario das mensagens e' o do abate.
     ⚠ NAO REUSA O DA VENDA. Poderia parametrizar o tipo, mas os dois leem estados
     diferentes (`abateFrigorificoId` x `vendaDestinoFornecedorId`) e um abate e uma venda
     podem estar abertos em momentos diferentes — parametrizar faria um ler o campo do
     outro. A duplicacao aqui e' de vinte linhas; o vazamento seria de dado. */
  const salvarOperacaoAbateOC = async (): Promise<{ operacaoId: string; versao: number } | null> => {
    const clienteId = clienteAtual?.id;
    if (!clienteId) { toast.error('Cliente não selecionado.'); return null; }
    if (!abateFazendaId) { toast.error('Selecione a fazenda de origem.'); return null; }
    if (!abateFrigorificoId) { toast.error('Selecione o frigorífico — a operação de abate exige a contraparte.'); return null; }
    const criando = !ocOperacaoId;
    setSubmitting(true);
    try {
      const env = await ocRpc.salvarRascunho(ocOperacaoId, clienteId, ocVersao, {
        tipo_operacao: 'abate',
        data_operacao: data,
        cenario: isCenarioMeta ? 'meta' : 'realizado',
        fazenda_id: abateFazendaId,
        contraparte_id: abateFrigorificoId,
        numero_documento: notaFiscal || null,
        observacoes: observacao || null,
        movimentacoes: [],
        partes: [],
      });
      setOcOperacaoId(env.operacao_id);
      setOcVersao(env.versao);
      if (env.status_comercial) setOcStatusComercial(env.status_comercial);
      if (criando) toast.success('Operação de abate criada. Agora informe os lotes abatidos.');
      return { operacaoId: env.operacao_id, versao: env.versao };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a operação de abate.');
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  /* A negociacao do abate grava LOTES, como a da compra. O detalhe por lote
     (carcaca, rendimento, preco da @) entra no commit seguinte, pela `oc_salvar_abate`.
     ⚠ A RECUSA DE "FECHADA" ACONTECE NA TELA, sem ida ao servidor — mesmo desenho da
     venda: o estado ja esta' aqui e a mensagem aponta o botao que resolve. */
  const salvarNegociacaoAbateOC = async (): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId) { toast.error('Salve a operação na aba Abate primeiro.'); return false; }
    if (ocStatusComercial === 'fechada') {
      toast.error('Operação fechada. Reabra a negociação para editar — o botão está aqui no rodapé.');
      return false;
    }
    /* ⚠ `salvar` DEVOLVE A VERSAO NOVA, nao um booleano — `Promise<number | null>`.
       `null` e' a falha, e e' ela que vira `false` aqui. Devolver o numero cru faria
       o rodape tratar "versao 0" como falha no dia em que ela existisse. */
    const versaoNova = await lotesApi.salvar();
    if (versaoNova === null) return false;

    /* ⚠ A VERSAO DEVOLVIDA, NUNCA A DO STATE. `oc_salvar_lotes` acabou de incrementar a
       versao no servidor; `ocVersao` so' muda no proximo render. Mandar a do estado aqui
       daria 40001 sem pista de onde veio. A venda resolve assim com o boitel, e este e' o
       mesmo encadeamento. */
    const editadas = [...abateLinhas.entries()];
    if (editadas.length === 0) return true;

    /* ⚠ O RASCUNHO E' CHAVEADO POR `idLocal` E O BANCO NAO CONHECE ESSA CHAVE. A traducao
       acontece aqui, uma vez so'. Nao da' para ler `lotesApi.lotes` procurando `id`: o
       `salvar` acima recarregou, mas o state so' chega no proximo render — dentro deste
       gesto a closure ainda ve' os lotes de antes. Por isso a leitura e' FRESCA, do banco,
       e o casamento e' por `ordem`, que e' exatamente a chave com que `oc_salvar_lotes`
       grava (upsert por (operacao_id, cliente_id, ordem), migration 20260904204724). */
    const ordemPorIdLocal = new Map(lotesApi.lotes.map(l => [l.idLocal, l.ordem]));
    try {
      const { data, error } = await supabase
        .from('zoo_operacao_lotes')
        .select('id, ordem')
        .eq('operacao_id', ocOperacaoId)
        .eq('cliente_id', clienteId);
      if (error) throw error;
      const idPorOrdem = new Map((data ?? []).map(r => [r.ordem, r.id]));

      /* ⚠ RECUSA ANTES DO SERVIDOR, NOMEANDO. Sem o id, a RPC responderia "Lote <NULL>
         nao pertence a operacao" — verdadeira e inutil para quem esta' na tela. */
      const semId = editadas.filter(([idLocal]) => !idPorOrdem.get(ordemPorIdLocal.get(idLocal)!));
      if (semId.length > 0) {
        toast.error(`${semId.length} lote(s) do abate não foram encontrados no banco. Salve os lotes e tente de novo.`);
        return false;
      }
      const comId = editadas.map(([idLocal, linha]) => ({
        ...linha,
        operacaoLoteId: idPorOrdem.get(ordemPorIdLocal.get(idLocal)!)!,
      }));
      const v = await abateApi.salvar(comId, versaoNova);
      if (v === null) return false;
      /* Gravou: o que estava em memoria virou banco, e o hook ja recarregou. Manter o
         rascunho faria a proxima gravacao reenviar o que ja esta la'. */
      setAbateLinhas(new Map());
      return true;
    } catch (e) {
      /* ⚠ ERRO DE RPC NUNCA E' MUDO — era esta a metade que faltava. `abateApi.salvar`
         LANCA (`OcRpcError`), e sem este catch a promessa rejeitava dentro do `onClick`
         do rodape: a tela nao mudava, nenhum toast aparecia, e o `concluir` — que roda
         depois deste passo — nunca chegava a ser chamado. A venda ja fazia assim. */
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a negociação do abate.');
      return false;
    }
  };

  const salvarOperacaoVendaOC = async (): Promise<{ operacaoId: string; versao: number } | null> => {
    const clienteId = clienteAtual?.id;
    if (!clienteId) { toast.error('Cliente não selecionado.'); return null; }
    if (!vendaFazendaId) { toast.error('Selecione a fazenda de origem.'); return null; }
    if (!vendaDestinoFornecedorId) { toast.error('Selecione o comprador.'); return null; }
    const criando = !ocOperacaoId;
    setSubmitting(true);
    try {
      const env = await ocRpc.salvarRascunho(ocOperacaoId, clienteId, ocVersao, {
        tipo_operacao: 'venda',
        data_operacao: data,
        cenario: isCenarioMeta ? 'meta' : 'realizado',
        fazenda_id: vendaFazendaId,
        contraparte_id: vendaDestinoFornecedorId || null,
        numero_documento: notaFiscal || null,
        observacoes: observacao || null,
        movimentacoes: [],
        partes: [],
      });
      setOcOperacaoId(env.operacao_id);
      setOcVersao(env.versao);
      if (env.status_comercial) setOcStatusComercial(env.status_comercial);

      /* ⚠ O BOITEL NAO GRAVA MAIS AQUI. Ele e' editado na aba de Negociacao, e passou a
         gravar junto com os lotes, em `salvarNegociacaoVendaOC`. Ficar aqui obrigava o
         operador a ter os cinco campos do boitel para poder CRIAR a operacao — e os
         campos moram na aba seguinte, que so' existe depois de criada. */

      /* A segunda frase VOLTOU em PR-OC-VENDA-ABA-NEGOCIACAO-01: a aba de Negociacao
         existe, entao a instrucao aponta para algo que da' para fazer. Ela ficou fora
         enquanto nao havia — mandar fazer o impossivel ensina a ignorar a mensagem. */
      if (criando) toast.success('Operação de venda criada. Agora informe os lotes negociados.');
      setOcVendaAssinaturaSalva(ocVendaAssinaturaAtual);
      return { operacaoId: env.operacao_id, versao: env.versao };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a operação de venda.');
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  /* PR-OC-FIX-VENDA-NEGOCIACAO-NAO-GRAVA-01 — SEGUNDA CAUSA DO DEFEITO 1.
     ⚠ NINGUEM CHAMAVA `lotesApi.salvar()` NA VENDA. Os tres unicos callers estao no
     `CompraModalShell` (linhas 253, 789 e 852); o rodape da venda so' chamava
     `salvarOperacaoVendaOC`, que grava `oc_salvar_rascunho` e nada mais. Por isso os tres
     eventos da OC cc3ced62 sao `salvar_rascunho` e nenhum e' de lotes: o botao fazia o que
     dizia, e o que ele dizia nao incluia os lotes.
     ⚠ NAO CHAMA `oc_salvar_rascunho` JUNTO. Duas RPCs em sequencia disputariam a versao: a
     primeira a incrementa e a segunda receberia a antiga do state, que so' atualiza no
     proximo render — 40001 na cara do operador. A compra tem o mesmo desenho: o botao da
     Negociacao dela salva LOTES, e os dados da operacao vao por outro caminho. */
  /* PR-OC-VENDA-REABRIR-NEG-01 — `oc_reabrir` para a venda.
     ⚠ NAO REUSA O `reabrirOperacaoOC` DA COMPRA: aquele chama `recarregarOperacaoOC`, que
     hidrata campos da COMPRA (`compraFornecedorId`, `ocFazendaDestinoId`) e nao os da venda
     — reusar espalharia estado de um tipo no outro. E nao e' preciso: a propria RPC devolve
     `versao` e `status_comercial`, que e' tudo o que muda.
     ⚠ `oc_reabrir` E IDEMPOTENTE: numa operacao ja 'programada' devolve `ok` com
     `idempotente: true`, sem erro. */
  const reabrirNegociacaoVendaOC = async (motivo: string): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId || ocVersao == null) return false;
    setSubmitting(true);
    try {
      const env = await ocRpc.reabrir(ocOperacaoId, clienteId, ocVersao, motivo);
      const e = env as { versao: number; status_comercial?: string };
      setOcVersao(e.versao);
      if (e.status_comercial) setOcStatusComercial(e.status_comercial);
      /* ⚠ A ASSINATURA VOLTA A NULA: reabrir muda a versao no servidor, e o que estava
         "salvo" deixou de corresponder. Manter a marca faria o botao de salvar nascer
         apagado numa tela que precisa ser gravada de novo. */
      setOcVendaAssinaturaSalva(null);
      toast.success('Negociação reaberta — voltou para programada.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reabrir a negociação.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const salvarNegociacaoVendaOC = async (): Promise<boolean> => {
    const clienteId = clienteAtual?.id;
    if (!ocOperacaoId || !clienteId) { toast.error('Salve a operação na aba Venda primeiro.'); return false; }

    /* ⚠ A RECUSA ENSINA O CAMINHO INTEIRO, e antes de ir ao servidor. `oc_salvar_lotes`
       responde "Negociacao fechada; reabra para editar (oc_reabrir)" — correto e
       incompleto: com saida ja registrada, reabrir NAO basta, porque o lote nao se
       revaloriza com movimentacao viva. O operador tentaria reabrir, editar, e bateria no
       segundo guard sem saber por que.
       ⚠ SEM IR AO SERVIDOR: o estado ja esta' na tela, e uma ida para receber "nao" e' ida
       perdida. */
    if (ocStatusComercial === 'fechada') {
      const temSaidaViva = (recebimentoApi.movimentacoes ?? []).some(m => !m.cancelado);
      toast.error(temSaidaViva
        ? 'Operação fechada e com saída registrada. Para alterar a projeção: estorne a saída na aba Entrega, reabra a negociação, edite e salve, conclua e registre a saída novamente.'
        : 'Operação fechada. Reabra a negociação para editar — o botão está aqui no rodapé.');
      return false;
    }
    setSubmitting(true);
    try {
      /* ── O VALOR DO LOTE NUMA VENDA BOITEL ──────────────────────────────────
         PR-OC-VENDA-VALOR-LOTE-01. O lote nascia com `criterio_valor='kg'` e
         `valor_informado` NULL, e `_oc_valor_do_lote` devolve NULL nesse caso — o gado
         sairia do saldo SEM VALOR quando a aba Entrega existir, e a DRE nao veria a venda.
         ⚠ `lotesSobrescritos` E NAO `editarLote`: `salvar` fecha sobre `lotes`, entao
         editar e salvar no mesmo gesto mandaria o estado anterior.
         ⚠ 'total' porque `_oc_valor_do_lote` le `WHEN 'total' THEN l.valor_informado` — e'
         o valor cheio do embarque, nao uma taxa.
         ⚠ INTEGRAL, SEM RATEIO: boitel e' UM lote por OC. Com mais de um, nao se grava
         valor em nenhum — ratear a projecao exigiria um criterio que ninguem definiu. */
      let sobrescritos: typeof lotesApi.lotes | undefined;
      if (vendaTipoVenda === 'boitel' && boitelDaVenda) {
        const liquido = liquidoDaVendaBoitel(boitelDaVenda);
        if (lotesApi.lotes.length > 1) {
          toast.warning(`Esta venda de boitel tem ${lotesApi.lotes.length} lotes. O valor projetado não foi gravado em nenhum: no boitel a operação é um embarque só, e ratear a projeção entre lotes exigiria um critério que não existe. Deixe um lote para o valor voltar a ser gravado.`);
        } else if (liquido != null && liquido <= 0) {
          /* ⚠ NAO GRAVA E NAO BLOQUEIA. Valor negativo entraria na DRE como receita
             negativa; o planejamento segue sendo salvo, porque a projecao ruim tambem e'
             informacao. */
          toast.warning(`O resultado projetado deste boitel é ${liquido < 0 ? 'negativo' : 'zero'} (${liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). O valor do lote não foi alterado — revise a diária, o preço da @ ou as despesas de abate.`);
        } else if (liquido != null && lotesApi.lotes.length === 1) {
          sobrescritos = [{ ...lotesApi.lotes[0], criterioValor: 'total' as const, valorInformado: String(liquido) }];
        }
      }

      /* `silent` porque o aviso de sucesso sai daqui: numa venda boitel ainda falta gravar
         o planejamento, e dois toasts seguidos para um clique so' e' ruido. */
      const novaVersao = await lotesApi.salvar({ silent: true, lotesSobrescritos: sobrescritos });
      if (novaVersao == null) return false;   // o hook ja avisou o que impediu
      if (boitelDaVenda) {
        /* ⚠ GRAVA O DERIVADO, e nao o `ocBoitel` cru: e' nele que o peso de saida da fazenda
           ja vem dos lotes. O cru tem zero ali, sempre. */
        /* ⚠ 'projetado' SEMPRE: o realizado nasce no abate, por reabertura da OC. */
        const envB = await ocRpc.salvarBoitel(ocOperacaoId, clienteId, novaVersao, 'projetado', payloadBoitel(boitelDaVenda));
        setOcVersao((envB as { versao: number }).versao);
      }
      toast.success('Negociação salva.');
      /* ⚠ A ASSINATURA DO MOMENTO DA CHAMADA, e nao a do fim: `lotesApi.salvar` recarregou
         os lotes, mas o estado so' chega no proximo render. Assinar o que foi ENVIADO e' o
         que corresponde ao que o banco passou a ter. */
      setOcVendaAssinaturaSalva(ocVendaAssinaturaAtual);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a negociação.');
      return false;
    } finally {
      setSubmitting(false);
    }
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
    /* ⚠ A VENDA NA OC SAI AQUI, como a compra: quem grava e' a RPC, e o funil legado nao
       roda. Sem isso o `handleSubmit` criaria tambem um lancamento zootecnico. */
    if (modoOCVenda && isVenda) {
      void salvarOperacaoVendaOC();
      return;
    }
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
    /* ⚠ EM GLOBAL, SO LANCA QUEM ESCOLHE A FAZENDA (PR-OC-FIX-NASC-FAZENDA-NAO-SALVA-01).
       O `noOp` do V2Index recusava TODOS em Global e devolvia `undefined`, que esta tela
       lia como falha e traduzia num toast generico de "erro ao salvar" — sem erro algum.
       Agora o writer e' o de verdade, e a recusa dos tipos SEM seletor acontece aqui, no
       funil unico, com a mensagem que diz O QUE FAZER em vez de anunciar um erro que nao
       houve. Quem tem seletor passa: o campo deles ja bloqueia o botao quando vazio.
       ⚠ A LISTA E' A AUTORIDADE — ver TIPOS_COM_SELETOR_DE_FAZENDA. Enquanto isto era
       `!isNascimento`, a Morte migrou com seletor e continuou barrada
       (PR-ZOO-FIX-MORTE-GUARDA-GLOBAL-01). */
    if (isGlobal && !escolheFazenda) {
      toast.error('Selecione uma fazenda específica para lançar.');
      return;
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
      /* ⚠ A GUARDA DO FORNECEDOR FICA em todos os cenarios. Em meta o campo ja abre
         preenchido com o sentinel '[META] Planejamento', entao ela nao atrapalha — e
         continua protegendo o realizado. */
      if (!compraFornecedorId) { toast.error('Selecione o fornecedor para continuar'); return; }
      /* ⚠ UMA CONDICAO SO' PARA AS DUAS EXIGENCIAS FINANCEIRAS, e e' o conserto.
         Ate PR-ZOO-META-COMPRA-01 a linha do `!compraDetalhes` exigia o dialogo
         "Completar Compra" em TODO cenario, enquanto a linha do valor logo abaixo ja
         dispensava meta — o mesmo funil se contradizia em duas linhas seguidas, e o
         resultado era que compra em meta nao registrava por caminho nenhum.
         Nao e' afrouxar regra: e' fazer as duas exigencias perguntarem a mesma coisa. */
      if (exigeDetalheFinanceiro && !compraDetalhes) {
        toast.error('Clique em "Completar Compra" para preencher os detalhes financeiros');
        return;
      }
      const valorBase = (() => {
        const totalKg = (parseNumericValue(quantidade) || 0) * (parseNumericValue(pesoKg) || 0);
        if (!compraDetalhes) return 0;
        if (compraDetalhes.tipoPreco === 'por_kg') return totalKg * (Number(compraDetalhes.precoKg) || 0);
        if (compraDetalhes.tipoPreco === 'por_cab') return (parseNumericValue(quantidade) || 0) * (Number(compraDetalhes.precoCab) || 0);
        return Number(compraDetalhes.valorTotal) || 0;
      })();
      if (exigeDetalheFinanceiro && valorBase <= 0) {
        toast.error('Preencha o preço base antes de registrar a compra.');
        return;
      }
    }

    setConfirmDialogOpen(true);
  };

  /* ⚠ `triggerZootCacheRefresh` REMOVIDA — PERF-ZOOT-SAVE-01. Ela chamava
     `supabase.rpc(...).catch(() => {})`, e o `PostgrestBuilder` não implementa
     `.catch`: a chamada lançava TypeError SÍNCRONO, engolido pelo try de fora, e
     o builder é lazy — sem `.then`, a requisição NUNCA saía. Treze chamadas
     espalhadas pelo arquivo não despachavam nada, e o TSC dizia isso em todo
     relatório (2x TS2551), na baseline, sem ser lido.
     Quem sustenta o cache é o par que já funciona: `trg_invalidate_zoot_cache`
     apaga a fazenda/ano tocada no save, e o ensure de `useZootCategoriaMensal`
     reconstrói na leitura seguinte. Ligar o refresh aqui pagaria os segundos no
     save — o lugar errado. */

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

    /* ⚠ A FAZENDA ESCOLHIDA, NUNCA A PALAVRA "Global". `campos.origem.value` vem de
       `getCamposFazenda(tipo, nomeFazenda)`, e `nomeFazenda` e' `fazendaAtual?.nome` —
       que em contexto Global e' literalmente a string 'Global'. Era ESTE o escritor que
       sujava as colunas de texto: os 19 registros que PR-UI-LANC-CARD-FAZENDA-01
       corrigiu na EXIBICAO nasceram aqui.
       ⚠ So' muda para quem ESCOLHE a fazenda — `fazendaEscolhidaNome` e' null nos demais
       e a expressao cai no valor de sempre. Tipo novo que entrar em
       TIPOS_COM_SELETOR_DE_FAZENDA passa a gravar o nome certo sem tocar nesta linha. */
    const origemFinal = campos.origem.show
      ? (campos.origem.auto ? (fazendaEscolhidaNome ?? campos.origem.value) : fazendaOrigem) || undefined
      : undefined;
    /* ⚠ SIMETRICO AO `origemFinal` ACIMA, e pelo mesmo motivo. O nascimento tem
       `origem: {show:false}` e `destino: {auto:true, value: nomeFazenda}` — entao o
       lixo dele cai na coluna de DESTINO, e nao na de origem. Era o `c32e3615`.
       Depois de PR-ZOO-FIX-MORTE-WRITER-COLUNAS-01 o nascimento ficou como unico
       caminho VIVO produzindo 'Global': abate e venda tambem tem o registro sujo, mas
       a guarda de 85384b55 os impede de lancar em Global desde maio.
       ⚠ A MESMA EXPRESSAO NAS DUAS COLUNAS: quem entrar em
       TIPOS_COM_SELETOR_DE_FAZENDA passa a gravar o nome certo na origem E no destino,
       sem que ninguem precise lembrar de nenhuma das duas linhas. */
    let destinoFinal = campos.destino?.show
      ? (campos.destino.auto ? (fazendaEscolhidaNome ?? campos.destino.value) : fazendaDestino) || undefined
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
    const isBoitelVenda = isVenda && vendaTipoVenda === 'boitel';
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
      /* ⚠ SO' A COMPRA COM DIALOGO. `compraValorTotal` le EXCLUSIVAMENTE de
         `compraDetalhes`, e em meta esse dialogo nao existe mais
         (PR-ZOO-META-COMPRA-01) — o resultado era 0, e o valor virava `undefined`.
         Nao foi `exigeDetalheFinanceiro` que desligou o calculo: o calculo sempre teve
         o dialogo como unica fonte, e enquanto ele era obrigatorio isso nao aparecia.
         Em meta a compra cai no ramo generico abaixo, que usa `calc.valorLiquido` —
         para uma compra isso e' `pesoTotal x R$/kg + bonus - descontos`, exatamente a
         mesma composicao que o resumo lateral mostra como "Valor previsto"
         (comissao, frete e outras despesas nao existem naquela tela e entram zeradas). */
      : isCompra && !isCenarioMeta
        ? (compraValorTotal > 0 ? compraValorTotal : undefined)
        : isAbate
          ? ((calc.valorBruto + calc.totalBonus) > 0 ? calc.valorBruto + calc.totalBonus : undefined)
          : isVenda
            ? (calc.valorBruto > 0 ? calc.valorBruto : undefined)
            /* ⚠ RAMO PROPRIO DA MORTE (PR-ZOO-MORTE-NO-SHELL-01). Sem ele o generico
               abaixo (`calc.valorLiquido`) continuaria vencendo e o campo Valor da tela
               nao chegaria ao banco — era o generico que gravava valor em 894 das 1.678
               mortes, sem que existisse campo. `?? undefined` e nao `?? 0`: valor nao
               informado e' omitido pela lista branca e fica null. */
            : isMorte
              ? (valorMorte ?? undefined)
              : (calc.valorLiquido > 0 ? calc.valorLiquido : undefined);

    const abateDataVenda = isAbate ? (abateDetalhes?.dataVenda || dataVenda || format(new Date(), 'yyyy-MM-dd')) : (dataVenda || undefined);
    const abateDataEmbarque = isAbate && data ? format(addDays(parseISO(data), -1), 'yyyy-MM-dd') : (dataEmbarque || undefined);
    const abateDataAbate = isAbate ? data : (dataAbate || undefined);
    const abTipoPeso = isAbate && abateDetalhes ? abateDetalhes.tipoPeso : tipoPeso;
    const abTipoVenda = isAbate && abateDetalhes ? abateDetalhes.tipoVenda : tipoVenda;
    const abNotaFiscal = isAbate && abateDetalhes ? abateDetalhes.notaFiscal : notaFiscal;

    // For venda: save precoInput to precoArroba, tipoPreco to tipoPeso, tipoVenda to tipoVenda
    /* ⚠ O PRECO UNITARIO NAO PODE DEPENDER DO DIALOGO. `vendaDetalhes` e' null na venda
       em META desde PR-ZOO-VENDA-META-01 — o dialogo financeiro deixou de ser aberto —, e
       a expressao caia no ultimo ramo, que le o `precoArroba` generico, vazio para venda.
       O resultado era `preco_arroba` NULO, e reabrir o lancamento traria o campo em
       branco: salvar de novo zeraria o valor. Nao era ausencia de dado, era destruicao
       no round-trip.
       ⚠ MESMO DEFEITO DE `valorTotalFinal`, corrigido em PR-ZOO-FIX-META-COMPRA-VALOR-01:
       um valor amarrado a existencia do dialogo, que a dispensa do dialogo esvaziou.
       `vendaPrecoInput` e' estado da PAGINA e vale nos dois caminhos. */
    const vendaPrecoArrobaFinal = isBoitelVenda && boitelDataForResumo
      ? (boitelDataForResumo.precoVendaArroba || undefined)
      : isVenda
        ? (parseNumericValue(vendaPrecoInput) || undefined)
        : (isAbate && abateDetalhes ? (parseNumericValue(abateDetalhes.precoArroba) || undefined) : (numOrUndef(precoArroba) || undefined));
    const tipoPesoFinal = isVenda ? vendaTipoPreco : abTipoPeso;
    const tipoVendaFinal = isVenda ? vendaTipoVenda : abTipoVenda;

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
      /* ⚠ A MESMA FONTE DA EXIBICAO. Era uma segunda cadeia de ternarios, paralela a do
         nome — a divida anotada em PR-ZOO-FIX-MORTE-PESO-E-CONFIRMACAO-01. Vazio vira
         `undefined` e `adicionarLancamento` cai na fazenda do contexto, como sempre. */
      fazendaId: fazendaEscolhidaId || undefined,
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
        if (isVenda && vendaTipoVenda === 'boitel') {
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
        /* ⚠ O SNAPSHOT TAMBEM ESTAVA AMARRADO AO DIALOGO. Sem ele a venda em meta
           gravava sem `detalhes_snapshot`, e a edicao caia no fallback — que reconstroi a
           partir de `financeiro_lancamentos_v2`, e uma projecao nao tem financeiro.
           `vendaMetaNoEnvelope` entra na condicao: em meta o snapshot se monta a partir
           do estado da pagina, que e' de onde os campos vem naquele caminho. */
        if (isVenda && (vendaDetalhes || vendaMetaNoEnvelope)) {
          const fornNome = abateFornecedores.find(f => f.id === vendaDestinoFornecedorId)?.nome;
          const vc = vendaCalc || vendaDetalhes.calculation;
          return {
            ...buildVendaSnapshot(vc || buildVendaCalculation({
              quantidade: parseNumericValue(quantidade) || 0, pesoKg: parseNumericValue(pesoKg) || 0, categoria,
              fazendaOrigem: nomeFazenda || fazendaOrigem, compradorNome: fornNome || '',
              data, statusOperacional: isCenarioMeta ? null : effectiveStatusOp as StatusOperacional, tipoPreco: 'por_kg', precoInput: vendaPrecoInput,
            })),
            type: 'venda',
            ...(vendaDetalhes ?? {}),
            tipoPreco: vendaTipoPreco, precoInput: vendaPrecoInput,
            tipoVenda: vendaDetalhes?.tipoVenda ?? vendaTipoVenda,
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
          setLancModalOpen(false);
          restoreEditOrigin();
        } else if (isVenda && (calc.valorLiquido > 0 || vendaTipoVenda === 'boitel')) {
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
          setLancModalOpen(false);
          restaurarContextoDoModal();
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
          setLancModalOpen(false);
          restaurarContextoDoModal();
        } else if (isVenda && returnedId) {
          const isBoitel = vendaTipoVenda === 'boitel';
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
          setLancModalOpen(false);
          restaurarContextoDoModal();
        } else if (isConsumo && returnedId) {
          // Consumo NÃO gera lançamento financeiro — fluxo só zootécnico.
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria(''); setPesoKg('');
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Consumo registrado com sucesso!');
          setLancModalOpen(false);
          restaurarContextoDoModal();
        } else if (returnedId) {
          setLastSavedLancamentoId(null);
          setQuantidade(''); setCategoria('');
          setPesoKg(tipo === 'nascimento' ? '30,00' : '');   // A15 — peso com duas casas
          setFazendaOrigem(''); setFazendaDestino('');
          setData(format(new Date(), 'yyyy-MM-dd'));
          setObservacao(''); setStatusOp(defaultCenario);
          resetFinancialFields();
          toast.success('Lançamento registrado!');
          setLancModalOpen(false);
          restaurarContextoDoModal();
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
    } else if (isVenda && vendaTipoVenda === 'boitel' && boitelDataForResumo) {
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
      /* PR-OC-VENDA-ABA-01 — espelho do card de Compra. Enquanto `onNovaVendaOC` nao for
         passado, a Venda cai no caminho de sempre: este PR ADICIONA a OC, nao substitui
         o formulario antigo. */
      if (it.value === 'venda' && onNovaVendaOC) {
        onNovaVendaOC();
        resetContextoOC();
        setTipo('venda');
        setLancModalOpen(true);
        return;
      }
      /* OC-ABATE-01 T1 — espelho do card de Venda, com a MESMA guarda: enquanto
         `onNovoAbateOC` nao for passado, o Abate cai no dialogo de sempre. E' o que
         mantem os 829 abates historicos funcionando sem migracao — quem nao recebe a
         prop nao ve diferenca nenhuma. */
      if (it.value === 'abate' && onNovoAbateOC) {
        onNovoAbateOC();
        resetContextoOC();
        setTipo('abate');
        setLancModalOpen(true);
        return;
      }
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
      /* ⚠ O CARD DA COMPRA SOME QUANDO O ENTRYPOINT DA OC NAO ESTA LIGADO — regra do
         realizado, onde comprar E' abrir uma Operacao Comercial. Em META nao ha OC:
         o lancamento e' simples, entao a ausencia do entrypoint nao diz nada e esconder
         o card tirava da rota de planejamento um tipo que ela precisa
         (PR-ZOO-META-COMPRA-01). O realizado nao muda. */
      .filter(it => !(it.value === 'compra' && !onNovaCompraOC && !isCenarioMeta))
      /* ⚠ FILTRO PROPRIO, e nao uma clausula a mais no de cima. Os dois falam de coisas
         diferentes: o anterior e' sobre ENTRYPOINT indisponivel, este e' sobre o tipo
         nao existir em projecao. Juntar faria uma condicao unica responder a duas
         perguntas, que e' como a compra sumiu da rota de meta sem ninguem decidir isso
         (PR-ZOO-META-SEM-CHUVAS-01). */
      .filter(it => !(isCenarioMeta && TIPOS_QUE_NAO_SE_PROJETAM.includes(it.value)));

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
          tipoPeso={vendaTipoVenda}
          onTipoPesoChange={setVendaTipoVenda}
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
          categorias — os demais tipos seguem com o seletor como esta.
          ⚠ A MORTE ENTROU EM PR-ZOO-MORTE-NO-SHELL-01, pelo mesmo motivo e com a mesma
          conferencia: `statusOp` continua nascendo de `defaultCenario`, montado o
          seletor ou nao. As descricoes de status (STATUS_DESCRIPTIONS_MORTE_CONSUMO)
          seguem existindo para o CONSUMO, que ainda tem o seletor. */}
      {!isNascimento && !isMorte && (
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
                value={vendaTipoVenda}
                onValueChange={(v) => {
                  setVendaTipoVenda(v);
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
          {(vendaDetalhes || (vendaTipoVenda === 'boitel' && boitelDataForResumo)) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (vendaTipoVenda === 'boitel') {
                  vendaFinanceiroRef.current?.openBoitelDialog();
                } else {
                  setVendaDialogOpen(true);
                }
              }}
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-1" />
              {vendaTipoVenda === 'boitel' ? 'Editar Planejamento' : 'Editar Financeiro'}
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="font-bold"
            onClick={handleRequestRegister}
            disabled={submitting || !(vendaDetalhes || (vendaTipoVenda === 'boitel' && boitelDataForResumo))}
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

  /* Prop-bag do Nascimento — mesmo padrao do `compraFormApi` acima. `modo: 'criacao'`
     e' o unico valor possivel aqui: esta tela registra, nao edita. A edicao monta o
     seu proprio bag no LancamentoZooModal, com `modo: 'edicao'`. */
  const nascFormApi = {
    modo: 'criacao' as const,
    data, setData,
    qtdInput, pesoInput,
    categoria, setCategoria: (v: Categoria) => setCategoria(v),
    categoriasDisponiveis,
    observacao, setObservacao,
    nascFazendaId, setNascFazendaId,
    fazendasOC,
    nascFazendaNome, nascFazendaFalta,
    nascQtd, nascPeso,
    /* ⚠ O NASCIMENTO DEIXA DE MENTIR (PR-ZOO-META-IDENTIDADE-01). A pilula era o
       literal 'Realizado' e a rota `lancamentos-meta-zoo` abre esta tela com
       `statusOp` ja' em 'meta' — a tela dizia realizado e gravava meta. */
    cenario: (isCenarioMeta ? 'meta' : 'realizado') as 'meta' | 'realizado',
    submitting,
    handleRequestRegister,
    fecharModalOCComAutosave,
  };

  /* Prop-bag da Compra em META — o formulario simples, nao a Operacao Comercial.
     ⚠ `nomeFazenda` e' a do CONTEXTO e nao um seletor: a compra nunca teve seletor de
     fazenda (origem e' texto livre, destino e' auto herdado), entao ela NAO entra em
     TIPOS_COM_SELETOR_DE_FAZENDA e continua recusada em modo Global. */
  const compraMetaFormApi = {
    data, setData,
    qtdInput, pesoInput,
    categoria, setCategoria: (v: Categoria) => setCategoria(v),
    categoriasDisponiveis,
    observacao, setObservacao,
    fazendaOrigem, setFazendaOrigem,
    compraFornecedorId, setCompraFornecedorId,
    fornecedores: abateFornecedores,
    notaFiscal, setNotaFiscal,
    precoKgBase: precoKg, setPrecoKgBase: setPrecoKg,
    bonus, setBonus,
    descontos, setDescontos,
    compraFazendaId, setCompraFazendaId,
    fazendasOC,
    compraFazendaNome, compraFazendaFalta,
    compraQtd: parseNumericValue(quantidade) || 0,
    /* ⚠ A MESMA FONTE DO WRITER. `calc.valorLiquido` e' o que `valorTotalFinal` grava
       para a compra em meta; passar daqui garante que a tela nao possa divergir do
       banco. Zero vira null: sem preco nao ha valor previsto, e traco nao e' zero. */
    valorPrevisto: calc.valorLiquido > 0 ? calc.valorLiquido : null,
    compraPeso: parseDecimalInput(pesoKg) ?? 0,
    submitting,
    handleRequestRegister,
    fecharModalOCComAutosave,
  };

  /* Prop-bag da Venda em META. ⚠ `valorPrevisto` vem de `calc.valorBruto`, o MESMO que
     `valorTotalFinal` grava — o shell nao recalcula, entao a tela nao pode divergir do
     banco. Foi a licao de PR-ZOO-FIX-META-COMPRA-VALOR-01. */
  const vendaMetaFormApi = {
    data, setData,
    qtdInput, pesoInput,
    categoria, setCategoria: (v: Categoria) => setCategoria(v),
    categoriasDisponiveis,
    observacao, setObservacao,
    compradorId: vendaDestinoFornecedorId, setCompradorId: setVendaDestinoFornecedorId,
    contrapartes: abateFornecedores,
    notaFiscal, setNotaFiscal,
    vendaTipoPreco, setVendaTipoPreco,
    vendaPrecoInput, setVendaPrecoInput,
    vendaTipoVenda, setVendaTipoVenda,
    vendaFazendaId, setVendaFazendaId,
    fazendasOC,
    vendaFazendaNome, vendaFazendaFalta,
    vendaQtd: parseNumericValue(quantidade) || 0,
    vendaPeso: parseDecimalInput(pesoKg) ?? 0,
    valorPrevisto: calc.valorBruto > 0 ? calc.valorBruto : null,
    submitting,
    handleRequestRegister,
    fecharModalOCComAutosave,
  };

  /* Prop-bag da Morte — mesmo padrao do `nascFormApi` acima. `modo: 'criacao'` e' o
     unico valor possivel aqui; a edicao monta o seu no LancamentoZooModal.
     ⚠ `cenarioRotulo` sai do estado REAL e nao de um literal: a rota
     `lancamentos-meta-zoo` abre esta tela com `statusOp` ja' em 'meta', e com o
     seletor escondido a pilula seria a unica coisa a dizer o cenario. Cravar
     "Realizado" ali faria a tela mentir sobre o que vai gravar. */
  const morteFormApi = {
    modo: 'criacao' as const,
    data, setData,
    qtdInput, pesoInput,
    categoria, setCategoria: (v: Categoria) => setCategoria(v),
    categoriasDisponiveis,
    observacao, setObservacao,
    morteFazendaId, setMorteFazendaId,
    fazendasOC,
    morteFazendaNome, morteFazendaFalta,
    motivoMorte, setMotivoMorte,
    motivoMorteCustom, setMotivoMorteCustom,
    motivosDisponiveis: MOTIVOS_MORTE,
    valorMorte, setValorMorte,
    morteQtd, mortePeso,
    cenario: (isCenarioMeta ? 'meta' : 'realizado') as 'meta' | 'realizado',
    submitting,
    handleRequestRegister,
    fecharModalOCComAutosave,
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
        /* Nascimento e Morte usam o MESMO envelope da Compra: sem padding proprio, sem
           gap e com o botao de fechar nativo escondido — quem fecha e' o X do cabecalho.
           ⚠ SEM ISTO O RODAPE ROLA. O ramo de baixo tem `overflow-y-auto p-4`, e com ele
           o modal inteiro vira uma area de rolagem so' — o rodape desce junto com o
           conteudo e some. Ver TIPOS_NO_ENVELOPE_PROPRIO. */
        className={usaEnvelopeProprio
          /* ⚠ MESMO TETO DO MODAL SIMPLES, na linha de baixo (PR-OC-MODAL-TAMANHO-01).
             Eram 1152px contra 1024px, e a diferenca fazia os dois lerem como sistemas
             diferentes ao alternar entre eles. O shell nao declara largura: ele preenche
             o que este DialogContent lhe da.
             ⚠ A VENDA COMO OC VOLTA AOS 1152px — PR-OC-VENDA-LAYOUT-NEG-01B, escopo
             expandido pelo arquiteto. A aba de Negociacao dela carrega DOIS cards de campos
             mais o resumo lateral de 280px; em 1024px sobravam ~100px por coluna de campo e
             os rotulos quebravam palavra a palavra. Compra, Nascimento, Morte e a venda de
             meta seguem em 1024px — o predicado e' so' da venda OC, conferido. */
          ? `${vendaOCNoEnvelope ? 'max-w-6xl' : 'max-w-5xl'} p-0 gap-0 overflow-hidden [&>button.absolute]:hidden`
          : 'max-w-full sm:max-w-5xl w-full h-screen sm:h-auto sm:max-h-[92vh] overflow-y-auto p-4 sm:p-5'}
      >
      {isAbate && modoOCAbate ? (
        /* ══ ABATE COMO OPERACAO COMERCIAL — OC-ABATE-01 T1 ═══════════════════════
           ⚠ ADICIONA, NAO SUBSTITUI. O `AbateDetalhesDialog` legado segue no `else`,
           byte a byte, e continua sendo o caminho dos 829 abates historicos — quem
           chega sem `?oc_abate=1` nao ve diferenca nenhuma. A troca e' o T3.
           ⚠ AS CINCO APIS SAO AS MESMAS DA VENDA, reusadas: `lotesApi`, `documentosApi`,
           `eventosApi`, `liquidacaoApi` e `recebimentoApi` ja estao montadas acima e agora
           tambem servem o abate (`|| ocAbateParam` no `enabled`). Construir outras cinco
           criaria a segunda fonte para o mesmo dado. */
        <AbateModalShell
          ocVersao={ocVersao} onOcVersaoChange={setOcVersao}
          data={data} setData={setData}
          frigorificoId={abateFrigorificoId} setFrigorificoId={setAbateFrigorificoId}
          contrapartes={abateFornecedores}
          onNovoFrigorifico={() => setNovoFornecedorCompraOpen(true)}
          abateFazendaId={abateFazendaId} setAbateFazendaId={setAbateFazendaId}
          fazendasOC={fazendasOC}
          observacao={observacao} setObservacao={setObservacao}
          ocOperacaoId={ocOperacaoId}
          ocStatusComercial={ocStatusComercial}
          lotesApi={lotesApi}
          /* ⚠ O DETALHE POR LOTE CHEGA AQUI E AINDA NAO TEM TELA. `abateApi` ja le e grava
             `zoo_operacao_abate`; quem o edita e' o `AbaNegociacaoAbate`, no commit
             seguinte. Passa-lo agora e' o que faz aquele commit ser so' a tela. */
          abateApi={abateApi}
          /* ⚠ O RASCUNHO E' DO PAI. A aba edita e devolve; quem persiste e' o rodape, numa
             chamada so' — mesmo desenho do `boitelDaVenda`/`onBoitelChange`. */
          abateLinhas={abateLinhas}
          onAbateLinhaChange={(loteId, proxima) => setAbateLinhas(prev => {
            const m = new Map(prev);
            m.set(loteId, proxima);
            return m;
          })}
          cenarioAbate={cenarioAbate}
          onCenarioAbateChange={setCenarioAbate}
          categoria={categoria}
          categoriasDisponiveis={categoriasDisponiveis}
          quantidadeNum={parseNumericValue(quantidade) || 0}
          pesoKgNum={parseNumericValue(pesoKg) || 0}
          submitting={submitting}
          onSalvarOperacao={() => salvarOperacaoAbateOC()}
          onSalvarNegociacao={() => salvarNegociacaoAbateOC()}
          documentosApi={documentosApi}
          eventosApi={eventosApi}
          liquidacaoApi={liquidacaoApi}
          recebimentoApi={recebimentoApi}
          ocEntregaEncerrada={ocEntregaEncerrada}
          onConcluirNegociacao={() => recebimentoApi.concluirNegociacao()}
          onReabrirNegociacao={(motivo) => reabrirNegociacaoVendaOC(motivo)}
          onFechar={fecharModalOCComAutosave}
        />
      ) : isVenda && modoOCVenda ? (
        /* ══ VENDA COMO OPERACAO COMERCIAL — aba de identificacao ═══════════════════
           Primeira de seis. Este ramo ADICIONA a OC; o formulario antigo da venda
           continua no `else`, byte a byte, ate o Gabriel decidir a troca. */
        <VendaModalShell
            /* ⚠ A FONTE ÚNICA DA VERSÃO — OC-VERSAO-FONTE-UNICA-01. `lotesApi` e
               `recebimentoApi` já saíam daqui ligados a `ocVersao`; o hook de
               compromissos, montado lá dentro, guardava a própria e deixava esta
               para trás. Agora os três escrevem no mesmo estado. */
            ocVersao={ocVersao} onOcVersaoChange={setOcVersao}
          data={data} setData={setData}
          compradorId={vendaDestinoFornecedorId} setCompradorId={setVendaDestinoFornecedorId}
          contrapartes={abateFornecedores}
          onNovoComprador={() => setNovoFornecedorCompraOpen(true)}
          vendaFazendaId={vendaFazendaId} setVendaFazendaId={setVendaFazendaId}
          fazendasOC={fazendasOC}
          propriedadeDestino={vendaPropriedadeDestino} setPropriedadeDestino={setVendaPropriedadeDestino}
          vendaTipoVenda={vendaTipoVenda} setVendaTipoVenda={setVendaTipoVenda}
          observacao={observacao} setObservacao={setObservacao}
          ocOperacaoId={ocOperacaoId}
          ocStatusComercial={ocStatusComercial}
          lotesApi={lotesApi}
          /* ⚠ O MESMO ESTADO QUE O RESUMO ANTIGO JA LIA — nao ha fonte nova. Ele e'
             preenchido a partir de `detalhesSnapshot.boitelSnapshot` quando uma venda
             boitel e' aberta para edicao. */
          /* ⚠ O VALOR NUNCA E NULO NUM BOITEL: sem objeto os quatro blocos nao teriam o
             que editar. Cabecas e peso vem dos LOTES — ver `boitelDaVenda`. */
          boitelData={boitelDaVenda}
          onBoitelChange={setOcBoitel}
          /* ⚠ O SEGUNDO MUNDO. `boitelReal` e' a linha 'realizado'; o Aplicar dela
              encadeia salvar + revalorar (ver `aplicarRealizadoBoitel`), e o iniciar
              resolve o guard de `fechada` ANTES de o dialogo abrir. */
          boitelReal={boitelRealDaVenda}
          onAplicarRealizado={aplicarRealizadoBoitel}
          onIniciarRealizado={iniciarRealizadoBoitel}
          categoria={categoria}
          categoriasDisponiveis={categoriasDisponiveis}
          quantidadeNum={parseNumericValue(quantidade) || 0}
          pesoKgNum={parseNumericValue(pesoKg) || 0}
          submitting={submitting}
          onSalvarOperacao={() => salvarOperacaoVendaOC()}
          onSalvarNegociacao={() => salvarNegociacaoVendaOC()}
          semAlteracoes={ocVendaSemAlteracoes}
          /* As tres apis, no mesmo idioma da compra. A venda as MONTA; nao as edita. */
          documentosApi={documentosApi}
          eventosApi={eventosApi}
          liquidacaoApi={liquidacaoApi}
          recebimentoApi={recebimentoApi}
          ocEntregaEncerrada={ocEntregaEncerrada}
          /* ⚠ O HOOK JA CUIDA DA VERSAO e dos callbacks de status: `onStatusChange` e
             `onVersaoChange` sao os mesmos setters da venda, ligados na instanciacao. Nao
             ha nada a atualizar aqui depois — atualizar de novo seria a segunda copia. */
          onConcluirNegociacao={() => recebimentoApi.concluirNegociacao()}
          onReabrirNegociacao={(motivo) => reabrirNegociacaoVendaOC(motivo)}
          onFechar={fecharModalOCComAutosave}
        />
      ) : isCompra && isCenarioMeta ? (
        /* ══ COMPRA EM META NO FORMULARIO SIMPLES ═════════════════════════════════
           A OC e' do realizado: contraparte, documento, recebimento e liquidacao nao
           existem numa projecao. Ao migrar a compra para a OC, o caminho de meta dela
           sumiu da tela — e ha 9 compras de meta gravadas por um caminho que deixou de
           existir. Nenhuma OC e' criada aqui. */
        <CompraMetaModalShell {...compraMetaFormApi} />
      ) : isCompra ? (
        <CompraModalShell {...compraFormApi} />
      ) : isNascimento ? (
        /* ══ NASCIMENTO NO SHELL DA OC ══════════════════════════════════════════
           O shell saiu deste arquivo em PR-ZOO-EDICAO-NO-MODAL-01 e virou componente:
           a EDICAO passou a abrir o mesmo modal, e um bloco inline nao se reusa de
           outra tela. O prop-bag segue o precedente do `compraFormApi` acima.
           ⚠ A BIFURCACAO continua aqui, no container: o ramo dos outros cinco tipos
           segue intocado no `else`. Morte, Consumo, Venda, Abate e Transferencia nao
           mudam — inclusive as descricoes de status deles. */
        <NascimentoModalShell {...nascFormApi} />
      ) : vendaMetaNoEnvelope ? (
        /* ══ VENDA EM META NO FORMULARIO SIMPLES ═══════════════════════════════════
           Uma projecao de venda nao tem nota emitida, entrega nem parcela liquidada.
           ⚠ BOITEL NAO CHEGA AQUI: `vendaMetaNoEnvelope` o exclui, e ele segue no
           formulario generico ate ganhar aba na OC. Sao 2 registros ativos.
           ⚠ A VENDA REALIZADA TAMBEM NAO: o predicado e' falso para ela sempre. */
        <VendaMetaModalShell {...vendaMetaFormApi} />
      ) : isMorte ? (
        /* ══ MORTE NO SHELL ══════════════════════════════════════════════════════
           Terceiro ramo da bifurcacao. O ramo generico abaixo — Venda, Abate, Consumo
           e Transferencia — segue byte a byte como estava. */
        <MorteModalShell {...morteFormApi} />
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
                if (onReturnFromEdit) await onReturnFromEdit();
              } : undefined}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
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
                    setTipoPeso(det.tipoPeso === 'morto' ? 'morto' : 'vivo');
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
                  detalhesPreenchidos={!!vendaDetalhes || (vendaTipoVenda === 'boitel' && !!boitelDataForResumo)}
                  canOpenModal={!!(data && quantidade && parseNumericValue(quantidade) > 0 && pesoKg && parseNumericValue(pesoKg) > 0 && categoria && vendaDestinoFornecedorId)}
                  onOpenModal={() => {
                    if (vendaTipoVenda === 'boitel') {
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
                  isBoitel={vendaTipoVenda === 'boitel'}
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
                    setVendaTipoVenda(det.tipoVenda);
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
                    tipoPeso={vendaTipoVenda}
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
          /* ⚠ NO NASCIMENTO, A FAZENDA DO FORMULARIO — nao a do contexto
             (PR-UI-NASCIMENTO-CONFIRMACAO-04). `campos.destino.value` e' `nomeFazenda`,
             que e' `fazendaAtual?.nome`: em contexto Global a confirmacao anunciava
             "Global" enquanto o insert gravava na fazenda ESCOLHIDA. Era defeito de
             EXIBICAO, nao de gravacao — conferido: `lancamentoDados.fazendaId` leva
             `nascFazendaId` e `adicionarLancamento` lhe da precedencia. Mas era o
             defeito pior de exibir: mentir na ultima tela antes de gravar, que existe
             exatamente para conferir. */
          fazendaDestino: fazendaEscolhidaNome
            ? fazendaEscolhidaNome
            : isAbate ? (abateFornecedores.find(f => f.id === abateFornecedorId)?.nome || '') : (campos.destino?.show ? (campos.destino?.auto ? campos.destino?.value : fazendaDestino) : undefined),
          observacao,
        }}
        financeiros={getConfirmacaoFinanceiros()}
        semFinanceiro={TIPOS_SEM_IMPACTO_FINANCEIRO.includes(tipo)}
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
