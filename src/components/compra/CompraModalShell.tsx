import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Edit, Lock, ShoppingCart, X, Trash2, Calendar, Building2, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { parseNumericValue } from '@/lib/calculos/abate';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';
import { AbaNegociacaoLotes } from './AbaNegociacaoLotes';
import { AbaRecebimentoLotes } from './AbaRecebimentoLotes';
import { AbaDocumentosOC } from './AbaDocumentosOC';
import { AbaFinanceiroOC } from './AbaFinanceiroOC';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import type { RecebimentoApi } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';
import { CompraResumoPanel } from './CompraResumoPanel';
import { ResumoLateralOC } from './ResumoLateralOC';
import { CompraDetalhesDialog, EMPTY_COMPRA_DETALHES, type CompraDetalhes } from './CompraDetalhesDialog';

// Controlador de input mascarado (retorno de useIntegerInput/useDecimalInput no monólito).
interface MaskedInput {
  displayValue: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: () => void;
}

// formApi — REFERÊNCIAS aos estados/setters/handlers já existentes no monólito. A casca é
// apresentação pura: recebe tudo pronto e apenas re-apresenta. Zero fetch/insert/RPC aqui.
export interface CompraModalShellProps {
  // status / cenário (mesmo estado das pílulas legadas)
  statusOp: StatusOperacional | 'meta';
  setStatusOp: (v: StatusOperacional | 'meta') => void;
  cenariosPermitidos: string[] | null;
  canEditMeta: boolean;
  // núcleo do formulário
  data: string;
  setData: (v: string) => void;
  qtdInput: MaskedInput;
  pesoInput: MaskedInput;
  categoria: string;
  setCategoria: (v: string) => void;
  categoriasDisponiveis: { value: string; label: string }[];
  observacao: string;
  setObservacao: (v: string) => void;
  fazendaOrigem: string;
  setFazendaOrigem: (v: string) => void;
  // fazenda destino (persistida no salvamento OC via fazendaDestinoId)
  fazendaAtualNome: string;
  fazendaAtualId: string | null;
  fazendas: { id: string; nome: string }[];
  fazendaDestinoId: string;
  setFazendaDestinoId: (v: string) => void;
  // fornecedor
  compraFornecedorId: string;
  setCompraFornecedorId: (v: string) => void;
  fornecedores: { id: string; nome: string }[];
  setNovoFornecedorCompraOpen: (v: boolean) => void;
  // financeiro (compra)
  compraDetalhes: CompraDetalhes | null;
  setCompraDetalhes: (v: CompraDetalhes | null) => void;
  setNotaFiscal: (v: string) => void;
  compraDialogOpen: boolean;
  setCompraDialogOpen: (v: boolean) => void;
  // derivados para resumo/tabela/gate (parse já feito no monólito)
  quantidadeNum: number;
  pesoKgNum: number;
  // ações
  handleRequestRegister: () => void;
  handleCancelEdit: () => void;
  submitting: boolean;
  editingId: string | null;
  // apresentação do gate P1 já computado (bloqueio real permanece no handleRequestRegister)
  mesFechadoMsg: string | null;
  // ponte Compra→OC (modo OC isolado; opt-in). Off por padrão → comportamento legado.
  modoOC?: boolean;
  abaInicial?: string;                   // PR-OC-FIN-EDIT-FIX-02 — aba inicial (ex.: 'financeiro' via ?oc_aba); default 'compra'
  ocOperacaoId?: string | null;
  lotesApi?: CompraLotesApi;   // COM-3: estado/handlers dos lotes (só em modo OC)
  recebimentoApi?: RecebimentoApi;      // RECEB-01: recebimento por lote (só em modo OC)
  documentosApi?: DocumentosApi;        // DOC-UI-01: documentos fiscais (só em modo OC)
  liquidacaoApi?: LiquidacaoApi;        // LIQ-UI-01: obrigações e liquidação (só em modo OC)
  ocStatusComercial?: string | null;    // 'programada' | 'fechada' | 'cancelada'
  ocDataOperacao?: string | null;       // FIX-01 item 6 — data da compra (contexto da aba Financeiro nova)
  ocEntregaEncerrada?: boolean;
  somenteLeitura?: boolean;             // read-only TOTAL (fechada/cancelada OU título materializado)
  aberturaExistente?: boolean;          // PR-OC-EDIT-01A — edição de operação existente (01A: sem lifecycle/downstream)
  // PR-OC-EDIT-01B — ações de ciclo (RPCs oficiais) da operação existente.
  ocTemTitulo?: boolean;                // título financeiro materializado ativo (explicação + gating)
  ocRascunho?: boolean;                 // rascunho técnico (cadastro incompleto) → "Confirmar" desabilitado
  ocFazendaValida?: boolean;            // PR-NAV-CONTEXTO-FAZENDA-01A — há fazenda real p/ persistir (bloqueia Salvar)
  acaoOcLoading?: 'confirmar' | 'cancelar' | 'reabrir' | null;
  ocDadosSujos?: boolean;               // ha edicao nao gravada nos dados da operacao
  onConfirmarOC?: () => void | Promise<boolean>;   // devolve true quando a operacao fechou de verdade
  onCancelarOC?: (motivo: string) => void;
  onReabrirOC?: (motivo: string) => void;
  onClose: () => void;
}

// Padrão ESCURO único dos dropdowns dos modais da casca (Compra + Negociação). Corrige o
// contraste do item selecionado/hover: o SelectItem do shadcn traz focus:bg-accent (tema
// claro) — aqui sobrescrevemos com !important (branco translúcido + texto branco) para o
// selecionado/hover ficarem legíveis e nunca herdarem o accent claro. Container = mesmo look
// glass do FinV2 (não editamos o DARK_GLASS compartilhado; esta é a regra da casca).
export const DARK_SELECT_CONTENT =
  'bg-zinc-950/80 backdrop-blur-xl border-zinc-700/50 text-zinc-100 ' +
  '[&_[role=option]]:text-zinc-100 ' +
  '[&_[role=option]:focus]:!bg-white/10 [&_[role=option]:focus]:!text-white ' +
  '[&_[role=option][data-state=checked]]:!bg-white/20 [&_[role=option][data-state=checked]]:!text-white [&_[role=option][data-state=checked]]:font-semibold';

