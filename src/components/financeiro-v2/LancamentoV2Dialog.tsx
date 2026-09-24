import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
// PR-FIN-STATUS-UX-03A-1 — domínio financeiro (dono único). normalizeStatusTransacao
//   (v2Transferencia, compartilhado) mapeava 'previsto'→'meta'; o modal passa a usar o
//   normalizador próprio do domínio (normalizeStatusModal), sem tocar o compartilhado.
import {
  STATUS_FINANCEIRO_OPCOES_MODAL,
  STATUS_FINANCEIRO_INICIAL,
  deriveStatusFinanceiro as deriveStatus,
  normalizeStatusModal,
} from '@/lib/financeiro/statusFinanceiro';
import { TIPOS_DOCUMENTO, formatNFNumber, extractNFDigits, type TipoDocumento } from '@/lib/financeiro/documentoHelper';
import { useCliente } from '@/contexts/ClienteContext';
import { useLancamentoDocumentos } from '@/hooks/useLancamentoDocumentos';
import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  bloqueiaCancelamentoPeloFinanceiro, MOTIVO_BLOQUEIO_REBANHO,
} from '@/lib/financeiro/cancelamentoLancamento';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { DatePicker } from '@/components/ui/date-picker';
import { ProdutoAutocomplete } from '@/components/shared/ProdutoAutocomplete';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FORMAS_PAGAMENTO_V2, FORMA_PAGAMENTO_V2_NENHUMA } from '@/lib/financeiro/formasPagamentoV2';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { ClassificacaoLancamento, CAMPO_BG, atividadeValida } from '@/components/shared/ClassificacaoLancamento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { computeValidacaoModal, type AbaFinanceira } from './lancamentoDialogTabs';
import { AbaAuditoriaLancamento } from '@/components/financeiro-v2/AbaAuditoriaLancamento';
import { AlertCircle, AlertTriangle, Copy, KeyRound, RefreshCw, DollarSign, FileText, Beef, Repeat, Loader2 } from 'lucide-react';
import { LancamentoZooModal } from '@/v2/components/edicao/LancamentoZooModal';
import { toast } from 'sonner';
import { mensagemDoErro } from '@/lib/supabase/mensagemDoErro';
import { useQueryClient } from '@tanstack/react-query';
/* PAR-02 — a montagem do payload e a previa, compartilhadas com a tela de Parcelamentos. */
import { montarPayloadParcelamento, preverParcelas } from '@/lib/financiamentos/montarPayloadParcelamento';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ExcelContext } from '@/v2/lib/mesa/buildExcelContext';
import { planoDeTransferencia, ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { ATIVIDADES, lembrarAtividade, ultimaAtividade, type Atividade } from '@/lib/financeiro/ultimaAtividade';
import { safraSugerida } from '@/lib/agri/safraSugerida';
import { conflitoSafraEscopo, mensagemConflitoSafraEscopo } from '@/lib/financeiro/safraEscopo';
import { escopoDoSubcentro, fazendaAdministrativa, AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';
import {
  CULTURAS_LANCAMENTO, FASES, SEM_CULTURA, avisoCultura, avisoFase,
  culturaParaGravar, faseParaGravar,
} from '@/lib/agri/rateioLancamento';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';

interface Props {
  open: boolean;
  /**
   * OS CATÁLOGOS AINDA NÃO CHEGARAM — esqueleto no corpo e Salvar travado.
   *
   * ⚠ ELA NASCEU DE DADO PERDIDO, não de estética. `contas`, `fornecedores` e `safras` chegam
   * VAZIOS enquanto os `load*` do `useFinanceiroV2` não rodam, e lista vazia é lista válida:
   * nenhum tipo acusa. O formulário abria com "Selecione fornecedor…", Conta em branco e
   * "Nenhuma safra cadastrada" num lançamento que tinha os três — e Salvar gravava nulo por
   * cima. Ver o caso no `AgriDreLavouraTab` (PR-DRE-LAVOURA-05).
   * ⚠ OPCIONAL E `false` POR OMISSÃO: nenhum chamador existente muda de comportamento.
   */
  carregando?: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
  /**
   * ⚠ O SEGUNDO ARGUMENTO É ADITIVO — PR-CPR-2A.4. O diálogo passou a PEDIR um motivo na
   * confirmação, e quem sabe o que fazer com ele é o chamador: a CPR manda para o `p_motivo`
   * da `fn_cancelar_lancamento_auditoria`; os chamadores antigos recebem `(id)` como sempre e
   * ignoram o resto. Nenhum deles mudou de comportamento.
   */
  onDelete?: (id: string, motivo?: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  safras?: Safra[];
  defaultFazendaId?: string;
  onCriarFornecedor: (nome: string, fazendaId: string, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  // PR-OC-FIN-EDIT-FIX-02 — favorecido de título OC só é editável quando a edição vem da aba Financeiro
  //   da OC (ação Editar da Programação). Default false = bloqueado no Financeiro V2 direto.
  permiteEditarFavorecidoOC?: boolean;
  // navegação SPA para abrir a OC vinculada na aba Financeiro (preserva contexto; substitui o reload).
  onAbrirOperacaoOC?: (operacaoId: string, tipo?: string | null) => void;
  prefill?: {
    fazenda_id?: string;
    conta_bancaria_id?: string;
    conta_destino_id?: string;
    data_pagamento?: string;
    data_competencia?: string;
    valor?: number;
    tipo_operacao?: string;
    status_transacao?: string;
    descricao?: string;
    numero_documento?: string;
    // PR-Mesa-CreateFromExcel-A: classificação canônica vinda da Mesa
    // de Classificação Excel. Todos opcionais — modal continua funcionando
    // idêntico nos usos atuais (OFX órfão etc.).
    favorecido_id?: string;
    subcentro?: string;
    macro_custo?: string;
    grupo_custo?: string;
    centro_custo?: string;
    plano_conta_id?: string;
    /**
     * Safra e vencimento sugeridos — CUSTEIO-TXT (121e).
     *
     * ⚠ O VENCIMENTO VAZIO CONTINUA SENDO O PADRÃO. O PR-FIN-MODAL-VENCIMENTO-02B decidiu
     * que o prefill NÃO auto-preenche vencimento, e essa decisão vale para todos os
     * chamadores que não pedem: sem a chave, o campo abre vazio como antes. Quem passa o
     * valor é quem SABE a regra do seu fluxo — no custeio, competência para Realizado e
     * competência + 30 para Previsto. Trocar o default machucaria o extrato e a mesa.
     */
    safra_id?: string;
    data_vencimento?: string;
  };
  /**
   * Esconde o bloco de Frequência/Modalidade/Parcelas.
   *
   * ⚠ NASCE DE UM FATO, NÃO DE ESTÉTICA: um lançamento criado a partir de um
   * movimento do extrato é UM pagamento que JÁ ACONTECEU. Gerar parcelas futuras
   * ou recorrência a partir dele criaria títulos que ninguém pagou e que nenhum
   * movimento cobre. Sem a prop, o bloco aparece como sempre.
   */
  ocultarParcelamento?: boolean;
  lockedFields?: Array<
    | 'valor'
    | 'data_pagamento'
    | 'conta_bancaria_id'
    | 'conta_destino_id'
    | 'tipo_operacao'
  >;
  // PR2.2 — Box informativo (read-only) com dados da referência operacional
  // que originou esta criação. Puramente visual: NÃO resolve UUIDs por nome.
  // Operador continua escolhendo fornecedor/fazenda/plano oficial manualmente.
  // Sem essa prop, o componente se comporta idêntico ao atual.
  referenciaOperacionalInfo?: {
    fornecedor_texto?: string | null;
    fazenda_texto?: string | null;
    plano_texto?: string | null;
    centro_texto?: string | null;
    produto_texto?: string | null;
    observacao?: string | null;
    valor?: number | null;
    data_referencia?: string | null;
  };
  // PR-Mesa-ExcelContext — contexto read-only "Contexto Excel / Sugestão"
  // exibido em painel lateral quando o dialog é aberto a partir da Mesa
  // Classificação Excel. Ausente nos demais usos → layout idêntico ao atual.
  excelContext?: ExcelContext | null;
}

const TIPOS_OPERACAO = [
  { value: '1-Entradas', label: 'Entradas' },
  { value: '2-Saídas', label: 'Saídas' },
  { value: '3-Transferências', label: 'Transferências' },
];

// PR-FIN-MODAL-02B — abas do modal (labels compactos para a TabsList).
// PR-FIN-MODAL-02E — a aba visual "Classificação" foi INCORPORADA à aba "Geral"
// (Linha 4). A validação por aba (helper puro) segue com 'classificacao' como
// dimensão lógica; aqui ela apenas não é mais uma aba visível. Evolução futura:
// Geral | Pagamento | Documentos | Auditoria.
// PR-FIN-AUDIT-01 — a aba Auditoria deixou de ser promessa: o conteúdo real chegou e o
// `<span>` inerte saiu. `'auditoria'` NÃO entra em `AbaFinanceira` de propósito — aquele
// tipo é o da VALIDAÇÃO, e uma aba de leitura não tem campo para validar; incluí-la
// obrigaria `validaPorAba` a inventar um `true` que não significa nada.
type AbaVisual = AbaFinanceira | 'auditoria';
const ABAS_TAB: { value: AbaVisual; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'auditoria', label: 'Auditoria' },
];

// PR-FIN-STATUS-UX-03A-1 — opções do modal e deriveStatus vêm do domínio único
//   (statusFinanceiro.ts): previsto/agendado/programado/realizado; sem Meta, sem Conciliado.
const STATUS_OPTIONS = STATUS_FINANCEIRO_OPCOES_MODAL;

function formatNotaFiscal(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

/** Format number to BRL string with 2 decimals */
function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse BRL string back to number */
function parseBRL(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── PR-Mesa-ExcelContext: subcomponentes read-only do painel lateral ───
function ExcelCtxRow({ label, value, block }: { label: string; value: string | null; block?: boolean }) {
  if (block) {
    return (
      <div>
        <div className="text-muted-foreground">{label}:</div>
        <div className="font-medium break-words">{value ?? '—'}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium text-right break-words">{value ?? '—'}</span>
    </div>
  );
}

function ExcelCtxConta({
  label,
  conta,
}: {
  label: string;
  conta: { sistemaNome: string | null; excelTexto: string | null };
}) {
  const vazio = !conta.sistemaNome && !conta.excelTexto;
  return (
    <div>
      <div className="text-muted-foreground">{label}:</div>
      {vazio ? (
        <div className="font-medium">—</div>
      ) : (
        <>
          <div className="font-medium break-words">{conta.sistemaNome ?? conta.excelTexto}</div>
          {conta.sistemaNome && conta.excelTexto && (
            <div className="text-[10px] text-muted-foreground break-words">
              origem Excel: {conta.excelTexto}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PR-FIN-MODAL-02D — Painel lateral de RESUMO (SOMENTE LEITURA; ESPELHA o LancamentoV2Form) ───
//   Camada EXCLUSIVAMENTE de apresentação: apenas reflete os valores atuais do formulário.
//   NÃO infere status/completude (sem semáforo/bolinhas) — indicador de pendência só quando existir
//   fonte oficial e única de validação (frente futura). Títulos de bloco neutros; vazio → "—".
// Faixa horizontal discreta de título (ocupa toda a largura interna do aside — que não tem
// padding horizontal; as linhas é que recebem px-3). Fundo distinto do corpo, altura mínima.
function ResumoBlocoHead({ titulo }: { titulo: string }) {
  // PR-FIN-MODAL-02I — densidade funcional do 02G: separação MÍNIMA entre blocos (mt-0.5),
  // primeiro cabeçalho sem mt (first:mt-0). Altura mínima suficiente (py-0.5). MESMA aparência
  // e hierarquia: bg-primary/10, borda e tipografia 9px bold uppercase inalteradas.
  return (
    <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-primary/90 leading-none">{titulo}</span>
    </div>
  );
}
function ResumoRow({ label, value, valueClassName }: { label: string; value: string | null; valueClassName?: string }) {
  // PR-FIN-MODAL-02I — o ganho de altura do 02H é usado p/ CABER tudo, não p/ tipografia:
  // volta à densidade do 02G (gap-1.5 + leading-tight; fonte text-[10px] via base do aside).
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("font-medium text-right truncate", valueClassName)}>{value || '—'}</span>
    </div>
  );
}

/** Add N days to a date string (YYYY-MM-DD) */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add N months to a date string, clamping to valid day */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setMonth(targetMonth, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Get month label in pt-BR */
function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

/* ⚠ `ParcelaRow` E `generateParcelas` MORRERAM AQUI — PAR-02, e eram o WRITER, não uma prévia.
   A grade que o operador editava virava, linha a linha, N lançamentos soltos pelo laço do
   salvar. Quem calcula as parcelas agora é a RPC, e quem as MOSTRA é `preverParcelas`
   (`lib/financiamentos/montarPayloadParcelamento`), que espelha a aritmética dela.
   ⚠ AS TRÊS DIVERGÊNCIAS QUE A FUNÇÃO ANTIGA TINHA, e que faziam a tela prometer o que o banco
   não gravava: `addDays(i * 30)` em vez de mês de verdade (num plano de 8x o dia derivava de 6
   para 2), `Math.floor` onde a RPC usa `round`, e a data escalonada indo para o PAGAMENTO sob
   um cabeçalho escrito "Vencimento".
   ⚠ NÃO CONFUNDIR COM AS QUATRO `gerarParcelas` HOMÔNIMAS do repo (AbateFinanceiroPanel,
   VendaFinanceiroPanel, BoitelPlanningDialog e useFinanciamentoCadastro): são funções próprias,
   de outras telas, e nenhuma foi tocada. */

export function LancamentoV2Dialog({
  open, carregando, onClose, onSave, onDelete, lancamento, fazendas, contas, classificacoes,
  fornecedores, safras, defaultFazendaId, onCriarFornecedor, prefill, lockedFields,
  ocultarParcelamento,
  referenciaOperacionalInfo, excelContext, permiteEditarFavorecidoOC, onAbrirOperacaoOC,
}: Props) {
  const { clienteAtual } = useCliente();
  const qc = useQueryClient();
  /* ⚠ OS DOCUMENTOS SÓ EXISTEM DEPOIS QUE O LANÇAMENTO EXISTE: as RPCs recebem
     `p_lancamento_id`, e num lançamento novo não há id para anexar nada. Por isso o hook
     nasce desligado (`null`) e a aba diz o que fazer, em vez de oferecer um botão que
     recusaria no servidor. */
  const documentosApi = useLancamentoDocumentos(lancamento?.id ?? null, clienteAtual?.id ?? null);
  const navigate = useNavigate();
  const isEdit = !!lancamento;
  // PR-SAFE-0 — título originado da Operação Comercial: valor/favorecido/classificação/tipo
  //   são somente leitura (edição estrutural pertence à OC). Detecção ESTRUTURAL pelo marcador
  //   de proveniência persistido (origem_lancamento), nunca por texto de UI. O writer
  //   (useFinanceiroV2.editarLancamento) aplica a mesma proteção de forma independente.
  const isOCTitulo = isEdit && lancamento?.origem_lancamento === 'operacao_comercial';
  /* ⚠ `permiteEditarFavorecidoOC` DEIXOU DE SER CONDICAO — FIN-FORNECEDOR-OC-EDIT (B-19).
     O favorecido passou a ser editavel nos DOIS caminhos; a prop continua no contrato
     porque e' por ela que a aba Financeiro da OC declara a sua abertura, e remove-la
     mexeria no `FinanceiroV2Tab` por um motivo que nao e' deste PR. Ver a nota inteira no
     campo Fornecedor. */
  void permiteEditarFavorecidoOC;
  // Store the editing ID in a ref so it can't become stale during async save
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = lancamento?.id ?? null;
  }, [lancamento]);
  const [saving, setSaving] = useState(false);
  /* A confirmação do cancelamento e o motivo que ela coleta — PR-CPR-2A.4. */
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);
  // PR-FIN-MODAL-02B — aba ativa (Tabs controlado). Vive no pai; nenhum estado de campo é
  // duplicado por aba. Redefinida para 'geral' na hidratação (abrir/trocar de registro).
  const [abaAtiva, setAbaAtiva] = useState<AbaVisual>('geral');

  /* Os catálogos da trilha saem das props que o modal já recebe — nenhuma consulta a mais
     para trocar um UUID por um nome. */
  const catalogosAuditoria = useMemo(() => ({
    fornecedor: (id: string) => fornecedores.find((f) => f.id === id)?.nome,
    /* `nome_exibicao` é o rótulo que o operador vê nos seletores; `nome_conta` é o
       cadastro. A frase usa o mesmo nome que a tela mostra em todo lugar. */
    conta: (id: string) => { const c = contas.find((x) => x.id === id); return c?.nome_exibicao ?? c?.nome_conta; },
    fazenda: (id: string) => fazendas.find((f) => f.id === id)?.nome,
  }), [fornecedores, contas, fazendas]);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);
  // FASE 1 zoo-fin: aviso de origem zootécnica + navegação para LancamentoZooModal.
  // zooModalId é capturado ao clicar no link âmbar; abre só após o V2Dialog
  // desmontar (setTimeout pequeno) para evitar stacking de dois modais editáveis.
  const [zooModalId, setZooModalId] = useState<string | null>(null);
  const handleAbrirZoo = () => {
    if (!lancamento?.movimentacao_rebanho_id) return;
    const idZoo = lancamento.movimentacao_rebanho_id;
    onClose();
    setTimeout(() => setZooModalId(idZoo), 100);
  };

  // Fornecedor search state
  // PR-U2c-1C: seletor de Fornecedor migrou p/ <FavorecidoSelect />. `fornecedorSearch`
  // permanece controlado aqui pois o SAVE reaproveita o texto p/ auto-criar fornecedor.
  const [fornecedorSearch, setFornecedorSearch] = useState('');

  // Installment state
  const [formaPagamentoParc, setFormaPagamentoParc] = useState<'avista' | 'parcelada'>('avista');
  /**
   * Nº de parcelas — 133i-b item 5.
   *
   * ⚠ DOIS ESTADOS, E É O QUE PERMITE DIGITAR "10". O campo guardava só o número e o
   * `onChange` clampava a CADA TECLA: para chegar a 10 o operador digita "1", que é menor
   * que o mínimo 2, e o clamp o transformava em 2 antes do "0" existir. O 10 era
   * inalcançável pelo teclado — só pelas setinhas, uma a uma.
   * ⚠ O TEXTO É O QUE O CAMPO MOSTRA; o número é o que a grade usa, e ele só muda no
   * blur/Enter. Assim a grade não se refaz a cada tecla sobre um valor intermediário.
   * ⚠ O IDIOMA JÁ EXISTE NO REPO, em quatro telas (`AbateFinanceiroPanel`,
   * `VendaFinanceiroPanel`, `CompraFinanceiroPanel`, `AbateDetalhesDialog`): elas guardam a
   * string e derivam o número. Aqui é a mesma coisa, com o clamp adiado.
   */
  const [numParcelas, setNumParcelas] = useState(2);
  const [numParcelasTexto, setNumParcelasTexto] = useState('2');
  /** Aplica o mínimo/máximo — só no blur/Enter, nunca a cada tecla. */
  const fecharNumParcelas = () => {
    const n = Math.max(2, Math.min(24, parseInt(numParcelasTexto, 10) || 2));
    setNumParcelas(n);
    setNumParcelasTexto(String(n));
  };
  /* ⚠ DERIVADO, NÃO ESTADO — PAR-02. Era `useState` porque a grade era editável e o que
     estivesse nela ia para o banco. Agora ela só mostra o que a RPC vai gravar, então manter
     uma cópia em estado seria abrir espaço para a tela e o banco discordarem de novo. */

  // Frequency state

  const [fazendaId, setFazendaId] = useState('');
  /* ⚠ SÓ PARA A `key` DO CLUSTER — ver o comentário na montagem dele. Incrementa a cada
     abertura, que é o gesto em que os estados de interação da classificação precisam zerar. */
  const [aberturaSeq, setAberturaSeq] = useState(0);

  /**
   * A CLASSIFICAÇÃO INTEIRA, NUM OBJETO SÓ — PAR-01a-i, passo 1 de 2 do extract.
   *
   * ⚠ ERAM DEZ `useState` SOLTOS, e a soltura era o problema: a regra que os governa é
   * CRUZADA — trocar a atividade limpa o subcentro de outro escopo e a safra cruzada; escolher
   * um subcentro sobrescreve a atividade; administrativo limpa a safra e trava a fazenda. Dez
   * estados independentes para um dado que se move junto é o convite para o próximo PR mexer em
   * nove e esquecer o décimo.
   * ⚠ OS NOMES SÃO OS DO SAVE (`safra_id`, `macro_custo`, …), não os das variáveis antigas: é
   * este objeto que vai virar o `value` do `ClassificacaoLancamento` no PAR-01a-ii, e renomear
   * na passagem seria trocar duas coisas de uma vez.
   * ⚠ E OS TRÊS ESTADOS DE INTERAÇÃO FICARAM DE FORA — `safraSugeridaId`, `safraEditadaAMao` e
   * `subcentroLimpoPelaAtividade`. Eles não são dado gravado: são memória de quem está
   * digitando, e é ela que coordena a sugestão de safra com a hidratação. Misturá-los ao dado
   * faria o `value` do componente carregar estado de interação.
   */
  const [classificacao, setClassificacao] = useState<{
    atividade: Atividade | null;
    safra_id: string;
    cultura: string;
    fase: string;
    subcentro: string;
    macro_custo: string;
    grupo_custo: string;
    centro_custo: string;
    escopo_negocio: string;
    plano_conta_id: string | null;
  }>({
    atividade: null, safra_id: '', cultura: '', fase: '',
    subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
    escopo_negocio: '', plano_conta_id: null,
  });

  /* ⚠ AS LEITURAS CONTINUAM PELOS MESMOS NOMES, e é de propósito: são mais de noventa pontos
     que apenas LEEM esses campos (no JSX, no payload do save, nas validações). Trocar os
     noventa junto com os trinta que escrevem misturaria a mudança de forma com a chance de
     errar um. Aqui muda o ESTADO; os nomes de leitura ficam onde estavam. */
  const {
    atividade, safra_id: safraId, cultura, fase, subcentro,
    macro_custo: macroCusto, grupo_custo: grupoCusto, centro_custo: centroCusto,
    escopo_negocio: escopoNegocio, plano_conta_id: planoContaId,
  } = classificacao;
  /**
   * O CARD "ATIVIDADE" É PRÉ-FILTRO, NÃO DADO — PR-FIN-ATIVIDADE-01 (decisão D13).
   *
   * ⚠ NÃO GRAVA NADA. O `escopo_negocio` do lançamento continua vindo do plano, pelo
   * trigger `resolve_classificacao_from_plano`. Este estado só encolhe a lista do subcentro.
   * ⚠ ESTE É O PONTO EM QUE O ESCOPO PASSA A TER DUAS ORIGENS, e a precedência é fixa: o
   * card FILTRA, o plano MANDA. Quem escolhe um subcentro leva o escopo dele — e o card se
   * ajusta ao que veio. Nunca o contrário. Acontece com a lista completa (sem card) e ao
   * editar um lançamento cujo plano mudou de escopo depois de gravado; nos dois casos o
   * dado gravado vence a preferência de quem está olhando.
   */
  /* CULTURA (lavoura) e FASE (pecuária) — AGRI-MODAL-CULTURA-01. Vazio é escolha: significa
     compartilhado, e a frase abaixo do campo diz isso. */
  /**
   * A SAFRA SE SUGERE, MAS NÃO SE IMPÕE — PR-FIN-ATIVIDADE-01b.
   *
   * ⚠ DOIS ESTADOS PARA UMA COISA SÓ, e cada um responde uma pergunta diferente:
   * `safraSugeridaId` é "este valor foi posto por mim ou escolhido por ele?" — é o que
   * permite substituir a sugestão quando a data muda sem apagar uma escolha; e
   * `safraEditadaAMao` é "ele já disse o que quer?" — a partir daí a sugestão cala até o
   * modal fechar. Sem o segundo, escolher a safra e depois corrigir a data desfaria a
   * escolha, e o operador teria de escolher de novo sem entender por quê.
   */
  /**
   * O subcentro com que o modal ABRIU — PR-FIN-DRE-BADGE-01.
   *
   * ⚠ NÃO É REDUNDANTE COM `lancamento.subcentro`: o valor de abertura pode vir do plano da
   * transferência (que o modal resolve ao abrir) e não do que está gravado. O badge precisa
   * saber se o operador MEXEU, e mexer é diferente de divergir do banco.
   */
  const [subcentroDeAbertura, setSubcentroDeAbertura] = useState('');

  /* O plano tem escopos que o card não oferece (vazio, e os legados). Marcar uma pílula que
     não existe deixaria o card em branco filtrando por algo — pior que não filtrar. */
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');   // PR-FIN-MODAL-VENCIMENTO-02B
  const [dataPagamento, setDataPagamento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  /**
   * A chave da linha do plano escolhida — PR-FIN-PLANO-CHAVE-02 (front).
   *
   * ⚠ ANDA COLADO NO `subcentro`: todo ponto que mexe num mexe no outro (escolher no
   * seletor, trocar o tipo, trocar a atividade, abrir para editar, prefill, reset). Mandar
   * a chave de uma conta com o texto de outra é o único jeito de este PR fazer estrago —
   * o trigger obedece à chave quando ela muda, e reescreveria o texto por cima.
   * ⚠ `null` É VÁLIDO E ACONTECE: subcentro legado (sem linha no plano) e dividendo (cuja
   * entrada é sintetizada por cliente) não têm chave. O trigger resolve os dois pelo texto.
   */
  // FIN-MODAL-FECHO-01 item 2 — operacao_id + tipo resolvidos pelo vínculo zoo_operacao_partes
  // (somente leitura). O link "Abrir operação" só é exibido para tipos que possuem fluxo soberano
  // de abertura implementado (hoje: compra — CompraModalShell/PR-OC-COMPRA-OPEN-01). Venda/abate
  // ainda não têm abridor de operação OC → botão NÃO é exibido (evita botão morto).
  const [operacaoId, setOperacaoId] = useState<string | null>(null);
  const [operacaoTipo, setOperacaoTipo] = useState<string | null>(null);
  /* ⚠ ERA `operacaoTipo === 'compra'` — OC-BOITEL-VALOR-01 · B3. A restricao existia porque
     `abrirOperacaoOC` assume COMPRA por omissao (V2Index: `tipo: string = 'compra'`), e abrir uma
     venda por ali devolvia `oc_compra=1`, que a hidratacao recusa. O conserto foi passar o TIPO
     que este modal ja resolve, em vez de esconder o link: numa venda de boitel — justamente a que
     motivou esta frente — o operador via "classificacao pertence a OC" e nao tinha como chegar la. */
  const operacaoAbrivel = !!operacaoId && !!operacaoTipo;
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState<string>(STATUS_FINANCEIRO_INICIAL);   // PR-FIN-STATUS-UX-03A-1 — inicial 'previsto' (era 'meta')
  // PR-FIN-STATUS-UX-03A-1 — anti-reclassificação silenciosa do legado 'meta':
  //   statusOriginalRef = valor de status_transacao REALMENTE persistido no registro carregado (null p/ novo);
  //   statusTouchedRef  = o usuário escolheu explicitamente outro valor no Select nesta abertura?
  //   Ambos resetados a cada abertura no effect de init; statusTouchedRef só é ligado no onValueChange do Select.
  const statusOriginalRef = useRef<string | null>(null);
  const statusTouchedRef = useRef(false);
  const [valorDisplay, setValorDisplay] = useState('0,00');
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | ''>('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');

  // Payment method fields
  const [formaPgto, setFormaPgto] = useState('');
  const [dadosPagamento, setDadosPagamento] = useState('');

  // Product suggestions state
  // PR-U2c-1A: sugestões de Produto migraram para <ProdutoAutocomplete />.

  // PR-U2c-1D: seletor de Subcentro migrou p/ <PlanoSubcentroSelect />. `subcentroSearch`
  // permanece controlado aqui pois o reset ao trocar tipo_operacao o usa.

  const isTransferencia = tipoOperacao === '3-Transferências';
  const isEntrada = tipoOperacao === '1-Entradas';

  /**
   * A conta do plano de uma transferência é uma só — PR-MESA-TRANSF-01 item 3.
   *
   * ⚠ O MESMO CONTRATO DA MESA, E ESSA É A RAZÃO DE EXISTIR. Aqui o campo era livre: dava
   * para gravar uma transferência entre contas classificada em "Manutenção de Máquinas", e
   * o movimento entrava na DRE como despesa — dinheiro que só mudou de conta virando
   * resultado. A Mesa passou a forçar a 18010; se este modal continuasse livre, o mesmo
   * lançamento teria duas regras conforme a porta por onde entrou.
   * ⚠ SE O CATÁLOGO AINDA NÃO CHEGOU, NÃO FORÇA NADA (`null`): travar um campo sobre um
   * valor que não se sabe qual é seria pior que deixá-lo livre.
   */
  const planoTransferencia = useMemo(
    () => planoDeTransferencia(classificacoes), [classificacoes]);
  const subcentroTravado = isTransferencia && !!planoTransferencia;

  /**
   * A classificação que VAI NO PAYLOAD — PR-FIN-TRANSF-SUBCENTRO-01.
   *
   * ⚠ CINTO E SUSPENSÓRIO, e de propósito. O estado já é normalizado ao abrir e ao trocar o
   * tipo, mas as duas dependem de `classificacoes` estar carregada — e ela chega assíncrona.
   * Abrir o modal antes do plano terminar de carregar deixaria o estado com o valor velho e
   * nenhum dos dois caminhos o corrigiria. Aqui é o último ponto antes de gravar, e a
   * verdade da transferência é uma só.
   * ⚠ RESOLVIDA POR `ordem_exibicao` (18010), nunca pelo texto: o nome tem acentos e um dia
   * alguém os corrige.
   */
  const classificacaoParaGravar = () => {
    if (!isTransferencia || !planoTransferencia) {
      return {
        subcentro, macro_custo: macroCusto, grupo_custo: grupoCusto,
        centro_custo: centroCusto, escopo_negocio: escopoNegocio || undefined,
        /* ⚠ A CHAVE SAI DAQUI, e só daqui — PR-FIN-PLANO-CHAVE-02 (front). Os DOIS saves
           deste modal (o à vista/edição e o laço das parcelas) montam o form com
           `...classificacaoParaGravar()`, então a chave e o texto nascem do mesmo lugar e
           não há como um caminho mandar um par que não combina. */
        plano_conta_id: planoContaId,
      };
    }
    return {
      subcentro: planoTransferencia.subcentro,
      macro_custo: planoTransferencia.macro_custo,
      grupo_custo: planoTransferencia.grupo_custo || '',
      centro_custo: planoTransferencia.centro_custo,
      escopo_negocio: planoTransferencia.escopo_negocio || undefined,
      /* A chave da 18010, pela mesma razão que o texto dela: a transferência tem uma
         resposta só, e ela é a linha do plano — não o que estava gravado. */
      plano_conta_id: planoTransferencia.id ?? null,
    };
  };

  /**
   * Trocar o tipo de operação — e o que isso arrasta.
   *
   * ⚠ ERA UMA LINHA DE CINCO `set` NO JSX, e ela zerava a classificação de propósito: cada
   * tipo tem a sua subárvore no plano, e o subcentro do tipo anterior não vale no novo.
   * O que mudou é que "Transferência" não zera — ela FIXA, porque só existe uma resposta.
   * ⚠ ESCOPO SÓ NO RAMO DA TRANSFERÊNCIA: no ramo antigo ele nunca foi tocado, e mexer
   * nele aqui seria mudar comportamento por fora do que este PR pede.
   */
  /**
   * ⚠ TROCAR A ATIVIDADE LIMPA O SUBCENTRO DE OUTRO ESCOPO, e não escolhe outro no lugar.
   * Escolher por conta própria seria classificar o lançamento por dedução — e uma
   * classificação que ninguém conferiu é pior que um campo vazio, porque não pede
   * conferência. O campo fica destacado dizendo o que aconteceu.
   */

  /**
   * As culturas que existem em campo naquela safra — AGRI-MODAL-CULTURA-01/02.
   *
   * ⚠ ELAS ORDENAM, NUNCA FILTRAM — e o 01 errou nisso. Filtrar pela área cadastrada escondeu
   * "Mandioca" de um lançamento de "Catação de Raiz - Mandioca" na 25/26, porque a única área
   * plantada da safra era de amendoim: o operador ficou sem como classificar um custo que
   * existe. O custo chega ANTES do talhão — o adubo é comprado em agosto e a área se cadastra
   * em outubro —, então a lista de escolha é sempre a completa.
   * ⚠ O QUE SOBRA DO ESTREITAMENTO É O ATALHO: quem já tem área na safra vem primeiro, com a
   * marca de plantada. A informação era útil; o que não podia era virar filtro.
   * ⚠ E A FRASE DO RATEIO CONTINUA NOMEANDO SÓ AS PLANTADAS, porque ali o recorte é correto:
   * o rateio distribui entre as culturas que têm área, não entre as que se pode escolher.
   */
  /**
   * AS SAFRAS DA ATIVIDADE ESCOLHIDA — AGRI-MODAL-CULTURA-02 item 1.
   *
   * ⚠ O DROPDOWN MOSTRAVA AS 46, MISTURADAS: um lançamento de Lavoura oferecia "21/22
   * Pecuária" ao lado de "23/24 Lavoura". Não era só ruído — o save RECUSA a combinação
   * (PR-FIN-SAFRA-ESCOPO-01 valida safra × escopo), então a lista oferecia opções que o
   * sistema depois rejeitava. Mostrar o impossível é convidar a testá-lo, e é a mesma regra
   * que o filtro da lista já aplica.
   * ⚠ SEM ATIVIDADE ESCOLHIDA, A LISTA É INTEIRA: o card vazio não é um recorte, é a ausência
   * dele.
   * ⚠ A SAFRA JÁ SELECIONADA NUNCA SOME, ainda que seja de outro escopo. Abrir um lançamento
   * antigo com a combinação cruzada e ver o campo em branco faria parecer que o dado se
   * perdeu — e o que se quer ali é justamente VER o que está gravado para poder corrigir.
   * (Medido: hoje nenhuma safra tem escopo nulo; 37 são de pecuária e 9 de lavoura.)
   */
  const culturasDaSafra = useCulturasDaSafra(safraId || null);

  /* ⚠ AS CANDIDATAS SAÍRAM DAQUI — FIN-SAFRA-ORDEM-02. Elas existiam só para serem
     empilhadas no topo do dropdown; a SUGESTÃO nunca dependeu desta lista: `safraSugerida`
     chama `safrasCandidatas` por dentro, e continua. */

  /**
   * ⚠ NUNCA DEVOLVE O UUID — FIN-AUDITORIA-CULTURA-01 item 2. Ele devolvia: `?? id`. E o
   * caminho não era teórico — ficou provável HOJE: `loadSafras` só traz `ativa = true`, e a
   * consolidação de 12/09 inativou cinco safras por cultura. Qualquer lançamento que ainda
   * aponte para uma delas não acha o nome, e o `title` do campo passava a exibir
   * "5df2fb02-d2df-…" para o operador — regra da casa: UUID não vai à tela.
   * ⚠ E O RÓTULO DIZ O QUE HOUVE, em vez de um traço mudo: "safra inativa" explica por que o
   * campo parece vazio num lançamento que tem safra gravada.
   */

  /**
   * O escopo que o PLANO diz sobre o subcentro escolhido — PR-FIN-SAFRA-ADM-01.
   *
   * ⚠ O PLANO, NÃO O ESTADO `escopoNegocio`. O estado é cópia do que veio na abertura, e
   * cópia pode estar velha se o plano mudou desde então — é a mesma razão pela qual a
   * validação do save já resolvia o escopo assim. Aqui a resolução vira uma só, e a tela
   * passa a decidir pela mesma fonte que o save.
   * ⚠ O FALLBACK PARA O ESTADO É PARA O SUBCENTRO LEGADO, que não tem linha no plano: ali o
   * que está gravado é tudo que se sabe.
   */
  /* ⚠ A CONTA SAIU DAQUI para `escopoDoSubcentro` — MESA-SAFRA-ADM-01. Ela era um `useMemo`
     local, e por isso a Mesa de Enriquecimento não a tinha: a mesma regra valia numa tela e
     não na outra. O comportamento aqui não mudou em nada. */
  const escopoDoPlano = useMemo(
    () => escopoDoSubcentro(classificacoes, subcentro, escopoNegocio),
    [subcentro, classificacoes, escopoNegocio]);

  /**
   * ADMINISTRATIVO NÃO TEM SAFRA — PR-FIN-SAFRA-ADM-01 (decisão do Gabriel, 11/09/2026).
   *
   * ⚠ AS DUAS PORTAS CONTAM, e por isso o `||`: o card sozinho basta (marcar Administrativo
   * antes de escolher a conta já desabilita o campo), e o plano sozinho também (escolher uma
   * conta administrativa com a lista completa move o card e desabilita junto — a precedência
   * do plano sobre o card, que já valia para o escopo).
   * ⚠ MEDIDO NO PROTO: 2.143 dos 21.368 lançamentos administrativos ainda têm safra. São
   * eles que abrem com o campo riscado, e a limpeza em massa é frente do banco.
   */
  const ehAdministrativo = escopoDoPlano === 'administrativo' || atividade === 'administrativo';

  /**
   * A safra que VAI NO PAYLOAD — e é o mesmo par do `classificacaoParaGravar`.
   *
   * ⚠ OS DOIS SAVES PASSAM POR AQUI (o à vista/edição e o laço das parcelas), e a VALIDAÇÃO
   * confere ESTE valor, não o estado. A diferença importa no caso 3 do briefing: um
   * lançamento administrativo gravado COM safra abre mostrando a safra riscada — o estado
   * continua preenchido de propósito, para o operador ver o que vai sair —, e validar o
   * estado recusaria justamente a gravação que corrige o dado.
   */
  const safraParaGravar = (): string | null => (ehAdministrativo ? null : (safraId || null));

  /**
   * ADMINISTRATIVO NÃO TEM FAZENDA ESPECÍFICA — FIN-FAZENDA-ADM-01 (Gabriel, 11/09/2026).
   *
   * ⚠ MESMO CRITÉRIO DA SAFRA, uma linha abaixo dela de propósito: quem serve a empresa toda
   * não se aloca numa fazenda. O que muda entre os dois campos é o destino — a safra vai a
   * NULO e a fazenda vai à fazenda "Administrativo" do cliente, porque é o que o dado diz
   * (zero administrativos com fazenda nula, medido) e porque o save EXIGE fazenda.
   * ⚠ DIVIDENDOS CONTINUA ENTRANDO, agora pela porta de cima: o `macroCusto === 'Dividendos'`
   * que estava aqui sozinho vira a segunda porta, para o dividendo cujo subcentro é por
   * cliente e não tem linha no plano.
   */
  const fazendaTravadaAdm = ehAdministrativo || macroCusto === 'Dividendos';

  /**
   * ⚠ SUGERE AO MUDAR ATIVIDADE OU COMPETÊNCIA, e só quando o campo está livre: vazio, ou
   * ainda com a sugestão anterior. Um campo escolhido à mão é decisão tomada.
   * ⚠ ADMINISTRATIVO NUNCA SUGERE (OC_013): safra em administrativo é regra do backfill,
   * pelo que o plano aponta — não do modal.
   * ⚠ E COM EMPATE NÃO ESCOLHE (`desempatar: false`). No import em lote a política é outra,
   * e é por isso que ela é opção da função e não regra dela: lá campo vazio vira lançamento
   * sem safra que ninguém revisa; aqui o operador está olhando o campo.
   */

  const aplicarTipoOperacao = (v: string) => {
    setTipoOperacao(v);
    const plano = ehTipoTransferencia(v) ? planoDeTransferencia(classificacoes) : null;
    if (plano) {
      setClassificacao((c) => ({
        ...c,
        subcentro: plano.subcentro,
        macro_custo: plano.macro_custo,
        grupo_custo: plano.grupo_custo || '',
        centro_custo: plano.centro_custo,
        escopo_negocio: plano.escopo_negocio || '',
        plano_conta_id: plano.id ?? null,
      }));
      return;
    }
    setClassificacao((c) => ({
      ...c, subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
      plano_conta_id: null,
    }));
  };

  // PR-U2c-1D: classMap + filteredSubcentros migraram para <PlanoSubcentroSelect />.

  useEffect(() => {
    // PR-FIN-STATUS-UX-03A-1 — reset por abertura: guarda o status original persistido e zera o marcador
    //   de interação ANTES de hidratar o formulário (a hidratação usa setStatusTransacao direto, nunca o
    //   onValueChange do Select, então não é contada como escolha do usuário).
    /* ⚠ A ABERTURA CONTA, e é ela que remonta o cluster de classificação — PAR-01a-ii. O
       incremento entra no MESMO efeito que já existe por abertura, porque é exatamente o
       momento em que os estados de interação daquele bloco precisam voltar ao zero. */
    setAberturaSeq((n) => n + 1);
    statusOriginalRef.current = lancamento?.status_transacao ?? null;
    statusTouchedRef.current = false;
    if (lancamento) {
      setFazendaId(lancamento.fazenda_id);
      setDataCompetencia(lancamento.data_competencia);
      setDataVencimento(lancamento.data_vencimento || '');   // PR-FIN-MODAL-VENCIMENTO-02B — carrega o vencimento real
      setDataPagamento(lancamento.data_pagamento || '');
      setDescricao(lancamento.descricao || '');
      setFavorecidoId(lancamento.favorecido_id || '');
      /* ⚠ TRANSFERÊNCIA NÃO CARREGA O QUE ESTÁ GRAVADO — PR-FIN-TRANSF-SUBCENTRO-01. Seis
         lançamentos de fatura de cartão (NJ e Santa Rita) tinham tipo `3-Transferências` e
         subcentro "Outras Desp. Administrativas" no banco. O campo aparecia TRAVADO na
         conta certa — a lista dele, filtrada por `3-`, só tem a 18010 — e o estado ficava
         com o valor errado. Salvar mandava o estado, o trigger via que nada mudou e o banco
         não corrigia: a tela dizia uma coisa e o banco outra, e salvar não resolvia.
         ⚠ `aplicarTipoOperacao` JÁ FAZIA ISSO ao TROCAR o tipo. Faltava o caminho de abrir —
         a assimetria era o defeito inteiro. */
      const planoTransfAoAbrir = ehTipoTransferencia(lancamento.tipo_operacao)
        ? planoDeTransferencia(classificacoes) : null;
      /* ⚠ UM `set` PARA A CLASSIFICAÇÃO INTEIRA — PAR-01a-i. Os dez campos vinham em oito
         setters espalhados por trinta linhas, com a safra e a cultura lá em cima e o plano aqui
         embaixo; abrir um lançamento escrevia o mesmo objeto em dois lugares distantes. A
         precedência da transferência e os `??` são os mesmos, byte a byte. */
      setClassificacao({
        safra_id: lancamento.safra_id ?? '',
        cultura: lancamento.cultura ?? '',
        fase: lancamento.fase ?? '',
        subcentro: planoTransfAoAbrir?.subcentro ?? (lancamento.subcentro || ''),
        macro_custo: planoTransfAoAbrir?.macro_custo ?? (lancamento.macro_custo || ''),
        grupo_custo: planoTransfAoAbrir?.grupo_custo ?? (lancamento.grupo_custo || ''),
        centro_custo: planoTransfAoAbrir?.centro_custo ?? (lancamento.centro_custo || ''),
        escopo_negocio: planoTransfAoAbrir?.escopo_negocio ?? (lancamento.escopo_negocio || ''),
        plano_conta_id: planoTransfAoAbrir?.id ?? lancamento.plano_conta_id ?? null,
        atividade: atividadeValida(planoTransfAoAbrir?.escopo_negocio ?? lancamento.escopo_negocio),
      });
      /* ⚠ A CHAVE GRAVADA ABRE COM O LANÇAMENTO, e a da transferência tem precedência pela
         mesma razão que o texto dela (os seis lançamentos de fatura de cartão do
         PR-FIN-TRANSF-SUBCENTRO-01): o que vale é a 18010, não o que ficou no banco. */

      /* O card segue o lançamento — e o lançamento segue o plano. */
      setSubcentroDeAbertura(planoTransfAoAbrir?.subcentro ?? (lancamento.subcentro || ''));

      /* ⚠ LANÇAMENTO GRAVADO COM SAFRA NÃO RECEBE SUGESTÃO. O que está no banco é decisão
         de alguém, ainda que de outro dia; sobrescrevê-la ao abrir seria reclassificar sem
         pedir licença.
         ⚠ ESTE `set` SAIU DAQUI — PAR-01a-ii, e quem garante a mesma coisa agora é o SEGUNDO
         guard do efeito, dentro do cluster: `safra_id && safra_id !== safraSugeridaId`. Ao
         abrir, `safraSugeridaId` nasce `null` (o cluster remonta pela `key`) e o `safra_id`
         chega preenchido pela hidratação — o efeito retorna sem tocar em nada. */
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(normalizeStatusModal(lancamento.status_transacao));   // PR-FIN-STATUS-UX-03A-1 — legado 'meta' exibe como 'previsto' (sem gravar)
      setValorDisplay(toBRL(Math.abs(lancamento.valor)));
      // For transfers: origin = conta_bancaria_id, destination = conta_destino_id
      // For entries: destination = conta_bancaria_id
      // For exits: origin = conta_bancaria_id
      if (lancamento.tipo_operacao === '3-Transferências') {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        const destId = lancamento.conta_destino_id || '';
        console.log('[FinV2] DIALOG INIT transfer destino =', destId, 'from lancamento.conta_destino_id =', lancamento.conta_destino_id);
        setContaDestinoId(destId);
      } else if (lancamento.tipo_operacao === '1-Entradas') {
        setContaOrigemId('');
        setContaDestinoId(lancamento.conta_destino_id || lancamento.conta_bancaria_id || '');
      } else {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        setContaDestinoId('');
      }
      setTipoDocumento((lancamento as any).tipo_documento || '');
      setNotaFiscal(lancamento.numero_documento || '');
      setObservacao(lancamento.observacao || '');
      setFormaPgto(lancamento.forma_pagamento || '');
      setDadosPagamento(lancamento.dados_pagamento || '');
      // CRITICAL: reset parcela/recorrência when editing — prevents stale state from previous "new" dialog
      setFormaPagamentoParc('avista');
      setNumParcelas(2); setNumParcelasTexto('2');
    } else if (prefill) {
      // Modo "criar a partir de fonte externa" (OFX órfão, p.ex.) — campos
      // chave vêm pré-preenchidos do prefill; demais ficam vazios igual ao
      // modo criação. Conta segue o mesmo padrão do branch `lancamento`:
      // Entradas → destino; demais → origem.
      const today = new Date().toISOString().slice(0, 10);
      setFazendaId(prefill.fazenda_id ?? defaultFazendaId ?? '');
      setDataCompetencia(prefill.data_competencia ?? prefill.data_pagamento ?? today);
      /* PR-FIN-MODAL-VENCIMENTO-02B — o default segue vazio; só preenche quem passou a
         chave, porque só esse chamador conhece a regra de vencimento do seu fluxo. */
      setDataVencimento(prefill.data_vencimento ?? '');
      setDataPagamento(prefill.data_pagamento ?? '');   // PR-FIN-V2-STATUS-01 — sem fallback para hoje
      setStatusTransacao(prefill.status_transacao ?? 'realizado');
      setTipoOperacao(prefill.tipo_operacao ?? '2-Saídas');
      setValorDisplay(prefill.valor !== undefined ? toBRL(Math.abs(prefill.valor)) : '0,00');
      setDescricao(prefill.descricao ?? '');
      setNotaFiscal(prefill.numero_documento ?? '');
      if (prefill.tipo_operacao === '1-Entradas') {
        setContaOrigemId('');
        setContaDestinoId(prefill.conta_bancaria_id ?? prefill.conta_destino_id ?? '');
      } else {
        setContaOrigemId(prefill.conta_bancaria_id ?? '');
        setContaDestinoId(prefill.conta_destino_id ?? '');
      }
      // PR-Mesa-CreateFromExcel-A: prefill estendido pode trazer favorecido +
      // hierarquia de classificação canônicos da Mesa de Classificação Excel.
      // Operador edita livremente. Campos opcionais — fallback '' preserva
      // comportamento atual quando vêm undefined (OFX órfão etc.).
      setFavorecidoId(prefill.favorecido_id ?? '');
      /* ⚠ A CLASSIFICAÇÃO DO PREFILL NUM `set` SÓ — PAR-01a-i. `cultura`, `fase` e `atividade`
         não vêm do prefill e por isso nascem vazios, exatamente como nasciam quando eram
         `useState` que ninguém tocava neste ramo. */
      /* ⚠ A PROP `prefill.plano_conta_id` EXISTIA E NINGUÉM A LIA NEM A PASSAVA — declarada
         no PR-Mesa-CreateFromExcel-A junto da hierarquia, e esquecida. Ler aqui não muda
         nada hoje (medido: zero chamadores a passam) e fecha o par: quem um dia mandar a
         hierarquia manda a chave junto, da MESMA fonte, e não um par que não combina. */
      /* ⚠ SPREAD, E NÃO OBJETO NOVO — e isto é FIDELIDADE, não preferência. O ramo do prefill
         nunca tocou `cultura`, `fase` nem `atividade`: eles ficavam com o valor que estivesse
         no estado. Zerá-los aqui seria CORRIGIR um comportamento, e este PR não corrige nada —
         ele muda a forma do estado e mais nada.
         ⚠ E O QUE ISSO ESCONDE FICA REPORTADO: abrir o modal com prefill logo depois de um
         lançamento de lavoura herda a cultura daquele lançamento, porque este ramo não limpa e
         o `else` (reset) limpa. É defeito anterior a este PR, e some junto quando o cluster
         virar componente com `value` próprio. */
      setClassificacao((c) => ({
        ...c,
        subcentro: prefill.subcentro ?? '',
        macro_custo: prefill.macro_custo ?? '',
        grupo_custo: prefill.grupo_custo ?? '',
        centro_custo: prefill.centro_custo ?? '',
        plano_conta_id: prefill.plano_conta_id ?? null,
        escopo_negocio: '',
        safra_id: prefill.safra_id ?? '',
      }));
      setTipoDocumento('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2); setNumParcelasTexto('2');
      setFormaPgto('');
      setDadosPagamento('');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFazendaId(defaultFazendaId || '');
      setDataCompetencia(today);
      setDataVencimento('');   // PR-FIN-MODAL-VENCIMENTO-02B — novo lançamento abre com vencimento vazio
      setDataPagamento('');   // PR-FIN-V2-STATUS-01 — novo lançamento NÃO recebe pagamento=hoje automático (só realizado exige)
      setStatusTransacao(deriveStatus(today));
      setDescricao('');
      setFavorecidoId('');

      /* ⚠ LANÇAMENTO NOVO HERDA A ÚLTIMA ATIVIDADE DA SESSÃO — quem classifica quatrocentos
         lançamentos de lavoura não quer marcar "Lavoura" quatrocentas vezes. No primeiro uso
         é `null`, e aí a lista é a completa, como sempre foi. */
      setSubcentroDeAbertura('');
      /* ⚠ O RESET INTEIRO NUM `set` — PAR-01a-i, e a última atividade continua sendo a única
         coisa que sobrevive à troca de lançamento (memória de sessão, não dado gravado). */
      setClassificacao({
        atividade: ultimaAtividade(),
        safra_id: '', cultura: '', fase: '',
        subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
        escopo_negocio: '', plano_conta_id: null,
      });
      setTipoOperacao('2-Saídas');
      setStatusTransacao(STATUS_FINANCEIRO_INICIAL);   // PR-FIN-STATUS-UX-03A-1 — era 'meta'
      setValorDisplay('0,00');
      setContaOrigemId('');
      setContaDestinoId('');
      setTipoDocumento('');
      setNotaFiscal('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2); setNumParcelasTexto('2');
      setFormaPgto('');
      setDadosPagamento('');
    }
    setFornecedorSearch('');
    setAbaAtiva('geral');
  }, [open, lancamento, defaultFazendaId, prefill, lockedFields]);

  // FIN-MODAL-FECHO-01 item 2 — resolve o operacao_id do título OC pelo vínculo
  // zoo_operacao_partes.financeiro_lancamento_id (leitura). Só quando o modal está
  // aberto sobre um título de origem OC. Não altera o título nem permite edição estrutural.
  useEffect(() => {
    let cancelled = false;
    setOperacaoId(null);
    setOperacaoTipo(null);
    if (!open || !isOCTitulo || !lancamento?.id) return;
    (async () => {
      // 1) resolve a operação pelo vínculo soberano (parte → operacao_id)
      const { data: parte } = await (supabase as any)
        .from('zoo_operacao_partes')
        .select('operacao_id')
        .eq('financeiro_lancamento_id', lancamento.id)
        .limit(1)
        .maybeSingle();
      const opId: string | null = parte?.operacao_id ?? null;
      if (cancelled || !opId) return;
      // 2) resolve o tipo da operação (define se há fluxo soberano de abertura)
      const { data: op } = await (supabase as any)
        .from('zoo_operacoes_comerciais')
        .select('tipo_operacao')
        .eq('id', opId)
        .maybeSingle();
      if (cancelled) return;
      setOperacaoId(opId);
      setOperacaoTipo(op?.tipo_operacao ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, isOCTitulo, lancamento?.id]);

  // Regenerate parcela rows when key inputs change
  const valorNum = parseBRL(valorDisplay);

  /**
   * A PRÉVIA — o que a RPC vai gravar, calculado pela mesma função. PAR-02.
   * ⚠ A SEMENTE É O VENCIMENTO: a RPC escalona `data_vencimento`. O pagamento só entra quando
   * não há vencimento nenhum, para a prévia não ficar muda enquanto o operador preenche.
   */
  const parcelaRows = useMemo(
    () => (formaPagamentoParc === 'parcelada' && numParcelas >= 2
      ? preverParcelas(valorNum, numParcelas, dataVencimento || dataPagamento, 1)
      : []),
    [formaPagamentoParc, numParcelas, valorNum, dataVencimento, dataPagamento],
  );

  /** Build payment text from supplier data */
  const buildDadosPagamento = useCallback((f: FornecedorV2, metodo?: string): string => {
    const tipo = metodo || f.tipo_recebimento || '';
    const lines: string[] = [];
    if (tipo === 'PIX' && f.pix_chave) {
      lines.push(`PIX | Tipo: ${f.pix_tipo_chave || '-'}`);
      lines.push(`Chave: ${f.pix_chave}`);
      if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
    } else if (tipo === 'Transferência' || tipo === 'Transferência Bancária') {
      if (f.banco) lines.push(`Banco: ${f.banco}`);
      if (f.agencia) lines.push(`Agência: ${f.agencia}`);
      if (f.conta) lines.push(`Conta: ${f.conta}`);
      if (f.tipo_conta) lines.push(`Tipo: ${f.tipo_conta}`);
      if (f.cpf_cnpj_pagamento) lines.push(`CPF/CNPJ: ${f.cpf_cnpj_pagamento}`);
      if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
    }
    if (f.observacao_pagamento) lines.push(f.observacao_pagamento);
    return lines.join('\n');
  }, []);

  /** Re-fill payment data when payment method changes */
  const handleFormaPgtoChange = useCallback((metodo: string) => {
    setFormaPgto(metodo === FORMA_PAGAMENTO_V2_NENHUMA ? '' : metodo);
    const f = fornecedores.find(x => x.id === favorecidoId);
    if (f && metodo && metodo !== FORMA_PAGAMENTO_V2_NENHUMA) {
      setDadosPagamento(buildDadosPagamento(f, metodo));
    }
  }, [fornecedores, favorecidoId, buildDadosPagamento]);

  const handleDataPagamentoChange = (val: string) => {
    setDataPagamento(val);
    if (statusTransacao !== 'realizado') {
      setStatusTransacao(deriveStatus(val));
    }
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) { setValorDisplay('0,00'); return; }
    const num = parseInt(digits, 10) / 100;
    setValorDisplay(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleNotaFiscalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (tipoDocumento === 'Nota Fiscal') {
      const raw = extractNFDigits(e.target.value);
      setNotaFiscal(raw);
    } else {
      setNotaFiscal(e.target.value);
    }
  };

  /* ⚠ OS DOIS HANDLERS DA GRADE EDITÁVEL SAÍRAM — PAR-02. Editar uma linha ali mudava o que
     seria GRAVADO; agora quem calcula é a RPC, e uma célula editável prometeria um controle que
     o banco não tem. Valor e datas se mudam nos campos do lançamento, que são a entrada real
     do cálculo. */

  const notaFiscalDisplay = notaFiscal
    ? (tipoDocumento === 'Nota Fiscal' ? formatNFNumber(notaFiscal) : notaFiscal)
    : '';

  const contasDisponiveis = contas;

  // PR-FIN-MODAL-02D — valores espelhados no painel de resumo (só apresentação; sem estado novo).
  const resumoFmtData = (d: string) => (d ? d.split('-').reverse().join('/') : null);
  const resumoFavorecido = fornecedores.find(f => f.id === favorecidoId)?.nome ?? null;
  const resumoFazenda = fazendas.find(f => f.id === fazendaId)?.nome ?? null;
  const resumoContaOrigem = (() => { const c = contas.find(x => x.id === contaOrigemId); return c ? (c.nome_exibicao ?? c.nome_conta) : null; })();
  const resumoContaDestino = (() => { const c = contas.find(x => x.id === contaDestinoId); return c ? (c.nome_exibicao ?? c.nome_conta) : null; })();
  const resumoSafra = (safras ?? []).find(s => s.id === safraId)?.nome ?? null;
  const resumoTipoLabel = TIPOS_OPERACAO.find(t => t.value === tipoOperacao)?.label ?? tipoOperacao;
  // Cor semântica SÓ do valor do Tipo (categorias reais do form): saída=vermelho, entrada=azul, transferência=cinza.
  const resumoTipoCor = isTransferencia ? 'text-zinc-400' : isEntrada ? 'text-blue-500' : 'text-red-500';
  const resumoStatusLabel = STATUS_OPTIONS.find(s => s.value === statusTransacao)?.label ?? statusTransacao;

  // PR-U2c-1C: fornecedoresList/normalizeSearch/filteredFornecedores/effects/keyDown/
  // selectedFornecedorNome migraram para <FavorecidoSelect />.

  // PR-U2c-1B: Select de Fazenda + regra Dividendos migraram para <FazendaSelect />.
  // fazendaAdm permanece aqui pois o SAVE (fazendaIdEfetivo) também o usa.
  const fazendaAdm = useMemo(() => fazendaAdministrativa(fazendas), [fazendas]);

  // Validation — FONTE ÚNICA via helper puro (PR-FIN-MODAL-02B). Reproduz EXATAMENTE as
  // fórmulas anteriores (contaSimpleValid/parceladaValid/recorrenteValid/canSave) e expõe
  // as pendências por aba para os badges e o "Ver pendência". canSave permanece idêntico.
  const validacao = computeValidacaoModal({
    fazendaId, dataCompetencia, dataPagamento, descricao, tipoOperacao, statusTransacao,
    valorNum, contaOrigemId, contaDestinoId, subcentro,
    formaPagamentoParc, numParcelas, parcelaRowsLength: parcelaRows.length,
  });
  /* ⚠ `carregando` VENCE A VALIDAÇÃO: com os catálogos vazios o formulário até pode parecer
     válido — os campos estão "preenchidos" com nada —, e é justamente esse o caso perigoso. */
  const canSave = validacao.canSave && !carregando;
  // PR-FIN-V2-STATUS-01-AJUSTE item 2 — mensagem clara da pendência principal (regra/campo).
  const pendenciaMsg = statusTransacao === 'realizado' && !dataPagamento
    ? 'Data de pagamento obrigatória quando status = Realizado.'
    : null;
  // PR-FIN-MODAL-02E — a aba Classificação foi INCORPORADA à aba Geral. A validação
  // (helper puro/computeValidacaoModal) permanece IDÊNTICA — mesmas regras, mensagens e
  // critérios; muda apenas o DESTINO VISUAL: pendência de 'classificacao' aponta para
  // 'geral'. Colapso exclusivamente de apresentação (nenhuma regra nova).
  const abaVisual = (aba: AbaFinanceira): AbaFinanceira => (aba === 'classificacao' ? 'geral' : aba);
  const abaComErro = (aba: AbaVisual) => validacao.abasInvalidas.some(a => abaVisual(a) === aba);
  const handleVerPendencia = () => {
    if (validacao.primeiraAbaInvalida) setAbaAtiva(abaVisual(validacao.primeiraAbaInvalida));
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    // PR-FIN-V2-STATUS-01 — 'Realizado' exige data de pagamento; previsto/agendado/programado podem salvar null.
    if (statusTransacao === 'realizado' && !dataPagamento) {
      toast.error('Status "Realizado" exige data de pagamento.');
      return;
    }
    /* Administrativo sempre na fazenda Administrativo (defesa caso o useEffect do
       `FazendaSelect` não tenha disparado) — FIN-FAZENDA-ADM-01 ampliou de Dividendos para
       todo escopo administrativo, pelo mesmo par tela+payload da safra. */
    const fazendaIdEfetivo = (fazendaTravadaAdm && fazendaAdm) ? fazendaAdm.id : fazendaId;
    // Extra validation for transfers
    if (isTransferencia) {
      if (!contaOrigemId || contaOrigemId === '__none__' || !contaDestinoId || contaDestinoId === '__none__') {
        toast.error('Transferência exige conta de origem e conta de destino.');
        return;
      }
      if (contaOrigemId === contaDestinoId) {
        toast.error('Conta de origem e destino devem ser diferentes.');
        return;
      }
    }

    // ─── PR-Mesa-Submit-Validations ─────────────────────────────────
    // Regras invioláveis #15/#18: campos classificatórios SÓ podem
    // salvar se baterem com cadastros oficiais. Bloco A roda ANTES
    // de setSaving — sem efeito colateral, retorno limpo no toast.
    // Bloco B (validação 5 do favorecido) roda APÓS resolução inline
    // de fornecedor (mais abaixo), por isso aparece em outro ponto.
    const eq = (a?: string | null, b?: string | null) =>
      (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

    // 1. Subcentro precisa casar com cadastro oficial (case-insensitive trim)
    const subcentroTrim = (subcentro || '').trim();
    const classifEncontrada = classificacoes.find(c => eq(c.subcentro, subcentroTrim));
    if (subcentroTrim && !classifEncontrada) {
      toast.error('Selecione um subcentro oficial do plano de contas antes de salvar.');
      return;
    }

    /* 1b. Safra e subcentro têm de falar da mesma atividade — PR-FIN-SAFRA-ESCOPO-01.
       ⚠ AQUI, E NÃO SÓ NA TELA: a tela limpa a safra quando a ATIVIDADE muda, mas o
       conflito também nasce pelo outro lado — trocar o subcentro sem tocar no card, ou
       abrir um lançamento antigo já gravado torto. Este é o ponto por onde passam os DOIS
       caminhos de save, o normal e o das parcelas, e é o último antes de gravar.
       ⚠ O ESCOPO VEM DO PLANO, não do estado `escopoNegocio`: o estado é cópia, e cópia
       pode estar velha se o plano mudou desde que o lançamento foi aberto. */
    const safraEscolhida = (safras ?? []).find(sf => sf.id === safraParaGravar());
    const conflito = conflitoSafraEscopo(
      classifEncontrada?.escopo_negocio ?? escopoNegocio, safraEscolhida?.escopo_negocio);
    if (conflito) {
      toast.error(mensagemConflitoSafraEscopo(conflito));
      return;
    }

    // 2. Fazenda precisa existir em fazendas[]
    if (fazendaIdEfetivo && !fazendas.some(f => f.id === fazendaIdEfetivo)) {
      toast.error('Fazenda inválida — selecione uma fazenda cadastrada.');
      return;
    }

    // 3. Conta de origem precisa existir em contas[] quando preenchida
    if (contaOrigemId && contaOrigemId !== '__none__'
        && !contas.some(c => c.id === contaOrigemId)) {
      toast.error('Conta de origem inválida — selecione uma conta cadastrada.');
      return;
    }

    // 4. Conta de destino precisa existir em contas[] quando preenchida
    if (contaDestinoId && contaDestinoId !== '__none__'
        && !contas.some(c => c.id === contaDestinoId)) {
      toast.error('Conta de destino inválida — selecione uma conta cadastrada.');
      return;
    }

    // 6. tipo_operacao enum válido (defesa em profundidade)
    const TIPOS_VALIDOS: readonly string[] = ['1-Entradas', '2-Saídas', '3-Transferências'];
    if (!TIPOS_VALIDOS.includes(tipoOperacao)) {
      toast.error('Tipo de operação inválido.');
      return;
    }

    setSaving(true);

    // Capture the editing ID from the stable ref — prevents stale closure issues
    const currentEditId = editingIdRef.current;
    const currentIsEdit = !!currentEditId;

    // Auto-create fornecedor quando o usuário digita um nome que não está
    // em financeiro_fornecedores. Preserva o id recém-criado ao salvar.
    let effectiveFavorecidoId = favorecidoId;
    const searchText = fornecedorSearch.trim();
    if (!effectiveFavorecidoId && searchText && fazendaId) {
      const existente = fornecedores.find(f => f.nome.trim().toLowerCase() === searchText.toLowerCase());
      if (existente) {
        effectiveFavorecidoId = existente.id;
        setFavorecidoId(existente.id);
      } else {
        const novo = await onCriarFornecedor(searchText, fazendaId);
        if (novo) {
          effectiveFavorecidoId = novo.id;
          setFavorecidoId(novo.id);
        }
      }
      setFornecedorSearch('');
    }
    const favorecidoForForm = (effectiveFavorecidoId && effectiveFavorecidoId !== '__none_forn__') ? effectiveFavorecidoId : null;

    // PR-Mesa-Submit-Validations bloco B: favorecido precisa existir em
    // fornecedores[]. Roda APÓS resolução inline porque favorecidoForForm
    // pode ser id recém-criado por onCriarFornecedor. setSaving(false)
    // antes do return — botão volta a "Salvar".
    if (favorecidoForForm && !fornecedores.some(f => f.id === favorecidoForForm)) {
      toast.error('Favorecido inválido — selecione um fornecedor cadastrado.');
      setSaving(false);
      return;
    }

    let contaBancariaId: string | null = null;
    let contaDestinoFinal: string | null = null;
    if (isTransferencia) {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
      contaDestinoFinal = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else if (isEntrada) {
      // Entries: money flows IN → account goes to conta_destino_id
      contaBancariaId = null;
      contaDestinoFinal = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else {
      // Exits: money flows OUT → account goes to conta_bancaria_id (origin)
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
      contaDestinoFinal = null;
    }

    /* ═══ PARCELADA: O BANCO É QUEM ESCREVE — PAR-02 ══════════════════════════════════════
       ⚠ AQUI MORRIA O PARCELAMENTO. Este ramo era um LAÇO de `await onSave(form)` — N inserts
       separados, sem transação — e o que ele produzia foi medido no proto: das 21 famílias de
       parcela multi-linha, 20 SEM PAI (`financiamento_id` nulo), 8 com contagem diferente da
       que a própria descrição declara ("Energisa" diz 36 e tem 32), 8 com o MESMO vencimento
       nas N. O `break` do laço deixava no banco as parcelas já gravadas: quem clicava de novo
       somava um segundo lote ao primeiro, e foi assim que as "Farmácia Pessoal" viraram 5 para
       um plano de 3.
       ⚠ AGORA É UMA CHAMADA SÓ, transacional no banco: ou nasce o parcelamento inteiro — pai,
       N parcelas e os N lançamentos ligados a elas — ou não nasce nada. Acabou o meio-caminho.
       ⚠ É O MESMO WRITER DA TELA DE PARCELAMENTOS, pelo MESMO montador
       (`montarPayloadParcelamento`). Um parcelamento criado aqui e um criado lá ficam idênticos
       no banco — que é o item 4 da homologação. */
    if (!currentIsEdit && formaPagamentoParc === 'parcelada' && numParcelas >= 2) {
      if (!clienteAtual?.id) { toast.error('Sessão inválida'); setSaving(false); return; }
      if (!fazendaIdEfetivo) { toast.error('Escolha a fazenda'); setSaving(false); return; }
      /* ⚠ A 1ª PARCELA É O VENCIMENTO, NÃO O PAGAMENTO — e essa inversão era metade do defeito.
         A grade de prévia tinha cabeçalho "Vencimento" sobre um campo que gravava
         `data_pagamento`, e o vencimento real ia igual nas N. A RPC escalona o VENCIMENTO e
         deixa o pagamento NULO, que é o que 'programado' significa. O pagamento só entra como
         semente quando não há vencimento nenhum — não inventar data é melhor que recusar. */
      const primeira = dataVencimento || dataPagamento;
      if (!primeira) { toast.error('Informe a data de vencimento da 1ª parcela'); setSaving(false); return; }
      try {
        const payload = montarPayloadParcelamento(
          clienteAtual.id,
          {
            fazendaId: fazendaIdEfetivo,
            descricao,
            valorTotal: Math.abs(valorNum),
            totalParcelas: numParcelas,
            dataPrimeiraParcela: primeira,
            dataCompetencia,
            /* ⚠ MENSAL FIXO, e não é campo novo: o `addDays(i * 30)` que morreu aqui já TENTAVA
               ser mensal. A RPC faz `make_interval(months => …)`, que é mensal de verdade. */
            intervaloMeses: 1,
            favorecidoId: favorecidoForForm,
            formaPagamento: formaPgto || null,
            contaBancariaId,
            /* ⚠ O ESCOPO VEM DO PLANO, pelo cluster. A tela de Parcelamentos indexa por ele, e
               sem escopo o parcelamento nasceria mudo lá. */
            tipoFinanciamento: classificacao.escopo_negocio || null,
            /* ⚠ NULO, E NÃO A NOTA FISCAL: o modal tem `numero_documento` (a NF do lançamento),
               que não é o número do CONTRATO. Enfiar um no outro encheria a coluna errada com
               um dado certo — pior que deixá-la vazia. */
            numeroContrato: null,
            observacao: observacao || null,
          },
          {
            plano_conta_id: classificacao.plano_conta_id,
            safra_id: safraParaGravar(),
            cultura: culturaParaGravar(atividade, cultura),
            fase: faseParaGravar(atividade, fase),
          },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('fn_parcelamento_cadastrar', { p_payload: payload });
        if (error) throw error;
        /* ⚠ INVALIDAÇÃO AMPLA, e é deliberado: este modal é montado por DEZ telas diferentes,
           cada uma com o seu `onSave` e a sua forma de recarregar, e o parcelamento não passa
           por nenhum deles — quem grava agora é a RPC. Escolher chaves aqui exigiria este
           componente conhecer as dez. */
        await qc.invalidateQueries();
        toast.success(`Parcelamento criado: ${numParcelas} parcelas`);
        onClose();
      } catch (e) {
        /* ⚠ A MENSAGEM CRUA DA RPC — e agora ela de fato chega. O teste anterior era
           `e instanceof Error ? e.message : …`, e ele dava FALSO sempre: no destructuring
           (`const { error } = await …`) o `error` do PostgREST é um objeto plano, não um `Error`
           — a biblioteca só constrói `PostgrestError` quando se pede `.throwOnError()`.
           Resultado: de 18 a 21/09 o botão recusava com o genérico enquanto o banco dizia
           `42809: op ANY/ALL (array) requires array on right side`, e ninguém viu. */
        toast.error(mensagemDoErro(e, 'Falha ao criar o parcelamento'));
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Single save (à vista) or EDIT ---
    // PR-FIN-STATUS-UX-03A-1 — anti-reclassificação: se o registro carregado era legado 'meta' e o usuário
    //   NÃO escolheu explicitamente outro valor no Select (a normalização visual meta→Previsto e mudanças
    //   implícitas por outros campos NÃO contam), preserva 'meta' no payload. Escolha explícita de
    //   Agendado/Programado/Realizado persiste o valor oficial (conversão permitida). Reescolher "Previsto"
    //   (mesmo valor exibido) não dispara onValueChange no Select → mantém 'meta' (conversão dedicada futura).
    const statusPersistido = (statusOriginalRef.current === 'meta' && !statusTouchedRef.current)
      ? 'meta'
      : statusTransacao;
    const form: LancamentoV2Form = {
      fazenda_id: fazendaIdEfetivo,
      conta_bancaria_id: contaBancariaId,
      conta_destino_id: contaDestinoFinal,
      data_competencia: dataCompetencia,
      data_vencimento: dataVencimento || null,   // PR-FIN-MODAL-VENCIMENTO-02B
      data_pagamento: dataPagamento || null,
      valor: Math.abs(valorNum),
      tipo_operacao: tipoOperacao,
      status_transacao: statusPersistido,
      descricao,
      // PR-OC-FIN-EDIT-FIX-01 — enviar grupo_custo evita falso-positivo de "classificação" na proteção OC
      ...classificacaoParaGravar(),
      observacao,
      numero_documento: notaFiscal || null,
      tipo_documento: tipoDocumento || null,
      favorecido_id: favorecidoForForm,
      forma_pagamento: formaPgto || null,
      dados_pagamento: dadosPagamento || null,
      safra_id: safraParaGravar(),
      cultura: culturaParaGravar(atividade, cultura),
      fase: faseParaGravar(atividade, fase),
    };

      console.log('[FinV2] SUBMIT STATE', {
        mode: currentIsEdit ? 'UPDATE' : 'INSERT',
        id: currentEditId,
        isTransferencia,
        contaDestinoId,
        contaOrigemId,
        'form.conta_destino_id': form.conta_destino_id,
        'form.conta_bancaria_id': form.conta_bancaria_id,
        tipoOperacao,
      });

    // CRITICAL: pass the stable ID for edits — ensures UPDATE, never INSERT
    const ok = await onSave(form, currentEditId || undefined);
    setSaving(false);
    if (ok) onClose();
  };

  const handleFornecedorCriado = (f: FornecedorV2) => {
    setFavorecidoId(f.id);
    setFornecedorDialogOpen(false);
  };

  // Sum of parcelas for display
  const parcelasTotal = parcelaRows.reduce((acc, r) => acc + r.valor, 0);

  // Determine button label
  const getSubmitLabel = () => {
    if (saving) return 'Salvando...';
    if (isEdit) return 'Salvar Alterações';
    if (formaPagamentoParc === 'parcelada') return `Criar ${numParcelas} Parcelas`;
    return 'Criar Lançamento';
  };

  const firstFieldRef = useRef<HTMLButtonElement>(null);

  // Auto-focus first field on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstFieldRef.current?.focus(), 100);
    }
  }, [open]);

  // PR-FIN-MODAL-02C #10 — densidade dos blocos: padding/espaçamento reduzidos (~20% menos altura).
  const sectionClass = "rounded-lg border border-[hsl(var(--border))] bg-[hsl(210_33%_97%)] dark:bg-muted/20 px-3 py-1.5 space-y-1";
  const sectionTitleClass = "flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-[0.08em]";
  /* ⚠ A MESMA STRING, AGORA DE UM DONO SÓ — PAR-01a-ii: ela é usada pelos campos deste
     diálogo e pelos do cluster, e duas cópias divergiriam no dia em que alguém ajustasse o
     foco de um lado. */
  const fieldBg = CAMPO_BG;
  // PR-FIN-STATUS-UX-03A-1 — fonte reduzida SÓ nos 3 DatePickers da Linha 1 (Competência/Vencimento/
  //   Pagamento) para o ano caber (dd/MM/yyyy). text-[10px] vence o text-[12px] padrão do DatePicker
  //   via twMerge (11px ainda encostava o ano no ícone); largura/grid/padding/altura/ícone inalterados;
  //   componente compartilhado intocado.
  const dateFieldCls = cn(fieldBg, "text-[10px]");

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className={cn(
          // PR-FIN-MODAL-02C #1 — ALTURA FIXA (h-[92vh]) além do max: o modal não muda de
          // altura ao trocar de aba; só a região central (TabsContent) rola. Padrão aprovado
          // (MesaPareamentoModal). Header/TabsList/footer permanecem estáveis.
          "flex flex-col p-0 bg-card dark:bg-card rounded-xl shadow-2xl border border-border overflow-hidden h-[92vh] max-h-[92vh]",
          // PR-FIN-MODAL-02D — modal 2-colunas (form + painel de resumo à direita) também no fluxo
          // normal; largura acomoda a coluna de ~300px sem aumentar a altura (h-[92vh] fixo).
          "max-w-5xl",
          // PR-FIN-MODAL-02H — no fluxo normal (sem Excel), o modal vira GRID 2 colunas × 3 linhas:
          //   linha1: [header] ocupa as 2 colunas;
          //   linha2: [Tabs + formulário | RESUMO];
          //   linha3: [rodapé          | RESUMO].
          // O painel de resumo (col 2) faz SPAN das linhas 2-3 → ocupa TODA a coluna direita,
          // inclusive ao lado do rodapé, devolvendo ~1 altura de rodapé ao corpo do resumo
          // (fim da compactação forçada). `grid` sobrepõe `flex` (mesmo grupo display no twMerge);
          // o fluxo Excel permanece flex-col idêntico.
          !excelContext && "grid grid-cols-[1fr_300px] grid-rows-[auto_minmax(0,1fr)_auto]",
        )}>
          {/* ⚠ UM `fieldset` DESABILITADO COBRE O FORMULÁRIO INTEIRO (§1c), e é de propósito que
              seja o elemento nativo: ele desliga TODO controle que estiver dentro — inclusive os
              que ainda não existem —, sem uma lista de campos para alguém esquecer de atualizar.
              `display: contents` o apaga do layout, então a grade de duas colunas do modal segue
              igual.
              ⚠ E O X DE FECHAR FICA DE FORA: no `ui/dialog.tsx` ele é IRMÃO de `{children}`, não
              filho. Se estivesse dentro, o operador ficaria preso num modal que não pode editar
              nem fechar. */}
          <fieldset disabled={carregando} className="contents">
          {carregando && (
            <div className="col-span-2 row-start-2 row-end-4 flex items-center justify-center gap-2
              bg-card px-5 py-8 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando o cadastro do lançamento…
            </div>
          )}
          {/* Header */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o header ocupa as 2 colunas na linha 1;
              no fluxo Excel (flex-col) as classes de grid são inertes.
              PR-FIN-MODAL-02J — padding vertical simétrico (py-2.5) p/ centrar o título em relação
              ao X, e pr-10 de folga p/ o título/subtítulo nunca correrem sob o botão X (que é fixo
              no ui/dialog.tsx compartilhado — não movido nesta frente). Identidade (barra azul) mantida. */}
          <DialogHeader className={cn("px-5 py-2.5 pr-10 border-b border-primary/20 bg-primary", !excelContext && "col-span-2 row-start-1")}>
            <DialogTitle className="text-[13px] font-bold tracking-tight text-primary-foreground">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            {excelContext && (
              <div className="text-[10px] font-normal text-primary-foreground/80 mt-0.5">
                {isEdit
                  ? `Editando lançamento existente · ID ${lancamento?.id?.slice(0, 8)}`
                  : 'Criando a partir do Excel'}
              </div>
            )}
          </DialogHeader>

          {/* PR-FIN-MODAL-02B — Tabs CONTROLADO. Header e footer ficam FORA do Tabs (estáveis);
              a TabsList fica logo abaixo do header e o corpo rolável abriga o TabsContent ativo.
              Todo o estado dos campos permanece no componente pai (sem cópia por aba). */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o Tabs+form fica na col 1 / linha 2;
              no fluxo Excel mantém flex-1 (flex-col). O título do resumo saiu daqui e passou
              a ser a faixa de topo do próprio painel (col 2), alinhada a esta TabsList. */}
          <Tabs value={abaAtiva} onValueChange={v => setAbaAtiva(v as AbaFinanceira)} className={cn("flex flex-col min-h-0", excelContext ? "flex-1" : "col-start-1 row-start-2")}>
            <TabsList className="w-full justify-start gap-0.5 rounded-none border-b border-border bg-accent/40 px-2 h-8 shrink-0">
              {ABAS_TAB.map(({ value, label }) => (
                // PR-FIN-MODAL-02J — restyle das abas (ERP moderno): inativa discreta
                // (font-medium/muted, hover suave), ativa evidente sem borda grossa —
                // fundo background, cantos sup. arredondados, borda fininha, sombra leve e
                // UNDERLINE primário de 1px via `after:` (pseudo-elemento), evitando somar duas
                // bordas inferiores (linha de 2px). `relative` sustenta o badge no canto.
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "relative h-6 px-3 text-[12px] font-medium text-muted-foreground rounded-b-none rounded-t-md",
                    "hover:bg-background/60 hover:text-foreground",
                    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-semibold",
                    "data-[state=active]:border data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:shadow-sm",
                    "data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-primary",
                  )}
                >
                  {label}
                  {abaComErro(value) && (
                    <span
                      className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                      aria-label="pendência"
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          {/* PR-Mesa-ExcelContext: com contexto Excel, corpo vira 2 colunas
              (form + painel). Sem contexto, wrapper usa `contents` (não gera
              caixa) → body volta a ser filho direto, layout 100% idêntico. */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 bg-background">

            {/* ═══ ABA GERAL ═══ */}
            <TabsContent value="geral" className="mt-0 space-y-2 focus-visible:outline-none">

            {/* PR2.2 — Box informativo da referência operacional que originou
                esta criação. Read-only, não bloqueia nada. Operador continua
                escolhendo fornecedor/fazenda/plano oficial manualmente. */}
            {referenciaOperacionalInfo && (
              <div className="rounded-md border border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 px-3 py-2 text-[11px] space-y-1.5">
                <div className="font-semibold text-blue-900 dark:text-blue-200 uppercase tracking-wider text-[10px]">
                  📋 Referência Operacional usada
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {referenciaOperacionalInfo.fornecedor_texto && (
                    <div>
                      <span className="text-muted-foreground">Fornecedor (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.fornecedor_texto}</span>
                    </div>
                  )}
                  {referenciaOperacionalInfo.fazenda_texto && (
                    <div>
                      <span className="text-muted-foreground">Fazenda (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.fazenda_texto}</span>
                    </div>
                  )}
                  {referenciaOperacionalInfo.plano_texto && (
                    <div>
                      <span className="text-muted-foreground">Plano (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.plano_texto}</span>
                    </div>
                  )}
                  {referenciaOperacionalInfo.centro_texto && (
                    <div>
                      <span className="text-muted-foreground">Centro (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.centro_texto}</span>
                    </div>
                  )}
                  {referenciaOperacionalInfo.produto_texto && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Produto/Hist. (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.produto_texto}</span>
                    </div>
                  )}
                  {referenciaOperacionalInfo.observacao && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Obs (Excel): </span>
                      <span className="font-medium">{referenciaOperacionalInfo.observacao}</span>
                    </div>
                  )}
                  {(referenciaOperacionalInfo.valor != null || referenciaOperacionalInfo.data_referencia) && (
                    <div className="col-span-2 flex gap-3 pt-1 mt-1 border-t border-blue-200">
                      {referenciaOperacionalInfo.data_referencia && (
                        <span>
                          <span className="text-muted-foreground">Data Excel: </span>
                          <span className="font-mono">{referenciaOperacionalInfo.data_referencia}</span>
                        </span>
                      )}
                      {referenciaOperacionalInfo.valor != null && (
                        <span>
                          <span className="text-muted-foreground">Valor Excel: </span>
                          <span className={`font-mono font-semibold ${referenciaOperacionalInfo.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(referenciaOperacionalInfo.valor)}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-[9px] text-blue-900/70 dark:text-blue-200/70 italic pt-1">
                  Use as informações acima como referência. Os campos oficiais (fornecedor, fazenda, plano) devem ser escolhidos manualmente.
                </div>
              </div>
            )}

            {/* FASE 1 zoo-fin: aviso de origem zootécnica + link para LancamentoZooModal. */}
            {lancamento?.movimentacao_rebanho_id && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 mb-2">
                <div className="flex items-start gap-2">
                  <Beef className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                      Origem zootécnica vinculada
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                      Este lançamento financeiro foi gerado a partir de uma movimentação
                      do rebanho. Edite dados bancários aqui. Edite quantidade, peso,
                      categoria ou operação no módulo zootécnico.
                    </p>
                    <button
                      type="button"
                      onClick={handleAbrirZoo}
                      className="text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 underline underline-offset-2 mt-1"
                    >
                      Abrir lançamento zootécnico →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PR-SAFE-0 — aviso de origem Operação Comercial: campos estruturais são somente leitura. */}
            {isOCTitulo && (
              <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 px-2 py-1 mb-2 flex items-start gap-2">
                <p className="text-[10px] text-sky-700 dark:text-sky-400 leading-tight flex-1">
                  <span className="font-semibold text-sky-800 dark:text-sky-300">Origem: Operação Comercial.</span>{' '}
                  Valor, favorecido, classificação, tipo e competência são somente leitura (ajuste na OC); data prevista, conta, descrição, observação e documento continuam editáveis.
                </p>
                {/* link só aparece quando o vínculo resolve E o tipo tem fluxo soberano de abertura (compra). */}
                {operacaoAbrivel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[10px] font-medium text-sky-800 dark:text-sky-300 shrink-0"
                    onClick={() => {
                      if (!operacaoId) return;
                      // PR-OC-FIN-EDIT-FIX-02 — navegação SPA na aba Financeiro (preserva contexto/filtros);
                      //   fallback para o reload legado quando o caller não fornece o handler.
                      if (onAbrirOperacaoOC) onAbrirOperacaoOC(operacaoId, operacaoTipo);
                      else window.location.assign(`/v2?oc_id=${encodeURIComponent(operacaoId)}`);
                    }}
                  >
                    Abrir →
                  </Button>
                )}
              </div>
            )}

            {/* PR-FIN-MODAL-02E — aba Geral reorganizada em LINHAS operacionais densas
                (sem card por grupo). A antiga aba Classificação foi INCORPORADA aqui
                (Linha 4). Todos os campos/estados/ids/handlers/validações preservados —
                apenas reposicionamento visual. O espaçamento vertical entre as linhas vem
                do `space-y-2` do próprio TabsContent. */}

            {/* ── LINHA 1 — Tipo | Competência | Vencimento | Pagamento | Status (grid 3/2/2/2/3 = 12) ──
                PR-FIN-MODAL-VENCIMENTO-02B: Vencimento agora é um DatePicker FUNCIONAL (mesmo componente
                compartilhado de Competência/Pagamento), read-only para título OC. Grava em data_vencimento,
                nunca em data_pagamento; o contrato de Data Pagamento do lançamento manual permanece inalterado. */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3">
                <Label className="text-[10px]">Tipo Operação *</Label>
                <Select value={tipoOperacao} onValueChange={aplicarTipoOperacao} disabled={lockedFields?.includes('tipo_operacao') || isOCTitulo}>
                  <SelectTrigger ref={firstFieldRef} tabIndex={1} className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_OPERACAO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-[10px]">Data Competência *</Label>
                <DatePicker value={dataCompetencia} onChange={setDataCompetencia} disabled={isOCTitulo} tabIndex={2} className={dateFieldCls} />
              </div>
              {/* Data Vencimento — PR-FIN-MODAL-VENCIMENTO-02B: campo funcional (mesmo DatePicker de
                  Competência/Pagamento). Editável em lançamento manual; read-only para título OC
                  (governado pela Operação Comercial). Grava SEMPRE em data_vencimento, nunca em
                  data_pagamento. Contrato de Data Pagamento do manual permanece inalterado. */}
              <div className="col-span-2">
                <Label className="text-[10px]">Data Vencimento</Label>
                <DatePicker value={dataVencimento} onChange={setDataVencimento} disabled={isOCTitulo} className={dateFieldCls} />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px]">Data Pagamento *</Label>
                <DatePicker value={dataPagamento} onChange={handleDataPagamentoChange} disabled={lockedFields?.includes('data_pagamento')} tabIndex={3} className={dateFieldCls} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Status *</Label>
                <Select value={statusTransacao} onValueChange={(v) => { statusTouchedRef.current = true; setStatusTransacao(v); }}>
                  <SelectTrigger tabIndex={4} className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── LINHA 2 — Produto e Favorecido ── */}
            <div className="grid grid-cols-12 gap-2">
              {/* Produto — PR-U2c-1A: <ProdutoAutocomplete /> (fonte única) */}
              <ProdutoAutocomplete
                value={descricao}
                onChange={setDescricao}
                clienteId={clienteAtual?.id}
                label="Produto / Descrição *"
                className="col-span-7"
                inputClassName={fieldBg}
                tabIndex={5}
                placeholder="Descrição do produto"
              />
              {/* Fornecedor — PR-U2c-1C: <FavorecidoSelect /> (fonte única) */}
              <div className="col-span-5">
                <FavorecidoSelect
                  value={favorecidoId}
                  onChange={setFavorecidoId}
                  onSelected={f => {
                    if (f.tipo_recebimento) {
                      setFormaPgto(f.tipo_recebimento);
                      setDadosPagamento(buildDadosPagamento(f, f.tipo_recebimento));
                    }
                  }}
                  fornecedores={fornecedores}
                  search={fornecedorSearch}
                  onSearchChange={setFornecedorSearch}
                  onCriarNovo={() => setFornecedorDialogOpen(true)}
                  label="Fornecedor *"
                  triggerClassName={fieldBg}
                  tabIndex={6}
                  /* ⚠ O FORNECEDOR NAO E SOBERANIA DA OC — FIN-FORNECEDOR-OC-EDIT (B-19),
                     decisao do Gabriel. A OC manda em VALOR, CLASSIFICACAO, TIPO e
                     COMPETENCIA: sao os campos que compoem a OBRIGACAO, e muda-los aqui
                     contradiria a operacao. O FORNECEDOR nao compoe obrigacao nenhuma —
                     e' o favorecido do TITULO, atributo do financeiro, e e' distinto da
                     contraparte comercial (o vinculo da OC e' por PARTE, nunca por
                     favorecido).
                     ⚠ O CASO QUE FECHOU A DECISAO (maio): compromissos nascendo com
                     favorecido errado — frete em nome do boitel em vez da transportadora.
                     Sem poder corrigir aqui, a unica saida era cancelar e recriar, e foi
                     assim que nasceram duplicatas.
                     ⚠ A TRAVA ERA SO' DE TELA, E MAIS APERTADA QUE A DO GRAVADOR —
                     medido: `protecaoTituloOC.ts:48` ja nao trata favorecido como
                     estrutural (PR-OC-FIN-EDIT-FIX-01) e o payload restrito de
                     `editarLancamento` JA inclui `favorecido_id`. A tela impedia o que o
                     writer aceitava; a mesma edicao passava por uma porta e falhava por
                     outra, e isso ensina que o sistema e' arbitrario.
                     ⚠ O QUE CONTINUA TRAVADO, e por que: valor, tipo de operacao,
                     classificacao (subcentro/macro/grupo/centro) e as duas datas de
                     competencia/vencimento — os cinco compoem a obrigacao da OC e o writer
                     tambem os recusa, entao tela e gravador dizem a mesma coisa. */
                  showCpfCnpj
                />
              </div>
            </div>

            {/* ── LINHA 3 — Valor, Fazenda e Conta(s) ──
                Valor COMPACTO (col-span-2); na Transferência os 4 campos ficam na MESMA
                linha (Valor 2 · Fazenda 4 · Origem 3 · Destino 3), sem quebra. Saída/Entrada
                usam a conta aplicável em col-span-6 (contrato de contas inalterado). */}
            <div className="grid grid-cols-12 gap-2">
              {/* Valor — mesmo state/máscara/handleValorChange/tabIndex/disabled; só reposicionado. */}
              <div className="col-span-2">
                <Label className="text-[10px]">Valor (R$) *</Label>
                <Input tabIndex={10} value={valorDisplay} onChange={handleValorChange} onFocus={e => e.target.select()} className={cn("h-8 text-right font-mono", fieldBg)} placeholder="0,00" inputMode="numeric" disabled={lockedFields?.includes('valor') || isOCTitulo} />
              </div>
              {/* Fazenda — PR-U2c-1B: <FazendaSelect /> (fonte única) */}
              <FazendaSelect
                value={fazendaId}
                onChange={setFazendaId}
                fazendas={fazendas}
                forcaAdministrativo={fazendaTravadaAdm}
                label="Fazenda *"
                className="col-span-4"
                triggerClassName={fieldBg}
                tabIndex={7}
              />
              {/* Conta Bancária — PR-H2: ContaBancariaSelect compartilhado (agrupado por
                  tipo_conta + dark/glass). Sentinela '__none__' preservada na semântica interna. */}
              {isTransferencia ? (
                <>
                  <div className="col-span-3">
                    <Label className="text-[10px]">Conta Origem *</Label>
                    <ContaBancariaSelect
                      value={contaOrigemId}
                      onValueChange={setContaOrigemId}
                      contas={contas}
                      placeholder="Selecione"
                      disabled={lockedFields?.includes('conta_bancaria_id')}
                      prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                      excluirIds={contaDestinoId && contaDestinoId !== '__none__' ? [contaDestinoId] : undefined}
                      className={cn("h-8", fieldBg)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px]">Conta Destino *</Label>
                    <ContaBancariaSelect
                      value={contaDestinoId}
                      onValueChange={setContaDestinoId}
                      contas={contas}
                      placeholder="Selecione"
                      disabled={lockedFields?.includes('conta_destino_id')}
                      prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                      excluirIds={contaOrigemId && contaOrigemId !== '__none__' ? [contaOrigemId] : undefined}
                      className={cn("h-8", fieldBg)}
                    />
                  </div>
                </>
              ) : isEntrada ? (
                <div className="col-span-6">
                  <Label className="text-[10px]">Conta Destino *</Label>
                  <ContaBancariaSelect
                    value={contaDestinoId}
                    onValueChange={setContaDestinoId}
                    contas={contas}
                    placeholder="Selecione"
                    disabled={lockedFields?.includes('conta_destino_id')}
                    prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className={cn("h-8", fieldBg)}
                  />
                </div>
              ) : (
                <div className="col-span-6">
                  <Label className="text-[10px]">Conta Origem *</Label>
                  <ContaBancariaSelect
                    value={contaOrigemId}
                    onValueChange={setContaOrigemId}
                    contas={contas}
                    placeholder="Selecione"
                    disabled={lockedFields?.includes('conta_bancaria_id')}
                    prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className={cn("h-8", fieldBg)}
                  />
                </div>
              )}
            </div>

            {/* ⚠ O CLUSTER DE CLASSIFICAÇÃO SAIU DAQUI — PAR-01a-ii. Atividade, Subcentro, Safra,
                Cultura e Fase, mais as regras que os cruzam, viraram `ClassificacaoLancamento`
                em `@/components/shared`, para o parcelamento montar a MESMA classificação sem
                copiar a regra.
                ⚠ O DADO FICOU AQUI: os quatro fluxos que o escrevem de fora — hidratar ao
                editar, transferência, prefill e reset — são do ciclo de vida DESTE diálogo. O
                componente é controlado: recebe `value` e devolve o próximo.
                ⚠ A `key` REMONTA O CLUSTER A CADA ABERTURA, e ela não é enfeite: os três estados
                de interação (`safraSugeridaId`, `safraEditadaAMao`, `subcentroLimpoPelaAtividade`)
                moraram aqui e eram ZERADOS pela hidratação e pelo reset. Agora que moram no
                filho, sem remontar eles atravessariam a troca de lançamento — abrir um com safra
                e depois um novo deixaria a sugestão calada no segundo, porque `safraEditadaAMao`
                teria ficado `true`.
                ⚠ `culturasDaSafra` VAI POR PROP: o hook não tem cache e esta tela também a usa,
                no aviso de rateio logo abaixo — chamar dos dois lados seria duas consultas. */}
            <ClassificacaoLancamento
              key={`cls-${lancamento?.id ?? 'novo'}-${aberturaSeq}`}
              value={classificacao}
              /* ⚠ O SETTER DO `useState` VAI DIRETO, e é ele que resolve o updater funcional
                  sobre o estado vivo — PAR-01a-ii-fix1. Não envolver num lambda que chame
                  `next(classificacao)`: seria recriar, do lado do pai, exatamente o bug do
                  closure que este fix tirou do filho. */
              onChange={setClassificacao}
              classificacoes={classificacoes}
              safras={safras}
              dataCompetencia={dataCompetencia}
              culturasDaSafra={culturasDaSafra}
              tipoOperacao={tipoOperacao}
              travado={subcentroTravado}
              subcentroDesabilitado={isOCTitulo || subcentroTravado}
            />

            {/* ⚠ O MOTIVO MORA AO LADO DO CAMPO, nao so' no aviso do topo — OC-BOITEL-VALOR-01 · B3.
                O banner de origem ja' dizia "classificacao ... somente leitura (ajuste na OC)", a
                trinta linhas dali; quem chegava ao campo achava um Select cinza e nenhuma razao. O
                caso que originou a regra: a venda de boitel do NJ, classificada em 1140, foi
                corrigida CANCELANDO a parte e recriando — porque o campo nao explicava nem
                oferecia caminho.
                ⚠ E O CAMINHO E' A OC, NAO O FINANCEIRO. A classificacao do titulo espelha
                `zoo_operacao_partes`; deixar edita-la aqui criaria duas verdades sobre o mesmo
                lancamento — a parte diria 1140 e o titulo 1150, calados. E' a mesma familia do
                "duas telas, dois numeros, nenhum erro visivel". */}
            {isOCTitulo && (
              <p className="text-[10px] text-muted-foreground -mt-1 flex items-center gap-1">
                Classificação pertence à operação.
                {operacaoAbrivel && (
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      if (!operacaoId) return;
                      if (onAbrirOperacaoOC) onAbrirOperacaoOC(operacaoId, operacaoTipo);
                      else window.location.assign(`/v2?oc_id=${encodeURIComponent(operacaoId)}`);
                    }}
                  >
                    corrigir na operação
                  </button>
                )}
              </p>
            )}

            {/* "Compõe DRE" (SOMENTE LEITURA) — PR-FIN-MODAL-02C #6, corrigido em PR-FIN-DRE-BADGE-01.
                ⚠ ELE MOSTRAVA O PASSADO ENQUANTO O OPERADOR MUDAVA O PRESENTE. Lia só
                `lancamento.compoe_dre`, a flag gravada; trocar o subcentro no modal não o
                movia. O caso medido: um lançamento de custeio (DRE sim) teve o subcentro
                trocado para "Adiantamento a Parceiro - Lavoura" (DRE não) e o badge seguiu
                dizendo Sim até salvar — afirmando sobre uma conta que já não era a escolhida.
                ⚠ NENHUMA REGRA NOVA, NENHUMA MATRIZ: só a escolha de QUAL fonte mostrar.
                Enquanto o subcentro é o da abertura, vale o que está gravado; assim que ele
                muda — e sempre, num lançamento novo — vale o que o plano diz, com o sufixo
                "ao salvar", porque é o que a trigger vai gravar e ainda não gravou.
                ⚠ AUSENTE É TRAÇO, nunca "Não". A view da lista do Financeiro não traz
                `compoe_dre` (medido), então o lançamento chega sem a flag; dizer "Não" ali
                seria afirmar o que ninguém sabe. */}
            {/* ── A FAIXA DE LEITURA — AGRI-MODAL-CULTURA-02/03.
                 ⚠ AS DUAS INFORMAÇÕES SÃO A MESMA COISA: consequências do que foi escolhido
                 acima. O rateio sai da cultura/fase e o DRE sai da conta — nenhuma das duas
                 se preenche, as duas se leem. Separá-las em blocos (o card do DRE, depois uma
                 linha solta) dava a cada uma um peso de seção e empurrava o rodapé.
                 ⚠ NA MESMA LINHA QUANDO CABEM, empilhadas quando não — `flex-wrap` sem
                 espaçamento vertical extra. O ponto do meio é o que diz que são irmãs.
                 ⚠ 10px E COR SECUNDÁRIA NOS DOIS, com a cor viva reservada ao que ela informa:
                 verde/âmbar no rateio (direto × compartilhado) e verde no "Sim" do DRE. */}
            {(() => {
              const doPlano = classificacoes.find(
                (c) => (c.subcentro || '').trim().toLowerCase() === (subcentro || '').trim().toLowerCase(),
              )?.compoe_dre;
              const usaPlano = !isEdit || subcentro !== subcentroDeAbertura;
              const cd = usaPlano ? doPlano : lancamento?.compoe_dre;
              const mostraDre = isEdit || !!subcentro;
              const aviso = atividade === 'agricultura' ? avisoCultura(cultura, culturasDaSafra)
                : atividade === 'pecuaria' ? avisoFase(fase)
                : null;
              if (!mostraDre && !aviso) return null;
              const label = cd === true ? '✔ Sim' : cd === false ? 'Não' : '—';
              return (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                  {aviso && <span className={aviso.classe}>{aviso.texto}</span>}
                  {aviso && mostraDre && <span className="text-muted-foreground/50">·</span>}
                  {mostraDre && (
                    <span className="text-muted-foreground">
                      Compõe DRE:{' '}
                      <span className={cn('font-medium', cd === true ? 'text-success' : 'text-muted-foreground')}>{label}</span>
                      {usaPlano && cd != null && <span className="ml-1">ao salvar</span>}
                    </span>
                  )}
                </div>
              );
            })()}

            </TabsContent>
            {/* ═══ fim ABA GERAL ═══ */}

            {/* ═══ ABA PAGAMENTO ═══ */}
            <TabsContent value="pagamento" className="mt-0 space-y-2 focus-visible:outline-none">
            <section className={sectionClass}>
              <p className={sectionTitleClass}><DollarSign className="h-3.5 w-3.5" /> Pagamento</p>

              {/* Forma / Dados de Pagamento — realocados do antigo bloco "Complementares"
                  (PR-FIN-MODAL-02B). Campos e handlers idênticos; só mudou a aba. */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <div>
                  <Label className="text-[10px]">Forma de Pagamento</Label>
                  <Select value={formaPgto || FORMA_PAGAMENTO_V2_NENHUMA} onValueChange={handleFormaPgtoChange}>
                    <SelectTrigger tabIndex={13} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    {/* ⚠ A LISTA SAIU DAQUI — PAR-01c. Os oito itens eram escritos à mão neste
                        ponto; a tela de Parcelamentos passou a gravar a MESMA coluna
                        (`financeiro_lancamentos_v2.forma_pagamento`, via a parcela que nasce
                        lançamento) e duas cópias divergiriam na primeira forma nova. Os valores
                        são os mesmos, byte a byte, na mesma ordem.
                        ⚠ NÃO É O MÓDULO DA OC: `formasPagamento.ts` serve outra coluna e tem
                        Cheque. Este é o do v2 — ver o cabeçalho de `formasPagamentoV2.ts`. */}
                    <SelectContent>
                      <SelectItem value={FORMA_PAGAMENTO_V2_NENHUMA}>Nenhuma</SelectItem>
                      {FORMAS_PAGAMENTO_V2.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Label className="text-[10px]">Dados Pagamento</Label>
                    <div className="flex gap-1">
                      {formaPgto === 'PIX' && dadosPagamento && (() => {
                        const chaveMatch = dadosPagamento.match(/Chave:\s*(.+)/i);
                        return chaveMatch ? (
                          <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] gap-0.5 text-primary hover:text-primary"
                            onClick={() => { navigator.clipboard.writeText(chaveMatch[1].trim()); toast.success('Chave PIX copiada'); }}>
                            <KeyRound className="h-2.5 w-2.5" /> PIX
                          </Button>
                        ) : null;
                      })()}
                      {dadosPagamento && (
                        <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] gap-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => { navigator.clipboard.writeText(dadosPagamento); toast.success('Dados copiados'); }}>
                          <Copy className="h-2.5 w-2.5" /> Copiar
                        </Button>
                      )}
                    </div>
                  </div>
                  <Textarea tabIndex={14} value={dadosPagamento} onChange={e => setDadosPagamento(e.target.value)} rows={1} placeholder="Chave PIX, dados bancários..." className={cn("text-xs resize-none min-h-[32px]", fieldBg)} />
                </div>
              </div>

              {/* Frequency + Installment — only for new, e nunca no modo extrato */}
              {!isEdit && !ocultarParcelamento && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-3 gap-2">
                    {/* ⚠ O MODO "RECORRENTE" MORREU AQUI — FIN-RECORRENCIA-01.
                        Ele criava N lançamentos soltos num laço do front: sem regra
                        persistida não havia o que editar, encerrar ou continuar no
                        mês seguinte, e gerar de novo duplicava. A recorrência agora
                        é uma REGRA, na tela própria, com âncora de competência e
                        geração idempotente. O que fica aqui é o caminho para lá. */}
                    <div className="col-span-3 flex items-baseline gap-2 rounded border border-dashed px-2 py-1">
                      <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        Conta que repete todo mês? Cadastre uma <b>recorrência</b> em Financeiro ›
                        Recorrências — a regra fica salva e gera os lançamentos do período de uma vez.
                      </span>
                    </div>
                    {(
                      <div>
                        <Label className="text-[10px]">Modalidade</Label>
                        <Select value={formaPagamentoParc} onValueChange={(v: 'avista' | 'parcelada') => setFormaPagamentoParc(v)}>
                          <SelectTrigger className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="avista">À vista</SelectItem>
                            <SelectItem value="parcelada">Parcelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {formaPagamentoParc === 'parcelada' && (
                      <div>
                        <Label className="text-[10px]">Nº de Parcelas *</Label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          value={numParcelasTexto}
                          onChange={e => setNumParcelasTexto(e.target.value)}
                          onBlur={fecharNumParcelas}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharNumParcelas(); } }}
                          className={cn("h-8", fieldBg)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Parcela grid */}
                  {formaPagamentoParc === 'parcelada' && parcelaRows.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-background dark:bg-muted/20 overflow-hidden">
                      <div className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Parc.</span>
                        <span>Vencimento</span>
                        <span>Valor (R$)</span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {/* ⚠ SO' LEITURA, E A COLUNA "Vencimento" AGORA MOSTRA O VENCIMENTO —
                            PAR-02. O cabecalho ja' dizia "Vencimento"; o campo embaixo era
                            `row.dataPagamento`, e era ele que ia para o banco como pagamento
                            numa parcela 'programado'. A grade era o WRITER: o que estivesse
                            nela virava lancamento. Agora ela ESPELHA o que a RPC vai gravar. */}
                        {parcelaRows.map((row) => (
                          <div key={row.numero} className="grid grid-cols-[48px_1fr_1fr] gap-1 px-2 py-0.5 items-center">
                            <span className="text-[11px] font-semibold text-muted-foreground">{row.numero}/{numParcelas}</span>
                            <span className="text-[11px] tabular-nums">{resumoFmtData(row.dataVencimento) ?? '—'}</span>
                            <span className="text-[11px] text-right font-mono tabular-nums">{formatMoeda(row.valor)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-1.5 bg-muted/40 flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-medium">Total parcelas:</span>
                        <span className={cn("font-bold font-mono", Math.abs(parcelasTotal - Math.abs(valorNum)) < 0.01 ? "text-success" : "text-destructive")}>
                          {formatMoeda(parcelasTotal)}
                        </span>
                      </div>
                      {Math.abs(parcelasTotal - Math.abs(valorNum)) >= 0.01 && (
                        <div className="px-3 py-1 bg-destructive/10 text-destructive text-[10px] flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          A soma das parcelas difere do valor total ({formatMoeda(Math.abs(valorNum))})
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recurrence grid */}
                </div>
              )}
            </section>

            </TabsContent>
            {/* ═══ fim ABA PAGAMENTO ═══ */}

            {/* ═══ ABA DOCUMENTOS ═══ */}
            <TabsContent value="documentos" className="mt-0 space-y-2 focus-visible:outline-none">
            {/* ⚠ OS ANEXOS VÊM ANTES DOS CAMPOS ANTIGOS, e os dois convivem por decisão
                (97b item 4). `Tipo Documento` e `Nº Documento` são COLUNAS DO LANÇAMENTO,
                lidas por Enriquecer, importações e legados; derivá-las do documento
                anexado agora alargaria o escopo para telas congeladas. Registrado como
                [FIN-DOC-CAMPOS-LEGADOS]. ⚠ QUANDO OS DOIS DIVERGIREM, VALE O DOCUMENTO —
                é o confronto que responde, não o campo digitado. */}
            {lancamento?.id ? (
              <AbaDocumentosLancamento api={documentosApi}
                fornecedores={fornecedores.map(f => ({ id: f.id, nome: f.nome }))} />
            ) : (
              <p className="rounded-md border bg-muted/20 px-3.5 py-3 text-[11px] text-muted-foreground">
                Salve o lançamento para anexar documentos.
              </p>
            )}

            {/* ── BLOCO 4 — Documentos ── */}
            <section className={sectionClass}>
              <p className={sectionTitleClass}><FileText className="h-3.5 w-3.5" /> Documentos</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <div>
                  <Label className="text-[10px]">Tipo Documento</Label>
                  <Select value={tipoDocumento || '__none_td__'} onValueChange={v => { setTipoDocumento(v === '__none_td__' ? '' : v as TipoDocumento); if (v !== 'Nota Fiscal') { /* keep raw */ } }}>
                    <SelectTrigger tabIndex={12} className={cn("h-8 text-xs", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_td__">Nenhum</SelectItem>
                      {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Nº Documento</Label>
                  <Input
                    tabIndex={13}
                    value={notaFiscalDisplay}
                    onChange={handleNotaFiscalChange}
                    inputMode={tipoDocumento === 'Nota Fiscal' ? 'numeric' : 'text'}
                    className={cn("h-8 font-mono text-xs", fieldBg)}
                    placeholder={tipoDocumento === 'Nota Fiscal' ? '000.000.000' : 'Número'}
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Observação</Label>
                <Textarea tabIndex={15} value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" className={cn("text-xs min-h-[48px]", fieldBg)} />
              </div>
            </section>
            </TabsContent>
            {/* ═══ fim ABA DOCUMENTOS ═══ */}

            {/* ═══ ABA AUDITORIA (PR-FIN-AUDIT-01) — só leitura ═══
                ⚠ `mountOnly` pela montagem do próprio Tabs: o Radix só renderiza o
                TabsContent ativo, então a consulta da trilha nasce no primeiro clique na
                aba e não na abertura do modal. */}
            <TabsContent value="auditoria" className="mt-0 focus-visible:outline-none">
              <AbaAuditoriaLancamento
                lancamentoId={lancamento?.id ?? null}
                criadoPor={lancamento?.created_by ?? null}
                criadoEm={lancamento?.created_at ?? null}
                descricao={lancamento?.descricao ?? null}
                catalogos={catalogosAuditoria}
              />
            </TabsContent>
          </div>
          {/* PR-Mesa-ExcelContext: painel lateral read-only "Contexto Excel /
              Sugestão". Scroll próprio, não some ao rolar o formulário. */}
          {excelContext && (
            <aside className="w-[300px] shrink-0 border-l border-border bg-muted/30 overflow-y-auto p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contexto Excel / Sugestão
                </span>
                {excelContext.match_status && (
                  <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium bg-card">
                    {excelContext.match_status}
                  </span>
                )}
              </div>

              <ExcelCtxRow label="Data" value={excelContext.data} />
              <ExcelCtxRow
                label="Valor"
                value={excelContext.valor != null ? toBRL(excelContext.valor) : null}
              />
              <ExcelCtxRow label="Tipo" value={excelContext.tipo_operacao} />
              <ExcelCtxRow label="Fazenda" value={excelContext.fazenda_codigo} />

              <ExcelCtxConta label="Conta origem" conta={excelContext.conta_origem} />
              <ExcelCtxConta label="Conta destino" conta={excelContext.conta_destino} />

              <ExcelCtxRow label="Subcentro" value={excelContext.subcentro} block />
              <ExcelCtxRow label="Fornecedor" value={excelContext.fornecedor} block />
              <ExcelCtxRow label="Produto" value={excelContext.produto} block />

              {excelContext.mensagemDivergencia && (
                <div className="rounded-md border border-red-300 bg-red-50 text-red-800 px-2 py-1.5 text-[10px] mt-1">
                  {excelContext.mensagemDivergencia}
                </div>
              )}
            </aside>
          )}

          </div>
          </Tabs>

          {/* Sticky footer */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o rodapé fica na col 1 / linha 3 (sob o
              formulário); o painel de resumo o ladeia. No fluxo Excel permanece full-width. */}
          <div className={cn("px-5 py-2.5 border-t border-border bg-accent flex items-center gap-2", !excelContext && "col-start-1 row-start-3")}>
            <Button variant="outline" onClick={onClose} className="px-5" tabIndex={16}>Cancelar</Button>
            {/* PR-FIN-MODAL-02B — indicação compacta de pendência + navegação p/ a 1ª aba inválida.
                Só aparece quando canSave=false E há aba identificável (o clique no Salvar
                desabilitado não ocorre, então a navegação é oferecida aqui). */}
            {!canSave && validacao.primeiraAbaInvalida && (
              <button
                type="button"
                onClick={handleVerPendencia}
                title={pendenciaMsg ?? undefined}
                className="flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {pendenciaMsg ?? 'Ver pendência'}
              </button>
            )}
            <div className="flex-1" />
            {/* ⚠ O BOTÃO SOME QUANDO O BANCO RECUSARIA — PR-CPR-2A.4. Lançamento de origem
                zootécnica já realizado, agendado ou conciliado é barrado pelo trigger
                `guard_zoo_financeiro_cancelamento_realizado` com P0001. Oferecer o botão para
                depois mostrar um erro é fazer o operador descobrir a regra errando; no lugar
                dele vai a frase que diz por onde se faz.
                ⚠ E O ESPELHO NÃO É O CONTROLE: a RPC continua sendo a autoridade, e se a
                corrida acontecer o erro dela aparece no toast do chamador. */}
            {isEdit && onDelete && lancamento && bloqueiaCancelamentoPeloFinanceiro(lancamento) && (
              <span className="text-[11px] text-muted-foreground">{MOTIVO_BLOQUEIO_REBANHO}</span>
            )}
            {isEdit && onDelete && lancamento && !bloqueiaCancelamentoPeloFinanceiro(lancamento) && (
              <Button
                variant="ghost"
                size="sm"
                /* ⚠ `ghost`, NÃO `destructive`: cancelar é ação rara e não compete com Salvar,
                   que é o que o operador veio fazer. A cor destrutiva fica no texto. */
                className="px-3 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setMotivoCancelamento(''); setConfirmandoCancelamento(true); }}
              >
                Cancelar lançamento
              </Button>
            )}
            <Button tabIndex={17} onClick={handleSubmit} disabled={saving || !canSave} className="px-8 font-semibold shadow-md shadow-primary/25 ring-1 ring-primary/20">
              {getSubmitLabel()}
            </Button>
          </div>

          {/* PR-FIN-MODAL-02H — Painel lateral de RESUMO (fluxo normal, sem Contexto Excel).
              Coluna DIREITA do grid (col 2), fazendo SPAN das linhas 2-3 → ocupa toda a altura
              da coluna, do topo (faixa de título alinhada às tabs) até o rodapé. Read-only,
              espelha o formulário em tempo real. Sem rolagem própria, sem acordeão, sem "ver mais".
              Nenhuma lógica/estado/validação — só apresentação. */}
          {!excelContext && (
            <aside className="col-start-2 row-start-2 row-span-2 border-l border-border bg-muted/20 flex flex-col overflow-hidden">
              {/* Faixa de título: mesma altura/borda/fundo da TabsList (h-8, border-b, bg-accent/40)
                  → alinha perfeitamente à faixa das abas na coluna da esquerda. */}
              <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
                Resumo do lançamento
              </div>
              {/* Corpo do resumo: SEM padding superior — o primeiro bloco (Identificação) encosta
                  na faixa do título (causa do espaço branco no 02H era o py-1.5 do topo). Densidade
                  funcional do 02G: text-[10px]; ganho de altura do 02H usado p/ caber todo o conteúdo. */}
              <div className="flex-1 overflow-hidden pb-1 text-[10px]">
                <ResumoBlocoHead titulo="Identificação" />
                <div className="px-3 space-y-0.5">
                  <ResumoRow label="Tipo" value={resumoTipoLabel} valueClassName={resumoTipoCor} />
                  <ResumoRow label="Produto" value={descricao} />
                  <ResumoRow label="Data Competência" value={resumoFmtData(dataCompetencia)} />
                  <ResumoRow label="Favorecido" value={resumoFavorecido} />
                  <ResumoRow label="Fazenda" value={resumoFazenda} />
                </div>

                <ResumoBlocoHead titulo="Financeiro" />
                <div className="px-3 space-y-0.5">
                  <ResumoRow label="Valor" value={valorNum > 0 ? formatMoeda(valorNum) : null} />
                  {!isEntrada && <ResumoRow label="Conta origem" value={resumoContaOrigem} />}
                  {(isEntrada || isTransferencia) && <ResumoRow label="Conta destino" value={resumoContaDestino} />}
                  <ResumoRow label="Status" value={resumoStatusLabel} />
                </div>

                <ResumoBlocoHead titulo="Classificação" />
                <div className="px-3 space-y-0.5">
                  <ResumoRow label="Safra" value={resumoSafra} />
                  <ResumoRow label="Centro" value={centroCusto} />
                  <ResumoRow label="Subcentro" value={subcentro} />
                </div>

                <ResumoBlocoHead titulo="Pagamento" />
                <div className="px-3 space-y-0.5">
                  <ResumoRow label="Pagamento" value={resumoFmtData(dataPagamento)} />
                  <ResumoRow label="Forma" value={formaPgto} />
                  <ResumoRow label="Modalidade" value={!isEdit ? (formaPagamentoParc === 'parcelada' ? 'Parcelada' : 'À vista') : null} />
                  <ResumoRow label="Nº de Parcelas" value={!isEdit && formaPagamentoParc === 'parcelada' ? `${numParcelas}` : null} />
                </div>

                <ResumoBlocoHead titulo="Documento" />
                <div className="px-3 space-y-0.5">
                  <ResumoRow label="Tipo" value={tipoDocumento || null} />
                  <ResumoRow label="Número" value={notaFiscalDisplay || null} />
                </div>
              </div>
            </aside>
          )}
          </fieldset>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO DO CANCELAMENTO — PR-CPR-2A.4 ──
          ⚠ `AlertDialog`, E NÃO O `confirm()` NATIVO que estava aqui. O nativo abre o modal do
          SISTEMA OPERACIONAL — outro idioma visual, outra fonte em cada máquina —, não cabe um
          campo de motivo dentro dele e é a mesma família do `<select>` cru que o
          `check:ui-nativo` persegue. O `AlertDialog` é o padrão da casa: 37 arquivos o usam
          contra 9 que ainda chamam `confirm()`, e este era um dos nove.
          ⚠ O TEXTO RESPONDE À DÚVIDA DO CLIQUE: "cancelar" sugere apagar, e o operador precisa
          saber que o registro continua existindo — senão hesita, ou pior, cancela achando que
          limpa. É a mesma redação do cancelamento de recorrência. */}
      <AlertDialog
        open={confirmandoCancelamento}
        onOpenChange={(o) => { if (!o && !cancelando) setConfirmandoCancelamento(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este lançamento?</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-snug">
              Ele <b>sai da lista</b> mas <b>fica na auditoria</b>, com quem cancelou, quando e
              por quê. Se estiver conciliado, a conciliação daquele mês <b>reabre</b>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* ⚠ O MOTIVO É PEDIDO, NÃO DEDUZIDO. A RPC tem `p_motivo` com default
              `'duplicado_auditoria'` — mandar vazio grava esse motivo em TODO cancelamento,
              inclusive nos que não são duplicidade nenhuma, e a auditoria passa a mentir com
              cara de preenchida. O campo nasce vazio e o botão só libera com texto. */}
          <div className="space-y-1">
            <Label htmlFor="motivo-cancelamento" className="text-[11px]">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="motivo-cancelamento"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Ex.: lançado em duplicidade; valor errado; não vai acontecer"
              className="h-8 text-[11px]"
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando || !motivoCancelamento.trim()}
              /* O motivo em branco desabilita, e o porquê fica escrito ao lado — regra da casa:
                 botão desabilitado diz por quê. */
              title={motivoCancelamento.trim() ? undefined : 'Escreva o motivo para continuar'}
              onClick={async (e) => {
                /* ⚠ `preventDefault`: o `AlertDialogAction` fecha o diálogo por padrão ao
                   clicar, e fechá-lo antes da RPC responder faria o erro voltar para uma tela
                   que já não existe. Quem fecha é o resultado. */
                e.preventDefault();
                if (!onDelete || !lancamento) return;
                setCancelando(true);
                try {
                  const ok = await onDelete(lancamento.id, motivoCancelamento.trim());
                  if (ok) { setConfirmandoCancelamento(false); onClose(); }
                } finally {
                  setCancelando(false);
                }
              }}
            >
              {cancelando ? 'Cancelando…' : 'Cancelar lançamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* FASE 1 zoo-fin: modal soberano zoo aberto após V2Dialog fechar. */}
      {zooModalId && (
        <LancamentoZooModal
          open
          onOpenChange={(o) => { if (!o) setZooModalId(null); }}
          lancamentoId={zooModalId}
          /* A porta do aviso de operacao comercial — B-17 item 2. Os QUATRO mounts do
             modal precisam dela: o B-16 ligou um so', e quem chegasse pelos outros via o
             aviso sem saida. Botao ausente e' pior que aviso ausente — ele diz "va la'" e
             nao diz por onde. */
          onAbrirOperacao={(ocId, tipo) => {
            setZooModalId(null);
            /* ⚠ `oc_return` LEVA A ORIGEM — B-17 adendo. `window.location.assign` RECARREGA a
               pagina, e a `section` do /v2 e' estado interno que NAO vive na URL: sem este
               parametro o fechar da OC cairia na Central, largando o operador no resumo em
               vez da lista de onde saiu. O V2Index espelha a section em
               `sessionStorage['v2:section']` justamente para atravessar o reload. Vazio
               (aba nova, storage bloqueado) = sem parametro = Central, como hoje. */
            const origem = (() => { try { return sessionStorage.getItem('v2:section') ?? ''; } catch { return ''; } })();
            window.location.assign(`/v2?${tipo === 'venda' ? 'oc_venda' : tipo === 'abate' ? 'oc_abate' : 'oc_compra'}=1&oc_id=${ocId}&oc_aba=negociacao${origem ? `&oc_return=${origem}` : ''}`);
          }}
          onAbrirNoFormPrincipal={(lanc) => {
            // PR-E — redirect tático: navega ao V2Index com edit=<id>&tipo=<venda|abate>
            // para abrir o form principal da aba "Lançamentos" com o registro carregado.
            setZooModalId(null);
            navigate(`/v2?section=lancamentos-zoot&edit=${lanc.id}&tipo=${lanc.tipo}`);
          }}
          onAbrirFinanceiroVinculado={(ano: string, mes: number) => {
            // PR-VENDA-V2-2C-NAVEGAR-FIX-BUG1: navega ao Financeiro filtrado por
            // ano/mês do lançamento vinculado. Read-only. V2Index lê fano/fmes.
            setZooModalId(null);
            navigate(`/v2?section=financeiro-lanc&fano=${ano}&fmes=${mes}`);
          }}
        />
      )}

      <NovoFornecedorDialog
        open={fornecedorDialogOpen}
        onClose={() => setFornecedorDialogOpen(false)}
        onSave={async (nome, cpfCnpj) => {
          if (!fazendaId) {
            toast.error('Selecione uma fazenda antes de cadastrar o fornecedor.');
            return;
          }
          const f = await onCriarFornecedor(nome, fazendaId, cpfCnpj);
          if (f) handleFornecedorCriado(f);
        }}
      />
    </>
  );
}
