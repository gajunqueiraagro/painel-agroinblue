/**
 * ExtratoImportPreview — modal de importação de extrato OFX/CSV.
 *
 * Fluxo:
 *   1. Selecionar arquivo (.ofx / .csv) e conta bancária.
 *   2. Gerar preview (parser + checagem de duplicatas via hash).
 *   3. Confirmar → insere em extrato_bancario_v2 (status='nao_conciliado').
 *
 * NÃO cria lançamento financeiro automaticamente.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useImportacaoExtrato, type MovimentoPreview, type CandidatoPossivel } from '@/hooks/useImportacaoExtrato';
import { useBaixaViaExtrato } from '@/hooks/useBaixaViaExtrato';
import { ConfirmarBaixaAgrupadaDialog } from './ConfirmarBaixaAgrupadaDialog';
import { RevisarMatchDialog } from './RevisarMatchDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Info, CheckCircle2 } from 'lucide-react';

type FiltroTabela =
  | 'todos'
  | 'pendentes'
  | 'parciais'
  | 'conciliados'
  | 'ignorados'
  | 'match_direto'
  | 'agrupados'
  | 'sem_match'
  | 'ja_no_banco';

const ROTULO_FILTRO: Record<FiltroTabela, string> = {
  todos: 'todos',
  pendentes: 'pendentes',
  parciais: 'parciais',
  conciliados: 'conciliados',
  ignorados: 'ignorados',
  match_direto: 'match direto',
  agrupados: 'agrupados',
  sem_match: 'sem match',
  ja_no_banco: 'já no banco',
};

/** Filtro local da tabela — apenas visualização, sem mexer em dados. */
function aplicarFiltro(m: MovimentoPreview, f: FiltroTabela): boolean {
  const acionavel =
    !m.existeNoDB ||
    m.statusPersistido === 'nao_conciliado' ||
    m.statusPersistido === 'parcial';
  switch (f) {
    case 'todos':        return true;
    case 'pendentes':    return m.statusPersistido === 'nao_conciliado';
    case 'parciais':     return m.statusPersistido === 'parcial';
    case 'conciliados':  return m.statusPersistido === 'conciliado';
    case 'ignorados':    return m.statusPersistido === 'ignorado';
    case 'ja_no_banco':  return m.existeNoDB;
    case 'match_direto': return acionavel && m.matchEncontrado && !m.matchAgrupado;
    case 'agrupados':    return acionavel && m.matchAgrupado;
    case 'sem_match':    return acionavel && !m.matchEncontrado;
  }
}

interface ChipFiltroProps {
  active: boolean;
  count: number;
  cls: string;
  label: string;
  onClick: () => void;
}
function ChipFiltro({ active, count, cls, label, onClick }: ChipFiltroProps) {
  const desabilitado = count === 0;
  return (
    <button
      type="button"
      onClick={desabilitado ? undefined : onClick}
      disabled={desabilitado}
      className={`h-7 inline-flex items-center px-2 rounded font-semibold transition ${cls}
        ${desabilitado
          ? 'opacity-40 cursor-not-allowed'
          : active
            ? 'ring-2 ring-current ring-offset-1 cursor-pointer'
            : 'cursor-pointer hover:brightness-95'}
      `}
    >
      {label}
    </button>
  );
}

type StepStatus = 'pending' | 'active' | 'done';

function StepBadge({ num, label, status }: { num: number; label: string; status: StepStatus }) {
  const cls =
    status === 'done'   ? 'bg-emerald-100 text-emerald-700'
    : status === 'active' ? 'bg-amber-100 text-amber-800'
    : 'bg-muted text-muted-foreground';
  const icon = status === 'done' ? '✓' : String(num);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      <span className="font-mono w-3 text-center">{icon}</span>
      {label}
    </span>
  );
}

interface BadgeStatus {
  label: string;
  cls: string;
}
/**
 * Prioridade da badge:
 *   1) status operacional persistido (conciliado/parcial/ignorado) tem precedência;
 *   2) caso contrário (nao_conciliado ou ainda não salvo), mostra match heurístico.
 * Hash existente NÃO esconde pendência — só estados terminais ofuscam o match.
 */