const ABAS = [
  { key: 'compra', label: 'Compra', enabled: true },
  { key: 'negociacao', label: 'Negociação', enabled: true },
  { key: 'recebimento', label: 'Recebimento', enabled: false },
  { key: 'documentos', label: 'Documentos', enabled: false },
  { key: 'financeiro', label: 'Financeiro', enabled: false },
  { key: 'auditoria', label: 'Auditoria', enabled: false },
] as const;

// Indicador de cenário (norma: [✓ Realizado] / [🔵 Meta], sem texto). Programado removido no PR-0C.
const CENARIO_UI: Record<string, { icon: string; label: string; chip: string }> = {
  realizado: { icon: '✓', label: STATUS_LABEL.realizado, chip: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' },
  meta: { icon: '🔵', label: META_VISUAL.label, chip: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300' },
};

// PR-OC-CONSOLIDACAO-A1 — permissão de escrita EXPLÍCITA e NOMEADA por eixo. Fonte única, calculada em
//   um só ponto da árvore (CompraModalShell) e distribuída por props; nenhuma aba reconstrói seu gate.
export interface CompraPermissoesPorEixo {
  negociacaoReadOnly: boolean;
  dadosOperacaoReadOnly: boolean;
  recebimentoReadOnly: boolean;
  documentosReadOnly: boolean;
  financeiroLegadoReadOnly: boolean;
  financeiroNovoReadOnly: boolean;
}

export function CompraModalShell(api: CompraModalShellProps) {
  // Aba inicial: 'compra' por padrão; quando aberto pelo Financeiro V2 (?oc_aba=financeiro em modo OC),
  //   abre já na aba Financeiro. Só aceita abas que existem no modo OC.
  const [abaAtiva, setAbaAtiva] = useState<string>(
    api.modoOC && api.abaInicial && ['negociacao', 'recebimento', 'documentos', 'financeiro'].includes(api.abaInicial)
      ? api.abaInicial
      : 'compra',
  );
  // PR-OC-EDIT-01B — diálogo de confirmação das ações de ciclo (motivo obrigatório no cancelamento).
  const [acaoConfirm, setAcaoConfirm] = useState<null | 'confirmar' | 'cancelar' | 'reabrir'>(null);
  const [motivoAcao, setMotivoAcao] = useState('');
  /* ESTORNO EM DUAS ETAPAS, decisao de produto: `null` fechado, 1 = o que sera
     desfeito, 2 = motivo. Separar existe porque a etapa 1 e' informacao (quantas
     movimentacoes, quantas cabecas, que a entrega reabre) e a 2 e' compromisso.
     Juntas, o usuario le o motivo e ignora o resumo. */
  const [estornoEtapa, setEstornoEtapa] = useState<null | 1 | 2>(null);
  const [motivoEstorno, setMotivoEstorno] = useState('');
  const [estornando, setEstornando] = useState<null | 'estornando' | 'recalculando'>(null);
  // PR-OC-CONSOLIDACAO-A1 — FONTE ÚNICA dos 5 gates por eixo (calculada aqui; distribuída por props).
  //   Comportamento PRESERVADO do 01A: Recebimento/Documentos/Financeiro-legado seguem RO em operação
  //   existente — o desacoplamento por eixo é deliberadamente adiado para A2 (Recebimento) e A3 (Documentos).
  //   negociacaoReadOnly = somenteLeitura TOTAL (fechada/cancelada OU título materializado); financeiroNovo
  //   = regra homologada do modelo novo (rascunho/cancelada bloqueiam; 'fechada' permanece operacional).
  const somenteLeituraDownstream = !!(api.somenteLeitura || api.aberturaExistente);

  /* RECEBIMENTO ATIVO TRANCA A NEGOCIACAO, e isto alinha a UI ao backend em vez
     de deixar o usuario descobrir sozinho. `oc_salvar_lotes` tem guard duro:
     com qualquer movimentacao de recebimento existente ele recusa com
     "Operacao com movimentacao de recebimento; nao e possivel re-negociar os
     lotes". Ate agora a aba oferecia os campos editaveis, o usuario digitava,
     clicava Salvar e PERDIA a digitacao. Oferecer edicao que o backend recusa e
     pior do que nao oferecer.
     ⚠ Movimentacao CANCELADA nao conta: `cancelado !== true` e a mesma leitura
     que o resto do modal faz. */
  const temRecebimentoAtivo = (api.recebimentoApi?.movimentacoes ?? [])
    .some(m => m.cancelado !== true);
  const permissoes: CompraPermissoesPorEixo = {
    /* ⚠ VOLTOU a ser so `somenteLeitura`. Em 376aa17d o recebimento ativo
       trancava a aba INTEIRA — era o unico jeito de nao oferecer edicao que o
       banco recusa. Agora `oc_salvar_lotes` aceita corrigir criterio e valor com
       recebimento registrado, entao trancar tudo passaria a esconder uma edicao
       LEGITIMA. O congelamento do fisico virou granular, via `fisicoBloqueado`
       na grade de lotes. */
    negociacaoReadOnly: !!api.somenteLeitura,
    /* PR-OC-EDICAO-POS-FECHAMENTO-02 — DADOS DA OPERACAO (fornecedor, data, observacao,
       numero do documento) sao um eixo PROPRIO, e so `cancelada` os tranca.
       ⚠ ISTO SUPERA a regra do 01A, que trancava tudo em `fechada` OU com titulo
       materializado, "inclusive Observacao". Aquilo se justificava porque nao havia
       caminho de gravacao parcial: qualquer save mexia na base economica. Agora ha —
       `oc_editar_dados_operacao` tem lista branca de quatro campos e recusa o resto
       nominalmente, entao nenhuma alteracao economica passa por aqui.
       ⚠ TITULO MATERIALIZADO NAO BLOQUEIA MAIS ESTES QUATRO. Medido na FASE 0: o titulo
       carimba `v_comp.favorecido_id`, o favorecido do COMPROMISSO, e nunca a contraparte
       da operacao; e nada deriva de `data_operacao` retroativamente. A suite T4 do
       PR-...-01 prova que trocar a contraparte nao move o favorecido do titulo.
       A base economica segue trancada por `negociacaoReadOnly`, intacta. */
    dadosOperacaoReadOnly: api.ocStatusComercial === 'cancelada',
    // PR-OC-CONSOLIDACAO-A2 — Recebimento opera em operação existente elegível: gate depende SÓ do eixo
    //   próprio (cancelada = RO). As demais travas (sem operação salva, status ≠ 'fechada', entrega
    //   encerrada) já são aplicadas dentro de AbaRecebimentoLotes; título materializado NÃO bloqueia a
    //   chegada física. Não reusa aberturaExistente/somenteLeitura/ocTemTitulo.
    recebimentoReadOnly: api.ocStatusComercial === 'cancelada',
    documentosReadOnly: somenteLeituraDownstream,          // A3 fará o mesmo desacoplamento p/ Documentos
    financeiroLegadoReadOnly: somenteLeituraDownstream,
    financeiroNovoReadOnly: api.ocRascunho === true || api.ocStatusComercial === 'cancelada',
  };
  // FIX-01 item 6 — data de chegada = 1ª movimentação de recebimento (referência de contexto).
  const dataChegada = (api.recebimentoApi?.movimentacoes ?? []).map(m => m.data).filter(Boolean).sort()[0] ?? null;
  const [fluxoNeg, setFluxoNeg] = useState<null | 'salvando' | 'concluindo'>(null);   // fluxo "Concluir lotes e continuar"

  // Guarda de completude (UI) — orienta o fluxo; NÃO substitui a validação oficial do backend nem
  //   duplica fórmula: verifica só se há ao menos um lote preenchido (ignora linha-fantasma).
  const loteCompleto = (l: CompraLotesApi['lotes'][number]) =>
    !!l.categoria && (parseNumericValue(l.quantidade) || 0) > 0 && (parseNumericValue(l.pesoMedioKg) || 0) > 0
    && !!l.criterioValor && (parseNumericValue(l.valorInformado) || 0) > 0;

  const handleConcluirLotesContinuar = async () => {
    if (fluxoNeg) return;                                    // anti-duplo-clique / concorrência
    const lotesAtuais = api.lotesApi?.lotes ?? [];
    if (!lotesAtuais.some(loteCompleto)) {
      toast.error('Adicione ao menos um lote completo (categoria, quantidade, peso, critério e valor) para concluir.');
      return;
    }
    setFluxoNeg('salvando');
    const novaVersao = await api.lotesApi?.salvar({ silent: true });      // 1) salva
    if (novaVersao == null) { setFluxoNeg(null); return; }                //    falha → permanece
    setFluxoNeg('concluindo');
    const ok = await api.recebimentoApi?.concluirNegociacao({ versaoOverride: novaVersao, silent: true });  // 2) conclui c/ versão fresca
    if (!ok) { setFluxoNeg(null); return; }                               //    falha → permanece
    toast.success('Lotes concluídos. Continue com o recebimento.');
    setFluxoNeg(null);
    setAbaAtiva('recebimento');                                           // 3) avança
  };
  // Modo OC: ao CRIAR a operação (ocOperacaoId passa de vazio→preenchido), navega
  // automaticamente para a aba Negociação (informar os lotes).
  const prevOcRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Ao CRIAR (ocOperacaoId vazio→preenchido) navega para Negociação. Na ABERTURA de operação
    // existente (somente leitura) permanece na aba Compra para conferência do cabeçalho (OPEN-01).
    if (api.modoOC && api.ocOperacaoId && !prevOcRef.current && !api.somenteLeitura && !api.aberturaExistente) {
      setAbaAtiva('negociacao');
    }
    prevOcRef.current = api.ocOperacaoId ?? null;
  }, [api.modoOC, api.ocOperacaoId, api.somenteLeitura, api.aberturaExistente]);
  const cenarioOptions: (StatusOperacional | 'meta')[] = ['realizado', 'meta'];
  const cenarioAtual = CENARIO_UI[api.statusOp] ?? CENARIO_UI.realizado;
  const fornecedorNome = api.fornecedores.find(f => f.id === api.compraFornecedorId)?.nome || '';
  const canOpenModal = !!(api.data && api.quantidadeNum > 0 && api.pesoKgNum > 0 && api.categoria);
  // Peso Total = derivado de exibição (Peso Médio × Quantidade). O estado legado `pesoKg`
  // JÁ é o peso médio (vira pesoMedioKg no payload); portanto nada é escrito de volta.
  const pesoTotalDerivado = api.quantidadeNum > 0 && api.pesoKgNum > 0
    ? (api.pesoKgNum * api.quantidadeNum).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const dataLabel = api.data ? api.data.split('-').reverse().join('/') : '—';

  return (
    <div className="flex flex-col">
      {/* HEADER — template do modal aprovado (bg-primary, px-6 py-4, duas linhas) */}
      <div className="bg-primary text-primary-foreground px-6 py-4 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">🛒</span>
            <h2 className="text-lg font-bold leading-tight">Compra de Animais</h2>
            {api.editingId && (
              <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">Editando #{api.editingId.slice(0, 8)}</span>
            )}
            {api.modoOC && (
              <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-0.5 text-xs" title="Modo OC (isolado) — não cria lançamento nem financeiro">
                OC{api.ocOperacaoId ? ` #${api.ocOperacaoId.slice(0, 8)}` : ' (novo)'}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dataLabel}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {api.fazendaAtualNome || '—'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Badge de mês fechado NÃO se aplica ao fluxo OC (rascunho/negociação não são bloqueados pelo P1). */}
          {!api.modoOC && api.mesFechadoMsg && (
            <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-1 text-xs flex items-center gap-1" title={api.mesFechadoMsg}>
              <Lock className="h-3 w-3" /> Mês fechado
            </span>
          )}
          <button onClick={api.onClose} className="text-white/80 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* BARRA DE ABAS — template (bg-card, border-b, px-6 py-3) */}
      <div className="bg-card border-b px-6 py-1.5 flex items-center gap-1 overflow-x-auto">
        {ABAS.map(a => {
          // Recebimento, Documentos e Financeiro habilitam no modo OC; demais "em breve" seguem como estão.
          const enabled = a.enabled || ((a.key === 'recebimento' || a.key === 'documentos' || a.key === 'financeiro') && !!api.modoOC);
          const active = a.key === abaAtiva && enabled;
          return (
            <button
              key={a.key}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && setAbaAtiva(a.key)}
              title={enabled ? undefined : 'em breve'}
              className={`shrink-0 px-3 py-1 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary'
                : enabled ? 'border-transparent text-muted-foreground hover:text-foreground'
                : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {a.label}{!enabled && <span className="ml-1 text-[9px] uppercase tracking-wide">em breve</span>}
              {/* PR-OC-EDICAO-POS-FECHAMENTO-02 — ponto de pendencia. Marcador, nao parede:
                  a navegacao NUNCA e' bloqueada; o usuario so precisa saber que deixou
                  algo por gravar, inclusive olhando de outra aba. */}
              {a.key === 'compra' && api.ocDadosSujos && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                  title="Há alterações não salvas nesta aba" aria-label="Alterações não salvas" />
              )}
            </button>
          );
        })}
      </div>

      {/* CORPO — altura FIXA (h-[62vh]) para a casca não mudar de tamanho entre abas; só o
          corpo rola (header/barra de abas/rodapé permanecem fixos fora do scroll). */}
      {/* PR-OC-UX-DENSIDADE-01 encolheu a lateral de 320px para 240px porque o conteudo nao
          cabia. PR-OC-UX-LOTE-B-01 devolve 280px: com o resumo em pares rotulo-valor o
          conteudo ficou enxuto, e 240px espremia os valores monetarios contra o rotulo. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3 p-4 h-[66vh] overflow-y-auto bg-muted/30">
        <div className="space-y-2 min-w-0">
          {abaAtiva === 'negociacao' ? (
            <AbaNegociacaoLotes
              categoria={api.categoria}
              categoriasDisponiveis={api.categoriasDisponiveis}
              quantidadeNum={api.quantidadeNum}
              pesoKgNum={api.pesoKgNum}
              darkSelectClass={DARK_SELECT_CONTENT}
              modoOC={api.modoOC}
              operacaoPronta={!!api.ocOperacaoId}
              lotesApi={api.lotesApi}
              somenteLeitura={permissoes.negociacaoReadOnly}
              fisicoBloqueado={temRecebimentoAtivo}
              onVoltarCompra={() => setAbaAtiva('compra')}
            />
          ) : abaAtiva === 'recebimento' && api.recebimentoApi ? (
            <AbaRecebimentoLotes
              api={api.recebimentoApi}
              operacaoPronta={!!api.ocOperacaoId}
              concluida={api.ocStatusComercial === 'fechada'}
              encerrada={!!api.ocEntregaEncerrada}
              isCompra
              categoriasDisponiveis={api.categoriasDisponiveis}
              documentosApi={api.documentosApi}
              somenteLeitura={permissoes.recebimentoReadOnly}
              onVoltarNegociacao={() => setAbaAtiva('negociacao')}
            />
          ) : abaAtiva === 'documentos' && api.documentosApi ? (
            <AbaDocumentosOC api={api.documentosApi} operacaoPronta={!!api.ocOperacaoId} somenteLeitura={permissoes.documentosReadOnly} />
          ) : abaAtiva === 'financeiro' && api.liquidacaoApi ? (
            <AbaFinanceiroOC
              api={api.liquidacaoApi}
              operacaoPronta={!!api.ocOperacaoId}
              darkSelectClass={DARK_SELECT_CONTENT}
              financeiroLegadoReadOnly={permissoes.financeiroLegadoReadOnly}
              financeiroNovoReadOnly={permissoes.financeiroNovoReadOnly}
              onIrParaDocumentos={() => setAbaAtiva('documentos')}
              operacaoId={api.ocOperacaoId ?? null}
              clienteId={api.liquidacaoApi.clienteId}
              dataOperacao={api.ocDataOperacao ?? null}
              dataChegada={dataChegada}
            />
          ) : (
          <>
          {/* CARD 1 — Identificação da Compra */}
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
            <div className="text-[12px] font-semibold text-muted-foreground">Identificação da Compra</div>
            {/* Linha 1: Status · Data · Fazenda · Observações (larguras justas; Obs ocupa o resto) */}
            <div className="grid grid-cols-1 lg:grid-cols-[170px_150px_180px_minmax(0,1fr)] gap-2">
              <div>
                <Label className="font-bold text-[11px]">Status</Label>
                <Select value={api.statusOp} onValueChange={(v) => api.setStatusOp(v as StatusOperacional | 'meta')} disabled={permissoes.negociacaoReadOnly}>
                  <SelectTrigger className={`mt-0.5 h-8 text-[12px] font-semibold border-2 gap-1 ${cenarioAtual.chip}`}>
                    <span className="flex items-center gap-1"><span>{cenarioAtual.icon}</span><span>{cenarioAtual.label}</span></span>
                  </SelectTrigger>
                  <SelectContent className={DARK_SELECT_CONTENT}>
                    {cenarioOptions.map(v => {
                      const ui = CENARIO_UI[v];
                      const disabled = (api.cenariosPermitidos ? !api.cenariosPermitidos.includes(v) : false)
                        || (v === 'meta' && !api.canEditMeta);
                      return <SelectItem key={v} value={v} disabled={disabled} className="text-[12px]">{ui.icon} {ui.label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-bold text-[11px]">Data da Compra</Label>
                <div className={permissoes.dadosOperacaoReadOnly ? 'pointer-events-none opacity-60' : ''}>
                  <DatePicker value={api.data} onChange={api.setData} className="mt-0.5" />
                </div>
                {/* PR-OC-HOMOLOG-01 item 3 — edição da data liberada quando não há registros financeiros;
                    bloqueada (via negociacaoReadOnly = título materializado / fechada / cancelada) com aviso. */}
                {(permissoes.dadosOperacaoReadOnly || temRecebimentoAtivo || permissoes.negociacaoReadOnly) && (
                  /* DUAS CAUSAS, DOIS TEXTOS, e a diferenca agora e' maior: com
                     recebimento o usuario PODE corrigir criterio e valor ali
                     mesmo — manda-lo estornar seria desfazer movimentacao de
                     rebanho a toa, que e' justamente o que bate no guard P1 de
                     mes fechado. O estorno so e' necessario para o FISICO.
                     ⚠ `somenteLeitura` tem precedencia: ali nada e editavel. */
                  permissoes.dadosOperacaoReadOnly ? (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      Operação cancelada — somente leitura.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      Fornecedor, data e observação seguem editáveis. Categoria, quantidade e peso
                      exigem estorno do recebimento; valores e lotes têm caminho próprio.
                    </p>
                  )
                )}
              </div>
              <div>
                <Label className="font-bold text-[11px]">Fazenda <span className="text-destructive">*</span></Label>
                {/* PR-NAV-CONTEXTO-FAZENDA-01A — `api.fazendas` já vem filtrada ao domínio pecuário na
                    origem (critério único isFazendaPecuaria: sem Global, sem administrativas, só aptas).
                    A fazenda gravada só aparece selecionada se continuar válida para o domínio. */}
                <Select value={api.fazendaDestinoId} onValueChange={api.setFazendaDestinoId} disabled={permissoes.negociacaoReadOnly}>
                  <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                  <SelectContent className={DARK_SELECT_CONTENT}>
                    {api.fazendas.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {api.modoOC && !permissoes.negociacaoReadOnly && api.ocFazendaValida === false && (
                  <p className="mt-0.5 text-[10px] text-destructive">Selecione a fazenda da operação.</p>
                )}
              </div>
              <div>
                <Label className="font-bold text-[11px]">Observações/Lote</Label>
                <Input value={api.observacao} onChange={e => api.setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" disabled={permissoes.dadosOperacaoReadOnly} />
              </div>
            </div>
            {/* Linha 2: Fornecedor · Propriedade de origem */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div className="min-w-0">
                <Label className="font-bold text-[11px]">Fornecedor <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      value={api.compraFornecedorId || '__all__'}
                      onValueChange={(v) => api.setCompraFornecedorId(v === '__all__' ? '' : v)}
                      options={api.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                      placeholder="Selecione ou cadastre o fornecedor"
                      allLabel="Nenhum selecionado"
                      allValue="__all__"
                      dense
                      disabled={permissoes.dadosOperacaoReadOnly}
                      className="[&>button]:h-8 [&>button]:text-[12px] [&>button]:px-2"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Novo fornecedor" disabled={permissoes.dadosOperacaoReadOnly} onClick={() => api.setNovoFornecedorCompraOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="font-bold text-[11px]">Propriedade de origem</Label>
                {/* OPEN-01: sem coluna persistida no modelo — no modo leitura, vazio e desabilitado (não inferir). */}
                <Input value={permissoes.negociacaoReadOnly ? '' : api.fazendaOrigem} onChange={e => api.setFazendaOrigem(e.target.value)} placeholder={permissoes.negociacaoReadOnly ? '—' : 'Ex: Faz. Boa Vista'} className="mt-0.5 h-8 text-[12px]" disabled={permissoes.negociacaoReadOnly} />
              </div>
            </div>
          </div>

          {/* CARD 2 — Animais da Compra. Em modo OC os animais/lotes vivem na aba Negociação;
              aqui o card só existe no fluxo legado (PR-COMPRA-01). */}
          {!api.modoOC && (
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
            {/* Header do card: título + botão à direita (norma: topo, não abaixo da tabela) */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-muted-foreground">Animais da Compra</div>
              <Button type="button" variant="outline" size="sm" disabled className="h-7 text-[11px] gap-1 opacity-60 cursor-not-allowed" title="em breve">
                <Plus className="h-3 w-3" /> Adicionar categoria <span className="text-[9px] uppercase">em breve</span>
              </Button>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_1.3fr_1fr] gap-2 px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Categoria</span><span className="text-right">Quantidade</span><span className="text-right">Peso Médio</span><span className="text-right">Peso Total</span><span className="text-center">Ações</span>
                </div>
                <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_1.3fr_1fr] gap-2 items-center rounded-md border bg-muted/20 px-1 py-0.5">
                  <Select value={api.categoria} onValueChange={v => api.setCategoria(v)}>
                    <SelectTrigger className="h-6 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent className={`${DARK_SELECT_CONTENT} max-h-[70vh] overflow-y-auto`}>
                      {api.categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="text" inputMode="numeric" value={api.qtdInput.displayValue} onChange={api.qtdInput.onChange} onBlur={api.qtdInput.onBlur} onFocus={api.qtdInput.onFocus} placeholder="0" className="h-6 text-[11px] text-right font-bold tabular-nums" />
                  {/* Peso Médio: input legado (o estado pesoKg É o peso médio → pesoMedioKg no payload) */}
                  <Input type="text" inputMode="decimal" value={api.pesoInput.displayValue} onChange={api.pesoInput.onChange} onBlur={api.pesoInput.onBlur} onFocus={api.pesoInput.onFocus} placeholder="0,00" className="h-6 text-[11px] text-right tabular-nums" />
                  {/* Peso Total: derivado somente de exibição (Peso Médio × Quantidade) — read-only */}
                  <Input value={pesoTotalDerivado} readOnly tabIndex={-1} className="h-6 text-[11px] text-right tabular-nums bg-muted cursor-default" />
                  <div className="text-center text-muted-foreground/40 text-[10px]">—</div>
                </div>
              </div>
            </div>
          </div>
          )}
          </>
          )}
        </div>

        {/* RESUMO LATERAL — coluna de 320px. Modo OC: resumo PERMANENTE das 6 etapas
            (ResumoLateralOC, consumindo as fontes oficiais já montadas). Não-OC (legado):
            mini-card Situação/Fazenda + CompraResumoPanel preservado (outros callers). */}
        {api.modoOC ? (
          <ResumoLateralOC
            tipoLabel={api.liquidacaoApi?.tipoOperacao ?? null}
            dataLabel={dataLabel}
            statusComercial={api.ocStatusComercial ?? null}
            fornecedorNome={fornecedorNome}
            fazendaNome={api.fazendaAtualNome}
            ocId={api.ocOperacaoId ?? null}
            negociacaoTotais={api.lotesApi?.totais ?? null}
            recebimentoLotes={api.recebimentoApi?.lotes ?? null}
            entregaEncerrada={!!api.ocEntregaEncerrada}
            documentos={api.documentosApi?.documentos ?? null}
            financeiroResumo={api.liquidacaoApi?.resumo ?? null}
            obrigacoesCount={api.liquidacaoApi?.obrigacoes.length ?? null}
            obrigacoes={api.liquidacaoApi?.obrigacoes ?? null}
          />
        ) : (
          <div className="space-y-2 self-start">
            <div className="bg-card rounded-md border shadow-sm p-2 space-y-0.5 text-[10px] leading-tight">
              <div className="flex justify-between"><span className="text-muted-foreground">Situação</span><strong>{cenarioAtual.icon} {cenarioAtual.label}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fazenda</span><strong className="truncate max-w-[150px]">{api.fazendaAtualNome || '—'}</strong></div>
            </div>
            <CompraResumoPanel
              quantidade={api.quantidadeNum}
              pesoKg={api.pesoKgNum}
              categoria={api.categoria}
              fornecedorNome={fornecedorNome}
              detalhes={api.compraDetalhes}
              detalhesPreenchidos={!!api.compraDetalhes}
              canOpenModal={canOpenModal}
              somenteLeitura={permissoes.negociacaoReadOnly}
              onOpenModal={() => api.setCompraDialogOpen(true)}
              onRequestRegister={api.handleRequestRegister}
              submitting={api.submitting}
              registerLabel={api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
              onCancelEdit={api.editingId ? api.handleCancelEdit : undefined}
            />
          </div>
        )}
      </div>

      {/* RODAPÉ — template do modal aprovado (bg-primary, px-6 py-3), FIXO (fora do scroll do corpo) */}
      <div className="bg-primary px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {api.editingId && (
            <Button variant="outline" onClick={api.handleCancelEdit} disabled={api.submitting}
              className="border-destructive text-destructive hover:bg-destructive/10 gap-1.5 bg-transparent">
              <Trash2 className="h-4 w-4" /> Cancelar operação
            </Button>
          )}
          {/* PR-OC-EDIT-01B — título materializado: negociação bloqueada (ADR Soberania Financeira). */}
          {api.aberturaExistente && api.ocTemTitulo && (
            <span
              className="text-white/80 text-[11px] flex items-center gap-1.5 leading-tight whitespace-nowrap"
              title="Esta operação possui títulos financeiros lançados. A negociação está protegida para preservar a consistência financeira. O Recebimento permanece disponível conforme o estado da entrega. Ajustes nos valores lançados dependerão dos fluxos de estorno ou renegociação."
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Valores financeiros lançados. Ajustes dependem de estorno ou renegociação.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={api.onClose} disabled={fluxoNeg !== null || !!api.acaoOcLoading} className="text-white hover:bg-white/10">Fechar</Button>
          {/* Editar Financeiro: só em edição e quando aplicável (composição aprovada do rodapé) */}
          {api.editingId && api.compraDetalhes && (
            <Button variant="secondary" onClick={() => api.setCompraDialogOpen(true)} disabled={api.submitting} className="gap-1.5">
              <Edit className="h-4 w-4" /> Editar Financeiro
            </Button>
          )}
          {/* Concluir negociação (oc_confirmar) — só comercial; habilita o Recebimento (RECEB-01).
              PR-OC-EDIT-01A: NÃO exposto na edição de operação existente (Confirmar = PR-OC-EDIT-01B). */}
          {!api.somenteLeitura && !api.aberturaExistente && api.modoOC && api.ocOperacaoId && api.ocStatusComercial !== 'fechada' && api.recebimentoApi && abaAtiva !== 'negociacao' && (
            <Button type="button" variant="secondary" disabled={api.recebimentoApi.saving}
              onClick={() => api.recebimentoApi?.concluirNegociacao()} className="gap-1.5">
              <Check className="h-4 w-4" /> Concluir negociação
            </Button>
          )}
          {/* ESTORNAR RECEBIMENTO — discreto de proposito (`ghost`): e' acao de
              correcao, nao o caminho normal da tela, e destacar convidaria a
              usa-la sem necessidade. Aparece so quando ha o que estornar.
              PR-OC-UX-LOTE-A-01: e SO na aba Recebimento. Acao de recebimento
              pertence a aba de recebimento; no rodape global ela seguia o usuario
              ate a Compra e o Financeiro, onde nao tem o que fazer.
              ⚠ Nao cria beco sem saida: a aba Recebimento fica habilitada sempre
              que `modoOC` (barra de abas, CompraModalShell:295), independente de
              status ou de entrega encerrada — os gates internos mudam o QUE a aba
              mostra, nunca se da para chegar nela. */}
          {abaAtiva === 'recebimento' && api.modoOC && api.ocOperacaoId && api.ocStatusComercial !== 'cancelada'
            && temRecebimentoAtivo && api.recebimentoApi && (
            <Button type="button" variant="ghost" disabled={!!api.recebimentoApi.saving || estornando !== null}
              onClick={() => { setMotivoEstorno(''); setEstornoEtapa(1); }}
              className="gap-1.5 text-muted-foreground hover:text-foreground">
              Estornar recebimento
            </Button>
          )}
          {api.aberturaExistente ? (
            // === PR-OC-EDIT-01B — ações de ciclo da OPERAÇÃO EXISTENTE (visíveis pelo estado real) ===
            //   Confirmar/Cancelar/Reabrir via RPCs oficiais; título materializado bloqueia tudo (só
            //   leitura + explicação, à esquerda). Sem "Concluir lotes e continuar" (fluxo de criação).
            <>
              {api.ocStatusComercial === 'fechada' && !api.ocTemTitulo && (
                <Button type="button" variant="secondary" disabled={!!api.acaoOcLoading}
                  onClick={() => { setMotivoAcao(''); setAcaoConfirm('reabrir'); }} className="gap-1.5">
                  {api.acaoOcLoading === 'reabrir' ? 'Reabrindo...' : 'Reabrir operação'}
                </Button>
              )}
              {(api.ocStatusComercial === 'programada' || api.ocStatusComercial === 'fechada') && !api.ocTemTitulo && (
                <Button type="button" variant="outline" disabled={!!api.acaoOcLoading}
                  onClick={() => { setMotivoAcao(''); setAcaoConfirm('cancelar'); }}
                  className="border-red-300/60 text-red-100 hover:bg-red-500/20 bg-transparent gap-1.5">
                  {api.acaoOcLoading === 'cancelar' ? 'Cancelando...' : 'Cancelar operação'}
                </Button>
              )}
              {/* PR-OC-EDICAO-POS-FECHAMENTO-02 — FECHADA ganha Salvar proprio, so na aba
                  Compra. Vai por `handleRequestRegister`, que roteia pelo status:
                  fechada -> oc_editar_dados_operacao; demais -> oc_salvar_rascunho.
                  ⚠ Desabilitado quando NAO ha alteracao pendente: e' o que impede a
                  versao de subir e a auditoria de encher de evento vazio. Sem titulo
                  aqui: os quatro campos nao tocam a base economica. */}
              {api.ocStatusComercial === 'fechada' && abaAtiva === 'compra' && (
                <Button onClick={api.handleRequestRegister}
                  disabled={api.submitting || !!api.acaoOcLoading || !api.ocDadosSujos}
                  title={api.ocDadosSujos ? undefined : 'Nenhuma alteração pendente'}
                  className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60">
                  <ShoppingCart className="h-4 w-4" /> {api.submitting ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
              {api.ocStatusComercial === 'programada' && !api.ocTemTitulo && (
                <>
                  {abaAtiva === 'negociacao' ? (
                    <Button type="button" variant="secondary"
                      disabled={!api.ocOperacaoId || !!api.lotesApi?.saving || !!api.acaoOcLoading}
                      onClick={() => api.lotesApi?.salvar()} className="gap-1.5">
                      {api.lotesApi?.saving ? 'Salvando...' : 'Salvar rascunho'}
                    </Button>
                  ) : (abaAtiva === 'recebimento' || abaAtiva === 'documentos' || abaAtiva === 'financeiro') ? null : (
                    <Button onClick={api.handleRequestRegister} disabled={api.submitting || !!api.acaoOcLoading || !api.ocFazendaValida}
                      className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60">
                      <ShoppingCart className="h-4 w-4" /> {api.submitting ? 'Salvando...' : 'Salvar'}
                    </Button>
                  )}
                  {/* PR-OC-EDIT-01B — desabilitado em rascunho técnico; motivo via Tooltip padrão do projeto
                      (span envolve o botão para o hover funcionar mesmo desabilitado). */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button type="button"
                            disabled={!!api.acaoOcLoading || !!api.lotesApi?.saving || !!api.ocRascunho}
                            onClick={() => setAcaoConfirm('confirmar')}
                            className="bg-white text-primary font-bold gap-1.5 hover:bg-white/90 disabled:opacity-60">
                            <Check className="h-4 w-4" /> {api.acaoOcLoading === 'confirmar' ? 'Confirmando...' : 'Confirmar negociação e seguir'}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {api.ocRascunho && (
                        <TooltipContent>Complete os dados obrigatórios da negociação antes de confirmar.</TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              {/* So quando NADA e' editavel. Em `fechada` os dados da operacao seguem
                  abertos, e dizer "somente leitura" ao lado de um Salvar habilitado
                  seria contradizer a propria tela. Titulo materializado ja tem o seu
                  aviso proprio, a esquerda do rodape. */}
              {permissoes.dadosOperacaoReadOnly && (
                <span className="text-white/80 text-xs flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Somente leitura</span>
              )}
            </>
          ) : api.somenteLeitura ? (
            <span className="text-white/80 text-xs flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Somente leitura</span>
          ) : (abaAtiva === 'recebimento' || abaAtiva === 'documentos' || abaAtiva === 'financeiro') ? null : abaAtiva === 'negociacao' ? (
            // Fluxo de CRIAÇÃO (Negociação): Salvar rascunho + Concluir lotes e continuar.
            <>
              <Button type="button" variant="secondary"
                disabled={!api.modoOC || !api.ocOperacaoId || !!api.lotesApi?.saving || fluxoNeg !== null}
                onClick={() => api.lotesApi?.salvar()}
                className="gap-1.5"
                title={api.modoOC ? (api.ocOperacaoId ? undefined : 'Salve a operação na aba Compra primeiro') : 'em breve'}>
                {(api.lotesApi?.saving && fluxoNeg === null) ? 'Salvando...' : 'Salvar rascunho'}
              </Button>
              <Button type="button"
                disabled={!api.modoOC || !api.ocOperacaoId || fluxoNeg !== null || !!api.lotesApi?.saving || !!api.recebimentoApi?.saving}
                onClick={handleConcluirLotesContinuar}
                className={`bg-white text-primary font-bold gap-1.5 ${(!api.modoOC || !api.ocOperacaoId) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/90'}`}
                title={api.modoOC ? (api.ocOperacaoId ? undefined : 'Salve a operação na aba Compra primeiro') : 'em breve'}>
                {fluxoNeg === 'salvando' ? 'Salvando lotes...' : fluxoNeg === 'concluindo' ? 'Concluindo...' : (<>Concluir lotes e continuar <ArrowRight className="h-4 w-4" /></>)}
              </Button>
            </>
          ) : (
            <Button onClick={api.handleRequestRegister} disabled={api.submitting || (!api.modoOC && !api.compraDetalhes) || (!!api.modoOC && !api.ocFazendaValida)} className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60">
              <ShoppingCart className="h-4 w-4" />
              {api.submitting ? 'Salvando...'
                : api.modoOC ? (api.ocOperacaoId ? 'Salvar alterações' : 'Salvar e continuar para Negociação')
                : api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
            </Button>
          )}
        </div>
      </div>

      {/* PR-OC-EDIT-01B — confirmação das ações de ciclo. Cancelamento exige motivo (contrato oc_cancelar). */}
      {/* ⚠ `onOpenChange` so fecha quando NAO esta rodando: Esc e clique fora
          ficam inertes durante o estorno. Fechar no meio deixaria o usuario sem
          saber se as movimentacoes voltaram e se o cache foi refeito. */}
      <Dialog open={estornoEtapa !== null}
              onOpenChange={(o) => { if (!o && estornando === null) setEstornoEtapa(null); }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (estornando !== null) e.preventDefault(); }}
                       onEscapeKeyDown={(e) => { if (estornando !== null) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Estornar recebimento</DialogTitle>
            <DialogDescription>
              {estornoEtapa === 1
                ? 'Confira o que será desfeito antes de continuar.'
                : 'Informe o motivo do estorno. Ele fica registrado na auditoria da operação.'}
            </DialogDescription>
          </DialogHeader>

          {estornoEtapa === 1 && (
            <div className="text-[12px] space-y-1.5 leading-snug">
              <p>
                <span className="font-semibold">
                  {(api.recebimentoApi?.movimentacoes ?? []).filter(m => m.cancelado !== true).length}
                </span>{' '}movimentação(ões) de recebimento serão desfeitas, devolvendo{' '}
                <span className="font-semibold">
                  {(api.recebimentoApi?.movimentacoes ?? [])
                    .filter(m => m.cancelado !== true)
                    .reduce((t, m) => t + (m.quantidade ?? 0), 0)}
                </span>{' '}cabeça(s).
              </p>
              <p className="text-muted-foreground">A entrega será reaberta.</p>
              <p className="text-muted-foreground">Os indicadores do rebanho serão recalculados.</p>
            </div>
          )}

          {estornoEtapa === 2 && (
            <textarea
              value={motivoEstorno}
              onChange={(e) => setMotivoEstorno(e.target.value)}
              disabled={estornando !== null}
              rows={3}
              placeholder="Motivo do estorno (obrigatório)"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={estornando !== null}
              onClick={() => setEstornoEtapa(null)}>Voltar</Button>
            {estornoEtapa === 1 ? (
              <Button type="button" onClick={() => setEstornoEtapa(2)}>Continuar</Button>
            ) : (
              <Button type="button" disabled={motivoEstorno.trim() === '' || estornando !== null}
                onClick={async () => {
                  setEstornando('estornando');
                  const ok = await api.recebimentoApi?.estornarTudo(motivoEstorno.trim());
                  setEstornando(null);
                  /* Fecha SO no sucesso. Falhou, o dialogo fica de pe com o motivo
                     digitado — o usuario corrige e tenta de novo sem redigitar.
                     ⚠ NAO navegar de aba: o modal permanece onde estava, e quem
                     decide o proximo passo e' o usuario. */
                  if (ok) setEstornoEtapa(null);
                }}>
                {estornando === 'estornando' ? 'Estornando...'
                  : estornando === 'recalculando' ? 'Recalculando indicadores...'
                  : 'Estornar recebimento'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={acaoConfirm !== null} onOpenChange={(o) => { if (!o) setAcaoConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acaoConfirm === 'confirmar' ? 'Confirmar negociação'
                : acaoConfirm === 'cancelar' ? 'Cancelar operação'
                : 'Reabrir operação'}
            </DialogTitle>
            <DialogDescription>
              {acaoConfirm === 'confirmar' ? 'A operação será fechada. Após confirmar, a negociação passa a somente leitura.'
                : acaoConfirm === 'cancelar' ? 'O cancelamento afeta a operação comercial e não é desfeito por edição. Informe o motivo.'
                : 'A operação fechada volta para programada e poderá ser editada novamente pelas regras vigentes.'}
            </DialogDescription>
          </DialogHeader>
          {(acaoConfirm === 'cancelar' || acaoConfirm === 'reabrir') && (
            <textarea
              value={motivoAcao}
              onChange={(e) => setMotivoAcao(e.target.value)}
              rows={3}
              placeholder={acaoConfirm === 'cancelar' ? 'Motivo do cancelamento (obrigatório)' : 'Motivo (opcional)'}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcaoConfirm(null)}>Voltar</Button>
            <Button
              disabled={acaoConfirm === 'cancelar' && motivoAcao.trim() === ''}
              onClick={async () => {
                const a = acaoConfirm;
                setAcaoConfirm(null);
                if (a === 'confirmar') {
                  // "e seguir": Recebimento e' o proximo passo do trabalho real. So
                  // navega se a confirmacao deu certo — validacao barrada ou conflito
                  // de versao deixam o usuario onde esta, vendo o motivo.
                  const fechou = await api.onConfirmarOC?.();
                  if (fechou) setAbaAtiva('recebimento');
                }
                else if (a === 'cancelar') api.onCancelarOC?.(motivoAcao.trim());
                else if (a === 'reabrir') api.onReabrirOC?.(motivoAcao.trim());
              }}
              className={acaoConfirm === 'cancelar' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              {acaoConfirm === 'confirmar' ? 'Confirmar' : acaoConfirm === 'cancelar' ? 'Cancelar operação' : 'Reabrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo financeiro intocável (Completar Compra) — wiring byte a byte via setters */}
      <CompraDetalhesDialog
        open={api.compraDialogOpen}
        onClose={() => api.setCompraDialogOpen(false)}
        onSave={(det) => {
          api.setCompraDetalhes(det);
          api.setNotaFiscal(det.notaFiscal);
          api.setCompraDialogOpen(false);
        }}
        initialData={api.compraDetalhes || EMPTY_COMPRA_DETALHES}
        quantidade={api.quantidadeNum}
        pesoKg={api.pesoKgNum}
        dataCompra={api.data}
      />
    </div>
  );
}
