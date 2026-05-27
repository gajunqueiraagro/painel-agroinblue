/**
 * ExtratoListaTab — visualização tabular dos movimentos importados em
 * extrato_bancario_v2 para uma conta + mês.
 *
 * Filtros por props (controlados pela tela hospedeira):
 *   - contaBancariaId
 *   - anoMes ('YYYY-MM')
 *
 * Ações por linha:
 *   - "Conciliar"  → abre ConciliarExtratoDialog
 *   - "Ignorar"    → marca status='ignorado' no movimento
 *
 * NÃO altera lançamentos. NÃO cria lançamentos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeftRight } from 'lucide-react';
import { useExtratoBancario, type ExtratoMovimento } from '@/hooks/useExtratoBancario';
import { ConciliarExtratoDialog, type ExtratoMovimentoRef } from './ConciliarExtratoDialog';
import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useFinanceiroV2, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useConciliacaoBancariaItens } from '@/hooks/useConciliacaoBancariaItens';
import { useExcelLinhasAux } from '@/hooks/useExcelLinhasAux';
import {
  enriquecerMovimentos,
  type MovimentoEnriquecido,
} from '@/lib/financeiro/extratoEnriquecer';
import { montarPayloadConta } from '@/lib/financeiro/contaPayload';
import { ConciliacaoPendenciasPanel } from './ConciliacaoPendenciasPanel';
import { useExtratoParesOfx } from '@/hooks/useExtratoParesOfx';
import { classificarMovimento, DIAG_INFO } from '@/lib/financeiro/conciliacaoDiagnostico';

interface Props {
  contaBancariaId: string | null;
  anoMes: string | null; // 'YYYY-MM' ou null = sem filtro
}

const STATUS_BADGE: Record<ExtratoMovimento['status'], { label: string; cls: string }> = {
  nao_conciliado: { label: 'Não conciliado', cls: 'bg-red-100 text-red-700' },
  parcial:        { label: 'Parcial',        cls: 'bg-amber-100 text-amber-700' },
  conciliado:     { label: 'Conciliado',     cls: 'bg-emerald-100 text-emerald-700' },
  ignorado:       { label: 'Ignorado',       cls: 'bg-muted text-muted-foreground' },
};

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoListaTab({ contaBancariaId, anoMes }: Props) {
  const dataInicio = anoMes ? `${anoMes}-01` : undefined;
  const dataFim = useMemo(() => {
    if (!anoMes) return undefined;
    const [y, m] = anoMes.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    return `${anoMes}-${String(ultimo).padStart(2, '0')}`;
  }, [anoMes]);

  const { movimentos, loading, refetch } = useExtratoBancario({
    contaBancariaId: contaBancariaId ?? undefined,
    dataInicio,
    dataFim,
    enabled: !!contaBancariaId,
  });

  // Hooks para o caminho "Criar lançamento" a partir de OFX órfão.
  const { fazendas, fazendaAtual } = useFazenda();
  const {
    contasBancarias,
    fornecedores,
    classificacoes,
    loadContas,
    loadFornecedores,
    loadClassificacoes,
    criarLancamentoComId,
    criarFornecedor,
  } = useFinanceiroV2();
  const { insert: insertVinculo, listarPorExtratos } = useConciliacaoBancariaItens();
  const { listarPorContaMes } = useExcelLinhasAux();
  const { clienteAtual } = useCliente();

  // PR-Conciliacao-DiagnosticoOperacional — par OFX cross-account
  // (mesmo cliente+mês, valor abs igual, sinal oposto, ±1 dia).
  // Query única por mês, compartilhada entre contas. Read-only.
  const { paresOfx } = useExtratoParesOfx({
    clienteId: clienteAtual?.id ?? null,
    anoMes: anoMes ?? null,
  });

  // PR3 — IDs dos movimentos da página atual (estável por valor).
  const movIds = useMemo(() => movimentos.map((m) => m.id), [movimentos]);

  // PR3 — query batch: vínculos existentes de TODOS os movimentos da página.
  const { data: vinculosByExtratoId } = useQuery({
    queryKey: ['cbi-batch', contaBancariaId, anoMes, movIds.join(',')],
    enabled: movIds.length > 0,
    queryFn: () => listarPorExtratos(movIds),
    staleTime: 30_000,
  });

  // PR3 — refs Excel pendentes do mês na conta (sugestões).
  const { data: refsExcelPendentes } = useQuery({
    queryKey: ['excel-aux', clienteAtual?.id, contaBancariaId, anoMes, 'pendente'],
    enabled: !!clienteAtual?.id && !!contaBancariaId && !!anoMes,
    queryFn: async () => {
      const todas = await listarPorContaMes(contaBancariaId!, anoMes!, clienteAtual!.id);
      return todas.filter((r) => r.status === 'pendente');
    },
    staleTime: 30_000,
  });

  // PR-C — lançamentos REALIZADOS do mês na conta (com flag de vínculo cbi).
  // Substitui a query 'lancs-orfaos' do PR3: agora carrega TODOS os realizados
  // pra somar entradas/saídas do sistema no resumo do topo. Órfãos são
  // derivados via memo abaixo (compat com extratoEnriquecer).
  const { data: lancamentosRealizadosDoMes } = useQuery({
    queryKey: ['lancs-realizados', clienteAtual?.id, contaBancariaId, anoMes],
    enabled: !!clienteAtual?.id && !!contaBancariaId && !!anoMes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financeiro_lancamentos_v2' as any)
        .select(`
          id, data_pagamento, valor, sinal, descricao,
          conta_bancaria_id, conta_destino_id,
          conciliacao_bancaria_itens!left(id)
        `)
        .eq('cliente_id', clienteAtual!.id)
        .or(`conta_bancaria_id.eq.${contaBancariaId},conta_destino_id.eq.${contaBancariaId}`)
        .eq('ano_mes', anoMes!)
        .eq('cancelado', false)
        .eq('status_transacao', 'realizado')
        .eq('sem_movimentacao_caixa', false);
      if (error) throw error;
      // PostgREST não consegue inferir o tipo do embed conciliacao_bancaria_itens
      // (tabela acessada via .from(... as any) no projeto) — converter via
      // `unknown` é o padrão sugerido pelo próprio TS quando os tipos não se
      // sobrepõem (TS2352). Não é `as any`, é cast em 2 etapas, idiomático.
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        data_pagamento: string | null;
        valor: number | null;
        sinal: number | null;
        descricao: string | null;
        conta_bancaria_id: string | null;
        conta_destino_id: string | null;
        conciliacao_bancaria_itens: Array<{ id: string }> | null;
      }>;
      return rows
        .filter((l): l is typeof l & { data_pagamento: string } => !!l.data_pagamento)
        .map((l) => ({
          id: l.id,
          data_pagamento: l.data_pagamento,
          valor: Math.abs(Number(l.valor) || 0),
          valorSigned: (Number(l.valor) || 0) * (Number(l.sinal) >= 0 ? 1 : -1),
          sinal: Number(l.sinal),
          descricao: l.descricao,
          conta_bancaria_id: l.conta_bancaria_id,
          conta_destino_id: l.conta_destino_id,
          temVinculo:
            !!l.conciliacao_bancaria_itens && l.conciliacao_bancaria_itens.length > 0,
        }));
    },
    staleTime: 30_000,
  });

  // PR3 (compat) — derivar órfãos do array de realizados.
  const lancamentosOrfaosDoMes = useMemo(
    () => lancamentosRealizadosDoMes?.filter((l) => !l.temVinculo),
    [lancamentosRealizadosDoMes],
  );

  // PR-C — saldo oficial do sistema para conta/mês (saldo_inicial/saldo_final).
  // Tabela financeiro_saldos_bancarios_v2 tem registro único por
  // (cliente_id, conta_bancaria_id, ano_mes). null se ainda não foi calculado.
  const { data: saldoSistema } = useQuery({
    queryKey: ['saldo-sistema-conta', clienteAtual?.id, contaBancariaId, anoMes],
    enabled: !!clienteAtual?.id && !!contaBancariaId && !!anoMes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financeiro_saldos_bancarios_v2' as any)
        .select('saldo_inicial, saldo_final, fechado, status_mes')
        .eq('cliente_id', clienteAtual!.id)
        .eq('conta_bancaria_id', contaBancariaId!)
        .eq('ano_mes', anoMes!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as {
        saldo_inicial: number;
        saldo_final: number;
        fechado: boolean;
        status_mes: string;
      } | null) ?? null;
    },
    staleTime: 30_000,
  });

  // PR3 — enriquecimento client-side (loading-safe).
  const enriquecidoLoading =
    !vinculosByExtratoId || !refsExcelPendentes || !lancamentosOrfaosDoMes;

  const enriquecidos = useMemo<MovimentoEnriquecido[]>(() => {
    if (!vinculosByExtratoId || !refsExcelPendentes || !lancamentosOrfaosDoMes) {
      // Render sem enriquecimento — placeholder neutro até queries chegarem.
      return movimentos.map((m) => ({
        ...m,
        statusEnriquecido: m.status === 'ignorado' ? 'ignorado' : 'orfao_sem_pista',
        vinculos: [],
        valorAplicado: 0,
        valorPendente: Math.abs(m.valor),
        qtCandidatosSistema: 0,
        qtRefsExcel: 0,
        candidatosSistemaIds: [],
        refsExcelIds: [],
      }));
    }
    return enriquecerMovimentos({
      movimentos,
      vinculosByExtratoId,
      refsExcelPendentes,
      lancamentosOrfaosDoMes,
    });
  }, [movimentos, vinculosByExtratoId, refsExcelPendentes, lancamentosOrfaosDoMes]);

  // PR-C — resumo BANCO (OFX) vs SISTEMA (apontamento).
  // - BANCO: entradas/saídas somam os movimentos do extrato; saldo inicial/final
  //   derivam de saldo_apos do primeiro/último movimento (não há campo
  //   saldo_inicial/saldo_final no extrato_bancario_v2). Se saldo_apos for null
  //   em alguma ponta, mostramos `null` (UI exibe "—") — sem invenção.
  // - SISTEMA: entradas/saídas somam lancamentos_v2 realizados do mês;
  //   saldo inicial/final vêm de financeiro_saldos_bancarios_v2.
  // - Diferença principal: saldo_final_banco − saldo_final_sistema.
  const resumoConciliacao = useMemo(() => {
    // BANCO
    let entradasBanco = 0;
    let saidasBanco = 0;
    for (const m of movimentos) {
      const v = Number(m.valor) || 0;
      if (v > 0) entradasBanco += v;
      else if (v < 0) saidasBanco += -v;
    }
    // movimentos vem em ordem DESC (mais recente primeiro) — useExtratoBancario.
    const primeiroDoPeriodo = movimentos[movimentos.length - 1]; // mais antigo
    const ultimoDoPeriodo = movimentos[0]; // mais recente
    const saldoFinalBanco =
      ultimoDoPeriodo?.saldo_apos == null
        ? null
        : Number(ultimoDoPeriodo.saldo_apos);
    const saldoInicialBanco =
      primeiroDoPeriodo?.saldo_apos == null
        ? null
        : Number(primeiroDoPeriodo.saldo_apos) -
          (Number(primeiroDoPeriodo.valor) || 0);

    // SISTEMA
    let entradasSistema = 0;
    let saidasSistema = 0;
    for (const l of lancamentosRealizadosDoMes ?? []) {
      if (l.valorSigned > 0) entradasSistema += l.valorSigned;
      else if (l.valorSigned < 0) saidasSistema += -l.valorSigned;
    }
    const saldoInicialSistema = saldoSistema
      ? Number(saldoSistema.saldo_inicial)
      : null;
    const saldoFinalSistema = saldoSistema
      ? Number(saldoSistema.saldo_final)
      : null;

    // Diferença operacional principal (Banco − Sistema). null se faltar dado.
    const diferencaSaldoFinal =
      saldoFinalBanco != null && saldoFinalSistema != null
        ? saldoFinalBanco - saldoFinalSistema
        : null;

    return {
      banco: {
        saldoInicial: saldoInicialBanco,
        entradas: entradasBanco,
        saidas: saidasBanco,
        saldoFinal: saldoFinalBanco,
      },
      sistema: {
        saldoInicial: saldoInicialSistema,
        entradas: entradasSistema,
        saidas: saidasSistema,
        saldoFinal: saldoFinalSistema,
      },
      diferencaSaldoFinal,
      saldoSistemaFechado: saldoSistema?.fechado ?? false,
    };
  }, [movimentos, lancamentosRealizadosDoMes, saldoSistema]);

  // PR-C — contadores de badge derivados de enriquecidos (PR3).
  const contadoresBadge = useMemo(() => {
    let conciliado = 0;
    let parcial = 0;
    let bancoOrfao = 0; // OFX sem vínculo (qualquer status enriquecido órfão)
    for (const m of enriquecidos) {
      if (m.statusEnriquecido === 'conciliado') conciliado++;
      else if (m.statusEnriquecido === 'parcial') parcial++;
      else if (
        m.statusEnriquecido === 'orfao_com_sistema' ||
        m.statusEnriquecido === 'orfao_com_excel' ||
        m.statusEnriquecido === 'orfao_com_ambos' ||
        m.statusEnriquecido === 'orfao_sem_pista'
      ) {
        bancoOrfao++;
      }
    }
    const apontamentoOrfao = lancamentosOrfaosDoMes?.length ?? 0;
    return { conciliado, parcial, bancoOrfao, apontamentoOrfao };
  }, [enriquecidos, lancamentosOrfaosDoMes]);

  const [conciliando, setConciliando] = useState<ExtratoMovimentoRef | null>(null);
  const [ignorandoId, setIgnorandoId] = useState<string | null>(null);
  const [movCriando, setMovCriando] = useState<ExtratoMovimento | null>(null);
  // PR-F — fluxo "Transferência" via OFX (3-Transferências). Reaproveita
  // o LancamentoV2Dialog em modo pré-populado com a conta OFX travada
  // conforme o sinal: OFX < 0 trava conta_bancaria_id (origem),
  // OFX > 0 trava conta_destino_id. Operador escolhe a contraparte.
  const [movTransferencia, setMovTransferencia] = useState<ExtratoMovimento | null>(null);

  // PR-D — seleção em massa para criação de lançamentos a partir do OFX.
  // Elegibilidade: status='nao_conciliado' && sem vínculo em cbi && não ignorado.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [mostrarConfirmacaoLote, setMostrarConfirmacaoLote] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);
  const queryClient = useQueryClient();

  const idsElegiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of enriquecidos) {
      if (
        m.status === 'nao_conciliado' &&
        m.vinculos.length === 0
      ) {
        set.add(m.id);
      }
    }
    return set;
  }, [enriquecidos]);

  // Sanitização: se elegibilidade muda (refetch, novos vínculos), remover
  // da seleção qualquer ID que deixou de ser elegível.
  useEffect(() => {
    setSelecionados((prev) => {
      let mudou = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (idsElegiveis.has(id)) next.add(id);
        else mudou = true;
      }
      return mudou ? next : prev;
    });
  }, [idsElegiveis]);

  const resumoSelecao = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const m of enriquecidos) {
      if (!selecionados.has(m.id)) continue;
      const v = Number(m.valor) || 0;
      if (v > 0) entradas += v;
      else if (v < 0) saidas += -v;
    }
    return { qt: selecionados.size, entradas, saidas };
  }, [enriquecidos, selecionados]);

  const toggleSelecao = (id: string) => {
    if (!idsElegiveis.has(id)) return;
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelecionarTodosElegiveis = () => {
    setSelecionados((prev) => {
      // Se TODOS os elegíveis já estão marcados, limpar; senão marcar todos.
      const todosMarcados =
        idsElegiveis.size > 0 &&
        Array.from(idsElegiveis).every((id) => prev.has(id));
      if (todosMarcados) return new Set();
      return new Set(idsElegiveis);
    });
  };

  const limparSelecao = () => setSelecionados(new Set());

  // PR-D — contexto pra modal de confirmação (conta + fazenda).
  const contaSelecionada = useMemo(
    () => contasBancarias.find((c) => c.id === contaBancariaId) ?? null,
    [contasBancarias, contaBancariaId],
  );

  const handleCriarLote = async () => {
    if (!clienteAtual?.id || !contaBancariaId) return;
    if (selecionados.size === 0) return;
    const conta = contaSelecionada;
    if (!conta) {
      toast.error('Conta bancária não encontrada — aguarde o carregamento');
      return;
    }
    const fazendaId = conta.fazenda_id;
    if (!fazendaId) {
      toast.error('Conta sem fazenda vinculada — não é possível criar em lote');
      return;
    }

    // Itera enriquecidos pra preservar a ordem visual (mais recente primeiro).
    const alvos = enriquecidos.filter((m) => selecionados.has(m.id));
    setProcessandoLote(true);
    let criados = 0;
    let falhas = 0;
    const idsCriados: string[] = [];

    for (const mov of alvos) {
      try {
        const valorAbs = Math.abs(Number(mov.valor) || 0);
        const ehEntrada = (Number(mov.valor) || 0) >= 0;
        const tipoOperacao = ehEntrada ? '1-Entradas' : '2-Saídas';
        // PR-K — conta_*_id via helper soberano: entrada → conta_destino_id,
        // saída → conta_bancaria_id. Convenção oficial cravada.
        const contas = montarPayloadConta(tipoOperacao, contaBancariaId);
        const form: LancamentoV2Form = {
          fazenda_id: fazendaId,
          conta_bancaria_id: contas.conta_bancaria_id,
          conta_destino_id: contas.conta_destino_id,
          data_competencia: mov.data_movimento,
          data_pagamento: mov.data_movimento,
          valor: valorAbs,
          tipo_operacao: tipoOperacao,
          status_transacao: 'realizado',
          descricao: mov.descricao ?? undefined,
          numero_documento: mov.documento ?? undefined,
        };
        const lancId = await criarLancamentoComId(form, {
          origem: 'ofx',
          silent: true,
        });
        if (!lancId) {
          falhas++;
          console.error('[ExtratoListaTab] lote: falha ao criar lancamento', {
            extrato_id: mov.id,
            descricao: mov.descricao,
            valor: mov.valor,
          });
          continue;
        }
        await insertVinculo({
          extrato_id: mov.id,
          lancamento_id: lancId,
          valor_aplicado: valorAbs,
          cliente_id: mov.cliente_id,
        });
        criados++;
        idsCriados.push(mov.id);
      } catch (err) {
        falhas++;
        console.error('[ExtratoListaTab] lote: erro ao processar OFX', {
          extrato_id: mov.id,
          descricao: mov.descricao,
          valor: mov.valor,
          err,
        });
      }
    }

    // Limpa apenas os IDs efetivamente processados; falhas continuam selecionadas.
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const id of idsCriados) next.delete(id);
      return next;
    });
    setMostrarConfirmacaoLote(false);
    setProcessandoLote(false);

    // Refetch das queries dependentes (extrato + vínculos + realizados + saldo).
    refetch();
    queryClient.invalidateQueries({
      queryKey: ['cbi-batch', contaBancariaId, anoMes],
    });
    queryClient.invalidateQueries({
      queryKey: ['lancs-realizados', clienteAtual.id, contaBancariaId, anoMes],
    });
    queryClient.invalidateQueries({
      queryKey: ['saldo-sistema-conta', clienteAtual.id, contaBancariaId, anoMes],
    });

    if (criados > 0 && falhas === 0) {
      toast.success(`${criados} lançamento(s) criado(s) e conciliado(s)`);
    } else if (criados > 0 && falhas > 0) {
      toast.warning(
        `${criados} criado(s), ${falhas} falharam — verifique o console`,
      );
    } else {
      toast.error(`Nenhum lançamento criado — ${falhas} falha(s)`);
    }
  };

  // Carrega as listas necessárias para o LancamentoV2Dialog uma vez no mount.
  // Os 3 loaders são useCallback estáveis no useFinanceiroV2.
  useEffect(() => {
    loadContas();
    loadFornecedores();
    loadClassificacoes();
  }, [loadContas, loadFornecedores, loadClassificacoes]);

  const handleIgnorar = async (mov: ExtratoMovimento) => {
    setIgnorandoId(mov.id);
    const { error } = await supabase
      .from('extrato_bancario_v2' as any)
      .update({ status: 'ignorado' })
      .eq('id', mov.id);
    setIgnorandoId(null);
    if (error) {
      toast.error('Erro ao ignorar: ' + error.message);
      return;
    }
    toast.success('Movimento marcado como ignorado');
    refetch();
  };

  const handleCriarFromExtrato = async (
    form: LancamentoV2Form,
    _id?: string,
  ): Promise<boolean> => {
    if (!movCriando) return false;
    const id = await criarLancamentoComId(form, { origem: 'extrato' });
    if (!id) return false; // hook já mostrou toast de erro — modal fica aberto pra retry
    try {
      await insertVinculo({
        extrato_id: movCriando.id,
        lancamento_id: id,
        valor_aplicado: Math.abs(movCriando.valor),
        cliente_id: movCriando.cliente_id,
      });
      toast.success('Lançamento criado e conciliado');
      setMovCriando(null);
      refetch();
      return true;
    } catch (e: any) {
      // Lançamento já está em financeiro_lancamentos_v2 — fechar modal pra evitar
      // duplicação acidental se operador re-clicar Salvar. Operador re-tenta o
      // vínculo via botão "Conciliar" (que agora filtra valor/sinal corretamente).
      toast.error(
        'Lançamento criado, mas erro ao vincular ao extrato: '
        + (e?.message ?? e)
        + '. Use o botão Conciliar para vincular manualmente.',
      );
      setMovCriando(null);
      refetch();
      return true;
    }
  };

  // PR-F — handler análogo a handleCriarFromExtrato, mas para transferência.
  // O LancamentoV2Dialog já valida origem≠destino e exige conta destino
  // via v2Transferencia.validateTransferenciaAccounts. Aqui só conectamos
  // o save ao vínculo cbi (mesmo padrão da rota "Criar lançamento").
  const handleTransferenciaFromExtrato = async (
    form: LancamentoV2Form,
    _id?: string,
  ): Promise<boolean> => {
    if (!movTransferencia) return false;
    const id = await criarLancamentoComId(form, { origem: 'extrato' });
    if (!id) return false;
    try {
      await insertVinculo({
        extrato_id: movTransferencia.id,
        lancamento_id: id,
        valor_aplicado: Math.abs(movTransferencia.valor),
        cliente_id: movTransferencia.cliente_id,
      });
      toast.success('Transferência criada e conciliada');
      setMovTransferencia(null);
      refetch();
      return true;
    } catch (e: any) {
      // Lançamento de transferência já está em financeiro_lancamentos_v2.
      // Fechar modal pra evitar duplicação. Operador refaz vínculo via Conciliar.
      toast.error(
        'Transferência criada, mas erro ao vincular ao extrato: '
        + (e?.message ?? e)
        + '. Use o botão Conciliar para vincular manualmente.',
      );
      setMovTransferencia(null);
      refetch();
      return true;
    }
  };

  if (!contaBancariaId) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        Selecione uma conta para visualizar o extrato importado.
      </div>
    );
  }

  const fmtSaldo = (v: number | null) => (v == null ? '—' : formatMoeda(v));
  const diffCls = (() => {
    const d = resumoConciliacao.diferencaSaldoFinal;
    if (d == null) return 'text-muted-foreground';
    if (Math.abs(d) < 0.01) return 'text-emerald-700';
    return 'text-red-700';
  })();

  return (
    <div className="space-y-2">
      {/* PR-C — Resumo Banco OFX vs Sistema (apontamento) */}
      <div className="border rounded-md bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          {/* COLUNA BANCO */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                Banco (OFX)
              </span>
              <span className="text-[10px] text-muted-foreground">
                fonte: extrato_bancario_v2
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Saldo inicial</span>
              <span className="text-right tabular-nums font-mono">
                {fmtSaldo(resumoConciliacao.banco.saldoInicial)}
              </span>
              <span className="text-muted-foreground">Entradas</span>
              <span className="text-right tabular-nums font-mono text-emerald-700">
                {fmtSaldo(resumoConciliacao.banco.entradas)}
              </span>
              <span className="text-muted-foreground">Saídas</span>
              <span className="text-right tabular-nums font-mono text-red-700">
                {fmtSaldo(resumoConciliacao.banco.saidas)}
              </span>
              <span className="text-foreground font-semibold">Saldo final</span>
              <span className="text-right tabular-nums font-mono font-semibold">
                {fmtSaldo(resumoConciliacao.banco.saldoFinal)}
              </span>
            </div>
          </div>
          {/* COLUNA SISTEMA */}
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                Sistema (apontamento)
              </span>
              <span className="text-[10px] text-muted-foreground">
                fonte: financeiro_saldos_bancarios_v2
              </span>
              {resumoConciliacao.saldoSistemaFechado && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-slate-100 text-slate-700"
                >
                  fechado
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Saldo inicial</span>
              <span className="text-right tabular-nums font-mono">
                {fmtSaldo(resumoConciliacao.sistema.saldoInicial)}
              </span>
              <span className="text-muted-foreground">Entradas</span>
              <span className="text-right tabular-nums font-mono text-emerald-700">
                {fmtSaldo(resumoConciliacao.sistema.entradas)}
              </span>
              <span className="text-muted-foreground">Saídas</span>
              <span className="text-right tabular-nums font-mono text-red-700">
                {fmtSaldo(resumoConciliacao.sistema.saidas)}
              </span>
              <span className="text-foreground font-semibold">Saldo final</span>
              <span className="text-right tabular-nums font-mono font-semibold">
                {fmtSaldo(resumoConciliacao.sistema.saldoFinal)}
              </span>
            </div>
          </div>
        </div>
        {/* Diferença operacional principal */}
        <div className="border-t px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Diferença (Banco − Sistema)
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ${diffCls}`}>
            {fmtSaldo(resumoConciliacao.diferencaSaldoFinal)}
          </span>
        </div>
        {/* Badges de status agregado */}
        <div className="border-t px-3 py-2 flex flex-wrap gap-1.5 items-center">
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] h-5 px-1.5"
          >
            Conciliado {contadoresBadge.conciliado}
          </Badge>
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] h-5 px-1.5"
          >
            Parcial {contadoresBadge.parcial}
          </Badge>
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-300 text-[10px] h-5 px-1.5"
          >
            Banco órfão {contadoresBadge.bancoOrfao}
          </Badge>
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-300 text-[10px] h-5 px-1.5"
          >
            Apontamento órfão {contadoresBadge.apontamentoOrfao}
          </Badge>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        {loading ? 'Carregando...' : `${movimentos.length} movimento(s) no período.`}
      </div>

      {/* PR-D — Barra de ação em massa (apenas quando há seleção). */}
      {selecionados.size > 0 && (
        <div className="border rounded-md bg-blue-50/50 border-blue-200 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[11px] font-semibold text-blue-900">
            {resumoSelecao.qt} selecionado{resumoSelecao.qt > 1 ? 's' : ''}
          </span>
          <span className="text-[11px] text-emerald-700 tabular-nums font-mono">
            Entradas {formatMoeda(resumoSelecao.entradas)}
          </span>
          <span className="text-[11px] text-red-700 tabular-nums font-mono">
            Saídas {formatMoeda(resumoSelecao.saidas)}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={limparSelecao}
              disabled={processandoLote}
            >
              Limpar seleção
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setMostrarConfirmacaoLote(true)}
              disabled={processandoLote}
            >
              Criar lançamentos em lote
            </Button>
          </div>
        </div>
      )}

      {/* PR-Conciliacao-DiagnosticoOperacional — banner agregado de
          pendências. Renderiza só quando totalPendente > 0. */}
      <ConciliacaoPendenciasPanel
        movimentos={enriquecidos}
        paresOfx={paresOfx}
      />

      <div className="border rounded overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="text-[10px] w-[36px]">
                {/* PR-D — checkbox cabeçalho: marca/desmarca todos elegíveis. */}
                <Checkbox
                  aria-label="Selecionar todos elegíveis"
                  disabled={idsElegiveis.size === 0}
                  checked={
                    idsElegiveis.size > 0 &&
                    Array.from(idsElegiveis).every((id) => selecionados.has(id))
                  }
                  onCheckedChange={toggleSelecionarTodosElegiveis}
                />
              </TableHead>
              <TableHead className="text-[10px]">Data</TableHead>
              <TableHead className="text-[10px]">Descrição</TableHead>
              <TableHead className="text-[10px]">Documento</TableHead>
              <TableHead className="text-[10px] text-right">Valor</TableHead>
              <TableHead className="text-[10px]">Status</TableHead>
              <TableHead className="text-[10px] w-[170px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                  Nenhum movimento importado para esta conta/período.
                </TableCell>
              </TableRow>
            )}
            {enriquecidos.map(m => {
              const badge = STATUS_BADGE[m.status];
              const elegivel = idsElegiveis.has(m.id);
              const marcado = selecionados.has(m.id);
              return (
                <TableRow key={m.id} className={marcado ? 'bg-blue-50/40' : undefined}>
                  <TableCell className="text-[11px]">
                    {/* PR-D — checkbox por linha (apenas elegíveis). */}
                    <Checkbox
                      aria-label={`Selecionar movimento ${m.id}`}
                      disabled={!elegivel || processandoLote}
                      checked={marcado}
                      onCheckedChange={() => toggleSelecao(m.id)}
                    />
                  </TableCell>
                  <TableCell className="text-[11px] font-mono">{fmtData(m.data_movimento)}</TableCell>
                  <TableCell className="text-[11px] max-w-[260px]" title={m.descricao || ''}>
                    <div className="truncate">{m.descricao || '-'}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {enriquecidoLoading && (
                        <span className="text-[10px] text-muted-foreground">...</span>
                      )}
                      {!enriquecidoLoading && m.statusEnriquecido === 'parcial' && (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] h-5 px-1.5"
                        >
                          Parcial: falta {formatMoeda(m.valorPendente)}
                        </Badge>
                      )}
                      {!enriquecidoLoading &&
                        m.vinculos.length > 0 &&
                        m.statusEnriquecido !== 'parcial' && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] h-5 px-1.5"
                          >
                            Já vinculado ({formatMoeda(m.valorAplicado)})
                          </Badge>
                        )}
                      {!enriquecidoLoading &&
                        m.qtCandidatosSistema > 0 &&
                        m.vinculos.length === 0 && (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-300 text-[10px] h-5 px-1.5"
                          >
                            Sistema {m.qtCandidatosSistema}
                          </Badge>
                        )}
                      {!enriquecidoLoading &&
                        m.qtRefsExcel > 0 &&
                        m.vinculos.length === 0 && (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 text-yellow-700 border-yellow-300 text-[10px] h-5 px-1.5"
                          >
                            Excel {m.qtRefsExcel}
                          </Badge>
                        )}
                      {!enriquecidoLoading && m.statusEnriquecido === 'orfao_sem_pista' && (
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-700 border-red-300 text-[10px] h-5 px-1.5"
                        >
                          Sem pista
                        </Badge>
                      )}
                      {/* PR-Conciliacao-DiagnosticoOperacional — badge de
                          diagnóstico clicável. Aparece só em pendências
                          (status nao_conciliado/parcial). Não toca CTA real
                          ainda — toast placeholder até próximo PR. */}
                      {!enriquecidoLoading &&
                        (m.status === 'nao_conciliado' || m.status === 'parcial') &&
                        (() => {
                          const cls = classificarMovimento(m, paresOfx);
                          if (cls === 'conciliado' || cls === 'ignorado') return null;
                          const info = DIAG_INFO[cls];
                          return (
                            <button
                              type="button"
                              onClick={() => toast.info(`${info.label}: ação em próximo PR`)}
                              className={`text-[10px] h-5 px-1.5 rounded border font-medium ${info.badgeCls} hover:opacity-80`}
                              title={`Diagnóstico automático — ${info.label}. CTA: ${info.ctaLabel}.`}
                            >
                              {info.short}
                            </button>
                          );
                        })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">{m.documento || '-'}</TableCell>
                  <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatMoeda(m.valor)}
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado'}
                        onClick={() => setConciliando({
                          id: m.id,
                          cliente_id: m.cliente_id,
                          conta_bancaria_id: m.conta_bancaria_id,
                          data_movimento: m.data_movimento,
                          descricao: m.descricao,
                          documento: m.documento,
                          valor: m.valor,
                          status: m.status,
                        })}
                      >
                        Conciliar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado' || m.status === 'conciliado'}
                        onClick={() => setMovCriando(m)}
                      >
                        Criar lançamento
                      </Button>
                      {/* PR-F — abrir LancamentoV2Dialog em modo transferência
                          com a conta OFX travada conforme sinal. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado' || m.status === 'conciliado'}
                        onClick={() => setMovTransferencia(m)}
                        title="Registrar como transferência entre contas"
                      >
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        Transferência
                      </Button>
                      {m.status !== 'ignorado' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-muted-foreground"
                          disabled={ignorandoId === m.id}
                          onClick={() => handleIgnorar(m)}
                        >
                          Ignorar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <LancamentoV2Dialog
        open={!!movCriando}
        onClose={() => setMovCriando(null)}
        onSave={handleCriarFromExtrato}
        fazendas={fazendas}
        contas={contasBancarias}
        classificacoes={classificacoes}
        fornecedores={fornecedores}
        onCriarFornecedor={criarFornecedor}
        prefill={movCriando ? {
          data_pagamento: movCriando.data_movimento,
          data_competencia: movCriando.data_movimento,
          valor: Math.abs(movCriando.valor),
          tipo_operacao: movCriando.valor < 0 ? '2-Saídas' : '1-Entradas',
          status_transacao: 'realizado',
          conta_bancaria_id: movCriando.conta_bancaria_id,
          descricao: movCriando.descricao ?? undefined,
          numero_documento: movCriando.documento ?? undefined,
        } : undefined}
        lockedFields={['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao']}
      />

      {/* PR-F — instância dedicada para modo "Transferência via OFX".
          Reaproveita o mesmo LancamentoV2Dialog em modo 3-Transferências,
          travando a conta OFX (origem ou destino, conforme sinal) e
          deixando o operador preencher a contraparte. */}
      <LancamentoV2Dialog
        open={!!movTransferencia}
        onClose={() => setMovTransferencia(null)}
        onSave={handleTransferenciaFromExtrato}
        fazendas={fazendas}
        contas={contasBancarias}
        classificacoes={classificacoes}
        fornecedores={fornecedores}
        onCriarFornecedor={criarFornecedor}
        prefill={movTransferencia ? {
          // Em modo Global, fazendaAtual.id === '__global__' (sentinel);
          // passar string vazia força o operador a escolher fazenda real
          // no form. Fora de Global, prefill com a fazenda atual.
          fazenda_id:
            !fazendaAtual || fazendaAtual.id === '__global__'
              ? ''
              : fazendaAtual.id,
          data_pagamento: movTransferencia.data_movimento,
          data_competencia: movTransferencia.data_movimento,
          valor: Math.abs(movTransferencia.valor),
          tipo_operacao: '3-Transferências',
          status_transacao: 'realizado',
          // OFX < 0 (saída): conta OFX = origem (conta_bancaria_id).
          // OFX > 0 (entrada): conta OFX = destino (conta_destino_id).
          // Convenção PR-K respeitada.
          conta_bancaria_id:
            movTransferencia.valor < 0 ? movTransferencia.conta_bancaria_id : '',
          conta_destino_id:
            movTransferencia.valor > 0 ? movTransferencia.conta_bancaria_id : null,
          descricao: movTransferencia.descricao ?? undefined,
          numero_documento: movTransferencia.documento ?? undefined,
        } : undefined}
        lockedFields={movTransferencia ? [
          'valor',
          'data_pagamento',
          'tipo_operacao',
          // Trava só o lado da conta OFX; contraparte fica editável.
          movTransferencia.valor < 0 ? 'conta_bancaria_id' : 'conta_destino_id',
        ] : []}
      />

      <ConciliarExtratoDialog
        open={!!conciliando}
        onClose={() => setConciliando(null)}
        movimento={conciliando}
        vinculosPreCarregados={
          conciliando ? (vinculosByExtratoId?.get(conciliando.id) ?? null) : null
        }
        onConciliado={() => { setConciliando(null); refetch(); }}
      />

      {/* PR-D — Dialog de confirmação para criação em lote a partir do OFX. */}
      <Dialog
        open={mostrarConfirmacaoLote}
        onOpenChange={(o) => !processandoLote && setMostrarConfirmacaoLote(o)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Criar lançamentos em lote
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Serão criados lançamentos realizados no sistema e vinculados aos
              movimentos OFX selecionados. Esta ação não classifica plano de
              contas nem associa fornecedor.
            </DialogDescription>
          </DialogHeader>
          <div className="text-[12px] space-y-1.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Movimentos</span>
              <span className="text-right font-mono tabular-nums">
                {resumoSelecao.qt}
              </span>
              <span className="text-muted-foreground">Total entradas</span>
              <span className="text-right font-mono tabular-nums text-emerald-700">
                {formatMoeda(resumoSelecao.entradas)}
              </span>
              <span className="text-muted-foreground">Total saídas</span>
              <span className="text-right font-mono tabular-nums text-red-700">
                {formatMoeda(resumoSelecao.saidas)}
              </span>
              <span className="text-muted-foreground">Conta bancária</span>
              <span className="text-right">
                {contaSelecionada
                  ? (contaSelecionada.nome_exibicao || contaSelecionada.nome_conta)
                  : '—'}
              </span>
              <span className="text-muted-foreground">Mês/ano</span>
              <span className="text-right font-mono">{anoMes ?? '—'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarConfirmacaoLote(false)}
              disabled={processandoLote}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCriarLote}
              disabled={processandoLote || resumoSelecao.qt === 0}
            >
              {processandoLote
                ? 'Processando...'
                : `Confirmar criação (${resumoSelecao.qt})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