function badgeFromMovimento(m: MovimentoPreview): BadgeStatus {
  if (m.statusPersistido === 'conciliado') return { label: 'conciliado', cls: 'bg-emerald-100 text-emerald-700' };
  if (m.statusPersistido === 'parcial')    return { label: 'parcial',    cls: 'bg-amber-100 text-amber-700' };
  if (m.statusPersistido === 'ignorado')   return { label: 'ignorado',   cls: 'bg-muted text-muted-foreground' };
  if (m.matchAgrupado) {
    return {
      label: `agrupado ${m.quantidadeItensMatch} itens (${m.scoreMatch})`,
      cls: 'bg-blue-100 text-blue-700',
    };
  }
  if (m.scoreMatch >= 80) return { label: `match forte (${m.scoreMatch})`, cls: 'bg-emerald-100 text-emerald-700' };
  if (m.scoreMatch >= 50) return { label: `provável (${m.scoreMatch})`, cls: 'bg-amber-100 text-amber-700' };
  return { label: 'sem match', cls: 'bg-red-100 text-red-700' };
}

/** Status do match elegível para conversão Agendado/Programado → Realizado. */
function podeConverterStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase();
  return s === 'agendado' || s === 'programado';
}

/**
 * Lookup do id do extrato persistido — APENAS leitura, sem INSERT.
 *
 * Por que lookup-only?
 *   - INSERT individual em extrato_bancario_v2 fora do batch da importação
 *     conflita com RLS (cliente_membros) e não é necessário: o batch da
 *     importação já cobre o caso normal. Se o movimento ainda não foi
 *     importado, o erro instrui o usuário a confirmar a importação.
 *
 * Guards:
 *   - clienteId obrigatório (do contexto oficial).
 *   - lookup por (cliente_id, hash_movimento) — chave única na tabela.
 */
async function obterExtratoId(
  clienteId: string | null | undefined,
  m: MovimentoPreview,
): Promise<string> {
  if (!clienteId) {
    throw new Error('Cliente não selecionado — recarregue a tela e tente novamente.');
  }
  const { data, error } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('hash_movimento', m.hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'Este movimento ainda não foi salvo. ' +
      'Clique em "Salvar extrato" no rodapé antes de baixar lançamentos individualmente.',
    );
  }
  return (data as { id: string }).id;
}

