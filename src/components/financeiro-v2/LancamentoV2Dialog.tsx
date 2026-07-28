import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { normalizeStatusTransacao } from '@/lib/financeiro/v2Transferencia';
import { TIPOS_DOCUMENTO, formatNFNumber, extractNFDigits, type TipoDocumento } from '@/lib/financeiro/documentoHelper';
import { useCliente } from '@/contexts/ClienteContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { DatePicker } from '@/components/ui/date-picker';
import { ProdutoAutocomplete } from '@/components/shared/ProdutoAutocomplete';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { computeValidacaoModal, type AbaFinanceira } from './lancamentoDialogTabs';
import { AlertCircle, AlertTriangle, Copy, KeyRound, RefreshCw, DollarSign, FileText, Beef } from 'lucide-react';
import { LancamentoZooModal } from '@/v2/components/edicao/LancamentoZooModal';
import { toast } from 'sonner';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { STATUS_LABEL } from '@/lib/statusOperacional';
import { cn } from '@/lib/utils';
import type { ExcelContext } from '@/v2/lib/mesa/buildExcelContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  safras?: Safra[];
  defaultFazendaId?: string;
  onCriarFornecedor: (nome: string, fazendaId: string, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
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
  };
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
// Geral | Pagamento | Documentos | Auditoria — a aba Auditoria só será criada
// quando houver conteúdo real (nada de tab vazia agora).
const ABAS_TAB: { value: AbaFinanceira; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'documentos', label: 'Documentos' },
];

const STATUS_OPTIONS = [
  { value: 'meta', label: STATUS_LABEL.meta },
  { value: 'agendado', label: 'Agendado' },
  { value: 'programado', label: STATUS_LABEL.programado },
  { value: 'realizado', label: STATUS_LABEL.realizado },
];

function deriveStatus(dataPagamento: string): string {
  if (!dataPagamento) return 'meta';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > today) return 'agendado';
  return 'programado';
}

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

interface ParcelaRow {
  dataPagamento: string;
  valorDisplay: string;
}

interface RecorrenciaRow {
  mesLabel: string;
  dataCompetencia: string;
  dataPagamento: string;
  valorDisplay: string;
}

/** Generate initial parcela rows from total value and start date */
function generateParcelas(totalVal: number, numParcelas: number, dataPgtoInicial: string): ParcelaRow[] {
  const abs = Math.abs(totalVal);
  const baseVal = Math.floor((abs / numParcelas) * 100) / 100;
  const lastVal = Math.round((abs - baseVal * (numParcelas - 1)) * 100) / 100;

  const rows: ParcelaRow[] = [];
  for (let i = 0; i < numParcelas; i++) {
    const val = i === numParcelas - 1 ? lastVal : baseVal;
    rows.push({
      dataPagamento: dataPgtoInicial ? addDays(dataPgtoInicial, i * 30) : '',
      valorDisplay: toBRL(val),
    });
  }
  return rows;
}

/** Generate recurrence rows from competencia until December of the same year */
function generateRecorrencias(dataComp: string, dataPgto: string, valor: number): RecorrenciaRow[] {
  if (!dataComp) return [];
  const d = new Date(dataComp + 'T00:00:00');
  const year = d.getFullYear();
  const startMonth = d.getMonth(); // 0-based
  const rows: RecorrenciaRow[] = [];
  const abs = Math.abs(valor);
  for (let m = startMonth; m <= 11; m++) {
    const offset = m - startMonth;
    const comp = addMonths(dataComp, offset);
    const pgto = dataPgto ? addMonths(dataPgto, offset) : comp;
    rows.push({
      mesLabel: getMonthLabel(comp),
      dataCompetencia: comp,
      dataPagamento: pgto,
      valorDisplay: toBRL(abs),
    });
  }
  return rows;
}

export function LancamentoV2Dialog({
  open, onClose, onSave, onDelete, lancamento, fazendas, contas, classificacoes,
  fornecedores, safras, defaultFazendaId, onCriarFornecedor, prefill, lockedFields,
  referenciaOperacionalInfo, excelContext,
}: Props) {
  const { clienteAtual } = useCliente();
  const navigate = useNavigate();
  const isEdit = !!lancamento;
  // PR-SAFE-0 — título originado da Operação Comercial: valor/favorecido/classificação/tipo
  //   são somente leitura (edição estrutural pertence à OC). Detecção ESTRUTURAL pelo marcador
  //   de proveniência persistido (origem_lancamento), nunca por texto de UI. O writer
  //   (useFinanceiroV2.editarLancamento) aplica a mesma proteção de forma independente.
  const isOCTitulo = isEdit && lancamento?.origem_lancamento === 'operacao_comercial';
  // Store the editing ID in a ref so it can't become stale during async save
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = lancamento?.id ?? null;
  }, [lancamento]);
  const [saving, setSaving] = useState(false);
  // PR-FIN-MODAL-02B — aba ativa (Tabs controlado). Vive no pai; nenhum estado de campo é
  // duplicado por aba. Redefinida para 'geral' na hidratação (abrir/trocar de registro).
  const [abaAtiva, setAbaAtiva] = useState<AbaFinanceira>('geral');
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
  const [numParcelas, setNumParcelas] = useState(2);
  const [parcelaRows, setParcelaRows] = useState<ParcelaRow[]>([]);

  // Frequency state
  const [frequencia, setFrequencia] = useState<'pontual' | 'recorrente'>('pontual');
  const [recorrenciaRows, setRecorrenciaRows] = useState<RecorrenciaRow[]>([]);
  const [recorrenciaEditada, setRecorrenciaEditada] = useState(false);

  const [fazendaId, setFazendaId] = useState('');
  const [safraId, setSafraId] = useState('');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [macroCusto, setMacroCusto] = useState('');
  const [grupoCusto, setGrupoCusto] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  // FIN-MODAL-FECHO-01 item 2 — operacao_id + tipo resolvidos pelo vínculo zoo_operacao_partes
  // (somente leitura). O link "Abrir operação" só é exibido para tipos que possuem fluxo soberano
  // de abertura implementado (hoje: compra — CompraModalShell/PR-OC-COMPRA-OPEN-01). Venda/abate
  // ainda não têm abridor de operação OC → botão NÃO é exibido (evita botão morto).
  const [operacaoId, setOperacaoId] = useState<string | null>(null);
  const [operacaoTipo, setOperacaoTipo] = useState<string | null>(null);
  const operacaoAbrivel = !!operacaoId && operacaoTipo === 'compra';
  const [escopoNegocio, setEscopoNegocio] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState('meta');
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
  const [subcentroSearch, setSubcentroSearch] = useState('');

  const isTransferencia = tipoOperacao === '3-Transferências';
  const isEntrada = tipoOperacao === '1-Entradas';

  // PR-U2c-1D: classMap + filteredSubcentros migraram para <PlanoSubcentroSelect />.

  useEffect(() => {
    if (lancamento) {
      setFazendaId(lancamento.fazenda_id);
      setSafraId(lancamento.safra_id ?? '');
      setDataCompetencia(lancamento.data_competencia);
      setDataPagamento(lancamento.data_pagamento || '');
      setDescricao(lancamento.descricao || '');
      setFavorecidoId(lancamento.favorecido_id || '');
      setSubcentro(lancamento.subcentro || '');
      setMacroCusto(lancamento.macro_custo || '');
      setGrupoCusto(lancamento.grupo_custo || '');
      setCentroCusto(lancamento.centro_custo || '');
      setEscopoNegocio(lancamento.escopo_negocio || '');
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(normalizeStatusTransacao(lancamento.status_transacao));
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
      setNumParcelas(2);
      setParcelaRows([]);
      setFrequencia('pontual');
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    } else if (prefill) {
      // Modo "criar a partir de fonte externa" (OFX órfão, p.ex.) — campos
      // chave vêm pré-preenchidos do prefill; demais ficam vazios igual ao
      // modo criação. Conta segue o mesmo padrão do branch `lancamento`:
      // Entradas → destino; demais → origem.
      const today = new Date().toISOString().slice(0, 10);
      setFazendaId(prefill.fazenda_id ?? defaultFazendaId ?? '');
      setSafraId('');
      setDataCompetencia(prefill.data_competencia ?? prefill.data_pagamento ?? today);
      setDataPagamento(prefill.data_pagamento ?? today);
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
      setSubcentro(prefill.subcentro ?? '');
      setMacroCusto(prefill.macro_custo ?? '');
      setGrupoCusto(prefill.grupo_custo ?? '');
      setCentroCusto(prefill.centro_custo ?? '');
      setEscopoNegocio('');
      setTipoDocumento('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2);
      setParcelaRows([]);
      setFormaPgto('');
      setDadosPagamento('');
      setFrequencia('pontual');
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFazendaId(defaultFazendaId || '');
      setSafraId('');
      setDataCompetencia(today);
      setDataPagamento(today);
      setStatusTransacao(deriveStatus(today));
      setDescricao('');
      setFavorecidoId('');
      setSubcentro('');
      setMacroCusto('');
      setGrupoCusto('');
      setCentroCusto('');
      setEscopoNegocio('');
      setTipoOperacao('2-Saídas');
      setStatusTransacao('meta');
      setValorDisplay('0,00');
      setContaOrigemId('');
      setContaDestinoId('');
      setTipoDocumento('');
      setNotaFiscal('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2);
      setParcelaRows([]);
      setFormaPgto('');
      setDadosPagamento('');
      setFrequencia('pontual');
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    }
    setSubcentroSearch('');
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

  const regenerateParcelas = useCallback(() => {
    if (formaPagamentoParc === 'parcelada' && numParcelas >= 2 && valorNum > 0) {
      setParcelaRows(generateParcelas(valorNum, numParcelas, dataPagamento));
    }
  }, [formaPagamentoParc, numParcelas, valorNum, dataPagamento]);

  // Auto-regenerate when switching to parcelada or changing num parcelas / valor / data
  useEffect(() => {
    if (formaPagamentoParc === 'parcelada' && numParcelas >= 2) {
      regenerateParcelas();
    } else {
      setParcelaRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPagamentoParc, numParcelas, valorNum, dataPagamento]);

  // Auto-generate recurrence rows
  useEffect(() => {
    if (frequencia === 'recorrente' && !recorrenciaEditada) {
      setRecorrenciaRows(generateRecorrencias(dataCompetencia, dataPagamento, valorNum));
    } else if (frequencia === 'pontual') {
      setRecorrenciaRows([]);
      setRecorrenciaEditada(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequencia, dataCompetencia, dataPagamento, valorNum]);

  const handleRecalcularRecorrencia = () => {
    if (recorrenciaEditada) {
      if (!confirm('Deseja recalcular as recorrências? As edições serão perdidas.')) return;
    }
    setRecorrenciaRows(generateRecorrencias(dataCompetencia, dataPagamento, valorNum));
    setRecorrenciaEditada(false);
  };

  const handleRecorrenciaCompChange = (idx: number, val: string) => {
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataCompetencia: val } : r));
    setRecorrenciaEditada(true);
  };

  const handleRecorrenciaPgtoChange = (idx: number, val: string) => {
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataPagamento: val } : r));
    setRecorrenciaEditada(true);
  };

  const handleRecorrenciaValorChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: '0,00' } : r));
      setRecorrenciaEditada(true);
      return;
    }
    const num = parseInt(digits, 10) / 100;
    const display = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setRecorrenciaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: display } : r));
    setRecorrenciaEditada(true);
  };

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
    setFormaPgto(metodo === '__none_fp__' ? '' : metodo);
    const f = fornecedores.find(x => x.id === favorecidoId);
    if (f && metodo && metodo !== '__none_fp__') {
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

  const handleParcelaValorChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: '0,00' } : r));
      return;
    }
    const num = parseInt(digits, 10) / 100;
    const display = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, valorDisplay: display } : r));
  };

  const handleParcelaDateChange = (idx: number, val: string) => {
    setParcelaRows(prev => prev.map((r, i) => i === idx ? { ...r, dataPagamento: val } : r));
  };

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
  const fazendaAdm = useMemo(
    () => fazendas.find(f => f.nome?.toLowerCase().includes('administrat')),
    [fazendas],
  );

  // Validation — FONTE ÚNICA via helper puro (PR-FIN-MODAL-02B). Reproduz EXATAMENTE as
  // fórmulas anteriores (contaSimpleValid/parceladaValid/recorrenteValid/canSave) e expõe
  // as pendências por aba para os badges e o "Ver pendência". canSave permanece idêntico.
  const validacao = computeValidacaoModal({
    fazendaId, dataCompetencia, dataPagamento, descricao, tipoOperacao, statusTransacao,
    valorNum, contaOrigemId, contaDestinoId, subcentro,
    formaPagamentoParc, numParcelas, parcelaRowsLength: parcelaRows.length,
    frequencia, recorrenciaRowsLength: recorrenciaRows.length,
  });
  const canSave = validacao.canSave;
  // PR-FIN-MODAL-02E — a aba Classificação foi INCORPORADA à aba Geral. A validação
  // (helper puro/computeValidacaoModal) permanece IDÊNTICA — mesmas regras, mensagens e
  // critérios; muda apenas o DESTINO VISUAL: pendência de 'classificacao' aponta para
  // 'geral'. Colapso exclusivamente de apresentação (nenhuma regra nova).
  const abaVisual = (aba: AbaFinanceira): AbaFinanceira => (aba === 'classificacao' ? 'geral' : aba);
  const abaComErro = (aba: AbaFinanceira) => validacao.abasInvalidas.some(a => abaVisual(a) === aba);
  const handleVerPendencia = () => {
    if (validacao.primeiraAbaInvalida) setAbaAtiva(abaVisual(validacao.primeiraAbaInvalida));
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    // Dividendos sempre na fazenda Administrativo (defesa caso useEffect não tenha disparado).
    const fazendaIdEfetivo = (macroCusto === 'Dividendos' && fazendaAdm) ? fazendaAdm.id : fazendaId;
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

    // --- Recurrence logic (ONLY for new lancamentos, NEVER for edit) ---
    if (!currentIsEdit && frequencia === 'recorrente' && recorrenciaRows.length > 0) {
      let allOk = true;
      for (let i = 0; i < recorrenciaRows.length; i++) {
        const row = recorrenciaRows[i];
        const recVal = parseBRL(row.valorDisplay);
        const form: LancamentoV2Form = {
          fazenda_id: fazendaIdEfetivo,
          conta_bancaria_id: contaBancariaId,
          conta_destino_id: contaDestinoFinal,
          data_competencia: row.dataCompetencia,
          data_pagamento: row.dataPagamento || null,
          valor: recVal,
          tipo_operacao: tipoOperacao,
          status_transacao: deriveStatus(row.dataPagamento),
          descricao,
          macro_custo: macroCusto,
          centro_custo: centroCusto,
          subcentro,
          observacao,
          numero_documento: notaFiscal || null,
          tipo_documento: tipoDocumento || null,
          favorecido_id: favorecidoForForm,
          forma_pagamento: formaPgto || null,
          dados_pagamento: dadosPagamento || null,
          safra_id: safraId || null,
        };
        const ok = await onSave(form);
        if (!ok) { allOk = false; break; }
      }
      setSaving(false);
      if (allOk) onClose();
      return;
    }

    // --- Installment logic (ONLY for new lancamentos, NEVER for edit) ---
    if (!currentIsEdit && formaPagamentoParc === 'parcelada' && numParcelas >= 2 && parcelaRows.length === numParcelas) {
      let allOk = true;
      for (let i = 0; i < numParcelas; i++) {
        const row = parcelaRows[i];
        const parcelaVal = parseBRL(row.valorDisplay);
        const parcelaDesc = `${descricao} - Parcela ${i + 1}/${numParcelas}`;

        const form: LancamentoV2Form = {
          fazenda_id: fazendaIdEfetivo,
          conta_bancaria_id: contaBancariaId,
          conta_destino_id: contaDestinoFinal,
          data_competencia: dataCompetencia,
          data_pagamento: row.dataPagamento || dataPagamento,
          valor: parcelaVal,
          tipo_operacao: tipoOperacao,
          status_transacao: 'programado',
          descricao: parcelaDesc,
          macro_custo: macroCusto,
          centro_custo: centroCusto,
          subcentro,
          observacao,
           numero_documento: notaFiscal || null,
           tipo_documento: tipoDocumento || null,
          favorecido_id: favorecidoForForm,
          forma_pagamento: formaPgto || null,
          dados_pagamento: dadosPagamento || null,
          safra_id: safraId || null,
        };

        const ok = await onSave(form);
        if (!ok) { allOk = false; break; }
      }

      setSaving(false);
      if (allOk) onClose();
      return;
    }

    // --- Single save (à vista) or EDIT ---
    const form: LancamentoV2Form = {
      fazenda_id: fazendaIdEfetivo,
      conta_bancaria_id: contaBancariaId,
      conta_destino_id: contaDestinoFinal,
      data_competencia: dataCompetencia,
      data_pagamento: dataPagamento || null,
      valor: Math.abs(valorNum),
      tipo_operacao: tipoOperacao,
      status_transacao: statusTransacao,
      descricao,
      macro_custo: macroCusto,
      centro_custo: centroCusto,
      subcentro,
      escopo_negocio: escopoNegocio || undefined,
      observacao,
      numero_documento: notaFiscal || null,
      tipo_documento: tipoDocumento || null,
      favorecido_id: favorecidoForForm,
      forma_pagamento: formaPgto || null,
      dados_pagamento: dadosPagamento || null,
      safra_id: safraId || null,
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
  const parcelasTotal = parcelaRows.reduce((acc, r) => acc + parseBRL(r.valorDisplay), 0);
  const recorrenciaTotal = recorrenciaRows.reduce((acc, r) => acc + parseBRL(r.valorDisplay), 0);

  // Determine button label
  const getSubmitLabel = () => {
    if (saving) return 'Salvando...';
    if (isEdit) return 'Salvar Alterações';
    if (frequencia === 'recorrente' && recorrenciaRows.length > 0) return `Criar ${recorrenciaRows.length} Lançamentos`;
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
  const fieldBg = "bg-background border-[hsl(210_20%_80%)] focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]";

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
          {/* Header */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o header ocupa as 2 colunas na linha 1;
              no fluxo Excel (flex-col) as classes de grid são inertes. */}
          <DialogHeader className={cn("px-5 pt-3 pb-2.5 border-b border-primary/20 bg-primary", !excelContext && "col-span-2 row-start-1")}>
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
                <TabsTrigger key={value} value={value} className="h-6 px-2.5 text-[11px] gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  {label}
                  {abaComErro(value) && <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" aria-label="pendência" />}
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
              <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 p-3 mb-2">
                <p className="text-[12px] font-semibold text-sky-800 dark:text-sky-300">Origem: Operação Comercial</p>
                <p className="text-[11px] text-sky-700 dark:text-sky-400 leading-snug">
                  Valor, favorecido, classificação, tipo e competência pertencem à obrigação da Operação
                  Comercial e são somente leitura aqui. Ajuste-os pela Operação Comercial. Data prevista,
                  conta, descrição, observação e documento continuam editáveis.
                </p>
                {/* item 2 — link só aparece quando o vínculo resolve E o tipo tem fluxo soberano de
                    abertura (compra). Venda/abate ainda não têm abridor de operação OC → sem botão
                    morto. Contrato genérico ?oc_id=<id>; a Central abre a operação pela rotina soberana. */}
                {operacaoAbrivel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1 text-[11px] font-medium text-sky-800 dark:text-sky-300"
                    onClick={() => window.location.assign(`/v2?oc_id=${encodeURIComponent(operacaoId!)}`)}
                  >
                    Abrir operação →
                  </Button>
                )}
              </div>
            )}

            {/* PR-FIN-MODAL-02E — aba Geral reorganizada em LINHAS operacionais densas
                (sem card por grupo). A antiga aba Classificação foi INCORPORADA aqui
                (Linha 4). Todos os campos/estados/ids/handlers/validações preservados —
                apenas reposicionamento visual. O espaçamento vertical entre as linhas vem
                do `space-y-2` do próprio TabsContent. */}

            {/* ── LINHA 1 — Tipo, Datas e Status ──
                Estrutura preparada para a futura Data de Vencimento (PR-FIN-DATAS-01):
                Tipo | Competência | Vencimento | Pagamento | Status. NÃO criar o campo agora. */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3">
                <Label className="text-[10px]">Tipo Operação *</Label>
                <Select value={tipoOperacao} onValueChange={v => { setTipoOperacao(v); setSubcentro(''); setMacroCusto(''); setGrupoCusto(''); setCentroCusto(''); setSubcentroSearch(''); }} disabled={lockedFields?.includes('tipo_operacao') || isOCTitulo}>
                  <SelectTrigger ref={firstFieldRef} tabIndex={1} className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_OPERACAO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Data Competência *</Label>
                <DatePicker value={dataCompetencia} onChange={setDataCompetencia} disabled={isOCTitulo} tabIndex={2} className={fieldBg} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Data Pagamento *</Label>
                <DatePicker value={dataPagamento} onChange={handleDataPagamentoChange} disabled={lockedFields?.includes('data_pagamento')} tabIndex={3} className={fieldBg} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Status *</Label>
                <Select value={statusTransacao} onValueChange={setStatusTransacao}>
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
                  disabled={isOCTitulo}
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
                forcaAdministrativo={macroCusto === 'Dividendos'}
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

            {/* ── LINHA 4 — Classificação INCORPORADA: Safra + Subcentro ──
                Resumo automático (Macro · Grupo · Centro) SOMENTE LEITURA abaixo do Subcentro,
                a partir dos derivados já existentes. Mesmos estados/ids/handlers/validação da
                antiga aba Classificação (movida verbatim). */}
            <div className="grid grid-cols-12 gap-2 items-start">
              {/* Safra (opcional) — NÃO gera pendência. Mesmo safraId/opções/payload. */}
              <div className="col-span-4">
                <Label className="text-[10px]">Safra</Label>
                <Select
                  value={safraId || '__none_safra__'}
                  onValueChange={v => setSafraId(v === '__none_safra__' ? '' : v)}
                >
                  <SelectTrigger className={cn("h-8", fieldBg)}><SelectValue placeholder="Sem safra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none_safra__">Sem safra</SelectItem>
                    {(safras ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Subcentro — PR-U2c-1D: <PlanoSubcentroSelect /> (fonte única) */}
              <div className="col-span-8">
                <PlanoSubcentroSelect
                  value={subcentro}
                  onChange={setSubcentro}
                  onSelected={(_sub, cls) => {
                    if (cls) {
                      setMacroCusto(cls.macro_custo);
                      setGrupoCusto(cls.grupo_custo || '');
                      setCentroCusto(cls.centro_custo);
                      setEscopoNegocio(cls.escopo_negocio || '');
                    }
                  }}
                  classificacoes={classificacoes}
                  tipoOperacao={tipoOperacao}
                  search={subcentroSearch}
                  onSearchChange={setSubcentroSearch}
                  label="Subcentro *"
                  triggerClassName={fieldBg}
                  tabIndex={11}
                  disabled={isOCTitulo}
                />
                {/* Resumo automático dos derivados (Macro › Grupo › Centro). Somente leitura;
                    sem estado novo, sem recálculo, sem edição. "—" quando não houver derivação. */}
                <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  {(macroCusto || grupoCusto || centroCusto) ? (
                    <>
                      Macro: <span className="font-medium text-foreground/70">{macroCusto || '—'}</span>
                      {' · '}Grupo: <span className="font-medium text-foreground/70">{grupoCusto || '—'}</span>
                      {' · '}Centro: <span className="font-medium text-foreground/70">{centroCusto || '—'}</span>
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>

            {/* PR-FIN-MODAL-02C #6 — "Compõe DRE" (SOMENTE LEITURA), preservado da antiga aba
                Classificação. Consome apenas a flag já materializada (compoe_dre). Só na EDIÇÃO —
                na criação a flag ainda não existe. Não cria regra nem recalcula. */}
            {isEdit && (() => {
              const cd = (lancamento as any)?.compoe_dre;
              const label = cd === true ? '✔ Sim' : cd === false ? 'Não' : '—';
              return (
                <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Compõe DRE</span>
                  <span className={cn("text-[11px] font-medium", cd === true ? "text-success" : "text-muted-foreground")}>{label}</span>
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
                  <Select value={formaPgto || '__none_fp__'} onValueChange={handleFormaPgtoChange}>
                    <SelectTrigger tabIndex={13} className={cn("h-8", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_fp__">Nenhuma</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Cartão">Cartão</SelectItem>
                      <SelectItem value="Boleto">Boleto</SelectItem>
                      <SelectItem value="Débito Automático">Débito Automático</SelectItem>
                      <SelectItem value="Débito">Débito</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
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

              {/* Frequency + Installment — only for new */}
              {!isEdit && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px]">Frequência</Label>
                      <Select value={frequencia} onValueChange={(v: 'pontual' | 'recorrente') => setFrequencia(v)}>
                        <SelectTrigger className={cn("h-8", fieldBg)}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pontual">Pontual</SelectItem>
                          <SelectItem value="recorrente">Recorrente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {frequencia === 'pontual' && (
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
                    {frequencia === 'pontual' && formaPagamentoParc === 'parcelada' && (
                      <div>
                        <Label className="text-[10px]">Nº de Parcelas *</Label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          value={numParcelas}
                          onChange={e => setNumParcelas(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))}
                          className={cn("h-8", fieldBg)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Parcela grid */}
                  {frequencia === 'pontual' && formaPagamentoParc === 'parcelada' && parcelaRows.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-background dark:bg-muted/20 overflow-hidden">
                      <div className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Parc.</span>
                        <span>Vencimento</span>
                        <span>Valor (R$)</span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {parcelaRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-[48px_1fr_1fr] gap-1 px-2 py-0.5 items-center">
                            <span className="text-[11px] font-semibold text-muted-foreground">{idx + 1}/{numParcelas}</span>
                            <DatePicker value={row.dataPagamento} onChange={v => handleParcelaDateChange(idx, v)} size="compact" className="bg-background dark:bg-card border-border/30" />
                            <Input value={row.valorDisplay} onChange={e => handleParcelaValorChange(idx, e)} onFocus={e => e.target.select()} inputMode="numeric" className="h-6 text-[11px] bg-background dark:bg-card border-border/30 text-right font-mono" />
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
                  {frequencia === 'recorrente' && recorrenciaRows.length > 0 && (
                    <div className="rounded-lg border border-border/30 bg-background dark:bg-muted/20 overflow-hidden">
                      <div className="grid grid-cols-[60px_1fr_1fr_100px] gap-1 px-3 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Mês</span>
                        <span>Competência</span>
                        <span>Pagamento</span>
                        <span className="text-right">Valor (R$)</span>
                      </div>
                      <div className="divide-y divide-border/20 max-h-52 overflow-y-auto">
                        {recorrenciaRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-[60px_1fr_1fr_100px] gap-1 px-2 py-0.5 items-center">
                            <span className="text-[10px] font-semibold text-muted-foreground capitalize">{row.mesLabel}</span>
                            <DatePicker value={row.dataCompetencia} onChange={v => handleRecorrenciaCompChange(idx, v)} size="compact" className="bg-background dark:bg-card border-border/30" />
                            <DatePicker value={row.dataPagamento} onChange={v => handleRecorrenciaPgtoChange(idx, v)} size="compact" className="bg-background dark:bg-card border-border/30" />
                            <Input value={row.valorDisplay} onChange={e => handleRecorrenciaValorChange(idx, e)} onFocus={e => e.target.select()} inputMode="numeric" className="h-6 text-[11px] bg-background dark:bg-card border-border/30 text-right font-mono" />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-1.5 bg-muted/40 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-medium">Total ({recorrenciaRows.length}x):</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleRecalcularRecorrencia}>
                            <RefreshCw className="h-3 w-3" /> Recalcular
                          </Button>
                        </div>
                        <span className="font-bold font-mono text-foreground">
                          {formatMoeda(recorrenciaTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            </TabsContent>
            {/* ═══ fim ABA PAGAMENTO ═══ */}

            {/* ═══ ABA DOCUMENTOS ═══ */}
            <TabsContent value="documentos" className="mt-0 space-y-2 focus-visible:outline-none">
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
                className="flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Ver pendência
              </button>
            )}
            <div className="flex-1" />
            {isEdit && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
                  const ok = await onDelete(lancamento!.id);
                  if (ok) onClose();
                }}
                className="px-4"
              >
                Excluir
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
              <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[10px] font-bold uppercase tracking-wide text-primary">
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
                  <ResumoRow label="Frequência" value={!isEdit ? (frequencia === 'recorrente' ? 'Recorrente' : 'Pontual') : null} />
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
        </DialogContent>
      </Dialog>

      {/* FASE 1 zoo-fin: modal soberano zoo aberto após V2Dialog fechar. */}
      {zooModalId && (
        <LancamentoZooModal
          open
          onOpenChange={(o) => { if (!o) setZooModalId(null); }}
          lancamentoId={zooModalId}
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