interface Conta {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contaBancariaIdInicial?: string;
  onImported?: (resultado: { inseridos: number; importacaoId: string | null }) => void;
}

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoImportPreview({ open, onClose, contaBancariaIdInicial, onImported }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const {
    preview, loading, error,
    gerarPreview, confirmarImportacao, refreshStatusPersistidos, reset,
  } = useImportacaoExtrato();
  const { baixarLancamentoViaExtrato } = useBaixaViaExtrato();

  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string>(contaBancariaIdInicial ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Conversão 1:1 (AlertDialog) e agrupada (Dialog).
  const [confirm1a1, setConfirm1a1] = useState<MovimentoPreview | null>(null);
  const [confirmAgrupado, setConfirmAgrupado] = useState<{ extratoId: string; movimento: MovimentoPreview } | null>(null);
  // Revisão manual: provável (50-79) e ver possíveis (sem match).
  const [revisar, setRevisar] = useState<{
    extratoId: string;
    movimento: MovimentoPreview;
    candidatos: CandidatoPossivel[];
    titulo: string;
  } | null>(null);
  const [convertindo, setConvertindo] = useState(false);
  // Hashes locais marcados como já-baixados para feedback visual sem refetch.
  const [hashesBaixados, setHashesBaixados] = useState<Set<string>>(new Set());
  // Flag: a importação já foi confirmada nesta sessão (extratos persistidos).
  // Antes disso, qualquer baixa individual mostra toast pedindo confirmação primeiro.
  const [importacaoConfirmada, setImportacaoConfirmada] = useState(false);
  // AlertDialog de confirmação ao sair com movimentos parcialmente conciliados.
  const [confirmFinalizarParcial, setConfirmFinalizarParcial] = useState(false);
  // Filtro local da tabela — apenas visualização.
  const [filtro, setFiltro] = useState<FiltroTabela>('todos');

  // Reset COMPLETO quando o cliente muda (admin pode trocar de cliente
  // sem fechar a tela). Evita arrastar conta/preview de outro cliente.
  useEffect(() => {
    setContas([]);
    setContaId('');
    setArquivo(null);
    setHashesBaixados(new Set());
    setImportacaoConfirmada(false);
    setFiltro('todos');
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // Carregar contas do cliente atual. Se a conta selecionada não pertence
  // ao cliente carregado, limpa a seleção (defesa contra leak entre clientes).
  useEffect(() => {
    if (!open || !clienteId) {
      setContas([]);
      return;
    }
    supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao')
      .then(({ data }) => {
        const lista = (data ?? []) as Conta[];
        setContas(lista);
        setContaId((current) => {
          if (!current) return current;
          return lista.some((c) => c.id === current) ? current : '';
        });
      });
  }, [open, clienteId]);

  // Aceita contaBancariaIdInicial apenas se ela pertencer às contas do
  // cliente atual. Caso contrário, mantém seleção limpa (sem fallback).
  useEffect(() => {
    if (!contaBancariaIdInicial || contas.length === 0) return;
    if (contas.some((c) => c.id === contaBancariaIdInicial)) {
      setContaId(contaBancariaIdInicial);
    } else {
      setContaId('');
    }
  }, [contaBancariaIdInicial, contas]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      reset();
      setArquivo(null);
      setContaId('');
      setHashesBaixados(new Set());
      setImportacaoConfirmada(false);
      setFiltro('todos');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Garante que contaId pertence às contas atuais do cliente. */
  const validarContaDoCliente = (): boolean => {
    if (!clienteId) {
      toast.error('Cliente não selecionado — recarregue a tela.');
      return false;
    }
    if (!contaId) {
      toast.error('Selecione a conta bancária.');
      return false;
    }
    if (!contas.some((c) => c.id === contaId)) {
      toast.error('A conta selecionada não pertence ao cliente atual. Selecione novamente.');
      setContaId('');
      return false;
    }
    return true;
  };

  const handleGerar = async () => {
    if (!arquivo) { toast.error('Selecione um arquivo .ofx ou .csv'); return; }
    if (!validarContaDoCliente()) return;
    try {
      setImportacaoConfirmada(false);
      setFiltro('todos');
      await gerarPreview({ arquivo, contaBancariaId: contaId });
    } catch (e: any) {
      toast.error('Erro ao gerar preview: ' + (e?.message ?? e));
    }
  };

  const handleLimparPreview = () => {
    reset();
    setImportacaoConfirmada(false);
    setHashesBaixados(new Set());
    setFiltro('todos');
  };

  const handleConfirmar = async () => {
    if (!arquivo || !preview) return;
    if (!validarContaDoCliente()) return;
    try {
      const r = await confirmarImportacao({
        contaBancariaId: contaId,
        nomeArquivo: arquivo.name,
        formato: preview.formato,
      });
      toast.success(
        `Extrato salvo (${r.inseridos} movimento(s)). ` +
        `Agora revise os matches para vincular ou marcar realizados.`,
      );
      setImportacaoConfirmada(true);
      onImported?.(r);
      // NÃO fechar automaticamente — usuário precisa interagir com botões individuais.
    } catch (e: any) {
      toast.error('Erro ao confirmar: ' + (e?.message ?? e));
    }
  };

  /**
   * Permite ação se o movimento já está persistido. Antes do save desta
   * sessão, movimentos novos (existeNoDB=false) bloqueiam com toast claro;
   * movimentos existentes em DB de uma sessão anterior continuam acionáveis.
   */
  const exigirMovimentoPersistido = (m: MovimentoPreview): boolean => {
    if (m.existeNoDB) return true;
    toast.error(
      'Este movimento ainda não foi salvo. Clique em "Salvar extrato" antes de acionar.',
    );
    return false;
  };

  /** Conversão 1:1 confirmada — converte status e cria vínculo. */
  const executarConversao1a1 = async (m: MovimentoPreview) => {
    if (!clienteId || !m.lancamentoMatchId) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      const r = await baixarLancamentoViaExtrato({
        lancamentoId: m.lancamentoMatchId,
        extratoId,
        dataPagamentoReal: m.data,
        documentoBanco: m.documento ?? undefined,
      });
      setHashesBaixados((prev) => new Set(prev).add(m.hash));
      const partes: string[] = [];
      if (r.convertido) partes.push('lançamento marcado realizado');
      if (r.vinculado) partes.push('vínculo criado com extrato');
      toast.success(partes.length > 0 ? partes.join(' · ') : 'Já vinculado anteriormente');
      setConfirm1a1(null);
      // Reflete o novo status persistido (conciliado/parcial) no preview.
      await refreshStatusPersistidos();
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Abre modal agrupado — usa o extrato já persistido (precisa de id real). */
  const abrirAgrupado = async (m: MovimentoPreview) => {
    if (!clienteId) return;
    if (!exigirMovimentoPersistido(m)) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      setConfirmAgrupado({ extratoId, movimento: m });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Provável (50-79): abre revisão com o candidato 1:1 já escolhido pelo matcher. */
  const abrirRevisarAprovar = async (m: MovimentoPreview) => {
    if (!clienteId || !m.lancamentoMatchId) return;
    if (!exigirMovimentoPersistido(m)) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      const cand: CandidatoPossivel = {
        id: m.lancamentoMatchId,
        data: m.data,
        fornecedor: m.fornecedorMatch,
        descricao: m.descricaoMatch,
        valor: m.valor,
        statusTransacao: m.statusMatch,
        diffValor: 0,
        diffDias: 0,
        numeroDocumento: null,
      };
      // Reforça com candidatosPossiveis (sem duplicar o já escolhido).
      const extras = m.candidatosPossiveis.filter((c) => c.id !== cand.id);
      setRevisar({
        extratoId,
        movimento: m,
        candidatos: [cand, ...extras],
        titulo: `Revisar e aprovar match provável (${m.scoreMatch})`,
      });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Sem match: abre revisão com lista de candidatos sugeridos (top-10). */
  const abrirVerPossiveis = async (m: MovimentoPreview) => {
    if (!clienteId) return;
    if (m.candidatosPossiveis.length === 0) {
      toast.error('Nenhum candidato compatível encontrado');
      return;
    }
    if (!exigirMovimentoPersistido(m)) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      setRevisar({
        extratoId,
        movimento: m,
        candidatos: m.candidatosPossiveis,
        titulo: 'Possíveis lançamentos para este movimento',
      });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Wrapper para "Marcar realizado" / "Vincular extrato" — checa persistência do movimento. */
  const abrirConfirm1a1 = (m: MovimentoPreview) => {
    if (!exigirMovimentoPersistido(m)) return;
    setConfirm1a1(m);
  };

  /** Finalização limpa — todas as pendências resolvidas, extrato conciliado. */
  const handleFinalizarConciliacao = () => {
    toast.success('Conciliação finalizada com sucesso.');
    onClose();
  };

  /** Saída com pendências (nao_conciliado pendentes, sem parciais). */
  const handleFinalizarDepois = () => {
    toast.info('Pendências preservadas. Reabra o mesmo OFX para retomar.');
    onClose();
  };

  /** Saída quando há parciais — confirmação obrigatória antes. */
  const handleConfirmarFinalizarParcial = () => {
    setConfirmFinalizarParcial(false);
    toast.info('Saída registrada. Movimentos parciais permanecem para conciliação posterior.');
    onClose();
  };

  const totalValor = useMemo(() => {
    if (!preview) return 0;
    return preview.movimentos
      .filter((m) => !m.existeNoDB)
      .reduce((s, m) => s + Math.abs(m.valor), 0);
  }, [preview]);

  /** Movimentos filtrados pelo chip ativo. Apenas visual — nada é alterado. */
  const movimentosFiltrados = useMemo(() => {
    if (!preview) return [];
    if (filtro === 'todos') return preview.movimentos;
    return preview.movimentos.filter((m) => aplicarFiltro(m, filtro));
  }, [preview, filtro]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[94vw] max-w-7xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        {/* Header compacto fixo (linha 1: título + subtítulo curto) */}
        <DialogHeader className="shrink-0 px-6 py-3 border-b">
          <DialogTitle className="text-base leading-none">Importar extrato bancário</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            OFX/CSV · não cria lançamento. Importe, salve o extrato e finalize a conciliação com confirmação humana.
          </DialogDescription>
        </DialogHeader>

        {/* Linha de controles: arquivo, conta, gerar preview lado a lado */}
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] gap-3 items-end px-6 py-3 border-b">
          <div>
            <Label className="text-xs">Arquivo (.ofx ou .csv)</Label>
            <Input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Conta bancária *</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_exibicao || c.nome_conta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGerar}
            disabled={loading || !arquivo || !contaId}
            className="h-9"
          >
            {loading ? 'Processando...' : 'Gerar preview'}
          </Button>
        </div>

        {/* Faixa única: etapas (esquerda) + resumo do estado (direita) */}
        {preview && (() => {
          const algoSalvo = preview.existentesNoBanco > 0;
          const tudoSalvo = preview.novosParaSalvar === 0 && preview.totalLinhas > 0;
          const temPendencia = preview.pendentes > 0 || preview.parciais > 0;
          const step1: StepStatus = tudoSalvo ? 'done' : (preview.novosParaSalvar > 0 ? 'active' : 'pending');
          const step2: StepStatus = !algoSalvo ? 'pending' : (temPendencia ? 'active' : 'done');
          const step3: StepStatus = step2 === 'done' ? 'active' : 'pending';
          return (
            <div className="shrink-0 flex items-center justify-between flex-wrap gap-2 px-6 py-2 border-b text-[10px]">
              <div className="flex items-center gap-1 flex-wrap">
                <StepBadge num={1} label="Salvar extrato" status={step1} />
                <span className="text-muted-foreground">→</span>
                <StepBadge num={2} label="Conciliar"      status={step2} />
                <span className="text-muted-foreground">→</span>
                <StepBadge num={3} label="Finalizar"      status={step3} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {preview.totalLinhas} mov.
                {preview.conciliados > 0 && <> · <span className="text-emerald-700 font-semibold">{preview.conciliados} conciliados</span></>}
                {preview.parciais > 0    && <> · <span className="text-amber-800 font-semibold">{preview.parciais} parcial{preview.parciais !== 1 ? 'is' : ''}</span></>}
                {preview.pendentes > 0   && <> · <span className="text-amber-700 font-semibold">{preview.pendentes} pendente{preview.pendentes !== 1 ? 's' : ''}</span></>}
                {preview.ignorados > 0   && <> · {preview.ignorados} ignorado{preview.ignorados !== 1 ? 's' : ''}</>}
                {preview.novosParaSalvar > 0 && <> · {preview.novosParaSalvar} a salvar</>}
              </div>
            </div>
          );
        })()}

        {/* Avisos contextuais inline (compactos, 1 linha) */}
        {preview && !importacaoConfirmada && preview.novosParaSalvar > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-6 py-1 bg-amber-50/70 text-[11px] text-amber-800 border-b">
            <Info className="h-3 w-3 shrink-0" />
            <span className="truncate">1º passo: salvar o extrato bancário. Isso não altera o financeiro.</span>
          </div>
        )}
        {importacaoConfirmada && (
          <div className="shrink-0 flex items-center gap-1.5 px-6 py-1 bg-emerald-50/70 text-[11px] text-emerald-800 border-b">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">Extrato salvo. Revise os matches e confirme vínculos/baixas.</span>
          </div>
        )}
        {preview && !importacaoConfirmada && preview.novosParaSalvar === 0 && preview.existentesNoBanco > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-6 py-1 bg-emerald-50/70 text-[11px] text-emerald-800 border-b">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {preview.existentesNoBanco} já no banco · use as ações para finalizar.
            </span>
          </div>
        )}

        {error && (
          <div className="shrink-0 px-6 py-1 text-[11px] text-destructive bg-destructive/5 border-b">
            {error}
          </div>
        )}

        {/* Área central rolável — tabela ocupa o máximo possível */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 py-3 gap-2">
          {preview && (
            <>
            <div className="flex items-center gap-1.5 flex-wrap text-xs shrink-0">
              <ChipFiltro
                cls="bg-muted text-muted-foreground"
                label={`Todos (${preview.totalLinhas})`}
                count={preview.totalLinhas}
                active={filtro === 'todos'}
                onClick={() => setFiltro('todos')}
              />
              <span className="h-7 inline-flex items-center px-2 rounded bg-blue-50 text-blue-800 font-semibold">
                {preview.formato}
              </span>
              <ChipFiltro
                cls="bg-emerald-50 text-emerald-800"
                label={`${preview.matchDireto} match direto`}
                count={preview.matchDireto}
                active={filtro === 'match_direto'}
                onClick={() => setFiltro('match_direto')}
              />
              {preview.matchAgrupados > 0 && (
                <ChipFiltro
                  cls="bg-blue-50 text-blue-800"
                  label={`${preview.matchAgrupados} agrupado${preview.matchAgrupados !== 1 ? 's' : ''}`}
                  count={preview.matchAgrupados}
                  active={filtro === 'agrupados'}
                  onClick={() => setFiltro('agrupados')}
                />
              )}
              <ChipFiltro
                cls="bg-red-50 text-red-700"
                label={`${preview.semMatch} sem match`}
                count={preview.semMatch}
                active={filtro === 'sem_match'}
                onClick={() => setFiltro('sem_match')}
              />
              {preview.existentesNoBanco > 0 && (
                <ChipFiltro
                  cls="bg-slate-100 text-slate-700"
                  label={`${preview.existentesNoBanco} já no banco`}
                  count={preview.existentesNoBanco}
                  active={filtro === 'ja_no_banco'}
                  onClick={() => setFiltro('ja_no_banco')}
                />
              )}
              {preview.pendentes > 0 && (
                <ChipFiltro
                  cls="bg-amber-50 text-amber-800"
                  label={`${preview.pendentes} pendente${preview.pendentes !== 1 ? 's' : ''}`}
                  count={preview.pendentes}
                  active={filtro === 'pendentes'}
                  onClick={() => setFiltro('pendentes')}
                />
              )}
              {preview.parciais > 0 && (
                <ChipFiltro
                  cls="bg-amber-100 text-amber-900"
                  label={`${preview.parciais} parcial${preview.parciais !== 1 ? 'is' : ''}`}
                  count={preview.parciais}
                  active={filtro === 'parciais'}
                  onClick={() => setFiltro('parciais')}
                />
              )}
              {preview.conciliados > 0 && (
                <ChipFiltro
                  cls="bg-emerald-100 text-emerald-800"
                  label={`${preview.conciliados} conciliado${preview.conciliados !== 1 ? 's' : ''}`}
                  count={preview.conciliados}
                  active={filtro === 'conciliados'}
                  onClick={() => setFiltro('conciliados')}
                />
              )}
              {preview.ignorados > 0 && (
                <ChipFiltro
                  cls="bg-muted text-muted-foreground"
                  label={`${preview.ignorados} ignorado${preview.ignorados !== 1 ? 's' : ''}`}
                  count={preview.ignorados}
                  active={filtro === 'ignorados'}
                  onClick={() => setFiltro('ignorados')}
                />
              )}
              <span className="text-muted-foreground ml-auto">
                Total {formatMoeda(totalValor)} (a salvar)
              </span>
            </div>

            {/* Indicador do filtro aplicado + botão "Limpar filtro". */}
            <div className="flex items-center justify-between text-[11px] shrink-0">
              <span className="text-muted-foreground">
                Exibindo <strong className="text-foreground">{movimentosFiltrados.length}</strong> de {preview.movimentos.length} movimento{preview.movimentos.length !== 1 ? 's' : ''}
                {filtro !== 'todos' && <> · filtro: <span className="font-semibold">{ROTULO_FILTRO[filtro]}</span></>}
              </span>
              {filtro !== 'todos' && (
                <button
                  type="button"
                  className="text-blue-700 hover:underline"
                  onClick={() => setFiltro('todos')}
                >
                  Limpar filtro
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-[10px]">Data</TableHead>
                    <TableHead className="text-[10px]">Descrição</TableHead>
                    <TableHead className="text-[10px]">Documento</TableHead>
                    <TableHead className="text-[10px] text-right">Valor</TableHead>
                    <TableHead className="text-[10px]">Tipo</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Match financeiro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentosFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                        Nenhum movimento neste filtro.
                      </TableCell>
                    </TableRow>
                  )}
                  {movimentosFiltrados.map((m, i) => {
                    const badge = badgeFromMovimento(m);
                    const matchTitulo = m.fornecedorMatch || m.descricaoMatch;
                    const linhaInerte =
                      m.statusPersistido === 'conciliado' || m.statusPersistido === 'ignorado';
                    return (
                      <TableRow key={i} className={linhaInerte ? 'opacity-60' : ''}>
                        <TableCell className="text-[11px] font-mono">{fmtData(m.data)}</TableCell>
                        <TableCell className="text-[11px] max-w-[240px] truncate" title={m.descricao}>
                          {m.descricao || '-'}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {m.documento || '-'}
                        </TableCell>
                        <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {formatMoeda(m.valor)}
                        </TableCell>
                        <TableCell className="text-[11px]">{m.tipo === 'credito' ? '↑ Cred' : '↓ Déb'}</TableCell>
                        <TableCell className="text-[10px]">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {m.existeNoDB && m.statusPersistido === 'nao_conciliado' && (
                            <span
                              className="ml-1 inline-flex items-center px-1.5 py-px rounded bg-slate-100 text-slate-600 text-[9px] font-semibold whitespace-nowrap"
                              title="Movimento já está em extrato_bancario_v2 mas ainda não foi conciliado."
                            >
                              já no banco
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[300px]">
                          {m.statusPersistido === 'conciliado' ? (
                            <span className="text-emerald-700 italic text-[10px]">— conciliado —</span>
                          ) : m.statusPersistido === 'ignorado' ? (
                            <span className="text-muted-foreground italic text-[10px]">— ignorado —</span>
                          ) : m.matchAgrupado ? (
                            <div className="space-y-1">
                              <details className="group">
                                <summary className="cursor-pointer list-none text-blue-800 hover:underline">
                                  <span className="inline-block">
                                    {m.quantidadeItensMatch} lançamentos · {formatMoeda(m.valorSomado)}
                                    <span className="ml-1 text-[9px] text-blue-500 group-open:hidden">▶ ver</span>
                                    <span className="ml-1 text-[9px] text-blue-500 hidden group-open:inline">▼ ocultar</span>
                                  </span>
                                </summary>
                                <div className="mt-1 ml-2 pl-2 border-l border-blue-200 space-y-0.5 text-[10px]">
                                  {m.detalhesAgrupados.map((d) => {
                                    const st = (d.statusTransacao || '').toLowerCase();
                                    const stCls = st === 'realizado' ? 'bg-emerald-100 text-emerald-700'
                                      : st === 'agendado' ? 'bg-amber-100 text-amber-800'
                                      : st === 'programado' ? 'bg-blue-100 text-blue-700'
                                      : 'bg-muted text-muted-foreground';
                                    return (
                                      <div key={d.id} className="flex gap-2 items-baseline">
                                        <span className="font-mono text-muted-foreground shrink-0">{fmtData(d.data ?? '')}</span>
                                        <span className="flex-1 truncate" title={d.fornecedor || d.descricao || ''}>
                                          {d.fornecedor || d.descricao || '-'}
                                        </span>
                                        <span className={`tabular-nums shrink-0 ${d.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                          {formatMoeda(d.valor)}
                                        </span>
                                        <span className={`shrink-0 px-1.5 py-px rounded text-[8px] uppercase ${stCls}`}>{st || '—'}</span>
                                        {d.macroCusto && (
                                          <span className="text-muted-foreground italic shrink-0 text-[9px]" title={d.grupoCusto || undefined}>
                                            {d.macroCusto}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                              {hashesBaixados.has(m.hash) ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                  ✓ Baixado via OFX
                                </span>
                              ) : m.detalhesAgrupados.some((d) => podeConverterStatus(d.statusTransacao)) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  disabled={convertindo}
                                  onClick={() => abrirAgrupado(m)}
                                >
                                  ✓ Confirmar realizados
                                </Button>
                              )}
                            </div>
                          ) : m.matchEncontrado && matchTitulo ? (
                            <div className="space-y-1">
                              <span className="text-emerald-800 truncate block" title={matchTitulo}>{matchTitulo}</span>
                              {hashesBaixados.has(m.hash) ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                  ✓ Baixado via OFX
                                </span>
                              ) : (m.statusMatch || '').toLowerCase() === 'realizado' ? (
                                // Lançamento já está realizado: apenas vínculo (status NÃO muda).
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                    Já realizado
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] px-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                    disabled={convertindo}
                                    onClick={() => abrirConfirm1a1(m)}
                                  >
                                    Vincular extrato
                                  </Button>
                                </div>
                              ) : m.scoreMatch >= 80 && podeConverterStatus(m.statusMatch) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  disabled={convertindo}
                                  onClick={() => abrirConfirm1a1(m)}
                                >
                                  ✓ Marcar realizado
                                </Button>
                              ) : m.scoreMatch >= 50 && m.scoreMatch < 80 && m.lancamentoMatchId ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 border-amber-400 text-amber-800 hover:bg-amber-50"
                                  disabled={convertindo}
                                  onClick={() => abrirRevisarAprovar(m)}
                                >
                                  Revisar e aprovar
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-muted-foreground">—</span>
                              {!hashesBaixados.has(m.hash) && m.candidatosPossiveis.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 border-blue-300 text-blue-800 hover:bg-blue-50"
                                  disabled={convertindo}
                                  onClick={() => abrirVerPossiveis(m)}
                                >
                                  Ver possíveis ({m.candidatosPossiveis.length})
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between gap-3 z-20 flex-col-reverse sm:flex-row">
          {/* Zona 1: resumo do estado atual */}
          {preview ? (
            <div className="text-[11px] text-muted-foreground sm:mr-auto truncate">
              {preview.totalLinhas} mov.
              {preview.conciliados > 0 && <> · <span className="text-emerald-700 font-semibold">{preview.conciliados} conciliados</span></>}
              {preview.parciais > 0    && <> · <span className="text-amber-800 font-semibold">{preview.parciais} parciais</span></>}
              {preview.pendentes > 0   && <> · <span className="text-amber-700 font-semibold">{preview.pendentes} pendentes</span></>}
              {preview.ignorados > 0   && <> · {preview.ignorados} ignorados</>}
              {preview.novosParaSalvar > 0 && <> · {preview.novosParaSalvar} a salvar</>}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground sm:mr-auto">
              Nenhum lançamento será criado ou alterado nesta etapa.
            </span>
          )}

          {/* Zona 2: ações secundárias */}
          <div className="flex gap-2 flex-wrap">
            {preview && (
              <Button variant="ghost" onClick={handleLimparPreview} disabled={loading}>
                Limpar preview
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Fechar
            </Button>

            {/* Zona 3: ação principal — varia conforme o estado do fluxo */}
            {(() => {
              if (!preview) return null;
              if (preview.novosParaSalvar > 0) {
                // Estado 1: ainda há novos para salvar → botão de save (primário, padrão)
                return (
                  <Button
                    onClick={handleConfirmar}
                    disabled={loading || importacaoConfirmada}
                  >
                    {importacaoConfirmada
                      ? 'Extrato salvo ✓'
                      : (loading ? 'Salvando...' : `Salvar extrato (${preview.novosParaSalvar})`)}
                  </Button>
                );
              }
              if (preview.parciais > 0) {
                // Estado 2: parciais existem → exige confirmação para sair
                return (
                  <Button
                    variant="outline"
                    className="border-amber-400 text-amber-800 hover:bg-amber-50"
                    onClick={() => setConfirmFinalizarParcial(true)}
                  >
                    Finalizar com pendências
                  </Button>
                );
              }
              if (preview.pendentes > 0) {
                // Estado 3: nao_conciliado pendentes → saída suave
                return (
                  <Button variant="outline" onClick={handleFinalizarDepois}>
                    Finalizar depois
                  </Button>
                );
              }
              // Estado 4: tudo limpo → finalização final
              return (
                <Button
                  onClick={handleFinalizarConciliacao}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Finalizar conciliação
                </Button>
              );
            })()}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* AlertDialog: baixa 1:1 (Marcar realizado) ou apenas vínculo (Já realizado). */}
      <AlertDialog open={!!confirm1a1} onOpenChange={(v) => { if (!v) setConfirm1a1(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(confirm1a1?.statusMatch || '').toLowerCase() === 'realizado'
                ? 'Vincular extrato ao lançamento já realizado?'
                : 'Confirmar baixa do lançamento via OFX?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm1a1 && (
                (confirm1a1.statusMatch || '').toLowerCase() === 'realizado' ? (
                  <span>
                    O lançamento <strong>{confirm1a1.fornecedorMatch || confirm1a1.descricaoMatch || '(sem nome)'}</strong> já
                    está marcado como <strong>realizado</strong>. Apenas o vínculo com este movimento do extrato será criado.
                    Status, categoria, valor e classificação NÃO serão alterados.
                  </span>
                ) : (
                  <span>
                    O lançamento <strong>{confirm1a1.fornecedorMatch || confirm1a1.descricaoMatch || '(sem nome)'}</strong> será
                    marcado como <strong>realizado</strong> com data de pagamento {fmtData(confirm1a1.data)} e vinculado
                    a este movimento do extrato. Categoria, valor e classificação NÃO serão alterados.
                  </span>
                )
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertindo}
              onClick={() => confirm1a1 && executarConversao1a1(confirm1a1)}
            >
              {convertindo
                ? 'Processando...'
                : ((confirm1a1?.statusMatch || '').toLowerCase() === 'realizado' ? 'Vincular' : 'Marcar realizado')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: confirmação ao finalizar com movimentos parciais. */}
      <AlertDialog
        open={confirmFinalizarParcial}
        onOpenChange={(v) => { if (!v) setConfirmFinalizarParcial(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar com movimentos parciais?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem <strong>{preview?.parciais ?? 0} movimento(s) parcialmente conciliado(s)</strong>.
              Eles permanecem com status <em>parcial</em> em <code>extrato_bancario_v2</code> e podem
              ser concluídos depois reabrindo o mesmo OFX. Deseja sair mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarFinalizarParcial}>
              Sair com pendências
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de seleção para baixa agrupada */}
      {confirmAgrupado && (
        <ConfirmarBaixaAgrupadaDialog
          open={!!confirmAgrupado}
          onClose={() => setConfirmAgrupado(null)}
          extratoId={confirmAgrupado.extratoId}
          dataMovimentoExtrato={confirmAgrupado.movimento.data}
          documentoExtrato={confirmAgrupado.movimento.documento}
          itens={confirmAgrupado.movimento.detalhesAgrupados}
          onConcluido={() => {
            setHashesBaixados((prev) => new Set(prev).add(confirmAgrupado.movimento.hash));
            setConfirmAgrupado(null);
            void refreshStatusPersistidos();
          }}
        />
      )}

      {/* Modal de revisão manual: provável / sem match (lista + side-by-side) */}
      {revisar && (
        <RevisarMatchDialog
          open={!!revisar}
          onClose={() => setRevisar(null)}
          extratoId={revisar.extratoId}
          movimentoOFX={{
            data: revisar.movimento.data,
            descricao: revisar.movimento.descricao,
            valor: revisar.movimento.valor,
            documento: revisar.movimento.documento,
          }}
          candidatos={revisar.candidatos}
          tituloCustom={revisar.titulo}
          onConcluido={() => {
            setHashesBaixados((prev) => new Set(prev).add(revisar.movimento.hash));
            setRevisar(null);
            void refreshStatusPersistidos();
          }}
        />
      )}
    </Dialog>
  );
}
